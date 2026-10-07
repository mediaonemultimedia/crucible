/* The other three plush toys, and the builder they share.

   Each character is one or two shape-matched clouds plus appendage chains,
   written the same way the octopus is so the one SoftBody and one Body drive
   them all. The wolf and lion are a single firmly stuffed cloud, torso and
   head together; the llama's small head is a second cloud riding on its neck
   chain. Proportions are a chunky, friendly toy's: big round heads, short
   muzzles, stubby legs.

   Chains carry their own stiffness: `bend` scales the window shape-matching,
   `mem` the pull back to the sewn pose (relative to their cloud), `stretch`
   the tether limit. `inCloud` chains (legs that carry weight) are also
   members of their cloud, so the stuffing holds them like the torso.       */

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const len3 = (a) => Math.hypot(a[0], a[1], a[2]);

/* Catmull-Rom through control points, u ∈ [0, 1] spread evenly over spans */
function spline(P) {
  return (u) => {
    const f = Math.min(P.length - 1.0001, Math.max(0, u * (P.length - 1)));
    const k = Math.floor(f), t = f - k;
    const p0 = P[Math.max(0, k - 1)], p1 = P[k], p2 = P[k + 1], p3 = P[Math.min(P.length - 1, k + 2)];
    const t2 = t * t, t3 = t2 * t;
    return [0, 1, 2].map((d) => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3));
  };
}
const dist3 = (a, b) => len3(sub3(a, b));

/* 3×3 bases as column triples [ex, ey, ez] */
export function rotX(a) { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, s], [0, -s, c]]; }
const apply = (B, l) => B
  ? [B[0][0] * l[0] + B[1][0] * l[1] + B[2][0] * l[2], B[0][1] * l[0] + B[1][1] * l[1] + B[2][1] * l[2], B[0][2] * l[0] + B[1][2] * l[1] + B[2][2] * l[2]]
  : l;
/* point on an ellipsoid part from a unit direction (sinφ sinθ, cosφ, sinφ cosθ) */
export function ellipsoidPoint(E, d, inset = 0) {
  const phi = Math.acos(Math.max(-1, Math.min(1, d[1])));
  const b = E.bulge ? E.bulge(phi) : 1;
  const l = [(E.r[0] - inset) * d[0] * b, (E.r[1] - inset) * d[1], (E.r[2] - inset) * d[2] * b];
  return add3(E.c, apply(E.B, l));
}

const one = () => 1;
const zero = () => 0;

export class RigBuilder {
  constructor(name) {
    this.name = name;
    this.pos = [];
    this.rad = [];
    this.clouds = [];
    this.chains = [];
    this.parts = [];
    this.extraTethers = [];
  }

  add(p, r) {
    const i = this.rad.length;
    this.pos.push(p[0], p[1], p[2]);
    this.rad.push(r);
    return i;
  }

  p(i) { return [this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]]; }

  /* a shape-matched cloud: a shell of points just inside an ellipsoid plus a
     small core, so squashing has something to resist                       */
  cloud(E, { shell = 70, core = 10, cut = null, parent = -1, mem = 0, k = 1, k0 = 0 } = {}) {
    const rmin = Math.min(...E.r);
    const rr = Math.max(0.07, Math.min(0.15, 0.17 * rmin));
    const ix = [];
    for (let i = 0; i < shell; i++) {
      const y = 1 - (i + 0.5) / shell * 2;
      const phi = Math.acos(y), th = i * GOLDEN;
      const d = [Math.sin(phi) * Math.sin(th), y, Math.sin(phi) * Math.cos(th)];
      if (cut && cut(d)) continue;
      ix.push(this.add(ellipsoidPoint(E, d, rr), rr));
    }
    const center = this.add(E.c, 0.4 * rmin);
    ix.push(center);
    for (let i = 0; i < core; i++) {
      const y = 1 - (i + 0.5) / core * 2;
      const phi = Math.acos(y), th = i * GOLDEN;
      const d = [Math.sin(phi) * Math.sin(th), y, Math.sin(phi) * Math.cos(th)];
      ix.push(this.add(ellipsoidPoint({ ...E, r: E.r.map((v) => v * 0.48) }, d), 0.3 * rmin));
    }
    this.clouds.push({ ix, center, parent, mem, k, k0, E });
    return this.clouds.length - 1;
  }

  /* more shell points for an existing cloud, on another ellipsoid (a haunch
     on a torso): they widen what the cloud stands on                       */
  bulk(k, E, shell = 24, cut = null) {
    const rmin = Math.min(...E.r);
    const rr = Math.max(0.07, Math.min(0.15, 0.17 * rmin));
    for (let i = 0; i < shell; i++) {
      const y = 1 - (i + 0.5) / shell * 2;
      const phi = Math.acos(y), th = i * GOLDEN;
      const d = [Math.sin(phi) * Math.sin(th), y, Math.sin(phi) * Math.cos(th)];
      if (cut && cut(d)) continue;
      this.clouds[k].ix.push(this.add(ellipsoidPoint(E, d, rr), rr));
    }
  }

  /* an appendage: n points along path(u), u ∈ [0, 1], root first. The root
     point and an anchor deeper inside belong to the cloud, as with the arms. */
  chain(o) {
    const c = this.clouds[o.cloud];
    const n = o.n;
    const radius = o.radius;
    const anchor = this.add(o.anchor, 0.2 * Math.min(1, radius(0) / 0.2));
    c.ix.push(anchor);
    const idx = [];
    for (let j = 0; j < n; j++) {
      const u = j / (n - 1);
      const i = this.add(o.path(u), radius(u) * 0.92);
      idx.push(i);
      if (j === 0 || o.inCloud) c.ix.push(i);
    }
    let len = 0;
    for (let j = 1; j < n; j++) len += dist3(this.p(idx[j - 1]), this.p(idx[j]));
    const k = this.chains.length;
    const ch = {
      k, name: o.name, kind: o.kind, idx: Int32Array.from(idx), anchor, cloud: o.cloud,
      from: o.from ?? c.center, len, seg: len / (n - 1), radius,
      ref: o.ref || [0, -1, 0], flat: o.flat ?? 1,
      bend: o.bend ?? 1, mem: o.mem ?? 1, stretch: o.stretch ?? 1.3, skip: o.skip ?? 3,
      inCloud: !!o.inCloud,
      under: o.under || zero, pile: o.pile || one, accent: o.accent || zero,
      angle: 0,
    };
    this.chains.push(ch);
    if (o.tube !== false) this.parts.push({ kind: 'tube', chain: k, AS: o.AS ?? 24, AA: o.AA ?? 18, CAP: o.CAP ?? 6, groom: o.groom, name: o.name });
    return ch;
  }

  /* display-only ellipsoid (or torus) skinned to a cloud */
  grid(o) {
    const part = {
      kind: 'grid', name: o.name, cloud: o.cloud, U: o.U ?? 48, V: o.V ?? 32,
      c: o.c, r: o.r, B: o.B || null, bulge: o.bulge || null, torus: o.torus || null,
      pile: o.pile || one, under: o.under || zero, accent: o.accent || zero, groom: o.groom,
      eye: o.eye,
    };
    this.parts.push(part);
    return part;
  }

  /* pin cloud `k`'s points to `from` with a long-range tether, hauling `haul` */
  tetherCloud(k, from, stretch, haul) {
    const f = this.p(from);
    for (const i of this.clouds[k].ix) {
      if (this.clouds[haul].ix.includes(i)) continue;
      this.extraTethers.push({ i, from, len: dist3(this.p(i), f), stretch, cloud: haul });
    }
  }

  finish({ camY = 0, react = true, restV = 0.25 } = {}) {
    const n = this.rad.length;
    const rest = Float64Array.from(this.pos);
    const windows = [], windowK = [], links = [], linkK = [];
    for (const ch of this.chains) {
      windows.push(Int32Array.of(ch.anchor, ch.idx[0], ch.idx[1])); windowK.push(ch.bend);
      for (let j = 1; j < ch.idx.length - 1; j++) { windows.push(Int32Array.of(ch.idx[j - 1], ch.idx[j], ch.idx[j + 1])); windowK.push(ch.bend); }
      links.push([ch.anchor, ch.idx[0]]); linkK.push(0.1 * Math.min(4, ch.bend));
      for (let j = 0; j < ch.idx.length - 1; j++) { links.push([ch.idx[j], ch.idx[j + 1]]); linkK.push(0.1 * Math.min(4, ch.bend)); }
    }
    const linkA = Int32Array.from(links.map((l) => l[0]));
    const linkB = Int32Array.from(links.map((l) => l[1]));
    const linkLen = Float64Array.from(links.map(([a, b]) => Math.hypot(
      rest[a * 3] - rest[b * 3], rest[a * 3 + 1] - rest[b * 3 + 1], rest[a * 3 + 2] - rest[b * 3 + 2])));
    const armOf = new Int16Array(n).fill(-1);
    const armJ = new Int16Array(n).fill(-1);
    for (const ch of this.chains) ch.idx.forEach((i, j) => { if (j > 0) { armOf[i] = ch.k; armJ[i] = j; } });

    // tethers: chain points to their cloud's centre along the rest path,
    // then any whole-cloud tethers (a head to its torso)
    const T = [];
    const d = (a, b) => dist3(this.p(a), this.p(b));
    for (const ch of this.chains) {
      if (ch.inCloud) continue;
      let arc = d(ch.from, ch.idx[0]);
      for (let j = 1; j < ch.idx.length; j++) {
        arc += d(ch.idx[j - 1], ch.idx[j]);
        if (j >= 2) T.push({ i: ch.idx[j], from: ch.from, len: arc, stretch: ch.stretch, cloud: ch.cloud });
      }
    }
    T.push(...this.extraTethers);

    const clouds = this.clouds.map((c) => ({ ix: Int32Array.from([...new Set(c.ix)]), center: c.center, parent: c.parent, mem: c.mem, k: c.k, k0: c.k0 }));

    // atlas: grids stacked in rows by size, tubes side by side in a band below
    const grids = this.parts.filter((p) => p.kind === 'grid');
    const tubes = this.parts.filter((p) => p.kind === 'tube');
    const band = tubes.length ? 0.64 : 1;
    const wt = grids.map((g) => g.torus ? (g.torus.R + g.torus.r) * 1.6 : (g.r[0] * g.r[1] + g.r[1] * g.r[2] + g.r[0] * g.r[2]) ** 0.5 + 0.12);
    const W = wt.reduce((a, b) => a + b, 0);
    const regions = [];
    let y = 0;
    grids.forEach((g, k) => {
      const h = band * wt[k] / W;
      g.region = regions.length;
      regions.push({ x0: 0, x1: 1, y0: y, y1: y + h, ...(g.groom || {}) });
      y += h;
    });
    tubes.forEach((t, k) => {
      t.region = regions.length;
      regions.push({ x0: k / tubes.length, x1: (k + 1) / tubes.length, y0: band, y1: 1, ...(t.groom || {}) });
    });
    // grids first, then tubes: the vertex order Body expects
    const parts = [...grids, ...tubes];

    return {
      name: this.name, n, rest, radius: Float64Array.from(this.rad),
      head: clouds[0].ix, center: clouds[0].center, arms: this.chains, windows,
      linkA, linkB, linkLen, armOf, armJ, seg: this.chains[0]?.seg ?? 0.2,
      clouds, windowK: Float64Array.from(windowK), linkK: Float64Array.from(linkK),
      tethers: {
        i: Int32Array.from(T.map((t) => t.i)), from: Int32Array.from(T.map((t) => t.from)),
        len: Float64Array.from(T.map((t) => t.len)), stretch: Float64Array.from(T.map((t) => t.stretch)),
        cloud: Int32Array.from(T.map((t) => t.cloud)),
      },
      restSkip: true, react, haulAll: true, restV, parts, regions, camY,
    };
  }
}

/* ── shared anatomy for the two sitting cats-and-dogs ──────────────────────── */

/* sitting torso: pear-shaped, leaning back a touch, bottom on the floor */
function sittingTorso(b, { w = 0.8, h = 0.98, d = 0.74 } = {}) {
  const E = { c: [0, h, -0.12], r: [w, h, d], B: rotX(-0.12), bulge: (phi) => 0.9 + 0.16 * (phi / Math.PI) };
  b.cloud(E, { shell: 84, core: 12, k: 2.5, k0: 0.12 });
  return E;
}

/* front legs: straight stuffed columns from chest to paw, part of the torso */
function frontLegs(b, { x = 0.3, top = 1.05, z0 = 0.34, z1 = 0.6, r = 0.17, accent = zero, under = zero } = {}) {
  const legs = [];
  for (const s of [-1, 1]) {
    const radius = (u) => r + 0.04 * smooth(0.65, 1, u);
    const end = r + 0.04;
    legs.push(b.chain({
      name: s < 0 ? 'left leg' : 'right leg', kind: 'leg', cloud: 0, n: 5, inCloud: true,
      anchor: [s * x * 0.8, top + 0.15, z0 - 0.2],
      path: (u) => [s * (x + 0.03 * u), top + (end * 0.98 - top) * u, z0 + (z1 - z0) * u * u],
      radius, ref: [0, 0, 1], bend: 2, mem: 2, AS: 18, AA: 18, CAP: 7, accent, under,
    }));
  }
  return legs;
}

/* a big head on a sitting torso, part of the torso's cloud (cloud 0) */
function headBulk(b, HEAD) {
  b.bulk(0, HEAD, 62, (d) => d[1] < -0.6);
  b.bulk(0, { ...HEAD, r: HEAD.r.map((v) => v * 0.55) }, 8);
  return 0;
}

/* haunches and hind paws: display grids, and physical bulk in the torso cloud
   so the toy sits on a broad base instead of rocking on a round bottom      */
function haunches(b, { pile = one, accent = zero, under = zero } = {}) {
  for (const s of [-1, 1]) {
    const H = { c: [s * 0.52, 0.37, -0.1], r: [0.34, 0.37, 0.56] };
    const P = { c: [s * 0.55, 0.13, 0.42], r: [0.2, 0.13, 0.25] };
    b.bulk(0, H, 26, (d) => d[0] * s < -0.2);
    b.bulk(0, P, 8, (d) => d[1] > 0.3);
    b.grid({ name: 'haunch', cloud: 0, ...H, U: 32, V: 20, pile, accent, under });
    b.grid({ name: 'paw', cloud: 0, ...P, U: 24, V: 14, under: () => 0.6 });
  }
}

/* ── wolf ───────────────────────────────────────────────────────────────────── */

export function buildWolf() {
  const b = new RigBuilder('wolf');
  const torso = sittingTorso(b);
  const HEAD = { c: [0, 2.22, 0.1], r: [0.8, 0.7, 0.72], B: null, bulge: (phi) => 1 + 0.06 * Math.sin(phi * 1.3) };
  // one stuffed cloud, head and torso together: a firmly sewn plush head
  const head = headBulk(b, HEAD);

  // grey with a cream chest and belly, a darker saddle up the back
  const belly = (l) => smooth(0.15, 0.55, l[2]) * smooth(0.75, 0.2, l[1]);
  const saddle = (l) => smooth(0.0, -0.6, l[2]) * smooth(-0.2, 0.6, l[1]) * 0.55;
  b.grid({ name: 'torso', cloud: 0, ...torso, U: 56, V: 36, under: (u, v, l) => belly(l), accent: (u, v, l) => saddle(l) });
  // cheeks and lower face cream, crown and back of the head darker
  b.grid({
    name: 'head', cloud: head, ...HEAD, U: 64, V: 40, eye: true,
    under: (u, v, l) => smooth(0.25, 0.7, l[2]) * smooth(0.05, -0.45, l[1]),
    accent: (u, v, l) => Math.max(smooth(0.3, 0.95, l[1]) * smooth(0.6, -0.1, l[2]) * 0.6,
      smooth(0.15, 0.45, l[1]) * smooth(0.3, 0.05, Math.abs(l[0])) * smooth(0.5, 0.85, l[2]) * 0.55),
    pile: (u, v, l) => 1 + 0.35 * smooth(0.2, -0.5, l[1]) * smooth(0.6, 0.95, Math.abs(l[0])),   // cheek ruffs
  });
  b.grid({ name: 'snout', cloud: head, c: [0, 2.03, 0.7], r: [0.31, 0.24, 0.34], B: rotX(0.1), U: 32, V: 22, under: () => 1, pile: () => 0.7 });
  haunches(b, { under: (u, v, l) => smooth(0.4, 0.9, l[2]) * 0.4, accent: (u, v, l) => smooth(0.0, -0.8, l[2]) * 0.4 });
  frontLegs(b, { under: (s, c) => 0.25 + 0.6 * smooth(0.75, 1, s) });

  // pointed upright ears: stiff, flattened front-to-back, cream inside
  for (const s of [-1, 1]) {
    b.chain({
      name: s < 0 ? 'left ear' : 'right ear', kind: 'ear', cloud: head, n: 5,
      anchor: [s * 0.24, 2.4, 0.04],
      path: (u) => [s * (0.34 + 0.2 * u), 2.62 + 0.78 * u, 0.06 - 0.06 * u],
      radius: (u) => 0.035 + 0.22 * Math.pow(1 - u, 0.85),
      ref: [0, 0, 1], flat: 0.42, bend: 3.2, mem: 7, stretch: 1.12, skip: 2, AS: 20, AA: 18, CAP: 5,
      under: (u, c) => smooth(0.25, 0.75, c) * smooth(0.12, 0.3, u) * (1 - smooth(0.7, 0.92, u)),
      accent: (u) => smooth(0.72, 0.95, u),
      pile: () => 0.8,
    });
  }

  // bushy tail curled round the right haunch onto the floor
  b.chain({
    name: 'tail', kind: 'tail', cloud: 0, n: 9, anchor: [0.1, 0.5, -0.35],
    path: spline([[0.15, 0.45, -0.6], [0.6, 0.31, -0.8], [1.1, 0.3, -0.6], [1.5, 0.32, -0.28], [1.72, 0.42, 0.02]]),
    radius: (u) => 0.13 + 0.15 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.15 + u * 0.95)), 0.8),
    ref: [0, -1, 0], bend: 1.6, mem: 0.6, stretch: 1.25, AS: 36, AA: 20, CAP: 7,
    pile: () => 1.45, accent: (u) => smooth(0.86, 0.98, u) * 0.85, under: (u, c) => smooth(0.2, 0.8, c) * 0.5 * (1 - smooth(0.75, 0.9, u)),
    groom: { ruf: 0.12 },
  });

  return b.finish({ camY: 0.15 });
}

/* ── lion ───────────────────────────────────────────────────────────────────── */

export function buildLion() {
  const b = new RigBuilder('lion');
  const torso = sittingTorso(b, { w: 0.82, h: 0.96, d: 0.76 });
  const HEAD = { c: [0, 2.2, 0.12], r: [0.74, 0.7, 0.68], B: null, bulge: (phi) => 1 + 0.07 * Math.sin(phi * 1.25) };
  // one stuffed cloud, head and torso together: a firmly sewn plush head
  const head = headBulk(b, HEAD);

  const belly = (l) => smooth(0.2, 0.6, l[2]) * smooth(0.7, 0.1, l[1]);
  b.grid({ name: 'torso', cloud: 0, ...torso, U: 56, V: 36, under: (u, v, l) => belly(l) * 0.8,
    // a little mane spills down the chest and over the shoulders
    accent: (u, v, l) => smooth(0.45, 0.85, l[1]) * 0.85,
    pile: (u, v, l) => 1 + 0.9 * smooth(0.45, 0.85, l[1]),
    groom: { lv: 0.5, ruf: 0.05 },
  });
  b.grid({
    name: 'head', cloud: head, ...HEAD, U: 64, V: 40, eye: true,
    under: (u, v, l) => smooth(0.3, 0.75, l[2]) * smooth(0.0, -0.5, l[1]) * 0.8,
    accent: (u, v, l) => smooth(0.35, -0.2, l[2]),                    // the back of the head is all mane
    pile: (u, v, l) => 1 + 1.2 * smooth(0.35, -0.2, l[2]),
  });
  b.grid({ name: 'muzzle', cloud: head, c: [0, 1.98, 0.73], r: [0.36, 0.24, 0.27], B: rotX(0.08), U: 32, V: 22, under: () => 1, pile: () => 0.65 });
  // the mane: a fat torus framing the face, long pile, combed out radially
  const MC = [0, 2.2, -0.08];
  b.grid({
    name: 'mane', cloud: head, c: MC, torus: { R: 0.68, r: 0.42 }, U: 72, V: 36,
    accent: () => 1, pile: (u, v) => 2.2 * (0.5 + 0.5 * smooth(0.03, 0.2, Math.min(v, 1 - v))),
    groom: { lu: 0, lv: 0.62, ruf: 0.08 },
  });
  haunches(b, { under: (u, v, l) => smooth(0.4, 0.9, l[2]) * 0.4 });
  frontLegs(b, { under: (s, c) => 0.2 + 0.6 * smooth(0.75, 1, s) });

  // small round ears peeking out of the front of the mane
  for (const s of [-1, 1]) {
    b.chain({
      name: s < 0 ? 'left ear' : 'right ear', kind: 'ear', cloud: head, n: 4,
      anchor: [s * 0.36, 2.5, 0.12],
      path: (u) => [s * (0.47 + 0.1 * u), 2.66 + 0.3 * u, 0.3 + 0.08 * u],
      radius: (u) => 0.09 + 0.12 * Math.sin(Math.PI * Math.min(1, 0.2 + u * 0.75)),
      ref: [0, 0, 1], flat: 0.55, bend: 3, mem: 6, stretch: 1.05, skip: 2, AS: 14, AA: 16, CAP: 6,
      under: (u, c) => smooth(0.3, 0.75, c) * smooth(0.25, 0.45, u),
      pile: () => 0.75,
    });
  }

  // long thin tail curled round the left side, a mane-coloured tuft at the tip
  b.chain({
    name: 'tail', kind: 'tail', cloud: 0, n: 10, anchor: [-0.1, 0.45, -0.4],
    path: spline([[-0.15, 0.4, -0.64], [-0.5, 0.12, -1.0], [-1.0, 0.11, -0.82], [-1.22, 0.11, -0.28], [-1.12, 0.14, 0.22], [-0.86, 0.3, 0.55]]),
    radius: (u) => 0.085 + 0.035 * smooth(0.84, 0.95, u) * (1 - 0.4 * smooth(0.95, 1, u)),
    ref: [0, -1, 0], bend: 1.6, mem: 0.6, stretch: 1.25, AS: 40, AA: 16, CAP: 7,
    pile: (u) => 1 + 0.6 * smooth(0.84, 0.94, u), accent: (u) => smooth(0.82, 0.92, u),
    groom: { ruf: 0.05 },
  });

  return b.finish({ camY: 0.15 });
}

/* ── llama ──────────────────────────────────────────────────────────────────── */

export function buildLlama() {
  const b = new RigBuilder('llama');
  // body runs along a line yawed toward the camera; the head turns to face it
  const yaw = 0.42;
  const f = [Math.cos(yaw), 0, Math.sin(yaw)];    // toward the front (+x, a little toward us)
  const sd = [-Math.sin(yaw), 0, Math.cos(yaw)];  // the near side
  const B = [f, [0, 1, 0], sd];
  const at = (C, a, y, s) => add3(add3(add3(C, mul3(f, a)), [0, y, 0]), mul3(sd, s));
  const BODY = { c: [-0.15, 1.3, -0.2], r: [0.95, 0.6, 0.62], B, bulge: (phi) => 1 + 0.06 * Math.sin(phi) };
  b.cloud(BODY, { shell: 80, core: 12 });
  const C = BODY.c;

  // four stuffed legs that carry the body
  for (const [a, s] of [[0.55, 0.3], [0.55, -0.3], [-0.6, 0.3], [-0.6, -0.3]]) {
    const top = at(C, a, -0.3, s), foot = at(C, a * 1.04, 0, s * 1.08);
    foot[1] = 0.21;
    b.chain({
      name: 'leg', kind: 'leg', cloud: 0, n: 4, inCloud: true,
      anchor: at(C, a * 0.8, -0.05, s * 0.6),
      path: (u) => lerp3(top, foot, u),
      radius: (u) => 0.19 + 0.02 * smooth(0.7, 1, u), ref: [0, 0, 1], bend: 2, mem: 2,
      AS: 14, AA: 16, CAP: 7, accent: () => 1, pile: () => 0.85, under: (u) => 0.35 * smooth(0.8, 1, u),
    });
  }

  // the long neck, rising from the front of the body
  const nRoot = at(C, 0.62, 0.18, 0.06);
  const nTop = [nRoot[0] + 0.12, 2.92, nRoot[2] + 0.12];
  const neck = b.chain({
    name: 'neck', kind: 'neck', cloud: 0, n: 7, anchor: at(C, 0.35, 0.0, 0.0),
    path: (u) => { const p = lerp3(nRoot, nTop, u); p[0] += 0.08 * Math.sin(u * Math.PI); return p; },
    radius: (u) => 0.27 - 0.07 * u, ref: [0, 0, 1], bend: 2.6, mem: 8, stretch: 1.2, AS: 26, AA: 22, CAP: 0,
    pile: () => 1.9, groom: { ruf: 0.32 },
  });

  // small head on top, facing the camera
  const hc = [nTop[0] + 0.02, nTop[1] + 0.2, nTop[2] + 0.1];
  const HEAD = { c: hc, r: [0.36, 0.33, 0.4], B: null, bulge: null };
  const head = b.cloud(HEAD, { shell: 34, core: 6, parent: 0, mem: 6, k: 2, k0: 0.05 });
  // the neck's last two points belong to the head too: it sits on the neck
  for (const j of [neck.idx.length - 1, neck.idx.length - 2]) b.clouds[head].ix.push(neck.idx[j]);
  b.grid({ name: 'head', cloud: head, ...HEAD, U: 48, V: 32, eye: true, accent: () => 1, pile: () => 0.8,
    under: (u, v, l) => smooth(0.3, 0.8, l[2]) * smooth(0.1, -0.5, l[1]) * 0.6 });
  b.grid({ name: 'snout', cloud: head, c: add3(hc, [0, -0.12, 0.36]), r: [0.23, 0.19, 0.22], U: 28, V: 20, accent: () => 1, under: () => 0.85, pile: () => 0.55 });
  b.grid({ name: 'topknot', cloud: head, c: add3(hc, [0, 0.31, -0.08]), r: [0.22, 0.14, 0.2], U: 28, V: 18,
    pile: () => 1.8, groom: { lv: 0.08, ruf: 0.6 } });

  // banana ears: up, out, then curving back in at the tip
  for (const s of [-1, 1]) {
    b.chain({
      name: s < 0 ? 'left ear' : 'right ear', kind: 'ear', cloud: head, n: 5,
      anchor: add3(hc, [s * 0.1, 0.12, -0.02]),
      path: (u) => add3(hc, [s * (0.19 + 0.2 * Math.sin(u * 2.3) - 0.14 * u * u), 0.24 + 0.66 * u, -0.04 + 0.04 * u]),
      radius: (u) => 0.035 + 0.05 * Math.sin(Math.PI * Math.min(1, 0.3 + u * 0.7)),
      ref: [0, 0, 1], flat: 0.6, bend: 2, mem: 3, stretch: 1.12, skip: 2, AS: 18, AA: 14, CAP: 6,
      accent: () => 1, pile: () => 0.7, under: (u, c) => smooth(0.3, 0.8, c) * smooth(0.15, 0.35, u) * (1 - smooth(0.75, 0.95, u)),
    });
  }

  // a short pom-pom of a tail
  const tRoot = at(C, -0.9, 0.18, 0);
  b.chain({
    name: 'tail', kind: 'tail', cloud: 0, n: 4, anchor: at(C, -0.6, 0.1, 0),
    path: (u) => add3(tRoot, add3(mul3(f, -0.32 * u), [0, 0.1 * u - 0.12 * u * u, 0])),
    radius: (u) => 0.12 + 0.03 * Math.sin(u * Math.PI), ref: [0, -1, 0], bend: 1.5, mem: 2.5, AS: 12, AA: 14, CAP: 6,
    pile: () => 2.2, groom: { ruf: 0.45 },
  });

  // the shaggy fleece: long pile, stood up a little by default
  b.grid({ name: 'body', cloud: 0, ...BODY, U: 60, V: 34, pile: (u, v, l) => 2.0 - 0.3 * smooth(-0.3, -0.9, l[1]), groom: { lv: 0.3, ruf: 0.42 } });
  // move the body grid to the front of the list so the atlas gives it the biggest row
  b.parts.unshift(b.parts.pop());

  b.tetherCloud(head, b.clouds[0].center, 1.22, 0);
  return b.finish({ camY: 0.55, react: false });
}
