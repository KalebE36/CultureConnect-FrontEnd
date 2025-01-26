import React, { useEffect, useState } from "react";
import { getFirestore, doc, getDoc, updateDoc } from "firebase/firestore";
import { firebaseApp } from "../../../config/firebaseConfig"; // adjust path as needed
import { useAuth } from "../../auth/hooks/useAuth";             // your custom Auth hook

export default function Profile() {
  const { user, loading } = useAuth();  // your custom hook returning {user, loading}
  const db = getFirestore(firebaseApp);

  // Local state for profile fields
  const [name, setName] = useState("");
  const [nativeLanguage, setNativeLanguage] = useState("");
  const [pfp, setPfp] = useState("");
  const [status, setStatus] = useState(""); // For status messages (optional)

  useEffect(() => {
    // If no user or still loading, do nothing
    if (!user || loading) return;

    // Fetch the user doc from Firestore using the user's UID
    // e.g., users/{uid}
    const fetchUserData = async () => {
      try {
        const userRef = doc(db, "users", user.uid);
        const snapshot = await getDoc(userRef);

        if (snapshot.exists()) {
          const data = snapshot.data();
          // Populate local state
          setName(data.name || "");
          setNativeLanguage(data.native_language || "");
          setPfp(data.pfp || "");
        } else {
          // If doc doesn't exist, you might create it or show a message
          console.log("User doc not found in Firestore");
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
      }
    };

    fetchUserData();
  }, [user, loading, db]);

  // Handle saving updated profile data
  const handleSave = async () => {
    if (!user) return;
    try {
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, {
        name: name,
        native_language: nativeLanguage,
        pfp: pfp,
      });
      setStatus("Profile updated successfully!");
    } catch (error) {
      console.error("Error updating user profile:", error);
      setStatus("Error updating profile. Check console for details.");
    }
  };

  // If still checking auth state, show a loading message
  if (loading) {
    return <p>Loading profile...</p>;
  }

  // If no user is logged in, show a prompt
  if (!user) {
    return <p>Please sign in to view your profile.</p>;
  }

  return (
    <main className="p-4 max-w-md mx-auto">
      <h1 className="text-xl font-bold mb-4">Your Profile</h1>

      {/* Name */}
      <label className="block mb-2 font-semibold" htmlFor="name">
        Name
      </label>
      <input
        id="name"
        type="text"
        className="border p-2 w-full mb-4"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      {/* Native Language */}
      <label className="block mb-2 font-semibold" htmlFor="nativeLanguage">
        Native Language
      </label>
      <input
        id="nativeLanguage"
        type="text"
        className="border p-2 w-full mb-4"
        value={nativeLanguage}
        onChange={(e) => setNativeLanguage(e.target.value)}
      />

      {/* Profile Picture URL */}
      <label className="block mb-2 font-semibold" htmlFor="pfp">
        Profile Picture URL
      </label>
      <input
        id="pfp"
        type="text"
        className="border p-2 w-full mb-4"
        value={pfp}
        onChange={(e) => setPfp(e.target.value)}
      />

      {/* Display the profile picture if present */}
      {pfp && (
        <div className="mb-4">
          <img
            src={pfp}
            alt="Profile"
            className="max-w-xs rounded border"
          />
        </div>
      )}

      {/* Save Button */}
      <button
        className="bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600"
        onClick={handleSave}
      >
        Save Changes
      </button>

      {/* Status */}
      {status && <p className="mt-4 text-green-600">{status}</p>}
    </main>
  );
}
