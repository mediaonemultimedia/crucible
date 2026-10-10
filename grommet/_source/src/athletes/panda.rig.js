/* The pandas: two chubby plush sumo wrestlers in one ring.

   Each is the standing plush every biped here is — a stuffed torso cloud
   with the head as firm bulk on it, inCloud legs on flat soles — but
   rounder: white fur, black ears, arms, legs and a black saddle over the
   shoulders, black eye patches with the bead eyes set in white felt rings
   inside them, a black nose. Each wears a felt mawashi round the middle:
   the champion's deep purple (and he has a little topknot), the
   challenger's red.

   Both live in one rig, so one soft body, one fur mesh and one draw carry
   the pair: cloud 0 is the champion, cloud 1 the challenger. Each is built
   facing +z at the origin and then turned and moved to its mark (points,
   grid centres and bases, chain frames), facing the other across the
   ring's centre. `bodies` tells the soft body which points are which toy:
   their contacts with each other go through a broadphase, and each is
   damped about its own motion.

   Units: 1 = 9 cm; a panda stands about 29 cm tall.                       */

import { RigBuilder, smooth, rotX, lerp3 } from '../rigbuilder.js';

export const PANDA = {
  TORSO: { c: [0, 1.38, 0], r: [0.86, 0.8, 0.72], B: null, bulge: (phi) => 0.9 + 0.2 * (phi / Math.PI) },
  HEAD: { c: [0, 2.52, 0.12], r: [0.7, 0.62, 0.64], B: null, bulge: (phi) => 1 + 0.05 * Math.sin(phi * 1.2) },
  SHOULDER: 0.7, SHOULDER_Y: 1.86, ARM_LEN: 0.9,
  FOOT: { c: [0.42, 0.16, 0.18], r: [0.27, 0.16, 0.34] },
  MARK: 1.8,               // each starts this far from the centre of the ring
  RING_R: 3.35,            // the rope
};

/* a rotation about +y by `a` as column triples (rigbuilder's bases), and
   applied to a vector */
const rotY = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[c, 0, -s], [0, 1, 0], [s, 0, c]]; };
const apply = (B, v) => [B[0][0] * v[0] + B[1][0] * v[1] + B[2][0] * v[2], B[0][1] * v[0] + B[1][1] * v[1] + B[2][1] * v[2], B[0][2] * v[0] + B[1][2] * v[1] + B[2][2] * v[2]];
const compose = (A, B) => (B ? B.map((col) => apply(A, col)) : A.map((col) => [...col]));

/* one panda in cloud k, built facing +z at the origin; returns its parts */
function buildOne(b, k, champion) {
  const { TORSO, HEAD, FOOT } = PANDA;
  const name = (s) => (champion ? s : s + ' b');
  b.cloud(TORSO, { shell: 84, core: 12, k: 2.6, k0: 0.16 });
  const h0 = b.rad.length;
  b.bulk(k, HEAD, 64, (d) => d[1] < -0.62);
  b.bulk(k, { ...HEAD, r: HEAD.r.map((v) => v * 0.55) }, 8);
  const h1 = b.rad.length;

  for (const s of [-1, 1]) {
    const top = [s * 0.4, 0.86, 0.04], ft = [s * FOOT.c[0], 0.27, 0.1];
    b.chain({
      name: name(s < 0 ? 'right leg' : 'left leg'), kind: 'leg', cloud: k, n: 4, inCloud: true,
      anchor: [s * 0.3, 1.1, 0.04], path: (u) => lerp3(top, ft, u),
      radius: (u) => 0.26 + 0.03 * smooth(0.6, 1, u), ref: [0, 0, 1], bend: 2.4, mem: 2.5,
      AS: 14, AA: 18, CAP: 0, accent: () => 1, pile: () => 1.05,
    });
    const F = { c: [s * FOOT.c[0], FOOT.c[1], FOOT.c[2]], r: FOOT.r };
    b.bulk(k, F, 10, (d) => d[1] > -0.2);
    const pr = 0.07;
    b.clouds[k].ix.push(b.add([F.c[0], pr, F.c[2]], pr));
    for (let q = 0; q < 10; q++) {
      const a = (q / 10) * Math.PI * 2;
      b.clouds[k].ix.push(b.add([F.c[0] + Math.sin(a) * (F.r[0] - pr) * 0.92, pr, F.c[2] + Math.cos(a) * (F.r[2] - pr) * 0.92], pr));
    }
    b.grid({ name: name('foot'), cloud: k, ...F, U: 28, V: 16, accent: () => 1, pile: () => 0.9 });
  }
  // the black saddle over the shoulders, white belly
  b.grid({
    name: name('torso'), cloud: k, ...TORSO, U: 56, V: 36,
    accent: (u, v, l) => smooth(0.3, 0.46, l[1] + 0.12 * Math.max(0, -l[2])) * (1 - 0.85 * smooth(0.55, 0.85, l[2]) * smooth(0.62, 0.42, l[1])),
    pile: () => 1.1,
  });
  b.grid({
    name: name('head'), cloud: k, ...HEAD, U: 64, V: 40, eye: true,
    pile: (u, v, l) => 1 + 0.2 * smooth(0.0, -0.5, l[2]),
  });
  b.grid({ name: name('muzzle'), cloud: k, c: [0, 2.32, 0.66], r: [0.31, 0.22, 0.24], B: rotX(0.12), U: 32, V: 22, pile: () => 0.55 });
  if (champion) {
    // the topknot: a little black bun on the crown, tipped forward
    b.grid({ name: 'topknot', cloud: k, c: [0, 3.22, 0.0], r: [0.16, 0.12, 0.27], B: rotX(-0.25), U: 18, V: 12, accent: () => 1, pile: () => 0.35 });
  }

  // round black ears
  for (const s of [-1, 1]) {
    b.chain({
      name: name(s < 0 ? 'right ear' : 'left ear'), kind: 'ear', cloud: k, n: 4,
      anchor: [s * 0.36, 2.88, 0.02],
      path: (u) => [s * (0.5 + 0.06 * u), 3.0 + 0.16 * u, 0.04 + 0.02 * u],
      radius: (u) => 0.08 + 0.12 * Math.sin(Math.PI * Math.min(1, 0.2 + u * 0.75)),
      ref: [0, 0, 1], flat: 0.6, bend: 3, mem: 6, stretch: 1.05, skip: 2, AS: 14, AA: 16, CAP: 6,
      accent: () => 1, pile: () => 0.9,
    });
  }

  // thick black arms, hanging a little out and forward
  const arms = [];
  for (const s of [-1, 1]) {
    const root = [s * PANDA.SHOULDER, PANDA.SHOULDER_Y, 0.06];
    let d = [s * 0.5, -0.78, 0.36];
    const dl = Math.hypot(...d);
    d = d.map((v) => v / dl);
    const end = [root[0] + d[0] * PANDA.ARM_LEN, root[1] + d[1] * PANDA.ARM_LEN, root[2] + d[2] * PANDA.ARM_LEN];
    arms.push(b.chain({
      name: name(s < 0 ? 'right arm' : 'left arm'), kind: 'arm', cloud: k, n: 6,
      anchor: [s * 0.42, 1.86, 0.0], path: (u) => lerp3(root, end, u),
      radius: (u) => 0.22 - 0.02 * u + 0.04 * smooth(0.7, 0.97, u) * (1 - 0.5 * smooth(0.97, 1, u)),
      ref: [0, -1, 0], bend: 2.6, mem: 5, stretch: 1.14, skip: 3, AS: 20, AA: 18, CAP: 7,
      accent: () => 1, pile: () => 1.05,
    }));
  }
  // a stub of a white tail
  const tail = b.chain({
    name: name('tail'), kind: 'tail', cloud: k, n: 3, anchor: [0, 0.95, -0.45],
    path: (u) => [0, 0.88 + 0.06 * u, -0.72 - 0.14 * u],
    radius: (u) => 0.14 - 0.03 * u, ref: [0, -1, 0], bend: 2, mem: 3, AS: 8, AA: 14, CAP: 6, pile: () => 1.3,
  });

  // the mawashi: a thick felt band round the middle, over the hips
  const SH = { c: TORSO.c, r: [TORSO.r[0] + 0.06, TORSO.r[1] + 0.05, TORSO.r[2] + 0.06], bulge: TORSO.bulge };
  b.clothGrid({
    name: name('mawashi'), cloud: k, ...SH, vr: [0.6, 0.78], U: 64, V: 10, style: 0,
    trim: champion ? () => 1 : () => 0,
  });

  // the head and what rides on it; and what the game needs to know
  const core = [];
  for (let i = h0; i < h1; i++) core.push(i);
  const ears = b.chains.filter((c) => c.kind === 'ear' && c.cloud === k);
  const head = [...core];
  for (const e of ears) head.push(e.anchor, ...e.idx);
  return {
    cloud: k, core: Int32Array.from(core), head: Int32Array.from(head),
    ears: ears.map((e) => ({ k: e.k, ix: Int32Array.from(e.idx.slice(1)), root: e.idx[0] })),
    tail: tail.k, legs: b.chains.filter((c) => c.kind === 'leg' && c.cloud === k).map((c) => c.k),
    arms: arms.map((a) => a.k), armR: arms[0].k, armL: arms[1].k,
    pivot: [0, 2.0, 0.04], chest: [0, 1.6, 0.6],
  };
}

/* turn and move everything built since `mark` */
function place(b, mark, yaw, at) {
  const R = rotY(yaw), T = (p) => { const q = apply(R, p); return [q[0] + at[0], q[1] + at[1], q[2] + at[2]]; };
  for (let i = mark.n; i < b.rad.length; i++) {
    const q = T(b.p(i));
    b.pos[i * 3] = q[0]; b.pos[i * 3 + 1] = q[1]; b.pos[i * 3 + 2] = q[2];
  }
  for (const list of [b.parts.slice(mark.parts), b.clothParts.slice(mark.cloth)]) {
    for (const P of list) if (P.kind === 'grid') { P.c = T(P.c); P.B = compose(R, P.B); }
  }
  for (const ch of b.chains.slice(mark.chains)) ch.ref = apply(R, ch.ref);
  return R;
}

const marker = (b) => ({ n: b.rad.length, parts: b.parts.length, cloth: b.clothParts.length, chains: b.chains.length });

export function buildPanda() {
  const b = new RigBuilder('panda');
  // the champion at +x facing −x; the challenger at −x facing +x
  const m0 = marker(b);
  const champ = buildOne(b, 0, true);
  const R0 = place(b, m0, -Math.PI / 2, [PANDA.MARK, 0, 0]);
  const m1 = marker(b);
  const chal = buildOne(b, 1, false);
  const R1 = place(b, m1, Math.PI / 2, [-PANDA.MARK, 0, 0]);
  const n0 = m1.n;
  const ixA = [], ixB = [];
  for (let i = 0; i < b.rad.length; i++) (i < n0 ? ixA : ixB).push(i);
  const rest = (cfg, R, side) => ({
    ...cfg, posed: [0, 1], R, side,
    pivot: apply(R, cfg.pivot).map((v, d) => v + (d === 0 ? side * PANDA.MARK : 0)),
    chest: apply(R, cfg.chest).map((v, d) => v + (d === 0 ? side * PANDA.MARK : 0)),
  });
  return b.finish({
    camY: 0.1,
    haulAll: false,
    toy: rest(champ, R0, 1),
    toy2: rest(chal, R1, -1),
    bodies: [{ cloud: 0, ix: Int32Array.from(ixA) }, { cloud: 1, ix: Int32Array.from(ixB) }],
    // no fur under the mawashi
    furMask: [
      { part: 'torso', v0: 0.58, v1: 0.8, pile: 0 },
      { part: 'torso b', v0: 0.58, v1: 0.8, pile: 0 },
    ],
  });
}
