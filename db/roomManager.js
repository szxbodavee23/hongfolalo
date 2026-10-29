// Server-Authoritative Online Multiplayer Room & Lobby Manager for Honfoglalo
import crypto from 'crypto';
import { HonfoglaloEngine, PHASES } from '../js/gameEngine.js';
import { db } from './database.js';

class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.invitesByUsername = new Map();
  }

  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return this.rooms.has(code) ? this.generateRoomCode() : code;
  }

  generateToken() {
    return crypto.randomBytes(16).toString('hex');
  }

  async createRoom({ hostName = 'Játékos 1', aiDifficulty = 'normal', maxBattleRounds = 6 }) {
    const code = this.generateRoomCode();
    const hostToken = this.generateToken();
    const engine = new HonfoglaloEngine();

    try {
      const qData = await db.getQuestions();
      engine.setQuestionDatabase(qData);
    } catch {
      // Fallback to default questions in engine
    }

    const room = {
      code,
      createdAt: Date.now(),
      status: 'WAITING', // 'WAITING' | 'PLAYING' | 'FINISHED'
      hostToken,
      invitedUsernames: [],
      settings: {
        aiDifficulty: aiDifficulty || 'normal',
        maxBattleRounds: Number(maxBattleRounds) || 6
      },
      slots: {
        red: {
          color: 'red',
          name: String(hostName || 'Játékos 1').trim().slice(0, 24),
          isHuman: true,
          token: hostToken,
          isHost: true
        },
        green: {
          color: 'green',
          name: 'Gép 1',
          isHuman: false,
          token: null,
          isHost: false
        },
        blue: {
          color: 'blue',
          name: 'Gép 2',
          isHuman: false,
          token: null,
          isHost: false
        }
      },
      engine,
      questionSession: null,
      questionTimer: null,
      revealTimer: null,
      aiTimer: null,
      sseClients: new Set()
    };

    room.engine.logEvent(`Online szoba létrejött (${code}). Várakozás a csatlakozókra...`, 'phase');
    this.rooms.set(code, room);
    return {
      code,
      playerToken: hostToken,
      assignedColor: 'red',
      state: this.serializeRoomState(room, hostToken)
    };
  }

  joinRoom({ code, playerName = 'Vendég', existingToken = null }) {
    const cleanCode = String(code || '').trim().toUpperCase();
    const room = this.rooms.get(cleanCode);
    if (!room) {
      throw new Error('Nem található ilyen kódú online szoba!');
    }

    const cleanName = String(playerName || 'Vendég').trim().slice(0, 24);
    for (const color of ['red', 'green', 'blue']) {
      if (
        (existingToken && room.slots[color].token === existingToken) ||
        (room.slots[color].isHuman && room.slots[color].name.toLowerCase() === cleanName.toLowerCase())
      ) {
        this.clearInvitesForRoomAndUser(cleanCode, cleanName);
        return {
          code: room.code,
          playerToken: room.slots[color].token,
          assignedColor: color,
          state: this.serializeRoomState(room, room.slots[color].token)
        };
      }
    }

    if (room.status !== 'WAITING') {
      throw new Error('Ez a játék már elkezdődött!');
    }

    let targetColor = null;
    if (!room.slots.green.isHuman) targetColor = 'green';
    else if (!room.slots.blue.isHuman) targetColor = 'blue';

    if (!targetColor) {
      throw new Error('A szoba megtelt (mind a 3 hely foglalt)!');
    }

    const token = this.generateToken();
    room.slots[targetColor] = {
      color: targetColor,
      name: cleanName,
      isHuman: true,
      token,
      isHost: false
    };

    this.clearInvitesForRoomAndUser(cleanCode, cleanName);
    room.engine.logEvent(`${cleanName} csatlakozott a szobához.`, 'claim');
    this.broadcastRoom(room);

    return {
      code: room.code,
      playerToken: token,
      assignedColor: targetColor,
      state: this.serializeRoomState(room, token)
    };
  }

  inviteRegisteredUser(code, token, targetUsername) {
    const cleanCode = String(code || '').trim().toUpperCase();
    const room = this.rooms.get(cleanCode);
    if (!room) throw new Error('Szoba nem található!');
    const senderColor = this.getPlayerColorByToken(room, token);
    if (!senderColor) throw new Error('Nem vagy a szoba tagja!');

    const cleanTarget = String(targetUsername || '').trim();
    if (!cleanTarget) throw new Error('Hiányzó címzett felhasználónév!');

    const senderName = room.slots[senderColor].name;
    const key = cleanTarget.toLowerCase();
    const existingList = this.invitesByUsername.get(key) || [];
    const filtered = existingList.filter(inv => inv.roomCode !== cleanCode);

    filtered.push({
      id: `inv_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      roomCode: cleanCode,
      fromUsername: senderName,
      targetUsername: cleanTarget,
      createdAt: Date.now()
    });
    this.invitesByUsername.set(key, filtered);

    if (!room.invitedUsernames.includes(cleanTarget)) {
      room.invitedUsernames.push(cleanTarget);
    }

    room.engine.logEvent(`${senderName} meghívta ${cleanTarget} játékost.`, 'phase');
    this.broadcastRoom(room);
    return this.serializeRoomState(room, token);
  }

  getPendingInvites(username) {
    const key = String(username || '').trim().toLowerCase();
    if (!key) return [];
    const list = this.invitesByUsername.get(key) || [];
    // Filter out rooms that are no longer WAITING
    const active = list.filter(inv => {
      const r = this.rooms.get(inv.roomCode);
      return r && r.status === 'WAITING';
    });
    this.invitesByUsername.set(key, active);
    return active;
  }

  dismissInvite(username, roomCode) {
    const key = String(username || '').trim().toLowerCase();
    const cleanCode = String(roomCode || '').trim().toUpperCase();
    if (!key) return;
    const list = this.invitesByUsername.get(key) || [];
    this.invitesByUsername.set(
      key,
      list.filter(inv => inv.roomCode !== cleanCode)
    );
  }

  clearInvitesForRoomAndUser(roomCode, username) {
    this.dismissInvite(username, roomCode);
  }

  getPlayerColorByToken(room, token) {
    if (!token) return null;
    for (const color of ['red', 'green', 'blue']) {
      if (room.slots[color].token === token) return color;
    }
    return null;
  }

  startRoomGame(code, token, customSettings = {}) {
    const room = this.rooms.get(String(code || '').toUpperCase());
    if (!room) throw new Error('Szoba nem található!');
    if (room.hostToken !== token) {
      throw new Error('Csak a szoba létrehozója (Piros Vezér) indíthatja el a hadjáratot!');
    }
    if (room.status !== 'WAITING') {
      throw new Error('A játék már elindult!');
    }

    if (customSettings.aiDifficulty) room.settings.aiDifficulty = customSettings.aiDifficulty;
    if (customSettings.maxBattleRounds) room.settings.maxBattleRounds = Number(customSettings.maxBattleRounds) || 6;

    room.status = 'PLAYING';
    const eng = room.engine;
    eng.resetState();
    eng.gameMode = 'online';
    eng.aiDifficulty = room.settings.aiDifficulty;
    eng.maxBattleRounds = room.settings.maxBattleRounds;

    for (const color of ['red', 'green', 'blue']) {
      const slot = room.slots[color];
      eng.players[color] = eng.createPlayer(color, slot.name, slot.isHuman);
    }

    eng.logEvent('A játék elindult! 1. fázis: Bázisválasztás.', 'phase');
    eng.startBasePhaseQuestion();
    this.startQuestionSession(room);
    this.broadcastRoom(room);
    return this.serializeRoomState(room, token);
  }

  // ==================== QUESTION SESSION LIFECYCLE ====================
  startQuestionSession(room) {
    clearTimeout(room.questionTimer);
    clearTimeout(room.revealTimer);

    const eng = room.engine;
    const q = eng.activeQuestion;
    if (!q) return;

    const durationMs = 16000;
    const now = Date.now();
    const participants = q.participants || ['red', 'green', 'blue'];

    const session = {
      id: `${q.id}_${now}`,
      questionType: q.type, // 'estimation' | 'multiple_choice'
      phaseAtStart: eng.phase,
      category: q.category,
      contextLabel: q.contextLabel,
      questionText: q.question,
      options: q.options || null,
      unit: q.unit || '',
      participants,
      stage: 'ANSWERING', // 'ANSWERING' | 'REVEAL'
      startedAt: now,
      deadlineAt: now + durationMs,
      submissions: {},
      halvedByColor: {},
      owlPollByColor: {},
      revealData: null
    };

    // Pre-generate AI answers for any AI participant
    for (const pid of participants) {
      const player = eng.players[pid];
      if (player && !player.isHuman) {
        if (q.type === 'estimation') {
          session.submissions[pid] = eng.simulateAiEstimation(q);
        } else {
          session.submissions[pid] = eng.simulateAiMultipleChoice(q);
        }
      }
    }

    room.questionSession = session;

    // Check if all participants are AI (e.g., AI vs AI battle in a 1-human or 2-human online room)
    const hasHumanParticipant = participants.some(pid => eng.players[pid]?.isHuman);
    if (!hasHumanParticipant) {
      room.questionTimer = setTimeout(() => {
        this.resolveQuestionSession(room);
      }, 1100);
      return;
    }

    room.questionTimer = setTimeout(() => {
      this.resolveQuestionSession(room);
    }, durationMs + 500);
  }

  submitPlayerAnswer(code, token, payload) {
    const room = this.rooms.get(String(code || '').toUpperCase());
    if (!room) throw new Error('Szoba nem található!');
    const color = this.getPlayerColorByToken(room, token);
    if (!color) throw new Error('Nem vagy részese ennek a szobának!');

    const session = room.questionSession;
    if (!session || session.stage !== 'ANSWERING') {
      return this.serializeRoomState(room, token);
    }
    if (!session.participants.includes(color)) {
      throw new Error('Ebben a kérdésben most nem te szerepelsz!');
    }
    if (session.submissions[color]) {
      return this.serializeRoomState(room, token);
    }

    const elapsedMs = Math.min(15000, Math.max(200, Date.now() - session.startedAt));
    if (session.questionType === 'estimation') {
      const raw = payload.guess;
      const parsed = raw !== '' && raw !== null && raw !== undefined && Number.isFinite(Number(raw)) ? Number(raw) : null;
      session.submissions[color] = { guess: parsed, timeMs: elapsedMs };
    } else {
      const idx = Number.isFinite(Number(payload.choiceIndex)) ? Number(payload.choiceIndex) : -1;
      session.submissions[color] = { choiceIndex: idx, timeMs: elapsedMs };
    }

    // Check if all participants have submitted
    const allSubmitted = session.participants.every(pid => Boolean(session.submissions[pid]));
    if (allSubmitted) {
      this.resolveQuestionSession(room);
    } else {
      this.broadcastRoom(room);
    }

    return this.serializeRoomState(room, token);
  }

  useLifeline(code, token, lifelineType) {
    const room = this.rooms.get(String(code || '').toUpperCase());
    if (!room) throw new Error('Szoba nem található!');
    const color = this.getPlayerColorByToken(room, token);
    if (!color) throw new Error('Érvénytelen játékos!');

    const session = room.questionSession;
    const eng = room.engine;
    const player = eng.players[color];
    if (!session || session.stage !== 'ANSWERING' || !player) {
      throw new Error('Most nem használható segítség!');
    }

    if (lifelineType === 'halve' && player.lifelines.halve && session.questionType === 'multiple_choice') {
      player.lifelines.halve = false;
      const correctIdx = eng.activeQuestion.correctIndex;
      const wrong = [0, 1, 2, 3].filter(i => i !== correctIdx).sort(() => Math.random() - 0.5);
      session.halvedByColor[color] = wrong.slice(0, 2);
    } else if (lifelineType === 'owl' && player.lifelines.owl && session.questionType === 'multiple_choice') {
      player.lifelines.owl = false;
      const correctIdx = eng.activeQuestion.correctIndex;
      const pcts = [10, 10, 10, 10];
      pcts[correctIdx] = 64 + Math.floor(Math.random() * 14);
      let rem = 100 - pcts[correctIdx];
      for (let i = 0; i < 4; i++) {
        if (i !== correctIdx) {
          const share = i === 3 ? rem : Math.floor(Math.random() * (rem + 1));
          pcts[i] = Math.max(0, share);
          rem -= share;
        }
      }
      session.owlPollByColor[color] = pcts;
    } else if (lifelineType === 'extraTime' && player.lifelines.extraTime) {
      player.lifelines.extraTime = false;
      session.deadlineAt += 10000;
      clearTimeout(room.questionTimer);
      const remaining = Math.max(1000, session.deadlineAt - Date.now());
      room.questionTimer = setTimeout(() => {
        this.resolveQuestionSession(room);
      }, remaining);
    }

    this.broadcastRoom(room);
    return this.serializeRoomState(room, token);
  }

  resolveQuestionSession(room) {
    clearTimeout(room.questionTimer);
    const session = room.questionSession;
    const eng = room.engine;
    if (!session || session.stage !== 'ANSWERING') return;

    // Fill missing submissions as timeouts
    for (const pid of session.participants) {
      if (!session.submissions[pid]) {
        session.submissions[pid] = session.questionType === 'estimation'
          ? { guess: null, timeMs: 15000 }
          : { choiceIndex: -1, timeMs: 15000 };
      }
    }

    session.stage = 'REVEAL';
    session.continuedBy = new Set();
    const phase = session.phaseAtStart;

    if (phase === PHASES.BASE_QUESTION) {
      const results = eng.submitBaseQuestionAnswers(session.submissions);
      session.revealData = {
        type: 'estimation',
        truth: results.truth,
        unit: session.unit,
        ranked: results.ranked
      };
      session.onRevealFinish = () => {
        room.questionSession = null;
        this.broadcastRoom(room);
        this.scheduleAiTurnIfNeeded(room);
      };
      this.broadcastRoom(room);
      room.revealTimer = setTimeout(() => this.finishRevealStage(room), 3800);
      return;
    }

    if (phase === PHASES.EXPANSION_QUESTION) {
      const results = eng.submitExpansionQuestionAnswers(session.submissions);
      session.revealData = {
        type: 'estimation',
        truth: results.truth,
        unit: session.unit,
        ranked: results.ranked
      };
      session.onRevealFinish = () => {
        room.questionSession = null;
        this.broadcastRoom(room);
        this.scheduleAiTurnIfNeeded(room);
      };
      this.broadcastRoom(room);
      room.revealTimer = setTimeout(() => this.finishRevealStage(room), 3800);
      return;
    }

    if (phase === PHASES.BATTLE_MC_QUESTION) {
      const res = eng.submitBattleMcAnswers(session.submissions);
      const mcRes = eng.activeBattle.mcResults;
      session.revealData = {
        type: 'multiple_choice',
        correctIndex: mcRes.correctIndex,
        attackerId: eng.activeBattle.attackerId,
        defenderId: eng.activeBattle.defenderId,
        attackerChoice: mcRes.attacker.choiceIndex,
        defenderChoice: mcRes.defender.choiceIndex,
        status: res.status,
        outcomeMessage: eng.activeBattle.outcome?.message || 'Mindketten helyesen válaszoltak! Tippelős párbaj következik!'
      };
      this.broadcastRoom(room);

      if (res.status === 'TIEBREAKER') {
        session.onRevealFinish = () => {
          this.startQuestionSession(room);
          this.broadcastRoom(room);
        };
        room.revealTimer = setTimeout(() => this.finishRevealStage(room), 3200);
      } else {
        session.onRevealFinish = () => {
          room.questionSession = null;
          eng.completeCurrentBattleTurn();
          this.checkGameOverOrAdvance(room);
        };
        room.revealTimer = setTimeout(() => this.finishRevealStage(room), 3600);
      }
      return;
    }

    if (phase === PHASES.BATTLE_TIEBREAKER_QUESTION) {
      eng.submitBattleTiebreakerAnswers(session.submissions);
      const tbRes = eng.activeBattle.tiebreakerResults;
      session.revealData = {
        type: 'estimation',
        truth: tbRes.truth,
        unit: session.unit,
        ranked: tbRes.ranked,
        outcomeMessage: eng.activeBattle.outcome?.message || ''
      };
      session.onRevealFinish = () => {
        room.questionSession = null;
        eng.completeCurrentBattleTurn();
        this.checkGameOverOrAdvance(room);
      };
      this.broadcastRoom(room);
      room.revealTimer = setTimeout(() => this.finishRevealStage(room), 4000);
    }
  }

  finishRevealStage(room) {
    clearTimeout(room.revealTimer);
    const session = room.questionSession;
    if (!session || session.stage !== 'REVEAL') return;
    const cb = session.onRevealFinish;
    session.onRevealFinish = null;
    if (cb) cb();
  }

  playerContinueReveal(code, token) {
    const room = this.rooms.get(String(code || '').toUpperCase());
    if (!room) throw new Error('Szoba nem található!');
    const color = this.getPlayerColorByToken(room, token);
    const session = room.questionSession;
    if (!session || session.stage !== 'REVEAL') {
      return this.serializeRoomState(room, token);
    }
    if (color) {
      session.continuedBy.add(color);
    }
    const humanParticipants = session.participants.filter(pid => room.engine.players[pid]?.isHuman);
    if (humanParticipants.every(pid => session.continuedBy.has(pid))) {
      this.finishRevealStage(room);
    }
    return this.serializeRoomState(room, token);
  }

  // ==================== MAP SELECTION & AI TURNS ====================
  selectCountyAction(code, token, countyId) {
    const room = this.rooms.get(String(code || '').toUpperCase());
    if (!room) throw new Error('Szoba nem található!');
    const color = this.getPlayerColorByToken(room, token);
    if (!color) throw new Error('Nem vagy részese a szobának!');

    const eng = room.engine;
    if (room.questionSession) {
      throw new Error('Kérdés kiértékelése folyamatban, kérlek várj!');
    }
    if (eng.currentSelector !== color) {
      throw new Error('Most nem a te köröd van!');
    }

    if (eng.phase === PHASES.BASE_SELECTION) {
      const res = eng.selectBaseCounty(color, countyId);
      if (!res.ok) throw new Error(res.reason);
      if (eng.phase === PHASES.EXPANSION_QUESTION) {
        this.startQuestionSession(room);
      } else {
        this.scheduleAiTurnIfNeeded(room);
      }
      this.broadcastRoom(room);
      return this.serializeRoomState(room, token);
    }

    if (eng.phase === PHASES.EXPANSION_SELECTION) {
      const res = eng.selectExpansionCounty(color, countyId);
      if (!res.ok) throw new Error(res.reason);
      if (eng.phase === PHASES.EXPANSION_QUESTION) {
        this.startQuestionSession(room);
      } else if (eng.phase === PHASES.BATTLE_SELECT_TARGET) {
        this.scheduleAiTurnIfNeeded(room);
      } else {
        this.scheduleAiTurnIfNeeded(room);
      }
      this.broadcastRoom(room);
      return this.serializeRoomState(room, token);
    }

    if (eng.phase === PHASES.BATTLE_SELECT_TARGET) {
      const res = eng.initiateAttack(color, countyId);
      if (!res.ok) throw new Error(res.reason);
      this.startQuestionSession(room);
      this.broadcastRoom(room);
      return this.serializeRoomState(room, token);
    }

    return this.serializeRoomState(room, token);
  }

  scheduleAiTurnIfNeeded(room) {
    clearTimeout(room.aiTimer);
    if (room.questionSession) return;

    const eng = room.engine;
    if (eng.phase === PHASES.GAME_OVER) {
      this.checkGameOverOrAdvance(room);
      return;
    }

    const currentId = eng.currentSelector;
    if (!currentId) return;
    const player = eng.players[currentId];
    if (!player || player.isHuman) return;

    room.aiTimer = setTimeout(() => {
      if (eng.phase === PHASES.BASE_SELECTION) {
        const chosen = eng.chooseAiBaseCounty(currentId);
        if (chosen) {
          eng.selectBaseCounty(currentId, chosen);
          if (eng.phase === PHASES.EXPANSION_QUESTION) {
            this.startQuestionSession(room);
          } else {
            this.scheduleAiTurnIfNeeded(room);
          }
          this.broadcastRoom(room);
        }
      } else if (eng.phase === PHASES.EXPANSION_SELECTION) {
        const chosen = eng.chooseAiExpansionCounty(currentId);
        if (chosen) {
          eng.selectExpansionCounty(currentId, chosen);
          if (eng.phase === PHASES.EXPANSION_QUESTION) {
            this.startQuestionSession(room);
          } else {
            this.scheduleAiTurnIfNeeded(room);
          }
          this.broadcastRoom(room);
        }
      } else if (eng.phase === PHASES.BATTLE_SELECT_TARGET) {
        const target = eng.chooseAiAttackTarget(currentId);
        if (target) {
          const res = eng.initiateAttack(currentId, target);
          if (res.ok) {
            this.startQuestionSession(room);
            this.broadcastRoom(room);
            return;
          }
        }
        eng.completeCurrentBattleTurn();
        this.checkGameOverOrAdvance(room);
      }
    }, 950);
  }

  async checkGameOverOrAdvance(room) {
    const eng = room.engine;
    if (eng.phase === PHASES.GAME_OVER && room.status !== 'FINISHED') {
      room.status = 'FINISHED';
      const standings = eng.getStandings();
      const winner = standings[0];
      try {
        await db.recordMatch({
          winnerName: winner.name,
          gameMode: 'online',
          roundsPlayed: eng.maxBattleRounds,
          players: Object.values(eng.players).map(p => ({
            id: p.id,
            name: p.name,
            score: p.score,
            counties: p.countiesCount,
            correctAnswers: p.correctAnswers,
            totalAnswers: p.totalAnswers
          }))
        });
      } catch {
        // non-blocking
      }
      this.broadcastRoom(room);
      return;
    }

    this.broadcastRoom(room);
    this.scheduleAiTurnIfNeeded(room);
  }

  sendChatMessage(code, token, message) {
    const room = this.rooms.get(String(code || '').toUpperCase());
    if (!room) throw new Error('Szoba nem található!');
    const color = this.getPlayerColorByToken(room, token);
    const senderName = color ? room.slots[color].name : 'Vezér';
    const cleanMsg = String(message || '').trim().slice(0, 140);
    if (!cleanMsg) return this.serializeRoomState(room, token);

    room.engine.logEvent(`💬 ${senderName}: „${cleanMsg}”`, 'chat');
    this.broadcastRoom(room);
    return this.serializeRoomState(room, token);
  }

  // ==================== STATE SERIALIZATION & SSE BROADCAST ====================
  serializeRoomState(room, viewerToken = null) {
    const viewerColor = this.getPlayerColorByToken(room, viewerToken);
    const eng = room.engine;

    let serializedQuestion = null;
    if (room.questionSession) {
      const s = room.questionSession;
      const submittedColors = Object.keys(s.submissions);
      serializedQuestion = {
        id: s.id,
        questionType: s.questionType,
        phaseAtStart: s.phaseAtStart,
        category: s.category,
        contextLabel: s.contextLabel,
        questionText: s.questionText,
        options: s.options,
        unit: s.unit,
        participants: s.participants,
        stage: s.stage,
        remainingSec: Math.max(0, Math.ceil((s.deadlineAt - Date.now()) / 1000)),
        submittedColors,
        hasViewerSubmitted: viewerColor ? Boolean(s.submissions[viewerColor]) : false,
        viewerHalvedOptions: viewerColor ? s.halvedByColor[viewerColor] || null : null,
        viewerOwlPoll: viewerColor ? s.owlPollByColor[viewerColor] || null : null,
        revealData: s.stage === 'REVEAL' ? s.revealData : null
      };
    }

    return {
      code: room.code,
      status: room.status,
      viewerColor,
      isViewerHost: Boolean(viewerToken && viewerToken === room.hostToken),
      settings: room.settings,
      invitedUsernames: room.invitedUsernames || [],
      slots: {
        red: { color: 'red', name: room.slots.red.name, isHuman: room.slots.red.isHuman, isHost: true },
        green: { color: 'green', name: room.slots.green.name, isHuman: room.slots.green.isHuman, isHost: false },
        blue: { color: 'blue', name: room.slots.blue.name, isHuman: room.slots.blue.isHuman, isHost: false }
      },
      phase: eng.phase,
      currentSelector: eng.currentSelector,
      currentBattleRound: eng.currentBattleRound,
      maxBattleRounds: eng.maxBattleRounds,
      players: eng.players,
      counties: eng.counties,
      activeBattle: eng.activeBattle
        ? {
            attackerId: eng.activeBattle.attackerId,
            defenderId: eng.activeBattle.defenderId,
            targetCountyId: eng.activeBattle.targetCountyId,
            outcome: eng.activeBattle.outcome
          }
        : null,
      questionSession: serializedQuestion,
      chronicle: eng.chronicle,
      standings: eng.phase === PHASES.GAME_OVER ? eng.getStandings() : null
    };
  }

  subscribeSse(code, token, res) {
    const room = this.rooms.get(String(code || '').toUpperCase());
    if (!room) {
      res.writeHead(404);
      res.end();
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    });

    const client = { res, token };
    room.sseClients.add(client);

    // Send initial snapshot immediately
    const initialData = JSON.stringify(this.serializeRoomState(room, token));
    res.write(`data: ${initialData}\n\n`);

    res.on('close', () => {
      room.sseClients.delete(client);
    });
  }

  broadcastRoom(room) {
    for (const client of room.sseClients) {
      try {
        const payload = JSON.stringify(this.serializeRoomState(room, client.token));
        client.res.write(`data: ${payload}\n\n`);
      } catch {
        room.sseClients.delete(client);
      }
    }
  }

  getRoomState(code, token) {
    const room = this.rooms.get(String(code || '').toUpperCase());
    if (!room) throw new Error('Nem található ilyen kódú online szoba!');
    return this.serializeRoomState(room, token);
  }
}

export const roomManager = new RoomManager();
