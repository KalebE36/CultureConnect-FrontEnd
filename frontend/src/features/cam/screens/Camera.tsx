import React, { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { firebaseApp } from "../../../config/firebaseConfig";
import { useAuth } from "../../auth/hooks/useAuth";
import { useNavigate } from "react-router-dom"; // to navigate to /profile

interface ActiveCall {
  callId: string;
  ownerName: string;
  ownerLang: string;
}

export default function CallsList() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [activeCalls, setActiveCalls] = useState<ActiveCall[]>([]);
  const [joinedCall, setJoinedCall] = useState<string | null>(null);

  const [latestTranscript, setLatestTranscript] = useState("");
  const [translatedMessages, setTranslatedMessages] = useState<
    { original: string; translated: string; from: string; to: string }[]
  >([]);

  const [userName, setUserName] = useState("Unknown");
  const [userLang, setUserLang] = useState("en-US");
  const [userPfp, setUserPfp] = useState<string>(""); // NEW: store user's profile pic

  const { user, loading } = useAuth();
  const db = getFirestore(firebaseApp);
  const navigate = useNavigate(); // for navigation

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
      let pfpUrl = ""; // fallback if missing

      if (snapshot.exists()) {
        const data = snapshot.data();
        displayName = data.name || displayName;
        nativeLang = data.native_language || nativeLang;
        pfpUrl = data.pfp || user.photoURL || ""; // prefer Firestore pfp, fallback to user.photoURL
      }

      setUserName(displayName);
      setUserLang(nativeLang);
      setUserPfp(pfpUrl);

      // Connect to Socket.IO
      const s = io("wss://cultureconnect-frontend-production.up.railway.app", {
        transports: ["websocket"],
        path: "/socket.io",
      });
      setSocket(s);

      // After connecting, set language
      s.emit("set-language", nativeLang);

      // Listen for calls, transcripts, etc.
      s.on("active-calls", (calls: ActiveCall[]) => {
        console.log("Got active calls:", calls);
        setActiveCalls(calls);
      });
      s.on("call-started", (callId: string) => {
        // Added a small delay before we add the new call to the activeCalls
        setTimeout(() => {
          setActiveCalls((prev) => [
            ...prev,
            { callId, ownerName: displayName, ownerLang: nativeLang },
          ]);
        }, 2000);
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

  // Leave call
  function handleLeave() {
    console.log("Leaving the video chat...");
    setJoinedCall(null);
    setLatestTranscript("");
    setTranslatedMessages([]);
    window.location.reload();
  }

  // If we've joined a call, show the video/translation interface
  if (joinedCall && socket) {
    return (
      // Outer container with relative to place top-right PFP
      <div className="relative min-h-screen p-4 sm:p-6 lg:p-8 bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">

        {/* TOP-RIGHT PFP BUTTON */}
        <div className="absolute top-4 right-4">
          {userPfp ? (
            <img
              src={userPfp}
              alt="Profile"
              onClick={() => navigate("/profile")}
              className="w-10 h-10 rounded-full object-cover cursor-pointer hover:opacity-90 border-2 border-white"
            />
          ) : (
            <button
              onClick={() => navigate("/profile")}
              className="px-3 py-2 bg-gray-800 text-white rounded-full hover:bg-gray-700 transition"
            >
              Profile
            </button>
          )}
        </div>

        {/* Semi-transparent card */}
        <div className="w-full max-w-7xl bg-white/90 backdrop-blur-sm shadow-xl rounded-md p-6 space-y-6">
          {/* Header */}
          <header>
            <h1 className="text-2xl font-semibold text-gray-700 mb-1">
              In Call: {joinedCall}
            </h1>
            <p className="text-gray-600">
              Hello <span className="font-medium">{userName}</span> (
              <em>{userLang}</em>)
            </p>
          </header>

          {/* Two-column layout for transcripts and video */}
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Left column: transcripts & translations */}
            <div className="flex-1 bg-white p-4 rounded-md shadow space-y-4">
              <h2 className="text-lg font-bold text-gray-700">
                My Transcript
              </h2>
              <div className="p-3 bg-gray-50 rounded min-h-[80px] border border-gray-200">
                {latestTranscript ? (
                  <p className="text-gray-800">{latestTranscript}</p>
                ) : (
                  <p className="text-gray-400 italic">No speech yet.</p>
                )}
              </div>

              <h2 className="text-lg font-bold text-gray-700">
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
                className="mt-2 inline-block px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition"
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
      </div>
    );
  }

  // Otherwise, show the "lobby" list (grid style)
  return (
    // Outer container with relative to place top-right PFP
    <div className="relative min-h-screen bg-gradient-to-br from-blue-400 to-blue-600 p-4 sm:p-6 lg:p-8">

      {/* TOP-RIGHT PFP BUTTON */}
      <div className="absolute top-4 right-4">
        {userPfp ? (
          <img
            src={userPfp}
            alt="Profile"
            onClick={() => navigate("/profile")}
            className="w-10 h-10 rounded-full object-cover cursor-pointer hover:opacity-90 border-2 border-white"
          />
        ) : (
          <button
            onClick={() => navigate("/profile")}
            className="px-3 py-2 bg-gray-800 text-white rounded-full hover:bg-gray-700 transition"
          >
            Profile
          </button>
        )}
      </div>

      <header className="mb-8 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">
          CultureConnect Video Calls
        </h1>
        <p className="text-white text-sm mb-4">
          Welcome <span className="font-semibold">{userName}</span> (
          <em>{userLang}</em>)
        </p>
        <button
          onClick={handleStartCall}
          className="bg-green-500 text-white py-2 px-6 rounded-full hover:bg-green-600 transition-colors duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 shadow-md"
        >
          Create Call
        </button>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {activeCalls.length === 0 && (
          <p className="text-center text-white text-sm col-span-full italic">
            No active calls at the moment.
          </p>
        )}
        {activeCalls.map(({ callId, ownerName, ownerLang }) => {
          // Example: turn "en-US" -> "EN"
          const countryCode = ownerLang
            ? ownerLang.split("-")[0].toUpperCase()
            : "??";

          return (
            <div
              key={callId}
              className="bg-white rounded-lg shadow-md overflow-hidden transition-transform duration-300 ease-in-out transform hover:scale-105"
            >
              <div className="p-4 sm:p-6">
                <div className="flex items-center mb-4">
                  <div className="mr-3 w-8 h-8 flex items-center justify-center bg-gray-200 rounded-full text-sm font-semibold">
                    {countryCode}
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-gray-800">
                      {ownerLang}
                    </h2>
                    <p className="text-sm text-gray-600 flex items-center">
                      <svg
                        className="w-4 h-4 mr-1"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                        />
                      </svg>
                      {ownerName}
                    </p>
                  </div>
                </div>
                {/* Show callId if desired */}
                <button
                  onClick={() => handleJoinCall(callId)}
                  className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 transition-colors duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                >
                  Join Lobby
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * VideoChat component
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
  const [someoneJoined, setSomeoneJoined] = useState(false);

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

    // Send a chunk every 250ms
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

    const handleUserJoined = (joinedUserName?: string) => {
      // Optionally, the server can pass a username
      console.log("Someone joined the call!", joinedUserName);
      setSomeoneJoined(true);
    };

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
        console.error("Error adding ICE candidate:", err);
      }
    };

    socket.on("offer", handleOffer);
    socket.on("answer", handleAnswer);
    socket.on("ice-candidate", handleICE);

    return () => {
      socket.off("user-joined", handleUserJoined);
      socket.off("offer", handleOffer);
      socket.off("answer", handleAnswer);
      socket.off("ice-candidate", handleICE);
    };
  }, [socket, peerConnection, callId]);

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

      {/* If someone joined, show a small prompt to the user */}
      {someoneJoined && (
        <p className="mt-4 text-green-600 font-medium">
          Someone just joined the call! Press “Connect” to begin the WebRTC session.
        </p>
      )}

      <button
        onClick={makeCall}
        className="mt-4 inline-block px-4 py-2 bg-blue-500 text-white font-medium rounded hover:bg-blue-600 transition"
      >
        Call in {callId}
      </button>
      <br/>
      <p className="mt-2 text-red-500">Works best on Chrome AND With Microphone!</p>
    </div>
  );
}
