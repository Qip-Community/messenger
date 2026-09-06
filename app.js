document.addEventListener('DOMContentLoaded', () => {
  const contextMenu = document.getElementById('contactMenu') || document.querySelector('.context-menu');
  const userInfoWin = document.getElementById('userInfoWin') || document.querySelector('.user-info-win');
  let selectedContact = null;

  // Находим все элементы контактов (работает и с классами, и с тегами)
  const contacts = document.querySelectorAll('.contact-item, [data-uin]');

  contacts.forEach(contact => {
    // Кликер ПКМ
    contact.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      selectedContact = contact;

      if (contextMenu) {
        contextMenu.style.position = 'fixed';
        contextMenu.style.left = e.clientX + 'px';
        contextMenu.style.top = e.clientY + 'px';
        contextMenu.style.display = 'block';
        contextMenu.style.zIndex = '999999';
      }
    });
  });

  // Закрытие ПКМ-меню по клику мимо
  document.addEventListener('click', (e) => {
    if (contextMenu && !contextMenu.contains(e.target)) {
      contextMenu.style.display = 'none';
    }
  });

  // Открытие окна инфо
  const btnInfo = document.getElementById('btnUserInfo') || document.querySelector('[data-action="info"]');
  if (btnInfo) {
    btnInfo.addEventListener('click', (e) => {
      e.stopPropagation();
      if (contextMenu) contextMenu.style.display = 'none';
      if (userInfoWin) {
        userInfoWin.style.position = 'fixed';
        userInfoWin.style.top = '50%';
        userInfoWin.style.left = '50%';
        userInfoWin.style.transform = 'translate(-50%, -50%)';
        userInfoWin.style.display = 'block';
        userInfoWin.style.zIndex = '9999999';
      }
    });
  }

  // Закрытие окна инфо
  const closeBtns = document.querySelectorAll('#btnCloseInfo, #btnFooterClose, .close-btn');
  closeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (userInfoWin) userInfoWin.style.display = 'none';
    });
  });
});