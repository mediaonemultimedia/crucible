/* The throws (render only): where the one being thrown is, and how he's
   turned, through every throw's hold — the forward throw and the
   over-the-shoulder (back) throw of every fighter — and where the thrower
   has hold of him.

   The sim decides everything that matters: who's grabbed, which way the
   throw goes (toward the open side of the stage), the toss at TOSS and the
   flight after it (sim.js). Between the grab and the toss the sim just holds
   the victim in front; this module is the picture of that hold. Each throw
   is a path for the victim's middle in the thrower's own fight frame
   (forward = the way he faces, up), a spin (the victim's top turned toward
   the thrower's front, radians), a grab point on the victim (where the
   hands, mouth, tentacles or racquet are), and an optional whole-body turn
   for the thrower himself (a suplex's arch, a bridge, a roll, a flip).
   Every path ends at the sim's release point — out on the thrown side,
   at the thrower's release height — so the flight takes over seamlessly.

   Size: the paths are in terms of the two plush (the hold distance, the
   victim's middle and top, the thrower's height), so a crow can roll a
   giraffe and a panda can belly-bump an octopus. A radial clamp keeps the
   two from sinking into each other further than a plush squish, and a floor
   clamp keeps a turned-over victim out of the mat.                       */

import { FIGHTERS, TOSS } from '../fighters/index.js';
import { throwOut } from '../sim/sim.js';

const U = 1000;
const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

/* each plush's shape for the throws, world units: its middle (the turn's
   pivot), its top, its half-width as seen, its body radius (for the clamp) */
export const SHAPE = {
  kevalanche: { mid: 1.5, top: 3.2, hw: 0.85, r: 0.85 },
  johnny: { mid: 1.5, top: 3.2, hw: 0.75, r: 0.72 },
  sumaura: { mid: 1.45, top: 3.15, hw: 0.95, r: 0.95 },
  k8e: { mid: 1.6, top: 4.7, hw: 0.8, r: 0.75 },
  rubberta: { mid: 1.1, top: 2.25, hw: 1.0, r: 0.9 },
  sebas: { mid: 1.5, top: 3.4, hw: 0.8, r: 0.78 },
  zach: { mid: 1.15, top: 2.4, hw: 0.65, r: 0.65 },
};

/* the throws. keys(c): [tick, forward, up, spin] for the victim's middle;
   grip(c): the grab point on him, [forward, up] from his middle at spin 0;
   acro(t): the thrower's own turn { a (his top toward his front), h (pivot
   height), y (lift) }; pose: what the victim's own puppet does while held;
   wob: the struggle (a shake while he's held, before the throw proper)    */
const T = TOSS;
const end = (c, s) => [T, s * c.D, c.rel + c.mid, 0];
const CH = {
  kevalanche: {
    // the hockey-fight jersey pull: the jersey yanked up over his head (arms
    // forced up, head ducked, smothered, flailing blind) — then flipped away
    f: {
      keys: (c) => [[0, c.D, c.mid, 0], [4, c.D - 0.2, c.mid + 0.05, -0.3], [9, c.D - 0.15, c.mid, -0.5], [15, c.D - 0.2, c.mid + 0.1, -0.4],
        [20, c.D - 0.35, c.mid + 0.55, -0.75], [24, c.D + 0.05, c.rel + c.mid + 0.7, 0.6], [T, c.D, c.rel + c.mid, 1.9]],
      grip: (c) => [0.05, c.up + 0.05], pose: 'smother', wob: [3, 19, 0.16],
      acro: (t) => ({ a: -0.22 * smooth(16, 21, t) * (1 - smooth(21, 25, t)) + 0.18 * smooth(22, 26, t) * (1 - smooth(30, 42, t)), h: 0.2, y: 0 }),
    },
    // the bear-hug suplex: hugged in, lifted, the back arched — over and behind
    b: {
      keys: (c) => [[0, c.D, c.mid, 0], [6, c.D - 0.4, c.mid + 0.1, -0.08], [12, c.D - 0.42, c.mid + 0.5, -0.15], [17, c.D - 0.7, c.mid + 1.2, -0.6],
        [21, 0.05, c.ht + 0.55 + c.r * 0.5, -1.55], [25, -c.D + 0.25, c.ht + 0.1, -2.5], [T, -c.D, c.rel + c.mid, -2.95]],
      grip: (c) => [-c.r * 0.55, 0.05], pose: 'hug', wob: [2, 10, 0.08],
      acro: (t) => ({ a: -0.75 * smooth(13, 23, t) * (1 - smooth(29, 42, t)), h: 0.25, y: 0 }),
    },
  },
  k8e: {
    // a dip of the long neck, the scruff in her mouth — a neck swing and a flick
    f: {
      keys: (c) => [[0, c.D, c.mid, 0], [6, c.D, c.mid + 0.15, -0.12], [12, c.D + 0.1, c.mid + 1.0, 0.05], [16, c.D + 0.05, c.mid + 1.15, -0.1],
        [22, c.D - 0.45, c.mid + 1.35, -0.5], [T, c.D, c.rel + c.mid, 1.35]],
      grip: (c) => [c.hw * 0.35, c.up * 0.78], pose: 'dangle', wob: [8, 20, 0.1],
    },
    // the catapult: the mouth grab, then right up and over her own back
    b: {
      keys: (c) => [[0, c.D, c.mid, 0], [6, c.D, c.mid + 0.2, -0.12], [12, c.D - 0.4, c.mid + 1.4, -0.1], [17, 0.35, c.ht + 0.2, -0.5],
        [22, -1.2, c.ht - 0.2, -1.5], [T, -c.D, c.rel + c.mid, -2.35]],
      grip: (c) => [c.hw * 0.35, c.up * 0.78], pose: 'dangle', wob: [7, 12, 0.08],
      acro: (t) => ({ a: -0.12 * smooth(14, 22, t) * (1 - smooth(28, 40, t)), h: 0.4, y: 0 }),
    },
  },
  zach: {
    // peck & toss: clamped in his wings, four big pecks, then hoisted and tossed
    f: {
      keys: (c) => [[0, c.D, c.mid, 0], [4, c.D + 0.08, c.mid, 0.16], [7, c.D - 0.06, c.mid, -0.05], [10, c.D + 0.08, c.mid, 0.18],
        [13, c.D - 0.06, c.mid, -0.05], [16, c.D + 0.1, c.mid + 0.05, 0.2], [21, c.D - 0.3, c.mid + 0.45, -0.3], [T, c.D, c.rel + c.mid, 1.25]],
      grip: (c) => [-c.hw * 0.6, 0.15], pose: 'flail', wob: [0, 0, 0],
      acro: (t) => ({ a: 0.12 * smooth(20, 25, t) * (1 - smooth(28, 40, t)) - 0.1 * smooth(16, 21, t) * (1 - smooth(21, 25, t)), h: 0.3, y: 0 }),
    },
    // the judo roll: in, ducked under, and one forward roll over his own
    // shoulder — the victim turned over the top and off behind (a tight arc)
    b: {
      keys: (c) => [[0, c.D, c.mid, 0], [8, c.D - 0.35, c.mid + 0.1, -0.35], [13, c.D - 0.6, c.mid + 0.45, -0.95], [18, 0.15, Math.max(2.35, c.r + 1.7), -1.9],
        [23, -c.D + 0.35, Math.max(1.9, c.mid + 0.6), -2.9], [T, -c.D, c.rel + c.mid, -3.5]],
      grip: (c) => [-c.hw * 0.55, 0.3], pose: 'flail', wob: [2, 8, 0.06],
      acro: (t) => { const p = smooth(12, 30, t); return { a: 0.55 * smooth(4, 12, t) * (1 - p) + TAU * p, h: 0.95, y: 0.35 * Math.sin(Math.PI * p) }; },
    },
  },
  sumaura: {
    // the belly bump: pulled into the belly, a rear back — and the big belly
    // thrust: he bounces off it
    f: {
      keys: (c) => [[0, c.D, c.mid, 0], [8, c.D - 0.3, c.mid, -0.05], [14, c.D - 0.28, c.mid + 0.05, 0], [19, c.D - 0.22, c.mid + 0.05, -0.12],
        [22, c.D - 0.38, c.mid, 0.02], [25, c.D - 0.05, c.rel + c.mid + 0.45, 0.45], [T, c.D, c.rel + c.mid, 0.85]],
      grip: (c) => [-c.hw * 0.75, 0.25], pose: 'flail', wob: [2, 12, 0.07],
      acro: (t) => ({ a: -0.3 * smooth(14, 20, t) * (1 - smooth(20, 23, t)) + 0.25 * smooth(20, 23, t) * (1 - smooth(27, 40, t)), h: 0.2, y: 0 }),
    },
    // uwatenage: the belt, chest to chest, and heaved over his hip behind him
    b: {
      keys: (c) => [[0, c.D, c.mid, 0], [8, c.D - 0.35, c.mid, -0.1], [14, c.D - 0.38, c.mid + 0.15, -0.2], [19, c.D - 0.5, c.mid + 0.85, -0.6],
        [23, -0.3, c.ht - 0.3 + c.r * 0.3, -1.7], [T, -c.D, c.rel + c.mid, -2.5]],
      grip: (c) => [-c.hw * 0.35, -0.3], pose: 'hug', wob: [2, 12, 0.06],
      acro: (t) => ({ a: 0.35 * smooth(18, 27, t) * (1 - smooth(30, 44, t)), h: 0.3, y: 0 }),
    },
  },
  sebas: {
    // the huracanrana: paws round his head, a hop and a backflip that
    // whips him over, heels over head and away
    f: {
      keys: (c) => [[0, c.D, c.mid, 0], [10, c.D - 0.1, c.mid, -0.15], [14, c.D - 0.1, c.mid - 0.05, -0.5], [19, c.D + 0.15, c.mid + 0.7, 0.8],
        [24, c.D + 0.25, c.rel + c.mid + 0.6, 2.3], [T, c.D, c.rel + c.mid, 3.0]],
      grip: (c) => [0, c.up * 0.7], pose: 'flail', wob: [2, 10, 0.06],
      acro: (t) => { const p = smooth(12, 26, t); return { a: -TAU * p, h: 1.4, y: 1.3 * Math.sin(Math.PI * p) }; },
    },
    // the German suplex: a waist lock, a lift and a bridge — over his head behind him
    b: {
      keys: (c) => [[0, c.D, c.mid, 0], [8, c.D - 0.4, c.mid + 0.05, 0], [13, c.D - 0.45, c.mid + 0.4, -0.15], [19, c.D - 0.65, c.mid + 1.35, -0.9],
        [23, -0.25, c.ht - 0.4 + c.r * 0.4, -2.0], [T, -c.D, c.rel + c.mid, -2.85]],
      grip: (c) => [-c.hw * 0.5, -0.1], pose: 'hug', wob: [2, 8, 0.06],
      acro: (t) => ({ a: -1.45 * smooth(14, 25, t) * (1 - smooth(32, 46, t)), h: 0.35, y: 0 }),
    },
  },
  rubberta: {
    // wrap & fling: wrapped up, hoisted high over her head, whipped forward
    f: {
      keys: (c) => [[0, c.D, c.mid, 0], [6, c.D - 0.2, c.mid + 0.1, 0], [12, c.D - 0.2, c.mid + 0.45, -0.1], [18, c.D - 0.6, c.mid + 1.4, -0.5],
        [23, c.D - 0.25, c.mid + 1.75, 0.3], [T, c.D, c.rel + c.mid, 1.5]],
      grip: () => [0, 0], pose: 'flail', wob: [2, 10, 0.07],
    },
    // the spin cycle: wrapped, swung right round her (one and a half turns,
    // past the camera), and flung out behind her
    b: {
      orbit: (t) => smooth(6, T, t) * 3 * Math.PI,
      // she turns with him (the same arms keep hold), and on round to face front again
      acro: (t) => ({ a: 0, h: 0, y: 0, yaw: smooth(6, T, t) * 3 * Math.PI + Math.PI * smooth(T, T + 16, t) }),
      keys: (c) => [[0, c.D, c.mid, 0], [6, c.D - 0.1, c.mid + 0.35, 0], [T, -c.D, c.rel + c.mid, -0.6]],
      grip: () => [0, 0], pose: 'flail', wob: [0, 0, 0],
    },
  },
  johnny: {
    // the racquet hook, the victim tossed up like a ball — and served away
    f: {
      keys: (c) => [[0, c.D, c.mid, 0], [6, c.D - 0.3, c.mid, -0.3], [11, c.D - 0.3, c.mid + 0.1, -0.35], [17, c.D - 0.2, c.mid + 1.45, -0.1],
        [21, c.D - 0.25, c.mid + 1.85, 0.0], [24.5, c.D - 0.15, c.mid + 1.55, 0.2], [T, c.D, c.rel + c.mid, 1.6]],
      grip: (c) => [c.hw * 0.2, c.up * 0.62], pose: 'flail', wob: [6, 11, 0.06],
    },
    // the backhand: hooked, loaded, swung over his shoulder (a low arc)
    b: {
      keys: (c) => [[0, c.D, c.mid, 0], [6, c.D - 0.3, c.mid, -0.3], [12, c.D - 0.22, c.mid + 0.15, -0.3], [18, c.D - 0.5, c.mid + 0.75, -0.85],
        [22, -0.2, c.ht - 0.35 + c.r * 0.3, -1.75], [T, -c.D, c.rel + c.mid, -2.6]],
      grip: (c) => [c.hw * 0.2, c.up * 0.55], pose: 'flail', wob: [6, 11, 0.06],
    },
  },
};

/* the numbers a throw's path is in: hold distance, the victim's middle,
   top above it and size, the thrower's height, the release height */
export function throwCtx(F, O) {
  const sv = SHAPE[O.id], st = SHAPE[F.id];
  const back = F.td && F.td !== F.face;
  return {
    D: throwOut(F, O) / U, mid: sv.mid, up: sv.top - sv.mid, hw: sv.hw, r: sv.r,
    ht: st.top, rt: st.r, rel: FIGHTERS[F.id].throwUp[back ? 1 : 0] / U, back,
  };
}

/* Catmull-Rom through the keys (in time), clamped at the ends */
function along(keys, t, j) {
  if (t <= keys[0][0]) return keys[0][j];
  const n = keys.length - 1;
  if (t >= keys[n][0]) return keys[n][j];
  let i = 0;
  while (i < n - 1 && t > keys[i + 1][0]) i++;
  const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(n, i + 2)];
  const u = (t - k1[0]) / (k2[0] - k1[0]);
  const m1 = (k2[j] - k0[j]) / Math.max(1e-6, k2[0] - k0[0]) * (k2[0] - k1[0]);
  const m2 = (k3[j] - k1[j]) / Math.max(1e-6, k3[0] - k1[0]) * (k2[0] - k1[0]);
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * k1[j] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * k2[j] + (u3 - u2) * m2;
}

/* rotate a fight-frame [forward, up] by the spin (top toward forward) */
export const turn = (v, a) => [v[0] * Math.cos(a) + v[1] * Math.sin(a), -v[0] * Math.sin(a) + v[1] * Math.cos(a)];

/* how far a turned plush reaches below its middle (for the floor clamp) */
export function reachDown(id, a) {
  const s = SHAPE[id];
  let lo = 0;
  for (const p of [[-s.hw, -s.mid], [s.hw, -s.mid], [-s.hw * 0.8, s.top - s.mid], [s.hw * 0.8, s.top - s.mid]]) lo = Math.min(lo, turn(p, a)[1]);
  return -lo;
}

/* the hold at time t (ticks since the grab, fractional): the victim's middle
   [forward, up] and depth z in the thrower's frame, his spin, the grab point,
   the thrower's own turn, the victim's pose */
export function carry(F, O, t) {
  const back = F.td && F.td !== F.face;
  const C = CH[F.id][back ? 'b' : 'f'], c = throwCtx(F, O);
  const keys = C.keys(c);
  let f = along(keys, t, 1), u = along(keys, t, 2), a = along(keys, t, 3), z = 0, yaw = 0;
  if (C.orbit) {
    // round her, past the camera: the angle from in front, the radius the hold's
    const ph = C.orbit(t), r = c.D + 0.15 * smooth(6, 12, t) * (1 - smooth(T - 4, T, t));
    f = Math.cos(ph) * r; z = Math.sin(ph) * r * 0.9; yaw = ph;
    u = mix(mix(c.mid, c.mid + 0.45, smooth(4, 10, t)), c.rel + c.mid, smooth(T - 4, T, t));
    a = -0.6 * smooth(T - 6, T, t);
  }
  // the struggle while held: a shake (blind flailing under a jersey, kicking)
  const [w0, w1, wa] = C.wob;
  if (wa && t > w0 && t < w1) {
    const e = smooth(w0, w0 + 2, t) * (1 - smooth(w1 - 2, w1, t));
    a += wa * e * Math.sin(t * 1.9); f += wa * 0.4 * e * Math.sin(t * 2.7 + 1);
  }
  // keep them apart: the thrower's body (his middle, turned with him) and the
  // victim's never closer than the two radii less a plush squish
  const ac = C.acro ? C.acro(t) : null;
  const ta = ac ? ac.a : 0, th = ac ? ac.h : 0;
  const tm = SHAPE[F.id].mid;
  const tc = [(tm - th) * Math.sin(ta), th + (tm - th) * Math.cos(ta) + (ac ? ac.y : 0)];
  const min = c.rt + c.r - 0.3;
  const dx = f - tc[0], dy = u - tc[1], dz = z, d = Math.hypot(dx, dy, dz);
  if (d < min && d > 1e-6 && t < T - 0.5) { const s = min / d; f = tc[0] + dx * s; u = tc[1] + dy * s; z = dz * s; }
  // and out of the mat
  u = Math.max(u, reachDown(O.id, a) + 0.03);
  const g = C.grip(c), G = turn(g, a);
  return { C: [f, u], z, a, yaw, G: [f + G[0], u + G[1]], acro: ac, pose: C.pose, back, c };
}

/* the thrower's own turn after the grab (through his recovery) */
export function throwerAcro(F, t) {
  const back = F.td && F.td !== F.face;
  const C = CH[F.id]?.[back ? 'b' : 'f'];
  return C && C.acro ? C.acro(t) : null;
}

/* the toss: the spin carried on through the flight to come down the right
   way up — the nearest whole turn on in the direction it was turning */
export function landSpin(F, O) {
  const back = F.td && F.td !== F.face;
  const C = CH[F.id][back ? 'b' : 'f'], keys = C.keys(throwCtx(F, O));
  const a = keys[keys.length - 1][3], v = a - keys[keys.length - 2][3];
  const dir = v >= 0 ? 1 : -1;
  const to = dir > 0 ? Math.ceil((a + 0.9) / TAU) * TAU : Math.floor((a - 0.9) / TAU) * TAU;
  return { from: a, to };
}

export const THROW_KEYS = CH;
