// Dedicated Game Window Controller (game.html) – Supports Online Room & AI Solo Modes
import { HUNGARY_COUNTIES } from './mapData.js';
import { HonfoglaloEngine, PHASES } from './gameEngine.js';
import { sound } from './audio.js';

const engine = new HonfoglaloEngine();
let currentUser = null;

// Mode configuration from URL query params
const params = new URLSearchParams(window.location.search);
const mode = params.get('mode') || (params.get('room') ? 'online' : 'ai');
const roomCode = (params.get('room') || '').trim().toUpperCase();
const urlToken = params.get('token') || '';
const aiDiff = params.get('diff') || 'normal';
const battleRounds = Number(params.get('rounds') || 6);

// Online state
const online = {
  active: mode === 'online' && Boolean(roomCode),
  code: roomCode,
  token: urlToken,
  myColor: null,
  sse: null,
  pollId: null,
  lastQuestionId: null,
  lastStage: null
};

// Local timer state (for AI mode)
let localTimerId = null;
let localTimeLeft = 15;
let localStartMs = 0;
let localAnsweringColor = null;
let localSubmissions = {};
let localAfterEstCallback = null;

async function initGameWindow() {
  // Enforce mandatory Registration / Login!
  try {
    const raw = sessionStorage.getItem('honfoglalo_user') || localStorage.getItem('honfoglalo_user');
    if (raw) currentUser = JSON.parse(raw);
  } catch {
    currentUser = null;
  }

  if (!currentUser) {
    window.location.replace('/index.html');
    return;
  }

  buildSvgMap();
  bindGameEvents();

  try {
    const qRes = await fetch('/api/questions');
    if (qRes.ok) {
      const qData = await qRes.json();
      engine.setQuestionDatabase(qData);
    }
  } catch {
    // fallback to built-in questions
  }

  if (online.active) {
    if (!online.token) {
      online.token =
        sessionStorage.getItem(`honfoglalo_room_token_${online.code}`) ||
        localStorage.getItem(`honfoglalo_room_token_${online.code}`) ||
        '';
    }
    await connectOnlineGame();
  } else {
    startSoloAiGame();
  }
}

// ==================== SVG MAP RENDERING ====================
function buildSvgMap() {
  const pathsGroup = document.getElementById('mapPathsGroup');
  const overlaysGroup = document.getElementById('mapOverlaysGroup');
  pathsGroup.innerHTML = '';
  overlaysGroup.innerHTML = '';

  for (const c of HUNGARY_COUNTIES) {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', c.path);
    p.setAttribute('id', `county-path-${c.id}`);
    p.setAttribute('class', 'county-path');

    p.addEventListener('mouseenter', e => showCountyTooltip(c.id, e));
    p.addEventListener('mousemove', e => moveCountyTooltip(e));
    p.addEventListener('mouseleave', () => hideCountyTooltip());
    p.addEventListener('click', () => onCountyClick(c.id));

    pathsGroup.appendChild(p);

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('id', `county-overlay-${c.id}`);
    g.setAttribute('transform', `translate(${c.cx}, ${c.cy})`);
    overlaysGroup.appendChild(g);
  }
}

function getModernFortressSvg(towers, isBase) {
  if (isBase) {
    const t1 = towers >= 1 ? '<rect x="-15" y="-20" width="7" height="14" fill="#ffd966" stroke="#2a1606" stroke-width="1.2"/><polygon points="-16,-20 -11.5,-26 -7,-20" fill="#fff"/>' : '';
    const t2 = towers >= 2 ? '<rect x="-3.5" y="-24" width="7" height="18" fill="#ffd966" stroke="#2a1606" stroke-width="1.2"/><polygon points="-5,-24 0,-31 5,-24" fill="#fff"/>' : '';
    const t3 = towers >= 3 ? '<rect x="8" y="-20" width="7" height="14" fill="#ffd966" stroke="#2a1606" stroke-width="1.2"/><polygon points="7,-20 11.5,-26 16,-20" fill="#fff"/>' : '';
    return `
      <g transform="translate(0, -6)">
        ${t1}${t2}${t3}
        <rect x="-16" y="-9" width="32" height="9" rx="1.5" fill="#f5c445" stroke="#2a1606" stroke-width="1.4"/>
        <rect x="-4" y="-6" width="8" height="6" rx="3" fill="#2a1606"/>
      </g>
    `;
  } else if (towers > 0) {
    return `
      <g transform="translate(0, -5)">
        <rect x="-5" y="-18" width="10" height="12" rx="1" fill="#f3e2c3" stroke="#2a1606" stroke-width="1.3"/>
        <polygon points="-6.5,-18 0,-24 6.5,-18" fill="#ffd966" stroke="#2a1606" stroke-width="1"/>
      </g>
    `;
  }
  return '';
}

function renderMapState() {
  const selectableIds = getSelectableIds();

  for (const c of HUNGARY_COUNTIES) {
    const st = engine.counties[c.id];
    const pathEl = document.getElementById(`county-path-${c.id}`);
    const overEl = document.getElementById(`county-overlay-${c.id}`);
    if (!pathEl || !overEl) continue;

    const cls = ['county-path'];
    if (st.owner) cls.push(`county-path--${st.owner}`);
    if (selectableIds.includes(c.id)) cls.push('county-path--selectable');
    pathEl.setAttribute('class', cls.join(' '));

    const nameCls = st.owner ? 'county-name-label county-name-label--owned' : 'county-name-label';
    const baseIndicator = st.owner ? getModernFortressSvg(st.towers, st.isBase) : '';
    const ptsText = st.owner ? `${st.points}` : '';

    overEl.innerHTML = `
      ${baseIndicator}
      <text y="3" class="${nameCls}">${c.shortName}</text>
      ${ptsText ? `<text y="15" class="county-score-label">${ptsText}</text>` : ''}
    `;
  }
}

function getSelectableIds() {
  const sel = engine.currentSelector;
  if (!sel) return [];
  if (online.active && sel !== online.myColor) return [];
  const p = engine.players[sel];
  if (!p || !p.isHuman) return [];

  if (engine.phase === PHASES.BASE_SELECTION) return engine.getValidBaseCounties();
  if (engine.phase === PHASES.EXPANSION_SELECTION) return engine.getValidExpansionCounties(sel);
  if (engine.phase === PHASES.BATTLE_SELECT_TARGET) return engine.getValidAttackTargets(sel);
  return [];
}

function showCountyTooltip(countyId, event) {
  const st = engine.counties[countyId];
  if (!st) return;
  const ownerName = st.owner ? engine.players[st.owner]?.name : 'Szabad terület';
  const neighbors = st.neighbors.map(nid => engine.counties[nid]?.shortName || nid).join(', ');

  const tip = document.getElementById('countyTooltip');
  tip.innerHTML = `
    <div style="font-weight:700; color:#fff; margin-bottom:2px;">${st.name} vármegye</div>
    <div style="color:var(--text-dim);">Székhely: <strong>${st.seat}</strong></div>
    <div style="color:var(--text-dim);">Birtokos: <strong>${ownerName}</strong></div>
    ${st.owner ? `<div style="color:#fde047; font-weight:700;">${st.points} pont ${st.isBase ? `(${st.towers}/3 bázis)` : ''}</div>` : ''}
  `;
  tip.classList.remove('hidden');
  moveCountyTooltip(event);

  document.getElementById('countyDetailBox').innerHTML = `
    <div><strong>Vármegye:</strong> ${st.name}</div>
    <div><strong>Székhely:</strong> ${st.seat}</div>
    <div><strong>Birtokos:</strong> ${ownerName}</div>
    <div><strong>Érték:</strong> ${st.owner ? `${st.points} pont` : 'Szabad'}</div>
    <div style="margin-top:4px;"><strong>Szomszédok:</strong> ${neighbors}</div>
  `;
}

function moveCountyTooltip(event) {
  const stage = document.getElementById('svgStage');
  const rect = stage.getBoundingClientRect();
  const tip = document.getElementById('countyTooltip');
  const x = Math.min(rect.width - 190, Math.max(10, event.clientX - rect.left + 14));
  const y = Math.min(rect.height - 90, Math.max(10, event.clientY - rect.top + 14));
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}

function hideCountyTooltip() {
  document.getElementById('countyTooltip').classList.add('hidden');
}

// ==================== HUD & LOG RENDERING ====================
function renderAll() {
  renderHud();
  renderMapState();
  renderLogFeed();
}

function renderHud() {
  const freeCount = Object.values(engine.counties).filter(c => c.owner === null).length;
  const badge = document.getElementById('hudPhaseBadge');
  const text = document.getElementById('hudPhaseText');
  const bottom = document.getElementById('bottomPromptText');
  const roundInfo = document.getElementById('mapRoundInfo');

  const curPlayer = engine.players[engine.currentSelector];
  const isMyTurn = online.active
    ? engine.currentSelector === online.myColor
    : curPlayer?.isHuman;

  if (engine.phase === PHASES.BASE_QUESTION || engine.phase === PHASES.BASE_SELECTION) {
    badge.textContent = '1. FÁZIS • BÁZIS';
    roundInfo.textContent = 'Bázisválasztás';
    text.textContent = curPlayer ? `${curPlayer.name} bázist választ` : 'Tippelős kérdés';
    bottom.textContent = curPlayer
      ? isMyTurn
        ? `${curPlayer.name}: Kattints egy szabad megyére a bázisod (1000p) felépítéséhez!`
        : `Várakozás: ${curPlayer.name} választ bázist...`
      : 'Tippelős kérdés a bázisválasztás sorrendjéért.';
  } else if (engine.phase === PHASES.EXPANSION_QUESTION || engine.phase === PHASES.EXPANSION_SELECTION) {
    badge.textContent = '2. FÁZIS • TERJESZKEDÉS';
    roundInfo.textContent = `${freeCount} szabad megye`;
    text.textContent = curPlayer ? `${curPlayer.name} megyét foglal` : 'Tippelős kérdés';
    bottom.textContent = curPlayer
      ? isMyTurn
        ? `${curPlayer.name}: Válassz egy sárgán kiemelt, szomszédos szabad megyét (+200p)!`
        : `Várakozás: ${curPlayer.name} foglal szabad megyét...`
      : 'Tippelős kérdés a szabad megyékért.';
  } else if (
    engine.phase === PHASES.BATTLE_SELECT_TARGET ||
    engine.phase === PHASES.BATTLE_MC_QUESTION ||
    engine.phase === PHASES.BATTLE_TIEBREAKER_QUESTION
  ) {
    badge.textContent = `3. FÁZIS • HARC (${engine.currentBattleRound}/${engine.maxBattleRounds})`;
    roundInfo.textContent = `${engine.currentBattleRound} / ${engine.maxBattleRounds}. kör`;
    text.textContent = curPlayer ? `${curPlayer.name} támad` : 'Párbaj folyamatban';
    bottom.textContent = curPlayer
      ? isMyTurn
        ? `${curPlayer.name}: Kattints egy szomszédos ellenséges megyére a támadáshoz!`
        : `Várakozás: ${curPlayer.name} célpontot választ...`
      : 'Harci kérdéspárbaj folyamatban...';
  } else if (engine.phase === PHASES.GAME_OVER) {
    const w = engine.getStandings()[0];
    badge.textContent = 'MÉRKŐZÉS VÉGE';
    roundInfo.textContent = 'Befejezve';
    text.textContent = `Győztes: ${w.name}`;
    bottom.textContent = `A mérkőzést ${w.name} nyerte ${w.score} ponttal!`;
  }

  // Render 3 Player HUD Cards
  const bar = document.getElementById('hudPlayersBar');
  bar.innerHTML = '';

  for (const color of ['red', 'green', 'blue']) {
    const p = engine.players[color];
    const isAct = engine.currentSelector === color;
    const isMe = (online.active && online.myColor === color) || (!online.active && color === 'red');
    const baseC = p.baseCountyId ? engine.counties[p.baseCountyId] : null;
    const baseInfo = baseC && baseC.owner === color && baseC.isBase ? `Bázis: ${baseC.towers}/3` : p.eliminated ? 'Kiesett' : '';

    const card = document.createElement('div');
    card.className = `p-hud-card ${isAct ? 'p-hud-card--active' : ''} ${p.eliminated ? 'p-hud-card--eliminated' : ''}`;
    const initial = (p.name || '?').charAt(0).toUpperCase();

    card.innerHTML = `
      <div class="p-avatar p-avatar--${color}">${initial}</div>
      <div class="p-info">
        <div class="p-info__name">${p.name} ${isMe ? '(Te)' : ''}</div>
        <div class="p-info__meta">${p.countiesCount} megye ${baseInfo ? '• ' + baseInfo : ''}</div>
      </div>
      <div class="p-score">${p.score}</div>
    `;
    bar.appendChild(card);
  }
}

function renderLogFeed() {
  const feed = document.getElementById('gameLogFeed');
  feed.innerHTML = '';
  for (const item of engine.chronicle) {
    const div = document.createElement('div');
    div.className = `log-entry log-entry--${item.type}`;
    div.innerHTML = `<span style="color:var(--text-muted); margin-right:5px;">[${item.time}]</span>${item.message}`;
    feed.appendChild(div);
  }
}

// ==================== ONLINE GAME MODE ====================
async function connectOnlineGame() {
  try {
    // Ensure joined or reconnected with current user
    const joinRes = await fetch('/api/rooms/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: online.code,
        playerName: currentUser.username,
        existingToken: online.token
      })
    });
    if (joinRes.ok) {
      const jData = await joinRes.json();
      online.token = jData.playerToken;
      online.myColor = jData.assignedColor;
      applyOnlineState(jData.state);
    }
  } catch {
    // ignore
  }

  const sse = new EventSource(`/api/rooms/${online.code}/stream?token=${encodeURIComponent(online.token)}`);
  sse.onmessage = evt => {
    try {
      applyOnlineState(JSON.parse(evt.data));
    } catch {
      // ignore
    }
  };
  online.sse = sse;

  online.pollId = setInterval(async () => {
    try {
      const res = await fetch(`/api/rooms/${online.code}?token=${encodeURIComponent(online.token)}`);
      if (res.ok) {
        const d = await res.json();
        if (d.state) applyOnlineState(d.state);
      }
    } catch {
      // ignore
    }
  }, 1200);
}

function applyOnlineState(state) {
  online.myColor = state.viewerColor || online.myColor;
  engine.phase = state.phase;
  engine.currentSelector = state.currentSelector;
  engine.currentBattleRound = state.currentBattleRound;
  engine.maxBattleRounds = state.maxBattleRounds;
  engine.players = state.players;
  engine.counties = state.counties;
  engine.activeBattle = state.activeBattle;
  engine.chronicle = state.chronicle || [];

  syncOnlineModals(state);

  if (state.phase === PHASES.GAME_OVER && document.getElementById('gameOverOverlay').classList.contains('hidden')) {
    showGameOverModal(state.standings || engine.getStandings());
  }

  renderAll();
}

function syncOnlineModals(state) {
  const qs = state.questionSession;
  const estOv = document.getElementById('estimationOverlay');
  const mcOv = document.getElementById('mcOverlay');

  if (!qs) {
    estOv.classList.add('hidden');
    mcOv.classList.add('hidden');
    online.lastQuestionId = null;
    online.lastStage = null;
    return;
  }

  const isParticipant = qs.participants.includes(online.myColor);
  const isNewQ = online.lastQuestionId !== qs.id;

  if (qs.questionType === 'estimation') {
    mcOv.classList.add('hidden');
    estOv.classList.remove('hidden');

    document.getElementById('estCategory').textContent = qs.category;
    document.getElementById('estContext').textContent = qs.contextLabel || 'Tippelős kérdés';
    document.getElementById('estQuestionText').textContent = qs.questionText;
    document.getElementById('estUnitText').textContent = qs.unit || '';
    document.getElementById('estTimer').textContent = `${qs.remainingSec} mp`;

    const statusBanner = document.getElementById('estStatusBanner');
    const inputWrap = document.getElementById('estInputWrap');
    const resWrap = document.getElementById('estResultsWrap');

    if (qs.stage === 'ANSWERING') {
      resWrap.classList.add('hidden');
      const statusList = qs.participants
        .map(pid => `${qs.submittedColors.includes(pid) ? '✓' : '...'} ${state.players[pid]?.name || pid}`)
        .join('  |  ');

      if (isParticipant && !qs.hasViewerSubmitted) {
        inputWrap.classList.remove('hidden');
        statusBanner.textContent = `Válaszok: ${statusList}`;
        statusBanner.classList.remove('hidden');
        if (isNewQ) {
          const disp = document.getElementById('estInputDisplay');
          disp.value = '';
          setTimeout(() => disp.focus(), 50);
        }
      } else {
        inputWrap.classList.add('hidden');
        statusBanner.textContent = isParticipant
          ? `Tipped elküldve! Várakozás a többiekre: ${statusList}`
          : `Párbaj folyamatban: ${statusList}`;
        statusBanner.classList.remove('hidden');
      }
    } else if (qs.stage === 'REVEAL' && qs.revealData) {
      inputWrap.classList.add('hidden');
      statusBanner.classList.add('hidden');
      resWrap.classList.remove('hidden');

      document.getElementById('estCorrectAnswer').textContent =
        `${qs.revealData.truth}${qs.revealData.unit ? ' ' + qs.revealData.unit : ''}`;

      const rows = document.getElementById('estRankingRows');
      rows.innerHTML = '';
      (qs.revealData.ranked || []).forEach((r, idx) => {
        const div = document.createElement('div');
        div.className = `rank-item ${idx === 0 ? 'rank-item--first' : ''}`;
        const diff = Number.isFinite(r.diff) ? `eltérés: ${r.diff}` : 'nincs tipp';
        div.innerHTML = `
          <span><strong>${idx + 1}. ${r.playerName}</strong> (Tipp: ${r.guess ?? '–'})</span>
          <span style="color:var(--text-dim);">${diff} • ${(r.timeMs / 1000).toFixed(1)}s</span>
        `;
        rows.appendChild(div);
      });
    }
  } else if (qs.questionType === 'multiple_choice') {
    estOv.classList.add('hidden');
    mcOv.classList.remove('hidden');

    document.getElementById('mcCategory').textContent = qs.category;
    document.getElementById('mcContext').textContent = qs.contextLabel || 'Megye ostroma';
    document.getElementById('mcQuestionText').textContent = qs.questionText;
    document.getElementById('mcTimer').textContent = `${qs.remainingSec} mp`;

    const attId = qs.participants[0];
    const defId = qs.participants[1];
    const attName = state.players[attId]?.name || 'Támadó';
    const defName = state.players[defId]?.name || 'Védő';

    document.getElementById('mcDuelBar').innerHTML = `
      <span style="color:#fca5a5;">Támadó: ${attName}</span>
      <span style="color:var(--text-muted);">VS</span>
      <span style="color:#93c5fd;">Védő: ${defName}</span>
    `;

    const pollHint = document.getElementById('mcPollHint');
    if (qs.viewerOwlPoll) {
      const letters = ['A', 'B', 'C', 'D'];
      pollHint.innerHTML = letters.map((L, i) => `<strong>${L}:</strong> ${qs.viewerOwlPoll[i]}%`).join(' &nbsp;•&nbsp; ');
      pollHint.classList.remove('hidden');
    } else {
      pollHint.classList.add('hidden');
    }

    const statusBanner = document.getElementById('mcStatusBanner');
    const summaryBox = document.getElementById('mcSummaryBox');

    if (qs.stage === 'ANSWERING') {
      summaryBox.classList.add('hidden');
      const canAnswer = isParticipant && !qs.hasViewerSubmitted;
      const myP = state.players[online.myColor];

      document.getElementById('btnLifeHalve').disabled = !canAnswer || !myP?.lifelines?.halve;
      document.getElementById('btnLifePoll').disabled = !canAnswer || !myP?.lifelines?.owl;
      document.getElementById('btnLifeTime').disabled = !canAnswer || !myP?.lifelines?.extraTime;

      if (canAnswer) {
        statusBanner.classList.add('hidden');
      } else {
        statusBanner.textContent = isParticipant
          ? 'Válaszod rögzítve! Várakozás a másik játékosra...'
          : `${attName} és ${defName} párbaja folyamatban...`;
        statusBanner.classList.remove('hidden');
      }

      renderMcButtons(qs.options || [], canAnswer, qs.viewerHalvedOptions || [], null);
    } else if (qs.stage === 'REVEAL' && qs.revealData) {
      statusBanner.classList.add('hidden');
      renderMcButtons(qs.options || [], false, [], qs.revealData);

      const letters = ['A', 'B', 'C', 'D'];
      summaryBox.classList.remove('hidden');
      document.getElementById('mcSummaryText').innerHTML = `
        <div style="color:var(--text-dim); margin-bottom:4px;">
          ${attName}: <strong>${letters[qs.revealData.attackerChoice] || '–'}</strong> &nbsp;|&nbsp;
          ${defName}: <strong>${letters[qs.revealData.defenderChoice] || '–'}</strong>
        </div>
        <div style="font-weight:700; color:#fff;">${qs.revealData.outcomeMessage || ''}</div>
      `;
    }
  }

  online.lastQuestionId = qs.id;
  online.lastStage = qs.stage;
}

// ==================== SOLO AI MODE ====================
function startSoloAiGame() {
  engine.startNewGame({
    redName: currentUser.username,
    greenName: 'Gép 1',
    blueName: 'Gép 2',
    gameMode: 'singleplayer',
    aiDifficulty: aiDiff,
    maxBattleRounds: battleRounds
  });
  renderAll();
  stepSoloFlow();
}

function stepSoloFlow() {
  renderAll();

  if (engine.phase === PHASES.BASE_QUESTION) {
    openLocalEstimation(() => {
      engine.submitBaseQuestionAnswers(localSubmissions);
    });
    return;
  }

  if (engine.phase === PHASES.BASE_SELECTION) {
    const cur = engine.currentSelector;
    const p = engine.players[cur];
    if (p && !p.isHuman) {
      setTimeout(() => {
        const cid = engine.chooseAiBaseCounty(cur);
        if (cid) {
          engine.selectBaseCounty(cur, cid);
          sound.playCastleBuild();
          stepSoloFlow();
        }
      }, 750);
    }
    return;
  }

  if (engine.phase === PHASES.EXPANSION_QUESTION) {
    openLocalEstimation(() => {
      engine.submitExpansionQuestionAnswers(localSubmissions);
    });
    return;
  }

  if (engine.phase === PHASES.EXPANSION_SELECTION) {
    const cur = engine.currentSelector;
    const p = engine.players[cur];
    if (p && !p.isHuman) {
      setTimeout(() => {
        const cid = engine.chooseAiExpansionCounty(cur);
        if (cid) {
          engine.selectExpansionCounty(cur, cid);
          sound.playClaim();
          stepSoloFlow();
        }
      }, 700);
    }
    return;
  }

  if (engine.phase === PHASES.BATTLE_SELECT_TARGET) {
    const attId = engine.currentSelector;
    const att = engine.players[attId];
    if (att && !att.isHuman) {
      setTimeout(() => {
        const target = engine.chooseAiAttackTarget(attId);
        if (!target) {
          engine.completeCurrentBattleTurn();
          stepSoloFlow();
          return;
        }
        const res = engine.initiateAttack(attId, target);
        if (!res.ok) {
          engine.completeCurrentBattleTurn();
          stepSoloFlow();
          return;
        }
        renderAll();
        const def = engine.players[engine.activeBattle.defenderId];
        if (!att.isHuman && !def.isHuman) {
          // Auto-resolve AI vs AI
          const q = engine.activeQuestion;
          const r = engine.submitBattleMcAnswers({
            [attId]: engine.simulateAiMultipleChoice(q),
            [def.id]: engine.simulateAiMultipleChoice(q)
          });
          if (r.status === 'TIEBREAKER') {
            const eq = engine.activeQuestion;
            engine.submitBattleTiebreakerAnswers({
              [attId]: engine.simulateAiEstimation(eq),
              [def.id]: engine.simulateAiEstimation(eq)
            });
          }
          renderAll();
          setTimeout(() => {
            engine.completeCurrentBattleTurn();
            stepSoloFlow();
          }, 900);
        } else {
          openLocalMcBattle();
        }
      }, 850);
    }
    return;
  }

  if (engine.phase === PHASES.GAME_OVER) {
    finishSoloGame();
  }
}

function openLocalEstimation(onComplete) {
  const q = engine.activeQuestion;
  localAfterEstCallback = onComplete;
  localSubmissions = {};

  for (const pid of q.participants || ['red', 'green', 'blue']) {
    if (!engine.players[pid]?.isHuman) {
      localSubmissions[pid] = engine.simulateAiEstimation(q);
    }
  }

  localAnsweringColor = 'red';
  document.getElementById('estCategory').textContent = q.category;
  document.getElementById('estContext').textContent = q.contextLabel || 'Tippelős kérdés';
  document.getElementById('estQuestionText').textContent = q.question;
  document.getElementById('estUnitText').textContent = q.unit || '';
  document.getElementById('estStatusBanner').classList.add('hidden');
  document.getElementById('estInputWrap').classList.remove('hidden');
  document.getElementById('estResultsWrap').classList.add('hidden');

  const disp = document.getElementById('estInputDisplay');
  disp.value = '';
  document.getElementById('estimationOverlay').classList.remove('hidden');
  setTimeout(() => disp.focus(), 50);

  clearInterval(localTimerId);
  localTimeLeft = 15;
  localStartMs = Date.now();
  document.getElementById('estTimer').textContent = `${localTimeLeft} mp`;

  localTimerId = setInterval(() => {
    localTimeLeft -= 1;
    document.getElementById('estTimer').textContent = `${Math.max(0, localTimeLeft)} mp`;
    if (localTimeLeft <= 0) {
      clearInterval(localTimerId);
      submitEstValue();
    }
  }, 1000);
}

function submitEstValue() {
  const raw = document.getElementById('estInputDisplay').value.trim();
  const parsed = raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : null;

  if (online.active) {
    sound.playClick();
    fetch(`/api/rooms/${online.code}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: online.token, guess: parsed })
    });
    return;
  }

  clearInterval(localTimerId);
  if (!localAnsweringColor) return;
  localSubmissions[localAnsweringColor] = {
    guess: parsed,
    timeMs: Math.min(15000, Math.max(200, Date.now() - localStartMs))
  };
  localAnsweringColor = null;

  if (localAfterEstCallback) localAfterEstCallback();

  const q = engine.activeQuestion;
  const res = engine.lastQuestionResults || engine.activeBattle?.tiebreakerResults;
  document.getElementById('estInputWrap').classList.add('hidden');
  document.getElementById('estResultsWrap').classList.remove('hidden');
  document.getElementById('estCorrectAnswer').textContent = `${q.answer}${q.unit ? ' ' + q.unit : ''}`;

  const rows = document.getElementById('estRankingRows');
  rows.innerHTML = '';
  (res?.ranked || []).forEach((r, idx) => {
    const div = document.createElement('div');
    div.className = `rank-item ${idx === 0 ? 'rank-item--first' : ''}`;
    const diff = Number.isFinite(r.diff) ? `eltérés: ${r.diff}` : 'nincs tipp';
    div.innerHTML = `
      <span><strong>${idx + 1}. ${r.playerName}</strong> (Tipp: ${r.guess ?? '–'})</span>
      <span style="color:var(--text-dim);">${diff} • ${(r.timeMs / 1000).toFixed(1)}s</span>
    `;
    rows.appendChild(div);
  });

  sound.playCorrect();
  renderAll();
}

function openLocalMcBattle() {
  const q = engine.activeQuestion;
  const b = engine.activeBattle;
  const att = engine.players[b.attackerId];
  const def = engine.players[b.defenderId];

  localSubmissions = {};
  for (const pid of [b.attackerId, b.defenderId]) {
    if (!engine.players[pid]?.isHuman) {
      localSubmissions[pid] = engine.simulateAiMultipleChoice(q);
    }
  }
  localAnsweringColor = 'red';

  document.getElementById('mcCategory').textContent = q.category;
  document.getElementById('mcContext').textContent = `${engine.counties[b.targetCountyId].name} ostroma`;
  document.getElementById('mcQuestionText').textContent = q.question;
  document.getElementById('mcDuelBar').innerHTML = `
    <span style="color:#fca5a5;">Támadó: ${att.name}</span>
    <span style="color:var(--text-muted);">VS</span>
    <span style="color:#93c5fd;">Védő: ${def.name}</span>
  `;
  document.getElementById('mcStatusBanner').classList.add('hidden');
  document.getElementById('mcPollHint').classList.add('hidden');
  document.getElementById('mcSummaryBox').classList.add('hidden');

  const p = engine.players.red;
  document.getElementById('btnLifeHalve').disabled = !p.lifelines.halve;
  document.getElementById('btnLifePoll').disabled = !p.lifelines.owl;
  document.getElementById('btnLifeTime').disabled = !p.lifelines.extraTime;

  renderMcButtons(q.options, true, [], null);
  document.getElementById('mcOverlay').classList.remove('hidden');

  clearInterval(localTimerId);
  localTimeLeft = 15;
  localStartMs = Date.now();
  document.getElementById('mcTimer').textContent = `${localTimeLeft} mp`;

  localTimerId = setInterval(() => {
    localTimeLeft -= 1;
    document.getElementById('mcTimer').textContent = `${Math.max(0, localTimeLeft)} mp`;
    if (localTimeLeft <= 0) {
      clearInterval(localTimerId);
      submitMcChoice(-1);
    }
  }, 1000);
}

function renderMcButtons(options, canClick, halvedIndices = [], revealData = null) {
  const grid = document.getElementById('mcOptionsGrid');
  grid.innerHTML = '';
  const letters = ['A', 'B', 'C', 'D'];

  options.forEach((optText, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    const cls = ['mc-btn'];
    if (halvedIndices.includes(idx) && !revealData) cls.push('mc-btn--hidden');
    if (revealData) {
      if (idx === revealData.correctIndex) cls.push('mc-btn--correct');
      else if (idx === revealData.attackerChoice || idx === revealData.defenderChoice) cls.push('mc-btn--wrong');
    }
    btn.className = cls.join(' ');
    btn.disabled = !canClick || halvedIndices.includes(idx);
    btn.innerHTML = `
      <span class="mc-letter">${letters[idx]}</span>
      <span>${optText}</span>
    `;
    btn.onclick = () => submitMcChoice(idx);
    grid.appendChild(btn);
  });
}

function submitMcChoice(choiceIndex) {
  if (online.active) {
    sound.playClick();
    fetch(`/api/rooms/${online.code}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: online.token, choiceIndex })
    });
    return;
  }

  clearInterval(localTimerId);
  if (!localAnsweringColor) return;
  localSubmissions[localAnsweringColor] = {
    choiceIndex,
    timeMs: Math.min(15000, Math.max(200, Date.now() - localStartMs))
  };
  localAnsweringColor = null;

  const q = engine.activeQuestion;
  const b = engine.activeBattle;
  const attChoice = localSubmissions[b.attackerId]?.choiceIndex ?? -1;
  const defChoice = localSubmissions[b.defenderId]?.choiceIndex ?? -1;

  const res = engine.submitBattleMcAnswers(localSubmissions);
  renderMcButtons(q.options, false, [], {
    correctIndex: q.correctIndex,
    attackerChoice: attChoice,
    defenderChoice: defChoice
  });

  const summaryBox = document.getElementById('mcSummaryBox');
  const summaryText = document.getElementById('mcSummaryText');
  const contBtn = document.getElementById('btnMcContinue');
  summaryBox.classList.remove('hidden');

  if (res.status === 'TIEBREAKER') {
    sound.playCorrect();
    summaryText.textContent = 'Mindketten helyesen válaszoltatok! Tippelős párbaj dönt!';
    contBtn.onclick = () => {
      document.getElementById('mcOverlay').classList.add('hidden');
      openLocalEstimation(() => {
        engine.submitBattleTiebreakerAnswers(localSubmissions);
      });
    };
  } else {
    sound.playSwordClash();
    summaryText.textContent = engine.activeBattle.outcome?.message || '';
    contBtn.onclick = () => {
      document.getElementById('mcOverlay').classList.add('hidden');
      engine.completeCurrentBattleTurn();
      stepSoloFlow();
    };
  }
  renderAll();
}

async function onCountyClick(countyId) {
  if (online.active) {
    if (engine.currentSelector !== online.myColor) return;
    const res = await fetch(`/api/rooms/${online.code}/select-county`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: online.token, countyId })
    });
    if (res.ok) {
      sound.playClaim();
      const d = await res.json();
      if (d.state) applyOnlineState(d.state);
    } else {
      sound.playWrong();
    }
    return;
  }

  const sel = engine.currentSelector;
  if (sel !== 'red') return;

  if (engine.phase === PHASES.BASE_SELECTION) {
    const r = engine.selectBaseCounty('red', countyId);
    if (r.ok) {
      sound.playCastleBuild();
      stepSoloFlow();
    }
  } else if (engine.phase === PHASES.EXPANSION_SELECTION) {
    const r = engine.selectExpansionCounty('red', countyId);
    if (r.ok) {
      sound.playClaim();
      stepSoloFlow();
    }
  } else if (engine.phase === PHASES.BATTLE_SELECT_TARGET) {
    const r = engine.initiateAttack('red', countyId);
    if (r.ok) {
      sound.playSwordClash();
      renderAll();
      openLocalMcBattle();
    }
  }
}

async function finishSoloGame() {
  const standings = engine.getStandings();
  showGameOverModal(standings);
  try {
    await fetch('/api/matches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        winnerName: standings[0].name,
        gameMode: 'singleplayer',
        roundsPlayed: engine.maxBattleRounds,
        players: Object.values(engine.players).map(p => ({
          id: p.id,
          name: p.name,
          score: p.score,
          counties: p.countiesCount,
          correctAnswers: p.correctAnswers,
          totalAnswers: p.totalAnswers
        }))
      })
    });
  } catch {
    // ignore
  }
}

function showGameOverModal(standings) {
  sound.playVictoryFanfare();
  const winner = standings[0];
  document.getElementById('gameOverWinnerName').textContent = `Győztes: ${winner.name}`;
  document.getElementById('gameOverWinnerScore').textContent = `${winner.score} pont • ${winner.countiesCount} vármegye`;

  const rows = document.getElementById('gameOverStandings');
  rows.innerHTML = '';
  standings.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = `rank-item ${i === 0 ? 'rank-item--first' : ''}`;
    div.innerHTML = `
      <span><strong>${i + 1}. ${p.name}</strong></span>
      <span><strong>${p.score} pont</strong> (${p.countiesCount} megye)</span>
    `;
    rows.appendChild(div);
  });

  document.getElementById('gameOverOverlay').classList.remove('hidden');
}

// ==================== EVENTS ====================
function bindGameEvents() {
  document.getElementById('btnToggleAudio').addEventListener('click', e => {
    const m = sound.toggleMute();
    e.currentTarget.textContent = m ? 'Hang: KI' : 'Hang: BE';
  });

  document.getElementById('btnExitGame').addEventListener('click', () => {
    if (window.opener) {
      window.close();
    } else {
      window.location.href = '/index.html';
    }
  });

  document.getElementById('btnBackToPortal').addEventListener('click', () => {
    if (window.opener) {
      window.close();
    } else {
      window.location.href = '/index.html';
    }
  });

  document.getElementById('btnCloseGameOverModal').addEventListener('click', () => {
    document.getElementById('gameOverOverlay').classList.add('hidden');
  });

  // Number pad
  document.querySelectorAll('.numpad-key').forEach(btn => {
    btn.addEventListener('click', () => {
      const k = btn.getAttribute('data-key');
      const disp = document.getElementById('estInputDisplay');
      sound.playClick();
      if (k === 'CLEAR') disp.value = '';
      else if (k === 'BACK') disp.value = disp.value.slice(0, -1);
      else if (disp.value.length < 9) disp.value += k;
      disp.focus();
    });
  });

  document.getElementById('estInputDisplay').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitEstValue();
    }
  });

  document.getElementById('btnSubmitEst').addEventListener('click', submitEstValue);

  document.getElementById('btnEstContinue').addEventListener('click', () => {
    document.getElementById('estimationOverlay').classList.add('hidden');
    if (!online.active) {
      if (engine.phase === PHASES.BATTLE_TIEBREAKER_QUESTION || engine.activeBattle?.tiebreakerResults) {
        engine.completeCurrentBattleTurn();
      }
      stepSoloFlow();
    }
  });

  document.getElementById('btnMcContinue').addEventListener('click', () => {
    if (online.active) {
      document.getElementById('mcOverlay').classList.add('hidden');
    }
  });

  // Lifelines
  document.getElementById('btnLifeHalve').addEventListener('click', () => {
    if (online.active) {
      fetch(`/api/rooms/${online.code}/lifeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: online.token, lifeline: 'halve' })
      });
      return;
    }
    const p = engine.players.red;
    if (!p.lifelines.halve) return;
    p.lifelines.halve = false;
    const cIdx = engine.activeQuestion.correctIndex;
    const wrong = [0, 1, 2, 3].filter(i => i !== cIdx).sort(() => Math.random() - 0.5).slice(0, 2);
    renderMcButtons(engine.activeQuestion.options, true, wrong, null);
    document.getElementById('btnLifeHalve').disabled = true;
  });

  document.getElementById('btnLifePoll').addEventListener('click', () => {
    if (online.active) {
      fetch(`/api/rooms/${online.code}/lifeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: online.token, lifeline: 'owl' })
      });
      return;
    }
    const p = engine.players.red;
    if (!p.lifelines.owl) return;
    p.lifelines.owl = false;
    const cIdx = engine.activeQuestion.correctIndex;
    const pct = [10, 10, 10, 10];
    pct[cIdx] = 68;
    const letters = ['A', 'B', 'C', 'D'];
    const hint = document.getElementById('mcPollHint');
    hint.innerHTML = letters.map((L, i) => `<strong>${L}:</strong> ${pct[i]}%`).join(' &nbsp;•&nbsp; ');
    hint.classList.remove('hidden');
    document.getElementById('btnLifePoll').disabled = true;
  });

  document.getElementById('btnLifeTime').addEventListener('click', () => {
    if (online.active) {
      fetch(`/api/rooms/${online.code}/lifeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: online.token, lifeline: 'extraTime' })
      });
      return;
    }
    const p = engine.players.red;
    if (!p.lifelines.extraTime) return;
    p.lifelines.extraTime = false;
    localTimeLeft += 10;
    document.getElementById('mcTimer').textContent = `${localTimeLeft} mp`;
    document.getElementById('btnLifeTime').disabled = true;
  });

  // Chat & Quick messages
  document.querySelectorAll('.chip-btn').forEach(btn => {
    btn.addEventListener('click', () => sendGameChat(btn.getAttribute('data-msg')));
  });

  document.getElementById('gameChatForm').addEventListener('submit', e => {
    e.preventDefault();
    const inp = document.getElementById('gameChatInput');
    const msg = inp.value.trim();
    if (!msg) return;
    inp.value = '';
    sendGameChat(msg);
  });
}

async function sendGameChat(msg) {
  sound.playClick();
  if (online.active) {
    await fetch(`/api/rooms/${online.code}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: online.token, message: msg })
    });
  } else {
    engine.logEvent(`${currentUser.username}: ${msg}`, 'chat');
    renderLogFeed();
  }
}

initGameWindow();
