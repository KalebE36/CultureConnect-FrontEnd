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

  // We'll store the user’s own transcript
  const [latestTranscript, setLatestTranscript] = useState("");
  // We'll store other participants' translations
  const [translatedMessages, setTranslatedMessages] = useState<
    { original: string; translated: string; from: string; to: string }[]
  >([]);

  const { user, loading } = useAuth();
  const db = getFirestore(firebaseApp);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      console.log("No user, skipping socket init.");
      return;
    }

    // 1. Connect to Socket.IO
    const s = io("wss://cultureconnect-frontend-production.up.railway.app", {
      transports: ["websocket"],
      path: "/socket.io",
    });
    setSocket(s);

    // 2. Fetch user language, emit "set-language"
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
          console.log("User doc not found, defaulting en-US.");
        }
        s.emit("set-language", userLang);

        // Socket listeners
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
          // { original, translated, from, to }
          console.log("Translated transcript:", payload);
          setTranslatedMessages((prev) => [...prev, payload]);
        });
        s.on("speech-error", (err: string) => console.error("Speech error:", err));
        s.on("call-error", (msg: string) => alert(msg));

        // Get initial calls
        s.emit("get-active-calls");
      } catch (err) {
        console.error("Error fetching user doc:", err);
        s.emit("set-language", "en-US");
      }
    })();

    // Cleanup
    return () => {
      s.disconnect();
    };
  }, [user, loading, db]);

  // Start a new call
  function handleStartCall() {
    socket?.emit("start-call");
  }

  // Join a call
  function handleJoinCall(callId: string) {
    socket?.emit("join-call", callId);
  }

  // Leave the call => simple approach is reload
  function handleLeave() {
    console.log("Leaving the video chat...");
    setJoinedCall(null);
    setLatestTranscript("");
    setTranslatedMessages([]);
    window.location.reload();
  }

  if (joinedCall && socket) {
    // Show VideoChat & transcripts
    return (
      <div style={{ padding: 20 }}>
        <p>Joined call: {joinedCall}</p>

        {/* My recognized speech */}
        <p>
          <strong>My transcript:</strong> {latestTranscript}
        </p>

        {/* Others' translations */}
        <div style={{ marginTop: 10 }}>
          <h3>Translations Received:</h3>
          {translatedMessages.map((msg, idx) => (
            <p key={idx} style={{ margin: "4px 0" }}>
              <em>
                {msg.from} → {msg.to}
              </em>
              : <strong>{msg.translated}</strong>{" "}
              <small style={{ color: "#666" }}>(original: {msg.original})</small>
            </p>
          ))}
        </div>

        <VideoChat callId={joinedCall} socket={socket} onLeave={handleLeave} />
      </div>
    );
  }

  // If not in a call, show simple UI
  return (
    <div style={{ padding: 20 }}>
      <h1>Video Call + Audio-Only STT + Translation</h1>

      <button onClick={handleStartCall} style={{ marginRight: 10 }}>
        Start a New Call
      </button>

      <h2>Or join an existing call:</h2>
      {activeCalls.length === 0 && <p>No active calls right now.</p>}

      <ul>
        {activeCalls.map((callId) => (
          <li key={callId}>
            <button onClick={() => handleJoinCall(callId)}>
              Join Call {callId}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
