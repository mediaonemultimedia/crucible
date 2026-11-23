import test from 'node:test';
import assert from 'node:assert/strict';
import { Race, noInput } from '../src/race/sim.js';
import { buildTrack, lateral, rightX, rightZ, sceneryClearsRoad, TRACKS } from '../src/race/track.js';

test('a side impact cannot shove a kart through the banister rail between ticks', () => {
  const race = new Race({ track: 'landing', racers: [{ id: 'kevalanche' }, { id: 'zach' }], seed: 7 });
  const { T } = race;
  const k = T.sec.findIndex((section) => T.def.points[section].tag === 'banister') + 36;
  const rail = T.w[k] + T.m[k];
  race.phase = 'race';
  race.karts.forEach((kart, i) => {
    const d = rail - 1.6 - i * 1.1;
    Object.assign(kart, {
      k, d, x: T.x[k] + rightX(T, k) * d, z: T.z[k] + rightZ(T, k) * d, y: T.y[k],
      yaw: Math.atan2(T.tx[k], T.tz[k]), air: 0, vx: 0, vz: 0,
    });
  });
  race.step([noInput(), noInput()]);
  assert(lateral(T, k, race.karts[0].x, race.karts[0].z) <= rail - 1.54);
});

test('The Landing road never dips below the bedroom or hallway floor', () => {
  const track = buildTrack(TRACKS.landing);
  assert.equal(Math.min(...track.y), 0);
});


test('scenery clearance rejects shoulder overlaps and respects the road layer', () => {
  const T = buildTrack(TRACKS.laundry);
  const k = T.y.findIndex(y => y > 9);
  const side = T.w[k] + T.m[k];
  const testAt = (d, bottom, top) => sceneryClearsRoad(T,
    T.x[k] + rightX(T, k) * d, T.z[k] + rightZ(T, k) * d, 2, 4, 0.4, bottom, top);
  assert.equal(testAt(side + 2, 0, 40), false);
  assert.equal(testAt(side + 10, 0, 40), true);
  assert.equal(testAt(0, 0, 3), true);
});
