import React, { useEffect, useState, useRef } from "react";
import { Socket } from "socket.io-client";

interface VideoChatProps {
  callId: string;
  socket: Socket;
  onLeave: () => void;
}

export default function VideoChat({ callId, socket, onLeave }: VideoChatProps) {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(
    null
  );

  // ICE servers
  const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

  // Grab local video+audio
  useEffect(() => {
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        console.log("Got local stream with video+audio.");
        setLocalStream(stream);

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Error getting user media:", err);
      }
    })();
  }, []);

  // Audio-only recorder => STT
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
      console.warn(`mimeType ${mimeType} not supported, falling back to 'audio/webm'`);
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

    recorder.start(250); // small chunks
    console.log("Audio-only MediaRecorder started:", mimeType);

    return () => {
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
    };
  }, [localStream, socket]);

  // Set up Socket listeners for WebRTC
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
        console.error("Error setting remote desc:", err);
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

  // Send offer
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

      <button onClick={makeCall} style={{ marginTop: 20, marginRight: 10 }}>
        Call in {callId}
      </button>
      <button onClick={onLeave} style={{ marginTop: 20 }}>
        Leave Call
      </button>
    </div>
  );
}
