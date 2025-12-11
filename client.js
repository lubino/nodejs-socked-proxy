import WebSocket from 'ws';
import net from 'net';

const SERVER_WS = 'ws://localhost:8080';
const MY_ID = 'UNIQUE_MY_ID';  // Change to your unique ID

class ProxyClient {
  constructor() {
    this.ws = null
    this.clients = new Set()
    // service â†’ { partnerId, socket, type: 'server'|'client' }
    this.services = new Map()
  }

  start() {
    this.ws = new WebSocket(SERVER_WS)

    this.ws.on('open', () => console.log('WS connected'))
    this.ws.on('message', (data) => {
      this.handle(data.toString())
    })
    this.ws.on('close', () => {
      this.services.clear()
      setTimeout(() => this.start(), 3000)
    })
  }

  handle(raw) {
    let msg
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }

    if (msg.type === 'auth') {
      this.ws.send(JSON.stringify({id: MY_ID}))
      return
    }
    if (msg.type === 'discovery') {
      this.clients = new Set(msg.clients.filter(c => c !== MY_ID))
      console.log('Online:', [...this.clients])
      return
    }
    if (msg.type === 'data' && msg.service && msg.from && msg.data) {
      this.handleData(msg.from, msg.service, msg.data)
    }
  }

  handleData(fromId, service, b64) {
    if (service === 'connect' || service === 'openPort') {
      try {
        const jsonStr = Buffer.from(b64, 'base64').toString()
        const payload = JSON.parse(jsonStr)
        if (payload.id === MY_ID) return  // self tunel
        this.setupConnection(service, payload)
      } catch {
      }
      return
    }
    const svc = this.services.get(service)
    if (!svc) return  // only from paired partner

    // Normal data â†’ forward to socket
    try {
      svc.socket.write(Buffer.from(b64, 'base64'))
    } catch (e) {
      console.error('Write error', e)
    }
  }

  setupConnection(action, payload) {
    // close old if exists
    const service = payload.service

    if (action === 'openPort') {
      try {
        const socket = net.createServer((clientSock) => {

          clientSock.on('error', (e) => {
            console.log('Socket error', e)
          })
          clientSock.on('close', () => {
            console.log('Socket closed', service)
            this.services.delete(service)
          })
          clientSock.on('data', data => {
            this.send(service, data)
          })
          this.services.get(payload.service)?.socket?.destroy()
          this.services.set(service, {partnerId: payload.id, socket: clientSock, type: service})
        })
        socket.listen(payload.port)
        console.log(`Opened local port ${payload.port} for ${service}`)
      } catch (e) {
        console.error('Port error', e)
      }
    } else if (action === 'connect') {  // connect
      try {
        const socket = net.connect(payload.port, payload.host || '127.0.0.1', (a) => {
          console.log(`Connected to ${payload.host || 'localhost'}:${payload.port}`)
          socket.on('error', (e) => {
            console.log('Socket error', e)
          })
          socket.on('close', () => {
            console.log('Socket closed', service)
            this.services.delete(service)
          })
          socket.on('data', data => {
            this.send(service, data)
          })
          this.services.get(payload.service)?.socket?.destroy()
          this.services.set(service, {partnerId: payload.id, socket, type: service})
        })
      } catch (e) {
        console.error('Connecting error', e)
      }
    }
  }

  send(service, buffer) {
    const svc = this.services.get(service)
    if (!svc) return

    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'forward',
        service,
        id: svc.partnerId,
        data: buffer.toString('base64')
      }))
    }
  }
}

const client = new ProxyClient();
client.start();
