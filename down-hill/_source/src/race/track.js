/* A track: a closed centripetal Catmull-Rom spline through hand-placed
   waypoints, sampled every STEP units into the arrays the sim, the CPUs and
   the renderer all read. Each waypoint carries its section's look and rules:

     w      half-width of the driving surface (the guide lines sit here)
     m      the margin of off-track fluff beyond it, before the edge
     edge   what the edge is: 'wall' (an invisible barrier, only where the
            room has none of its own), 'rail' (a drawn rail or bumper: SOLID,
            it scrapes you and slows you, the renderer draws it), 'drop'
            (visibly no barrier: fall off and the sock fishes you back),
            'solid' (a real wall the renderer draws).
            Stage 3 rule: every drawn barrier is solid; a drop is only where
            the Rapids course deliberately leaves its yellow-edged flume open.
     tag    the section's name (the HUD, the shots, the CPU's caution)
     launch upward kick (units/s) given as a grounded kart crosses it
     pad    a feather-burst boost pad here
     ceil   a ceiling (under the bed): no flying up into the slats

   Pure data and maths: no three.js, no DOM, so node --test reads it.     */

export const STEP = 1;            // one sample per world unit of centreline

/* ── The Landing ─────────────────────────────────────────────────────────
   A kid's bedroom (x −80…70) and the upstairs landing beyond its east wall
   (x 70…230), at plush scale: the mattress top is 16 units up, the under-
   bed gap 9, the banister's rail 12. Start on the duvet heading south,
   off the foot of the bed onto the book-stack ramp, round the rug, under
   the bed west → east, out the near doorway onto the landing, up the toy
   plank onto the banister rail round the stairwell, down into the open
   sock drawer (rolled socks to slalom), back through the far doorway, and
   the pillow pile bounces you up onto the bed for the line.               */
/* Stage 5 (Kevin: "the track should always be the same width, roughly …
   never super skinny"): one road, everywhere, on every track: half-width
   ROAD; only the margins (m) vary with the scenery. */
export const ROAD = 10.5;
const W = (x, y, z, o = {}) => ({ x, y, z, w: ROAD, m: 5, edge: 'wall', tag: '', ...o });
export const LANDING = {
  id: 'landing',
  name: 'The Landing',
  laps: 3,
  start: [-10, 16, -14],
  bedTop: 16,
  points: [
    W(-10, 16, -36, { tag: 'duvet', w: ROAD, m: 6 }),
    W(-10, 16, -14, { tag: 'duvet', w: ROAD, m: 6 }),
    W(-10, 16, 4, { tag: 'duvet', w: ROAD, m: 6, launch: 7 }),
    W(-10, 10.5, 21, { tag: 'books', w: ROAD, m: 2, edge: 'wall' }),
    W(-11, 1.5, 33, { tag: 'books', w: ROAD, m: 3 }),
    W(-22, 0, 45, { tag: 'rug', w: ROAD, m: 6 }),
    W(-46, 0, 48, { tag: 'rug', w: ROAD, m: 6, pad: 1 }),
    W(-64, 0, 30, { tag: 'rug', w: ROAD, m: 5 }),
    W(-64, 0, 2, { tag: 'rug', w: ROAD, m: 5, pad: 1 }),
    W(-54, 0, -20, { tag: 'rug', w: ROAD, m: 4 }),
    W(-36, 0, -27, { tag: 'underbed', w: ROAD, m: 2.5, ceil: 8.6 }),
    W(-12, 0, -24, { tag: 'underbed', w: ROAD, m: 2.5, ceil: 8.6 }),
    W(10, 0, -28, { tag: 'underbed', w: ROAD, m: 2.5, ceil: 8.6 }),
    W(30, 0, -20, { tag: 'rug', w: ROAD, m: 4 }),
    W(44, 0, -2, { tag: 'rug', w: ROAD, m: 4 }),
    W(60, 0, 12, { tag: 'door', w: ROAD, m: 2.5 }),
    W(82, 0, 20, { tag: 'landing', w: ROAD, m: 5 }),
    W(96, 3, 34, { tag: 'plank', w: ROAD, m: 1.5, edge: 'rail' }),
    W(110, 12, 46, { tag: 'banister', w: ROAD, m: 1.5, edge: 'rail' }),
    W(140, 12, 54, { tag: 'banister', w: ROAD, m: 1.5, edge: 'rail', pad: 1 }),
    W(172, 12, 52, { tag: 'banister', w: ROAD, m: 1.5, edge: 'rail' }),
    W(194, 12, 36, { tag: 'banister', w: ROAD, m: 1.5, edge: 'rail' }),
    W(200, 12, 12, { tag: 'banister', w: ROAD, m: 1.5, edge: 'rail' }),
    W(196, 5.5, -10, { tag: 'plank', w: ROAD, m: 1.5, edge: 'rail', launch: 13 }),
    W(180, 0, -26, { tag: 'landing', w: ROAD, m: 5 }),
    W(156, 0, -38, { tag: 'landing', w: ROAD, m: 3 }),
    W(140, 2.5, -40, { tag: 'drawer', w: ROAD, m: 1.5 }),
    W(124, 2.5, -40, { tag: 'drawer', w: ROAD, m: 1.5 }),
    W(108, 2.5, -40, { tag: 'drawer', w: ROAD, m: 1.5 }),
    W(92, 0, -44, { tag: 'landing', w: ROAD, m: 4 }),
    W(68, 0, -46, { tag: 'door', w: ROAD, m: 2.5 }),
    W(52, 0, -46, { tag: 'pillows', w: ROAD, m: 2.5, pad: 1 }),
    W(38, 8, -46, { tag: 'pillows', w: ROAD, m: 1.5, edge: 'rail' }),
    W(25, 16, -46, { tag: 'pillows', w: ROAD, m: 1.5, edge: 'rail', launch: 12 }),
    W(8, 16, -50, { tag: 'duvet', w: ROAD, m: 6 }),
    W(-8, 16, -46, { tag: 'duvet', w: ROAD, m: 6 }),
  ],
  /* the slow patches on the driving line (circles: x, z, r, kind) */
  patches: [
    { x: -30, z: 48, r: 5, kind: 'cereal' },
    { x: -66, z: 14, r: 5, kind: 'fluff' },
    { x: 86, z: 14, r: 5, kind: 'cereal' },
    { x: 170, z: -32, r: 5.5, kind: 'fluff' },
  ],
  /* rolled-sock posts in the drawer and dust bunnies under the bed: round
     obstacles (x, z, r) you bump off */
  posts: [
    { x: 136, z: -44, r: 2, kind: 'sock' }, { x: 128, z: -35, r: 2, kind: 'sock' },
    { x: 120, z: -45, r: 2, kind: 'sock' }, { x: 112, z: -35, r: 2, kind: 'sock' },
    { x: -26, z: -30, r: 1.7, kind: 'bunny' }, { x: 0, z: -21, r: 1.7, kind: 'bunny' },
  ],
  /* item-box rows: along-track fraction (of the lap) */
  boxes: [0.08, 0.235, 0.39, 0.55, 0.71, 0.865],
};

/* The advanced courses keep their original IDs for race links and Cup order. */
const route = (tag, x, y, z, options) => W(x, y, z, { tag, edge: 'rail', m: 2, ...options });
const court = (...p) => route('court', ...p);
const ice = (...p) => route('ice', ...p);
const boardwalk = (...p) => route('boardwalk', ...p);
const flume = (...p) => route('flume', ...p);
export const WET_RUNOFF_EDGE = 0.28; // fraction of road half-width at the puddle's dry edge

export const CENTRE_COURT = {
  id: 'laundry',
  name: 'Johnny Deuce’s Centre Court',
  laps: 3,
  start: [-150, 0, 108],
  points: [
    court(-185, 0, 108), court(-113, 0, 108, { pad: 1 }),
    court(-65, 7, 75), court(-37, 20, 38), court(0, 30, 0),
    court(49, 33, -47), court(102, 30, -82), court(153, 20, -99, { launch: 16 }),
    court(206, 0, -109), court(232, 0, -76), court(204, 0, -45),
    court(147, 0, -48), court(102, 0, -22),
    court(62, 0, 5), court(0, 0, 5), court(-68, 0, -3), court(-119, 0, -52),
    court(-165, 0, -71), court(-207, 0, -48), court(-210, 0, 1),
    court(-169, 0, 36), court(-117, 7, 35), court(-91, 17, 6),
    court(-105, 22, -24), court(-145, 23, -19), court(-164, 24, 13),
    court(-201, 22, 51), court(-224, 11, 83),
  ],
  patches: [], posts: [],
  boxes: [0.05, 0.18, 0.33, 0.48, 0.64, 0.79, 0.9],
  mapHigh: [4, 36],
  music: 'laundry',
};

export const RUBBERTA_RAPIDS = {
  id: 'park',
  name: 'Rubberta’s Rapids',
  laps: 3,
  start: [-158, 0, 142],
  points: [
    boardwalk(-200, 0, 140), boardwalk(-126, 0, 143, { pad: 1 }),
    boardwalk(-75, 9, 114), boardwalk(-53, 23, 73),
    boardwalk(-13, 42, 35), boardwalk(26, 59, -13),
    boardwalk(32, 69, -68), boardwalk(75, 78, -121),
    flume(139, 79, -137), flume(193, 70, -100),
    flume(197, 57, -42), flume(148, 43, -5),
    flume(97, 30, -24), flume(57, 19, -53), flume(5, 13, -54),
    flume(-37, 8, -26, { edge: 'drop' }), flume(-34, 5, 24),
    flume(13, 5, 61), flume(75, 7, 62, { launch: 15 }),
    route('runoff', 129, 0, 59), boardwalk(180, 0, 80), boardwalk(173, 1.4, 124, { launch: 9 }),
    boardwalk(116, 0, 148), boardwalk(57, 0, 130),
    boardwalk(3, 0, 132), boardwalk(-42, 0, 175),
    boardwalk(-110, 0, 191), boardwalk(-183, 0, 187),
    boardwalk(-226, 0, 177),
  ],
  cut: { from: [143, 61], to: [116, 148], w: 3.4, drum: [0, 0], tight: true },
  patches: [],
  posts: [
    { x: 178, z: 88, r: 2.2, kind: 'buoy' },
    { x: 182, z: 111, r: 2.2, kind: 'buoy' },
    { x: 160, z: 135, r: 2.2, kind: 'buoy' },
  ],
  boxes: [0.06, 0.19, 0.32, 0.46, 0.62, 0.75, 0.91],
  mapHigh: [6, 78],
  music: 'park',
};

export const HOCKEY = {
  id: 'hockey',
  name: 'Overtime at Rink 88',
  laps: 3,
  start: [-139, 0, 104],
  points: [
    ice(-181, 0, 104), ice(-99, 0, 104, { pad: 1 }),
    ice(-73, 1, 63), ice(-107, 5, 20), ice(-163, 8, -18),
    ice(-158, 17, -74), ice(-99, 27, -107), ice(-16, 31, -95),
    ice(43, 33, -48), ice(55, 32, 13), ice(27, 27, 66),
    ice(72, 21, 104, { launch: 14 }), ice(140, 0, 109),
    ice(196, 0, 72), ice(204, 0, 14), ice(169, 0, -29),
    ice(110, 0, -18), ice(54, 0, 3), ice(-16, 0, 8),
    ice(-75, 0, -25), ice(-118, 0, -63), ice(-173, 0, -89),
    ice(-223, 0, -51), ice(-238, 0, 15), ice(-224, 0, 70),
  ],
  patches: [], posts: [],
  boxes: [0.06, 0.19, 0.33, 0.46, 0.6, 0.76, 0.9],
  mapHigh: [4, 34],
  music: 'laundry',
};

const dojo = (...p) => route('dojo', ...p);
export const DOJO = {
  id: 'dojo',
  name: 'Sumaura’s Midnight Dojo',
  laps: 3,
  start: [-130, 0, 145],
  points: [
    dojo(-180, 0, 145), dojo(-96, 0, 145, { pad: 1 }),
    dojo(-40, 0, 122), dojo(-3, 4, 75), dojo(31, 18, 38),
    dojo(78, 30, 26), dojo(139, 35, 33), dojo(189, 27, 6),
    dojo(197, 18, -42, { launch: 15 }), dojo(167, 0, -93),
    dojo(119, 0, -116), dojo(73, 0, -81), dojo(67, 0, -21),
    dojo(84, 0, 41), dojo(61, 0, 91), dojo(112, 6, 121),
    dojo(172, 10, 133), dojo(224, 16, 103), dojo(244, 26, 52),
    dojo(243, 33, -12), dojo(207, 37, -77), dojo(153, 42, -130),
    dojo(69, 42, -145), dojo(-16, 31, -125), dojo(-77, 13, -93),
    dojo(-124, 0, -98), dojo(-174, 0, -124), dojo(-223, 0, -86),
    dojo(-217, 0, -35), dojo(-164, 0, -9), dojo(-136, 0, 32),
    dojo(-175, 0, 67), dojo(-224, 0, 83), dojo(-232, 0, 123),
  ],
  patches: [], posts: [],
  boxes: [0.05, 0.19, 0.34, 0.5, 0.65, 0.82, 0.92],
  cut: { from: [-164, -9], to: [-175, 67], w: 4.4, drum: [0, 0], tight: true, gated: true },
  mapHigh: [5, 42],
  music: 'race',
};

/* the room was laid out in a compact sketch; the race runs it 1.9× wider
   and 1.25× taller (a lap of ~55 s at racing speed) */
function scaled(def, sxz, sy) {
  const P = (p) => ({ ...p, x: p.x * sxz, z: p.z * sxz });
  return {
    ...def,
    scale: { xz: sxz, y: sy },
    start: [def.start[0] * sxz, def.start[1] * sy, def.start[2] * sxz],
    points: def.points.map((p) => ({ ...P(p), y: p.y * sy, ceil: p.ceil ? p.ceil * sy : 0 })),
    patches: def.patches.map((p) => ({ ...P(p), r: p.r * 1.3 })),
    posts: def.posts.map(P),
    cut: def.cut ? { ...def.cut, from: [def.cut.from[0] * sxz, def.cut.from[1] * sxz], to: [def.cut.to[0] * sxz, def.cut.to[1] * sxz] } : null,
    pods: (def.pods || []).map((p) => ({ ...p, at: [p.at[0] * sxz, p.at[1] * sxz] })),
    piles: (def.piles || []).map((p) => ({ ...P(p), r: p.r * 1.3 })),
    sprinklers: (def.sprinklers || []).map(P),
  };
}
export const TRACKS = { landing: scaled(LANDING, 1.9, 1.25), laundry: scaled(CENTRE_COURT, 1, 1), hockey: scaled(HOCKEY, 1, 1), park: scaled(RUBBERTA_RAPIDS, 1, 1), dojo: scaled(DOJO, 1, 1) };
/* the Pillow Cup: five races, points for every place */
export const CUP = ['landing', 'laundry', 'hockey', 'park', 'dojo'];

/* ── sampling ─────────────────────────────────────────────────────────── */
function cr(p0, p1, p2, p3, t) {
  // centripetal Catmull-Rom (alpha 0.5) on xyz
  const d = (a, b) => Math.max(1e-4, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) ** 0.5);
  const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
  const u = t1 + (t2 - t1) * t;
  const out = {};
  for (const k of ['x', 'y', 'z']) {
    const A1 = ((t1 - u) * p0[k] + (u - t0) * p1[k]) / (t1 - t0);
    const A2 = ((t2 - u) * p1[k] + (u - t1) * p2[k]) / (t2 - t1);
    const A3 = ((t3 - u) * p2[k] + (u - t2) * p3[k]) / (t3 - t2);
    const B1 = ((t2 - u) * A1 + (u - t0) * A2) / (t2 - t0);
    const B2 = ((t3 - u) * A2 + (u - t1) * A3) / (t3 - t1);
    out[k] = ((t2 - u) * B1 + (u - t1) * B2) / (t2 - t1);
  }
  return out;
}

export function buildTrack(def) {
  const P = def.points, n = P.length;
  // dense polyline first, then resampled at even arc length
  const dense = [];
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    const segs = 60;
    for (let s = 0; s < segs; s++) {
      const q = cr(p0, p1, p2, p3, s / segs);
      const t = s / segs, e = t * t * (3 - 2 * t);
      // section values: widths blend smoothly, flags belong to the nearer end
      dense.push({ ...q, w: p1.w + (p2.w - p1.w) * e, m: p1.m + (p2.m - p1.m) * e, from: i, t });
    }
  }
  let L = 0;
  const acc = [0];
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1], b = dense[i % dense.length];
    L += Math.hypot(b.x - a.x, b.z - a.z, (b.y - a.y) * 0.3);
    acc.push(L);
  }
  const N = Math.round(L / STEP);
  const T = {
    def, N, length: L, step: L / N,
    x: new Float32Array(N), y: new Float32Array(N), z: new Float32Array(N),
    tx: new Float32Array(N), tz: new Float32Array(N),      // horizontal tangent (unit)
    w: new Float32Array(N), m: new Float32Array(N),
    curv: new Float32Array(N),                           // signed turn per unit (+ = left)
    line: new Float32Array(N),                           // the racing line's lateral offset
    sec: new Uint8Array(N),                              // index into def.points (the section)
    drop: new Uint8Array(N), rail: new Uint8Array(N), ceil: new Float32Array(N), pad: new Uint8Array(N), launch: new Float32Array(N),
    belt: new Float32Array(N),                           // a conveyor's speed along the track
  };
  let j = 0;
  for (let k = 0; k < N; k++) {
    const s = k * T.step;
    while (acc[j + 1] < s) j++;
    const a = dense[j], b = dense[(j + 1) % dense.length];
    const f = (s - acc[j]) / Math.max(1e-6, acc[j + 1] - acc[j]);
    T.x[k] = a.x + (b.x - a.x) * f; T.y[k] = a.y + (b.y - a.y) * f; T.z[k] = a.z + (b.z - a.z) * f;
    // The rooms and lawn all have a ground plane at zero.
    // Spline overshoot on the approach to a ramp must stay above it.
    T.y[k] = Math.max(0, T.y[k]);
    T.w[k] = a.w + (b.w - a.w) * f; T.m[k] = a.m + (b.m - a.m) * f;
    const sec = a.t < 0.5 ? a.from : (a.from + 1) % n;
    T.sec[k] = sec;
    const S = P[sec], Sa = P[a.from];
    T.drop[k] = S.edge === 'drop' || Sa.edge === 'drop' ? 1 : 0;
    T.rail[k] = !T.drop[k] && (S.edge === 'rail' || Sa.edge === 'rail' || S.edge === 'solid' || Sa.edge === 'solid') ? 1 : 0;
    T.ceil[k] = Sa.ceil && (P[(a.from + 1) % n].ceil || a.t < 0.5) ? Sa.ceil : 0;
    T.belt[k] = Sa.belt && P[(a.from + 1) % n].belt ? Sa.belt : 0;
  }
  // flags that happen at a point: launches and pads on the sample nearest the waypoint
  for (let i = 0; i < n; i++) {
    const p = P[i];
    let best = 0, bd = 1e9;
    for (let k = 0; k < N; k++) { const d = Math.hypot(T.x[k] - p.x, T.z[k] - p.z, T.y[k] - p.y); if (d < bd) { bd = d; best = k; } }
    if (p.launch) T.launch[best] = p.launch;
    if (p.pad) for (let q = -1; q <= 1; q++) T.pad[(best + q + N) % N] = 1;
  }
  for (let k = 0; k < N; k++) {
    const a = (k - 1 + N) % N, b = (k + 1) % N;
    let dx = T.x[b] - T.x[a], dz = T.z[b] - T.z[a];
    const l = Math.hypot(dx, dz) || 1;
    T.tx[k] = dx / l; T.tz[k] = dz / l;
  }
  for (let k = 0; k < N; k++) {
    const a = (k - 3 + N) % N, b = (k + 3) % N;
    const ha = Math.atan2(T.tx[a], T.tz[a]), hb = Math.atan2(T.tx[b], T.tz[b]);
    T.curv[k] = Math.atan2(Math.sin(hb - ha), Math.cos(hb - ha)) / (6 * T.step);
  }
  // the racing line: hug the inside of the bends ahead (smoothed curvature)
  const sm = new Float32Array(N);
  for (let k = 0; k < N; k++) { let c = 0; for (let q = -14; q <= 14; q++) c += T.curv[(k + q + N) % N]; sm[k] = c / 29; }
  for (let k = 0; k < N; k++) {
    // +curv = turning left; right vector points to −left → the inside of a left turn is −d
    const want = -Math.max(-1, Math.min(1, sm[k] * 22)) * T.w[k] * 0.6;
    T.line[k] = want;
  }
  for (let pass = 0; pass < 3; pass++) {
    const c = T.line.slice();
    for (let k = 0; k < N; k++) { let s = 0; for (let q = -6; q <= 6; q++) s += c[(k + q + N) % N]; T.line[k] = s / 13; }
  }
  T.cut = def.cut ? buildCut(T, def.cut) : null;
  T.pods = (def.pods || []).map((p) => ({ ...p, k: locateGlobal(T, p.at[0], p.at[1]) }));
  return T;
}

/* the shortcut corridor: a straight from `from` to `to`, its ends overlapping
   the road; m0…m1 is the part off the road (walled), d0…d1 the dryer drum,
   kA / kB the road samples at its mouth and its exit */
function buildCut(T, c) {
  const [ax, az] = c.from, [bx, bz] = c.to;
  const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
  let m0 = len, m1 = 0;
  for (let s = 0; s <= len; s += 1) {
    const x = ax + ux * s, z = az + uz * s, k = locateGlobal(T, x, z);
    const off = Math.abs(lateral(T, k, x, z)) > T.w[k] + T.m[k] - 1;
    if (off) { m0 = Math.min(m0, s); m1 = Math.max(m1, s); }
  }
  return { ax, az, bx, bz, len, ux, uz, w: c.w, tight: c.tight, gated: c.gated, m0, m1, d0: len * c.drum[0], d1: len * c.drum[1], kA: locateGlobal(T, ax, az), kB: locateGlobal(T, bx, bz) };
}
/* a detergent pod's place at a tick (pure: the sim and the renderer agree) */
export function podPos(T, P, tick) {
  const k = P.k, d = Math.sin((tick / P.period) * Math.PI * 2 + P.phase) * P.amp * T.w[k];
  return { x: T.x[k] + rightX(T, k) * d, z: T.z[k] + rightZ(T, k) * d, y: T.y[k], spin: Math.cos((tick / P.period) * Math.PI * 2 + P.phase) };
}
/* a sprinkler is spraying at this tick */
export const sprinklerOn = (S, tick) => ((tick + S.phase) % S.period) < S.dur;

/* the right-hand vector at sample k (horizontal): tangent × up */
export const rightX = (T, k) => -T.tz[k];
export const rightZ = (T, k) => T.tx[k];

/* nearest sample to (x, z) searched around a hint (a kart's own index).
   With a height y it is layer-aware: samples near the hint (the same piece
   of road, however steep) are found by xz alone, but a sample further away
   whose road is well above the kart (it can't be under its own road) or far
   below it (the under-bed, beneath the duvet) is pushed away, so a kart in
   the air never snaps to another layer of the track. */
export function locate(T, x, z, hint, span = 24, y = null) {
  const N = T.N;
  let best = hint, bd = 1e18;
  for (let q = -span; q <= span; q++) {
    const k = (hint + q + N) % N;
    const dx = x - T.x[k], dz = z - T.z[k];
    let d = dx * dx + dz * dz;
    if (y !== null && (q > 8 || q < -8)) {
      const dy = y - T.y[k], e = dy < -2.5 ? -dy - 2.5 : dy > 11 ? dy - 11 : 0;
      d += e * e * 30;
    }
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}
export function locateGlobal(T, x, z, y = null) {
  return locate(T, x, z, 0, Math.ceil(T.N / 2) + 1, y);
}

export function lateral(T, k, x, z) {
  return (x - T.x[k]) * rightX(T, k) + (z - T.z[k]) * rightZ(T, k);
}
export function along(T, k, x, z) {
  return (x - T.x[k]) * T.tx[k] + (z - T.z[k]) * T.tz[k];
}

/* the ground height under (k, d): the centreline's own height, and in the
   'drop' sections nothing beyond the edge (−Infinity) */
export function groundAt(T, k, d, a = 0) {
  const N = T.N, k2 = a >= 0 ? (k + 1) % N : (k - 1 + N) % N;
  const f = Math.min(1, Math.abs(a) / T.step);
  const y = T.y[k] + (T.y[k2] - T.y[k]) * f;
  if (T.drop[k] && Math.abs(d) > T.w[k] + T.m[k]) return -Infinity;
  return y;
}

/* Conservative clearance for stationary scenery. Test its oriented footprint
   against the full road, including shoulders and the kart's own height. */
export function sceneryClearsRoad(T, x, z, halfX, halfZ, yaw = 0, bottom = 0, top = Infinity) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  for (let k = 0; k < T.N; k++) {
    if (T.y[k] > top || T.y[k] + 3.5 < bottom) continue;
    const dx = T.x[k] - x, dz = T.z[k] - z;
    const rx = Math.max(0, Math.abs(c * dx - s * dz) - halfX);
    const rz = Math.max(0, Math.abs(s * dx + c * dz) - halfZ);
    if (Math.hypot(rx, rz) < T.w[k] + T.m[k] + 1.5) return false;
  }
  return true;
}

/* arc length of sample k */
export const sOf = (T, k) => k * T.step;
