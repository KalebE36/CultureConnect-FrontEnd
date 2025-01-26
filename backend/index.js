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
 *         socketIdA: "en",
 *         socketIdB: "ru"
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

  let recognizeStream = null;   // Google STT stream for this socket
  let currentCallId = null;     // Which call the socket is in
  let sttLanguage = "en-US";    // Google STT language
  let shortLanguage = "en";     // e.g. "en", "ru" for Lingva

  // ----- 1. LANGUAGE SELECTION -----
  socket.on("set-language", (langCode) => {
    console.log(`Socket ${socket.id} set language to:`, langCode);
    sttLanguage = langCode || "en-US";
    shortLanguage = sttLanguage.split("-")[0] || "en";

    // If the user is already in a call, update the calls object
    if (currentCallId && calls[currentCallId]) {
      calls[currentCallId].languages[socket.id] = shortLanguage;
    }
  });

  // ----- 2. START CALL -----
  socket.on("start-call", () => {
    const callId = uuidv4().slice(0, 8);
    calls[callId] = {
      participants: [socket.id],
      languages: { [socket.id]: shortLanguage },
    };
    currentCallId = callId;
    socket.join(callId);

    socket.emit("call-id", callId);
    io.emit("call-started", callId);
    console.log("Call started:", callId);
  });

  // ----- 3. JOIN CALL -----
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

  // ----- 4. LIST ACTIVE CALLS -----
  socket.on("get-active-calls", () => {
    socket.emit("active-calls", Object.keys(calls));
  });

  // ----- 5. WEBRTC SIGNALING -----
  socket.on("offer", ({ callId, sdp }) => {
    socket.to(callId).emit("offer", sdp);
  });
  socket.on("answer", ({ callId, sdp }) => {
    socket.to(callId).emit("answer", sdp);
  });
  socket.on("ice-candidate", ({ callId, candidate }) => {
    socket.to(callId).emit("ice-candidate", candidate);
  });

  // ----- 6. AUDIO DATA => STT => TRANSLATION -----
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
            interimResults: true, // we still receive partial & final
          })
          .on("data", async (data) => {
            const result = data.results[0];
            if (!result) return;

            const transcript = result.alternatives[0]?.transcript;
            if (!transcript) return;

            // *** Check if it's final ***
            const isFinal = result.isFinal;
            // If you ONLY want final transcripts translated:
            if (!isFinal) {
              // Optionally, you can still show partial transcripts to the speaker
              socket.emit("transcript", transcript); 
              return; 
            }

            // It's final => let's do the translation
            console.log(`[${socket.id}] Final STT:`, transcript);

            // 1) Emit original final transcript to speaker if desired
            socket.emit("transcript", transcript);

            // 2) Translate to other participant(s)
            if (!currentCallId) return;
            const call = calls[currentCallId];
            if (!call) return;

            for (const otherSocketId of call.participants) {
              if (otherSocketId === socket.id) continue; // skip speaker

              const targetLang = call.languages[otherSocketId] || "en";
              if (targetLang === shortLanguage) {
                // same language, no need to call translation
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

              // Send the result
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
      // Write chunk
      const audioBuffer = Buffer.from(new Uint8Array(chunk));
      recognizeStream.write(audioBuffer);
    } catch (err) {
      console.error("audio-data error:", err);
      socket.emit("speech-error", err.toString());
    }
  });

  // ----- 7. DISCONNECT / CLEANUP -----
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

// Lingva helper
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
    return text; // fallback to original text
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
