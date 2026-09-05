// ===== QIP Community — Firebase (Auth + Firestore) + друзья + уведомления =====

const PUBLIC_ROOM_ID = 'public';
const BASE_TITLE = document.title;

let currentUser = null;      // { uid, name, status }
let allProfiles = [];        // все зарегистрированные пользователи (профили, кроме себя)
let friendUids = new Set();  // uid-ы принятых друзей
let openTabs = [];           // 'public' или uid друга
let activeTab = null;
let unsubMessages = {};      // id -> unsubscribe firestore listener
let unread = {};             // id -> счётчик непрочитанных
let initializedChats = new Set(); // чтобы не звенеть на всю историю при первой загрузке
let unsubFriendships = null;
let unsubRequests = null;
let incomingRequests = [];   // входящие заявки в друзья (pending)

// ===== DOM: авторизация =====
const authScreen = document.getElementById('auth-screen');
const appEl = document.getElementById('app');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginError = document.getElementById('login-error');
const registerError = document.getElementById('register-error');

document.querySelectorAll('.auth-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const isLogin = btn.dataset.tab === 'login';
    loginForm.style.display = isLogin ? 'flex' : 'none';
    registerForm.style.display = isLogin ? 'none' : 'flex';
  });
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    loginError.textContent = translateAuthError(err);
  }
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  registerError.textContent = '';
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
    registerError.textContent = translateAuthError(err);
  }
});

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

// ===== Auth state =====
auth.onAuthStateChanged(async (user) => {
  if (user) {
    const doc = await db.collection('users').doc(user.uid).get();
    const data = doc.exists ? doc.data() : { name: user.email, status: 'online' };
    currentUser = { uid: user.uid, name: data.name, status: data.status || 'online' };

    authScreen.style.display = 'none';
    appEl.style.display = 'flex';

    document.getElementById('own-name').textContent = currentUser.name;
    document.getElementById('own-avatar').textContent = currentUser.name[0]?.toUpperCase() || '?';
    document.getElementById('status-select').value = currentUser.status;

    setPresence('online');
    window.addEventListener('beforeunload', () => setPresence('offline'));

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    listenProfiles();
    listenFriendships();
    listenFriendRequests();
    openChat(PUBLIC_ROOM_ID);
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
    authScreen.style.display = 'flex';
    appEl.style.display = 'none';
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await setPresence('offline');
  await auth.signOut();
});

document.getElementById('status-select').addEventListener('change', (e) => {
  setPresence(e.target.value);
});

async function setPresence(status){
  if(!currentUser) return;
  currentUser.status = status;
  try{
    await db.collection('users').doc(currentUser.uid).update({ status });
  }catch(e){ /* пользователь мог уже разлогиниться */ }
}

// ===== Профили всех пользователей (нужны для карточек друзей и поиска по email) =====
function listenProfiles(){
  db.collection('users').onSnapshot(snap => {
    allProfiles = [];
    snap.forEach(doc => {
      if(doc.id === currentUser.uid) return;
      allProfiles.push({ id: doc.id, ...doc.data() });
    });
    renderContacts();
    renderTabs();
  });
}

// ===== Друзья =====
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

document.getElementById('add-friend-btn').addEventListener('click', async () => {
  const email = prompt('Email друга, которого хочешь добавить:');
  if(!email || !email.trim()) return;
  const targetEmail = email.trim().toLowerCase();

  if(targetEmail === (currentUser && (await db.collection('users').doc(currentUser.uid).get()).data().email)){
    alert('Это твой собственный email :)');
    return;
  }

  const target = allProfiles.find(p => (p.email || '').toLowerCase() === targetEmail);
  if(!target){
    alert('Пользователь с таким email не зарегистрирован в QIP Community.');
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

// ===== Список контактов (только друзья) =====
const searchInput = document.getElementById('search-input');
searchInput.addEventListener('input', renderContacts);

function statusLabel(status){
  return { online:'В сети', away:'Отошёл', dnd:'Не беспокоить', offline:'Не в сети' }[status] || 'Не в сети';
}

function renderContacts(){
  const list = document.getElementById('contacts-list');
  const query = searchInput.value.trim().toLowerCase();
  list.innerHTML = '';

  // Пин: общий чат
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
    .filter(p => p.name.toLowerCase().includes(query))
    .sort((a,b) => a.name.localeCompare(b.name));

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

// ===== Вкладки и чаты =====
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
  renderChats();
  renderContacts();
  subscribeMessages(id);
}

function closeChat(id, evt){
  if(evt) evt.stopPropagation();
  if(id === PUBLIC_ROOM_ID) return; // общий чат не закрываем
  openTabs = openTabs.filter(t => t !== id);
  if(unsubMessages[id]){ unsubMessages[id](); delete unsubMessages[id]; }
  initializedChats.delete(id);
  if(activeTab === id){
    activeTab = openTabs.length ? openTabs[openTabs.length - 1] : null;
  }
  renderTabs();
  renderChats();
  renderContacts();
}

function renderTabs(){
  const row = document.getElementById('tabs-row');
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

function renderChats(){
  const container = document.getElementById('chats-container');
  const empty = document.getElementById('empty-state');
  container.innerHTML = '';
  empty.style.display = openTabs.length ? 'none' : 'flex';

  openTabs.forEach(id => {
    const win = document.createElement('div');
    win.className = 'chat-window' + (id === activeTab ? ' active' : '');
    win.dataset.chatId = id;

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

    function send(){
      const text = textarea.value.trim();
      if(!text) return;
      textarea.value = '';
      messagesRef(id).add({
        uid: currentUser.uid,
        name: currentUser.name,
        text,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    sendBtn.addEventListener('click', send);
    textarea.addEventListener('keydown', (e) => {
      if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); send(); }
    });
  });
}

function cssId(id){ return id.replace(/[^a-zA-Z0-9]/g, ''); }

function subscribeMessages(id){
  if(unsubMessages[id]) return; // уже подписаны, сообщения хранятся в Firestore постоянно
  unsubMessages[id] = messagesRef(id)
    .orderBy('createdAt', 'asc')
    .limitToLast(300)
    .onSnapshot(snap => {
      const el = document.getElementById(`messages-${cssId(id)}`);
      const msgs = [];
      snap.forEach(doc => msgs.push(doc.data()));

      if(el){
        el.innerHTML = msgs.map(m => {
          const mine = m.uid === currentUser.uid;
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

      // Уведомления/звук только для НОВЫХ сообщений, не для истории при первой загрузке
      const isFirstLoad = !initializedChats.has(id);
      initializedChats.add(id);

      if(!isFirstLoad){
        snap.docChanges().forEach(change => {
          if(change.type === 'added'){
            const m = change.doc.data();
            if(m.uid !== currentUser.uid){
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
    });
}

function formatTime(ts){
  if(!ts || !ts.toDate) return '…';
  const d = ts.toDate();
  return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
}

// ===== Уведомления: звук + системное всплывающее окно =====
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
  }catch(e){ /* браузер мог заблокировать звук до первого клика пользователя — это нормально */ }
}

function notifyIncoming(id, m){
  playBeep();
  if('Notification' in window && Notification.permission === 'granted' && document.hidden){
    try{
      new Notification(m.name || getUserName(id), { body: m.text });
    }catch(e){ /* игнор */ }
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
