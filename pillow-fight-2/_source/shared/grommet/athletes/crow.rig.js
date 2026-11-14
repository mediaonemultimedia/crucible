/* Bolster: copied from grommet-source @ b6164e2, grommet/_source/src/athletes/crow.rig.js — see shared/CHANGES.md for any edit. */
/* The crow: a round plush corvid who catches what you toss and hoards
   whatever shines.

   A round glossy body under a short dense pile (soft feathers, not shaggy
   fur — the fur material gets a blue-violet sheen for him), a round head
   with bead eyes set wide, folded wings along his sides (flat chains: they
   open and beat), a fan of tail feathers, short thin legs on little felt
   feet. His beak is not stuffing: it is two rigid felt mandibles (props.js)
   riding the head's frame, and the lower one hinges open and snaps shut.
   He faces +z; his right is −x. Units: 1 = 9 cm; about 22 cm tall.       */

import { RigBuilder, smooth, spline, rotX } from '../rigbuilder.js';
import { standingBody, athleteCfg } from './standing.js';

export const CROW = {
  TORSO: { c: [0, 1.12, -0.04], r: [0.66, 0.68, 0.7], B: null, bulge: (phi) => 0.9 + 0.16 * (phi / Math.PI) },
  HEAD: { c: [0, 2.0, 0.16], r: [0.5, 0.47, 0.5], B: null, bulge: (phi) => 1 + 0.04 * Math.sin(phi) },
  // the beak, in the head's rest frame (relative to the head bulk's centre):
  // where it is hinged (on the face's midline, below the eyes, well inside
  // the head so the bill leaves the fur at its full section), which way it
  // points, how long, its half-width and the upper bill's depth. Deeper
  // than wide, and narrow beside the head: a wide one swallowed the face
  // between the eyes and, seen three-quarter, seemed to grow from a cheek
  BEAK: { base: [0, -0.04, 0.32], dir: [0, -0.26, 1], len: 0.72, w: 0.125, h: 0.17 },
  PIVOT: [0, 1.66, 0.08],
};

/* how far out the torso's surface is (|x|) at height y, depth z */
function torsoX(T, y, z) {
  const dy = (y - T.c[1]) / T.r[1];
  const b = T.bulge(Math.acos(Math.max(-1, Math.min(1, dy))));
  const dz = (z - T.c[2]) / (T.r[2] * b);
  return T.r[0] * b * Math.sqrt(Math.max(0, 1 - dy * dy - dz * dz));
}

export function buildCrow() {
  const b = new RigBuilder('crow');
  const { TORSO, HEAD } = CROW;
  const { h0, h1 } = standingBody(b, {
    TORSO, HEAD,
    hip: [0.25, 0.6, 0.06], foot: [0.27, 0.18, 0.12], legR: 0.08,
    FOOT: { c: [0.27, 0.09, 0.2], r: [0.16, 0.09, 0.28] },
    torsoLook: { under: (u, v, l) => smooth(0.3, 0.8, l[2]) * smooth(0.5, -0.4, l[1]) * 0.35, pile: () => 0.95 },
    footLook: { pile: () => 0 },
    legLook: { pile: () => 0 },
  });

  b.grid({
    name: 'head', cloud: 0, ...HEAD, U: 60, V: 38, eye: true,
    accent: () => 1,
    // shorter pile round the face, a little fluff on the crown
    pile: (u, v, l) => 0.8 + 0.25 * smooth(0.4, 0.9, l[1]) - 0.25 * smooth(0.55, 0.9, l[2]) * smooth(0.4, -0.2, l[1]),
  });

  // folded wings along his sides, sewn on at the shoulder: each is a flat
  // chain whose root sits inside the body (so the fur closes over the seam)
  // and whose length lies along the body's surface, back and down, the tip
  // tucked in over the rump
  const wings = [];
  for (const s of [-1, 1]) {
    const on = (y, z, d) => [s * (torsoX(TORSO, y, z) + d), y, z];
    const P = [on(1.58, 0.1, -0.12), on(1.3, -0.08, 0.02), on(1.0, -0.32, 0.05), on(0.78, -0.56, 0.0), on(0.66, -0.76, -0.08)];
    wings.push(b.chain({
      name: s < 0 ? 'right wing' : 'left wing', kind: 'arm', cloud: 0, n: 6,
      anchor: [s * 0.3, 1.45, 0.02],
      path: spline(P),
      radius: (u) => 0.2 + 0.08 * Math.sin(Math.PI * Math.min(1, u * 1.6)) - 0.08 * smooth(0.7, 1, u),
      ref: [s, 0, 0], flat: 0.3, bend: 3.2, mem: 6, stretch: 1.08, skip: 3, AS: 24, AA: 20, CAP: 7,
      accent: () => 1, pile: (u) => 0.95 - 0.35 * u,
    }));
  }

  // no separate tail: the body itself runs out behind into a tapering rump
  // and a flat fan of tail feathers, all one stuffed cloud
  const RUMP = { c: [0, 0.86, -0.6], r: [0.42, 0.34, 0.56], B: rotX(-0.42) };
  const TAIL = { c: [0, 0.6, -1.1], r: [0.21, 0.07, 0.42], B: rotX(-0.36), bulge: (phi) => 0.8 + 0.4 * Math.sin(phi) };
  b.bulk(0, RUMP, 22, (d) => d[2] > 0.3);
  b.bulk(0, TAIL, 14);
  b.grid({ name: 'rump', cloud: 0, ...RUMP, U: 40, V: 24, accent: () => 1, pile: () => 0.9 });
  b.grid({
    name: 'tail', cloud: 0, ...TAIL, U: 36, V: 16, accent: () => 1,
    pile: (u, v, l) => 0.55 + 0.25 * smooth(-0.2, -0.9, l[2]),
  });

  // little felt feet: cloth over the sole grids (no fur under them)
  const FOOT = { c: [0.27, 0.09, 0.2], r: [0.16, 0.09, 0.28] };
  for (const s of [-1, 1]) {
    b.clothGrid({
      name: s < 0 ? 'right foot' : 'left foot', cloud: 0, c: [s * FOOT.c[0], FOOT.c[1], FOOT.c[2]], r: FOOT.r.map((v) => v + 0.02),
      vr: [0, 1], U: 24, V: 12, style: 0,
    });
  }

  return b.finish({
    camY: 0.1,
    toy: athleteCfg(b, h0, h1, { pivot: CROW.PIVOT, chest: [0, 1.4, 0.55], armR: wings[0].k, armL: wings[1].k }),
    furMask: [
      { part: 'foot', v0: 0, v1: 1, pile: 0 },
      { chain: 'right leg', s0: 0, s1: 1, pile: 0 },
      { chain: 'left leg', s0: 0, s1: 1, pile: 0 },
    ],
    beak: CROW.BEAK,
  });
}
