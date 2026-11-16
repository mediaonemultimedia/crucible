// the select grid: 7 OG cards over their 7 ALT twins, plain arrow / WASD steps
import test from 'node:test';
import assert from 'node:assert/strict';
import { stepSlot, slotId, slotAlt, resolveVariants } from '../src/ui/variant.js';
import { ROSTER } from '../src/fighters/index.js';

test('14 slots: OGs on top, ALTs below, each its own fighter', () => {
  for (let s = 0; s < 14; s++) { assert.equal(slotId(s), ROSTER[s % 7]); assert.equal(slotAlt(s), s >= 7); }
});

test('left / right wrap within a row, up / down flip the row in the same column', () => {
  assert.equal(stepSlot(0, 1, 0), 1);
  assert.equal(stepSlot(0, -1, 0), 6);
  assert.equal(stepSlot(13, 1, 0), 7);
  assert.equal(stepSlot(2, 0, 1), 9);
  assert.equal(stepSlot(9, 0, 1), 2);
});

test("the other seat's locked card is stepped over", () => {
  const taken = (s) => s === 3;
  assert.equal(stepSlot(2, 1, 0, taken), 4);
  assert.equal(stepSlot(4, -1, 0, taken), 2);
  assert.equal(stepSlot(10, 0, 1, taken), 4);
});

test('different cards never get flipped (the quilt shows the cards)', () => {
  assert.deepEqual(resolveVariants(['kevalanche', 'kevalanche'], [false, true]), [false, true]);
  assert.deepEqual(resolveVariants(['kevalanche', 'rubberta'], [true, true]), [true, true]);
});
