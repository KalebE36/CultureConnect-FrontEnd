import { getAuth, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { firebaseApp } from "../../../config/firebaseConfig";
import { useNavigate } from "react-router-dom";


export default function LoginScreen() {
    const navigate = useNavigate(); 

    const handleGoogleLogin = async() => {
        const auth = getAuth(firebaseApp);
        const provider = new GoogleAuthProvider();

        try {
            console.log("Test");
            const result = await signInWithPopup(auth, provider);
            // Signed in
            const user = result.user;
            console.log("Successfully signed in!", user);
            navigate('/');
            
            
          } catch (error) {
            console.error("Error signing in with Google:", error);
          }

    }

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