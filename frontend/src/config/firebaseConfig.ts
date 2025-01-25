// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAMRsSBJKHwEIevZxNQaBD0fwlHf-KCjpI",
  authDomain: "cultureconnectv2.firebaseapp.com",
  projectId: "cultureconnectv2",
  storageBucket: "cultureconnectv2.firebasestorage.app",
  messagingSenderId: "197753224241",
  appId: "1:197753224241:web:bf6d80d6d8ab56514d2910"
};

// Initialize Firebase
export const firebaseApp = initializeApp(firebaseConfig);