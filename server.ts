import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import { GoogleGenAI } from '@google/genai';
import {
  ADMIN_LOCKOUT_MS,
  CYBERCRIME_WARNING_MESSAGE,
  LOCKOUT_PRIMARY_MESSAGE,
  apiRateLimiterMiddleware,
  buildIncidentEvidenceExport,
  checkAdminLockout,
  checkAndRecordCheckoutRateLimit,
  computeCheckoutFingerprint,
  evaluateOrderReviewFlags,
  fetchRazorpayRefundStatus,
  getExpectedOrderPayment,
  getIdempotentOrder,
  getProcessedPayment,
  getRazorpayRuntimeConfig,
  getRefundByOrderOrPayment,
  getSecurityOverview,
  getTrustedClientMeta,
  hasProcessedWebhookEvent,
  initiateRazorpayFullRefund,
  isAdminSessionActive,
  issueCheckoutChallenge,
  logAdminAuditAction,
  logSecurityEvent,
  markNotificationsRead,
  markProcessedWebhookEvent,
  precheckOrderItemsInventoryFromFirestore,
  recordAdminFailedAttempt,
  recordAdminSuccessfulLogin,
  recordProcessedPayment,
  revokeAdminSessionById,
  runFirestoreQuery,
  setExpectedOrderPayment,
  unblockAdminLockoutById,
  updateIdempotentStatus,
  upsertIdempotentOrder,
  upsertRefundRecord,
  validateAdminMediaUploadPayload,
  verifyAndComputeOrderAmountFromFirestore,
  verifyCheckoutChallenge,
  verifyRazorpayPaymentViaApi,
} from './serverSecurity.ts';
import {
  ORDER_ACCEPTED_NOTIFICATION_MESSAGE,
  ORDER_REJECTED_NOTIFICATION_MESSAGE,
  PENDING_APPROVAL_CUSTOMER_MESSAGE,
} from './src/data/catalog.ts';
import { normalizeInventoryFields } from './src/lib/inventory.ts';

dotenv.config();

const SERVER_FILE = import.meta?.url ? fileURLToPath(import.meta.url) : '';
const SERVER_DIR = SERVER_FILE ? path.dirname(SERVER_FILE) : process.cwd();

const PORT = Number(process.env.PORT || 3000);
const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const SESSION_COOKIE_NAME = 'zaikora_session';
const ADMIN_COOKIE_NAME = 'zaikora_admin_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 60 * 1000;

// Ephemeral fallback ensures secure HMAC signing without hardcoding secrets
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

interface FirebaseClientConfig {
  apiKey?: string;
  projectId?: string;
  firestoreDatabaseId?: string;
}

function loadFirebaseConfig(): FirebaseClientConfig {
  if (process.env.FIREBASE_CONFIG_JSON) {
    try {
      return JSON.parse(process.env.FIREBASE_CONFIG_JSON) as FirebaseClientConfig;
    } catch {
      // Fall through to file lookup
    }
  }
  const candidates = [
    path.resolve(SERVER_DIR, 'firebase-applet-config.json'),
    path.resolve(process.cwd(), 'firebase-applet-config.json'),
    path.resolve(SERVER_DIR, '..', '..', 'firebase-applet-config.json'),
  ];
  for (const configPath of candidates) {
    if (fs.existsSync(configPath)) {
      try {
        const raw = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(raw) as FirebaseClientConfig;
      } catch {
        // Continue checking remaining candidate paths
      }
    }
  }
  return {};
}

const firebaseConfig = loadFirebaseConfig();

// In-memory rate limiting for failed 4-digit PIN attempts (keyed by 91XXXXXXXXXX)
const pinFailStore = new Map<string, { count: number; lockUntil: number }>();

const recentWebhookLogs: Array<{
  eventId: string;
  event: string;
  orderId?: string;
  paymentId?: string;
  status: string;
  receivedAt: string;
}> = [];

interface AuthenticatedUser {
  uid: string;
  phoneNumber?: string;
  name?: string;
  source: 'pin' | 'firebase';
  firebaseUid?: string;
  firebaseIdToken?: string;
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        cookies[key] = decodeURIComponent(val);
      } catch {
        cookies[key] = val;
      }
    }
  }
  return cookies;
}

function signPinSessionToken(phone: string, name?: string, email?: string): string {
  const now = Date.now();
  const payload = {
    phone,
    name: name ? name.slice(0, 100) : undefined,
    email: email ? email.slice(0, 160) : undefined,
    iat: now,
    exp: now + SESSION_TTL_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sigB64 = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payloadB64)
    .digest('base64url');
  return `zks_${payloadB64}.${sigB64}`;
}

function verifyPinSessionToken(
  token: string | undefined
): { phone: string; name?: string; email?: string } | null {
  if (!token || !token.startsWith('zks_') || token.length > 1024) {
    return null;
  }
  const body = token.slice(4);
  const dotIdx = body.indexOf('.');
  if (dotIdx <= 0) return null;

  const payloadB64 = body.slice(0, dotIdx);
  const providedSig = body.slice(dotIdx + 1);
  if (!payloadB64 || !providedSig) return null;

  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payloadB64)
    .digest('base64url');

  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  const providedBuf = Buffer.from(providedSig, 'utf8');
  if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      phone?: unknown;
      name?: unknown;
      email?: unknown;
      exp?: unknown;
    };
    if (
      typeof parsed.phone !== 'string' ||
      !/^\+91[6-9]\d{9}$/.test(parsed.phone) ||
      typeof parsed.exp !== 'number' ||
      parsed.exp <= Date.now()
    ) {
      return null;
    }
    return {
      phone: parsed.phone,
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
      email: typeof parsed.email === 'string' ? parsed.email : undefined,
    };
  } catch {
    return null;
  }
}

const ADMIN_SCRYPT_SLOTS: ReadonlyArray<{
  slot: 1 | 2;
  salt: string;
  hashHex: string;
}> = [
  {
    slot: 1,
    salt: 'b786b1d80a7cbc7aa17433cb007eabc4',
    hashHex:
      '60bc9a34497524d447d334ab8728cacddc59f7d552507bec43067929618e09fc89d43c5bd54ae8ec1ac1c238460234ef63e44f67b7dee029430ad60f76e345a7',
  },
  {
    slot: 2,
    salt: 'b3d5760448195d9bddb318a1ea9eea35',
    hashHex:
      '5c808dc95b181b89128a66414d9ce5d6cf3033557c40785bd2cdb3f3a8250279a127de155cde9f1290e36701ca5b310a15a63654f6dbb9262cd1b8a9af5b6741',
  },
];

function timingSafeHexEqual(hexA: string, hexB: string): boolean {
  const bufA = Buffer.from(hexA, 'hex');
  const bufB = Buffer.from(hexB, 'hex');
  return bufA.length === bufB.length && bufA.length > 0 && crypto.timingSafeEqual(bufA, bufB);
}

function timingSafeSha256Equal(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hashB = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function verifyAdminPasswordCredential(
  candidate: string
): { matched: true; slot: 1 | 2; envOverride: boolean } | { matched: false } {
  const envKey1 = process.env.ADMIN_LOCK_KEY_1?.trim() || '';
  const envKey2 = process.env.ADMIN_LOCK_KEY_2?.trim() || '';

  if (envKey1) {
    if (timingSafeSha256Equal(candidate, envKey1)) {
      return { matched: true, slot: 1, envOverride: true };
    }
  } else {
    const slot1 = ADMIN_SCRYPT_SLOTS[0];
    const derived1 = crypto.scryptSync(candidate, slot1.salt, 64).toString('hex');
    if (timingSafeHexEqual(derived1, slot1.hashHex)) {
      return { matched: true, slot: 1, envOverride: false };
    }
  }

  if (envKey2) {
    if (timingSafeSha256Equal(candidate, envKey2)) {
      return { matched: true, slot: 2, envOverride: true };
    }
  } else {
    const slot2 = ADMIN_SCRYPT_SLOTS[1];
    const derived2 = crypto.scryptSync(candidate, slot2.salt, 64).toString('hex');
    if (timingSafeHexEqual(derived2, slot2.hashHex)) {
      return { matched: true, slot: 2, envOverride: false };
    }
  }

  return { matched: false };
}

function signAdminSessionToken(uid: string): {
  token: string;
  sessionId: string;
  expiresAt: number;
} {
  const now = Date.now();
  const sessionId = crypto.randomUUID();
  const expiresAt = now + SESSION_TTL_MS;
  const payload = {
    uid,
    jti: sessionId,
    role: 'super_admin',
    iat: now,
    exp: expiresAt,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sigB64 = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`admin:${payloadB64}`)
    .digest('base64url');
  return { token: `zka_${payloadB64}.${sigB64}`, sessionId, expiresAt };
}

function verifyAdminSessionToken(
  token: string | undefined
): { uid: string; sessionId: string } | null {
  if (!token || !token.startsWith('zka_') || token.length > 1024) {
    return null;
  }
  const body = token.slice(4);
  const dotIdx = body.indexOf('.');
  if (dotIdx <= 0) return null;

  const payloadB64 = body.slice(0, dotIdx);
  const providedSig = body.slice(dotIdx + 1);
  if (!payloadB64 || !providedSig) return null;

  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`admin:${payloadB64}`)
    .digest('base64url');

  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  const providedBuf = Buffer.from(providedSig, 'utf8');
  if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      uid?: unknown;
      jti?: unknown;
      role?: unknown;
      exp?: unknown;
    };
    if (
      typeof parsed.uid !== 'string' ||
      !SAFE_ID_REGEX.test(parsed.uid) ||
      typeof parsed.jti !== 'string' ||
      !isAdminSessionActive(parsed.jti) ||
      parsed.role !== 'super_admin' ||
      typeof parsed.exp !== 'number' ||
      parsed.exp <= Date.now()
    ) {
      return null;
    }
    return { uid: parsed.uid, sessionId: parsed.jti };
  } catch {
    return null;
  }
}

function isSameOriginRequest(req: express.Request): boolean {
  const customHeader = req.headers['x-requested-with'];
  const originHeader = req.headers.origin;
  const hostHeader = (req.headers['x-forwarded-host'] || req.headers.host || '')
    .toString()
    .split(',')[0]
    .trim()
    .toLowerCase();

  if (typeof originHeader === 'string' && originHeader) {
    try {
      const originHost = new URL(originHeader).host.toLowerCase();
      if (hostHeader && originHost === hostHeader) {
        return true;
      }
    } catch {
      return false;
    }
  }
  return customHeader === 'XMLHttpRequest';
}

async function verifyFirebaseBearerToken(idToken: string): Promise<AuthenticatedUser | null> {
  if (!idToken || idToken.length > 4096 || !firebaseConfig.apiKey) {
    return null;
  }
  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as {
      users?: Array<{ localId?: string; phoneNumber?: string }>;
    };
    const user = data.users?.[0];
    if (!user?.localId) {
      return null;
    }
    return {
      uid: user.localId,
      phoneNumber: user.phoneNumber,
      source: 'firebase',
    };
  } catch {
    return null;
  }
}

async function verifyRequestAuth(req: express.Request): Promise<AuthenticatedUser | null> {
  const fbHeader = req.headers['x-firebase-auth'];
  const fbTokenFromHeader =
    typeof fbHeader === 'string' && fbHeader.trim() ? fbHeader.trim() : undefined;
  const fbUserFromHeader = fbTokenFromHeader
    ? await verifyFirebaseBearerToken(fbTokenFromHeader)
    : null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token.startsWith('zks_')) {
      const pinSession = verifyPinSessionToken(token);
      if (pinSession) {
        return {
          uid: fbUserFromHeader?.uid || pinSession.phone,
          phoneNumber: pinSession.phone,
          name: pinSession.name,
          source: 'pin',
          firebaseUid: fbUserFromHeader?.uid,
          firebaseIdToken: fbTokenFromHeader,
        };
      }
      return null;
    }
    const fbUser = await verifyFirebaseBearerToken(token);
    if (fbUser) {
      return {
        ...fbUser,
        firebaseUid: fbUser.uid,
        firebaseIdToken: token,
      };
    }
  }

  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies[SESSION_COOKIE_NAME];
  if (cookieToken) {
    const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase());
    if (isMutating && !isSameOriginRequest(req)) {
      return null;
    }
    const pinSession = verifyPinSessionToken(cookieToken);
    if (pinSession) {
      return {
        uid: fbUserFromHeader?.uid || pinSession.phone,
        phoneNumber: pinSession.phone,
        name: pinSession.name,
        source: 'pin',
        firebaseUid: fbUserFromHeader?.uid,
        firebaseIdToken: fbTokenFromHeader,
      };
    }
  }

  if (fbUserFromHeader) {
    return {
      ...fbUserFromHeader,
      firebaseUid: fbUserFromHeader.uid,
      firebaseIdToken: fbTokenFromHeader,
    };
  }

  return null;
}

function verifyAdminRequest(req: express.Request): { uid: string; sessionId: string } | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer zka_')) {
    const token = authHeader.slice(7).trim();
    const verified = verifyAdminSessionToken(token);
    if (verified) return verified;
  }

  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies[ADMIN_COOKIE_NAME];
  if (cookieToken) {
    const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase());
    if (isMutating && !isSameOriginRequest(req)) {
      return null;
    }
    const verified = verifyAdminSessionToken(cookieToken);
    if (verified) return verified;
  }

  return null;
}

function isPrivateOrLocalHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower === '::1' ||
    lower === '0.0.0.0' ||
    lower === '169.254.169.254' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    return true;
  }
  if (/^10\./.test(lower) || /^192\.168\./.test(lower)) {
    return true;
  }
  const match172 = lower.match(/^172\.(\d+)\./);
  if (match172) {
    const second = Number(match172[1]);
    if (second >= 16 && second <= 31) {
      return true;
    }
  }
  return false;
}

function validateSafeWebhookUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') {
      return null;
    }
    if (isPrivateOrLocalHostname(parsed.hostname)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function normalizeIndianMobile(rawMobile: string): string | null {
  const digits = rawMobile.replace(/\D/g, '');
  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
    return `91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91') && /^[6-9]\d{9}$/.test(digits.slice(2))) {
    return digits;
  }
  return null;
}

type RestFsVal = {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  timestampValue?: string;
};

function getFirestorePaths() {
  const projectId = firebaseConfig.projectId || '';
  const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';
  const docRoot = `projects/${projectId}/databases/${databaseId}/documents`;
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents`;
  const commitUrl = `${baseUrl}:commit`;
  return { projectId, databaseId, docRoot, baseUrl, commitUrl };
}

function unwrapRestFsFields(fields?: Record<string, RestFsVal>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!fields) return out;
  for (const [k, v] of Object.entries(fields)) {
    if (v.stringValue !== undefined) out[k] = v.stringValue;
    else if (v.integerValue !== undefined) out[k] = Number(v.integerValue);
    else if (v.doubleValue !== undefined) out[k] = Number(v.doubleValue);
    else if (v.booleanValue !== undefined) out[k] = v.booleanValue;
    else if (v.timestampValue !== undefined) out[k] = v.timestampValue;
  }
  return out;
}

async function fsGetDocument(bearerToken: string, relativePath: string): Promise<{
  ok: boolean;
  status: number;
  data: Record<string, unknown>;
  updateTime?: string;
  error?: string;
}> {
  const { projectId, baseUrl } = getFirestorePaths();
  if (!projectId) {
    return { ok: false, status: 500, data: {}, error: 'Firebase project configuration missing.' };
  }
  const cleanRel = relativePath.replace(/^\/+/, '');
  const res = await fetch(`${baseUrl}/${cleanRel}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${bearerToken}` },
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return { ok: false, status: res.status, data: {}, error: errText.slice(0, 200) };
  }
  const json = (await res.json()) as {
    fields?: Record<string, RestFsVal>;
    updateTime?: string;
  };
  return {
    ok: true,
    status: 200,
    data: unwrapRestFsFields(json.fields),
    updateTime: typeof json.updateTime === 'string' ? json.updateTime : undefined,
  };
}

async function fsCommitWrites(
  bearerToken: string,
  writes: Array<Record<string, unknown>>
): Promise<{ ok: boolean; status: number; error?: string }> {
  const { projectId, commitUrl } = getFirestorePaths();
  if (!projectId) {
    return { ok: false, status: 500, error: 'Firebase project configuration missing.' };
  }
  const res = await fetch(commitUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ writes }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return { ok: false, status: res.status, error: errText.slice(0, 220) };
  }
  return { ok: true, status: 200 };
}

export function createApiApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Normalize Netlify Functions proxy prefix (/.netlify/functions/api/* -> /api/*)
  app.use((req, _res, next) => {
    if (req.url.startsWith('/.netlify/functions/api')) {
      const stripped = req.url.slice('/.netlify/functions/api'.length);
      if (!stripped || stripped === '/') {
        req.url = '/api';
      } else if (stripped.startsWith('/api')) {
        req.url = stripped;
      } else {
        req.url = `/api${stripped.startsWith('/') ? stripped : `/${stripped}`}`;
      }
    }
    next();
  });

  const isProd = process.env.NODE_ENV === 'production' || Boolean(process.env.NETLIFY);

  // HTTP security headers & Content-Security-Policy (compatible with Razorpay, Firebase, & AI Studio preview)
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    if (isProd) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    const scriptSrc = isProd
      ? "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://apis.google.com https://www.google.com https://www.gstatic.com"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com https://apis.google.com https://www.google.com https://www.gstatic.com";
    const connectSrc = isProd
      ? "connect-src 'self' https://*.googleapis.com https://firebasestorage.googleapis.com https://*.firebasestorage.app https://*.firebaseio.com wss://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://api.razorpay.com https://lumberjack.razorpay.com https://checkout.razorpay.com https://www.google.com https://www.gstatic.com"
      : "connect-src 'self' ws: wss: https://*.googleapis.com https://firebasestorage.googleapis.com https://*.firebasestorage.app https://*.firebaseio.com wss://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://api.razorpay.com https://lumberjack.razorpay.com https://checkout.razorpay.com https://www.google.com https://www.gstatic.com";

    const cspDirectives = [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "media-src 'self' data: blob: https://*.googleapis.com https://firebasestorage.googleapis.com https://*.firebasestorage.app https:",
      connectSrc,
      "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://*.firebaseapp.com https://www.google.com https://recaptcha.google.com",
      "object-src 'none'",
      "base-uri 'self'",
    ].join('; ');
    res.setHeader('Content-Security-Policy', cspDirectives);
    next();
  });

  // Strict same-origin CORS guard on /api routes (allows server-to-server Razorpay webhook)
  app.use('/api', (req, res, next) => {
    if (req.path === '/payments/webhook') {
      next();
      return;
    }
    const originHeader = req.headers.origin;
    if (typeof originHeader === 'string' && originHeader) {
      const hostHeader = (req.headers['x-forwarded-host'] || req.headers.host || '')
        .toString()
        .split(',')[0]
        .trim()
        .toLowerCase();
      try {
        const originHost = new URL(originHeader).host.toLowerCase();
        if (!hostHeader || originHost !== hostHeader) {
          logSecurityEvent({
            req,
            category: 'api',
            eventType: 'CORS_CROSS_ORIGIN_BLOCKED',
            severity: 'warning',
            endpoint: req.originalUrl,
            actionTaken: `Blocked cross-origin API request from ${originHeader}`,
            result: 'Rejected (HTTP 403)',
            suspicious: true,
          });
          res.status(403).json({ error: 'Cross-origin API access is forbidden.' });
          return;
        }
      } catch {
        res.status(403).json({ error: 'Malformed request origin.' });
        return;
      }
    }
    next();
  });

  // Global API rate limiter
  app.use('/api', apiRateLimiterMiddleware);

  // Capture raw body strictly for Razorpay webhook HMAC verification
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    })
  );

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', brand: 'ZAIKORA KITCHENS' });
  });

  app.get('/api/config/status', (_req, res) => {
    const rzp = getRazorpayRuntimeConfig();

    res.json({
      razorpayConfigured: rzp.razorpayConfigured && !rzp.blockedTestInProd,
      razorpayWebhookConfigured: rzp.razorpayWebhookConfigured,
      razorpayMode: rzp.razorpayMode,
      isProductionEnv: rzp.isProductionEnv,
    });
  });

  // --- Zero-Cost Mobile Number + 4-Digit PIN Authentication ---

  app.get('/api/auth/session', (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer zks_')) {
      const token = authHeader.slice(7).trim();
      const verified = verifyPinSessionToken(token);
      if (verified) {
        res.json({
          authenticated: true,
          phone: verified.phone,
          name: verified.name || null,
          email: verified.email || null,
          sessionToken: token,
        });
        return;
      }
    }

    const cookies = parseCookies(req.headers.cookie);
    const cookieToken = cookies[SESSION_COOKIE_NAME];
    if (cookieToken) {
      const verified = verifyPinSessionToken(cookieToken);
      if (verified) {
        res.json({
          authenticated: true,
          phone: verified.phone,
          name: verified.name || null,
          email: verified.email || null,
          sessionToken: cookieToken,
        });
        return;
      }
    }

    res.json({ authenticated: false, phone: null, name: null, email: null, sessionToken: null });
  });

  app.post('/api/auth/logout', (req, res) => {
    if (!isSameOriginRequest(req)) {
      res.status(403).json({ error: 'Invalid request origin.' });
      return;
    }
    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      partitioned: true,
      path: '/',
    });
    res.json({ ok: true });
  });

  app.post('/api/auth/pin-login', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ verified: false, error: 'Firebase session token is required.' });
      return;
    }

    const idToken = authHeader.slice(7).trim();
    const fbUser = await verifyFirebaseBearerToken(idToken);
    if (!fbUser?.uid) {
      res.status(401).json({ verified: false, error: 'Invalid Firebase session token.' });
      return;
    }

    const { mobile, pin, name, email, marketingConsent, mode } = req.body as {
      mobile?: unknown;
      pin?: unknown;
      name?: unknown;
      email?: unknown;
      marketingConsent?: unknown;
      mode?: unknown;
    };

    const requestedMode = mode === 'register' || mode === 'login' ? mode : 'auto';

    if (typeof mobile !== 'string' || typeof pin !== 'string') {
      res.status(400).json({
        verified: false,
        error: 'Valid +91 mobile number and 4-digit password are required.',
      });
      return;
    }

    const normalizedMobile = normalizeIndianMobile(mobile);
    if (!normalizedMobile) {
      res.status(400).json({
        verified: false,
        error: 'Please enter a valid 10-digit Indian mobile number starting with 6–9.',
      });
      return;
    }

    const cleanPin = pin.replace(/\D/g, '');
    if (!/^\d{4}$/.test(cleanPin)) {
      res.status(400).json({
        verified: false,
        error: 'Please enter a 4-digit numeric account password.',
      });
      return;
    }

    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase().slice(0, 160) : '';
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (cleanEmail && !emailPattern.test(cleanEmail)) {
      res.status(400).json({
        verified: false,
        error: 'Please enter a valid email address.',
      });
      return;
    }

    const cleanMarketingConsent = typeof marketingConsent === 'boolean' ? marketingConsent : false;

    const failState = pinFailStore.get(normalizedMobile);
    if (failState && failState.lockUntil > Date.now()) {
      const waitSec = Math.ceil((failState.lockUntil - Date.now()) / 1000);
      res.status(429).json({
        verified: false,
        error: `Too many incorrect password attempts. Please wait ${waitSec} seconds and try again.`,
      });
      return;
    }

    const projectId = firebaseConfig.projectId;
    const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';
    if (!projectId) {
      res.status(500).json({ verified: false, error: 'Firebase project configuration missing.' });
      return;
    }

    const docUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents/phone_accounts/${encodeURIComponent(normalizedMobile)}`;
    const commitUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents:commit`;
    const docResourcePath = `projects/${projectId}/databases/${databaseId}/documents/phone_accounts/${normalizedMobile}`;
    const e164Phone = `+${normalizedMobile}`;
    const cleanInputName = typeof name === 'string' ? name.trim().slice(0, 100) : '';

    try {
      const getRes = await fetch(docUrl, {
        method: 'GET',
        headers: { Authorization: `Bearer ${idToken}` },
      });

      if (getRes.status === 404) {
        if (requestedMode === 'login') {
          res.status(404).json({
            verified: false,
            accountNotFound: true,
            error: `No account found for ${e164Phone}. Please select Create Account to register.`,
          });
          return;
        }
        if (!cleanInputName) {
          res.status(400).json({
            verified: false,
            requiresName: true,
            error: 'Please enter your full name to create your account.',
          });
          return;
        }
        if (requestedMode === 'register' && !cleanEmail) {
          res.status(400).json({
            verified: false,
            error: 'Please enter a valid email address to create your account.',
          });
          return;
        }

        const pinSalt = crypto.randomBytes(16).toString('hex');
        const pinHash = crypto.scryptSync(cleanPin, pinSalt, 32).toString('hex');

        const createFields: Record<string, unknown> = {
          phoneId: { stringValue: normalizedMobile },
          phone: { stringValue: e164Phone },
          name: { stringValue: cleanInputName },
          marketingConsent: { booleanValue: cleanMarketingConsent },
          pinSalt: { stringValue: pinSalt },
          pinHash: { stringValue: pinHash },
          lastUid: { stringValue: fbUser.uid },
          loginCount: { integerValue: '1' },
          orderCount: { integerValue: '0' },
        };
        if (cleanEmail) {
          createFields.email = { stringValue: cleanEmail };
        }

        const createCommitRes = await fetch(commitUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            writes: [
              {
                currentDocument: { exists: false },
                update: {
                  name: docResourcePath,
                  fields: createFields,
                },
                updateTransforms: [
                  { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' },
                  { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
                ],
              },
            ],
          }),
        });

        if (!createCommitRes.ok) {
          const errText = await createCommitRes.text();
          res.status(500).json({
            verified: false,
            error: `Unable to save account to Firestore: ${errText.slice(0, 180)}`,
          });
          return;
        }

        pinFailStore.delete(normalizedMobile);
        const sessionToken = signPinSessionToken(e164Phone, cleanInputName, cleanEmail || undefined);
        res.cookie(SESSION_COOKIE_NAME, sessionToken, {
          httpOnly: true,
          secure: true,
          sameSite: 'none',
          partitioned: true,
          maxAge: SESSION_TTL_MS,
          path: '/',
        });

        res.json({
          verified: true,
          mode: 'registered',
          phone: e164Phone,
          name: cleanInputName,
          email: cleanEmail || undefined,
          marketingConsent: cleanMarketingConsent,
          loginCount: 1,
          orderCount: 0,
          sessionToken,
        });
        return;
      }

      if (!getRes.ok) {
        const errText = await getRes.text();
        res.status(502).json({
          verified: false,
          error: `Unable to verify account in Firestore: ${errText.slice(0, 180)}`,
        });
        return;
      }

      if (requestedMode === 'register') {
        res.status(409).json({
          verified: false,
          accountExists: true,
          error: `An account already exists for ${e164Phone}. Please switch to Sign In and enter your 4-digit password.`,
        });
        return;
      }

      const existingDoc = (await getRes.json()) as {
        fields?: Record<
          string,
          { stringValue?: string; integerValue?: string; booleanValue?: boolean }
        >;
      };
      const fields = existingDoc.fields || {};
      const storedSalt = fields.pinSalt?.stringValue || '';
      const storedHash = fields.pinHash?.stringValue || '';
      const storedName = fields.name?.stringValue || 'ZAIKORA Customer';
      const storedEmail = fields.email?.stringValue || '';
      const storedMarketingConsent =
        typeof fields.marketingConsent?.booleanValue === 'boolean'
          ? fields.marketingConsent.booleanValue
          : false;
      const existingLoginCount = Number(fields.loginCount?.integerValue || '1');
      const existingOrderCount = Number(fields.orderCount?.integerValue || '0');

      const candidateBuf = crypto.scryptSync(cleanPin, storedSalt, 32);
      const expectedBuf = Buffer.from(storedHash, 'hex');
      const isMatch =
        storedSalt.length >= 16 &&
        storedHash.length >= 32 &&
        candidateBuf.length === expectedBuf.length &&
        crypto.timingSafeEqual(candidateBuf, expectedBuf);

      if (!isMatch) {
        const nextCount = (failState?.count || 0) + 1;
        logSecurityEvent({
          req,
          category: 'auth',
          eventType: 'CUSTOMER_PIN_FAILED',
          severity: nextCount >= PIN_MAX_ATTEMPTS ? 'warning' : 'info',
          endpoint: '/api/auth/pin-login',
          accountIdentifier: e164Phone,
          actionTaken: 'Rejected incorrect 4-digit customer password',
          result: nextCount >= PIN_MAX_ATTEMPTS ? 'Customer account temporarily locked (60s)' : `Attempt ${nextCount}/${PIN_MAX_ATTEMPTS}`,
          suspicious: nextCount >= PIN_MAX_ATTEMPTS,
        });
        if (nextCount >= PIN_MAX_ATTEMPTS) {
          pinFailStore.set(normalizedMobile, {
            count: nextCount,
            lockUntil: Date.now() + PIN_LOCKOUT_MS,
          });
          res.status(429).json({
            verified: false,
            error: 'Too many incorrect password attempts. Please wait 60 seconds and try again.',
          });
          return;
        }
        pinFailStore.set(normalizedMobile, { count: nextCount, lockUntil: 0 });
        res.status(401).json({
          verified: false,
          error: `Incorrect 4-digit password for ${e164Phone}. Please enter the password you created earlier.`,
        });
        return;
      }

      pinFailStore.delete(normalizedMobile);
      const finalName = cleanInputName || storedName;
      const finalEmail = cleanEmail || storedEmail;
      const nextLoginCount = Math.max(1, existingLoginCount + 1);

      const updateMaskPaths = ['name', 'lastUid', 'loginCount'];
      const updateFields: Record<string, unknown> = {
        name: { stringValue: finalName },
        lastUid: { stringValue: fbUser.uid },
        loginCount: { integerValue: String(nextLoginCount) },
      };
      if (finalEmail) {
        updateMaskPaths.push('email');
        updateFields.email = { stringValue: finalEmail };
      }

      const updateCommitRes = await fetch(commitUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          writes: [
            {
              currentDocument: { exists: true },
              updateMask: {
                fieldPaths: updateMaskPaths,
              },
              update: {
                name: docResourcePath,
                fields: updateFields,
              },
              updateTransforms: [
                { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
              ],
            },
          ],
        }),
      });

      if (!updateCommitRes.ok) {
        const errText = await updateCommitRes.text();
        res.status(502).json({
          verified: false,
          error: `Unable to update login record: ${errText.slice(0, 180)}`,
        });
        return;
      }

      const sessionToken = signPinSessionToken(e164Phone, finalName, finalEmail || undefined);
      res.cookie(SESSION_COOKIE_NAME, sessionToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        partitioned: true,
        maxAge: SESSION_TTL_MS,
        path: '/',
      });

      res.json({
        verified: true,
        mode: 'logged_in',
        phone: e164Phone,
        name: finalName,
        email: finalEmail || undefined,
        marketingConsent: storedMarketingConsent,
        loginCount: nextLoginCount,
        orderCount: existingOrderCount,
        sessionToken,
      });
    } catch (err) {
      res.status(502).json({
        verified: false,
        error: err instanceof Error ? err.message : 'Unable to complete sign in.',
      });
    }
  });

  // Update logged-in customer profile (full name, mobile number, email, marketing consent)
  app.post('/api/auth/update-profile', async (req, res) => {
    if (!isSameOriginRequest(req)) {
      res.status(403).json({ updated: false, error: 'Invalid request origin.' });
      return;
    }

    const authUser = await verifyRequestAuth(req);
    const fbToken = authUser?.firebaseIdToken;
    const fbUid = authUser?.firebaseUid;
    if (!authUser || !authUser.phoneNumber || !fbToken || !fbUid || !SAFE_ID_REGEX.test(fbUid)) {
      res.status(401).json({
        updated: false,
        error: 'Please sign in to your account before editing profile details.',
      });
      return;
    }

    const oldPhoneId = normalizeIndianMobile(authUser.phoneNumber);
    if (!oldPhoneId) {
      res.status(400).json({ updated: false, error: 'Current account mobile number is invalid.' });
      return;
    }

    const { name, mobile, email, marketingConsent } = req.body as {
      name?: unknown;
      mobile?: unknown;
      email?: unknown;
      marketingConsent?: unknown;
    };

    const cleanName = typeof name === 'string' ? name.trim().slice(0, 100) : '';
    if (!cleanName) {
      res.status(400).json({ updated: false, error: 'Full name is required.' });
      return;
    }

    if (typeof mobile !== 'string') {
      res.status(400).json({ updated: false, error: 'Valid +91 mobile number is required.' });
      return;
    }
    const newPhoneId = normalizeIndianMobile(mobile);
    if (!newPhoneId) {
      res.status(400).json({
        updated: false,
        error: 'Please enter a valid 10-digit Indian mobile number starting with 6–9.',
      });
      return;
    }
    const newE164Phone = `+${newPhoneId}`;

    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase().slice(0, 160) : '';
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (cleanEmail && !emailPattern.test(cleanEmail)) {
      res.status(400).json({ updated: false, error: 'Please enter a valid email address.' });
      return;
    }

    const projectId = firebaseConfig.projectId;
    const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';
    if (!projectId) {
      res.status(500).json({ updated: false, error: 'Firebase project configuration missing.' });
      return;
    }

    const baseDocsUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents`;
    const commitUrl = `${baseDocsUrl}:commit`;
    const oldPhoneUrl = `${baseDocsUrl}/phone_accounts/${encodeURIComponent(oldPhoneId)}`;
    const oldPhoneResourcePath = `projects/${projectId}/databases/${databaseId}/documents/phone_accounts/${oldPhoneId}`;
    const newPhoneUrl = `${baseDocsUrl}/phone_accounts/${encodeURIComponent(newPhoneId)}`;
    const newPhoneResourcePath = `projects/${projectId}/databases/${databaseId}/documents/phone_accounts/${newPhoneId}`;
    const customerUrl = `${baseDocsUrl}/customers/${encodeURIComponent(fbUid)}`;
    const customerResourcePath = `projects/${projectId}/databases/${databaseId}/documents/customers/${fbUid}`;

    try {
      const [oldPhoneRes, customerRes] = await Promise.all([
        fetch(oldPhoneUrl, { method: 'GET', headers: { Authorization: `Bearer ${fbToken}` } }),
        fetch(customerUrl, { method: 'GET', headers: { Authorization: `Bearer ${fbToken}` } }),
      ]);

      if (!oldPhoneRes.ok) {
        res.status(404).json({
          updated: false,
          error: 'Could not locate your current mobile account record. Please sign out and sign in again.',
        });
        return;
      }

      const oldDoc = (await oldPhoneRes.json()) as {
        fields?: Record<
          string,
          { stringValue?: string; integerValue?: string; booleanValue?: boolean }
        >;
      };
      const oldFields = oldDoc.fields || {};
      const pinSalt = oldFields.pinSalt?.stringValue || '';
      const pinHash = oldFields.pinHash?.stringValue || '';
      const existingEmail = oldFields.email?.stringValue || '';
      const existingConsent =
        typeof oldFields.marketingConsent?.booleanValue === 'boolean'
          ? oldFields.marketingConsent.booleanValue
          : false;
      const loginCount = Math.max(1, Number(oldFields.loginCount?.integerValue || '1'));
      const orderCount = Math.max(0, Number(oldFields.orderCount?.integerValue || '0'));

      const finalEmail = cleanEmail || existingEmail;
      const finalConsent =
        typeof marketingConsent === 'boolean' ? marketingConsent : existingConsent;

      const customerExists = customerRes.ok;
      const customerFields: Record<string, unknown> = {
        uid: { stringValue: fbUid },
        phone: { stringValue: newE164Phone },
        name: { stringValue: cleanName },
        marketingConsent: { booleanValue: finalConsent },
      };
      if (finalEmail) {
        customerFields.email = { stringValue: finalEmail };
      }

      const customerWrite = customerExists
        ? {
            currentDocument: { exists: true },
            updateMask: {
              fieldPaths: finalEmail
                ? ['name', 'phone', 'email', 'marketingConsent']
                : ['name', 'phone', 'marketingConsent'],
            },
            update: {
              name: customerResourcePath,
              fields: {
                name: { stringValue: cleanName },
                phone: { stringValue: newE164Phone },
                marketingConsent: { booleanValue: finalConsent },
                ...(finalEmail ? { email: { stringValue: finalEmail } } : {}),
              },
            },
            updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
          }
        : {
            currentDocument: { exists: false },
            update: {
              name: customerResourcePath,
              fields: customerFields,
            },
            updateTransforms: [
              { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' },
              { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
            ],
          };

      if (newPhoneId === oldPhoneId) {
        const updateMaskPaths = ['name', 'marketingConsent', 'lastUid'];
        const updateFields: Record<string, unknown> = {
          name: { stringValue: cleanName },
          marketingConsent: { booleanValue: finalConsent },
          lastUid: { stringValue: fbUid },
        };
        if (finalEmail) {
          updateMaskPaths.push('email');
          updateFields.email = { stringValue: finalEmail };
        }

        const commitRes = await fetch(commitUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${fbToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            writes: [
              {
                currentDocument: { exists: true },
                updateMask: { fieldPaths: updateMaskPaths },
                update: {
                  name: oldPhoneResourcePath,
                  fields: updateFields,
                },
                updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
              },
              customerWrite,
            ],
          }),
        });

        if (!commitRes.ok) {
          const errText = await commitRes.text();
          res.status(502).json({
            updated: false,
            error: `Unable to update profile in Firestore: ${errText.slice(0, 180)}`,
          });
          return;
        }
      } else {
        const newPhoneCheckRes = await fetch(newPhoneUrl, {
          method: 'GET',
          headers: { Authorization: `Bearer ${fbToken}` },
        });
        if (newPhoneCheckRes.status === 200) {
          res.status(409).json({
            updated: false,
            error: `Mobile number ${newE164Phone} is already registered to another account.`,
          });
          return;
        }
        if (newPhoneCheckRes.status !== 404) {
          const errText = await newPhoneCheckRes.text();
          res.status(502).json({
            updated: false,
            error: `Unable to check availability of ${newE164Phone}: ${errText.slice(0, 160)}`,
          });
          return;
        }

        // Ensure old phone doc lastUid matches current uid so atomic delete satisfies ownership rule
        if (oldFields.lastUid?.stringValue !== fbUid) {
          await fetch(commitUrl, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${fbToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              writes: [
                {
                  currentDocument: { exists: true },
                  updateMask: { fieldPaths: ['lastUid'] },
                  update: {
                    name: oldPhoneResourcePath,
                    fields: { lastUid: { stringValue: fbUid } },
                  },
                  updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
                },
              ],
            }),
          });
        }

        const newPhoneFields: Record<string, unknown> = {
          phoneId: { stringValue: newPhoneId },
          phone: { stringValue: newE164Phone },
          name: { stringValue: cleanName },
          marketingConsent: { booleanValue: finalConsent },
          pinSalt: { stringValue: pinSalt },
          pinHash: { stringValue: pinHash },
          lastUid: { stringValue: fbUid },
          loginCount: { integerValue: String(loginCount) },
          orderCount: { integerValue: String(orderCount) },
        };
        if (finalEmail) {
          newPhoneFields.email = { stringValue: finalEmail };
        }

        const migrateRes = await fetch(commitUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${fbToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            writes: [
              {
                currentDocument: { exists: false },
                update: {
                  name: newPhoneResourcePath,
                  fields: newPhoneFields,
                },
                updateTransforms: [
                  { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' },
                  { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
                ],
              },
              {
                delete: oldPhoneResourcePath,
              },
              customerWrite,
            ],
          }),
        });

        if (!migrateRes.ok) {
          const errText = await migrateRes.text();
          res.status(502).json({
            updated: false,
            error: `Unable to change mobile number in Firestore: ${errText.slice(0, 180)}`,
          });
          return;
        }
      }

      const sessionToken = signPinSessionToken(newE164Phone, cleanName, finalEmail || undefined);
      res.cookie(SESSION_COOKIE_NAME, sessionToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        partitioned: true,
        maxAge: SESSION_TTL_MS,
        path: '/',
      });

      res.json({
        updated: true,
        phone: newE164Phone,
        name: cleanName,
        email: finalEmail || undefined,
        marketingConsent: finalConsent,
        sessionToken,
      });
    } catch (err) {
      res.status(502).json({
        updated: false,
        error: err instanceof Error ? err.message : 'Unable to update profile details.',
      });
    }
  });

  // --- Admin Panel Session & 3-Attempt Persistent Lockout Authentication ---

  app.get('/api/admin/session', (req, res) => {
    const verified = verifyAdminRequest(req);
    if (verified) {
      const authHeader = req.headers.authorization;
      const cookies = parseCookies(req.headers.cookie);
      const token =
        authHeader && authHeader.startsWith('Bearer zka_')
          ? authHeader.slice(7).trim()
          : cookies[ADMIN_COOKIE_NAME] || null;
      res.json({
        unlocked: true,
        uid: verified.uid,
        sessionId: verified.sessionId,
        sessionToken: token,
      });
      return;
    }

    res.json({ unlocked: false, uid: null, sessionId: null, sessionToken: null });
  });

  app.post('/api/admin/lock', (req, res) => {
    if (!isSameOriginRequest(req)) {
      res.status(403).json({ error: 'Invalid request origin.' });
      return;
    }
    const existingAdmin = verifyAdminRequest(req);
    if (existingAdmin) {
      revokeAdminSessionById(existingAdmin.sessionId, existingAdmin.uid, req);
    }
    res.clearCookie(ADMIN_COOKIE_NAME, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      partitioned: true,
      path: '/',
    });
    res.json({ unlocked: false });
  });

  app.post('/api/admin/unlock', async (req, res) => {
    if (!isSameOriginRequest(req)) {
      res.status(403).json({ unlocked: false, error: 'Invalid request origin.' });
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ unlocked: false, error: 'Firebase session token is required.' });
      return;
    }

    const idToken = authHeader.slice(7).trim();
    const fbUser = await verifyFirebaseBearerToken(idToken);
    if (!fbUser?.uid || !SAFE_ID_REGEX.test(fbUser.uid)) {
      res.status(401).json({ unlocked: false, error: 'Invalid Firebase session token.' });
      return;
    }

    const clientMeta = getTrustedClientMeta(req);
    const lockoutStatus = checkAdminLockout(fbUser.uid, clientMeta.ip);
    if (lockoutStatus.blocked) {
      logSecurityEvent({
        req,
        category: 'auth',
        eventType: 'ADMIN_LOCKED_OUT_ATTEMPT',
        severity: 'critical',
        endpoint: '/api/admin/unlock',
        accountIdentifier: fbUser.uid,
        actionTaken: 'Blocked login attempt during active 3-strike temporary lockout',
        result: `Rejected (HTTP 429, ${lockoutStatus.remainingSeconds}s remaining)`,
        suspicious: true,
      });
      res.status(429).json({
        unlocked: false,
        lockoutActive: true,
        retryAfterSeconds: lockoutStatus.remainingSeconds,
        lockoutMinutes: Math.round(ADMIN_LOCKOUT_MS / 60000),
        error: LOCKOUT_PRIMARY_MESSAGE,
        cybercrimeWarning: CYBERCRIME_WARNING_MESSAGE,
      });
      return;
    }

    const { password } = req.body as { password?: unknown };
    if (typeof password !== 'string') {
      res.status(400).json({ unlocked: false, error: 'Admin password is required.' });
      return;
    }

    const trimmedPassword = password.trim();
    if (trimmedPassword.length < 4 || trimmedPassword.length > 128) {
      res.status(400).json({ unlocked: false, error: 'Admin password must be between 4 and 128 characters.' });
      return;
    }

    const handleFailedPassword = (reason: string) => {
      const outcome = recordAdminFailedAttempt(req, fbUser.uid, reason);
      if (outcome.nowLocked) {
        res.status(429).json({
          unlocked: false,
          lockoutActive: true,
          retryAfterSeconds: Math.round(ADMIN_LOCKOUT_MS / 1000),
          lockoutMinutes: Math.round(ADMIN_LOCKOUT_MS / 60000),
          error: LOCKOUT_PRIMARY_MESSAGE,
          cybercrimeWarning: CYBERCRIME_WARNING_MESSAGE,
        });
        return;
      }
      res.status(401).json({
        unlocked: false,
        lockoutActive: false,
        remainingAttempts: outcome.remainingAttempts,
        error: `Invalid admin password. (${outcome.remainingAttempts} attempt${outcome.remainingAttempts === 1 ? '' : 's'} remaining before temporary lockout.)`,
      });
    };

    const verification = verifyAdminPasswordCredential(trimmedPassword);
    if (!verification.matched) {
      handleFailedPassword('Incorrect admin password entered');
      return;
    }

    const projectId = firebaseConfig.projectId;
    const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';
    if (!projectId) {
      res.status(500).json({ unlocked: false, error: 'Firebase project configuration missing.' });
      return;
    }

    const credDigest = verification.envOverride
      ? crypto.createHash('sha256').update(trimmedPassword, 'utf8').digest('hex')
      : crypto
          .createHash('sha256')
          .update(`zaikora-admin-v2:${verification.slot}:${trimmedPassword}`, 'utf8')
          .digest('hex');
    const proofDigest = crypto
      .createHash('sha256')
      .update(`${fbUser.uid}:${credDigest}`, 'utf8')
      .digest('hex');

    const baseFirestore = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}`;
    const commitUrl = `${baseFirestore}/documents:commit`;
    const lockConfigPath = `projects/${projectId}/databases/${databaseId}/documents/admin_lock_config/primary`;
    const adminDocUrl = `${baseFirestore}/documents/admins/${encodeURIComponent(fbUser.uid)}`;
    const adminDocPath = `projects/${projectId}/databases/${databaseId}/documents/admins/${fbUser.uid}`;

    try {
      const existingAdminRes = await fetch(adminDocUrl, {
        method: 'GET',
        headers: { Authorization: `Bearer ${idToken}` },
      });

      if (verification.envOverride) {
        await fetch(commitUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            writes: [
              {
                update: {
                  name: lockConfigPath,
                  fields: { lockDigest: { stringValue: credDigest } },
                },
                updateTransforms: [
                  { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
                ],
              },
            ],
          }),
        });
      }

      const writeOp =
        existingAdminRes.status === 200
          ? {
              currentDocument: { exists: true },
              updateMask: { fieldPaths: ['name', 'role', 'active', 'proofDigest'] },
              update: {
                name: adminDocPath,
                fields: {
                  name: { stringValue: 'ZAIKORA Admin' },
                  role: { stringValue: 'super_admin' },
                  active: { booleanValue: true },
                  proofDigest: { stringValue: proofDigest },
                },
              },
            }
          : {
              currentDocument: { exists: false },
              update: {
                name: adminDocPath,
                fields: {
                  uid: { stringValue: fbUser.uid },
                  name: { stringValue: 'ZAIKORA Admin' },
                  role: { stringValue: 'super_admin' },
                  active: { booleanValue: true },
                  proofDigest: { stringValue: proofDigest },
                },
              },
              updateTransforms: [
                { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' },
              ],
            };

      const adminCommitRes = await fetch(commitUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ writes: [writeOp] }),
      });

      if (!adminCommitRes.ok) {
        const errText = await adminCommitRes.text();
        if (adminCommitRes.status === 403 || errText.includes('PERMISSION_DENIED')) {
          handleFailedPassword('Firestore admin proof verification denied');
          return;
        }
        res.status(502).json({
          unlocked: false,
          error: `Unable to authorize admin session in Firestore: ${errText.slice(0, 180)}`,
        });
        return;
      }

      const issued = signAdminSessionToken(fbUser.uid);
      recordAdminSuccessfulLogin(req, fbUser.uid, issued.sessionId, issued.expiresAt);
      res.cookie(ADMIN_COOKIE_NAME, issued.token, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        partitioned: true,
        maxAge: SESSION_TTL_MS,
        path: '/',
      });

      res.json({
        unlocked: true,
        uid: fbUser.uid,
        sessionId: issued.sessionId,
        sessionToken: issued.token,
      });
    } catch (err) {
      res.status(502).json({
        unlocked: false,
        error: err instanceof Error ? err.message : 'Unable to unlock admin panel.',
      });
    }
  });

  // --- Order Preparation, Idempotency, Anti-Spam Challenge & Review Flagging ---

  app.post('/api/orders/challenge', async (req, res) => {
    const user = await verifyRequestAuth(req);
    if (!user?.firebaseUid) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    res.json({ challenge: issueCheckoutChallenge(req) });
  });

  app.post('/api/orders/prepare', async (req, res) => {
    const user = await verifyRequestAuth(req);
    if (!user?.firebaseUid) {
      res.status(401).json({ error: 'Please sign in to submit an order.' });
      return;
    }

    const {
      idempotencyKey,
      fulfillmentType,
      addressSummary,
      totalItemCount,
      items,
      challengeId,
      challengeSolution,
    } = req.body as {
      idempotencyKey?: unknown;
      fulfillmentType?: unknown;
      addressSummary?: unknown;
      totalItemCount?: unknown;
      items?: unknown;
      challengeId?: unknown;
      challengeSolution?: unknown;
    };

    if (typeof idempotencyKey !== 'string' || !SAFE_ID_REGEX.test(idempotencyKey)) {
      res.status(400).json({ error: 'Valid idempotencyKey is required.' });
      return;
    }

    const cleanFulfillment = fulfillmentType === 'collection' ? 'collection' : 'delivery';
    const cleanAddress = typeof addressSummary === 'string' ? addressSummary.trim().slice(0, 350) : '';
    const itemCount = Number(totalItemCount);
    if (!cleanAddress || !Number.isFinite(itemCount) || itemCount < 1 || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Complete order items and delivery/collection details are required.' });
      return;
    }

    const parsedItems = items
      .filter((it): it is { productId: string; productType: string; quantity: number; selectedFlavour?: string } =>
        Boolean(it) &&
        typeof it === 'object' &&
        typeof (it as { productId?: unknown }).productId === 'string' &&
        typeof (it as { quantity?: unknown }).quantity === 'number'
      )
      .slice(0, 100);

    if (parsedItems.length === 0) {
      res.status(400).json({ error: 'Order must include at least one valid item.' });
      return;
    }

    // Return existing idempotent order cleanly before applying repeat/burst penalties
    const existing = getIdempotentOrder(user.firebaseUid, idempotencyKey);
    if (existing) {
      const fingerprint = computeCheckoutFingerprint({
        customerUid: user.firebaseUid,
        fulfillmentType: cleanFulfillment,
        addressSummary: cleanAddress,
        items: parsedItems,
      });
      if (existing.fingerprint === fingerprint) {
        res.json({
          ok: true,
          idempotentReplay: true,
          idempotencyKey,
          orderId: existing.orderId,
          paymentId: existing.paymentId,
          razorpayOrderId: existing.razorpayOrderId || null,
          status: existing.status,
          reviewFlagged: false,
          reviewFlagReason: '',
          suspiciousScore: 0,
        });
        return;
      }
    }

    const stockPrecheck = await precheckOrderItemsInventoryFromFirestore({
      projectId: firebaseConfig.projectId,
      databaseId: firebaseConfig.firestoreDatabaseId || '(default)',
      items: parsedItems,
    });
    if (stockPrecheck.ok === false) {
      res.status(stockPrecheck.status).json({ error: stockPrecheck.error });
      return;
    }

    const rateCheck = checkAndRecordCheckoutRateLimit(req, user.firebaseUid);
    if (!rateCheck.allowed) {
      res.status(rateCheck.status || 429).json({ error: rateCheck.error || 'Too many checkout attempts.' });
      return;
    }

    if (rateCheck.requiresChallenge) {
      const solved =
        typeof challengeId === 'string' &&
        typeof challengeSolution === 'string' &&
        verifyCheckoutChallenge(challengeId, challengeSolution);
      if (!solved) {
        res.status(428).json({
          requiresChallenge: true,
          challenge: issueCheckoutChallenge(req),
          error: 'Automated or burst traffic detected. Please complete the quick verification check.',
        });
        return;
      }
    }

    const orderId = `ZK${Date.now().toString().slice(-6)}${crypto.randomInt(10, 99)}`;
    const paymentId = `pay_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
    const fingerprint = computeCheckoutFingerprint({
      customerUid: user.firebaseUid,
      fulfillmentType: cleanFulfillment,
      addressSummary: cleanAddress,
      items: parsedItems,
    });

    const review = evaluateOrderReviewFlags({
      req,
      customerUid: user.firebaseUid,
      fingerprint,
      totalItemCount: Math.round(itemCount),
      orderId,
    });

    upsertIdempotentOrder({
      customerUid: user.firebaseUid,
      key: idempotencyKey,
      orderId,
      paymentId,
      fingerprint,
      amountRupees: 0,
      status: 'PREPARED',
    });

    res.json({
      ok: true,
      idempotentReplay: false,
      idempotencyKey,
      orderId,
      paymentId,
      reviewFlagged: review.reviewFlagged,
      reviewFlagReason: review.reviewFlagReason,
      suspiciousScore: review.suspiciousScore,
    });
  });

  // --- Razorpay Order & Payment Verification (Server-Calculated Pricing) ---

  app.post('/api/payments/create-order', async (req, res) => {
    const user = await verifyRequestAuth(req);
    if (!user) {
      logSecurityEvent({
        req,
        category: 'payment',
        eventType: 'UNAUTHENTICATED_PAYMENT_ATTEMPT',
        severity: 'warning',
        endpoint: '/api/payments/create-order',
        actionTaken: 'Blocked unauthenticated Razorpay order creation',
        result: 'Rejected (HTTP 401)',
        suspicious: true,
      });
      res.status(401).json({ error: 'Authentication required to initiate payment.' });
      return;
    }

    const { orderId, amountInRupees, idempotencyKey } = req.body as {
      orderId?: unknown;
      amountInRupees?: unknown;
      idempotencyKey?: unknown;
    };

    if (typeof orderId !== 'string' || !SAFE_ID_REGEX.test(orderId)) {
      res.status(400).json({ error: 'Valid orderId is required.' });
      return;
    }

    if (!user.firebaseIdToken || !user.firebaseUid) {
      res.status(401).json({
        error: 'Verified Firebase session header is required to verify order pricing.',
      });
      return;
    }

    const verifiedPricing = await verifyAndComputeOrderAmountFromFirestore({
      req,
      bearerToken: user.firebaseIdToken,
      customerUid: user.firebaseUid,
      orderId,
      clientAmountInRupees: amountInRupees,
      projectId: firebaseConfig.projectId,
      databaseId: firebaseConfig.firestoreDatabaseId || '(default)',
    });

    if (verifiedPricing.ok === false) {
      res.status(verifiedPricing.status).json({ error: verifiedPricing.error });
      return;
    }

    const amount = verifiedPricing.verifiedAmountRupees;

    const rzpConfig = getRazorpayRuntimeConfig();
    if (!rzpConfig.razorpayConfigured || rzpConfig.blockedTestInProd) {
      setExpectedOrderPayment({
        orderId,
        customerUid: user.firebaseUid,
        amountRupees: amount,
      });
      updateIdempotentStatus(orderId, { status: 'PAYMENT PENDING' });
      if (rzpConfig.blockedTestInProd) {
        logSecurityEvent({
          req,
          category: 'payment',
          eventType: 'RAZORPAY_TEST_KEY_BLOCKED_IN_PROD',
          severity: 'warning',
          endpoint: '/api/payments/create-order',
          accountIdentifier: user.firebaseUid,
          actionTaken: `Blocked production Razorpay test-key checkout attempt for ${orderId}`,
          result: 'Rejected (HTTP 503)',
          suspicious: false,
        });
      }
      res.status(503).json({
        configured: false,
        error: rzpConfig.blockedTestInProd
          ? 'Razorpay test keys (rzp_test_*) are disabled in production. Configure live Razorpay keys.'
          : 'Razorpay credentials (RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET) are not configured on the server.',
      });
      return;
    }
    const { keyId, keySecret } = rzpConfig;

    // Reuse existing Razorpay order ID for safe idempotent retries of the exact same order & amount
    const existingExpected = getExpectedOrderPayment(orderId);
    if (
      existingExpected &&
      existingExpected.customerUid === user.firebaseUid &&
      existingExpected.amountRupees === amount &&
      existingExpected.razorpayOrderId
    ) {
      res.json({
        configured: true,
        razorpayOrderId: existingExpected.razorpayOrderId,
        amount: amount * 100,
        currency: 'INR',
        keyId,
        reusedExisting: true,
      });
      return;
    }

    try {
      const authToken = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
      const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: amount * 100,
          currency: 'INR',
          receipt: orderId,
          notes: {
            zaikoraOrderId: orderId,
            customerUid: user.firebaseUid,
            ...(typeof idempotencyKey === 'string' && idempotencyKey ? { idempotencyKey } : {}),
          },
        }),
      });

      const rzpData = (await rzpRes.json()) as {
        id?: string;
        amount?: number;
        currency?: string;
        error?: { description?: string };
      };

      if (!rzpRes.ok || !rzpData.id) {
        logSecurityEvent({
          req,
          category: 'payment',
          eventType: 'RAZORPAY_ORDER_CREATION_FAILED',
          severity: 'warning',
          endpoint: '/api/payments/create-order',
          accountIdentifier: user.firebaseUid,
          actionTaken: `Razorpay rejected order creation for ${orderId}`,
          result: rzpData.error?.description || 'Failed',
          suspicious: false,
        });
        res.status(502).json({
          configured: true,
          error: rzpData.error?.description || 'Failed to create Razorpay order.',
        });
        return;
      }

      setExpectedOrderPayment({
        orderId,
        customerUid: user.firebaseUid,
        amountRupees: amount,
        razorpayOrderId: rzpData.id,
      });
      updateIdempotentStatus(orderId, {
        status: 'PAYMENT PENDING',
        razorpayOrderId: rzpData.id,
      });

      logSecurityEvent({
        req,
        category: 'payment',
        eventType: 'RAZORPAY_ORDER_CREATED',
        severity: 'info',
        endpoint: '/api/payments/create-order',
        accountIdentifier: user.firebaseUid,
        actionTaken: `Verified order ${orderId} pricing (₹${amount}) and created Razorpay order ${rzpData.id}`,
        result: 'Success',
        suspicious: false,
      });

      res.json({
        configured: true,
        razorpayOrderId: rzpData.id,
        amount: rzpData.amount,
        currency: rzpData.currency || 'INR',
        keyId,
      });
    } catch (err) {
      res.status(502).json({
        configured: true,
        error: err instanceof Error ? err.message : 'Unable to reach Razorpay API.',
      });
    }
  });

  app.post('/api/payments/verify', async (req, res) => {
    const user = await verifyRequestAuth(req);
    if (!user || !user.firebaseUid || !user.firebaseIdToken) {
      res.status(401).json({ error: 'Authenticated Firebase session is required to verify payment.' });
      return;
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body as {
      razorpay_order_id?: unknown;
      razorpay_payment_id?: unknown;
      razorpay_signature?: unknown;
      orderId?: unknown;
    };

    if (
      typeof razorpay_order_id !== 'string' ||
      typeof razorpay_payment_id !== 'string' ||
      typeof razorpay_signature !== 'string' ||
      typeof orderId !== 'string' ||
      !SAFE_ID_REGEX.test(orderId) ||
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      res.status(400).json({ verified: false, error: 'Missing required Razorpay verification fields.' });
      return;
    }

    const rzpConfig = getRazorpayRuntimeConfig();
    if (!rzpConfig.razorpayConfigured || rzpConfig.blockedTestInProd) {
      res.status(503).json({
        verified: false,
        error: rzpConfig.blockedTestInProd
          ? 'Razorpay test keys (rzp_test_*) are disabled in production. Configure live Razorpay keys.'
          : 'RAZORPAY_KEY_SECRET is not configured on the server.',
      });
      return;
    }
    const { keySecret } = rzpConfig;

    const expectedOrder = getExpectedOrderPayment(orderId);
    if (expectedOrder) {
      if (
        expectedOrder.customerUid !== user.firebaseUid ||
        (expectedOrder.razorpayOrderId && expectedOrder.razorpayOrderId !== razorpay_order_id)
      ) {
        logSecurityEvent({
          req,
          category: 'payment',
          eventType: 'PAYMENT_ORDER_MISMATCH_BLOCKED',
          severity: 'critical',
          endpoint: '/api/payments/verify',
          accountIdentifier: user.uid,
          actionTaken: `Blocked mismatched Razorpay order ${razorpay_order_id} for order ${orderId}`,
          result: 'Rejected (HTTP 403)',
          suspicious: true,
          notifyAdmin: true,
        });
        res.status(403).json({
          verified: false,
          error: 'Razorpay order does not match the customer order record.',
        });
        return;
      }
    }

    const existingRecord = getProcessedPayment(razorpay_payment_id);
    if (existingRecord && existingRecord.orderId !== orderId) {
      logSecurityEvent({
        req,
        category: 'payment',
        eventType: 'PAYMENT_REPLAY_BLOCKED',
        severity: 'critical',
        endpoint: '/api/payments/verify',
        accountIdentifier: user.uid,
        actionTaken: `Blocked duplicate reuse of Razorpay payment ${razorpay_payment_id} on order ${orderId}`,
        result: 'Rejected (HTTP 409)',
        suspicious: true,
        notifyAdmin: true,
      });
      res.status(409).json({
        verified: false,
        error: 'Duplicate payment detected: this Razorpay payment ID was already used for another order.',
      });
      return;
    }

    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    const expectedBuf = Buffer.from(expectedSignature, 'utf8');
    const providedBuf = Buffer.from(razorpay_signature, 'utf8');

    const isSignatureValid =
      expectedBuf.length === providedBuf.length && crypto.timingSafeEqual(expectedBuf, providedBuf);

    if (!isSignatureValid) {
      logSecurityEvent({
        req,
        category: 'payment',
        eventType: 'RAZORPAY_INVALID_SIGNATURE',
        severity: 'critical',
        endpoint: '/api/payments/verify',
        accountIdentifier: user.uid,
        actionTaken: `Rejected invalid Razorpay signature for order ${orderId}`,
        result: 'Rejected (HTTP 400)',
        suspicious: true,
        notifyAdmin: true,
      });
      res.status(400).json({
        verified: false,
        error: 'Razorpay payment signature verification failed.',
      });
      return;
    }

    // Load order record from Firestore to confirm ownership, amount, and state
    const orderDoc = await fsGetDocument(user.firebaseIdToken, `orders/${encodeURIComponent(orderId)}`);
    if (!orderDoc.ok) {
      res.status(orderDoc.status === 404 ? 404 : 502).json({
        verified: false,
        error: orderDoc.status === 404 ? 'Order record not found.' : 'Unable to load order record.',
      });
      return;
    }

    const orderData = orderDoc.data;
    if (orderData.customerId !== user.firebaseUid) {
      res.status(403).json({ verified: false, error: 'You are not authorized to verify this order.' });
      return;
    }

    if (
      orderData.adminRejected === true ||
      orderData.status === 'REJECTED' ||
      orderData.status === 'Cancelled' ||
      orderData.status === 'REFUNDED'
    ) {
      res.status(409).json({ verified: false, error: 'Order is closed or rejected.' });
      return;
    }

    if (
      orderData.paymentStatus === 'successful' &&
      orderData.razorpayPaymentId === razorpay_payment_id
    ) {
      res.json({
        verified: true,
        alreadyVerified: true,
        orderId,
        status: String(orderData.status || 'PENDING ADMIN APPROVAL'),
        paymentStatus: 'successful',
        message: PENDING_APPROVAL_CUSTOMER_MESSAGE,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        verifiedAt: new Date().toISOString(),
      });
      return;
    }

    const orderFinalRupees = Number(orderData.finalAmount || expectedOrder?.amountRupees || 0);
    const apiVerification = await verifyRazorpayPaymentViaApi({
      razorpayPaymentId: razorpay_payment_id,
      expectedRazorpayOrderId: razorpay_order_id,
      expectedAmountPaise: orderFinalRupees > 0 ? Math.round(orderFinalRupees * 100) : undefined,
    });

    if (apiVerification.ok === false) {
      logSecurityEvent({
        req,
        category: 'payment',
        eventType: 'RAZORPAY_API_VERIFICATION_FAILED',
        severity: 'critical',
        endpoint: '/api/payments/verify',
        accountIdentifier: user.firebaseUid,
        actionTaken: `Razorpay Payments API verification failed for payment ${razorpay_payment_id} (Order ${orderId})`,
        result: `Rejected (HTTP ${apiVerification.status})`,
        suspicious: true,
        notifyAdmin: true,
        details: apiVerification.error,
      });
      res.status(apiVerification.status).json({
        verified: false,
        error: apiVerification.error,
      });
      return;
    }

    // Load order items and verify + atomically deduct limited stock inside commit with optimistic updateTime lock
    const { projectId, databaseId, docRoot } = getFirestorePaths();
    const itemsQuery = await runFirestoreQuery({
      projectId,
      databaseId,
      collectionId: 'items',
      parentRelativePath: `orders/${orderId}`,
      limit: 100,
      bearerToken: user.firebaseIdToken,
    });
    if (!itemsQuery.ok) {
      res.status(502).json({
        verified: false,
        error: 'Unable to load ordered items for inventory verification.',
      });
      return;
    }

    const aggregatedItems = new Map<
      string,
      { productId: string; productType: 'food' | 'cake'; qty: number; name: string }
    >();
    for (const item of itemsQuery.docs) {
      const productId = typeof item.productId === 'string' ? item.productId : '';
      const productType = item.productType === 'cake' ? 'cake' : 'food';
      const qty = typeof item.quantity === 'number' ? Math.round(item.quantity) : 0;
      const itemName = typeof item.name === 'string' && item.name ? item.name : productId;
      if (!productId || qty < 1) continue;
      const key = `${productType}:${productId}`;
      const existingAgg = aggregatedItems.get(key);
      aggregatedItems.set(key, {
        productId,
        productType,
        qty: (existingAgg?.qty || 0) + qty,
        name: existingAgg?.name || itemName,
      });
    }

    const MAX_STOCK_COMMIT_ATTEMPTS = 4;
    let commitSucceeded = false;
    let lastCommitError = '';
    let stockConflictMessage = '';
    let latestOrderData = orderData;

    for (let attempt = 0; attempt < MAX_STOCK_COMMIT_ATTEMPTS; attempt++) {
      const freshOrderDoc =
        attempt === 0
          ? orderDoc
          : await fsGetDocument(user.firebaseIdToken, `orders/${encodeURIComponent(orderId)}`);
      if (!freshOrderDoc.ok) {
        lastCommitError = freshOrderDoc.error || 'Unable to reload order document.';
        break;
      }
      latestOrderData = freshOrderDoc.data;

      if (
        latestOrderData.paymentStatus === 'successful' &&
        latestOrderData.razorpayPaymentId === razorpay_payment_id
      ) {
        commitSucceeded = true;
        break;
      }

      const menuEntries = Array.from(aggregatedItems.values());
      const menuDocs = await Promise.all(
        menuEntries.map((entry) =>
          fsGetDocument(
            user.firebaseIdToken!,
            `${entry.productType === 'cake' ? 'cake_menu' : 'food_menu'}/${encodeURIComponent(entry.productId)}`
          )
        )
      );

      const limitedDeductions: Array<{
        collection: 'food_menu' | 'cake_menu';
        productId: string;
        productName: string;
        productType: 'food' | 'cake';
        previousStock: number;
        qty: number;
        newStock: number;
        stockUnit: string;
        updateTime?: string;
      }> = [];

      stockConflictMessage = '';
      for (let i = 0; i < menuEntries.length; i++) {
        const entry = menuEntries[i];
        const menuDoc = menuDocs[i];
        if (!menuDoc.ok) {
          if (menuDoc.status === 404) {
            // Item uses static unlimited fallback until seeded in Firestore
            continue;
          }
          lastCommitError = menuDoc.error || `Unable to check stock for ${entry.name}.`;
          break;
        }
        const norm = normalizeInventoryFields(menuDoc.data, {
          isCake: entry.productType === 'cake',
        });
        const displayName =
          typeof menuDoc.data.name === 'string' && menuDoc.data.name
            ? menuDoc.data.name
            : entry.name;

        if (!norm.available) {
          stockConflictMessage = `"${displayName}" just became unavailable while payment was completing.`;
          break;
        }
        if (norm.stockMode === 'limited') {
          if (norm.soldOut || norm.stockQuantity <= 0) {
            stockConflictMessage = `"${displayName}" just sold out while your payment was being finalized.`;
            break;
          }
          if (entry.qty > norm.stockQuantity) {
            stockConflictMessage = `Only ${norm.stockQuantity} ${norm.stockUnit.toLowerCase()} remaining for "${displayName}" (ordered ${entry.qty}).`;
            break;
          }
          limitedDeductions.push({
            collection: entry.productType === 'cake' ? 'cake_menu' : 'food_menu',
            productId: entry.productId,
            productName: displayName,
            productType: entry.productType,
            previousStock: norm.stockQuantity,
            qty: entry.qty,
            newStock: Math.max(0, norm.stockQuantity - entry.qty),
            stockUnit: norm.stockUnit,
            updateTime: menuDoc.updateTime,
          });
        }
      }

      if (stockConflictMessage) {
        break;
      }
      if (lastCommitError) {
        break;
      }

      const paymentDocId =
        typeof latestOrderData.paymentId === 'string' && SAFE_ID_REGEX.test(latestOrderData.paymentId)
          ? latestOrderData.paymentId
          : `pay_${orderId}`;
      const tsBase = Date.now() + attempt * 10;
      const histVerifiedId = `hist_verified_${tsBase}`;
      const histPendingId = `hist_pending_${tsBase + 1}`;
      const notifId = `notif_received_${tsBase + 2}`;

      const writes: Array<Record<string, unknown>> = [
        {
          currentDocument: freshOrderDoc.updateTime
            ? { updateTime: freshOrderDoc.updateTime }
            : { exists: true },
          updateMask: {
            fieldPaths: [
              'paymentStatus',
              'status',
              'paymentId',
              'razorpayOrderId',
              'razorpayPaymentId',
              'inventoryDeducted',
              'inventoryRestored',
            ],
          },
          update: {
            name: `${docRoot}/orders/${orderId}`,
            fields: {
              paymentStatus: { stringValue: 'successful' },
              status: { stringValue: 'PENDING ADMIN APPROVAL' },
              paymentId: { stringValue: paymentDocId },
              razorpayOrderId: { stringValue: razorpay_order_id },
              razorpayPaymentId: { stringValue: razorpay_payment_id },
              inventoryDeducted: { booleanValue: true },
              inventoryRestored: { booleanValue: false },
            },
          },
          updateTransforms: [
            { fieldPath: 'paymentVerifiedAt', setToServerValue: 'REQUEST_TIME' },
            { fieldPath: 'inventoryDeductedAt', setToServerValue: 'REQUEST_TIME' },
            { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
          ],
        },
        {
          currentDocument: { exists: true },
          updateMask: {
            fieldPaths: [
              'status',
              'razorpayOrderId',
              'razorpayPaymentId',
              'signatureVerified',
              'verifiedByServer',
            ],
          },
          update: {
            name: `${docRoot}/payments/${paymentDocId}`,
            fields: {
              status: { stringValue: 'successful' },
              razorpayOrderId: { stringValue: razorpay_order_id },
              razorpayPaymentId: { stringValue: razorpay_payment_id },
              signatureVerified: { booleanValue: true },
              verifiedByServer: { booleanValue: true },
            },
          },
          updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
        },
        {
          currentDocument: { exists: false },
          update: {
            name: `${docRoot}/orders/${orderId}/status_history/${histVerifiedId}`,
            fields: {
              id: { stringValue: histVerifiedId },
              orderId: { stringValue: orderId },
              customerId: { stringValue: user.firebaseUid },
              status: { stringValue: 'PAYMENT VERIFIED' },
              note: {
                stringValue: `Razorpay payment verified by server (${razorpay_payment_id}).`.slice(0, 240),
              },
              updatedBy: { stringValue: user.firebaseUid },
            },
          },
          updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
        },
        {
          currentDocument: { exists: false },
          update: {
            name: `${docRoot}/orders/${orderId}/status_history/${histPendingId}`,
            fields: {
              id: { stringValue: histPendingId },
              orderId: { stringValue: orderId },
              customerId: { stringValue: user.firebaseUid },
              status: { stringValue: 'PENDING ADMIN APPROVAL' },
              note: { stringValue: PENDING_APPROVAL_CUSTOMER_MESSAGE.slice(0, 240) },
              updatedBy: { stringValue: user.firebaseUid },
            },
          },
          updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
        },
        {
          currentDocument: { exists: false },
          update: {
            name: `${docRoot}/customers/${user.firebaseUid}/notifications/${notifId}`,
            fields: {
              id: { stringValue: notifId },
              customerId: { stringValue: user.firebaseUid },
              orderId: { stringValue: orderId },
              title: { stringValue: 'Order Request Received' },
              message: { stringValue: PENDING_APPROVAL_CUSTOMER_MESSAGE },
              smsSent: { booleanValue: false },
              smsStatusDetail: { stringValue: 'Awaiting kitchen review and confirmation.' },
              read: { booleanValue: false },
            },
          },
          updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
        },
      ];

      for (const d of limitedDeductions) {
        const histId = `${orderId}_${d.productId}`.slice(0, 128);
        writes.push(
          {
            currentDocument: d.updateTime ? { updateTime: d.updateTime } : { exists: true },
            updateMask: {
              fieldPaths: [
                'stockQuantity',
                'soldOut',
                'lastStockUpdatedBy',
                'lastStockOrderId',
              ],
            },
            update: {
              name: `${docRoot}/${d.collection}/${d.productId}`,
              fields: {
                stockQuantity: { integerValue: String(d.newStock) },
                soldOut: { booleanValue: d.newStock === 0 },
                lastStockUpdatedBy: { stringValue: user.firebaseUid },
                lastStockOrderId: { stringValue: orderId },
              },
            },
            updateTransforms: [
              { fieldPath: 'lastStockUpdatedAt', setToServerValue: 'REQUEST_TIME' },
              { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
            ],
          },
          {
            currentDocument: { exists: false },
            update: {
              name: `${docRoot}/stock_history/${histId}`,
              fields: {
                historyId: { stringValue: histId },
                productId: { stringValue: d.productId },
                productName: { stringValue: d.productName.slice(0, 120) },
                productType: { stringValue: d.productType },
                actionType: { stringValue: 'order_deduction' },
                previousStock: { integerValue: String(d.previousStock) },
                changeDelta: { integerValue: String(-d.qty) },
                newStock: { integerValue: String(d.newStock) },
                stockUnit: { stringValue: d.stockUnit },
                stockMode: { stringValue: 'limited' },
                orderId: { stringValue: orderId },
                actorUid: { stringValue: user.firebaseUid },
                reason: { stringValue: `Order ${orderId} verified payment deduction`.slice(0, 240) },
              },
            },
            updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
          }
        );
      }

      const commitRes = await fsCommitWrites(user.firebaseIdToken, writes);
      if (commitRes.ok) {
        commitSucceeded = true;
        break;
      }

      const isPreconditionRetry = commitRes.status === 409 || commitRes.status === 412;
      if (isPreconditionRetry && attempt < MAX_STOCK_COMMIT_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, 45 + attempt * 55));
        continue;
      }
      lastCommitError = commitRes.error || 'Firestore commit error';
      break;
    }

    if (stockConflictMessage) {
      // Payment was captured on Razorpay while another concurrent order took the last stock: trigger immediate full refund
      const refundAmountRupees = Math.max(1, Math.round(orderFinalRupees));
      const refundRes = await initiateRazorpayFullRefund({
        razorpayPaymentId: razorpay_payment_id,
        amountRupees: refundAmountRupees,
        orderId,
        reason: stockConflictMessage,
        adminUid: 'SYSTEM_STOCK_GUARD',
      });

      if (refundRes.ok) {
        const nowIso = new Date().toISOString();
        upsertRefundRecord({
          orderId,
          refundId: refundRes.refundId,
          razorpayPaymentId: razorpay_payment_id,
          amountRupees: refundRes.amountRupees,
          status: refundRes.refundStatus,
          razorpayStatus: refundRes.razorpayRefundStatus,
          reason: stockConflictMessage,
          adminUid: 'SYSTEM_STOCK_GUARD',
          createdAt: nowIso,
          updatedAt: nowIso,
          completedAt: refundRes.refundStatus === 'Refund Completed' ? nowIso : undefined,
        });
      }

      logSecurityEvent({
        req,
        category: 'payment',
        eventType: 'PAYMENT_STOCK_CONFLICT_AUTO_REFUND',
        severity: 'warning',
        endpoint: '/api/payments/verify',
        accountIdentifier: user.firebaseUid,
        actionTaken: `Stock exhausted mid-payment for Order ${orderId}: ${stockConflictMessage}`,
        result: refundRes.ok ? `Auto-refunded (${refundRes.refundId})` : 'Refund attempt logged',
        suspicious: false,
      });

      res.status(409).json({
        verified: false,
        stockConflict: true,
        refundInitiated: refundRes.ok,
        refundId: refundRes.ok ? refundRes.refundId : null,
        error: refundRes.ok
          ? `${stockConflictMessage} Your payment has been automatically scheduled for a full refund (Ref: ${refundRes.refundId}).`
          : `${stockConflictMessage} Please contact support with Payment ID ${razorpay_payment_id} for an immediate refund.`,
      });
      return;
    }

    if (!commitSucceeded) {
      res.status(502).json({
        verified: false,
        error: `Payment verified with Razorpay, but order status update failed: ${lastCommitError || 'Firestore commit error'}`,
      });
      return;
    }

    const verifiedAt = new Date().toISOString();
    recordProcessedPayment({
      paymentId: razorpay_payment_id,
      orderId,
      razorpayOrderId: razorpay_order_id,
      amountRupees: orderFinalRupees,
    });
    updateIdempotentStatus(orderId, {
      status: 'PENDING ADMIN APPROVAL',
      razorpayOrderId: razorpay_order_id,
    });

    logSecurityEvent({
      req,
      category: 'payment',
      eventType: 'PAYMENT_VERIFIED_PENDING_ADMIN_APPROVAL',
      severity: 'info',
      endpoint: '/api/payments/verify',
      accountIdentifier: user.firebaseUid,
      actionTaken: `Verified payment ${razorpay_payment_id} via HMAC + Razorpay API; deducted limited stock and moved Order ${orderId} to PENDING ADMIN APPROVAL`,
      result: 'PENDING ADMIN APPROVAL',
      suspicious: false,
    });

    res.json({
      verified: true,
      orderId,
      status: 'PENDING ADMIN APPROVAL',
      paymentStatus: 'successful',
      message: PENDING_APPROVAL_CUSTOMER_MESSAGE,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      verifiedAt,
    });
  });

  app.post('/api/payments/mark-failed', async (req, res) => {
    const user = await verifyRequestAuth(req);
    if (!user?.firebaseUid || !user.firebaseIdToken) {
      res.status(401).json({ ok: false, error: 'Authentication required.' });
      return;
    }

    const { orderId, reason, razorpayOrderId, razorpayPaymentId } = req.body as {
      orderId?: unknown;
      reason?: unknown;
      razorpayOrderId?: unknown;
      razorpayPaymentId?: unknown;
    };

    if (typeof orderId !== 'string' || !SAFE_ID_REGEX.test(orderId)) {
      res.status(400).json({ ok: false, error: 'Valid orderId is required.' });
      return;
    }

    const cleanReason =
      typeof reason === 'string' && reason.trim()
        ? reason.trim().slice(0, 230)
        : 'Payment was cancelled or failed before completion.';

    const orderDoc = await fsGetDocument(user.firebaseIdToken, `orders/${encodeURIComponent(orderId)}`);
    if (!orderDoc.ok) {
      res.status(orderDoc.status).json({ ok: false, error: 'Order not found.' });
      return;
    }
    const orderData = orderDoc.data;
    if (orderData.customerId !== user.firebaseUid) {
      res.status(403).json({ ok: false, error: 'Access denied.' });
      return;
    }
    if (orderData.paymentStatus !== 'pending') {
      res.status(409).json({ ok: false, error: 'Only pending payments can be marked failed.' });
      return;
    }

    const { docRoot } = getFirestorePaths();
    const orderFieldPaths = ['paymentStatus', 'status'];
    const orderFields: Record<string, unknown> = {
      paymentStatus: { stringValue: 'failed' },
      status: { stringValue: 'PAYMENT FAILED' },
    };
    if (typeof razorpayOrderId === 'string' && razorpayOrderId) {
      orderFieldPaths.push('razorpayOrderId');
      orderFields.razorpayOrderId = { stringValue: razorpayOrderId.slice(0, 128) };
    }
    if (typeof razorpayPaymentId === 'string' && razorpayPaymentId) {
      orderFieldPaths.push('razorpayPaymentId');
      orderFields.razorpayPaymentId = { stringValue: razorpayPaymentId.slice(0, 128) };
    }

    const histId = `hist_failed_${Date.now()}`;
    const writes: Array<Record<string, unknown>> = [
      {
        currentDocument: { exists: true },
        updateMask: { fieldPaths: orderFieldPaths },
        update: {
          name: `${docRoot}/orders/${orderId}`,
          fields: orderFields,
        },
        updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
      },
      {
        currentDocument: { exists: false },
        update: {
          name: `${docRoot}/orders/${orderId}/status_history/${histId}`,
          fields: {
            id: { stringValue: histId },
            orderId: { stringValue: orderId },
            customerId: { stringValue: user.firebaseUid },
            status: { stringValue: 'PAYMENT FAILED' },
            note: { stringValue: cleanReason },
            updatedBy: { stringValue: user.firebaseUid },
          },
        },
        updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
      },
    ];

    if (typeof orderData.paymentId === 'string' && SAFE_ID_REGEX.test(orderData.paymentId)) {
      const payFieldPaths = ['status', 'signatureVerified', 'verifiedByServer', 'failureReason'];
      const payFields: Record<string, unknown> = {
        status: { stringValue: 'failed' },
        signatureVerified: { booleanValue: false },
        verifiedByServer: { booleanValue: false },
        failureReason: { stringValue: cleanReason },
      };
      if (typeof razorpayOrderId === 'string' && razorpayOrderId) {
        payFieldPaths.push('razorpayOrderId');
        payFields.razorpayOrderId = { stringValue: razorpayOrderId.slice(0, 128) };
      }
      if (typeof razorpayPaymentId === 'string' && razorpayPaymentId) {
        payFieldPaths.push('razorpayPaymentId');
        payFields.razorpayPaymentId = { stringValue: razorpayPaymentId.slice(0, 128) };
      }
      writes.push({
        currentDocument: { exists: true },
        updateMask: { fieldPaths: payFieldPaths },
        update: {
          name: `${docRoot}/payments/${orderData.paymentId}`,
          fields: payFields,
        },
        updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
      });
    }

    const commitRes = await fsCommitWrites(user.firebaseIdToken, writes);
    if (!commitRes.ok) {
      res.status(502).json({ ok: false, error: commitRes.error || 'Unable to record failed payment.' });
      return;
    }

    updateIdempotentStatus(orderId, { status: 'PAYMENT FAILED' });

    logSecurityEvent({
      req,
      category: 'payment',
      eventType: 'ORDER_PAYMENT_FAILED',
      severity: 'info',
      endpoint: '/api/payments/mark-failed',
      accountIdentifier: user.firebaseUid,
      actionTaken: `Recorded PAYMENT FAILED for order ${orderId}`,
      result: 'PAYMENT FAILED',
      suspicious: false,
      details: cleanReason,
    });

    res.json({ ok: true, orderId, status: 'PAYMENT FAILED' });
  });

  app.post('/api/payments/webhook', (req, res) => {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      res.status(503).json({ error: 'RAZORPAY_WEBHOOK_SECRET is not configured.' });
      return;
    }

    const signature = req.headers['x-razorpay-signature'];
    const eventId = req.headers['x-razorpay-event-id'];
    const rawBody = (req as express.Request & { rawBody?: Buffer }).rawBody;

    if (typeof signature !== 'string' || !rawBody) {
      res.status(400).json({ error: 'Missing webhook signature or payload.' });
      return;
    }

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    const expectedBuf = Buffer.from(expectedSignature, 'utf8');
    const providedBuf = Buffer.from(signature, 'utf8');

    if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
      logSecurityEvent({
        req,
        category: 'payment',
        eventType: 'RAZORPAY_WEBHOOK_INVALID_SIGNATURE',
        severity: 'critical',
        endpoint: '/api/payments/webhook',
        accountIdentifier: 'webhook',
        actionTaken: 'Rejected Razorpay webhook with invalid HMAC signature',
        result: 'Rejected (HTTP 400)',
        suspicious: true,
        notifyAdmin: true,
      });
      res.status(400).json({ error: 'Invalid Razorpay webhook signature.' });
      return;
    }

    if (typeof eventId === 'string' && hasProcessedWebhookEvent(eventId)) {
      res.json({ status: 'duplicate_ignored' });
      return;
    }

    if (typeof eventId === 'string') {
      markProcessedWebhookEvent(eventId);
    }

    const payload = req.body as {
      event?: string;
      payload?: {
        payment?: {
          entity?: {
            id?: string;
            order_id?: string;
            amount?: number;
            status?: string;
            notes?: { zaikoraOrderId?: string };
          };
        };
        refund?: {
          entity?: {
            id?: string;
            payment_id?: string;
            amount?: number;
            status?: string;
            notes?: { zaikoraOrderId?: string };
          };
        };
      };
    };

    const paymentEntity = payload.payload?.payment?.entity;
    const refundEntity = payload.payload?.refund?.entity;
    const zaikoraOrderId =
      paymentEntity?.notes?.zaikoraOrderId || refundEntity?.notes?.zaikoraOrderId;

    if (zaikoraOrderId && typeof paymentEntity?.amount === 'number') {
      const expectedOrder = getExpectedOrderPayment(zaikoraOrderId);
      if (expectedOrder && expectedOrder.amountRupees * 100 !== paymentEntity.amount) {
        logSecurityEvent({
          req,
          category: 'payment',
          eventType: 'WEBHOOK_AMOUNT_MISMATCH',
          severity: 'critical',
          endpoint: '/api/payments/webhook',
          accountIdentifier: zaikoraOrderId,
          actionTaken: `Webhook amount mismatch for ${zaikoraOrderId}: expected ${expectedOrder.amountRupees * 100}p, got ${paymentEntity.amount}p`,
          result: 'Flagged',
          suspicious: true,
          notifyAdmin: true,
        });
      }
    }

    // Sync local refund record if Razorpay webhook reports refund status updates
    if (refundEntity?.id) {
      const tracked = getRefundByOrderOrPayment(
        zaikoraOrderId || '',
        refundEntity.payment_id
      );
      if (tracked) {
        const mappedStatus =
          refundEntity.status === 'processed'
            ? 'Refund Completed'
            : refundEntity.status === 'failed'
              ? 'Refund Rejected'
              : 'Refund Processing';
        upsertRefundRecord({
          ...tracked,
          refundId: refundEntity.id,
          status: mappedStatus,
          razorpayStatus: refundEntity.status || tracked.razorpayStatus,
          updatedAt: new Date().toISOString(),
          completedAt:
            refundEntity.status === 'processed' ? new Date().toISOString() : tracked.completedAt,
        });
      }
    }

    recentWebhookLogs.unshift({
      eventId: typeof eventId === 'string' ? eventId : `evt_${Date.now()}`,
      event: payload.event || 'unknown',
      orderId: zaikoraOrderId,
      paymentId: paymentEntity?.id || refundEntity?.payment_id,
      status: refundEntity?.status || paymentEntity?.status || 'received',
      receivedAt: new Date().toISOString(),
    });
    if (recentWebhookLogs.length > 50) {
      recentWebhookLogs.pop();
    }

    logSecurityEvent({
      req,
      category: 'payment',
      eventType: 'RAZORPAY_WEBHOOK_PROCESSED',
      severity: 'info',
      endpoint: '/api/payments/webhook',
      accountIdentifier: zaikoraOrderId || paymentEntity?.id || refundEntity?.id || 'webhook',
      actionTaken: `Processed verified Razorpay webhook (${payload.event || 'unknown'})`,
      result: refundEntity?.status || paymentEntity?.status || 'ok',
      suspicious: false,
    });

    res.json({ status: 'ok' });
  });

  app.get('/api/payments/webhook-events', (req, res) => {
    const adminSession = verifyAdminRequest(req);
    if (!adminSession) {
      res.status(401).json({ error: 'Admin authorization required.' });
      return;
    }
    res.json({ events: recentWebhookLogs });
  });

  // --- Admin Order Approval, Rejection & Refund Sync ---

  async function verifyAdminDualAuth(
    req: express.Request,
    res: express.Response
  ): Promise<{ adminSession: { uid: string; sessionId: string }; fbToken: string } | null> {
    const adminSession = requireAdminOrLog(req, res);
    if (!adminSession) return null;

    const fbHeader = req.headers['x-firebase-auth'];
    const fbToken = typeof fbHeader === 'string' ? fbHeader.trim() : '';
    const fbUser = fbToken ? await verifyFirebaseBearerToken(fbToken) : null;
    if (!fbUser?.uid || fbUser.uid !== adminSession.uid) {
      res.status(401).json({ error: 'Valid Firebase admin authentication header is required.' });
      return null;
    }
    return { adminSession, fbToken };
  }

  app.post('/api/admin/orders/:orderId/accept', async (req, res) => {
    const auth = await verifyAdminDualAuth(req, res);
    if (!auth) return;

    const orderId = req.params.orderId;
    if (!SAFE_ID_REGEX.test(orderId)) {
      res.status(400).json({ accepted: false, error: 'Invalid orderId.' });
      return;
    }

    const orderDoc = await fsGetDocument(auth.fbToken, `orders/${encodeURIComponent(orderId)}`);
    if (!orderDoc.ok) {
      res.status(orderDoc.status === 404 ? 404 : 502).json({
        accepted: false,
        error: orderDoc.status === 404 ? 'Order not found.' : 'Unable to load order.',
      });
      return;
    }

    const order = orderDoc.data;
    if (order.adminRejected === true || order.status === 'REJECTED' || order.status === 'Cancelled' || order.status === 'REFUNDED' || order.status === 'REFUND PROCESSING') {
      res.status(409).json({ accepted: false, error: 'This order was already rejected or closed.' });
      return;
    }
    if (order.adminAccepted === true) {
      res.json({ accepted: true, alreadyAccepted: true, orderId, status: String(order.status || 'CONFIRMED') });
      return;
    }

    // Re-verify payment server-side before allowing kitchen acceptance
    if (order.paymentStatus !== 'successful' && order.paymentStatus !== 'verified') {
      res.status(400).json({
        accepted: false,
        error: `Cannot accept order while payment status is "${String(order.paymentStatus || 'pending')}". Payment must be verified first.`,
      });
      return;
    }

    const rzpPaymentId = typeof order.razorpayPaymentId === 'string' ? order.razorpayPaymentId.trim() : '';
    const rzpOrderId = typeof order.razorpayOrderId === 'string' ? order.razorpayOrderId.trim() : '';
    if (!rzpPaymentId) {
      res.status(400).json({
        accepted: false,
        error: 'Cannot accept order: Razorpay payment transaction reference is missing.',
      });
      return;
    }

    const processedPay = getProcessedPayment(rzpPaymentId);
    if (processedPay && processedPay.orderId !== orderId) {
      res.status(409).json({
        accepted: false,
        error: 'Payment transaction reference conflicts with another order.',
      });
      return;
    }

    const finalAmountRupees = Number(order.finalAmount || 0);
    const liveVerify = await verifyRazorpayPaymentViaApi({
      razorpayPaymentId: rzpPaymentId,
      expectedRazorpayOrderId: rzpOrderId || undefined,
      expectedAmountPaise: finalAmountRupees > 0 ? Math.round(finalAmountRupees * 100) : undefined,
    });
    if (liveVerify.ok === false) {
      res.status(liveVerify.status).json({
        accepted: false,
        error: `Payment verification check failed before acceptance: ${liveVerify.error}`,
      });
      return;
    }

    const { estimatedPrepMinutes, note } = (req.body || {}) as {
      estimatedPrepMinutes?: unknown;
      note?: unknown;
    };
    const prepMinutes =
      Number.isInteger(Number(estimatedPrepMinutes)) && Number(estimatedPrepMinutes) >= 5 && Number(estimatedPrepMinutes) <= 1440
        ? Number(estimatedPrepMinutes)
        : Number(order.estimatedPrepMinutes || 60);
    const acceptNote =
      typeof note === 'string' && note.trim()
        ? note.trim().slice(0, 240)
        : ORDER_ACCEPTED_NOTIFICATION_MESSAGE;

    const notificationDetail = 'Live in-website notification delivered.';

    const { projectId, databaseId, docRoot } = getFirestorePaths();
    const customerId = String(order.customerId || '');
    const needDefensiveDeduct = order.inventoryDeducted !== true;
    const aggregatedAcceptItems = new Map<
      string,
      { productId: string; productType: 'food' | 'cake'; qty: number; name: string }
    >();

    if (needDefensiveDeduct) {
      const itemsQuery = await runFirestoreQuery({
        projectId,
        databaseId,
        collectionId: 'items',
        parentRelativePath: `orders/${orderId}`,
        limit: 100,
        bearerToken: auth.fbToken,
      });
      if (itemsQuery.ok) {
        for (const item of itemsQuery.docs) {
          const productId = typeof item.productId === 'string' ? item.productId : '';
          const productType = item.productType === 'cake' ? 'cake' : 'food';
          const qty = typeof item.quantity === 'number' ? Math.round(item.quantity) : 0;
          const itemName = typeof item.name === 'string' && item.name ? item.name : productId;
          if (!productId || qty < 1) continue;
          const key = `${productType}:${productId}`;
          const prev = aggregatedAcceptItems.get(key);
          aggregatedAcceptItems.set(key, {
            productId,
            productType,
            qty: (prev?.qty || 0) + qty,
            name: prev?.name || itemName,
          });
        }
      }
    }

    let acceptCommitOk = false;
    let acceptCommitErr = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      const freshOrderDoc =
        attempt === 0
          ? orderDoc
          : await fsGetDocument(auth.fbToken, `orders/${encodeURIComponent(orderId)}`);
      if (!freshOrderDoc.ok) {
        acceptCommitErr = freshOrderDoc.error || 'Unable to load order.';
        break;
      }
      const curOrder = freshOrderDoc.data;
      if (curOrder.adminAccepted === true) {
        res.json({
          accepted: true,
          alreadyAccepted: true,
          orderId,
          status: String(curOrder.status || 'CONFIRMED'),
        });
        return;
      }

      const histId = `hist_confirmed_${Date.now() + attempt}`;
      const notifId = `notif_confirmed_${Date.now() + attempt}`;
      const orderMask = ['status', 'adminAccepted', 'adminAcceptedBy', 'estimatedPrepMinutes'];
      const orderFields: Record<string, unknown> = {
        status: { stringValue: 'CONFIRMED' },
        adminAccepted: { booleanValue: true },
        adminAcceptedBy: { stringValue: auth.adminSession.uid },
        estimatedPrepMinutes: { integerValue: String(prepMinutes) },
      };
      const orderTransforms: Array<Record<string, unknown>> = [
        { fieldPath: 'adminAcceptedAt', setToServerValue: 'REQUEST_TIME' },
        { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
      ];

      const extraInventoryWrites: Array<Record<string, unknown>> = [];
      if (curOrder.inventoryDeducted !== true && aggregatedAcceptItems.size > 0) {
        const entries = Array.from(aggregatedAcceptItems.values());
        const menuDocs = await Promise.all(
          entries.map((entry) =>
            fsGetDocument(
              auth.fbToken,
              `${entry.productType === 'cake' ? 'cake_menu' : 'food_menu'}/${encodeURIComponent(entry.productId)}`
            )
          )
        );
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          const menuDoc = menuDocs[i];
          if (!menuDoc.ok) continue;
          const norm = normalizeInventoryFields(menuDoc.data, {
            isCake: entry.productType === 'cake',
          });
          if (norm.stockMode === 'limited') {
            if (norm.stockQuantity < entry.qty) {
              res.status(409).json({
                accepted: false,
                error: `Insufficient remaining stock for "${entry.name}" (${norm.stockQuantity} left, order needs ${entry.qty}). Reject order or restock first.`,
              });
              return;
            }
            const newStock = Math.max(0, norm.stockQuantity - entry.qty);
            const histStockId = `${orderId}_${entry.productId}`.slice(0, 128);
            const col = entry.productType === 'cake' ? 'cake_menu' : 'food_menu';
            extraInventoryWrites.push(
              {
                currentDocument: menuDoc.updateTime
                  ? { updateTime: menuDoc.updateTime }
                  : { exists: true },
                updateMask: {
                  fieldPaths: [
                    'stockQuantity',
                    'soldOut',
                    'lastStockUpdatedBy',
                    'lastStockOrderId',
                  ],
                },
                update: {
                  name: `${docRoot}/${col}/${entry.productId}`,
                  fields: {
                    stockQuantity: { integerValue: String(newStock) },
                    soldOut: { booleanValue: newStock === 0 },
                    lastStockUpdatedBy: { stringValue: auth.adminSession.uid },
                    lastStockOrderId: { stringValue: orderId },
                  },
                },
                updateTransforms: [
                  { fieldPath: 'lastStockUpdatedAt', setToServerValue: 'REQUEST_TIME' },
                  { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
                ],
              },
              {
                currentDocument: { exists: false },
                update: {
                  name: `${docRoot}/stock_history/${histStockId}`,
                  fields: {
                    historyId: { stringValue: histStockId },
                    productId: { stringValue: entry.productId },
                    productName: { stringValue: entry.name.slice(0, 120) },
                    productType: { stringValue: entry.productType },
                    actionType: { stringValue: 'order_deduction' },
                    previousStock: { integerValue: String(norm.stockQuantity) },
                    changeDelta: { integerValue: String(-entry.qty) },
                    newStock: { integerValue: String(newStock) },
                    stockUnit: { stringValue: norm.stockUnit },
                    stockMode: { stringValue: 'limited' },
                    orderId: { stringValue: orderId },
                    actorUid: { stringValue: auth.adminSession.uid },
                    reason: { stringValue: `Order ${orderId} admin-accept stock deduction`.slice(0, 240) },
                  },
                },
                updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
              }
            );
          }
        }
        orderMask.push('inventoryDeducted', 'inventoryRestored');
        orderFields.inventoryDeducted = { booleanValue: true };
        orderFields.inventoryRestored = { booleanValue: false };
        orderTransforms.push({ fieldPath: 'inventoryDeductedAt', setToServerValue: 'REQUEST_TIME' });
      }

      const writes: Array<Record<string, unknown>> = [
        {
          currentDocument: freshOrderDoc.updateTime
            ? { updateTime: freshOrderDoc.updateTime }
            : { exists: true },
          updateMask: { fieldPaths: orderMask },
          update: {
            name: `${docRoot}/orders/${orderId}`,
            fields: orderFields,
          },
          updateTransforms: orderTransforms,
        },
        {
          currentDocument: { exists: false },
          update: {
            name: `${docRoot}/orders/${orderId}/status_history/${histId}`,
            fields: {
              id: { stringValue: histId },
              orderId: { stringValue: orderId },
              customerId: { stringValue: customerId },
              status: { stringValue: 'CONFIRMED' },
              note: { stringValue: acceptNote },
              updatedBy: { stringValue: auth.adminSession.uid },
            },
          },
          updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
        },
        ...extraInventoryWrites,
      ];

      if (customerId) {
        writes.push({
          currentDocument: { exists: false },
          update: {
            name: `${docRoot}/customers/${customerId}/notifications/${notifId}`,
            fields: {
              id: { stringValue: notifId },
              customerId: { stringValue: customerId },
              orderId: { stringValue: orderId },
              title: { stringValue: 'Order Confirmed by ZAIKORA KITCHENS' },
              message: { stringValue: ORDER_ACCEPTED_NOTIFICATION_MESSAGE },
              smsSent: { booleanValue: false },
              smsStatusDetail: { stringValue: notificationDetail },
              read: { booleanValue: false },
            },
          },
          updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
        });
      }

      const commitRes = await fsCommitWrites(auth.fbToken, writes);
      if (commitRes.ok) {
        acceptCommitOk = true;
        break;
      }
      if ((commitRes.status === 409 || commitRes.status === 412) && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 45 + attempt * 50));
        continue;
      }
      acceptCommitErr = commitRes.error || 'commit error';
      break;
    }

    if (!acceptCommitOk) {
      res.status(502).json({
        accepted: false,
        error: `Unable to confirm order in Firestore: ${acceptCommitErr || 'commit error'}`,
      });
      return;
    }

    updateIdempotentStatus(orderId, { status: 'CONFIRMED' });
    logAdminAuditAction({
      req,
      adminUid: auth.adminSession.uid,
      action: 'ACCEPT_ORDER',
      target: orderId,
      details: `Confirmed verified order ${orderId} (prep ${prepMinutes}m, payment ${rzpPaymentId})`,
    });

    res.json({
      accepted: true,
      orderId,
      status: 'CONFIRMED',
      estimatedPrepMinutes: prepMinutes,
    });
  });

  app.post('/api/admin/orders/:orderId/reject', async (req, res) => {
    const auth = await verifyAdminDualAuth(req, res);
    if (!auth) return;

    const orderId = req.params.orderId;
    if (!SAFE_ID_REGEX.test(orderId)) {
      res.status(400).json({ rejected: false, error: 'Invalid orderId.' });
      return;
    }

    const { reason } = (req.body || {}) as { reason?: unknown };
    const cleanReason = typeof reason === 'string' ? reason.trim().slice(0, 295) : '';
    if (cleanReason.length < 3) {
      res.status(400).json({
        rejected: false,
        error: 'Please enter a rejection reason (at least 3 characters) before rejecting this order.',
      });
      return;
    }

    const orderDoc = await fsGetDocument(auth.fbToken, `orders/${encodeURIComponent(orderId)}`);
    if (!orderDoc.ok) {
      res.status(orderDoc.status === 404 ? 404 : 502).json({
        rejected: false,
        error: orderDoc.status === 404 ? 'Order not found.' : 'Unable to load order.',
      });
      return;
    }

    const order = orderDoc.data;
    if (
      order.adminRejected === true ||
      order.status === 'REJECTED' ||
      order.status === 'REFUND PROCESSING' ||
      order.status === 'REFUNDED' ||
      order.status === 'DELIVERED' ||
      order.status === 'COLLECTED' ||
      order.status === 'Delivered / Collected' ||
      order.status === 'Cancelled'
    ) {
      res.status(409).json({
        rejected: false,
        error: `Order is already in terminal state "${String(order.status || 'rejected')}".`,
      });
      return;
    }

    const rzpPaymentId = typeof order.razorpayPaymentId === 'string' ? order.razorpayPaymentId.trim() : '';
    const existingRefund = getRefundByOrderOrPayment(orderId, rzpPaymentId || undefined);
    if (existingRefund) {
      res.status(409).json({
        rejected: false,
        error: `A refund (${existingRefund.refundId}) has already been initiated for this order/payment.`,
      });
      return;
    }

    const isPaid =
      (order.paymentStatus === 'successful' || order.paymentStatus === 'verified') &&
      Boolean(rzpPaymentId);

    let finalOrderStatus: 'REJECTED' | 'REFUND PROCESSING' | 'REFUNDED' = 'REJECTED';
    let finalPaymentStatus: string = String(order.paymentStatus || 'failed');
    let refundId = '';
    let refundStatus: 'Refund Processing' | 'Refund Completed' | undefined;
    let refundAmount = 0;

    if (isPaid) {
      const amountRupees = Math.max(1, Math.round(Number(order.finalAmount || 0)));
      const refundRes = await initiateRazorpayFullRefund({
        razorpayPaymentId: rzpPaymentId,
        amountRupees,
        orderId,
        reason: cleanReason,
        adminUid: auth.adminSession.uid,
      });

      if (refundRes.ok === false) {
        res.status(refundRes.status).json({
          rejected: false,
          error: refundRes.error,
        });
        return;
      }

      refundId = refundRes.refundId;
      refundStatus = refundRes.refundStatus;
      refundAmount = refundRes.amountRupees;
      finalOrderStatus = refundRes.orderStatus;
      finalPaymentStatus = refundRes.paymentStatus;

      const nowIso = new Date().toISOString();
      upsertRefundRecord({
        orderId,
        refundId: refundRes.refundId,
        razorpayPaymentId: rzpPaymentId,
        amountRupees: refundRes.amountRupees,
        status: refundRes.refundStatus,
        razorpayStatus: refundRes.razorpayRefundStatus,
        reason: cleanReason,
        adminUid: auth.adminSession.uid,
        createdAt: nowIso,
        updatedAt: nowIso,
        completedAt:
          refundRes.refundStatus === 'Refund Completed' ? nowIso : undefined,
      });
    }

    const notificationDetail = 'Live in-website notification delivered.';

    const { projectId, databaseId, docRoot } = getFirestorePaths();
    const customerId = String(order.customerId || '');
    const needStockRestore =
      order.inventoryDeducted === true && order.inventoryRestored !== true;

    const aggregatedRestoreItems = new Map<
      string,
      { productId: string; productType: 'food' | 'cake'; qty: number; name: string }
    >();

    if (needStockRestore) {
      const itemsQuery = await runFirestoreQuery({
        projectId,
        databaseId,
        collectionId: 'items',
        parentRelativePath: `orders/${orderId}`,
        limit: 100,
        bearerToken: auth.fbToken,
      });
      if (itemsQuery.ok) {
        for (const item of itemsQuery.docs) {
          const productId = typeof item.productId === 'string' ? item.productId : '';
          const productType = item.productType === 'cake' ? 'cake' : 'food';
          const qty = typeof item.quantity === 'number' ? Math.round(item.quantity) : 0;
          const itemName = typeof item.name === 'string' && item.name ? item.name : productId;
          if (!productId || qty < 1) continue;
          const key = `${productType}:${productId}`;
          const prev = aggregatedRestoreItems.get(key);
          aggregatedRestoreItems.set(key, {
            productId,
            productType,
            qty: (prev?.qty || 0) + qty,
            name: prev?.name || itemName,
          });
        }
      }
    }

    let rejectCommitOk = false;
    let rejectCommitErr = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      const freshOrderDoc =
        attempt === 0
          ? orderDoc
          : await fsGetDocument(auth.fbToken, `orders/${encodeURIComponent(orderId)}`);
      if (!freshOrderDoc.ok) {
        rejectCommitErr = freshOrderDoc.error || 'Unable to reload order.';
        break;
      }
      const curOrder = freshOrderDoc.data;
      const shouldRestoreNow =
        curOrder.inventoryDeducted === true && curOrder.inventoryRestored !== true;

      const orderMask = ['status', 'adminAccepted', 'adminRejected', 'adminRejectedBy', 'rejectionReason'];
      const orderFields: Record<string, unknown> = {
        status: { stringValue: finalOrderStatus },
        adminAccepted: { booleanValue: false },
        adminRejected: { booleanValue: true },
        adminRejectedBy: { stringValue: auth.adminSession.uid },
        rejectionReason: { stringValue: cleanReason },
      };
      const orderTransforms: Array<Record<string, unknown>> = [
        { fieldPath: 'adminRejectedAt', setToServerValue: 'REQUEST_TIME' },
        { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
      ];

      if (isPaid && refundId && refundStatus) {
        orderMask.push('paymentStatus', 'refundId', 'refundStatus', 'refundAmount');
        orderFields.paymentStatus = { stringValue: finalPaymentStatus };
        orderFields.refundId = { stringValue: refundId };
        orderFields.refundStatus = { stringValue: refundStatus };
        orderFields.refundAmount = { integerValue: String(refundAmount) };
        orderTransforms.push({ fieldPath: 'refundInitiatedAt', setToServerValue: 'REQUEST_TIME' });
        if (finalOrderStatus === 'REFUNDED') {
          orderTransforms.push({ fieldPath: 'refundCompletedAt', setToServerValue: 'REQUEST_TIME' });
        }
      }

      const restoreWrites: Array<Record<string, unknown>> = [];
      if (shouldRestoreNow) {
        orderMask.push('inventoryRestored');
        orderFields.inventoryRestored = { booleanValue: true };
        orderTransforms.push({ fieldPath: 'inventoryRestoredAt', setToServerValue: 'REQUEST_TIME' });

        if (aggregatedRestoreItems.size > 0) {
          const entries = Array.from(aggregatedRestoreItems.values());
          const menuDocs = await Promise.all(
            entries.map((entry) =>
              fsGetDocument(
                auth.fbToken,
                `${entry.productType === 'cake' ? 'cake_menu' : 'food_menu'}/${encodeURIComponent(entry.productId)}`
              )
            )
          );
          for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const menuDoc = menuDocs[i];
            if (!menuDoc.ok) continue;
            const norm = normalizeInventoryFields(menuDoc.data, {
              isCake: entry.productType === 'cake',
            });
            if (norm.stockMode === 'limited') {
              const displayName =
                typeof menuDoc.data.name === 'string' && menuDoc.data.name
                  ? menuDoc.data.name
                  : entry.name;
              const newStock = norm.stockQuantity + entry.qty;
              const col = entry.productType === 'cake' ? 'cake_menu' : 'food_menu';
              const histStockId = `restore_${orderId}_${entry.productId}`.slice(0, 128);
              restoreWrites.push(
                {
                  currentDocument: menuDoc.updateTime
                    ? { updateTime: menuDoc.updateTime }
                    : { exists: true },
                  updateMask: {
                    fieldPaths: [
                      'stockQuantity',
                      'soldOut',
                      'lastStockUpdatedBy',
                      'lastStockOrderId',
                    ],
                  },
                  update: {
                    name: `${docRoot}/${col}/${entry.productId}`,
                    fields: {
                      stockQuantity: { integerValue: String(newStock) },
                      soldOut: { booleanValue: newStock === 0 },
                      lastStockUpdatedBy: { stringValue: auth.adminSession.uid },
                      lastStockOrderId: { stringValue: orderId },
                    },
                  },
                  updateTransforms: [
                    { fieldPath: 'lastStockUpdatedAt', setToServerValue: 'REQUEST_TIME' },
                    { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
                  ],
                },
                {
                  currentDocument: { exists: false },
                  update: {
                    name: `${docRoot}/stock_history/${histStockId}`,
                    fields: {
                      historyId: { stringValue: histStockId },
                      productId: { stringValue: entry.productId },
                      productName: { stringValue: displayName.slice(0, 120) },
                      productType: { stringValue: entry.productType },
                      actionType: { stringValue: 'order_restore' },
                      previousStock: { integerValue: String(norm.stockQuantity) },
                      changeDelta: { integerValue: String(entry.qty) },
                      newStock: { integerValue: String(newStock) },
                      stockUnit: { stringValue: norm.stockUnit },
                      stockMode: { stringValue: 'limited' },
                      orderId: { stringValue: orderId },
                      actorUid: { stringValue: auth.adminSession.uid },
                      reason: {
                        stringValue: `Restored stock from rejected order ${orderId}: ${cleanReason}`.slice(
                          0,
                          240
                        ),
                      },
                    },
                  },
                  updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
                }
              );
            }
          }
        }
      }

      const tsBase = Date.now() + attempt * 10;
      const histRejectedId = `hist_rejected_${tsBase}`;
      const writes: Array<Record<string, unknown>> = [
        {
          currentDocument: freshOrderDoc.updateTime
            ? { updateTime: freshOrderDoc.updateTime }
            : { exists: true },
          updateMask: { fieldPaths: orderMask },
          update: {
            name: `${docRoot}/orders/${orderId}`,
            fields: orderFields,
          },
          updateTransforms: orderTransforms,
        },
        {
          currentDocument: { exists: false },
          update: {
            name: `${docRoot}/orders/${orderId}/status_history/${histRejectedId}`,
            fields: {
              id: { stringValue: histRejectedId },
              orderId: { stringValue: orderId },
              customerId: { stringValue: customerId },
              status: { stringValue: 'REJECTED' },
              note: { stringValue: `Order not accepted: ${cleanReason}`.slice(0, 240) },
              updatedBy: { stringValue: auth.adminSession.uid },
            },
          },
          updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
        },
        ...restoreWrites,
      ];

      if (isPaid && refundId && refundStatus) {
        const histRefundId = `hist_refund_${tsBase + 1}`;
        writes.push({
          currentDocument: { exists: false },
          update: {
            name: `${docRoot}/orders/${orderId}/status_history/${histRefundId}`,
            fields: {
              id: { stringValue: histRefundId },
              orderId: { stringValue: orderId },
              customerId: { stringValue: customerId },
              status: { stringValue: finalOrderStatus },
              note: {
                stringValue: `Full refund (₹${refundAmount}) status: ${refundStatus}. Ref: ${refundId}`.slice(0, 240),
              },
              updatedBy: { stringValue: auth.adminSession.uid },
            },
          },
          updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
        });

        if (typeof order.paymentId === 'string' && SAFE_ID_REGEX.test(order.paymentId)) {
          writes.push({
            currentDocument: { exists: true },
            updateMask: { fieldPaths: ['status', 'refundId', 'refundStatus', 'refundAmount'] },
            update: {
              name: `${docRoot}/payments/${order.paymentId}`,
              fields: {
                status: { stringValue: finalPaymentStatus },
                refundId: { stringValue: refundId },
                refundStatus: { stringValue: refundStatus },
                refundAmount: { integerValue: String(refundAmount) },
              },
            },
            updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
          });
        }
      }

      if (customerId) {
        const notifId = `notif_rejected_${tsBase + 2}`;
        const notifMessage = isPaid
          ? `${ORDER_REJECTED_NOTIFICATION_MESSAGE} Reason: ${cleanReason} Refund Ref: ${refundId} (Status: ${refundStatus}).`.slice(
              0,
              495
            )
          : `Your ZAIKORA KITCHENS order request (${orderId}) could not be accepted. Reason: ${cleanReason}`.slice(
              0,
              495
            );
        writes.push({
          currentDocument: { exists: false },
          update: {
            name: `${docRoot}/customers/${customerId}/notifications/${notifId}`,
            fields: {
              id: { stringValue: notifId },
              customerId: { stringValue: customerId },
              orderId: { stringValue: orderId },
              title: { stringValue: isPaid ? 'Order Not Accepted — Refund Initiated' : 'Order Not Accepted' },
              message: { stringValue: notifMessage },
              smsSent: { booleanValue: false },
              smsStatusDetail: { stringValue: notificationDetail },
              read: { booleanValue: false },
            },
          },
          updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
        });
      }

      const commitRes = await fsCommitWrites(auth.fbToken, writes);
      if (commitRes.ok) {
        rejectCommitOk = true;
        break;
      }
      if ((commitRes.status === 409 || commitRes.status === 412) && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 45 + attempt * 50));
        continue;
      }
      rejectCommitErr = commitRes.error || 'commit error';
      break;
    }

    if (!rejectCommitOk) {
      res.status(502).json({
        rejected: false,
        error: `Unable to update rejected order in Firestore: ${rejectCommitErr || 'commit error'}`,
      });
      return;
    }

    updateIdempotentStatus(orderId, { status: finalOrderStatus });
    logAdminAuditAction({
      req,
      adminUid: auth.adminSession.uid,
      action: 'REJECT_ORDER',
      target: orderId,
      details: isPaid
        ? `Rejected paid order ${orderId}; Razorpay refund ${refundId} (${refundStatus}, ₹${refundAmount}). Reason: ${cleanReason}`
        : `Rejected unpaid order ${orderId}. Reason: ${cleanReason}`,
    });

    res.json({
      rejected: true,
      orderId,
      status: finalOrderStatus,
      rejectionReason: cleanReason,
      refundId: refundId || null,
      refundStatus: refundStatus || null,
      refundAmount: refundAmount || 0,
    });
  });

  app.post('/api/admin/orders/:orderId/refund-sync', async (req, res) => {
    const auth = await verifyAdminDualAuth(req, res);
    if (!auth) return;

    const orderId = req.params.orderId;
    if (!SAFE_ID_REGEX.test(orderId)) {
      res.status(400).json({ error: 'Invalid orderId.' });
      return;
    }

    const orderDoc = await fsGetDocument(auth.fbToken, `orders/${encodeURIComponent(orderId)}`);
    if (!orderDoc.ok) {
      res.status(orderDoc.status).json({ error: 'Order not found.' });
      return;
    }

    const order = orderDoc.data;
    const refundId = typeof order.refundId === 'string' ? order.refundId : '';
    if (!refundId) {
      res.status(400).json({ error: 'No Razorpay refund ID recorded on this order yet.' });
      return;
    }

    const rzpRefund = await fetchRazorpayRefundStatus(refundId);
    if (rzpRefund.ok === false) {
      res.status(rzpRefund.status).json({ error: rzpRefund.error });
      return;
    }

    const isProcessed = rzpRefund.status === 'processed';
    const isFailed = rzpRefund.status === 'failed';
    const nextRefundStatus = isProcessed
      ? 'Refund Completed'
      : isFailed
        ? 'Refund Rejected'
        : 'Refund Processing';
    const nextOrderStatus = isProcessed ? 'REFUNDED' : isFailed ? 'REJECTED' : 'REFUND PROCESSING';
    const nextPaymentStatus = isProcessed ? 'refunded' : 'refund_processing';

    const { docRoot } = getFirestorePaths();
    const orderTransforms: Array<Record<string, unknown>> = [
      { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
    ];
    if (isProcessed) {
      orderTransforms.push({ fieldPath: 'refundCompletedAt', setToServerValue: 'REQUEST_TIME' });
    }

    const writes: Array<Record<string, unknown>> = [
      {
        currentDocument: { exists: true },
        updateMask: { fieldPaths: ['status', 'paymentStatus', 'refundStatus'] },
        update: {
          name: `${docRoot}/orders/${orderId}`,
          fields: {
            status: { stringValue: nextOrderStatus },
            paymentStatus: { stringValue: nextPaymentStatus },
            refundStatus: { stringValue: nextRefundStatus },
          },
        },
        updateTransforms: orderTransforms,
      },
    ];

    if (typeof order.paymentId === 'string' && SAFE_ID_REGEX.test(order.paymentId)) {
      writes.push({
        currentDocument: { exists: true },
        updateMask: { fieldPaths: ['status', 'refundStatus'] },
        update: {
          name: `${docRoot}/payments/${order.paymentId}`,
          fields: {
            status: { stringValue: nextPaymentStatus },
            refundStatus: { stringValue: nextRefundStatus },
          },
        },
        updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
      });
    }

    if (isProcessed && order.status !== 'REFUNDED') {
      const histId = `hist_refunded_${Date.now()}`;
      writes.push({
        currentDocument: { exists: false },
        update: {
          name: `${docRoot}/orders/${orderId}/status_history/${histId}`,
          fields: {
            id: { stringValue: histId },
            orderId: { stringValue: orderId },
            customerId: { stringValue: String(order.customerId || '') },
            status: { stringValue: 'REFUNDED' },
            note: { stringValue: `Razorpay confirmed refund ${refundId} as processed.` },
            updatedBy: { stringValue: auth.adminSession.uid },
          },
        },
        updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
      });
    }

    const commitRes = await fsCommitWrites(auth.fbToken, writes);
    if (!commitRes.ok) {
      res.status(502).json({ error: commitRes.error || 'Unable to sync refund status.' });
      return;
    }

    const tracked = getRefundByOrderOrPayment(orderId);
    if (tracked) {
      const nowIso = new Date().toISOString();
      upsertRefundRecord({
        ...tracked,
        status: nextRefundStatus,
        razorpayStatus: rzpRefund.status,
        updatedAt: nowIso,
        completedAt: isProcessed ? nowIso : tracked.completedAt,
      });
    }

    res.json({
      ok: true,
      orderId,
      refundId,
      razorpayStatus: rzpRefund.status,
      refundStatus: nextRefundStatus,
      orderStatus: nextOrderStatus,
    });
  });

  // --- Admin Security Centre & Protected Upload / Audit APIs ---

  function requireAdminOrLog(req: express.Request, res: express.Response): { uid: string; sessionId: string } | null {
    const adminSession = verifyAdminRequest(req);
    if (!adminSession) {
      logSecurityEvent({
        req,
        category: 'admin',
        eventType: 'UNAUTHORISED_ADMIN_API_ACCESS',
        severity: 'warning',
        endpoint: req.originalUrl,
        actionTaken: `Blocked unauthenticated access to protected admin endpoint ${req.path}`,
        result: 'Rejected (HTTP 401)',
        suspicious: true,
      });
      res.status(401).json({ error: 'Authorised admin session is required.' });
      return null;
    }
    return adminSession;
  }

  app.post('/api/admin/upload-authorize', (req, res) => {
    const adminSession = requireAdminOrLog(req, res);
    if (!adminSession) return;

    const { filename, mimeType, sizeBytes, magicBytesBase64 } = req.body as {
      filename?: unknown;
      mimeType?: unknown;
      sizeBytes?: unknown;
      magicBytesBase64?: unknown;
    };

    const result = validateAdminMediaUploadPayload({
      filename,
      mimeType,
      sizeBytes,
      magicBytesBase64,
    });

    if (result.ok === false) {
      logSecurityEvent({
        req,
        category: 'upload',
        eventType: 'MALICIOUS_OR_INVALID_UPLOAD_BLOCKED',
        severity: 'critical',
        endpoint: '/api/admin/upload-authorize',
        accountIdentifier: adminSession.uid,
        actionTaken: `Blocked disallowed file upload "${String(filename || 'unknown').slice(0, 80)}"`,
        result: 'Rejected (HTTP 400)',
        suspicious: true,
        notifyAdmin: true,
        details: result.error,
      });
      res.status(400).json({ authorized: false, error: result.error });
      return;
    }

    logSecurityEvent({
      req,
      category: 'upload',
      eventType: result.mediaType === 'video' ? 'VIDEO_UPLOAD_AUTHORIZED' : 'IMAGE_UPLOAD_AUTHORIZED',
      severity: 'info',
      endpoint: '/api/admin/upload-authorize',
      accountIdentifier: adminSession.uid,
      actionTaken: `Verified ${result.mediaType} signature (${result.safeExtension}, ${Number(sizeBytes)} bytes)`,
      result: 'Authorized',
      suspicious: false,
    });

    res.json({ authorized: true, safeExtension: result.safeExtension, mediaType: result.mediaType });
  });

  app.post('/api/media/report-error', (req, res) => {
    const { url, mediaType, label, stage } = (req.body || {}) as {
      url?: unknown;
      mediaType?: unknown;
      label?: unknown;
      stage?: unknown;
    };
    const safeUrl = typeof url === 'string' ? url.slice(0, 300) : 'unknown';
    const safeType = mediaType === 'video' ? 'video' : 'image';
    const safeLabel = typeof label === 'string' ? label.slice(0, 120) : 'Media asset';
    const safeStage = typeof stage === 'string' ? stage.slice(0, 60) : 'playback';
    logSecurityEvent({
      req,
      category: 'api',
      eventType: 'MEDIA_LOAD_ERROR',
      severity: 'warning',
      endpoint: '/api/media/report-error',
      actionTaken: `${safeType.toUpperCase()} load failed (${safeStage}): ${safeLabel}`,
      result: 'Fallback displayed cleanly',
      suspicious: false,
      details: safeUrl,
    });
    res.json({ ok: true });
  });

  app.get('/api/security/overview', (req, res) => {
    const adminSession = requireAdminOrLog(req, res);
    if (!adminSession) return;

    const overview = getSecurityOverview({
      category: typeof req.query.category === 'string' ? req.query.category : undefined,
      severity: typeof req.query.severity === 'string' ? req.query.severity : undefined,
      from: typeof req.query.from === 'string' ? req.query.from : undefined,
      to: typeof req.query.to === 'string' ? req.query.to : undefined,
    });
    res.json(overview);
  });

  app.post('/api/security/lockouts/unblock', (req, res) => {
    const adminSession = requireAdminOrLog(req, res);
    if (!adminSession) return;

    const { lockoutId } = req.body as { lockoutId?: unknown };
    if (typeof lockoutId !== 'string' || !lockoutId) {
      res.status(400).json({ error: 'lockoutId is required.' });
      return;
    }
    const ok = unblockAdminLockoutById(lockoutId, adminSession.uid, req);
    if (!ok) {
      res.status(404).json({ error: 'Lockout record not found.' });
      return;
    }
    res.json({ ok: true });
  });

  app.post('/api/security/sessions/revoke', (req, res) => {
    const adminSession = requireAdminOrLog(req, res);
    if (!adminSession) return;

    const { sessionId } = req.body as { sessionId?: unknown };
    if (typeof sessionId !== 'string' || !sessionId) {
      res.status(400).json({ error: 'sessionId is required.' });
      return;
    }
    const ok = revokeAdminSessionById(sessionId, adminSession.uid, req);
    if (!ok) {
      res.status(404).json({ error: 'Session not found.' });
      return;
    }
    res.json({ ok: true, revokedSelf: sessionId === adminSession.sessionId });
  });

  app.post('/api/security/notifications/read', (req, res) => {
    const adminSession = requireAdminOrLog(req, res);
    if (!adminSession) return;

    const { notificationId } = (req.body || {}) as { notificationId?: unknown };
    const count = markNotificationsRead(
      adminSession.uid,
      typeof notificationId === 'string' ? notificationId : undefined
    );
    res.json({ ok: true, markedRead: count });
  });

  app.post('/api/security/audit-action', (req, res) => {
    const adminSession = requireAdminOrLog(req, res);
    if (!adminSession) return;

    const { action, target, details } = req.body as {
      action?: unknown;
      target?: unknown;
      details?: unknown;
    };
    if (typeof action !== 'string' || typeof target !== 'string') {
      res.status(400).json({ error: 'action and target are required.' });
      return;
    }
    const cleanDetails = typeof details === 'string' ? details : '';
    const entry = logAdminAuditAction({
      req,
      adminUid: adminSession.uid,
      action,
      target,
      details: cleanDetails,
    });
    logSecurityEvent({
      req,
      category: 'database',
      eventType: action.toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 60),
      severity: 'info',
      endpoint: '/api/security/audit-action',
      accountIdentifier: adminSession.uid,
      actionTaken: `${action} on ${target}`,
      result: 'Recorded',
      suspicious: false,
      details: cleanDetails,
    });
    res.json({ ok: true, entry });
  });

  app.get('/api/security/incidents/export', (req, res) => {
    const adminSession = requireAdminOrLog(req, res);
    if (!adminSession) return;

    const format = req.query.format === 'csv' ? 'csv' : 'json';
    const exported = buildIncidentEvidenceExport(format, {
      category: typeof req.query.category === 'string' ? req.query.category : undefined,
      severity: typeof req.query.severity === 'string' ? req.query.severity : undefined,
      from: typeof req.query.from === 'string' ? req.query.from : undefined,
      to: typeof req.query.to === 'string' ? req.query.to : undefined,
    });

    logAdminAuditAction({
      req,
      adminUid: adminSession.uid,
      action: 'EXPORT_SECURITY_EVIDENCE',
      target: exported.filename,
      details: `Exported ${format.toUpperCase()} security incident report`,
    });

    res.setHeader('Content-Type', exported.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
    res.send(exported.body);
  });

  app.post('/api/security/database-audit', async (req, res) => {
    const adminSession = requireAdminOrLog(req, res);
    if (!adminSession) return;

    const projectId = firebaseConfig.projectId;
    const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';
    const authHeader = req.headers['x-firebase-auth'];
    const idToken = typeof authHeader === 'string' ? authHeader.trim() : '';

    let firestoreReachable = false;
    let adminsDocsCount = 0;
    let securityLogsCount = 0;

    if (projectId && idToken) {
      try {
        const [adminsQuery, logsQuery] = await Promise.all([
          runFirestoreQuery({
            projectId,
            databaseId,
            collectionId: 'admins',
            limit: 50,
            bearerToken: idToken,
          }),
          runFirestoreQuery({
            projectId,
            databaseId,
            collectionId: 'security_logs',
            limit: 50,
            bearerToken: idToken,
          }),
        ]);
        firestoreReachable = adminsQuery.ok || logsQuery.ok;
        if (adminsQuery.ok) {
          adminsDocsCount = adminsQuery.docs.length;
        }
        if (logsQuery.ok) {
          securityLogsCount = logsQuery.docs.length;
        }
      } catch {
        firestoreReachable = false;
      }
    }

    logAdminAuditAction({
      req,
      adminUid: adminSession.uid,
      action: 'RUN_DATABASE_AUDIT',
      target: 'firestore',
      details: `Database audit run (reachable=${firestoreReachable}, admins=${adminsDocsCount}, securityLogs=${securityLogsCount})`,
    });

    res.json({
      checkedAt: new Date().toISOString(),
      firestoreProjectId: projectId || null,
      firestoreDatabaseId: databaseId,
      firestoreReachable,
      adminsDocsCount,
      securityLogsCount,
      rulesSummary: [
        'Default-deny catch-all rule enabled across all Firestore collections.',
        'Customer data (orders, payments, addresses, notifications) scoped strictly to owner UID or active admin.',
        'Immutable audit trails: security_logs and status_history forbid client updates & deletions.',
        'Storage rules enforce admin-only uploads for food_menu/, cake_menu/, media_library/, and site_media/ (safe images <= 10 MB & videos <= 50 MB).',
      ],
    });
  });

  // --- Order-Aware AI Customer Support (Order Tracking Page Only) ---

  type FirestoreVal = {
    stringValue?: string;
    integerValue?: string;
    doubleValue?: number;
    booleanValue?: boolean;
    timestampValue?: string;
  };

  function unwrapFsFields(fields?: Record<string, FirestoreVal>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (!fields) return out;
    for (const [k, v] of Object.entries(fields)) {
      if (v.stringValue !== undefined) out[k] = v.stringValue;
      else if (v.integerValue !== undefined) out[k] = Number(v.integerValue);
      else if (v.doubleValue !== undefined) out[k] = Number(v.doubleValue);
      else if (v.booleanValue !== undefined) out[k] = v.booleanValue;
      else if (v.timestampValue !== undefined) out[k] = v.timestampValue;
    }
    return out;
  }

  app.post('/api/support/chat', async (req, res) => {
    const authHeader = req.headers.authorization;
    const idToken =
      authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    const fbUser = idToken && !idToken.startsWith('zks_') ? await verifyFirebaseBearerToken(idToken) : null;
    if (!fbUser?.uid) {
      res.status(401).json({ error: 'Please sign in to your account to chat with customer support.' });
      return;
    }

    const { message, orderId, history } = req.body as {
      message?: unknown;
      orderId?: unknown;
      history?: unknown;
    };

    if (typeof message !== 'string' || !message.trim() || message.length > 600) {
      res.status(400).json({ error: 'Please enter a valid support question (1–600 characters).' });
      return;
    }

    const cleanOrderId =
      typeof orderId === 'string' && SAFE_ID_REGEX.test(orderId.trim()) ? orderId.trim() : '';

    const projectId = firebaseConfig.projectId;
    const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';
    const baseFirestore = projectId
      ? `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents`
      : '';

    let supportContact = {
      whatsappNumber: '918970007665',
      contactPhone: '+91 8970007665',
      contactEmail: 'contact.zaikoraventures@gmail.com',
      defaultPrepMinutes: 60,
    };

    let orderContextSummary = 'No specific order selected yet.';

    if (baseFirestore) {
      try {
        const settingsRes = await fetch(`${baseFirestore}/restaurant_settings/config`);
        if (settingsRes.ok) {
          const settingsDoc = (await settingsRes.json()) as { fields?: Record<string, FirestoreVal> };
          const s = unwrapFsFields(settingsDoc.fields);
          supportContact = {
            whatsappNumber: (typeof s.whatsappNumber === 'string' && s.whatsappNumber.trim()) || supportContact.whatsappNumber,
            contactPhone: (typeof s.contactPhone === 'string' && s.contactPhone.trim()) || supportContact.contactPhone,
            contactEmail: (typeof s.contactEmail === 'string' && s.contactEmail.trim()) || supportContact.contactEmail,
            defaultPrepMinutes: typeof s.defaultPrepMinutes === 'number' ? s.defaultPrepMinutes : 60,
          };
        }
      } catch {
        // Use fallback contact defaults
      }

      if (cleanOrderId) {
        try {
          const orderRes = await fetch(`${baseFirestore}/orders/${encodeURIComponent(cleanOrderId)}`, {
            headers: { Authorization: `Bearer ${idToken}` },
          });

          if (orderRes.status === 403) {
            res.status(403).json({
              error: 'Access denied: you can only ask support about your own orders.',
              contact: supportContact,
            });
            return;
          }

          if (orderRes.ok) {
            const orderDoc = (await orderRes.json()) as { fields?: Record<string, FirestoreVal> };
            const orderData = unwrapFsFields(orderDoc.fields);
            if (orderData.customerId !== fbUser.uid) {
              res.status(403).json({
                error: 'Access denied: you can only ask support about your own orders.',
                contact: supportContact,
              });
              return;
            }

            let itemsSummary: Array<Record<string, unknown>> = [];
            try {
              const itemsQ = await runFirestoreQuery({
                projectId: projectId!,
                databaseId,
                collectionId: 'items',
                parentRelativePath: `orders/${cleanOrderId}`,
                limit: 100,
                bearerToken: idToken,
              });
              if (itemsQ.ok) {
                itemsSummary = itemsQ.docs.map((row) => ({
                  name: row.name,
                  quantity: row.quantity,
                  selectedFlavour: row.selectedFlavour,
                  lineTotalRupees: row.lineTotal,
                }));
              }
            } catch {
              // Fallback to itemsPreview
            }

            let statusHistorySummary: Array<Record<string, unknown>> = [];
            try {
              const histQ = await runFirestoreQuery({
                projectId: projectId!,
                databaseId,
                collectionId: 'status_history',
                parentRelativePath: `orders/${cleanOrderId}`,
                limit: 50,
                bearerToken: idToken,
              });
              if (histQ.ok) {
                statusHistorySummary = histQ.docs.map((row) => ({
                  status: row.status,
                  note: row.note,
                  createdAt: row.createdAt,
                }));
              }
            } catch {
              // Optional status history
            }

            orderContextSummary = JSON.stringify({
              orderId: orderData.orderId,
              currentStatus: orderData.status,
              paymentStatus: orderData.paymentStatus,
              estimatedPrepMinutes: orderData.estimatedPrepMinutes,
              readySoonerNotice: orderData.readySoonerNotice || null,
              adminAccepted: Boolean(orderData.adminAccepted),
              adminRejected: Boolean(orderData.adminRejected),
              rejectionReason: orderData.rejectionReason || null,
              refundId: orderData.refundId || null,
              refundStatus: orderData.refundStatus || null,
              refundAmountRupees: orderData.refundAmount || null,
              fulfillmentType: orderData.fulfillmentType,
              deliveryCommunity: orderData.deliveryCommunity,
              deliveryAddressSummary: orderData.deliveryAddressSummary,
              finalAmountRupees: orderData.finalAmount,
              deliveryChargeRupees: orderData.deliveryCharge,
              handlingChargeRupees: orderData.handlingCharge,
              couponCode: orderData.couponCode || null,
              couponDiscountRupees: orderData.couponDiscount || 0,
              itemsPreview: orderData.itemsPreview || null,
              items: itemsSummary,
              statusHistory: statusHistorySummary,
              placedAt: orderData.createdAt,
              lastUpdatedAt: orderData.updatedAt,
            });
          } else if (orderRes.status === 404) {
            orderContextSummary = `Order ID ${cleanOrderId} was not found in the database.`;
          }
        } catch {
          orderContextSummary = 'Could not load live order details right now.';
        }
      }
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      res.status(503).json({
        error: 'AI support service is currently unavailable. Please contact us on WhatsApp or phone below.',
        escalationSuggested: true,
        contact: supportContact,
      });
      return;
    }

    const lowerMsg = message.toLowerCase();
    const looksLikeComplaintOrUnresolvable =
      /(missing|wrong|incorrect|refund|damaged|spoiled|cold|cancel|complaint|spill|late|delay|human|manager|call)/.test(
        lowerMsg
      );

    try {
      const ai = new GoogleGenAI({
        apiKey: geminiApiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      const conversationTurns = Array.isArray(history)
        ? history
            .filter(
              (h): h is { role: 'user' | 'assistant'; text: string } =>
                Boolean(h) &&
                typeof h === 'object' &&
                ((h as { role?: unknown }).role === 'user' ||
                  (h as { role?: unknown }).role === 'assistant') &&
                typeof (h as { text?: unknown }).text === 'string'
            )
            .slice(-8)
            .map((h) => `${h.role === 'user' ? 'Customer' : 'Support'}: ${h.text.slice(0, 400)}`)
            .join('\n')
        : '';

      const systemInstruction = `You are the official AI Customer Support assistant on the ZAIKORA KITCHENS Order Tracking page.

STRICT ACCURACY RULES:
1. NEVER invent, guess, or promise delivery arrival times, rider details, payment confirmations, or order status updates that are not explicitly present in ORDER CONTEXT below.
2. Only state factual order fields from ORDER CONTEXT. If a field says null/missing or no order is selected, state that clearly.
3. Do NOT mention internal automatic pricing rules or +₹10 adjustments.
4. Keep answers friendly, concise (2–5 sentences unless listing order items), and directly helpful.

ZAIKORA KITCHENS OPERATIONAL & REFUND RULES:
- Paid orders start as "PENDING ADMIN APPROVAL" (awaiting kitchen confirmation) and only begin preparation after admin acceptance ("CONFIRMED").
- Standard preparation time: ${supportContact.defaultPrepMinutes} minutes after acceptance (unless "readySoonerNotice" or updated "estimatedPrepMinutes" says otherwise).
- If an order is "REJECTED", "REFUND PROCESSING", or "REFUNDED", state the exact refundStatus and refundId from ORDER CONTEXT. Standard Razorpay refunds settle in 5–7 business days.
- Official Refund and Cancellation Policy is available on the website at /refund-policy (pre-prep cancellation 10% fee / 90% refund; post-prep cancellation 45% fee / 55% refund; kitchen-cancelled orders 100% refund).
- Delivery within Brigade Eldorado: delivered to customer's Brigade Eldorado address.
- Delivery outside Brigade Eldorado: apartment main gate delivery only.
- Self-collection / takeaway: customer collects directly at Brigade Eldorado Main Gate once status is "READY FOR COLLECTION" / "Ready for Collection".
- Direct escalation contacts (if missing items, incorrect order, delay investigation, refund, or unresolved complaint): WhatsApp +${supportContact.whatsappNumber.replace(/\D/g, '')}, Phone ${supportContact.contactPhone}, Email ${supportContact.contactEmail}.

AUTHENTICATED CUSTOMER ORDER CONTEXT:
${orderContextSummary}`;

      const prompt = conversationTurns
        ? `Previous conversation:\n${conversationTurns}\n\nLatest customer message: ${message.trim()}`
        : `Customer message: ${message.trim()}`;

      const result = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction,
        },
      });

      const replyText =
        result.text?.trim() ||
        `I'm sorry, I couldn't process that right now. Please reach our kitchen directly on WhatsApp (+${supportContact.whatsappNumber.replace(/\D/g, '')}) or call ${supportContact.contactPhone}.`;

      const aiMentionsWhatsApp = /whatsapp|contact the restaurant|call/i.test(replyText);

      res.json({
        reply: replyText,
        escalationSuggested: looksLikeComplaintOrUnresolvable || aiMentionsWhatsApp,
        contact: {
          whatsappNumber: supportContact.whatsappNumber,
          contactPhone: supportContact.contactPhone,
          contactEmail: supportContact.contactEmail,
        },
      });
    } catch {
      res.status(502).json({
        error: 'Unable to reach AI Customer Support right now. Please contact us directly via WhatsApp or phone.',
        escalationSuggested: true,
        contact: supportContact,
      });
    }
  });

  return app;
}

async function startServer() {
  const app = createApiApp();

  if (process.env.NODE_ENV !== 'production') {
    app.use(['/src/assets/images', '/assets'], (req, res, next) => {
      if (req.method === 'GET' || req.method === 'HEAD') {
        res.setHeader('Cache-Control', 'public, max-age=86400');
      }
      next();
    });
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true as const },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(SERVER_DIR, 'dist');
    const setAssetCacheHeaders = (res: express.Response, filePath: string) => {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache');
        return;
      }
      const normalized = filePath.replace(/\\/g, '/');
      if (normalized.includes('/src/assets/') || normalized.includes('/assets/')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    };
    app.use(
      express.static(distDir, {
        setHeaders: setAssetCacheHeaders,
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ZAIKORA KITCHENS server running on port ${PORT}`);
  });
}

const isDirectEntry =
  !process.env.NETLIFY &&
  !process.env.AWS_LAMBDA_FUNCTION_NAME &&
  Boolean(SERVER_FILE) &&
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === path.resolve(SERVER_FILE);

if (isDirectEntry) {
  startServer().catch((err) => {
    console.error('Failed to start ZAIKORA KITCHENS server:', err);
    process.exit(1);
  });
}
