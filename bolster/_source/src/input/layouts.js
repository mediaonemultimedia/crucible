/* Key layouts: which physical key (KeyboardEvent.code) sets which bit of
   the input mask.

   SOLO is the one-player layout (vs Computer, practice, online): A D W S
   or the arrows to move, E block, O light, P heavy, Space special.

   VERSUS is two players on one full-size keyboard (with a numpad):
   - Player 1, the left half: the left hand on W A S D with E to block
     (as in SOLO), the right hand on G light / H heavy — O and P moved
     eight keys left, still side by side, so O+P's throw is the same
     roll of two fingers (G+H) — and the right thumb on Space.
   - Player 2, the right edge: the left hand on the arrows, the right hand
     on the numpad: 4 light, 5 heavy (4+5 throws), 6 block, 0 special
     (Numpad Enter works too). Numpad codes are the same with Num Lock on
     or off.
   The two sets share no key (tested), and each player's hands sit
   apart from the other's. Keyboards ghost: on many membrane boards a
   few three-key chords on the letter block can drop a key; the arrows
   and the numpad usually sit on their own matrix lines, so player 2 is
   the safer side, and the letters were picked to keep player 1's common
   chords (move + attack, S+E, G+H) off one row. Either player can rebind
   any key on the versus controls card (saved on this device).          */

import { LEFT, RIGHT, UP, DOWN, LIGHT, HEAVY, SPECIAL, BLOCK } from '../sim/input.js';

export const SOLO = {
  KeyA: LEFT, KeyD: RIGHT, KeyW: UP, KeyS: DOWN, KeyO: LIGHT, KeyP: HEAVY, Space: SPECIAL, KeyE: BLOCK,
  ArrowLeft: LEFT, ArrowRight: RIGHT, ArrowUp: UP, ArrowDown: DOWN,
};

/* the actions, in the order the controls card lists them */
export const ACTIONS = [
  { id: 'left', bit: LEFT, label: 'back / walk' },
  { id: 'right', bit: RIGHT, label: 'forward / walk' },
  { id: 'up', bit: UP, label: 'jump' },
  { id: 'down', bit: DOWN, label: 'crouch' },
  { id: 'light', bit: LIGHT, label: 'light' },
  { id: 'heavy', bit: HEAVY, label: 'heavy' },
  { id: 'block', bit: BLOCK, label: 'block' },
  { id: 'special', bit: SPECIAL, label: 'special' },
];

/* the versus defaults: action → keys (the first is the one shown) */
export const VERSUS_DEFAULT = [
  { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'], light: ['KeyG'], heavy: ['KeyH'], block: ['KeyE'], special: ['Space'] },
  { left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'], light: ['Numpad4'], heavy: ['Numpad5'], block: ['Numpad6'], special: ['Numpad0', 'NumpadEnter'] },
];

/* keys the game keeps for itself in versus (pause, the menus' confirm) */
export const RESERVED = ['Escape', 'Enter', 'Tab', 'MetaLeft', 'MetaRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight'];

/* a binding (action → keys) as a mask map (code → bit) */
export function toMap(binding) {
  const m = {};
  for (const a of ACTIONS) for (const code of binding[a.id] || []) m[code] = (m[code] || 0) | a.bit;
  return m;
}

/* every code bound by both players (should be none) */
export function overlaps(b1, b2) {
  const k1 = new Set(Object.values(b1).flat());
  return [...new Set(Object.values(b2).flat())].filter((c) => k1.has(c));
}

/* rebind one action of player k to `code`: the key leaves whatever it was
   bound to on either side (so the two never share one); refused for the
   reserved keys. Returns new bindings (the old ones untouched). */
export function rebind(bindings, k, action, code) {
  if (RESERVED.includes(code)) return null;
  const out = bindings.map((b) => Object.fromEntries(Object.entries(b).map(([a, ks]) => [a, ks.filter((c) => c !== code)])));
  out[k][action] = [code];
  return out;
}

/* saved bindings, or the defaults (anything broken: the defaults) */
const KEY = 'pillowfight.versusKeys.v1';
export function loadBindings(storage) {
  try {
    const v = JSON.parse(storage?.getItem(KEY) || 'null');
    if (Array.isArray(v) && v.length === 2 && v.every((b) => ACTIONS.every((a) => Array.isArray(b[a.id]) && b[a.id].length)) && !overlaps(v[0], v[1]).length) return v;
  } catch { /* the defaults */ }
  return VERSUS_DEFAULT.map((b) => ({ ...b }));
}
export function saveBindings(storage, b) { try { storage?.setItem(KEY, JSON.stringify(b)); } catch { /* private mode: this session only */ } }
export function resetBindings(storage) { try { storage?.removeItem(KEY); } catch { /* */ } return VERSUS_DEFAULT.map((b) => ({ ...b })); }

/* a code as a key cap: 'KeyG' → 'G', 'Numpad4' → 'Num 4', 'ArrowLeft' → '←' */
export function keyCap(code) {
  const A = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', NumpadEnter: 'Num Ent', NumpadAdd: 'Num +', NumpadSubtract: 'Num −', NumpadMultiply: 'Num ×', NumpadDivide: 'Num ÷', NumpadDecimal: 'Num .', ShiftLeft: 'L Shift', ShiftRight: 'R Shift', Backspace: '⌫', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`', CapsLock: 'Caps' };
  if (A[code]) return A[code];
  let m = /^Key([A-Z])$/.exec(code); if (m) return m[1];
  m = /^Digit(\d)$/.exec(code); if (m) return m[1];
  m = /^Numpad(\d)$/.exec(code); if (m) return `Num ${m[1]}`;
  return code;
}
