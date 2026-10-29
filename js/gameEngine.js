// Core Honfoglalo Game Engine (3 Players: Red, Green, Blue across 19 Counties)
import { HUNGARY_COUNTIES } from './mapData.js';
import { ESTIMATION_QUESTIONS, MULTIPLE_CHOICE_QUESTIONS } from './questions.js';

export const PHASES = {
  LOBBY: 'LOBBY',
  BASE_QUESTION: 'BASE_QUESTION',
  BASE_SELECTION: 'BASE_SELECTION',
  EXPANSION_QUESTION: 'EXPANSION_QUESTION',
  EXPANSION_SELECTION: 'EXPANSION_SELECTION',
  BATTLE_SELECT_TARGET: 'BATTLE_SELECT_TARGET',
  BATTLE_MC_QUESTION: 'BATTLE_MC_QUESTION',
  BATTLE_TIEBREAKER_QUESTION: 'BATTLE_TIEBREAKER_QUESTION',
  GAME_OVER: 'GAME_OVER'
};

export const PLAYER_COLORS = {
  red: {
    id: 'red',
    label: 'Piros Vezér',
    fill: '#c9382b',
    fillHover: '#e04839',
    stroke: '#6e160f',
    badgeBg: '#992117'
  },
  green: {
    id: 'green',
    label: 'Zöld Vezér',
    fill: '#2e8b47',
    fillHover: '#3ca659',
    stroke: '#154d24',
    badgeBg: '#1e6932'
  },
  blue: {
    id: 'blue',
    label: 'Kék Vezér',
    fill: '#2864b8',
    fillHover: '#397bd6',
    stroke: '#113469',
    badgeBg: '#1c498a'
  }
};

export class HonfoglaloEngine {
  constructor() {
    this.mcPool = [...MULTIPLE_CHOICE_QUESTIONS];
    this.estPool = [...ESTIMATION_QUESTIONS];
    this.usedMcIds = new Set();
    this.usedEstIds = new Set();
    this.resetState();
  }

  setQuestionDatabase({ multipleChoice, estimation }) {
    if (Array.isArray(multipleChoice) && multipleChoice.length > 0) {
      this.mcPool = multipleChoice;
    }
    if (Array.isArray(estimation) && estimation.length > 0) {
      this.estPool = estimation;
    }
  }

  resetState() {
    this.phase = PHASES.LOBBY;
    this.gameMode = 'singleplayer'; // 'singleplayer' | 'passandplay'
    this.aiDifficulty = 'normal'; // 'easy' | 'normal' | 'hard'
    this.maxBattleRounds = 6;
    this.currentBattleRound = 1;
    this.battleTurnQueue = [];
    this.currentBattleTurnIndex = 0;

    this.players = {
      red: this.createPlayer('red', 'Játékos 1', true),
      green: this.createPlayer('green', 'Gép 1', false),
      blue: this.createPlayer('blue', 'Gép 2', false)
    };

    this.counties = {};
    for (const c of HUNGARY_COUNTIES) {
      this.counties[c.id] = {
        id: c.id,
        name: c.name,
        shortName: c.shortName,
        seat: c.seat,
        neighbors: c.neighbors,
        owner: null,
        isBase: false,
        towers: 0,
        points: 0
      };
    }

    this.selectionQueue = [];
    this.currentSelector = null;
    this.activeQuestion = null;
    this.lastQuestionResults = null;
    this.activeBattle = null;
    this.chronicle = [];
  }

  createPlayer(id, name, isHuman) {
    return {
      id,
      name,
      isHuman,
      eliminated: false,
      baseCountyId: null,
      score: 0,
      countiesCount: 0,
      correctAnswers: 0,
      totalAnswers: 0,
      lifelines: {
        halve: true,     // 50:50 Felező
        owl: true,       // Bagoly súgása (közönség)
        extraTime: true  // +10 mp Időhúzás
      }
    };
  }

  logEvent(message, type = 'info') {
    const time = new Date().toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    this.chronicle.unshift({ time, message, type });
    if (this.chronicle.length > 60) {
      this.chronicle.pop();
    }
  }

  startNewGame({ redName, greenName, blueName, gameMode = 'singleplayer', aiDifficulty = 'normal', maxBattleRounds = 6 }) {
    this.resetState();
    this.gameMode = gameMode;
    this.aiDifficulty = aiDifficulty;
    this.maxBattleRounds = Number(maxBattleRounds) || 6;

    this.players.red = this.createPlayer('red', redName || 'Piros Vezér', true);
    this.players.green = this.createPlayer('green', greenName || 'Koppány Vezér', gameMode === 'passandplay');
    this.players.blue = this.createPlayer('blue', blueName || 'Gyula Vezér', gameMode === 'passandplay');

    this.logEvent('Elkezdődött a Honfoglalás! 1. fázis: Bázisépítés (Váralapítás).', 'phase');
    this.startBasePhaseQuestion();
  }

  drawEstimationQuestion() {
    let available = this.estPool.filter(q => !this.usedEstIds.has(q.id));
    if (available.length === 0) {
      this.usedEstIds.clear();
      available = [...this.estPool];
    }
    const chosen = available[Math.floor(Math.random() * available.length)];
    this.usedEstIds.add(chosen.id);
    return { ...chosen, type: 'estimation' };
  }

  drawMultipleChoiceQuestion() {
    let available = this.mcPool.filter(q => !this.usedMcIds.has(q.id));
    if (available.length === 0) {
      this.usedMcIds.clear();
      available = [...this.mcPool];
    }
    const raw = available[Math.floor(Math.random() * available.length)];
    this.usedMcIds.add(raw.id);

    // Shuffle options so the correct answer is in a random slot
    const indexed = raw.options.map((text, idx) => ({
      text,
      isCorrect: idx === raw.correctIndex
    }));
    for (let i = indexed.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indexed[i], indexed[j]] = [indexed[j], indexed[i]];
    }
    const options = indexed.map(item => item.text);
    const correctIndex = indexed.findIndex(item => item.isCorrect);

    return {
      id: raw.id,
      dbId: raw.dbId,
      category: raw.category,
      question: raw.question,
      options,
      correctIndex,
      type: 'multiple_choice'
    };
  }

  simulateAiEstimation(question) {
    const truth = Number(question.answer);
    let maxErrorRatio = 0.22;
    if (this.aiDifficulty === 'easy') maxErrorRatio = 0.42;
    if (this.aiDifficulty === 'hard') maxErrorRatio = 0.08;

    // Occasionally AI knows the exact year/number
    const exactChance = this.aiDifficulty === 'hard' ? 0.25 : this.aiDifficulty === 'normal' ? 0.12 : 0.04;
    if (Math.random() < exactChance) {
      return {
        guess: truth,
        timeMs: Math.floor(2400 + Math.random() * 4500)
      };
    }

    const spread = Math.max(3, Math.round(Math.abs(truth) * maxErrorRatio));
    const delta = Math.round((Math.random() * 2 - 1) * spread);
    const guess = Math.max(0, truth + delta);
    const timeMs = Math.floor(2200 + Math.random() * 6800);
    return { guess, timeMs };
  }

  simulateAiMultipleChoice(question) {
    let accuracy = 0.65;
    if (this.aiDifficulty === 'easy') accuracy = 0.45;
    if (this.aiDifficulty === 'hard') accuracy = 0.82;

    const isCorrect = Math.random() < accuracy;
    let choiceIndex = question.correctIndex;
    if (!isCorrect) {
      const wrongIndices = [0, 1, 2, 3].filter(i => i !== question.correctIndex);
      choiceIndex = wrongIndices[Math.floor(Math.random() * wrongIndices.length)];
    }
    const timeMs = Math.floor(2000 + Math.random() * 6500);
    return { choiceIndex, isCorrect, timeMs };
  }

  // ==================== PHASE 1: BASE PLACEMENT ====================
  startBasePhaseQuestion() {
    this.phase = PHASES.BASE_QUESTION;
    this.activeQuestion = this.drawEstimationQuestion();
    this.activeQuestion.participants = ['red', 'green', 'blue'];
    this.activeQuestion.contextLabel = 'Bázisépítés – Ki választhat először vármegyét a várának?';
  }

  resolveEstimationOrder(submissions) {
    const truth = Number(this.activeQuestion.answer);
    const ranked = Object.entries(submissions).map(([playerId, sub]) => {
      const hasValidGuess = sub && sub.guess !== null && sub.guess !== undefined && sub.guess !== '' && Number.isFinite(Number(sub.guess));
      const guessVal = hasValidGuess ? Number(sub.guess) : null;
      const diff = hasValidGuess ? Math.abs(guessVal - truth) : Infinity;
      const timeMs = sub && Number.isFinite(sub.timeMs) ? sub.timeMs : 15000;

      const p = this.players[playerId];
      if (p) {
        p.totalAnswers += 1;
        if (diff === 0) p.correctAnswers += 1;
      }

      return {
        playerId,
        playerName: p ? p.name : playerId,
        guess: guessVal,
        diff,
        timeMs
      };
    });

    ranked.sort((a, b) => {
      if (a.diff !== b.diff) return a.diff - b.diff;
      return a.timeMs - b.timeMs;
    });

    this.lastQuestionResults = {
      question: this.activeQuestion,
      truth,
      ranked
    };

    return ranked;
  }

  submitBaseQuestionAnswers(submissions) {
    const ranked = this.resolveEstimationOrder(submissions);
    this.selectionQueue = ranked.map(r => r.playerId);
    this.phase = PHASES.BASE_SELECTION;
    this.currentSelector = this.selectionQueue[0];

    const orderNames = ranked.map((r, idx) => `${idx + 1}. ${r.playerName} (${r.guess ?? '–'})`).join(', ');
    this.logEvent(`Váralapítási sorrend (Helyes válasz: ${this.activeQuestion.answer}): ${orderNames}.`, 'question');
    return this.lastQuestionResults;
  }

  getValidBaseCounties() {
    return Object.values(this.counties)
      .filter(c => c.owner === null)
      .map(c => c.id);
  }

  selectBaseCounty(playerId, countyId) {
    if (this.phase !== PHASES.BASE_SELECTION || this.currentSelector !== playerId) {
      return { ok: false, reason: 'Nem ez a vezér következik!' };
    }
    const county = this.counties[countyId];
    if (!county || county.owner !== null) {
      return { ok: false, reason: 'Ez a vármegye már foglalt!' };
    }

    county.owner = playerId;
    county.isBase = true;
    county.towers = 3;
    county.points = 1000;

    const player = this.players[playerId];
    player.baseCountyId = countyId;
    this.recalculateScores();

    this.logEvent(`${player.name} felépítette 3 tornyú várát ${county.name} vármegyében (${county.seat})!`, 'castle');

    this.selectionQueue.shift();
    if (this.selectionQueue.length > 0) {
      this.currentSelector = this.selectionQueue[0];
    } else {
      this.currentSelector = null;
      this.logEvent('Minden vezér felépítette a várát! 2. fázis: Szabad területek elfoglalása (Terjeszkedés).', 'phase');
      this.startExpansionQuestion();
    }

    return { ok: true, county };
  }

  chooseAiBaseCounty(playerId) {
    const validIds = this.getValidBaseCounties();
    if (validIds.length === 0) return null;

    // Prefer counties that are not immediately adjacent to existing enemy bases and have good neighbor count
    const scored = validIds.map(id => {
      const c = this.counties[id];
      const adjacentEnemyBases = c.neighbors.filter(nid => this.counties[nid]?.isBase).length;
      const freeNeighbors = c.neighbors.filter(nid => this.counties[nid]?.owner === null).length;
      const score = freeNeighbors * 3 - adjacentEnemyBases * 8 + Math.random() * 2;
      return { id, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0].id;
  }

  // ==================== PHASE 2: FREE TERRITORY EXPANSION ====================
  getFreeCountiesCount() {
    return Object.values(this.counties).filter(c => c.owner === null).length;
  }

  startExpansionQuestion() {
    const freeCount = this.getFreeCountiesCount();
    if (freeCount === 0) {
      this.startBattlePhase();
      return;
    }

    this.phase = PHASES.EXPANSION_QUESTION;
    this.activeQuestion = this.drawEstimationQuestion();
    this.activeQuestion.participants = ['red', 'green', 'blue'];
    this.activeQuestion.contextLabel = `Terjeszkedés (${freeCount} szabad vármegye maradt) – Tippelős kérdés!`;
  }

  submitExpansionQuestionAnswers(submissions) {
    const ranked = this.resolveEstimationOrder(submissions);
    const firstPlayer = ranked[0].playerId;
    const secondPlayer = ranked[1].playerId;
    const freeCount = this.getFreeCountiesCount();

    // Classic Honfoglalo rule: 1st place claims 2 territories, 2nd place claims 1 territory (capped by remaining free territories)
    const rawQueue = [firstPlayer, firstPlayer, secondPlayer];
    this.selectionQueue = rawQueue.slice(0, freeCount);
    this.phase = PHASES.EXPANSION_SELECTION;
    this.currentSelector = this.selectionQueue[0];

    this.logEvent(
      `Terjeszkedési eredmény (Helyes: ${this.activeQuestion.answer}): 1. ${ranked[0].playerName} (2 megye), 2. ${ranked[1].playerName} (1 megye), 3. ${ranked[2].playerName}.`,
      'question'
    );
    return this.lastQuestionResults;
  }

  getValidExpansionCounties(playerId) {
    const allFree = Object.values(this.counties).filter(c => c.owner === null);
    if (allFree.length === 0) return [];

    const ownedIds = Object.values(this.counties)
      .filter(c => c.owner === playerId)
      .map(c => c.id);

    const adjacentFree = allFree.filter(c =>
      c.neighbors.some(nid => ownedIds.includes(nid))
    );

    // If adjacent free territories exist, player must pick one of them; otherwise can jump ("ejtőernyőzés") to any free county
    if (adjacentFree.length > 0) {
      return adjacentFree.map(c => c.id);
    }
    return allFree.map(c => c.id);
  }

  selectExpansionCounty(playerId, countyId) {
    if (this.phase !== PHASES.EXPANSION_SELECTION || this.currentSelector !== playerId) {
      return { ok: false, reason: 'Nem ez a vezér következik!' };
    }
    const validIds = this.getValidExpansionCounties(playerId);
    if (!validIds.includes(countyId)) {
      return { ok: false, reason: 'Csak saját területeddel szomszédos szabad vármegyét választhatsz!' };
    }

    const county = this.counties[countyId];
    county.owner = playerId;
    county.isBase = false;
    county.towers = 1;
    county.points = 200;

    this.recalculateScores();
    this.logEvent(`${this.players[playerId].name} elfoglalta ${county.name} vármegyét (+200 pont).`, 'claim');

    this.selectionQueue.shift();
    if (this.selectionQueue.length > 0 && this.getFreeCountiesCount() > 0) {
      this.currentSelector = this.selectionQueue[0];
    } else {
      this.currentSelector = null;
      if (this.getFreeCountiesCount() > 0) {
        this.startExpansionQuestion();
      } else {
        this.startBattlePhase();
      }
    }

    return { ok: true, county };
  }

  chooseAiExpansionCounty(playerId) {
    const validIds = this.getValidExpansionCounties(playerId);
    if (validIds.length === 0) return null;

    // Pick a county that expands options or borders high-value areas
    const scored = validIds.map(id => {
      const c = this.counties[id];
      const freeNeighbors = c.neighbors.filter(nid => this.counties[nid]?.owner === null).length;
      const ownNeighbors = c.neighbors.filter(nid => this.counties[nid]?.owner === playerId).length;
      return { id, score: freeNeighbors * 2 + ownNeighbors + Math.random() };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0].id;
  }

  // ==================== PHASE 3: 6-ROUND BATTLE PHASE ====================
  startBattlePhase() {
    this.currentBattleRound = 1;
    this.logEvent('Minden vármegye gazdára talált! Kezdődik a 3. fázis: HARC (6 körön át)!', 'phase');
    this.prepareBattleRound(1);
  }

  prepareBattleRound(roundNumber) {
    this.currentBattleRound = roundNumber;
    const aliveIds = ['red', 'green', 'blue'].filter(id => !this.players[id].eliminated);

    if (aliveIds.length <= 1 || roundNumber > this.maxBattleRounds) {
      this.finishGame();
      return;
    }

    // Rotate starting order each round for fairness
    const shift = (roundNumber - 1) % aliveIds.length;
    this.battleTurnQueue = [...aliveIds.slice(shift), ...aliveIds.slice(0, shift)];
    this.currentBattleTurnIndex = 0;

    this.logEvent(`--- ${roundNumber}. HARCI KÖR (${this.maxBattleRounds} körből) ---`, 'phase');
    this.advanceBattleTurn();
  }

  advanceBattleTurn() {
    while (this.currentBattleTurnIndex < this.battleTurnQueue.length) {
      const attackerId = this.battleTurnQueue[this.currentBattleTurnIndex];
      const attacker = this.players[attackerId];
      if (!attacker.eliminated && this.getValidAttackTargets(attackerId).length > 0) {
        this.phase = PHASES.BATTLE_SELECT_TARGET;
        this.currentSelector = attackerId;
        this.activeBattle = null;
        return;
      }
      this.currentBattleTurnIndex += 1;
    }

    // Round finished
    if (this.currentBattleRound < this.maxBattleRounds) {
      this.prepareBattleRound(this.currentBattleRound + 1);
    } else {
      this.finishGame();
    }
  }

  getValidAttackTargets(attackerId) {
    const ownedIds = Object.values(this.counties)
      .filter(c => c.owner === attackerId)
      .map(c => c.id);

    if (ownedIds.length === 0) return [];

    const adjacentEnemy = Object.values(this.counties).filter(
      c => c.owner !== null && c.owner !== attackerId && c.neighbors.some(nid => ownedIds.includes(nid))
    );

    if (adjacentEnemy.length > 0) {
      return adjacentEnemy.map(c => c.id);
    }

    // Fallback if somehow isolated: allow attacking any enemy county
    return Object.values(this.counties)
      .filter(c => c.owner !== null && c.owner !== attackerId)
      .map(c => c.id);
  }

  initiateAttack(attackerId, targetCountyId) {
    if (this.phase !== PHASES.BATTLE_SELECT_TARGET || this.currentSelector !== attackerId) {
      return { ok: false, reason: 'Nem ez a vezér támad most!' };
    }
    const validTargets = this.getValidAttackTargets(attackerId);
    if (!validTargets.includes(targetCountyId)) {
      return { ok: false, reason: 'Csak saját területeddel szomszédos ellenséges vármegyét támadhatsz!' };
    }

    const county = this.counties[targetCountyId];
    const defenderId = county.owner;

    this.activeQuestion = this.drawMultipleChoiceQuestion();
    this.activeQuestion.participants = [attackerId, defenderId];
    this.activeQuestion.contextLabel = `${this.players[attackerId].name} vs ${this.players[defenderId].name} (${county.name} ostroma)`;

    this.activeBattle = {
      attackerId,
      defenderId,
      targetCountyId,
      isBaseSiege: county.isBase,
      towersBefore: county.towers,
      mcResults: null,
      tiebreakerResults: null,
      outcome: null
    };

    this.phase = PHASES.BATTLE_MC_QUESTION;
    this.logEvent(
      `${this.players[attackerId].name} megtámadta ${this.players[defenderId].name} területét: ${county.name}${county.isBase ? ` (Bázis – ${county.towers}/3)` : ''}.`,
      'battle'
    );

    return { ok: true, battle: this.activeBattle, question: this.activeQuestion };
  }

  chooseAiAttackTarget(attackerId) {
    const validIds = this.getValidAttackTargets(attackerId);
    if (validIds.length === 0) return null;

    const scored = validIds.map(id => {
      const c = this.counties[id];
      let val = c.points;
      if (c.isBase) {
        // Attacking a weakened 1-tower or 2-tower castle is super high priority!
        if (c.towers === 1) val += 2500;
        else if (c.towers === 2) val += 900;
        else val += 350;
      } else {
        val += 300;
      }
      // Prefer attacking the leading opponent
      const defenderScore = this.players[c.owner]?.score || 0;
      val += defenderScore * 0.1 + Math.random() * 120;
      return { id, score: val };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0].id;
  }

  submitBattleMcAnswers(submissions) {
    const { attackerId, defenderId, targetCountyId } = this.activeBattle;
    const correctIndex = this.activeQuestion.correctIndex;

    const attSub = submissions[attackerId] || { choiceIndex: -1, timeMs: 15000 };
    const defSub = submissions[defenderId] || { choiceIndex: -1, timeMs: 15000 };

    const attCorrect = Number(attSub.choiceIndex) === correctIndex;
    const defCorrect = Number(defSub.choiceIndex) === correctIndex;

    this.players[attackerId].totalAnswers += 1;
    if (attCorrect) this.players[attackerId].correctAnswers += 1;

    this.players[defenderId].totalAnswers += 1;
    if (defCorrect) this.players[defenderId].correctAnswers += 1;

    this.activeBattle.mcResults = {
      question: this.activeQuestion,
      correctIndex,
      attacker: { ...attSub, isCorrect: attCorrect },
      defender: { ...defSub, isCorrect: defCorrect }
    };

    if (attCorrect && !defCorrect) {
      // Attacker wins outright
      this.applyBattleOutcome(true, 'Feleletválasztós győzelem');
      return { status: 'RESOLVED', winnerId: attackerId, battle: this.activeBattle };
    }

    if (!attCorrect) {
      // Defender successfully defends (regardless of whether defender also got it right or wrong, per classic Honfoglalo rules)
      this.applyBattleOutcome(false, defCorrect ? 'Sikeres védekezés' : 'Mindkét válasz hibás – a védő megtartja a megyét');
      return { status: 'RESOLVED', winnerId: defenderId, battle: this.activeBattle };
    }

    // Both answered correctly -> Tie-breaker Estimation Question!
    this.phase = PHASES.BATTLE_TIEBREAKER_QUESTION;
    const county = this.counties[targetCountyId];
    this.activeQuestion = this.drawEstimationQuestion();
    this.activeQuestion.participants = [attackerId, defenderId];
    this.activeQuestion.contextLabel = `Mindketten helyesen válaszoltak! Tippelős párbaj ${county.name} vármegyéért!`;

    this.logEvent(`Mindkét vezér helyesen válaszolt! Tippelős párbaj dönt ${county.name} sorsáról.`, 'question');
    return { status: 'TIEBREAKER', question: this.activeQuestion, battle: this.activeBattle };
  }

  submitBattleTiebreakerAnswers(submissions) {
    const { attackerId, defenderId } = this.activeBattle;
    const ranked = this.resolveEstimationOrder({
      [attackerId]: submissions[attackerId],
      [defenderId]: submissions[defenderId]
    });

    const winnerId = ranked[0].playerId;
    const attackerWon = winnerId === attackerId;

    this.activeBattle.tiebreakerResults = {
      question: this.activeQuestion,
      truth: Number(this.activeQuestion.answer),
      ranked
    };

    this.applyBattleOutcome(attackerWon, `Tippelős párbaj (Helyes: ${this.activeQuestion.answer})`);
    return { status: 'RESOLVED', winnerId, battle: this.activeBattle };
  }

  applyBattleOutcome(attackerWon, reasonText) {
    const { attackerId, defenderId, targetCountyId } = this.activeBattle;
    const attacker = this.players[attackerId];
    const defender = this.players[defenderId];
    const county = this.counties[targetCountyId];

    if (attackerWon) {
      if (county.isBase) {
        county.towers -= 1;
        if (county.towers > 0) {
          this.activeBattle.outcome = {
            attackerWon: true,
            towerDestroyed: true,
            baseConquered: false,
            message: `${attacker.name} lerombolt egy bázispajzsot (${county.name})! Még ${county.towers} maradt.`
          };
          this.logEvent(this.activeBattle.outcome.message, 'battle');
        } else {
          // Base falls! Attacker inherits ALL of Defender's counties!
          county.isBase = false;
          county.towers = 1;
          county.points = 1000;
          let inheritedCount = 0;
          for (const c of Object.values(this.counties)) {
            if (c.owner === defenderId) {
              c.owner = attackerId;
              if (c.id !== targetCountyId && c.points < 400) {
                c.points = 400;
              }
              inheritedCount += 1;
            }
          }
          defender.eliminated = true;
          this.activeBattle.outcome = {
            attackerWon: true,
            towerDestroyed: true,
            baseConquered: true,
            message: `${attacker.name} elfoglalta ${defender.name} bázisát (${county.name}), és megszerezte mind a(z) ${inheritedCount} megyéjét!`
          };
          this.logEvent(this.activeBattle.outcome.message, 'castle');
        }
      } else {
        county.owner = attackerId;
        county.points = 400;
        county.towers = 1;

        const remainingDefenderCounties = Object.values(this.counties).filter(c => c.owner === defenderId).length;
        if (remainingDefenderCounties === 0) {
          defender.eliminated = true;
        }

        this.activeBattle.outcome = {
          attackerWon: true,
          towerDestroyed: false,
          baseConquered: false,
          message: `${attacker.name} elfoglalta ${county.name} megyét (${defender.name} játékostól, +400 pont).`
        };
        this.logEvent(this.activeBattle.outcome.message, 'claim');
      }
    } else {
      county.points += 100;
      this.activeBattle.outcome = {
        attackerWon: false,
        towerDestroyed: false,
        baseConquered: false,
        message: `${defender.name} sikeresen megvédte ${county.name} megyét (+100 védelmi pont).`
      };
      this.logEvent(this.activeBattle.outcome.message, 'info');
    }

    this.recalculateScores();
  }

  completeCurrentBattleTurn() {
    const battle = this.activeBattle;
    // Chained siege: if the attacker destroyed a tower but the castle still stands,
    // the same attacker keeps attacking until all towers fall or a question is missed.
    const siegeContinues =
      battle &&
      battle.isBaseSiege &&
      battle.outcome?.attackerWon &&
      battle.outcome?.towerDestroyed &&
      !battle.outcome?.baseConquered;

    if (siegeContinues) {
      const { attackerId, defenderId, targetCountyId } = battle;
      const county = this.counties[targetCountyId];
      const attacker = this.players[attackerId];
      const defender = this.players[defenderId];

      this.activeQuestion = this.drawMultipleChoiceQuestion();
      this.activeQuestion.participants = [attackerId, defenderId];
      this.activeQuestion.contextLabel = `${attacker.name} folytatja ${county.name} ostromát (${county.towers}/3 torony maradt)!`;

      this.activeBattle = {
        attackerId,
        defenderId,
        targetCountyId,
        isBaseSiege: true,
        towersBefore: county.towers,
        siegeChain: (battle.siegeChain || 1) + 1,
        mcResults: null,
        tiebreakerResults: null,
        outcome: null
      };

      this.phase = PHASES.BATTLE_MC_QUESTION;
      this.logEvent(
        `${attacker.name} nem adja fel az ostromot – újabb támadás ${defender.name} ${county.name} vára ellen (${county.towers} torony maradt)!`,
        'battle'
      );
      return;
    }

    this.activeBattle = null;
    const aliveIds = ['red', 'green', 'blue'].filter(id => !this.players[id].eliminated);
    if (aliveIds.length <= 1) {
      this.finishGame();
      return;
    }
    this.currentBattleTurnIndex += 1;
    this.advanceBattleTurn();
  }

  recalculateScores() {
    for (const id of ['red', 'green', 'blue']) {
      const owned = Object.values(this.counties).filter(c => c.owner === id);
      this.players[id].countiesCount = owned.length;
      this.players[id].score = owned.reduce((sum, c) => sum + c.points, 0);
    }
  }

  finishGame() {
    this.recalculateScores();
    this.phase = PHASES.GAME_OVER;
    this.currentSelector = null;

    const standings = this.getStandings();
    const winner = standings[0];
    this.logEvent(`🏆 A játék véget ért! Győztes: ${winner.name} (${winner.score} pont, ${winner.countiesCount} vármegye)!`, 'castle');
  }

  getStandings() {
    this.recalculateScores();
    return Object.values(this.players).sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.countiesCount !== a.countiesCount) return b.countiesCount - a.countiesCount;
      return b.correctAnswers - a.correctAnswers;
    });
  }
}
