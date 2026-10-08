import test from 'node:test';
import assert from 'node:assert/strict';
import { quatToMat, extractRotation, mulMat3 } from '../src/math.js';

const near = (a, b, eps = 1e-5) => a.every((v, i) => Math.abs(v - b[i]) < eps);

test('identity in, identity out', () => {
  const q = [0, 0, 0, 1];
  extractRotation([1, 0, 0, 0, 1, 0, 0, 0, 1], q, 20);
  assert.ok(near(q, [0, 0, 0, 1]));
});

test('recovers R from R·S with S symmetric positive', () => {
  const ang = 1.1, ax = [0.3, 0.8, -0.52];
  const n = Math.hypot(...ax), s = Math.sin(ang / 2);
  const qTrue = [ax[0] / n * s, ax[1] / n * s, ax[2] / n * s, Math.cos(ang / 2)];
  const R = quatToMat(qTrue, new Float64Array(9));
  const S = [1.4, 0.2, 0.1, 0.2, 0.7, -0.15, 0.1, -0.15, 1.1];
  const A = mulMat3(R, S, new Float64Array(9));
  const q = [0, 0, 0, 1];
  extractRotation(A, q, 60);
  const Rg = quatToMat(q, new Float64Array(9));
  assert.ok(near([...Rg], [...R], 1e-4), `got ${[...Rg]}`);
});
