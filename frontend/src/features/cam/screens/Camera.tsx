import React, { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { firebaseApp } from "../../../config/firebaseConfig";
import { useAuth } from "../../auth/hooks/useAuth";

/**
 * Main CallsList component that:
 * - Sets up the Socket.IO connection
 * - Fetches user's language from Firestore
 * - Lets user Start/Join calls
 * - Displays transcripts and translations
 * - Renders <VideoChat> once in a call
 */
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
    // 1. If auth is still loading or no user, skip for now
    if (loading) return;
    if (!user) {
      console.log("No user logged in, skipping socket init");
      return;
    }

    // 2. Connect to your Socket.IO server
    const s = io("http://localhost:3000wss://cultureconnect-frontend-production.up.railway.app", {
      transports: ["websocket"],
      path: "/socket.io",
    });
    setSocket(s);

    // 3. Fetch user language from Firestore, then emit "set-language"
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
          console.log("User doc not found in Firestore, defaulting to en-US.");
        }
        // Tell the server which language we want to use for STT
        s.emit("set-language", userLang);

        // =========== Set up ALL socket listeners here ===========

        // Active calls
        s.on("active-calls", (calls: string[]) => {
          setActiveCalls(calls);
        });

        // A new call started
        s.on("call-started", (callId: string) => {
          setActiveCalls((prev) => [...prev, callId]);
        });

        // We started a call => server gives us the callId
        s.on("call-id", (callId: string) => {
          console.log("Started call:", callId);
          setJoinedCall(callId);
        });

        // We join a call => server confirms
        s.on("joined-call", (callId: string) => {
          console.log("Joined call:", callId);
          setJoinedCall(callId);
        });

        // 4. Listen for normal transcripts (the speaker's own STT)
        s.on("transcript", (text: string) => {
          console.log("Transcript (my speech):", text);
          setLatestTranscript(text);
        });

        // 5. Listen for translated transcripts from others
        s.on("translated-transcript", (payload) => {
          // payload = { original, translated, from, to }
          console.log("Received translated-transcript:", payload);
          setTranslatedMessages((prev) => [...prev, payload]);
        });

        // Errors
        s.on("speech-error", (err: string) => {
          console.error("Speech error:", err);
        });
        s.on("call-error", (msg: string) => {
          alert(msg);
        });

        // On initial mount, ask server for existing calls
        s.emit("get-active-calls");
      } catch (err) {
        console.error("Error fetching user doc:", err);
        // If an error occurs, default to English
        s.emit("set-language", "en-US");
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

  // If we've joined a call, we render the <VideoChat> component
  // plus some UI to show transcripts/translations
  return (
    <div style={{ padding: 20 }}>
      <h1>Video Call + Audio-Only STT + Translation</h1>

      {joinedCall ? (
        <div>
          <p>Joined call: {joinedCall}</p>

          {/* Display own STT transcript */}
          <p>
            <strong>My transcript:</strong> {latestTranscript}
          </p>

          {/* Display translations from others */}
          <div style={{ marginTop: 10 }}>
            <h3>Translations Received:</h3>
            {translatedMessages.map((msg, idx) => (
              <p key={idx} style={{ margin: "4px 0" }}>
                <em>
                  {msg.from} → {msg.to}
                </em>
                : <strong>{msg.translated}</strong>{" "}
                <small style={{ color: "#888" }}>
                  (original: {msg.original})
                </small>
              </p>
            ))}
          </div>

          {/* Render the video chat if socket is ready */}
          {socket && <VideoChat callId={joinedCall} socket={socket} />}
        </div>
      ) : (
        <div>
          <button onClick={handleStartCall}>Start a New Call</button>
          <h2>Or join an existing call:</h2>
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
      )}
    </div>
  );
}

/**
 * VideoChat:
 * - Gets local video+audio
 * - Creates RTCPeerConnection for video calls
 * - Sets up a MediaRecorder for the *audio* track, sends "audio-data" to server
 */
function VideoChat({
  callId,
  socket,
}: {
  callId: string;
  socket: Socket;
}) {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(null);

  // ICE servers config
  const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

  // 1. Acquire video+audio
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

  // 2. Start a MediaRecorder for audio-only => STT
  useEffect(() => {
    if (!localStream || !socket) return;

    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) {
      console.warn("No audio track in localStream!");
      return;
    }

    const audioOnlyStream = new MediaStream([audioTrack]);

    let mimeType = "audio/webm; codecs=opus";
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      console.warn(`${mimeType} not supported, falling back to audio/webm`);
      mimeType = "audio/webm";
    }

    let recorder: MediaRecorder | null = null;
    try {
      recorder = new MediaRecorder(audioOnlyStream, { mimeType });
    } catch (err) {
      console.error("Failed to create MediaRecorder:", err);
      return;
    }

    recorder.ondataavailable = async (e) => {
      if (e.data && e.data.size > 0) {
        const arrayBuffer = await e.data.arrayBuffer();
        socket.emit("audio-data", arrayBuffer);
      }
    };

    recorder.start(250); // ~every 250ms
    console.log("Audio-only MediaRecorder started:", mimeType);

    // Cleanup on unmount
    return () => {
      if (recorder && recorder.state !== "inactive") {
        console.log("Stopping MediaRecorder");
        recorder.stop();
      }
    };
  }, [localStream, socket]);

  // 3. Setup Socket listeners for WebRTC signaling
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

    socket.on("offer", handleOffer);
    socket.on("answer", handleAnswer);
    socket.on("ice-candidate", handleICECandidate);

    return () => {
      socket.off("offer", handleOffer);
      socket.off("answer", handleAnswer);
      socket.off("ice-candidate", handleICECandidate);
    };
  }, [socket, peerConnection]);

  // Create new RTCPeerConnection
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

  // 4. Send offer
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
      <div style={{ display: "flex", gap: 20 }}>
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
    </div>
  );
}
