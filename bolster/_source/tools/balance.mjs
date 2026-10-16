/* Balance: seeded CPU-vs-CPU matches in the sim (no browser), every pairing,
   both sides, at one difficulty. Prints win rates per pairing, each
   fighter's overall rate, throws per minute for the shooters, and flags any
   pairing beyond 70/30.

     node tools/balance.mjs [level=normal] [matches per side=20] [--json out.json] */
import fs from 'fs';
import { createMatch, stepInPlace } from '../src/sim/sim.js';
import { CPU } from '../src/ai/cpu.js';
import { ROSTER } from '../src/fighters/index.js';

const args = process.argv.slice(2);
const ji = args.indexOf('--json');
const jsonOut = ji >= 0 ? args.splice(ji, 2)[1] : null;
const level = args[0] || 'normal';
const N = +(args[1] || 20);

export function cpuMatch(p1, p2, l1, l2, seed) {
  const st = createMatch({ p1, p2, seed });
  const a = new CPU(0, l1, seed), b = new CPU(1, l2, seed + 1);
  const ev = [{}, {}];
  let n = 0;
  while (st.phase !== 'end' && n < 60 * 60 * 12) {
    stepInPlace(st, a.input(st), b.input(st));
    for (const e of st.ev) if (e.p === 0 || e.p === 1) ev[e.p][e.k] = (ev[e.p][e.k] || 0) + 1;
    n++;
  }
  return { st, n, ev };
}

const pairs = [];
for (let i = 0; i < ROSTER.length; i++) for (let j = i + 1; j < ROSTER.length; j++) pairs.push([ROSTER[i], ROSTER[j]]);
const total = Object.fromEntries(ROSTER.map((id) => [id, { w: 0, n: 0, throws: 0, ticks: 0 }]));
const rows = [];
for (const [A, B] of pairs) {
  let wa = 0, wb = 0, draw = 0;
  for (let s = 0; s < N * 2; s++) {
    const flip = s % 2 === 1;
    const [p1, p2] = flip ? [B, A] : [A, B];
    const { st, n, ev } = cpuMatch(p1, p2, level, level, 1000 + s * 17);
    const w = st.winner === 2 ? null : st.f[st.winner].id;
    if (w === null) draw++; else if (w === A) wa++; else wb++;
    for (let k = 0; k < 2; k++) { const id = st.f[k].id; total[id].throws += st.f[k].id === "johnny" || st.f[k].id === "k8e" ? ev[k].signature || 0 : 0; total[id].ticks += n; }
  }
  total[A].w += wa; total[B].w += wb; total[A].n += N * 2; total[B].n += N * 2;
  const share = wa / Math.max(1, wa + wb);
  rows.push({ a: A, b: B, wa, wb, draw, flag: share > 0.7 || share < 0.3 });
  console.log(`${A.padEnd(11)} vs ${B.padEnd(11)} ${String(wa).padStart(3)} – ${String(wb).padEnd(3)} ${draw ? `(${draw} draws)` : ''}${share > 0.7 || share < 0.3 ? '  ⚠ beyond 70/30' : ''}`);
}
console.log('');
for (const id of ROSTER) {
  const t = total[id];
  console.log(`${id.padEnd(11)} wins ${(100 * t.w / t.n).toFixed(0)}%  throws/min ${(t.throws / (t.ticks / 3600)).toFixed(2)}`);
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ level, N, rows, total }, null, 1));
