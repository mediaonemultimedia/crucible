/* The button masher, for the anti-mash test and the balance tool: walks
   forward and, once close, mashes lights and heavies — no blocking, no
   spacing, no timing. The combat pass is meant to make this lose.        */

import { LEFT, RIGHT, LIGHT, HEAVY } from '../sim/input.js';
import { makeRng } from '../sim/rng.js';

export function masher(side, seed) {
  const r = makeRng(seed * 31 + 7);
  let t = 0;
  return (st) => {
    t++;
    const me = st.f[side], o = st.f[1 - side];
    const fwd = o.x > me.x ? RIGHT : LEFT;
    if (Math.abs(o.x - me.x) > 2600) return fwd;
    const m = t % 3 === 0 ? (r.int(100) < 55 ? LIGHT : HEAVY) : 0;
    return fwd | m;
  };
}
