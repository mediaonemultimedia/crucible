/* The crow: a round plush corvid who catches what you toss and hoards
   whatever shines.

   A round glossy body under a short dense pile (soft feathers, not shaggy
   fur — the fur material gets a blue-violet sheen for him), a round head
   with bead eyes set wide, folded wings along his sides (flat chains: they
   open and beat), a fan of tail feathers, short thin legs on little felt
   feet. His beak is not stuffing: it is two rigid felt mandibles (props.js)
   riding the head's frame, and the lower one hinges open and snaps shut.
   He faces +z; his right is −x. Units: 1 = 9 cm; about 22 cm tall.       */

import { RigBuilder, smooth, lerp3, spline } from '../rigbuilder.js';
import { standingBody, athleteCfg } from './standing.js';

export const CROW = {
  TORSO: { c: [0, 1.12, -0.04], r: [0.66, 0.68, 0.7], B: null, bulge: (phi) => 0.9 + 0.16 * (phi / Math.PI) },
  HEAD: { c: [0, 2.0, 0.16], r: [0.5, 0.47, 0.5], B: null, bulge: (phi) => 1 + 0.04 * Math.sin(phi) },
  // the beak, in the head's rest frame (relative to the head bulk's centre):
  // where it is sewn on, which way it points, how long
  BEAK: { base: [0, -0.07, 0.4], dir: [0, -0.12, 1], len: 0.5, w: 0.15, h: 0.12 },
  PIVOT: [0, 1.66, 0.08],
};

export function buildCrow() {
  const b = new RigBuilder('crow');
  const { TORSO, HEAD } = CROW;
  const { h0, h1 } = standingBody(b, {
    TORSO, HEAD,
    hip: [0.25, 0.6, 0.06], foot: [0.27, 0.2, 0.12], legR: 0.1,
    FOOT: { c: [0.28, 0.11, 0.22], r: [0.19, 0.11, 0.3] },
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

  // folded wings along his sides: flat chains from the shoulder back and
  // down, thin across (their flat axis is the side normal)
  const wings = [];
  for (const s of [-1, 1]) {
    const P = [[s * 0.6, 1.5, 0.1], [s * 0.68, 1.15, -0.14], [s * 0.6, 0.82, -0.42], [s * 0.44, 0.6, -0.68]];
    wings.push(b.chain({
      name: s < 0 ? 'right wing' : 'left wing', kind: 'arm', cloud: 0, n: 6,
      anchor: [s * 0.36, 1.42, 0.05],
      path: spline(P),
      radius: (u) => 0.27 - 0.1 * u - 0.06 * smooth(0.75, 1, u),
      ref: [s, 0, 0], flat: 0.32, bend: 3.2, mem: 6, stretch: 1.08, skip: 3, AS: 22, AA: 20, CAP: 7,
      accent: () => 1, pile: (u) => 0.75 - 0.25 * u,
    }));
  }

  // the tail: a fan of feathers out behind, flat (thin vertically)
  b.chain({
    name: 'tail', kind: 'tail', cloud: 0, n: 4, anchor: [0, 0.78, -0.42],
    path: (u) => [0, 0.66 - 0.2 * u, -0.66 - 0.5 * u],
    radius: (u) => 0.16 + 0.1 * u,
    ref: [0, 1, 0], flat: 0.28, bend: 3, mem: 5, stretch: 1.06, skip: 2, AS: 14, AA: 18, CAP: 6,
    accent: () => 1, pile: () => 0.6,
  });

  // little felt feet: cloth over the sole grids (no fur under them)
  const FOOT = { c: [0.28, 0.11, 0.22], r: [0.19, 0.11, 0.3] };
  for (const s of [-1, 1]) {
    b.clothGrid({
      name: s < 0 ? 'right foot' : 'left foot', cloud: 0, c: [s * FOOT.c[0], FOOT.c[1], FOOT.c[2]], r: FOOT.r.map((v) => v + 0.03),
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
