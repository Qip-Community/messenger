const firebaseConfig = {
  apiKey: "AIzaSyB6Sk-mw2WP18XGXziTfxoVPlGkhR0foHk",
  authDomain: "qip-community-messenger.firebaseapp.com",
  projectId: "qip-community-messenger",
  storageBucket: "qip-community-messenger.firebasestorage.app",
  messagingSenderId: "713297154992",
  appId: "1:713297154992:web:44209411bf7c78b8b77c75",
  measurementId: "G-SN2CFLFT0V"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();