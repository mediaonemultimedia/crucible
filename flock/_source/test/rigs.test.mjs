import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRig } from '../src/rig.js';
import { SoftBody } from '../src/softbody.js';
import { Idle } from '../src/idle.js';
import { det3, mulMat3 } from '../src/math.js';

const run = (b, sec) => { for (let t = 0; t < sec; t += 1 / 60) b.step(1 / 60); };
const restY = (rig, k) => { let y = 0; for (const i of rig.clouds[k].ix) y += rig.rest[i * 3 + 1]; return y / rig.clouds[k].ix.length; };
const vol = (g) => Math.abs(det3(mulMat3(g.A, g.AqqInv, new Float64Array(9))));
const chainLen = (b, idx) => {
  let L = 0;
  for (let j = 1; j < idx.length; j++) {
    const a = idx[j - 1], c = idx[j];
    L += Math.hypot(b.x[a * 3] - b.x[c * 3], b.x[a * 3 + 1] - b.x[c * 3 + 1], b.x[a * 3 + 2] - b.x[c * 3 + 2]);
  }
  return L;
};
// where a chain point sits in its cloud's frame (so a toy that shuffles a
// little on the floor still counts as back in pose)
const local = (b, ch, i) => {
  const g = b.clouds[ch.cloud], R = b.cloudR[ch.cloud];
  const d = [b.x[i * 3] - g.c[0], b.x[i * 3 + 1] - g.c[1], b.x[i * 3 + 2] - g.c[2]];
  return [R[0] * d[0] + R[3] * d[1] + R[6] * d[2], R[1] * d[0] + R[4] * d[1] + R[7] * d[2], R[2] * d[0] + R[5] * d[1] + R[8] * d[2]];
};

// the appendage each character is most often pulled by
const PULL = { fox: ['right ear', 'tail'], lion: ['tail', 'left ear'], llama: ['neck', 'left ear'] };

for (const name of ['fox', 'lion', 'llama']) {
  test(`${name}: settles without sinking, nothing through the floor`, () => {
    for (const stuffing of [0, 0.42, 1]) {
      const rig = buildRig(name);
      const b = new SoftBody(rig);
      b.params.stuffing = stuffing;
      run(b, 4);
      rig.clouds.forEach((c, k) => {
        const sank = restY(rig, k) - b.cloudC[k][1];
        assert.ok(sank < 0.2, `stuffing ${stuffing}: cloud ${k} sank ${sank.toFixed(3)}`);
      });
      for (let i = 0; i < b.n; i++) assert.ok(b.x[i * 3 + 1] >= b.r[i] - 1e-3, `particle ${i} below floor`);
      // still sitting up: the main cloud has not tipped over
      const up = b.cloudR[0][4];
      assert.ok(up > 0.9, `stuffing ${stuffing}: tipped over (up·y ${up.toFixed(3)})`);
      assert.ok(b.kinetic() < 0.05, `stuffing ${stuffing}: still moving, kinetic ${b.kinetic()}`);
      assert.ok(!b.nanResets);
    }
  });

  test(`${name}: every cloud keeps its volume within 10%`, () => {
    const b = new SoftBody(buildRig(name));
    run(b, 3);
    for (const g of b.clouds) { const v = vol(g); assert.ok(v > 0.9 && v < 1.1, `volume ratio ${v}`); }
    // and under a squish
    b.planes = [{ y: 1.2 }];
    run(b, 1);
    b.planes = [];
    run(b, 3);
    for (const g of b.clouds) { const v = vol(g); assert.ok(v > 0.9 && v < 1.1, `volume after squish ${v}`); }
  });

  for (const chainName of PULL[name]) {
    test(`${name}: pulling the ${chainName} stretches it, release rebounds and settles`, () => {
      const rig = buildRig(name);
      const b = new SoftBody(rig);
      run(b, 2);
      const ch = rig.arms.find((a) => a.name === chainName);
      const tip = ch.idx[ch.idx.length - 1];
      const home = local(b, ch, tip);
      const len0 = chainLen(b, ch.idx);
      // one hand pins the toy (Shift-release in the piece), the other drags
      // the appendage out sideways over half a second, the way a pointer does
      const c = rig.clouds[0].center;
      b.grab('pin', c, [b.x[c * 3], b.x[c * 3 + 1], b.x[c * 3 + 2]]);
      const g = b.cloudC[ch.cloud];
      const d = [b.x[tip * 3] - g[0], 0, b.x[tip * 3 + 2] - g[2]];
      const dl = Math.hypot(...d);
      const from = [b.x[tip * 3], b.x[tip * 3 + 1], b.x[tip * 3 + 2]];
      const to = [from[0] + d[0] / dl * 0.8, from[1], from[2] + d[2] / dl * 0.8];
      b.grab('h', tip, from);
      for (let t = 0; t < 0.5; t += 1 / 60) {
        const u = Math.min(1, (t + 1 / 60) / 0.5);
        b.moveGrab('h', from.map((v, k) => v + (to[k] - v) * u));
        b.step(1 / 60);
      }
      run(b, 0.8);
      const len1 = chainLen(b, ch.idx);
      assert.ok(len1 > len0 * 1.04, `${chainName} did not stretch: ${len0.toFixed(3)} → ${len1.toFixed(3)}`);
      // tethers: stretched, never torn off
      assert.ok(len1 < len0 * 1.6, `${chainName} overstretched: ${len0.toFixed(3)} → ${len1.toFixed(3)}`);
      b.release('h');
      b.release('pin');
      let peak = 0;
      for (let t = 0; t < 5; t += 1 / 60) { b.step(1 / 60); peak = Math.max(peak, b.kinetic()); }
      assert.ok(peak > 0.02, 'no rebound motion');
      assert.ok(b.kinetic() < 0.05, `still moving: ${b.kinetic()}`);
      assert.ok(b.cloudR[0][4] > 0.9, 'knocked over');
      const now = local(b, ch, tip);
      const off = Math.hypot(now[0] - home[0], now[1] - home[1], now[2] - home[2]);
      assert.ok(off < 0.25, `${chainName} did not spring back to pose: ${off.toFixed(3)} away`);
      const len2 = chainLen(b, ch.idx);
      assert.ok(Math.abs(len2 - len0) < len0 * 0.03, `${chainName} length did not recover: ${len0.toFixed(3)} → ${len2.toFixed(3)}`);
    });
  }

  test(`${name}: a grab target that jumps 5 units drags, never explodes`, () => {
    const rig = buildRig(name);
    for (const pick of ['chain', 'cloud']) {
      const b = new SoftBody(rig);
      run(b, 1);
      const ch = rig.arms.find((a) => a.name === PULL[name][0]);
      const i = pick === 'chain' ? ch.idx[ch.idx.length - 2] : rig.clouds[rig.clouds.length - 1].ix[3];
      b.grab('j', i, [b.x[i * 3] + 5, b.x[i * 3 + 1] + 4, b.x[i * 3 + 2] - 3]);
      run(b, 2);
      assert.ok(b.x.every(Number.isFinite), `${pick}: NaN`);
      assert.ok(!b.nanResets, `${pick}: needed a NaN reset`);
      // let go: it drops from up there, tumbles and comes to rest
      b.release('j');
      run(b, 6);
      assert.ok(b.x.every(Number.isFinite), `${pick}: NaN after release`);
      assert.ok(b.kinetic() < 1, `${pick}: still thrashing after release, kinetic ${b.kinetic()}`);
      const c0 = [...b.cloudC[0]];
      run(b, 3);
      const slid = Math.hypot(b.cloudC[0][0] - c0[0], b.cloudC[0][2] - c0[2]);
      assert.ok(slid < 0.1, `${pick}: creeps where it landed (${slid.toFixed(3)} in 3 s)`);
    }
  });

  test(`${name}: idle fidgets gently and goes nowhere`, () => {
    const b = new SoftBody(buildRig(name));
    const idle = new Idle(b);
    idle.amount = 0.5;   // the default; same bar as the octopus
    run(b, 2);
    const c0 = [...b.cloudC[0]];
    let peak = 0;
    for (let t = 0; t < 12; t += 1 / 60) { b.step(1 / 60); peak = Math.max(peak, b.kinetic()); }
    assert.ok(b.x.every(Number.isFinite));
    assert.ok(peak < 8, `too energetic: ${peak}`);
    const walked = Math.hypot(b.cloudC[0][0] - c0[0], b.cloudC[0][2] - c0[2]);
    assert.ok(walked < 0.2, `walked ${walked.toFixed(3)} across the floor`);
  });

  test(`${name}: fast frame`, () => {
    const b = new SoftBody(buildRig(name));
    const t = performance.now();
    run(b, 2);
    const ms = (performance.now() - t) / 120;
    console.log(`  ${name}: ${b.n} points, ${b._pairs.a.length} collision pairs, ${ms.toFixed(3)} ms/frame`);
    assert.ok(ms < 3);
  });
}

test('every rig has the structure SoftBody and Body consume', () => {
  for (const name of ['octopus', 'fox', 'lion', 'llama']) {
    const rig = buildRig(name);
    assert.equal(rig.rest.length, rig.n * 3);
    assert.ok(rig.clouds[0].ix === rig.head || rig.clouds[0].ix.every((v, k) => v === rig.head[k]));
    for (const ch of rig.arms) {
      assert.ok(ch.idx.length >= 3, `${name} ${ch.name} too short`);
      assert.ok(ch.cloud >= 0 && ch.cloud < rig.clouds.length);
    }
    for (const r of rig.regions) assert.ok(r.x0 >= 0 && r.x1 <= 1 && r.y0 >= 0 && r.y1 <= 1 + 1e-9 && r.x1 > r.x0 && r.y1 > r.y0);
    // regions never overlap (a brush must not bleed from one part into another)
    for (let a = 0; a < rig.regions.length; a++)
      for (let c = a + 1; c < rig.regions.length; c++) {
        const A = rig.regions[a], B = rig.regions[c];
        const overlap = A.x0 < B.x1 - 1e-9 && B.x0 < A.x1 - 1e-9 && A.y0 < B.y1 - 1e-9 && B.y0 < A.y1 - 1e-9;
        assert.ok(!overlap, `${name}: regions ${a} and ${c} overlap`);
      }
    assert.equal(rig.parts.filter((p) => p.kind === 'tube').length, rig.arms.length);
  }
});
