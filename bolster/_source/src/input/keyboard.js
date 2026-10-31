/* The keyboard, sampled once per sim tick into the 8-bit input mask.
   A tap shorter than a tick still counts: presses are latched until the
   next sample. A / D walk, W jump, S crouch, E block (S+E low), O light,
   P heavy, O+P together a throw, Space the special (arrow keys walk and
   jump too). Versus on one keyboard is two of these, each with its own
   map (input/layouts.js). Keys typed into a text field are left alone.   */

import { SOLO } from './layouts.js';

const typing = (e) => { const t = e.target; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && !t.readOnly; };

export class Keyboard {
  constructor(target = window, map = SOLO) {
    this.map = map;
    this.held = 0;
    this.tapped = 0;
    this.enabled = true;
    this.codes = new Set();          // the keys down (two keys may share a bit: Num 0, Num Enter)
    this._down = (e) => {
      const b = this.map[e.code];
      if (!b || !this.enabled || e.metaKey || e.ctrlKey || e.altKey || typing(e)) return;
      e.preventDefault();
      if (!(this.held & b)) this.tapped |= b;
      this.codes.add(e.code);
      this._held();
    };
    this._up = (e) => { if (this.codes.delete(e.code)) this._held(); };
    this._blur = () => { this.codes.clear(); this.held = 0; };
    target.addEventListener('keydown', this._down);
    target.addEventListener('keyup', this._up);
    window.addEventListener('blur', this._blur);
    this._target = target;
  }

  dispose() {
    this._target.removeEventListener('keydown', this._down);
    this._target.removeEventListener('keyup', this._up);
    window.removeEventListener('blur', this._blur);
  }

  /* this tick's mask: what's held, plus anything tapped since the last one */
  sample() {
    const m = this.held | this.tapped;
    this.tapped = 0;
    return m;
  }

  _held() { let m = 0; for (const c of this.codes) m |= this.map[c] || 0; this.held = m; }

  clear() { this.codes.clear(); this.held = 0; this.tapped = 0; }

  setMap(map) { this.map = map; this.clear(); }
}
