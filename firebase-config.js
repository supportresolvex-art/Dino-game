// =========================================================
// FIREBASE CONFIGURATION (PRE-INSTALLED FOR DINORUNNERAPP)
// =========================================================
const firebaseConfig = {
  apiKey: "AIzaSyAcrlv04Z-7g9RWHNlKC-pouAhSxiWgjHY",
  authDomain: "dinorunnerapp.firebaseapp.com",
  databaseURL: "https://dinorunnerapp-default-rtdb.firebaseio.com",
  projectId: "dinorunnerapp",
  storageBucket: "dinorunnerapp.firebasestorage.app",
  messagingSenderId: "248897059588",
  appId: "1:248897059588:web:b4e0244adeaecf636fae51"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// Default Passwords & App Config (Live-synced with Admin Panel)
const DEFAULT_APP_CONFIG = {
  adminPass: "Admin890",
  userPass: "suraj5",
  dummyPass: "0000",
  maintenanceMode: false,
  mediaEnabled: true,
  mediaTTL: 600000, // 10 minutes default auto-delete
  broadcast: "",
  cloudName: "",
  cloudPreset: ""
};

// Default SVG Avatar Generator (Zero external network requests)
const DEFAULT_AVATAR =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <rect width="100" height="100" fill="#2a3942"/>
      <circle cx="50" cy="38" r="18" fill="#8696a0"/>
      <path d="M20 88 C20 66, 80 66, 80 88" fill="#8696a0"/>
    </svg>`
  );

// Lightweight Cipher so database text isn't stored in plain readable text
const CIPHER_KEY = "DINO_VAULT_2026_KEY";

function encodeSecretText(plainText) {
  if (!plainText) return "";
  try {
    const utf8Bytes = new TextEncoder().encode(plainText);
    let xored = "";
    for (let i = 0; i < utf8Bytes.length; i++) {
      const k = CIPHER_KEY.charCodeAt(i % CIPHER_KEY.length);
      xored += String.fromCharCode(utf8Bytes[i] ^ k);
    }
    return "ENC:" + btoa(xored);
  } catch (e) {
    return plainText;
  }
}

function decodeSecretText(cipherText) {
  if (!cipherText) return "";
  if (!cipherText.startsWith("ENC:")) return cipherText;
  try {
    const raw = atob(cipherText.slice(4));
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      const k = CIPHER_KEY.charCodeAt(i % CIPHER_KEY.length);
      bytes[i] = raw.charCodeAt(i) ^ k;
    }
    return new TextDecoder().decode(bytes);
  } catch (e) {
    return "[Encrypted Message]";
  }
}

// Helper: Show brief toast message
function showToast(msg, duration = 2600) {
  const el = document.getElementById("toast-box");
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => el.classList.add("hidden"), duration);
}
