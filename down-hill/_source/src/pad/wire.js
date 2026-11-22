/* The phone pad's wire format (Pillow Fight 2's, with the kart's buttons
   and one more byte): binary, on an unreliable, unordered data channel
   ('pi'). The phone sends its whole state on every change and as a 60 Hz
   heartbeat, so a lost packet is replaced 16 ms later; a stale one (older
   seq) is dropped.

   input  [1, seq, mask lo, mask hi, c0|c1, c2|c3, c4|c5, c6|c7, c8|c9, stickX]  10 bytes
          mask: the stick's 4 directions (menus) + the kart's buttons;
          c: a 4-bit press counter per tap-able bit, so a tap shorter than
          a packet gap (or one whose packets were all lost) still lands;
          stickX: the steering, a signed byte (−127 … 127) — from the stick
          or, in TILT mode, from the gyro. The game reads only this byte for
          steering, so STICK and TILT look the same to it.
   ping   [2, id, rtt/2 ms]     game → phone (the last round trip, for its LED)
   pong   [3, id]               phone → game

   Everything else (seat, screen, skin, buzz, the results roast, the race
   sheet's open/closed) is JSON on the reliable 'pc' channel.            */

export const LEFT = 1, RIGHT = 2, UP = 4, DOWN = 8;
export const GAS = 16, DRIFT = 32, ITEM = 64, BRAKE = 128, BACK = 256, TAUNT = 512, START = 1024, SUPER = 2048;
export const TAPS = [ITEM, TAUNT, START, SUPER, LEFT, RIGHT, UP, DOWN, DRIFT, BRAKE];
export const T_INPUT = 1, T_PING = 2, T_PONG = 3;
export const HEARTBEAT_MS = 16;
export const STALE_MS = 400;          // nothing heard this long: the pad's held bits (and steering) drop to 0

const s8 = (v) => Math.max(-127, Math.min(127, Math.round(v * 127)));

export function encodeInput(seq, mask, counts, steer = 0) {
  const b = new Uint8Array(10);
  b[0] = T_INPUT; b[1] = seq & 255; b[2] = mask & 255; b[3] = (mask >> 8) & 255;
  for (let i = 0; i < 5; i++) b[4 + i] = ((counts[i * 2] & 15) << 4) | (counts[i * 2 + 1] & 15);
  b[9] = s8(steer) & 255;
  return b;
}

export function decode(data) {
  const b = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (!b.length) return null;
  if (b[0] === T_INPUT && b.length >= 9) {
    const counts = [];
    for (let i = 0; i < 5; i++) counts.push(b[4 + i] >> 4, b[4 + i] & 15);
    const sx = b.length >= 10 ? (b[9] > 127 ? b[9] - 256 : b[9]) / 127 : 0;
    return { t: T_INPUT, seq: b[1], mask: b[2] | (b[3] << 8), counts, steer: sx };
  }
  if (b[0] === T_PING && b.length >= 3) return { t: T_PING, id: b[1], rtt: b[2] * 2 };
  if (b[0] === T_PONG && b.length >= 2) return { t: T_PONG, id: b[1] };
  return null;
}

export const ping = (id, rtt) => Uint8Array.of(T_PING, id & 255, Math.min(255, Math.round(rtt / 2)));
export const pong = (id) => Uint8Array.of(T_PONG, id & 255);

/* seq a is newer than b (mod 256) */
export const newer = (a, b) => ((a - b) & 255) > 0 && ((a - b) & 255) < 128;

/* one seat's state on the game side: packets in, the race's input out */
export class PadState {
  constructor() { this.reset(); this.heard = 0; }
  /* returns the bits newly pressed by this packet (held edges + counter taps) */
  take(p, now) {
    if (this.seq >= 0 && !newer(p.seq, this.seq)) return 0;
    this.seq = p.seq;
    this.heard = now;
    let pressed = p.mask & ~this.held;
    if (this.counts) TAPS.forEach((bit, i) => { if (((p.counts[i] - this.counts[i]) & 15) !== 0) pressed |= bit; });
    this.counts = p.counts;
    this.held = p.mask;
    this.steer = p.steer || 0;
    this.tapped |= pressed;
    return pressed;
  }
  stale(now) { if ((this.held || this.steer) && now - this.heard > STALE_MS) { this.held = 0; this.steer = 0; } }
  /* the kart's input this tick (a tap shorter than a tick still counts once) */
  sample() {
    const m = this.held | this.tapped;
    this.tapped = 0;
    return {
      steer: this.steer, gas: !!(m & GAS), brake: !!(m & BRAKE), drift: !!(m & DRIFT),
      item: !!(m & (ITEM | SUPER)), taunt: !!(m & TAUNT), back: !!(m & BACK),
    };
  }
  clear() { this.tapped = 0; }
  reset() { this.held = 0; this.tapped = 0; this.seq = -1; this.counts = null; this.steer = 0; }
}
