// Database abstraction layer supporting Docker PostgreSQL (primary) with SQLite fallback
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { ESTIMATION_QUESTIONS, MULTIPLE_CHOICE_QUESTIONS } from '../js/questions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;

export function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password) + '_honfoglalo_salt').digest('hex');
}

const ADMIN_USERNAME = 'admin_user';
const ADMIN_PASSWORD_HASH = hashPassword('#xEfO123');

class DatabaseService {
  constructor() {
    this.pool = null;
    this.sqlite = null;
    this.mode = 'uninitialized';
  }

  async init() {
    const pgConfig = process.env.DATABASE_URL
      ? {
          connectionString: process.env.DATABASE_URL,
          ssl: process.env.DATABASE_URL.includes('localhost')
            ? false
            : { rejectUnauthorized: false },
          connectionTimeoutMillis: 5000
        }
      : {
          host: process.env.POSTGRES_HOST || 'localhost',
          port: Number(process.env.POSTGRES_PORT || 5432),
          user: process.env.POSTGRES_USER || 'honfoglalo',
          password: process.env.POSTGRES_PASSWORD || 'honfoglalo_pass',
          database: process.env.POSTGRES_DB || 'honfoglalo',
          connectionTimeoutMillis: 3000
        };

    try {
      const pool = new Pool(pgConfig);
      const client = await pool.connect();
      try {
        await client.query('SELECT 1');
        const initSqlPath = path.join(__dirname, 'init.sql');
        if (fs.existsSync(initSqlPath)) {
          const countRes = await client.query("SELECT to_regclass('public.questions') AS tbl");
          if (!countRes.rows[0].tbl) {
            const sql = fs.readFileSync(initSqlPath, 'utf8');
            await client.query(sql);
          }
        }

        // Ensure role column on users and status column on questions
        await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(16) DEFAULT 'user'");
        await client.query("ALTER TABLE questions ADD COLUMN IF NOT EXISTS status VARCHAR(16) DEFAULT 'approved'");
        await client.query("UPDATE questions SET status = 'approved' WHERE status IS NULL");

        // Remove any previously seeded default/test accounts so only admin_user + real registered users exist
        await client.query("DELETE FROM users WHERE email LIKE '%@honfoglalo.hu' OR email LIKE '%@example.com'");

        // Ensure admin_user (#xEfO123) exists with admin role
        await client.query(
          `INSERT INTO users (username, email, password_hash, role)
           VALUES ($1, 'admin@system.local', $2, 'admin')
           ON CONFLICT (username) DO UPDATE
           SET password_hash = EXCLUDED.password_hash,
               role = 'admin'`,
          [ADMIN_USERNAME, ADMIN_PASSWORD_HASH]
        );

        this.pool = pool;
        this.mode = 'postgres-docker';
        console.log('[DB] Connected to PostgreSQL (Docker) at', `${pgConfig.host}:${pgConfig.port}/${pgConfig.database}`);
        return;
      } finally {
        client.release();
      }
    } catch (err) {
      console.warn('[DB] Docker PostgreSQL not reachable, initializing native SQLite fallback:', err.message);
      await this.initSqliteFallback();
    }
  }

  async initSqliteFallback() {
    const { DatabaseSync } = await import('node:sqlite');
    const dbFile = path.join(__dirname, 'honfoglalo_fallback.sqlite');
    this.sqlite = new DatabaseSync(dbFile);
    this.mode = 'sqlite-fallback';

    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        avatar_color TEXT DEFAULT 'red',
        games_played INTEGER DEFAULT 0,
        games_won INTEGER DEFAULT 0,
        total_points INTEGER DEFAULT 0,
        counties_conquered INTEGER DEFAULT 0,
        correct_answers INTEGER DEFAULT 0,
        total_answers INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_id TEXT UNIQUE,
        question_type TEXT NOT NULL,
        category TEXT NOT NULL,
        question_text TEXT NOT NULL,
        options_json TEXT,
        correct_index INTEGER,
        estimation_answer REAL,
        unit TEXT,
        difficulty INTEGER DEFAULT 2,
        status TEXT DEFAULT 'approved',
        created_by TEXT DEFAULT 'system',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        winner_user_id INTEGER,
        winner_name TEXT NOT NULL,
        game_mode TEXT DEFAULT 'singleplayer',
        rounds_played INTEGER DEFAULT 6,
        red_player TEXT NOT NULL,
        red_score INTEGER NOT NULL,
        green_player TEXT NOT NULL,
        green_score INTEGER NOT NULL,
        blue_player TEXT NOT NULL,
        blue_score INTEGER NOT NULL,
        played_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    try {
      this.sqlite.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
    } catch {
      // column already exists
    }
    try {
      this.sqlite.exec("ALTER TABLE questions ADD COLUMN status TEXT DEFAULT 'approved'");
    } catch {
      // column already exists
    }

    this.sqlite.exec("DELETE FROM users WHERE email LIKE '%@honfoglalo.hu' OR email LIKE '%@example.com'");

    const existingAdmin = this.sqlite.prepare('SELECT id FROM users WHERE username = ?').get(ADMIN_USERNAME);
    if (!existingAdmin) {
      this.sqlite
        .prepare("INSERT INTO users (username, email, password_hash, role) VALUES (?, 'admin@system.local', ?, 'admin')")
        .run(ADMIN_USERNAME, ADMIN_PASSWORD_HASH);
    } else {
      this.sqlite
        .prepare("UPDATE users SET password_hash = ?, role = 'admin' WHERE username = ?")
        .run(ADMIN_PASSWORD_HASH, ADMIN_USERNAME);
    }

    const qCount = this.sqlite.prepare('SELECT COUNT(*) AS cnt FROM questions').get().cnt;
    if (qCount === 0) {
      const insertQ = this.sqlite.prepare(`
        INSERT OR IGNORE INTO questions (external_id, question_type, category, question_text, options_json, correct_index, estimation_answer, unit, difficulty, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')
      `);
      for (const q of MULTIPLE_CHOICE_QUESTIONS) {
        insertQ.run(q.id, 'multiple_choice', q.category, q.question, JSON.stringify(q.options), q.correctIndex, null, null, 2);
      }
      for (const q of ESTIMATION_QUESTIONS) {
        insertQ.run(q.id, 'estimation', q.category, q.question, null, null, q.answer, q.unit || '', 2);
      }
    }
  }

  async getStatus() {
    if (this.mode === 'postgres-docker') {
      const u = await this.pool.query("SELECT COUNT(*)::int AS cnt FROM users WHERE role != 'admin'");
      const mc = await this.pool.query("SELECT COUNT(*)::int AS cnt FROM questions WHERE question_type = 'multiple_choice' AND status = 'approved'");
      const est = await this.pool.query("SELECT COUNT(*)::int AS cnt FROM questions WHERE question_type = 'estimation' AND status = 'approved'");
      const pending = await this.pool.query("SELECT COUNT(*)::int AS cnt FROM questions WHERE status = 'pending'");
      const m = await this.pool.query('SELECT COUNT(*)::int AS cnt FROM matches');
      return {
        ok: true,
        engine: 'PostgreSQL 16 (Docker)',
        mode: this.mode,
        counts: {
          users: u.rows[0].cnt,
          multipleChoice: mc.rows[0].cnt,
          estimation: est.rows[0].cnt,
          pendingQuestions: pending.rows[0].cnt,
          matches: m.rows[0].cnt
        }
      };
    } else {
      const u = this.sqlite.prepare("SELECT COUNT(*) AS cnt FROM users WHERE role != 'admin'").get().cnt;
      const mc = this.sqlite.prepare("SELECT COUNT(*) AS cnt FROM questions WHERE question_type = 'multiple_choice' AND status = 'approved'").get().cnt;
      const est = this.sqlite.prepare("SELECT COUNT(*) AS cnt FROM questions WHERE question_type = 'estimation' AND status = 'approved'").get().cnt;
      const pending = this.sqlite.prepare("SELECT COUNT(*) AS cnt FROM questions WHERE status = 'pending'").get().cnt;
      const m = this.sqlite.prepare('SELECT COUNT(*) AS cnt FROM matches').get().cnt;
      return {
        ok: true,
        engine: 'SQLite (Local Fallback)',
        mode: this.mode,
        counts: {
          users: u,
          multipleChoice: mc,
          estimation: est,
          pendingQuestions: pending,
          matches: m
        }
      };
    }
  }

  formatQuestionRow(r) {
    if (r.question_type === 'multiple_choice') {
      let parsedOptions = [];
      try {
        parsedOptions = JSON.parse(r.options_json || '[]');
      } catch {
        parsedOptions = ['A', 'B', 'C', 'D'];
      }
      return {
        id: r.external_id || `db_mc_${r.id}`,
        dbId: r.id,
        qType: 'multiple_choice',
        category: r.category,
        question: r.question_text,
        options: parsedOptions,
        correctIndex: Number(r.correct_index || 0),
        status: r.status || 'approved',
        createdBy: r.created_by || 'system',
        createdAt: r.created_at
      };
    } else {
      return {
        id: r.external_id || `db_est_${r.id}`,
        dbId: r.id,
        qType: 'estimation',
        category: r.category,
        question: r.question_text,
        answer: Number(r.estimation_answer || 0),
        unit: r.unit || '',
        status: r.status || 'approved',
        createdBy: r.created_by || 'system',
        createdAt: r.created_at
      };
    }
  }

  // Returns ONLY approved questions for active gameplay
  async getQuestions() {
    let rows = [];
    if (this.mode === 'postgres-docker') {
      const res = await this.pool.query("SELECT * FROM questions WHERE status = 'approved' ORDER BY id ASC");
      rows = res.rows;
    } else {
      rows = this.sqlite.prepare("SELECT * FROM questions WHERE status = 'approved' ORDER BY id ASC").all();
    }

    const multipleChoice = [];
    const estimation = [];

    for (const r of rows) {
      const formatted = this.formatQuestionRow(r);
      if (formatted.qType === 'multiple_choice') multipleChoice.push(formatted);
      else estimation.push(formatted);
    }

    return { multipleChoice, estimation };
  }

  // Returns all questions (pending + approved) for admin_user
  async getAllQuestionsForAdmin() {
    let rows = [];
    if (this.mode === 'postgres-docker') {
      const res = await this.pool.query('SELECT * FROM questions ORDER BY id DESC');
      rows = res.rows;
    } else {
      rows = this.sqlite.prepare('SELECT * FROM questions ORDER BY id DESC').all();
    }

    const pending = [];
    const approved = [];
    for (const r of rows) {
      const item = this.formatQuestionRow(r);
      if (item.status === 'pending') pending.push(item);
      else approved.push(item);
    }
    return { pending, approved };
  }

  // Returns questions submitted by a specific regular user
  async getUserSubmittedQuestions(username) {
    const clean = String(username || '').trim();
    if (!clean) return [];
    let rows = [];
    if (this.mode === 'postgres-docker') {
      const res = await this.pool.query(
        'SELECT * FROM questions WHERE LOWER(created_by) = LOWER($1) ORDER BY id DESC',
        [clean]
      );
      rows = res.rows;
    } else {
      rows = this.sqlite
        .prepare('SELECT * FROM questions WHERE LOWER(created_by) = LOWER(?) ORDER BY id DESC')
        .all(clean);
    }
    return rows.map(r => this.formatQuestionRow(r));
  }

  async createQuestion(payload) {
    const type = payload.type === 'estimation' ? 'estimation' : 'multiple_choice';
    const category = String(payload.category || 'Történelem').trim();
    const questionText = String(payload.question || '').trim();
    const createdBy = String(payload.createdBy || 'Játékos').trim();
    const status = payload.isAdmin ? 'approved' : 'pending';

    if (!questionText) {
      throw new Error('A kérdés szövege nem lehet üres!');
    }

    const extId = `custom_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    if (type === 'multiple_choice') {
      const options = Array.isArray(payload.options) ? payload.options.map(o => String(o).trim()) : [];
      if (options.length !== 4 || options.some(o => !o)) {
        throw new Error('Mind a 4 válaszlehetőséget ki kell tölteni!');
      }
      const correctIndex = Math.max(0, Math.min(3, Number(payload.correctIndex || 0)));

      if (this.mode === 'postgres-docker') {
        const res = await this.pool.query(
          `INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, status, created_by)
           VALUES ($1, 'multiple_choice', $2, $3, $4, $5, $6, $7) RETURNING *`,
          [extId, category, questionText, JSON.stringify(options), correctIndex, status, createdBy]
        );
        return this.formatQuestionRow(res.rows[0]);
      } else {
        const stmt = this.sqlite.prepare(
          `INSERT INTO questions (external_id, question_type, category, question_text, options_json, correct_index, status, created_by)
           VALUES (?, 'multiple_choice', ?, ?, ?, ?, ?, ?)`
        );
        const info = stmt.run(extId, category, questionText, JSON.stringify(options), correctIndex, status, createdBy);
        return { id: info.lastInsertRowid, external_id: extId, status };
      }
    } else {
      const answer = Number(payload.answer);
      if (!Number.isFinite(answer)) {
        throw new Error('A tippelős kérdés válasza érvényes szám kell legyen!');
      }
      const unit = String(payload.unit || '').trim();

      if (this.mode === 'postgres-docker') {
        const res = await this.pool.query(
          `INSERT INTO questions (external_id, question_type, category, question_text, estimation_answer, unit, status, created_by)
           VALUES ($1, 'estimation', $2, $3, $4, $5, $6, $7) RETURNING *`,
          [extId, category, questionText, answer, unit, status, createdBy]
        );
        return this.formatQuestionRow(res.rows[0]);
      } else {
        const stmt = this.sqlite.prepare(
          `INSERT INTO questions (external_id, question_type, category, question_text, estimation_answer, unit, status, created_by)
           VALUES (?, 'estimation', ?, ?, ?, ?, ?, ?)`
        );
        const info = stmt.run(extId, category, questionText, answer, unit, status, createdBy);
        return { id: info.lastInsertRowid, external_id: extId, status };
      }
    }
  }

  async approveQuestion(dbId) {
    const id = Number(dbId);
    if (!Number.isFinite(id)) throw new Error('Érvénytelen kérdés azonosító');
    if (this.mode === 'postgres-docker') {
      await this.pool.query("UPDATE questions SET status = 'approved' WHERE id = $1", [id]);
    } else {
      this.sqlite.prepare("UPDATE questions SET status = 'approved' WHERE id = ?").run(id);
    }
    return { approved: true, id };
  }

  async deleteQuestion(dbId) {
    const id = Number(dbId);
    if (!Number.isFinite(id)) throw new Error('Érvénytelen kérdés azonosító');
    if (this.mode === 'postgres-docker') {
      await this.pool.query('DELETE FROM questions WHERE id = $1', [id]);
    } else {
      this.sqlite.prepare('DELETE FROM questions WHERE id = ?').run(id);
    }
    return { deleted: true, id };
  }

  async getLeaderboard() {
    const cols = 'id, username, email, role, avatar_color, games_played, games_won, total_points, counties_conquered, correct_answers, total_answers, created_at';
    if (this.mode === 'postgres-docker') {
      const res = await this.pool.query(
        `SELECT ${cols} FROM users WHERE role != 'admin' AND username != $1 ORDER BY total_points DESC, games_won DESC, id ASC LIMIT 50`,
        [ADMIN_USERNAME]
      );
      return res.rows;
    } else {
      return this.sqlite
        .prepare(`SELECT ${cols} FROM users WHERE role != 'admin' AND username != ? ORDER BY total_points DESC, games_won DESC, id ASC LIMIT 50`)
        .all(ADMIN_USERNAME);
    }
  }

  async getAllUsersForAdmin() {
    const cols = 'id, username, email, role, games_played, games_won, total_points, counties_conquered, correct_answers, total_answers, created_at';
    if (this.mode === 'postgres-docker') {
      const res = await this.pool.query(
        `SELECT ${cols} FROM users WHERE username != $1 ORDER BY id DESC`,
        [ADMIN_USERNAME]
      );
      return res.rows;
    } else {
      return this.sqlite
        .prepare(`SELECT ${cols} FROM users WHERE username != ? ORDER BY id DESC`)
        .all(ADMIN_USERNAME);
    }
  }

  async updateUserByAdmin(userId, payload) {
    const id = Number(userId);
    if (!Number.isFinite(id)) throw new Error('Érvénytelen felhasználó azonosító');

    if (payload.resetStats) {
      if (this.mode === 'postgres-docker') {
        await this.pool.query(
          `UPDATE users
           SET games_played = 0, games_won = 0, total_points = 0, counties_conquered = 0, correct_answers = 0, total_answers = 0
           WHERE id = $1 AND username != $2`,
          [id, ADMIN_USERNAME]
        );
      } else {
        this.sqlite
          .prepare(
            `UPDATE users
             SET games_played = 0, games_won = 0, total_points = 0, counties_conquered = 0, correct_answers = 0, total_answers = 0
             WHERE id = ? AND username != ?`
          )
          .run(id, ADMIN_USERNAME);
      }
      return { updated: true, id };
    }

    if (payload.newPassword && String(payload.newPassword).length >= 4) {
      const pwHash = hashPassword(String(payload.newPassword));
      if (this.mode === 'postgres-docker') {
        await this.pool.query('UPDATE users SET password_hash = $1 WHERE id = $2 AND username != $3', [pwHash, id, ADMIN_USERNAME]);
      } else {
        this.sqlite.prepare('UPDATE users SET password_hash = ? WHERE id = ? AND username != ?').run(pwHash, id, ADMIN_USERNAME);
      }
    }

    if (payload.totalPoints !== undefined && Number.isFinite(Number(payload.totalPoints))) {
      const pts = Number(payload.totalPoints);
      if (this.mode === 'postgres-docker') {
        await this.pool.query('UPDATE users SET total_points = $1 WHERE id = $2 AND username != $3', [pts, id, ADMIN_USERNAME]);
      } else {
        this.sqlite.prepare('UPDATE users SET total_points = ? WHERE id = ? AND username != ?').run(pts, id, ADMIN_USERNAME);
      }
    }

    return { updated: true, id };
  }

  async deleteUserByAdmin(userId) {
    const id = Number(userId);
    if (!Number.isFinite(id)) throw new Error('Érvénytelen felhasználó azonosító');
    if (this.mode === 'postgres-docker') {
      await this.pool.query('DELETE FROM users WHERE id = $1 AND username != $2', [id, ADMIN_USERNAME]);
    } else {
      this.sqlite.prepare('DELETE FROM users WHERE id = ? AND username != ?').run(id, ADMIN_USERNAME);
    }
    return { deleted: true, id };
  }

  async registerUser({ username, email, password, avatarColor = 'red' }) {
    const cleanUser = String(username || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const pw = String(password || '');

    if (cleanUser.toLowerCase() === ADMIN_USERNAME) {
      throw new Error('Ez a felhasználónév fenntartott!');
    }
    if (cleanUser.length < 2) throw new Error('A felhasználónév legalább 2 karakter legyen!');
    if (!cleanEmail.includes('@')) throw new Error('Kérlek adj meg egy érvényes e-mail címet!');
    if (pw.length < 4) throw new Error('A jelszó legalább 4 karakter legyen!');

    const pwHash = hashPassword(pw);

    if (this.mode === 'postgres-docker') {
      const existing = await this.pool.query(
        'SELECT id FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2)',
        [cleanUser, cleanEmail]
      );
      if (existing.rows.length > 0) {
        throw new Error('Ez a felhasználónév vagy e-mail cím már foglalt!');
      }
      const res = await this.pool.query(
        `INSERT INTO users (username, email, password_hash, role, avatar_color)
         VALUES ($1, $2, $3, 'user', $4)
         RETURNING id, username, email, role, avatar_color, games_played, games_won, total_points, counties_conquered, correct_answers, total_answers`,
        [cleanUser, cleanEmail, pwHash, avatarColor]
      );
      return res.rows[0];
    } else {
      const existing = this.sqlite
        .prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)')
        .get(cleanUser, cleanEmail);
      if (existing) {
        throw new Error('Ez a felhasználónév vagy e-mail cím már foglalt!');
      }
      const info = this.sqlite
        .prepare("INSERT INTO users (username, email, password_hash, role, avatar_color) VALUES (?, ?, ?, 'user', ?)")
        .run(cleanUser, cleanEmail, pwHash, avatarColor);
      return this.sqlite
        .prepare('SELECT id, username, email, role, avatar_color, games_played, games_won, total_points, counties_conquered, correct_answers, total_answers FROM users WHERE id = ?')
        .get(info.lastInsertRowid);
    }
  }

  async loginUser({ username, password }) {
    const cleanUser = String(username || '').trim();
    const pwHash = hashPassword(String(password || ''));

    if (this.mode === 'postgres-docker') {
      const res = await this.pool.query(
        `SELECT id, username, email, role, avatar_color, games_played, games_won, total_points, counties_conquered, correct_answers, total_answers
         FROM users
         WHERE (LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1)) AND password_hash = $2`,
        [cleanUser, pwHash]
      );
      if (res.rows.length === 0) {
        throw new Error('Hibás felhasználónév vagy jelszó!');
      }
      const user = res.rows[0];
      user.isAdmin = user.username === ADMIN_USERNAME || user.role === 'admin';
      return user;
    } else {
      const user = this.sqlite
        .prepare(
          `SELECT id, username, email, role, avatar_color, games_played, games_won, total_points, counties_conquered, correct_answers, total_answers
           FROM users
           WHERE (LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)) AND password_hash = ?`
        )
        .get(cleanUser, cleanUser, pwHash);
      if (!user) {
        throw new Error('Hibás felhasználónév vagy jelszó!');
      }
      user.isAdmin = user.username === ADMIN_USERNAME || user.role === 'admin';
      return user;
    }
  }

  async recordMatch(matchData) {
    const {
      winnerName,
      gameMode = 'singleplayer',
      roundsPlayed = 6,
      players = []
    } = matchData;

    const red = players.find(p => p.id === 'red') || { name: 'Piros', score: 0, counties: 0, correctAnswers: 0, totalAnswers: 0 };
    const green = players.find(p => p.id === 'green') || { name: 'Zöld', score: 0, counties: 0, correctAnswers: 0, totalAnswers: 0 };
    const blue = players.find(p => p.id === 'blue') || { name: 'Kék', score: 0, counties: 0, correctAnswers: 0, totalAnswers: 0 };

    if (this.mode === 'postgres-docker') {
      let winnerUserId = null;
      for (const p of players) {
        const isWinner = p.name === winnerName ? 1 : 0;
        const uRes = await this.pool.query(
          `UPDATE users
           SET games_played = games_played + 1,
               games_won = games_won + $1,
               total_points = total_points + $2,
               counties_conquered = counties_conquered + $3,
               correct_answers = correct_answers + $4,
               total_answers = total_answers + $5
           WHERE LOWER(username) = LOWER($6)
           RETURNING id`,
          [isWinner, Number(p.score || 0), Number(p.counties || 0), Number(p.correctAnswers || 0), Number(p.totalAnswers || 0), p.name]
        );
        if (isWinner && uRes.rows.length > 0) {
          winnerUserId = uRes.rows[0].id;
        }
      }

      const mRes = await this.pool.query(
        `INSERT INTO matches (winner_user_id, winner_name, game_mode, rounds_played, red_player, red_score, green_player, green_score, blue_player, blue_score)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [winnerUserId, winnerName, gameMode, roundsPlayed, red.name, red.score, green.name, green.score, blue.name, blue.score]
      );
      return mRes.rows[0];
    } else {
      let winnerUserId = null;
      for (const p of players) {
        const isWinner = p.name === winnerName ? 1 : 0;
        const found = this.sqlite.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(p.name);
        if (found) {
          this.sqlite
            .prepare(
              `UPDATE users
               SET games_played = games_played + 1,
                   games_won = games_won + ?,
                   total_points = total_points + ?,
                   counties_conquered = counties_conquered + ?,
                   correct_answers = correct_answers + ?,
                   total_answers = total_answers + ?
               WHERE id = ?`
            )
            .run(isWinner, Number(p.score || 0), Number(p.counties || 0), Number(p.correctAnswers || 0), Number(p.totalAnswers || 0), found.id);
          if (isWinner) winnerUserId = found.id;
        }
      }

      const info = this.sqlite
        .prepare(
          `INSERT INTO matches (winner_user_id, winner_name, game_mode, rounds_played, red_player, red_score, green_player, green_score, blue_player, blue_score)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(winnerUserId, winnerName, gameMode, roundsPlayed, red.name, red.score, green.name, green.score, blue.name, blue.score);
      return { id: info.lastInsertRowid };
    }
  }

  async getRecentMatches() {
    if (this.mode === 'postgres-docker') {
      const res = await this.pool.query('SELECT * FROM matches ORDER BY id DESC LIMIT 15');
      return res.rows;
    } else {
      return this.sqlite.prepare('SELECT * FROM matches ORDER BY id DESC LIMIT 15').all();
    }
  }
}

export const db = new DatabaseService();
