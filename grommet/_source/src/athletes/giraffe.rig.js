/* The giraffe: a tall plush who plays ring toss with his head.

   Four stuffed legs under a long body (one shape-matched cloud, the legs
   inCloud chains on broad flat soles, as the bipeds' are), a long soft
   neck rising from the front of it (a chain, like Flock's llama's), and a
   small head that is a second cloud riding on the top of the neck: it
   shares the neck's last two points and remembers how it sat on the body.
   On the head: two felt ossicones with dark tufted tips (stiff little
   chains), leaf ears, a soft muzzle, bead eyes. Golden-cream fur with
   brown patches printed under it, a short dark mane down the back of the
   neck, a tail with a tuft, felt hooves.
   He faces +z; his right is −x. Units: 1 = 9 cm; about 42 cm tall.       */

import { RigBuilder, smooth, rotX, lerp3, add3 } from '../rigbuilder.js';

export const GIRAFFE = {
  BODY: { c: [0, 1.9, -0.1], r: [0.55, 0.5, 0.84], B: null, bulge: (phi) => 1 + 0.05 * Math.sin(phi) },
  HEAD: { c: [0, 4.22, 1.1], r: [0.24, 0.23, 0.3], B: rotX(0.3), bulge: null },
  NECK: { root: [0, 2.22, 0.5], top: [0, 4.02, 0.98], r0: 0.22, r1: 0.15, n: 8 },
  LEGS: { x: 0.3, yTop: 1.62, front: 0.44, back: -0.62, r: 0.14 },
  // the two ossicones: sewn on top of the head, little felt horns
  HORN: { base: [0.09, 4.4, 1.02], tip: [0.12, 4.68, 0.98], r: 0.045, knob: 0.04 },
};

export const LEG_NAMES = ['right fore', 'left fore', 'right hind', 'left hind'];

export function buildGiraffe() {
  const b = new RigBuilder('giraffe');
  const { BODY, HEAD, NECK, LEGS, HORN } = GIRAFFE;
  b.cloud(BODY, { shell: 96, core: 12, k: 2.6, k0: 0.16 });
  const body = 0;

  // four legs that carry him, each on a flat sole (a ring of points right on
  // the floor, and one in the middle) so he stands on a footprint
  const legs = [];
  const feet = [];
  let li = 0;
  for (const z of [LEGS.front, LEGS.back]) {
    for (const s of [-1, 1]) {
      const top = [s * LEGS.x, LEGS.yTop, z], ft = [s * (LEGS.x + 0.01), 0.22, z * 1.02];
      legs.push(b.chain({
        name: LEG_NAMES[li] + ' leg', kind: 'leg', cloud: body, n: 5, inCloud: true,
        anchor: [s * LEGS.x * 0.7, 1.86, z * 0.85],
        path: (u) => lerp3(top, ft, u),
        radius: (u) => LEGS.r + 0.012 * Math.sin(u * Math.PI) + 0.025 * smooth(0.75, 1, u),
        ref: [0, 0, 1], bend: 2.4, mem: 2.5, AS: 16, AA: 16, CAP: 0,
        under: (u, c) => 0.45 * smooth(0.2, -0.8, c * s) * (1 - smooth(0.7, 0.85, u)),
      }));
      const F = { c: [s * (LEGS.x + 0.01), 0.12, z * 1.02], r: [0.17, 0.12, 0.18] };
      b.bulk(body, F, 10, (d) => d[1] > -0.2);
      const pr = 0.07;
      b.clouds[body].ix.push(b.add([F.c[0], pr, F.c[2]], pr));
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        b.clouds[body].ix.push(b.add([F.c[0] + Math.sin(a) * (F.r[0] - pr) * 0.92, pr, F.c[2] + Math.cos(a) * (F.r[2] - pr) * 0.92], pr));
      }
      feet.push(b.grid({ name: LEG_NAMES[li] + ' foot', cloud: body, ...F, U: 24, V: 14 }));
      feet[li].F = F;
      li++;
    }
  }

  // the long neck, rising from the top of his front, bowed forward a little
  const neck = b.chain({
    name: 'neck', kind: 'neck', cloud: body, n: NECK.n, anchor: [0, 1.98, 0.3],
    path: (u) => { const p = lerp3(NECK.root, NECK.top, u); p[2] += 0.1 * Math.sin(u * Math.PI); return p; },
    radius: (u) => NECK.r0 + (NECK.r1 - NECK.r0) * u + 0.02 * smooth(0.15, 0, u),
    ref: [0, 0, 1], bend: 2.6, mem: 10, stretch: 1.16, skip: 3, AS: 34, AA: 24, CAP: 6,
    // a short dark mane down the back of the neck; a paler throat
    pile: (s, c) => 1 + 1.3 * smooth(-0.72, -0.95, c) * smooth(0.02, 0.1, s),
    accent: (s, c) => smooth(-0.7, -0.9, c) * smooth(0.02, 0.1, s),
    under: (s, c) => 0.7 * smooth(0.45, 0.95, c),
    groom: { ruf: 0.18 },
  });

  // the small head, its own cloud on top of the neck
  const head = b.cloud(HEAD, { shell: 40, core: 6, parent: body, mem: 24, k: 2, k0: 0.05 });
  b.clouds[head].ix.push(neck.idx[neck.idx.length - 1]);
  const h0 = b.rad.length;
  const MUZ = { c: add3(HEAD.c, [0, -0.1, 0.28]), r: [0.17, 0.15, 0.18], B: rotX(0.34) };
  b.bulk(head, MUZ, 14, (d) => d[2] < 0);
  const h1 = b.rad.length;
  b.grid({
    name: 'head', cloud: head, ...HEAD, U: 52, V: 34, eye: true,
    under: (u, v, l) => 0.5 * smooth(0.3, 0.85, l[2]) * smooth(0.1, -0.6, l[1]),
    pile: (u, v, l) => 0.85 + 0.25 * smooth(0.4, 0.9, l[1]),
  });
  b.grid({ name: 'muzzle', cloud: head, ...MUZ, U: 32, V: 22, under: () => 0.85, pile: () => 0.5 });

  // ossicones: short, stiff, a dark tufted knob on top
  const horns = [];
  for (const s of [-1, 1]) {
    const base = [s * HORN.base[0], HORN.base[1], HORN.base[2]], tip = [s * HORN.tip[0], HORN.tip[1], HORN.tip[2]];
    horns.push(b.chain({
      name: s < 0 ? 'right ossicone' : 'left ossicone', kind: 'horn', cloud: head, n: 3,
      anchor: [s * 0.05, 4.3, 1.04],
      path: (u) => lerp3(base, tip, u),
      radius: (u) => HORN.r + HORN.knob * smooth(0.55, 1, u),
      ref: [0, 0, 1], bend: 4, mem: 10, stretch: 1.2, skip: 2, AS: 12, AA: 14, CAP: 7,
      accent: (u) => smooth(0.55, 0.75, u), pile: (u) => 0.3 + 0.55 * smooth(0.6, 0.85, u),
    }));
  }

  // leaf ears, out to the sides and a little back
  for (const s of [-1, 1]) {
    b.chain({
      name: s < 0 ? 'right ear' : 'left ear', kind: 'ear', cloud: head, n: 4,
      anchor: [s * 0.13, 4.3, 1.02],
      path: (u) => [s * (0.2 + 0.28 * u), 4.3 + 0.05 * u - 0.04 * u * u, 1.0 - 0.08 * u],
      radius: (u) => 0.05 + 0.07 * Math.sin(Math.PI * Math.min(1, 0.25 + u * 0.72)),
      ref: [0, 0, 1], flat: 0.5, bend: 3, mem: 6, stretch: 1.15, skip: 2, AS: 14, AA: 16, CAP: 6,
      under: (u, c) => smooth(0.3, 0.8, c) * smooth(0.25, 0.45, u) * 0.6, pile: () => 0.7,
    });
  }

  // the tail: a thin cord hanging from his rump, a dark tuft at the end
  b.chain({
    name: 'tail', kind: 'tail', cloud: body, n: 5, anchor: [0, 1.98, -0.7],
    path: (u) => [0, 2.02 - 0.75 * u, -0.92 - 0.2 * u + 0.08 * u * u],
    radius: (u) => 0.05 + 0.055 * smooth(0.7, 1, u), ref: [0, -1, 0], bend: 2, mem: 3, stretch: 1.1, skip: 2,
    AS: 16, AA: 14, CAP: 6, accent: (u) => smooth(0.65, 0.8, u), pile: (u) => 0.6 + 1.8 * smooth(0.68, 0.9, u),
  });

  // the body: a paler belly
  b.grid({
    name: 'body', cloud: body, ...BODY, U: 60, V: 36,
    under: (u, v, l) => 0.6 * smooth(-0.35, -0.85, l[1]),
  });
  b.parts.unshift(b.parts.pop());

  // felt hooves over the bottom of each foot
  for (const f of feet) {
    b.clothGrid({ name: f.name.replace('foot', 'hoof'), cloud: body, c: f.F.c, r: f.F.r.map((v) => v + 0.02), vr: [0.5, 1], U: 24, V: 10, style: 0 });
  }

  b.tetherCloud(head, b.clouds[body].center, 1.2, body);

  // what the game needs: the head and what rides on it, the neck, the horns
  const headIx = [...new Set(b.clouds[head].ix)];
  const ears = b.chains.filter((c) => c.kind === 'ear');
  const riders = new Set();
  for (const c of [...ears, ...horns]) { riders.add(c.anchor); for (const i of c.idx) riders.add(i); }
  const core = headIx.filter((i) => !neck.idx.includes(i) && !riders.has(i));
  const all = [...headIx];
  for (const i of riders) if (!all.includes(i)) all.push(i);
  void h0; void h1;
  // (react off, as for Flock's llama: a neck swung over by its memory
  // mustn't shove the body across the floor the other way)
  return b.finish({
    camY: 0.4, react: true,
    toy: {
      posed: -1, core: Int32Array.from(core), head: Int32Array.from(all),
      // the head cloud's own points (the roots of ears and ossicones too):
      // what a turn of the head turns
      skull: Int32Array.from(headIx.filter((i) => !neck.idx.includes(i))),
      pivot: NECK.top, neck: neck.k, headCloud: head,
      ears: ears.map((e) => ({ k: e.k, ix: Int32Array.from(e.idx.slice(1)), root: e.idx[0] })),
      horns: horns.map((c) => c.k),
      tail: b.chains.find((c) => c.kind === 'tail').k,
      legs: legs.map((c) => c.k), arms: [],
    },
    furMask: feet.map((f) => ({ part: f.name, v0: 0.5, v1: 1, pile: 0 })),
  });
}
