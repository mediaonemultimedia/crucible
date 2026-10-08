/* The leopard: a standing plush tennis player.

   Round head with small rounded ears (dark backs), cream muzzle and chest,
   golden fur painted with rosettes under the pile, a ringed tail curled on
   the court, and his kit: a white polo (short sleeves, collar) and a white
   terry headband. The racquet is held in the right paw (his right is −x:
   he faces the camera, +z). Units: 1 = 9 cm; he stands about 29 cm tall.

   His right arm is sewn nearly straight, pointing down and forward: every
   stroke is a rotation of that straight arm about the shoulder (pose.js),
   so the swing never fights the arm's own sewn bend.                       */

import { RigBuilder, smooth, rotX, spline, lerp3 } from '../rigbuilder.js';
import { standingBody, athleteCfg } from './standing.js';

export const LEOPARD = {
  TORSO: { c: [0, 1.42, 0], r: [0.6, 0.6, 0.48], B: null, bulge: (phi) => 0.92 + 0.14 * (phi / Math.PI) },
  HEAD: { c: [0, 2.52, 0.06], r: [0.74, 0.64, 0.64], B: null, bulge: (phi) => 1 + 0.07 * Math.sin(phi * 1.25) },
  SHOULDER: 0.5, SHOULDER_Y: 1.86, ARM_LEN: 0.86,
};

export function buildLeopard() {
  const b = new RigBuilder('leopard');
  const { TORSO, HEAD } = LEOPARD;
  const { h0, h1 } = standingBody(b, {
    TORSO, HEAD,
    hip: [0.28, 0.98, 0.02], foot: [0.31, 0.24, 0.08], legR: 0.18,
    FOOT: { c: [0.31, 0.15, 0.15], r: [0.23, 0.15, 0.31] },
    torsoLook: { under: (u, v, l) => smooth(0.2, 0.7, l[2]) * smooth(0.4, -0.3, l[1]) * 0.9 },
    footLook: { under: (u, v, l) => smooth(-0.2, -0.6, l[1]) * 0.8 + smooth(0.6, 0.95, l[2]) * 0.3 },
    legLook: { under: (s, c) => 0.25 * smooth(0.3, 0.9, c) },
  });

  b.grid({
    name: 'head', cloud: 0, ...HEAD, U: 64, V: 40, eye: true,
    under: (u, v, l) => Math.max(smooth(0.3, 0.7, l[2]) * smooth(-0.05, -0.45, l[1]),
      smooth(0.5, 0.85, Math.abs(l[0])) * smooth(-0.1, -0.5, l[1]) * smooth(-0.1, 0.3, l[2]) * 0.8),
  });
  b.grid({ name: 'muzzle', cloud: 0, c: [0, 2.32, 0.62], r: [0.32, 0.21, 0.2], B: rotX(0.1), U: 32, V: 22, under: () => 1, pile: () => 0.55 });

  // small rounded ears: dark backs, cream inside
  for (const s of [-1, 1]) {
    b.chain({
      name: s < 0 ? 'right ear' : 'left ear', kind: 'ear', cloud: 0, n: 4,
      anchor: [s * 0.36, 2.86, 0.0],
      path: (u) => [s * (0.47 + 0.08 * u), 2.98 + 0.22 * u, 0.03 + 0.03 * u],
      radius: (u) => 0.075 + 0.115 * Math.sin(Math.PI * Math.min(1, 0.2 + u * 0.75)),
      ref: [0, 0, 1], flat: 0.55, bend: 3, mem: 6, stretch: 1.05, skip: 2, AS: 14, AA: 16, CAP: 6,
      under: (u, c) => smooth(0.3, 0.75, c) * smooth(0.25, 0.45, u),
      accent: (u, c) => smooth(-0.05, -0.45, c) * smooth(0.15, 0.4, u),
      pile: () => 0.7,
    });
  }

  // arms: the right one straight, down and forward, holding the racquet;
  // the left one hanging a little out from the side
  const arms = [];
  for (const s of [-1, 1]) {
    const root = [s * LEOPARD.SHOULDER, LEOPARD.SHOULDER_Y, 0.02];
    let d = s < 0 ? [-0.42, -0.72, 0.55] : [0.42, -0.86, 0.2];
    const dl = Math.hypot(...d);
    d = d.map((v) => v / dl);
    const L = LEOPARD.ARM_LEN;
    const end = [root[0] + d[0] * L, root[1] + d[1] * L, root[2] + d[2] * L];
    // a whisper of a bend at the elbow so the tube doesn't read as a pipe
    const mid = lerp3(root, end, 0.5);
    mid[1] += 0.03; mid[2] += s < 0 ? -0.02 : 0.03;
    arms.push(b.chain({
      name: s < 0 ? 'right arm' : 'left arm', kind: 'arm', cloud: 0, n: 6,
      anchor: [s * 0.28, 1.86, 0.0],
      path: spline([root, mid, end]),
      radius: (u) => 0.145 - 0.025 * u + 0.05 * smooth(0.72, 0.97, u) * (1 - 0.5 * smooth(0.97, 1, u)),
      ref: [0, -1, 0], bend: 3, mem: s < 0 ? 7 : 4, stretch: 1.12, skip: 3, AS: 20, AA: 18, CAP: 7,
      under: (u, c) => 0.6 * smooth(0.85, 0.97, u) * smooth(0.2, 0.8, c),
    }));
  }

  // the ringed tail: down from the back, along the court and curling up
  const ring = (u) => {
    if (u > 0.93) return 1;
    const f = (u * 6.5 + 0.3) % 1;
    return u > 0.3 ? smooth(0.0, 0.07, f) * smooth(0.32, 0.24, f) : 0;
  };
  b.chain({
    name: 'tail', kind: 'tail', swish: true, cloud: 0, n: 10, anchor: [0, 1.05, -0.3],
    path: spline([[0, 0.96, -0.5], [0.08, 0.62, -0.82], [0.32, 0.26, -0.98], [0.72, 0.14, -0.9], [1.0, 0.18, -0.56], [1.1, 0.42, -0.3]]),
    radius: (u) => 0.1 - 0.015 * u + 0.012 * smooth(0.9, 1, u),
    ref: [0, -1, 0], bend: 1.4, mem: 0.9, stretch: 1.25, AS: 40, AA: 16, CAP: 7,
    accent: (u) => ring(u), pile: () => 1.1,
  });

  /* ── the kit ──────────────────────────────────────────────────────────── */
  // polo: a shell over the torso from the collar to the hem, sleeves over
  // the upper arms, a collar round the neck; the hem and cuffs swing free
  const SH = { c: TORSO.c, r: [TORSO.r[0] + 0.085, TORSO.r[1] + 0.06, TORSO.r[2] + 0.085], bulge: TORSO.bulge };
  b.clothGrid({
    name: 'shirt', cloud: 0, ...SH, vr: [0.17, 0.73], U: 64, V: 30, style: 1,
    sway: (u, v) => smooth(0.45, 0.73, v), trim: (u, v) => smooth(0.705, 0.715, v),
  });
  b.clothGrid({
    name: 'collar', cloud: 0, c: [0, 2.0, 0.03], torus: { R: 0.36, r: 0.075 }, B: rotX(Math.PI / 2 - 0.32), U: 44, V: 12, style: 0,
    trim: (u, v, l) => 0,
  });
  for (const ch of arms) {
    b.clothTube({
      name: ch.name + ' sleeve', chain: ch.k, s0: 0.0, s1: 0.4, rs: 1.25, rAdd: 0.06, AS: 12, AA: 20, style: 0,
      sway: (s) => smooth(0.15, 0.4, s) * 0.7, trim: (s) => smooth(0.33, 0.345, s) * smooth(0.375, 0.36, s),
    });
  }
  // the terry headband round the brow, just above the eyes
  b.clothGrid({
    name: 'headband', cloud: 0, c: HEAD.c, r: HEAD.r.map((v) => v + 0.065), bulge: HEAD.bulge, vr: [0.265, 0.365], U: 72, V: 8, style: 3,
  });

  const rig = b.finish({
    camY: 0.1,
    toy: athleteCfg(b, h0, h1, {
      pivot: [0, 2.02, 0.02], chest: [0, 1.6, 0.5],
      armR: arms[0].k, armL: arms[1].k,
    }),
    // fur under the clothes: no pile (so it can't poke through the cotton)
    furMask: [
      { part: 'torso', v0: 0.16, v1: 0.745, pile: 0 },
      { part: 'head', v0: 0.255, v1: 0.375, pile: 0.15 },
      { chain: 'right arm', s0: 0, s1: 0.41, pile: 0 },
      { chain: 'left arm', s0: 0, s1: 0.41, pile: 0 },
    ],
    racquet: { arm: arms[0].k },
  });
  return rig;
}
