// src/pages/Camera.tsx
import React, { useEffect } from 'react';

export default function Camera() {
  useEffect(() => {
    // Connect to your local WebSocket server
    const ws = new WebSocket('ws://localhost:3001');

    // When the connection is open
    ws.onopen = () => {
      console.log('Connected to WebSocket server');
      // Optionally send something to the server
      ws.send('Hello from the client!');
    };

    // When a message is received
    ws.onmessage = (event) => {
      console.log('Received:', event.data);
    };

    // When the connection is closed
    ws.onclose = () => {
      console.log('WebSocket connection closed');
    };

    // Cleanup when component unmounts
    return () => {
      ws.close();
    };
  }, []);

  return (
    <main className="bg-purple-700">
      <h3>Cam</h3>
    </main>
  );
}
