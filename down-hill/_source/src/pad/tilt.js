/* TILT steering's maths (pure: node --test reads it). */

/* ── tilt: the steering wheel ────────────────────────────────────────
   The earth's "up" in the device's frame, from the W3C Euler angles
   (Z-X'-Y''): u = (−cos β sin γ, sin β, cos β cos γ). The screen's own up
   and right axes, in device coordinates, depend on how it's rotated
   (screen.orientation.angle: 90 = landscape with the top to the left).
   The wheel angle is where "up" points in the screen's plane: 0 held
   level, + when the phone is turned clockwise (steer right).            */
export function tiltRoll(beta, gamma, angle = 90) {
  const b = (beta || 0) * Math.PI / 180, g = (gamma || 0) * Math.PI / 180;
  const u = [-Math.cos(b) * Math.sin(g), Math.sin(b), Math.cos(b) * Math.cos(g)];
  const a = ((Math.round((angle || 0) / 90) % 4) + 4) % 4;
  // [screen up, screen right] as device axes, per rotation
  const AX = [[[0, 1], [1, 0]], [[1, 0], [0, -1]], [[0, -1], [-1, 0]], [[-1, 0], [0, 1]]][a];
  const dot = (v) => u[0] * v[0] + u[1] * v[1];
  const up = dot(AX[0]), right = dot(AX[1]);
  if (Math.hypot(up, right) < 0.12) return null;      // flat on its back: no wheel to read
  return -Math.atan2(right, up) * 180 / Math.PI;
}
export const TILT_RANGE = [42, 30, 20];                // degrees for full lock: calm, normal, twitchy
export const TILT_DEAD = 3;
/* the steering value from a roll (degrees), the centre and a sensitivity step */
export function tiltSteer(roll, centre, sens = 1) {
  let d = roll - centre;
  d = ((d + 540) % 360) - 180;
  const a = Math.abs(d);
  if (a < TILT_DEAD) return 0;
  return Math.sign(d) * Math.min(1, (a - TILT_DEAD) / (TILT_RANGE[sens] - TILT_DEAD));
}
