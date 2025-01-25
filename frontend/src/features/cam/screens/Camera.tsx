// src/CallsList.tsx
import React, { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

export default function CallsList() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [activeCalls, setActiveCalls] = useState<string[]>([]);
  const [joinedCall, setJoinedCall] = useState<string | null>(null);

  useEffect(() => {
    const s = io("http://localhost:3000");
    setSocket(s);

    // Listen for updates to active calls
    s.on("active-calls", (calls: string[]) => {
      setActiveCalls(calls);
    });

    // Listen for new calls being started (by other users too!)
    s.on("call-started", (callId: string) => {
      setActiveCalls((prev) => [...prev, callId]);
    });

    // If we start a call, the server sends us a call-id
    s.on("call-id", (callId: string) => {
      console.log("We started a call with ID", callId);
      setJoinedCall(callId);
    });

    // If we successfully joined a call
    s.on("joined-call", (callId: string) => {
      console.log("We joined call", callId);
      setJoinedCall(callId);
    });

    s.on("call-error", (msg: string) => {
      alert(msg);
    });

    // On initial load, ask the server for existing calls
    s.emit("get-active-calls");

    // Cleanup
    return () => {
      s.disconnect();
    };
  }, []);

  // Start a new call
  const handleStartCall = () => {
    if (socket) {
      socket.emit("start-call");
      console.log("socket emitted");
    }
  };

  // Join an existing call
  const handleJoinCall = (callId: string) => {
    if (socket) {
      socket.emit("join-call", callId);
    }
  };

  // If we have joined a call, show the <Camera> component
  // We'll pass down the callId and socket as props.
  // Otherwise, show the calls list.
  return (
    <div style={{ padding: 20 }}>
      <h1>Active Calls</h1>
      {joinedCall ? (
        <div>
            <p>Joined call: {joinedCall}</p>
            {/* Only render Camera if socket is ready */}
            {socket && (
            <Camera socket={socket} callId={joinedCall} />
            )}
        </div>
      ) : (
        <div>
          <button onClick={()=> 
            {handleStartCall();

            }}>
              Start a New Call
              </button>
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

// We can inline or separately define the Camera component:
function Camera({
  socket,
  callId,
}: {
  socket: Socket;
  callId: string;
}) {
  const [localStream, setLocalStream] = React.useState<MediaStream | null>(null);
  const [peerConnection, setPeerConnection] = React.useState<RTCPeerConnection | null>(null);
  const localVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = React.useRef<HTMLVideoElement | null>(null);

  // ICE servers config
  const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

  // Get camera on mount
  React.useEffect(() => {
    startMedia();
  }, []);

  async function startMedia() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error accessing camera/microphone:", err);
    }
  }

  // Set up Socket events for WebRTC signaling
  React.useEffect(() => {
    if (!socket) return;

    const handleOffer = async (sdp: RTCSessionDescriptionInit) => {
      console.log("Offer received:", sdp);
      const pc = createPeerConnection();
      try {
        await pc.setRemoteDescription(sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("answer", { callId, sdp: answer });
      } catch (err) {
        console.error("Error handling offer:", err);
      }
    };

    const handleAnswer = async (sdp: RTCSessionDescriptionInit) => {
      console.log("Answer received:", sdp);
      if (!peerConnection) return;
      try {
        await peerConnection.setRemoteDescription(sdp);
      } catch (err) {
        console.error("Error setting remote description:", err);
      }
    };

    const handleICECandidate = async (candidate: RTCIceCandidate) => {
      console.log("ICE Candidate received:", candidate);
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

  function createPeerConnection() {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    if (localStream) {
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    }
    pc.ontrack = (event) => {
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

  // "Call" within that room
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
      <div style={{ display: "flex", gap: "10px" }}>
        <video ref={localVideoRef} autoPlay muted playsInline style={{ width: 300, border: "2px solid green" }} />
        <video ref={remoteVideoRef} autoPlay playsInline style={{ width: 300, border: "2px solid blue" }} />
      </div>
      <button onClick={makeCall} style={{ marginTop: 20 }}>
        Call in {callId}
      </button>
    </div>
  );
}