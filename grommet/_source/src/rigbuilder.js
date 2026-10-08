/* The builder every athlete's rest shape is written with.

   An athlete is one or two shape-matched clouds plus appendage chains, the
   same structure Flock's plush toys use, so one SoftBody and one Body drive
   them all. Chains carry their own stiffness: `bend` scales the window
   shape-matching, `mem` the pull back to the sewn pose (relative to their
   cloud), `stretch` the tether limit. `inCloud` chains (legs that carry
   weight) are also members of their cloud, so the stuffing holds them like
   the torso — that is what keeps a two-legged plush standing.

   Grommet adds clothes: `clothGrid` / `clothTube` describe fabric parts
   (a shirt over the torso, sleeves over the upper arms, a headband, gloves)
   skinned to the same clouds and chains as the fur, a little proud of it.
   They go to a second Body with their own atlas (rig.cloth) and are drawn
   with the cotton material instead of shells; the fur under them is masked
   to zero pile.                                                           */

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const len3 = (a) => Math.hypot(a[0], a[1], a[2]);

/* Catmull-Rom through control points, u ∈ [0, 1] spread evenly over spans */
export function spline(P) {
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
    this.clothParts = [];
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
      inCloud: !!o.inCloud, swish: !!o.swish,
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

  /* fabric over a cloud: an ellipsoid (or torus) band, optionally only the
     rows v ∈ vr (a shirt from collar to hem, a headband round the brow).
     `trim` (u, v, l) → 0…1 is the trim colour, `sway` how free the cloth
     hangs there (a hem swings, a collar doesn't), `style` picks the details
     the cotton shader draws (0 plain, 1 polo front, 2 glove)               */
  clothGrid(o) {
    const part = {
      kind: 'grid', name: o.name, cloud: o.cloud, U: o.U ?? 48, V: o.V ?? 24,
      c: o.c, r: o.r, B: o.B || null, bulge: o.bulge || null, torus: o.torus || null, vr: o.vr || null,
      pile: one, under: zero, accent: o.trim || zero, sway: o.sway || zero, style: o.style ?? 0,
    };
    this.clothParts.push(part);
    return part;
  }

  /* fabric along a chain: s ∈ [s0, s1], radius × rs + rAdd, open ends
     unless CAP > 0 (a glove's closed fingertips)                          */
  clothTube(o) {
    const part = {
      kind: 'tube', name: o.name, chain: o.chain, s0: o.s0 ?? 0, s1: o.s1 ?? 1, rs: o.rs ?? 1.2, rAdd: o.rAdd ?? 0,
      AS: o.AS ?? 16, AA: o.AA ?? 18, CAP: o.CAP ?? 0,
      pile: one, under: zero, accent: o.trim || zero, sway: o.sway || zero, style: o.style ?? 0,
    };
    this.clothParts.push(part);
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

  finish({ camY = 0, react = true, restV = 0.25, toy = null, ...extra } = {}) {
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

    // the clothes get an atlas of their own, laid out the same way
    let cloth = null;
    if (this.clothParts.length) {
      const cg = this.clothParts.filter((p) => p.kind === 'grid');
      const ct = this.clothParts.filter((p) => p.kind === 'tube');
      const cb = ct.length ? 0.7 : 1;
      const cregions = [];
      cg.forEach((g, k) => { g.region = cregions.length; cregions.push({ x0: 0, x1: 1, y0: cb * k / cg.length, y1: cb * (k + 1) / cg.length }); });
      ct.forEach((t, k) => { t.region = cregions.length; cregions.push({ x0: k / ct.length, x1: (k + 1) / ct.length, y0: cb, y1: 1 }); });
      cloth = { parts: [...cg, ...ct], regions: cregions };
    }

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
      restSkip: true, react, haulAll: true, restV, parts, regions, camY, toy, cloth, ...extra,
    };
  }
}

