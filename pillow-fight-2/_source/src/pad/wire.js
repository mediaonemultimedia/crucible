/* The phone pad's wire format: a few bytes, binary, on an unreliable,
   unordered data channel ('pi'). The phone sends its whole state on every
   change and as a 60 Hz heartbeat, so a lost packet is replaced 16 ms
   later; a stale one (older seq) is dropped.

   input  [1, seq, mask lo, mask hi, c0|c1, c2|c3, c4|c5, c6|c7, c8|c9]  9 bytes
          mask: the sim's input bits (sim/input.js) + START, TAUNT;
          c: a 4-bit press counter per tap-able bit, so a tap shorter than
          a packet gap (or one whose packets were all lost) still lands.
   ping   [2, id, rtt/2 ms]     game → phone (the last round trip, for its LED)
   pong   [3, id]               phone → game

   Everything else (seat, screen, skin, buzz, ink, the KO line, the cheat
   sheet's open/closed) is JSON on the reliable 'pc' channel.             */

import { LEFT, RIGHT, UP, DOWN, LIGHT, HEAVY, SPECIAL, BLOCK, JUMP, CROUCH } from '../sim/input.js';

export const START = 1024, TAUNT = 2048;
export const GAME_BITS = 1023;
export const TAPS = [LIGHT, HEAVY, SPECIAL, BLOCK, JUMP, UP, DOWN, CROUCH, START, TAUNT];
export const T_INPUT = 1, T_PING = 2, T_PONG = 3;
export const HEARTBEAT_MS = 16;
export const STALE_MS = 400;          // nothing heard this long: the pad's held bits drop to 0

export function encodeInput(seq, mask, counts) {
  const b = new Uint8Array(9);
  b[0] = T_INPUT; b[1] = seq & 255; b[2] = mask & 255; b[3] = (mask >> 8) & 255;
  for (let i = 0; i < 5; i++) b[4 + i] = ((counts[i * 2] & 15) << 4) | (counts[i * 2 + 1] & 15);
  return b;
}

export function decode(data) {
  const b = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (!b.length) return null;
  if (b[0] === T_INPUT && b.length >= 9) {
    const counts = [];
    for (let i = 0; i < 5; i++) counts.push(b[4 + i] >> 4, b[4 + i] & 15);
    return { t: T_INPUT, seq: b[1], mask: b[2] | (b[3] << 8), counts };
  }
  if (b[0] === T_PING && b.length >= 3) return { t: T_PING, id: b[1], rtt: b[2] * 2 };
  if (b[0] === T_PONG && b.length >= 2) return { t: T_PONG, id: b[1] };
  return null;
}

export const ping = (id, rtt) => Uint8Array.of(T_PING, id & 255, Math.min(255, Math.round(rtt / 2)));
export const pong = (id) => Uint8Array.of(T_PONG, id & 255);

/* seq a is newer than b (mod 256) */
export const newer = (a, b) => ((a - b) & 255) > 0 && ((a - b) & 255) < 128;

/* one seat's state on the game side: packets in, a Keyboard-like sample() out */
export class PadState {
  constructor() { this.held = 0; this.tapped = 0; this.seq = -1; this.counts = null; this.heard = 0; this.edges = 0; }
  /* returns the bits newly pressed by this packet (held edges + counter taps) */
  take(p, now) {
    if (this.seq >= 0 && !newer(p.seq, this.seq)) return 0;
    this.seq = p.seq;
    this.heard = now;
    let pressed = p.mask & ~this.held;
    if (this.counts) TAPS.forEach((bit, i) => { if (((p.counts[i] - this.counts[i]) & 15) !== 0) pressed |= bit; });
    this.counts = p.counts;
    this.held = p.mask;
    this.tapped |= pressed;
    return pressed;
  }
  stale(now) { if (this.held && now - this.heard > STALE_MS) this.held = 0; }
  sample() { const m = (this.held | this.tapped) & GAME_BITS; this.tapped = 0; return m; }
  clear() { this.tapped = 0; }
  reset() { this.held = 0; this.tapped = 0; this.seq = -1; this.counts = null; }
}

export { LEFT, RIGHT, UP, DOWN, LIGHT, HEAVY, SPECIAL, BLOCK, JUMP, CROUCH };
