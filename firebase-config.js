// ===== Firebase config + инициализация =====
// Вставь свои значения из Firebase Console → Project settings → Your apps → Web

const firebaseConfig = {
  apiKey: "AIzaSyB6Sk-mw2WP18XGXziTfxoVPlGkhR0foHk",
  authDomain: "qip-community-messenger.firebaseapp.com",
  projectId: "qip-community-messenger",
  storageBucket: "qip-community-messenger.firebasestorage.app",
  messagingSenderId: "1:713297154992:web:44209411bf7c78b8b77c75",
  appId: "1:123456789:web:abcdef"
};

firebase.initializeApp(firebaseConfig);

// Глобальные объекты для app.js
window.auth = firebase.auth();
window.db   = firebase.firestore();

