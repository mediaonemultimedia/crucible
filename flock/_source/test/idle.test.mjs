import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRig } from '../src/rig.js';
import { SoftBody } from '../src/softbody.js';
import { Idle } from '../src/idle.js';

function run(amount) {
  const b = new SoftBody(buildRig());
  const idle = new Idle(b);
  idle.amount = amount;
  for (let t = 0; t < 4; t += 1 / 60) b.advance(1 / 60);
  const tip = b.rig.arms[3].idx[13];
  let lo = 1e9, hi = -1e9, peak = 0;
  for (let t = 0; t < 8; t += 1 / 60) {
    b.advance(1 / 60);
    lo = Math.min(lo, b.x[tip * 3 + 1]); hi = Math.max(hi, b.x[tip * 3 + 1]);
    peak = Math.max(peak, b.kinetic());
  }
  return { range: hi - lo, peak, finite: b.x.every(Number.isFinite) };
}

test('idle at zero is perfectly still', () => {
  const r = run(0);
  assert.ok(r.range < 0.01, `tip wandered ${r.range}`);
});

test('idle moves the arms gently, never violently', () => {
  const r = run(0.5);
  assert.ok(r.finite);
  assert.ok(r.range > 0.08, `tip barely moved: ${r.range}`);
  assert.ok(r.range < 1.2, `tip flailing: ${r.range}`);
  assert.ok(r.peak < 8, `too energetic: ${r.peak}`);
});

test('more idle, more motion', () => {
  assert.ok(run(1).range > run(0.3).range);
});
