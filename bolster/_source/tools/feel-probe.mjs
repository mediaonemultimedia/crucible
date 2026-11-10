/* the feel pass in node: Kevalanche's soft body posed by either puppet
   through a scripted move, every particle checked (finite, within reach) */
import { SoftBody } from '../shared/grommet/softbody.js';
import { buildBear } from '../shared/grommet/athletes/bear.rig.js';
import { BoxerFeel } from '../src/render/feel.js';
import { BipedPuppet, phaseOf } from '../src/render/puppets.js';
import { cuffOnly } from '../src/render/gloves.js';
export function probe({ old = false, mv = 'heavy', ticks = 60, act = 'attack', log = false } = {}) {
  const rig = buildBear(); const soft = new SoftBody(rig);
  soft.params.stuffing = 0.5; soft.params.damping = 0.5;
  const P = old ? new BipedPuppet(soft, 'boxer') : new BoxerFeel(soft);
  cuffOnly(rig);
  P.aim = [0.66, 0, 0.75]; P.side = [0.75, 0, -0.66]; P.oppHead = [3, 2.5, 3];
  const idle = { id: 'kevalanche', act: 'idle', t: 0, face: 1 };
  for (let i = 0; i < 60; i++) { P.perform(idle, null); soft.advance(1 / 60, (h) => P.update(h)); }
  let worst = 0;
  for (let t = 1; t <= ticks; t++) {
    const F = { id: 'kevalanche', act, mv, t, face: 1 };
    P.perform(F, phaseOf(F));
    soft.advance(1 / 60, (h) => P.update(h));
    const c = soft.cloudC[0];
    let m = 0, bad = 0;
    for (let i = 0; i < soft.n; i++) {
      const d = Math.hypot(soft.x[i * 3] - c[0], soft.x[i * 3 + 1] - c[1], soft.x[i * 3 + 2] - c[2]);
      if (!Number.isFinite(d)) bad++; else m = Math.max(m, d);
    }
    worst = Math.max(worst, bad ? 1e9 : m);
    const reachOf = (ch) => { const i = ch.idx[ch.idx.length - 1]; return ((soft.x[i * 3] - c[0]) * P.aim[0] + (soft.x[i * 3 + 2] - c[2]) * P.aim[2]); };
    const R = reachOf(rig.arms[P.cfg.armR]), L = reachOf(rig.arms[P.cfg.armL]);
    const y = (ch) => soft.x[ch.idx[ch.idx.length - 1] * 3 + 1];
    if (log) console.log(t, 'R', R.toFixed(2), y(rig.arms[P.cfg.armR]).toFixed(2), 'L', L.toFixed(2), y(rig.arms[P.cfg.armL]).toFixed(2), 'sink', P.sink?.x?.toFixed(2), 'chest', P.chest?.x?.toFixed(2));
  }
  return worst;
}
if (process.argv[1].endsWith('feel-probe.mjs')) {
  const mv = process.argv[2], n = +(process.argv[3] || 20);
  if (mv) { console.log('old'); probe({ old: true, mv, log: true, ticks: n }); console.log('new'); probe({ mv, log: true, ticks: n }); }
  else for (const mv of ['light', 'heavy', 'signature', 'special', 'lowLight']) console.log(mv, 'old', probe({ old: true, mv }).toFixed(2), 'new', probe({ mv }).toFixed(2));
}
