/* The phone pads, in node: the wire (the stick-X byte round trip, taps
   that survive loss, stale packets), and TILT's geometry (the wheel angle
   from DeviceOrientationEvent's beta / gamma, in every screen rotation;
   the dead zone, sensitivity and lock).                                 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeInput, decode, PadState, GAS, ITEM, SUPER, BRAKE, TAPS, STALE_MS } from '../src/pad/wire.js';
import { tiltRoll, tiltSteer, TILT_RANGE, TILT_DEAD } from '../src/pad/tilt.js';

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

test('tilt: the wheel angle, landscape (angle 90): held upright and turned clockwise is +', () => {
  // upright in landscape, top to the left: device +x is up → beta 0, gamma −90
  for (const th of [-60, -20, 0, 15, 45, 80]) {
    const r = tiltRoll(th, -90, 90);
    assert.ok(Math.abs(r - th) < 1e-6, `θ ${th} → ${r}`);
  }
});

test('tilt: every screen rotation reads the same wheel', () => {
  // build "up" in the screen plane for a wheel angle θ, then the beta/gamma that give it
  const solve = (th, angle) => {
    let best = null, bd = 1e9;
    for (let b = -180; b <= 180; b += 0.5) for (let g = -90; g <= 90; g += 0.5) {
      const r = tiltRoll(b, g, angle);
      if (r === null) continue;
      // keep the phone upright-ish (screen facing the player): |cos β cos γ| small
      const tilt = Math.abs(Math.cos(b * Math.PI / 180) * Math.cos(g * Math.PI / 180));
      const d = Math.abs(r - th) + tilt * 0.01;
      if (d < bd) { bd = d; best = { b, g, r }; }
    }
    return best;
  };
  for (const angle of [0, 90, 180, 270]) for (const th of [-40, 0, 30]) { const s = solve(th, angle); assert.ok(Math.abs(s.r - th) < 1, `angle ${angle} θ ${th}: ${JSON.stringify(s)}`); }
  // laid on its back: no wheel to read
  assert.equal(tiltRoll(0, 0, 90), null);
  // tipped back 50° (a lazy grip) still reads the turn
  const tipped = tiltRoll(20, -40, 90);
  assert.ok(tipped > 10, `tipped back, turned right: ${tipped}`);
});

test('tilt: dead zone, three sensitivities, full lock, wrap', () => {
  assert.equal(tiltSteer(TILT_DEAD - 0.5, 0, 1), 0);
  for (const s of [0, 1, 2]) {
    assert.equal(tiltSteer(TILT_RANGE[s] + 5, 0, s), 1);
    assert.equal(tiltSteer(-TILT_RANGE[s] - 5, 0, s), -1);
  }
  assert.ok(tiltSteer(15, 0, 2) > tiltSteer(15, 0, 1) && tiltSteer(15, 0, 1) > tiltSteer(15, 0, 0), 'twitchy > normal > calm');
  assert.ok(Math.abs(tiltSteer(25, 10, 1) - tiltSteer(15, 0, 1)) < 1e-9, 'relative to the calibrated centre');
  assert.ok(tiltSteer(-175, 175, 1) > 0, 'wraps round ±180');
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
