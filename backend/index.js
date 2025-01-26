// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

// In-memory: just the call IDs
// e.g. { "abcd1234": true, ... }
const calls = {};

app.get("/", (req, res) => {
  res.send("Minimal server without storing user info");
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // Start call (no user info)
  socket.on("start-call", () => {
    const callId = uuidv4().slice(0, 8);
    calls[callId] = true;

    // Emit callId back to the starter
    socket.emit("call-id", callId);

    // Also tell everyone a new call has started
    // (No ownerName / ownerLang here)
    io.emit("call-started", { callId });
    console.log("Call started:", callId);
  });

  // Join call
  socket.on("join-call", (callId) => {
    if (!calls[callId]) {
      socket.emit("call-error", "Call does not exist!");
      return;
    }
    socket.join(callId);
    socket.emit("joined-call", callId);
    console.log(`Socket ${socket.id} joined call ${callId}`);
  });

  // get-active-calls
  socket.on("get-active-calls", () => {
    // Return an array of call objects
    // (Only storing callId on the server)
    const list = Object.keys(calls).map((id) => ({ callId: id }));
    socket.emit("active-calls", list);
  });

  // Listen for "client-call-info" from the user who started the call
  // which includes the real { callId, ownerName, ownerLang }
  socket.on("client-call-info", (payload) => {
    // Relay that to everyone so they can update calls locally
    io.emit("client-call-info", payload);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    // (Optional) If they started a call, you might remove it if it's only them
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
