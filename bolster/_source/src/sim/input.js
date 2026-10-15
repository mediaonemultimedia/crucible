/* One player's input for one tick: a 7-bit mask. The sim only ever sees
   these (and keeps last tick's to find presses), so a replay, a rollback
   resimulation or a network peer is just two arrays of small integers.   */

export const LEFT = 1, RIGHT = 2, UP = 4, DOWN = 8, LIGHT = 16, HEAVY = 32, SPECIAL = 64;
export const BUTTONS = LIGHT | HEAVY | SPECIAL;

export function describe(m) {
  const s = [];
  if (m & LEFT) s.push('←'); if (m & RIGHT) s.push('→'); if (m & UP) s.push('↑'); if (m & DOWN) s.push('↓');
  if (m & LIGHT) s.push('O'); if (m & HEAVY) s.push('P'); if (m & SPECIAL) s.push('␣');
  return s.join('');
}
