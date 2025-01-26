import React, { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { firebaseApp } from "../../../config/firebaseConfig";
import { useAuth } from "../../auth/hooks/useAuth";

interface ActiveCall {
  callId: string;
  ownerName?: string;
  ownerLang?: string;
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

  const { user, loading } = useAuth();
  const db = getFirestore(firebaseApp);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      console.log("No user logged in, skipping socket init...");
      return;
    }

    (async () => {
      // 1. Fetch user doc from Firestore
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

      // 2. Connect to Socket.IO
      const s = io("http://localhost:3000", {
        transports: ["websocket"],
        path: "/socket.io",
      });
      setSocket(s);

      // 3. Once connected, set language
      s.emit("set-language", nativeLang);

      // 4. Listen for server events
      s.on("active-calls", (calls: ActiveCall[]) => {
        // e.g. [{ callId: "abcd1234" }]
        // We'll store them, but they won't have ownerName/Lang by default
        console.log("Got active calls:", calls);
        setActiveCalls(calls);
      });

      s.on("call-started", ({ callId }) => {
        console.log("New call started:", callId);
        // The server only gives { callId }
        // We'll add a placeholder; we expect "client-call-info" soon from the starter
        setActiveCalls((prev) => [...prev, { callId }]);
      });

      // The user who started the call also gets "call-id"
      s.on("call-id", (callId: string) => {
        console.log("We are the caller; got call-id:", callId);
        setJoinedCall(callId);

        // 5. Immediately emit "client-call-info" so everyone can see real name/lang
        s.emit("client-call-info", {
          callId,
          ownerName: displayName,
          ownerLang: nativeLang,
        });
      });

      s.on("joined-call", (callId: string) => {
        console.log("Joined call:", callId);
        setJoinedCall(callId);
      });

      // 6. A client just told us real call info
      s.on("client-call-info", (payload: { callId: string; ownerName: string; ownerLang: string }) => {
        // e.g. { callId: 'abcd1234', ownerName: 'Alice', ownerLang: 'en-US' }
        console.log("Received client-call-info:", payload);
        setActiveCalls((prev) => {
          // If we already have that call in the list, update it
          const found = prev.find((c) => c.callId === payload.callId);
          if (!found) {
            // Not in list => add new
            return [...prev, payload];
          }
          // Otherwise, update its name/lang
          return prev.map((c) =>
            c.callId === payload.callId
              ? { ...c, ownerName: payload.ownerName, ownerLang: payload.ownerLang }
              : c
          );
        });
      });

      // 7. STT / Transcripts
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

      // On mount, ask for calls
      s.emit("get-active-calls");

      return () => {
        s.disconnect();
      };
    })();
  }, [user, loading, db]);

  // Start a new call
  function handleStartCall() {
    if (!socket) return;
    // We only send "start-call" -> server returns callId + "call-started"
    socket.emit("start-call");
  }

  // Join an existing call
  function handleJoinCall(callId: string) {
    socket?.emit("join-call", callId);
  }

  // Leave call
  function handleLeave() {
    console.log("Leaving call...");
    setJoinedCall(null);
    setLatestTranscript("");
    setTranslatedMessages([]);
    window.location.reload();
  }

  // If joined
  if (joinedCall && socket) {
    return (
      <div className="min-h-screen p-6 bg-gray-200">
        <h1 className="text-xl font-bold mb-2">In Call: {joinedCall}</h1>
        <p>
          Hello {userName} <em>({userLang})</em>
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          {/* left col: transcripts */}
          <div className="bg-white p-4 rounded shadow">
            <h2 className="text-lg font-semibold">My Transcript</h2>
            <div className="border p-2 my-2 min-h-[60px]">
              {latestTranscript || (
                <span className="text-gray-400 italic">No speech yet</span>
              )}
            </div>

            <h2 className="text-lg font-semibold mt-4">Translations Received</h2>
            <div className="border p-2 my-2 min-h-[80px] overflow-y-auto">
              {translatedMessages.length === 0 ? (
                <p className="text-gray-400 italic">No translations yet</p>
              ) : (
                translatedMessages.map((m, i) => (
                  <p key={i} className="text-sm">
                    <strong>{m.from.toUpperCase()} &rarr; {m.to.toUpperCase()}</strong>
                    : {m.translated}{" "}
                    <span className="text-xs text-gray-500">
                      (orig: {m.original})
                    </span>
                  </p>
                ))
              )}
            </div>

            <button
              onClick={handleLeave}
              className="mt-2 inline-block px-4 py-2 bg-red-500 text-white rounded"
            >
              Leave
            </button>
          </div>

          {/* right col: video chat */}
          <div className="bg-white p-4 rounded shadow">
            <VideoChat callId={joinedCall} socket={socket} />
          </div>
        </div>
      </div>
    );
  }

  // If not in a call
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-400 to-blue-600 p-6">
      <div className="max-w-xl mx-auto bg-white p-6 rounded shadow space-y-4">
        <h1 className="text-2xl font-bold text-gray-800">
          CultureConnect Lobby
        </h1>
        <p className="text-gray-600">
          Welcome {userName} (<em>{userLang}</em>)
        </p>

        <button
          onClick={handleStartCall}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition"
        >
          Start New Call
        </button>

        <h2 className="text-lg font-semibold text-gray-700 mt-4">
          Or join an existing call:
        </h2>

        {activeCalls.length === 0 && (
          <p className="text-sm text-gray-400 italic">
            No active calls at the moment
          </p>
        )}
        <div className="space-y-2">
          {activeCalls.map((c) => (
            <div
              key={c.callId}
              className="flex items-center justify-between border rounded p-3"
            >
              <div className="text-sm text-gray-700">
                <span className="font-semibold">
                  {c.ownerName ?? "Unknown"}
                </span>{" "}
                (<em>{c.ownerLang ?? "??"}</em>) - ID: {c.callId}
              </div>
              <button
                onClick={() => handleJoinCall(c.callId)}
                className="px-2 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
              >
                Join
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** VideoChat component (unchanged) */
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

  // get local video+audio
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

  // send audio to server
  useEffect(() => {
    if (!localStream || !socket) return;

    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) return;
    const audioOnly = new MediaStream([audioTrack]);

    let rec: MediaRecorder | null = null;
    try {
      rec = new MediaRecorder(audioOnly, {
        mimeType: "audio/webm; codecs=opus",
      });
    } catch (err) {
      console.error("Failed to create MediaRecorder:", err);
    }

    if (!rec) return;

    rec.ondataavailable = async (evt) => {
      if (evt.data && evt.data.size > 0) {
        const arrayBuffer = await evt.data.arrayBuffer();
        socket.emit("audio-data", arrayBuffer);
      }
    };

    rec.start(250);
    console.log("Started sending audio data.");

    return () => {
      if (rec && rec.state !== "inactive") rec.stop();
    };
  }, [localStream, socket]);

  // WebRTC signaling
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
        console.error("Error adding ICE candidate:", err);
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

  // make a call
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
      <div className="flex gap-3">
        <video
          ref={localVideoRef}
          className="w-44 h-32 border-2 border-green-400 rounded"
          autoPlay
          muted
          playsInline
        />
        <video
          ref={remoteVideoRef}
          className="w-44 h-32 border-2 border-blue-400 rounded"
          autoPlay
          playsInline
        />
      </div>
      <button
        onClick={makeCall}
        className="mt-2 inline-block px-3 py-1 bg-blue-500 text-white rounded"
      >
        Call in {callId}
      </button>
    </div>
  );
}
