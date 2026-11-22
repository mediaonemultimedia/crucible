/* Motion inputs for the specials (Street Fighter-style), in the sim: pure,
   integer, rollback-safe. Each tick `track` notes, on the fighter, the last
   tick each facing-relative direction was held (plain integers in the
   state), and the charges; `motionSpecial` reads them when a button is
   pressed and names the move it makes, or ''.

   Lenient by design (a phone stick, later): the whole motion within about
   15 ticks of the button (20 for a half circle), the last direction within
   7, diagonals optional. "Down" is the crouch key or the ↓ sidestep key,
   "up" the hop key or ↑ (the special cancels the sidestep / hop the
   direction started, so a lone tap still sidesteps). Charge moves: the
   first direction held CHARGE ticks (0.7 s), then the release direction +
   the button within CHARGE_KEEP ticks.                                   */

import { LEFT, RIGHT, UP, DOWN, CROUCH, JUMP } from './input.js';

export const MOTION_WIN = 15;       // ↓↘→: down this recently before the button
export const HALF_WIN = 20;         // ←↙↓↘→: the half circle's start
export const LAST_WIN = 7;          // the final direction this recently
export const CHARGE = 42;           // a charge: 0.7 s
export const CHARGE_KEEP = 12;      // ...still good this long after letting go
export const TAP_WIN = 12;          // ← → (Sumaura): back, then forward pressed this soon after
export const MSP_COOL = 20;         // after a motion special ends, this long before another

/* the fields it keeps on a fighter (added to newFighter) */
export const MOTION_FIELDS = { qD: -99, qF: -99, qB: -99, qFa: -99, qBa: -99, qU: -99, qFp: -99, cD: 0, cB: 0, qCD: -99, qCB: -99, mc: 0 };

/* one tick of directions: m the mask, face +1 when RIGHT is forward */
export function track(f, m, prev, tick) {
  const fwd = f.face > 0 ? RIGHT : LEFT, bk = f.face > 0 ? LEFT : RIGHT;
  const dn = (m & (CROUCH | DOWN)) !== 0, up = (m & (UP | JUMP)) !== 0;
  const F = (m & fwd) !== 0, B = (m & bk) !== 0;
  if (dn) f.qD = tick;
  if (F) { f.qFa = tick; if (!dn) f.qF = tick; if (!(prev & fwd)) f.qFp = tick; }
  if (B) { f.qBa = tick; if (!dn) f.qB = tick; }
  if (up) f.qU = tick;
  f.cD = dn ? Math.min(f.cD + 1, 255) : 0;
  f.cB = B ? Math.min(f.cB + 1, 255) : 0;
  if (f.cD >= CHARGE) f.qCD = tick;
  if (f.cB >= CHARGE) f.qCB = tick;
  if (f.mc > 0) f.mc--;
}

const near = (q, P, w) => q >= P - w;

/* the motion each fighter's special wants, read at the button's press tick P */
export const MOTIONS = {
  // ↓↘→
  kevalanche: (f, P) => near(f.qD, P, MOTION_WIN) && f.qF > f.qD && near(f.qF, P, LAST_WIN),
  // ↓↙←
  johnny: (f, P) => near(f.qD, P, MOTION_WIN) && f.qB > f.qD && near(f.qB, P, LAST_WIN),
  // ←↙↓↘→
  k8e: (f, P) => near(f.qBa, P, HALF_WIN) && f.qD > f.qBa - 1 && f.qBa <= f.qD && near(f.qD, P, MOTION_WIN) && f.qF > f.qD && near(f.qF, P, LAST_WIN) && f.qBa < f.qF,
  // →↘↓↙←
  rubberta: (f, P) => near(f.qFa, P, HALF_WIN) && f.qFa <= f.qD && near(f.qD, P, MOTION_WIN) && f.qB > f.qD && near(f.qB, P, LAST_WIN) && f.qFa < f.qB,
  // ← → (quick back, forward)
  sumaura: (f, P) => near(f.qFp, P, LAST_WIN) && f.qBa < f.qFp && f.qBa >= f.qFp - TAP_WIN && f.qFa >= f.qFp,
  // [↓] ↑
  zach: (f, P) => near(f.qCD, P, CHARGE_KEEP) && near(f.qU, P, LAST_WIN) && f.qU >= f.qCD,
  // [←] →
  sebas: (f, P) => near(f.qCB, P, CHARGE_KEEP) && near(f.qF > f.qFa ? f.qF : f.qFa, P, LAST_WIN) && f.qFa >= f.qCB,
};

/* the motion special a buffered press makes ('mspL' / 'mspH'), or '' */
export function motionSpecial(f, moves, light, heavy) {
  if (f.mc > 0) return '';
  const ok = MOTIONS[f.id];
  if (!ok) return '';
  if (heavy && moves.mspH && ok(f, f.ht)) return 'mspH';
  if (light && moves.mspL && ok(f, f.lt)) return 'mspL';
  return '';
}
