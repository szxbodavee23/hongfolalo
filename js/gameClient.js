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
  lastStage: null,
  dismissedQuestionId: null
};

// Local timer state (for AI mode)
let localTimerId = null;
let localTimeLeft = 15;
let localStartMs = 0;
let localAnsweringColor = null;
let localSubmissions = {};
let localAfterEstCallback = null;
let localIsTiebreakerEst = false;
let localSpectatorMode = false;
let soloAiBusy = false;

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
  renderTurnOrder();
}

// Color-coded turn order panel: who is on turn now and who comes next
function renderTurnOrder() {
  const panel = document.getElementById('turnOrderPanel');
  const list = document.getElementById('turnOrderList');
  if (!panel || !list) return;

  if (!engine.phase || engine.phase === PHASES.GAME_OVER) {
    panel.classList.add('hidden');
    return;
  }

  let orderIds = [];
  if (
    engine.phase === PHASES.BASE_QUESTION ||
    engine.phase === PHASES.BASE_SELECTION ||
    engine.phase === PHASES.EXPANSION_QUESTION ||
    engine.phase === PHASES.EXPANSION_SELECTION
  ) {
    const q = engine.selectionQueue || [];
    orderIds = engine.currentSelector && !q.includes(engine.currentSelector)
      ? [engine.currentSelector, ...q]
      : [...q];
  } else {
    orderIds = (engine.battleTurnQueue || []).slice(engine.currentBattleTurnIndex || 0);
  }

  if (!orderIds.length) {
    panel.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');
  list.innerHTML = '';
  orderIds.forEach((pid, idx) => {
    const p = engine.players[pid];
    if (!p) return;
    const isCurrent = engine.currentSelector === pid;
    const chip = document.createElement('div');
    chip.className = `turn-chip turn-chip--${pid}${isCurrent ? ' turn-chip--current' : ''}${p.eliminated ? ' turn-chip--eliminated' : ''}`;
    chip.innerHTML = `
      <span class="turn-chip__dot"></span>
      <span class="turn-chip__name">${idx + 1}. ${p.name}</span>
      ${isCurrent ? '<span class="turn-chip__now">soron</span>' : ''}
    `;
    list.appendChild(chip);
  });
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

  const orderEl = document.getElementById('hudOrderText');
  const nameOf = id => engine.players[id]?.name || id;
  let orderStr = '';

  if (engine.phase === PHASES.BASE_QUESTION || engine.phase === PHASES.BASE_SELECTION) {
    badge.textContent = '1. FÁZIS • BÁZIS';
    roundInfo.textContent = 'Bázisválasztás';
    text.textContent = curPlayer ? `${curPlayer.name} bázist választ` : 'Tippelős kérdés';
    bottom.textContent = curPlayer
      ? isMyTurn
        ? `${curPlayer.name}: Kattints egy szabad megyére a bázisod (1000p) felépítéséhez!`
        : `Várakozás: ${curPlayer.name} választ bázist...`
      : 'Tippelős kérdés a bázisválasztás sorrendjéért.';
    const upcoming = (engine.selectionQueue || []).slice(0, 3).map(nameOf);
    if (curPlayer) orderStr = `Soron: ${curPlayer.name}${upcoming.length ? ' • Utána: ' + upcoming.join(' → ') : ''}`;
  } else if (engine.phase === PHASES.EXPANSION_QUESTION || engine.phase === PHASES.EXPANSION_SELECTION) {
    badge.textContent = '2. FÁZIS • TERJESZKEDÉS';
    roundInfo.textContent = `${freeCount} szabad megye`;
    text.textContent = curPlayer ? `${curPlayer.name} megyét foglal` : 'Tippelős kérdés';
    bottom.textContent = curPlayer
      ? isMyTurn
        ? `${curPlayer.name}: Válassz egy sárgán kiemelt, szomszédos szabad megyét (+200p)!`
        : `Várakozás: ${curPlayer.name} foglal szabad megyét...`
      : 'Tippelős kérdés a szabad megyékért.';
    const upcoming = (engine.selectionQueue || []).slice(0, 3).map(nameOf);
    if (curPlayer) orderStr = `Soron: ${curPlayer.name}${upcoming.length ? ' • Utána: ' + upcoming.join(' → ') : ''}`;
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
    const remaining = (engine.battleTurnQueue || []).slice(engine.currentBattleTurnIndex || 0).map(nameOf);
    if (remaining.length) orderStr = `Támadási sorrend: ${remaining.join(' → ')}`;
  } else if (engine.phase === PHASES.GAME_OVER) {
    const w = engine.getStandings()[0];
    badge.textContent = 'MÉRKŐZÉS VÉGE';
    roundInfo.textContent = 'Befejezve';
    text.textContent = `Győztes: ${w.name}`;
    bottom.textContent = `A mérkőzést ${w.name} nyerte ${w.score} ponttal!`;
  }

  if (orderEl) {
    orderEl.textContent = orderStr;
    orderEl.classList.toggle('hidden', !orderStr);
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
  engine.selectionQueue = state.selectionQueue || [];
  engine.battleTurnQueue = state.battleTurnQueue || [];
  engine.currentBattleTurnIndex = state.currentBattleTurnIndex || 0;
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
    online.dismissedQuestionId = null;
    return;
  }

  // If the player already clicked "Tovább" on this question's REVEAL screen, do NOT pop the modal back up!
  if (qs.stage === 'REVEAL' && online.dismissedQuestionId === qs.id) {
    estOv.classList.add('hidden');
    mcOv.classList.add('hidden');
    return;
  }

  const isParticipant = qs.participants.includes(online.myColor);
  const isNewQ = online.lastQuestionId !== qs.id;

  if (qs.questionType === 'estimation') {
    if (estOv.classList.contains('hidden') || isNewQ) presentOverlay(estOv);
    else estOv.classList.remove('hidden');

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

      // Estimation lifelines (Papagáj / Távcső) — only for participants still answering
      const myP = state.players[online.myColor];
      const canUseEstLife = isParticipant && !qs.hasViewerSubmitted;
      document.getElementById('estLifelinesRow').classList.toggle('hidden', !canUseEstLife);
      document.getElementById('btnLifeParrot').disabled = !canUseEstLife || !myP?.lifelines?.parrot;
      document.getElementById('btnLifeTelescope').disabled = !canUseEstLife || !myP?.lifelines?.telescope;
      const estHint = document.getElementById('estLifelineHint');
      if (qs.viewerParrotRange) {
        estHint.innerHTML = `🦜 <strong>Papagáj súg:</strong> a helyes válasz <strong>${qs.viewerParrotRange.low}</strong> és <strong>${qs.viewerParrotRange.high}</strong> közé esik!`;
        estHint.classList.remove('hidden');
      } else if (qs.viewerTelescope && qs.viewerTelescope.length) {
        estHint.innerHTML = `🔭 <strong>Távcső mutatja:</strong> ${qs.viewerTelescope.map(g => `${g.name}: <strong>${g.guess}</strong>`).join(' • ')}`;
        estHint.classList.remove('hidden');
      } else if (isNewQ) {
        estHint.classList.add('hidden');
      }

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
    if (mcOv.classList.contains('hidden') || isNewQ) presentOverlay(mcOv);
    else mcOv.classList.remove('hidden');

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

// Soft overlay transitions: crossfade out old modals, replay entrance on same-modal reuse
function presentOverlay(overlayEl) {
  for (const o of document.querySelectorAll('.overlay')) {
    if (o !== overlayEl && !o.classList.contains('hidden')) {
      o.classList.add('overlay--closing');
      setTimeout(() => {
        o.classList.add('hidden');
        o.classList.remove('overlay--closing');
      }, 160);
    }
  }
  const wasVisible = !overlayEl.classList.contains('hidden');
  overlayEl.classList.remove('hidden');
  overlayEl.style.zIndex = 101; // incoming modal slides in above the fading one
  if (wasVisible) {
    const modal = overlayEl.querySelector('.q-modal');
    if (modal) {
      modal.style.animation = 'none';
      void modal.offsetWidth; // reflow restarts the entrance animation
      modal.style.animation = '';
    }
  }
}

function hideOverlay(overlayEl) {
  if (overlayEl.classList.contains('hidden')) return;
  overlayEl.classList.add('overlay--closing');
  setTimeout(() => {
    overlayEl.classList.add('hidden');
    overlayEl.classList.remove('overlay--closing');
  }, 160);
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
  if (soloAiBusy) return;

  if (engine.phase === PHASES.BASE_QUESTION) {
    openLocalEstimation(false, () => {
      engine.submitBaseQuestionAnswers(localSubmissions);
    });
    return;
  }

  if (engine.phase === PHASES.BASE_SELECTION) {
    const cur = engine.currentSelector;
    const p = engine.players[cur];
    if (p && !p.isHuman) {
      soloAiBusy = true;
      setTimeout(() => {
        soloAiBusy = false;
        const cid = engine.chooseAiBaseCounty(cur);
        if (cid) {
          engine.selectBaseCounty(cur, cid);
          sound.playCastleBuild();
          stepSoloFlow();
        }
      }, 1400);
    }
    return;
  }

  if (engine.phase === PHASES.EXPANSION_QUESTION) {
    openLocalEstimation(false, () => {
      engine.submitExpansionQuestionAnswers(localSubmissions);
    });
    return;
  }

  if (engine.phase === PHASES.EXPANSION_SELECTION) {
    const cur = engine.currentSelector;
    const p = engine.players[cur];
    if (p && !p.isHuman) {
      soloAiBusy = true;
      setTimeout(() => {
        soloAiBusy = false;
        const cid = engine.chooseAiExpansionCounty(cur);
        if (cid) {
          engine.selectExpansionCounty(cur, cid);
          sound.playClaim();
          stepSoloFlow();
        }
      }, 1300);
    }
    return;
  }

  if (engine.phase === PHASES.BATTLE_SELECT_TARGET) {
    const attId = engine.currentSelector;
    const att = engine.players[attId];
    if (att && !att.isHuman) {
      soloAiBusy = true;
      setTimeout(() => {
        soloAiBusy = false;
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
        // AI battles are shown to the player as a spectator duel (never resolved invisibly)
        openLocalMcBattle();
      }, 1600);
    }
    return;
  }

  // Chained base siege continues with a fresh duel (same attacker until a miss or all towers fall)
  if (engine.phase === PHASES.BATTLE_MC_QUESTION && engine.activeBattle) {
    openLocalMcBattle();
    return;
  }

  // Safety net: if the engine is waiting in a tiebreaker with no visible modal, reopen it
  if (engine.phase === PHASES.BATTLE_TIEBREAKER_QUESTION && engine.activeBattle) {
    const estOv = document.getElementById('estimationOverlay');
    if (estOv.classList.contains('hidden')) {
      openLocalEstimation(true, () => {
        engine.submitBattleTiebreakerAnswers(localSubmissions);
      });
    }
    return;
  }

  if (engine.phase === PHASES.GAME_OVER) {
    finishSoloGame();
  }
}

function openLocalEstimation(isTiebreaker, onComplete) {
  const q = engine.activeQuestion;
  localIsTiebreakerEst = Boolean(isTiebreaker);
  localAfterEstCallback = onComplete;
  localSubmissions = {};

  const participants = q.participants || ['red', 'green', 'blue'];
  for (const pid of participants) {
    if (!engine.players[pid]?.isHuman) {
      localSubmissions[pid] = engine.simulateAiEstimation(q);
    }
  }

  // Spectator mode: the local player (red) is not a participant in this duel
  localSpectatorMode = !participants.includes('red');
  localAnsweringColor = localSpectatorMode ? null : 'red';

  document.getElementById('estCategory').textContent = q.category;
  document.getElementById('estContext').textContent = q.contextLabel || 'Tippelős kérdés';
  document.getElementById('estQuestionText').textContent = q.question;
  document.getElementById('estUnitText').textContent = q.unit || '';
  document.getElementById('estResultsWrap').classList.add('hidden');

  const statusBanner = document.getElementById('estStatusBanner');
  if (localSpectatorMode) {
    const names = participants.map(pid => engine.players[pid]?.name || pid).join(' ⚔ ');
    statusBanner.textContent = `Gépi tippelős párbaj folyamatban: ${names}`;
    statusBanner.classList.remove('hidden');
    document.getElementById('estInputWrap').classList.add('hidden');
  } else {
    statusBanner.classList.add('hidden');
    document.getElementById('estInputWrap').classList.remove('hidden');
  }

  const disp = document.getElementById('estInputDisplay');
  disp.value = '';
  document.getElementById('estLifelineHint').classList.add('hidden');
  const estP = engine.players.red;
  const canUseEstLifelines = !localSpectatorMode;
  document.getElementById('estLifelinesRow').classList.toggle('hidden', !canUseEstLifelines);
  document.getElementById('btnLifeParrot').disabled = !canUseEstLifelines || !estP?.lifelines?.parrot;
  document.getElementById('btnLifeTelescope').disabled = !canUseEstLifelines || !estP?.lifelines?.telescope;
  presentOverlay(document.getElementById('estimationOverlay'));
  if (!localSpectatorMode) {
    setTimeout(() => disp.focus(), 50);
  }

  clearInterval(localTimerId);
  localStartMs = Date.now();

  if (localSpectatorMode) {
    document.getElementById('estTimer').textContent = '⚔';
    localTimerId = setTimeout(() => submitEstValue(), 5200);
    return;
  }

  localTimeLeft = 15;
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
  clearTimeout(localTimerId);
  if (!localSpectatorMode) {
    if (!localAnsweringColor) return;
    localSubmissions[localAnsweringColor] = {
      guess: parsed,
      timeMs: Math.min(15000, Math.max(200, Date.now() - localStartMs))
    };
    localAnsweringColor = null;
  }

  if (localAfterEstCallback) {
    const cb = localAfterEstCallback;
    localAfterEstCallback = null;
    cb();
  }

  const q = engine.activeQuestion;
  const res = localIsTiebreakerEst ? engine.activeBattle?.tiebreakerResults : engine.lastQuestionResults;
  document.getElementById('estInputWrap').classList.add('hidden');
  document.getElementById('estLifelinesRow').classList.add('hidden');
  document.getElementById('estLifelineHint').classList.add('hidden');
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
  setTimeout(() => document.getElementById('btnEstContinue')?.focus(), 40);
}

function openLocalMcBattle() {
  const q = engine.activeQuestion;
  const b = engine.activeBattle;
  const att = engine.players[b.attackerId];
  const def = engine.players[b.defenderId];
  const county = engine.counties[b.targetCountyId];

  localSubmissions = {};
  for (const pid of [b.attackerId, b.defenderId]) {
    if (!engine.players[pid]?.isHuman) {
      localSubmissions[pid] = engine.simulateAiMultipleChoice(q);
    }
  }

  // Spectator mode: AI-vs-AI duel stays visible, answers are auto-simulated
  localSpectatorMode = !att.isHuman && !def.isHuman;
  localAnsweringColor = localSpectatorMode ? null : 'red';

  document.getElementById('mcCategory').textContent = q.category;
  const siegeInfo = b.isBaseSiege
    ? ` • ${county.towers}/3 torony${(b.siegeChain || 1) > 1 ? ` • ${b.siegeChain}. támadás` : ''}`
    : '';
  document.getElementById('mcContext').textContent = `${county.name} ostroma${siegeInfo}`;
  document.getElementById('mcQuestionText').textContent = q.question;
  document.getElementById('mcDuelBar').innerHTML = `
    <span style="color:#fca5a5;">Támadó: ${att.name}</span>
    <span style="color:var(--text-muted);">VS</span>
    <span style="color:#93c5fd;">Védő: ${def.name}</span>
  `;
  document.getElementById('mcPollHint').classList.add('hidden');
  document.getElementById('mcSummaryBox').classList.add('hidden');

  const statusBanner = document.getElementById('mcStatusBanner');
  if (localSpectatorMode) {
    statusBanner.textContent = `Gépi párbaj folyamatban: ${att.name} ⚔ ${def.name}`;
    statusBanner.classList.remove('hidden');
  } else {
    statusBanner.classList.add('hidden');
  }

  const p = engine.players.red;
  const canUseLifelines = !localSpectatorMode;
  document.getElementById('btnLifeHalve').disabled = !canUseLifelines || !p.lifelines.halve;
  document.getElementById('btnLifePoll').disabled = !canUseLifelines || !p.lifelines.owl;

  renderMcButtons(q.options, !localSpectatorMode, [], null);
  presentOverlay(document.getElementById('mcOverlay'));

  clearInterval(localTimerId);
  localStartMs = Date.now();

  if (localSpectatorMode) {
    // Spectator: keep the question on screen briefly, then reveal the AI duel result
    localTimeLeft = 6;
    document.getElementById('mcTimer').textContent = '⚔';
    localTimerId = setTimeout(() => submitMcChoice(-1), 5000);
    return;
  }

  localTimeLeft = 15;
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
  clearTimeout(localTimerId);
  if (!localSpectatorMode) {
    if (!localAnsweringColor) return;
    localSubmissions[localAnsweringColor] = {
      choiceIndex,
      timeMs: Math.min(15000, Math.max(200, Date.now() - localStartMs))
    };
    localAnsweringColor = null;
  }

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
      contBtn.onclick = null;
      openLocalEstimation(true, () => {
        engine.submitBattleTiebreakerAnswers(localSubmissions);
      });
    };
  } else {
    sound.playSwordClash();
    summaryText.textContent = engine.activeBattle.outcome?.message || '';
    contBtn.onclick = () => {
      contBtn.onclick = null;
      hideOverlay(document.getElementById('mcOverlay'));
      engine.completeCurrentBattleTurn();
      stepSoloFlow();
    };
  }
  renderAll();
  setTimeout(() => contBtn?.focus(), 40);
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
    const estOv = document.getElementById('estimationOverlay');
    if (estOv.classList.contains('hidden')) return;
    hideOverlay(estOv);

    if (online.active) {
      online.dismissedQuestionId = online.lastQuestionId;
      fetch(`/api/rooms/${online.code}/continue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: online.token })
      });
      return;
    }

    if (localIsTiebreakerEst) {
      localIsTiebreakerEst = false;
      engine.completeCurrentBattleTurn();
    }
    stepSoloFlow();
  });

  document.getElementById('btnMcContinue').addEventListener('click', () => {
    if (online.active) {
      online.dismissedQuestionId = online.lastQuestionId;
      document.getElementById('mcOverlay').classList.add('hidden');
      fetch(`/api/rooms/${online.code}/continue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: online.token })
      });
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

  document.getElementById('btnLifeParrot').addEventListener('click', () => {
    if (online.active) {
      fetch(`/api/rooms/${online.code}/lifeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: online.token, lifeline: 'parrot' })
      });
      return;
    }
    const p = engine.players.red;
    if (!p?.lifelines?.parrot || localSpectatorMode) return;
    p.lifelines.parrot = false;
    const truth = engine.activeQuestion.answer;
    const spread = 0.10 + Math.random() * 0.15;
    const low = Math.max(0, Math.floor(truth * (1 - spread)));
    const high = Math.ceil(truth * (1 + spread));
    const hint = document.getElementById('estLifelineHint');
    hint.innerHTML = `🦜 <strong>Papagáj súg:</strong> a helyes válasz <strong>${low}</strong> és <strong>${high}</strong> közé esik!`;
    hint.classList.remove('hidden');
    document.getElementById('btnLifeParrot').disabled = true;
  });

  document.getElementById('btnLifeTelescope').addEventListener('click', () => {
    if (online.active) {
      fetch(`/api/rooms/${online.code}/lifeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: online.token, lifeline: 'telescope' })
      });
      return;
    }
    const p = engine.players.red;
    if (!p?.lifelines?.telescope || localSpectatorMode) return;
    p.lifelines.telescope = false;
    const others = Object.entries(localSubmissions)
      .filter(([pid, sub]) => pid !== 'red' && sub?.guess != null)
      .map(([pid, sub]) => `${engine.players[pid]?.name || pid}: <strong>${sub.guess}</strong>`);
    const hint = document.getElementById('estLifelineHint');
    hint.innerHTML = others.length
      ? `🔭 <strong>Távcső mutatja:</strong> ellenfeleid tippjei — ${others.join(' • ')}`
      : `🔭 <strong>Távcső:</strong> még nem látszik ellenfél-tipp.`;
    hint.classList.remove('hidden');
    document.getElementById('btnLifeTelescope').disabled = true;
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
