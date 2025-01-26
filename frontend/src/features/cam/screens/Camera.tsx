import React, { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { firebaseApp } from "../../../config/firebaseConfig";
import { useAuth } from "../../auth/hooks/useAuth";
import VideoChat from "./VideoChat";

export default function CallsList() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [activeCalls, setActiveCalls] = useState<string[]>([]);
  const [joinedCall, setJoinedCall] = useState<string | null>(null);

  // We'll store the user’s own transcript (what they say)
  const [latestTranscript, setLatestTranscript] = useState("");
  // We'll store the translated messages from others
  const [translatedMessages, setTranslatedMessages] = useState<
    { original: string; translated: string; from: string; to: string }[]
  >([]);

  const { user, loading } = useAuth();
  const db = getFirestore(firebaseApp);

  useEffect(() => {
    // If auth still loading or no user, skip
    if (loading) return;
    if (!user) {
      console.log("No user logged in, skipping socket init");
      return;
    }

    const s = io("wss://cultureconnect-frontend-production.up.railway.app", {
      transports: ["websocket"],
      path: "/socket.io",
    });
    setSocket(s);

    (async () => {
      try {
        const userRef = doc(db, "users", user.uid);
        const snapshot = await getDoc(userRef);

        let userLang = "en-US";
        if (snapshot.exists()) {
          const data = snapshot.data();
          userLang = data.native_language || "en-US";
          console.log("User language from Firestore:", userLang);
        } else {
          console.log("User doc not found, defaulting to en-US.");
        }
        s.emit("set-language", userLang);

        // =========== Socket listeners ===========
        s.on("active-calls", (calls: string[]) => {
          setActiveCalls(calls);
        });
        s.on("call-started", (callId: string) => {
          setActiveCalls((prev) => [...prev, callId]);
        });
        s.on("call-id", (callId: string) => {
          console.log("Started call:", callId);
          setJoinedCall(callId);
        });
        s.on("joined-call", (callId: string) => {
          console.log("Joined call:", callId);
          setJoinedCall(callId);
        });
        s.on("transcript", (text: string) => {
          console.log("Transcript (my speech):", text);
          setLatestTranscript(text);
        });
        s.on("translated-transcript", (payload) => {
          console.log("Received translated-transcript:", payload);
          setTranslatedMessages((prev) => [...prev, payload]);
        });
        s.on("speech-error", (err: string) => {
          console.error("Speech error:", err);
        });
        s.on("call-error", (msg: string) => {
          alert(msg);
        });

        s.emit("get-active-calls");
      } catch (err) {
        console.error("Error fetching user doc:", err);
        // default to English if error
        s.emit("set-language", "en-US");
      }
    })();

    // Cleanup
    return () => {
      s.disconnect();
    };
  }, [user, loading, db]);

  function handleStartCall() {
    socket?.emit("start-call");
  }
  function handleJoinCall(callId: string) {
    socket?.emit("join-call", callId);
  }

  // Handle "Leave Chat"
  function handleLeave() {
    // You can add a server-side "leave-call" event or just reload
    console.log("Leaving the video chat...");
    setJoinedCall(null);
    setLatestTranscript("");
    setTranslatedMessages([]);
    // Possibly also disconnect from socket or reset everything
    // For simplicity, let's do a page reload:
    window.location.reload();
  }

  // If we have joined a call, show full-screen video chat
  if (joinedCall && socket) {
    return (
      <div className="min-h-screen">
        {/* Display transcripts/translation info if you want, or hide them if the new UI is full-screen */}
        {/* We'll embed them below the video for reference, or you can remove. */}

        <VideoChat
          callId={joinedCall}
          socket={socket}
          onLeave={handleLeave}
          latestTranscript={latestTranscript}
          translatedMessages={translatedMessages}
        />
      </div>
    );
  }

  // Else, show normal screen with call list
  return (
    <div className="min-h-screen bg-[#78C3FB] p-4">
      <h1 className="text-center text-2xl font-bold text-white mb-4">
        Video Call + Audio-Only STT + Translation
      </h1>

      <div className="max-w-xl mx-auto bg-white p-6 rounded-md shadow space-y-4">
        <button
          onClick={handleStartCall}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Start a New Call
        </button>

        <h2 className="text-lg font-semibold">Or join an existing call:</h2>
        {activeCalls.length === 0 && <p>No active calls right now.</p>}
        <ul className="space-y-2">
          {activeCalls.map((callId) => (
            <li key={callId}>
              <button
                onClick={() => handleJoinCall(callId)}
                className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
              >
                Join Call {callId}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
