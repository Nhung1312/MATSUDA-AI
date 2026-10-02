import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  User 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp 
} from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBp8x8uUnx2wqEC3m0kb8_0r8Hr62AOX04",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "toan-thcs-2026.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "toan-thcs-2026",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "toan-thcs-2026.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "103179763579",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:103179763579:web:a245a638ea9bd2609147de"
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp 
};
export type { User };
