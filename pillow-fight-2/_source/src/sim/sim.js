/* Pillow Fight 2 — the simulation: `step(state, in1, in2) -> state`, 60
   ticks a second, in 3D.

   Pure and deterministic, for rollback netcode (stage 2): integers only
   (positions in milli-units: 1000 = one world unit), the PRNG lives in the
   state, nothing reads a clock or the renderer, no trig — a facing is an
   integer vector of length ~1024 found with an integer square root. The
   state is plain data with a fixed shape: `clone` is a structured copy and
   `hash` an FNV-1a over its JSON.

   The ring is a square mattress, x and z in [−RING, RING]; y is up from the
   quilted top. Off the edge is the carpet, BED below.

   VF-style movement: the two always face each other along a line that turns
   freely. Forward / back walk along it (double-tap: dash); a tap of up or
   down is a sidestep around the other one (a linear attack misses it); held,
   a circling walk; the hop and the crouch have their own keys. Attacks lock
   the facing they started with — that's what a sidestep beats — except
   the circular ones (`circ`), whose wide boxes sweep the arc in front.

   Ring-outs: walking stops at the edge. A knockdown from a heavy, a spin,
   a signature, a special or a launcher that carries a fighter past the
   edge is a ring-out — the round is lost. A throw never rings out: the
   victim goes toward the side with more room, and is kept on the bed.

   PF1's combat rules carry over: lights chain, heavies lunge and can be
   punished (the limb is hittable), O+P throws (beats block; not airborne,
   knocked-down or stunned opponents; a tech window), E blocks (crouched:
   low), the meter and the special, hit-pause, the K.O. cinematic in the
   sim's own slow motion.                                                 */

import { FIGHTERS, MAX_METER, dashOf, isShot } from '../fighters/index.js';
import { LEFT, RIGHT, UP, DOWN, LIGHT, HEAVY, SPECIAL, BLOCK, JUMP, CROUCH } from './input.js';
import { rngInt } from './rng.js';

export const TICKS = 60;
export const ROUND_TICKS = 60 * TICKS;
export const RING = 7600;            // the mattress top: x, z in [−RING, RING]
export const EDGE = 450;             // walking stops this far inside the edge
export const BED = 2600;             // the carpet is this far below the top
export const MAX_SEP = 12000;
export const START_D = 2300;         // each starts this far from the middle
export const INTRO = 110;
export const OUTRO = 180;
export const BUFFER = 6;
export const DOWN_T = 40;
export const GETUP_T = 24;
export const TAP = 12;
export const OFFSCREEN = 9000;
export const SQUAT = 3;
export const HANG_V = 70;
export const DIVE_HANG = 6;
export const THROW_GAP = 2;
export const TECH = 12;
// the throw's toss (PF1's throws pass, in 3D): the victim is held, and let
// go of, just past touching (throwOut) on the side he's thrown to — ahead,
// or behind the thrower over his shoulder — at the thrower's release height
// (FIGHTERS[id].throwUp: [forward, back]); a flight, one soft bounce, down
export const THROW_OUT = 150;
export const THROW_VX = 104;
export const THROW_VY = 150;
export const THROW_BOUNCE = 72;
export const CANCEL = 9;
export const LOCK = 26;
export const STRING = 20;
export const REPEAT = 120;
export const ONE = 1024;             // a facing's length
export const SIDE_T = 18;            // a sidestep's length (ticks)
export const SIDE_V = [0, 60, 120, 160, 170, 170, 165, 155, 140, 125, 110, 90, 70, 50, 34, 20, 10, 0];
export const SIDE_FREE = 12;         // a sidestep can be attacked out of from here on
export const CIRCLE_V = 44;          // the circling walk, per tick
export const EDGE_KO = 1500;         // a heavy blow this close to the edge (behind him) knocks him over it
export const KO_SEQ = { freeze: 6, slow: 90, ramp: 18, len: 150, g: 26, vy: 439, vx: 95, spin: 28, banner: 128 };
export const KO_FINAL = { freeze: 6, slow: 120, ramp: 24, len: 190, g: 22, vy: 495, vx: 110, spin: 36, banner: 166 };
// a ring-out: over the edge, a long slow fall to the carpet, a bounce
export const RO_SEQ = { freeze: 4, slow: 110, ramp: 20, len: 170, g: 24, vy: 260, vx: 120, spin: 30, banner: 140 };
export const SLOW = 25;
export const KO_AFTER = 90;

const sgn = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
const tdiv = (a, b) => Math.trunc(a / b) + 0;   // (+ 0: never a −0 in the state)
export const isqrt = (n) => (n <= 0 ? 0 : Math.floor(Math.sqrt(n)));
const clampI = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/* a direction (dx, dz) as an integer vector of length ONE (a fallback if it's zero) */
export function unit(dx, dz, fx = ONE, fz = 0) {
  const l = isqrt(dx * dx + dz * dz);
  if (l < 8) return [fx, fz];
  return [tdiv(dx * ONE, l), tdiv(dz * ONE, l)];
}

function newFighter(id, side) {
  const d = FIGHTERS[id];
  return {
    id, side,
    x: side ? START_D : -START_D, z: 0, y: 0, vx: 0, vz: 0, vy: 0, px: 0, pz: 0,
    fx: side ? -ONE : ONE, fz: 0,             // facing (integer unit vector)
    face: side ? -1 : 1,                      // screen side: RIGHT is forward for player 1
    act: 'idle', t: 0, mv: '', hm: 0, stop: 0,
    hp: d.health, meter: 0,
    stun: 0, air: 0, aired: 0, inv: 0, tx: 0, tz: 0,
    prev: 0, bl: 0, bh: 0, bs: 0, back: 0, down: 0, fwd: 0, up: 0, blk: 0, jp: 0, ud: 0,
    combo: 0, taken: 0, nag: 0,
    tf: 0, tb: 0, hf: 0, hb: 0, dash: 0, db: 0, dd: 0,
    ss: 0, sb: 0, sd: 0, sr: 0,              // sidestep: asked (dir, buffer), doing (dir), radius
    jmp: 0, jd: 0, dl: 0, ro: 0, out: 0, td: 1, bn: 0,
    lt: -99, ht: -99, ok: 0, ch: 0, lc: 0, lk: 0, it: 99, rep: 0, lmv: '', rt: -999,
    kx: 0, kz: 0, ky: 0, kvx: 0, kvz: 0, kvy: 0, kb: 0, kr: 0, kfx: 0, kfz: 0, kfl: 0,
  };
}

export function createMatch({ p1, p2, seed = 1, rounds = 2 }) {
  if (!FIGHTERS[p1] || !FIGHTERS[p2]) throw new Error(`unknown fighter ${p1} / ${p2}`);
  return {
    v: 2, tick: 0, rng: seed >>> 0, need: rounds,
    phase: 'intro', pt: 0, round: 1, wins: [0, 0], timer: ROUND_TICKS, pause: 0,
    f: [newFighter(p1, 0), newFighter(p2, 1)],
    proj: [], pid: 0, ev: [],
    rw: -1, perfect: 0, ko: '', winner: -1, egg: 0, fluff: 0,
    kt: 0, kn: 0, ks: 100, ka: 0, kf: 0,
  };
}

function newRound(st) {
  st.round++;
  st.phase = 'intro'; st.pt = 0; st.timer = ROUND_TICKS; st.pause = 0;
  st.proj = []; st.rw = -1; st.perfect = 0; st.ko = '';
  st.kt = 0; st.kn = 0; st.ks = 100; st.ka = 0; st.kf = 0;
  st.f = st.f.map((f, k) => { const n = newFighter(f.id, k); n.meter = f.meter; return n; });
  st.ev.push({ k: 'round', n: st.round });
}

export const clone = (st) => structuredClone(st);

export function hash(st) {
  const s = JSON.stringify(st);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

export const step = (st, a, b) => stepInPlace(clone(st), a, b);

/* the line from player 1 to player 2, as a unit vector, and "into the
   screen" (the camera looks along it: Y × line) */
export function lineOf(st) {
  const [a, b] = st.f;
  const [lx, lz] = unit(b.x - a.x, b.z - a.z, a.fx, a.fz);
  return { lx, lz, ix: lz, iz: -lx };
}

/* room from (x, z) to the ring's edge going along (dx, dz) (a unit vector) */
export function roomAlong(x, z, dx, dz) {
  let r = 1 << 30;
  if (dx > 0) r = Math.min(r, tdiv((RING - x) * ONE, dx)); else if (dx < 0) r = Math.min(r, tdiv((-RING - x) * ONE, dx));
  if (dz > 0) r = Math.min(r, tdiv((RING - z) * ONE, dz)); else if (dz < 0) r = Math.min(r, tdiv((-RING - z) * ONE, dz));
  return Math.max(0, r);
}

export const offRing = (f) => Math.abs(f.x) > RING || Math.abs(f.z) > RING;

/* ── the tick ─────────────────────────────────────────────────────────────── */

export function stepInPlace(st, in1, in2) {
  st.tick++;
  st.pt++;
  st.ev = [];
  const live = st.phase === 'fight';
  const ins = [in1 | 0, in2 | 0];
  const L = lineOf(st);
  for (let k = 0; k < 2; k++) readInput(st, k, live ? ins[k] : 0);
  if (st.phase === 'ko' && st.kt < st.kn) {
    koStep(st);
  } else if (st.pause > 0) {
    st.pause--;
  } else {
    for (let k = 0; k < 2; k++) think(st, k, L);
    for (let k = 0; k < 2; k++) move(st, k);
    separate(st);
    for (let k = 0; k < 2; k++) aim(st, k);
    strike(st);
    projectiles(st);
    for (let k = 0; k < 2; k++) ringOut(st, k);
    if (live) st.timer = Math.max(0, st.timer - 1);
  }
  round(st);
  return st;
}

function readInput(st, k, m) {
  const f = st.f[k];
  const was = f.prev, pressed = m & ~was;
  f.prev = m;
  const fwd = f.face > 0 ? RIGHT : LEFT, bk = f.face > 0 ? LEFT : RIGHT;
  f.back = m & bk ? 1 : 0;
  f.down = m & CROUCH ? 1 : 0;
  f.fwd = m & fwd ? 1 : 0;
  f.up = m & JUMP ? 1 : 0;
  f.ud = m & UP ? 1 : m & DOWN ? -1 : 0;
  f.blk = m & BLOCK ? 1 : 0;
  if (st.pause === 0) {
    f.bl = Math.max(0, f.bl - 1); f.bh = Math.max(0, f.bh - 1); f.bs = Math.max(0, f.bs - 1);
    f.tf = Math.max(0, f.tf - 1); f.tb = Math.max(0, f.tb - 1); f.db = Math.max(0, f.db - 1); f.sb = Math.max(0, f.sb - 1);
  }
  const released = was & ~m;
  if (m & fwd) f.hf++; else if (!(released & fwd)) f.hf = 0;
  if (m & bk) f.hb++; else if (!(released & bk)) f.hb = 0;
  if (released & fwd) { f.tf = f.hf <= TAP ? TAP : 0; f.hf = 0; }
  if (released & bk) { f.tb = f.hb <= TAP ? TAP : 0; f.hb = 0; }
  if (pressed & fwd) { if (f.tf) { f.dash = 1; f.db = BUFFER; } f.tf = 0; f.tb = 0; f.hf = 1; }
  if (pressed & bk) { if (f.tb) { f.dash = -1; f.db = BUFFER; } f.tb = 0; f.tf = 0; f.hb = 1; }
  // a tap of up / down: a sidestep (into the screen +1, toward the camera −1)
  if (pressed & UP) { f.ss = 1; f.sb = BUFFER; }
  if (pressed & DOWN) { f.ss = -1; f.sb = BUFFER; }
  if (pressed & LIGHT) { f.bl = BUFFER; f.lt = st.tick; }
  if (pressed & HEAVY) { f.bh = BUFFER; f.ht = st.tick; }
  if (pressed & SPECIAL) {
    f.bs = BUFFER;
    if (f.meter < MAX_METER) {
      f.nag++;
      if (f.nag >= 5) { f.nag = 0; st.ev.push({ k: 'impatient', p: k }); }
    }
  }
}

const together = (f) => Math.abs(f.lt - f.ht) <= THROW_GAP;

const GROUND_FREE = { idle: 1, walkF: 1, walkB: 1, crouch: 1, guard: 1, circle: 1 };

/* forward speed along the facing (and lateral along "into the screen") as world velocity */
function setVel(f, fwd, side = 0, L = null) {
  f.vx = tdiv(f.fx * fwd, ONE); f.vz = tdiv(f.fz * fwd, ONE);
  if (side && L) { f.vx += tdiv(L.ix * side, ONE); f.vz += tdiv(L.iz * side, ONE); }
}

function faceOpp(st, k) {
  const f = st.f[k], o = st.f[1 - k];
  [f.fx, f.fz] = unit(o.x - f.x, o.z - f.z, f.fx, f.fz);
}

function startMove(st, k, name, chain = 0) {
  const f = st.f[k];
  f.ch = chain ? f.ch + 1 : 0;
  f.act = 'attack'; f.mv = name; f.t = 0; f.hm = 0; f.stop = 0; f.ok = 0; f.sd = 0;
  f.bl = f.bh = 0;
  // a move starts aimed at the other one, then keeps that line (a sidestep beats it)
  if (!f.air && !chain) faceOpp(st, k);
  const m = FIGHTERS[f.id].moves[name];
  if (m.lite) {
    f.lc = f.it <= STRING || chain ? f.lc + 1 : 1;
    if (f.lc >= 3) { f.lk = LOCK; f.lc = 0; }
  }
  if (m.kind === 'special') { f.meter = 0; f.bs = 0; f.nag = 0; st.ev.push({ k: 'special', p: k }); }
  if (m.kind === 'signature') st.ev.push({ k: 'signature', p: k });
  if (!m.air && !f.air) { f.vx = 0; f.vz = 0; }
}

function think(st, k, L) {
  const f = st.f[k], o = st.f[1 - k], D = FIGHTERS[f.id];
  f.t++;
  if (f.inv > 0) f.inv--;
  if (f.lk > 0) f.lk--;
  if (f.act === 'attack') f.it = 0; else if (f.it < 99) f.it++;
  // a sidestep's tail can be attacked (or blocked) out of
  const sideFree = f.act === 'side' && f.t >= SIDE_FREE;
  if ((GROUND_FREE[f.act] || sideFree) && !f.air) {
    if (f.bs && f.meter >= MAX_METER) return startMove(st, k, 'special');
    if (f.bl && f.bh && together(f)) return startMove(st, k, 'throw');
    if (f.bh) {
      if (f.down && shotOut(st, k, D.moves.signature)) f.bh = 0;
      else return startMove(st, k, f.down ? 'signature' : f.back ? 'sweep' : 'heavy');
    }
    if (f.bl && !f.lk) return startMove(st, k, f.down ? 'lowLight' : 'light');
    if (sideFree && !f.blk) return sideTick(st, k, L);
    if (f.blk) {
      if (f.act !== 'guard') f.t = 0;
      f.act = 'guard'; f.vx = 0; f.vz = 0; f.dash = 0; f.db = 0; f.sb = 0;
      return;
    }
    if (f.sb && f.ss) {
      f.act = 'side'; f.t = 0; f.sd = f.ss; f.ss = 0; f.sb = 0;
      f.sr = isqrt((o.x - f.x) ** 2 + (o.z - f.z) ** 2);
      st.ev.push({ k: 'side', p: k, d: f.sd });
      return sideTick(st, k, L);
    }
    if (f.db && f.dash) {
      f.act = 'dash'; f.t = 0; f.dd = f.dash; f.dash = 0; f.db = 0;
      st.ev.push({ k: 'dash', p: k, d: f.dd });
      return dashTick(f);
    }
    if (f.up) {
      f.act = 'jumpsquat'; f.t = 0; f.vx = 0; f.vz = 0; f.jd = f.fwd ? 1 : f.back ? -1 : 0;
      st.ev.push({ k: 'jumpsquat', p: k });
      return;
    }
    const was = f.act;
    if (f.down) { f.act = 'crouch'; f.vx = 0; f.vz = 0; }
    else if (f.ud && was === 'circle') { setVel(f, 0, CIRCLE_V * f.ud, L); f.sd = f.ud; f.sr = Math.max(1200, isqrt((o.x - f.x) ** 2 + (o.z - f.z) ** 2)); }
    else if (f.fwd) { f.act = 'walkF'; setVel(f, D.walkF); }
    else if (f.back) { f.act = 'walkB'; setVel(f, -D.walkB); }
    else { f.act = 'idle'; f.vx = 0; f.vz = 0; }
    if (was !== f.act) f.t = 0;
    return;
  }
  switch (f.act) {
    case 'side': return sideTick(st, k, L);
    case 'jumpsquat':
      if (f.t >= SQUAT) {
        // the hop: shorter than PF1's jump (a quarter less take-off)
        f.act = 'jump'; f.t = 0; f.air = 1; f.aired = 0; f.jmp = 1;
        f.vy = tdiv(D.jumpV * 3, 4);
        setVel(f, f.jd > 0 ? tdiv(D.jumpX * 3, 4) : f.jd < 0 ? -tdiv(D.jumpB * 3, 4) : 0);
        st.ev.push({ k: 'jump', p: k });
      }
      return;
    case 'jump':
      if (!f.aired && f.bh && f.down) { f.aired = 1; startMove(st, k, 'dive'); }
      else if (!f.aired && (f.bl || f.bh)) { f.aired = 1; startMove(st, k, f.bh ? 'airHeavy' : 'airLight'); }
      return;
    case 'attack': return attackTick(st, k, f, o, D);
    case 'dash': return dashTick(f);
    case 'hitstun':
    case 'blockstun':
      if (--f.stun <= 0) { f.act = 'idle'; f.t = 0; f.combo = 0; f.ro = 0; }
      return;
    case 'down':
      if (!f.air && --f.stun <= 0) { f.act = 'getup'; f.t = 0; f.inv = GETUP_T + 4; f.ro = 0; }
      return;
    case 'getup':
      if (f.t >= GETUP_T) { f.act = 'idle'; f.t = 0; f.combo = 0; }
      return;
    case 'grabbed': {
      const g = o;
      if (!(g.act === 'attack' && (g.mv === 'specialHold' || g.mv === 'throwHold'))) { f.act = 'idle'; f.t = 0; f.combo = 0; return; }
      if (g.mv === 'throwHold' && f.t <= TECH && f.bl && f.bh && together(f)) tech(st, k);
      return;
    }
    default: return;
  }
}

/* the sidestep: round the other one on a circle (the distance kept), the
   speed from SIDE_V; held past the end, it becomes the circling walk */
function sideTick(st, k, L) {
  const f = st.f[k], o = st.f[1 - k];
  if (f.t >= SIDE_T) {
    f.act = f.ud ? 'circle' : 'idle'; f.t = 0; f.vx = 0; f.vz = 0;
    if (f.ud) f.sd = f.ud;
    return;
  }
  // into the screen (+1) is the same world direction for both (the camera's),
  // so the lateral direction doesn't flip for player 2
  const v = SIDE_V[f.t] * f.sd;
  f.vx = tdiv(L.ix * v, ONE); f.vz = tdiv(L.iz * v, ONE);
  f.sr = f.sr || isqrt((o.x - f.x) ** 2 + (o.z - f.z) ** 2);
}

function tech(st, k) {
  const f = st.f[k], o = st.f[1 - k];
  const [dx, dz] = unit(f.x - o.x, f.z - o.z, -o.fx, -o.fz);
  for (const [g, s] of [[f, 1], [o, -1]]) {
    g.act = 'blockstun'; g.stun = 14; g.t = 0; g.mv = ''; g.vx = 0; g.vz = 0; g.bl = g.bh = 0;
    g.px = tdiv(70 * dx * s, ONE); g.pz = tdiv(70 * dz * s, ONE);
  }
  st.ev.push({ k: 'tech', p: k, x: (f.x + o.x) >> 1, z: (f.z + o.z) >> 1, y: 1900 });
}

function shotOut(st, k, m) {
  return isShot(m) && st.proj.some((p) => p.o === k);
}

function dashTick(f) {
  const [n, v] = dashOf(f.id)[f.dd > 0 ? 'f' : 'b'];
  if (f.t >= n) { f.act = 'idle'; f.t = 0; f.vx = 0; f.vz = 0; f.dd = 0; return; }
  const left = n - f.t;
  setVel(f, tdiv(v * Math.min(4, left), 4) * f.dd);
}

function attackTick(st, k, f, o, D) {
  const m = D.moves[f.mv], t = f.t;
  if (t <= THROW_GAP + 1 && !f.air && !f.ch && ((m.lite && f.bh) || (f.mv === 'heavy' && f.bl)) && together(f)) return startMove(st, k, 'throw');
  if (m.cancel && f.hm && t >= m.hits[0].from && t <= m.hits[m.hits.length - 1].to + CANCEL) {
    if (f.bs && f.meter >= MAX_METER) return startMove(st, k, 'special', 1);
    const shot = f.down && shotOut(st, k, D.moves.signature);
    if (m.cancel === 1) {
      if (f.bh && !shot) return startMove(st, k, f.down ? 'signature' : 'heavy', 1);
      if (f.bl && !f.lk && t > m.hits[m.hits.length - 1].to) return startMove(st, k, f.down ? 'lowLight' : 'light', 1);
    } else if (f.bh && f.down && !shot) return startMove(st, k, 'signature', 1);
  }
  // a circular move keeps turning toward its target until it strikes
  if (m.circ && m.hits.length && t < m.hits[0].from) faceOpp(st, k);
  let fwd = null;
  for (const mo of m.motion) {
    if (t < mo.from || t > mo.to || f.stop) continue;
    if (mo.vx !== undefined) fwd = mo.vx;
    if (mo.vy !== undefined && t === mo.from) { f.vy = mo.vy; f.air = 1; }
  }
  if (fwd !== null) setVel(f, fwd);
  else if (!f.air) { f.vx = 0; f.vz = 0; }
  if (m.dive) {
    if (t < DIVE_HANG) { f.vx = 0; f.vz = 0; f.vy = 0; }
    else if (t === DIVE_HANG) { f.vy = -m.dive; setVel(f, m.diveX ?? 12); }
  }
  if (m.impact && f.dl && t >= m.impact) { f.act = 'idle'; f.t = 0; f.mv = ''; f.dl = 0; return; }
  if (m.track && t === m.track) { f.tx = o.x; f.tz = o.z; }
  for (const s of m.spawn) if (s.at === t) spawn(st, k, s.proj);
  if (m.grab && t >= m.grab.from && t <= m.grab.to && grabbable(f, o, m.grab)) {
    if (m.grab.throw && o.act === 'attack' && o.mv === 'throw' && o.t >= m.grab.from && grabbable(o, f, m.grab)) return tech(st, k);
    f.mv = m.grab.hold; f.t = 0; f.hm = 0;
    o.act = 'grabbed'; o.t = 0; o.vx = 0; o.vz = 0; o.px = 0; o.pz = 0; o.stun = 0; o.combo = 0; o.sd = 0;
    // the owner's rule: the victim is thrown toward the side with more room —
    // on ahead (+1) or back over the thrower's shoulder (−1)
    if (m.grab.throw) {
      faceOpp(st, k);
      const ahead = roomAlong(o.x, o.z, f.fx, f.fz), behind = roomAlong(f.x, f.z, -f.fx, -f.fz);
      f.td = ahead >= behind ? 1 : -1;
    }
    st.ev.push({ k: 'grab', p: k, throw: m.grab.throw ? 1 : 0, d: f.td });
    return;
  }
  if ((f.mv === 'specialHold' || f.mv === 'throwHold') && o.act === 'grabbed') {
    const r = f.mv === 'throwHold' ? throwOut(f, o) : 1500;
    const wx = f.x + tdiv(f.fx * r, ONE), wz = f.z + tdiv(f.fz * r, ONE);
    o.x += tdiv(wx - o.x, 4); o.z += tdiv(wz - o.z, 4);
  }
  if (t >= m.total + (f.hm ? 0 : m.whiffLag)) {
    f.act = f.air ? 'jump' : 'idle'; f.t = 0; f.mv = ''; f.aired = f.air ? 1 : 0;
  }
}

/* how far in front (or behind) a thrown fighter is held and let go of */
export const throwOut = (f, o) => ((FIGHTERS[f.id].push.w + FIGHTERS[o.id].push.w) >> 1) + THROW_OUT;

/* where o stands in f's frame: along f's facing, and across it */
function local(f, o) {
  const dx = o.x - f.x, dz = o.z - f.z;
  return [tdiv(dx * f.fx + dz * f.fz, ONE), tdiv(dz * f.fx - dx * f.fz, ONE)];
}

function grabbable(f, o, g) {
  if (o.air || o.inv || o.act === 'down' || o.act === 'getup' || o.act === 'ko' || o.act === 'grabbed' || o.act === 'ringout') return false;
  const [al, lat] = local(f, o);
  if (al <= 0 || Math.abs(lat) > 1100) return false;
  if (g.throw) {
    if (o.act === 'hitstun' || o.act === 'blockstun') return false;
    return al <= ((FIGHTERS[f.id].push.w + FIGHTERS[o.id].push.w) >> 1) + g.near;
  }
  return al <= g.range;
}

function spawn(st, k, P) {
  const f = st.f[k];
  st.proj.push({
    id: st.pid++, o: k, kind: P.kind,
    x: f.x + tdiv(P.dx * f.fx, ONE), z: f.z + tdiv(P.dx * f.fz, ONE), y: f.y + P.y,
    vx: tdiv(P.vx * f.fx, ONE), vz: tdiv(P.vx * f.fz, ONE), vy: P.vy, fx: f.fx, fz: f.fz,
    w: P.box.w, h: P.box.h, lat: P.lat || (P.box.w >> 1), dmg: P.dmg, level: P.level, life: P.life,
    hitstun: P.hitstun, blockstun: P.blockstun, push: P.push, chip: P.chip, kd: P.kd || 0, sp: P.special || 0, pause: P.pause || 8, bpush: 0, t: 0,
  });
  st.ev.push({ k: 'throw', p: k, kind: P.kind });
}

function move(st, k) {
  const f = st.f[k], D = FIGHTERS[f.id];
  if (f.act === 'grabbed') return;
  if (f.act === 'ringout') return fallOff(st, k, f);
  if (f.air) {
    const diving = f.act === 'attack' && f.t <= DIVE_HANG && FIGHTERS[f.id].moves[f.mv].dive;
    if (diving) { /* hanging */ }
    else if (!f.jmp) f.vy -= D.grav;
    else if (f.vy < HANG_V && f.vy > -HANG_V) f.vy -= tdiv(D.jumpG, 3);
    else f.vy -= f.vy > 0 ? D.jumpG : D.fallG;
    f.x += f.vx; f.z += f.vz;
    f.y += f.vy;
    if (f.y <= 0 && !offRing(f)) land(st, k, f);
  } else { f.x += f.vx; f.z += f.vz; }
  if (f.px || f.pz) { f.x += f.px; f.z += f.pz; f.px = tdiv(f.px * 13, 16); f.pz = tdiv(f.pz * 13, 16); }
  // circling and sidestepping keep the distance: back onto the circle
  if ((f.act === 'side' || f.act === 'circle') && !f.air) {
    const o = st.f[1 - k], r = f.sr;
    const dx = f.x - o.x, dz = f.z - o.z, l = Math.round(Math.sqrt(dx * dx + dz * dz));
    if (r > 0 && l > 8) {
      // (rounded, not truncated: no slow spiral inward)
      f.x = o.x + Math.round((dx * r) / l) + 0; f.z = o.z + Math.round((dz * r) / l) + 0;
    }
  }
  edge(f);
}

/* the ring's edge: anyone who isn't flying off it (a knockdown with ring-out
   power) stops at it */
function edge(f) {
  if (f.ro && (f.act === 'down' || f.act === 'ko') && f.air) return;
  const e = RING - EDGE;
  f.x = clampI(f.x, -e, e); f.z = clampI(f.z, -e, e);
}

function land(st, k, f) {
  f.y = 0; f.vy = 0; f.air = 0; f.jmp = 0;
  st.ev.push({ k: 'land', p: k, hard: f.act === 'down' || f.act === 'ko' ? 1 : 0 });
  if (f.act === 'jump') { f.act = 'idle'; f.t = 0; f.vx = 0; f.vz = 0; }
  else if (f.act === 'attack') {
    const m = FIGHTERS[f.id].moves[f.mv];
    if (m.dive) {
      st.ev.push({ k: 'slam', p: k, x: f.x, z: f.z });
      f.dl = f.ok ? 1 : 0;
      f.mv = 'diveLand'; f.t = 0; f.hm = f.hm ? 1 : 0;
    } else if (m.air) { f.act = 'idle'; f.t = 0; f.mv = ''; }
    f.vx = 0; f.vz = 0;
  } else if (f.act === 'down' && f.bn) {
    // thrown: one soft bounce off the mat, then down
    f.bn = 0; f.air = 1; f.vy = THROW_BOUNCE; f.vx = tdiv(f.vx, 2); f.vz = tdiv(f.vz, 2);
    st.ev.push({ k: 'bounce', p: k, x: f.x, z: f.z });
  } else if (f.act === 'down') { f.stun = DOWN_T; f.vx = 0; f.vz = 0; }
  else { f.vx = 0; f.vz = 0; }
}

/* a fighter past the edge in a ring-out knockdown: the round is lost */
function ringOut(st, k) {
  const f = st.f[k];
  if (f.act === 'ringout' || st.phase !== 'fight') return;
  if (!offRing(f) || !f.ro) return;
  f.act = 'ringout'; f.t = 0; f.air = 1; f.out = 1;
  st.ev.push({ k: 'ringout', p: k, x: f.x, z: f.z });
}

/* off the edge (outside the K.O. sequence): fall to the carpet */
function fallOff(st, k, f) {
  f.vy -= 24;
  f.x += f.vx; f.z += f.vz; f.y += f.vy;
  if (f.y <= -BED) { f.y = -BED; f.vy = 0; f.vx = 0; f.vz = 0; }
}

function separate(st) {
  const [a, b] = st.f;
  const A = FIGHTERS[a.id].push, B = FIGHTERS[b.id].push;
  if (a.act === 'grabbed' || b.act === 'grabbed' || a.act === 'ringout' || b.act === 'ringout') return;
  const vy = a.y < b.y + B.h && b.y < a.y + A.h;
  const dx = b.x - a.x, dz = b.z - a.z, need = (A.w + B.w) >> 1;
  const d2 = dx * dx + dz * dz;
  if (vy && d2 < need * need) {
    const [ux, uz] = unit(dx, dz, a.fx, a.fz);
    const d = isqrt(d2), over = need - d;
    const ma = over >> 1, mb = over - ma;
    a.x -= tdiv(ux * ma, ONE); a.z -= tdiv(uz * ma, ONE);
    b.x += tdiv(ux * mb, ONE); b.z += tdiv(uz * mb, ONE);
    edge(a); edge(b);
  }
  const d = isqrt((b.x - a.x) ** 2 + (b.z - a.z) ** 2);
  if (d > MAX_SEP) {
    const [ux, uz] = unit(b.x - a.x, b.z - a.z, a.fx, a.fz), over = d - MAX_SEP;
    a.x += tdiv(ux * (over >> 1), ONE); a.z += tdiv(uz * (over >> 1), ONE);
    b.x -= tdiv(ux * (over - (over >> 1)), ONE); b.z -= tdiv(uz * (over - (over >> 1)), ONE);
  }
}

/* face the other one whenever free to turn */
function aim(st, k) {
  const f = st.f[k];
  if (f.air || !(GROUND_FREE[f.act] || f.act === 'blockstun' || f.act === 'getup' || f.act === 'side' || f.act === 'dash')) return;
  faceOpp(st, k);
}

/* ── hits ─────────────────────────────────────────────────────────────────── */

/* a fighter's hurt volume: a vertical cylinder (radius, y0, y1), or null */
export function hurtOf(f) {
  const H = FIGHTERS[f.id].hurt;
  if (f.act === 'down' || f.act === 'ko' || f.act === 'getup' || f.act === 'ringout' || f.inv > 0) return null;
  let b;
  if (f.air) b = H.air;
  else if (f.act === 'crouch' || ((f.act === 'blockstun' || f.act === 'guard') && f.down) || (f.act === 'attack' && FIGHTERS[f.id].moves[f.mv].low)) b = H.crouch;
  else b = H.stand;
  return { x: f.x, z: f.z, r: b.w >> 1, y0: f.y + b.y, y1: f.y + b.y + b.h };
}

/* a heavy's limb, out in front while it's extended: hittable (a whiffed heavy can be punished) */
export function limbOf(f) {
  if (f.act !== 'attack' || f.inv > 0) return null;
  const m = FIGHTERS[f.id].moves[f.mv], e = m.ext;
  if (!e || f.t < e.from || f.t > e.to) return null;
  const hb = m.hits[0].box, reach = e.x1 - 350;
  return { x: f.x + tdiv(f.fx * reach, ONE), z: f.z + tdiv(f.fz * reach, ONE), r: 420, y0: f.y + hb.y - 150, y1: f.y + hb.y + hb.h + 150 };
}

/* a hit box in the world: a rectangle in the attacker's frame (along
   [a0, a1], across [−W, W]) at heights [y0, y1]; `abs` boxes (K8-E's Sky
   Neck) sit on the spot marked earlier */
export function worldBox(f, b, W) {
  if (b.abs) return { abs: 1, x: f.tx, z: f.tz, r: b.w >> 1, y0: f.y + b.y, y1: f.y + b.y + b.h };
  return { ox: f.x, oz: f.z, fx: f.fx, fz: f.fz, a0: b.x, a1: b.x + b.w, W, y0: f.y + b.y, y1: f.y + b.y + b.h };
}

/* does a box touch a cylinder? (integer maths) */
export function boxTouches(B, c) {
  if (!(B.y0 < c.y1 && c.y0 < B.y1)) return false;
  if (B.abs) { const dx = c.x - B.x, dz = c.z - B.z, R = B.r + c.r; return dx * dx + dz * dz < R * R; }
  const dx = c.x - B.ox, dz = c.z - B.oz;
  const al = tdiv(dx * B.fx + dz * B.fz, ONE), lat = tdiv(dz * B.fx - dx * B.fz, ONE);
  const ca = clampI(al, B.a0, B.a1), cl = clampI(lat, -B.W, B.W);
  const ea = al - ca, el = lat - cl;
  return ea * ea + el * el < c.r * c.r;
}

function touches(f, box) {
  const hb = hurtOf(f);
  if (hb && boxTouches(box, hb)) return hb;
  const lb = limbOf(f);
  return lb && boxTouches(box, lb) ? lb : null;
}

function invulnTo(o, attackerAir) {
  if (o.act !== 'attack') return false;
  const iv = FIGHTERS[o.id].moves[o.mv].invuln;
  if (!iv || o.t < iv.from || o.t > iv.to) return false;
  return iv.vs === 'all' || (iv.vs === 'air' && attackerAir);
}

export function activeHits(f) {
  if (f.act !== 'attack') return [];
  const m = FIGHTERS[f.id].moves[f.mv], out = [];
  m.hits.forEach((h, j) => { if (f.t >= h.from && f.t <= h.to) out.push({ h, j, box: h.box ? worldBox(f, h.box, h.W) : null }); });
  return out;
}

function strike(st) {
  const contacts = [];
  for (let k = 0; k < 2; k++) {
    const f = st.f[k], o = st.f[1 - k];
    for (const { h, j, box } of activeHits(f)) {
      if ((f.hm >> j) & 1 || h.whiff) continue;
      if (h.auto) { if (o.act === 'grabbed') contacts.push({ k, h, j }); continue; }
      const hb = box && !invulnTo(o, !!f.air) ? touches(o, box) : null;
      if (!hb) continue;
      contacts.push({ k, h, j, box, hb });
    }
  }
  for (const c of contacts) {
    const f = st.f[c.k], o = st.f[1 - c.k];
    f.hm |= 1 << c.j;
    const m = FIGHTERS[f.id].moves[f.mv];
    // the contact point: on the victim's surface facing the attacker
    const [ux, uz] = unit(f.x - o.x, f.z - o.z, -f.fx, -f.fz);
    const r = c.hb ? c.hb.r : 600;
    const yy = c.box ? (Math.max(c.box.y0, c.hb.y0) + Math.min(c.box.y1, c.hb.y1)) >> 1 : o.y + 1600;
    const at = [o.x + tdiv(ux * r, ONE), yy, o.z + tdiv(uz * r, ONE)];
    const fin = f.ch > 0 && !c.h.auto && c.j === m.hits.length - 1 && (f.mv === 'heavy' || m.kind === 'signature' || m.kind === 'special');
    // knockback along the attacker's facing (a throw's toss: the way it was decided)
    let dx = f.fx, dz = f.fz;
    if (c.h.toss) {
      dx = f.fx * f.td; dz = f.fz * f.td;
      if (o.act === 'grabbed') {
        // let go of out on the side it goes to (behind him over the shoulder:
        // the two swap sides), up off the mat at the release height
        const r = throwOut(f, o) * f.td;
        o.x = f.x + tdiv(f.fx * r, ONE); o.z = f.z + tdiv(f.fz * r, ONE); edge(o);
        o.y = FIGHTERS[f.id].throwUp[f.td > 0 ? 0 : 1];
      }
    }
    const power = !m.lite && m.kind !== 'throw';
    const res = landHit(st, c.k, c.h, dx, dz, { special: m.kind === 'special', at, kind: m.kind, fin, mv: f.mv, lite: m.lite, power });
    if (res === 'hit') f.ok = 1;
    if (res === 'hit' && m.stopOnHit) { f.stop = 1; setVel(f, -20); }
  }
}

function canBlock(d, level) {
  if (level === 'unblockable' || d.air) return false;
  if (!(d.act === 'blockstun' || (d.blk && GROUND_FREE[d.act]))) return false;
  if (level === 'low') return !!d.down;
  if (level === 'high') return !d.down;
  return true;
}

function startupOf(f) {
  if (f.act !== 'attack') return 0;
  const m = FIGHTERS[f.id].moves[f.mv];
  if (m.kind === 'throw' && !m.grab) return 0;
  return m.grab ? m.grab.from : m.hits.length ? m.hits[0].from : m.spawn.length ? m.spawn[0].at : 0;
}

const vec = (dx, dz, v) => [tdiv(dx * v, ONE), tdiv(dz * v, ONE)];

/* one hit lands (or is blocked): STUFFING, meter, stun, pause, knockback, events.
   (dx, dz): the blow's direction (unit). o.power: a blow that can ring out */
function landHit(st, a, h, dx, dz, o) {
  const att = st.f[a], d = st.f[1 - a], { special, at, kind } = o;
  const room = roomAlong(d.x, d.z, dx, dz);
  const atEdge = room < 900;
  if (canBlock(d, h.level)) {
    d.act = 'blockstun'; d.stun = h.blockstun; d.t = 0; d.vx = 0; d.vz = 0;
    d.hp = Math.max(1, d.hp - (h.chip || 0));
    const bp = h.bpush || h.push;
    [d.px, d.pz] = vec(dx, dz, tdiv(bp * 3, 2));
    const [ax, az] = vec(dx, dz, atEdge ? tdiv(bp * 5, 4) : tdiv(bp, 2));
    att.px -= ax; att.pz -= az;
    att.meter = Math.min(MAX_METER, att.meter + tdiv(h.dmg * 2, 10));
    d.meter = Math.min(MAX_METER, d.meter + tdiv(h.dmg, 10));
    st.pause = Math.max(st.pause, Math.max(4, h.pause - 3));
    st.ev.push({ k: 'block', p: a, x: at[0], y: at[1], z: at[2], dmg: h.dmg, kind, low: d.down ? 1 : 0 });
    return 'block';
  }
  const ctr = d.act === 'attack' && d.t < startupOf(d) ? 1 : 0;
  const n = d.combo;
  let scale = n < 3 ? 100 : Math.max(special ? 80 : 45, 100 - 15 * (n - 2));
  if (o.lite) {
    att.rep = att.lmv === o.mv && st.tick - att.rt < REPEAT ? att.rep + 1 : 0;
    scale = tdiv(scale * Math.max(55, 100 - 15 * att.rep), 100);
  }
  att.lmv = o.mv || kind; att.rt = st.tick;
  const amp = o.fin && n >= 1 ? 1 : 0;
  if (amp) scale = tdiv(scale * (120 + 12 * Math.min(att.ch, 2)), 100);
  if (ctr) scale = tdiv(scale * 125, 100);
  const dmg = Math.max(1, tdiv(h.dmg * scale, 100));
  d.hp = Math.max(0, d.hp - dmg);
  d.taken += dmg;
  d.combo++;
  if (!special) att.meter = Math.min(MAX_METER, att.meter + tdiv(dmg * 9, 10));
  if (amp) att.meter = Math.min(MAX_METER, att.meter + 50 + 40 * Math.min(att.ch, 2));
  d.meter = Math.min(MAX_METER, d.meter + tdiv(dmg * 35, 100));
  // a heavy blow with his back to the edge: over he goes
  const edgeKO = o.power && !h.toss && room < EDGE_KO && d.act !== 'grabbed';
  st.pause = Math.max(st.pause, h.pause + (amp ? 4 : 0) + (ctr ? 2 : 0) + (edgeKO ? 3 : 0));
  st.ev.push({ k: 'hit', p: a, x: at[0], y: at[1], z: at[2], dmg, kind, sp: special ? 1 : 0, kd: h.kd || amp || edgeKO ? 1 : 0, n: d.combo, amp, ctr, thr: h.toss ? 1 : 0, edge: edgeKO ? 1 : 0 });
  if (d.hp === 0) {
    d.bn = 0;
    d.act = 'ko'; d.t = 0; d.air = 1; d.vy = 0; d.vx = 0; d.vz = 0; d.px = 0; d.pz = 0; d.kfx = dx; d.kfz = dz;
    d.ro = h.toss ? 0 : 1;
    if (!st.ko) st.ko = special ? 'special' : 'normal';
    return 'hit';
  }
  if (d.act === 'grabbed' && !h.kd) { d.t = 0; return 'hit'; }
  if (h.kd || d.air || amp || edgeKO) {
    const big = h.toss || amp || edgeKO;
    d.act = 'down'; d.t = 0; d.air = 1; d.vy = big ? 165 : 140; d.stun = 0; d.px = 0; d.pz = 0;
    [d.vx, d.vz] = vec(dx, dz, edgeKO ? 95 : big ? 78 : 48);
    // ring-out power: not a throw's toss, not a light
    d.ro = o.power && !h.toss ? 1 : 0;
    if (h.toss) {
      // a long flight and a soft bounce — and never off the bed: the toss
      // shortened to the room there is (the edge holds him anyway)
      const g = FIGHTERS[d.id].grav, n = tdiv(THROW_VY + isqrt(THROW_VY * THROW_VY + 2 * g * d.y), g) + tdiv(THROW_BOUNCE, g);
      const r2 = roomAlong(d.x, d.z, dx, dz) - 900;
      const v = Math.max(0, Math.min(THROW_VX, tdiv(r2, Math.max(1, n))));
      d.vy = THROW_VY; [d.vx, d.vz] = vec(dx, dz, v); d.bn = 1;
    }
  } else {
    d.act = 'hitstun'; d.stun = h.hitstun + (ctr ? 8 : 0); d.t = 0; d.vx = 0; d.vz = 0;
    [d.px, d.pz] = vec(dx, dz, h.push);
    if (!special) { const [ax, az] = vec(dx, dz, atEdge ? tdiv(h.push * 3, 4) : tdiv(h.push, 3)); att.px -= ax; att.pz -= az; }
  }
  return 'hit';
}

/* ── projectiles ───────────────────────────────────────────────────────────── */

function projBox(p) {
  return { ox: p.x, oz: p.z, fx: p.fx, fz: p.fz, a0: -(p.w >> 1), a1: p.w >> 1, W: p.lat, y0: p.y - (p.h >> 1), y1: p.y + (p.h >> 1) };
}

function projectiles(st) {
  const keep = [];
  for (const p of st.proj) {
    p.t++; p.life--;
    p.x += p.vx; p.z += p.vz; p.y += p.vy;
    if (p.dead) continue;
    for (const q of st.proj) {
      if (q === p || q.o === p.o || q.dead) continue;
      const dx = p.x - q.x, dz = p.z - q.z, R = (p.w + q.w) >> 1;
      if (dx * dx + dz * dz < R * R && Math.abs(p.y - q.y) < ((p.h + q.h) >> 1)) {
        p.dead = q.dead = 1; st.ev.push({ k: 'clash', x: (p.x + q.x) >> 1, y: (p.y + q.y) >> 1, z: (p.z + q.z) >> 1 });
      }
    }
    if (p.dead) continue;
    const d = st.f[1 - p.o];
    if (!invulnTo(d, false) && touches(d, projBox(p))) {
      landHit(st, p.o, p, p.fx, p.fz, { special: !!p.sp, at: [p.x, p.y, p.z], kind: p.sp ? 'special' : 'signature', power: !!p.sp });
      continue;
    }
    const far = isqrt((p.x - d.x) ** 2 + (p.z - d.z) ** 2);
    if (p.life <= 0 || Math.abs(p.x) > RING + 3000 || Math.abs(p.z) > RING + 3000 || (far > OFFSCREEN)) continue;
    keep.push(p);
  }
  st.proj = keep.filter((p) => !p.dead);
}

/* ── the K.O. and the ring-out cinematics ─────────────────────────────────── */

export const koPlan = (st) => (st.ko === 'ringout' ? RO_SEQ : st.kf ? KO_FINAL : KO_SEQ);

export function koScale(P, kt) {
  if (kt < P.freeze) return 0;
  const a = kt - P.freeze;
  if (a < P.slow) return SLOW;
  const b = a - P.slow;
  if (b < P.ramp) return SLOW + tdiv((100 - SLOW) * (b + 1), P.ramp + 1);
  return 100;
}

function startKO(st, final) {
  st.kf = final ? 1 : 0;
  const P = koPlan(st);
  st.kn = P.len; st.kt = 0; st.ka = 0; st.ks = 0; st.pause = 0;
  st.proj = [];
  for (const f of st.f) {
    const out = f.act === 'ringout';
    if (f.hp !== 0 && !out) continue;
    let dx = f.kfx, dz = f.kfz;
    if (!dx && !dz) { dx = -f.fx; dz = -f.fz; }
    if (out) { const [ux, uz] = unit(f.vx, f.vz, dx, dz); dx = ux; dz = uz; }
    f.kfl = out ? 1 : 0;
    f.act = 'ko'; f.t = 0; f.air = 1; f.vx = 0; f.vz = 0; f.vy = 0; f.px = 0; f.pz = 0; f.jmp = 0; f.stun = 0;
    f.kx = f.x * 100; f.kz = f.z * 100; f.ky = f.y * 100;
    f.kvx = tdiv(P.vx * dx * 100, ONE); f.kvz = tdiv(P.vx * dz * 100, ONE); f.kvy = (out ? tdiv(P.vy, 2) : P.vy) * 100;
    f.kb = 0; f.kr = 0; f.kfx = dx; f.kfz = dz;
    st.ev.push({ k: 'koflash', p: 1 - st.f.indexOf(f), x: f.x, y: f.y + 1700, z: f.z, final: st.kf, out: out ? 1 : 0 });
  }
}

function koStep(st) {
  const P = koPlan(st), s = koScale(P, st.kt);
  st.ks = s;
  for (let k = 0; k < 2; k++) {
    const f = st.f[k];
    if (f.act !== 'ko') continue;
    if (f.kb < 2) {
      const up = f.kvy > 0;
      f.kx += tdiv(f.kvx * s, 100);
      f.kz += tdiv(f.kvz * s, 100);
      f.ky += tdiv(f.kvy * s, 100);
      f.kvy -= P.g * s;
      f.kr += tdiv(P.spin * s, 100) * (f.kb ? 0 : 1);
      if (up && f.kvy <= 0 && !f.kb) st.ev.push({ k: 'koapex', p: k, x: tdiv(f.kx, 100), y: tdiv(f.ky, 100), z: tdiv(f.kz, 100) });
      // the floor: the mattress, or the carpet once he's past the edge
      const off = Math.abs(f.kx) > RING * 100 || Math.abs(f.kz) > RING * 100;
      if (off) f.kfl = 1;
      // still over the bed but coming down from off it: slide him clear
      const floor = off ? -BED * 100 : 0;
      if (f.ky <= floor && f.kvy < 0) {
        f.ky = floor;
        if (f.kb === 0) {
          f.kb = 1; f.kvy = tdiv(-f.kvy * 30, 100); f.kvx = tdiv(f.kvx * 35, 100); f.kvz = tdiv(f.kvz * 35, 100);
          st.ev.push({ k: 'kobounce', p: k, x: tdiv(f.kx, 100), z: tdiv(f.kz, 100), y: tdiv(f.ky, 100), carpet: off ? 1 : 0 });
        } else {
          f.kb = 2; f.kvy = 0; f.kvx = 0; f.kvz = 0;
          st.ev.push({ k: 'land', p: k, hard: 1 });
        }
      }
    }
    if (st.kt === st.kn - 1) { f.kb = 2; f.ky = f.kfl ? -BED * 100 : 0; }
    f.x = tdiv(f.kx, 100); f.z = tdiv(f.kz, 100); f.y = tdiv(f.ky, 100);
    f.air = f.kb < 2 ? 1 : 0; f.vy = 0; f.vx = 0; f.vz = 0;
  }
  if (st.rw === 0 || st.rw === 1) {
    st.ka += s;
    if (st.ka >= 100) {
      st.ka -= 100;
      const k = st.rw;
      think(st, k, lineOf(st));
      move(st, k);
    }
  }
  if (st.kt === P.banner) st.ev.push({ k: 'kobanner', w: st.rw, perfect: st.perfect, fluff: st.fluff, out: st.ko === 'ringout' ? 1 : 0 });
  st.kt++;
  if (st.kt >= st.kn) st.ks = 100;
}

/* ── the round and the match ─────────────────────────────────────────────── */

function decide(st, w) {
  st.rw = w;
  if (w === 0 || w === 1) { st.wins[w]++; st.perfect = st.f[w].taken === 0 ? 1 : 0; }
  else { st.wins[0]++; st.wins[1]++; st.perfect = 0; }
}

function round(st) {
  if (st.phase === 'intro') {
    if (st.pt === 1) st.ev.push({ k: 'banner', text: 'round', n: st.round });
    if (st.pt === INTRO - 40) st.ev.push({ k: 'banner', text: 'fight' });
    if (st.pt >= INTRO) { st.phase = 'fight'; st.pt = 0; }
    return;
  }
  if (st.phase === 'fight') {
    const [a, b] = st.f;
    const outA = a.act === 'ringout', outB = b.act === 'ringout';
    if (outA || outB) {
      st.phase = 'ko'; st.pt = 0; st.ko = 'ringout';
      decide(st, outA && outB ? 2 : outA ? 1 : 0);
      const ends = st.wins[0] >= st.need || st.wins[1] >= st.need;
      st.fluff = 0;
      startKO(st, ends);
      st.ev.push({ k: 'ko', w: st.rw, perfect: st.perfect, fluff: 0, final: st.kf, out: 1 });
    } else if (a.hp === 0 || b.hp === 0) {
      st.phase = 'ko'; st.pt = 0;
      decide(st, a.hp === 0 && b.hp === 0 ? 2 : a.hp === 0 ? 1 : 0);
      const ends = st.wins[0] >= st.need || st.wins[1] >= st.need;
      st.fluff = ends && st.rw !== 2 && st.wins[1 - st.rw] < st.need && st.ko === 'special' && rngInt(st, 10) === 0 ? 1 : 0;
      startKO(st, ends);
      st.ev.push({ k: 'ko', w: st.rw, perfect: st.perfect, fluff: st.fluff, final: st.kf, out: 0 });
    } else if (st.timer === 0) {
      st.phase = 'time'; st.pt = 0;
      const ra = tdiv(a.hp * 1000, FIGHTERS[a.id].health), rb = tdiv(b.hp * 1000, FIGHTERS[b.id].health);
      decide(st, ra > rb ? 0 : rb > ra ? 1 : 2);
      if (st.rw !== 2) { const l = st.f[1 - st.rw]; l.act = 'lose'; l.t = 0; l.vx = 0; l.vz = 0; }
      st.ev.push({ k: 'time', w: st.rw, perfect: st.perfect });
    }
    return;
  }
  if (st.phase === 'ko' || st.phase === 'time') {
    if (st.rw === 0 || st.rw === 1) {
      const w = st.f[st.rw];
      if (st.pt > 50 + st.kn && !w.air && w.act !== 'win' && (GROUND_FREE[w.act] || w.act === 'blockstun' || w.act === 'hitstun')) { w.act = 'win'; w.t = 0; w.vx = 0; w.vz = 0; }
    }
    if (st.pt >= (st.phase === 'ko' ? st.kn + KO_AFTER : OUTRO)) {
      const [w0, w1] = st.wins;
      if (w0 >= st.need || w1 >= st.need) {
        st.phase = 'end'; st.pt = 0;
        st.winner = w0 >= st.need && w1 >= st.need ? 2 : w0 >= st.need ? 0 : 1;
        st.egg = rngInt(st, 5) === 0 ? 1 : 0;
        st.ev.push({ k: 'end', w: st.winner, egg: st.egg, fluff: st.fluff });
      } else newRound(st);
    }
  }
}

export function run(st, inputs, maxTicks = 60 * 60 * 10) {
  for (let i = 0; i < maxTicks && st.phase !== 'end'; i++) {
    const [a, b] = inputs(st, i);
    stepInPlace(st, a, b);
  }
  return st;
}
