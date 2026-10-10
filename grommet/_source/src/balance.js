/* Balance: what keeps a two-legged plush on its feet, and gets it back up.

   A soft body only remembers its *shape*; nothing in shape matching cares
   which way up it is, and a tall plush on two small feet tips over the
   moment its stuffing sags. So, every substep, the main cloud is pulled a
   little toward its own sewn shape stood upright — the same rotation it
   has now about the vertical (where it faces), with the tilt taken out —
   about its current centre. It is a pure rotation about the centroid: it
   adds no momentum of its own, the floor under the feet turns it into
   standing back up, and a small `alpha` makes it a slow roly-poly righting,
   not a snap. A dive turns it off; getting up turns it back on.

   `standY` (the standing height of the centre) makes the righting lift a
   fallen athlete as it turns it up, instead of turning it about a centre
   that's lying on the floor (which would shove its feet down through it
   and launch it).

   `lean` (a rotation vector, in the athlete's own frame) asks for a lean
   instead of plumb upright: into a swing, away from a bonk.               */

import { quatToMat } from './math.js';
import { rodrigues } from './pose.js';

const _R = new Float64Array(9), _L = new Float64Array(9), _U = new Float64Array(9), _c = new Float64Array(3);

export function balance(soft, alpha, lean = null, face = null, standY = null, k = 0) {
  if (alpha <= 0) return;
  const g = soft.clouds[k], x = soft.x, w = soft.w;
  const R = quatToMat(g.q4, _R);
  // facing: the cloud's forward, flattened onto the floor — or, for an
  // athlete who keeps squaring up to the play, turned a little toward `face`
  let fx = R[2], fz = R[8];
  const fl = Math.hypot(fx, fz);
  if (fl < 1e-6) { fx = 0; fz = 1; } else { fx /= fl; fz /= fl; }
  if (face !== null) {
    const a = Math.atan2(fx, fz), d = Math.atan2(Math.sin(face - a), Math.cos(face - a));
    const b = a + Math.max(-0.35, Math.min(0.35, d));
    fx = Math.sin(b); fz = Math.cos(b);
  }
  // upright with that facing: rotation about +y taking +z to (fx, 0, fz)
  const U = _U;
  U[0] = fz; U[1] = 0; U[2] = fx;
  U[3] = 0; U[4] = 1; U[5] = 0;
  U[6] = -fx; U[7] = 0; U[8] = fz;
  if (lean) {
    rodrigues(lean[0], lean[1], lean[2], _L);
    // U · L (lean in the athlete's own frame)
    const T = _R;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) T[r * 3 + c] = U[r * 3] * _L[c] + U[r * 3 + 1] * _L[3 + c] + U[r * 3 + 2] * _L[6 + c];
    U.set(T);
  }
  const { ix, q } = g;
  // stood up about where it is — at standing height, if it's lying down:
  // a pull up off the floor, not a shove from under it
  let c = g.c;
  if (standY !== null && c[1] < standY) { _c[0] = c[0]; _c[1] = standY; _c[2] = c[2]; c = _c; }
  for (let j = 0; j < ix.length; j++) {
    const i = ix[j];
    if (w[i] === 0) continue;
    const qx = q[j * 3], qy = q[j * 3 + 1], qz = q[j * 3 + 2];
    x[i * 3] += (c[0] + U[0] * qx + U[1] * qy + U[2] * qz - x[i * 3]) * alpha;
    x[i * 3 + 1] += (c[1] + U[3] * qx + U[4] * qy + U[5] * qz - x[i * 3 + 1]) * alpha;
    x[i * 3 + 2] += (c[2] + U[6] * qx + U[7] * qy + U[8] * qz - x[i * 3 + 2]) * alpha;
  }
}

/* how upright the main cloud stands: its up axis · world up (1 = plumb) */
export function uprightness(soft) { return soft.cloudR[0][4]; }

/* Getting up after a fall. Balance above is a position pull, and a PBD
   position pull of fraction α per substep is a spring of stiffness α/h²:
   fine for the small sways of standing, but from lying on the floor it
   would flip the body up in a quarter of a second and fling it into the
   air. So righting from a fall is a *velocity* servo instead: each point's
   velocity is eased toward a slow, capped turn up about the centre
   (ω = axis × min(2·angle, maxTurn)) plus a capped lift to standing
   height — a heave, damped by construction.                              */
export function rightUp(soft, h, { k = 7, maxTurn = 2, standY = null, maxLift = 1.4, cloud = 0 } = {}) {
  const g = soft.clouds[cloud], x = soft.x, v = soft.v;
  const R = quatToMat(g.q4, _R);
  const ux = R[1], uy = R[4], uz = R[7];
  // axis: up × world up, angle between them
  let ax = -uz, az = ux;
  const s = Math.hypot(ax, az), ang = Math.atan2(s, uy);
  const rate = Math.min(3 * ang, maxTurn);
  if (s > 1e-6) { ax = ax / s * rate; az = az / s * rate; } else { ax = 0; az = 0; }
  const { ix, c } = g;
  let mx = 0, my = 0, mz = 0;
  for (const i of ix) { mx += v[i * 3]; my += v[i * 3 + 1]; mz += v[i * 3 + 2]; }
  mx /= ix.length; my /= ix.length; mz /= ix.length;
  const vy = standY === null ? my : Math.max(-maxLift, Math.min(maxLift, (standY - c[1]) * 3));
  const e = Math.min(1, k * h);
  // he holds his own weight while he heaves (his paws are pushing)
  const gh = soft.params.gravity * h * Math.min(1, k / 6);
  for (const i of ix) {
    const rx = x[i * 3] - c[0], ry = x[i * 3 + 1] - c[1], rz = x[i * 3 + 2] - c[2];
    // ω × r with ω = (ax, 0, az)
    const wx = -az * ry, wy = az * rx - ax * rz, wz = ax * ry;
    const dvx = (mx * 0.9 + wx - v[i * 3]) * e, dvy = (vy + wy - v[i * 3 + 1]) * e + gh, dvz = (mz * 0.9 + wz - v[i * 3 + 2]) * e;
    x[i * 3] += dvx * h; x[i * 3 + 1] += dvy * h; x[i * 3 + 2] += dvz * h;
  }
}

/* A landing: the stuffing soaks up the tumble. Each point's velocity is
   eased toward the body's mean velocity (so spin and jiggle die, the slide
   doesn't) — a damper, adding nothing.                                   */
export function settle(soft, h, k = 8, cloud = 0) {
  const ix = soft.rig.clouds[cloud].ix, v = soft.v, x = soft.x;
  let mx = 0, my = 0, mz = 0;
  for (const i of ix) { mx += v[i * 3]; my += v[i * 3 + 1]; mz += v[i * 3 + 2]; }
  mx /= ix.length; my /= ix.length; mz /= ix.length;
  const e = Math.min(1, k * h);
  for (const i of ix) {
    x[i * 3] += (mx - v[i * 3]) * e * h;
    x[i * 3 + 1] += (my - v[i * 3 + 1]) * e * h;
    x[i * 3 + 2] += (mz - v[i * 3 + 2]) * e * h;
  }
}
