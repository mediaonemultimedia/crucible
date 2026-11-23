/* Stage 5 (Kevin's second playtest): items for everyone, the four new
   items, the difficulty curve, one road width, harder boosts.           */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Race, noInput, ITEMS, ITEM_NAMES, ITEM_TIPS, BOOST_TOP, BOX_LANES } from '../src/race/sim.js';
import { CPU, levelAt, cupStrength, LEVEL_NAMES } from '../src/race/cpu.js';
import { ORDER } from '../src/race/roster.js';
import { TRACKS, buildTrack, ROAD } from '../src/race/track.js';
import { avgRace } from '../tools/avgdriver.mjs';

const field = (lvl = 'normal') => ORDER.map((id) => ({ id, cpu: lvl })).concat([{ id: 'kevalanche', alt: true }]);
const gas = (o = {}) => ({ ...noInput(), gas: true, ...o });
/* a race past the countdown, every kart parked on the line facing along the track */
function grid(track = 'landing', seed = 3) {
  const R = new Race({ racers: field(), seed, humans: [7], track });
  for (let i = 0; i < 225; i++) R.step(R.karts.map(() => noInput()));
  R.events.length = 0;
  return R;
}
function put(R, i, dk, d = 0) {
  const T = R.T, K = R.karts[i], k = (R.startK + dk + T.N) % T.N;
  K.x = T.x[k] + -T.tz[k] * d; K.z = T.z[k] + T.tx[k] * d; K.y = T.y[k]; K.k = k; K.kc = dk; K.yaw = Math.atan2(T.tx[k], T.tz[k]);
  K.vx = K.vz = K.fwd = 0; K.air = 0; K.invT = 0; K.spinT = 0;
}

test('ten items, each with a name and a 3-to-5-word tip', () => {
  assert.equal(ITEMS.length, 10);
  for (const it of ITEMS) {
    assert.ok(ITEM_NAMES[it], it);
    const n = ITEM_TIPS[it].split(/\s+/).length;
    assert.ok(n >= 3 && n <= 5, `${it}: "${ITEM_TIPS[it]}"`);
  }
});

test('one road width everywhere: half-width 10.5 on every waypoint of every track', () => {
  assert.equal(ROAD, 10.5);
  for (const id of ['landing', 'laundry', 'park']) {
    const T = buildTrack(TRACKS[id]);
    for (const p of TRACKS[id].points) assert.equal(p.w, ROAD, `${id} ${p.tag}`);
    let lo = 1e9, hi = 0; for (let k = 0; k < T.N; k++) { lo = Math.min(lo, T.w[k]); hi = Math.max(hi, T.w[k]); }
    assert.ok(hi - lo < 0.01, `${id}: ${lo}…${hi}`);
  }
});

test('a box row is never used up: two karts through the same box both get an item', () => {
  const R = grid();
  const B = R.boxes[0], T = R.T;
  assert.equal(R.boxes.filter((b) => b.k === B.k).length, BOX_LANES.length);
  for (const i of [0, 1]) { const K = R.karts[i]; K.x = B.x; K.z = B.z; K.y = T.y[B.k]; K.k = B.k; }
  R.step(R.karts.map(() => noInput()));
  assert.ok(R.karts[0].item && R.karts[1].item, `${R.karts[0].item} ${R.karts[1].item}`);
});

test('boosts hit harder: the peak is 1.62 × top speed', () => {
  assert.ok(BOOST_TOP >= 1.6);
  const R = grid();
  const K = R.karts[7];
  put(R, 7, 40);
  for (let i = 0; i < 240; i++) { R.step(R.karts.map((_, j) => (j === 7 ? gas() : noInput()))); }
  const cruise = K.fwd;
  K.boostT = 1.65;
  let peak = 0;
  for (let i = 0; i < 120; i++) { R.step(R.karts.map((_, j) => (j === 7 ? gas() : noInput()))); peak = Math.max(peak, K.fwd); }
  assert.ok(peak > cruise * 1.45, `peak ${peak.toFixed(1)} vs cruise ${cruise.toFixed(1)}`);
});

test('Sugar Rush: faster, immune to items, and karts you bump spin out', () => {
  const R = grid();
  const K = R.karts[7], O = R.karts[0];
  put(R, 7, 60); put(R, 0, 64);
  K.item = 'sugar';
  R.step(R.karts.map((_, j) => (j === 7 ? gas({ item: true }) : noInput())));
  assert.ok(K.sugarT > 5);
  assert.equal(R.hit(K, 'missile', 0), false, 'immune');
  const ev = [];
  for (let i = 0; i < 90; i++) { R.step(R.karts.map((_, j) => (j === 7 ? gas() : noInput()))); ev.push(...R.events); R.events.length = 0; }
  assert.ok(ev.some((e) => e.k === 'hit' && e.kind === 'sugar' && e.i === 0), ev.map((e) => e.k).join(' '));
  assert.ok(O.spinT > 0 || ev.some((e) => e.k === 'hit' && e.i === 0));
});

test('Paper Plane: homes in on the racer just ahead along the track and bonks them; a missile held behind blocks it', () => {
  for (const blocked of [false, true]) {
    const R = grid();
    put(R, 7, 40); put(R, 0, 120, 4);
    R._place();
    const K = R.karts[7], O = R.karts[0];
    // everyone else far behind
    for (let i = 1; i < 7; i++) put(R, i, -200 - i * 6);
    R._place();
    K.item = 'plane';
    if (blocked) O.item = 'missile';
    const ev = [];
    for (let i = 0; i < 60 * 6; i++) {
      R.step(R.karts.map((_, j) => (j === 7 ? { ...noInput(), item: i === 1 } : j === 0 ? { ...noInput(), back: blocked } : noInput())));
      ev.push(...R.events); R.events.length = 0;
    }
    const hit = ev.some((e) => e.k === 'hit' && e.kind === 'plane' && e.i === 0), block = ev.some((e) => e.k === 'block' && e.i === 0);
    if (blocked) assert.ok(block && !hit, ev.map((e) => e.k).join(' '));
    else assert.ok(hit, ev.map((e) => e.k).join(' '));
    assert.equal(R.shots.length, 0, 'resolved');
  }
});

test('Hot Wash: every other racer shrinks for ~5 s; a full-size kart squashes a shrunk one flat', () => {
  const R = grid();
  const K = R.karts[7];
  put(R, 7, 60);
  K.item = 'wash';
  for (let i = 0; i < 50; i++) { R.step(R.karts.map((_, j) => ({ ...noInput(), item: j === 7 && i === 0 }))); }
  assert.equal(K.shrinkT, 0);
  assert.ok(R.karts.filter((O) => O !== K && O.shrinkT > 4).length === 7);
  // K (full size) drives into a shrunk one
  put(R, 7, 80); put(R, 0, 84);
  const ev = [];
  for (let i = 0; i < 60; i++) { R.step(R.karts.map((_, j) => (j === 7 ? gas() : noInput()))); ev.push(...R.events); R.events.length = 0; }
  assert.ok(ev.some((e) => e.k === 'flat' && e.i === 0), ev.map((e) => e.k).join(' '));
});

test('Spring Cushion: locks onto the racer ahead within 60 units, fires on ITEM, launches them out (~1.5 s lost)', () => {
  const R = grid();
  const K = R.karts[7], O = R.karts[0];
  for (let i = 1; i < 7; i++) put(R, i, -300 - i * 6);
  put(R, 7, 40); put(R, 0, 140);
  R._place();
  K.item = 'spring';
  R.step(R.karts.map(() => noInput()));
  assert.equal(K.lock, -1, 'out of range: no lock');
  R.step(R.karts.map((_, j) => ({ ...noInput(), item: j === 7 })));
  assert.equal(K.item, 'spring', 'no lock: it does not fire');
  put(R, 0, 80); R._place();
  R.step(R.karts.map(() => noInput()));
  assert.equal(K.lock, 0, 'locked on');
  const ev = [];
  R.step(R.karts.map((_, j) => ({ ...noInput(), item: j === 7 })));
  ev.push(...R.events);
  assert.ok(ev.some((e) => e.k === 'eject' && e.i === 0), ev.map((e) => e.k).join(' '));
  assert.ok(O.ejectT > 1.4 && !K.item && K.lock === -1);
});

test('the odds: rear racers get the strong items, the leader mostly defensive ones', () => {
  const R = grid();
  const count = (place) => { const K = R.karts[7]; K.place = place; const c = {}; for (let i = 0; i < 3000; i++) { const it = R._roll(K); c[it] = (c[it] || 0) + 1; } return c; };
  const first = count(1), last = count(8);
  assert.ok(((first.slick || 0) + (first.missile || 0)) / 3000 > 0.75, JSON.stringify(first));
  for (const it of ['sugar', 'alarm', 'plane', 'spring', 'wash', 'cuffs']) assert.ok(!first[it], `${it} for the leader`);
  assert.ok((last.sugar || 0) > 300 && (last.alarm || 0) > 200, JSON.stringify(last));
});

test('the difficulty curve: four levels; the cup ramps gentle → medium → full; Champion is hard plus a bit', () => {
  assert.deepEqual(LEVEL_NAMES, ['easy', 'normal', 'hard', 'champion']);
  assert.deepEqual([0, 1, 2].map(cupStrength), [0, 0.5, 1]);
  const g = levelAt('normal', 0), m = levelAt('normal', 0.5), f = levelAt('normal', 1);
  assert.ok(g.top < m.top && m.top < f.top && g.err > f.err && g.item < f.item && g.band[0] < f.band[0]);
  assert.equal(levelAt('champion', 0).top, levelAt('champion', 1).top);
  assert.ok(levelAt('champion', 1).top > levelAt('hard', 1).top);
});

test('the average driver on normal: gentler single races than at full strength', () => {
  const place = (strength) => { let s = 0; for (let seed = 1; seed <= 6; seed++) s += avgRace({ track: 'park', strength, seed: seed * 31 }).place; return s / 6; };
  const gentle = place(0), full = place(1);
  console.log(`# average driver, park, mean place: gentle ${gentle.toFixed(2)}, full ${full.toFixed(2)}`);
  assert.ok(gentle <= full, `${gentle} vs ${full}`);
});
