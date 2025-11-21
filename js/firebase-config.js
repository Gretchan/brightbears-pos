// js/firebase-config.js

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBl7z84wQ20yE9_ktbjohvlAk49eCYkGHs",
  authDomain: "brightbears-pos.firebaseapp.com",
  projectId: "brightbears-pos",
  storageBucket: "brightbears-pos.firebasestorage.app",
  messagingSenderId: "249796070916",
  appId: "1:249796070916:web:f6ad4c8ec4e40206e1ef51"
};

// Initialize Firebase using the compat SDK already loaded in index.html
firebase.initializeApp(firebaseConfig);

// Create and export Firestore reference
const db = firebase.firestore();
