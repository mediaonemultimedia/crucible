import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRig } from '../src/rig.js';
import { SoftBody } from '../src/softbody.js';

const run = (b, sec) => { for (let t = 0; t < sec; t += 1 / 60) b.step(1 / 60); };

test('settles at rest: keeps volume, nothing through the floor', () => {
  const b = new SoftBody(buildRig());
  run(b, 3);
  const vr = b.volumeRatio();
  assert.ok(vr > 0.9 && vr < 1.1, `volume ratio ${vr}`);
  for (let i = 0; i < b.n; i++) assert.ok(b.x[i * 3 + 1] >= b.r[i] - 1e-3, `particle ${i} below floor`);
  assert.ok(b.kinetic() < 1e-2, `kinetic ${b.kinetic()}`);
  assert.ok(b.headC[1] > 0.9, `head sank to ${b.headC[1]}`);
});

test('pulling an arm tip stretches it, release rebounds and settles', () => {
  const rig = buildRig();
  const b = new SoftBody(rig);
  run(b, 1.5);
  const tip = rig.arms[0].idx[rig.arms[0].idx.length - 1];
  const t0 = [b.x[tip * 3], b.x[tip * 3 + 1], b.x[tip * 3 + 2]];
  const len0 = armLen(b, rig.arms[0].idx);
  const dir = [t0[0] - b.headC[0], 0, t0[2] - b.headC[2]];
  const dn = Math.hypot(...dir);
  b.grab('h', tip, [t0[0] + dir[0] / dn * 1.5, t0[1] + 0.6, t0[2] + dir[2] / dn * 1.5]);
  run(b, 1);
  const len1 = armLen(b, rig.arms[0].idx);
  assert.ok(len1 > len0 * 1.04, `arm did not stretch: ${len0} → ${len1}`);
  b.release('h');
  let peak = 0;
  for (let t = 0; t < 4; t += 1 / 60) { b.step(1 / 60); peak = Math.max(peak, b.kinetic()); }
  assert.ok(peak > 0.05, 'no rebound motion');
  assert.ok(b.kinetic() < 2e-2, `still moving: ${b.kinetic()}`);
});

test('a grab target that jumps across the scene drags, never explodes', () => {
  const rig = buildRig();
  const b = new SoftBody(rig);
  run(b, 1);
  const tip = rig.arms[1].idx[11];
  b.grab('j', tip, [b.x[tip * 3] + 5, b.x[tip * 3 + 1] + 4, b.x[tip * 3 + 2]]);
  run(b, 2);
  assert.ok(b.x.every(Number.isFinite), 'NaN');
  assert.ok(!b.nanResets, 'needed a NaN reset');
});

test('uneven browser frame times still settle (fixed-step clock)', () => {
  const b = new SoftBody(buildRig());
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let t = 0; t < 6; ) { const dt = (1 / 60) * (0.6 + rnd() * 0.8); b.advance(dt); t += dt; }
  let peak = 0;
  for (let k = 0; k < 60; k++) { b.advance((1 / 60) * (0.6 + rnd() * 0.8)); peak = Math.max(peak, b.kinetic()); }
  assert.ok(peak < 2e-2, `still jittering: peak kinetic ${peak}`);
});

test('fast frame', () => {
  const b = new SoftBody(buildRig());
  const t = performance.now();
  run(b, 2);
  const ms = (performance.now() - t) / 120;
  console.log(`  ${b.n} points, ${ms.toFixed(3)} ms/frame`);
  assert.ok(ms < 3);
});

function armLen(b, idx) {
  let L = 0;
  for (let j = 1; j < idx.length; j++) {
    const a = idx[j - 1], c = idx[j];
    L += Math.hypot(b.x[a * 3] - b.x[c * 3], b.x[a * 3 + 1] - b.x[c * 3 + 1], b.x[a * 3 + 2] - b.x[c * 3 + 2]);
  }
  return L;
}
