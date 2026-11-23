/* dt-safe damped springs (the bounce-and-squish fix, Nov 23).

   Every render spring used to take one semi-implicit Euler step per frame:
     v += (k·(target − x) − 2ζ√k·v)·dt;  x += v·dt
   That step is only stable while dt·√k stays under ~2. The stiff ones (the
   plush's crunch at k 1400, the glove squash at 900, the feel rig's 1600 /
   2600) went unstable on any run of slow frames (20 fps and below: a
   reconnect, a GC, a busy phone pad), gaining energy every frame — the plush
   squashing and bulging, over and over, until the frames recovered (and for
   seconds after, decaying from a huge amplitude), or for good once the state
   overflowed.

   stepSpring() takes the same step in equal substeps of at most SPRING_H, so
   it is stable for any frame time (a 1/120 s step is stable up to k ≈ 57,000).
   At ≤ 1/120 s per call it is one step: exactly the old arithmetic. A
   non-finite state is reset to the target, and `lo` / `hi` bound it.     */
export const SPRING_H = 1 / 120;

export function substeps(dt) { return Math.max(1, Math.ceil(dt / SPRING_H - 1e-6)); }

export function stepSpring(s, target, k, z, dt, lo = -Infinity, hi = Infinity) {
  if (!(dt > 0)) return s;
  const n = substeps(dt), h = dt / n, c = 2 * z * Math.sqrt(k);
  let x = s.x, v = s.v;
  for (let i = 0; i < n; i++) { v += (k * (target - x) - c * v) * h; x += v * h; }
  if (!Number.isFinite(x) || !Number.isFinite(v)) { x = target; v = 0; }
  if (x < lo) { x = lo; if (v < 0) v = 0; } else if (x > hi) { x = hi; if (v > 0) v = 0; }
  s.x = x; s.v = v;
  return s;
}
