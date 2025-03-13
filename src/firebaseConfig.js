// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";

import { getAuth } from "firebase/auth";

import { getFirestore } from 'firebase/firestore';
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyARC5oaY3Waw9m6ygXfocGYuRsj9gMhLXw",
  authDomain: "app-conductores-76c70.firebaseapp.com",
  projectId: "app-conductores-76c70",
  storageBucket: "app-conductores-76c70.firebasestorage.app",
  messagingSenderId: "196409488056",
  appId: "1:196409488056:web:2da975626925f8f060fa4d",
  measurementId: "G-XR7QWB00TS"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
export const db = getFirestore(app);
export {auth}