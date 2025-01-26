// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");
const speech = require("@google-cloud/speech");
const fetch = require("node-fetch"); // or "axios"

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Google Cloud Speech
const speechClient = new speech.SpeechClient({
  keyFilename: "service-account-key.json", // GCP credentials
});

/**
 * calls = {
 *   callId123: {
 *       participants: [socketIdA, socketIdB],
 *       languages: { socketIdA: "en", socketIdB: "ru" },
 *       ownerName: "Alice",
 *       ownerLang: "en-US",  // or short code
 *   }
 * }
 */
const calls = {};

app.get("/", (req, res) => {
  res.send("WebRTC + STT + Translation Server");
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  let recognizeStream = null;
  let currentCallId = null;

  // Default to en-US if not set
  let sttLanguage = "en-US";
  let shortLanguage = "en"; // e.g. "en"

  // ========== 1. set-language ==========
  socket.on("set-language", (langCode) => {
    console.log(`Socket ${socket.id} set language to:`, langCode);
    sttLanguage = langCode || "en-US";
    shortLanguage = sttLanguage.split("-")[0] || "en";

    // If they're already in a call, store it
    if (currentCallId && calls[currentCallId]) {
      calls[currentCallId].languages[socket.id] = shortLanguage;
    }
  });

  // ========== 2. Start call ==========
  // We now expect the client to emit: socket.emit("start-call", { userName, userLang });
  socket.on("start-call", ({ userName, userLang }) => {
    // Fallbacks
    const name = userName || "Unknown";
    const lang = userLang || "en-US";

    sttLanguage = lang;
    shortLanguage = lang.split("-")[0] || "en";

    const callId = uuidv4().slice(0, 8);
    // We store the host's name & language
    calls[callId] = {
      participants: [socket.id],
      languages: { [socket.id]: shortLanguage },
      ownerName: name,
      ownerLang: lang,
    };

    currentCallId = callId;
    socket.join(callId);

    socket.emit("call-id", callId);
    io.emit("call-started", callId);
    console.log(`Call started: ${callId} by ${name} (${lang})`);
  });

  // ========== 3. Join call ==========
  socket.on("join-call", (callId) => {
    if (!calls[callId]) {
      socket.emit("call-error", "Call does not exist!");
      return;
    }
    currentCallId = callId;
    socket.join(callId);

    calls[callId].participants.push(socket.id);
    calls[callId].languages[socket.id] = shortLanguage;

    socket.emit("joined-call", callId);
    console.log(`Socket ${socket.id} joined call ${callId}`);
  });

  // ========== 4. get-active-calls ==========
  // Return an array of objects: { callId, ownerName, ownerLang }
  socket.on("get-active-calls", () => {
    const callList = Object.entries(calls).map(([id, callData]) => ({
      callId: id,
      ownerName: callData.ownerName,
      ownerLang: callData.ownerLang,
    }));
    socket.emit("active-calls", callList);
  });

  // ========== 5. WebRTC Signaling ==========
  socket.on("offer", ({ callId, sdp }) => {
    socket.to(callId).emit("offer", sdp);
  });
  socket.on("answer", ({ callId, sdp }) => {
    socket.to(callId).emit("answer", sdp);
  });
  socket.on("ice-candidate", ({ callId, candidate }) => {
    socket.to(callId).emit("ice-candidate", candidate);
  });

  // ========== 6. AUDIO DATA => STT => TRANSLATION ==========
  socket.on("audio-data", (chunk) => {
    try {
      if (!recognizeStream) {
        recognizeStream = speechClient
          .streamingRecognize({
            config: {
              encoding: "WEBM_OPUS",
              sampleRateHertz: 48000,
              languageCode: sttLanguage,
            },
            interimResults: true,
          })
          .on("data", async (data) => {
            const result = data.results[0];
            if (!result) return;
            const transcript = result.alternatives[0]?.transcript;
            if (!transcript) return;

            const isFinal = result.isFinal;
            if (!isFinal) {
              // optionally show partial
              socket.emit("transcript", transcript);
              return;
            }

            // final transcript
            console.log(`[${socket.id}] Final STT:`, transcript);
            socket.emit("transcript", transcript);

            if (!currentCallId) return;
            const call = calls[currentCallId];
            if (!call) return;

            for (const otherSocketId of call.participants) {
              if (otherSocketId === socket.id) continue;
              const targetLang = call.languages[otherSocketId] || "en";

              if (targetLang === shortLanguage) {
                // same language
                io.to(otherSocketId).emit("translated-transcript", {
                  original: transcript,
                  translated: transcript,
                  from: shortLanguage,
                  to: targetLang,
                });
                continue;
              }

              // need translation
              const translation = await translateWithLingva(
                shortLanguage,
                targetLang,
                transcript
              );
              io.to(otherSocketId).emit("translated-transcript", {
                original: transcript,
                translated: translation,
                from: shortLanguage,
                to: targetLang,
              });
            }
          })
          .on("error", (err) => {
            console.error("Speech error:", err);
            socket.emit("speech-error", err.toString());
          });

        console.log("Initialized STT stream for socket:", socket.id);
      }

      const audioBuffer = Buffer.from(new Uint8Array(chunk));
      recognizeStream.write(audioBuffer);
    } catch (err) {
      console.error("audio-data error:", err);
      socket.emit("speech-error", err.toString());
    }
  });

  // ========== 7. DISCONNECT ==========
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    if (recognizeStream) {
      recognizeStream.end();
      recognizeStream = null;
    }
    if (currentCallId && calls[currentCallId]) {
      const call = calls[currentCallId];
      call.participants = call.participants.filter((id) => id !== socket.id);
      delete call.languages[socket.id];
      if (call.participants.length === 0) {
        delete calls[currentCallId];
      }
    }
  });
});

// Helper for Lingva
async function translateWithLingva(sourceLang, targetLang, text) {
  try {
    const url = `https://lingva.ml/api/v1/${sourceLang}/${targetLang}/${encodeURIComponent(
      text
    )}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Lingva HTTP error: ${response.status}`);
    }
    const data = await response.json();
    return data.translation || "";
  } catch (err) {
    console.error("Lingva Translate error:", err);
    return text; // fallback
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
