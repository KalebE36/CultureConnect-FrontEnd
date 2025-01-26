// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");
const speech = require("@google-cloud/speech");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

// Google Cloud Speech
const speechClient = new speech.SpeechClient({
  keyFilename: "service-account-key.json", // your GCP credentials
});

// In-memory call store
const calls = {}; // e.g. { "callId123": true }

app.get("/", (req, res) => {
  res.send("WebRTC Video + Audio-only STT server");
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  let recognizeStream = null;

  // 1. Start call
  socket.on("start-call", () => {
    const callId = uuidv4().slice(0, 8);
    calls[callId] = true;
    socket.join(callId);

    socket.emit("call-id", callId);
    io.emit("call-started", callId);

    console.log("Call started:", callId);
  });

  // 2. Join call
  socket.on("join-call", (callId) => {
    if (!calls[callId]) {
      socket.emit("call-error", "Call does not exist!");
      return;
    }
    socket.join(callId);
    socket.emit("joined-call", callId);
    console.log(`Socket ${socket.id} joined call ${callId}`);
  });

  // 3. Active calls
  socket.on("get-active-calls", () => {
    socket.emit("active-calls", Object.keys(calls));
  });

  // ========== WebRTC Signaling ==========
  socket.on("offer", ({ callId, sdp }) => {
    socket.to(callId).emit("offer", sdp);
  });

  socket.on("answer", ({ callId, sdp }) => {
    socket.to(callId).emit("answer", sdp);
  });

  socket.on("ice-candidate", ({ callId, candidate }) => {
    socket.to(callId).emit("ice-candidate", candidate);
  });

  // ========== Audio Data to STT ==========
  socket.on("audio-data", (chunk) => {
    try {
      if (!recognizeStream) {
        recognizeStream = speechClient
          .streamingRecognize({
            config: {
              encoding: "WEBM_OPUS",
              sampleRateHertz: 48000, // typical for Opus
              languageCode: "en-US",
            },
            interimResults: true,
          })
          .on("data", (data) => {
            const transcript = data.results[0]?.alternatives[0]?.transcript;
            if (transcript) {
              // Return transcript just to the sending socket.
              // (Or you could broadcast to callId if you want everyone to see the transcript.)
              socket.emit("transcript", transcript);
            }
          })
          .on("error", (err) => {
            console.error("Speech error:", err);
            socket.emit("speech-error", err.toString());
          });

        console.log("Initialized STT stream for socket:", socket.id);
      }

      // Write new audio chunk
      const audioBuffer = Buffer.from(new Uint8Array(chunk));
      recognizeStream.write(audioBuffer);
    } catch (err) {
      console.error("audio-data error:", err);
      socket.emit("speech-error", err.toString());
    }
  });

  // Cleanup on disconnect
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    if (recognizeStream) {
      recognizeStream.end();
      recognizeStream = null;
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
