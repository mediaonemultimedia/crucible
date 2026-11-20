/* The phone pad's pure parts: the QR encoder (decoded back with jsQR), the
   wire format (packets, stale / reordered seqs, press counters that survive
   loss), the cheat sheet's data, the skins, the trash talk.               */
import test from 'node:test';
import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import { qrMatrix, rsEncode } from '../src/pad/qr.js';
import { encodeInput, decode, PadState, ping, pong, TAPS, T_PING, T_PONG, START, TAUNT, newer } from '../src/pad/wire.js';
import { LIGHT, HEAVY, LEFT, CROUCH } from '../src/sim/input.js';
import { SK, L, skinId, SKIN_IDS } from '../src/pad/skins.js';
import { TAUNT_LINES, TAUNT_LINES_ALT, KO_LINES, KO_LINES_ALT, tauntLine, koLine } from '../src/pad/lines.js';
import { ROSTER } from '../src/fighters/index.js';

function decodeQR(text) {
  const m = qrMatrix(text), n = m.length, sc = 4, q = 4, W = (n + 2 * q) * sc;
  const d = new Uint8ClampedArray(W * W * 4).fill(255);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) for (let y = 0; y < sc; y++) for (let x = 0; x < sc; x++) { const i = (((r + q) * sc + y) * W + (c + q) * sc + x) * 4; d[i] = d[i + 1] = d[i + 2] = 0; }
  return jsQR(d, W, W)?.data;
}

test('QR: the pad link and every version 1–10 decode back', () => {
  const link = 'https://mediaonemultimedia.github.io/crucible/pillow-fight-2/?pad=K7QD';
  assert.equal(decodeQR(link), link);
  for (const len of [1, 10, 20, 40, 60, 80, 100, 130, 160, 190, 210]) {
    const s = 'x'.repeat(len).replace(/x/g, (_, i) => 'ABCdef0123?=&/'[i % 14]);
    assert.equal(decodeQR(s), s, `length ${len}`);
  }
  assert.throws(() => qrMatrix('y'.repeat(300)));
});

test('QR: Reed–Solomon matches the standard’s worked example', () => {
  // ISO 18004 annex: "01234567" 1-M data codewords → EC codewords
  const data = [0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11];
  assert.deepEqual(rsEncode(data, 10), [0xa5, 0x24, 0xd4, 0xc1, 0xed, 0x36, 0xc7, 0x87, 0x2c, 0x55]);
});

test('wire: an input packet is 9 bytes and round-trips', () => {
  const counts = TAPS.map((_, i) => (i * 3) & 15);
  const b = encodeInput(200, LIGHT | LEFT | START | TAUNT, counts);
  assert.equal(b.length, 9);
  const p = decode(b.buffer);
  assert.equal(p.seq, 200);
  assert.equal(p.mask, LIGHT | LEFT | START | TAUNT);
  assert.deepEqual(p.counts, counts);
  assert.deepEqual(decode(ping(7, 84)), { t: T_PING, id: 7, rtt: 84 });
  assert.deepEqual(decode(pong(7)), { t: T_PONG, id: 7 });
  assert.equal(decode(new Uint8Array(0)), null);
});

test('wire: stale and duplicate packets are dropped; seq wraps', () => {
  assert.ok(newer(1, 0)); assert.ok(newer(0, 255)); assert.ok(!newer(5, 5)); assert.ok(!newer(3, 9));
  const P = new PadState(), c0 = TAPS.map(() => 0);
  P.take(decode(encodeInput(10, LEFT, c0)), 0);
  assert.equal(P.take(decode(encodeInput(9, 0, c0)), 1), 0);         // older: ignored
  assert.equal(P.held, LEFT);
  assert.equal(P.take(decode(encodeInput(10, 0, c0)), 1), 0);        // duplicate: ignored
  assert.equal(P.held, LEFT);
});

test('wire: a tap whose packets were all lost still lands (press counters)', () => {
  const P = new PadState(), c = TAPS.map(() => 0);
  P.take(decode(encodeInput(1, 0, c)), 0);
  P.sample();
  // the phone pressed and released LIGHT between two packets that arrived
  c[TAPS.indexOf(LIGHT)] = 1;
  const pressed = P.take(decode(encodeInput(5, 0, c)), 50);
  assert.ok(pressed & LIGHT);
  assert.ok(P.sample() & LIGHT, 'the next tick sees the tap');
  assert.equal(P.sample() & LIGHT, 0, '…once');
});

test('wire: a phone gone quiet lets go of its held bits', () => {
  const P = new PadState(), c = TAPS.map(() => 0);
  P.take(decode(encodeInput(1, LEFT | CROUCH, c)), 1000);
  P.stale(1300); assert.equal(P.held, LEFT | CROUCH);
  P.stale(1500); assert.equal(P.held, 0);
  assert.equal(P.sample() & ~1023, 0, 'only the sim’s bits are sampled');
});

test('skins: one per fighter and ALT, every colour there, layout as the template', () => {
  assert.equal(SKIN_IDS.length, 14);
  for (const id of ROSTER) for (const alt of [false, true]) {
    const s = SK[skinId(id, alt)];
    assert.ok(s, `${id} alt=${alt}`);
    assert.equal(s.caps.length, 6);
    for (const k of ['ring', 'ball', 'sup', 'st', 'lab', 'mv', 'mt', 'led']) assert.match(s[k], /^#[0-9a-f]{3,6}$/i, `${id} ${k}`);
  }
  assert.deepEqual(L.lbl, ['BOP', 'WALLOP', 'GRAB', 'BLOCK', 'JUMP', 'TAUNT']);
  assert.deepEqual(L.stick, [604, 517, 185]);
});

test('lines: taunts and KO roasts for every fighter, OG and ALT', () => {
  for (const id of ROSTER) {
    for (const T of [TAUNT_LINES, TAUNT_LINES_ALT, KO_LINES, KO_LINES_ALT]) assert.ok(T[id]?.length >= 2, id);
    for (let n = 0; n < 8; n++) { assert.ok(tauntLine(id, n % 2 === 1, n)); assert.ok(koLine(id, n % 3 === 0, n)); }
  }
});

test('cheat sheet: reads Run A’s move list (special, throws, sidestep, super)', async () => {
  const { sheetRows, sheetHTML } = await import('../src/pad/sheet.js');
  const { SPECIALS } = await import('../src/fighters/movelist.js');
  const { FIGHTERS } = await import('../src/fighters/index.js');
  for (const id of ROSTER) {
    const rows = sheetRows(id, false);
    assert.equal(rows[0][0], SPECIALS[id].name);
    assert.ok(rows.some((r) => r[0] === FIGHTERS[id].throwName));
    assert.ok(rows.some((r) => r[0] === FIGHTERS[id].specialName && /SUPER/.test(r[2])));
    assert.ok(rows.some((r) => r[0] === 'Sidestep'));
    for (const a of SPECIALS[id].motion) assert.ok(rows[0][2].includes(a), `${id} arrows`);
  }
  assert.match(sheetHTML('kevalanche', true), /Hockey Goon moves/);
  assert.match(sheetHTML('kevalanche', true), /glove/);
  assert.ok(sheetHTML('sebas').includes('[←]'), 'charge moves show the hold');
});
