/* The polar bear: a chunky standing plush goalkeeper.

   Cream-white long fur, small round ears, a short rounded snout with a
   black nose, bead eyes, thick arms in goalkeeper gloves, short legs on big
   flat feet. Bigger and rounder than the leopard, and heavier for it: his
   dive is a real throw of the whole soft body, so he lands like a bag of
   stuffing and has to haul himself back up.                               */

import { RigBuilder, smooth, rotX, lerp3 } from '../rigbuilder.js';
import { standingBody, athleteCfg } from './standing.js';

export const BEAR = {
  TORSO: { c: [0, 1.36, 0], r: [0.82, 0.76, 0.64], B: null, bulge: (phi) => 0.9 + 0.18 * (phi / Math.PI) },
  HEAD: { c: [0, 2.56, 0.1], r: [0.72, 0.64, 0.64], B: null, bulge: (phi) => 1 + 0.05 * Math.sin(phi * 1.2) },
  SHOULDER: 0.66, SHOULDER_Y: 1.86, ARM_LEN: 0.95,
};

export function buildBear() {
  const b = new RigBuilder('bear');
  const { TORSO, HEAD } = BEAR;
  const { h0, h1 } = standingBody(b, {
    TORSO, HEAD,
    hip: [0.38, 0.84, 0.04], foot: [0.42, 0.27, 0.1], legR: 0.25,
    FOOT: { c: [0.43, 0.17, 0.19], r: [0.28, 0.17, 0.36] },
    torsoLook: { under: (u, v, l) => smooth(0.3, 0.75, l[2]) * smooth(0.5, -0.2, l[1]) * 0.5, pile: () => 1.15 },
    footLook: { under: (u, v, l) => smooth(-0.2, -0.6, l[1]), pile: () => 0.9 },
    legLook: { pile: () => 1.1 },
  });

  b.grid({
    name: 'head', cloud: 0, ...HEAD, U: 64, V: 40, eye: true,
    under: (u, v, l) => smooth(0.4, 0.8, l[2]) * smooth(0.0, -0.4, l[1]) * 0.5,
    pile: (u, v, l) => 1 + 0.35 * smooth(0.0, -0.5, l[2]) + 0.25 * smooth(0.55, 0.9, Math.abs(l[0])) * smooth(0.1, -0.4, l[1]),
  });
  // a short rounded snout, pushed forward and a touch down
  b.grid({ name: 'muzzle', cloud: 0, c: [0, 2.36, 0.66], r: [0.33, 0.24, 0.27], B: rotX(0.12), U: 32, V: 22, under: () => 0.6, pile: () => 0.5 });

  for (const s of [-1, 1]) {
    b.chain({
      name: s < 0 ? 'right ear' : 'left ear', kind: 'ear', cloud: 0, n: 4,
      anchor: [s * 0.36, 2.9, 0.02],
      path: (u) => [s * (0.48 + 0.06 * u), 3.02 + 0.17 * u, 0.06 + 0.02 * u],
      radius: (u) => 0.07 + 0.1 * Math.sin(Math.PI * Math.min(1, 0.2 + u * 0.75)),
      ref: [0, 0, 1], flat: 0.6, bend: 3, mem: 6, stretch: 1.05, skip: 2, AS: 14, AA: 16, CAP: 6,
      under: (u, c) => smooth(0.3, 0.75, c) * smooth(0.25, 0.45, u) * 0.5, pile: () => 0.8,
    });
  }

  // thick arms hanging a little out from the sides, paws forward
  const arms = [];
  for (const s of [-1, 1]) {
    const root = [s * BEAR.SHOULDER, BEAR.SHOULDER_Y, 0.04];
    let d = [s * 0.5, -0.8, 0.3];
    const dl = Math.hypot(...d);
    d = d.map((v) => v / dl);
    const end = [root[0] + d[0] * BEAR.ARM_LEN, root[1] + d[1] * BEAR.ARM_LEN, root[2] + d[2] * BEAR.ARM_LEN];
    arms.push(b.chain({
      name: s < 0 ? 'right arm' : 'left arm', kind: 'arm', cloud: 0, n: 6,
      anchor: [s * 0.4, 1.86, 0.0],
      path: (u) => lerp3(root, end, u),
      radius: (u) => 0.2 - 0.02 * u + 0.04 * smooth(0.7, 0.97, u) * (1 - 0.5 * smooth(0.97, 1, u)),
      ref: [0, -1, 0], bend: 2.6, mem: 5, stretch: 1.14, skip: 3, AS: 20, AA: 18, CAP: 7, pile: () => 1.1,
    }));
  }

  // a stub of a tail
  b.chain({
    name: 'tail', kind: 'tail', cloud: 0, n: 3, anchor: [0, 0.9, -0.4],
    path: (u) => [0, 0.82 + 0.06 * u, -0.66 - 0.16 * u],
    radius: (u) => 0.13 - 0.03 * u, ref: [0, -1, 0], bend: 2, mem: 3, AS: 8, AA: 14, CAP: 6, pile: () => 1.4,
  });

  // goalkeeper gloves: over the paws and halfway up the forearm, with a
  // wide cuff
  for (const ch of arms) {
    b.clothTube({
      name: ch.name + ' glove', chain: ch.k, s0: 0.6, s1: 1, rs: 1.12, rAdd: 0.075, AS: 14, AA: 20, CAP: 7, style: 2,
      trim: (s) => smooth(0.62, 0.64, s) * smooth(0.72, 0.7, s),
    });
  }

  return b.finish({
    camY: 0.1,
    toy: athleteCfg(b, h0, h1, { pivot: [0, 2.02, 0.04], chest: [0, 1.6, 0.6], armR: arms[0].k, armL: arms[1].k }),
    furMask: [
      { chain: 'right arm', s0: 0.58, s1: 1, pile: 0 },
      { chain: 'left arm', s0: 0.58, s1: 1, pile: 0 },
    ],
  });
}
