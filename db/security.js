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
    "default-src 'self'; script-src 'self' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://www.gstatic.com/recaptcha/; connect-src 'self' https://www.google.com/recaptcha/; frame-src https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
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

// ==================== GOOGLE reCAPTCHA v2 SERVER-SIDE VERIFICATION ====================
// NOTE: read the secret lazily so .env loading order does not matter
function getRecaptchaSecret() {
  return process.env.RECAPTCHA_SECRET_KEY || '';
}

export async function verifyRecaptchaResponse(recaptchaResponse, remoteIp = '') {
  if (!getRecaptchaSecret()) {
    // reCAPTCHA not configured -> caller should use the built-in captcha instead
    return null;
  }
  if (!recaptchaResponse || typeof recaptchaResponse !== 'string') {
    throw new Error('Kérlek pipáld be az „Nem vagyok robot” jelölőnégyzetet!');
  }

  const params = new URLSearchParams({
    secret: getRecaptchaSecret(),
    response: recaptchaResponse,
    remoteip: remoteIp
  });

  let json;
  try {
    const r = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: AbortSignal.timeout(8000)
    });
    json = await r.json();
  } catch {
    throw new Error('A robotellenőrzés most nem érhető el, próbáld újra!');
  }

  if (!json.success) {
    throw new Error('A robotellenőrzés sikertelen, jelöld be újra a négyzetet!');
  }
  return true;
}

export function isRecaptchaConfigured() {
  return Boolean(getRecaptchaSecret());
}

// Combined anti-bot gate for registration: honeypot + reCAPTCHA (or built-in captcha fallback)
export async function verifyRegistrationAntiBot(body, remoteIp = '') {
  if (body.website && String(body.website).trim() !== '') {
    throw new Error('Bot védelem aktiválódott!');
  }
  if (isRecaptchaConfigured()) {
    await verifyRecaptchaResponse(body.recaptchaResponse, remoteIp);
    return true;
  }
  return verifyCaptchaChallenge(body.captchaToken, body.captchaAnswer, '');
}

// ==================== ANTI-BOT SVG CAPTCHA GENERATOR ====================
export function generateCaptchaChallenge() {
  // Unambiguous charset (no 0/O, 1/I/L confusion)
  const charset = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let answer = '';
  for (let i = 0; i < 5; i++) {
    answer += charset[crypto.randomInt(0, charset.length)];
  }

  const nonce = crypto.randomBytes(8).toString('hex');
  const exp = Date.now() + 5 * 60 * 1000;
  const rawTokenData = JSON.stringify({ ans: answer, nonce, exp });
  const dataB64 = Buffer.from(rawTokenData, 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SERVER_SECRET).update(dataB64).digest('base64url');
  const captchaToken = `${dataB64}.${sig}`;

  const W = 170;
  const H = 52;
  const palette = ['#f7c948', '#e8b33a', '#ffd97a', '#d49b27', '#f0c75e'];
  const fonts = ['Georgia', 'Verdana', 'Courier New', 'Times New Roman'];

  // Distorted characters: random rotation, skew, vertical offset, size, color and font per glyph
  let charsMarkup = '';
  const step = W / (answer.length + 1);
  [...answer].forEach((ch, i) => {
    const x = step * (i + 1) + (Math.random() * 8 - 4);
    const y = H / 2 + 9 + (Math.random() * 12 - 6);
    const rot = Math.random() * 55 - 27.5;
    const skew = Math.random() * 34 - 17;
    const size = 23 + Math.floor(Math.random() * 8);
    const fill = palette[Math.floor(Math.random() * palette.length)];
    const ff = fonts[Math.floor(Math.random() * fonts.length)];
    charsMarkup += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="${ff}" font-size="${size}" font-weight="bold" fill="${fill}" text-anchor="middle" transform="rotate(${rot.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}) skewX(${skew.toFixed(1)})">${ch}</text>`;
  });

  // Noise: crossing bezier curves through the glyphs
  let noiseMarkup = '';
  for (let i = 0; i < 3; i++) {
    const x1 = Math.random() * 25;
    const y1 = Math.random() * H;
    const x2 = W - Math.random() * 25;
    const y2 = Math.random() * H;
    const cx1 = W * 0.33 + (Math.random() * 40 - 20);
    const cy1 = Math.random() * H;
    const cx2 = W * 0.66 + (Math.random() * 40 - 20);
    const cy2 = Math.random() * H;
    noiseMarkup += `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} C${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="#a07b2f" stroke-width="1.3" fill="none" opacity="0.55"/>`;
  }

  // Noise: random speckles
  let dotsMarkup = '';
  for (let i = 0; i < 45; i++) {
    const cx = (Math.random() * W).toFixed(0);
    const cy = (Math.random() * H).toFixed(0);
    const r = (Math.random() * 1.4 + 0.4).toFixed(1);
    dotsMarkup += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#d49b27" opacity="${(Math.random() * 0.45 + 0.15).toFixed(2)}"/>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" rx="8" fill="#180d05" stroke="#d49b27" stroke-width="1.5"/>${dotsMarkup}${noiseMarkup}${charsMarkup}</svg>`;
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
  if (String(userAnswer || '').trim().toLowerCase() !== String(parsed.ans).toLowerCase()) {
    throw new Error('Hibás biztonsági kód!');
  }

  usedCaptchaNonces.add(parsed.nonce);
  return true;
}
