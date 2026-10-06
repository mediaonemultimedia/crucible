/* Small math kernel for the soft body — plain arrays, no allocation in hot paths.

   3×3 matrices are row-major arrays of nine: m[r*3 + c].
   Quaternions are [x, y, z, w].                                              */

export function quatToMat(q, m) {
  const [x, y, z, w] = q;
  const xx = x * x, yy = y * y, zz = z * z;
  const xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  m[0] = 1 - 2 * (yy + zz); m[1] = 2 * (xy - wz);     m[2] = 2 * (xz + wy);
  m[3] = 2 * (xy + wz);     m[4] = 1 - 2 * (xx + zz); m[5] = 2 * (yz - wx);
  m[6] = 2 * (xz - wy);     m[7] = 2 * (yz + wx);     m[8] = 1 - 2 * (xx + yy);
  return m;
}

const _R = new Float64Array(9);

/* Rotational part of A, warm-started from q and written back into q.
   Müller, Bender, Chentanez, Macklin 2016, "A Robust Method to Extract the
   Rotational Part of Deformations" — stable through degenerate and inverted
   A, which plain polar decomposition is not, and that matters when someone
   squashes the head flat.                                                    */
export function extractRotation(A, q, iters = 8) {
  for (let it = 0; it < iters; it++) {
    quatToMat(q, _R);
    let ox = 0, oy = 0, oz = 0, d = 0;
    for (let i = 0; i < 3; i++) {
      const rx = _R[i], ry = _R[3 + i], rz = _R[6 + i];
      const ax = A[i], ay = A[3 + i], az = A[6 + i];
      ox += ry * az - rz * ay;
      oy += rz * ax - rx * az;
      oz += rx * ay - ry * ax;
      d += rx * ax + ry * ay + rz * az;
    }
    const inv = 1 / (Math.abs(d) + 1e-9);
    ox *= inv; oy *= inv; oz *= inv;
    const w = Math.hypot(ox, oy, oz);
    if (w < 1e-9) break;
    const s = Math.sin(w * 0.5) / w, c = Math.cos(w * 0.5);
    const bx = ox * s, by = oy * s, bz = oz * s, bw = c;
    const [x, y, z, qw] = q;
    q[0] = bw * x + bx * qw + by * z - bz * y;
    q[1] = bw * y - bx * z + by * qw + bz * x;
    q[2] = bw * z + bx * y - by * x + bz * qw;
    q[3] = bw * qw - bx * x - by * y - bz * z;
    const n = Math.hypot(q[0], q[1], q[2], q[3]);
    q[0] /= n; q[1] /= n; q[2] /= n; q[3] /= n;
  }
  return q;
}

export function mulMat3(a, b, out) {
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return out;
}

export function det3(m) {
  return m[0] * (m[4] * m[8] - m[5] * m[7])
       - m[1] * (m[3] * m[8] - m[5] * m[6])
       + m[2] * (m[3] * m[7] - m[4] * m[6]);
}

export function invert3(m, out) {
  const d = det3(m);
  if (Math.abs(d) < 1e-14) return null;
  const i = 1 / d;
  out[0] = (m[4] * m[8] - m[5] * m[7]) * i;
  out[1] = (m[2] * m[7] - m[1] * m[8]) * i;
  out[2] = (m[1] * m[5] - m[2] * m[4]) * i;
  out[3] = (m[5] * m[6] - m[3] * m[8]) * i;
  out[4] = (m[0] * m[8] - m[2] * m[6]) * i;
  out[5] = (m[2] * m[3] - m[0] * m[5]) * i;
  out[6] = (m[3] * m[7] - m[4] * m[6]) * i;
  out[7] = (m[1] * m[6] - m[0] * m[7]) * i;
  out[8] = (m[0] * m[4] - m[1] * m[3]) * i;
  return out;
}

/* closest point on segment a→b to p: returns the parameter t in [0,1] */
export function segParam(ax, ay, az, bx, by, bz, px, py, pz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const l2 = dx * dx + dy * dy + dz * dz;
  if (l2 < 1e-12) return 0;
  const t = ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / l2;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/* deterministic PRNG so the rig and strand layout are the same every load */
export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
