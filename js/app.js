// Main Frontend Application Controller for Honfoglalo Web Clone (Local & Online Multiplayer)
import { HUNGARY_COUNTIES } from './mapData.js';
import { HonfoglaloEngine, PHASES } from './gameEngine.js';
import { sound } from './audio.js';

const engine = new HonfoglaloEngine();

let currentUser = null;
let registeredUsers = [];
let activeDirectInvite = null;
let allDbQuestions = { multipleChoice: [], estimation: [] };

// Local question session state
let questionTimerId = null;
let questionTimeLeft = 15;
let questionStartTimeMs = 0;
let pendingParticipantQueue = [];
let currentAnsweringPlayerId = null;
let collectedSubmissions = {};
let postEstimationCallback = null;

// Online multiplayer session state
const onlineSession = {
  active: false,
  code: null,
  token: null,
  myColor: null,
  isHost: false,
  sse: null,
  pollIntervalId: null,
  lastRenderedQuestionId: null,
  lastStage: null,
  lastStatus: null
};

// DOM Elements
const el = {
  phaseBadge: document.getElementById('phaseBadge'),
  phaseInstruction: document.getElementById('phaseInstruction'),
  dbStatusDot: document.getElementById('dbStatusDot'),
  dbStatusText: document.getElementById('dbStatusText'),
  currentUserLabel: document.getElementById('currentUserLabel'),
  playersPanel: document.getElementById('playersPanel'),
  owlSpeech: document.getElementById('owlSpeech'),
  roundCounterBadge: document.getElementById('roundCounterBadge'),
  mapPathsGroup: document.getElementById('mapPathsGroup'),
  mapOverlaysGroup: document.getElementById('mapOverlaysGroup'),
  mapTooltip: document.getElementById('mapTooltip'),
  mapCanvasWrap: document.getElementById('mapCanvasWrap'),
  mapActionStatus: document.getElementById('mapActionStatus'),
  mapActionButtons: document.getElementById('mapActionButtons'),
  freeCountiesIndicator: document.getElementById('freeCountiesIndicator'),
  chronicleList: document.getElementById('chronicleList'),
  countyInspectorBody: document.getElementById('countyInspectorBody'),

  // Modals
  lobbyModal: document.getElementById('lobbyModal'),
  estimationModal: document.getElementById('estimationModal'),
  mcBattleModal: document.getElementById('mcBattleModal'),
  gameOverModal: document.getElementById('gameOverModal'),
  authModal: document.getElementById('authModal'),
  leaderboardModal: document.getElementById('leaderboardModal'),
  questionBankModal: document.getElementById('questionBankModal'),
  rulesModal: document.getElementById('rulesModal')
};

// ==================== INITIALIZATION ====================
async function initApp() {
  loadSavedUser();
  renderInitialSvgMap();
  bindGlobalEvents();
  await syncWithBackend();
  updateUserHeaderUI();
  renderAll();
  checkUrlInviteParam();
  startIncomingInvitePolling();

  // Prompt registration / login if not authenticated yet
  if (!currentUser) {
    openAuthModal();
  }
}

function loadSavedUser() {
  try {
    const raw = sessionStorage.getItem('honfoglalo_user') || localStorage.getItem('honfoglalo_user');
    if (raw) {
      currentUser = JSON.parse(raw);
    }
  } catch {
    currentUser = null;
  }
}

function saveCurrentUser(user) {
  currentUser = user;
  if (user) {
    sessionStorage.setItem('honfoglalo_user', JSON.stringify(user));
    localStorage.setItem('honfoglalo_user', JSON.stringify(user));
  } else {
    sessionStorage.removeItem('honfoglalo_user');
    localStorage.removeItem('honfoglalo_user');
  }
  updateUserHeaderUI();
}

function updateUserHeaderUI() {
  const infoText = document.getElementById('lobbyAccountInfoText');
  const switchBtn = document.getElementById('btnSwitchAccountInLobby');
  const hostPreview = document.getElementById('onlineHostPreviewName');

  if (currentUser) {
    el.currentUserLabel.textContent = `👑 ${currentUser.username}`;
    if (infoText) {
      infoText.innerHTML = `👑 Bejelentkezett regisztrált vezér: <strong style="color: var(--gold-bright);">${currentUser.username}</strong> <span style="color: var(--text-muted);">(${currentUser.title || 'Honfoglaló Vitéz'})</span>`;
    }
    if (switchBtn) switchBtn.textContent = '🔄 Vezér Váltása / Új Regisztráció';
    if (hostPreview) hostPreview.textContent = `${currentUser.username} (${currentUser.title || 'Honfoglaló Vitéz'})`;

    // Update default player preview on left panel if still in lobby
    if (engine.phase === PHASES.LOBBY && !onlineSession.active) {
      engine.players.red.name = currentUser.username;
      engine.players.red.title = currentUser.title || 'Honfoglaló Vitéz';
    }
  } else {
    el.currentUserLabel.textContent = '👤 Regisztráció / Belépés';
    if (infoText) {
      infoText.innerHTML = '⚠️ <strong>Nincs bejelentkezett vezér!</strong> A játékhoz kérlek regisztrálj vagy lépj be!';
    }
    if (switchBtn) switchBtn.textContent = '🛡️ Regisztráció / Belépés Most';
    if (hostPreview) hostPreview.textContent = 'Regisztrált Vezér';
  }

  populateRegisteredCommanderSelects();
}

function populateRegisteredCommanderSelects() {
  const redSel = document.getElementById('inputRedName');
  const greenSel = document.getElementById('inputGreenName');
  const blueSel = document.getElementById('inputBlueName');
  if (!redSel || !greenSel || !blueSel) return;

  const list = registeredUsers.length > 0
    ? registeredUsers
    : [
        { username: 'Árpád Vezér', title: 'Fejedelem' },
        { username: 'Hunyadi Mátyás', title: 'Igazságos Király' },
        { username: 'Koppány Vezér', title: 'Somogy Ura' }
      ];

  const makeOptions = (selectedName) =>
    list
      .map(
        u =>
          `<option value="${u.username}" ${u.username === selectedName ? 'selected' : ''}>${u.username} (${u.title || 'Vitéz'})</option>`
      )
      .join('');

  const redDefault = currentUser ? currentUser.username : list[0]?.username;
  const others = list.filter(u => u.username !== redDefault);
  const greenDefault = others[0]?.username || list[1]?.username || list[0]?.username;
  const blueDefault = others[1]?.username || list[2]?.username || list[0]?.username;

  redSel.innerHTML = makeOptions(redDefault);
  greenSel.innerHTML = makeOptions(greenDefault);
  blueSel.innerHTML = makeOptions(blueDefault);
}

async function syncWithBackend() {
  try {
    const [statusRes, qRes, uRes] = await Promise.all([
      fetch('/api/status'),
      fetch('/api/questions'),
      fetch('/api/users')
    ]);
    if (statusRes.ok) {
      const status = await statusRes.json();
      const totalQ = (status.counts?.multipleChoice || 0) + (status.counts?.estimation || 0);
      el.dbStatusDot.style.background = '#38c172';
      el.dbStatusText.textContent = `${status.engine} • ${status.counts?.users || 0} vezér • ${totalQ} kérdés`;
    }
    if (qRes.ok) {
      const qData = await qRes.json();
      allDbQuestions = qData;
      engine.setQuestionDatabase(qData);
    }
    if (uRes.ok) {
      const uData = await uRes.json();
      registeredUsers = uData.users || [];
      populateRegisteredCommanderSelects();
      renderAuthQuickLoginChips();
    }
  } catch {
    el.dbStatusDot.style.background = '#f59e0b';
    el.dbStatusText.textContent = 'Helyi Kérdésbank';
  }
}

function checkUrlInviteParam() {
  const params = new URLSearchParams(window.location.search);
  const invitedRoom = params.get('room');
  if (invitedRoom) {
    const cleanCode = invitedRoom.trim().toUpperCase();
    const joinInput = document.getElementById('inputJoinRoomCode');
    if (joinInput) {
      joinInput.value = cleanCode;
    }
    el.lobbyModal.classList.remove('hidden');
    setOwlSpeech(`Meghívót kaptál a(z) ${cleanCode} online szobába! Jelentkezz be vagy regisztrálj, majd kattints a „Belépés a Váróterembe” gombra!`);
  }
}

function startIncomingInvitePolling() {
  setInterval(async () => {
    if (!currentUser) return;
    try {
      const res = await fetch(`/api/invites?username=${encodeURIComponent(currentUser.username)}`);
      if (!res.ok) return;
      const data = await res.json();
      const invites = data.invites || [];
      const pending = invites.find(inv => !onlineSession.active || onlineSession.code !== inv.roomCode);
      const toastEl = document.getElementById('incomingInviteToast');
      if (pending) {
        activeDirectInvite = pending;
        document.getElementById('incomingInviteText').innerHTML =
          `🎺 <strong>${pending.fromUsername}</strong> meghívott téged (<strong>${currentUser.username}</strong>) a(z) <code>${pending.roomCode}</code> online Honfoglaló lobbyba!`;
        toastEl.classList.remove('hidden');
      } else {
        activeDirectInvite = null;
        toastEl.classList.add('hidden');
      }
    } catch {
      // ignore
    }
  }, 1600);
}

// ==================== ONLINE MULTIPLAYER CLIENT ====================
async function createOnlineRoom() {
  if (!currentUser) {
    openAuthModal();
    return;
  }
  const errEl = document.getElementById('onlineLobbyError');
  errEl.classList.add('hidden');
  const hostName = currentUser.username;
  const hostTitle = currentUser.title || 'Honfoglaló Vitéz';
  const maxBattleRounds = Number(document.getElementById('selectOnlineRounds').value) || 6;
  const aiDifficulty = document.getElementById('selectOnlineAiDiff').value || 'normal';

  try {
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostName, hostTitle, maxBattleRounds, aiDifficulty })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Nem sikerült létrehozni a szobát.');

    activateOnlineSession(data.code, data.playerToken, data.assignedColor, data.state);
    sound.playCastleBuild();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
}

async function joinOnlineRoomByCode(explicitCode = null) {
  if (!currentUser) {
    openAuthModal();
    return;
  }
  const errEl = document.getElementById('onlineLobbyError');
  errEl.classList.add('hidden');
  const code = (explicitCode || document.getElementById('inputJoinRoomCode').value || '').trim().toUpperCase();
  const playerName = currentUser.username;
  const playerTitle = currentUser.title || 'Honfoglaló Vitéz';

  if (!code) {
    errEl.textContent = 'Kérlek írd be a 6 jegyű meghívókódot!';
    errEl.classList.remove('hidden');
    return;
  }

  try {
    const res = await fetch('/api/rooms/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, playerName, playerTitle })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Nem sikerült csatlakozni a szobához.');

    el.lobbyModal.classList.remove('hidden');
    activateOnlineSession(data.code, data.playerToken, data.assignedColor, data.state);
    sound.playClaim();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
}

function activateOnlineSession(code, token, assignedColor, initialState) {
  leaveOnlineSession(false);

  onlineSession.active = true;
  onlineSession.code = code;
  onlineSession.token = token;
  onlineSession.myColor = assignedColor;
  onlineSession.isHost = Boolean(initialState.isViewerHost);
  onlineSession.lastRenderedQuestionId = null;
  onlineSession.lastStage = null;
  onlineSession.lastStatus = null;

  // Update URL so the host/player can also copy from address bar if desired
  const newUrl = `${window.location.origin}${window.location.pathname}?room=${code}`;
  window.history.replaceState({}, '', newUrl);

  // Connect Server-Sent Events stream
  const sse = new EventSource(`/api/rooms/${code}/stream?token=${encodeURIComponent(token)}`);
  sse.onmessage = evt => {
    try {
      const state = JSON.parse(evt.data);
      handleOnlineStateUpdate(state);
    } catch {
      // ignore malformed frame
    }
  };
  onlineSession.sse = sse;

  // Lightweight fallback poll every 1.2s for instant timer & state resilience
  onlineSession.pollIntervalId = setInterval(async () => {
    if (!onlineSession.active) return;
    try {
      const res = await fetch(`/api/rooms/${onlineSession.code}?token=${encodeURIComponent(onlineSession.token)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.state) handleOnlineStateUpdate(data.state);
      }
    } catch {
      // ignore transient network glitch
    }
  }, 1200);

  handleOnlineStateUpdate(initialState);
}

function leaveOnlineSession(resetUrl = true) {
  if (onlineSession.sse) {
    onlineSession.sse.close();
    onlineSession.sse = null;
  }
  if (onlineSession.pollIntervalId) {
    clearInterval(onlineSession.pollIntervalId);
    onlineSession.pollIntervalId = null;
  }
  onlineSession.active = false;
  onlineSession.code = null;
  onlineSession.token = null;
  onlineSession.myColor = null;
  onlineSession.isHost = false;
  onlineSession.lastRenderedQuestionId = null;
  onlineSession.lastStage = null;
  onlineSession.lastStatus = null;

  document.getElementById('onlineSetupBox').classList.remove('hidden');
  document.getElementById('onlineWaitingRoomBox').classList.add('hidden');

  if (resetUrl && window.location.search.includes('room=')) {
    window.history.replaceState({}, '', window.location.pathname);
  }
}

function handleOnlineStateUpdate(state) {
  if (!onlineSession.active) return;

  onlineSession.myColor = state.viewerColor || onlineSession.myColor;
  onlineSession.isHost = Boolean(state.isViewerHost);

  // Sync engine data for map & panels
  engine.phase = state.phase;
  engine.gameMode = 'online';
  engine.currentSelector = state.currentSelector;
  engine.currentBattleRound = state.currentBattleRound;
  engine.maxBattleRounds = state.maxBattleRounds;
  engine.players = state.players;
  engine.counties = state.counties;
  engine.activeBattle = state.activeBattle;
  engine.chronicle = state.chronicle || [];

  if (state.status === 'WAITING') {
    renderOnlineWaitingRoom(state);
    renderAll();
    return;
  }

  // Transition from WAITING -> PLAYING: close the Lobby Modal!
  if (onlineSession.lastStatus === 'WAITING' && state.status === 'PLAYING') {
    el.lobbyModal.classList.add('hidden');
    sound.playCastleBuild();
  }
  onlineSession.lastStatus = state.status;

  // Handle active question session (ANSWERING or REVEAL)
  syncOnlineQuestionModals(state);

  // Check Game Over
  if (state.phase === PHASES.GAME_OVER && el.gameOverModal.classList.contains('hidden')) {
    renderOnlineGameOver(state);
  }

  renderAll();
}

function renderOnlineWaitingRoom(state) {
  document.getElementById('onlineSetupBox').classList.add('hidden');
  document.getElementById('onlineWaitingRoomBox').classList.remove('hidden');

  document.getElementById('waitingRoomCodeDisplay').textContent = state.code;
  const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${state.code}`;
  document.getElementById('waitingRoomLinkInput').value = inviteUrl;

  const grid = document.getElementById('waitingRoomSlotsGrid');
  grid.innerHTML = '';

  const meta = {
    red: { badge: '🔴 Piros Vezér (Házigazda)', icon: '🦅' },
    green: { badge: '🟢 Zöld Vezér', icon: '🦌' },
    blue: { badge: '🔵 Kék Vezér', icon: '🐺' }
  };

  for (const color of ['red', 'green', 'blue']) {
    const slot = state.slots[color];
    const isMe = state.viewerColor === color;
    const box = document.createElement('div');
    box.className = `commander-input-box commander-input-box--${color}`;
    box.style.borderColor = isMe ? 'var(--gold-bright)' : slot.isHuman ? '#38c172' : '#633d1d';

    box.innerHTML = `
      <span class="commander-badge">${meta[color].badge} ${isMe ? '⭐ (TE)' : ''}</span>
      <div style="font-family: var(--font-display); font-size: 1rem; font-weight: 800; color: #fff4d6;">
        ${meta[color].icon} ${slot.name}
      </div>
      <div style="font-size: 0.74rem; color: var(--gold-bright); font-weight: 700;">
        🎖️ ${slot.title || (slot.isHuman ? 'Honfoglaló Vitéz' : 'Gépi Vezér')}
      </div>
      <div style="font-size: 0.76rem; color: ${slot.isHuman ? '#86efac' : 'var(--text-muted)'}; font-weight: 700;">
        ${slot.isHuman ? '🟢 Regisztrált Játékos csatlakozva' : '🤖 Gépi Vezér (Várakozás meghívott játékosra...)'}
      </div>
    `;
    grid.appendChild(box);
  }

  // Render Registered Database Users Invite List
  const inviteListEl = document.getElementById('registeredUsersInviteList');
  if (inviteListEl) {
    inviteListEl.innerHTML = '';
    const joinedNames = Object.values(state.slots)
      .filter(s => s.isHuman)
      .map(s => s.name.toLowerCase());
    const invitedLower = (state.invitedUsernames || []).map(n => n.toLowerCase());

    const invitableUsers = registeredUsers.filter(
      u => !joinedNames.includes(u.username.toLowerCase())
    );

    if (invitableUsers.length === 0) {
      inviteListEl.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem;">Minden regisztrált vezér bent van a szobában, vagy regisztrálj új vezért!</div>';
    } else {
      invitableUsers.forEach(u => {
        const chip = document.createElement('div');
        chip.className = 'registered-user-chip';
        const isInvited = invitedLower.includes(u.username.toLowerCase());
        chip.innerHTML = `
          <div>
            <div style="font-weight: 800; color: #fff4d6;">👑 ${u.username}</div>
            <div style="font-size: 0.7rem; color: var(--text-muted);">${u.title || 'Honfoglaló Vitéz'}</div>
          </div>
        `;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `medieval-btn medieval-btn--sm ${isInvited ? '' : 'medieval-btn--gold'}`;
        btn.textContent = isInvited ? '✔ Meghívva' : '📨 Meghívás';
        btn.onclick = async () => {
          sound.playClick();
          await fetch(`/api/rooms/${state.code}/invite`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: onlineSession.token,
              targetUsername: u.username
            })
          });
        };
        chip.appendChild(btn);
        inviteListEl.appendChild(chip);
      });
    }
  }

  const startBtn = document.getElementById('btnStartOnlineMatch');
  const statusText = document.getElementById('waitingRoomStatusText');
  const humanCount = Object.values(state.slots).filter(s => s.isHuman).length;

  if (state.isViewerHost) {
    startBtn.classList.remove('hidden');
    statusText.textContent = `Csatlakozott játékosok: ${humanCount}/3 fő. Bármikor elindíthatod a hadjáratot!`;
  } else {
    startBtn.classList.add('hidden');
    statusText.textContent = `Csatlakozva (${humanCount}/3 fő). Várakozás, amíg a házigazda (${state.slots.red.name}) elindítja a csatát...`;
  }
}

function syncOnlineQuestionModals(state) {
  const qs = state.questionSession;
  if (!qs) {
    el.estimationModal.classList.add('hidden');
    el.mcBattleModal.classList.add('hidden');
    onlineSession.lastRenderedQuestionId = null;
    onlineSession.lastStage = null;

    // Update Owl Speech for map selection turn
    const selector = state.players[state.currentSelector];
    const isMyTurn = state.currentSelector === state.viewerColor;
    if (selector) {
      if (state.phase === PHASES.BASE_SELECTION) {
        setOwlSpeech(
          isMyTurn
            ? `🎯 ${selector.name}, a te köröd van! Kattints egy szabad vármegyére a 3 tornyú fővárad (1000p) felépítéséhez!`
            : `⏳ Most ${selector.name} választ vármegyét a fővárának...`
        );
      } else if (state.phase === PHASES.EXPANSION_SELECTION) {
        setOwlSpeech(
          isMyTurn
            ? `🎯 ${selector.name}, a te köröd van! Kattints egy sárgán pulzáló szabad vármegyére (+200p)!`
            : `⏳ Most ${selector.name} foglal szabad vármegyét...`
        );
      } else if (state.phase === PHASES.BATTLE_SELECT_TARGET) {
        setOwlSpeech(
          isMyTurn
            ? `⚔️ ${selector.name}, te támadsz! Kattints egy sárgán pulzáló ellenséges vármegyére az ostromhoz!`
            : `⏳ Most ${selector.name} választ célpontot a támadáshoz...`
        );
      }
    }
    return;
  }

  const isParticipant = qs.participants.includes(state.viewerColor);
  const isNewQuestion = onlineSession.lastRenderedQuestionId !== qs.id;
  const isStageChange = onlineSession.lastStage !== qs.stage;

  if (qs.questionType === 'estimation') {
    el.mcBattleModal.classList.add('hidden');
    el.estimationModal.classList.remove('hidden');

    document.getElementById('estCategoryBadge').textContent = qs.category;
    document.getElementById('estContextLabel').textContent = qs.contextLabel || 'Tippelős kérdés';
    document.getElementById('estQuestionText').textContent = qs.questionText;
    document.getElementById('estUnitLabel').textContent = qs.unit || '';
    document.getElementById('estTimerValue').textContent = qs.remainingSec;

    const promptEl = document.getElementById('estTurnPrompt');
    const inputSec = document.getElementById('estInputSection');
    const resSec = document.getElementById('estResultsSection');

    if (qs.stage === 'ANSWERING') {
      resSec.classList.add('hidden');
      const waitingStatuses = qs.participants
        .map(pid => {
          const pName = state.players[pid]?.name || pid;
          const done = qs.submittedColors.includes(pid);
          return `${done ? '✅' : '⏳'} ${pName}`;
        })
        .join(' • ');

      if (isParticipant && !qs.hasViewerSubmitted) {
        inputSec.classList.remove('hidden');
        promptEl.textContent = `🎯 Írd be a tippedet! (${waitingStatuses})`;
        promptEl.classList.remove('hidden');
        if (isNewQuestion) {
          const disp = document.getElementById('estNumberDisplay');
          disp.value = '';
          setTimeout(() => disp.focus(), 60);
        }
      } else {
        inputSec.classList.add('hidden');
        promptEl.textContent = isParticipant
          ? `✔ Tipped rögzítve! Várakozás a többi vezérre: ${waitingStatuses}`
          : `👀 Tippelős párbaj folyamatban: ${waitingStatuses}`;
        promptEl.classList.remove('hidden');
      }
    } else if (qs.stage === 'REVEAL' && qs.revealData) {
      inputSec.classList.add('hidden');
      promptEl.classList.add('hidden');
      resSec.classList.remove('hidden');

      document.getElementById('estTruthValue').textContent =
        `${qs.revealData.truth}${qs.revealData.unit ? ' ' + qs.revealData.unit : ''}`;

      const listEl = document.getElementById('estResultsList');
      listEl.innerHTML = '';
      (qs.revealData.ranked || []).forEach((r, idx) => {
        const row = document.createElement('div');
        row.className = `est-rank-row ${idx === 0 ? 'est-rank-row--winner' : ''}`;
        const diffText = Number.isFinite(r.diff) ? `eltérés: ${r.diff}` : 'nincs tipp';
        const secText = (r.timeMs / 1000).toFixed(1) + ' mp';
        row.innerHTML = `
          <div>
            <strong>${idx + 1}. ${r.playerName}</strong>
            <span style="margin-left:8px; color: var(--gold-bright);">Tipp: ${r.guess ?? '–'}</span>
          </div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">
            ${diffText} • ⏱️ ${secText}
          </div>
        `;
        listEl.appendChild(row);
      });

      document.getElementById('btnContinueAfterEst').textContent = 'Automatikus folytatás a térképen...';
      if (isStageChange) sound.playCorrect();
    }
  } else if (qs.questionType === 'multiple_choice') {
    el.estimationModal.classList.add('hidden');
    el.mcBattleModal.classList.remove('hidden');

    document.getElementById('mcCategoryBadge').textContent = qs.category;
    document.getElementById('mcContextLabel').textContent = qs.contextLabel || 'Harci összecsapás';
    document.getElementById('mcQuestionText').textContent = qs.questionText;
    document.getElementById('mcTimerValue').textContent = qs.remainingSec;

    const attId = qs.participants[0];
    const defId = qs.participants[1];
    const attName = state.players[attId]?.name || 'Támadó';
    const defName = state.players[defId]?.name || 'Védő';

    document.getElementById('mcDuelBanner').innerHTML = `
      <span style="color: #fca5a5;">⚔️ Támadó: ${attName} ${qs.submittedColors.includes(attId) ? '✅' : '⏳'}</span>
      <span>VS</span>
      <span style="color: #93c5fd;">🛡️ Védő: ${defName} ${qs.submittedColors.includes(defId) ? '✅' : '⏳'}</span>
    `;

    const promptEl = document.getElementById('mcTurnPrompt');
    const summaryBox = document.getElementById('mcBattleSummary');
    const pollBox = document.getElementById('mcOwlPollBox');

    if (qs.viewerOwlPoll) {
      const letters = ['A', 'B', 'C', 'D'];
      pollBox.innerHTML = `🦉 <strong>Tudós Bagoly javaslata:</strong> ${letters.map((L, idx) => `<span style="margin-left:10px;"><strong>${L}:</strong> ${qs.viewerOwlPoll[idx]}%</span>`).join('')}`;
      pollBox.classList.remove('hidden');
    } else {
      pollBox.classList.add('hidden');
    }

    if (qs.stage === 'ANSWERING') {
      summaryBox.classList.add('hidden');
      const canAnswer = isParticipant && !qs.hasViewerSubmitted;

      const myPlayer = state.players[state.viewerColor];
      document.getElementById('btnLifelineHalve').disabled = !canAnswer || !myPlayer?.lifelines?.halve;
      document.getElementById('btnLifelineOwl').disabled = !canAnswer || !myPlayer?.lifelines?.owl;
      document.getElementById('btnLifelineTime').disabled = !canAnswer || !myPlayer?.lifelines?.extraTime;

      promptEl.textContent = canAnswer
        ? '⚔️ Válaszd ki a helyes választ!'
        : isParticipant
          ? '✔ Válaszod elküldve! Várakozás az ellenfélre...'
          : `👀 Élő párbaj: ${attName} ⚔️ ${defName}`;
      promptEl.classList.remove('hidden');

      renderOnlineMcOptions(qs, canAnswer, null);
    } else if (qs.stage === 'REVEAL' && qs.revealData) {
      promptEl.classList.add('hidden');
      renderOnlineMcOptions(qs, false, qs.revealData);

      const letters = ['A', 'B', 'C', 'D'];
      const attL = letters[qs.revealData.attackerChoice] || '–';
      const defL = letters[qs.revealData.defenderChoice] || '–';

      summaryBox.classList.remove('hidden');
      document.getElementById('mcBattleSummaryText').innerHTML = `
        <div style="margin-bottom:4px;">
          ${attName} válasza: <strong>${attL}</strong> • ${defName} válasza: <strong>${defL}</strong>
        </div>
        <div style="font-weight:800; color: var(--gold-bright);">
          ${qs.revealData.outcomeMessage || ''}
        </div>
      `;
      document.getElementById('btnContinueAfterMc').textContent = 'Automatikus folytatás...';

      if (isStageChange) {
        if (qs.revealData.status === 'TIEBREAKER') sound.playCorrect();
        else sound.playSwordClash();
      }
    }
  }

  onlineSession.lastRenderedQuestionId = qs.id;
  onlineSession.lastStage = qs.stage;
}

function renderOnlineMcOptions(qs, canAnswer, revealData) {
  const grid = document.getElementById('mcOptionsGrid');
  grid.innerHTML = '';
  const letters = ['A', 'B', 'C', 'D'];
  const halved = qs.viewerHalvedOptions || [];

  (qs.options || []).forEach((optText, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    const classes = ['mc-option-btn'];
    if (halved.includes(idx) && !revealData) {
      classes.push('mc-option-btn--hidden-half');
    }
    if (revealData) {
      if (idx === revealData.correctIndex) classes.push('mc-option-btn--correct');
      else if (idx === revealData.attackerChoice || idx === revealData.defenderChoice) {
        classes.push('mc-option-btn--wrong');
      }
    }
    btn.className = classes.join(' ');
    btn.disabled = !canAnswer || halved.includes(idx);
    btn.innerHTML = `
      <span class="mc-option-letter">${letters[idx]}</span>
      <span>${optText}</span>
    `;
    btn.addEventListener('click', () => {
      submitOnlineAnswer({ choiceIndex: idx });
    });
    grid.appendChild(btn);
  });
}

async function submitOnlineAnswer(payload) {
  if (!onlineSession.active) return;
  sound.playClick();
  try {
    const res = await fetch(`/api/rooms/${onlineSession.code}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: onlineSession.token,
        ...payload
      })
    });
    const data = await res.json();
    if (res.ok && data.state) {
      handleOnlineStateUpdate(data.state);
    }
  } catch {
    // ignore
  }
}

async function renderOnlineGameOver(state) {
  sound.playVictoryFanfare();
  const standings = state.standings || engine.getStandings();
  const winner = standings[0];

  document.getElementById('victoryBanner').innerHTML = `
    <div style="font-size: 2rem;">👑</div>
    <div style="font-family: var(--font-display); font-size: 1.35rem; font-weight: 900; color: var(--gold-bright);">
      Győztes: ${winner.name}
    </div>
    <div style="font-size: 0.95rem; margin-top: 4px;">
      <strong>${winner.score} pont</strong> • ${winner.countiesCount} meghódított vármegye
    </div>
  `;

  const podiumEl = document.getElementById('victoryPodiumList');
  podiumEl.innerHTML = '';
  const medals = ['🥇 1. hely', '🥈 2. hely', '🥉 3. hely'];

  standings.forEach((p, idx) => {
    const row = document.createElement('div');
    row.className = `est-rank-row ${idx === 0 ? 'est-rank-row--winner' : ''}`;
    row.innerHTML = `
      <div><strong>${medals[idx]}: ${p.name}</strong></div>
      <div><strong>${p.score} pont</strong> (${p.countiesCount} megye • ${p.correctAnswers}/${p.totalAnswers} jó válasz)</div>
    `;
    podiumEl.appendChild(row);
  });

  el.gameOverModal.classList.remove('hidden');
  await syncWithBackend();
}

// ==================== SVG MAP RENDERING ====================
function renderInitialSvgMap() {
  el.mapPathsGroup.innerHTML = '';
  el.mapOverlaysGroup.innerHTML = '';

  for (const c of HUNGARY_COUNTIES) {
    const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathEl.setAttribute('d', c.path);
    pathEl.setAttribute('id', `county-path-${c.id}`);
    pathEl.setAttribute('data-county-id', c.id);
    pathEl.setAttribute('class', 'county-path');

    pathEl.addEventListener('mouseenter', e => handleCountyHover(c.id, e));
    pathEl.addEventListener('mousemove', e => moveCountyTooltip(e));
    pathEl.addEventListener('mouseleave', () => hideCountyTooltip());
    pathEl.addEventListener('click', () => handleCountyClick(c.id));

    el.mapPathsGroup.appendChild(pathEl);

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('id', `county-overlay-${c.id}`);
    g.setAttribute('transform', `translate(${c.cx}, ${c.cy})`);
    g.setAttribute('class', 'county-structure-icon');
    el.mapOverlaysGroup.appendChild(g);
  }
}

function getCastleSvgMarkup(towers, isBase) {
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

function updateMapVisuals() {
  const selectableIds = getSelectableCountyIdsForCurrentHuman();

  for (const c of HUNGARY_COUNTIES) {
    const state = engine.counties[c.id];
    const pathEl = document.getElementById(`county-path-${c.id}`);
    const overlayEl = document.getElementById(`county-overlay-${c.id}`);
    if (!pathEl || !overlayEl) continue;

    const classes = ['county-path'];
    if (state.owner) {
      classes.push(`county-path--${state.owner}`);
    }
    if (selectableIds.includes(c.id)) {
      classes.push('county-path--selectable');
    }
    pathEl.setAttribute('class', classes.join(' '));

    const labelClass = state.owner ? 'county-label county-label--owned' : 'county-label';
    const structureMarkup = state.owner ? getCastleSvgMarkup(state.towers, state.isBase) : '';
    const pointsText = state.owner
      ? `${state.points}p${state.isBase ? ` (${state.towers}🏰)` : ''}`
      : '';

    overlayEl.innerHTML = `
      ${structureMarkup}
      <text y="6" class="${labelClass}">${c.shortName}</text>
      ${pointsText ? `<text y="19" class="county-points-tag">${pointsText}</text>` : ''}
    `;
  }
}

function getSelectableCountyIdsForCurrentHuman() {
  const selectorId = engine.currentSelector;
  if (!selectorId) return [];

  // In online mode, only highlight selectable counties when it is THIS player's turn
  if (onlineSession.active && selectorId !== onlineSession.myColor) {
    return [];
  }

  const player = engine.players[selectorId];
  if (!player || !player.isHuman) return [];

  if (engine.phase === PHASES.BASE_SELECTION) {
    return engine.getValidBaseCounties();
  }
  if (engine.phase === PHASES.EXPANSION_SELECTION) {
    return engine.getValidExpansionCounties(selectorId);
  }
  if (engine.phase === PHASES.BATTLE_SELECT_TARGET) {
    return engine.getValidAttackTargets(selectorId);
  }
  return [];
}

// ==================== MAP HOVER & CLICK INTERACTION ====================
function handleCountyHover(countyId, event) {
  const state = engine.counties[countyId];
  if (!state) return;

  const ownerName = state.owner ? engine.players[state.owner].name : 'Szabad terület';
  const neighborNames = state.neighbors.map(nid => engine.counties[nid]?.shortName || nid).join(', ');

  el.mapTooltip.innerHTML = `
    <div style="font-family: var(--font-display); font-weight: 800; color: var(--gold-bright); font-size: 0.88rem;">
      ${state.name} vármegye
    </div>
    <div>Székhely: <strong>${state.seat}</strong></div>
    <div>Birtokos: <strong>${ownerName}</strong></div>
    ${state.owner ? `<div>Érték: <strong>${state.points} pont</strong> ${state.isBase ? `(Fővár: ${state.towers} torony)` : ''}</div>` : ''}
  `;
  el.mapTooltip.classList.remove('hidden');
  moveCountyTooltip(event);

  el.countyInspectorBody.innerHTML = `
    <div><strong>Vármegye:</strong> ${state.name}</div>
    <div><strong>Megyeszékhely:</strong> ${state.seat}</div>
    <div><strong>Uralkodó vezér:</strong> ${ownerName}</div>
    <div><strong>Státusz:</strong> ${state.isBase ? `🏰 Fővár (${state.towers} torony)` : state.owner ? '🗼 Bástya (1 torony)' : 'Szabadon elfoglalható'}</div>
    <div><strong>Pontérték:</strong> ${state.owner ? `${state.points} pont` : 'Alapítás: 1000p / Foglalás: 200p'}</div>
    <div style="margin-top:4px;"><strong>Szomszédos megyék:</strong> ${neighborNames}</div>
  `;
}

function moveCountyTooltip(event) {
  const rect = el.mapCanvasWrap.getBoundingClientRect();
  const x = Math.min(rect.width - 190, Math.max(10, event.clientX - rect.left + 14));
  const y = Math.min(rect.height - 90, Math.max(10, event.clientY - rect.top + 14));
  el.mapTooltip.style.left = `${x}px`;
  el.mapTooltip.style.top = `${y}px`;
}

function hideCountyTooltip() {
  el.mapTooltip.classList.add('hidden');
}

async function handleCountyClick(countyId) {
  // Online Multiplayer County Click
  if (onlineSession.active) {
    if (engine.currentSelector !== onlineSession.myColor) {
      sound.playWrong();
      setOwlSpeech('Most egy másik vezér köre van, kérlek várd meg a lépését!');
      return;
    }
    try {
      const res = await fetch(`/api/rooms/${onlineSession.code}/select-county`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: onlineSession.token,
          countyId
        })
      });
      const data = await res.json();
      if (!res.ok) {
        sound.playWrong();
        setOwlSpeech(data.error || 'Érvénytelen lépés!');
        return;
      }
      sound.playClaim();
      handleOnlineStateUpdate(data.state);
    } catch {
      // ignore
    }
    return;
  }

  // Local Mode County Click
  const selectorId = engine.currentSelector;
  if (!selectorId) return;
  const player = engine.players[selectorId];
  if (!player || !player.isHuman) return;

  if (engine.phase === PHASES.BASE_SELECTION) {
    const res = engine.selectBaseCounty(selectorId, countyId);
    if (!res.ok) {
      sound.playWrong();
      setOwlSpeech(res.reason);
      return;
    }
    sound.playCastleBuild();
    renderAll();
    proceedPhaseFlow();
    return;
  }

  if (engine.phase === PHASES.EXPANSION_SELECTION) {
    const res = engine.selectExpansionCounty(selectorId, countyId);
    if (!res.ok) {
      sound.playWrong();
      setOwlSpeech(res.reason);
      return;
    }
    sound.playClaim();
    renderAll();
    proceedPhaseFlow();
    return;
  }

  if (engine.phase === PHASES.BATTLE_SELECT_TARGET) {
    const res = engine.initiateAttack(selectorId, countyId);
    if (!res.ok) {
      sound.playWrong();
      setOwlSpeech(res.reason);
      return;
    }
    sound.playSwordClash();
    renderAll();
    openBattleMultipleChoiceModal();
  }
}

// ==================== LOCAL GAME FLOW ORCHESTRATION ====================
function proceedPhaseFlow() {
  if (onlineSession.active) return;
  renderAll();

  if (engine.phase === PHASES.BASE_QUESTION) {
    openEstimationModal(() => {
      engine.submitBaseQuestionAnswers(collectedSubmissions);
    });
    return;
  }

  if (engine.phase === PHASES.BASE_SELECTION) {
    const currentId = engine.currentSelector;
    const player = engine.players[currentId];
    if (player && !player.isHuman) {
      setOwlSpeech(`${player.name} gondolkodik, melyik vármegyében építse fel 3 tornyú fővárát...`);
      setTimeout(() => {
        const chosenId = engine.chooseAiBaseCounty(currentId);
        if (chosenId) {
          engine.selectBaseCounty(currentId, chosenId);
          sound.playCastleBuild();
          renderAll();
          proceedPhaseFlow();
        }
      }, 850);
    } else if (player) {
      setOwlSpeech(`${player.name}, kattints a térképen egy szabad vármegyére, ahová 3 tornyú főváradat (1000 pont) felépíted!`);
    }
    return;
  }

  if (engine.phase === PHASES.EXPANSION_QUESTION) {
    openEstimationModal(() => {
      engine.submitExpansionQuestionAnswers(collectedSubmissions);
    });
    return;
  }

  if (engine.phase === PHASES.EXPANSION_SELECTION) {
    const currentId = engine.currentSelector;
    const player = engine.players[currentId];
    if (player && !player.isHuman) {
      setOwlSpeech(`${player.name} új vármegyét csatol a birodalmához...`);
      setTimeout(() => {
        const chosenId = engine.chooseAiExpansionCounty(currentId);
        if (chosenId) {
          engine.selectExpansionCounty(currentId, chosenId);
          sound.playClaim();
          renderAll();
          proceedPhaseFlow();
        }
      }, 750);
    } else if (player) {
      setOwlSpeech(`${player.name}, válassz egy sárgán pulzáló, szomszédos szabad vármegyét (+200 pont)!`);
    }
    return;
  }

  if (engine.phase === PHASES.BATTLE_SELECT_TARGET) {
    const attackerId = engine.currentSelector;
    const attacker = engine.players[attackerId];
    if (attacker && !attacker.isHuman) {
      setOwlSpeech(`${attacker.name} célpontot keres a támadáshoz...`);
      setTimeout(() => {
        const targetCountyId = engine.chooseAiAttackTarget(attackerId);
        if (!targetCountyId) {
          engine.completeCurrentBattleTurn();
          proceedPhaseFlow();
          return;
        }
        const attackRes = engine.initiateAttack(attackerId, targetCountyId);
        if (!attackRes.ok) {
          engine.completeCurrentBattleTurn();
          proceedPhaseFlow();
          return;
        }
        sound.playSwordClash();
        renderAll();

        const defender = engine.players[engine.activeBattle.defenderId];
        if (!attacker.isHuman && !defender.isHuman) {
          resolveAiVsAiBattle();
        } else {
          openBattleMultipleChoiceModal();
        }
      }, 950);
    } else if (attacker) {
      setOwlSpeech(
        `⚔️ ${attacker.name} támad! Kattints egy sárgán keretezett, szomszédos ellenséges vármegyére vagy várra az ostromhoz!`
      );
    }
    return;
  }

  if (engine.phase === PHASES.GAME_OVER) {
    handleGameOver();
  }
}

function resolveAiVsAiBattle() {
  const { attackerId, defenderId } = engine.activeBattle;
  const q = engine.activeQuestion;
  const attSim = engine.simulateAiMultipleChoice(q);
  const defSim = engine.simulateAiMultipleChoice(q);

  const mcOutcome = engine.submitBattleMcAnswers({
    [attackerId]: attSim,
    [defenderId]: defSim
  });

  if (mcOutcome.status === 'TIEBREAKER') {
    const estQ = engine.activeQuestion;
    const attEst = engine.simulateAiEstimation(estQ);
    const defEst = engine.simulateAiEstimation(estQ);
    engine.submitBattleTiebreakerAnswers({
      [attackerId]: attEst,
      [defenderId]: defEst
    });
  }

  const outcome = engine.activeBattle.outcome;
  if (outcome?.towerDestroyed) sound.playTowerDestroy();
  else if (outcome?.attackerWon) sound.playClaim();

  setOwlSpeech(outcome ? outcome.message : 'Lezajlott a gépi vezérek csatája.');
  renderAll();

  setTimeout(() => {
    engine.completeCurrentBattleTurn();
    proceedPhaseFlow();
  }, 1100);
}

// ==================== LOCAL ESTIMATION QUESTION MODAL ====================
function openEstimationModal(onAllSubmitted) {
  const q = engine.activeQuestion;
  postEstimationCallback = onAllSubmitted;
  collectedSubmissions = {};

  const participants = q.participants || ['red', 'green', 'blue'];
  pendingParticipantQueue = [];

  for (const pid of participants) {
    const p = engine.players[pid];
    if (p && p.isHuman) {
      pendingParticipantQueue.push(pid);
    } else if (p) {
      collectedSubmissions[pid] = engine.simulateAiEstimation(q);
    }
  }

  document.getElementById('estCategoryBadge').textContent = q.category;
  document.getElementById('estContextLabel').textContent = q.contextLabel || 'Tippelős kérdés';
  document.getElementById('estQuestionText').textContent = q.question;
  document.getElementById('estUnitLabel').textContent = q.unit || '';

  document.getElementById('estInputSection').classList.remove('hidden');
  document.getElementById('estResultsSection').classList.add('hidden');
  document.getElementById('btnContinueAfterEst').textContent = 'Tovább a térképre ▶';
  el.estimationModal.classList.remove('hidden');

  startNextHumanEstimationTurn();
}

function startNextHumanEstimationTurn() {
  clearInterval(questionTimerId);

  if (pendingParticipantQueue.length === 0) {
    finalizeEstimationModal();
    return;
  }

  currentAnsweringPlayerId = pendingParticipantQueue.shift();
  const currentPlayer = engine.players[currentAnsweringPlayerId];
  const promptEl = document.getElementById('estTurnPrompt');

  if (engine.gameMode === 'passandplay') {
    promptEl.textContent = `🎯 Most ${currentPlayer.name} tippel! (A többiek ne nézzék a képernyőt!)`;
    promptEl.classList.remove('hidden');
  } else {
    promptEl.classList.add('hidden');
  }

  const displayInput = document.getElementById('estNumberDisplay');
  displayInput.value = '';
  setTimeout(() => displayInput.focus(), 60);

  questionTimeLeft = 15;
  questionStartTimeMs = Date.now();
  document.getElementById('estTimerValue').textContent = questionTimeLeft;

  questionTimerId = setInterval(() => {
    questionTimeLeft -= 1;
    document.getElementById('estTimerValue').textContent = Math.max(0, questionTimeLeft);
    if (questionTimeLeft <= 0) {
      clearInterval(questionTimerId);
      submitCurrentHumanEstimation();
    }
  }, 1000);
}

function submitCurrentHumanEstimation() {
  const rawVal = document.getElementById('estNumberDisplay').value.trim();
  const parsed = rawVal !== '' && Number.isFinite(Number(rawVal)) ? Number(rawVal) : null;

  if (onlineSession.active) {
    submitOnlineAnswer({ guess: parsed });
    return;
  }

  clearInterval(questionTimerId);
  if (!currentAnsweringPlayerId) return;

  const elapsedMs = Math.min(15000, Math.max(200, Date.now() - questionStartTimeMs));

  collectedSubmissions[currentAnsweringPlayerId] = {
    guess: parsed,
    timeMs: elapsedMs
  };
  sound.playClick();
  currentAnsweringPlayerId = null;
  startNextHumanEstimationTurn();
}

function finalizeEstimationModal() {
  clearInterval(questionTimerId);
  if (postEstimationCallback) {
    postEstimationCallback();
  }

  const q = engine.activeQuestion;
  const results = engine.lastQuestionResults || engine.activeBattle?.tiebreakerResults;
  document.getElementById('estInputSection').classList.add('hidden');
  document.getElementById('estTurnPrompt').classList.add('hidden');
  document.getElementById('estResultsSection').classList.remove('hidden');

  document.getElementById('estTruthValue').textContent = `${q.answer}${q.unit ? ' ' + q.unit : ''}`;

  const listEl = document.getElementById('estResultsList');
  listEl.innerHTML = '';

  if (results && Array.isArray(results.ranked)) {
    results.ranked.forEach((r, idx) => {
      const row = document.createElement('div');
      row.className = `est-rank-row ${idx === 0 ? 'est-rank-row--winner' : ''}`;
      const diffText = Number.isFinite(r.diff) ? `eltérés: ${r.diff}` : 'nem érkezett tipp';
      const secText = (r.timeMs / 1000).toFixed(1) + ' mp';
      row.innerHTML = `
        <div>
          <strong>${idx + 1}. ${r.playerName}</strong>
          <span style="margin-left:8px; color: var(--gold-bright);">Tipp: ${r.guess ?? '–'}</span>
        </div>
        <div style="font-size: 0.8rem; color: var(--text-muted);">
          ${diffText} • ⏱️ ${secText}
        </div>
      `;
      listEl.appendChild(row);
    });
  }

  sound.playCorrect();
  renderAll();
}

// ==================== LOCAL MULTIPLE-CHOICE BATTLE MODAL ====================
function openBattleMultipleChoiceModal() {
  const q = engine.activeQuestion;
  const battle = engine.activeBattle;
  const attacker = engine.players[battle.attackerId];
  const defender = engine.players[battle.defenderId];
  const county = engine.counties[battle.targetCountyId];

  collectedSubmissions = {};
  pendingParticipantQueue = [];

  for (const pid of [battle.attackerId, battle.defenderId]) {
    const p = engine.players[pid];
    if (p && p.isHuman) {
      pendingParticipantQueue.push(pid);
    } else if (p) {
      collectedSubmissions[pid] = engine.simulateAiMultipleChoice(q);
    }
  }

  document.getElementById('mcCategoryBadge').textContent = q.category;
  document.getElementById('mcContextLabel').textContent = `${county.name} vármegye ostroma`;
  document.getElementById('mcDuelBanner').innerHTML = `
    <span style="color: #fca5a5;">⚔️ Támadó: ${attacker.name}</span>
    <span>VS</span>
    <span style="color: #93c5fd;">🛡️ Védő: ${defender.name}</span>
  `;
  document.getElementById('mcQuestionText').textContent = q.question;
  document.getElementById('mcOwlPollBox').classList.add('hidden');
  document.getElementById('mcBattleSummary').classList.add('hidden');

  el.mcBattleModal.classList.remove('hidden');
  startNextHumanMcTurn();
}

function startNextHumanMcTurn() {
  clearInterval(questionTimerId);

  if (pendingParticipantQueue.length === 0) {
    finalizeBattleMcModal();
    return;
  }

  currentAnsweringPlayerId = pendingParticipantQueue.shift();
  const currentPlayer = engine.players[currentAnsweringPlayerId];
  const promptEl = document.getElementById('mcTurnPrompt');

  if (engine.gameMode === 'passandplay') {
    promptEl.textContent = `🎯 Most ${currentPlayer.name} válaszol!`;
    promptEl.classList.remove('hidden');
  } else {
    promptEl.classList.add('hidden');
  }

  renderLifelineButtonsForPlayer(currentPlayer);
  renderMcOptionButtons(false);

  questionTimeLeft = 15;
  questionStartTimeMs = Date.now();
  document.getElementById('mcTimerValue').textContent = questionTimeLeft;

  questionTimerId = setInterval(() => {
    questionTimeLeft -= 1;
    document.getElementById('mcTimerValue').textContent = Math.max(0, questionTimeLeft);
    if (questionTimeLeft <= 0) {
      clearInterval(questionTimerId);
      submitHumanMcAnswer(-1);
    }
  }, 1000);
}

function renderLifelineButtonsForPlayer(player) {
  const btnHalve = document.getElementById('btnLifelineHalve');
  const btnOwl = document.getElementById('btnLifelineOwl');
  const btnTime = document.getElementById('btnLifelineTime');

  btnHalve.disabled = !player?.lifelines?.halve;
  btnOwl.disabled = !player?.lifelines?.owl;
  btnTime.disabled = !player?.lifelines?.extraTime;
}

function renderMcOptionButtons(disabled = false) {
  const q = engine.activeQuestion;
  const grid = document.getElementById('mcOptionsGrid');
  grid.innerHTML = '';
  const letters = ['A', 'B', 'C', 'D'];

  q.options.forEach((optText, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mc-option-btn';
    btn.dataset.index = idx;
    btn.disabled = disabled;
    btn.innerHTML = `
      <span class="mc-option-letter">${letters[idx]}</span>
      <span>${optText}</span>
    `;
    btn.addEventListener('click', () => submitHumanMcAnswer(idx));
    grid.appendChild(btn);
  });
}

function submitHumanMcAnswer(choiceIndex) {
  clearInterval(questionTimerId);
  if (!currentAnsweringPlayerId) return;

  const elapsedMs = Math.min(15000, Math.max(200, Date.now() - questionStartTimeMs));
  collectedSubmissions[currentAnsweringPlayerId] = {
    choiceIndex,
    timeMs: elapsedMs
  };
  sound.playClick();
  currentAnsweringPlayerId = null;
  document.getElementById('mcOwlPollBox').classList.add('hidden');
  startNextHumanMcTurn();
}

function finalizeBattleMcModal() {
  clearInterval(questionTimerId);
  const q = engine.activeQuestion;
  const correctIdx = q.correctIndex;
  const { attackerId, defenderId } = engine.activeBattle;
  const attacker = engine.players[attackerId];
  const defender = engine.players[defenderId];

  const attChoice = collectedSubmissions[attackerId]?.choiceIndex ?? -1;
  const defChoice = collectedSubmissions[defenderId]?.choiceIndex ?? -1;

  const result = engine.submitBattleMcAnswers(collectedSubmissions);

  const buttons = document.querySelectorAll('#mcOptionsGrid .mc-option-btn');
  buttons.forEach((btn, idx) => {
    btn.disabled = true;
    if (idx === correctIdx) {
      btn.classList.add('mc-option-btn--correct');
    } else if (idx === attChoice || idx === defChoice) {
      btn.classList.add('mc-option-btn--wrong');
    }
  });

  const letters = ['A', 'B', 'C', 'D'];
  const attLetter = letters[attChoice] || '–';
  const defLetter = letters[defChoice] || '–';

  const summaryBox = document.getElementById('mcBattleSummary');
  const summaryText = document.getElementById('mcBattleSummaryText');
  const continueBtn = document.getElementById('btnContinueAfterMc');
  summaryBox.classList.remove('hidden');

  if (result.status === 'TIEBREAKER') {
    sound.playCorrect();
    summaryText.innerHTML = `
      <div style="font-weight:800; color: var(--gold-bright); margin-bottom:4px;">
        ⚔️ Mindkét vezér helyesen válaszolt (${letters[correctIdx]})!
      </div>
      <div>Most <strong>Tippelős Párbaj</strong> dönt a vármegye sorsáról!</div>
    `;
    continueBtn.textContent = 'Tovább a Tippelős Párbajra ▶';
    continueBtn.onclick = () => {
      el.mcBattleModal.classList.add('hidden');
      openEstimationModal(() => {
        engine.submitBattleTiebreakerAnswers(collectedSubmissions);
      });
    };
  } else {
    const outcome = engine.activeBattle.outcome;
    if (outcome?.towerDestroyed) sound.playTowerDestroy();
    else if (outcome?.attackerWon) sound.playCorrect();
    else sound.playWrong();

    summaryText.innerHTML = `
      <div style="margin-bottom:4px;">
        ${attacker.name} válasza: <strong>${attLetter}</strong> • ${defender.name} válasza: <strong>${defLetter}</strong>
      </div>
      <div style="font-weight:800; color: var(--gold-bright);">
        ${outcome?.message || ''}
      </div>
    `;
    continueBtn.textContent = 'Tovább a térképre ▶';
    continueBtn.onclick = () => {
      el.mcBattleModal.classList.add('hidden');
      engine.completeCurrentBattleTurn();
      renderAll();
      proceedPhaseFlow();
    };
  }

  renderAll();
}

// ==================== LIFELINES (SEGÍTSÉGEK) ====================
async function triggerLifeline(type) {
  if (onlineSession.active) {
    sound.playClick();
    await fetch(`/api/rooms/${onlineSession.code}/lifeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: onlineSession.token, lifeline: type })
    });
    return;
  }

  if (type === 'halve') useLifelineHalveLocal();
  else if (type === 'owl') useLifelineOwlLocal();
  else if (type === 'extraTime') useLifelineExtraTimeLocal();
}

function useLifelineHalveLocal() {
  if (!currentAnsweringPlayerId) return;
  const player = engine.players[currentAnsweringPlayerId];
  if (!player?.lifelines?.halve) return;

  player.lifelines.halve = false;
  sound.playClick();

  const correctIndex = engine.activeQuestion.correctIndex;
  const wrongIndices = [0, 1, 2, 3].filter(i => i !== correctIndex);
  wrongIndices.sort(() => Math.random() - 0.5);
  const toHide = wrongIndices.slice(0, 2);

  const buttons = document.querySelectorAll('#mcOptionsGrid .mc-option-btn');
  buttons.forEach((btn, idx) => {
    if (toHide.includes(idx)) {
      btn.classList.add('mc-option-btn--hidden-half');
      btn.disabled = true;
    }
  });

  renderLifelineButtonsForPlayer(player);
  renderPlayersPanel();
}

function useLifelineOwlLocal() {
  if (!currentAnsweringPlayerId) return;
  const player = engine.players[currentAnsweringPlayerId];
  if (!player?.lifelines?.owl) return;

  player.lifelines.owl = false;
  sound.playClick();

  const correctIndex = engine.activeQuestion.correctIndex;
  const letters = ['A', 'B', 'C', 'D'];
  const percentages = [10, 10, 10, 10];
  percentages[correctIndex] = 62 + Math.floor(Math.random() * 14);
  let rem = 100 - percentages[correctIndex];
  for (let i = 0; i < 4; i++) {
    if (i !== correctIndex) {
      const share = i === 3 ? rem : Math.floor(Math.random() * (rem + 1));
      percentages[i] = Math.max(0, share);
      rem -= share;
    }
  }

  const pollBox = document.getElementById('mcOwlPollBox');
  pollBox.innerHTML = `
    🦉 <strong>Tudós Bagoly javaslata:</strong>
    ${letters.map((L, idx) => `<span style="margin-left:10px;"><strong>${L}:</strong> ${percentages[idx]}%</span>`).join('')}
  `;
  pollBox.classList.remove('hidden');

  renderLifelineButtonsForPlayer(player);
  renderPlayersPanel();
}

function useLifelineExtraTimeLocal() {
  if (!currentAnsweringPlayerId) return;
  const player = engine.players[currentAnsweringPlayerId];
  if (!player?.lifelines?.extraTime) return;

  player.lifelines.extraTime = false;
  questionTimeLeft += 10;
  document.getElementById('mcTimerValue').textContent = questionTimeLeft;
  sound.playClick();

  renderLifelineButtonsForPlayer(player);
  renderPlayersPanel();
}

// ==================== GAME OVER & DATABASE MATCH RECORDING ====================
async function handleGameOver() {
  sound.playVictoryFanfare();
  const standings = engine.getStandings();
  const winner = standings[0];

  document.getElementById('victoryBanner').innerHTML = `
    <div style="font-size: 2rem;">👑</div>
    <div style="font-family: var(--font-display); font-size: 1.35rem; font-weight: 900; color: var(--gold-bright);">
      Győztes: ${winner.name}
    </div>
    <div style="font-size: 0.95rem; margin-top: 4px;">
      <strong>${winner.score} pont</strong> • ${winner.countiesCount} meghódított vármegye
    </div>
  `;

  const podiumEl = document.getElementById('victoryPodiumList');
  podiumEl.innerHTML = '';
  const medals = ['🥇 1. hely', '🥈 2. hely', '🥉 3. hely'];

  standings.forEach((p, idx) => {
    const row = document.createElement('div');
    row.className = `est-rank-row ${idx === 0 ? 'est-rank-row--winner' : ''}`;
    row.innerHTML = `
      <div>
        <strong>${medals[idx]}: ${p.name}</strong>
      </div>
      <div>
        <strong>${p.score} pont</strong> (${p.countiesCount} megye • ${p.correctAnswers}/${p.totalAnswers} jó válasz)
      </div>
    `;
    podiumEl.appendChild(row);
  });

  el.gameOverModal.classList.remove('hidden');

  try {
    await fetch('/api/matches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        winnerName: winner.name,
        gameMode: engine.gameMode,
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
    await syncWithBackend();
  } catch {
    // Non-blocking
  }
}

// ==================== UI RENDERING ====================
function renderAll() {
  renderTopBar();
  renderPlayersPanel();
  updateMapVisuals();
  renderChronicle();
}

function renderTopBar() {
  const freeCount = Object.values(engine.counties).filter(c => c.owner === null).length;
  el.freeCountiesIndicator.textContent = `${freeCount} szabad megye`;

  const onlineTag = onlineSession.active ? `[🌐 SZOBA: ${onlineSession.code}] ` : '';

  switch (engine.phase) {
    case PHASES.LOBBY:
      el.phaseBadge.textContent = onlineSession.active ? `ONLINE VÁRÓTEREM (${onlineSession.code})` : 'ELŐKÉSZÜLET';
      el.phaseInstruction.textContent = onlineSession.active
        ? 'Hívd meg a többi vezért a szobakóddal vagy a meghívó linkkel!'
        : 'Állítsd be a hadjáratot és hódítsd meg Magyarország 19 vármegyéjét!';
      el.roundCounterBadge.textContent = onlineSession.active ? `Szoba: ${onlineSession.code}` : 'Előkészület';
      el.mapActionStatus.textContent = el.phaseInstruction.textContent;
      break;
    case PHASES.BASE_QUESTION:
    case PHASES.BASE_SELECTION: {
      el.phaseBadge.textContent = `${onlineTag}1. FÁZIS: VÁRALAPÍTÁS`;
      const cur = engine.players[engine.currentSelector];
      el.phaseInstruction.textContent = cur
        ? `${cur.name} választ vármegyét a 3 tornyú fővárának (1000 pont)!`
        : 'Tippelős kérdés a váralapítás sorrendjéért!';
      el.roundCounterBadge.textContent = '1. Fázis – Bázisépítés';
      el.mapActionStatus.textContent = el.phaseInstruction.textContent;
      break;
    }
    case PHASES.EXPANSION_QUESTION:
    case PHASES.EXPANSION_SELECTION: {
      el.phaseBadge.textContent = `${onlineTag}2. FÁZIS: TERJESZKEDÉS`;
      const cur = engine.players[engine.currentSelector];
      el.phaseInstruction.textContent = cur
        ? `${cur.name} foglalhat szomszédos szabad vármegyét (+200 pont)!`
        : `Tippelős kérdés a szabad vármegyékért (${freeCount} szabad megye maradt)!`;
      el.roundCounterBadge.textContent = `2. Fázis (${freeCount} szabad megye)`;
      el.mapActionStatus.textContent = el.phaseInstruction.textContent;
      break;
    }
    case PHASES.BATTLE_SELECT_TARGET:
    case PHASES.BATTLE_MC_QUESTION:
    case PHASES.BATTLE_TIEBREAKER_QUESTION: {
      el.phaseBadge.textContent = `${onlineTag}3. FÁZIS: HARC (${engine.currentBattleRound}/${engine.maxBattleRounds}. KÖR)`;
      const cur = engine.players[engine.currentSelector];
      el.phaseInstruction.textContent = cur
        ? `⚔️ ${cur.name} támad! Válassz szomszédos ellenséges vármegyét az ostromhoz!`
        : 'Harci összecsapás folyamatban!';
      el.roundCounterBadge.textContent = `Harc: ${engine.currentBattleRound} / ${engine.maxBattleRounds}. kör`;
      el.mapActionStatus.textContent = el.phaseInstruction.textContent;
      break;
    }
    case PHASES.GAME_OVER: {
      const winner = engine.getStandings()[0];
      el.phaseBadge.textContent = `${onlineTag}GYŐZELEM`;
      el.phaseInstruction.textContent = `👑 A hadjárat győztese: ${winner.name} (${winner.score} pont)!`;
      el.roundCounterBadge.textContent = 'Játék vége';
      el.mapActionStatus.textContent = el.phaseInstruction.textContent;
      break;
    }
  }
}

function renderPlayersPanel() {
  el.playersPanel.innerHTML = '';
  const shieldIcons = { red: '🦅', green: '🦌', blue: '🐺' };

  for (const id of ['red', 'green', 'blue']) {
    const p = engine.players[id];
    const isActive = engine.currentSelector === id;
    const isMeOnline = onlineSession.active && onlineSession.myColor === id;
    const baseCounty = p.baseCountyId ? engine.counties[p.baseCountyId] : null;
    const towersInfo = baseCounty && baseCounty.owner === id && baseCounty.isBase
      ? `🏰 ${baseCounty.towers} torony`
      : p.eliminated
        ? '💀 Kiesett'
        : '🏰 –';

    const card = document.createElement('div');
    card.className = [
      'player-card',
      isActive ? 'player-card--active' : '',
      p.eliminated ? 'player-card--eliminated' : ''
    ].join(' ');

    card.innerHTML = `
      <div class="player-card__top">
        <div class="player-card__identity">
          <div class="player-shield player-shield--${id}">${shieldIcons[id]}</div>
          <div>
            <div class="player-card__name">${p.name} ${isMeOnline ? '⭐(Te)' : ''}</div>
            <div class="player-card__role">${p.title || (p.isHuman ? 'Honfoglaló Vitéz' : 'Gépi Vezér')} • ${towersInfo}</div>
          </div>
        </div>
        <div class="player-card__score">${p.score} p</div>
      </div>
      <div class="player-card__stats">
        <span>🗺️ <strong>${p.countiesCount}</strong> vármegye</span>
        <span>🎯 ${p.correctAnswers}/${p.totalAnswers}</span>
        <div class="player-card__lifelines">
          <span class="lifeline-pip ${p.lifelines?.halve ? '' : 'lifeline-pip--used'}" title="Felező">50:50</span>
          <span class="lifeline-pip ${p.lifelines?.owl ? '' : 'lifeline-pip--used'}" title="Bagoly súgása">🦉</span>
          <span class="lifeline-pip ${p.lifelines?.extraTime ? '' : 'lifeline-pip--used'}" title="+10 mp">⏳</span>
        </div>
      </div>
    `;
    el.playersPanel.appendChild(card);
  }
}

function renderChronicle() {
  el.chronicleList.innerHTML = '';
  for (const item of engine.chronicle) {
    const div = document.createElement('div');
    div.className = `chronicle-item chronicle-item--${item.type}`;
    div.innerHTML = `<span class="chronicle-item__time">[${item.time}]</span>${item.message}`;
    el.chronicleList.appendChild(div);
  }
}

function setOwlSpeech(text) {
  el.owlSpeech.textContent = text;
}

// ==================== LEADERBOARD, AUTH & QUESTION BANK MODALS ====================
async function openLeaderboardModal() {
  el.leaderboardModal.classList.remove('hidden');
  const tbodyUsers = document.getElementById('leaderboardTableBody');
  const tbodyMatches = document.getElementById('matchesTableBody');
  tbodyUsers.innerHTML = '<tr><td colspan="7">Betöltés az adatbázisból...</td></tr>';
  tbodyMatches.innerHTML = '<tr><td colspan="5">Betöltés...</td></tr>';

  try {
    const [uRes, mRes] = await Promise.all([
      fetch('/api/users'),
      fetch('/api/matches')
    ]);
    const uData = await uRes.json();
    const mData = await mRes.json();

    tbodyUsers.innerHTML = '';
    (uData.users || []).forEach((u, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${idx + 1}.</strong></td>
        <td><strong>${u.username}</strong></td>
        <td>${u.title || 'Vitéz'}</td>
        <td>${u.games_won} / ${u.games_played}</td>
        <td style="color: var(--gold-bright); font-weight: 800;">${u.total_points} p</td>
        <td>${u.counties_conquered}</td>
        <td>${u.correct_answers} / ${u.total_answers}</td>
      `;
      tbodyUsers.appendChild(tr);
    });

    tbodyMatches.innerHTML = '';
    const matches = mData.matches || [];
    if (matches.length === 0) {
      tbodyMatches.innerHTML = '<tr><td colspan="5">Még nincs befejezett mérkőzés az adatbázisban.</td></tr>';
    } else {
      matches.forEach(m => {
        const tr = document.createElement('tr');
        const dateStr = m.played_at ? new Date(m.played_at).toLocaleString('hu-HU') : '';
        tr.innerHTML = `
          <td><strong style="color: var(--gold-bright);">👑 ${m.winner_name}</strong></td>
          <td>${m.red_player} (${m.red_score}p)</td>
          <td>${m.green_player} (${m.green_score}p)</td>
          <td>${m.blue_player} (${m.blue_score}p)</td>
          <td>${dateStr}</td>
        `;
        tbodyMatches.appendChild(tr);
      });
    }
  } catch {
    tbodyUsers.innerHTML = '<tr><td colspan="7">Nem sikerült betölteni a ranglistát.</td></tr>';
  }
}

async function openQuestionBankModal() {
  el.questionBankModal.classList.remove('hidden');
  await refreshQuestionBankList();
}

async function refreshQuestionBankList() {
  try {
    const res = await fetch('/api/questions');
    if (res.ok) {
      allDbQuestions = await res.json();
      engine.setQuestionDatabase(allDbQuestions);
    }
  } catch {
    // ignore
  }
  renderQuestionBankItems();
}

function renderQuestionBankItems() {
  const searchVal = (document.getElementById('qSearchInput').value || '').toLowerCase().trim();
  const combined = [
    ...(allDbQuestions.multipleChoice || []).map(q => ({ ...q, qType: 'multiple_choice' })),
    ...(allDbQuestions.estimation || []).map(q => ({ ...q, qType: 'estimation' }))
  ];

  const filtered = combined.filter(q =>
    !searchVal ||
    q.question.toLowerCase().includes(searchVal) ||
    q.category.toLowerCase().includes(searchVal)
  );

  document.getElementById('qBankCountSummary').textContent =
    `Összesen: ${combined.length} kérdés (${allDbQuestions.multipleChoice?.length || 0} feleletválasztós, ${allDbQuestions.estimation?.length || 0} tippelős)`;

  const listEl = document.getElementById('qBankItemsList');
  listEl.innerHTML = '';

  filtered.slice(0, 60).forEach(q => {
    const item = document.createElement('div');
    item.className = 'qbank-item';
    const ansInfo = q.qType === 'estimation'
      ? `Pontos válasz: <strong>${q.answer} ${q.unit || ''}</strong>`
      : `Helyes: <strong>${q.options?.[q.correctIndex] || ''}</strong>`;
    item.innerHTML = `
      <div>
        <div style="color: var(--gold-bright); font-size: 0.72rem; font-weight: 800;">
          [${q.qType === 'estimation' ? 'Tippelős' : 'Feleletválasztós'} • ${q.category}]
        </div>
        <div style="font-weight: 700; margin: 2px 0;">${q.question}</div>
        <div style="font-size: 0.75rem; color: var(--text-muted);">${ansInfo}</div>
      </div>
    `;
    if (q.dbId) {
      const delBtn = document.createElement('button');
      delBtn.className = 'medieval-btn medieval-btn--sm';
      delBtn.textContent = '🗑️';
      delBtn.title = 'Kérdés törlése az adatbázisból';
      delBtn.onclick = async () => {
        await fetch(`/api/questions/${q.dbId}`, { method: 'DELETE' });
        await refreshQuestionBankList();
        await syncWithBackend();
      };
      item.appendChild(delBtn);
    }
    listEl.appendChild(item);
  });
}

function openAuthModal() {
  el.authModal.classList.remove('hidden');
  renderAuthModalState();
}

function renderAuthQuickLoginChips() {
  const container = document.getElementById('authQuickLoginChips');
  if (!container) return;
  container.innerHTML = '';

  const defaultPassMap = {
    'árpád vezér': 'arpad123',
    'hunyadi mátyás': 'matyas123',
    'koppány vezér': 'koppany123',
    'zrínyi ilona': 'ilona123'
  };

  registeredUsers.forEach(u => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'medieval-btn medieval-btn--sm';
    btn.textContent = `👑 ${u.username}`;
    btn.title = `${u.title || 'Vitéz'} (${u.email})`;
    btn.onclick = () => {
      document.getElementById('loginUsername').value = u.username;
      const knownPw = defaultPassMap[u.username.toLowerCase()];
      if (knownPw) {
        document.getElementById('loginPassword').value = knownPw;
      } else {
        document.getElementById('loginPassword').focus();
      }
    };
    container.appendChild(btn);
  });
}

function renderAuthModalState() {
  const profileBox = document.getElementById('loggedInProfileBox');
  const formsBox = document.getElementById('authFormsBox');
  renderAuthQuickLoginChips();

  if (currentUser) {
    formsBox.classList.add('hidden');
    profileBox.classList.remove('hidden');
    profileBox.innerHTML = `
      <div style="background: rgba(0,0,0,0.35); border: 1px solid var(--gold-mid); border-radius: 10px; padding: 14px; text-align: center;">
        <div style="font-size: 2rem;">👑</div>
        <h3 style="font-family: var(--font-display); color: var(--gold-bright);">${currentUser.username}</h3>
        <div style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 10px;">${currentUser.title || 'Honfoglaló Vitéz'} (${currentUser.email})</div>
        <div style="margin-bottom: 14px; font-size: 0.88rem;">
          Győzelmek: <strong>${currentUser.games_won || 0} / ${currentUser.games_played || 0}</strong> •
          Összpontszám: <strong>${currentUser.total_points || 0} p</strong>
        </div>
        <div style="display:flex; justify-content:center; gap:10px;">
          <button type="button" class="medieval-btn medieval-btn--gold" id="btnContinueAsCurrentUser">✔ Játék ezzel a Vezérrel</button>
          <button type="button" class="medieval-btn" id="btnLogoutUser">🔄 Másik Vezér / Új Regisztráció</button>
        </div>
      </div>
    `;
    document.getElementById('btnContinueAsCurrentUser').onclick = () => {
      el.authModal.classList.add('hidden');
    };
    document.getElementById('btnLogoutUser').onclick = () => {
      saveCurrentUser(null);
      renderAuthModalState();
      renderAll();
    };
  } else {
    profileBox.classList.add('hidden');
    formsBox.classList.remove('hidden');
  }
}

// ==================== EVENT BINDINGS ====================
function bindGlobalEvents() {
  // Lobby Tabs (Online vs Local)
  const tabOnline = document.getElementById('tabLobbyOnline');
  const tabLocal = document.getElementById('tabLobbyLocal');
  const paneOnline = document.getElementById('lobbyOnlinePane');
  const paneLocal = document.getElementById('lobbyLocalPane');

  tabOnline.addEventListener('click', () => {
    tabOnline.classList.add('active');
    tabLocal.classList.remove('active');
    paneOnline.classList.remove('hidden');
    paneLocal.classList.add('hidden');
  });

  tabLocal.addEventListener('click', () => {
    tabLocal.classList.add('active');
    tabOnline.classList.remove('active');
    paneLocal.classList.remove('hidden');
    paneOnline.classList.add('hidden');
  });

  // Switch account & Direct Invite Toast buttons
  document.getElementById('btnSwitchAccountInLobby')?.addEventListener('click', () => {
    openAuthModal();
  });

  document.getElementById('btnAcceptDirectInvite')?.addEventListener('click', async () => {
    if (!activeDirectInvite) return;
    const code = activeDirectInvite.roomCode;
    document.getElementById('incomingInviteToast').classList.add('hidden');
    document.getElementById('inputJoinRoomCode').value = code;
    await joinOnlineRoomByCode(code);
  });

  document.getElementById('btnDismissDirectInvite')?.addEventListener('click', async () => {
    if (!activeDirectInvite || !currentUser) return;
    const code = activeDirectInvite.roomCode;
    activeDirectInvite = null;
    document.getElementById('incomingInviteToast').classList.add('hidden');
    await fetch('/api/invites/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUser.username, roomCode: code })
    });
  });

  // Online Room Buttons
  document.getElementById('btnCreateOnlineRoom').addEventListener('click', () => {
    sound.init();
    createOnlineRoom();
  });

  document.getElementById('btnJoinOnlineRoom').addEventListener('click', () => {
    sound.init();
    joinOnlineRoomByCode();
  });

  document.getElementById('btnCopyInviteLink').addEventListener('click', async e => {
    const linkInput = document.getElementById('waitingRoomLinkInput');
    linkInput.select();
    try {
      await navigator.clipboard.writeText(linkInput.value);
      const btn = e.currentTarget;
      const orig = btn.textContent;
      btn.textContent = '✔ Meghívó Link Másolva!';
      setTimeout(() => {
        btn.textContent = orig;
      }, 2000);
    } catch {
      document.execCommand('copy');
    }
  });

  document.getElementById('btnLeaveOnlineRoom').addEventListener('click', () => {
    leaveOnlineSession(true);
    engine.resetState();
    renderAll();
  });

  document.getElementById('btnStartOnlineMatch').addEventListener('click', async () => {
    if (!onlineSession.active) return;
    sound.init();
    const res = await fetch(`/api/rooms/${onlineSession.code}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: onlineSession.token,
        maxBattleRounds: Number(document.getElementById('selectOnlineRounds').value) || 6,
        aiDifficulty: document.getElementById('selectOnlineAiDiff').value || 'normal'
      })
    });
    const data = await res.json();
    if (res.ok && data.state) {
      el.lobbyModal.classList.add('hidden');
      handleOnlineStateUpdate(data.state);
    }
  });

  // Local Game Mode selector
  document.getElementById('selectGameMode').addEventListener('change', e => {
    const isPass = e.target.value === 'passandplay';
    document.getElementById('aiDifficultyGroup').style.display = isPass ? 'none' : 'flex';
    document.getElementById('labelGreenRole').textContent = isPass ? '🟢 Zöld Vezér (2. Játékos)' : '🟢 Zöld Vezér (AI)';
    document.getElementById('labelBlueRole').textContent = isPass ? '🔵 Kék Vezér (3. Játékos)' : '🔵 Kék Vezér (AI)';
  });

  // Start Local Game button
  document.getElementById('btnStartGameConfirm').addEventListener('click', () => {
    if (!currentUser) {
      openAuthModal();
      return;
    }
    leaveOnlineSession(true);
    sound.init();
    sound.playCastleBuild();
    el.lobbyModal.classList.add('hidden');

    const redName = document.getElementById('inputRedName').value.trim() || currentUser.username;
    const greenName = document.getElementById('inputGreenName').value.trim() || 'Hunyadi Mátyás';
    const blueName = document.getElementById('inputBlueName').value.trim() || 'Koppány Vezér';
    const gameMode = document.getElementById('selectGameMode').value;
    const aiDifficulty = document.getElementById('selectAiDifficulty').value;
    const maxBattleRounds = Number(document.getElementById('selectBattleRounds').value) || 6;

    engine.startNewGame({ redName, greenName, blueName, gameMode, aiDifficulty, maxBattleRounds });
    for (const color of ['red', 'green', 'blue']) {
      const p = engine.players[color];
      const regMatch = registeredUsers.find(u => u.username.toLowerCase() === p.name.toLowerCase());
      if (regMatch) {
        p.title = regMatch.title || 'Honfoglaló Vitéz';
      }
    }
    renderAll();
    proceedPhaseFlow();
  });

  document.getElementById('btnCloseLobby').addEventListener('click', () => {
    el.lobbyModal.classList.add('hidden');
  });

  document.getElementById('btnNewCampaign').addEventListener('click', () => {
    el.lobbyModal.classList.remove('hidden');
  });

  document.getElementById('btnQuickStart').addEventListener('click', () => {
    el.lobbyModal.classList.remove('hidden');
  });

  document.getElementById('btnLogoHome').addEventListener('click', () => {
    el.lobbyModal.classList.remove('hidden');
  });

  // Sound toggle
  document.getElementById('btnToggleSound').addEventListener('click', e => {
    const muted = sound.toggleMute();
    e.currentTarget.textContent = muted ? '🔇' : '🔊';
  });

  // Topbar Modals
  document.getElementById('btnOpenLeaderboard').addEventListener('click', openLeaderboardModal);
  document.getElementById('btnOpenQuestionBank').addEventListener('click', openQuestionBankModal);
  document.getElementById('btnOpenAuth').addEventListener('click', openAuthModal);
  document.getElementById('btnOpenRules').addEventListener('click', () => {
    el.rulesModal.classList.remove('hidden');
  });

  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-close');
      document.getElementById(targetId)?.classList.add('hidden');
    });
  });

  // Quick Taunts & Custom Chat
  document.querySelectorAll('.taunt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const msg = btn.getAttribute('data-msg');
      sendChatOrTaunt(msg);
    });
  });

  document.getElementById('chronicleChatForm').addEventListener('submit', e => {
    e.preventDefault();
    const input = document.getElementById('chronicleChatInput');
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';
    sendChatOrTaunt(msg);
  });

  // Estimation Number Pad
  document.querySelectorAll('.keypad-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-key');
      const input = document.getElementById('estNumberDisplay');
      sound.playClick();
      if (key === 'CLEAR') {
        input.value = '';
      } else if (key === 'BACK') {
        input.value = input.value.slice(0, -1);
      } else if (input.value.length < 9) {
        input.value += key;
      }
      input.focus();
    });
  });

  document.getElementById('estNumberDisplay').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitCurrentHumanEstimation();
    }
  });

  document.getElementById('btnSubmitEstimation').addEventListener('click', () => {
    submitCurrentHumanEstimation();
  });

  document.getElementById('btnContinueAfterEst').addEventListener('click', () => {
    if (onlineSession.active) {
      el.estimationModal.classList.add('hidden');
      return;
    }
    el.estimationModal.classList.add('hidden');
    if (engine.phase === PHASES.BATTLE_TIEBREAKER_QUESTION || engine.activeBattle?.tiebreakerResults) {
      const outcome = engine.activeBattle?.outcome;
      if (outcome) setOwlSpeech(outcome.message);
      engine.completeCurrentBattleTurn();
    }
    renderAll();
    proceedPhaseFlow();
  });

  // Lifelines
  document.getElementById('btnLifelineHalve').addEventListener('click', () => triggerLifeline('halve'));
  document.getElementById('btnLifelineOwl').addEventListener('click', () => triggerLifeline('owl'));
  document.getElementById('btnLifelineTime').addEventListener('click', () => triggerLifeline('extraTime'));

  // Game Over modal buttons
  document.getElementById('btnCloseGameOver').addEventListener('click', () => {
    el.gameOverModal.classList.add('hidden');
  });
  document.getElementById('btnViewMapAfterGame').addEventListener('click', () => {
    el.gameOverModal.classList.add('hidden');
  });
  document.getElementById('btnPlayAgain').addEventListener('click', () => {
    el.gameOverModal.classList.add('hidden');
    el.lobbyModal.classList.remove('hidden');
  });

  // Auth Tabs & Forms
  const tabLogin = document.getElementById('tabBtnLogin');
  const tabReg = document.getElementById('tabBtnRegister');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');

  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabReg.classList.remove('active');
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
  });

  tabReg.addEventListener('click', () => {
    tabReg.classList.add('active');
    tabLogin.classList.remove('active');
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
  });

  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    const errEl = document.getElementById('loginError');
    errEl.classList.add('hidden');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: document.getElementById('loginUsername').value,
          password: document.getElementById('loginPassword').value
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sikertelen belépés');
      saveCurrentUser(data.user);
      await syncWithBackend();
      renderAuthModalState();
      el.authModal.classList.add('hidden');
      renderAll();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });

  registerForm.addEventListener('submit', async e => {
    e.preventDefault();
    const errEl = document.getElementById('regError');
    errEl.classList.add('hidden');
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: document.getElementById('regUsername').value,
          email: document.getElementById('regEmail').value,
          title: document.getElementById('regTitle').value,
          password: document.getElementById('regPassword').value
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sikertelen regisztráció');
      saveCurrentUser(data.user);
      await syncWithBackend();
      renderAuthModalState();
      el.authModal.classList.add('hidden');
      renderAll();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });

  // Question Bank Form
  document.getElementById('qTypeSelect').addEventListener('change', e => {
    const isEst = e.target.value === 'estimation';
    document.getElementById('qMcFields').classList.toggle('hidden', isEst);
    document.getElementById('qEstFields').classList.toggle('hidden', !isEst);
  });

  document.getElementById('qSearchInput').addEventListener('input', renderQuestionBankItems);

  document.getElementById('addQuestionForm').addEventListener('submit', async e => {
    e.preventDefault();
    const feedback = document.getElementById('qFormFeedback');
    feedback.classList.add('hidden');

    const type = document.getElementById('qTypeSelect').value;
    const category = document.getElementById('qCategorySelect').value;
    const question = document.getElementById('qTextInput').value;

    const payload = {
      type,
      category,
      question,
      createdBy: currentUser?.username || 'Vezér'
    };

    if (type === 'multiple_choice') {
      payload.options = [
        document.getElementById('qOpt0').value,
        document.getElementById('qOpt1').value,
        document.getElementById('qOpt2').value,
        document.getElementById('qOpt3').value
      ];
      payload.correctIndex = 0;
    } else {
      payload.answer = Number(document.getElementById('qEstAnswer').value);
      payload.unit = document.getElementById('qEstUnit').value;
    }

    try {
      const res = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Hiba a mentés során');
      document.getElementById('qTextInput').value = '';
      document.getElementById('qOpt0').value = '';
      document.getElementById('qOpt1').value = '';
      document.getElementById('qOpt2').value = '';
      document.getElementById('qOpt3').value = '';
      document.getElementById('qEstAnswer').value = '';
      document.getElementById('qEstUnit').value = '';
      await refreshQuestionBankList();
      await syncWithBackend();
    } catch (err) {
      feedback.textContent = err.message;
      feedback.classList.remove('hidden');
    }
  });
}

async function sendChatOrTaunt(msg) {
  sound.playClick();
  if (onlineSession.active) {
    try {
      await fetch(`/api/rooms/${onlineSession.code}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: onlineSession.token, message: msg })
      });
    } catch {
      // ignore
    }
  } else {
    const sender = engine.players.red?.name || 'Piros Vezér';
    engine.logEvent(`💬 ${sender}: „${msg}”`, 'chat');
    renderChronicle();
  }
}

initApp();
