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
            nothing is drawn. No track has a 'drop' section now.
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

/* ── Laundry Day ─────────────────────────────────────────────────────────
   The basement laundry room, under one bare bulb and a buzzing tube. Start
   on the concrete by the washers heading east, up a cardboard ramp onto
   the folding table's conveyor of folded towels (it carries you: ride it
   and you're quicker), off its end in a jump, round the soap-sudsy corner
   by the water heater, then west along the far wall — the road bulges
   round the bank of machines, or take the SHORTCUT: straight through the
   gap and the open dryer drum, which tumbles you round once and spits you
   out with a kick. Up the west wall the detergent pods roll back and forth
   across the floor, then kick through the sock piles to the line.        */
export const LAUNDRY = {
  id: 'laundry',
  name: 'Laundry Day',
  laps: 3,
  start: [-100, 0, 71],
  points: [
    W(-140, 0, 60, { tag: 'floor', w: ROAD, m: 5 }),
    W(-112, 0, 70, { tag: 'floor', w: ROAD, m: 5 }),
    W(-80, 0, 72, { tag: 'floor', w: ROAD, m: 5 }),
    W(-56, 0, 72, { tag: 'floor', w: ROAD, m: 4, pad: 1 }),
    W(-38, 5, 72, { tag: 'ramp', w: ROAD, m: 1.5, edge: 'rail' }),
    W(-20, 10, 72, { tag: 'belt', w: ROAD, m: 1.2, edge: 'rail', belt: 9 }),
    W(16, 10, 72, { tag: 'belt', w: ROAD, m: 1.2, edge: 'rail', belt: 9 }),
    W(52, 10, 72, { tag: 'belt', w: ROAD, m: 1.2, edge: 'rail', belt: 9 }),
    W(74, 12, 72, { tag: 'belt', w: ROAD, m: 1.2, edge: 'rail', belt: 9, launch: 18 }),
    W(100, 0, 66, { tag: 'floor', w: ROAD, m: 5 }),
    W(124, 0, 44, { tag: 'floor', w: ROAD, m: 5 }),
    W(117, 0, 8, { tag: 'suds', w: ROAD, m: 5 }),
    W(130, 0, -21, { tag: 'floor', w: ROAD, m: 5, pad: 1 }),
    W(112, 0, -62, { tag: 'floor', w: ROAD, m: 5 }),
    W(84, 0, -80, { tag: 'floor', w: ROAD, m: 3 }),
    W(58, 0, -82, { tag: 'bulge', w: ROAD, m: 2 }),
    W(41, 0, -48, { tag: 'bulge', w: ROAD, m: 2 }),
    W(13, 0, -29, { tag: 'bulge', w: ROAD, m: 2 }),
    W(-21, 0, -43, { tag: 'bulge', w: ROAD, m: 2 }),
    W(-42, 0, -80, { tag: 'bulge', w: ROAD, m: 2 }),
    W(-72, 0, -86, { tag: 'floor', w: ROAD, m: 4 }),
    W(-104, 0, -82, { tag: 'floor', w: ROAD, m: 4 }),
    W(-128, 0, -62, { tag: 'pods', w: ROAD, m: 3 }),
    W(-140, 0, -30, { tag: 'pods', w: ROAD, m: 3 }),
    W(-146, 0, 0, { tag: 'socks', w: ROAD, m: 4 }),
    W(-148, 0, 30, { tag: 'socks', w: ROAD, m: 4 }),
  ],
  /* the shortcut: a corridor (from, to, half-width) through the gap in the
     machines, the dryer drum on it (its span, as fractions of the corridor) */
  cut: { from: [80, -84.5], to: [-58, -85.5], w: 4.6, drum: [0.42, 0.6] },
  patches: [
    { x: 118, z: 8, r: 6, kind: 'suds' },
    { x: 120, z: -46, r: 4, kind: 'suds' },
    { x: -90, z: -84, r: 4.5, kind: 'fluff' },
  ],
  posts: [
    { x: 112, z: 38, r: 2.4, kind: 'bottle' }, { x: -96, z: 66, r: 2.2, kind: 'bottle' },
  ],
  /* detergent pods rolling back and forth across the road: where, how far
     across (× the half-width), the period (ticks) and phase */
  pods: [
    { at: [-130, -56], amp: 0.85, period: 170, phase: 0, r: 2.0 },
    { at: [-137, -38], amp: 0.85, period: 136, phase: 2.1, r: 2.0 },
    { at: [-142, -18], amp: 0.85, period: 190, phase: 4.2, r: 2.0 },
  ],
  /* sock piles: kick through them (a little slower, socks everywhere) */
  piles: [
    { x: -147, z: 8, r: 3.2 }, { x: -142, z: 18, r: 2.8 }, { x: -151, z: 22, r: 2.8 }, { x: -146, z: 36, r: 3.2 },
  ],
  boxes: [0.04, 0.19, 0.34, 0.46, 0.6, 0.72, 0.87],
  mapHigh: [5, 30],
  music: 'laundry',
};

/* ── Sprinkler Park ──────────────────────────────────────────────────────
   The back garden at golden hour, at plush scale: the lawn is a meadow,
   the hose a log. Start on the lawn heading east past the first
   sprinkler, over the garden-hose jump, across the patio pavers, through
   the kiddie pool's splash zone (wet: slow), up the plank ramp onto the
   treehouse deck round the old oak, off its end in a big jump, and back
   along the west lawn past the sprinklers — when one's on, its jet knocks
   you sideways.                                                          */
export const PARK = {
  id: 'park',
  name: 'Sprinkler Park',
  laps: 3,
  start: [-74, 0, 63],
  points: [
    W(-112, 0, 50, { tag: 'lawn', w: ROAD, m: 5 }),
    W(-82, 0, 62, { tag: 'lawn', w: ROAD, m: 5 }),
    W(-48, 0, 66, { tag: 'lawn', w: ROAD, m: 5 }),
    W(-14, 0, 63, { tag: 'lawn', w: ROAD, m: 5 }),
    W(0, 1.5, 62, { tag: 'hose', w: ROAD, m: 4 }),
    W(14, 4.2, 54, { tag: 'hose', w: ROAD, m: 4, launch: 15 }),
    W(40, 0, 42, { tag: 'lawn', w: ROAD, m: 5 }),
    W(62, 0, 22, { tag: 'patio', w: ROAD, m: 2, pad: 1 }),
    W(53, 0, 9, { tag: 'patio', w: ROAD, m: 2 }),
    W(70, 0, -4, { tag: 'patio', w: ROAD, m: 2 }),
    W(64, 0, -28, { tag: 'pool', w: ROAD, m: 3 }),
    W(46, 0, -46, { tag: 'lawn', w: ROAD, m: 4 }),
    W(22, 0, -56, { tag: 'lawn', w: ROAD, m: 3 }),
    W(4, 3.5, -60, { tag: 'ramp', w: ROAD, m: 1.2, edge: 'rail' }),
    W(-14, 9, -60, { tag: 'ramp', w: ROAD, m: 1.2, edge: 'rail' }),
    W(-32, 15, -55, { tag: 'deck', w: ROAD, m: 1.2, edge: 'rail' }),
    W(-46, 16, -44, { tag: 'deck', w: ROAD, m: 1.2, edge: 'rail', launch: 18 }),
    W(-62, 0, -26, { tag: 'lawn', w: ROAD, m: 5 }),
    W(-84, 0, -8, { tag: 'lawn', w: ROAD, m: 5 }),
    W(-102, 0, 14, { tag: 'lawn', w: ROAD, m: 5, pad: 1 }),
    W(-114, 0, 34, { tag: 'lawn', w: ROAD, m: 5 }),
  ],
  patches: [
    { x: 63, z: -29, r: 10, kind: 'pool' },
    { x: -30, z: 70, r: 3.6, kind: 'mulch' },
    { x: 54, z: 34, r: 3.6, kind: 'mulch' },
  ],
  posts: [
    { x: 30, z: 52, r: 1.6, kind: 'gnome' }, { x: -96, z: 2, r: 1.6, kind: 'flamingo' },
  ],
  /* lawn sprinklers: where, the jet's reach (world units), on for `dur` of every `period` ticks */
  sprinklers: [
    { x: -28, z: 70, reach: 22, period: 170, dur: 75, phase: 0 },
    { x: 34, z: -54, reach: 20, period: 150, dur: 64, phase: 60 },
    { x: -86, z: -18, reach: 22, period: 180, dur: 80, phase: 110 },
    { x: -112, z: 22, reach: 20, period: 140, dur: 60, phase: 30 },
  ],
  boxes: [0.05, 0.23, 0.37, 0.52, 0.73, 0.88],
  mapHigh: [4, 16],
  music: 'park',
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
export const TRACKS = { landing: scaled(LANDING, 1.9, 1.25), laundry: scaled(LAUNDRY, 1.78, 1.0), park: scaled(PARK, 2.9, 1.6) };
/* the Pillow Cup: three races, points for every place */
export const CUP = ['landing', 'laundry', 'park'];

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
  return { ax, az, bx, bz, len, ux, uz, w: c.w, m0, m1, d0: len * c.drum[0], d1: len * c.drum[1], kA: locateGlobal(T, ax, az), kB: locateGlobal(T, bx, bz) };
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
