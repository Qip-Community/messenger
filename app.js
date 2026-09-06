// Глобальный контекст выбранного контакта
let selectedContactElement = null;

// DOM элементы
const contextMenu = document.getElementById('contactMenu');
const menuTitle = document.getElementById('menuTitle');
const userInfoWin = document.getElementById('userInfoWin');

// Обработка клика правой кнопкой мыши по контактам
document.querySelectorAll('.contact-item').forEach(item => {
  item.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    selectedContactElement = item;

    const uin = item.dataset.uin;
    const nick = item.dataset.nick;

    // Обновляем заголовок контекстного меню
    menuTitle.innerText = `${uin} - ${nick}`;

    // Позиционируем меню
    contextMenu.style.left = `${event.pageX}px`;
    contextMenu.style.top = `${event.pageY}px`;
    contextMenu.style.display = 'block';
  });
});

// Закрытие контекстного меню при клике мимо
document.addEventListener('click', (event) => {
  if (!contextMenu.contains(event.target)) {
    contextMenu.style.display = 'none';
  }
});

// Открытие окна "Данные пользователя"
document.getElementById('btnUserInfo').addEventListener('click', () => {
  if (!selectedContactElement) return;

  const dataset = selectedContactElement.dataset;

  // Заполнение шапки формы
  document.getElementById('infoWinTitle').innerText = `Данные: [${dataset.uin} - ${dataset.nick}]`;
  document.getElementById('headerUin').innerText = dataset.uin || '';
  document.getElementById('headerNick').innerText = dataset.nick || '';
  document.getElementById('headerName').innerText = dataset.name || '';
  document.getElementById('headerAddress').innerText = `${dataset.country || ''} ${dataset.city || ''}`;
  document.getElementById('headerGender').innerText = dataset.gender || '';
  document.getElementById('headerAge').innerText = dataset.age || '';
  document.getElementById('headerDob').innerText = `${dataset.dobDay}/${dataset.dobMonth}/${dataset.dobYear}`;

  // Заполнение полей во вкладках
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

  // Отображение окна
  userInfoWin.style.display = 'block';
  contextMenu.style.display = 'none';
});

// Скопировать UIN
document.getElementById('btnCopyUin').addEventListener('click', () => {
  if (selectedContactElement) {
    const uin = selectedContactElement.dataset.uin;
    navigator.clipboard.writeText(uin);
  }
  contextMenu.style.display = 'none';
});

// Переключение вкладок в окне UserInfo
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

    btn.classList.add('active');
    const targetTab = btn.dataset.tab;
    document.getElementById(targetTab).classList.add('active');
  });
});

// Закрытие окна данных
document.getElementById('btnCloseInfo').addEventListener('click', () => {
  userInfoWin.style.display = 'none';
});

document.getElementById('btnFooterClose').addEventListener('click', () => {
  userInfoWin.style.display = 'none';
});