import React, { useEffect, useState } from "react"
import { getFirestore, doc, getDoc, updateDoc } from "firebase/firestore"
import { firebaseApp } from "../../../config/firebaseConfig"
import { useAuth } from "../../auth/hooks/useAuth"
import { useNavigate } from "react-router-dom"
import { getAuth, signOut } from "firebase/auth"

export default function ProfileEditor() {
  const { user, loading } = useAuth()
  const db = getFirestore(firebaseApp)
  const navigate = useNavigate()

  // Local state for profile fields
  const [name, setName] = useState("")
  const [nativeLanguage, setNativeLanguage] = useState("en-US") // Default: English
  const [avatar, setAvatar] = useState("/placeholder.svg")

  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState("")
  // NEW: track the countdown in seconds
  const [countdown, setCountdown] = useState(0)

  useEffect(() => {
    if (!user || loading) return

    const fetchUserData = async () => {
      try {
        const userRef = doc(db, "users", user.uid)
        const snapshot = await getDoc(userRef)

        if (snapshot.exists()) {
          const data = snapshot.data()
          setName(data.name || "")
          setNativeLanguage(data.native_language || "en-US")
          setAvatar(data.pfp || "/placeholder.svg")
        } else {
          console.log("User document not found in Firestore.")
        }
      } catch (error) {
        console.error("Error fetching user data:", error)
      }
    }

    fetchUserData()
  }, [user, loading, db])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    setIsLoading(true)
    setMessage("")

    try {
      const userRef = doc(db, "users", user.uid)
      await updateDoc(userRef, {
        name,
        native_language: nativeLanguage,
        pfp: avatar,
      })

      // Set the initial countdown and success message
      setCountdown(3) // or 2, or however many seconds you want
      setMessage(`Profile updated successfully! Redirecting in 3 seconds...`)

    } catch (error) {
      console.error("Error updating profile:", error)
      setMessage("Error updating profile. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  // EFFECT: Each time `countdown` changes, update the message and eventually navigate
  useEffect(() => {
    // If no countdown is set (0), do nothing
    if (countdown <= 0) return

    // Update the message to reflect the current countdown
    setMessage(
      `Profile updated successfully! Redirecting in ${countdown} second${
        countdown === 1 ? "" : "s"
      }...`
    )

    // Create a 1-second timer
    const timer = setTimeout(() => {
      // If we've reached the end, navigate away
      if (countdown === 1) {
        navigate("/camera")
      } else {
        // Otherwise, decrement
        setCountdown((prev) => prev - 1)
      }
    }, 1000)

    // Cleanup
    return () => clearTimeout(timer)
  }, [countdown, navigate])

  // Handle avatar upload
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setAvatar(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  // Log out function
  const handleLogout = async () => {
    try {
      const auth = getAuth(firebaseApp)
      await signOut(auth)
      console.log("Logged out successfully")
      navigate("/")
    } catch (error) {
      console.error("Error logging out:", error)
    }
  }

  if (loading) {
    return <p className="text-center mt-4">Loading profile...</p>
  }

  if (!user) {
    return <p className="text-center mt-4">Please sign in to edit your profile.</p>
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-[#78C3FB]">
      {/* Tailwind "Card" Equivalent */}
      <div className="w-full max-w-md bg-white rounded-md shadow-md">
        {/* Header */}
        <div className="border-b border-gray-200 p-4">
          <h2 className="text-2xl font-bold text-center">Edit Profile</h2>
        </div>

        {/* Content */}
        <div className="p-6">
          <form onSubmit={handleSave} className="space-y-6">
            {/* Avatar Section */}
            <div className="flex flex-col items-center space-y-4">
              {/* Avatar Image or Fallback */}
              {avatar ? (
                <img
                  src={avatar}
                  alt="Profile"
                  className="w-24 h-24 rounded-full object-cover"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center text-gray-500">
                  PFP
                </div>
              )}

              {/* Upload Button */}
              <label
                htmlFor="avatar"
                className="cursor-pointer text-[#587DDF] hover:text-[#587DDF]/80"
              >
                Change Profile Picture
              </label>
              <input
                id="avatar"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>

            {/* Name Field */}
            <div>
              <label
                htmlFor="name"
                className="block mb-1 font-medium text-gray-700"
              >
                Name
              </label>
              <input
                id="name"
                type="text"
                className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
              />
            </div>

            {/* Native Language Field */}
            <div>
              <label
                htmlFor="language"
                className="block mb-1 font-medium text-gray-700"
              >
                Native Language
              </label>
              <select
                id="language"
                className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={nativeLanguage}
                onChange={(e) => setNativeLanguage(e.target.value)}
              >
                <option value="en-US">English</option>
                <option value="es-MX">Spanish</option>
                <option value="fr-FR">French</option>
                <option value="de-DE">German</option>
                <option value="ru-RU">Russian</option>
                <option value="ko-KR">Korean</option>
              </select>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full py-2 px-4 rounded bg-[#587DDF] text-white font-semibold hover:bg-[#587DDF]/80 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
              disabled={isLoading}
            >
              {isLoading ? "Saving..." : "Save Changes"}
            </button>

            {/* Status Message */}
            {message && (
              <p className="text-center text-green-600 font-semibold">{message}</p>
            )}
          </form>
        </div>
      </div>

      {/* Logout Button - positioned absolutely at the bottom-right */}
      <button
        onClick={handleLogout}
        className="absolute bottom-4 right-4 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition focus:outline-none focus:ring-2 focus:ring-red-400"
      >
        Log Out
      </button>
    </div>
  )
}
