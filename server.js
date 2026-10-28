// Honfoglalo Web Server & REST API (Backed by Docker PostgreSQL)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './db/database.js';
import { roomManager } from './db/roomManager.js';

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

function sendJson(res, status, data) {
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
      if (raw.length > 1e6) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

async function handleApi(req, res, pathname, urlObj) {
  try {
    if (req.method === 'GET' && pathname === '/api/status') {
      const status = await db.getStatus();
      return sendJson(res, 200, status);
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
      const body = await parseBody(req);
      const isAdmin = String(body.createdBy || '').toLowerCase() === 'admin_user' && body.isAdmin === true;
      const created = await db.createQuestion({ ...body, isAdmin });
      return sendJson(res, 201, { ok: true, question: created });
    }

    // ==================== ADMIN ENDPOINTS (admin_user) ====================
    if (req.method === 'GET' && pathname === '/api/admin/questions') {
      const data = await db.getAllQuestionsForAdmin();
      return sendJson(res, 200, data);
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

    if (req.method === 'DELETE' && pathname.startsWith('/api/questions/')) {
      const id = pathname.split('/').pop();
      const result = await db.deleteQuestion(id);
      return sendJson(res, 200, { ok: true, ...result });
    }

    if (req.method === 'GET' && pathname === '/api/users') {
      const users = await db.getLeaderboard();
      return sendJson(res, 200, { users });
    }

    if (req.method === 'POST' && pathname === '/api/auth/register') {
      const body = await parseBody(req);
      const user = await db.registerUser(body);
      return sendJson(res, 201, { ok: true, user });
    }

    if (req.method === 'POST' && pathname === '/api/auth/login') {
      const body = await parseBody(req);
      const user = await db.loginUser(body);
      return sendJson(res, 200, { ok: true, user });
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

    return sendJson(res, 404, { error: 'API endpoint not found' });
  } catch (err) {
    return sendJson(res, 400, { error: err.message || 'Server error' });
  }
}

function serveStatic(req, res, pathname) {
  const safePath = pathname === '/' ? '/index.html' : pathname;
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

  server.listen(PORT, () => {
    console.log(`[Honfoglalo] Server running at http://localhost:${PORT}`);
  });
}

start();
