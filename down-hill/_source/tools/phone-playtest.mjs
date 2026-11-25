// Private Wi-Fi playtest. Run the lookdev build with ?net=lan.
import { createServer } from 'node:https';
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { SKIN_IDS } from '../src/pad/skins.js';

const [html, art, cert, key, bind = 'localhost', port = '8443'] = process.argv.slice(2);
if (!key) {
  console.log('Usage: node tools/phone-playtest.mjs BUILD ART_DIR CERT KEY [BIND_ADDRESS] [PORT]');
  process.exit(1);
}

const skins = new Map(SKIN_IDS.map((id) => [`/controller/backgrounds/${id}.webp`, resolve(art, `${id}.webp`)]));
const server = createServer({ cert: readFileSync(cert), key: readFileSync(key) }, (req, res) => {
  const pathname = new URL(req.url, 'https://localhost').pathname;
  if (pathname === '/' && !req.url.includes('?')) {
    res.writeHead(302, { Location: '/?net=lan' }).end();
    return;
  }
  const file = pathname === '/' ? html : skins.get(pathname);
  if (!file || !['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(404).end();
    return;
  }
  const info = statSync(file, { throwIfNoEntry: false });
  if (!info?.isFile()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, {
    'Content-Type': pathname === '/' ? 'text/html; charset=utf-8' : 'image/webp',
    'Content-Length': info.size,
  });
  if (req.method === 'HEAD') res.end();
  else createReadStream(file).on('error', () => res.destroy()).pipe(res);
});

const relay = new WebSocketServer({ noServer: true, maxPayload: 4096 });
const rooms = new Map();
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'https://localhost');
  if (url.pathname !== '/pad-relay' || req.headers.origin !== `https://${req.headers.host}`) {
    socket.destroy();
    return;
  }
  relay.handleUpgrade(req, socket, head, (ws) => {
    ws.on("error", () => ws.terminate());
    const code = url.searchParams.get('code');
    const uid = url.searchParams.get('uid');
    if (!/^[A-Z2-9]{4}$/.test(code ?? '') || (uid !== null && !/^[\w-]{1,64}$/.test(uid))) {
      ws.close(1008);
      return;
    }
    if (uid === null) {
      if (rooms.has(code)) { ws.close(4009); return; }
      const phones = new Map();
      rooms.set(code, { host: ws, phones });
      ws.send('{"ready":true}');
      ws.on('message', (raw) => {
        const message = parse(raw);
        const phone = phones.get(message?.to);
        if (phone?.readyState === WebSocket.OPEN) {
          if (message.bye) phone.close();
          else forward(phone, message);
        }
      });
      ws.on('close', () => {
        rooms.delete(code);
        for (const phone of phones.values()) phone.close();
      });
    } else {
      const room = rooms.get(code);
      if (!room || room.phones.size >= 16 && !room.phones.has(uid)) { ws.close(1008); return; }
      room.phones.get(uid)?.close();
      room.phones.set(uid, ws);
      ws.on('message', (raw) => {
        const message = parse(raw);
        if (!message || room.phones.get(uid) !== ws) return;
        forward(room.host, { from: uid, hello: message.hello, bye: message.bye, ch: message.ch, msg: message.msg });
      });
      ws.on('close', () => {
        if (room.phones.get(uid) !== ws) return;
        room.phones.delete(uid);
        forward(room.host, { from: uid, bye: 1 });
      });
    }
  });
});

function parse(raw) {
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' ? value : null;
  } catch { return null; }
}

function forward(ws, message) {
  if (ws.readyState === WebSocket.OPEN && (message.ch !== 'pi' || ws.bufferedAmount < 4096)) {
    ws.send(JSON.stringify(message));
  }
}

server.listen(+port, bind, () => {
  console.log(`Phone playtest listening on https://${bind}:${port}/?net=lan`);
});
