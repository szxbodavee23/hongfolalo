// Proprietary Honfoglalo Web Server & Hardened REST API
// Copyright (c) 2026 All Rights Reserved. Unauthorized copying or distribution is strictly prohibited.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './db/database.js';
import { roomManager } from './db/roomManager.js';
import {
  checkRateLimit,
  applySecurityHeaders,
  createAuthToken,
  extractAuthUser,
  requireAdminAuth,
  generateCaptchaChallenge,
  verifyCaptchaChallenge
} from './db/security.js';
import { sendVerificationEmail, recentOutboxEmails } from './db/mailer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

// Strict whitelist of public frontend files (blocks access to server.js, db/*, package.json, .env, etc.)
const ALLOWED_STATIC_PATHS = new Set([
  '/index.html',
  '/game.html',
  '/css/portal.css',
  '/css/game.css',
  '/css/style.css',
  '/js/portal.js',
  '/js/gameClient.js',
  '/js/gameEngine.js',
  '/js/mapData.js',
  '/js/audio.js',
  '/js/questions.js'
]);

function sendJson(res, status, data) {
  applySecurityHeaders(res);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      // Strict 32 KB request body limit to prevent memory exhaustion / DoS
      if (raw.length > 32768) {
        req.destroy();
        reject(new Error('Túl nagy adatcsomag!'));
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Érvénytelen JSON formátum!'));
      }
    });
    req.on('error', reject);
  });
}

function getBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['host'] || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

async function handleApi(req, res, pathname, urlObj) {
  try {
    // Global API rate limit: max 180 requests / minute / IP
    const globalLimit = checkRateLimit(req, 'api_global', 180, 60000);
    if (!globalLimit.allowed) {
      return sendJson(res, 429, {
        error: `Túl sok kérés! Kérlek várj ${globalLimit.retryAfterSec} másodpercet.`
      });
    }

    if (req.method === 'GET' && pathname === '/api/status') {
      const status = await db.getStatus();
      return sendJson(res, 200, status);
    }

    // ==================== ANTI-BOT CAPTCHA & EMAIL VERIFICATION ====================
    if (req.method === 'GET' && pathname === '/api/auth/captcha') {
      const limit = checkRateLimit(req, 'captcha', 30, 60000);
      if (!limit.allowed) return sendJson(res, 429, { error: 'Túl sok CAPTCHA kérés!' });
      const challenge = generateCaptchaChallenge();
      return sendJson(res, 200, { ok: true, ...challenge });
    }

    if (req.method === 'POST' && pathname === '/api/auth/register') {
      const limit = checkRateLimit(req, 'auth_register', 8, 300000);
      if (!limit.allowed) {
        return sendJson(res, 429, {
          error: `Túl sok regisztrációs próbálkozás! Várj ${limit.retryAfterSec} mp-et.`
        });
      }
      const body = await parseBody(req);
      verifyCaptchaChallenge(body.captchaToken, body.captchaAnswer, body.website);

      const { user, verificationCode } = await db.registerUser(body);
      const mailRes = await sendVerificationEmail({
        toEmail: user.email,
        username: user.username,
        code: verificationCode,
        baseUrl: getBaseUrl(req)
      });

      return sendJson(res, 201, {
        ok: true,
        requiresVerification: true,
        email: user.email,
        username: user.username,
        emailSent: mailRes.sent,
        provider: mailRes.provider
      });
    }

    if (req.method === 'POST' && pathname === '/api/auth/verify-email') {
      const limit = checkRateLimit(req, 'auth_verify', 10, 300000);
      if (!limit.allowed) {
        return sendJson(res, 429, { error: 'Túl sok próbálkozás! Kérlek várj.' });
      }
      const body = await parseBody(req);
      const user = await db.verifyUserEmail({ email: body.email, code: body.code });
      const authToken = createAuthToken(user);
      return sendJson(res, 200, { ok: true, user, authToken });
    }

    if (req.method === 'GET' && pathname === '/api/auth/verify-link') {
      const email = urlObj.searchParams.get('email') || '';
      const code = urlObj.searchParams.get('code') || '';
      await db.verifyUserEmail({ email, code });
      applySecurityHeaders(res);
      res.writeHead(302, { Location: `/?verified=1&email=${encodeURIComponent(email)}` });
      res.end();
      return;
    }

    if (req.method === 'POST' && pathname === '/api/auth/resend-code') {
      const limit = checkRateLimit(req, 'auth_resend', 5, 300000);
      if (!limit.allowed) {
        return sendJson(res, 429, { error: 'Túl sok újraküldési kérés! Kérlek várj pár percet.' });
      }
      const body = await parseBody(req);
      const { user, verificationCode } = await db.resendVerificationCode({ email: body.email });
      const mailRes = await sendVerificationEmail({
        toEmail: user.email,
        username: user.username,
        code: verificationCode,
        baseUrl: getBaseUrl(req)
      });
      return sendJson(res, 200, { ok: true, emailSent: mailRes.sent });
    }

    if (req.method === 'POST' && pathname === '/api/auth/login') {
      const limit = checkRateLimit(req, 'auth_login', 12, 60000);
      if (!limit.allowed) {
        return sendJson(res, 429, {
          error: `Túl sok belépési kísérlet! Kérlek várj ${limit.retryAfterSec} másodpercet.`
        });
      }
      const body = await parseBody(req);
      try {
        const user = await db.loginUser(body);
        const authToken = createAuthToken(user);
        return sendJson(res, 200, { ok: true, user, authToken });
      } catch (err) {
        if (err.requiresVerification) {
          return sendJson(res, 403, {
            error: err.message,
            requiresVerification: true,
            email: err.email
          });
        }
        throw err;
      }
    }

    // ==================== ONLINE MULTIPLAYER ROOMS ====================
    if (req.method === 'POST' && pathname === '/api/rooms') {
      const body = await parseBody(req);
      const created = await roomManager.createRoom(body);
      return sendJson(res, 201, { ok: true, ...created });
    }

    if (req.method === 'POST' && pathname === '/api/rooms/join') {
      const body = await parseBody(req);
      const joined = roomManager.joinRoom(body);
      return sendJson(res, 200, { ok: true, ...joined });
    }

    const roomMatch = pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)(?:\/([a-z-]+))?$/);
    if (roomMatch) {
      const code = roomMatch[1].toUpperCase();
      const action = roomMatch[2] || '';
      const queryToken = urlObj.searchParams.get('token') || '';

      if (req.method === 'GET' && action === 'stream') {
        applySecurityHeaders(res);
        return roomManager.subscribeSse(code, queryToken, res);
      }

      if (req.method === 'GET' && !action) {
        const state = roomManager.getRoomState(code, queryToken);
        return sendJson(res, 200, { ok: true, state });
      }

      if (req.method === 'POST' && action === 'start') {
        const body = await parseBody(req);
        const state = roomManager.startRoomGame(code, body.token, body);
        return sendJson(res, 200, { ok: true, state });
      }

      if (req.method === 'POST' && action === 'select-county') {
        const body = await parseBody(req);
        const state = roomManager.selectCountyAction(code, body.token, body.countyId);
        return sendJson(res, 200, { ok: true, state });
      }

      if (req.method === 'POST' && action === 'answer') {
        const body = await parseBody(req);
        const state = roomManager.submitPlayerAnswer(code, body.token, body);
        return sendJson(res, 200, { ok: true, state });
      }

      if (req.method === 'POST' && action === 'continue') {
        const body = await parseBody(req);
        const state = roomManager.playerContinueReveal(code, body.token);
        return sendJson(res, 200, { ok: true, state });
      }

      if (req.method === 'POST' && action === 'lifeline') {
        const body = await parseBody(req);
        const state = roomManager.useLifeline(code, body.token, body.lifeline);
        return sendJson(res, 200, { ok: true, state });
      }

      if (req.method === 'POST' && action === 'chat') {
        const body = await parseBody(req);
        const state = roomManager.sendChatMessage(code, body.token, body.message);
        return sendJson(res, 200, { ok: true, state });
      }

      if (req.method === 'POST' && action === 'invite') {
        const body = await parseBody(req);
        const state = roomManager.inviteRegisteredUser(code, body.token, body.targetUsername);
        return sendJson(res, 200, { ok: true, state });
      }
    }

    if (req.method === 'GET' && pathname === '/api/invites') {
      const username = urlObj.searchParams.get('username') || '';
      const invites = roomManager.getPendingInvites(username);
      return sendJson(res, 200, { ok: true, invites });
    }

    if (req.method === 'POST' && pathname === '/api/invites/dismiss') {
      const body = await parseBody(req);
      roomManager.dismissInvite(body.username, body.roomCode);
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'GET' && pathname === '/api/questions') {
      const questions = await db.getQuestions();
      return sendJson(res, 200, questions);
    }

    if (req.method === 'GET' && pathname === '/api/questions/my') {
      const username = urlObj.searchParams.get('username') || '';
      const submitted = await db.getUserSubmittedQuestions(username);
      return sendJson(res, 200, { questions: submitted });
    }

    if (req.method === 'POST' && pathname === '/api/questions') {
      const limit = checkRateLimit(req, 'submit_question', 15, 60000);
      if (!limit.allowed) return sendJson(res, 429, { error: 'Túl sok kérdésbeküldés!' });
      const body = await parseBody(req);
      const authUser = extractAuthUser(req);
      const isAdmin = Boolean(authUser && authUser.adm && authUser.usr === 'admin_user');
      const created = await db.createQuestion({
        ...body,
        createdBy: authUser ? authUser.usr : body.createdBy || 'Játékos',
        isAdmin
      });
      return sendJson(res, 201, { ok: true, question: created });
    }

    // ==================== PROTECTED ADMIN ENDPOINTS (admin_user ONLY) ====================
    if (pathname.startsWith('/api/admin/')) {
      requireAdminAuth(req);

      if (req.method === 'GET' && pathname === '/api/admin/questions') {
        const data = await db.getAllQuestionsForAdmin();
        return sendJson(res, 200, data);
      }

      if (req.method === 'GET' && pathname === '/api/admin/outbox') {
        return sendJson(res, 200, { emails: recentOutboxEmails });
      }

      const approveMatch = pathname.match(/^\/api\/admin\/questions\/(\d+)\/approve$/);
      if (req.method === 'POST' && approveMatch) {
        const result = await db.approveQuestion(approveMatch[1]);
        return sendJson(res, 200, { ok: true, ...result });
      }

      const delQMatch = pathname.match(/^\/api\/admin\/questions\/(\d+)$/);
      if (req.method === 'DELETE' && delQMatch) {
        const result = await db.deleteQuestion(delQMatch[1]);
        return sendJson(res, 200, { ok: true, ...result });
      }

      if (req.method === 'GET' && pathname === '/api/admin/users') {
        const users = await db.getAllUsersForAdmin();
        return sendJson(res, 200, { users });
      }

      const adminUserMatch = pathname.match(/^\/api\/admin\/users\/(\d+)$/);
      if (adminUserMatch) {
        const uid = adminUserMatch[1];
        if (req.method === 'PATCH') {
          const body = await parseBody(req);
          const result = await db.updateUserByAdmin(uid, body);
          return sendJson(res, 200, { ok: true, ...result });
        }
        if (req.method === 'DELETE') {
          const result = await db.deleteUserByAdmin(uid);
          return sendJson(res, 200, { ok: true, ...result });
        }
      }
    }

    if (req.method === 'GET' && pathname === '/api/users') {
      const users = await db.getLeaderboard();
      return sendJson(res, 200, { users });
    }

    if (req.method === 'GET' && pathname === '/api/matches') {
      const matches = await db.getRecentMatches();
      return sendJson(res, 200, { matches });
    }

    if (req.method === 'POST' && pathname === '/api/matches') {
      const body = await parseBody(req);
      const match = await db.recordMatch(body);
      return sendJson(res, 201, { ok: true, match });
    }

    return sendJson(res, 404, { error: 'API végpont nem található!' });
  } catch (err) {
    const status = err.message?.includes('Nincs jogosultságod') ? 403 : 400;
    return sendJson(res, status, { error: err.message || 'Szerver hiba' });
  }
}

function serveStatic(req, res, pathname) {
  applySecurityHeaders(res);
  const safePath = pathname === '/' ? '/index.html' : pathname;

  // Enforce strict whitelist so backend source files, DB files, and configs can NEVER be downloaded
  if (!ALLOWED_STATIC_PATHS.has(safePath)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden – Access Denied');
    return;
  }

  const resolvedPath = path.normalize(path.join(__dirname, safePath));
  if (!resolvedPath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(resolvedPath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(resolvedPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    });
    res.end(content);
  });
}

async function start() {
  await db.init();

  const server = http.createServer(async (req, res) => {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = urlObj.pathname;

    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, pathname, urlObj);
    } else {
      serveStatic(req, res, pathname);
    }
  });

  // Protect against Slowloris / hanging connections
  server.headersTimeout = 15000;
  server.requestTimeout = 20000;

  server.listen(PORT, () => {
    console.log(`[Honfoglalo] Hardened Server running at http://localhost:${PORT}`);
  });
}

start();
