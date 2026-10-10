/* The penguin: a round standing plush batter.

   An egg of a body — black back, white front — with the head as a firm
   bump on top (black, a white face round the bead eyes), a stubby orange
   felt beak, flat flippers (the right one sewn straight, down and forward:
   it holds the bat, and every swing is a rotation of it about the
   shoulder, as with the leopard's racquet arm), a little flat tail, and
   broad orange felt feet. A felt ball cap in his team colour. The bat is a
   rigid prop (props.js) gripped in the right flipper.

   He faces +z, toward the pitcher; his right is −x, where the plate is.
   Units: 1 = 9 cm; he stands about 24 cm tall.                           */

import { RigBuilder, smooth, rotX, lerp3 } from '../rigbuilder.js';
import { standingBody, athleteCfg } from './standing.js';

export const PENGUIN = {
  TORSO: { c: [0, 1.2, 0], r: [0.74, 0.86, 0.66], B: null, bulge: (phi) => 0.86 + 0.2 * (phi / Math.PI) },
  HEAD: { c: [0, 2.1, 0.06], r: [0.54, 0.5, 0.52], B: null, bulge: (phi) => 1 + 0.04 * Math.sin(phi) },
  SHOULDER: 0.6, SHOULDER_Y: 1.62, ARM_LEN: 0.82,
  FOOT: { c: [0.3, 0.08, 0.26], r: [0.22, 0.08, 0.34] },
};

export function buildPenguin() {
  const b = new RigBuilder('penguin');
  const { TORSO, HEAD, FOOT } = PENGUIN;
  const { h0, h1 } = standingBody(b, {
    TORSO, HEAD,
    hip: [0.26, 0.52, 0.06], foot: [0.3, 0.16, 0.14], legR: 0.12,
    FOOT,
    // the white shirt-front: most of the front, up to the chin
    torsoLook: { under: (u, v, l) => smooth(0.3, 0.5, l[2] - 0.25 * Math.abs(l[0])) * smooth(0.8, 0.6, l[1]), pile: () => 0.9 },
    footLook: { pile: () => 0 },
    legLook: { pile: () => 0 },
  });

  b.grid({
    name: 'head', cloud: 0, ...HEAD, U: 60, V: 40, eye: true,
    // a white face below the cap, round the eyes, down to the chin
    under: (u, v, l) => smooth(0.5, 0.68, l[2] - 0.35 * Math.max(0, l[1] - 0.05)) * smooth(0.36, 0.22, l[1]),
    pile: (u, v, l) => 0.85 - 0.2 * smooth(0.5, 0.9, l[2]),
  });
  // the beak: a stubby felt wedge, a touch down
  b.grid({ name: 'beak', cloud: 0, c: [0, 1.97, 0.62], r: [0.16, 0.11, 0.27], B: rotX(0.25), U: 28, V: 18, pile: () => 0 });

  // flippers: flat (thin across the body's side), black with a white
  // underside. The right one straight, down and forward, holding the bat;
  // the left one down his side, a little out
  const arms = [];
  for (const s of [-1, 1]) {
    const root = [s * PENGUIN.SHOULDER, PENGUIN.SHOULDER_Y, 0.06];
    let d = s < 0 ? [-0.42, -0.72, 0.55] : [0.36, -0.9, 0.12];
    const dl = Math.hypot(...d);
    d = d.map((v) => v / dl);
    const L = PENGUIN.ARM_LEN;
    const end = [root[0] + d[0] * L, root[1] + d[1] * L, root[2] + d[2] * L];
    arms.push(b.chain({
      name: s < 0 ? 'right flipper' : 'left flipper', kind: 'arm', cloud: 0, n: 6,
      anchor: [s * 0.36, 1.62, 0.04],
      path: (u) => lerp3(root, end, u),
      radius: (u) => 0.21 - 0.07 * u - 0.05 * smooth(0.8, 1, u),
      ref: [s, 0, 0], flat: 0.36, bend: 3, mem: s < 0 ? 7 : 5, stretch: 1.1, skip: 3, AS: 20, AA: 20, CAP: 7,
      pile: () => 0.7,
    }));
  }

  // a short flat tail at the back, down by the floor
  b.chain({
    name: 'tail', kind: 'tail', cloud: 0, n: 3, anchor: [0, 0.55, -0.42],
    path: (u) => [0, 0.42 - 0.12 * u, -0.62 - 0.22 * u],
    radius: (u) => 0.16 - 0.04 * u, ref: [0, 1, 0], flat: 0.4, bend: 3, mem: 4, stretch: 1.06, skip: 2, AS: 10, AA: 16, CAP: 6, pile: () => 0.6,
  });

  /* ── the kit ──────────────────────────────────────────────────────────── */
  // broad orange felt feet over the soles
  for (const s of [-1, 1]) {
    b.clothGrid({
      name: s < 0 ? 'right foot' : 'left foot', cloud: 0, c: [s * FOOT.c[0], FOOT.c[1], FOOT.c[2]], r: FOOT.r.map((v) => v + 0.025),
      vr: [0, 1], U: 24, V: 12, style: 0,
    });
  }
  // a felt ball cap: a crown over the top of the head, and a brim
  b.clothGrid({
    name: 'cap', cloud: 0, c: HEAD.c, r: HEAD.r.map((v) => v + 0.05), bulge: HEAD.bulge, vr: [0, 0.31], U: 56, V: 12, style: 0,
    trim: () => 1,
  });
  b.clothGrid({
    name: 'brim', cloud: 0, c: [0, HEAD.c[1] + 0.27, HEAD.c[2] + 0.42], r: [0.34, 0.035, 0.26], B: rotX(-0.12), U: 32, V: 10, style: 0,
    trim: () => 1,
  });

  return b.finish({
    camY: 0.1,
    toy: athleteCfg(b, h0, h1, {
      pivot: [0, 1.74, 0.04], chest: [0, 1.4, 0.6],
      armR: arms[0].k, armL: arms[1].k,
    }),
    furMask: [
      { part: 'head', v0: 0, v1: 0.32, pile: 0.1 },
      { part: 'beak', v0: 0, v1: 1, pile: 0 },
      { part: 'foot', v0: 0, v1: 1, pile: 0 },
      { chain: 'right leg', s0: 0, s1: 1, pile: 0 },
      { chain: 'left leg', s0: 0, s1: 1, pile: 0 },
    ],
    bat: { arm: arms[0].k },
  });
}
