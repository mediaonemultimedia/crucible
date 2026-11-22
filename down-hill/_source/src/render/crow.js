/* Zach Sparrow's body (bolster-models): Grommet's crow (shared/grommet/
   athletes/crow.rig.js, copied unmodified) with a new back end.

   Grommet's crow ran out behind into a rump (one ellipsoid) and then a flat
   tail (another), so the body stepped down into the tail with a seam and a
   stick-like join. Here the body is one smooth teardrop: a display grid
   laid along the line from the chest down to the tail, full where it meets
   the torso and tapering behind, and the tail grows out of its point as a
   fan of five layered plush feathers — flat free chains rooted inside the
   teardrop, so the fur closes over their roots, each a little shorter and
   lower toward the sides. The feathers are soft-body chains: they lag a
   hop, a hit or a turn and settle back (secondary motion), and the middle
   one wags when he's paying attention (Grommet's Athlete).

   Everything else (head, beak, wings, legs, felt feet, the physics bulk of
   the old rump and tail, so he stands the same) is the shared rig's. The
   wings and their felt primaries are run (a)'s (plush.js `rig`, attire.js),
   untouched. Render only — nothing here reaches the sim.                  */

import { RigBuilder, smooth, spline, rotX } from '../../shared/grommet/rigbuilder.js';
import { standingBody, athleteCfg } from '../../shared/grommet/athletes/standing.js';
import { CROW } from '../../shared/grommet/athletes/crow.rig.js';

function torsoX(T, y, z) {
  const dy = (y - T.c[1]) / T.r[1];
  const b = T.bulge(Math.acos(Math.max(-1, Math.min(1, dy))));
  const dz = (z - T.c[2]) / (T.r[2] * b);
  return T.r[0] * b * Math.sqrt(Math.max(0, 1 - dy * dy - dz * dz));
}

/* the teardrop: its long axis (local +y) points from the tail up into the
   chest; phi = 0 the full end (inside the torso), phi = π the tail point */
const AX = 1.28;                 // rotX: local +y → [0, cos, sin] (forward and up)
export const BACK = {
  c: [0, 0.92, -0.52], r: [0.5, 0.78, 0.46], B: rotX(AX),
  bulge: (phi) => 1 - 0.58 * smooth(0.42 * Math.PI, Math.PI, phi) + 0.04 * Math.sin(phi),
};

export function buildCrowPlush() {
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
    pile: (u, v, l) => 0.8 + 0.25 * smooth(0.4, 0.9, l[1]) - 0.25 * smooth(0.55, 0.9, l[2]) * smooth(0.4, -0.2, l[1]),
  });

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

  // the old rump and tail stay as stuffing (he stands and falls the same);
  // what's drawn is the teardrop
  const RUMP = { c: [0, 0.86, -0.6], r: [0.42, 0.34, 0.56], B: rotX(-0.42) };
  const TAIL = { c: [0, 0.6, -1.1], r: [0.21, 0.07, 0.42], B: rotX(-0.36), bulge: (phi) => 0.8 + 0.4 * Math.sin(phi) };
  b.bulk(0, RUMP, 22, (d) => d[2] > 0.3);
  b.bulk(0, TAIL, 14);
  b.grid({
    name: 'back', cloud: 0, ...BACK, U: 44, V: 28, accent: () => 1,
    // the pile shortens toward the point, where the feathers take over
    pile: (u, v) => 0.95 - 0.3 * smooth(0.6, 1, v),
  });

  // the tail: five flat plush feathers fanned out of the teardrop's point,
  // the middle one longest and on top, each pair shorter, lower and turned
  // further out; broad paddles with a rounded end
  const ROOT = [0, 0.84, -0.9];
  const fan = [[0, 1, 0.0], [-0.2, 0.94, -0.025], [0.2, 0.94, -0.025], [-0.4, 0.86, -0.05], [0.4, 0.86, -0.05]];
  let mid = null;
  for (const [a, k, dy] of fan) {
    const len = 0.92 * k;
    const dir = [Math.sin(a) * 0.95, -0.14, -Math.cos(a)];
    const dl = Math.hypot(...dir);
    const d = dir.map((v) => v / dl);
    const r0 = [ROOT[0] + d[0] * 0.04, ROOT[1] + dy, ROOT[2] - 0.02];
    const ch = b.chain({
      name: a === 0 ? 'tail' : `tail feather ${a < 0 ? 'r' : 'l'}${Math.abs(a) > 0.3 ? 2 : 1}`, kind: 'tail', cloud: 0, n: 5,
      anchor: [ROOT[0] * 0.5, ROOT[1] + 0.06, ROOT[2] + 0.3],
      // a slight upward curl toward the end
      path: (u) => [r0[0] + d[0] * len * u, r0[1] + d[1] * len * u + 0.1 * len * u * u, r0[2] + d[2] * len * u],
      radius: (u) => 0.12 + 0.08 * Math.sin(Math.PI * Math.min(1, 0.25 + u * 0.7)) - 0.03 * smooth(0.85, 1, u),
      ref: [0, 1, 0], flat: 0.32, bend: 2.4, mem: 3, stretch: 1.12, skip: 2, AS: 16, AA: 16, CAP: 6,
      accent: () => 1, pile: (u) => 0.75 - 0.25 * u,
    });
    if (a === 0) mid = ch;
  }
  void mid;

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
