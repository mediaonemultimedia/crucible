/* The keyboard legend: a small full-size keyboard (main block, the arrow
   cluster, the numpad) drawn as inline SVG, with only the keys in use lit —
   player 1 hot pink, player 2 mint — each with its action on the cap.

   Pure: it reads a binding (action → key codes, as input/layouts.js keeps
   them) and returns a string, so the select card and the pause card redraw
   it whenever a key is rebound, and the tests can check it without a DOM.
   A key bound off the drawing (F5, say) is listed under it instead.      */

import { ACTIONS, SOLO } from '../input/layouts.js';

export const P_COLORS = ['#ff3b6b', '#3ff0c8'];

/* the board, in key units: [code, cap, x, y, w = 1, h = 1] */
const row = (y, x0, keys) => {
  const out = [];
  let x = x0;
  for (const k of keys) {
    const [code, cap, w = 1] = Array.isArray(k) ? k : [k, k];
    if (code) out.push([code, cap, x, y, w, 1]);
    x += w;
  }
  return out;
};
const letters = (s) => [...s].map((c) => [`Key${c}`, c]);
const digits = (s) => [...s].map((c) => [`Digit${c}`, c]);

export const KEYS = [
  // main block: 15 units wide
  ...row(0, 0, [['Backquote', '`'], ...digits('1234567890'), ['Minus', '-'], ['Equal', '='], ['Backspace', '⌫', 2]]),
  ...row(1, 0, [['Tab', 'Tab', 1.5], ...letters('QWERTYUIOP'), ['BracketLeft', '['], ['BracketRight', ']'], ['Backslash', '\\', 1.5]]),
  ...row(2, 0, [['CapsLock', 'Caps', 1.75], ...letters('ASDFGHJKL'), ['Semicolon', ';'], ['Quote', "'"], ['Enter', 'Enter', 2.25]]),
  ...row(3, 0, [['ShiftLeft', 'Shift', 2.25], ...letters('ZXCVBNM'), ['Comma', ','], ['Period', '.'], ['Slash', '/'], ['ShiftRight', 'Shift', 2.75]]),
  ...row(4, 0, [['ControlLeft', 'Ctrl', 1.25], ['MetaLeft', '', 1.25], ['AltLeft', 'Alt', 1.25], ['Space', 'Space', 6.25], ['AltRight', 'Alt', 1.25], ['MetaRight', '', 1.25], ['ContextMenu', '', 1.25], ['ControlRight', 'Ctrl', 1.25]]),
  // the arrow cluster
  ...row(0, 15.5, [['Insert', 'Ins'], ['Home', 'Home'], ['PageUp', 'PgUp']]),
  ...row(1, 15.5, [['Delete', 'Del'], ['End', 'End'], ['PageDown', 'PgDn']]),
  ...row(3, 16.5, [['ArrowUp', '↑']]),
  ...row(4, 15.5, [['ArrowLeft', '←'], ['ArrowDown', '↓'], ['ArrowRight', '→']]),
  // the numpad
  ...row(0, 19, [['NumLock', 'Num'], ['NumpadDivide', '/'], ['NumpadMultiply', '*'], ['NumpadSubtract', '−']]),
  ...row(1, 19, [['Numpad7', '7'], ['Numpad8', '8'], ['Numpad9', '9']]),
  ['NumpadAdd', '+', 22, 1, 1, 2],
  ...row(2, 19, [['Numpad4', '4'], ['Numpad5', '5'], ['Numpad6', '6']]),
  ...row(3, 19, [['Numpad1', '1'], ['Numpad2', '2'], ['Numpad3', '3']]),
  ['NumpadEnter', 'Ent', 22, 3, 1, 2],
  ...row(4, 19, [['Numpad0', '0', 2], ['NumpadDecimal', '.']]),
].map(([code, cap, x, y, w = 1, h = 1]) => ({ code, cap, x, y, w, h }));

export const KEY_AT = Object.fromEntries(KEYS.map((k) => [k.code, k]));

/* the word on a lit cap */
export const ACTION_WORD = { left: 'Move', right: 'Move', up: 'Jump', down: 'Crouch', light: 'Light', heavy: 'Heavy', block: 'Block', special: 'Special' };
const ARROW = { left: '◀', right: '▶' };

/* the one-player layout as a binding (action → codes), from SOLO's mask map */
export function soloBinding() {
  const b = Object.fromEntries(ACTIONS.map((a) => [a.id, []]));
  for (const [code, bit] of Object.entries(SOLO)) for (const a of ACTIONS) if (a.bit === bit) b[a.id].push(code);
  return b;
}

/* code → { p, actions } for every bound key (a key held by both: the later
   player's; layouts.js never lets that happen) */
export function litKeys(bindings) {
  const lit = new Map();
  bindings.forEach((b, p) => {
    if (!b) return;
    for (const a of ACTIONS) for (const code of b[a.id] || []) {
      const e = lit.get(code);
      if (e && e.p === p) e.actions.push(a.id);
      else lit.set(code, { p, actions: [a.id] });
    }
  });
  return lit;
}

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* the SVG: bindings [p1, p2?]; wait = { p, a } while a key is being rebound;
   click: lit keys carry data-p / data-a so a card can rebind them */
export function keyboardSVG(bindings, { wait = null, click = false, title = 'Keyboard controls', cols = 23, extras = [] } = {}) {
  // cols: how many key widths from the left are drawn (18.5: the main block
  // and the arrows, no numpad — the compact practice panel)
  const U = 40, PAD = 10, GAP = 3;
  const W = cols * U + PAD * 2, H = 5 * U + PAD * 2;
  const lit = litKeys(bindings);
  const parts = [];
  for (const k of KEYS) {
    if (k.x >= cols) continue;
    const x = PAD + k.x * U + GAP / 2, y = PAD + k.y * U + GAP / 2, w = k.w * U - GAP, h = k.h * U - GAP;
    const L = lit.get(k.code);
    // a key that isn't a player's (M: mute): drawn in the neutral colour, never 'lit'
    const X = !L && extras.find((e) => e.code === k.code);
    if (X) {
      const x0 = PAD + k.x * U + GAP / 2, y0 = PAD + k.y * U + GAP / 2;
      parts.push(`<g class="k sys" data-code="${k.code}"><title>${esc(`${X.word} (${k.cap})`)}</title>`
        + `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="5" class="cap sys"/>`
        + `<text x="${x0 + 5}" y="${y0 + 14}" class="cl on">${esc(k.cap)}</text>`
        + `<text x="${x0 + w / 2}" y="${y0 + h - 6}" class="aw">${esc(X.word)}</text></g>`);
      continue;
    }
    if (!L) {
      parts.push(`<g class="k" data-code="${k.code}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" class="cap"/>`
        + (k.cap ? `<text x="${x + 5}" y="${y + 12}" class="cl">${esc(k.cap)}</text>` : '') + '</g>');
      continue;
    }
    const col = P_COLORS[L.p], a = L.actions[0];
    const waiting = wait && wait.p === L.p && L.actions.includes(wait.a);
    const word = L.actions.map((id) => ACTION_WORD[id]).filter((v, i, s) => s.indexOf(v) === i).join('/');
    const arrow = ARROW[a] || '';
    const big = k.w >= 2;
    parts.push(`<g class="k lit p${L.p + 1}${waiting ? ' wait' : ''}" data-code="${k.code}" data-p="${L.p}" data-a="${a}"${click ? ' role="button" tabindex="-1"' : ''}>`
      + `<title>${esc(`Player ${L.p + 1}: ${L.actions.map((id) => ACTIONS.find((q) => q.id === id).label).join(', ')} (${k.cap || k.code})`)}</title>`
      + `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" style="fill:${col}" class="cap lit"/>`
      + `<rect x="${x + 2.5}" y="${y + 2}" width="${w - 5}" height="${h - 8}" rx="3.5" class="top"/>`
      + `<text x="${x + 5}" y="${y + 14}" class="cl on">${esc(k.cap)}</text>`
      + (arrow && !big ? `<text x="${x + w - 5}" y="${y + 13}" class="ar">${arrow}</text>` : '')
      + `<text x="${x + w / 2}" y="${y + h - 6}" class="aw${big ? ' big' : ''}">${esc(big ? `${arrow ? arrow + ' ' : ''}${word}` : word)}</text>`
      + '</g>');
  }
  // the three blocks' outlines
  const block = (x0, w) => `<rect x="${PAD + x0 * U - 5}" y="${PAD - 5}" width="${w * U + 10}" height="${5 * U + 10}" rx="9" class="blk"/>`;
  return `<svg class="kbsvg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}" xmlns="http://www.w3.org/2000/svg">`
    + `<rect x="0" y="0" width="${W}" height="${H}" rx="12" class="base"/>${block(0, 15)}${cols > 15.5 ? block(15.5, 3) : ''}${cols > 19 ? block(19, 4) : ''}`
    + parts.join('') + '</svg>';
}

/* the combos under it; off-board keys and unbound actions listed */
export function comboLine() {
  return '<b>Throw</b> Light+Heavy · <b>Dash</b> double-tap Move · <b>Signature</b> Crouch+Heavy · <b>Dive slam</b> Crouch+Heavy in the air · <b>Low block</b> Crouch+Block · <b>Mute</b> M';
}
export function strays(bindings, keyCap) {
  const out = [];
  bindings.forEach((b, p) => {
    if (!b) return;
    for (const a of ACTIONS) {
      const codes = b[a.id] || [];
      if (!codes.length) out.push({ p, a: a.id, text: `${ACTION_WORD[a.id]}: not set` });
      for (const c of codes) if (!KEY_AT[c]) out.push({ p, a: a.id, text: `${ACTION_WORD[a.id]}: ${keyCap(c)}` });
    }
  });
  return out;
}
