import { getAuth, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import { firebaseApp } from "../../../config/firebaseConfig";
import { useNavigate } from "react-router-dom";
import Ellipse1 from "./img/Ellipse_1.png";
import Ellipse2 from "./img/Ellipse_2.png";
import globly from "./img/glob.png";

export default function LoginScreen() {
  const navigate = useNavigate();
  const auth = getAuth(firebaseApp);
  const db = getFirestore(firebaseApp);

    const handleGoogleLogin = async () => {
      const provider = new GoogleAuthProvider();
  
      try {
        // Firebase Authentication: Sign in with Google
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
  
        if (user) {
          const accountId = user.uid; // Use Firebase Auth UID as account_id
          const userRef = doc(db, "users", accountId); // Reference to Firestore document
  
          // Check if the user exists in Firestore
          const userSnapshot = await getDoc(userRef);
          if (!userSnapshot.exists()) {
            // If user doesn't exist, create a new document
            await setDoc(userRef, {
              account_id: accountId,
              learning_language: "English", // Default value, update as needed
              name: user.displayName || "Anonymous",
              native_language: "Unknown", // Default value, update as needed
              pfp: user.photoURL || "", // Use Google profile picture if available
            });
            console.log("New user added to Firestore");
          } else {
            console.log("User already exists in Firestore");
          }
  
          navigate("/"); // Redirect to home or dashboard
        }
      } catch (error) {
        console.error("Error signing in with Google:", error);
      }
    };

  return (
    <div className="flex flex-col justify-center min-h-screen bg-gradient-to-b from-blue-200 to-blue-300 relative font-roboto px-12">
      {/* White Ellipses */}
      <img
        src={Ellipse1}
        alt="Left Ellipse"
        className="absolute w-3/12 h-7/12 top-0 left-0"
      />
      <img
        src={Ellipse2}
        alt="Bottom Ellipse"
        className="absolute w-5/12 h-4/6 bottom-0 right-0"
      />

      {/* Header */}
      <div className="absolute top-5 left-5 text-black text-xl font-bold">
        CultureConnect
      </div>


      {/* Content */}
      <div className="flex flex-col items-start space-y-6 ml-40">
        <h1 className="text-7xl font-bold text-white mb-2">
          Your home away <br /> from home
        </h1>
        <p className="text-white text-md max-w-md">
          Blah Blah Blah short introduction, this is the introductory paragraph
          sentence giving an understanding to the purpose of this application.
        </p>
        <button
          onClick={handleGoogleLogin}
          className="px-6 py-3 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition"
        >
          Login With Google
        </button>
      </div>

      {/* Globe Graphic */}
      <div className="absolute bottom-[5vw] right-[-28vw]">
        <img
          src={globly}
          alt="Earth with a light bulb"
          className="h-5/12 w-5/12"
        />
      </div>
    </div>
  );
}
