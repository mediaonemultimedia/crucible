/* The phone pads' transport (copied from Pillow Fight 2's src/pad/). The
   game hosts one pad room (peer id `downhill-pad-<CODE>`); each phone connects two channels to it:
   'pc' (reliable, ordered, JSON: hello, seat, screen, buzz, ink, …) and
   'pi' (unreliable, unordered, raw bytes: the input packets and pings —
   src/pad/wire.js). PeerJS's broker only does the handshake; the data goes
   phone ↔ game directly.

   ?net=local swaps PeerJS for a BroadcastChannel between tabs of one
   browser — no network — for the tests; there `lag`, `jitter` (ms) and
   `loss` (0–1, the 'pi' channel only) on either page delay / drop what that
   page sends.                                                            */

import { Peer } from 'peerjs';
/* public STUN only; PeerJS's cloud broker does the handshake */
export const STUN = [{ urls: 'stun:stun.l.google.com:19302' }];

export const PAD_PREFIX = 'downhill-pad-';
export const PAD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function padCode(n = 4) {
  const a = new Uint32Array(n);
  crypto.getRandomValues(a);
  return [...a].map((v) => PAD_CHARS[v % PAD_CHARS.length]).join('');
}

function peerOpts(params) {
  const o = { debug: params.has('netdebug') ? 3 : 0, config: { iceServers: STUN } };
  const b = params.get('broker');
  if (b && /^(localhost|127\.0\.0\.1):\d+$/.test(b)) { const [host, port] = b.split(':'); Object.assign(o, { host, port: +port, path: '/', secure: false, key: 'peerjs' }); }
  return o;
}

/* lag / jitter / loss for the tests (local transport only) */
function shaper(params) {
  const lag = +params.get('lag') || 0, jit = +params.get('jitter') || 0, loss = +params.get('loss') || 0;
  if (!lag && !jit && !loss) return (ch, fn) => fn();
  return (ch, fn) => {
    if (ch === 'pi' && loss && Math.random() < loss) return;
    const d = lag + (jit ? Math.random() * jit : 0);
    setTimeout(fn, d);
  };
}

/* the phone's 'pi' channel: unordered AND no retransmits (PeerJS's
   reliable:false only turns ordering off) */
let patched = false;
function unreliablePi() {
  if (patched || typeof RTCPeerConnection === 'undefined') return;
  patched = true;
  const orig = RTCPeerConnection.prototype.createDataChannel;
  RTCPeerConnection.prototype.createDataChannel = function (label, o = {}) {
    return orig.call(this, label, label === 'pi' ? { ...o, ordered: false, maxRetransmits: 0 } : o);
  };
}

/* ── the game: host the room ──────────────────────────────────────────
   cb.ready(code), cb.join(conn) — conn: { id, send(ch, msg), on(ch, msg), onclose, close() } —
   cb.error(kind) */
export function hostPads(params, code, cb) {
  if (params.get('net') === 'local') return hostLocal(params, code, cb);
  if (params.get('net') === 'lan') return hostLan(params, code, cb);
  const peer = new Peer(PAD_PREFIX + code, peerOpts(params));
  const by = new Map();
  let dead = false;
  peer.on('open', () => cb.ready(code));
  peer.on('error', (err) => { if (err?.type === 'unavailable-id') cb.error('taken'); else if (err?.type === 'network' || err?.type === 'server-error' || err?.type === 'socket-error') cb.error('network'); });
  peer.on('disconnected', () => { if (!dead) setTimeout(() => { try { if (!dead && peer.disconnected && !peer.destroyed) peer.reconnect(); } catch { /* */ } }, 2000); });
  peer.on('connection', (dc) => {
    let c = by.get(dc.peer);
    if (!c || c.closed) {
      c = { id: dc.peer, ch: {}, closed: false, on: () => {}, onclose: () => {} };
      c.send = (ch, msg) => { const d = c.ch[ch]; if (d && d.open) { try { d.send(msg); } catch { /* closing */ } } };
      c.close = () => { c.closed = true; for (const d of Object.values(c.ch)) { try { d.close(); } catch { /* */ } } };
      by.set(dc.peer, c);
    }
    c.ch[dc.label] = dc;
    dc.on('data', (m) => { if (!c.closed) c.on(dc.label, m); });
    const gone = () => { if (c.closed) return; c.closed = true; by.delete(dc.peer); c.onclose(); };
    dc.on('close', gone);
    dc.on('error', gone);
    dc.on('open', () => { if (c.ch.pc?.open && c.ch.pi?.open && !c.joined) { c.joined = true; cb.join(c); } });
  });
  return { close: () => { dead = true; for (const c of by.values()) c.close(); try { peer.destroy(); } catch { /* */ } } };
}

function hostLocal(params, code, cb) {
  const channel = new BroadcastChannel(PAD_PREFIX + code);
  const handle = hostRoom(params, cb, channel);
  setTimeout(() => cb.ready(code), 30);
  return handle;
}

function hostRoom(params, cb, bc) {
  const shape = shaper(params);
  const by = new Map();
  bc.onmessage = ({ data: d }) => {
    if (!d || d.to) return;
    let c = by.get(d.from);
    if (d.hello) {
      if (c && !c.closed) { bc.postMessage({ to: d.from, welcome: 1 }); return; }
      c = { id: d.from, closed: false, on: () => {}, onclose: () => {} };
      c.send = (ch, msg) => { if (!c.closed) shape(ch, () => { try { bc.postMessage({ to: c.id, ch, msg }); } catch { /* closed */ } }); };
      c.close = () => { if (c.closed) return; c.closed = true; try { bc.postMessage({ to: c.id, bye: 1 }); } catch { /* */ } };
      by.set(d.from, c);
      bc.postMessage({ to: d.from, welcome: 1 });
      cb.join(c);
      return;
    }
    if (!c || c.closed) return;
    if (d.bye) { c.closed = true; by.delete(d.from); c.onclose(); return; }
    if (d.ch) c.on(d.ch, d.msg);
  };
  return { close: () => { for (const c of by.values()) c.close(); bc.close(); } };
}

/* ── the phone: join a room ───────────────────────────────────────────
   cb.open(link) — link: { send(ch, msg), on(ch, msg), onclose, close() } —
   cb.error(kind) */
export function joinPad(params, code, uid, cb) {
  if (params.get('net') === 'local') return joinRoom(params, uid, cb, new BroadcastChannel(PAD_PREFIX + code));
  if (params.get('net') === 'lan') return joinRoom(params, uid, cb, lanChannel(code, uid));
  unreliablePi();
  const peer = new Peer(peerOpts(params));
  const link = { ch: {}, closed: false, on: () => {}, onclose: () => {} };
  link.send = (ch, msg) => { const d = link.ch[ch]; if (d && d.open) { try { d.send(msg); } catch { /* closing */ } } };
  link.close = () => { if (link.closed) return; link.closed = true; for (const d of Object.values(link.ch)) { try { d.close(); } catch { /* */ } } try { peer.destroy(); } catch { /* */ } };
  let done = false;
  const fail = (kind) => { if (done) return; done = true; clearTimeout(timer); link.closed = true; try { peer.destroy(); } catch { /* */ } cb.error(kind); };
  const timer = setTimeout(() => fail('timeout'), 15000);
  peer.on('error', (err) => { if (!done) fail(err?.type === 'peer-unavailable' ? 'notfound' : 'network'); else if (!link.closed) { link.closed = true; link.onclose(); } });
  peer.on('open', () => {
    for (const [label, reliable, serialization] of [['pc', true, 'json'], ['pi', false, 'raw']]) {
      const dc = peer.connect(PAD_PREFIX + code, { label, reliable, serialization });
      link.ch[label] = dc;
      dc.on('data', (m) => { if (!link.closed) link.on(label, m); });
      const gone = () => { if (link.closed) return; link.closed = true; try { peer.destroy(); } catch { /* */ } link.onclose(); };
      dc.on('close', gone);
      dc.on('error', gone);
      dc.on('open', () => { if (link.ch.pc?.open && link.ch.pi?.open && !done) { done = true; clearTimeout(timer); cb.open(link); } });
    }
  });
  return link;
}

function joinRoom(params, uid, cb, bc) {
  const shape = shaper(params);
  const link = { closed: false, on: () => {}, onclose: () => {} };
  let open = false;
  link.send = (ch, msg) => { if (!link.closed) shape(ch, () => { try { bc.postMessage({ from: uid, ch, msg }); } catch { /* closed */ } }); };
  link.close = () => { if (link.closed) return; link.closed = true; clearInterval(hello); try { bc.postMessage({ from: uid, bye: 1 }); } catch { /* */ } bc.close(); };
  const hello = setInterval(() => { if (!open && !link.closed) bc.postMessage({ from: uid, hello: 1 }); }, 400);
  const timer = setTimeout(() => { if (!open) { clearInterval(hello); link.closed = true; bc.close(); cb.error('notfound'); } }, 8000);
  bc.onmessage = ({ data: d }) => {
    if (!d || d.to !== uid || link.closed) return;
    if (d.welcome && !open) { open = true; clearTimeout(timer); clearInterval(hello); cb.open(link); return; }
    if (d.bye) { link.closed = true; bc.close(); link.onclose(); return; }
    if (d.ch) link.on(d.ch, d.msg);
  };
  bc.onclose = () => {
    if (link.closed) return;
    link.closed = true;
    clearTimeout(timer); clearInterval(hello);
    if (open) link.onclose(); else cb.error('network');
  };
  bc.postMessage({ from: uid, hello: 1 });
  return link;
}


// Explicit LAN playtest transport. The local server routes the same envelopes
// as the BroadcastChannel test path. Binary input bytes travel as JSON arrays.
function lanChannel(code, uid) {
  const url = new URL('/pad-relay', location.href);
  url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  url.search = new URLSearchParams({ code, ...(uid ? { uid } : {}) });
  const socket = new WebSocket(url);
  const channel = {
    postMessage(data) {
      if (socket.readyState !== WebSocket.OPEN || (data.ch === 'pi' && socket.bufferedAmount > 4096)) return;
      socket.send(JSON.stringify(data.ch === 'pi' ? { ...data, msg: Array.from(data.msg) } : data));
    },
    close: () => socket.close(),
  };
  socket.addEventListener('message', ({ data }) => channel.onmessage?.({ data: JSON.parse(data) }));
  socket.addEventListener('close', ({ code }) => channel.onclose?.(code));
  return channel;
}

function hostLan(params, code, cb) {
  const channel = lanChannel(code);
  const handle = hostRoom(params, cb, channel);
  const receive = channel.onmessage;
  channel.onmessage = (event) => {
    if (event.data.ready) cb.ready(code);
    else receive(event);
  };
  channel.onclose = (reason) => cb.error(reason === 4009 ? 'taken' : 'network');
  return {
    close() {
      channel.onclose = null;
      handle.close();
    },
  };
}
