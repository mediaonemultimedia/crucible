/* The simulation: `step(state, in1, in2) -> state`, 60 ticks a second.

   Pure and deterministic: integers only (positions in milli-units, see
   fighters/index.js), the PRNG lives in the state, nothing reads a clock,
   nothing reads the renderer. The state is plain data with a fixed shape,
   so `clone` is a structured copy and `hash` a walk over its JSON — what a
   rollback netcode needs (snapshot at tick N, resimulate, compare hashes).

   Per tick: input edges and buffers → each fighter's state machine (stand,
   walk, crouch, jump, attack, hit/block stun, knockdown, grabbed, KO) →
   motion and gravity → push boxes and the stage → hit boxes against hurt
   boxes (both sides at once, so trades happen) → projectiles → hit-pause,
   STUFFING (health), meter → the round (timer, K.O., time) → the match
   (best of 3, the winner's catchphrase, a rare Fluffatality).            */

import { FIGHTERS, MAX_METER, dashOf, isShot } from '../fighters/index.js';
import { LEFT, RIGHT, UP, DOWN, LIGHT, HEAVY, SPECIAL } from './input.js';
import { rngInt } from './rng.js';

export const TICKS = 60;
export const ROUND_TICKS = 99 * TICKS;
export const STAGE = 9500;           // the stage runs from −STAGE to +STAGE
export const MAX_SEP = 11000;        // the camera never lets them further apart
export const START_X = 2300;
export const INTRO = 110;            // 'Round N' then 'Fight!'
export const OUTRO = 180;            // after a K.O. or time, before the next round
export const BUFFER = 6;             // a press is remembered this many ticks
export const DOWN_T = 40;            // lying after a knockdown
export const GETUP_T = 24;           // getting up (invulnerable)
export const TAP = 12;               // a double-tap's second press within this many ticks
export const OFFSCREEN = 4500;       // a shot this far past the one it was thrown at is gone

const sgn = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
const tdiv = (a, b) => Math.trunc(a / b);

function newFighter(id, side) {
  const d = FIGHTERS[id];
  return {
    id, side,
    x: side ? START_X : -START_X, y: 0, vx: 0, vy: 0, pv: 0,
    face: side ? -1 : 1,
    act: 'idle', t: 0, mv: '', hm: 0, stop: 0,
    hp: d.health, meter: 0,
    stun: 0, air: 0, aired: 0, inv: 0, tx: 0,
    prev: 0, bl: 0, bh: 0, bs: 0, back: 0, down: 0,
    combo: 0, taken: 0, nag: 0,
    tf: 0, tb: 0, dash: 0, db: 0, dd: 0,
  };
}

export function createMatch({ p1, p2, seed = 1 }) {
  if (!FIGHTERS[p1] || !FIGHTERS[p2]) throw new Error(`unknown fighter ${p1} / ${p2}`);
  return {
    v: 1, tick: 0, rng: seed >>> 0,
    phase: 'intro', pt: 0, round: 1, wins: [0, 0], timer: ROUND_TICKS, pause: 0,
    f: [newFighter(p1, 0), newFighter(p2, 1)],
    proj: [], pid: 0, ev: [],
    rw: -1, perfect: 0, ko: '', winner: -1, egg: 0, fluff: 0,
  };
}

/* a new round: places, STUFFING and stun reset; meter and wins carry over */
function newRound(st) {
  st.round++;
  st.phase = 'intro'; st.pt = 0; st.timer = ROUND_TICKS; st.pause = 0;
  st.proj = []; st.rw = -1; st.perfect = 0; st.ko = '';
  st.f = st.f.map((f, k) => { const n = newFighter(f.id, k); n.meter = f.meter; return n; });
  st.ev.push({ k: 'round', n: st.round });
}

export const clone = (st) => structuredClone(st);

/* FNV-1a over the canonical JSON (the shape is fixed, so key order is) */
export function hash(st) {
  const s = JSON.stringify(st);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

export const step = (st, a, b) => stepInPlace(clone(st), a, b);

/* ── the tick ─────────────────────────────────────────────────────────────── */

export function stepInPlace(st, in1, in2) {
  st.tick++;
  st.pt++;
  st.ev = [];
  const live = st.phase === 'fight';
  const ins = [in1 | 0, in2 | 0];

  // edges and buffers always run, so a press during hit-pause still counts
  for (let k = 0; k < 2; k++) readInput(st, k, live ? ins[k] : 0);

  if (st.pause > 0) {
    st.pause--;
  } else {
    for (let k = 0; k < 2; k++) think(st, k);
    for (let k = 0; k < 2; k++) move(st, k);
    separate(st);
    for (let k = 0; k < 2; k++) face(st, k);
    strike(st);
    projectiles(st);
    if (live) st.timer = Math.max(0, st.timer - 1);
  }
  round(st);
  return st;
}

function readInput(st, k, m) {
  const f = st.f[k];
  const pressed = m & ~f.prev;
  f.prev = m;
  const fwd = f.face > 0 ? RIGHT : LEFT, bk = f.face > 0 ? LEFT : RIGHT;
  f.back = m & bk ? 1 : 0;
  f.down = m & DOWN ? 1 : 0;
  f.fwd = m & fwd ? 1 : 0;
  f.up = m & UP ? 1 : 0;
  if (st.pause === 0) {
    f.bl = Math.max(0, f.bl - 1); f.bh = Math.max(0, f.bh - 1); f.bs = Math.max(0, f.bs - 1);
    f.tf = Math.max(0, f.tf - 1); f.tb = Math.max(0, f.tb - 1); f.db = Math.max(0, f.db - 1);
  }
  // a double-tap (press, release, press within TAP ticks) asks for a dash
  if (pressed & fwd) { if (f.tf) { f.dash = 1; f.db = BUFFER; f.tf = 0; } else f.tf = TAP; f.tb = 0; }
  if (pressed & bk) { if (f.tb) { f.dash = -1; f.db = BUFFER; f.tb = 0; } else f.tb = TAP; f.tf = 0; }
  if (pressed & LIGHT) f.bl = BUFFER;
  if (pressed & HEAVY) f.bh = BUFFER;
  if (pressed & SPECIAL) {
    f.bs = BUFFER;
    // the impatient special: five presses on an empty meter and he says so
    if (f.meter < MAX_METER) {
      f.nag++;
      if (f.nag >= 5) { f.nag = 0; st.ev.push({ k: 'impatient', p: k }); }
    }
  }
}

const GROUND_FREE = { idle: 1, walkF: 1, walkB: 1, crouch: 1 };

function startMove(st, k, name) {
  const f = st.f[k];
  f.act = 'attack'; f.mv = name; f.t = 0; f.hm = 0; f.stop = 0;
  f.bl = f.bh = 0;
  const m = FIGHTERS[f.id].moves[name];
  if (m.kind === 'special') { f.meter = 0; f.bs = 0; f.nag = 0; st.ev.push({ k: 'special', p: k }); }
  if (m.kind === 'signature') st.ev.push({ k: 'signature', p: k });
  if (!m.air && !f.air) f.vx = 0;
}

function think(st, k) {
  const f = st.f[k], o = st.f[1 - k], D = FIGHTERS[f.id];
  f.t++;
  if (f.inv > 0) f.inv--;
  if (GROUND_FREE[f.act] && !f.air) {
    if (f.bs && f.meter >= MAX_METER) return startMove(st, k, 'special');
    if (f.bh) {
      // one shot of your own on screen at a time: no throw while it's out
      if (f.down && shotOut(st, k, D.moves.signature)) f.bh = 0;
      else return startMove(st, k, f.down ? 'signature' : 'heavy');
    }
    if (f.bl) return startMove(st, k, f.down ? 'lowLight' : 'light');
    if (f.db && f.dash) {
      f.act = 'dash'; f.t = 0; f.dd = f.dash; f.dash = 0; f.db = 0;
      st.ev.push({ k: 'dash', p: k, d: f.dd });
      return dashTick(f);
    }
    if (f.up) {
      f.act = 'jump'; f.t = 0; f.air = 1; f.aired = 0;
      f.vy = D.jumpV; f.vx = f.fwd ? D.jumpX * f.face : f.back ? -D.jumpX * f.face : 0;
      st.ev.push({ k: 'jump', p: k });
      return;
    }
    const was = f.act;
    if (f.down) { f.act = 'crouch'; f.vx = 0; }
    else if (f.fwd) { f.act = 'walkF'; f.vx = D.walkF * f.face; }
    else if (f.back) { f.act = 'walkB'; f.vx = -D.walkB * f.face; }
    else { f.act = 'idle'; f.vx = 0; }
    if (was !== f.act) f.t = 0;
    return;
  }
  switch (f.act) {
    case 'jump':
      if (!f.aired && (f.bl || f.bh)) { f.aired = 1; startMove(st, k, f.bh ? 'airHeavy' : 'airLight'); }
      return;
    case 'attack': return attackTick(st, k, f, o, D);
    case 'dash': return dashTick(f);
    case 'hitstun':
    case 'blockstun':
      if (--f.stun <= 0) { f.act = 'idle'; f.t = 0; f.combo = 0; }
      return;
    case 'down':
      if (!f.air && --f.stun <= 0) { f.act = 'getup'; f.t = 0; f.inv = GETUP_T + 4; }
      return;
    case 'getup':
      if (f.t >= GETUP_T) { f.act = 'idle'; f.t = 0; f.combo = 0; }
      return;
    case 'grabbed': {
      const g = o;
      if (!(g.act === 'attack' && g.mv === 'specialHold')) { f.act = 'idle'; f.t = 0; f.combo = 0; }
      return;
    }
    default: return;   // ko, win, lose
  }
}

/* is one of this fighter's own shots still out (for a move that throws)? */
function shotOut(st, k, m) {
  return isShot(m) && st.proj.some((p) => p.o === k);
}

/* a dash: full speed, easing off over the last few ticks, then free */
function dashTick(f) {
  const [n, v] = dashOf(f.id)[f.dd > 0 ? 'f' : 'b'];
  if (f.t >= n) { f.act = 'idle'; f.t = 0; f.vx = 0; f.dd = 0; return; }
  const left = n - f.t;
  f.vx = tdiv(v * Math.min(4, left), 4) * f.dd * f.face;
}

function attackTick(st, k, f, o, D) {
  const m = D.moves[f.mv], t = f.t;
  // light normals cancel into heavy, the signature or the special on contact
  if (m.cancel && f.hm && t >= m.hits[0].from && t <= m.hits[m.hits.length - 1].to + 9) {
    if (f.bs && f.meter >= MAX_METER) return startMove(st, k, 'special');
    if (f.bh && !(f.down && shotOut(st, k, D.moves.signature))) return startMove(st, k, f.down ? 'signature' : 'heavy');
  }
  // motion: a forward push over a window, a hop at a frame
  let vx = null;
  for (const mo of m.motion) {
    if (t < mo.from || t > mo.to || f.stop) continue;
    if (mo.vx !== undefined) vx = mo.vx * f.face;
    if (mo.vy !== undefined && t === mo.from) { f.vy = mo.vy; f.air = 1; }
  }
  if (vx !== null) f.vx = vx;
  else if (!f.air) f.vx = 0;
  if (m.track && t === m.track) f.tx = o.x;
  for (const s of m.spawn) if (s.at === t) spawn(st, k, s.proj);
  if (m.grab && t >= m.grab.from && t <= m.grab.to && grabbable(f, o, m.grab.range)) {
    f.mv = m.grab.hold; f.t = 0; f.hm = 0;
    o.act = 'grabbed'; o.t = 0; o.vx = 0; o.pv = 0; o.stun = 0;
    st.ev.push({ k: 'grab', p: k });
    return;
  }
  if (f.mv === 'specialHold' && o.act === 'grabbed') {
    // the victim is drawn in and held in front of the arms
    const want = f.x + f.face * 1500;
    o.x += tdiv(want - o.x, 4);
  }
  if (t >= m.total) {
    f.act = f.air ? 'jump' : 'idle'; f.t = 0; f.mv = ''; f.aired = f.air ? 1 : 0;
  }
}

function grabbable(f, o, range) {
  if (o.air || o.inv || o.act === 'down' || o.act === 'getup' || o.act === 'ko' || o.act === 'grabbed') return false;
  return Math.abs(o.x - f.x) <= range;
}

function spawn(st, k, P) {
  const f = st.f[k];
  st.proj.push({
    id: st.pid++, o: k, kind: P.kind,
    x: f.x + P.dx * f.face, y: f.y + P.y, vx: P.vx * f.face, vy: P.vy,
    w: P.box.w, h: P.box.h, dmg: P.dmg, level: P.level, life: P.life,
    hitstun: P.hitstun, blockstun: P.blockstun, push: P.push, chip: P.chip, kd: P.kd || 0, sp: P.special || 0, t: 0,
  });
  st.ev.push({ k: 'throw', p: k, kind: P.kind });
}

/* velocity, gravity, the floor, pushback, the walls */
function move(st, k) {
  const f = st.f[k], D = FIGHTERS[f.id];
  if (f.act === 'grabbed') return;
  if (f.air) {
    f.vy -= D.grav;
    f.x += f.vx;
    f.y += f.vy;
    if (f.y <= 0) land(st, k, f);
  } else f.x += f.vx;
  if (f.pv) { f.x += f.pv; f.pv = tdiv(f.pv * 13, 16); }
  if (f.x < -STAGE) f.x = -STAGE;
  if (f.x > STAGE) f.x = STAGE;
}

function land(st, k, f) {
  f.y = 0; f.vy = 0; f.air = 0;
  st.ev.push({ k: 'land', p: k, hard: f.act === 'down' || f.act === 'ko' ? 1 : 0 });
  if (f.act === 'jump') { f.act = 'idle'; f.t = 0; f.vx = 0; }
  else if (f.act === 'attack') {
    const m = FIGHTERS[f.id].moves[f.mv];
    if (m.air) { f.act = 'idle'; f.t = 0; f.mv = ''; }
    f.vx = 0;
  } else if (f.act === 'down') { f.stun = DOWN_T; f.vx = 0; }
  else if (f.act === 'ko') f.vx = 0;
  else f.vx = 0;
}

/* push boxes: two bodies can't share the floor; one in the air above the
   other's head passes over */
function separate(st) {
  const [a, b] = st.f;
  const A = FIGHTERS[a.id].push, B = FIGHTERS[b.id].push;
  if (a.act === 'grabbed' || b.act === 'grabbed') return;
  const vy = a.y < b.y + B.h && b.y < a.y + A.h;
  const dx = b.x - a.x, need = (A.w + B.w) >> 1;
  if (vy && Math.abs(dx) < need) {
    const dir = dx !== 0 ? sgn(dx) : a.face;
    let over = need - Math.abs(dx);
    let ma = over >> 1, mb = over - ma;
    // against a wall the other one gives all of it
    if (a.x - dir * ma < -STAGE || a.x - dir * ma > STAGE) { mb += ma; ma = 0; }
    if (b.x + dir * mb < -STAGE || b.x + dir * mb > STAGE) { ma += mb; mb = 0; }
    a.x -= dir * ma; b.x += dir * mb;
    a.x = Math.max(-STAGE, Math.min(STAGE, a.x));
    b.x = Math.max(-STAGE, Math.min(STAGE, b.x));
  }
  // the camera's leash
  const sep = b.x - a.x;
  if (Math.abs(sep) > MAX_SEP) {
    const over = Math.abs(sep) - MAX_SEP, s = sgn(sep);
    // whoever is moving away gives way
    const away = (f, dir) => f.vx * dir > 0 || f.pv * dir > 0;
    if (away(b, s) && !away(a, -s)) b.x -= s * over;
    else if (away(a, -s) && !away(b, s)) a.x += s * over;
    else { a.x += s * (over >> 1); b.x -= s * (over - (over >> 1)); }
  }
}

/* face the other one whenever free to turn (on the ground, not mid-move) */
function face(st, k) {
  const f = st.f[k], o = st.f[1 - k];
  if (f.air || !(GROUND_FREE[f.act] || f.act === 'blockstun' || f.act === 'getup')) return;
  const s = sgn(o.x - f.x);
  if (s && s !== f.face) f.face = s;
}

/* ── hits ─────────────────────────────────────────────────────────────────── */

export function hurtBox(f) {
  const H = FIGHTERS[f.id].hurt;
  if (f.act === 'down' || f.act === 'ko' || f.act === 'getup' || f.inv > 0) return null;
  let b;
  if (f.air) b = H.air;
  else if (f.act === 'crouch' || (f.act === 'blockstun' && f.down) || (f.act === 'attack' && FIGHTERS[f.id].moves[f.mv].low)) b = H.crouch;
  else b = H.stand;
  if (f.act === 'attack') {
    // a heavy's limb out in front is there to be hit
    const e = FIGHTERS[f.id].moves[f.mv].ext;
    if (e && f.t >= e.from && f.t <= e.to && e.x1 > b.x + b.w) b = { ...b, w: e.x1 - b.x };
  }
  return worldBox(f, b);
}

export function worldBox(f, b) {
  const x0 = b.abs ? f.tx + b.x : f.face > 0 ? f.x + b.x : f.x - b.x - b.w;
  return { x0, x1: x0 + b.w, y0: f.y + b.y, y1: f.y + b.y + b.h };
}

const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

function invulnTo(o, attackerAir) {
  if (o.act !== 'attack') return false;
  const m = FIGHTERS[o.id].moves[o.mv];
  const iv = m.invuln;
  if (!iv || o.t < iv.from || o.t > iv.to) return false;
  return iv.vs === 'all' || (iv.vs === 'air' && attackerAir);
}

/* the boxes active this tick for an attacking fighter (for the sim and the debug view) */
export function activeHits(f) {
  if (f.act !== 'attack') return [];
  const m = FIGHTERS[f.id].moves[f.mv], out = [];
  m.hits.forEach((h, j) => { if (f.t >= h.from && f.t <= h.to) out.push({ h, j, box: h.box ? worldBox(f, h.box) : null }); });
  return out;
}

function strike(st) {
  // find every contact first, then apply: both can land on the same tick
  const contacts = [];
  for (let k = 0; k < 2; k++) {
    const f = st.f[k], o = st.f[1 - k];
    for (const { h, j, box } of activeHits(f)) {
      if ((f.hm >> j) & 1 || h.whiff) continue;
      if (h.auto) {
        if (o.act === 'grabbed') { contacts.push({ k, h, j }); }
        continue;
      }
      const hb = hurtBox(o);
      if (!hb || !box || invulnTo(o, !!f.air) || !overlap(box, hb)) continue;
      contacts.push({ k, h, j, box, hb });
    }
  }
  for (const c of contacts) {
    const f = st.f[c.k];
    f.hm |= 1 << c.j;
    const m = FIGHTERS[f.id].moves[f.mv];
    const at = c.box ? [(Math.max(c.box.x0, c.hb.x0) + Math.min(c.box.x1, c.hb.x1)) >> 1, (Math.max(c.box.y0, c.hb.y0) + Math.min(c.box.y1, c.hb.y1)) >> 1]
      : [st.f[1 - c.k].x, st.f[1 - c.k].y + 1600];
    const r = land_hit(st, c.k, c.h, f.face, m.kind === 'special', at, m.kind);
    if (r === 'hit' && m.stopOnHit) { f.stop = 1; f.vx = -20 * f.face; }
  }
}

function canBlock(d, level) {
  if (level === 'unblockable' || d.air || !d.back) return false;
  if (!(d.act === 'idle' || d.act === 'walkB' || d.act === 'crouch' || d.act === 'blockstun')) return false;
  if (level === 'low') return !!d.down;
  if (level === 'high') return !d.down;
  return true;
}

/* one hit lands (or is blocked): STUFFING, meter, stun, pause, events */
function land_hit(st, a, h, dir, special, at, kind) {
  const att = st.f[a], d = st.f[1 - a];
  if (canBlock(d, h.level)) {
    d.act = 'blockstun'; d.stun = h.blockstun; d.t = 0; d.vx = 0;
    d.hp = Math.max(1, d.hp - (h.chip || 0));
    d.pv = h.push * dir;
    // in the corner the attacker is pushed back instead
    if (Math.abs(d.x) > STAGE - 700 && sgn(d.x) === dir) att.pv -= tdiv(h.push * dir * 3, 4);
    att.meter = Math.min(MAX_METER, att.meter + tdiv(h.dmg * 2, 10));
    d.meter = Math.min(MAX_METER, d.meter + tdiv(h.dmg, 10));
    st.pause = Math.max(st.pause, Math.max(4, h.pause - 3));
    st.ev.push({ k: 'block', p: a, x: at[0], y: at[1], dmg: h.dmg, kind });
    return 'block';
  }
  // combos scale down; a special's hits (it's paid for) much less
  const scale = Math.max(special ? 80 : 40, 100 - 12 * d.combo);
  const dmg = Math.max(1, tdiv(h.dmg * scale, 100));
  d.hp = Math.max(0, d.hp - dmg);
  d.taken += dmg;
  d.combo++;
  if (!special) att.meter = Math.min(MAX_METER, att.meter + tdiv(dmg * 9, 10));
  d.meter = Math.min(MAX_METER, d.meter + tdiv(dmg * 35, 100));
  st.pause = Math.max(st.pause, h.pause);
  st.ev.push({ k: 'hit', p: a, x: at[0], y: at[1], dmg, kind, sp: special ? 1 : 0, kd: h.kd ? 1 : 0 });
  if (d.hp === 0) {
    d.act = 'ko'; d.t = 0; d.air = 1; d.vy = 150; d.vx = 55 * dir; d.pv = 0;
    if (!st.ko) st.ko = special ? 'special' : 'normal';
    return 'hit';
  }
  if (d.act === 'grabbed' && !h.kd) { d.t = 0; return 'hit'; }
  if (h.kd || d.air) {
    d.act = 'down'; d.t = 0; d.air = 1; d.vy = 140; d.vx = 48 * dir; d.stun = 0; d.pv = 0;
  } else {
    d.act = 'hitstun'; d.stun = h.hitstun; d.t = 0; d.vx = 0; d.pv = h.push * dir;
    if (Math.abs(d.x) > STAGE - 700 && sgn(d.x) === dir && !special) att.pv -= tdiv(h.push * dir * 3, 4);
  }
  return 'hit';
}

/* ── projectiles ───────────────────────────────────────────────────────────── */

const projBox = (p) => ({ x0: p.x - (p.w >> 1), x1: p.x + (p.w >> 1), y0: p.y - (p.h >> 1), y1: p.y + (p.h >> 1) });

function projectiles(st) {
  const keep = [];
  for (const p of st.proj) {
    p.t++; p.life--;
    p.x += p.vx; p.y += p.vy;
    if (p.dead) continue;
    // two opposing shots meet and cancel
    for (const q of st.proj) {
      if (q === p || q.o === p.o || q.dead) continue;
      if (overlap(projBox(p), projBox(q))) { p.dead = q.dead = 1; st.ev.push({ k: 'clash', x: (p.x + q.x) >> 1, y: (p.y + q.y) >> 1 }); }
    }
    if (p.dead) continue;
    const d = st.f[1 - p.o];
    const hb = hurtBox(d);
    if (hb && !invulnTo(d, false) && overlap(projBox(p), hb)) {
      land_hit(st, p.o, p, sgn(p.vx), !!p.sp, [p.x, p.y], p.sp ? 'special' : 'signature');
      continue;
    }
    // gone once it's off the screen: well past the one it was thrown at, or the walls
    if (p.life <= 0 || p.x < -STAGE - 1500 || p.x > STAGE + 1500 || (p.x - d.x) * sgn(p.vx) > OFFSCREEN) continue;
    keep.push(p);
  }
  st.proj = keep.filter((p) => !p.dead);
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
    if (a.hp === 0 || b.hp === 0) {
      st.phase = 'ko'; st.pt = 0;
      decide(st, a.hp === 0 && b.hp === 0 ? 2 : a.hp === 0 ? 1 : 0);
      // a Fluffatality: a special lands the match-ending K.O., 1 in 10 —
      // seen by both players, so rolled on the match's own PRNG
      const ends = st.rw !== 2 && st.wins[st.rw] >= 2 && st.wins[1 - st.rw] < 2;
      st.fluff = ends && st.ko === 'special' && rngInt(st, 10) === 0 ? 1 : 0;
      st.ev.push({ k: 'ko', w: st.rw, perfect: st.perfect, fluff: st.fluff });
    } else if (st.timer === 0) {
      st.phase = 'time'; st.pt = 0;
      const ra = tdiv(a.hp * 1000, FIGHTERS[a.id].health), rb = tdiv(b.hp * 1000, FIGHTERS[b.id].health);
      decide(st, ra > rb ? 0 : rb > ra ? 1 : 2);
      if (st.rw !== 2) { const l = st.f[1 - st.rw]; l.act = 'lose'; l.t = 0; l.vx = 0; }
      st.ev.push({ k: 'time', w: st.rw, perfect: st.perfect });
    }
    return;
  }
  if (st.phase === 'ko' || st.phase === 'time') {
    // the winner celebrates once he's back on his feet
    if (st.rw === 0 || st.rw === 1) {
      const w = st.f[st.rw];
      if (st.pt > 50 && !w.air && w.act !== 'win' && (GROUND_FREE[w.act] || w.act === 'blockstun' || w.act === 'hitstun')) { w.act = 'win'; w.t = 0; w.vx = 0; }
    }
    if (st.pt >= OUTRO) {
      const [w0, w1] = st.wins;
      if (w0 >= 2 || w1 >= 2) {
        st.phase = 'end'; st.pt = 0;
        st.winner = w0 >= 2 && w1 >= 2 ? 2 : w0 >= 2 ? 0 : 1;
        // visible to both players, so from the match's own PRNG
        st.egg = rngInt(st, 5) === 0 ? 1 : 0;
        st.ev.push({ k: 'end', w: st.winner, egg: st.egg, fluff: st.fluff });
      } else newRound(st);
    }
  }
}

/* a whole match from two input functions (tests, CPU vs CPU) */
export function run(st, inputs, maxTicks = 60 * 60 * 10) {
  for (let i = 0; i < maxTicks && st.phase !== 'end'; i++) {
    const [a, b] = inputs(st, i);
    stepInPlace(st, a, b);
  }
  return st;
}
