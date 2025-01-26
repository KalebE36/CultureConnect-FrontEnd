import React from "react";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
} from "firebase/firestore";
import { firebaseApp } from "../../../config/firebaseConfig";
import { useNavigate } from "react-router-dom";

export default function LoginScreen() {
  const navigate = useNavigate();
  const auth = getAuth(firebaseApp);
  const db = getFirestore(firebaseApp);

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();

    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      if (user) {
        const accountId = user.uid;
        const userRef = doc(db, "users", accountId);
        const userSnapshot = await getDoc(userRef);

        if (!userSnapshot.exists()) {
          await setDoc(userRef, {
            account_id: accountId,
            learning_language: "English",
            name: user.displayName || "Anonymous",
            native_language: "Unknown",
            pfp: user.photoURL || "",
          });
          console.log("New user added to Firestore");
        } else {
          console.log("User already exists in Firestore");
        }

        navigate("/");
      }
    } catch (error) {
      console.error("Error signing in with Google:", error);
    }
  };

  return (
    <main className="relative w-screen h-screen bg-[#4f70e2] overflow-hidden">
      {/* 
        Top-left “wave”:
        - 50vw x 50vw circle
        - bottom-right corner rounded to 100%
        Adjust w-[50vw] h-[50vw] to see more or less curve. 
      */}
      <div className="absolute top-0 left-0 w-[30vw] h-[15vw] bg-gray-300 rounded-br-full" />
      {/* 
        Bottom-right “wave”:
        - 50vw x 50vw circle
        - top-left corner rounded to 100%
      */}
      <div className="absolute bottom-0 right-0 w-[15vw] h-[30vw] bg-[#e1e8fa] rounded-tl-full" />

      {/* Centered login card stays above the waves */}
      <div className="relative flex items-center justify-center w-full h-full">
        <div className="bg-white p-8 rounded shadow-md w-full max-w-sm">
          <h1 className="text-center text-2xl font-bold mb-6">
            Sign in to Your Account
          </h1>
          <button
            type="button"
            className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-blue-500 hover:bg-blue-600 
                       text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
            onClick={handleGoogleLogin}
          >
            Sign in with OAuth
          </button>
        </div>
      </div>
    </main>
  );
}
