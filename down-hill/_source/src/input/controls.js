/* Player 1's controls: the keyboard and the first gamepad, mixed, sampled
   once per sim tick into the race's input object. A tap shorter than a
   tick still counts (latched until the next sample).

   Keyboard: ← → / A D steer, ↑ / W gas, ↓ / S brake / reverse,
   Shift / K drift, Space / J item, T / L taunt (a trick in the air),
   Q / C look back. Gamepad (standard mapping): left stick / d-pad steer,
   A or RT gas, B or LT brake, RB / R1 drift, LB / L1 or X item, Y taunt,
   the right stick pushed down or back to look back.

   Stage 2 hook: a phone pad (PF2's) feeds `extra` — anything OR-ed in
   there is merged the same way.                                         */

export const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake',
  ShiftLeft: 'drift', ShiftRight: 'drift', KeyK: 'drift',
  Space: 'item', KeyJ: 'item', KeyT: 'taunt', KeyL: 'taunt', KeyQ: 'back', KeyC: 'back',
};
const typing = (e) => { const t = e.target; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'); };

export class Controls {
  constructor(target = window) {
    this.held = new Set();
    this.tapped = new Set();
    this.enabled = true;
    this.extra = null;
    this._down = (e) => {
      const a = KEYMAP[e.code];
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

  _acts() { const s = new Set(); for (const c of this.held) s.add(KEYMAP[c]); for (const a of this.tapped) s.add(a); return s; }

  /* the gamepad's state as actions (+ an analogue steer) */
  pad() {
    const gp = typeof navigator !== 'undefined' && navigator.getGamepads ? [...navigator.getGamepads()].find((g) => g && g.connected) : null;
    if (!gp) return null;
    const b = (i) => !!gp.buttons[i]?.pressed, v = (i) => gp.buttons[i]?.value || 0;
    let steer = gp.axes[0] || 0;
    if (Math.abs(steer) < 0.15) steer = 0;
    if (b(14)) steer = -1; if (b(15)) steer = 1;
    return {
      steer, gas: b(0) || v(7) > 0.3 || b(12), brake: b(1) || v(6) > 0.3 || b(13), drift: b(5), item: b(4) || b(2), taunt: b(3),
      back: (gp.axes[3] || 0) > 0.6 || b(11), start: b(9), confirm: b(0), cancel: b(1),
    };
  }

  sample() {
    const A = this._acts();
    this.tapped.clear();
    const I = {
      steer: (A.has('right') ? 1 : 0) - (A.has('left') ? 1 : 0),
      gas: A.has('gas'), brake: A.has('brake'), drift: A.has('drift'), item: A.has('item'), taunt: A.has('taunt'), back: A.has('back'),
    };
    const P = this.pad();
    if (P) {
      if (P.steer) I.steer = Math.max(-1, Math.min(1, I.steer + P.steer));
      for (const k of ['gas', 'brake', 'drift', 'item', 'taunt', 'back']) I[k] = I[k] || P[k];
    }
    if (this.extra) { const X = this.extra(); if (X) { if (X.steer) I.steer = Math.max(-1, Math.min(1, I.steer + X.steer)); for (const k of ['gas', 'brake', 'drift', 'item', 'taunt', 'back']) I[k] = I[k] || !!X[k]; } }
    return I;
  }

  /* menu navigation from the pad: edge-triggered directions and buttons */
  padMenu() {
    const P = this.pad();
    if (!P) return [];
    const gp = [...navigator.getGamepads()].find((g) => g && g.connected);
    const now = { left: (gp.axes[0] || 0) < -0.6 || !!gp.buttons[14]?.pressed, right: (gp.axes[0] || 0) > 0.6 || !!gp.buttons[15]?.pressed, up: (gp.axes[1] || 0) < -0.6 || !!gp.buttons[12]?.pressed, down: (gp.axes[1] || 0) > 0.6 || !!gp.buttons[13]?.pressed, confirm: P.confirm || P.start, cancel: P.cancel };
    const out = [];
    for (const k in now) if (now[k] && !this.padPrev[k]) out.push(k);
    this.padPrev = now;
    return out;
  }

  clear() { this.held.clear(); this.tapped.clear(); }
}
