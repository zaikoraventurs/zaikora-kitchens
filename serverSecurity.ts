import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type express from 'express';
import {
  AUTO_DISCOUNT_PER_ITEM,
  DEFAULT_DELIVERY_CHARGE,
  DEFAULT_HANDLING_CHARGE,
  INITIAL_CAKE_MENU,
  INITIAL_FOOD_MENU,
  normalizeCheckoutCharge,
} from './src/data/catalog.ts';
import { normalizeInventoryFields } from './src/lib/inventory.ts';
import { computeCheckoutChargesSummary } from './src/lib/pricing.ts';
import type {
  ActiveAdminSessionRecord,
  AdminAuditActionRecord,
  AdminLockoutRecord,
  AdminLoginAttemptRecord,
  CheckoutChargeRecord,
  SecurityConfigurationStatus,
  SecurityEventCategory,
  SecurityEventRecord,
  SecurityEventSeverity,
  SecurityNotificationRecord,
  SecurityOverviewPayload,
} from './src/types/index.ts';

export const ADMIN_MAX_FAILED_ATTEMPTS = 3;
export const ADMIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes temporary lockout
export const LOCKOUT_PRIMARY_MESSAGE =
  'Access temporarily blocked due to three unsuccessful login attempts. Please try again later.';
export const CYBERCRIME_WARNING_MESSAGE =
  'Repeated unauthorised access attempts may be documented and reported to the appropriate cybercrime authorities.';

function resolveDataRoot(): string {
  const isServerless =
    process.env.NETLIFY === 'true' ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
    Boolean(process.env.LAMBDA_TASK_ROOT);
  if (isServerless) {
    return path.resolve(os.tmpdir(), 'zaikora-security-data');
  }
  const localRoot = path.resolve(process.cwd(), '.data');
  try {
    fs.accessSync(process.cwd(), fs.constants.W_OK);
    return localRoot;
  } catch {
    return path.resolve(os.tmpdir(), 'zaikora-security-data');
  }
}

const DATA_ROOT = resolveDataRoot();
const STORE_PATH = path.resolve(DATA_ROOT, 'security-store.json');

interface ConsecutiveFailureCounter {
  count: number;
  lastFailedAt: string;
  lastIp: string;
  lastUid: string;
}

export interface IdempotencyRecord {
  key: string;
  customerUid: string;
  orderId: string;
  paymentId: string;
  fingerprint: string;
  razorpayOrderId?: string;
  amountRupees: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface RefundTrackingRecord {
  orderId: string;
  razorpayPaymentId: string;
  refundId: string;
  amountRupees: number;
  status: 'Refund Processing' | 'Refund Completed' | 'Refund Rejected';
  razorpayStatus?: string;
  reason: string;
  adminUid: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

interface SecurityStoreState {
  events: SecurityEventRecord[];
  loginAttempts: AdminLoginAttemptRecord[];
  lockouts: AdminLockoutRecord[];
  consecutiveFailures: Record<string, ConsecutiveFailureCounter>;
  activeSessions: ActiveAdminSessionRecord[];
  notifications: SecurityNotificationRecord[];
  auditLogs: AdminAuditActionRecord[];
  processedPayments: Record<
    string,
    { orderId: string; razorpayOrderId: string; amountRupees: number; verifiedAt: string }
  >;
  processedWebhookEvents: string[];
  expectedOrderAmounts: Record<
    string,
    { customerUid: string; amountRupees: number; razorpayOrderId?: string; createdAt: string }
  >;
  idempotencyRecords: Record<string, IdempotencyRecord>;
  checkoutAttempts: Record<string, number[]>;
  recentOrderFingerprints: Array<{
    customerUid: string;
    ip: string;
    fingerprint: string;
    orderId: string;
    createdAtMs: number;
  }>;
  refundRecords: Record<string, RefundTrackingRecord>;
  challenges: Record<string, { nonce: string; prefix: string; expiresAtMs: number; used: boolean }>;
}

const DEFAULT_STORE: SecurityStoreState = {
  events: [],
  loginAttempts: [],
  lockouts: [],
  consecutiveFailures: {},
  activeSessions: [],
  notifications: [],
  auditLogs: [],
  processedPayments: {},
  processedWebhookEvents: [],
  expectedOrderAmounts: {},
  idempotencyRecords: {},
  checkoutAttempts: {},
  recentOrderFingerprints: [],
  refundRecords: {},
  challenges: {},
};

function assertConfinedStorePath(): void {
  const resolvedRoot = path.resolve(DATA_ROOT);
  const resolvedFile = path.resolve(resolvedRoot, 'security-store.json');
  if (!resolvedFile.startsWith(resolvedRoot + path.sep)) {
    throw new Error('Security store path escaped .data directory.');
  }
}

function loadStoreFromDisk(): SecurityStoreState {
  assertConfinedStorePath();
  try {
    if (!fs.existsSync(STORE_PATH)) {
      return structuredClone(DEFAULT_STORE);
    }
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<SecurityStoreState>;
    return {
      events: Array.isArray(parsed.events) ? parsed.events : [],
      loginAttempts: Array.isArray(parsed.loginAttempts) ? parsed.loginAttempts : [],
      lockouts: Array.isArray(parsed.lockouts) ? parsed.lockouts : [],
      consecutiveFailures:
        parsed.consecutiveFailures && typeof parsed.consecutiveFailures === 'object'
          ? parsed.consecutiveFailures
          : {},
      activeSessions: Array.isArray(parsed.activeSessions) ? parsed.activeSessions : [],
      notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
      auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
      processedPayments:
        parsed.processedPayments && typeof parsed.processedPayments === 'object'
          ? parsed.processedPayments
          : {},
      processedWebhookEvents: Array.isArray(parsed.processedWebhookEvents)
        ? parsed.processedWebhookEvents
        : [],
      expectedOrderAmounts:
        parsed.expectedOrderAmounts && typeof parsed.expectedOrderAmounts === 'object'
          ? parsed.expectedOrderAmounts
          : {},
      idempotencyRecords:
        parsed.idempotencyRecords && typeof parsed.idempotencyRecords === 'object'
          ? parsed.idempotencyRecords
          : {},
      checkoutAttempts:
        parsed.checkoutAttempts && typeof parsed.checkoutAttempts === 'object'
          ? parsed.checkoutAttempts
          : {},
      recentOrderFingerprints: Array.isArray(parsed.recentOrderFingerprints)
        ? parsed.recentOrderFingerprints
        : [],
      refundRecords:
        parsed.refundRecords && typeof parsed.refundRecords === 'object'
          ? parsed.refundRecords
          : {},
      challenges:
        parsed.challenges && typeof parsed.challenges === 'object'
          ? parsed.challenges
          : {},
    };
  } catch {
    return structuredClone(DEFAULT_STORE);
  }
}

const store: SecurityStoreState = loadStoreFromDisk();

function persistStore(): void {
  assertConfinedStorePath();
  try {
    fs.mkdirSync(DATA_ROOT, { recursive: true, mode: 0o700 });
    // Trim collections to keep disk usage bounded
    if (store.events.length > 1000) store.events.length = 1000;
    if (store.loginAttempts.length > 500) store.loginAttempts.length = 500;
    if (store.lockouts.length > 300) store.lockouts.length = 300;
    if (store.activeSessions.length > 200) store.activeSessions.length = 200;
    if (store.notifications.length > 300) store.notifications.length = 300;
    if (store.auditLogs.length > 500) store.auditLogs.length = 500;
    if (store.processedWebhookEvents.length > 500) {
      store.processedWebhookEvents = store.processedWebhookEvents.slice(-500);
    }
    if (store.recentOrderFingerprints.length > 500) {
      store.recentOrderFingerprints = store.recentOrderFingerprints.slice(-500);
    }
    const idempKeys = Object.keys(store.idempotencyRecords);
    if (idempKeys.length > 800) {
      for (const k of idempKeys.slice(0, idempKeys.length - 800)) {
        delete store.idempotencyRecords[k];
      }
    }
    const challengeKeys = Object.keys(store.challenges);
    if (challengeKeys.length > 400) {
      const nowMs = Date.now();
      for (const k of challengeKeys) {
        if (store.challenges[k].used || store.challenges[k].expiresAtMs <= nowMs) {
          delete store.challenges[k];
        }
      }
    }

    const tmpPath = path.resolve(DATA_ROOT, `security-store.${process.pid}.tmp`);
    if (!tmpPath.startsWith(DATA_ROOT + path.sep)) {
      throw new Error('Invalid temp store path.');
    }
    fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmpPath, STORE_PATH);
  } catch (err) {
    console.error('Security store persistence error:', err);
  }
}

export function normalizeIp(raw: string | undefined): string {
  if (!raw) return 'unknown';
  let ip = raw.split(',')[0].trim();
  if (ip.startsWith('::ffff:')) {
    ip = ip.slice(7);
  }
  return ip.slice(0, 64) || 'unknown';
}

export function getTrustedClientMeta(req: express.Request): {
  ip: string;
  browser: string;
  device: string;
  userAgent: string;
} {
  const ip = normalizeIp(req.ip || req.socket.remoteAddress);
  const ua = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 300) : 'Unknown';

  let browser = 'Unknown Browser';
  if (/Edg\//i.test(ua)) browser = 'Microsoft Edge';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = 'Google Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Mozilla Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = 'Apple Safari';
  else if (/curl|wget|python-requests|node|axios|postman|insomnia/i.test(ua)) browser = 'Automated HTTP Client';

  let device = 'Desktop / Unknown';
  if (/iPhone|iPad|iPod/i.test(ua)) device = 'iOS Device';
  else if (/Android/i.test(ua)) device = 'Android Device';
  else if (/Windows/i.test(ua)) device = 'Windows PC';
  else if (/Macintosh|Mac OS X/i.test(ua)) device = 'macOS';
  else if (/Linux/i.test(ua)) device = 'Linux';

  return { ip, browser, device, userAgent: ua };
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

export function logSecurityEvent(params: {
  req?: express.Request;
  ip?: string;
  browser?: string;
  device?: string;
  userAgent?: string;
  category: SecurityEventCategory;
  eventType: string;
  severity: SecurityEventSeverity;
  endpoint: string;
  method?: string;
  accountIdentifier?: string;
  actionTaken: string;
  result: string;
  suspicious?: boolean;
  details?: string;
  notifyAdmin?: boolean;
  notificationTitle?: string;
}): SecurityEventRecord {
  const meta = params.req
    ? getTrustedClientMeta(params.req)
    : {
        ip: params.ip || 'unknown',
        browser: params.browser || 'Server',
        device: params.device || 'Server',
        userAgent: params.userAgent || 'Server',
      };

  const event: SecurityEventRecord = {
    id: makeId('sec'),
    timestamp: new Date().toISOString(),
    category: params.category,
    eventType: params.eventType,
    severity: params.severity,
    ip: meta.ip,
    browser: meta.browser,
    device: meta.device,
    userAgent: meta.userAgent,
    endpoint: params.endpoint.slice(0, 180),
    method: (params.method || params.req?.method || 'SERVER').toUpperCase(),
    accountIdentifier: (params.accountIdentifier || 'anonymous').slice(0, 128),
    actionTaken: params.actionTaken.slice(0, 240),
    result: params.result.slice(0, 240),
    suspicious: Boolean(params.suspicious),
    details: params.details ? params.details.slice(0, 500) : undefined,
  };

  store.events.unshift(event);

  if (params.notifyAdmin || params.severity === 'critical' || params.suspicious) {
    const notif: SecurityNotificationRecord = {
      id: makeId('notif'),
      timestamp: event.timestamp,
      eventType: event.eventType,
      severity: event.severity,
      title: params.notificationTitle || event.eventType.replace(/_/g, ' '),
      message: `${event.actionTaken} — ${event.result}${event.details ? ` (${event.details})` : ''}`,
      ip: event.ip,
      accountIdentifier: event.accountIdentifier,
      read: false,
    };
    store.notifications.unshift(notif);
  }

  persistStore();
  return event;
}

export function logAdminAuditAction(params: {
  req?: express.Request;
  adminUid: string;
  action: string;
  target: string;
  details: string;
}): AdminAuditActionRecord {
  const meta = params.req
    ? getTrustedClientMeta(params.req)
    : { ip: 'unknown', browser: 'Server', device: 'Server' };

  const entry: AdminAuditActionRecord = {
    id: makeId('aud'),
    timestamp: new Date().toISOString(),
    adminUid: params.adminUid.slice(0, 128),
    action: params.action.slice(0, 120),
    target: params.target.slice(0, 180),
    ip: meta.ip,
    browser: meta.browser,
    device: meta.device,
    details: params.details.slice(0, 400),
  };
  store.auditLogs.unshift(entry);
  persistStore();
  return entry;
}

export function expireStaleLockouts(): void {
  const now = Date.now();
  let changed = false;
  for (const lockout of store.lockouts) {
    if (lockout.active && Date.parse(lockout.expiresAt) <= now) {
      lockout.active = false;
      delete store.consecutiveFailures[lockout.key];
      changed = true;
    }
  }
  if (changed) {
    persistStore();
  }
}

export function checkAdminLockout(uid: string, ip: string): {
  blocked: boolean;
  remainingSeconds: number;
  lockout?: AdminLockoutRecord;
} {
  expireStaleLockouts();
  const keys = new Set([`uid:${uid}`, `ip:${ip}`]);
  const now = Date.now();

  for (const lockout of store.lockouts) {
    if (!lockout.active) continue;
    if (keys.has(lockout.key) || lockout.uid === uid || lockout.ip === ip) {
      const expMs = Date.parse(lockout.expiresAt);
      if (expMs > now) {
        return {
          blocked: true,
          remainingSeconds: Math.max(1, Math.ceil((expMs - now) / 1000)),
          lockout,
        };
      }
    }
  }
  return { blocked: false, remainingSeconds: 0 };
}

export function recordAdminFailedAttempt(
  req: express.Request,
  uid: string,
  reason: string
): {
  nowLocked: boolean;
  consecutiveFailures: number;
  remainingAttempts: number;
  lockout?: AdminLockoutRecord;
} {
  expireStaleLockouts();
  const meta = getTrustedClientMeta(req);
  const failKeys = [`uid:${uid}`, `ip:${meta.ip}`];
  const nowIso = new Date().toISOString();

  let maxCount = 0;
  for (const key of failKeys) {
    const prev = store.consecutiveFailures[key];
    const nextCount = (prev?.count || 0) + 1;
    store.consecutiveFailures[key] = {
      count: nextCount,
      lastFailedAt: nowIso,
      lastIp: meta.ip,
      lastUid: uid,
    };
    if (nextCount > maxCount) {
      maxCount = nextCount;
    }
  }

  const attempt: AdminLoginAttemptRecord = {
    id: makeId('att'),
    timestamp: nowIso,
    success: false,
    ip: meta.ip,
    browser: meta.browser,
    device: meta.device,
    accountIdentifier: uid,
    consecutiveFailuresAtTime: maxCount,
    reason,
  };
  store.loginAttempts.unshift(attempt);

  if (maxCount >= ADMIN_MAX_FAILED_ATTEMPTS) {
    const expiresAt = new Date(Date.now() + ADMIN_LOCKOUT_MS).toISOString();
    const lockout: AdminLockoutRecord = {
      id: makeId('lck'),
      key: `ip:${meta.ip}`,
      uid,
      ip: meta.ip,
      browser: meta.browser,
      device: meta.device,
      failedCount: maxCount,
      lockedAt: nowIso,
      expiresAt,
      active: true,
      cybercrimeWarningIssued: true,
    };
    store.lockouts.unshift(lockout);

    logSecurityEvent({
      req,
      category: 'auth',
      eventType: 'ADMIN_BRUTE_FORCE_LOCKOUT',
      severity: 'critical',
      endpoint: '/api/admin/unlock',
      accountIdentifier: uid,
      actionTaken: 'Temporary 15-minute access block activated after 3 consecutive failed admin logins',
      result: 'Blocked (HTTP 429) with cybercrime warning',
      suspicious: true,
      notifyAdmin: true,
      notificationTitle: 'Admin Lockout Triggered (3 Failed Attempts)',
      details: `${reason}. Consecutive failures: ${maxCount}.`,
    });

    return {
      nowLocked: true,
      consecutiveFailures: maxCount,
      remainingAttempts: 0,
      lockout,
    };
  }

  logSecurityEvent({
    req,
    category: 'auth',
    eventType: 'ADMIN_FAILED_LOGIN',
    severity: 'warning',
    endpoint: '/api/admin/unlock',
    accountIdentifier: uid,
    actionTaken: 'Rejected invalid admin login attempt',
    result: `Failed (${maxCount} of ${ADMIN_MAX_FAILED_ATTEMPTS} consecutive attempts)`,
    suspicious: maxCount >= 2,
    notifyAdmin: maxCount >= 2,
    notificationTitle: 'Repeated Failed Admin Login Attempt',
    details: reason,
  });

  return {
    nowLocked: false,
    consecutiveFailures: maxCount,
    remainingAttempts: Math.max(0, ADMIN_MAX_FAILED_ATTEMPTS - maxCount),
  };
}

export function recordAdminSuccessfulLogin(
  req: express.Request,
  uid: string,
  sessionId: string,
  expiresAtMs: number
): void {
  const meta = getTrustedClientMeta(req);
  const nowIso = new Date().toISOString();

  delete store.consecutiveFailures[`uid:${uid}`];
  delete store.consecutiveFailures[`ip:${meta.ip}`];

  for (const lockout of store.lockouts) {
    if (lockout.active && (lockout.uid === uid || lockout.ip === meta.ip)) {
      lockout.active = false;
      lockout.unblockedAt = nowIso;
      lockout.unblockedBy = 'valid_login_after_expiry';
    }
  }

  store.loginAttempts.unshift({
    id: makeId('att'),
    timestamp: nowIso,
    success: true,
    ip: meta.ip,
    browser: meta.browser,
    device: meta.device,
    accountIdentifier: uid,
    consecutiveFailuresAtTime: 0,
    reason: 'Authorised admin login verified',
  });

  store.activeSessions.unshift({
    sessionId,
    uid,
    ip: meta.ip,
    browser: meta.browser,
    device: meta.device,
    createdAt: nowIso,
    lastSeenAt: nowIso,
    expiresAt: new Date(expiresAtMs).toISOString(),
    active: true,
  });

  logSecurityEvent({
    req,
    category: 'auth',
    eventType: 'ADMIN_LOGIN_SUCCESS',
    severity: 'info',
    endpoint: '/api/admin/unlock',
    accountIdentifier: uid,
    actionTaken: 'Verified admin password and issued signed session',
    result: 'Access granted',
    suspicious: false,
    details: `Session ${sessionId.slice(0, 12)} created`,
  });
}

export function isAdminSessionActive(sessionId: string | undefined): boolean {
  if (!sessionId) return false;
  const now = Date.now();
  const session = store.activeSessions.find((s) => s.sessionId === sessionId);
  if (!session) return false;
  if (!session.active || session.revokedAt) return false;
  if (Date.parse(session.expiresAt) <= now) {
    session.active = false;
    persistStore();
    return false;
  }
  const lastSeenMs = Date.parse(session.lastSeenAt);
  if (!Number.isFinite(lastSeenMs) || now - lastSeenMs > 60_000) {
    session.lastSeenAt = new Date(now).toISOString();
    persistStore();
  }
  return true;
}

export function revokeAdminSessionById(
  sessionId: string,
  revokedBy: string,
  req?: express.Request
): boolean {
  const session = store.activeSessions.find((s) => s.sessionId === sessionId);
  if (!session) return false;
  session.active = false;
  session.revokedAt = new Date().toISOString();
  session.revokedBy = revokedBy;

  logSecurityEvent({
    req,
    category: 'admin',
    eventType: 'ADMIN_SESSION_REVOKED',
    severity: 'info',
    endpoint: req?.originalUrl || '/api/security/sessions/revoke',
    accountIdentifier: session.uid,
    actionTaken: `Admin session ${sessionId.slice(0, 12)} revoked`,
    result: 'Session invalidated immediately',
    suspicious: false,
    details: `Revoked by ${revokedBy}`,
  });

  logAdminAuditAction({
    req,
    adminUid: revokedBy,
    action: 'REVOKE_ADMIN_SESSION',
    target: sessionId,
    details: `Revoked session for UID ${session.uid} (${session.ip})`,
  });

  return true;
}

export function unblockAdminLockoutById(
  lockoutId: string,
  adminUid: string,
  req?: express.Request
): boolean {
  const lockout = store.lockouts.find((l) => l.id === lockoutId);
  if (!lockout) return false;
  lockout.active = false;
  lockout.unblockedAt = new Date().toISOString();
  lockout.unblockedBy = adminUid;
  delete store.consecutiveFailures[lockout.key];
  delete store.consecutiveFailures[`uid:${lockout.uid}`];
  delete store.consecutiveFailures[`ip:${lockout.ip}`];

  logAdminAuditAction({
    req,
    adminUid,
    action: 'UNBLOCK_LOCKOUT',
    target: lockoutId,
    details: `Unblocked ${lockout.ip} / ${lockout.uid}`,
  });
  logSecurityEvent({
    req,
    category: 'admin',
    eventType: 'ADMIN_LOCKOUT_CLEARED',
    severity: 'info',
    endpoint: '/api/security/lockouts/unblock',
    accountIdentifier: adminUid,
    actionTaken: `Manually cleared lockout for ${lockout.ip}`,
    result: 'Lockout unblocked',
    suspicious: false,
  });
  return true;
}

export function markNotificationsRead(adminUid: string, notificationId?: string): number {
  let updated = 0;
  for (const n of store.notifications) {
    if (!n.read && (!notificationId || n.id === notificationId)) {
      n.read = true;
      updated += 1;
    }
  }
  if (updated > 0) {
    persistStore();
  }
  return updated;
}

// Replay & order-amount tracking backed by persistent store
export function getProcessedPayment(paymentId: string) {
  return store.processedPayments[paymentId] || null;
}

export function recordProcessedPayment(params: {
  paymentId: string;
  orderId: string;
  razorpayOrderId: string;
  amountRupees: number;
}): void {
  const entries = Object.entries(store.processedPayments);
  if (entries.length >= 500) {
    const oldestKey = entries[0]?.[0];
    if (oldestKey) delete store.processedPayments[oldestKey];
  }
  store.processedPayments[params.paymentId] = {
    orderId: params.orderId,
    razorpayOrderId: params.razorpayOrderId,
    amountRupees: params.amountRupees,
    verifiedAt: new Date().toISOString(),
  };
  persistStore();
}

export function hasProcessedWebhookEvent(eventId: string): boolean {
  return store.processedWebhookEvents.includes(eventId);
}

export function markProcessedWebhookEvent(eventId: string): void {
  if (!store.processedWebhookEvents.includes(eventId)) {
    store.processedWebhookEvents.push(eventId);
    persistStore();
  }
}

export function setExpectedOrderPayment(params: {
  orderId: string;
  customerUid: string;
  amountRupees: number;
  razorpayOrderId?: string;
}): void {
  const keys = Object.keys(store.expectedOrderAmounts);
  if (keys.length >= 500) {
    delete store.expectedOrderAmounts[keys[0]];
  }
  store.expectedOrderAmounts[params.orderId] = {
    customerUid: params.customerUid,
    amountRupees: params.amountRupees,
    razorpayOrderId: params.razorpayOrderId,
    createdAt: new Date().toISOString(),
  };
  persistStore();
}

export function getExpectedOrderPayment(orderId: string) {
  return store.expectedOrderAmounts[orderId] || null;
}

// --- Checkout Anti-Spam, PoW Challenge, Idempotency & Review Flagging ---

export function getIdempotentOrder(
  customerUid: string,
  idempotencyKey: string
): IdempotencyRecord | null {
  if (!customerUid || !idempotencyKey) return null;
  const scopedKey = `${customerUid}:${idempotencyKey}`;
  return store.idempotencyRecords[scopedKey] || null;
}

export function upsertIdempotentOrder(params: {
  customerUid: string;
  key: string;
  orderId: string;
  paymentId: string;
  fingerprint: string;
  razorpayOrderId?: string;
  amountRupees: number;
  status: string;
}): IdempotencyRecord {
  const scopedKey = `${params.customerUid}:${params.key}`;
  const nowIso = new Date().toISOString();
  const prev = store.idempotencyRecords[scopedKey];
  const record: IdempotencyRecord = {
    key: params.key,
    customerUid: params.customerUid,
    orderId: params.orderId,
    paymentId: params.paymentId,
    fingerprint: params.fingerprint,
    razorpayOrderId: params.razorpayOrderId ?? prev?.razorpayOrderId,
    amountRupees: params.amountRupees,
    status: params.status,
    createdAt: prev?.createdAt || nowIso,
    updatedAt: nowIso,
  };
  store.idempotencyRecords[scopedKey] = record;
  persistStore();
  return record;
}

export function updateIdempotentStatus(
  orderId: string,
  updates: Partial<Pick<IdempotencyRecord, 'status' | 'razorpayOrderId'>>
): void {
  let changed = false;
  for (const record of Object.values(store.idempotencyRecords)) {
    if (record.orderId === orderId) {
      if (updates.status !== undefined) record.status = updates.status;
      if (updates.razorpayOrderId !== undefined) record.razorpayOrderId = updates.razorpayOrderId;
      record.updatedAt = new Date().toISOString();
      changed = true;
    }
  }
  if (changed) persistStore();
}

export function checkAndRecordCheckoutRateLimit(
  req: express.Request,
  uid: string
): { allowed: boolean; status?: number; error?: string; requiresChallenge?: boolean } {
  const meta = getTrustedClientMeta(req);
  const now = Date.now();
  const windowMs = 60 * 1000;

  const ipKey = `ip:${meta.ip}`;
  const uidKey = `uid:${uid}`;

  const ipTimes = (store.checkoutAttempts[ipKey] || []).filter((t) => now - t < windowMs);
  const uidTimes = (store.checkoutAttempts[uidKey] || []).filter((t) => now - t < windowMs);

  // Hard flood threshold (high IP limit prevents blocking legitimate shared Wi-Fi networks)
  if (uidTimes.length >= 12 || ipTimes.length >= 30) {
    logSecurityEvent({
      req,
      category: 'api',
      eventType: 'CHECKOUT_FLOOD_BLOCKED',
      severity: 'critical',
      endpoint: req.originalUrl,
      accountIdentifier: uid,
      actionTaken: `Blocked checkout spam flood (uid=${uidTimes.length}/min, ip=${ipTimes.length}/min)`,
      result: 'Rejected (HTTP 429)',
      suspicious: true,
      notifyAdmin: true,
      notificationTitle: 'Checkout Spam Flood Blocked',
    });
    return {
      allowed: false,
      status: 429,
      error: 'Too many checkout attempts in a short time. Please wait a minute and try again.',
    };
  }

  ipTimes.push(now);
  uidTimes.push(now);
  store.checkoutAttempts[ipKey] = ipTimes.slice(-40);
  store.checkoutAttempts[uidKey] = uidTimes.slice(-20);
  persistStore();

  const isAutomatedUa =
    meta.browser === 'Automated HTTP Client' || !req.headers['user-agent']?.trim();
  const requiresChallenge = uidTimes.length > 4 || ipTimes.length > 10 || isAutomatedUa;

  return { allowed: true, requiresChallenge };
}

export function issueCheckoutChallenge(req: express.Request): {
  challengeId: string;
  nonce: string;
  prefix: string;
  expiresInSeconds: number;
} {
  const challengeId = makeId('chl');
  const nonce = crypto.randomBytes(16).toString('hex');
  const prefix = '000';
  store.challenges[challengeId] = {
    nonce,
    prefix,
    expiresAtMs: Date.now() + 5 * 60 * 1000,
    used: false,
  };
  persistStore();

  logSecurityEvent({
    req,
    category: 'api',
    eventType: 'CHECKOUT_POW_CHALLENGE_ISSUED',
    severity: 'info',
    endpoint: '/api/orders/challenge',
    actionTaken: 'Issued lightweight SHA-256 verification challenge for burst checkout traffic',
    result: 'Challenge Issued',
    suspicious: false,
  });

  return { challengeId, nonce, prefix, expiresInSeconds: 300 };
}

export function verifyCheckoutChallenge(challengeId: string, solution: string): boolean {
  if (!challengeId || typeof solution !== 'string' || solution.length > 64) return false;
  const entry = store.challenges[challengeId];
  if (!entry || entry.used || entry.expiresAtMs <= Date.now()) {
    return false;
  }
  const digest = crypto
    .createHash('sha256')
    .update(`${entry.nonce}:${solution}`)
    .digest('hex');
  if (!digest.startsWith(entry.prefix)) {
    return false;
  }
  entry.used = true;
  persistStore();
  return true;
}

export function computeCheckoutFingerprint(params: {
  customerUid: string;
  fulfillmentType: string;
  addressSummary: string;
  items: Array<{ productId: string; productType: string; quantity: number; selectedFlavour?: string }>;
}): string {
  const normalizedItems = [...params.items]
    .map((it) => ({
      id: it.productId,
      type: it.productType,
      qty: Math.round(it.quantity),
      flavour: (it.selectedFlavour || '').trim().toLowerCase(),
    }))
    .sort((a, b) => `${a.type}:${a.id}:${a.flavour}`.localeCompare(`${b.type}:${b.id}:${b.flavour}`));

  const canonical = JSON.stringify({
    uid: params.customerUid,
    fulfillment: params.fulfillmentType,
    address: params.addressSummary.trim().toLowerCase().replace(/\s+/g, ' '),
    items: normalizedItems,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export function evaluateOrderReviewFlags(params: {
  req: express.Request;
  customerUid: string;
  fingerprint: string;
  totalItemCount: number;
  orderId: string;
}): { reviewFlagged: boolean; reviewFlagReason: string; suspiciousScore: number } {
  const meta = getTrustedClientMeta(params.req);
  const nowMs = Date.now();
  const fiveMinsMs = 5 * 60 * 1000;
  const thirtyMinsMs = 30 * 60 * 1000;

  store.recentOrderFingerprints = store.recentOrderFingerprints.filter(
    (entry) => nowMs - entry.createdAtMs < thirtyMinsMs
  );

  const reasons: string[] = [];
  let score = 0;

  const identicalRecent = store.recentOrderFingerprints.filter(
    (entry) =>
      entry.customerUid === params.customerUid &&
      entry.fingerprint === params.fingerprint &&
      nowMs - entry.createdAtMs < fiveMinsMs &&
      entry.orderId !== params.orderId
  );
  if (identicalRecent.length > 0) {
    score += 45;
    reasons.push(
      `Identical order repeated within 5 minutes (previous: ${identicalRecent[identicalRecent.length - 1].orderId})`
    );
  }

  const recentAccountOrders = store.recentOrderFingerprints.filter(
    (entry) => entry.customerUid === params.customerUid && nowMs - entry.createdAtMs < fiveMinsMs
  );
  if (recentAccountOrders.length >= 2) {
    score += 30;
    reasons.push(`High order frequency (${recentAccountOrders.length + 1} orders in 5 minutes)`);
  }

  if (params.totalItemCount > 25) {
    score += 20;
    reasons.push(`Large item quantity (${params.totalItemCount} items)`);
  }

  if (meta.browser === 'Automated HTTP Client') {
    score += 25;
    reasons.push('Automated HTTP client user-agent');
  }

  store.recentOrderFingerprints.push({
    customerUid: params.customerUid,
    ip: meta.ip,
    fingerprint: params.fingerprint,
    orderId: params.orderId,
    createdAtMs: nowMs,
  });
  persistStore();

  const suspiciousScore = Math.min(100, score);
  const reviewFlagged = suspiciousScore >= 25;
  const reviewFlagReason = reasons.join('; ').slice(0, 295);

  if (reviewFlagged) {
    logSecurityEvent({
      req: params.req,
      category: 'payment',
      eventType: 'ORDER_FLAGGED_FOR_ADMIN_REVIEW',
      severity: 'warning',
      endpoint: params.req.originalUrl,
      accountIdentifier: params.customerUid,
      actionTaken: `Flagged order ${params.orderId} for admin manual review (score=${suspiciousScore})`,
      result: 'Flagged for Review',
      suspicious: true,
      notifyAdmin: true,
      notificationTitle: 'Order Flagged for Kitchen Review',
      details: reviewFlagReason,
    });
  }

  return { reviewFlagged, reviewFlagReason, suspiciousScore };
}

export function getRefundByOrderOrPayment(
  orderId: string,
  razorpayPaymentId?: string
): RefundTrackingRecord | null {
  if (orderId && store.refundRecords[orderId]) {
    return store.refundRecords[orderId];
  }
  if (razorpayPaymentId) {
    for (const rec of Object.values(store.refundRecords)) {
      if (rec.razorpayPaymentId === razorpayPaymentId) {
        return rec;
      }
    }
  }
  return null;
}

export function upsertRefundRecord(record: RefundTrackingRecord): void {
  store.refundRecords[record.orderId] = record;
  persistStore();
}

export function getRazorpayRuntimeConfig(): {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  razorpayConfigured: boolean;
  razorpayWebhookConfigured: boolean;
  razorpayMode: 'live' | 'test' | 'configured' | 'unconfigured';
  isProductionEnv: boolean;
  blockedTestInProd: boolean;
} {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim() || '';
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim() || '';
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || '';
  const isProductionEnv = process.env.CONTEXT
    ? process.env.CONTEXT === 'production'
    : process.env.NODE_ENV === 'production';

  const razorpayConfigured = Boolean(keyId && keySecret);
  const razorpayWebhookConfigured = Boolean(webhookSecret);
  let razorpayMode: 'live' | 'test' | 'configured' | 'unconfigured' = 'unconfigured';
  if (razorpayConfigured) {
    if (keyId.startsWith('rzp_live_')) razorpayMode = 'live';
    else if (keyId.startsWith('rzp_test_')) razorpayMode = 'test';
    else razorpayMode = 'configured';
  }
  const blockedTestInProd =
    isProductionEnv &&
    razorpayConfigured &&
    keyId.startsWith('rzp_test_') &&
    process.env.ALLOW_RAZORPAY_TEST_IN_PROD !== 'true';

  return {
    keyId,
    keySecret,
    webhookSecret,
    razorpayConfigured,
    razorpayWebhookConfigured,
    razorpayMode,
    isProductionEnv,
    blockedTestInProd,
  };
}

export async function verifyRazorpayPaymentViaApi(params: {
  razorpayPaymentId: string;
  expectedRazorpayOrderId?: string;
  expectedAmountPaise?: number;
}): Promise<
  | { ok: true; paymentStatus: string; amountPaise: number; orderIdFromRazorpay: string }
  | { ok: false; configured: boolean; status: number; error: string }
> {
  const { keyId, keySecret, razorpayConfigured, blockedTestInProd } = getRazorpayRuntimeConfig();
  if (!razorpayConfigured) {
    return {
      ok: false,
      configured: false,
      status: 503,
      error:
        'Razorpay credentials (RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET) are not configured on the server.',
    };
  }
  if (blockedTestInProd) {
    return {
      ok: false,
      configured: false,
      status: 503,
      error:
        'Razorpay test keys (rzp_test_*) are blocked in production. Configure live Razorpay keys before accepting live payments.',
    };
  }

  const authToken = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  try {
    const res = await fetch(
      `https://api.razorpay.com/v1/payments/${encodeURIComponent(params.razorpayPaymentId)}`,
      {
        method: 'GET',
        headers: { Authorization: `Basic ${authToken}` },
      }
    );

    const data = (await res.json()) as {
      id?: string;
      status?: string;
      amount?: number;
      currency?: string;
      order_id?: string;
      captured?: boolean;
      error?: { description?: string };
    };

    if (!res.ok || !data.id) {
      return {
        ok: false,
        configured: true,
        status: res.status === 404 ? 400 : 502,
        error: data.error?.description || 'Razorpay could not locate this payment transaction.',
      };
    }

    if (data.currency !== 'INR') {
      return {
        ok: false,
        configured: true,
        status: 400,
        error: `Unexpected Razorpay payment currency "${data.currency || 'unknown'}". Expected INR.`,
      };
    }

    if (
      typeof params.expectedAmountPaise === 'number' &&
      params.expectedAmountPaise > 0 &&
      data.amount !== params.expectedAmountPaise
    ) {
      return {
        ok: false,
        configured: true,
        status: 400,
        error: `Razorpay payment amount mismatch: expected ${params.expectedAmountPaise} paise, got ${data.amount ?? 'unknown'} paise.`,
      };
    }

    if (
      params.expectedRazorpayOrderId &&
      data.order_id &&
      data.order_id !== params.expectedRazorpayOrderId
    ) {
      return {
        ok: false,
        configured: true,
        status: 400,
        error: 'Razorpay payment order_id does not match this order.',
      };
    }

    let finalStatus = data.status || '';
    if (finalStatus === 'authorized' && typeof data.amount === 'number') {
      const capRes = await fetch(
        `https://api.razorpay.com/v1/payments/${encodeURIComponent(params.razorpayPaymentId)}/capture`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${authToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ amount: data.amount, currency: 'INR' }),
        }
      );
      if (capRes.ok) {
        const capData = (await capRes.json()) as { status?: string };
        if (capData.status) {
          finalStatus = capData.status;
        }
      }
    }

    if (finalStatus !== 'captured') {
      return {
        ok: false,
        configured: true,
        status: 400,
        error: `Payment is not captured by Razorpay (current status: ${finalStatus || 'unknown'}).`,
      };
    }

    return {
      ok: true,
      paymentStatus: finalStatus,
      amountPaise: data.amount || 0,
      orderIdFromRazorpay: data.order_id || '',
    };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      status: 502,
      error: err instanceof Error ? err.message : 'Unable to reach Razorpay Payments API.',
    };
  }
}

export async function initiateRazorpayFullRefund(params: {
  razorpayPaymentId: string;
  amountRupees: number;
  orderId: string;
  reason: string;
  adminUid: string;
}): Promise<
  | {
      ok: true;
      refundId: string;
      razorpayRefundStatus: string;
      refundStatus: 'Refund Processing' | 'Refund Completed';
      orderStatus: 'REFUND PROCESSING' | 'REFUNDED';
      paymentStatus: 'refund_processing' | 'refunded';
      amountRupees: number;
    }
  | { ok: false; configured: boolean; status: number; error: string }
> {
  const { keyId, keySecret, razorpayConfigured, blockedTestInProd } = getRazorpayRuntimeConfig();
  if (!razorpayConfigured) {
    return {
      ok: false,
      configured: false,
      status: 503,
      error:
        'Razorpay credentials (RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET) are required to issue a real automatic refund. Configure them in the environment before rejecting paid orders; no fake refund was recorded.',
    };
  }
  if (blockedTestInProd) {
    return {
      ok: false,
      configured: false,
      status: 503,
      error:
        'Razorpay test keys (rzp_test_*) are blocked in production. Configure live Razorpay credentials to process live refunds.',
    };
  }

  const amountPaise = Math.max(100, Math.round(params.amountRupees * 100));
  const authToken = Buffer.from(`${keyId}:${keySecret}`).toString('base64');

  try {
    const res = await fetch(
      `https://api.razorpay.com/v1/payments/${encodeURIComponent(params.razorpayPaymentId)}/refund`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: amountPaise,
          speed: 'normal',
          notes: {
            zaikoraOrderId: params.orderId,
            reason: params.reason.slice(0, 200),
            rejectedBy: params.adminUid,
          },
        }),
      }
    );

    const data = (await res.json()) as {
      id?: string;
      status?: string;
      amount?: number;
      error?: { description?: string };
    };

    if (!res.ok || !data.id) {
      return {
        ok: false,
        configured: true,
        status: res.status >= 400 && res.status < 500 ? res.status : 502,
        error: data.error?.description || 'Razorpay refund initiation failed.',
      };
    }

    if (data.status === 'failed') {
      return {
        ok: false,
        configured: true,
        status: 502,
        error: 'Razorpay rejected the refund request (status: failed).',
      };
    }

    const isProcessed = data.status === 'processed';
    return {
      ok: true,
      refundId: data.id,
      razorpayRefundStatus: data.status || 'pending',
      refundStatus: isProcessed ? 'Refund Completed' : 'Refund Processing',
      orderStatus: isProcessed ? 'REFUNDED' : 'REFUND PROCESSING',
      paymentStatus: isProcessed ? 'refunded' : 'refund_processing',
      amountRupees: Math.round((data.amount || amountPaise) / 100),
    };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      status: 502,
      error: err instanceof Error ? err.message : 'Unable to reach Razorpay Refunds API.',
    };
  }
}

export async function fetchRazorpayRefundStatus(refundId: string): Promise<
  | { ok: true; status: string; amountPaise: number }
  | { ok: false; configured: boolean; status: number; error: string }
> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    return {
      ok: false,
      configured: false,
      status: 503,
      error: 'Razorpay credentials are not configured on the server.',
    };
  }

  const authToken = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  try {
    const res = await fetch(
      `https://api.razorpay.com/v1/refunds/${encodeURIComponent(refundId)}`,
      {
        method: 'GET',
        headers: { Authorization: `Basic ${authToken}` },
      }
    );
    const data = (await res.json()) as {
      id?: string;
      status?: string;
      amount?: number;
      error?: { description?: string };
    };
    if (!res.ok || !data.id) {
      return {
        ok: false,
        configured: true,
        status: res.status === 404 ? 404 : 502,
        error: data.error?.description || 'Unable to fetch refund status from Razorpay.',
      };
    }
    return {
      ok: true,
      status: data.status || 'pending',
      amountPaise: data.amount || 0,
    };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      status: 502,
      error: err instanceof Error ? err.message : 'Unable to reach Razorpay Refunds API.',
    };
  }
}

// --- Global API Rate Limiter (sliding 60-second window) ---
const rateBuckets = new Map<string, { count: number; windowStart: number; loggedInWindow: boolean }>();
const API_RATE_WINDOW_MS = 60 * 1000;
const API_RATE_MAX_REQUESTS = 120;

export function apiRateLimiterMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  if (
    req.path === '/api/health' ||
    req.path === '/api/config/status' ||
    req.path === '/api/payments/webhook'
  ) {
    next();
    return;
  }

  const meta = getTrustedClientMeta(req);
  const now = Date.now();
  const existing = rateBuckets.get(meta.ip);

  if (!existing || now - existing.windowStart >= API_RATE_WINDOW_MS) {
    rateBuckets.set(meta.ip, { count: 1, windowStart: now, loggedInWindow: false });
    next();
    return;
  }

  existing.count += 1;
  if (existing.count > API_RATE_MAX_REQUESTS) {
    if (!existing.loggedInWindow) {
      existing.loggedInWindow = true;
      logSecurityEvent({
        req,
        category: 'api',
        eventType: 'API_RATE_LIMIT_EXCEEDED',
        severity: 'warning',
        endpoint: req.originalUrl,
        accountIdentifier: meta.ip,
        actionTaken: `Rate limit exceeded (${existing.count} requests in 60s window)`,
        result: 'Blocked (HTTP 429)',
        suspicious: true,
        notifyAdmin: true,
        notificationTitle: 'API Rate Limit Triggered',
      });
    }
    const retryAfter = Math.max(
      1,
      Math.ceil((existing.windowStart + API_RATE_WINDOW_MS - now) / 1000)
    );
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({
      error: 'Too many requests from this network. Please slow down and try again shortly.',
    });
    return;
  }

  next();
}

// --- Magic-byte & Extension File Upload Validation (Images & Videos) ---
const ALLOWED_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov']);
const ALLOWED_VIDEO_MIMES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_VIDEO_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

export function validateAdminMediaUploadPayload(params: {
  filename: unknown;
  mimeType: unknown;
  sizeBytes: unknown;
  magicBytesBase64: unknown;
}):
  | { ok: true; safeExtension: string; mediaType: 'image' | 'video' }
  | { ok: false; error: string } {
  const { filename, mimeType, sizeBytes, magicBytesBase64 } = params;

  if (typeof filename !== 'string' || !filename.trim() || filename.length > 200) {
    return { ok: false, error: 'Invalid filename.' };
  }
  if (
    filename.includes('..') ||
    filename.includes('/') ||
    filename.includes('\\') ||
    filename.includes('\0')
  ) {
    return { ok: false, error: 'Filename contains disallowed path characters.' };
  }

  const ext = path.extname(filename.trim()).toLowerCase();
  const isImageExt = ALLOWED_IMAGE_EXTS.has(ext);
  const isVideoExt = ALLOWED_VIDEO_EXTS.has(ext);

  if (!isImageExt && !isVideoExt) {
    return {
      ok: false,
      error: `Disallowed file extension "${ext || 'none'}". Only .jpg, .jpeg, .png, .webp images and .mp4, .webm, .mov videos are allowed.`,
    };
  }

  const mimeLower = typeof mimeType === 'string' ? mimeType.toLowerCase().trim() : '';
  if (isImageExt && !ALLOWED_IMAGE_MIMES.has(mimeLower)) {
    return {
      ok: false,
      error: 'Disallowed MIME type. Only image/jpeg, image/png, and image/webp are accepted for photos.',
    };
  }
  if (isVideoExt && !ALLOWED_VIDEO_MIMES.has(mimeLower)) {
    return {
      ok: false,
      error: 'Disallowed MIME type. Only video/mp4, video/webm, and video/quicktime are accepted for videos.',
    };
  }

  const size = Number(sizeBytes);
  const maxBytes = isVideoExt ? MAX_VIDEO_UPLOAD_BYTES : MAX_IMAGE_UPLOAD_BYTES;
  if (!Number.isFinite(size) || size <= 0 || size > maxBytes) {
    return {
      ok: false,
      error: isVideoExt
        ? 'Video size must be between 1 byte and 50 MB.'
        : 'Image size must be between 1 byte and 10 MB.',
    };
  }

  if (typeof magicBytesBase64 !== 'string' || !magicBytesBase64) {
    return { ok: false, error: 'File signature header bytes are required for verification.' };
  }

  const buf = Buffer.from(magicBytesBase64, 'base64');
  if (buf.length < 4) {
    return { ok: false, error: 'File is too small or corrupted.' };
  }

  if (isImageExt) {
    const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    const isPng =
      buf.length >= 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a;
    const isWebp =
      buf.length >= 12 &&
      buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buf.subarray(8, 12).toString('ascii') === 'WEBP';

    if (mimeLower === 'image/jpeg' && !isJpeg) {
      return { ok: false, error: 'File content does not match JPEG magic bytes.' };
    }
    if (mimeLower === 'image/png' && !isPng) {
      return { ok: false, error: 'File content does not match PNG magic bytes.' };
    }
    if (mimeLower === 'image/webp' && !isWebp) {
      return { ok: false, error: 'File content does not match WebP magic bytes.' };
    }

    return { ok: true, safeExtension: ext, mediaType: 'image' };
  }

  // Video magic byte validation (ISO BMFF ftyp/moov/wide/mdat for MP4/MOV; EBML 0x1A45DFA3 for WebM)
  const isWebm =
    buf.length >= 4 &&
    buf[0] === 0x1a &&
    buf[1] === 0x45 &&
    buf[2] === 0xdf &&
    buf[3] === 0xa3;
  const boxTag = buf.length >= 8 ? buf.subarray(4, 8).toString('ascii') : '';
  const isIsoBaseMedia =
    boxTag === 'ftyp' || boxTag === 'moov' || boxTag === 'mdat' || boxTag === 'wide' || boxTag === 'free';

  if (mimeLower === 'video/webm' && !isWebm) {
    return { ok: false, error: 'File content does not match WebM signature bytes.' };
  }
  if ((mimeLower === 'video/mp4' || mimeLower === 'video/quicktime') && !isIsoBaseMedia) {
    return { ok: false, error: 'File content does not match MP4/MOV container signature bytes.' };
  }

  return { ok: true, safeExtension: ext, mediaType: 'video' };
}

export const validateAdminImageUploadPayload = validateAdminMediaUploadPayload;

// --- Server-side Order Pricing & Ownership Verification ---
type FsVal = {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  timestampValue?: string;
};

function unwrapFsFields(fields?: Record<string, FsVal>): Record<string, unknown> {
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

export async function runFirestoreQuery(params: {
  projectId: string;
  databaseId: string;
  collectionId: string;
  parentRelativePath?: string;
  limit?: number;
  bearerToken?: string;
}): Promise<{ ok: boolean; status: number; docs: Array<Record<string, unknown>> }> {
  const { projectId, databaseId, collectionId, parentRelativePath, limit = 300, bearerToken } =
    params;
  const baseDocRoot = `projects/${projectId}/databases/${databaseId}/documents`;
  const targetParent = parentRelativePath
    ? `${baseDocRoot}/${parentRelativePath.replace(/^\/+|\/+$/g, '')}`
    : baseDocRoot;
  const runQueryUrl = `https://firestore.googleapis.com/v1/${targetParent}:runQuery`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }

  const res = await fetch(runQueryUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        limit,
      },
    }),
  });

  if (!res.ok) {
    return { ok: false, status: res.status, docs: [] };
  }

  const rows = (await res.json()) as Array<{ document?: { fields?: Record<string, FsVal> } }>;
  const docs = (Array.isArray(rows) ? rows : [])
    .filter((r) => Boolean(r.document?.fields))
    .map((r) => unwrapFsFields(r.document?.fields));
  return { ok: true, status: res.status, docs };
}

export async function verifyAndComputeOrderAmountFromFirestore(params: {
  req: express.Request;
  bearerToken: string;
  customerUid: string;
  orderId: string;
  clientAmountInRupees: unknown;
  projectId: string | undefined;
  databaseId: string;
}): Promise<
  | { ok: true; verifiedAmountRupees: number }
  | { ok: false; status: number; error: string }
> {
  const { req, bearerToken, customerUid, orderId, clientAmountInRupees, projectId, databaseId } =
    params;

  if (!projectId) {
    return { ok: false, status: 500, error: 'Firebase project configuration missing.' };
  }

  const baseFs = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents`;
  const authHeaders = { Authorization: `Bearer ${bearerToken}` };

  // 1. Fetch order document
  let orderRes: Response;
  try {
    orderRes = await fetch(`${baseFs}/orders/${encodeURIComponent(orderId)}`, {
      headers: authHeaders,
    });
  } catch {
    return { ok: false, status: 502, error: 'Unable to verify order in Firestore.' };
  }

  if (orderRes.status === 403) {
    logSecurityEvent({
      req,
      category: 'payment',
      eventType: 'CROSS_USER_PAYMENT_ACCESS_BLOCKED',
      severity: 'critical',
      endpoint: '/api/payments/create-order',
      accountIdentifier: customerUid,
      actionTaken: `Blocked attempt to initiate payment for another user's order (${orderId})`,
      result: 'Rejected (HTTP 403)',
      suspicious: true,
      notifyAdmin: true,
    });
    return { ok: false, status: 403, error: 'You are not authorized to pay for this order.' };
  }

  if (orderRes.status === 404) {
    logSecurityEvent({
      req,
      category: 'payment',
      eventType: 'PAYMENT_FOR_MISSING_ORDER_BLOCKED',
      severity: 'warning',
      endpoint: '/api/payments/create-order',
      accountIdentifier: customerUid,
      actionTaken: `Rejected payment creation for nonexistent order (${orderId})`,
      result: 'Rejected (HTTP 404)',
      suspicious: true,
    });
    return { ok: false, status: 404, error: 'Order was not found.' };
  }

  if (!orderRes.ok) {
    return { ok: false, status: 502, error: 'Unable to load order record for verification.' };
  }

  const orderDoc = (await orderRes.json()) as { fields?: Record<string, FsVal> };
  const order = unwrapFsFields(orderDoc.fields);

  if (order.customerId !== customerUid) {
    logSecurityEvent({
      req,
      category: 'payment',
      eventType: 'CROSS_USER_PAYMENT_ACCESS_BLOCKED',
      severity: 'critical',
      endpoint: '/api/payments/create-order',
      accountIdentifier: customerUid,
      actionTaken: `Blocked cross-account payment request for order ${orderId}`,
      result: 'Rejected (HTTP 403)',
      suspicious: true,
      notifyAdmin: true,
    });
    return { ok: false, status: 403, error: 'Access denied for this order.' };
  }

  if (
    order.paymentStatus === 'successful' ||
    order.paymentStatus === 'verified' ||
    order.paymentStatus === 'refund_processing' ||
    order.paymentStatus === 'refunded'
  ) {
    logSecurityEvent({
      req,
      category: 'payment',
      eventType: 'DUPLICATE_PAYMENT_INITIATION_BLOCKED',
      severity: 'warning',
      endpoint: '/api/payments/create-order',
      accountIdentifier: customerUid,
      actionTaken: `Blocked duplicate payment initiation for already-paid/refunded order ${orderId}`,
      result: 'Rejected (HTTP 409)',
      suspicious: true,
    });
    return { ok: false, status: 409, error: 'Payment has already been completed for this order.' };
  }

  if (
    order.status === 'REJECTED' ||
    order.status === 'Cancelled' ||
    order.status === 'CONFIRMED' ||
    order.adminAccepted === true ||
    order.adminRejected === true
  ) {
    return { ok: false, status: 409, error: 'This order is no longer eligible for payment.' };
  }

  // 2. Fetch order items, settings, checkout charges, and catalog items via :runQuery & single-doc GET
  const [itemsQuery, settingsRes, chargesQuery, foodQuery, cakeQuery] = await Promise.all([
    runFirestoreQuery({
      projectId,
      databaseId,
      collectionId: 'items',
      parentRelativePath: `orders/${orderId}`,
      limit: 100,
      bearerToken,
    }),
    fetch(`${baseFs}/restaurant_settings/config`),
    runFirestoreQuery({
      projectId,
      databaseId,
      collectionId: 'checkout_charges',
      limit: 100,
    }),
    runFirestoreQuery({
      projectId,
      databaseId,
      collectionId: 'food_menu',
      limit: 300,
    }),
    runFirestoreQuery({
      projectId,
      databaseId,
      collectionId: 'cake_menu',
      limit: 300,
    }),
  ]);

  if (!itemsQuery.ok) {
    return { ok: false, status: 502, error: 'Unable to verify ordered items.' };
  }
  if (!chargesQuery.ok) {
    return { ok: false, status: 502, error: 'Unable to verify checkout charges from Firestore.' };
  }

  const orderItems = itemsQuery.docs;
  if (orderItems.length === 0) {
    logSecurityEvent({
      req,
      category: 'payment',
      eventType: 'EMPTY_ORDER_PAYMENT_BLOCKED',
      severity: 'critical',
      endpoint: '/api/payments/create-order',
      accountIdentifier: customerUid,
      actionTaken: `Blocked payment creation for empty order ${orderId}`,
      result: 'Rejected (HTTP 400)',
      suspicious: true,
      notifyAdmin: true,
    });
    return { ok: false, status: 400, error: 'Order contains no items.' };
  }

  let deliveryFeeSetting = DEFAULT_DELIVERY_CHARGE;
  let handlingFeeSetting = DEFAULT_HANDLING_CHARGE;
  let checkoutChargesConfigured = false;
  if (settingsRes.ok) {
    const sJson = (await settingsRes.json()) as { fields?: Record<string, FsVal> };
    const s = unwrapFsFields(sJson.fields);
    if (typeof s.deliveryCharge === 'number' && s.deliveryCharge >= 0) {
      deliveryFeeSetting = Math.round(s.deliveryCharge);
    }
    if (typeof s.handlingCharge === 'number' && s.handlingCharge >= 0) {
      handlingFeeSetting = Math.round(s.handlingCharge);
    }
    if (s.checkoutChargesConfigured === true) {
      checkoutChargesConfigured = true;
    }
  }

  const checkoutCharges: CheckoutChargeRecord[] = chargesQuery.docs
    .map((d, idx) => normalizeCheckoutCharge(d as Partial<CheckoutChargeRecord>, idx + 1))
    .filter((c): c is CheckoutChargeRecord => c !== null)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  type CatalogInventoryMeta = {
    price: number;
    name: string;
    available: boolean;
    orderableOnline: boolean;
    stockMode: 'unlimited' | 'limited';
    stockQuantity: number;
    stockUnit: string;
    soldOut: boolean;
  };

  const foodPriceMap = new Map<string, CatalogInventoryMeta>();
  for (const f of INITIAL_FOOD_MENU) {
    const norm = normalizeInventoryFields(f);
    foodPriceMap.set(f.id, {
      price: f.originalPrice,
      name: f.name,
      available: norm.available,
      orderableOnline: true,
      stockMode: norm.stockMode,
      stockQuantity: norm.stockQuantity,
      stockUnit: norm.stockUnit,
      soldOut: norm.soldOut,
    });
  }
  if (foodQuery.ok) {
    for (const f of foodQuery.docs) {
      if (typeof f.id === 'string' && typeof f.originalPrice === 'number') {
        const base = foodPriceMap.get(f.id);
        const norm = normalizeInventoryFields({
          category: typeof f.category === 'string' ? f.category : undefined,
          available: typeof f.available === 'boolean' ? f.available : base?.available,
          stockMode: f.stockMode as 'unlimited' | 'limited' | undefined,
          stockQuantity: typeof f.stockQuantity === 'number' ? f.stockQuantity : undefined,
          stockUnit: typeof f.stockUnit === 'string' ? f.stockUnit : undefined,
          lowStockThreshold: typeof f.lowStockThreshold === 'number' ? f.lowStockThreshold : undefined,
          soldOut: typeof f.soldOut === 'boolean' ? f.soldOut : undefined,
        });
        foodPriceMap.set(f.id, {
          price: Math.round(f.originalPrice),
          name: typeof f.name === 'string' && f.name ? f.name : base?.name || f.id,
          available: norm.available,
          orderableOnline: true,
          stockMode: norm.stockMode,
          stockQuantity: norm.stockQuantity,
          stockUnit: norm.stockUnit,
          soldOut: norm.soldOut,
        });
      }
    }
  }

  const cakePriceMap = new Map<string, CatalogInventoryMeta>();
  for (const c of INITIAL_CAKE_MENU) {
    const norm = normalizeInventoryFields(c, { isCake: true });
    cakePriceMap.set(c.id, {
      price: c.originalPrice,
      name: c.name,
      available: norm.available,
      orderableOnline: c.orderableOnline,
      stockMode: norm.stockMode,
      stockQuantity: norm.stockQuantity,
      stockUnit: norm.stockUnit,
      soldOut: norm.soldOut,
    });
  }
  if (cakeQuery.ok) {
    for (const c of cakeQuery.docs) {
      if (typeof c.id === 'string' && typeof c.originalPrice === 'number') {
        const base = cakePriceMap.get(c.id);
        const norm = normalizeInventoryFields(
          {
            available: typeof c.available === 'boolean' ? c.available : base?.available,
            stockMode: c.stockMode as 'unlimited' | 'limited' | undefined,
            stockQuantity: typeof c.stockQuantity === 'number' ? c.stockQuantity : undefined,
            stockUnit: typeof c.stockUnit === 'string' ? c.stockUnit : undefined,
            lowStockThreshold:
              typeof c.lowStockThreshold === 'number' ? c.lowStockThreshold : undefined,
            soldOut: typeof c.soldOut === 'boolean' ? c.soldOut : undefined,
          },
          { isCake: true }
        );
        cakePriceMap.set(c.id, {
          price: Math.round(c.originalPrice),
          name: typeof c.name === 'string' && c.name ? c.name : base?.name || c.id,
          available: norm.available,
          orderableOnline: c.orderableOnline !== false,
          stockMode: norm.stockMode,
          stockQuantity: norm.stockQuantity,
          stockUnit: norm.stockUnit,
          soldOut: norm.soldOut,
        });
      }
    }
  }

  // 3. Recompute effectiveSubtotal from official catalog prices and aggregate stock demand
  let effectiveSubtotal = 0;
  const requestedQtyByProduct = new Map<
    string,
    { catalog: CatalogInventoryMeta; qty: number }
  >();

  for (const item of orderItems) {
    const productId = typeof item.productId === 'string' ? item.productId : '';
    const productType = item.productType === 'cake' ? 'cake' : 'food';
    const qty = typeof item.quantity === 'number' ? Math.round(item.quantity) : 0;

    if (!productId || qty < 1 || qty > 100) {
      logSecurityEvent({
        req,
        category: 'payment',
        eventType: 'PAYMENT_INVALID_ORDER_ITEM_BLOCKED',
        severity: 'critical',
        endpoint: '/api/payments/create-order',
        accountIdentifier: customerUid,
        actionTaken: `Blocked invalid order item in ${orderId}`,
        result: 'Rejected (HTTP 400)',
        suspicious: true,
        notifyAdmin: true,
      });
      return { ok: false, status: 400, error: 'Order contains invalid item quantities.' };
    }

    const catalogItem =
      productType === 'food' ? foodPriceMap.get(productId) : cakePriceMap.get(productId);

    if (!catalogItem || !catalogItem.orderableOnline) {
      logSecurityEvent({
        req,
        category: 'payment',
        eventType: 'PAYMENT_UNKNOWN_CATALOG_ITEM_BLOCKED',
        severity: 'critical',
        endpoint: '/api/payments/create-order',
        accountIdentifier: customerUid,
        actionTaken: `Blocked payment for unavailable or unknown item "${productId}" in order ${orderId}`,
        result: 'Rejected (HTTP 400)',
        suspicious: true,
        notifyAdmin: true,
      });
      return { ok: false, status: 400, error: 'Order references an unavailable catalog item.' };
    }

    if (!catalogItem.available) {
      return {
        ok: false,
        status: 409,
        error: `"${catalogItem.name}" is currently unavailable. Please update your cart before paying.`,
      };
    }

    const aggKey = `${productType}:${productId}`;
    const prevAgg = requestedQtyByProduct.get(aggKey);
    requestedQtyByProduct.set(aggKey, {
      catalog: catalogItem,
      qty: (prevAgg?.qty || 0) + qty,
    });

    const officialUnitPrice = catalogItem.price;

    if (
      typeof item.originalPrice === 'number' &&
      Math.round(item.originalPrice) !== officialUnitPrice
    ) {
      logSecurityEvent({
        req,
        category: 'payment',
        eventType: 'PAYMENT_PRICE_MANIPULATION_BLOCKED',
        severity: 'critical',
        endpoint: '/api/payments/create-order',
        accountIdentifier: customerUid,
        actionTaken: `Detected tampered item price for "${productId}" in order ${orderId}`,
        result: 'Blocked (HTTP 400)',
        suspicious: true,
        notifyAdmin: true,
        details: `Order item originalPrice=${item.originalPrice}, catalog price=${officialUnitPrice}`,
      });
      return {
        ok: false,
        status: 400,
        error: 'Price mismatch detected against official menu pricing.',
      };
    }

    effectiveSubtotal += officialUnitPrice * qty;
  }

  for (const { catalog, qty } of requestedQtyByProduct.values()) {
    if (catalog.stockMode === 'limited') {
      if (catalog.soldOut || catalog.stockQuantity <= 0) {
        return {
          ok: false,
          status: 409,
          error: `"${catalog.name}" is currently sold out. Please remove it from your cart.`,
        };
      }
      if (qty > catalog.stockQuantity) {
        return {
          ok: false,
          status: 409,
          error: `Only ${catalog.stockQuantity} ${catalog.stockUnit.toLowerCase()} remaining for "${catalog.name}". Please adjust your cart.`,
        };
      }
    }
  }

  // 4. Verify coupon discount against Firestore coupon document
  let verifiedCouponDiscount = 0;
  const couponCode =
    typeof order.couponCode === 'string' ? order.couponCode.trim().toUpperCase() : '';
  if (couponCode) {
    const couponRes = await fetch(`${baseFs}/coupons/${encodeURIComponent(couponCode)}`, {
      headers: authHeaders,
    });
    if (!couponRes.ok) {
      logSecurityEvent({
        req,
        category: 'payment',
        eventType: 'PAYMENT_INVALID_COUPON_BLOCKED',
        severity: 'critical',
        endpoint: '/api/payments/create-order',
        accountIdentifier: customerUid,
        actionTaken: `Blocked payment using invalid coupon "${couponCode}" in order ${orderId}`,
        result: 'Rejected (HTTP 400)',
        suspicious: true,
        notifyAdmin: true,
      });
      return { ok: false, status: 400, error: 'Applied coupon could not be verified.' };
    }

    const couponJson = (await couponRes.json()) as { fields?: Record<string, FsVal> };
    const coupon = unwrapFsFields(couponJson.fields);
    const active = coupon.active === true;
    const minOrder = typeof coupon.minOrderAmount === 'number' ? coupon.minOrderAmount : 0;
    const discountValue = typeof coupon.discountValue === 'number' ? coupon.discountValue : 0;
    const discountType = coupon.discountType === 'percentage' ? 'percentage' : 'fixed';
    const usageLimit = typeof coupon.usageLimit === 'number' ? coupon.usageLimit : 0;
    const usedCount = typeof coupon.usedCount === 'number' ? coupon.usedCount : 0;
    const validFromMs =
      typeof coupon.validFrom === 'string' ? Date.parse(coupon.validFrom) : Number.NaN;
    const validUntilMs =
      typeof coupon.validUntil === 'string' ? Date.parse(coupon.validUntil) : Number.NaN;
    const nowMs = Date.now();

    // During checkout batch, usedCount may already be incremented by 1 for this order
    const couponValid =
      active &&
      discountValue > 0 &&
      (discountType !== 'percentage' || discountValue <= 100) &&
      effectiveSubtotal >= minOrder &&
      (!Number.isFinite(validFromMs) || nowMs >= validFromMs) &&
      (!Number.isFinite(validUntilMs) || nowMs <= validUntilMs) &&
      (usageLimit === 0 || usedCount <= usageLimit);

    if (!couponValid) {
      logSecurityEvent({
        req,
        category: 'payment',
        eventType: 'PAYMENT_COUPON_MANIPULATION_BLOCKED',
        severity: 'critical',
        endpoint: '/api/payments/create-order',
        accountIdentifier: customerUid,
        actionTaken: `Blocked ineligible coupon "${couponCode}" on order ${orderId}`,
        result: 'Rejected (HTTP 400)',
        suspicious: true,
        notifyAdmin: true,
      });
      return { ok: false, status: 400, error: 'Applied coupon is expired or ineligible.' };
    }

    if (discountType === 'percentage') {
      verifiedCouponDiscount = Math.round(
        (effectiveSubtotal * Math.min(100, Math.max(0, discountValue))) / 100
      );
    } else {
      verifiedCouponDiscount = Math.round(discountValue);
    }
    verifiedCouponDiscount = Math.max(0, Math.min(verifiedCouponDiscount, effectiveSubtotal));
  }

  const fulfillmentType = order.fulfillmentType === 'collection' ? 'collection' : 'delivery';
  const chargesSummary = computeCheckoutChargesSummary({
    effectiveSubtotal,
    couponDiscount: verifiedCouponDiscount,
    fulfillmentType,
    checkoutCharges,
    settings: {
      deliveryCharge: deliveryFeeSetting,
      handlingCharge: handlingFeeSetting,
      checkoutChargesConfigured,
    },
    chargesConfigured: checkoutChargesConfigured,
  });

  const computedFinalAmount = Math.max(
    1,
    effectiveSubtotal - verifiedCouponDiscount + chargesSummary.chargesTotal
  );

  const storedFinalAmount =
    typeof order.finalAmount === 'number' ? Math.round(order.finalAmount) : -1;
  const clientAmount =
    clientAmountInRupees === undefined ? computedFinalAmount : Number(clientAmountInRupees);

  if (
    storedFinalAmount !== computedFinalAmount ||
    !Number.isInteger(clientAmount) ||
    clientAmount !== computedFinalAmount
  ) {
    logSecurityEvent({
      req,
      category: 'payment',
      eventType: 'PAYMENT_PRICE_MANIPULATION_BLOCKED',
      severity: 'critical',
      endpoint: '/api/payments/create-order',
      accountIdentifier: customerUid,
      actionTaken: `Blocked order amount mismatch on ${orderId}`,
      result: 'Rejected (HTTP 400)',
      suspicious: true,
      notifyAdmin: true,
      details: `Expected ₹${computedFinalAmount}, order doc ₹${storedFinalAmount}, client ₹${String(clientAmountInRupees)} (autoDiscountDefault=${AUTO_DISCOUNT_PER_ITEM})`,
    });
    return {
      ok: false,
      status: 400,
      error: 'Order amount verification failed against server menu pricing.',
    };
  }

  return { ok: true, verifiedAmountRupees: computedFinalAmount };
}

export async function precheckOrderItemsInventoryFromFirestore(params: {
  projectId: string | undefined;
  databaseId: string;
  items: Array<{ productId: string; productType: string; quantity: number }>;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { projectId, databaseId, items } = params;
  if (!projectId) {
    return { ok: false, status: 500, error: 'Firebase project configuration missing.' };
  }

  const [foodQuery, cakeQuery] = await Promise.all([
    runFirestoreQuery({ projectId, databaseId, collectionId: 'food_menu', limit: 300 }),
    runFirestoreQuery({ projectId, databaseId, collectionId: 'cake_menu', limit: 300 }),
  ]);

  type PrecheckMeta = {
    name: string;
    available: boolean;
    orderableOnline: boolean;
    stockMode: 'unlimited' | 'limited';
    stockQuantity: number;
    stockUnit: string;
    soldOut: boolean;
  };

  const foodMap = new Map<string, PrecheckMeta>();
  for (const f of INITIAL_FOOD_MENU) {
    const norm = normalizeInventoryFields(f);
    foodMap.set(f.id, {
      name: f.name,
      available: norm.available,
      orderableOnline: true,
      stockMode: norm.stockMode,
      stockQuantity: norm.stockQuantity,
      stockUnit: norm.stockUnit,
      soldOut: norm.soldOut,
    });
  }
  if (foodQuery.ok) {
    for (const f of foodQuery.docs) {
      if (typeof f.id === 'string') {
        const base = foodMap.get(f.id);
        const norm = normalizeInventoryFields({
          category: typeof f.category === 'string' ? f.category : undefined,
          available: typeof f.available === 'boolean' ? f.available : base?.available,
          stockMode: f.stockMode as 'unlimited' | 'limited' | undefined,
          stockQuantity: typeof f.stockQuantity === 'number' ? f.stockQuantity : undefined,
          stockUnit: typeof f.stockUnit === 'string' ? f.stockUnit : undefined,
          lowStockThreshold:
            typeof f.lowStockThreshold === 'number' ? f.lowStockThreshold : undefined,
          soldOut: typeof f.soldOut === 'boolean' ? f.soldOut : undefined,
        });
        foodMap.set(f.id, {
          name: typeof f.name === 'string' && f.name ? f.name : base?.name || f.id,
          available: norm.available,
          orderableOnline: true,
          stockMode: norm.stockMode,
          stockQuantity: norm.stockQuantity,
          stockUnit: norm.stockUnit,
          soldOut: norm.soldOut,
        });
      }
    }
  }

  const cakeMap = new Map<string, PrecheckMeta>();
  for (const c of INITIAL_CAKE_MENU) {
    const norm = normalizeInventoryFields(c, { isCake: true });
    cakeMap.set(c.id, {
      name: c.name,
      available: norm.available,
      orderableOnline: c.orderableOnline,
      stockMode: norm.stockMode,
      stockQuantity: norm.stockQuantity,
      stockUnit: norm.stockUnit,
      soldOut: norm.soldOut,
    });
  }
  if (cakeQuery.ok) {
    for (const c of cakeQuery.docs) {
      if (typeof c.id === 'string') {
        const base = cakeMap.get(c.id);
        const norm = normalizeInventoryFields(
          {
            available: typeof c.available === 'boolean' ? c.available : base?.available,
            stockMode: c.stockMode as 'unlimited' | 'limited' | undefined,
            stockQuantity: typeof c.stockQuantity === 'number' ? c.stockQuantity : undefined,
            stockUnit: typeof c.stockUnit === 'string' ? c.stockUnit : undefined,
            lowStockThreshold:
              typeof c.lowStockThreshold === 'number' ? c.lowStockThreshold : undefined,
            soldOut: typeof c.soldOut === 'boolean' ? c.soldOut : undefined,
          },
          { isCake: true }
        );
        cakeMap.set(c.id, {
          name: typeof c.name === 'string' && c.name ? c.name : base?.name || c.id,
          available: norm.available,
          orderableOnline: c.orderableOnline !== false,
          stockMode: norm.stockMode,
          stockQuantity: norm.stockQuantity,
          stockUnit: norm.stockUnit,
          soldOut: norm.soldOut,
        });
      }
    }
  }

  const agg = new Map<string, { meta: PrecheckMeta; qty: number }>();
  for (const item of items) {
    const productType = item.productType === 'cake' ? 'cake' : 'food';
    const meta = productType === 'cake' ? cakeMap.get(item.productId) : foodMap.get(item.productId);
    const qty = Math.round(Number(item.quantity) || 0);
    if (!meta || !meta.orderableOnline || qty < 1) {
      return { ok: false, status: 400, error: 'Order includes an unavailable or invalid item.' };
    }
    if (!meta.available) {
      return {
        ok: false,
        status: 409,
        error: `"${meta.name}" is currently unavailable. Please update your cart.`,
      };
    }
    const key = `${productType}:${item.productId}`;
    const prev = agg.get(key);
    agg.set(key, { meta, qty: (prev?.qty || 0) + qty });
  }

  for (const { meta, qty } of agg.values()) {
    if (meta.stockMode === 'limited') {
      if (meta.soldOut || meta.stockQuantity <= 0) {
        return {
          ok: false,
          status: 409,
          error: `"${meta.name}" is currently sold out. Please remove it from your cart.`,
        };
      }
      if (qty > meta.stockQuantity) {
        return {
          ok: false,
          status: 409,
          error: `Only ${meta.stockQuantity} ${meta.stockUnit.toLowerCase()} remaining for "${meta.name}". Please reduce the quantity in your cart.`,
        };
      }
    }
  }

  return { ok: true };
}

// --- Security Overview & Incident Export Builders ---
export function getSecurityOverview(filters?: {
  category?: string;
  severity?: string;
  from?: string;
  to?: string;
}): SecurityOverviewPayload {
  expireStaleLockouts();

  const fromMs = filters?.from ? Date.parse(`${filters.from}T00:00:00`) : Number.NaN;
  const toMs = filters?.to ? Date.parse(`${filters.to}T23:59:59.999`) : Number.NaN;
  const categoryFilter =
    filters?.category && filters.category !== 'all' ? filters.category : null;
  const severityFilter =
    filters?.severity && filters.severity !== 'all' ? filters.severity : null;

  const inDateRange = (iso: string) => {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return true;
    if (Number.isFinite(fromMs) && t < fromMs) return false;
    if (Number.isFinite(toMs) && t > toMs) return false;
    return true;
  };

  const events = store.events.filter((e) => {
    if (!inDateRange(e.timestamp)) return false;
    if (categoryFilter && e.category !== categoryFilter) return false;
    if (severityFilter && e.severity !== severityFilter) return false;
    return true;
  });

  const loginAttempts = store.loginAttempts.filter((a) => inDateRange(a.timestamp));
  const lockouts = store.lockouts.filter((l) => inDateRange(l.lockedAt));
  const notifications = store.notifications.filter((n) => inDateRange(n.timestamp));
  const auditLogs = store.auditLogs.filter((a) => inDateRange(a.timestamp));
  const suspiciousAlerts = events.filter((e) => e.suspicious);

  const now = Date.now();
  const activeSessions = store.activeSessions.map((s) => ({
    ...s,
    active: s.active && !s.revokedAt && Date.parse(s.expiresAt) > now,
  }));

  const configStatus: SecurityConfigurationStatus = {
    razorpaySecretConfigured: Boolean(
      process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
    ),
    razorpayWebhookConfigured: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET),
    adminPasswordEnvOverrides: Boolean(
      process.env.ADMIN_LOCK_KEY_1?.trim() || process.env.ADMIN_LOCK_KEY_2?.trim()
    ),
    maxConsecutiveFailedLogins: ADMIN_MAX_FAILED_ATTEMPTS,
    lockoutDurationMinutes: Math.round(ADMIN_LOCKOUT_MS / 60000),
    sessionTtlHours: 24 * 7,
    cspEnabled: true,
    rateLimiterEnabled: true,
    strictSameOriginCors: true,
    fileUploadValidationEnabled: true,
    persistenceMode: 'File-backed local disk store (.data/security-store.json)',
  };

  return {
    events,
    loginAttempts,
    lockouts,
    activeSessions,
    notifications,
    auditLogs,
    suspiciousAlerts,
    configStatus,
  };
}

function escapeCsvCell(value: unknown): string {
  const s = String(value ?? '');
  if (/[,"\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildIncidentEvidenceExport(
  format: 'json' | 'csv',
  filters?: { category?: string; severity?: string; from?: string; to?: string }
): { filename: string; contentType: string; body: string } {
  const overview = getSecurityOverview(filters);
  const generatedAt = new Date().toISOString();

  if (format === 'csv') {
    const header = [
      'Timestamp',
      'Category',
      'Severity',
      'EventType',
      'Suspicious',
      'IPAddress',
      'Browser',
      'Device',
      'Endpoint',
      'AccountIdentifier',
      'ActionTaken',
      'Result',
      'Details',
    ];
    const rows = overview.events.map((e) =>
      [
        e.timestamp,
        e.category,
        e.severity,
        e.eventType,
        e.suspicious ? 'YES' : 'NO',
        e.ip,
        e.browser,
        e.device,
        e.endpoint,
        e.accountIdentifier,
        e.actionTaken,
        e.result,
        e.details || '',
      ]
        .map(escapeCsvCell)
        .join(',')
    );
    return {
      filename: `zaikora-security-evidence-${Date.now()}.csv`,
      contentType: 'text/csv; charset=utf-8',
      body: [header.join(','), ...rows].join('\n'),
    };
  }

  const report = {
    brand: 'ZAIKORA KITCHENS',
    reportTitle: 'Security Incident & Audit Evidence Export',
    generatedAt,
    disclosure:
      'Generated from real server-recorded logs. No automatic external cybercrime report has been filed; authorised personnel may review and submit this evidence manually if required.',
    filtersApplied: filters || {},
    summary: {
      totalRecordedEvents: overview.events.length,
      suspiciousAlerts: overview.suspiciousAlerts.length,
      recordedLoginAttempts: overview.loginAttempts.length,
      lockoutEvents: overview.lockouts.length,
      adminAuditActions: overview.auditLogs.length,
    },
    suspiciousAlerts: overview.suspiciousAlerts,
    lockouts: overview.lockouts,
    loginAttempts: overview.loginAttempts,
    events: overview.events,
    adminAuditLogs: overview.auditLogs,
  };

  return {
    filename: `zaikora-security-evidence-${Date.now()}.json`,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(report, null, 2),
  };
}
