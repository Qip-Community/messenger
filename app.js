// ===== QIP Community — Firebase v10 (modular) =====

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limitToLast,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ---------- Конфиг Firebase ----------
// ВСТАВЬ СВОЙ КОНФИГ (из консоли Firebase → Project settings → Your apps → Web)
const firebaseConfig = {
  apiKey: "ВСТАВЬ",
  authDomain: "ВСТАВЬ",
  projectId: "ВСТАВЬ",
  storageBucket: "ВСТАВЬ",
  messagingSenderId: "ВСТАВЬ",
  appId: "ВСТАВЬ"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ===== Далее — вся логика приложения =====

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
const dmHeadersEnsured = new Set();

// DOM
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
      await signInWithEmailAndPassword(auth, email, password);
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
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, 'users', cred.user.uid), {
        name: name || email.split('@')[0],
        email: email.toLowerCase(),
        status: 'online',
        mood: '',
        createdAt: serverTimestamp()
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

onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      const docRef = doc(db, 'users', user.uid);
      const snap = await getDoc(docRef);
      const data = snap.exists() ? snap.data() : { name: user.email, status: 'online' };
      currentUser = { uid: user.uid, name: data.name || 'Пользователь', status: data.status || 'online' };

      if (authScreen) authScreen.style.display = 'none';
      if (appEl) appEl.style.display = 'flex';

      const ownName = document.getElementById('own-name');
      const ownAvatar = document.getElementById('own-avatar');
      const statusSelectEl = document.getElementById('status-select');

      if (ownName) ownName.textContent = currentUser.name;
      if (ownAvatar) ownAvatar.textContent = currentUser.name[0]?.toUpperCase() || '?';
      if (statusSelectEl) statusSelectEl.value = currentUser.status;

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
    dmHeadersEnsured.clear();
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
    await signOut(auth);
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
    await updateDoc(doc(db, 'users', currentUser.uid), { status });
  } catch(e) {}
}

function listenProfiles(){
  onSnapshot(collection(db, 'users'), snap => {
    allProfiles = [];
    snap.forEach(d => {
      if(d.id === currentUser?.uid) return;
      allProfiles.push({ id: d.id, ...d.data() });
    });
    renderContacts();
    renderTabs();
  }, err => console.error("Ошибка получения профилей:", err));
}

function listenFriendships(){
  const q = query(collection(db, 'friendships'), where('users', 'array-contains', currentUser.uid));
  unsubFriendships = onSnapshot(q, snap => {
    friendUids = new Set();
    snap.forEach(d => {
      const other = d.data().users.find(u => u !== currentUser.uid);
      if(other) friendUids.add(other);
    });
    renderContacts();
  }, err => console.error("Ошибка загрузки списка друзей:", err));
}

function listenFriendRequests(){
  const q = query(
    collection(db, 'friendRequests'),
    where('to', '==', currentUser.uid),
    where('status', '==', 'pending')
  );
  unsubRequests = onSnapshot(q, snap => {
    incomingRequests = [];
    snap.forEach(d => incomingRequests.push({ id: d.id, ...d.data() }));
    renderFriendRequests();
  }, err => console.error("Ошибка получения заявок:", err));
}

const addBtn = document.getElementById('add-friend-btn') || document.getElementById('add-contact-btn');
if(addBtn) {
  addBtn.addEventListener('click', async () => {
    const email = prompt('Email друга, которого хочешь добавить:');
    if(!email || !email.trim()) return;
    const targetEmail = email.trim().toLowerCase();

    const mySnap = await getDoc(doc(db, 'users', currentUser.uid));
    if(targetEmail === mySnap.data()?.email?.toLowerCase()){
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

    const existingQ = query(
      collection(db, 'friendRequests'),
      where('from', '==', currentUser.uid),
      where('to', '==', target.id),
      where('status', '==', 'pending')
    );
    const existing = await new Promise(res => {
      const unsub = onSnapshot(existingQ, snap => { unsub(); res(snap); },
        err => { unsub(); res({ empty: true }); });
    });
    if(!existing.empty){
      alert('Заявка уже отправлена, ждите ответа.');
      return;
    }

    try {
      await addDoc(collection(db, 'friendRequests'), {
        from: currentUser.uid,
        fromName: currentUser.name,
        to: target.id,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      alert('Заявка в друзья отправлена!');
    } catch(e) {
      console.error(e);
      alert('Не удалось отправить заявку: ' + e.message);
    }
  });
}

async function respondToRequest(reqId, accept){
  const req = incomingRequests.find(r => r.id === reqId);
  if(!req) return;
  try {
    await updateDoc(doc(db, 'friendRequests', reqId), {
      status: accept ? 'accepted' : 'declined'
    });
    if(accept){
      const pair = [currentUser.uid, req.from].sort();
      await setDoc(doc(db, 'friendships', pair.join('_')), {
        users: pair,
        createdAt: serverTimestamp()
      });
    }
  } catch(e) {
    console.error(e);
    alert('Ошибка обработки заявки: ' + e.message);
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
  const q = searchInput ? searchInput.value.trim().toLowerCase() : '';
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
    .filter(p => (p.name || '').toLowerCase().includes(q))
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

function dmPairId(otherUid){
  return [currentUser.uid, otherUid].sort().join('_');
}

function messagesRef(id){
  return id === PUBLIC_ROOM_ID
    ? collection(db, 'rooms', PUBLIC_ROOM_ID, 'messages')
    : collection(db, 'dms', dmPairId(id), 'messages');
}

async function ensureDmHeader(otherUid){
  if(otherUid === PUBLIC_ROOM_ID) return;
  const pairId = dmPairId(otherUid);
  if(dmHeadersEnsured.has(pairId)) return;
  dmHeadersEnsured.add(pairId);

  const ref = doc(db, 'dms', pairId);
  try {
    const snap = await getDoc(ref);
    if(!snap.exists()){
      await setDoc(ref, {
        members: [currentUser.uid, otherUid].sort(),
        createdAt: serverTimestamp()
      });
    }
  } catch(e) {
    console.error('Не удалось создать шапку DM:', e);
    dmHeadersEnsured.delete(pairId);
  }
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
  ensureDmHeader(id);
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

  let win = container.querySelector(`.chat-window[data-chat-id="${id}"]`);
  if(!win){
    win = document.createElement('div');
    win.className = 'chat-window';
    win.dataset.chatId = id;
    win.style.display = 'none';
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

    const send = async () => {
      const text = textarea.value.trim();
      if(!text) return;
      textarea.value = '';

      if(id !== PUBLIC_ROOM_ID){
        await ensureDmHeader(id);
      }

      try {
        await addDoc(messagesRef(id), {
          uid: currentUser.uid,
          name: currentUser.name,
          text,
          createdAt: serverTimestamp()
        });
      } catch(e) {
        console.error('Ошибка отправки сообщения:', e);
        alert('Не удалось отправить сообщение: ' + e.message);
      }
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
  const q = query(messagesRef(id), orderBy('createdAt', 'asc'), limitToLast(300));
  unsubMessages[id] = onSnapshot(q, snap => {
    const el = document.getElementById(`messages-${cssId(id)}`);
    const msgs = [];
    snap.forEach(d => msgs.push(d.data()));

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
