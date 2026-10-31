/* Versus on one keyboard: the two layouts never share a key, every action
   is bound for both, rebinding keeps them apart, and two Keyboards on the
   same page each hear only their own player's keys. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SOLO, VERSUS_DEFAULT, ACTIONS, RESERVED, toMap, overlaps, rebind, loadBindings, saveBindings, resetBindings, keyCap } from '../src/input/layouts.js';
import { LEFT, RIGHT, UP, DOWN, LIGHT, HEAVY, SPECIAL, BLOCK } from '../src/sim/input.js';

const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };

test('the default versus layouts share no key', () => {
  assert.deepEqual(overlaps(VERSUS_DEFAULT[0], VERSUS_DEFAULT[1]), []);
  const k1 = Object.keys(toMap(VERSUS_DEFAULT[0])), k2 = Object.keys(toMap(VERSUS_DEFAULT[1]));
  for (const c of k1) assert.ok(!k2.includes(c), `${c} is on both sides`);
});

test('every action is bound for both players, each to its own bit', () => {
  const all = LEFT | RIGHT | UP | DOWN | LIGHT | HEAVY | SPECIAL | BLOCK;
  for (const b of VERSUS_DEFAULT) {
    const m = toMap(b);
    let seen = 0;
    for (const v of Object.values(m)) { assert.equal(v & (v - 1), 0, 'one bit per key'); seen |= v; }
    assert.equal(seen, all);
    for (const a of ACTIONS) assert.ok(b[a.id].length, a.id);
  }
});

test('player 1 keeps the left half, player 2 the arrows and the numpad; no reserved keys', () => {
  const m1 = toMap(VERSUS_DEFAULT[0]), m2 = toMap(VERSUS_DEFAULT[1]);
  assert.equal(m1.KeyG, LIGHT); assert.equal(m1.KeyH, HEAVY); assert.equal(m1.KeyE, BLOCK); assert.equal(m1.Space, SPECIAL);
  assert.equal(m1.KeyA, LEFT); assert.equal(m1.KeyW, UP);
  assert.equal(m2.ArrowLeft, LEFT); assert.equal(m2.Numpad4, LIGHT); assert.equal(m2.Numpad5, HEAVY); assert.equal(m2.Numpad6, BLOCK);
  assert.equal(m2.Numpad0, SPECIAL); assert.equal(m2.NumpadEnter, SPECIAL);
  for (const c of [...Object.keys(m1), ...Object.keys(m2)]) assert.ok(!RESERVED.includes(c), c);
  // and the one-player layout is unchanged
  assert.equal(SOLO.KeyO, LIGHT); assert.equal(SOLO.KeyP, HEAVY); assert.equal(SOLO.KeyE, BLOCK); assert.equal(SOLO.Space, SPECIAL);
});

test('rebinding moves a key off the other player and refuses reserved keys', () => {
  let b = rebind(VERSUS_DEFAULT, 0, 'light', 'KeyV');
  assert.deepEqual(b[0].light, ['KeyV']);
  assert.deepEqual(overlaps(b[0], b[1]), []);
  // take player 2's Num 4 for player 1: player 2 loses it (and is left unbound for light)
  b = rebind(b, 0, 'heavy', 'Numpad4');
  assert.deepEqual(b[0].heavy, ['Numpad4']);
  assert.deepEqual(b[1].light, []);
  assert.deepEqual(overlaps(b[0], b[1]), []);
  assert.equal(rebind(b, 1, 'light', 'Escape'), null);
  assert.equal(rebind(b, 1, 'light', 'Enter'), null);
  // the defaults themselves are never changed
  assert.deepEqual(VERSUS_DEFAULT[0].light, ['KeyG']);
});

test('bindings persist; anything broken or overlapping falls back to the defaults', () => {
  const s = store();
  assert.deepEqual(loadBindings(s), VERSUS_DEFAULT);
  const b = rebind(VERSUS_DEFAULT, 0, 'light', 'KeyV');
  saveBindings(s, b);
  assert.deepEqual(loadBindings(s)[0].light, ['KeyV']);
  s.setItem('pillowfight.versusKeys.v1', JSON.stringify([VERSUS_DEFAULT[0], VERSUS_DEFAULT[0]]));
  assert.deepEqual(loadBindings(s), VERSUS_DEFAULT);
  s.setItem('pillowfight.versusKeys.v1', '{nope');
  assert.deepEqual(loadBindings(s), VERSUS_DEFAULT);
  // an action left unbound (after a steal) isn't saved as a working layout
  saveBindings(s, rebind(VERSUS_DEFAULT, 0, 'heavy', 'Numpad4'));
  assert.deepEqual(loadBindings(s), VERSUS_DEFAULT);
  assert.deepEqual(resetBindings(s), VERSUS_DEFAULT);
  assert.equal(loadBindings(null)[0].light[0], 'KeyG');
});

test('two keyboards on one page: each hears only its own keys', async () => {
  globalThis.window = new EventTarget();
  const { Keyboard } = await import('../src/input/keyboard.js');
  const t = new EventTarget();
  const k1 = new Keyboard(t, toMap(VERSUS_DEFAULT[0])), k2 = new Keyboard(t, toMap(VERSUS_DEFAULT[1]));
  const key = (type, code) => { const e = new Event(type, { cancelable: true }); e.code = code; t.dispatchEvent(e); return e; };
  key('keydown', 'KeyG'); key('keydown', 'KeyD'); key('keydown', 'Numpad5'); key('keydown', 'ArrowLeft');
  assert.equal(k1.sample(), LIGHT | RIGHT);
  assert.equal(k2.sample(), HEAVY | LEFT);
  key('keyup', 'KeyG'); key('keyup', 'Numpad5');
  assert.equal(k1.sample(), RIGHT);
  assert.equal(k2.sample(), LEFT);
  // a tap between samples still counts, once
  key('keydown', 'Numpad4'); key('keyup', 'Numpad4');
  assert.equal(k2.sample(), LEFT | LIGHT);
  assert.equal(k2.sample(), LEFT);
  // two keys on one bit: letting go of one keeps the other's hold
  key('keydown', 'Numpad0'); key('keydown', 'NumpadEnter'); key('keyup', 'Numpad0');
  assert.equal(k2.sample() & SPECIAL, SPECIAL);
  key('keyup', 'NumpadEnter');
  assert.equal(k2.sample() & SPECIAL, 0);
  // typing in a text field is nobody's input
  const input = new EventTarget(); input.tagName = 'INPUT';
  const e = new Event('keydown', { cancelable: true }); e.code = 'KeyG';
  Object.defineProperty(e, 'target', { value: input });
  k1._down(e);
  assert.equal(k1.sample() & LIGHT, 0);
  k1.dispose(); k2.dispose();
});

test('key caps', () => {
  assert.equal(keyCap('KeyG'), 'G'); assert.equal(keyCap('Numpad4'), 'Num 4'); assert.equal(keyCap('ArrowLeft'), '←'); assert.equal(keyCap('Space'), 'Space'); assert.equal(keyCap('Digit7'), '7');
});
