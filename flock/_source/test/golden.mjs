/* Octopus regression fingerprint: a scripted session through every physics
   path (idle, grab + jump, finger, squish plane, stick reach/coil/lift),
   hashed bit-for-bit. Phase 1 code produced GOLDEN; generalising the rigs
   must not change a single bit of it.                                     */
import { createHash } from 'node:crypto';
import { buildRig } from '../src/rig.js';
import { SoftBody } from '../src/softbody.js';
import { Grasp } from '../src/grasp.js';
import { Idle } from '../src/idle.js';

export function octopusFingerprint() {
  const rig = buildRig();
  const b = new SoftBody(rig);
  const g = new Grasp(b);
  const idle = new Idle(b);
  const tick = (sec) => { for (let t = 0; t < sec; t += 1 / 60) b.advance(1 / 60, (h) => g.update(h)); };
  tick(1.5);
  const tip = rig.arms[2].idx[13];
  b.grab('h', tip, [b.x[tip * 3] + 5, b.x[tip * 3 + 1] + 3, b.x[tip * 3 + 2]]);
  tick(1);
  b.release('h');
  b.spheres.push({ x: 0, y: 2.2, z: 0.3, r: 0.27 });
  tick(0.5);
  b.spheres = [];
  b.planes = [{ y: 1.6 }];
  tick(0.6);
  b.planes = [];
  const m = rig.arms[0].idx[10];
  const px = b.x[m * 3], pz = b.x[m * 3 + 2];
  const dx = px - b.headC[0], dz = pz - b.headC[2], dl = Math.hypot(dx, dz);
  b.stick = { a: [px + dz / dl * 2, 0.45, pz - dx / dl * 2], b: [px - dz / dl * 2, 0.45, pz + dx / dl * 2], r: 0.07 };
  tick(3);
  for (let t = 0; t < 2; t += 1 / 60) { b.stick.a[1] += 0.02; b.stick.b[1] += 0.02; b.advance(1 / 60, (h) => g.update(h)); }
  idle.amount = 1;
  tick(1);
  const h = createHash('sha256');
  h.update(Buffer.from(b.x.buffer));
  h.update(Buffer.from(b.v.buffer));
  return h.digest('hex');
}

if (process.argv[1] && process.argv[1].endsWith('golden.mjs')) console.log(octopusFingerprint());
