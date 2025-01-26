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
 *  - Renders <VideoChat> once in a call
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
        setActiveCalls((prev) => [
          ...prev,
          { callId, ownerName: "??", ownerLang: "??" },
        ]);
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
      <div className="min-h-screen flex flex-col bg-gray-100 p-4">
        <header className="mb-4">
          <h1 className="text-xl font-semibold text-gray-700">
            In Call: {joinedCall}
          </h1>
          <p className="text-gray-600">Hello {userName} - ({userLang})</p>
        </header>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left column: transcripts & translations */}
          <div className="flex-1 bg-white p-4 rounded-md shadow">
            <h2 className="text-lg font-bold mb-2 text-gray-700">
              My Transcript
            </h2>
            <div className="p-3 bg-gray-50 rounded min-h-[80px] border border-gray-200 mb-4">
              {latestTranscript ? (
                <p className="text-gray-800">{latestTranscript}</p>
              ) : (
                <p className="text-gray-400 italic">No speech yet.</p>
              )}
            </div>

            <h2 className="text-lg font-bold mb-2 text-gray-700">
              Translations Received
            </h2>
            <div className="p-3 bg-gray-50 rounded min-h-[100px] border border-gray-200 space-y-2 overflow-y-auto">
              {translatedMessages.length === 0 && (
                <p className="text-gray-400 italic">No translations yet.</p>
              )}
              {translatedMessages.map((msg, idx) => (
                <div key={idx} className="text-sm text-gray-700">
                  <span className="font-semibold">
                    {msg.from.toUpperCase()} → {msg.to.toUpperCase()}:
                  </span>{" "}
                  <span className="font-medium">{msg.translated}</span>
                  <span className="ml-2 text-xs text-gray-500 italic">
                    (original: {msg.original})
                  </span>
                </div>
              ))}
            </div>

            <button
              onClick={handleLeave}
              className="mt-4 inline-block px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
            >
              Leave Call
            </button>
          </div>

          {/* Right column: Video call */}
          <div className="flex-1 bg-white p-4 rounded-md shadow">
            <VideoChat callId={joinedCall} socket={socket} />
          </div>
        </div>
      </div>
    );
  }

  // Not in a call => show list
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-400 to-blue-600 p-4">
      <div className="max-w-2xl mx-auto bg-white p-6 rounded-md shadow space-y-4">
        <h1 className="text-center text-2xl font-bold text-gray-800 mb-2">
          CultureConnect Video Calls
        </h1>
        <p className="text-center text-sm text-gray-600">
          Welcome <span className="font-semibold">{userName}</span> (
          <em>{userLang}</em>)
        </p>

        <div className="mt-4 space-y-3">
          <button
            onClick={handleStartCall}
            className="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition"
          >
            Start a New Call
          </button>

          <h2 className="text-lg font-semibold text-gray-700">Or join an existing call:</h2>
          {activeCalls.length === 0 && (
            <p className="text-gray-500 text-sm italic">No active calls right now.</p>
          )}
          <ul className="space-y-2">
            {activeCalls.map(({ callId, ownerName, ownerLang }) => (
              <li key={callId} className="flex flex-col sm:flex-row items-start sm:items-center sm:justify-between border border-gray-200 rounded p-3">
                <div className="text-gray-700">
                  <span className="font-semibold text-blue-700">{ownerName}</span>{" "}
                  (<em>{ownerLang}</em>) -{" "}
                  <span className="text-sm text-gray-500">ID: {callId}</span>
                </div>
                <button
                  onClick={() => handleJoinCall(callId)}
                  className="mt-2 sm:mt-0 sm:ml-3 px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition text-sm"
                >
                  Join
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/**
 * VideoChat component (UI improved with Tailwind):
 * - Acquire local video+audio
 * - Setup WebRTC
 * - Also record audio chunks => "audio-data"
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
  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(
    null
  );

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
    <div>
      <div className="flex flex-col md:flex-row items-start gap-4">
        <video
          ref={localVideoRef}
          className="w-64 border-2 border-green-400 rounded shadow"
          autoPlay
          muted
          playsInline
        />
        <video
          ref={remoteVideoRef}
          className="w-64 border-2 border-blue-400 rounded shadow"
          autoPlay
          playsInline
        />
      </div>

      <button
        onClick={makeCall}
        className="mt-4 inline-block px-4 py-2 bg-blue-500 text-white font-medium rounded hover:bg-blue-600 transition"
      >
        Call in {callId}
      </button>
    </div>
  );
}
