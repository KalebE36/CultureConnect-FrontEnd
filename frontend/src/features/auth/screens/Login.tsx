import { getAuth, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import { firebaseApp } from "../../../config/firebaseConfig";
import { useNavigate } from "react-router-dom";


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
      <main className="flex items-center justify-center h-screen bg-gray-100">
        <div className="bg-white p-8 rounded shadow-md w-full max-w-sm">
          <h1 className="text-center text-2xl font-bold mb-6">
            Sign in to Your Account
          </h1>
          <button
            type="button"
            className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-blue-500 hover:bg-blue-600 
                       text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
            onClick={() => {
                handleGoogleLogin()
            }}
          >
            Sign in with OAuth
          </button>
        </div>
      </main>
    );
  }