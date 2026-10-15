/* The match's seeded PRNG: mulberry32 on a uint32 kept in the state, so a
   snapshot carries its own future and two peers replaying the same inputs
   draw the same numbers. Integer ops only (Math.imul, >>>).               */

export function rngNext(st) {
  let a = (st.rng + 0x6d2b79f5) >>> 0;
  st.rng = a;
  let t = Math.imul(a ^ (a >>> 15), a | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/* an integer in [0, n) */
export const rngInt = (st, n) => rngNext(st) % n;

/* a standalone generator for things outside the sim that still need to be
   reproducible (the AI): same algorithm, its own seed */
export function makeRng(seed) {
  const s = { rng: seed >>> 0 };
  return { next: () => rngNext(s), int: (n) => rngNext(s) % n, chance: (num, den) => rngNext(s) % den < num, get state() { return s.rng; } };
}
