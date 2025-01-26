// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");
const speech = require("@google-cloud/speech");
const fetch = require("node-fetch");  // or "axios"

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Google Cloud Speech
const speechClient = new speech.SpeechClient({
  keyFilename: "service-account-key.json", // GCP credentials
});

/**
 * calls = {
 *   "abcd1234": {
 *       participants: [socketIdA, socketIdB],
 *       languages: {
 *         socketIdA: "en", // or "en-US"
 *         socketIdB: "ru"  // or "ru-RU"
 *       }
 *   }
 * }
 */
const calls = {};

app.get("/", (req, res) => {
  res.send("WebRTC + STT + Translation Server");
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // We'll store the active streamingRecognize object per socket
  let recognizeStream = null;

  // We'll also store the callId this socket is in
  let currentCallId = null;

  // We'll store the language codes
  let sttLanguage = "en-US";   // used by Google STT
  let shortLanguage = "en";    // used by Lingva (translation)

  // ========== 1. LANGUAGE SELECTION ==========
  // We'll assume the client calls this with something like "en-US"
  socket.on("set-language", (langCode) => {
    console.log(`Socket ${socket.id} set language to:`, langCode);

    // For Google STT:
    sttLanguage = langCode || "en-US";

    // For translation, let's derive a short code from "en-US" => "en"
    // Very naive approach: just split by "-" to get the first part
    shortLanguage = sttLanguage.split("-")[0] || "en";

    // If they're already in a call, store it in calls structure too
    if (currentCallId && calls[currentCallId]) {
      calls[currentCallId].languages[socket.id] = shortLanguage;
    }
  });

  // ========== 2. START CALL ==========
  socket.on("start-call", () => {
    const callId = uuidv4().slice(0, 8);
    // Create the call record
    calls[callId] = {
      participants: [socket.id],
      languages: { [socket.id]: shortLanguage }, // store current socket's language
    };

    currentCallId = callId;
    socket.join(callId);

    socket.emit("call-id", callId);
    io.emit("call-started", callId);

    console.log("Call started:", callId);
  });

  // ========== 3. JOIN CALL ==========
  socket.on("join-call", (callId) => {
    if (!calls[callId]) {
      socket.emit("call-error", "Call does not exist!");
      return;
    }

    currentCallId = callId;
    socket.join(callId);

    // Add this participant to the call
    calls[callId].participants.push(socket.id);
    // Also store this participant's language
    calls[callId].languages[socket.id] = shortLanguage;

    socket.emit("joined-call", callId);
    console.log(`Socket ${socket.id} joined call ${callId}`);
  });

  // ========== 4. LIST ACTIVE CALLS ==========
  socket.on("get-active-calls", () => {
    socket.emit("active-calls", Object.keys(calls));
  });

  // ========== 5. WEBRTC SIGNALING ==========
  socket.on("offer", ({ callId, sdp }) => {
    socket.to(callId).emit("offer", sdp);
  });
  socket.on("answer", ({ callId, sdp }) => {
    socket.to(callId).emit("answer", sdp);
  });
  socket.on("ice-candidate", ({ callId, candidate }) => {
    socket.to(callId).emit("ice-candidate", candidate);
  });

  // ========== 6. AUDIO DATA => GOOGLE STT => TRANSLATION ==========
  socket.on("audio-data", (chunk) => {
    try {
      // If we haven't created a streamingRecognize yet, do it now
      if (!recognizeStream) {
        recognizeStream = speechClient
          .streamingRecognize({
            config: {
              encoding: "WEBM_OPUS",
              sampleRateHertz: 48000,
              languageCode: sttLanguage, // e.g. "en-US"
            },
            interimResults: true,
          })
          .on("data", async (data) => {
            const transcript = data.results[0]?.alternatives[0]?.transcript;
            if (!transcript) return;

            console.log(`STT from ${socket.id}:`, transcript);

            // 1) We can emit the original transcript back to the speaker if desired
            socket.emit("transcript", transcript);

            // 2) Translate to each other participant's language
            if (!currentCallId) return;
            const call = calls[currentCallId];
            if (!call) return;

            // For each participant in the call
            for (const otherSocketId of call.participants) {
              // Skip the speaker themself
              if (otherSocketId === socket.id) continue;

              // Get the participant's language from call.languages
              const targetLang = call.languages[otherSocketId] || "en";

              // If the targetLang == shortLanguage (speaker's language), no need to translate
              if (targetLang === shortLanguage) {
                // They share the same short language, so we can just emit the original transcript
                io.to(otherSocketId).emit("translated-transcript", {
                  original: transcript,
                  translated: transcript,
                  from: shortLanguage,
                  to: targetLang,
                });
                continue;
              }

              // Otherwise, call the translation API
              const translation = await translateWithLingva(
                shortLanguage,
                targetLang,
                transcript
              );

              // Then emit "translated-transcript" to that participant
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

      // Write new audio chunk
      const audioBuffer = Buffer.from(new Uint8Array(chunk));
      recognizeStream.write(audioBuffer);
    } catch (err) {
      console.error("audio-data error:", err);
      socket.emit("speech-error", err.toString());
    }
  });

  // ========== 7. DISCONNECT / CLEANUP ==========
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);

    if (recognizeStream) {
      recognizeStream.end();
      recognizeStream = null;
    }

    // Remove from call if any
    if (currentCallId && calls[currentCallId]) {
      const call = calls[currentCallId];
      call.participants = call.participants.filter((id) => id !== socket.id);
      delete call.languages[socket.id];

      // If no participants left, remove the call
      if (call.participants.length === 0) {
        delete calls[currentCallId];
      }
    }
  });
});

// ----------- Helper: use Lingva to translate -----------
async function translateWithLingva(sourceLang, targetLang, text) {
  try {
    // Example: https://lingva.ml/api/v1/en/ru/Hello%20world
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
    // fallback: return original text
    return text;
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
