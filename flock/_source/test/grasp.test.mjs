import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRig } from '../src/rig.js';
import { SoftBody } from '../src/softbody.js';
import { Grasp } from '../src/grasp.js';

const step = (b, g, sec) => { for (let t = 0; t < sec; t += 1 / 60) { g.update(1 / 60); b.step(1 / 60); } };

function setup() {
  const rig = buildRig();
  const b = new SoftBody(rig);
  const g = new Grasp(b);
  step(b, g, 1.5);
  // lay a stick across arm 0's distal half, just above it
  const idx = rig.arms[0].idx, m = idx[10];
  const px = b.x[m * 3], pz = b.x[m * 3 + 2];
  const dx = px - b.headC[0], dz = pz - b.headC[2], dl = Math.hypot(dx, dz);
  const sx = -dz / dl, sz = dx / dl;   // perpendicular to the arm
  const y = 0.45;
  b.stick = { a: [px - sx * 2, y, pz - sz * 2], b: [px + sx * 2, y, pz + sz * 2], r: 0.07 };
  return { rig, b, g };
}

test('an arm under the stick reaches and coils', () => {
  const { b, g } = setup();
  step(b, g, 3);
  assert.equal(g.armState(0), 'grip');
  assert.ok(g.arms[0].coil >= 4, `coil ${g.arms[0].coil}`);
});

test('lifting the stick lifts the octopus', () => {
  const { b, g } = setup();
  step(b, g, 3);
  const y0 = b.headC[1];
  for (let t = 0; t < 3; t += 1 / 60) {
    b.stick.a[1] += 4.2 / 180; b.stick.b[1] += 4.2 / 180;
    g.update(1 / 60); b.step(1 / 60);
  }
  step(b, g, 1);
  assert.ok(g.holdingCount() >= 1, 'dropped it');
  let low = 1e9;
  for (const i of b.rig.head) low = Math.min(low, b.x[i * 3 + 1] - b.r[i]);
  assert.ok(low > 0.3, `body still on the floor (lowest head point ${low}, head rose ${b.headC[1] - y0})`);
});

test('yanking the stick away breaks the grip', () => {
  const { b, g } = setup();
  step(b, g, 3);
  g.params.grip = 0.1;
  for (let t = 0; t < 0.5; t += 1 / 60) {
    b.stick.a[1] += 0.25; b.stick.b[1] += 0.25;
    g.update(1 / 60); b.step(1 / 60);
  }
  assert.notEqual(g.armState(0), 'grip');
});
