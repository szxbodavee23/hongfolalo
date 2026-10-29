// Web Application Security, Rate Limiting, Signed Auth Tokens & Anti-Bot CAPTCHA
import crypto from 'crypto';

const SERVER_SECRET =
  process.env.AUTH_SECRET ||
  crypto.createHash('sha256').update('honfoglalo_proprietary_secret_key_2026').digest('hex');

const rateLimitStore = new Map();
const usedCaptchaNonces = new Set();

// Periodically clean up expired rate limit buckets
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }
  if (usedCaptchaNonces.size > 5000) {
    usedCaptchaNonces.clear();
  }
}, 60000).unref();

export function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

export function checkRateLimit(req, bucketName, maxRequests = 60, windowMs = 60000) {
  const ip = getClientIp(req);
  const key = `${bucketName}:${ip}`;
  const now = Date.now();
  let record = rateLimitStore.get(key);

  if (!record || now > record.resetAt) {
    record = { count: 0, resetAt: now + windowMs };
    rateLimitStore.set(key, record);
  }

  record.count += 1;
  if (record.count > maxRequests) {
    return { allowed: false, retryAfterSec: Math.ceil((record.resetAt - now) / 1000) };
  }
  return { allowed: true };
}

export function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  );
}

// ==================== SIGNED HMAC-SHA256 AUTH TOKENS ====================
export function createAuthToken(user) {
  const payload = {
    uid: user.id,
    usr: user.username,
    role: user.role || (user.isAdmin ? 'admin' : 'user'),
    adm: Boolean(user.isAdmin || user.username === 'admin_user'),
    exp: Date.now() + 12 * 60 * 60 * 1000 // 12 hours
  };
  const dataB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SERVER_SECRET).update(dataB64).digest('base64url');
  return `${dataB64}.${sig}`;
}

export function verifyAuthToken(tokenStr) {
  if (!tokenStr || typeof tokenStr !== 'string' || !tokenStr.includes('.')) {
    return null;
  }
  const [dataB64, sig] = tokenStr.split('.');
  if (!dataB64 || !sig) return null;

  const expectedSig = crypto.createHmac('sha256', SERVER_SECRET).update(dataB64).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(dataB64, 'base64url').toString('utf8'));
    if (!payload.exp || Date.now() > payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function extractAuthUser(req) {
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    return verifyAuthToken(authHeader.slice(7).trim());
  }
  return null;
}

export function requireAdminAuth(req) {
  const user = extractAuthUser(req);
  if (!user || !user.adm || user.usr !== 'admin_user') {
    throw new Error('Nincs jogosultságod ehhez a művelethez (Admin belépés szükséges)!');
  }
  return user;
}

// ==================== ANTI-BOT SVG CAPTCHA GENERATOR ====================
export function generateCaptchaChallenge() {
  const a = Math.floor(11 + Math.random() * 28);
  const b = Math.floor(4 + Math.random() * 19);
  const ops = ['+', '-'];
  const op = ops[Math.floor(Math.random() * ops.length)];
  const answer = op === '+' ? a + b : a - b;
  const label = `${a} ${op} ${b} = ?`;

  const nonce = crypto.randomBytes(8).toString('hex');
  const exp = Date.now() + 5 * 60 * 1000;
  const rawTokenData = JSON.stringify({ ans: String(answer), nonce, exp });
  const dataB64 = Buffer.from(rawTokenData, 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SERVER_SECRET).update(dataB64).digest('base64url');
  const captchaToken = `${dataB64}.${sig}`;

  // Generate an obfuscated SVG image so simple DOM-scraping bots cannot read plain text
  const y1 = 10 + Math.floor(Math.random() * 25);
  const y2 = 15 + Math.floor(Math.random() * 25);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="44" viewBox="0 0 150 44">
    <rect width="150" height="44" rx="8" fill="#180d05" stroke="#d49b27" stroke-width="1.5"/>
    <line x1="8" y1="${y1}" x2="142" y2="${y2}" stroke="#754c24" stroke-width="1.5" opacity="0.6"/>
    <line x1="15" y1="${40 - y1}" x2="135" y2="${y1}" stroke="#f5c445" stroke-width="1" opacity="0.35"/>
    <text x="75" y="29" font-family="monospace" font-size="20" font-weight="bold" fill="#f7c948" text-anchor="middle" letter-spacing="2">${label}</text>
  </svg>`;
  const svgDataUri = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;

  return {
    captchaToken,
    svgDataUri
  };
}

export function verifyCaptchaChallenge(captchaToken, userAnswer, honeypotValue = '') {
  if (honeypotValue && String(honeypotValue).trim() !== '') {
    throw new Error('Bot védelem aktiválódott!');
  }
  if (!captchaToken || typeof captchaToken !== 'string' || !captchaToken.includes('.')) {
    throw new Error('Hiányzó biztonsági ellenőrzőkód!');
  }
  const [dataB64, sig] = captchaToken.split('.');
  const expectedSig = crypto.createHmac('sha256', SERVER_SECRET).update(dataB64).digest('base64url');
  const sigBuf = Buffer.from(sig || '');
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    throw new Error('Érvénytelen biztonsági ellenőrzőkód!');
  }

  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(dataB64, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Érvénytelen biztonsági ellenőrzőkód!');
  }

  if (!parsed.exp || Date.now() > parsed.exp) {
    throw new Error('A biztonsági ellenőrzőkód lejárt, kérlek kérj újat!');
  }
  if (usedCaptchaNonces.has(parsed.nonce)) {
    throw new Error('Ezt az ellenőrzőkódot már felhasználták!');
  }
  if (String(userAnswer || '').trim() !== String(parsed.ans)) {
    throw new Error('Hibás válasz a biztonsági számtani feladatra!');
  }

  usedCaptchaNonces.add(parsed.nonce);
  return true;
}
