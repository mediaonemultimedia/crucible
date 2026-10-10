/* The otter: a sleek plush juggler, sitting up.

   A long pear of a body sat on its bottom (a flat ring of points under it
   is what it sits on — a wider footprint than any biped's, so it never
   needs feet), a small round head on top as firm bulk, a cream face and
   chest, a broad cream muzzle with whisker dots and a dark nose, little
   round ears, short arms held up in front with round paws (they juggle),
   short hind legs out in front on the floor, and the flat rudder of a tail
   lying out behind. Short, dense, glossy pile.

   He faces +z; his right is −x. Units: 1 = 9 cm; about 24 cm sitting up. */

import { RigBuilder, smooth, rotX, lerp3, spline } from '../rigbuilder.js';
import { athleteCfg } from './standing.js';

export const OTTER = {
  TORSO: { c: [0, 1.02, 0], r: [0.6, 0.98, 0.54], B: null, bulge: (phi) => 0.78 + 0.32 * (phi / Math.PI) ** 1.4 },
  HEAD: { c: [0, 2.12, 0.1], r: [0.48, 0.42, 0.46], B: null, bulge: (phi) => 1 + 0.05 * Math.sin(phi) },
  SHOULDER: 0.38, SHOULDER_Y: 1.62, SHOULDER_Z: 0.18, ARM_LEN: 0.72,
  PIVOT: [0, 1.82, 0.08],
};

export function buildOtter() {
  const b = new RigBuilder('otter');
  const { TORSO, HEAD } = OTTER;
  b.cloud(TORSO, { shell: 90, core: 12, k: 2.6, k0: 0.16 });
  const h0 = b.rad.length;
  b.bulk(0, HEAD, 60, (d) => d[1] < -0.6);
  b.bulk(0, { ...HEAD, r: HEAD.r.map((v) => v * 0.55) }, 8);
  const h1 = b.rad.length;
  // the seat: a flat ring of points (and one in the middle) right on the
  // floor under his bottom
  const pr = 0.08;
  b.clouds[0].ix.push(b.add([0, pr, 0.02], pr));
  for (const [R, m] of [[0.3, 8], [0.5, 14]]) {
    for (let k = 0; k < m; k++) {
      const a = (k / m) * Math.PI * 2;
      b.clouds[0].ix.push(b.add([Math.sin(a) * R, pr, 0.02 + Math.cos(a) * R * 0.92], pr));
    }
  }

  b.grid({
    name: 'torso', cloud: 0, ...TORSO, U: 56, V: 38,
    // the cream bib: the front, from the chin to the belly
    under: (u, v, l) => smooth(0.25, 0.55, l[2] - 0.2 * Math.abs(l[0])) * smooth(-0.55, -0.2, l[1]) * smooth(1.0, 0.75, l[1]),
    pile: () => 0.9,
  });
  b.grid({
    name: 'head', cloud: 0, ...HEAD, U: 60, V: 38, eye: true,
    under: (u, v, l) => smooth(0.35, 0.7, l[2]) * smooth(0.25, -0.1, l[1]),
    pile: (u, v, l) => 0.85,
  });
  // a broad cream muzzle (two whisker pads) and a dark nose on it
  b.grid({ name: 'muzzle', cloud: 0, c: [0, 1.97, 0.5], r: [0.3, 0.18, 0.2], B: rotX(0.08), U: 32, V: 22, under: () => 1, pile: () => 0.55 });

  // little round ears, low on the sides of the head
  for (const s of [-1, 1]) {
    b.chain({
      name: s < 0 ? 'right ear' : 'left ear', kind: 'ear', cloud: 0, n: 3,
      anchor: [s * 0.34, 2.3, 0.02],
      path: (u) => [s * (0.42 + 0.06 * u), 2.36 + 0.07 * u, 0.0],
      radius: (u) => 0.08 + 0.03 * Math.sin(Math.PI * u),
      ref: [0, 0, 1], flat: 0.55, bend: 3, mem: 6, stretch: 1.05, skip: 2, AS: 10, AA: 14, CAP: 6,
      under: (u, c) => smooth(0.3, 0.8, c) * 0.6, pile: () => 0.6,
    });
  }

  // arms: short, held up in front, paws together-ish at the chest — the
  // juggling posture is their sewn pose
  const arms = [];
  for (const s of [-1, 1]) {
    const root = [s * OTTER.SHOULDER, OTTER.SHOULDER_Y, OTTER.SHOULDER_Z];
    let d = [s * 0.25, -0.62, 0.74];
    const dl = Math.hypot(...d);
    d = d.map((v) => v / dl);
    const L = OTTER.ARM_LEN;
    const end = [root[0] + d[0] * L, root[1] + d[1] * L, root[2] + d[2] * L];
    const mid = lerp3(root, end, 0.5);
    mid[1] += 0.03;
    arms.push(b.chain({
      name: s < 0 ? 'right arm' : 'left arm', kind: 'arm', cloud: 0, n: 5,
      anchor: [s * 0.2, 1.6, 0.06],
      path: spline([root, mid, end]),
      radius: (u) => 0.13 - 0.02 * u + 0.035 * smooth(0.7, 0.95, u) * (1 - 0.5 * smooth(0.95, 1, u)),
      ref: [0, -1, 0], bend: 3, mem: 6, stretch: 1.12, skip: 3, AS: 16, AA: 18, CAP: 7, pile: () => 0.8,
      accent: (u) => smooth(0.72, 0.9, u),
    }));
  }

  // hind legs: short, out in front along the floor, broad webbed feet
  for (const s of [-1, 1]) {
    b.chain({
      name: s < 0 ? 'right leg' : 'left leg', kind: 'leg', cloud: 0, n: 4, inCloud: true,
      anchor: [s * 0.22, 0.4, 0.12],
      path: spline([[s * 0.3, 0.3, 0.2], [s * 0.36, 0.17, 0.48], [s * 0.4, 0.13, 0.72]]),
      radius: (u) => 0.15 + 0.05 * smooth(0.6, 1, u), ref: [0, 1, 0], flat: 0.7, bend: 2.4, mem: 2.5,
      AS: 14, AA: 16, CAP: 7, accent: (u) => smooth(0.55, 0.85, u), pile: () => 0.75,
    });
  }

  // the tail: a thick flat rudder, lying out behind on the floor
  b.chain({
    name: 'tail', kind: 'tail', cloud: 0, n: 7, anchor: [0, 0.4, -0.3],
    path: spline([[0, 0.32, -0.5], [0.05, 0.16, -0.85], [0.18, 0.12, -1.25], [0.36, 0.12, -1.6], [0.5, 0.13, -1.85]]),
    radius: (u) => 0.21 - 0.12 * u, ref: [0, 1, 0], flat: 0.45, bend: 1.8, mem: 1.4, stretch: 1.15, AS: 26, AA: 16, CAP: 7,
    pile: () => 0.7,
  });

  // terry wristbands: a juggler's
  for (const ch of arms) {
    b.clothTube({ name: ch.name + ' band', chain: ch.k, s0: 0.56, s1: 0.72, rs: 1.15, rAdd: 0.035, AS: 6, AA: 18, style: 3 });
  }

  return b.finish({
    camY: 0.1,
    furMask: [
      { chain: 'right arm', s0: 0.55, s1: 0.73, pile: 0 },
      { chain: 'left arm', s0: 0.55, s1: 0.73, pile: 0 },
    ],
    toy: athleteCfg(b, h0, h1, {
      pivot: OTTER.PIVOT, chest: [0, 1.35, 0.6],
      armR: arms[0].k, armL: arms[1].k,
    }),
  });
}
