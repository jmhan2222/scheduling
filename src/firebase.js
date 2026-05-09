import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDf5b-7sC9hilzJlaXVqufUYmM4-JxKlWU",
  authDomain: "schedule-app-38e12.firebaseapp.com",
  projectId: "schedule-app-38e12",
  storageBucket: "schedule-app-38e12.firebasestorage.app",
  messagingSenderId: "531422839455",
  appId: "1:531422839455:web:7b76fb4d580ddc2fc458aa"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
