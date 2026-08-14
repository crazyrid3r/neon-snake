/**
 * Neon Snake — WebSocket Game Server
 * Pure Node.js, no npm dependencies (uses built-in 'http' + 'net' + custom WS handshake)
 * Run: node server.js [port]
 */
const http = require('http');
const crypto = require('crypto');
const fs   = require('fs');
const path = require('path');
const PORT = parseInt(process.argv[2] || process.env.PORT || 3000, 10);

// ── Static file server ────────────────────────────────────────
const MIME = { '.html':'text/html', '.js':'application/javascript',
               '.css':'text/css', '.ico':'image/x-icon' };

const server = http.createServer((req, res) => {
  if (req.headers.upgrade) return; // handled below
  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
  filePath = filePath.split('?')[0];
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404); res.end('Not found');
    } else {
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain',
                           'Cache-Control': 'no-cache' });
      res.end(data);
    }
  });
});

// ── Minimal WebSocket server (RFC 6455) ───────────────────────
const clients = new Map(); // socketId → { socket, roomId, playerId }
let nextId = 1;

server.on('upgrade', (req, socket) => {
  if (req.headers['upgrade'].toLowerCase() !== 'websocket') {
    socket.destroy(); return;
  }
  const key = req.headers['sec-websocket-key'];
  const accept = crypto.createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );

  const id = nextId++;
  clients.set(id, { socket, roomId: null, playerId: null });

  let buf = Buffer.alloc(0);

  socket.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const b0 = buf[0], b1 = buf[1];
      const masked = !!(b1 & 0x80);
      let payloadLen = b1 & 0x7f;
      let offset = 2;
      if (payloadLen === 126) { if (buf.length < 4) break; payloadLen = buf.readUInt16BE(2); offset = 4; }
      else if (payloadLen === 127) { if (buf.length < 10) break; payloadLen = Number(buf.readBigUInt64BE(2)); offset = 10; }
      const totalLen = offset + (masked ? 4 : 0) + payloadLen;
      if (buf.length < totalLen) break;
      let payload;
      if (masked) {
        const mask = buf.slice(offset, offset + 4);
        payload = Buffer.allocUnsafe(payloadLen);
        for (let i = 0; i < payloadLen; i++) payload[i] = buf[offset + 4 + i] ^ mask[i % 4];
      } else {
        payload = buf.slice(offset, offset + payloadLen);
      }
      buf = buf.slice(totalLen);
      const opcode = b0 & 0x0f;
      if (opcode === 8) { socket.destroy(); break; } // close
      if (opcode === 9) { wsSend(socket, Buffer.alloc(0), 0xa); continue; } // pong
      if (opcode === 1 || opcode === 2) {
        try { handleMessage(id, JSON.parse(payload.toString('utf8'))); } catch(e) {}
      }
    }
  });

  socket.on('close', () => {
    const c = clients.get(id);
    if (c && c.roomId) {
      broadcastRoom(c.roomId, { type:'leave', id: c.playerId }, id);
    }
    clients.delete(id);
  });

  socket.on('error', () => socket.destroy());
});

function wsSend(socket, data, opcode = 1) {
  if (socket.destroyed) return;
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(typeof data === 'string' ? data : JSON.stringify(data), 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x80 | opcode, len]);
  } else if (len < 65536) {
    header = Buffer.allocUnsafe(4);
    header[0] = 0x80 | opcode; header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.allocUnsafe(10);
    header[0] = 0x80 | opcode; header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  try { socket.write(Buffer.concat([header, payload])); } catch(e) {}
}

function send(clientId, msg) {
  const c = clients.get(clientId);
  if (c) wsSend(c.socket, JSON.stringify(msg));
}

function broadcastRoom(roomId, msg, excludeClientId = null) {
  const json = JSON.stringify(msg);
  for (const [cid, c] of clients) {
    if (c.roomId === roomId && cid !== excludeClientId) wsSend(c.socket, json);
  }
}

// ── Game message routing ──────────────────────────────────────
// The server is a pure relay + room manager.
// Game logic stays in the browser (host tab).

function handleMessage(clientId, msg) {
  const c = clients.get(clientId);
  if (!c) return;

  switch (msg.type) {
    case '_join': {
      // Internal: client joins a relay room
      c.roomId   = msg.room;
      c.playerId = msg.id;
      send(clientId, { type: '_joined', room: msg.room });
      break;
    }
    case 'join':
    case 'join-ack':
    case 'start':
    case 'state':
    case 'input':
    case 'restart':
    case 'peer-sync':
    case 'ping':
    case 'pong': {
      // relay to room (or specific target)
      if (msg.to) {
        // find client by playerId
        for (const [oid, oc] of clients) {
          if (oc.playerId === msg.to) { send(oid, msg); break; }
        }
      } else {
        broadcastRoom(c.roomId, msg, clientId);
      }
      break;
    }
    case 'leave': {
      broadcastRoom(c.roomId, msg, clientId);
      c.roomId   = null;
      c.playerId = null;
      break;
    }
  }
}

server.listen(PORT, '0.0.0.0', () => {
  const interfaces = require('os').networkInterfaces();
  const ips = [];
  for (const iface of Object.values(interfaces)) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) ips.push(addr.address);
    }
  }
  console.log(`\n🐍 Neon Snake server running!\n`);
  console.log(`  Local:    http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  Network:  http://${ip}:${PORT}`);
  console.log(`\nShare the Network URL with friends on the same WiFi.\n`);
});
