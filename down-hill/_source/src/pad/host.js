/* The game's side of the phone pads (Pillow Fight 2's host, for four):
   one pad room per page (a 4-character code, kept for the session so a
   reload keeps the phones' link), up to four phones, each on a seat of its
   own; a phone that drops and comes back (same device id) gets its seat
   back. Which racer a seat drives is the app's business (main.js: the
   first phone shares Player 1 with the keyboard, the next ones join).

   Each seat is a PadState (wire.js): the phone's raw button bits and its
   steering byte, sampled once per sim tick into the race's input. The
   game is the only sim; the phone never simulates anything.

   The pairing card (title + select screens): the QR, the code, a ping LED
   per seat (green / amber / red).                                        */

import { hostPads, padCode, PAD_CHARS } from './padlink.js';
import { PadState, decode, ping, T_INPUT, T_PONG } from './wire.js';
import { qrSVG } from './qr.js';

const now = () => performance.now();
const SS = (() => { try { const s = window.sessionStorage; s.getItem('x'); return s; } catch { return null; } })();
const CODE_KEY = 'downhill.padRoom';
export const SEATS = 4;
const ALL = [0, 1, 2, 3];

export const ledOf = (rtt, alive) => (!alive ? 'off' : rtt < 60 ? 'green' : rtt < 150 ? 'amber' : 'red');

export class PadHost {
  constructor(app, params) {
    this.app = app;
    this.params = params;
    this.state = ALL.map(() => new PadState());
    this.seats = ALL.map(() => null);          // { c, uid, rtt, pid, pingAt, pongAt, sheet, sent }
    this.uids = ALL.map(() => null);
    let code = '';
    try { code = SS?.getItem(CODE_KEY) || ''; } catch { /* */ }
    this.code = /^[A-Z2-9]{4}$/.test(code) && [...code].every((ch) => PAD_CHARS.includes(ch)) ? code : padCode();
    this.status = 'off';
    this.handle = null;
    this.t = 0;
    this._paintKey = '';
    this.onSeat = () => {};
  }

  get on() { return this.status !== 'off'; }

  url() {
    const base = location.origin === 'null' || location.protocol === 'file:' ? `file://${location.pathname}` : `${location.origin}${location.pathname}`;
    let u = `${base}?pad=${this.code}`;
    for (const k of ['net', 'broker', 'art']) if (this.params.get(k)) u += `&${k}=${encodeURIComponent(this.params.get(k))}`;
    return u;
  }

  start() {
    if (this.handle) return;
    this.status = 'opening';
    const code = this.code;
    this.handle = hostPads(this.params, code, {
      ready: () => { if (code !== this.code) return; this.status = 'ready'; try { SS?.setItem(CODE_KEY, code); } catch { /* */ } this.paint(true); },
      join: (c) => this._join(c),
      error: (kind) => {
        if (code !== this.code) return;
        this.handle?.close(); this.handle = null;
        if (kind === 'taken') { this.code = padCode(); this.start(); return; }
        this.status = 'retry';
        this.paint(true);
        setTimeout(() => { if (!this.handle) this.start(); }, 4000);
      },
    });
    this.paint(true);
  }

  stop() { this.handle?.close(); this.handle = null; this.status = 'off'; }

  _join(c) {
    let seat = -1;
    c.on = (ch, msg) => {
      if (ch === 'pc') {
        if (msg?.t === 'hi') {
          // a phone saying hello again on a link we still hold (it reloaded, or woke up): its seat again
          if (seat >= 0 && this.seats[seat]?.c === c) { this.state[seat].reset(); this.seats[seat].sent = ''; c.send('pc', { t: 'seat', k: seat }); return; }
          seat = this._seat(c, String(msg.uid || c.id));
          return;
        }
        if (seat >= 0 && this.seats[seat]?.c === c) this._ctl(seat, msg);
        return;
      }
      if (seat >= 0 && this.seats[seat]?.c === c) this._pi(seat, msg);
    };
    c.onclose = () => {
      if (seat >= 0 && this.seats[seat]?.c === c) { this.seats[seat] = null; this.state[seat].reset(); this.paint(true); this.onSeat(seat, false); }
    };
  }

  _seat(c, uid) {
    let k = this.uids.indexOf(uid);
    if (k < 0) k = ALL.find((i) => !this.seats[i] && !this.uids[i]) ?? -1;
    if (k < 0) k = ALL.find((i) => !this.seats[i]) ?? -1;
    if (k < 0) { c.send('pc', { t: 'full' }); setTimeout(() => c.close(), 300); return -1; }
    const old = this.seats[k];
    if (old && old.c !== c) { try { old.c.close(); } catch { /* */ } }
    this.uids[k] = uid;
    this.seats[k] = { c, uid, rtt: 0, pid: 0, pingAt: 0, pongAt: now(), sheet: false, sent: '' };
    this.state[k].reset();
    c.send('pc', { t: 'seat', k });
    this.paint(true);
    this.onSeat(k, true);
    return k;
  }

  _ctl(k, m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'sheet') { this.seats[k].sheet = !!m.open; this.app.padSheet?.(k); }
    else if (m.t === 'sel') this.app.padSelect?.(k, m);
    else if (m.t === 'mode') { this.seats[k].mode = m.mode; this.app.padMode?.(k, m.mode); }
  }

  _pi(k, data) {
    const p = decode(data);
    if (!p) return;
    const t = now(), S = this.seats[k];
    if (p.t === T_INPUT) {
      const pressed = this.state[k].take(p, t);
      if (pressed) this.app.padPress?.(k, pressed, this.state[k].held);
    } else if (p.t === T_PONG && p.id === S.pid && S.pingAt) {
      const r = t - S.pingAt;
      S.rtt = S.rtt ? S.rtt * 0.7 + r * 0.3 : r;
      S.pongAt = t; S.pingAt = 0;
    }
  }

  connected(k) { return !!this.seats[k]; }
  sheetOpen(k) { return !!this.seats[k]?.sheet; }
  rtt(k) { return this.seats[k]?.rtt || 0; }
  led(k) { const S = this.seats[k]; if (!S) return 'off'; return now() - S.pongAt > 1500 ? 'red' : ledOf(S.rtt, true); }

  send(k, msg) { this.seats[k]?.c.send('pc', msg); }


  frame(dt) {
    if (!this.handle) return;
    const t = now();
    this.t += dt;
    // the page itself stalled (a long frame): the phones' packets are still queued, so
    // nothing has gone quiet — don't drop held bits for a gap that was ours
    const stalled = this._ft && t - this._ft > 120;
    this._ft = t;
    for (let k = 0; k < SEATS; k++) {
      const S = this.seats[k];
      if (stalled) this.state[k].heard = Math.max(this.state[k].heard, t);
      else this.state[k].stale(t);
      if (!S) continue;
      // a ping every half second (on the input channel: it measures the input path)
      if (t >= (S.next || 0)) {
        if (S.pingAt) S.rtt = Math.max(S.rtt, t - S.pingAt);      // lost: the LED goes amber / red
        S.pid = (S.pid + 1) & 255; S.pingAt = t; S.next = t + 500;
        S.c.send('pi', ping(S.pid, S.rtt));
      }
      // the screen the phone should show (sent when it changes)
      const v = this.app.padView?.(k);
      if (v) { const s = JSON.stringify(v); if (s !== S.sent) { S.sent = s; S.c.send('pc', { t: 'st', ...v }); } }
    }
    if (Math.floor(this.t * 4) !== this._pt) { this._pt = Math.floor(this.t * 4); this.paint(); }
  }

  /* the pairing card: #pads on the title and the select screens */
  paint(force = false) {
    const el = document.querySelector('#pads');
    if (!el) return;
    const leds = ALL.map((k) => this.led(k));
    const key = `${this.status}|${this.code}|${leds.join()}|${ALL.map((k) => Math.round(this.rtt(k) / 5)).join()}|${ALL.map((k) => this.app.padSeatName?.(k) || '').join()}`;
    if (!force && key === this._paintKey) return;
    const fresh = this._qrFor !== this.code || !el.querySelector('.qr');
    this._paintKey = key;
    el.dataset.status = this.status;
    if (fresh) {
      this._qrFor = this.code;
      el.innerHTML = `<div class="qr">${qrSVG(this.url())}</div><div class="pi"><b class="h">Phone pad</b><span class="code">${this.code}</span><span class="how">Scan to play on your phone</span><div class="seats"></div></div>`;
    }
    el.querySelector('.code').textContent = this.code;
    el.querySelector('.how').textContent = this.status === 'ready' ? 'Scan with your phone camera' : this.status === 'retry' ? 'Pad room offline, retrying…' : 'Opening the pad room…';
    const shown = ALL.filter((k, j) => this.connected(k) || j === ALL.findIndex((q) => !this.connected(q)));
    el.querySelector('.seats').innerHTML = shown.map((k) => {
      const on = this.connected(k), who = this.app.padSeatName?.(k) || `Phone ${k + 1}`;
      return `<span class="seat s${k + 1} ${leds[k]}"><i></i>${on ? `${who} · ${Math.round(this.rtt(k))} ms` : 'scan to join (up to 4)'}</span>`;
    }).join('');
  }
}
