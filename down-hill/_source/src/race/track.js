/* A track: a closed centripetal Catmull-Rom spline through hand-placed
   waypoints, sampled every STEP units into the arrays the sim, the CPUs and
   the renderer all read. Each waypoint carries its section's look and rules:

     w      half-width of the driving surface (the guide lines sit here)
     m      the margin of off-track fluff beyond it, before the edge
     edge   what the edge is: 'wall' (an invisible barrier, only where the
            room has none of its own), 'drop' (fall off: the sock fishes you
            back), 'solid' (a real wall the renderer draws)
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
const W = (x, y, z, o = {}) => ({ x, y, z, w: 9, m: 5, edge: 'wall', tag: '', ...o });
export const LANDING = {
  id: 'landing',
  name: 'The Landing',
  laps: 3,
  start: [-10, 16, -14],
  bedTop: 16,
  points: [
    W(-10, 16, -36, { tag: 'duvet', w: 10, m: 6 }),
    W(-10, 16, -14, { tag: 'duvet', w: 10, m: 6 }),
    W(-10, 16, 4, { tag: 'duvet', w: 10, m: 6, launch: 7 }),
    W(-10, 10.5, 21, { tag: 'books', w: 9, m: 2, edge: 'wall' }),
    W(-11, 1.5, 33, { tag: 'books', w: 9, m: 3 }),
    W(-22, 0, 45, { tag: 'rug', w: 10, m: 6 }),
    W(-46, 0, 48, { tag: 'rug', w: 10, m: 6, pad: 1 }),
    W(-64, 0, 30, { tag: 'rug', w: 10, m: 5 }),
    W(-64, 0, 2, { tag: 'rug', w: 10, m: 5, pad: 1 }),
    W(-54, 0, -20, { tag: 'rug', w: 9, m: 4 }),
    W(-36, 0, -27, { tag: 'underbed', w: 8, m: 2, ceil: 8.6 }),
    W(-12, 0, -24, { tag: 'underbed', w: 8, m: 2, ceil: 8.6 }),
    W(10, 0, -28, { tag: 'underbed', w: 8, m: 2, ceil: 8.6 }),
    W(30, 0, -20, { tag: 'rug', w: 9, m: 4 }),
    W(44, 0, -2, { tag: 'rug', w: 9, m: 4 }),
    W(60, 0, 12, { tag: 'door', w: 8, m: 1 }),
    W(82, 0, 20, { tag: 'landing', w: 10, m: 5 }),
    W(96, 3, 34, { tag: 'plank', w: 8, m: 0.8, edge: 'drop' }),
    W(110, 12, 46, { tag: 'banister', w: 6.5, m: 0.8, edge: 'drop' }),
    W(140, 12, 54, { tag: 'banister', w: 6.5, m: 0.8, edge: 'drop', pad: 1 }),
    W(172, 12, 52, { tag: 'banister', w: 6.5, m: 0.8, edge: 'drop' }),
    W(194, 12, 36, { tag: 'banister', w: 6.5, m: 0.8, edge: 'drop' }),
    W(200, 12, 12, { tag: 'banister', w: 6.5, m: 0.8, edge: 'drop' }),
    W(196, 5.5, -10, { tag: 'plank', w: 8, m: 0.8, edge: 'drop' }),
    W(180, 0, -26, { tag: 'landing', w: 10, m: 5 }),
    W(156, 0, -38, { tag: 'landing', w: 9, m: 3 }),
    W(140, 2.5, -40, { tag: 'drawer', w: 9, m: 1.5 }),
    W(124, 2.5, -40, { tag: 'drawer', w: 9, m: 1.5 }),
    W(108, 2.5, -40, { tag: 'drawer', w: 9, m: 1.5 }),
    W(92, 0, -44, { tag: 'landing', w: 9, m: 4 }),
    W(68, 0, -46, { tag: 'door', w: 8, m: 1 }),
    W(52, 0, -46, { tag: 'pillows', w: 9, m: 3, pad: 1 }),
    W(40, 6.5, -46, { tag: 'pillows', w: 9, m: 2, launch: 15 }),
    W(22, 16, -46, { tag: 'duvet', w: 10, m: 5 }),
    W(6, 16, -50, { tag: 'duvet', w: 10, m: 6 }),
    W(-8, 16, -48, { tag: 'duvet', w: 10, m: 6 }),
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
  boxes: [0.1, 0.33, 0.52, 0.68, 0.86],
};

/* the room was laid out in a compact sketch; the race runs it 1.8× wider
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
  };
}
export const TRACKS = { landing: scaled(LANDING, 1.8, 1.25) };

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
    drop: new Uint8Array(N), ceil: new Float32Array(N), pad: new Uint8Array(N), launch: new Float32Array(N),
  };
  let j = 0;
  for (let k = 0; k < N; k++) {
    const s = k * T.step;
    while (acc[j + 1] < s) j++;
    const a = dense[j], b = dense[(j + 1) % dense.length];
    const f = (s - acc[j]) / Math.max(1e-6, acc[j + 1] - acc[j]);
    T.x[k] = a.x + (b.x - a.x) * f; T.y[k] = a.y + (b.y - a.y) * f; T.z[k] = a.z + (b.z - a.z) * f;
    T.w[k] = a.w + (b.w - a.w) * f; T.m[k] = a.m + (b.m - a.m) * f;
    const sec = a.t < 0.5 ? a.from : (a.from + 1) % n;
    T.sec[k] = sec;
    const S = P[sec], Sa = P[a.from];
    T.drop[k] = S.edge === 'drop' || Sa.edge === 'drop' ? 1 : 0;
    T.ceil[k] = Sa.ceil && (P[(a.from + 1) % n].ceil || a.t < 0.5) ? Sa.ceil : 0;
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
  return T;
}

/* the right-hand vector at sample k (horizontal): tangent × up */
export const rightX = (T, k) => -T.tz[k];
export const rightZ = (T, k) => T.tx[k];

/* nearest sample to (x, z) searched around a hint (a kart's own index), and
   the lateral offset d (+ = right of the centreline) and along-sample frac */
export function locate(T, x, z, hint, span = 24, y = null) {
  const N = T.N;
  let best = hint, bd = 1e18;
  for (let q = -span; q <= span; q++) {
    const k = (hint + q + N) % N;
    const dx = x - T.x[k], dz = z - T.z[k];
    let d = dx * dx + dz * dz;
    if (y !== null) { const dy = y - T.y[k]; d += dy * dy * 4; }
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

/* arc length of sample k */
export const sOf = (T, k) => k * T.step;
