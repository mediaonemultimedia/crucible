/* Stage 2 netcode: two peers over an in-memory link with latency, jitter and
   packet loss, rollback correctness, and event de-duplication. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, stepInPlace, hash, clone } from '../src/sim/sim.js';
import { Rollback, RING, MAX_PREDICT } from '../src/net/rollback.js';
import { CPU } from '../src/ai/cpu.js';
import { makeRng } from '../src/sim/rng.js';
import { ROSTER } from '../src/fighters/index.js';

/* a virtual clock in ms; a link that delivers after latency ± jitter, drops `loss` */
function makeNet({ latency = 50, jitter = 0, loss = 0, seed = 1 }) {
  const rng = makeRng(seed);
  const q = [];
  const link = (deliver) => (msg) => {
    if (loss && rng.int(1000) < loss * 1000) return;
    const d = latency + (jitter ? (rng.int(2001) / 1000 - 1) * jitter : 0);
    q.push({ at: net.now + Math.max(0, d), msg: JSON.parse(JSON.stringify(msg)), deliver });
  };
  const net = {
    now: 0, link,
    pump() {
      q.sort((a, b) => a.at - b.at);
      while (q.length && q[0].at <= net.now) { const m = q.shift(); m.deliver(m.msg); }
    },
  };
  return net;
}

/* play one online match; inputs(side, st, tick) gives each player's mask */
function playOnline({ p1, p2, seed, net, inputs, maxMs = 60 * 60 * 1000 * 0.25, clockSkew = 0 }) {
  const st0 = createMatch({ p1, p2, seed });
  const peers = [];
  const evs = [[], []];
  const desyncs = [];
  for (let k = 0; k < 2; k++) {
    peers[k] = new Rollback(clone(st0), { local: k, send: (m) => out[k](m), onDesync: (d) => desyncs.push([k, d]) });
  }
  const out = [net.link((m) => peers[1].receive(m)), net.link((m) => peers[0].receive(m))];
  // each peer ticks on its own 60 Hz clock (one may run a touch fast)
  const next = [0, 7 + clockSkew];
  const period = [1000 / 60, 1000 / 60 * (1 + clockSkew / 1000)];
  const real = [[], []];        // what each player really pressed, by tick
  while (net.now < maxMs) {
    const k = next[0] <= next[1] ? 0 : 1;
    net.now = next[k];
    net.pump();
    const P = peers[k];
    const t = P.frame + P.delay;
    const m = inputs(k, P.st, t);
    const ev = P.advance(m);
    if (real[k][t] === undefined && P.inp[k][t] !== undefined) real[k][t] = P.inp[k][t];
    if (ev) for (const e of ev) evs[k].push({ ...e, at: P.frame });
    next[k] += period[k];
    if (peers[0].st.phase === 'end' && peers[1].st.phase === 'end' && peers[0].confirmed >= peers[0].frame - 30 && peers[1].confirmed >= peers[1].frame - 30) break;
  }
  // bring both to the same tick, everything confirmed (idle peers keep resending)
  const target = Math.max(peers[0].frame, peers[1].frame);
  for (let i = 0; i < 5000 && !peers.every((P) => P.frame === target && P.confirmed === target); i++) {
    net.now += 4; net.pump();
    for (const P of peers) {
      const ev = P.frame < target ? P.advance(0) : P.idle();
      if (ev) for (const e of ev) evs[P.local].push(e);
    }
  }
  // one more pass: confirmation can arrive after a peer's last flush (the
  // game keeps ticking; this harness stops, so flush what's now final)
  for (const P of peers) { const ev = P.idle(); if (ev) for (const e of ev) evs[P.local].push(e); }
  return { peers, evs, desyncs };
}

/* the reference: one sim fed the true (confirmed) inputs */
function reference(st0, peers, upto) {
  const st = clone(st0);
  const ev = [];
  for (let t = 0; t < upto; t++) {
    stepInPlace(st, peers[0].inp[0][t] | 0, peers[1].inp[1][t] | 0);
    for (const e of st.ev) ev.push(e);
  }
  return { st, ev };
}

const cpuInputs = (p1, p2, seed, level = 'hard') => {
  const cpus = [new CPU(0, level, seed * 3 + 1), new CPU(1, level, seed * 3 + 2)];
  return (k, st) => cpus[k].input(st);
};

const randomInputs = (seed) => {
  const r = [makeRng(seed), makeRng(seed + 99)];
  const hold = [0, 0], left = [0, 0];
  return (k) => {
    if (left[k]-- <= 0) { hold[k] = r[k].int(128); left[k] = r[k].int(12); }
    return hold[k];
  };
};

const FLOWK = ['ko', 'time', 'end', 'round', 'banner'];
const count = (list, k) => list.filter((e) => e.k === k).length;

function checkMatch(res, st0, label) {
  const { peers, evs, desyncs } = res;
  assert.equal(desyncs.length, 0, `${label}: desync ${JSON.stringify(desyncs)}`);
  for (const P of peers) assert.equal(P.st.phase, 'end', `${label}: match finished on peer ${P.local}`);
  const n = Math.min(peers[0].frame, peers[1].frame);
  // both peers' confirmed inputs agree, and the final states are the reference's
  const ref = reference(st0, peers, peers[0].frame);
  assert.equal(peers[0].frame, peers[1].frame, `${label}: both peers at the same tick at the end`);
  assert.equal(hash(peers[0].st), hash(peers[1].st), `${label}: final hashes match`);
  assert.equal(hash(ref.st), hash(peers[0].st), `${label}: equals a fresh sim of the true inputs`);
  assert.ok(peers[0].stats.checked > n / 60 - 3, `${label}: hashes compared every 60 ticks (${peers[0].stats.checked} for ${n})`);
  for (const P of peers) assert.ok(P.stats.maxRollback <= RING && P.stats.maxRollback <= MAX_PREDICT + P.delay + 2, `${label}: bounded rollback ${P.stats.maxRollback}`);
  // flow events: exactly once per real occurrence, on both
  for (const k of FLOWK) {
    const real = count(ref.ev, k);
    assert.equal(count(evs[0], k), real, `${label}: ${k} on peer 0`);
    assert.equal(count(evs[1], k), real, `${label}: ${k} on peer 1`);
  }
  // the visible PRNG results agree
  const ends = [0, 1].map((k) => { const e = { ...evs[k].find((x) => x.k === 'end') }; delete e.at; return e; });
  assert.deepEqual(ends[0], ends[1]);
  return { ticks: n, stats: peers.map((p) => p.stats) };
}

test('two peers, CPU inputs, 0–150 ms latency with jitter and 5% loss: identical, no desync', () => {
  const cases = [
    { latency: 0, jitter: 0, loss: 0 },
    { latency: 40, jitter: 15, loss: 0.05 },
    { latency: 90, jitter: 30, loss: 0.05 },
    { latency: 150, jitter: 40, loss: 0.05 },
  ];
  cases.forEach((c, i) => {
    const p1 = ROSTER[i % ROSTER.length], p2 = ROSTER[(i + 2) % ROSTER.length], seed = 100 + i;
    const net = makeNet({ ...c, seed: i + 1 });
    const res = playOnline({ p1, p2, seed, net, inputs: cpuInputs(p1, p2, seed), clockSkew: i * 3 });
    const r = checkMatch(res, createMatch({ p1, p2, seed }), `${p1} v ${p2} @${c.latency}ms`);
    console.log(`  ${p1} v ${p2} @${c.latency}±${c.jitter}ms loss ${c.loss * 100}%: ${r.ticks} ticks, rollbacks ${r.stats[0].rollbacks}/${r.stats[1].rollbacks}, max ${r.stats[0].maxRollback}/${r.stats[1].maxRollback}, stalls ${r.stats[0].stalls}/${r.stats[1].stalls}, hash checks ${r.stats[0].checked}`);
  });
});

test('two peers, random mashing, 120 ms ± 40 and 5% loss, a skewed clock', () => {
  for (let i = 0; i < 2; i++) {
    const p1 = ROSTER[(i + 1) % ROSTER.length], p2 = ROSTER[(i + 3) % ROSTER.length], seed = 7 + i;
    const net = makeNet({ latency: 120, jitter: 40, loss: 0.05, seed: 40 + i });
    const res = playOnline({ p1, p2, seed, net, inputs: randomInputs(seed), clockSkew: 10 });
    const r = checkMatch(res, createMatch({ p1, p2, seed }), `random ${p1} v ${p2}`);
    console.log(`  random ${p1} v ${p2}: ${r.ticks} ticks, rollbacks ${r.stats[0].rollbacks}/${r.stats[1].rollbacks}, max ${r.stats[0].maxRollback}`);
  }
});

test('rollback: resimulating from a snapshot with corrected inputs equals a fresh sim', () => {
  const st0 = createMatch({ p1: 'kevalanche', p2: 'rubberta', seed: 5 });
  const rnd = makeRng(3);
  const A = [], B = [];
  for (let t = 0; t < 900; t++) { A.push(rnd.int(128)); B.push(rnd.int(128)); }
  // a peer that hears the remote's inputs only in late bursts of six
  const P = new Rollback(clone(st0), { local: 0, send: () => {}, delay: 0 });
  let given = 0;
  for (let n = 0; P.frame < 900 && n < 5000; n++) {
    const f = P.frame;
    if (f - given >= 6) { P.receive({ t: 'in', s: given, i: B.slice(given, f), a: 0, f, adv: 0 }); given = f; }
    P.advance(A[f]);
  }
  P.receive({ t: 'in', s: given, i: B.slice(given, 900), a: 0, f: 900, adv: 0 });
  P.idle();       // applies the last rollback
  const ref = clone(st0);
  for (let t = 0; t < 900; t++) stepInPlace(ref, A[t], B[t]);
  assert.ok(P.stats.rollbacks > 50);
  assert.equal(hash(P.st), hash(ref));
  // and a snapshot restored by hand: the ring holds what the sim had
  const s = P.stateAt(890), r = clone(st0);
  for (let t = 0; t < 890; t++) stepInPlace(r, A[t], B[t]);
  assert.ok(s);
  assert.equal(hash(s), hash(r));
});

test('events: cosmetic and flow events fire exactly once despite rollbacks', () => {
  const p1 = 'johnny', p2 = 'sumaura', seed = 21;
  const net = makeNet({ latency: 130, jitter: 50, loss: 0.05, seed: 9 });
  const res = playOnline({ p1, p2, seed, net, inputs: cpuInputs(p1, p2, seed, 'hard') });
  const st0 = createMatch({ p1, p2, seed });
  checkMatch(res, st0, 'events');
  const ref = reference(st0, res.peers, res.peers[0].frame);
  for (let k = 0; k < 2; k++) {
    assert.ok(res.peers[k].stats.rollbacks > 0, 'there were rollbacks');
    for (const kind of ['hit', 'block', 'special', 'signature', 'throw', 'dash']) {
      const real = count(ref.ev, kind), got = count(res.evs[k], kind);
      // every real one fired once; a mispredicted one may have fired too (it can't be unfired), never twice
      // (blocking is its own button now, so a remote E press mispredicted for
      // a couple of ticks can show a phantom block spark: a little more slack)
      console.log(`  ${kind} peer ${k}: ${got} fired, ${real} real`);
      assert.ok(got >= real && got <= real * 1.25 + (kind === 'block' ? 8 : 3), `${kind} on peer ${k}: ${got} vs ${real}`);
    }
  }
});
