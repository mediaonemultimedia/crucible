/* One player's controls: a keyboard map, a gamepad and (stage 2) a phone
   pad, mixed, sampled once per sim tick into the race's input object. A
   tap shorter than a tick still counts (latched until the next sample).

   Keyboard, one player (`all`): ← → / A D steer, ↑ / W gas, ↓ / S brake /
   reverse, Shift / K drift, Space / J item, T / L taunt (a trick in the
   air), Q / C look back.
   Two players on one keyboard: P1 takes the left half (`left`: A D steer,
   W gas, S brake, Left Shift / F drift, Space / E item, T / R taunt, Q / C
   look back) and P2 the right (`right`: ← → steer, ↑ gas, ↓ brake, Right
   Shift / '/' drift, Enter / '.' item, L / ' taunt, K / ';' look back).

   Gamepad (standard mapping): left stick / d-pad steer, A or RT gas, B or
   LT brake, RB / R1 drift, LB / L1 or X item, Y taunt, the right stick
   pushed down or back to look back. Each player owns one gamepad (by its
   index); `gp: 'auto'` takes the first one nobody else has claimed.

   `extra`: a function returning another input to merge (a phone pad).   */

export const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake',
  ShiftLeft: 'drift', ShiftRight: 'drift', KeyK: 'drift',
  Space: 'item', KeyJ: 'item', KeyT: 'taunt', KeyL: 'taunt', KeyQ: 'back', KeyC: 'back', KeyX: 'wallop',
};
export const KEYMAP_LEFT = {
  KeyA: 'left', KeyD: 'right', KeyW: 'gas', KeyS: 'brake', ShiftLeft: 'drift', KeyF: 'drift',
  Space: 'item', KeyE: 'item', KeyT: 'taunt', KeyR: 'taunt', KeyQ: 'back', KeyC: 'back', KeyX: 'wallop',
};
export const KEYMAP_RIGHT = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'gas', ArrowDown: 'brake', ShiftRight: 'drift', Slash: 'drift',
  Enter: 'item', NumpadEnter: 'item', Period: 'item', KeyL: 'taunt', Quote: 'taunt', KeyK: 'back', Semicolon: 'back', KeyO: 'wallop',
};
export const MAPS = { all: KEYMAP, left: KEYMAP_LEFT, right: KEYMAP_RIGHT, none: {} };
/* the menu keys of each half: move, confirm */
export const MENU_KEYS = {
  all: { left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], confirm: ['Enter', 'Space'] },
  left: { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'], confirm: ['Space', 'KeyE'] },
  right: { left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'], confirm: ['Enter', 'NumpadEnter', 'Period'] },
};
const ACTS = ['gas', 'brake', 'drift', 'item', 'taunt', 'back', 'wallop'];
const typing = (e) => { const t = e.target; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'); };
export const gamepads = () => (typeof navigator !== 'undefined' && navigator.getGamepads ? [...navigator.getGamepads()].filter((g) => g && g.connected) : []);

export class Controls {
  constructor(target = window, { map = 'all', gp = 'auto' } = {}) {
    this.held = new Set();
    this.tapped = new Set();
    this.enabled = true;
    this.extra = null;
    this.map = map;
    this.gp = gp;                 // a gamepad index, 'auto' (first unclaimed) or null
    this.claimed = () => [];      // indices other players own (set by the app)
    this._down = (e) => {
      const a = MAPS[this.map][e.code];
      if (!a || !this.enabled || e.metaKey || e.ctrlKey || e.altKey || typing(e)) return;
      e.preventDefault();
      if (!this.held.has(e.code)) this.tapped.add(a);
      this.held.add(e.code);
    };
    this._up = (e) => { this.held.delete(e.code); };
    this._blur = () => { this.held.clear(); };
    target.addEventListener('keydown', this._down);
    target.addEventListener('keyup', this._up);
    window.addEventListener('blur', this._blur);
    this.padPrev = {};
  }

  _acts() { const M = MAPS[this.map], s = new Set(); for (const c of this.held) if (M[c]) s.add(M[c]); for (const a of this.tapped) s.add(a); return s; }

  gamepad() {
    if (this.gp === null || this.gp === undefined) return null;
    const all = gamepads();
    if (this.gp === 'auto') { const taken = this.claimed(); return all.find((g) => !taken.includes(g.index)) || null; }
    return all.find((g) => g.index === this.gp) || null;
  }

  /* the gamepad's state as actions (+ an analogue steer) */
  pad() {
    const gp = this.gamepad();
    if (!gp) return null;
    const b = (i) => !!gp.buttons[i]?.pressed, v = (i) => gp.buttons[i]?.value || 0;
    let steer = gp.axes[0] || 0;
    if (Math.abs(steer) < 0.15) steer = 0;
    if (b(14)) steer = -1; if (b(15)) steer = 1;
    return {
      steer, gas: b(0) || v(7) > 0.3 || b(12), brake: b(1) || v(6) > 0.3 || b(13), drift: b(5), item: b(4) || b(2), taunt: b(3), wallop: b(10),
      back: (gp.axes[3] || 0) > 0.6 || b(11), start: b(9), confirm: b(0), cancel: b(1),
    };
  }

  sample() {
    const A = this._acts();
    this.tapped.clear();
    const I = {
      steer: (A.has('right') ? 1 : 0) - (A.has('left') ? 1 : 0),
      gas: A.has('gas'), brake: A.has('brake'), drift: A.has('drift'), item: A.has('item'), taunt: A.has('taunt'), back: A.has('back'), wallop: A.has('wallop'),
    };
    const P = this.pad();
    if (P) {
      if (P.steer) I.steer = Math.max(-1, Math.min(1, I.steer + P.steer));
      for (const k of ACTS) I[k] = I[k] || P[k];
    }
    if (this.extra) { const X = this.extra(); if (X) { if (X.steer) I.steer = Math.max(-1, Math.min(1, I.steer + X.steer)); for (const k of ACTS) I[k] = I[k] || !!X[k]; } }
    return I;
  }

  /* menu navigation from the gamepad: edge-triggered directions and buttons */
  padMenu() {
    const gp = this.gamepad();
    if (!gp) return [];
    const b = (i) => !!gp.buttons[i]?.pressed;
    const now = { left: (gp.axes[0] || 0) < -0.6 || b(14), right: (gp.axes[0] || 0) > 0.6 || b(15), up: (gp.axes[1] || 0) < -0.6 || b(12), down: (gp.axes[1] || 0) > 0.6 || b(13), confirm: b(0) || b(9), cancel: b(1), next: b(5), prev: b(4), start: b(9) };
    const out = [];
    for (const k in now) if (now[k] && !this.padPrev[k]) out.push(k);
    this.padPrev = now;
    return out;
  }

  clear() { this.held.clear(); this.tapped.clear(); }
  dispose() { removeEventListener('keydown', this._down); removeEventListener('keyup', this._up); removeEventListener('blur', this._blur); }
}
