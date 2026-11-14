/* OG / ALT: every fighter can be picked as the original (OG) or the evil
   twin (ALT), in every mode. Cosmetic only — the variant picks the plush
   that's drawn and the name on the cards; it never reaches the sim (its
   state, its hash, rollback). Pure functions here so the rules are tested
   without a browser.                                                     */

import { makeRng } from '../sim/rng.js';

/* the twins' titles, shown on the card and the plate when ALT is up */
export const TWIN_TITLE = {
  kevalanche: 'Hockey Goon',
  rubberta: 'Anglerfish',
  johnny: 'Sith Ace',
  sumaura: 'Tuxedo Villain',
  k8e: 'Punk',
  sebas: 'El Rudo',
  zach: 'Ghost Pirate',
};

/* what each seat will actually wear: the mirror rule — both on the same
   fighter in the same variant, and the second is flipped to the other one
   (so a mirror match is OG vs ALT, as it always was). `two`: whether the
   second seat is in play yet (vs Computer / practice pick one at a time). */
export function resolveVariants(ids, alt, two = true) {
  const a0 = !!alt[0];
  let a1 = !!alt[1];
  if (two && ids[0] === ids[1] && a1 === a0) a1 = !a0;
  return [a0, a1];
}

/* the select messages online: the fighter's index and the variant (0 / 1) */
export function selectMsg(t, i, alt) { return { t, i, v: alt ? 1 : 0 }; }
export function readSelect(m) { return { i: m.i | 0, alt: m.v === 1 }; }

/* the host's start message carries both seats' (resolved) variants */
export function startMsg({ p1, p2, seed, n, alt = [false, false] }) { return { t: 'start', p1, p2, seed, n, v: [alt[0] ? 1 : 0, alt[1] ? 1 : 0] }; }
export function readStart(m) {
  const v = Array.isArray(m.v) ? m.v : [0, 0];
  return { p1: m.p1, p2: m.p2, seed: m.seed, n: m.n, alt: [v[0] === 1, v[1] === 1] };
}

/* the sim's arguments for a match: the variant is deliberately not among them */
export function simArgs({ p1, p2, seed }) { return { p1, p2, seed }; }

/* the computer sometimes goes ALT: a seeded coin per fighter (cosmetic) */
export function cpuAlt(seed, i) {
  const r = makeRng(((seed | 0) * 31 + i * 977 + 7) >>> 0 || 1);
  return r.int(100) < 35;
}

/* the last variant each seat had on each fighter, this session */
export class VariantMemory {
  constructor() { this.m = [{}, {}]; }
  get(k, id) { return !!this.m[k][id]; }
  has(k, id) { return id in this.m[k]; }
  set(k, id, alt) { this.m[k][id] = !!alt; }
}
