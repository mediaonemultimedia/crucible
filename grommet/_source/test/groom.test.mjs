import test from 'node:test';
import assert from 'node:assert/strict';
import { Groom, NAP } from '../src/groom.js';

const stroke = (g, u, v, du, dv, n = 6) => { for (let i = 0; i < n; i++) g.paint(u, v, du, dv, 0.6, 10, 10); };

test('combing with the nap lays fur along the stroke, no ruffle', () => {
  const g = new Groom(128);
  stroke(g, 0.5, 0.25, 0.3, 1);
  const s = g.sample(0.5, 0.25);
  assert.ok(s.ruffle < 0.05, `ruffle ${s.ruffle}`);
  assert.ok(Math.hypot(s.lu, s.lv) > 0.6, 'not laid down');
  assert.ok(s.lu > 0.1 && s.lv > 0.5, `direction ${s.lu},${s.lv}`);
});

test('combing against the nap raises ruffle', () => {
  const g = new Groom(128);
  stroke(g, 0.5, 0.25, 0, -1, 2);
  assert.ok(g.sample(0.5, 0.25).ruffle > 0.3, `ruffle ${g.sample(0.5, 0.25).ruffle}`);
});

test('smooth returns to the default nap', () => {
  const g = new Groom(128);
  stroke(g, 0.5, 0.25, 0, -1, 4);
  g.smooth(1.5);
  for (let t = 0; t < 1.5; t += 1 / 60) g.relax(1 / 60);
  const s = g.sample(0.5, 0.25);
  assert.ok(Math.abs(s.lu) < 0.02 && Math.abs(s.lv - NAP) < 0.02 && s.ruffle < 0.02, JSON.stringify(s));
});

test('brush wraps around an arm strip, never bleeds into its neighbour', () => {
  const g = new Groom(128);
  // arm 2 strip is u ∈ [0.25, 0.375); paint at its left edge
  stroke(g, 0.252, 0.75, 1, 0);
  assert.ok(g.sample(0.37, 0.75).lu > 0.1, 'did not wrap to the far side of the strip');
  assert.equal(g.sample(0.245, 0.75).lu, 0, 'bled into arm 1');
});
