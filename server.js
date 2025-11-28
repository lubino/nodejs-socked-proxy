// server.js
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8080;

// HTTP + WebSocket on same port
const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    const html = readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

const wss = new WebSocketServer({ server });
const clients = new Set();

console.log(`Sync server running → http://localhost:${PORT}`);

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`Client connected (${clients.size})`);

  ws.on('message', (data) => {
    clients.forEach(client => {
      if (client !== ws && client.readyState === client.OPEN) {
        client.send(data);
      }
    });
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`Client disconnected (${clients.size})`);
  });
});

server.listen(PORT);
