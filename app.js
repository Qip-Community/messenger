// ===== QIP Messenger 2026 — Firebase Engine =====

const PUBLIC_ROOM_ID = 'public';
const BASE_TITLE = document.title;

let currentUser = null;
let allProfiles = [];
let friendUids = new Set();
let openTabs = [];
let activeTab = null;
let unsubMessages = {};
let unread = {};
let initializedChats = new Set();
let unsubFriendships = null;
let unsubRequests = null;
let incomingRequests = [];
let activeProfileUserId = null;
let soundEnabled = true;

// DOM Элементы
const authScreen = document.getElementById('auth-screen');
const appEl = document.getElementById('app');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginError = document.getElementById('login-error');
const registerError = document.getElementById('register-error');
const soundToggleBtn = document.getElementById('sound-toggle-btn');

if (soundToggleBtn) {
  soundToggleBtn.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    soundToggleBtn.textContent = soundEnabled ? '🔊' : '🔇';
    soundToggleBtn.classList.toggle('active', soundEnabled);
  });
}

// Вкладки авторизации
document.querySelectorAll('.auth-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const isLogin = btn.dataset.tab === 'login';
    if (loginForm) loginForm.style.display = isLogin ? 'flex' : 'none';
    if (registerForm) registerForm.style.display = isLogin ? 'none' : 'flex';
  });
});

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (loginError) loginError.textContent = '';
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    try {
      await auth.signInWithEmailAndPassword(email, password);
    } catch (err) {
      if (loginError) loginError.textContent = translateAuthError(err);
    }
  });
}

if (registerForm) {
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (registerError) registerError.textContent = '';
    const name = document.getElementById('register-name').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    try {
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      await db.collection('users').doc(cred.user.uid).set({
        name: name || email.split('@')[0],
        email: email.toLowerCase(),
        photoURL: '',
        bio: '',
        status: 'online',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (err) {
      if (registerError) registerError.textContent = translateAuthError(err);
    }
  });
}

function translateAuthError(err) {
  const map = {
    'auth/invalid-credential': 'Неверный Email или пароль.',
    'auth/email-already-in-use': 'Email уже зарегистрирован.',
    'auth/invalid-email': 'Некорректный формат Email.',
    'auth/weak-password': 'Пароль слишком простой (минимум 6 символов).',
    'auth/operation-not-allowed': 'Авторизация по Email/Паролю отключена в консоли Firebase.',
    'auth/user-not-found': 'Пользователь не найден.',
    'auth/wrong-password': 'Неверный пароль.'
  };
  return map[err.code] || ('Ошибка: ' + err.message);
}

// Авторизация и онлайн-статус
auth.onAuthStateChanged(async (user) => {
  if (user) {
    try {
      db.collection('users').doc(user.uid).onSnapshot(doc => {
        if (doc.exists) {
          const data = doc.data();
          currentUser = { 
            uid: user.uid, 
            name: data.name || 'UIN Пользователь', 
            status: data.status || 'online',
            photoURL: data.photoURL || '',
            bio: data.bio || ''
          };
          updateOwnProfileUI();
        }
      });

      if (authScreen) authScreen.style.display = 'none';
      if (appEl) appEl.style.display = 'flex';

      setPresence('online');
      listenProfiles();
      listenFriendships();
      listenFriendRequests();
      openChat(PUBLIC_ROOM_ID);
    } catch(e) {
      console.error("Ошибка сети QIP:", e);
    }
  } else {
    currentUser = null;
    Object.values(unsubMessages).forEach(fn => fn && fn());
    unsubMessages = {};
    if (unsubFriendships) unsubFriendships();
    if (unsubRequests) unsubRequests();
    openTabs = [];
    activeTab = null;
    friendUids = new Set();
    if (authScreen) authScreen.style.display = 'flex';
    if (appEl) appEl.style.display = 'none';
  }
});

const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    await setPresence('offline');
    await auth.signOut();
  });
}

const statusSelect = document.getElementById('status-select');
if (statusSelect) {
  statusSelect.addEventListener('change', (e) => setPresence(e.target.value));
}

async function setPresence(status){
  if(!currentUser) return;
  currentUser.status = status;
  try {
    await db.collection('users').doc(currentUser.uid).update({ status });
  } catch(e) {}
}

function updateOwnProfileUI() {
  if (!currentUser) return;
  const ownName = document.getElementById('own-name');
  const ownAvatarImg = document.getElementById('own-avatar-img');
  const ownAvatarPlaceholder = document.getElementById('own-avatar-placeholder');
  const statusSelectEl = document.getElementById('status-select');

  if (ownName) ownName.textContent = currentUser.name;
  if (statusSelectEl) statusSelectEl.value = currentUser.status;

  if (ownAvatarImg && ownAvatarPlaceholder) {
    if (currentUser.photoURL) {
      ownAvatarImg.src = currentUser.photoURL;
      ownAvatarImg.style.display = 'block';
      ownAvatarPlaceholder.style.display = 'none';
    } else {
      ownAvatarImg.style.display = 'none';
      ownAvatarPlaceholder.style.display = 'flex';
      ownAvatarPlaceholder.textContent = (currentUser.name || 'Я')[0].toUpperCase();
    }
  }
}

// Модальные окна собственного профиля
const editProfileBtn = document.getElementById('edit-profile-btn');
const profileEditModal = document.getElementById('profile-edit-modal');
const closeProfileEditBtn = document.getElementById('close-profile-edit-btn');
const ownAvatarWrapper = document.getElementById('own-avatar-wrapper');

function openOwnProfileModal() {
  if (!currentUser) return;
  document.getElementById('edit-display-name').value = currentUser.name || '';
  document.getElementById('edit-avatar-url').value = currentUser.photoURL || '';
  document.getElementById('edit-bio').value = currentUser.bio || '';
  if (profileEditModal) profileEditModal.style.display = 'flex';
}

if (editProfileBtn) editProfileBtn.addEventListener('click', openOwnProfileModal);
if (ownAvatarWrapper) ownAvatarWrapper.addEventListener('click', openOwnProfileModal);

if (closeProfileEditBtn) closeProfileEditBtn.addEventListener('click', () => {
  if (profileEditModal) profileEditModal.style.display = 'none';
});

document.getElementById('profile-edit-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentUser) return;

  const newName = document.getElementById('edit-display-name').value.trim();
  const newAvatar = document.getElementById('edit-avatar-url').value.trim();
  const newBio = document.getElementById('edit-bio').value.trim();

  await db.collection('users').doc(currentUser.uid).update({
    name: newName, photoURL: newAvatar, bio: newBio
  });

  if (profileEditModal) profileEditModal.style.display = 'none';
});

// Модальное окно просмотра профиля пользователя
function openUserProfile(userId) {
  if (!userId) return;
  if (userId === currentUser?.uid) {
    openOwnProfileModal();
    return;
  }

  const user = allProfiles.find(u => u.id === userId);
  if (!user) return;

  activeProfileUserId = userId;

  const modal = document.getElementById('user-profile-modal');
  const avatarImg = document.getElementById('view-user-avatar');
  const avatarPlaceholder = document.getElementById('view-user-avatar-placeholder');
  const nameEl = document.getElementById('view-user-name');
  const statusEl = document.getElementById('view-user-status');
  const emailEl = document.getElementById('view-user-email');
  const bioEl = document.getElementById('view-user-bio');

  if (nameEl) nameEl.textContent = user.name || 'Пользователь';
  if (emailEl) emailEl.textContent = user.email || '—';
  if (bioEl) bioEl.textContent = user.bio || 'Статус отсутствует.';

  if (statusEl) {
    const statusMap = {
      online: '🟢 В сети',
      away: '🟡 Отошел',
      dnd: '🔴 Не беспокоить',
      offline: '⚪ Не в сети'
    };
    statusEl.textContent = statusMap[user.status] || '⚪ Не в сети';
  }

  if (avatarImg && avatarPlaceholder) {
    if (user.photoURL) {
      avatarImg.src = user.photoURL;
      avatarImg.style.display = 'block';
      avatarPlaceholder.style.display = 'none';
    } else {
      avatarImg.style.display = 'none';
      avatarPlaceholder.style.display = 'flex';
      avatarPlaceholder.textContent = (user.name || '?')[0].toUpperCase();
    }
  }

  if (modal) modal.style.display = 'flex';
}
window.openUserProfile = openUserProfile;

document.getElementById('close-user-profile-btn')?.addEventListener('click', () => {
  const modal = document.getElementById('user-profile-modal');
  if (modal) modal.style.display = 'none';
});

document.getElementById('start-chat-from-profile-btn')?.addEventListener('click', () => {
  if (activeProfileUserId) {
    openChat(activeProfileUserId);
    const modal = document.getElementById('user-profile-modal');
    if (modal) modal.style.display = 'none';
  }
});

// Слушатели данных
function listenProfiles(){
  db.collection('users').onSnapshot(snap => {
    allProfiles = [];
    snap.forEach(doc => {
      if(doc.id === currentUser?.uid) return;
      allProfiles.push({ id: doc.id, ...doc.data() });
    });
    renderContacts();
    renderTabs();
  });
}

function listenFriendships(){
  unsubFriendships = db.collection('friendships')
    .where('users', 'array-contains', currentUser.uid)
    .onSnapshot(snap => {
      friendUids = new Set();
      snap.forEach(doc => {
        const other = doc.data().users.find(u => u !== currentUser.uid);
        if(other) friendUids.add(other);
      });
      renderContacts();
    });
}

function listenFriendRequests(){
  unsubRequests = db.collection('friendRequests')
    .where('to', '==', currentUser.uid)
    .where('status', '==', 'pending')
    .onSnapshot(snap => {
      incomingRequests = [];
      snap.forEach(doc => incomingRequests.push({ id: doc.id, ...doc.data() }));
      renderFriendRequests();
    });
}

document.getElementById('add-friend-btn')?.addEventListener('click', async () => {
  const email = prompt('Введите Email контакта:');
  if(!email) return;
  const target = allProfiles.find(p => (p.email || '').toLowerCase() === email.trim().toLowerCase());
  if(!target) return alert('Пользователь не найден.');
  
  await db.collection('friendRequests').add({
    from: currentUser.uid,
    fromName: currentUser.name,
    to: target.id,
    status: 'pending',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  alert('Запрос на добавление отправлен!');
});

function renderFriendRequests(){
  const box = document.getElementById('friend-requests-list');
  if(!box) return;
  if(!incomingRequests.length){ box.innerHTML = ''; return; }
  box.innerHTML = incomingRequests.map(r => `
    <div class="friend-request-row">
      <span>${escapeHtml(r.fromName)}</span>
      <button onclick="respondReq('${r.id}', true)">+ Add</button>
    </div>
  `).join('');
}

async function respondReq(reqId, accept){
  const req = incomingRequests.find(r => r.id === reqId);
  if(!req) return;
  await db.collection('friendRequests').doc(reqId).update({ status: accept ? 'accepted' : 'declined' });
  if(accept){
    const pair = [currentUser.uid, req.from].sort();
    await db.collection('friendships').doc(pair.join('_')).set({
      users: pair, createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }
}
window.respondReq = respondReq;

function renderContacts(){
  const list = document.getElementById('contacts-list');
  if(!list) return;
  list.innerHTML = '';

  const pub = document.createElement('div');
  pub.className = 'contact-row' + (activeTab === PUBLIC_ROOM_ID ? ' active' : '');
  pub.innerHTML = `
    <span class="status-dot online"></span>
    <span class="contact-meta"><span class="contact-name">💬 Общий чат QIP</span></span>
  `;
  pub.onclick = () => openChat(PUBLIC_ROOM_ID);
  list.appendChild(pub);

  const header = document.createElement('div');
  header.className = 'group-header';
  header.textContent = `Контакты (${friendUids.size})`;
  list.appendChild(header);

  allProfiles.filter(p => friendUids.has(p.id)).forEach(u => {
    const row = document.createElement('div');
    row.className = 'contact-row' + (u.id === activeTab ? ' active' : '');
    row.innerHTML = `
      <span class="status-dot ${u.status || 'offline'}"></span>
      <span class="contact-meta">
        <span class="contact-name">${escapeHtml(u.name)}</span>
        <span class="contact-mood">${escapeHtml(u.bio || '')}</span>
      </span>
    `;
    row.onclick = () => openChat(u.id);
    list.appendChild(row);
  });
}

function openChat(id){
  if(!openTabs.includes(id)) openTabs.push(id);
  activeTab = id;
  unread[id] = 0;
  renderTabs();
  ensureChatWindowExists(id);
  switchActiveWindow(id);
  renderContacts();
  subscribeMessages(id);
}

function closeChat(id, evt){
  if(evt) evt.stopPropagation();
  if(id === PUBLIC_ROOM_ID) return;
  openTabs = openTabs.filter(t => t !== id);
  const win = document.querySelector(`.chat-window[data-chat-id="${id}"]`);
  if(win) win.remove();
  activeTab = openTabs.length ? openTabs[openTabs.length - 1] : null;
  renderTabs();
  if(activeTab) switchActiveWindow(activeTab);
  renderContacts();
}

function renderTabs(){
  const row = document.getElementById('tabs-row');
  if(!row) return;
  row.innerHTML = '';
  openTabs.forEach(id => {
    const tab = document.createElement('div');
    tab.className = 'tab' + (id === activeTab ? ' active' : '');
    const closeBtn = id === PUBLIC_ROOM_ID ? '' : '<span class="close-tab">✕</span>';
    tab.innerHTML = `<span>${escapeHtml(getUserName(id))}</span>${closeBtn}`;
    tab.onclick = () => openChat(id);
    const cb = tab.querySelector('.close-tab');
    if(cb) cb.onclick = (e) => closeChat(id, e);
    row.appendChild(tab);
  });
}

function ensureChatWindowExists(id){
  const container = document.getElementById('chats-container');
  if(!container) return;
  
  let win = container.querySelector(`.chat-window[data-chat-id="${id}"]`);
  if(!win){
    win = document.createElement('div');
    win.className = 'chat-window';
    win.dataset.chatId = id;
    win.innerHTML = `
      <div class="chat-header">
        <span class="status-dot ${getUserStatus(id)}"></span>
        <strong style="cursor:pointer" onclick="openUserProfile('${id}')">${escapeHtml(getUserName(id))}</strong>
      </div>
      <div class="messages" id="messages-${cssId(id)}"></div>
      <div class="compose-toolbar">
        <button data-emoji="🙂">🙂</button>
        <button data-emoji="😉">😉</button>
        <button data-emoji="😂">😂</button>
        <button data-emoji="❤️">❤️</button>
      </div>
      <div class="compose-row">
        <textarea placeholder="Сообщение..."></textarea>
        <button class="qip-btn send-btn">Отправить</button>
      </div>
    `;
    container.appendChild(win);

    const textarea = win.querySelector('textarea');
    const sendBtn = win.querySelector('.send-btn');

    win.querySelectorAll('.compose-toolbar button').forEach(btn => {
      btn.onclick = () => { textarea.value += btn.dataset.emoji; textarea.focus(); };
    });

    const send = () => {
      const text = textarea.value.trim();
      if(!text) return;
      textarea.value = '';
      messagesRef(id).add({
        uid: currentUser.uid,
        name: currentUser.name,
        text,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      playQipSound('send');
    };

    sendBtn.onclick = send;
    textarea.onkeydown = (e) => {
      if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); send(); }
    };
  }
}

function switchActiveWindow(id){
  const container = document.getElementById('chats-container');
  if(!container) return;
  container.querySelectorAll('.chat-window').forEach(w => {
    w.style.display = w.dataset.chatId === id ? 'flex' : 'none';
  });
  const emptyState = document.getElementById('empty-state');
  if (emptyState) emptyState.style.display = id ? 'none' : 'flex';
}

function subscribeMessages(id){
  if(unsubMessages[id]) return;
  unsubMessages[id] = messagesRef(id)
    .orderBy('createdAt', 'asc')
    .limitToLast(150)
    .onSnapshot(snap => {
      const el = document.getElementById(`messages-${cssId(id)}`);
      const msgs = [];
      snap.forEach(doc => msgs.push(doc.data()));

      if(el){
        el.innerHTML = msgs.map(m => {
          const mine = m.uid === currentUser?.uid;
          return `
            <div class="msg ${mine ? 'me' : 'them'}">
              <div class="msg-body">
                <div class="msg-header-line">
                  <span class="sender" style="cursor:pointer;" onclick="openUserProfile('${m.uid}')">${escapeHtml(m.name || 'Пользователь')}</span>
                  <span class="meta">${formatTime(m.createdAt)}</span>
                </div>
                <div class="msg-text">${escapeHtml(m.text)}</div>
              </div>
            </div>`;
        }).join('');
        el.scrollTop = el.scrollHeight;
      }

      if(!initializedChats.has(id)){
        initializedChats.add(id);
      } else {
        snap.docChanges().forEach(change => {
          if(change.type === 'added' && change.doc.data().uid !== currentUser?.uid){
            playQipSound('receive');
          }
        });
      }
    });
}

function playQipSound(type) {
  if (!soundEnabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'receive') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.setValueAtTime(900, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.setValueAtTime(800, ctx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    }
  } catch(e) {}
}

function getUserName(id){
  if(id === PUBLIC_ROOM_ID) return 'Общий чат';
  const u = allProfiles.find(u => u.id === id);
  return u ? u.name : '…';
}

function getUserStatus(id){
  if(id === PUBLIC_ROOM_ID) return 'online';
  const u = allProfiles.find(u => u.id === id);
  return u ? (u.status || 'offline') : 'offline';
}

function dmPath(otherUid){
  const pairId = [currentUser.uid, otherUid].sort().join('_');
  return db.collection('dms').doc(pairId).collection('messages');
}

function messagesRef(id){
  return id === PUBLIC_ROOM_ID
    ? db.collection('rooms').doc(PUBLIC_ROOM_ID).collection('messages')
    : dmPath(id);
}

function cssId(id){ return id.replace(/[^a-zA-Z0-9]/g, ''); }

function formatTime(ts){
  if(!ts || !ts.toDate) return '…';
  const d = ts.toDate();
  const pad = (n) => n.toString().padStart(2, '0');
  return `[${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}]`;
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}