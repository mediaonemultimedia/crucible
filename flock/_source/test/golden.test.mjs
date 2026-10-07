import test from 'node:test';
import assert from 'node:assert/strict';
import { octopusFingerprint } from './golden.mjs';

// sha256 of x and v after the scripted session, recorded from Phase 1 code
const GOLDEN = '840d407be80683f112a0cf4b4731bb51e04381e4be4b82af2415f75cdf71f8e6';

test('octopus physics is bit-for-bit the Phase 1 octopus', () => {
  assert.equal(octopusFingerprint(), GOLDEN);
});
