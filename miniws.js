// Minimal dependency-free WebSocket server (RFC 6455): text messages, ping/pong, close.
// Exposes a small subset of the `ws` package API: new WebSocketServer({server, maxPayload}),
// wss.on('connection', ws => ...), wss.clients, ws.on('message'|'close'|'pong'),
// ws.send(string), ws.ping(), ws.terminate(), ws.readyState (1 = open).
const crypto = require('crypto');
const { EventEmitter } = require('events');
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function frame(opcode, payload) {
  const len = payload.length;
  let head;
  if (len < 126) { head = Buffer.alloc(2); head[1] = len; }
  else if (len < 65536) { head = Buffer.alloc(4); head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  head[0] = 0x80 | opcode;
  return Buffer.concat([head, payload]);
}

class Conn extends EventEmitter {
  constructor(socket, maxPayload) {
    super();
    this.socket = socket; this.max = maxPayload; this.buf = Buffer.alloc(0);
    this.parts = []; this.readyState = 1;
    socket.setNoDelay(true);
    socket.on('data', d => this._data(d));
    const done = () => { if (this.readyState !== 3) { this.readyState = 3; this.emit('close'); } };
    socket.on('close', done); socket.on('end', done); socket.on('error', done);
  }
  _data(d) {
    this.buf = Buffer.concat([this.buf, d]);
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = b[0] & 0x80, op = b[0] & 0x0f, masked = b[1] & 0x80;
      let len = b[1] & 0x7f, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
      if (len > this.max) return this.terminate();
      const need = off + (masked ? 4 : 0) + len;
      if (b.length < need) return;
      let payload = b.subarray(off + (masked ? 4 : 0), need);
      if (masked) {
        const mask = b.subarray(off, off + 4);
        payload = Buffer.from(payload);
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      }
      this.buf = b.subarray(need);
      if (op === 0x8) { this._write(frame(0x8, Buffer.alloc(0))); return this.terminate(); }
      if (op === 0x9) { this._write(frame(0xA, payload)); continue; }
      if (op === 0xA) { this.emit('pong'); continue; }
      if (op === 0x1 || op === 0x2 || op === 0x0) {
        this.parts.push(payload);
        const total = this.parts.reduce((a, p) => a + p.length, 0);
        if (total > this.max) return this.terminate();
        if (fin) {
          const msg = Buffer.concat(this.parts); this.parts = [];
          this.emit('message', msg.toString('utf8'));
        }
      }
    }
  }
  _write(buf) { if (this.readyState === 1) { try { this.socket.write(buf); } catch { this.terminate(); } } }
  send(str) { this._write(frame(0x1, Buffer.from(String(str), 'utf8'))); }
  ping() { this._write(frame(0x9, Buffer.alloc(0))); }
  terminate() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    try { this.socket.destroy(); } catch {}
    this.emit('close');
  }
}

class WebSocketServer extends EventEmitter {
  constructor({ server, maxPayload = 64 * 1024 }) {
    super();
    this.clients = new Set();
    server.on('upgrade', (req, socket) => {
      const key = req.headers['sec-websocket-key'];
      if (!key || String(req.headers.upgrade).toLowerCase() !== 'websocket') { socket.destroy(); return; }
      const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
      socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
        'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n');
      const ws = new Conn(socket, maxPayload);
      this.clients.add(ws);
      ws.on('close', () => this.clients.delete(ws));
      this.emit('connection', ws, req);
    });
  }
}
module.exports = { WebSocketServer };
