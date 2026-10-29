// Portal & Lobby Controller (index.html) – Hardened Auth, Email Verification, CAPTCHA & Admin Panel

let currentUser = null;
let currentAuthToken = null;
let sessionExpiryTimer = null;
let lastActivitySave = 0;
const SESSION_TTL_MS = 15 * 60 * 1000; // auto-logout after 15 min of inactivity
const REMEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000; // "stay logged in" duration
const ACTIVITY_SAVE_THROTTLE_MS = 10 * 1000;

function isRememberedSession() {
  return sessionStorage.getItem('honfoglalo_remember') === '1' || localStorage.getItem('honfoglalo_remember') === '1';
}

function getSessionTtl() {
  return isRememberedSession() ? REMEMBER_TTL_MS : SESSION_TTL_MS;
}

// --- saved login credentials (browser-local, obfuscated — "jelszó megjegyzése") ---
function saveLoginCredentials(username, password) {
  try {
    localStorage.setItem('honfoglalo_saved_login', JSON.stringify({
      u: username,
      p: btoa(unescape(encodeURIComponent(password)))
    }));
  } catch { /* storage unavailable */ }
}

function loadLoginCredentials() {
  try {
    const raw = localStorage.getItem('honfoglalo_saved_login');
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || !d.u) return null;
    return { username: d.u, password: decodeURIComponent(escape(atob(d.p || ''))) };
  } catch {
    return null;
  }
}

function clearLoginCredentials() {
  localStorage.removeItem('honfoglalo_saved_login');
}
let registeredUsers = [];
let adminQuestions = { pending: [], approved: [] };
let adminUsers = [];
let mySubmittedQuestions = [];
let pendingInvite = null;

const lobbySession = {
  active: false,
  code: null,
  token: null,
  myColor: null,
  isHost: false,
  sse: null,
  pollTimer: null,
  openedGameWindowForCode: null
};

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getAuthHeaders(extra = {}) {
  const headers = { ...extra };
  if (currentAuthToken) {
    headers['Authorization'] = `Bearer ${currentAuthToken}`;
  }
  return headers;
}

async function initPortal() {
  loadUserFromStorage();
  bindPortalEvents();
  bindActivityTracking();
  await syncPortalData();
  renderAuthGate();
  checkUrlQueryParams();
  startInvitePolling();
  setInterval(refreshLiveStats, 4000);
}

function clearStoredSession() {
  ['honfoglalo_user', 'honfoglalo_token', 'honfoglalo_login_at', 'honfoglalo_activity_at', 'honfoglalo_remember'].forEach(k => {
    sessionStorage.removeItem(k);
    localStorage.removeItem(k);
  });
}

function getStoredActivityAt() {
  return Number(
    sessionStorage.getItem('honfoglalo_activity_at') ||
    localStorage.getItem('honfoglalo_activity_at') || 0
  );
}

function scheduleSessionExpiry(activityAt) {
  if (sessionExpiryTimer) clearTimeout(sessionExpiryTimer);
  const remaining = getSessionTtl() - (Date.now() - activityAt);
  if (remaining > 0) {
    sessionExpiryTimer = setTimeout(() => setLoggedInUser(null, null), remaining);
  }
}

// Sliding window: any interaction resets the 15-minute inactivity timer
function onUserActivity() {
  if (!currentUser) return;
  const now = Date.now();
  scheduleSessionExpiry(now);
  if (now - lastActivitySave >= ACTIVITY_SAVE_THROTTLE_MS) {
    lastActivitySave = now;
    const isAdmin = Boolean(currentUser.isAdmin || currentUser.username === 'admin_user');
    sessionStorage.setItem('honfoglalo_activity_at', String(now));
    if (!isAdmin || isRememberedSession()) localStorage.setItem('honfoglalo_activity_at', String(now));
  }
}

function bindActivityTracking() {
  ['click', 'keydown', 'mousemove', 'touchstart', 'scroll'].forEach(evt =>
    window.addEventListener(evt, onUserActivity, { passive: true })
  );
}

function loadUserFromStorage() {
  try {
    const raw = sessionStorage.getItem('honfoglalo_user') || localStorage.getItem('honfoglalo_user');
    const tok = sessionStorage.getItem('honfoglalo_token') || localStorage.getItem('honfoglalo_token');
    const activityAt = getStoredActivityAt();
    if (raw && activityAt && Date.now() - activityAt <= getSessionTtl()) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.username) {
        currentUser = parsed;
        currentAuthToken = tok || null;
        lastActivitySave = activityAt;
        scheduleSessionExpiry(activityAt);
        return;
      }
    }
    clearStoredSession();
    currentUser = null;
    currentAuthToken = null;
  } catch {
    currentUser = null;
    currentAuthToken = null;
  }
}

function setLoggedInUser(user, authToken = null, remember = false) {
  currentUser = user;
  currentAuthToken = authToken;
  clearStoredSession();
  if (sessionExpiryTimer) clearTimeout(sessionExpiryTimer);
  if (user) {
    const payload = JSON.stringify(user);
    const now = String(Date.now());
    const isAdmin = Boolean(user.isAdmin || user.username === 'admin_user');
    // Admin session is tab-scoped (sessionStorage) unless "stay logged in" was chosen;
    // regular users persist in localStorage either way
    sessionStorage.setItem('honfoglalo_user', payload);
    sessionStorage.setItem('honfoglalo_activity_at', now);
    sessionStorage.setItem('honfoglalo_remember', remember ? '1' : '0');
    if (!isAdmin || remember) {
      localStorage.setItem('honfoglalo_user', payload);
      localStorage.setItem('honfoglalo_activity_at', now);
      localStorage.setItem('honfoglalo_remember', remember ? '1' : '0');
    }
    lastActivitySave = Date.now();
    if (authToken) {
      sessionStorage.setItem('honfoglalo_token', authToken);
      if (!isAdmin || remember) localStorage.setItem('honfoglalo_token', authToken);
    }
    scheduleSessionExpiry(Date.now());
  }
  renderAuthGate();
}

function getRecaptchaResponse() {
  try {
    return window.grecaptcha ? window.grecaptcha.getResponse() : '';
  } catch {
    return '';
  }
}

function resetRecaptcha() {
  try {
    if (window.grecaptcha) window.grecaptcha.reset();
  } catch {
    // ignore
  }
}

function openEmailVerificationView(emailAddress, customNotice = null) {
  document.getElementById('loginForm').classList.add('hidden');
  document.getElementById('registerForm').classList.add('hidden');
  document.getElementById('forgotPasswordForm')?.classList.add('hidden');
  const vForm = document.getElementById('verifyEmailForm');
  vForm.classList.remove('hidden');

  document.getElementById('verifyEmailAddress').value = emailAddress || '';
  document.getElementById('verifyCodeInput').value = '';
  const errEl = document.getElementById('verifyError');
  errEl.classList.add('hidden');

  if (customNotice) {
    document.getElementById('verifyEmailPromptText').textContent = customNotice;
  }
  setTimeout(() => document.getElementById('verifyCodeInput')?.focus(), 50);
}

function renderAuthGate() {
  const guestSec = document.getElementById('guestGateSection');
  const dashSec = document.getElementById('portalDashboardSection');
  const navUser = document.getElementById('navUserSection');

  const navBtnAdminQ = document.getElementById('navBtnAdminQuestions');
  const navBtnAdminU = document.getElementById('navBtnAdminUsers');
  const navBtnSubmitQ = document.getElementById('navBtnSubmitQuestion');

  if (!currentUser) {
    guestSec.classList.remove('hidden');
    dashSec.classList.add('hidden');
    navUser.classList.add('hidden');
    const saved = loadLoginCredentials();
    document.getElementById('loginUsername').value = saved?.username || '';
    document.getElementById('loginPassword').value = saved?.password || '';
    const rememberCb = document.getElementById('loginRememberMe');
    if (rememberCb) rememberCb.checked = Boolean(saved);
  } else {
    guestSec.classList.add('hidden');
    dashSec.classList.remove('hidden');
    navUser.classList.remove('hidden');

    const isAdmin = Boolean(currentUser.isAdmin || currentUser.username === 'admin_user');
    document.getElementById('navUsernameDisplay').textContent = isAdmin
      ? `${currentUser.username} (Adminisztrátor)`
      : currentUser.username;
    document.getElementById('hostNamePreview').textContent = currentUser.username;
    document.getElementById('soloPlayerName').value = currentUser.username;

    if (isAdmin) {
      navBtnAdminQ.classList.remove('hidden');
      navBtnAdminU.classList.remove('hidden');
      navBtnSubmitQ.classList.add('hidden');
      switchDashboardTab('tabAdminQuestions');
    } else {
      navBtnAdminQ.classList.add('hidden');
      navBtnAdminU.classList.add('hidden');
      navBtnSubmitQ.classList.remove('hidden');
      switchDashboardTab('tabPlay');
    }
  }
}

function switchDashboardTab(targetId) {
  document.querySelectorAll('.dash-tab').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === targetId);
  });
  document.querySelectorAll('.dash-pane').forEach(p => {
    p.classList.toggle('hidden', p.id !== targetId);
  });
}

async function refreshLiveStats() {
  const textEl = document.getElementById('dbStatusText');
  const dotEl = document.getElementById('dbDot');
  if (!textEl) return;
  try {
    const res = await fetch('/api/status');
    if (!res.ok) throw new Error('unreachable');
    const st = await res.json();
    const qTotal = (st.counts?.multipleChoice || 0) + (st.counts?.estimation || 0);
    textEl.textContent = `${st.counts?.users || 0} játékos • ${qTotal} kérdés`;
    if (dotEl) dotEl.style.background = '#38c172';
  } catch {
    textEl.textContent = 'Kapcsolat megszakadt';
    if (dotEl) dotEl.style.background = '#e3342f';
  }
}

async function syncPortalData() {
  try {
    await refreshLiveStats();
    const [uRes, mRes] = await Promise.all([
      fetch('/api/users'),
      fetch('/api/matches')
    ]);
    if (uRes.ok) {
      const uData = await uRes.json();
      registeredUsers = uData.users || [];
      renderLeaderboardTable();
    }
    if (mRes.ok) {
      const mData = await mRes.json();
      renderMatchesTable(mData.matches || []);
    }

    if (currentUser) {
      const isAdmin = Boolean(currentUser.isAdmin || currentUser.username === 'admin_user');
      if (isAdmin) {
        await syncAdminData();
      } else {
        await syncMySubmittedQuestions();
      }
    }
  } catch {
    document.getElementById('dbStatusText').textContent = 'Kapcsolat megszakadt';
  }
}

async function syncMySubmittedQuestions() {
  if (!currentUser) return;
  try {
    const res = await fetch(`/api/questions/my?username=${encodeURIComponent(currentUser.username)}`);
    if (res.ok) {
      const data = await res.json();
      mySubmittedQuestions = data.questions || [];
      renderMySubmittedQuestions();
    }
  } catch {
    // ignore
  }
}

async function syncAdminData() {
  try {
    const [qRes, uRes] = await Promise.all([
      fetch('/api/admin/questions', { headers: getAuthHeaders() }),
      fetch('/api/admin/users', { headers: getAuthHeaders() })
    ]);
    if (qRes.ok) {
      adminQuestions = await qRes.json();
      const badge = document.getElementById('adminPendingBadge');
      if (badge) badge.textContent = String(adminQuestions.pending?.length || 0);
      renderAdminPendingQuestions();
      renderAdminApprovedQuestions();
    }
    if (uRes.ok) {
      const uData = await uRes.json();
      adminUsers = uData.users || [];
      renderAdminUsersTable();
    }
  } catch {
    // ignore
  }
}

function checkUrlQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const room = params.get('room');
  if (room) {
    const codeInput = document.getElementById('joinCodeInput');
    if (codeInput) codeInput.value = room.trim().toUpperCase();
  }
  if (params.get('verified') === '1') {
    const email = params.get('email') || '';
    if (email) {
      document.getElementById('loginUsername').value = email;
    }
    const errEl = document.getElementById('loginError');
    errEl.style.background = 'rgba(46, 139, 71, 0.25)';
    errEl.style.borderColor = '#2e8b47';
    errEl.style.color = '#86efac';
    errEl.textContent = 'E-mail címed sikeresen megerősítve! Most már bejelentkezhetsz.';
    errEl.classList.remove('hidden');
  }
}

function startInvitePolling() {
  setInterval(async () => {
    if (!currentUser || currentUser.isAdmin) {
      document.getElementById('incomingInviteAlert').classList.add('hidden');
      return;
    }
    try {
      const res = await fetch(`/api/invites?username=${encodeURIComponent(currentUser.username)}`);
      if (!res.ok) return;
      const data = await res.json();
      const inv = (data.invites || []).find(i => !lobbySession.active || lobbySession.code !== i.roomCode);
      const alertEl = document.getElementById('incomingInviteAlert');
      if (inv) {
        pendingInvite = inv;
        document.getElementById('incomingInviteMessage').innerHTML =
          `<strong>${escapeHtml(inv.fromUsername)}</strong> meghívott a(z) <strong>${escapeHtml(inv.roomCode)}</strong> online lobbyba!`;
        alertEl.classList.remove('hidden');
      } else {
        pendingInvite = null;
        alertEl.classList.add('hidden');
      }
    } catch {
      // ignore
    }
  }, 1500);
}

// ==================== ONLINE LOBBY MANAGEMENT ====================
async function createOnlineLobby() {
  if (!currentUser) return;
  const errBox = document.getElementById('lobbyErrorBox');
  errBox.classList.add('hidden');

  const maxBattleRounds = Number(document.getElementById('onlineRoundsSelect').value) || 6;
  const aiDifficulty = document.getElementById('onlineAiDiffSelect').value || 'normal';

  try {
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hostName: currentUser.username,
        maxBattleRounds,
        aiDifficulty
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Hiba a lobby létrehozásakor');
    connectToLobby(data.code, data.playerToken, data.assignedColor, data.state);
  } catch (err) {
    errBox.textContent = err.message;
    errBox.classList.remove('hidden');
  }
}

async function joinOnlineLobby(explicitCode = null) {
  if (!currentUser) return;
  const errBox = document.getElementById('lobbyErrorBox');
  errBox.classList.add('hidden');
  const code = (explicitCode || document.getElementById('joinCodeInput').value || '').trim().toUpperCase();
  if (!code) {
    errBox.textContent = 'Add meg a 6 jegyű szobakódot!';
    errBox.classList.remove('hidden');
    return;
  }

  try {
    const res = await fetch('/api/rooms/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        playerName: currentUser.username
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Nem sikerült csatlakozni');
    connectToLobby(data.code, data.playerToken, data.assignedColor, data.state);
  } catch (err) {
    errBox.textContent = err.message;
    errBox.classList.remove('hidden');
  }
}

function connectToLobby(code, token, color, initialState) {
  disconnectLobby();

  lobbySession.active = true;
  lobbySession.code = code;
  lobbySession.token = token;
  lobbySession.myColor = color;
  lobbySession.isHost = Boolean(initialState.isViewerHost);
  lobbySession.openedGameWindowForCode = null;

  sessionStorage.setItem(`honfoglalo_room_token_${code}`, token);
  localStorage.setItem(`honfoglalo_room_token_${code}`, token);

  const sse = new EventSource(`/api/rooms/${code}/stream?token=${encodeURIComponent(token)}`);
  sse.onmessage = evt => {
    try {
      const state = JSON.parse(evt.data);
      updateLobbyUI(state);
    } catch {
      // ignore
    }
  };
  lobbySession.sse = sse;

  lobbySession.pollTimer = setInterval(async () => {
    if (!lobbySession.active) return;
    try {
      const res = await fetch(`/api/rooms/${code}?token=${encodeURIComponent(token)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.state) updateLobbyUI(data.state);
      }
    } catch {
      // ignore
    }
  }, 1400);

  updateLobbyUI(initialState);
}

function disconnectLobby() {
  if (lobbySession.sse) {
    lobbySession.sse.close();
    lobbySession.sse = null;
  }
  if (lobbySession.pollTimer) {
    clearInterval(lobbySession.pollTimer);
    lobbySession.pollTimer = null;
  }
  lobbySession.active = false;
  lobbySession.code = null;
  lobbySession.token = null;
  document.getElementById('lobbyIdleBox').classList.remove('hidden');
  document.getElementById('lobbyActiveBox').classList.add('hidden');
}

function shouldOpenInNewWindow() {
  const stored = localStorage.getItem('honfoglalo_open_new_window');
  return stored === null ? true : stored === '1';
}

function setNewWindowPreference(enabled) {
  localStorage.setItem('honfoglalo_open_new_window', enabled ? '1' : '0');
  document.querySelectorAll('.chk-new-window').forEach(cb => {
    cb.checked = enabled;
  });
}

function launchGame(url, windowName = 'HonfoglaloGameWindow') {
  if (currentUser && !currentUser.isAdmin) {
    localStorage.setItem('honfoglalo_user', JSON.stringify(currentUser));
  }
  if (!shouldOpenInNewWindow()) {
    window.location.href = url;
    return;
  }
  // Always open a fresh tab/window via _blank (never reuse a named window)
  const win = window.open(url, '_blank');
  if (win) {
    win.focus();
  } else {
    window.location.href = url;
  }
}

function updateLobbyUI(state) {
  document.getElementById('lobbyIdleBox').classList.add('hidden');
  document.getElementById('lobbyActiveBox').classList.remove('hidden');

  document.getElementById('activeRoomCode').textContent = state.code;
  const link = `${window.location.origin}/?room=${state.code}`;
  document.getElementById('activeRoomLink').value = link;

  const slotsGrid = document.getElementById('lobbySlotsGrid');
  slotsGrid.innerHTML = '';
  const labels = {
    red: '1. Játékos (Piros – Házigazda)',
    green: '2. Játékos (Zöld)',
    blue: '3. Játékos (Kék)'
  };

  for (const color of ['red', 'green', 'blue']) {
    const s = state.slots[color];
    const isMe = state.viewerColor === color;
    const div = document.createElement('div');
    div.className = `slot-card slot-card--${color}`;
    div.innerHTML = `
      <div class="slot-card__role">${labels[color]} ${isMe ? '(Te)' : ''}</div>
      <div class="slot-card__name">${escapeHtml(s.name)}</div>
      <div class="slot-card__status ${s.isHuman ? 'slot-card__status--online' : ''}">
        ${s.isHuman ? 'Csatlakozva' : 'Várakozás játékosra (vagy Gép)'}
      </div>
    `;
    slotsGrid.appendChild(div);
  }

  const usersGrid = document.getElementById('registeredUsersList');
  usersGrid.innerHTML = '';
  const inRoomLower = Object.values(state.slots)
    .filter(s => s.isHuman)
    .map(s => s.name.toLowerCase());
  const invitedLower = (state.invitedUsernames || []).map(u => u.toLowerCase());

  const availableUsers = registeredUsers.filter(u => !inRoomLower.includes(u.username.toLowerCase()));
  if (availableUsers.length === 0) {
    usersGrid.innerHTML = '<div style="font-size:0.84rem; color:var(--text-muted);">Még nincs másik regisztrált játékos, akit meghívhatnál.</div>';
  } else {
    availableUsers.forEach(u => {
      const item = document.createElement('div');
      item.className = 'user-invite-item';
      const isInv = invitedLower.includes(u.username.toLowerCase());
      item.innerHTML = `<span>${escapeHtml(u.username)}</span>`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn ${isInv ? 'btn--ghost' : 'btn--primary'} btn--xs`;
      btn.textContent = isInv ? 'Meghívva' : 'Meghívás';
      btn.onclick = async () => {
        await fetch(`/api/rooms/${state.code}/invite`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: lobbySession.token,
            targetUsername: u.username
          })
        });
      };
      item.appendChild(btn);
      usersGrid.appendChild(item);
    });
  }

  const chatBox = document.getElementById('lobbyChatMessages');
  chatBox.innerHTML = '';
  (state.chronicle || []).slice(0, 15).forEach(entry => {
    const row = document.createElement('div');
    row.innerHTML = `<span style="color:var(--text-muted);">[${escapeHtml(entry.time)}]</span> ${escapeHtml(entry.message)}`;
    chatBox.appendChild(row);
  });

  const btnStart = document.getElementById('btnStartOnlineGame');
  const btnReopen = document.getElementById('btnReopenOnlineWindow');
  const statusTxt = document.getElementById('lobbyStatusText');
  const gameUrl = `/game.html?mode=online&room=${encodeURIComponent(state.code)}&token=${encodeURIComponent(lobbySession.token)}`;

  if (state.status === 'WAITING') {
    btnReopen.classList.add('hidden');
    if (state.isViewerHost) {
      btnStart.classList.remove('hidden');
      statusTxt.textContent = 'Házigazdaként bármikor elindíthatod a játékot.';
    } else {
      btnStart.classList.add('hidden');
      statusTxt.textContent = `Várakozás, amíg ${state.slots.red.name} elindítja a játékot...`;
    }
  } else {
    btnStart.classList.add('hidden');
    btnReopen.classList.remove('hidden');
    btnReopen.onclick = () => launchGame(gameUrl, `Honfoglalo_${state.code}_${lobbySession.myColor}`);
    statusTxt.textContent = 'A játék elindult az új ablakban!';

    if (lobbySession.openedGameWindowForCode !== state.code) {
      lobbySession.openedGameWindowForCode = state.code;
      launchGame(gameUrl, `Honfoglalo_${state.code}_${lobbySession.myColor}`);
    }
  }
}

// ==================== LEADERBOARD & PLAYER QUESTION SUBMISSION ====================
function renderLeaderboardTable() {
  const tbody = document.getElementById('portalLeaderboardBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (registeredUsers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="color:var(--text-muted);">Még nincs regisztrált játékos.</td></tr>';
    return;
  }
  registeredUsers.forEach((u, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${idx + 1}.</strong></td>
      <td><strong>${escapeHtml(u.username)}</strong></td>
      <td>${Number(u.games_won || 0)} / ${Number(u.games_played || 0)}</td>
      <td style="color:var(--accent-primary); font-weight:700;">${Number(u.total_points || 0)} p</td>
      <td>${Number(u.counties_conquered || 0)}</td>
      <td>${Number(u.correct_answers || 0)} / ${Number(u.total_answers || 0)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderMatchesTable(matches) {
  const tbody = document.getElementById('portalMatchesBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (matches.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="color:var(--text-muted);">Még nincs befejezett mérkőzés.</td></tr>';
    return;
  }
  matches.forEach(m => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong style="color:var(--accent-primary);">${escapeHtml(m.winner_name)}</strong></td>
      <td>${escapeHtml(m.red_player)} (${Number(m.red_score || 0)}p)</td>
      <td>${escapeHtml(m.green_player)} (${Number(m.green_score || 0)}p)</td>
      <td>${escapeHtml(m.blue_player)} (${Number(m.blue_score || 0)}p)</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderMySubmittedQuestions() {
  const listEl = document.getElementById('mySubmittedQuestionsList');
  if (!listEl) return;
  listEl.innerHTML = '';

  if (mySubmittedQuestions.length === 0) {
    listEl.innerHTML = '<div style="color:var(--text-muted); font-size:0.86rem;">Még nem küldtél be saját kérdést.</div>';
    return;
  }

  mySubmittedQuestions.forEach(q => {
    const card = document.createElement('div');
    card.className = 'q-card';
    const ans = q.qType === 'estimation' ? `${q.answer} ${q.unit || ''}` : q.options?.[q.correctIndex] || '';
    const isApproved = q.status === 'approved';
    card.innerHTML = `
      <div>
        <div style="font-size:0.74rem; color:var(--accent-primary); font-weight:700;">
          ${escapeHtml(q.category)} • ${q.qType === 'estimation' ? 'Tippelős' : 'Feleletválasztós'}
        </div>
        <div style="font-weight:600; margin:2px 0;">${escapeHtml(q.question)}</div>
        <div style="font-size:0.78rem; color:var(--text-secondary);">Helyes válasz: ${escapeHtml(ans)}</div>
      </div>
      <span class="tag ${isApproved ? 'tag--accent' : ''}">
        ${isApproved ? 'Elfogadva' : 'Jóváhagyásra vár'}
      </span>
    `;
    listEl.appendChild(card);
  });
}

// ==================== ADMIN PANEL RENDERERS (admin_user ONLY) ====================
function renderAdminPendingQuestions() {
  const listEl = document.getElementById('adminPendingQuestionsList');
  if (!listEl) return;
  listEl.innerHTML = '';

  const pending = adminQuestions.pending || [];
  if (pending.length === 0) {
    listEl.innerHTML = '<div style="color:var(--text-muted); font-size:0.88rem;">Jelenleg nincs jóváhagyásra váró beküldött kérdés.</div>';
    return;
  }

  pending.forEach(q => {
    const card = document.createElement('div');
    card.className = 'q-card';
    const ans = q.qType === 'estimation'
      ? `Pontos válasz: <strong>${escapeHtml(q.answer)} ${escapeHtml(q.unit || '')}</strong>`
      : `Helyes: <strong>${escapeHtml(q.options?.[q.correctIndex] || '')}</strong> | Opciók: ${(q.options || []).map(escapeHtml).join(', ')}`;

    card.innerHTML = `
      <div>
        <div style="font-size:0.75rem; color:var(--accent-primary); font-weight:700;">
          Beküldő: ${escapeHtml(q.createdBy)} • ${escapeHtml(q.category)} • ${q.qType === 'estimation' ? 'Tippelős' : 'Feleletválasztós'}
        </div>
        <div style="font-weight:700; font-size:0.95rem; margin:3px 0;">${escapeHtml(q.question)}</div>
        <div style="font-size:0.8rem; color:var(--text-secondary);">${ans}</div>
      </div>
      <div style="display:flex; gap:8px; flex-shrink:0;">
        <button type="button" class="btn btn--primary btn--xs" data-approve="${q.dbId}">Elfogadás</button>
        <button type="button" class="btn btn--ghost btn--xs" data-reject="${q.dbId}">Elutasítás</button>
      </div>
    `;

    card.querySelector('[data-approve]').onclick = async () => {
      await fetch(`/api/admin/questions/${q.dbId}/approve`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      await syncPortalData();
    };

    card.querySelector('[data-reject]').onclick = async () => {
      await fetch(`/api/admin/questions/${q.dbId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      await syncPortalData();
    };

    listEl.appendChild(card);
  });
}

function renderAdminApprovedQuestions() {
  const filter = (document.getElementById('adminQFilterInput')?.value || '').toLowerCase().trim();
  const approved = adminQuestions.approved || [];
  const filtered = approved.filter(
    q => !filter || q.question.toLowerCase().includes(filter) || q.category.toLowerCase().includes(filter)
  );

  const titleEl = document.getElementById('adminApprovedCountTitle');
  if (titleEl) titleEl.textContent = `Elfogadott kérdések (${approved.length} db)`;

  const listEl = document.getElementById('adminApprovedQuestionsList');
  if (!listEl) return;
  listEl.innerHTML = '';

  filtered.slice(0, 80).forEach(q => {
    const card = document.createElement('div');
    card.className = 'q-card';
    const ans = q.qType === 'estimation' ? `${q.answer} ${q.unit || ''}` : q.options?.[q.correctIndex] || '';
    card.innerHTML = `
      <div>
        <div style="font-size:0.72rem; color:var(--accent-primary); font-weight:700;">
          #${q.dbId} • ${escapeHtml(q.category)} • ${q.qType === 'estimation' ? 'Tippelős' : 'Feleletválasztós'} (Beküldő: ${escapeHtml(q.createdBy)})
        </div>
        <div style="font-weight:600; margin:2px 0;">${escapeHtml(q.question)}</div>
        <div style="font-size:0.78rem; color:var(--text-secondary);">Válasz: ${escapeHtml(ans)}</div>
      </div>
    `;
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn btn--ghost btn--xs';
    del.textContent = 'Törlés';
    del.onclick = async () => {
      await fetch(`/api/admin/questions/${q.dbId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      await syncPortalData();
    };
    card.appendChild(del);
    listEl.appendChild(card);
  });
}

function renderAdminUsersTable() {
  const tbody = document.getElementById('adminUsersTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (adminUsers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="color:var(--text-muted);">Még nincs regisztrált játékos.</td></tr>';
    return;
  }

  adminUsers.forEach(u => {
    const tr = document.createElement('tr');
    const verifiedBadge = u.email_verified
      ? '<span style="color:#6ee7b7; font-size:0.76rem; font-weight:700;">✓ Megerősítve</span>'
      : `<span style="color:#fcd34d; font-size:0.76rem; font-weight:700;">⏳ Függőben (Kód: ${escapeHtml(u.verification_code || '–')})</span>`;

    tr.innerHTML = `
      <td>#${u.id}</td>
      <td><strong>${escapeHtml(u.username)}</strong></td>
      <td>
        <div>${escapeHtml(u.email)}</div>
        <div>${verifiedBadge}</div>
      </td>
      <td>${Number(u.games_won || 0)} / ${Number(u.games_played || 0)}</td>
      <td>
        <input type="number" class="input input--sm" value="${Number(u.total_points || 0)}" style="width:100px;" data-pts-input="${u.id}" />
      </td>
      <td>
        <div style="display:flex; flex-wrap:wrap; gap:6px;">
          ${!u.email_verified ? `<button type="button" class="btn btn--primary btn--xs" data-verify-user="${u.id}">E-mail jóváhagyása</button>` : ''}
          <button type="button" class="btn btn--secondary btn--xs" data-save-pts="${u.id}">Pont mentése</button>
          <button type="button" class="btn btn--secondary btn--xs" data-reset-pw="${u.id}">Új jelszó</button>
          <button type="button" class="btn btn--ghost btn--xs" data-reset-stats="${u.id}">Nullázás</button>
          <button type="button" class="btn btn--ghost btn--xs" style="color:#fca5a5;" data-del-user="${u.id}">Törlés</button>
        </div>
      </td>
    `;

    const verifyBtn = tr.querySelector(`[data-verify-user="${u.id}"]`);
    if (verifyBtn) {
      verifyBtn.onclick = async () => {
        await fetch(`/api/admin/users/${u.id}`, {
          method: 'PATCH',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ verifyEmail: true })
        });
        await syncPortalData();
      };
    }

    tr.querySelector(`[data-save-pts="${u.id}"]`).onclick = async () => {
      const val = Number(tr.querySelector(`[data-pts-input="${u.id}"]`).value || 0);
      await fetch(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ totalPoints: val })
      });
      await syncPortalData();
    };

    tr.querySelector(`[data-reset-pw="${u.id}"]`).onclick = async () => {
      const newPassword = window.prompt(`Új jelszó megadása ${u.username} számára (min. 4 karakter):`);
      if (!newPassword || newPassword.length < 4) return;
      await fetch(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ newPassword })
      });
      await syncPortalData();
    };

    tr.querySelector(`[data-reset-stats="${u.id}"]`).onclick = async () => {
      await fetch(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ resetStats: true })
      });
      await syncPortalData();
    };

    tr.querySelector(`[data-del-user="${u.id}"]`).onclick = async () => {
      await fetch(`/api/admin/users/${u.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      await syncPortalData();
    };

    tbody.appendChild(tr);
  });
}

// ==================== EVENTS ====================
function bindPortalEvents() {
  const tabLogin = document.getElementById('tabLoginBtn');
  const tabReg = document.getElementById('tabRegisterBtn');
  const loginForm = document.getElementById('loginForm');
  const regForm = document.getElementById('registerForm');
  const verifyForm = document.getElementById('verifyEmailForm');

  const fpForm = document.getElementById('forgotPasswordForm');

  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabReg.classList.remove('active');
    loginForm.classList.remove('hidden');
    regForm.classList.add('hidden');
    verifyForm.classList.add('hidden');
    fpForm.classList.add('hidden');
  });

  tabReg.addEventListener('click', () => {
    tabReg.classList.add('active');
    tabLogin.classList.remove('active');
    regForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
    verifyForm.classList.add('hidden');
    fpForm.classList.add('hidden');
  });

  document.getElementById('btnBackToLogin')?.addEventListener('click', () => {
    tabLogin.click();
  });

  // --- Forgot / reset password flow ---
  const resetFpForm = () => {
    document.getElementById('fpResetFields').classList.add('hidden');
    document.getElementById('fpSubmitBtn').textContent = 'Visszaállító Kód Küldése';
    document.getElementById('fpCode').value = '';
    document.getElementById('fpNewPassword').value = '';
    document.getElementById('fpError').classList.add('hidden');
    document.getElementById('fpInfo').classList.add('hidden');
  };

  document.getElementById('linkForgotPassword')?.addEventListener('click', () => {
    loginForm.classList.add('hidden');
    regForm.classList.add('hidden');
    verifyForm.classList.add('hidden');
    fpForm.classList.remove('hidden');
    resetFpForm();
    setTimeout(() => document.getElementById('fpIdentifier')?.focus(), 50);
  });

  document.getElementById('btnBackToLoginForgot')?.addEventListener('click', () => {
    fpForm.classList.add('hidden');
    tabLogin.click();
  });

  fpForm.addEventListener('submit', async e => {
    e.preventDefault();
    const errEl = document.getElementById('fpError');
    const infoEl = document.getElementById('fpInfo');
    errEl.classList.add('hidden');
    infoEl.classList.add('hidden');
    const identifier = document.getElementById('fpIdentifier').value;
    const resetFields = document.getElementById('fpResetFields');
    try {
      if (resetFields.classList.contains('hidden')) {
        // Step 1: request the 6-digit reset code by email
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Hiba a kód küldésekor');
        resetFields.classList.remove('hidden');
        document.getElementById('fpSubmitBtn').textContent = 'Új Jelszó Mentése és Belépés';
        infoEl.textContent = data.maskedEmail
          ? `Elküldtük a 6 jegyű visszaállító kódot ide: ${data.maskedEmail} (15 percig érvényes)`
          : 'Ha létezik fiók ezzel az adattal, kiküldtük a visszaállító kódot a hozzá tartozó e-mail címre.';
        infoEl.classList.remove('hidden');
        setTimeout(() => document.getElementById('fpCode')?.focus(), 50);
      } else {
        // Step 2: verify code + set new password (auto-login on success)
        const res = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier,
            code: document.getElementById('fpCode').value,
            newPassword: document.getElementById('fpNewPassword').value
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Sikertelen jelszó-visszaállítás');
        resetFpForm();
        fpForm.classList.add('hidden');
        setLoggedInUser(data.user, data.authToken);
        await syncPortalData();
      }
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });

  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    const errEl = document.getElementById('loginError');
    errEl.classList.add('hidden');
    const usernameVal = document.getElementById('loginUsername').value;
    const passwordVal = document.getElementById('loginPassword').value;
    const remember = Boolean(document.getElementById('loginRememberMe')?.checked);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameVal, password: passwordVal })
      });
      const data = await res.json();
      if (res.status === 403 && data.requiresVerification) {
        openEmailVerificationView(data.email, data.error);
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Sikertelen belépés');
      setLoggedInUser(data.user, data.authToken, remember);
      if (remember) saveLoginCredentials(usernameVal, passwordVal);
      else clearLoginCredentials();
      await syncPortalData();
    } catch (err) {
      errEl.style.background = '';
      errEl.style.borderColor = '';
      errEl.style.color = '';
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });

  regForm.addEventListener('submit', async e => {
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
          password: document.getElementById('regPassword').value,
          recaptchaResponse: getRecaptchaResponse(),
          website: document.getElementById('regWebsiteHoneypot').value
        })
      });
      const data = await res.json();
      if (!res.ok) {
        resetRecaptcha();
        throw new Error(data.error || 'Sikertelen regisztráció');
      }

      const notice = data.emailSent
        ? `Elküldtük a 6 jegyű megerősítő kódot a(z) ${data.email} címre. Kérlek írd be alább:`
        : `Fiók létrehozva (${data.email}). Írd be a 6 jegyű megerősítő kódot (vagy kérj jóváhagyást az admintól):`;
      openEmailVerificationView(data.email, notice);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });

  verifyForm.addEventListener('submit', async e => {
    e.preventDefault();
    const errEl = document.getElementById('verifyError');
    errEl.classList.add('hidden');
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: document.getElementById('verifyEmailAddress').value,
          code: document.getElementById('verifyCodeInput').value
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Hibás kód');
      setLoggedInUser(data.user, data.authToken);
      await syncPortalData();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });

  document.getElementById('btnResendVerifyCode')?.addEventListener('click', async () => {
    const email = document.getElementById('verifyEmailAddress').value;
    const errEl = document.getElementById('verifyError');
    errEl.classList.add('hidden');
    try {
      const res = await fetch('/api/auth/resend-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Hiba az újraküldéskor');
      document.getElementById('verifyEmailPromptText').textContent = 'Új 6 jegyű megerősítő kódot küldtünk az e-mail címedre!';
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });

  document.getElementById('btnLogout').addEventListener('click', () => {
    disconnectLobby();
    setLoggedInUser(null, null);
  });

  // "Open game in new window" preference checkboxes (synced across panels)
  document.querySelectorAll('.chk-new-window').forEach(cb => {
    cb.checked = shouldOpenInNewWindow();
    cb.addEventListener('change', () => setNewWindowPreference(cb.checked));
  });

  // Dashboard navigation tabs
  document.querySelectorAll('.dash-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab');
      switchDashboardTab(target);
      syncPortalData();
    });
  });

  // Online Lobby actions
  document.getElementById('btnCreateRoom').addEventListener('click', createOnlineLobby);
  document.getElementById('btnJoinRoom').addEventListener('click', () => joinOnlineLobby());
  document.getElementById('btnLeaveLobby').addEventListener('click', disconnectLobby);
  document.getElementById('btnRefreshUsersList').addEventListener('click', syncPortalData);

  document.getElementById('btnCopyRoomLink').addEventListener('click', async e => {
    const inp = document.getElementById('activeRoomLink');
    inp.select();
    try {
      await navigator.clipboard.writeText(inp.value);
      const btn = e.currentTarget;
      btn.textContent = 'Másolva!';
      setTimeout(() => { btn.textContent = 'Link másolása'; }, 1500);
    } catch {
      document.execCommand('copy');
    }
  });

  document.getElementById('lobbyChatForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!lobbySession.active) return;
    const inp = document.getElementById('lobbyChatInput');
    const msg = inp.value.trim();
    if (!msg) return;
    inp.value = '';
    await fetch(`/api/rooms/${lobbySession.code}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: lobbySession.token, message: msg })
    });
  });

  document.getElementById('btnStartOnlineGame').addEventListener('click', async () => {
    if (!lobbySession.active) return;
    const res = await fetch(`/api/rooms/${lobbySession.code}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: lobbySession.token })
    });
    const data = await res.json();
    if (res.ok && data.state) {
      updateLobbyUI(data.state);
    }
  });

  // Incoming Direct Invite buttons
  document.getElementById('btnAcceptInvite').addEventListener('click', async () => {
    if (!pendingInvite) return;
    const code = pendingInvite.roomCode;
    document.getElementById('incomingInviteAlert').classList.add('hidden');
    switchDashboardTab('tabPlay');
    await joinOnlineLobby(code);
  });

  document.getElementById('btnDismissInvite').addEventListener('click', async () => {
    if (!pendingInvite || !currentUser) return;
    const code = pendingInvite.roomCode;
    pendingInvite = null;
    document.getElementById('incomingInviteAlert').classList.add('hidden');
    await fetch('/api/invites/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUser.username, roomCode: code })
    });
  });

  // Solo Game Window Launcher
  document.getElementById('btnLaunchSoloWindow').addEventListener('click', () => {
    if (!currentUser) return;
    const diff = document.getElementById('soloDifficulty').value || 'normal';
    const rounds = document.getElementById('soloRounds').value || '6';
    const url = `/game.html?mode=ai&diff=${encodeURIComponent(diff)}&rounds=${encodeURIComponent(rounds)}`;
    launchGame(url, 'HonfoglaloSoloWindow');
  });

  // Player Submit Question Form (goes to pending)
  document.getElementById('userQType').addEventListener('change', e => {
    const isEst = e.target.value === 'estimation';
    document.getElementById('userQMcInputs').classList.toggle('hidden', isEst);
    document.getElementById('userQEstInputs').classList.toggle('hidden', !isEst);
  });

  document.getElementById('playerSubmitQuestionForm').addEventListener('submit', async e => {
    e.preventDefault();
    const fb = document.getElementById('userQFeedback');
    fb.classList.add('hidden');
    const type = document.getElementById('userQType').value;
    const payload = {
      type,
      category: document.getElementById('userQCategory').value,
      question: document.getElementById('userQText').value,
      createdBy: currentUser?.username || 'Játékos',
      isAdmin: false
    };
    if (type === 'multiple_choice') {
      payload.options = [
        document.getElementById('userQOpt0').value,
        document.getElementById('userQOpt1').value,
        document.getElementById('userQOpt2').value,
        document.getElementById('userQOpt3').value
      ];
      payload.correctIndex = 0;
    } else {
      payload.answer = Number(document.getElementById('userQEstVal').value);
      payload.unit = document.getElementById('userQEstUnit').value;
    }

    try {
      const res = await fetch('/api/questions', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Hiba');
      document.getElementById('userQText').value = '';
      document.getElementById('userQOpt0').value = '';
      document.getElementById('userQOpt1').value = '';
      document.getElementById('userQOpt2').value = '';
      document.getElementById('userQOpt3').value = '';
      document.getElementById('userQEstVal').value = '';
      document.getElementById('userQEstUnit').value = '';

      fb.className = 'alert';
      fb.style.background = 'rgba(46, 139, 71, 0.25)';
      fb.style.border = '1px solid #2e8b47';
      fb.style.color = '#86efac';
      fb.textContent = 'Kérdésed beküldve! Az adminisztrátor jóváhagyása után kerül be a játékba.';
      fb.classList.remove('hidden');
      await syncMySubmittedQuestions();
    } catch (err) {
      fb.className = 'alert alert--error';
      fb.textContent = err.message;
      fb.classList.remove('hidden');
    }
  });

  // Admin Question Form (approved immediately)
  document.getElementById('adminQType').addEventListener('change', e => {
    const isEst = e.target.value === 'estimation';
    document.getElementById('adminQMcInputs').classList.toggle('hidden', isEst);
    document.getElementById('adminQEstInputs').classList.toggle('hidden', !isEst);
  });

  document.getElementById('adminQFilterInput').addEventListener('input', renderAdminApprovedQuestions);

  document.getElementById('adminQuestionForm').addEventListener('submit', async e => {
    e.preventDefault();
    const fb = document.getElementById('adminQFeedback');
    fb.classList.add('hidden');
    const type = document.getElementById('adminQType').value;
    const payload = {
      type,
      category: document.getElementById('adminQCategory').value,
      question: document.getElementById('adminQText').value,
      createdBy: 'admin_user',
      isAdmin: true
    };
    if (type === 'multiple_choice') {
      payload.options = [
        document.getElementById('adminQOpt0').value,
        document.getElementById('adminQOpt1').value,
        document.getElementById('adminQOpt2').value,
        document.getElementById('adminQOpt3').value
      ];
      payload.correctIndex = 0;
    } else {
      payload.answer = Number(document.getElementById('adminQEstVal').value);
      payload.unit = document.getElementById('adminQEstUnit').value;
    }

    try {
      const res = await fetch('/api/questions', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Hiba');
      document.getElementById('adminQText').value = '';
      document.getElementById('adminQOpt0').value = '';
      document.getElementById('adminQOpt1').value = '';
      document.getElementById('adminQOpt2').value = '';
      document.getElementById('adminQOpt3').value = '';
      document.getElementById('adminQEstVal').value = '';
      document.getElementById('adminQEstUnit').value = '';
      await syncPortalData();
    } catch (err) {
      fb.textContent = err.message;
      fb.classList.remove('hidden');
    }
  });

  document.getElementById('btnRefreshAdminUsers').addEventListener('click', syncPortalData);
}

initPortal();
