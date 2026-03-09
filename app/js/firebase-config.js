import { initializeApp } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, deleteUser, reauthenticateWithCredential, EmailAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, Timestamp } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBNqa6JHHe2yuriloiCA_yjzzBAf0KQmbY",
  authDomain: "dm-auth-65cc4.firebaseapp.com",
  projectId: "dm-auth-65cc4",
  storageBucket: "dm-auth-65cc4.appspot.com",
  messagingSenderId: "331110328467",
  appId: "1:331110328467:web:060b48abefdff486330566"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export {
  auth, db,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, deleteUser, reauthenticateWithCredential,
  EmailAuthProvider, onAuthStateChanged, signOut,
  doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, Timestamp
};
