import React, { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { firebaseApp } from "../../../config/firebaseConfig";
import { useAuth } from "../../auth/hooks/useAuth";

// We'll define a shape for the calls we receive from "active-calls"
interface ActiveCall {
  callId: string;
  ownerName: string;
  ownerLang: string;
}

/**
 * The main CallsList component:
 *  - Connects to the Socket.IO server
 *  - Fetches the user's name & language from Firestore
 *  - Lets user start/join calls
 *  - Displays transcripts & translations
 *  - Renders VideoChat component once in a call
 */
export default function CallsList() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [activeCalls, setActiveCalls] = useState<ActiveCall[]>([]);
  const [joinedCall, setJoinedCall] = useState<string | null>(null);

  // Store the user's own recognized speech
  const [latestTranscript, setLatestTranscript] = useState("");
  // Store translated messages from others
  const [translatedMessages, setTranslatedMessages] = useState<
    { original: string; translated: string; from: string; to: string }[]
  >([]);

  const [userName, setUserName] = useState("Unknown");
  const [userLang, setUserLang] = useState("en-US");

  const { user, loading } = useAuth(); // your custom auth hook
  const db = getFirestore(firebaseApp);

  // 1. On mount (once auth is ready), fetch user info, connect Socket
  useEffect(() => {
    if (loading) return;
    if (!user) {
      console.log("No user logged in, skipping socket init...");
      return;
    }

    (async () => {
      // Fetch user doc from Firestore
      const userRef = doc(db, "users", user.uid);
      const snapshot = await getDoc(userRef);

      let displayName = user.displayName || "Unknown";
      let nativeLang = "en-US";
      if (snapshot.exists()) {
        const data = snapshot.data();
        displayName = data.name || displayName;
        nativeLang = data.native_language || nativeLang;
      }

      // Store in local state
      setUserName(displayName);
      setUserLang(nativeLang);

      // Connect to Socket.IO
      const s = io("wss://cultureconnect-frontend-production.up.railway.app", {
        transports: ["websocket"],
        path: "/socket.io",
      });
      setSocket(s);

      // 2. Once connected, set language
      s.emit("set-language", nativeLang);

      // Listen for calls, transcripts, etc.
      s.on("active-calls", (calls: ActiveCall[]) => {
        console.log("Got active calls:", calls);
        setActiveCalls(calls);
      });
      s.on("call-started", (callId: string) => {
        // new call
        setActiveCalls((prev) => [...prev, { callId, ownerName: "??", ownerLang: "??" }]);
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

      // On mount, ask server for existing calls
      s.emit("get-active-calls");

      return () => {
        s.disconnect();
      };
    })();
  }, [user, loading, db]);

  // 2. Start a new call => pass userName, userLang
  function handleStartCall() {
    if (!socket) return;
    socket.emit("start-call", {
      userName,
      userLang, 
    });
  }

  // 3. Join an existing call
  function handleJoinCall(callId: string) {
    socket?.emit("join-call", callId);
  }

  // Leave call (simple approach: reload)
  function handleLeave() {
    console.log("Leaving the video chat...");
    setJoinedCall(null);
    setLatestTranscript("");
    setTranslatedMessages([]);
    window.location.reload();
  }

  if (joinedCall && socket) {
    // If we've joined a call, show video chat
    return (
      <div className="min-h-screen p-4">
        <p>Joined call: {joinedCall}</p>

        {/* Show your own recognized speech */}
        <p>
          <strong>My transcript:</strong> {latestTranscript}
        </p>

        {/* Show translations from others */}
        <div style={{ marginTop: 10 }}>
          <h3>Translations Received:</h3>
          {translatedMessages.map((msg, idx) => (
            <p key={idx} style={{ margin: "4px 0" }}>
              <em>{msg.from} → {msg.to}</em>:
              <strong> {msg.translated}</strong>{" "}
              <small style={{ color: "#666" }}>
                (original: {msg.original})
              </small>
            </p>
          ))}
        </div>

        <VideoChat callId={joinedCall} socket={socket} onLeave={handleLeave} />
      </div>
    );
  }

  // Not in a call => show list
  return (
    <div className="min-h-screen bg-[#78C3FB] p-4">
      <h1 className="text-center text-2xl font-bold text-white mb-4">
        Calls (Welcome {userName} - {userLang})
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
          {activeCalls.map(({ callId, ownerName, ownerLang }) => (
            <li key={callId}>
              <button
                onClick={() => handleJoinCall(callId)}
                className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
              >
                Join "{ownerName}" ({ownerLang}) - ID: {callId}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * VideoChat component:
 * - Acquire local video+audio
 * - Setup WebRTC
 * - Also record audio chunks => "audio-data"
 */
function VideoChat({
  callId,
  socket,
  onLeave,
}: {
  callId: string;
  socket: Socket;
  onLeave: () => void;
}) {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(null);

  const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

  // 1. Get local video+audio
  useEffect(() => {
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Error getting user media:", err);
      }
    })();
  }, []);

  // 2. Send audio to server
  useEffect(() => {
    if (!localStream || !socket) return;

    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) return;
    const audioOnlyStream = new MediaStream([audioTrack]);

    let mimeType = "audio/webm; codecs=opus";
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      console.warn(`Fallback to audio/webm`);
      mimeType = "audio/webm";
    }

    let recorder: MediaRecorder | null = null;
    try {
      recorder = new MediaRecorder(audioOnlyStream, { mimeType });
    } catch (err) {
      console.error("Failed to create MediaRecorder:", err);
      return;
    }

    recorder.ondataavailable = async (evt) => {
      if (evt.data && evt.data.size > 0) {
        const arrayBuffer = await evt.data.arrayBuffer();
        socket.emit("audio-data", arrayBuffer);
      }
    };

    recorder.start(250);
    console.log("Audio recorder started.");

    return () => {
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
    };
  }, [localStream, socket]);

  // 3. WebRTC Signaling
  useEffect(() => {
    if (!socket) return;

    const handleOffer = async (remoteSdp: RTCSessionDescriptionInit) => {
      const pc = createPeerConnection();
      try {
        await pc.setRemoteDescription(remoteSdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("answer", { callId, sdp: answer });
      } catch (err) {
        console.error("Error handling offer:", err);
      }
    };

    const handleAnswer = async (remoteSdp: RTCSessionDescriptionInit) => {
      if (!peerConnection) return;
      try {
        await peerConnection.setRemoteDescription(remoteSdp);
      } catch (err) {
        console.error("Error setting remote desc:", err);
      }
    };

    const handleICE = async (candidate: RTCIceCandidate) => {
      if (!peerConnection) return;
      try {
        await peerConnection.addIceCandidate(candidate);
      } catch (err) {
        console.error("Error adding ICE:", err);
      }
    };

    socket.on("offer", handleOffer);
    socket.on("answer", handleAnswer);
    socket.on("ice-candidate", handleICE);

    return () => {
      socket.off("offer", handleOffer);
      socket.off("answer", handleAnswer);
      socket.off("ice-candidate", handleICE);
    };
  }, [socket, peerConnection]);

  // createPeerConnection
  function createPeerConnection() {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    if (localStream) {
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    }
    pc.ontrack = (evt) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = evt.streams[0];
      }
    };
    pc.onicecandidate = (evt) => {
      if (evt.candidate) {
        socket.emit("ice-candidate", { callId, candidate: evt.candidate });
      }
    };
    setPeerConnection(pc);
    return pc;
  }

  // Make a call (offer)
  async function makeCall() {
    if (!socket) return;
    const pc = createPeerConnection();
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("offer", { callId, sdp: offer });
    } catch (err) {
      console.error("Error creating offer:", err);
    }
  }

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: "flex", gap: "20px" }}>
        <video
          ref={localVideoRef}
          style={{ width: 300, border: "2px solid green" }}
          autoPlay
          muted
          playsInline
        />
        <video
          ref={remoteVideoRef}
          style={{ width: 300, border: "2px solid blue" }}
          autoPlay
          playsInline
        />
      </div>

      <button onClick={makeCall} style={{ marginTop: 20 }}>
        Call in {callId}
      </button>
      <button onClick={onLeave} style={{ marginLeft: 10 }}>
        Leave Call
      </button>
    </div>
  );
}
