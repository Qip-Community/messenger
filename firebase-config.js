// ЗАМЕНИ значения ниже на конфиг твоего Firebase-проекта.
// Как получить: Firebase Console → Настройки проекта → раздел "Ваши приложения" →
// веб-приложение (</>) → скопировать объект firebaseConfig.
// Это НЕ секретные ключи в привычном смысле — они видны в исходниках любого
// сайта на Firebase, доступ реально ограничивают правила безопасности Firestore
// (см. firestore.rules), а не сокрытие этих значений.

const firebaseConfig = {
  apiKey: "AIzaSyB6Sk-mw2WP18XGXziTfxoVPlGkhR0foHk",
  authDomain: "qip-community-messenger.firebaseapp.com",
  projectId: "qip-community-messenger",
  storageBucket: "qip-community-messenger.firebasestorage.app",
  messagingSenderId: "1:713297154992:web:44209411bf7c78b8b77c75",
  appId: "G-SN2CFLFT0V"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
