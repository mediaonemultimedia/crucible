/* Stage 3 (Kevin's first playtest): the rails are solid, nobody falls
   through the track, nothing is too skinny. Whole races in node.         */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Race, noInput, KART_R } from '../src/race/sim.js';
import { CPU } from '../src/race/cpu.js';
import { ORDER } from '../src/race/roster.js';
import { buildTrack, TRACKS, groundAt, lateral, rightX, rightZ } from '../src/race/track.js';

const field = (lvl = 'hard') => [...ORDER, 'kevalanche'].map((id, i) => ({ id, alt: i === 7, cpu: lvl }));

/* a race of 8 CPUs (one stands in for the autopilot player: p1cpu), items on,
   optionally all karts faster than their stats (high speed); checks every
   kart every tick */
function torture(track, seed, { speed = 1, lvl = 'hard' } = {}) {
  const R = new Race({ racers: field(lvl), seed, humans: [], track });
  const cpus = R.karts.map((K) => new CPU(R, K.i, lvl, seed));
  const T = R.T, N = T.N;
  const out = { below: 0, maxBelow: 0, falls: 0, stuck: 0, laps: 0, layerJumps: 0, scrapes: 0, items: 0, where: [] };
  const prevY = R.karts.map((K) => T.y[K.k]);
  let n = 0;
  while (R.phase !== 'done' && n++ < 60 * 300) {
    const inp = cpus.map((c) => c.think());
    if (speed !== 1) for (const K of R.karts) K.topMul = (K.topMul || 1) * speed;
    R.step(inp);
    for (const e of R.events) {
      if (e.k === 'fall') { if (e.why === 'stuck') out.stuck++; else { out.falls++; out.where.push(T.def.points[T.sec[R.karts[e.i].k]].tag); } }
      if (e.k === 'lap' || e.k === 'finish') out.laps++;
      if (e.k === 'scrape') out.scrapes++;
      if (e.k === 'use') out.items++;
    }
    R.events.length = 0;
    for (const K of R.karts) {
      if (K.fish) continue;
      const g = groundAt(T, K.k, K.d, 0);
      // never below the ground of the segment it is on (a little slack for the along-track interpolation)
      const below = g - K.y;
      if (below > 0.75) { out.below++; out.maxBelow = Math.max(out.maxBelow, below); out.where.push('below:' + T.def.points[T.sec[K.k]].tag); }
      // its road never jumps a layer in one tick (the duvet above the under-bed)
      if (!K.cut && Math.abs(T.y[K.k] - prevY[K.i]) > 6) { out.layerJumps++; out.where.push('layer:' + T.def.points[T.sec[K.k]].tag); }
      prevY[K.i] = T.y[K.k];
    }
  }
  out.done = R.phase === 'done';
  out.net = R.netCount || 0;
  return out;
}

for (const track of ['landing', 'laundry', 'park']) {
  test(`${track}: 24+ laps at racing and at high speed, items on: never below the road, no layer jumps, no falls`, () => {
    const tot = { net: 0, below: 0, falls: 0, stuck: 0, laps: 0, layerJumps: 0, scrapes: 0, items: 0, maxBelow: 0, where: [] };
    for (const [seed, speed] of [[1, 1], [2, 1.25], [3, 1.4]]) {
      const r = torture(track, seed, { speed });
      assert.ok(r.done, `${track} seed ${seed} finished`);
      for (const k of ['net', 'below', 'falls', 'stuck', 'laps', 'layerJumps', 'scrapes', 'items']) tot[k] += r[k];
      tot.maxBelow = Math.max(tot.maxBelow, r.maxBelow); tot.where.push(...r.where);
    }
    console.log(`# ${track}: ${tot.laps} laps, ${tot.items} items used, below-road ${tot.below}, safety-net catches ${tot.net}, layer jumps ${tot.layerJumps}, edge falls ${tot.falls}, stuck fish-outs ${tot.stuck}, scrapes ${tot.scrapes}`);
    assert.ok(tot.laps >= 24 * 3, `laps ${tot.laps}`);
    assert.equal(tot.net, 0, 'the safety net never had to catch anyone');
    assert.equal(tot.below, 0, `below the road: ${tot.where.join(' ')}`);
    assert.equal(tot.layerJumps, 0, `layer jumps: ${tot.where.join(' ')}`);
    assert.equal(tot.falls, 0, `falls off an edge (no track has a drop now): ${tot.where.join(' ')}`);
    assert.ok(tot.stuck <= 2, `stuck fish-outs ${tot.stuck}`);
  });
}

test('every drawn barrier is solid: no drop sections on any track; rails on the raised runs', () => {
  for (const id of ['landing', 'laundry', 'park']) {
    const T = buildTrack(TRACKS[id]);
    assert.equal(T.drop.filter(Boolean).length, 0, id);
    assert.ok(T.rail.filter(Boolean).length > 50, id);
  }
  const L = buildTrack(TRACKS.landing);
  for (const tag of ['plank', 'banister']) for (let k = 0; k < L.N; k++) if (L.def.points[L.sec[k]].tag === tag) assert.ok(L.rail[k], `${tag} ${k}`);
});

test('nothing is skinnier than 8.5 half-width', () => {
  for (const id of ['landing', 'laundry', 'park']) for (const p of TRACKS[id].points) assert.ok(p.w >= 8.5, `${id} ${p.tag} w ${p.w}`);
});

/* drive a kart into the banister's rail at speed */
function intoRail(angle) {
  const R = new Race({ racers: [{ id: 'kevalanche' }], seed: 1, humans: [0] });
  for (let i = 0; i < 230; i++) R.step([noInput()]);
  R.events.length = 0;
  const K = R.karts[0], T = R.T;
  const k = T.def.points.findIndex((p) => p.tag === 'banister');
  let kk = 0; for (let q = 0; q < T.N; q++) if (T.def.points[T.sec[q]].tag === 'banister') { kk = q + 30; break; }
  const th = Math.atan2(T.tx[kk], T.tz[kk]) + angle;   // a negative angle heads off to the right of the track
  K.x = T.x[kk] + rightX(T, kk) * 4; K.z = T.z[kk] + rightZ(T, kk) * 4; K.y = T.y[kk]; K.k = kk; K.lastGood = kk; K.yaw = th;
  K.vx = Math.sin(th) * 34; K.vz = Math.cos(th) * 34;
  void k;
  const ev = [];
  let minD = 0, maxD = 0;
  const sp0 = Math.hypot(K.vx, K.vz);
  for (let i = 0; i < 50; i++) {
    R.step([{ ...noInput(), gas: true, steer: angle < 0 ? 1 : 0 }]);   // holding it into the rail
    for (const e of R.events) ev.push(e.k); R.events.length = 0;
    const d = lateral(T, K.k, K.x, K.z); minD = Math.min(minD, d); maxD = Math.max(maxD, d);
    assert.ok(!K.fish && !K.air, `still on the banister (tick ${i}: fish ${!!K.fish} air ${K.air} y ${K.y} road ${T.y[K.k]})`);
  }
  return { R, K, T, ev, maxD, minD, sp0, sp: Math.hypot(K.vx, K.vz), kk };
}
test('the banister rails: you collide, stay on, scrape (sparks + sound event) and slow down; never bounce off', () => {
  const { K, T, ev, maxD, sp0, sp, kk } = intoRail(-0.6);
  assert.ok(maxD <= T.w[kk] + T.m[kk] + 0.01, `stayed inside the rail (d ${maxD})`);
  assert.ok(ev.includes('scrape'), ev.join(' '));
  assert.ok(Math.abs(K.y - T.y[K.k]) < 0.5, 'still on top of the banister');
  // no rebound: the kart is not thrown back across the road
  assert.ok(lateral(T, K.k, K.x, K.z) > T.w[kk] * 0.3, `not bounced off (d ${lateral(T, K.k, K.x, K.z)})`);
  assert.ok(sp < sp0 * 0.75, `slowed down: ${sp0} → ${sp}`);
  void KART_R;
});
test('scraping a rail is slower than driving clear of it', () => {
  const scrape = intoRail(-0.6), clear = intoRail(0);
  assert.ok(scrape.K.kc < clear.K.kc - 3, `scraping ${scrape.K.kc} vs clear ${clear.K.kc}`);
});
