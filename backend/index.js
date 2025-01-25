// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid"); // for unique call IDs

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

// In-memory "active calls" store
// In a real app, you might use a database or more sophisticated tracking
const calls = {}; // { callId: true }

io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  // Just a test route so we know server is up
  app.get("/", (req, res) => {
    res.send("Hello from the Socket.IO server!");
  });

  // 1. Start a new call
  socket.on("start-call", () => {
    const callId = uuidv4().slice(0, 8); // short ID
    calls[callId] = true;
    socket.join(callId);

    // Tell the caller which callId they got
    socket.emit("call-id", callId);

    // Broadcast to everyone that a new call has started
    io.emit("call-started", callId);
    console.log(`Call started: ${callId}`);
  });

  // 2. Join an existing call
  socket.on("join-call", (callId) => {
    if (!calls[callId]) {
      // If call doesn't exist, notify the user
      socket.emit("call-error", "Call does not exist!");
      return;
    }
    socket.join(callId);
    console.log(`Socket ${socket.id} joined call ${callId}`);
    socket.emit("joined-call", callId);
  });

  // 3. Return the list of active calls
  socket.on("get-active-calls", () => {
    socket.emit("active-calls", Object.keys(calls));
  });

  // ========== WebRTC Signaling Events ==========
  //
  // The client will now emit { callId, sdp } or { callId, candidate }
  // so we can forward them to everyone else in that call room.
  //

  socket.on("offer", (payload) => {
    // payload = { callId, sdp }
    console.log("Offer received for callId:", payload.callId);
    socket.to(payload.callId).emit("offer", payload.sdp);
  });

  socket.on("answer", (payload) => {
    // payload = { callId, sdp }
    console.log("Answer received for callId:", payload.callId);
    socket.to(payload.callId).emit("answer", payload.sdp);
  });

  socket.on("ice-candidate", (payload) => {
    // payload = { callId, candidate }
    socket.to(payload.callId).emit("ice-candidate", payload.candidate);
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    // (Optional) You might want to check if the user was the last one in a call
    // and remove that call from "calls" if it's now empty. That takes extra logic.
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});