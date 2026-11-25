import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeInput, decode, PadState, GAS, ITEM, SUPER, BRAKE, TAPS, STALE_MS } from '../src/pad/wire.js';
import { driftPitch, motionDrift } from '../src/pad/tilt.js';

test('wire: the packet carries the buttons, the tap counters and the steering byte', () => {
  for (const s of [-1, -0.5, 0, 0.25, 1]) {
    const p = decode(encodeInput(7, GAS | ITEM, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], s));
    assert.equal(p.seq, 7); assert.equal(p.mask, GAS | ITEM);
    assert.deepEqual(p.counts, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.ok(Math.abs(p.steer - s) < 1 / 127 + 1e-9, `steer ${p.steer} vs ${s}`);
  }
});

test('wire: a tap whose packets were all lost still lands (the counter); a stale packet is dropped', () => {
  const P = new PadState();
  const c = new Array(TAPS.length).fill(0);
  P.take(decode(encodeInput(1, 0, c, 0)), 0);
  c[TAPS.indexOf(ITEM)]++;                                 // pressed and released between packets
  P.take(decode(encodeInput(3, GAS, c, 0.6)), 10);
  let I = P.sample();
  assert.equal(I.item, true); assert.equal(I.gas, true); assert.ok(Math.abs(I.steer - 0.6) < 0.01);
  I = P.sample();
  assert.equal(I.item, false, 'a tap counts once');
  assert.equal(P.take(decode(encodeInput(2, BRAKE, c, -1)), 20), 0, 'older seq ignored');
  assert.equal(P.sample().brake, false);
  P.stale(10 + STALE_MS + 1);
  I = P.sample();
  assert.equal(I.gas, false); assert.equal(I.steer, 0, 'a quiet phone lets go');
  // the pill is ITEM too
  P.take(decode(encodeInput(4, SUPER, c, 0)), 1000);
  assert.equal(P.sample().item, true);
});

test('tilt drift: pitch drops when the phone tips toward the player', () => {
  assert.ok(Math.abs(driftPitch(90, 0)) < 1e-8);
  assert.ok(Math.abs(driftPitch(112, 0) + 22) < 1e-8);
  // Either landscape rotation leans downward by the same amount.
  assert.equal(driftPitch(110, 60), driftPitch(110, -60));
  assert.equal(driftPitch(null, 0), null);
});

test('tilt drift: separate engage and release thresholds prevent chatter', () => {
  assert.equal(motionDrift(13, false), false);
  assert.equal(motionDrift(14, false), true);
  assert.equal(motionDrift(10, true), true);
  assert.equal(motionDrift(7, true), false);
  assert.equal(motionDrift(-20, false), false);
});

test('wire: a button held through a quiet spell is not pressed twice', () => {
  const P = new PadState();
  const c = new Array(TAPS.length).fill(0);
  P.take(decode(encodeInput(1, 0, c, 0)), 0);
  c[TAPS.indexOf(ITEM)]++;
  assert.ok(P.take(decode(encodeInput(2, ITEM, c, 0)), 10) & ITEM);
  P.stale(10 + STALE_MS + 1);
  assert.equal(P.take(decode(encodeInput(3, ITEM, c, 0)), 2000) & ITEM, 0, 'same hold, no new press');
  assert.ok(P.take(decode(encodeInput(4, 0, c, 0)), 2010) === 0);
  c[TAPS.indexOf(ITEM)]++;
  assert.ok(P.take(decode(encodeInput(5, ITEM, c, 0)), 2020) & ITEM, 'a real second press');
});

test('wire: a phone that (re)joins holding a button does not press it', () => {
  const P = new PadState();
  P.reset(true);
  const c = new Array(TAPS.length).fill(0);
  assert.equal(P.take(decode(encodeInput(1, ITEM | GAS, c, 0)), 0) & ITEM, 0);
  const s0 = P.sample();
  assert.equal(s0.gas, true, 'GAS still held for driving');
  assert.equal(s0.item, false, 'the held ITEM is latched off (the race would see it as a press)');
  P.take(decode(encodeInput(2, 0, c, 0)), 10);
  c[TAPS.indexOf(ITEM)]++;                        // (the phone counts every press)
  assert.ok(P.take(decode(encodeInput(3, ITEM, c, 0)), 20) & ITEM, 'pressed after letting go');
});
