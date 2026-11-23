// The bounce-and-squish fix: every render spring stays stable at any frame
// time. Each spring is kicked and run at dt = 0.1 s (10 fps, the old frame
// clamp) for 10 s: its energy must keep falling and it must settle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { stepSpring, substeps, SPRING_H } from '../shared/grommet/spring.js';
import { ease } from '../shared/grommet/pose.js';

// [name, k, zeta, kick velocity] — every spring in the render code
export const SPRINGS = [
  ['plush crunch (plush.js)', 1400, 0.32, 2.6], ['plush hit squash (plush.js)', 260, 0.5, -14],
  ['plush yaw (plush.js)', 120, 1, 8], ['camera nudge (arena.js)', 600, 0.35, 2.4],
  ['glove squash (feel.js)', 900, 0.3, -14], ['glove lag (gloves.js)', 700, 0.45, 3],
  ['feel arms / strike (feel.js)', 2600, 0.75, 10], ['feel jumpsquat sink (feel.js)', 1600, 0.9, 14],
  ['feel roll (feel.js)', 900, 0.7, 4], ['feel hips (feel.js)', 480, 1, 4],
  ['puppet stretch / beak (puppets.js, crow.game.js)', 2600, 1, 6], ['leopard swing (leopard.game.js)', 2400, 1, 6],
  ['crow peck (puppets.js)', 900, 1, 6], ['twins bulb pendulum (twins.js)', 70, 0.35, 3],
];
const energy = (s, k) => 0.5 * s.v * s.v + 0.5 * k * s.x * s.x;
const oldStep = (s, t, k, z, dt) => { s.v += (k * (t - s.x) - 2 * z * Math.sqrt(k) * s.v) * dt; s.x += s.v * dt; };

function run(step, k, z, kick, dt, secs = 10) {
  const s = { x: 0, v: kick }, E = [];
  for (let t = 0; t < secs - 1e-9; t += dt) { step(s, 0, k, z, dt); E.push(energy(s, k)); }
  return { s, E };
}

test('every render spring settles at dt = 0.1 for 10 s (energy decreasing)', () => {
  const rows = [];
  for (const [name, k, z, kick] of SPRINGS) {
    const before = run(oldStep, k, z, kick, 0.1).E;
    const { s, E } = run(stepSpring, k, z, kick, 0.1);
    // energy never rises from one frame to the next (the target is still)
    for (let i = 1; i < E.length; i++) assert.ok(E[i] <= E[i - 1] * (1 + 1e-9) + 1e-12, `${name}: energy rose at frame ${i}`);
    assert.ok(Math.abs(s.x) < 1e-6 && Math.abs(s.v) < 1e-4, `${name}: settled (${s.x}, ${s.v})`);
    // and within 2 s it has lost ≥ 99.9 % of the kick
    assert.ok(E[19] < 1e-3 * energy({ x: 0, v: kick }, k), `${name}: 99.9 % gone in 2 s`);
    rows.push(`${name.padEnd(48)} k ${String(k).padStart(4)}  old: E(10 s)/E0 = ${(before.at(-1) / energy({ x: 0, v: kick }, k)).toExponential(1).padStart(8)}   new: ${(E.at(-1) / energy({ x: 0, v: kick }, k)).toExponential(1)}`);
  }
  if (process.env.SPRING_TABLE) console.log(rows.join('\n'));
});

test('stable at every frame time from 1/240 s to 0.25 s', () => {
  for (const [name, k, z, kick] of SPRINGS) for (const dt of [1 / 240, 1 / 144, 1 / 120, 1 / 60, 1 / 30, 0.05, 0.067, 0.1, 0.25]) {
    const { s } = run(stepSpring, k, z, kick, dt, 10);
    assert.ok(Math.abs(s.x) < 1e-4, `${name} at dt ${dt}`);
  }
});

test('one step per call at ≤ 1/120 s: exactly the old arithmetic', () => {
  assert.equal(substeps(1 / 120), 1); assert.equal(substeps(1 / 240), 1); assert.equal(substeps(1 / 60), 2); assert.equal(substeps(0.1), 12);
  const a = { x: 0.3, v: -2 }, b = { x: 0.3, v: -2 };
  for (let i = 0; i < 200; i++) { stepSpring(a, 1, 2600, 0.75, SPRING_H); oldStep(b, 1, 2600, 0.75, SPRING_H); }
  assert.equal(a.x, b.x); assert.equal(a.v, b.v);
});

test('pose ease() is dt-safe too, the state is bounded, a NaN resets', () => {
  const s = { x: 0, v: 20 };
  for (let i = 0; i < 100; i++) ease(s, 0, 2600, 0.1);
  assert.ok(Math.abs(s.x) < 1e-6);
  const c = { x: 0, v: 400 };
  stepSpring(c, 0, 1400, 0.32, 1 / 60, -0.5, 0.5);
  assert.ok(c.x <= 0.5);
  const n = { x: NaN, v: 1 };
  stepSpring(n, 0.2, 300, 1, 1 / 60);
  assert.equal(n.x, 0.2); assert.equal(n.v, 0);
});

test('the old one-step spring was the bug: the crunch at 10–20 fps rings up, not down', () => {
  const E = run(oldStep, 1400, 0.32, 2.6, 0.05, 2).E;
  assert.ok(E.at(-1) > E[0] * 1e6);
});
