const ALLOWED_EXTERNAL_HOST_PATTERNS: RegExp[] = [
  /(^|\.)razorpay\.com$/i,
  /^apis\.google\.com$/i,
  /(^|\.)firebaseapp\.com$/i,
  /(^|\.)firebaseio\.com$/i,
  /(^|\.)googleapis\.com$/i,
  /^identitytoolkit\.googleapis\.com$/i,
  /^securetoken\.googleapis\.com$/i,
  /^www\.google\.com$/i,
  /^www\.gstatic\.com$/i,
  /^recaptcha\.google\.com$/i,
  /^fonts\.googleapis\.com$/i,
  /^fonts\.gstatic\.com$/i,
];

const WATERMARK_ATTR_NAMES = [
  'data-netlify-deploy-id',
  'data-netlify-site-id',
  'data-powered-by',
  'data-deploy-badge',
  'data-watermark',
  'data-brand-watermark',
];

const WATERMARK_SELECTOR_KEYWORDS =
  /(netlify[-_]?drawer|__netlify|powered[-_]?by|deploy[-_]?badge|deploy[-_]?watermark|brand[-_]?watermark|ad[-_]?watermark)/i;

const WATERMARK_TEXT_PATTERN =
  /\bpowered\s+by\s+(deploy|netlify|vercel|cloudflare|render|railway|surge|fly\.io|heroku|wix|webflow|framer|wordpress|shopify|squarespace|hostinger|godaddy)\b/i;

const GENERIC_POWERED_BY_LINE_PATTERN = /^\s*powered\s+by\s+[a-z0-9._\s-]{2,40}$/i;

const WATERMARK_URL_PATTERN =
  /(netlify\.com|netlify\.app\/.*drawer|deploy-preview|powered[-_]?by|adservice|doubleclick|googlesyndication)/i;

const BENIGN_EXTENSION_MARKERS =
  /(grammarly|1password|bitwarden|lastpass|dashlane|protonpass|keeper|honey|rakuten|loom|vite-error-overlay)/i;

export function isAllowedHostOrigin(urlValue: string | null | undefined, currentOrigin?: string): boolean {
  if (!urlValue) return true;
  const trimmed = urlValue.trim();
  if (!trimmed) return true;

  if (
    trimmed.startsWith('/') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('about:blank') ||
    trimmed.startsWith('javascript:void')
  ) {
    return true;
  }

  try {
    const base = currentOrigin || (typeof window !== 'undefined' ? window.location.origin : 'https://localhost');
    const parsed = new URL(trimmed, base);
    if (parsed.origin === base) {
      return true;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    const hostname = parsed.hostname.toLowerCase();
    return ALLOWED_EXTERNAL_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
  } catch {
    return false;
  }
}

function getElementClassString(el: Element): string {
  if (typeof el.className === 'string') return el.className;
  if (el.classList && el.classList.length > 0) return Array.from(el.classList).join(' ');
  return el.getAttribute('class') || '';
}

function getElementIdentity(el: Element): string {
  return [
    el.tagName,
    el.id || '',
    getElementClassString(el),
    el.getAttribute('aria-label') || '',
    el.getAttribute('title') || '',
    el.getAttribute('data-testid') || '',
  ].join(' ');
}

export function isAllowlistedExternalElement(el: Element): boolean {
  const tag = el.tagName.toUpperCase();

  // Core document & React mount root (everything inside #root is official app UI)
  if (tag === 'HTML' || tag === 'HEAD' || tag === 'BODY' || tag === 'TITLE' || tag === 'META' || tag === 'LINK' || tag === 'NOSCRIPT') {
    return true;
  }
  if (el.id === 'root' || el.closest('#root') !== null) {
    return true;
  }

  // Legitimate styles inside <head> (Tailwind, Google Fonts, Vite)
  if (tag === 'STYLE' && el.closest('head') !== null) {
    return true;
  }

  const identity = getElementIdentity(el);

  // Razorpay checkout overlay, backdrop, iframes, & scripts
  if (/razorpay/i.test(identity)) {
    return true;
  }
  if (el.closest('.razorpay-container, .razorpay-backdrop, [id*="razorpay" i], [class*="razorpay" i]')) {
    return true;
  }

  // Firebase Auth & Google reCAPTCHA containers
  if (/(grecaptcha|recaptcha|firebase)/i.test(identity)) {
    return true;
  }
  if (el.closest('[class*="grecaptcha" i], [id*="recaptcha" i]')) {
    return true;
  }

  // Benign browser extensions (password managers / dev overlay)
  if (BENIGN_EXTENSION_MARKERS.test(identity)) {
    return true;
  }

  // Allowlisted iframe or script source
  if (tag === 'IFRAME' || tag === 'SCRIPT') {
    const src = el.getAttribute('src');
    if (src && isAllowedHostOrigin(src)) {
      return true;
    }
  }

  return false;
}

function collectElementTextAndLinks(el: Element): { text: string; links: string[] } {
  const parts: string[] = [];
  const links: string[] = [];

  const aria = el.getAttribute('aria-label');
  const title = el.getAttribute('title');
  const alt = el.getAttribute('alt');
  if (aria) parts.push(aria);
  if (title) parts.push(title);
  if (alt) parts.push(alt);

  if (el.textContent) {
    parts.push(el.textContent.slice(0, 600));
  }

  if ('shadowRoot' in el && (el as HTMLElement).shadowRoot) {
    const shadow = (el as HTMLElement).shadowRoot;
    if (shadow?.textContent) {
      parts.push(shadow.textContent.slice(0, 600));
    }
    shadow?.querySelectorAll('a[href], iframe[src]').forEach((child) => {
      const href = child.getAttribute('href') || child.getAttribute('src');
      if (href) links.push(href);
    });
  }

  const ownHref = el.getAttribute('href') || el.getAttribute('src');
  if (ownHref) links.push(ownHref);

  el.querySelectorAll('a[href], iframe[src], img[src]').forEach((child) => {
    const href = child.getAttribute('href') || child.getAttribute('src');
    if (href) links.push(href);
  });

  return {
    text: parts.join(' ').replace(/\s+/g, ' ').trim(),
    links,
  };
}

export function shouldBlockExternalElement(el: Element): boolean {
  if (isAllowlistedExternalElement(el)) {
    return false;
  }

  const tag = el.tagName.toUpperCase();

  // Never allow injected plugin objects/embeds outside #root
  if (tag === 'OBJECT' || tag === 'EMBED') {
    return true;
  }

  // Block unauthorized external scripts outside allowlisted hosts
  if (tag === 'SCRIPT') {
    const src = el.getAttribute('src');
    if (src && !isAllowedHostOrigin(src)) {
      return true;
    }
    const inlineCode = (el.textContent || '').slice(0, 2000);
    if (WATERMARK_TEXT_PATTERN.test(inlineCode) || WATERMARK_SELECTOR_KEYWORDS.test(inlineCode)) {
      return true;
    }
    return false;
  }

  // Block unauthorized external iframes outside allowlisted hosts
  if (tag === 'IFRAME') {
    const src = el.getAttribute('src');
    if (src && !isAllowedHostOrigin(src)) {
      return true;
    }
    if (src && WATERMARK_URL_PATTERN.test(src)) {
      return true;
    }
  }

  // Known hosting / powered-by attributes
  for (const attr of WATERMARK_ATTR_NAMES) {
    if (el.hasAttribute(attr)) {
      return true;
    }
  }

  const identity = getElementIdentity(el);
  if (WATERMARK_SELECTOR_KEYWORDS.test(identity)) {
    return true;
  }

  // Tag names created by external hosting wrappers (e.g. <netlify-drawer>, <deploy-badge>)
  if (/(NETLIFY|DEPLOY-BADGE|POWERED-BY|WATERMARK)/i.test(tag)) {
    return true;
  }

  const { text, links } = collectElementTextAndLinks(el);

  // Explicit "Powered by Deploy" / "Powered by Netlify" / ad badge text outside #root
  if (WATERMARK_TEXT_PATTERN.test(text) || GENERIC_POWERED_BY_LINE_PATTERN.test(text)) {
    return true;
  }

  // External promo/deploy URLs attached outside #root
  if (links.some((url) => WATERMARK_URL_PATTERN.test(url) || (!isAllowedHostOrigin(url) && el.parentElement === document.body))) {
    // Only remove body-level external anchor/banner wrappers pointing to unapproved external sites
    if (links.some((url) => WATERMARK_URL_PATTERN.test(url))) {
      return true;
    }
    if (typeof window !== 'undefined' && el instanceof HTMLElement) {
      const style = window.getComputedStyle(el);
      if (style.position === 'fixed' || style.position === 'sticky') {
        return true;
      }
    }
  }

  // Catch floating fixed corner/bottom banners outside #root that declare fixed positioning with visible pill/bar text
  if (typeof window !== 'undefined' && el instanceof HTMLElement && el.parentElement === document.body) {
    const style = window.getComputedStyle(el);
    if ((style.position === 'fixed' || style.position === 'sticky') && text.length > 0 && text.length <= 120) {
      if (/\b(powered\s*by|hosted\s*(on|by)|deployed\s*(on|with|by)|netlify|made\s*with)\b/i.test(text)) {
        return true;
      }
    }
  }

  return false;
}

export function neutralizeElement(el: Element): boolean {
  try {
    if (el.tagName.toUpperCase() === 'SCRIPT') {
      el.setAttribute('type', 'javascript/blocked');
      el.removeAttribute('src');
    }
    if (el instanceof HTMLElement) {
      el.style.setProperty('display', 'none', 'important');
      el.style.setProperty('visibility', 'hidden', 'important');
      el.style.setProperty('pointer-events', 'none', 'important');
    }
    el.remove();
    return true;
  } catch {
    return false;
  }
}

export function sweepInjectedWatermarks(root: ParentNode = document): number {
  if (typeof document === 'undefined') return 0;

  let removedCount = 0;
  const appRoot = document.getElementById('root');

  // Sweep direct children of <html> and <body> outside #root first
  const topContainers: Element[] = [];
  if (document.documentElement) {
    topContainers.push(...Array.from(document.documentElement.children));
  }
  if (document.body) {
    topContainers.push(...Array.from(document.body.children));
  }

  for (const el of topContainers) {
    if (el === appRoot || (appRoot && appRoot.contains(el))) continue;
    if (shouldBlockExternalElement(el)) {
      if (neutralizeElement(el)) {
        removedCount += 1;
      }
    }
  }

  // Also scan any script/iframe/known watermark selector anywhere outside #root
  const candidateSelectors = [
    'script[src]',
    'iframe',
    'object',
    'embed',
    '[data-netlify-deploy-id]',
    '[data-powered-by]',
    '[id*="netlify" i]',
    '[class*="netlify" i]',
    '[id*="powered-by" i]',
    '[class*="powered-by" i]',
    '[id*="deploy-badge" i]',
    '[class*="deploy-badge" i]',
  ].join(', ');

  try {
    const candidates = root.querySelectorAll(candidateSelectors);
    candidates.forEach((el) => {
      if (el === appRoot || (appRoot && appRoot.contains(el))) return;
      if (shouldBlockExternalElement(el)) {
        if (neutralizeElement(el)) {
          removedCount += 1;
        }
      }
    });
  } catch {
    // Fallback if a selector is unsupported in an older engine
  }

  return removedCount;
}
