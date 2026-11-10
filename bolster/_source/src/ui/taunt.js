/* Taunting captions: the arena roasts a player who mashes, spams one move,
   turtles behind a block or whiffs a special — a small cardboard bubble,
   rare (one per player every ~10 s, and never two on screen at once).

   Cosmetic only. The Taunter READS the sim's state after each tick and
   never writes to it (test/taunt.test.mjs checks the state hash is the same
   with and without it). Online it is fed only confirmed ticks (both
   players' inputs known, so the state is final and identical on both
   peers), and the line is picked from that state — tick, seat, kind and the
   sim's PRNG word, read and never advanced — so both screens roast the same
   player with the same line at the same moment.                         */

export const TAUNTS = {
  mash: ['Please calm down.', 'Gentle. It’s a pillow.', 'Mashing is not a plan.', 'Easy there, button masher.', 'Your keyboard has feelings.'],
  spam: ['We get it, you found one button.', 'That move again? Bold.', 'New move, who dis?', 'One trick. Many ponies.', 'Groundhog Day called.'],
  turtle: ['Is this a fight or a nap?', 'Nice pillow fort. Come out.', 'Fluff up and fight!', 'Blocking isn’t a hobby.', 'Hiding under the duvet?'],
  whiff: ['Swing and a miss!', 'All fluff, no stuff.', 'Hit the air. The air won.', 'Very special. Hit nothing.', 'Bold. Wrong, but bold.'],
};

export const COOLDOWN = 600;       // ticks between two taunts at one player (10 s)
export const GAP = 420;            // ticks between any two taunts (7 s)
const MASH_PRESSES = 3;            // light presses inside one lock-out (the one that locked it counts)
const SPAM_RUN = 4;                // the same non-light move this many times in a row…
const SPAM_WINDOW = 360;           // …inside 6 s
const TURTLE = 270;                // ticks of solid guard (4.5 s)
const WHIFF_WAIT = 100;            // a special that touched nothing this long after it began

/* a small integer hash (FNV-1a over a few words) */
function mix(...w) {
  let h = 0x811c9dc5;
  for (const x of w) for (let i = 0; i < 4; i++) { h ^= (x >>> (i * 8)) & 255; h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

const KINDS = Object.keys(TAUNTS);

export class Taunter {
  constructor() {
    this.p = [0, 1].map(() => ({ lockPress: 0, lk: 0, began: 0, last: '', run: 0, runAt: 0, guard: 0, special: -1, touched: 0, next: 0 }));
    this.next = 0;                 // no taunt before this tick (any player)
    this.used = new Set();         // lines already said this match
  }

  /* one tick's state (after the tick: st.ev are its events). Returns a
     taunt {p, kind, text} or null. Never writes to st. */
  observe(st) {
    const t = st.tick;
    const live = st.phase === 'fight';
    for (const e of st.ev) {
      if ((e.k === 'hit' || e.k === 'block' || e.k === 'grab') && e.p !== undefined) this.p[e.p].touched = 1;
      if (e.k === 'special') { const P = this.p[e.p]; P.special = t; P.touched = 0; }
      if (e.k === 'round' || e.k === 'ko' || e.k === 'time') for (const P of this.p) { P.special = -1; P.guard = 0; P.run = 0; P.lockPress = 0; }
    }
    let out = null;
    for (let k = 0; k < 2; k++) {
      const f = st.f[k], P = this.p[k];
      let kind = '';
      // mashing: the anti-mash lock (the third light in a string) went on, and
      // the lights keep coming while it's on
      if (f.lk > 0 && P.lk === 0) P.lockPress = 0;
      if (f.lk > 0 && f.lt === t) P.lockPress++;
      P.lk = f.lk;
      if (P.lockPress >= MASH_PRESSES) { kind = 'mash'; P.lockPress = 0; }
      // one move over and over: the same (non-light) move started again and
      // again, nothing else in between (a light breaks the run too)
      const began = f.act === 'attack' && f.t === 1 && f.mv ? 1 : 0;     // (once: a hit-pause can hold t at 1)
      const fresh = began && !P.began;
      P.began = began;
      if (fresh && !/^(throwHold|specialHold)$/.test(f.mv)) {
        const mv = f.mv;
        if (/^(light|lowLight)$/.test(mv)) P.run = 0;
        else {
          const same = mv === P.last && t - P.runAt <= SPAM_WINDOW;
          P.run = same ? P.run + 1 : 1;
          if (!same) P.runAt = t;
          if (P.run >= SPAM_RUN && !kind) { kind = 'spam'; P.run = 0; }
        }
        P.last = mv;
      }
      // turtling: holding the guard, without a break, for seconds
      if (live && f.blk && (f.act === 'guard' || f.act === 'blockstun')) P.guard++;
      else P.guard = 0;
      if (P.guard >= TURTLE && !kind) { kind = 'turtle'; P.guard = 0; }
      // a special that touched nothing
      if (P.special >= 0 && t - P.special >= WHIFF_WAIT) {
        if (!P.touched && !kind) kind = 'whiff';
        P.special = -1;
      }
      if (!kind || out || !live || t < this.next || t < P.next) continue;
      out = { p: k, kind, text: this._line(st, k, kind), tick: t };
      P.next = t + COOLDOWN;
      this.next = t + GAP;
    }
    return out;
  }

  /* the line: from the state (tick, seat, kind, the PRNG's word — read, not
     drawn), skipping lines already said this match */
  _line(st, k, kind) {
    const L = TAUNTS[kind];
    let i = mix(st.tick, k, KINDS.indexOf(kind), st.rng >>> 0) % L.length;
    for (let n = 0; n < L.length && this.used.has(L[i]); n++) i = (i + 1) % L.length;
    this.used.add(L[i]);
    return L[i];
  }
}
