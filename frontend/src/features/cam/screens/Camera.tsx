import React, { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { firebaseApp } from "../../../config/firebaseConfig";
import { useAuth } from "../../auth/hooks/useAuth";

/**
 * The main CallsList component:
 *  - Connects to the Socket.IO server
 *  - Fetches the user's language from Firestore
 *  - Lets user start/join calls
 *  - Displays transcripts & translations
 *  - Renders VideoChat component once in a call
 */
export default function CallsList() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [activeCalls, setActiveCalls] = useState<string[]>([]);
  const [joinedCall, setJoinedCall] = useState<string | null>(null);

  // Store the user's own recognized speech
  const [latestTranscript, setLatestTranscript] = useState("");
  // Store translated messages from others
  const [translatedMessages, setTranslatedMessages] = useState<
    { original: string; translated: string; from: string; to: string }[]
  >([]);

  const { user, loading } = useAuth(); // your custom auth hook
  const db = getFirestore(firebaseApp);

  useEffect(() => {
    // If still loading or no user, skip
    if (loading) return;
    if (!user) {
      console.log("No user logged in, skipping socket init...");
      return;
    }

    // 1. Connect to Socket.IO server
    const s = io("wss://cultureconnect-frontend-production.up.railway.app", {
      transports: ["websocket"],
      path: "/socket.io",
    });
    setSocket(s);

    // 2. Fetch user language from Firestore, then emit "set-language"
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

        // ========== Setup Socket Listeners ==========
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

        // 3. Listen for your own recognized transcript (already final or partial)
        s.on("transcript", (text: string) => {
          console.log("Transcript (my speech):", text);
          setLatestTranscript(text);
        });

        // 4. Listen for other participants' translated transcripts
        s.on("translated-transcript", (payload) => {
          console.log("Received translated-transcript:", payload);
          // payload = { original, translated, from, to }
          setTranslatedMessages((prev) => [...prev, payload]);
        });

        s.on("speech-error", (err: string) => {
          console.error("Speech error:", err);
        });
        s.on("call-error", (msg: string) => {
          alert(msg);
        });

        // On mount, get existing calls
        s.emit("get-active-calls");
      } catch (err) {
        console.error("Error fetching user doc:", err);
        s.emit("set-language", "en-US"); // fallback
      }
    })();

    // Cleanup on unmount
    return () => {
      s.disconnect();
    };
  }, [user, loading, db]);

  // Start a new call
  function handleStartCall() {
    socket?.emit("start-call");
  }

  // Join an existing call
  function handleJoinCall(callId: string) {
    socket?.emit("join-call", callId);
  }

  // Optionally let user leave the call (simple approach: reload)
  function handleLeave() {
    console.log("Leaving the video chat...");
    setJoinedCall(null);
    setLatestTranscript("");
    setTranslatedMessages([]);
    window.location.reload();
  }

  if (joinedCall && socket) {
    // If we've joined a call, show the VideoChat & transcripts
    return (
      <div className="min-h-screen p-4">
        <p>Joined call: {joinedCall}</p>

        {/* Show your own recognized speech */}
        <p>
          <strong>My transcript:</strong> {latestTranscript}
        </p>

        {/* Show translated transcripts from others */}
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

  // If not in a call, show list of calls or start a new one
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

/**
 * VideoChat component:
 *  - Grabs local video+audio
 *  - Sets up WebRTC for 2-person video calls
 *  - Also sets up a MediaRecorder for audio-only, sending "audio-data" to server
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
  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(
    null
  );

  // ICE servers for NAT traversal
  const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

  // 1. Grab camera + mic on mount
  useEffect(() => {
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        console.log("Got local stream with video+audio.");
        setLocalStream(stream);

        // Show local video
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Error getting user media:", err);
      }
    })();
  }, []);

  // 2. Once we have a localStream, set up a MediaRecorder for audio => STT
  useEffect(() => {
    if (!localStream || !socket) return;

    // Extract only the audio track
    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) {
      console.warn("No audio track found in localStream!");
      return;
    }
    const audioOnlyStream = new MediaStream([audioTrack]);

    let mimeType = "audio/webm; codecs=opus";
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      console.warn(`Browser doesn't support ${mimeType}, falling back to audio/webm`);
      mimeType = "audio/webm";
    }

    let recorder: MediaRecorder | null = null;
    try {
      recorder = new MediaRecorder(audioOnlyStream, { mimeType });
    } catch (err) {
      console.error("Failed to create MediaRecorder:", err);
      return;
    }

    recorder.ondataavailable = async (event) => {
      if (event.data && event.data.size > 0) {
        const arrayBuffer = await event.data.arrayBuffer();
        // Send to server for STT
        socket.emit("audio-data", arrayBuffer);
      }
    };

    recorder.start(250); // send chunks every 250ms
    console.log("Audio-only MediaRecorder started:", mimeType);

    // Cleanup on unmount
    return () => {
      if (recorder && recorder.state !== "inactive") {
        console.log("Stopping MediaRecorder");
        recorder.stop();
      }
    };
  }, [localStream, socket]);

  // 3. Setup WebRTC signaling via Socket.IO
  useEffect(() => {
    if (!socket) return;

    const handleOffer = async (remoteSdp: RTCSessionDescriptionInit) => {
      console.log("Received offer from remote peer");
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
      console.log("Received answer from remote peer");
      if (!peerConnection) return;
      try {
        await peerConnection.setRemoteDescription(remoteSdp);
      } catch (err) {
        console.error("Error setting remote description:", err);
      }
    };

    const handleICECandidate = async (candidate: RTCIceCandidate) => {
      console.log("Received ICE candidate:", candidate);
      if (!peerConnection) return;
      try {
        await peerConnection.addIceCandidate(candidate);
      } catch (err) {
        console.error("Error adding ICE candidate:", err);
      }
    };

    // Listen for signaling
    socket.on("offer", handleOffer);
    socket.on("answer", handleAnswer);
    socket.on("ice-candidate", handleICECandidate);

    return () => {
      socket.off("offer", handleOffer);
      socket.off("answer", handleAnswer);
      socket.off("ice-candidate", handleICECandidate);
    };
  }, [socket, peerConnection]);

  // Create a new RTCPeerConnection & add local tracks
  function createPeerConnection() {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    if (localStream) {
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    }

    pc.ontrack = (event) => {
      console.log("Remote track added:", event.streams[0]);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", { callId, candidate: event.candidate });
      }
    };

    setPeerConnection(pc);
    return pc;
  }

  // 4. Initiate the call (send offer)
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
    <div className="p-4">
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

      <button onClick={makeCall} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded">
        Call in {callId}
      </button>
      <button onClick={onLeave} className="mt-4 ml-2 px-4 py-2 bg-red-600 text-white rounded">
        Leave Call
      </button>
    </div>
  );
}
