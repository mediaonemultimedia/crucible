/* Finding the other player and talking to them.

   A Link is two channels to one peer: 'ctl' (reliable, ordered: the lobby,
   picks, match start, rematch) and 'in' (unordered: rollback input packets,
   which repeat themselves). Two transports make one:

   - PeerJS (the default): WebRTC data channels; PeerJS's free cloud broker
     only for the handshake, and public STUN. The host's peer id is
     `pillowfight-<ROOM>`. Nothing here runs — no request is made — until
     the player picks Online or opens a ?room= link.
   - local (?net=local): a BroadcastChannel between two tabs of the same
     browser — no network at all. For tests (and ?lag=MS adds latency).    */

import { Peer } from 'peerjs';

export const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O, 1/I
export const PREFIX = 'pillowfight-';
export const STUN = [{ urls: 'stun:stun.l.google.com:19302' }];

export function roomCode(n = 5) {
  const a = new Uint32Array(n);
  crypto.getRandomValues(a);
  return [...a].map((v) => ROOM_CHARS[v % ROOM_CHARS.length]).join('');
}

export const cleanRoom = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

class Link {
  constructor() { this.on = () => {}; this.onclose = () => {}; this.closed = false; }
  _in(ch, msg) { if (!this.closed) this.on(ch, msg); }
  _gone(why) { if (this.closed) return; this.closed = true; this.onclose(why); }
}

/* ── PeerJS ────────────────────────────────────────────────────────────── */

function peerOpts(params) {
  const o = { debug: params.has('netdebug') ? 3 : 0, config: { iceServers: STUN } };
  // tests: a PeerServer on this machine (only localhost is accepted)
  const b = params.get('broker');
  if (b && /^(localhost|127\.0\.0\.1):\d+$/.test(b)) { const [host, port] = b.split(':'); Object.assign(o, { host, port: +port, path: '/', secure: false, key: 'peerjs' }); }
  return o;
}

const kindOf = (err) => {
  const t = err && err.type;
  if (t === 'peer-unavailable') return 'notfound';
  if (t === 'unavailable-id') return 'taken';
  if (t === 'browser-incompatible') return 'browser';
  return 'network';
};

class PeerLink extends Link {
  constructor(peer) { super(); this.peer = peer; this.c = {}; }
  add(conn) {
    this.c[conn.label] = conn;
    conn.on('data', (m) => this._in(conn.label, m));
    conn.on('close', () => this._gone('closed'));
    conn.on('error', () => this._gone('error'));
  }
  get ready() { return this.c.ctl?.open && this.c.in?.open; }
  send(ch, msg) { const c = this.c[ch]; if (c && c.open) { try { c.send(msg); } catch { /* closing */ } } }
  close() {
    this.closed = true;
    for (const c of Object.values(this.c)) { try { c.close(); } catch { /* */ } }
    try { this.peer.destroy(); } catch { /* */ }
  }
}

/* host a room: cb.ready(code) once the broker has us, cb.guest(link) when a
   friend's both channels are open, cb.error(kind) */
export function hostPeer(params, code, cb) {
  const peer = new Peer(PREFIX + code, peerOpts(params));
  let link = null;
  const pend = {};
  peer.on('open', () => cb.ready(code));
  peer.on('error', (err) => { if (!link || !link.ready) cb.error(kindOf(err), err); });
  peer.on('disconnected', () => { /* the broker's gone; an open match carries on peer-to-peer */ });
  peer.on('connection', (conn) => {
    if (link && link.ready) { conn.on('open', () => { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 300); }); return; }
    const p = (pend[conn.peer] = pend[conn.peer] || new PeerLink(peer));
    p.add(conn);
    conn.on('open', () => { if (p.ready && link !== p) { link = p; cb.guest(p); } });
  });
  return { close: () => { try { (link || { close() { peer.destroy(); } }).close(); } catch { /* */ } try { peer.destroy(); } catch { /* */ } } };
}

/* join a room: cb.link(link) when both channels are open, cb.error(kind) */
export function joinPeer(params, code, cb) {
  const peer = new Peer(peerOpts(params));
  const link = new PeerLink(peer);
  let done = false;
  const fail = (kind, err) => { if (done) return; done = true; clearTimeout(timer); cb.error(kind, err); try { peer.destroy(); } catch { /* */ } };
  const timer = setTimeout(() => fail('network'), 20000);
  peer.on('error', (err) => fail(kindOf(err), err));
  peer.on('open', () => {
    for (const [label, reliable] of [['ctl', true], ['in', false]]) {
      const conn = peer.connect(PREFIX + code, { label, reliable, serialization: 'json' });
      link.add(conn);
      conn.on('open', () => { if (link.ready && !done) { done = true; clearTimeout(timer); cb.link(link); } });
    }
  });
  return { close: () => { done = true; clearTimeout(timer); link.close(); } };
}

/* ── local (BroadcastChannel) ─────────────────────────────────────────── */

class LocalLink extends Link {
  constructor(bc, me, lag) { super(); this.bc = bc; this.me = me; this.lag = lag; this.ready = true; }
  send(ch, msg) {
    if (this.closed) return;
    const m = { from: this.me, ch, msg };
    if (this.lag) setTimeout(() => { try { this.bc.postMessage(m); } catch { /* closed */ } }, this.lag);
    else this.bc.postMessage(m);
  }
  close() { if (this.closed) return; try { this.bc.postMessage({ from: this.me, bye: 1 }); } catch { /* */ } this.closed = true; this.bc.close(); }
}

export function hostLocal(params, code, cb) {
  const bc = new BroadcastChannel(PREFIX + code), lag = +params.get('lag') || 0;
  let link = null;
  bc.onmessage = ({ data: d }) => {
    if (d.from === 'host') return;
    if (d.hello && !link) { link = new LocalLink(bc, 'host', lag); bc.postMessage({ from: 'host', welcome: 1 }); cb.guest(link); return; }
    if (link && d.bye) link._gone('closed');
    else if (link && d.ch) link._in(d.ch, d.msg);
  };
  setTimeout(() => cb.ready(code), 50);
  return { close: () => { if (link) link.close(); else bc.close(); } };
}

export function joinLocal(params, code, cb) {
  const bc = new BroadcastChannel(PREFIX + code), lag = +params.get('lag') || 0;
  let link = null;
  const hello = setInterval(() => bc.postMessage({ from: 'guest', hello: 1 }), 300);
  const timer = setTimeout(() => { if (!link) { clearInterval(hello); bc.close(); cb.error('notfound'); } }, 4000);
  bc.onmessage = ({ data: d }) => {
    if (d.from !== 'host') return;
    if (d.welcome && !link) { clearTimeout(timer); clearInterval(hello); link = new LocalLink(bc, 'guest', lag); cb.link(link); return; }
    if (link && d.bye) link._gone('closed');
    else if (link && d.ch) link._in(d.ch, d.msg);
  };
  bc.postMessage({ from: 'guest', hello: 1 });
  return { close: () => { clearTimeout(timer); clearInterval(hello); if (link) link.close(); else bc.close(); } };
}

export const host = (params, code, cb) => (params.get('net') === 'local' ? hostLocal : hostPeer)(params, code, cb);
export const join = (params, code, cb) => (params.get('net') === 'local' ? joinLocal : joinPeer)(params, code, cb);
