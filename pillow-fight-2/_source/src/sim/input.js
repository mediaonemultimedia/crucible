/* One player's input for one tick: a 10-bit mask. The sim only ever sees
   these (and keeps last tick's to find presses), so a replay, a rollback
   resimulation or a network peer is just two arrays of small integers.

   PF1's eight bits keep their meaning where they can. In 3D, UP and DOWN
   are the sidestep (into the screen / toward the camera; held: circle the
   opponent), and the hop and the crouch get keys of their own: JUMP and
   CROUCH. LEFT / RIGHT stay screen-relative (the camera keeps player 1 on
   the left), so RIGHT is forward for player 1 and back for player 2.    */

export const LEFT = 1, RIGHT = 2, UP = 4, DOWN = 8, LIGHT = 16, HEAVY = 32, SPECIAL = 64, BLOCK = 128, JUMP = 256, CROUCH = 512;
export const BUTTONS = LIGHT | HEAVY | SPECIAL;

export function describe(m) {
  const s = [];
  if (m & LEFT) s.push('←'); if (m & RIGHT) s.push('→'); if (m & UP) s.push('↑'); if (m & DOWN) s.push('↓');
  if (m & JUMP) s.push('hop'); if (m & CROUCH) s.push('crouch');
  if (m & LIGHT) s.push('O'); if (m & HEAVY) s.push('P'); if (m & SPECIAL) s.push('␣'); if (m & BLOCK) s.push('E');
  return s.join(' ');
}
