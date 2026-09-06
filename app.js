// ===== QIP Community — Firebase (Auth + Firestore) =====

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

// DOM Элементы
const authScreen = document.getElementById('auth-screen');
const appEl = document.getElementById('app');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginError = document.getElementById('login-error');
const registerError = document.getElementById('register-error');

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
        status: 'online',
        mood: '',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (err) {
      if (registerError) registerError.textContent = translateAuthError(err);
    }
  });
}

function translateAuthError(err){
  const map = {
    'auth/email-already-in-use': 'Этот email уже зарегистрирован.',
    'auth/invalid-email': 'Некорректный email.',
    'auth/weak-password': 'Пароль слишком простой (минимум 6 символов).',
    'auth/user-not-found': 'Пользователь с таким email не найден.',
    'auth/wrong-password': 'Неверный пароль.',
    'auth/invalid-credential': 'Неверный email или пароль.'
  };
  return map[err.code] || ('Ошибка: ' + err.message);
}

// Отслеживание состояния авторизации
auth.onAuthStateChanged(async (user) => {
  if (user) {
    try {
      const doc = await db.collection('users').doc(user.uid).get();
      const data = doc.exists ? doc.data() : { name: user.email, status: 'online' };
      currentUser = { uid: user.uid, name: data.name || 'Пользователь', status: data.status || 'online' };

      if (authScreen) authScreen.style.display = 'none';
      if (appEl) appEl.style.display = 'flex';

      const ownName = document.getElementById('own-name');
      const ownAvatar = document.getElementById('own-avatar');
      const statusSelect = document.getElementById('status-select');

      if (ownName) ownName.textContent = currentUser.name;
      if (ownAvatar) ownAvatar.textContent = currentUser.name[0]?.toUpperCase() || '?';
      if (statusSelect) statusSelect.value = currentUser.status;

      setPresence('online');

      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }

      listenProfiles();
      listenFriendships();
      listenFriendRequests();
      openChat(PUBLIC_ROOM_ID);
    } catch(e) {
      console.error("Ошибка инициализации профиля:", e);
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
    incomingRequests = [];
    initializedChats = new Set();
    const chatsContainer = document.getElementById('chats-container');
    if(chatsContainer) chatsContainer.innerHTML = '';
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
  statusSelect.addEventListener('change', (e) => {
    setPresence(e.target.value);
  });
}

async function setPresence(status){
  if(!currentUser) return;
  currentUser.status = status;
  try{
    await db.collection('users').doc(currentUser.uid).update({ status });
  } catch(e) {}
}

function listenProfiles(){
  db.collection('users').onSnapshot(snap => {
    allProfiles = [];
    snap.forEach(doc => {
      if(doc.id === currentUser?.uid) return;
      allProfiles.push({ id: doc.id, ...doc.data() });
    });
    renderContacts();
    renderTabs();
  }, err => console.error("Ошибка получения профилей:", err));
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
    }, err => console.error("Ошибка загрузки списка друзей:", err));
}

function listenFriendRequests(){
  unsubRequests = db.collection('friendRequests')
    .where('to', '==', currentUser.uid)
    .where('status', '==', 'pending')
    .onSnapshot(snap => {
      incomingRequests = [];
      snap.forEach(doc => incomingRequests.push({ id: doc.id, ...doc.data() }));
      renderFriendRequests();
    }, err => console.error("Ошибка получения заявок:", err));
}

const addBtn = document.getElementById('add-friend-btn') || document.getElementById('add-contact-btn');
if(addBtn) {
  addBtn.addEventListener('click', async () => {
    const email = prompt('Email друга, которого хочешь добавить:');
    if(!email || !email.trim()) return;
    const targetEmail = email.trim().toLowerCase();

    const myDoc = await db.collection('users').doc(currentUser.uid).get();
    if(targetEmail === myDoc.data()?.email?.toLowerCase()){
      alert('Это твой собственный email!');
      return;
    }

    const target = allProfiles.find(p => (p.email || '').toLowerCase() === targetEmail);
    if(!target){
      alert('Пользователь с таким email не найден.');
      return;
    }
    if(friendUids.has(target.id)){
      alert('Вы уже друзья.');
      return;
    }

    const existing = await db.collection('friendRequests')
      .where('from', '==', currentUser.uid)
      .where('to', '==', target.id)
      .where('status', '==', 'pending')
      .get();
    if(!existing.empty){
      alert('Заявка уже отправлена, ждите ответа.');
      return;
    }

    await db.collection('friendRequests').add({
      from: currentUser.uid,
      fromName: currentUser.name,
      to: target.id,
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    alert('Заявка в друзья отправлена!');
  });
}

async function respondToRequest(reqId, accept){
  const req = incomingRequests.find(r => r.id === reqId);
  if(!req) return;
  await db.collection('friendRequests').doc(reqId).update({
    status: accept ? 'accepted' : 'declined'
  });
  if(accept){
    const pair = [currentUser.uid, req.from].sort();
    await db.collection('friendships').doc(pair.join('_')).set({
      users: pair,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }
}

function renderFriendRequests(){
  const box = document.getElementById('friend-requests-list');
  if(!box) return;
  if(!incomingRequests.length){ box.innerHTML = ''; return; }
  box.innerHTML = `<div class="group-header requests-header">Заявки в друзья (${incomingRequests.length})</div>` +
    incomingRequests.map(r => `
      <div class="friend-request-row" data-id="${r.id}">
        <span class="contact-name">${escapeHtml(r.fromName)}</span>
        <span class="request-actions">
          <button class="accept-btn" data-id="${r.id}">✓</button>
          <button class="decline-btn" data-id="${r.id}">✕</button>
        </span>
      </div>
    `).join('');
  box.querySelectorAll('.accept-btn').forEach(b => b.addEventListener('click', () => respondToRequest(b.dataset.id, true)));
  box.querySelectorAll('.decline-btn').forEach(b => b.addEventListener('click', () => respondToRequest(b.dataset.id, false)));
}

const searchInput = document.getElementById('search-input');
if(searchInput) searchInput.addEventListener('input', renderContacts);

function statusLabel(status){
  return { online:'В сети', away:'Отошёл', dnd:'Не беспокоить', offline:'Не в сети' }[status] || 'Не в сети';
}

function renderContacts(){
  const list = document.getElementById('contacts-list');
  if(!list) return;
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
  list.innerHTML = '';

  const pub = document.createElement('div');
  pub.className = 'contact-row public-room' + (activeTab === PUBLIC_ROOM_ID ? ' active' : '') + (unread[PUBLIC_ROOM_ID] ? ' unread' : '');
  pub.innerHTML = `
    <span class="status-dot online"></span>
    <span class="contact-meta">
      <span class="contact-name">💬 Общий чат</span>
      <span class="contact-mood">Все участники сообщества</span>
    </span>
    ${unread[PUBLIC_ROOM_ID] ? `<span class="unread-badge">${unread[PUBLIC_ROOM_ID]}</span>` : ''}
  `;
  pub.addEventListener('click', () => openChat(PUBLIC_ROOM_ID));
  list.appendChild(pub);

  const header = document.createElement('div');
  header.className = 'group-header';
  header.innerHTML = `<span class="arrow">▾</span> Друзья (${friendUids.size})`;
  list.appendChild(header);

  const friends = allProfiles
    .filter(p => friendUids.has(p.id))
    .filter(p => (p.name || '').toLowerCase().includes(query))
    .sort((a,b) => (a.name || '').localeCompare(b.name || ''));

  if(!friends.length){
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.textContent = 'Пока нет друзей — нажми "+" рядом с поиском и добавь по email.';
    list.appendChild(hint);
  }

  friends.forEach(u => {
    const row = document.createElement('div');
    const unreadCount = unread[u.id] || 0;
    row.className = 'contact-row' + (u.id === activeTab ? ' active' : '') + (unreadCount ? ' unread' : '');
    row.innerHTML = `
      <span class="status-dot ${u.status || 'offline'}"></span>
      <span class="contact-meta">
        <span class="contact-name">${escapeHtml(u.name)}</span>
        <span class="contact-mood">${escapeHtml(u.mood || statusLabel(u.status))}</span>
      </span>
      ${unreadCount ? `<span class="unread-badge">${unreadCount}</span>` : ''}
    `;
    row.addEventListener('click', () => openChat(u.id));
    list.appendChild(row);
  });
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

function openChat(id){
  if(!openTabs.includes(id)) openTabs.push(id);
  activeTab = id;
  unread[id] = 0;
  updateTitle();
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
  if(unsubMessages[id]){ unsubMessages[id](); delete unsubMessages[id]; }
  initializedChats.delete(id);
  
  const win = document.querySelector(`.chat-window[data-chat-id="${id}"]`);
  if(win) win.remove();

  if(activeTab === id){
    activeTab = openTabs.length ? openTabs[openTabs.length - 1] : null;
  }
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
    tab.innerHTML = `<span class="status-dot ${getUserStatus(id)}"></span> ${escapeHtml(getUserName(id))} ${closeBtn}`;
    tab.addEventListener('click', () => openChat(id));
    const cb = tab.querySelector('.close-tab');
    if(cb) cb.addEventListener('click', (e) => closeChat(id, e));
    row.appendChild(tab);
  });
}

function ensureChatWindowExists(id){
  const container = document.getElementById('chats-container');
  if(!container) return;
  
  // Если окно диалога с этим пользователем уже создано — не пересоздаем его!
  let win = container.querySelector(`.chat-window[data-chat-id="${id}"]`);
  if(!win){
    win = document.createElement('div');
    win.className = 'chat-window';
    win.dataset.chatId = id;
    win.style.display = 'none'; // По умолчанию скрыто
    win.innerHTML = `
      <div class="chat-header">
        <span class="status-dot ${getUserStatus(id)}"></span>
        <strong>${escapeHtml(getUserName(id))}</strong>
        ${id !== PUBLIC_ROOM_ID ? `<span class="mood">${escapeHtml(statusLabel(getUserStatus(id)))}</span>` : ''}
      </div>
      <div class="messages" id="messages-${cssId(id)}"></div>
      <div class="compose-toolbar">
        <button data-emoji="🙂">🙂</button>
        <button data-emoji="😉">😉</button>
        <button data-emoji="😂">😂</button>
        <button data-emoji="❤️">❤️</button>
        <button data-emoji="👍">👍</button>
      </div>
      <div class="compose-row">
        <textarea placeholder="Введите сообщение и нажмите Enter…"></textarea>
        <button class="send-btn">Отправить</button>
      </div>
    `;
    container.appendChild(win);

    const textarea = win.querySelector('textarea');
    const sendBtn = win.querySelector('.send-btn');

    win.querySelectorAll('.compose-toolbar button').forEach(btn => {
      btn.addEventListener('click', () => { textarea.value += btn.dataset.emoji; textarea.focus(); });
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
    };

    sendBtn.addEventListener('click', send);
    textarea.addEventListener('keydown', (e) => {
      if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); send(); }
    });
  }
}

function switchActiveWindow(id){
  const container = document.getElementById('chats-container');
  const empty = document.getElementById('empty-state');
  if(!container) return;
  
  // Явно переключаем видимость блоков через display, чтобы сообщения не терялись
  container.querySelectorAll('.chat-window').forEach(w => {
    if(w.dataset.chatId === id){
      w.classList.add('active');
      w.style.display = 'flex';
    } else {
      w.classList.remove('active');
      w.style.display = 'none';
    }
  });

  if(empty) empty.style.display = id ? 'none' : 'flex';
}

function cssId(id){ return id.replace(/[^a-zA-Z0-9]/g, ''); }

function subscribeMessages(id){
  if(unsubMessages[id]) return;
  unsubMessages[id] = messagesRef(id)
    .orderBy('createdAt', 'asc')
    .limitToLast(300)
    .onSnapshot(snap => {
      const el = document.getElementById(`messages-${cssId(id)}`);
      const msgs = [];
      snap.forEach(doc => msgs.push(doc.data()));

      if(el){
        el.innerHTML = msgs.map(m => {
          const mine = m.uid === currentUser?.uid;
          const showName = id === PUBLIC_ROOM_ID && !mine;
          return `
            <div class="msg ${mine ? 'me' : 'them'}">
              ${showName ? `<span class="sender">${escapeHtml(m.name || '')}</span>` : ''}
              ${escapeHtml(m.text)}
              <span class="meta">${formatTime(m.createdAt)}</span>
            </div>`;
        }).join('');
        el.scrollTop = el.scrollHeight;
      }

      const isFirstLoad = !initializedChats.has(id);
      initializedChats.add(id);

      if(!isFirstLoad){
        snap.docChanges().forEach(change => {
          if(change.type === 'added'){
            const m = change.doc.data();
            if(m.uid !== currentUser?.uid){
              notifyIncoming(id, m);
              if(id !== activeTab){
                unread[id] = (unread[id] || 0) + 1;
                renderContacts();
                renderTabs();
                updateTitle();
              }
            }
          }
        });
      }
    }, err => console.error("Ошибка получения сообщений:", err));
}

function formatTime(ts){
  if(!ts || !ts.toDate) return '…';
  const d = ts.toDate();
  return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
}

let audioCtx = null;
function playBeep(){
  try{
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(880, audioCtx.currentTime);
    o.frequency.setValueAtTime(1175, audioCtx.currentTime + 0.09);
    g.gain.setValueAtTime(0.15, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.28);
    o.connect(g); g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 0.28);
  }catch(e){}
}

function notifyIncoming(id, m){
  playBeep();
  if('Notification' in window && Notification.permission === 'granted' && document.hidden){
    try{
      new Notification(m.name || getUserName(id), { body: m.text });
    }catch(e){}
  }
}

function updateTitle(){
  const total = Object.values(unread).reduce((a,b) => a + b, 0);
  document.title = total > 0 ? `(${total}) ${BASE_TITLE}` : BASE_TITLE;
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}