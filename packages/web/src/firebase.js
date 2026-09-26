// Using mock Firebase for testing with full system support
export {
  auth,
  db,
  SCORE_MIN,
  SCORE_MAX,
  SCORE_STEP,
  SCORE_VALUES,
  JUDGE_COUNT,
  clampScore,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy,
  limit,
  getScoringTemplate,
  calculateAverageScore,
  testData,
  debugData,
} from './firebase-mock-expanded'

/* To use real Firebase instead of mock:
   1. Delete all exports above
   2. Uncomment the original Firebase code below
   3. Fill in .env with Firebase credentials from console.firebase.google.com
   4. Run: npm run dev

// Original Firebase configuration (commented out for testing)
// import { initializeApp } from 'firebase/app'
// import { getAuth } from 'firebase/auth'
// import { getFirestore } from 'firebase/firestore'
// import {
//   signInWithEmailAndPassword, signOut, onAuthStateChanged
// } from 'firebase/auth'
// import {
//   collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
//   serverTimestamp, onSnapshot, query, orderBy, limit
// } from 'firebase/firestore'
//
// const app = initializeApp({
//   apiKey: import.meta.env.VITE_FB_API_KEY,
//   authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
//   projectId: import.meta.env.VITE_FB_PROJECT_ID,
//   storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
//   messagingSenderId: import.meta.env.VITE_FB_SENDER_ID,
//   appId: import.meta.env.VITE_FB_APP_ID,
// })
//
// export const auth = getAuth(app)
// export const db = getFirestore(app)
//
// export const SCORE_MIN = 1
// export const SCORE_MAX = 3
// export const SCORE_STEP = 1
// export const SCORE_VALUES = [1, 2, 3]
// export const JUDGE_COUNT = 4
//
// export const clampScore = (v) =>
//   Math.min(SCORE_MAX, Math.max(SCORE_MIN, Math.round(v)))
*/
