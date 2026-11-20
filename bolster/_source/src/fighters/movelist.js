/* Every fighter's move list as data: the motion (arrows, written for a
   fighter facing right: → is forward, toward the opponent), the buttons,
   the name and a one-line description. The practice panel draws it, the
   key legend mentions it, and the phone controller's cheat sheet (Run B)
   reads it: `import { MOVE_LIST, SPECIALS } from './fighters/movelist.js'`
   (also on `window.__bolster.moves` in the page).

   Buttons: BOP = light (O), WALLOP = heavy (P), SUPER = Space (full meter).
   `charge`: hold the first direction about 0.7 s (42 ticks).
   `travel`: (PF2's 3D tag; in PF1 everything is on one line). */

import { FIGHTERS } from './index.js';

export const SPECIALS = {
  kevalanche: {
    name: 'Drop the Gloves', motion: ['↓', '↘', '→'], buttons: ['BOP', 'WALLOP'], travel: 'linear', kind: 'projectile',
    desc: 'Hurls a snowball (ALT: shakes off a glove and throws it spinning). One on screen.',
    bop: 'slow snowball', wallop: 'fast snowball', alt: { desc: 'Shakes off a hockey glove and hurls it spinning; feathers on hit.' },
  },
  johnny: {
    name: 'Flaming Ace', motion: ['↓', '↙', '←'], buttons: ['BOP', 'WALLOP'], travel: 'linear', kind: 'projectile',
    desc: 'Tosses a giant tennis ball up and serves it on fire.',
    bop: 'flat serve', wallop: 'faster, dipping topspin serve',
  },
  k8e: {
    name: 'Long Neck', motion: ['←', '↙', '↓', '↘', '→'], buttons: ['BOP', 'WALLOP'], travel: 'linear', kind: 'stretch',
    desc: 'Her neck shoots straight out across the stage and the head bonks. The neck can be hit.',
    bop: 'mid height, quicker', wallop: 'longer reach, knocks down, more recovery',
  },
  rubberta: {
    name: 'Ink Jet', motion: ['→', '↘', '↓', '↙', '←'], buttons: ['BOP', 'WALLOP'], travel: 'linear', kind: 'projectile',
    desc: 'Spits a blob of ink that splats and leaves the face inky for a couple of seconds.',
    bop: 'short range', wallop: 'across the stage, bigger',
  },
  sumaura: {
    name: 'Panda Roll', motion: ['←', '→'], buttons: ['WALLOP'], travel: 'linear', kind: 'rush',
    desc: 'Curls into a ball and rolls across the stage. Bounces back off a block.',
    wallop: 'the roll',
  },
  zach: {
    name: 'Torpedo', motion: ['↓', '↑'], charge: 1, buttons: ['WALLOP'], travel: 'linear', kind: 'rush',
    desc: 'Hold ↓, then ↑ + WALLOP: launches beak-first, wings tucked, low across the stage. Jump over it.',
    wallop: 'the torpedo',
  },
  sebas: {
    name: 'Tornado de Lobo', motion: ['←', '→'], charge: 1, buttons: ['BOP', 'WALLOP'], travel: 'linear', kind: 'rush',
    desc: 'Hold ←, then → + BOP/WALLOP: a luchador corkscrew tail-whip across the stage, several hits.',
    bop: 'shorter spin', wallop: 'travels further, more hits',
  },
};

/* the whole list, per fighter: the special first, then the rest */
function listFor(id) {
  const F = FIGHTERS[id], S = SPECIALS[id];
  return [
    { key: 'msp', name: S.name, motion: S.motion, charge: S.charge || 0, buttons: S.buttons, desc: S.desc, travel: S.travel, special: 1 },
    { key: 'light', name: 'Bop', motion: [], buttons: ['BOP'], desc: 'Quick jab; chains up to three.', travel: 'linear' },
    { key: 'heavy', name: 'Wallop', motion: [], buttons: ['WALLOP'], desc: 'Big lunge; punishable if it misses.', travel: 'linear' },
    { key: 'lowLight', name: 'Low Bop', motion: ['crouch'], buttons: ['BOP'], desc: 'A low poke: block it crouching.', travel: 'linear' },
    { key: 'signature', name: F.signatureName, motion: ['crouch'], buttons: ['WALLOP'], desc: 'Signature move.', travel: F.moves.signature.circ ? 'tracking' : 'linear' },
    { key: 'throw', name: `${F.throwName} / ${F.throwBackName}`, motion: [], buttons: ['BOP', '+', 'WALLOP'], desc: 'Close: beats block. Tech it with BOP+WALLOP.', travel: 'throw' },
    { key: 'dive', name: F.diveName, motion: ['hop', 'crouch'], buttons: ['WALLOP'], desc: 'In the air: a slam down.', travel: 'linear' },
    { key: 'special', name: F.specialName, motion: [], buttons: ['SUPER'], desc: 'Full meter.', travel: F.moves.special.circ ? 'tracking' : 'linear' },
  ];
}

export const MOVE_LIST = Object.fromEntries(Object.keys(SPECIALS).map((id) => [id, listFor(id)]));

/* "↓ ↘ → + BOP / WALLOP" (charge moves: "[↓] ↑ + WALLOP") */
export function motionText(id) {
  const S = SPECIALS[id];
  const m = S.charge ? `[${S.motion[0]}] ${S.motion.slice(1).join(' ')}` : S.motion.join(' ');
  return `${m} + ${S.buttons.join(' / ')}`;
}
