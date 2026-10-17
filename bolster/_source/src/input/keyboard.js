/* The keyboard, sampled once per sim tick into the 8-bit input mask.
   A tap shorter than a tick still counts: presses are latched until the
   next sample. A / D walk, W jump, S crouch, E block (S+E low), O light,
   P heavy, O+P together a throw, Space the special (arrow keys walk and
   jump too).                                                              */

import { LEFT, RIGHT, UP, DOWN, LIGHT, HEAVY, SPECIAL, BLOCK } from '../sim/input.js';

const MAP = {
  KeyA: LEFT, KeyD: RIGHT, KeyW: UP, KeyS: DOWN, KeyO: LIGHT, KeyP: HEAVY, Space: SPECIAL, KeyE: BLOCK,
  ArrowLeft: LEFT, ArrowRight: RIGHT, ArrowUp: UP, ArrowDown: DOWN,
};

export class Keyboard {
  constructor(target = window) {
    this.held = 0;
    this.tapped = 0;
    this.enabled = true;
    this._down = (e) => {
      const b = MAP[e.code];
      if (!b || !this.enabled || e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      if (!(this.held & b)) this.tapped |= b;
      this.held |= b;
    };
    this._up = (e) => { const b = MAP[e.code]; if (b) this.held &= ~b; };
    this._blur = () => { this.held = 0; };
    target.addEventListener('keydown', this._down);
    target.addEventListener('keyup', this._up);
    window.addEventListener('blur', this._blur);
  }

  /* this tick's mask: what's held, plus anything tapped since the last one */
  sample() {
    const m = this.held | this.tapped;
    this.tapped = 0;
    return m;
  }

  clear() { this.held = 0; this.tapped = 0; }
}
