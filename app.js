const PUBLIC_ROOM_ID = 'public';

let currentUser = null;
let allProfiles = [];
let friendsList = [];
let incomingRequests = [];
let customGroups = ['Общая'];
let openTabs = [];
let activeTab = null;
let unsubMessages = {};
let settings = { soundEnabled: true };

function getDisplayUin(uid) {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = (hash << 5) - hash + uid.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash % 900000) + 100000;
}

const authScreen = document.getElementById('auth-screen');
const appEl = document.getElementById('app');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const settingsModal = document.getElementById('settings-modal');
const mainMenu = document.getElementById('main-menu-dropdown');

// Показ/скрытие меню
document.getElementById('main-menu-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  mainMenu.style.display = mainMenu.style.display === 'none' ? 'block' : 'none';
});

document.addEventListener('click', () => {
  if (mainMenu) mainMenu.style.display = 'none';
});

// Переключение табов входа
document.querySelectorAll('.auth-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const isLogin = btn.dataset.tab === 'login';
    loginForm.style.display = isLogin ? 'flex' : 'none';
    registerForm.style.display = isLogin ? 'none' : 'flex';
  });
});

// Авторизация
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    document.getElementById('login-error').textContent = err.message;
  }
});

// Регистрация
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('register-name').value.trim();
  const email = document.getElementById('register-email').value.trim();
  const password = document.getElementById('register-password').value;
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    const uin = getDisplayUin(cred.user.uid);
    await db.collection('users').doc(cred.user.uid).set({
      name: name || email.split('@')[0],
      email: email.toLowerCase(),
      uin: uin,
      status: 'online',
      mood: ''
    });
  } catch (err) {
    document.getElementById('register-error').textContent = err.message;
  }
});

// Отслеживание состояния входа
auth.onAuthStateChanged(async (user) => {
  if (user) {
    const doc = await db.collection('users').doc(user.uid).get();
    const data = doc.exists ? doc.data() : {};
    const uin = data.uin || getDisplayUin(user.uid);

    currentUser = {
      uid: user.uid,
      uin: uin,
      email: user.email.toLowerCase(),
      name: data.name || user.email.split('@')[0],
      status: data.status || 'online',
      mood: data.mood || ''
    };

    authScreen.style.display = 'none';
    appEl.style.display = 'flex';

    document.getElementById('own-name').textContent = currentUser.name;
    document.getElementById('own-avatar').textContent = currentUser.name[0]?.toUpperCase() || '?';

    listenProfiles();
    listenFriends();
    listenRequests();
    openChat(PUBLIC_ROOM_ID);
  } else {
    currentUser = null;
    authScreen.style.display = 'flex';
    appEl.style.display = 'none';
  }
});

document.getElementById('menu-logout')?.addEventListener('click', () => auth.signOut());

document.getElementById('status-select').addEventListener('change', async (e) => {
  const status = e.target.value;
  if (currentUser) {
    currentUser.status = status;
    await db.collection('users').doc(currentUser.uid).update({ status });
  }
});

// Окно Настроек
document.querySelectorAll('.sidebar-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
    document.querySelectorAll('.tab-page').forEach(p => p.classList.remove('active'));
    item.classList.add('active');
    document.getElementById(item.dataset.tab)?.classList.add('active');
  });
});

const openSettings = () => {
  document.getElementById('setting-name').value = currentUser.name || '';
  document.getElementById('setting-mood').value = currentUser.mood || '';
  document.getElementById('account-uin-display').textContent = currentUser.uin || '';
  document.getElementById('setting-sound').checked = settings.soundEnabled;
  settingsModal.style.display = 'flex';
};

document.getElementById('menu-settings')?.addEventListener('click', openSettings);

const closeSettings = () => { settingsModal.style.display = 'none'; };
document.getElementById('close-settings-btn')?.addEventListener('click', closeSettings);
document.getElementById('cancel-settings-btn')?.addEventListener('click', closeSettings);

document.getElementById('save-settings-btn')?.addEventListener('click', async () => {
  const newName = document.getElementById('setting-name').value.trim();
  const newMood = document.getElementById('setting-mood').value.trim();
  settings.soundEnabled = document.getElementById('setting-sound').checked;

  if (newName && currentUser) {
    currentUser.name = newName;
    currentUser.mood = newMood;
    document.getElementById('own-name').textContent = currentUser.name;
    document.getElementById('own-avatar').textContent = currentUser.name[0]?.toUpperCase() || '?';
    await db.collection('users').doc(currentUser.uid).update({ name: newName, mood: newMood });
  }
  closeSettings();
});

// Группы контактов
const createGroup = () => {
  const groupName = prompt("Введите название новой группы:");
  if (groupName && !customGroups.includes(groupName.trim())) {
    customGroups.push(groupName.trim());
    renderContacts();
  }
};

document.getElementById('add-group-btn')?.addEventListener('click', createGroup);
document.getElementById('menu-add-group')?.addEventListener('click', createGroup);

// Слушатели данных
function listenProfiles(){
  db.collection('users').onSnapshot(snap => {
    allProfiles = [];
    snap.forEach(doc => { if(doc.id !== currentUser.uid) allProfiles.push({ id: doc.id, ...doc.data() }); });
    renderContacts();
  });
}

function listenFriends(){
  db.collection('friendships').where('users', 'array-contains', currentUser.uid).onSnapshot(snap => {
    friendsList = [];
    snap.forEach(doc => {
      const data = doc.data();
      const friendId = data.users.find(id => id !== currentUser.uid);
      if(friendId) friendsList.push(friendId);
    });
    renderContacts();
    renderTabs();
  });
}

function listenRequests(){
  db.collection('friendRequests').where('to', '==', currentUser.uid).where('status', '==', 'pending').onSnapshot(snap => {
    incomingRequests = [];
    snap.forEach(doc => incomingRequests.push({ reqId: doc.id, ...doc.data() }));
    renderContacts();
  });
}

const addFriendPrompt = async () => {
  const query = prompt("Введите UIN или Email пользователя:");
  if(!query) return;

  const target = allProfiles.find(u => 
    String(u.uin) === query.trim() || 
    u.email.toLowerCase() === query.trim().toLowerCase()
  );

  if(!target){
    alert("Пользователь с таким UIN/Email не найден.");
    return;
  }

  if(friendsList.includes(target.id)){
    alert("Этот пользователь уже в вашем списке контактов.");
    return;
  }

  try {
    await db.collection('friendRequests').add({
      from: currentUser.uid,
      fromName: currentUser.name,
      to: target.id,
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    alert(`Заявка отправлена пользователю ${target.name}!`);
  } catch(err) {
    alert("Ошибка отправки: " + err.message);
  }
};

document.getElementById('add-friend-btn')?.addEventListener('click', addFriendPrompt);
document.getElementById('menu-add-user')?.addEventListener('click', addFriendPrompt);

async function acceptRequest(reqId, fromUid){
  const pairId = [currentUser.uid, fromUid].sort().join('_');
  await db.collection('friendships').doc(pairId).set({
    users: [currentUser.uid, fromUid],
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  await db.collection('friendRequests').doc(reqId).delete();
}

async function rejectRequest(reqId){
  await db.collection('friendRequests').doc(reqId).delete();
}

function renderContacts(){
  const list = document.getElementById('contacts-list');
  list.innerHTML = '';

  if(incomingRequests.length > 0){
    const reqHeader = document.createElement('div');
    reqHeader.style.cssText = 'background:#fff8dc; padding:4px; font-weight:bold; border-bottom:1px solid #ccc; color:#333;';
    reqHeader.textContent = `Заявки в друзья (${incomingRequests.length}):`;
    list.appendChild(reqHeader);

    incomingRequests.forEach(req => {
      const row = document.createElement('div');
      row.style.cssText = 'padding:4px; background:#fff; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center;';
      row.innerHTML = `
        <span style="font-weight:bold;">${escapeHtml(req.fromName)}</span>
        <div>
          <button class="accept-btn qip-btn" style="color:green; padding:0 4px;">✓</button>
          <button class="reject-btn qip-btn" style="color:red; padding:0 4px;">✕</button>
        </div>
      `;
      row.querySelector('.accept-btn').addEventListener('click', () => acceptRequest(req.reqId, req.from));
      row.querySelector('.reject-btn').addEventListener('click', () => rejectRequest(req.reqId));
      list.appendChild(row);
    });
  }

  const searchFilter = document.getElementById('search-input')?.value.toLowerCase() || '';
  const myFriends = allProfiles.filter(u => friendsList.includes(u.id) && u.name.toLowerCase().includes(searchFilter));

  customGroups.forEach(group => {
    const groupEl = document.createElement('div');
    groupEl.className = 'group-header';
    groupEl.textContent = `📁 ${group}`;
    list.appendChild(groupEl);

    myFriends.forEach(u => {
      const row = document.createElement('div');
      row.className = 'contact-row' + (u.id === activeTab ? ' active' : '');
      const displayUin = u.uin || getDisplayUin(u.id);
      row.innerHTML = `<span class="status-dot ${u.status || 'offline'}"></span> <span>${escapeHtml(u.name)} (${displayUin})</span>`;
      row.addEventListener('click', () => openChat(u.id));
      list.appendChild(row);
    });
  });
}

document.getElementById('search-input')?.addEventListener('input', renderContacts);

// Система Чата
function openChat(id){
  if(!openTabs.includes(id)) openTabs.push(id);
  activeTab = id;
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
    tab.textContent = id === PUBLIC_ROOM_ID ? 'Общий чат' : (allProfiles.find(u => u.id === id)?.name || 'Чат');
    tab.addEventListener('click', () => openChat(id));
    row.appendChild(tab);
  });
}

function renderChats(){
  const container = document.getElementById('chats-container');
  container.innerHTML = '';
  
  Object.keys(unsubMessages).forEach(id => {
    if (typeof unsubMessages[id] === 'function') unsubMessages[id]();
    delete unsubMessages[id];
  });

  openTabs.forEach(id => {
    const win = document.createElement('div');
    win.className = 'chat-window' + (id === activeTab ? ' active' : '');
    win.innerHTML = `
      <div class="messages" id="messages-${cssId(id)}"></div>
      <div class="compose-row">
        <textarea placeholder="Введите сообщение..."></textarea>
        <button class="send-btn qip-btn">Отправить</button>
      </div>
    `;
    container.appendChild(win);

    const textarea = win.querySelector('textarea');
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

    win.querySelector('.send-btn').addEventListener('click', send);
    textarea.addEventListener('keydown', (e) => { 
      if(e.key === 'Enter' && !e.shiftKey){ 
        e.preventDefault(); 
        send(); 
      } 
    });
    
    subscribeMessages(id);
  });
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const hrs = String(date.getHours()).padStart(2, '0');
  const mins = String(date.getMinutes()).padStart(2, '0');
  return `[${hrs}:${mins}]`;
}

function subscribeMessages(id){
  if(unsubMessages[id]) return;
  unsubMessages[id] = messagesRef(id).orderBy('createdAt', 'asc').limitToLast(100).onSnapshot(snap => {
    const el = document.getElementById(`messages-${cssId(id)}`);
    if(!el) return;
    const msgs = [];
    snap.forEach(doc => msgs.push(doc.data()));
    
    el.innerHTML = msgs.map(m => {
      const timeStr = formatTime(m.createdAt);
      const isMe = m.uid === currentUser.uid;
      return `<div class="msg ${isMe ? 'me' : 'them'}">
        <span class="msg-time">${timeStr}</span>
        <span class="msg-author">${escapeHtml(m.name)}:</span> 
        <span class="msg-text">${escapeHtml(m.text)}</span>
      </div>`;
    }).join('');
    
    el.scrollTop = el.scrollHeight;
  });
}

function messagesRef(id){
  return id === PUBLIC_ROOM_ID ? db.collection('rooms').doc(PUBLIC_ROOM_ID).collection('messages') : db.collection('dms').doc([currentUser.uid, id].sort().join('_')).collection('messages');
}

function cssId(id){ return id.replace(/[^a-zA-Z0-9]/g, ''); }
function escapeHtml(str){ return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }