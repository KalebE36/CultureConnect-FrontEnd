import React, { useEffect, useState, useRef } from "react";
import { Socket } from "socket.io-client";

interface VideoChatProps {
  callId: string;
  socket: Socket;
  onLeave: () => void;
  latestTranscript: string;
  translatedMessages: { original: string; translated: string; from: string; to: string }[];
}

export default function VideoChat({
  callId,
  socket,
  onLeave,
  latestTranscript,
  translatedMessages
}: VideoChatProps) {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(
    null
  );

  // ICE servers
  const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

  // Acquire video+audio
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

  // Start MediaRecorder for audio => STT
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
    recorder.start(250);

    return () => {
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
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

    const handleICECandidate = async (candidate: RTCIceCandidate) => {
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
  }, [socket, peerConnection, callId]);

  // Create peer connection
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

  // Start a call
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
    <div className="min-h-screen bg-gradient-to-b from-[#587DDF] to-[#78C3FB] p-4 flex items-center justify-center">
      {/* Semi-transparent card container */}
      <div className="w-full max-w-6xl bg-white/90 backdrop-blur-sm shadow-xl rounded-md">
        <div className="p-6 space-y-6">
          {/* Title */}
          <h1 className="text-3xl font-bold text-center text-[#587DDF] mb-6">
            Video Chat
          </h1>

          {/* Video Panels */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Local Video */}
            <div className="overflow-hidden shadow-md rounded-md">
              <div className="aspect-video bg-[#587DDF]/20 relative flex items-center justify-center text-[#587DDF]">
                <video
                  ref={localVideoRef}
                  className="absolute inset-0 w-full h-full object-cover"
                  autoPlay
                  muted
                  playsInline
                />
              </div>
            </div>

            {/* Remote Video */}
            <div className="overflow-hidden shadow-md rounded-md">
              <div className="aspect-video bg-[#587DDF]/20 relative flex items-center justify-center text-[#587DDF]">
                <video
                  ref={remoteVideoRef}
                  className="absolute inset-0 w-full h-full object-cover"
                  autoPlay
                  playsInline
                />
              </div>
            </div>
          </div>

          {/* Transcripts + translations */}
          <div className="bg-white rounded-md shadow p-4">
            <h2 className="text-xl font-semibold mb-2 text-[#587DDF]">
              Live Translation
            </h2>
            <p className="text-gray-700 mb-3">
              <strong>My transcript:</strong> {latestTranscript}
            </p>
            <div className="h-40 overflow-y-auto border border-[#587DDF]/20 p-3 bg-white rounded">
              {translatedMessages.map((msg, idx) => (
                <p key={idx} className="mb-2 text-[#587DDF]">
                  <em>
                    {msg.from} → {msg.to}
                  </em>
                  : <strong>{msg.translated}</strong>{" "}
                  <small className="text-gray-500">(original: {msg.original})</small>
                </p>
              ))}
            </div>
          </div>

          {/* Buttons row */}
          <div className="flex flex-wrap justify-center gap-4 mt-6">
            <button
              onClick={makeCall}
              className="bg-[#587DDF] text-white px-6 py-3 rounded-full font-semibold hover:bg-[#587DDF]/90 transition-all transform hover:scale-105"
            >
              Start Call
            </button>
            <button
              onClick={onLeave}
              className="bg-[#3BC14A] text-white px-6 py-3 rounded-full font-semibold hover:bg-[#3BC14A]/90 transition-all transform hover:scale-105"
            >
              Leave Chat
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
