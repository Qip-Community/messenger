let selectedContactElement = null;

const contextMenu = document.getElementById('contactMenu');
const menuTitle = document.getElementById('menuTitle');
const userInfoWin = document.getElementById('userInfoWin');
const chatWin = document.getElementById('chatWin');

// Обработка клика ПКМ по контактам
document.querySelectorAll('.contact-item').forEach(item => {
  item.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    event.stopPropagation();
    
    selectedContactElement = item;

    const uin = item.dataset.uin;
    const nick = item.dataset.nick;

    menuTitle.innerText = `${uin} - ${nick}`;

    // Фикс координаты от экрана
    contextMenu.style.left = `${event.clientX}px`;
    contextMenu.style.top = `${event.clientY}px`;
    contextMenu.style.display = 'block';
  });

  // Клик ЛКМ по контакту отлавливает выбор
  item.addEventListener('click', () => {
    selectedContactElement = item;
  });
});

// Закрытие ПКМ-меню при клике мимо
document.addEventListener('click', (event) => {
  if (!contextMenu.contains(event.target)) {
    contextMenu.style.display = 'none';
  }
});

// Открытие окна "Данные пользователя"
document.getElementById('btnUserInfo').addEventListener('click', (e) => {
  e.stopPropagation();
  if (!selectedContactElement) return;

  const dataset = selectedContactElement.dataset;

  document.getElementById('infoWinTitle').innerText = `Данные: [${dataset.uin} - ${dataset.nick}]`;
  document.getElementById('headerUin').innerText = dataset.uin || '-';
  document.getElementById('headerNick').innerText = dataset.nick || '-';
  document.getElementById('headerName').innerText = dataset.name || '-';
  document.getElementById('headerAddress').innerText = `${dataset.country || ''} ${dataset.city || ''}`.trim() || '-';
  document.getElementById('headerGender').innerText = dataset.gender || '-';
  document.getElementById('headerAge').innerText = dataset.age || '-';
  document.getElementById('headerDob').innerText = `${dataset.dobDay || ''}/${dataset.dobMonth || ''}/${dataset.dobYear || ''}`;

  document.getElementById('infoUin').value = dataset.uin || '';
  document.getElementById('tabInfoUin').value = dataset.uin || '';
  document.getElementById('infoNick').value = dataset.nick || '';
  document.getElementById('infoName').value = dataset.name || '';
  document.getElementById('infoGender').value = dataset.gender || '';
  document.getElementById('infoAge').value = dataset.age || '';
  
  document.getElementById('infoEmail').value = dataset.email || '';
  document.getElementById('infoCountry').value = dataset.country || '';
  document.getElementById('infoCity').value = dataset.city || '';
  document.getElementById('infoRegion').value = dataset.region || '';
  document.getElementById('infoPhone').value = dataset.phone || '';
  
  document.getElementById('infoCompany').value = dataset.workCompany || 'Не указано';
  document.getElementById('infoPosition').value = dataset.workPosition || 'Не указано';
  
  document.getElementById('infoDobDay').value = dataset.dobDay || '';
  document.getElementById('infoDobMonth').value = dataset.dobMonth || '';
  document.getElementById('infoDobYear').value = dataset.dobYear || '';
  
  document.getElementById('infoAbout').value = dataset.about || '';

  userInfoWin.style.display = 'block';
  contextMenu.style.display = 'none';
});

// Открытие окна отправки сообщения
document.getElementById('btnSendMessage').addEventListener('click', (e) => {
  e.stopPropagation();
  if (!selectedContactElement) return;

  const nick = selectedContactElement.dataset.nick;
  document.getElementById('chatWinTitle').innerText = `Сообщение для: ${nick}`;
  chatWin.style.display = 'block';
  contextMenu.style.display = 'none';
});

// Отправка текста в окно диалога
document.getElementById('btnSendMsg').addEventListener('click', () => {
  const input = document.getElementById('chatInput');
  const history = document.getElementById('chatHistory');
  if (input.value.trim() !== '') {
    const msg = document.createElement('div');
    msg.innerHTML = `<b>Я:</b> ${input.value}`;
    history.appendChild(msg);
    input.value = '';
    history.scrollTop = history.scrollHeight;
  }
});

// Скопировать UIN
document.getElementById('btnCopyUin').addEventListener('click', () => {
  if (selectedContactElement) {
    navigator.clipboard.writeText(selectedContactElement.dataset.uin);
  }
  contextMenu.style.display = 'none';
});

// Переключение вкладок
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

// Закрытия окон
document.getElementById('btnCloseInfo').addEventListener('click', () => userInfoWin.style.display = 'none');
document.getElementById('btnFooterClose').addEventListener('click', () => userInfoWin.style.display = 'none');
document.getElementById('btnCloseChat').addEventListener('click', () => chatWin.style.display = 'none');