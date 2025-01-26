import React from "react";
import globly2 from "../img/globely2.png";
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

        navigate("/camera");
      }
    } catch (error) {
      console.error("Error signing in with Google:", error);
    }
  };

  return (
    <main className="relative w-screen h-screen bg-[#4f70e2] overflow-hidden flex flex-col items-center justify-center">
      {/* Top-left wave */}
      <div
        style={{
          position: "absolute",
          top: "-10%",
          left: "-15%",
          width: "60vw",
          height: "20vw",
          backgroundColor: "#FFFFFF",
          borderBottomRightRadius: "80%", // Increased curve intensity
          transform: "rotate(-10deg)", // Adds more dynamic rotation
        }}
      />
      {/* Bottom-right wave */}
      <div
        style={{
          position: "absolute",
          bottom: "-35%",
          right: "-20%",
          width: "45vw",
          height: "45vw",
          backgroundColor: "#FFFFFF",
          borderTopLeftRadius: "90%", // Increased curve intensity
          borderBottomLeftRadius: "-30%", // Increased curve intensity
          transform: "rotate(20deg)", // Adds a more dynamic flow
        }}
      />

      {/* Centered login card */}
      <div className="bg-white p-8  rounded shadow-md w-full max-w-sm z-10 mt-20">
        <h1 className="text-center text-2xl font-bold mb-6">
          Login
        </h1>
        <button
          type="button"
          className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-blue-500 hover:bg-blue-600 
                     text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
          onClick={handleGoogleLogin}
        >
          Sign in with Google
        </button>
      </div>

      {/* Globe Graphic, placed below the login card */}
      <div className="mt-8 flex">
        <img
          src={globly2}
          alt="Earth with a light bulb"
          className="w-25 sm:w-25 md:w-50 lg:w-60 h-auto mt-8"
        />
      </div>
    </main>
  );
}
