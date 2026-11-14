/* Pillow Fight 2 online: hosting and joining a room by share link, the
   shared character select, the match start, rematch and leaving, the
   connection indicator, and the wait when the other side goes quiet.
   PF1's online.js (bolster-source) cut down to PF2's app: no names or
   lobby practice. The match itself is a rollback session inside the Fight
   (src/net/rollback.js) over the 3D sim.

   The host is Player 1 (pink), the guest Player 2 (mint). The host picks the
   seed and sends it with both fighters, so both peers start the sim from the
   same state. Nothing here touches the network until the player picks
   Online or opens a ?room= link.                                          */

import { host, join, roomCode, cleanRoom } from './net/link.js';
import { ROSTER } from './fighters/index.js';
import { selectMsg, readSelect, startMsg, readStart, resolveVariants } from './ui/variant.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const now = () => performance.now();

const QUIET = 1500;          // ms (app time) without a word: the opponent's gone quiet
const GRACE = 10;            // then this many seconds before giving up

const MESSAGES = {
  notfound: 'Room not found — the host may have left, or the link is mistyped.',
  hostleft: 'The host left the match.',
  left: 'Your opponent left the match.',
  lost: 'Your opponent disconnected.',
  network: 'Connection failed — some office or school networks block this. Try again, or try another network (a phone hotspot often works).',
  browser: 'This browser can’t play online (no WebRTC). Try a current Chrome, Edge, Firefox or Safari.',
  full: 'That match already has two players.',
};

export class Online {
  constructor(app) {
    this.app = app;
    this.params = new URLSearchParams(location.search);
    this.on = false;
    this.role = null;
    this.local = 0;
    this.link = null;
    this.handle = null;
    this.code = '';
    this.matchNo = 0;
    this.early = [];
    this.rtt = 0;
    this.pingT = 0;
    this.lastHeard = 0;
    this.clock = 0;
    this.waiting = false;
    this.desynced = null;
    this.starting = false;
  }

  get remote() { return 1 - this.local; }

  _state(name, msg) {
    const S = $('#online-screen');
    S.dataset.state = name;
    $$(`#online-screen .ol-${name} .opt`).forEach((b, k) => b.classList.toggle('sel', k === 0));
    if (msg && name === 'error') $('#ol-err').textContent = msg;
  }

  menu() { this.teardown(); this.app.go('online'); this._state('menu'); }

  act(a) {
    if (a === 'host') this.host();
    if (a === 'back') this.app.go('mode');
    if (a === 'copy') this.copy();
    if (a === 'cancel') { this.teardown(); this._forgetRoom(); this.app.go('mode'); }
    if (a === 'retry') { if (this.role === 'guest') this.joinRoom(this.code); else this.host(); }
    if (a === 'cpu') { this.teardown(); this._forgetRoom(); this.app.mode = 'cpu'; this.app.go('select'); }
  }

  shareLink(code) {
    let u = `${location.origin === 'null' ? 'file://' : location.origin}${location.pathname}?room=${code}`;
    for (const k of ['net', 'broker', 'lag']) if (this.params.get(k)) u += `&${k}=${encodeURIComponent(this.params.get(k))}`;
    return u;
  }

  host() {
    this.teardown();
    this.role = 'host';
    this.local = 0;
    this.code = roomCode();
    this.app.go('online');
    this._state('hosting');
    $('#ol-code').textContent = '·····';
    $('#ol-link').value = 'Opening a room…';
    $('#ol-wait').textContent = 'Opening a room…';
    const code = this.code;
    this.ready = false;
    const timer = setTimeout(() => { if (this.code === code && !this.ready) this.fail('network'); }, 15000);
    this.handle = host(this.params, code, {
      ready: () => {
        if (this.code !== code) return;
        clearTimeout(timer);
        this.ready = true;
        $('#ol-code').textContent = code;
        $('#ol-link').value = this.shareLink(code);
        $('#ol-wait').textContent = 'Waiting for your friend to open it…';
      },
      guest: (link) => { if (this.code === code) this._linked(link); },
      error: (kind) => {
        if (this.code !== code) return;
        clearTimeout(timer);
        if (kind === 'taken') this.host();
        else this.fail(kind);
      },
    });
  }

  copy() {
    const v = $('#ol-link').value;
    const done = () => { $('#ol-copy').textContent = 'Copied!'; this.app.later(1.6, () => { $('#ol-copy').textContent = 'Copy link'; }); };
    const old = () => { const i = $('#ol-link'); i.select(); try { document.execCommand('copy'); } catch { /* selected: ctrl-c */ } };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(v).then(done, () => { old(); done(); });
    else { old(); done(); }
  }

  joinRoom(raw) {
    this.teardown();
    this.role = 'guest';
    this.local = 1;
    this.code = cleanRoom(raw);
    this.app.go('online');
    this._state('joining');
    $('#ol-joinmsg').textContent = `Joining match ${this.code}…`;
    if (this.code.length < 4) { this.fail('notfound'); return; }
    const code = this.code;
    this.handle = join(this.params, code, {
      link: (link) => { if (this.code === code) this._linked(link); },
      error: (kind) => { if (this.code === code) this.fail(kind); },
    });
  }

  fail(kind) {
    console.info(`online: ${kind}`);
    const role = this.role, code = this.code;
    this.teardown();
    this.role = role; this.code = code;
    const A = this.app;
    if (A.fight) { A.fight.dispose(); A.fight = null; }
    $('#banner').textContent = '';
    $('#bubbles').textContent = '';
    A.go('online');
    this._state('error', MESSAGES[kind] || MESSAGES.network);
  }

  _forgetRoom() {
    if (this.params.has('room')) { this.params.delete('room'); try { history.replaceState(null, '', location.pathname + (this.params.toString() ? `?${this.params}` : '')); } catch { /* file: */ } }
  }

  teardown() {
    this.on = false;
    this.waiting = false;
    this.desynced = null;
    this.starting = false;
    document.body.classList.remove('online', 'netwait');
    const l = this.link, h = this.handle;
    this.link = this.handle = null;
    if (l) { try { l.send('ctl', { t: 'bye' }); } catch { /* */ } setTimeout(() => { try { l.close(); } catch { /* */ } try { h?.close(); } catch { /* */ } }, 120); }
    else if (h) { try { h.close(); } catch { /* */ } }
    this.code = '';
    this.role = null;
    const b = $('#win-screen .opt[data-act=select]');
    if (b) b.innerHTML = 'No <small>new fighters</small>';
  }

  _linked(link) {
    this.link = link;
    this.on = true;
    this.lastHeard = this.clock;
    document.body.classList.add('online');
    link.on = (ch, m) => this._msg(ch, m);
    link.onclose = () => this._closed();
    link.send('ctl', { t: 'hello', v: 2 });
    this.goSelect();
  }

  _closed() {
    if (!this.on) return;
    if (this.app.screen === 'fight' || this.app.screen === 'win') { this.lastHeard = Math.min(this.lastHeard, this.clock - QUIET); return; }
    this.fail(this.role === 'guest' ? 'hostleft' : 'left');
  }

  send(m) { this.link?.send('ctl', m); }

  /* ── the shared character select ──────────────────────────────────── */
  goSelect() {
    const A = this.app;
    if (A.fight) { A.fight.dispose(); A.fight = null; }
    $('#banner').textContent = '';
    $('#bubbles').textContent = '';
    document.body.classList.remove('netwait');
    this.waiting = false;
    this.starting = false;
    A.mode = 'online';
    A.go('select');
    A.picking = this.local;
    A.locked = [false, false];
    if (A.pick[0] === A.pick[1]) A.pick[1] = (A.pick[0] + 1) % ROSTER.length;
    this.cursor();
    A._paintSelect();
  }

  cursor() { const A = this.app; this.send(selectMsg('cur', A.pick[this.local], A.alt[this.local])); }

  selectKey(e, { left, right, up, down, ok, back }) {
    const A = this.app, L = this.local;
    if (e.code === 'Escape') { this.leave(); return; }
    if (A.locked[L]) {
      if (back && !this.starting) { A.locked[L] = false; this.send({ t: 'unlock' }); A._paintSelect(); }
      return;
    }
    if (left || right) { this.choose((A.pick[L] + (left ? -1 : 1) + ROSTER.length) % ROSTER.length, false); A.audio.ui('tick'); return; }
    if (up || down) { A.alt[L] = !A.alt[L]; this.cursor(); A._paintSelect(); A.audio.ui('tick'); return; }
    if (ok && !e.repeat) this.lock();
  }

  choose(i, lock) {
    const A = this.app;
    if (A.locked[this.local]) return;
    A.pick[this.local] = i;
    this.cursor();
    A._paintSelect();
    if (lock) this.lock();
  }

  lock() {
    const A = this.app;
    if (A.locked[this.local]) return;
    A.audio.ui('confirm');
    A.locked[this.local] = true;
    this.send(selectMsg('lock', A.pick[this.local], A.alt[this.local]));
    A._paintSelect();
    this._maybeStart();
  }

  _maybeStart() {
    const A = this.app;
    if (this.role !== 'host' || !A.locked[0] || !A.locked[1] || this.starting) return;
    this.starting = true;
    const seed = ((crypto.getRandomValues(new Uint32Array(1))[0] >>> 0) % 0x7fffffff) || 1;
    const ids = [ROSTER[A.pick[0]], ROSTER[A.pick[1]]];
    const m = startMsg({ p1: ids[0], p2: ids[1], seed, n: this.matchNo + 1, alt: resolveVariants(ids, A.alt) });
    this.send(m);
    A.later(0.6, () => this.start(m));
  }

  /* the select screen as one of the two players sees it */
  label(k) { return k === this.local ? `Player ${k + 1} · you` : `Player ${k + 1}`; }
  paintSelect() {
    const A = this.app, L = this.local, R = this.remote;
    for (const c of $$('.card')) {
      c.querySelectorAll('.tag').forEach((t) => t.remove());
      const i = ROSTER.indexOf(c.dataset.id);
      if (i === A.pick[0]) c.insertAdjacentHTML('beforeend', `<span class="tag t1">${L === 0 ? 'YOU' : 'P1'}</span>`);
      if (i === A.pick[1]) c.insertAdjacentHTML('beforeend', `<span class="tag t2">${L === 1 ? 'YOU' : 'P2'}</span>`);
    }
    $('.plate.p1 .who').textContent = this.label(0);
    $('.plate.p2 .who').textContent = this.label(1);
    $('#select-step').textContent = A.locked[L]
      ? (A.locked[R] ? 'Both locked in — fight!' : `Locked in — waiting for Player ${R + 1}…`)
      : `Online · you’re Player ${L + 1} (${L === 0 ? 'pink' : 'mint'}) — pick your fighter`;
    $('#select-hint').textContent = A.locked[L] ? 'P to change your mind · Esc to leave' : 'A / D to choose · W / S for OG or ALT · O to lock in · Esc to leave';
  }

  leave() { this.teardown(); this._forgetRoom(); this.app.mode = 'cpu'; this.app.go('mode'); }

  /* ── the match ─────────────────────────────────────────────────────── */
  start(m) {
    if (!this.on) return;
    this.starting = false;
    this.matchNo = m.n;
    const A = this.app, S0 = readStart(m);
    A.alt = S0.alt.slice();
    A.startFight({
      p1: S0.p1, p2: S0.p2, seed: S0.seed, vs: true,
      net: { local: this.local, send: (p) => this.link?.send('in', { ...p, n: m.n }), onDesync: (d, st) => this.desync(d, st) },
    });
    const S = A.fight.session;
    for (const p of this.early.filter((p) => p.n === m.n)) S.receive(p);
    this.early = [];
    this.lastHeard = this.clock;
  }

  desync(d, st) {
    console.warn(`online: desync at tick ${d.tick} (ours ${d.ours.toString(16)}, theirs ${d.theirs.toString(16)})`);
    this.desynced = d;
    if (this.params.has('netdebug')) { console.log('desync state (ours)', JSON.stringify(st)); this.send({ t: 'dump', tick: d.tick, st }); }
  }

  winScreen() {
    if (!this.on) return;
    const b = $('#win-screen .opt[data-act=select]');
    if (b) b.innerHTML = 'No <small>leave</small>';
  }

  winAct(a) {
    if (a === 'rematch') { this.send({ t: 'rematch' }); this.goSelect(); }
    else this.leave();
  }

  _msg(ch, m) {
    this.lastHeard = this.clock;
    const A = this.app;
    if (ch === 'in') {
      const S = A.fight?.session;
      if (S && m.n === this.matchNo) S.receive(m);
      else if (m.n > this.matchNo && this.early.length < 600) this.early.push(m);
      return;
    }
    switch (m.t) {
      case 'cur': { const r = readSelect(m); A.pick[this.remote] = r.i; A.alt[this.remote] = r.alt; if (A.screen === 'select') A._paintSelect(); break; }
      case 'lock': { const r = readSelect(m); A.pick[this.remote] = r.i; A.alt[this.remote] = r.alt; A.locked[this.remote] = true; if (A.screen === 'select') A._paintSelect(); this._maybeStart(); break; }
      case 'unlock': A.locked[this.remote] = false; if (A.screen === 'select') A._paintSelect(); break;
      case 'start': if (this.role === 'guest') A.later(0.6, () => this.start(m)); break;
      case 'ping': this.send({ t: 'pong', ts: m.ts }); break;
      case 'pong': { const r = now() - m.ts; this.rtt = this.rtt ? this.rtt * 0.7 + r * 0.3 : r; break; }
      case 'rematch': if (A.screen === 'win' || A.screen === 'fight') this.goSelect(); break;
      case 'bye': this.fail(this.role === 'guest' ? 'hostleft' : 'left'); break;
      case 'full': this.fail('full'); break;
      case 'dump': console.log(`desync state (theirs) at ${m.tick}`, JSON.stringify(m.st)); break;
      default: break;
    }
  }

  /* every frame: pings, the indicator, the quiet-opponent wait */
  frame(dt) {
    if (!this.on) return;
    this.clock += dt * 1000;
    const t = now(), A = this.app;
    if (t - this.pingT > 500) { this.pingT = t; this.send({ t: 'ping', ts: t }); }
    const quiet = this.clock - this.lastHeard;
    const inMatch = A.screen === 'fight' || A.screen === 'win';
    if (inMatch && quiet > QUIET) {
      const left = Math.ceil(GRACE - (quiet - QUIET) / 1000);
      if (left <= 0) { this.fail('lost'); return; }
      if (!this.waiting) { this.waiting = true; document.body.classList.add('netwait'); }
      $('#netwait-msg').textContent = `Waiting for opponent (${left}s)`;
      if (A.fight) { A.fight.paused = true; A.fight.session?.idle(); }
    } else if (this.waiting) {
      this.waiting = false;
      document.body.classList.remove('netwait');
      if (A.fight) A.fight.paused = false;
    } else if (!inMatch && quiet > QUIET + GRACE * 1000) { this.fail('lost'); return; }
    this._indicator();
  }

  _indicator() {
    const N = $('#net'), r = Math.round(this.rtt);
    const q = !r ? '' : r < 90 ? '' : r < 180 ? 'mid' : 'bad';
    const key = `${r}|${q}|${!!this.desynced}`;
    if (this._ik === key) return;
    this._ik = key;
    N.className = q;
    N.innerHTML = `<i></i>${r ? `${r} ms` : '…'} · P${this.local + 1}${this.desynced ? '<span class="desync">desync</span>' : ''}`;
  }
}
