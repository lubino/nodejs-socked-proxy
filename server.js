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
  } else if (req.method === 'GET' && req.url === '/client.js') {
    const hostname = req.headers.host; // napr. "localhost:3000" alebo "example.com"
    const protocol = req.headers['x-forwarded-proto'] || 'http'; // 'https' ak je za proxy
    const fullUrl = `${protocol === "https:" ? "wss" : "ws"}://${hostname}`;
    const js = readFileSync(path.join(__dirname, 'client.js'), 'utf-8')
      .replace('ws://localhost:8080', fullUrl)
      .replace('UNIQUE_MY_ID', "N"+Math.random().toString(36).substr(2, 9))

    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    res.end(js);
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

const wss = new WebSocketServer({ server });

// Mapa: WebSocket → clientId (string)
const clients = new Map();
// Mapa: clientId → WebSocket (pre rýchle vyhľadanie cieľa)
const clientsById = new Map();

console.log(`Sync server running → http://localhost:${PORT}`);

function broadcastDiscovery() {
  const clientIds = Array.from(clientsById.keys());
  const message = JSON.stringify({
    type: "discovery",
    clients: clientIds
  });

  clients.forEach(ws => {
    if (ws.readyState === ws.OPEN) {
      ws.send(message);
    }
  });
}

wss.on('connection', (ws) => {
  // Nový klient ešte nemá ID
  ws.send(JSON.stringify({ type: "auth" }));
  console.log("New client connected, requesting auth");

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch (e) {
      return;
    }

    // Prvá správa musí byť autorizácia
    if (!clients.has(ws) && msg.id && typeof msg.id === "string") {
      const clientId = msg.id.trim();
      if (clientsById.has(clientId)) {
        ws.send(JSON.stringify({ type: "error", message: "ID already taken" }));
        ws.close();
        return;
      }

      clients.set(ws, clientId);
      clientsById.set(clientId, ws);
      console.log(`Client authenticated: ${clientId} (${clients.size})`);
      broadcastDiscovery();
      return;
    }

    // Ak klient ešte nie je autorizovaný, ignorujeme ostatné správy
    if (!clients.has(ws)) {
      return;
    }

    const senderId = clients.get(ws);

    // Preposielanie správ
    if (msg.type === "forward" && msg.service && msg.id && msg.data) {
      const targetWs = clientsById.get(msg.id);
      if (targetWs && targetWs.readyState === targetWs.OPEN) {
        const forwardMsg = {
          type: "data",
          service: msg.service,
          from: senderId,
          data: msg.data
        };
        targetWs.send(JSON.stringify(forwardMsg));
      }
    }
  });

  ws.on('close', () => {
    if (clients.has(ws)) {
      const clientId = clients.get(ws);
      clients.delete(ws);
      clientsById.delete(clientId);
      console.log(`Client disconnected: ${clientId} (${clients.size})`);
      broadcastDiscovery();
    }
  });
});

server.listen(PORT);
