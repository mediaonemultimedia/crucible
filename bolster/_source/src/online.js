/* Online play: hosting and joining a room, the shared character select,
   the match start, rematch and leaving, the connection indicator, and what
   happens when the other side goes quiet. The match itself is the rollback
   session in the Fight (src/net/rollback.js); this is everything around it.

   The host is Player 1 (pink), the guest Player 2 (mint). The host picks the
   match seed and sends it with both fighters, so both peers start the sim
   from the same state.                                                    */

import { host, join, roomCode, cleanRoom } from './net/link.js';
import { ROSTER } from './fighters/index.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const now = () => performance.now();
// the quiet-opponent clock runs on the app's own time (frames), so a tab that
// stops drawing — or a slow headless test — isn't 'quiet' by itself

const QUIET = 1500;          // ms without a word: the opponent's gone quiet
const GRACE = 10;            // then this many seconds' wait before giving up

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
    this.on = false;            // linked to a peer
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
    this.clock = 0;              // app time, ms
    this.waiting = false;
    this.desynced = null;
  }

  get remote() { return 1 - this.local; }

  _state(name, msg) {
    const S = $('#online-screen');
    S.dataset.state = name;
    const opts = $$(`#online-screen .ol-${name} .opt`);
    opts.forEach((b, k) => b.classList.toggle('sel', k === 0));
    if (msg && name === 'error') $('#ol-err').textContent = msg;
  }

  /* the lobby's practice: while the host waits for a friend (and while a
     guest connects), this player's fighter (the last one played, or the
     one picked) against a dummy — local only, ended the moment they meet */
  lobbyPractice() {
    const A = this.app;
    const p1 = A.last?.p1 || ROSTER[A.pick[this.local]] || ROSTER[0];
    A.startPractice({ p1, p2: null, lobby: true });
  }

  /* ── lobby ─────────────────────────────────────────────────────────── */
  menu() { this.teardown(); this.app.go('online'); this._state('menu'); }

  act(a) {
    if (a === 'host') this.host();
    if (a === 'back') this.app.go('mode');
    if (a === 'copy') this.copy();
    if (a === 'cancel') { this.teardown(); this._forgetRoom(); this.app.go('mode'); }
    if (a === 'retry') { if (this.role === 'guest') this.joinRoom(this.code); else this.host(); }
    if (a === 'cpu') { this.teardown(); this._forgetRoom(); this.app.go('select'); }
  }

  shareLink(code) {
    let u = `${location.origin}${location.pathname}?room=${code}`;
    // test transports ride along (they never appear in a normal link)
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
    this.lobbyPractice();
    $('#ol-code').textContent = '·····';
    $('#ol-link').value = 'Opening a room…';
    $('#ol-wait').textContent = 'Opening a room…';
    const code = this.code;
    const timer = setTimeout(() => { if (this.code === code && !this.ready) this.fail('network'); }, 15000);
    this.ready = false;
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
        if (kind === 'taken') this.host();     // that code's in use: another
        else this.fail(kind);
      },
    });
  }

  copy() {
    const v = $('#ol-link').value;
    const done = () => { $('#ol-copy').textContent = 'Copied!'; this.app.later(1.6, () => { $('#ol-copy').textContent = 'Copy link'; }); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(v).then(done, () => { this._copyOld(); done(); });
    else { this._copyOld(); done(); }
  }

  _copyOld() { const i = $('#ol-link'); i.select(); try { document.execCommand('copy'); } catch { /* the link's selected; ctrl-c */ } }

  joinRoom(raw) {
    this.teardown();
    this.role = 'guest';
    this.local = 1;
    this.code = cleanRoom(raw);
    this.app.go('online');
    this._state('joining');
    $('#ol-joinmsg').textContent = `Joining match ${this.code}…`;
    if (this.code.length < 4) { this.fail('notfound'); return; }
    this.lobbyPractice();
    const code = this.code;
    this.handle = join(this.params, code, {
      link: (link) => { if (this.code === code) this._linked(link); },
      error: (kind) => { if (this.code === code) this.fail(kind); },
    });
  }

  fail(kind) {
    const msg = MESSAGES[kind] || MESSAGES.network;
    console.info(`online: ${kind}`);
    const role = this.role, code = this.code;
    this.app.endPractice();
    this.teardown();
    this.role = role; this.code = code;
    if (this.app.fight) { this.app.fight.dispose(); this.app.fight = null; }
    $('#banner').textContent = '';
    $('#bubbles').textContent = '';
    this.app.go('online');
    this._state('error', msg);
  }

  _forgetRoom() {
    if (this.params.has('room')) { this.params.delete('room'); history.replaceState(null, '', location.pathname + (this.params.toString() ? `?${this.params}` : '')); }
  }

  teardown() {
    this.app.endPractice?.();
    this.on = false;
    this.waiting = false;
    this.desynced = null;
    document.body.classList.remove('online', 'netwait');
    const l = this.link, h = this.handle;
    this.link = this.handle = null;
    if (l) { try { l.send('ctl', { t: 'bye' }); } catch { /* */ } setTimeout(() => { try { l.close(); } catch { /* */ } try { h?.close(); } catch { /* */ } }, 120); }
    else if (h) { try { h.close(); } catch { /* */ } }
    this.code = '';
    this.role = null;
    const b = $('#win-screen .opt[data-act=select]');
    if (b) b.textContent = 'Character select';
  }

  _linked(link) {
    this.link = link;
    this.on = true;
    this.lastHeard = this.clock;
    document.body.classList.add('online');
    link.on = (ch, m) => this._msg(ch, m);
    link.onclose = () => this._closed();
    link.send('ctl', { t: 'hello', v: 1 });
    this.goSelect();
  }

  _closed() {
    if (!this.on) return;
    // mid-match: the wait (and its countdown) decides; elsewhere it's over
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
    A.go('select');
    A.picking = this.local;
    A.locked = [false, false];
    if (A.pick[0] === A.pick[1] && A.pick[0] === 0) A.pick[1] = 1;
    this.send({ t: 'cur', i: A.pick[this.local] });
    A._paintSelect();
  }

  selectKey(k, { left, right, ok, back }) {
    const A = this.app;
    if (k === 'KeyE') { A.eggKeys = 'e'; return; }
    if (k === 'KeyH' && A.eggKeys === 'e') { A.eggKeys = ''; A._toques(); return; }   // local only
    A.eggKeys = '';
    if (k === 'Escape') { this.leave(); return; }
    if (left || right) { if (!A.locked[this.local]) this.choose((A.pick[this.local] + (left ? -1 : 1) + ROSTER.length) % ROSTER.length, false); return; }
    if (ok) { this.lock(); return; }
    if (back && A.locked[this.local] && !this.starting) { A.locked[this.local] = false; this.send({ t: 'unlock' }); A._paintSelect(); }
  }

  choose(i, lock) {
    const A = this.app;
    if (A.locked[this.local]) return;
    A.pick[this.local] = i;
    this.send({ t: 'cur', i });
    A._paintSelect();
    if (lock) this.lock();
  }

  lock() {
    const A = this.app;
    if (A.locked[this.local]) return;
    A.locked[this.local] = true;
    this.send({ t: 'lock', i: A.pick[this.local] });
    A._paintSelect();
    this._maybeStart();
  }

  _maybeStart() {
    const A = this.app;
    if (this.role !== 'host' || !A.locked[0] || !A.locked[1] || this.starting) return;
    this.starting = true;
    const seed = ((crypto.getRandomValues(new Uint32Array(1))[0] >>> 0) % 0x7fffffff) || 1;
    const m = { t: 'start', p1: ROSTER[A.pick[0]], p2: ROSTER[A.pick[1]], seed, n: this.matchNo + 1 };
    this.send(m);
    // a beat on the locked-in picks, then fight
    A.later(0.6, () => this.start(m));
  }

  paintSelect(ids, mirror, plate) {
    const A = this.app, L = this.local;
    for (const c of $$('.card')) {
      const i = ROSTER.indexOf(c.dataset.id);
      c.classList.toggle('c1', i === A.pick[0]);
      c.classList.toggle('c2', i === A.pick[1]);
      c.querySelectorAll('.tag').forEach((t) => t.remove());
      if (i === A.pick[0]) c.insertAdjacentHTML('beforeend', `<span class="tag t1">${L === 0 ? 'You' : 'P1'}</span>`);
      if (i === A.pick[1]) c.insertAdjacentHTML('beforeend', `<span class="tag t2">${L === 1 ? 'You' : 'P2'}</span>`);
    }
    plate('.plate.p1', ids[0], false, A.locked[0], true);
    plate('.plate.p2', ids[1], mirror, A.locked[1], true);
    $('.plate.p1 .who').textContent = L === 0 ? 'Player 1 · you' : 'Player 1';
    $('.plate.p2 .who').textContent = L === 1 ? 'Player 2 · you' : 'Player 2';
    const R = this.remote;
    $('#select-step').textContent = A.locked[L]
      ? (A.locked[R] ? 'Both locked in — fight!' : `Locked in — waiting for Player ${R + 1}…`)
      : `You’re Player ${L + 1} (${L === 0 ? 'pink' : 'mint'}) — pick your fighter`;
    $('#select-hint').textContent = A.locked[L] ? 'P to change your mind · Esc to leave' : 'A / D to choose · O to lock in · Esc to leave';
    if (A.show) {
      A.show.set(0, ids[0], { toque: A.toques });
      A.show.set(1, ids[1], { evil: mirror, toque: A.toques });
    }
  }

  leave() { this.teardown(); this._forgetRoom(); this.app.go('mode'); }

  /* ── the match ─────────────────────────────────────────────────────── */
  start(m) {
    if (!this.on) return;
    this.starting = false;
    this.matchNo = m.n;
    const A = this.app;
    A.startFight({
      p1: m.p1, p2: m.p2, seed: m.seed,
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
    if (b) b.textContent = 'Leave';
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
      else if (m.n > this.matchNo) { if (this.early.length < 600) this.early.push(m); }
      return;
    }
    switch (m.t) {
      case 'cur': A.pick[this.remote] = m.i; if (A.screen === 'select') A._paintSelect(); break;
      case 'lock': A.pick[this.remote] = m.i; A.locked[this.remote] = true; if (A.screen === 'select') A._paintSelect(); this._maybeStart(); break;
      case 'unlock': A.locked[this.remote] = false; if (A.screen === 'select') A._paintSelect(); break;
      case 'start': if (this.role === 'guest') A.later(0.6, () => this.start(m)); break;   // the same beat as the host
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
    } else if (!inMatch && quiet > (QUIET + GRACE * 1000)) { this.fail('lost'); return; }
    this._indicator();
  }

  _indicator() {
    const N = $('#net'), r = Math.round(this.rtt);
    const S = this.app.fight?.session;
    const q = !r ? '' : r < 90 ? '' : r < 180 ? 'mid' : 'bad';
    const key = `${r}|${q}|${!!this.desynced}|${S ? S.stats.stalls > 0 : 0}`;
    if (this._ik === key) return;
    this._ik = key;
    N.className = q;
    N.innerHTML = `<i></i>${r ? `${r} ms` : '…'} · P${this.local + 1}${this.desynced ? '<span class="desync">desync</span>' : ''}`;
  }
}
