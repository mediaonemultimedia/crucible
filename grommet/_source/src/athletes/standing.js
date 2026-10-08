/* Shared anatomy for a plush that stands on two legs.

   One stuffed cloud carries the torso, the head (as extra bulk, like Flock's
   fox and lion: a firmly sewn head that squishes but stays on), two legs
   (inCloud chains, so the stuffing holds them like the torso) and two broad
   flat feet. That is what keeps it upright: the whole cloud is shape-matched
   to its sewn pose, and the feet give it a footprint wider than its centre
   of mass ever strays — then balance.js leans it back up like a roly-poly.

   Arms, ears and tail are free chains on that cloud.                       */

import { smooth, lerp3 } from '../rigbuilder.js';

/* torso, head bulk, legs and feet; returns what the athlete needs to know */
export function standingBody(b, { TORSO, HEAD, hip, foot, legR, FOOT, torsoLook = {}, footLook = {}, legLook = {} }) {
  // the torso first, so its points are cloud 0's shell
  b.cloud(TORSO, { shell: 84, core: 12, k: 2.6, k0: 0.16 });
  const h0 = b.rad.length;
  b.bulk(0, HEAD, 64, (d) => d[1] < -0.62);
  b.bulk(0, { ...HEAD, r: HEAD.r.map((v) => v * 0.55) }, 8);
  const h1 = b.rad.length;

  const legs = [];
  for (const s of [-1, 1]) {
    const top = [s * hip[0], hip[1], hip[2]], ft = [s * foot[0], foot[1], foot[2]];
    legs.push(b.chain({
      name: s < 0 ? 'right leg' : 'left leg', kind: 'leg', cloud: 0, n: 4, inCloud: true,
      anchor: [s * hip[0] * 0.75, hip[1] + 0.25, hip[2]],
      path: (u) => lerp3(top, ft, u),
      radius: (u) => legR + 0.03 * smooth(0.6, 1, u), ref: [0, 0, 1], bend: 2.4, mem: 2.5,
      AS: 14, AA: 18, CAP: 0, ...legLook,
    }));
    const F = { c: [s * FOOT.c[0], FOOT.c[1], FOOT.c[2]], r: FOOT.r };
    // the soles: a flat ring of points (and one in the middle) right on the
    // floor, so it stands on a footprint, not rocking on a ball
    b.bulk(0, F, 10, (d) => d[1] > -0.2);
    const pr = 0.07;
    b.clouds[0].ix.push(b.add([F.c[0], pr, F.c[2]], pr));
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      b.clouds[0].ix.push(b.add([F.c[0] + Math.sin(a) * (F.r[0] - pr) * 0.92, pr, F.c[2] + Math.cos(a) * (F.r[2] - pr) * 0.92], pr));
    }
    b.grid({ name: 'foot', cloud: 0, ...F, U: 28, V: 16, ...footLook });
  }
  b.grid({ name: 'torso', cloud: 0, ...TORSO, U: 56, V: 36, ...torsoLook });
  return { h0, h1, legs };
}

/* the head points (bulk plus whatever rides on it: ears), and the chains */
export function athleteCfg(b, h0, h1, extra) {
  const core = [];
  for (let i = h0; i < h1; i++) core.push(i);
  const ears = b.chains.filter((c) => c.kind === 'ear');
  const head = [...core];
  for (const e of ears) head.push(e.anchor, ...e.idx);
  const tail = b.chains.find((c) => c.kind === 'tail');
  return {
    posed: 0, core: Int32Array.from(core), head: Int32Array.from(head),
    ears: ears.map((e) => ({ k: e.k, ix: Int32Array.from(e.idx.slice(1)), root: e.idx[0] })),
    tail: tail ? tail.k : -1,
    legs: b.chains.filter((c) => c.kind === 'leg').map((c) => c.k),
    arms: b.chains.filter((c) => c.kind === 'arm').map((c) => c.k),
    ...extra,
  };
}
