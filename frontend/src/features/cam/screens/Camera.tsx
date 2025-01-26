// src/CallsList.tsx

import React, { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";

export default function CallsList() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [activeCalls, setActiveCalls] = useState<string[]>([]);
  const [joinedCall, setJoinedCall] = useState<string | null>(null);
  const [latestTranscript, setLatestTranscript] = useState("");

  useEffect(() => {
    const s = io("http://localhost:3000", {
      transports: ["websocket"],
      path: "/socket.io",
    });
    setSocket(s);

    // Listen for active calls
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

    // Speech transcripts
    s.on("transcript", (text: string) => {
      console.log("Transcript:", text);
      setLatestTranscript(text);
    });

    // Errors
    s.on("speech-error", (err: string) => {
      console.error("Speech error:", err);
    });
    s.on("call-error", (msg: string) => {
      alert(msg);
    });

    // On mount, ask server for existing calls
    s.emit("get-active-calls");

    // Cleanup on unmount
    return () => {
      s.disconnect();
    };
  }, []);

  // Start a new call
  function handleStartCall() {
    socket?.emit("start-call");
  }

  // Join an existing call
  function handleJoinCall(callId: string) {
    socket?.emit("join-call", callId);
  }

  // If we've joined a call, show the <VideoChat> component
  return (
    <div style={{ padding: 20 }}>
      <h1>Video Call + Audio-Only STT</h1>
      {joinedCall ? (
        <div>
          <p>Joined call: {joinedCall}</p>
          <p>Latest transcript: {latestTranscript}</p>
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
 * 1. Get a local video+audio stream => show in <video>.
 * 2. Create RTCPeerConnection, handle offers/answers/ICE => show remote video.
 * 3. Create a separate MediaRecorder from the local audio track => sends audio to server for STT.
 */
function VideoChat({
  callId,
  socket,
}: {
  callId: string;
  socket: Socket;
}) {
  // Refs to video elements
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  // We'll keep the local stream (video+audio) in state
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  // The RTCPeerConnection for this call
  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(null);

  // ICE servers
  const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

  // 1. Get user media (video+audio) on mount
  useEffect(() => {
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
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

  // 2. Once we have a localStream + socket, we set up the MediaRecorder for audio-only STT
  useEffect(() => {
    if (!localStream || !socket) return;

    // Extract only the audio track
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

    recorder.start(250); // send ~every 250ms
    console.log("Audio-only MediaRecorder started:", mimeType);

    // Cleanup
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

  // Create a PeerConnection when needed
  function createPeerConnection() {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Add local tracks
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

  // 4. Make a call (send offer)
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
