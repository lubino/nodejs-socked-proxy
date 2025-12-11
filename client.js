const WebSocket = require('ws');
const net = require('net');

const SERVER_WS = 'ws://localhost:8080';
const MY_ID = 'UNIQUE_MY_ID';  // Change to your unique ID

class ProxyClient {
  constructor() {
    this.ws = null;
    this.clients = new Set();
    // service → { partnerId, socket, type: 'server'|'client' }
    this.services = new Map();
  }

  start() {
    this.ws = new WebSocket(SERVER_WS);

    this.ws.on('open', () => console.log('WS connected'));
    this.ws.on('message', (data) => this.handle(raw = data.toString()));
    this.ws.on('close', () => {
      this.services.clear();
      setTimeout(() => this.start(), 3000);
    });
  }

  handle(raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'auth') {
      this.ws.send(JSON.stringify({ id: MY_ID }));
      return;
    }
    if (msg.type === 'discovery') {
      this.clients = new Set(msg.clients.filter(c => c !== MY_ID));
      console.log('Online:', [...this.clients]);
      return;
    }
    if (msg.type === 'data' && msg.service && msg.from && msg.data) {
      this.handleData(msg.from, msg.service, msg.data);
    }
  }

  handleData(fromId, service, b64) {
    const svc = this.services.get(service);
    if (!svc || svc.partnerId !== fromId) return;  // only from paired partner

    // If short → possible control message
    if (b64.length < 300) {
      try {
        const jsonStr = Buffer.from(b64, 'base64').toString();
        const payload = JSON.parse(jsonStr);

        if (payload.service === 'openPort' || payload.service === 'connect') {
          if (payload.id !== MY_ID) return;  // not for me
          this.setupConnection(service, payload);
          return;
        }
      } catch {}
    }

    // Normal data → forward to socket
    if (svc.socket) {
      try {
        svc.socket.write(Buffer.from(b64, 'base64'));
      } catch (e) { console.error('Write error', e); }
    }
  }

  setupConnection(service, payload) {
    // close old if exists
    this.services.get(service)?.socket?.destroy();

    let socket;
    if (payload.service === 'openPort') {
      socket = net.createServer((clientSock) => {
        clientSock.on('data', data => this.send(service, data));
        clientSock.on('error', () => {});
      });
      socket.listen(payload.port);
      console.log(`Opened local port ${payload.port} for ${service}`);
    } else {  // connect
      socket = net.connect(payload.port, payload.host || '127.0.0.1', () => {
        console.log(`Connected to ${payload.host || 'localhost'}:${payload.port}`);
      });
    }

    socket.on('data', data => this.send(service, data));
    socket.on('close', () => this.services.delete(service));
    socket.on('error', () => {});

    this.services.set(service, { partnerId: payload.id ? fromId : null, socket, type: payload.service });
  }

  send(service, buffer) {
    const svc = this.services.get(service);
    if (!svc || !svc.partnerId) return;

    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'forward',
        service,
        id: svc.partnerId,
        data: buffer.toString('base64')
      }));
    }
  }
}

const client = new ProxyClient();
client.start();
