const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const LogWatcher = require('./tail');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 8080;

const watcher = new LogWatcher("sample.log");
watcher.start();

app.use(express.static(path.join(__dirname, 'public')));

const clients = new Set();

// Broadcast helper (plain text lines)
const broadcast = (line) => {
  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(line);
    }
  });
};

watcher.on("log-update", (line) => {
  broadcast(line);
});


wss.on('connection', async (ws) => {
  console.log('Client connected');
  clients.add(ws);

  try {
    // Send last 10 lines initially (plain text)
    const lastLines = await watcher.getLastNLines();
    lastLines.forEach((line) => ws.send(line));
  } catch (err) {
    console.error("Error fetching initial logs:", err);
    ws.send("[Error] Failed to read log file");
  }

  ws.on('close', () => {
    console.log('Client disconnected');
    clients.delete(ws);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});