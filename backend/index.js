// backend/index.js
const WebSocket = require('ws');

// Create a WebSocket server on port 3001
const wss = new WebSocket.Server({ port: 3001 }, () => {
  console.log('WebSocket server is listening on ws://localhost:3001');
});

// Listen for client connections
wss.on('connection', (ws) => {
  console.log('A new client connected!');

  // Send a welcome message
  ws.send('Hello from WebSocket server!');

  // Handle incoming messages
  ws.on('message', (message) => {
    console.log(`Received message => ${message}`);
    // Echo the message back or handle it as needed
    ws.send(`Server says: ${message}`);
  });

  // Handle client disconnect
  ws.on('close', () => {
    console.log('A client disconnected.');
  });
});
