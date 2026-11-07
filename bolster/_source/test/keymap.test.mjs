/* The keyboard legend (ui/keymap.js): every bound key in each layout is a
   key drawn on the picture, lit in its player's colour with its action;
   nothing else is lit; a rebind moves the light; off-board keys and
   unbound actions are listed instead. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SOLO, VERSUS_DEFAULT, ACTIONS, rebind, toMap, keyCap } from '../src/input/layouts.js';
import { KEYS, KEY_AT, P_COLORS, ACTION_WORD, keyboardSVG, litKeys, soloBinding, strays } from '../src/ui/keymap.js';

/* the drawn keys of an SVG string: code → { lit, p, colour, a } */
function drawn(svg) {
  const out = new Map();
  for (const m of svg.matchAll(/<g class="k( lit p(\d))?[^"]*" data-code="([^"]+)"(?: data-p="(\d)" data-a="([a-z]+)")?[^>]*>([\s\S]*?)<\/g>/g)) {
    const fill = /style="fill:(#[0-9a-f]{6})"/.exec(m[6]);
    out.set(m[3], { lit: !!m[1], cls: m[2] ? +m[2] : 0, p: m[4] === undefined ? -1 : +m[4], a: m[5], fill: fill && fill[1], body: m[6] });
  }
  return out;
}

const check = (bindings) => {
  const svg = keyboardSVG(bindings), D = drawn(svg);
  assert.equal(D.size, KEYS.length, 'every key of the board is drawn once');
  const want = new Map();
  bindings.forEach((b, p) => { for (const a of ACTIONS) for (const c of b[a.id]) want.set(c, { p, a: a.id }); });
  for (const [code, { p, a }] of want) {
    assert.ok(KEY_AT[code], `${code} is on the board`);
    const k = D.get(code);
    assert.ok(k && k.lit, `${code} is lit`);
    assert.equal(k.p, p, `${code} belongs to player ${p + 1}`);
    assert.equal(k.cls, p + 1, `${code} has player ${p + 1}'s class`);
    assert.equal(k.fill, P_COLORS[p], `${code} is in player ${p + 1}'s colour`);
    assert.ok(k.body.includes(`>${ACTION_WORD[a]}<`) || k.body.includes(` ${ACTION_WORD[a]}<`), `${code} says ${ACTION_WORD[a]}`);
  }
  for (const [code, k] of D) if (!want.has(code)) assert.ok(!k.lit, `${code} isn't bound, so it's dim`);
};

test('the colours are the players\' (P1 hot pink, P2 mint)', () => {
  assert.deepEqual(P_COLORS, ['#ff3b6b', '#3ff0c8']);
});

test('the board is a full-size keyboard: main block, arrows, numpad, no key twice', () => {
  const codes = KEYS.map((k) => k.code);
  assert.equal(new Set(codes).size, codes.length);
  for (const c of ['KeyQ', 'KeyZ', 'Digit0', 'Space', 'ShiftLeft', 'Enter', 'ArrowUp', 'ArrowLeft', 'Home', 'NumLock', 'Numpad0', 'Numpad9', 'NumpadEnter', 'NumpadAdd', 'NumpadDecimal']) assert.ok(KEY_AT[c], c);
  // no two keys overlap
  for (let i = 0; i < KEYS.length; i++) for (let j = i + 1; j < KEYS.length; j++) {
    const a = KEYS[i], b = KEYS[j];
    const apart = a.x + a.w <= b.x + 1e-9 || b.x + b.w <= a.x + 1e-9 || a.y + a.h <= b.y + 1e-9 || b.y + b.h <= a.y + 1e-9;
    assert.ok(apart, `${a.code} overlaps ${b.code}`);
  }
});

test('versus: every bound key of both default layouts is drawn, lit in its player\'s colour', () => {
  check(VERSUS_DEFAULT);
  assert.equal(litKeys(VERSUS_DEFAULT).size, Object.keys(toMap(VERSUS_DEFAULT[0])).length + Object.keys(toMap(VERSUS_DEFAULT[1])).length);
});

test('one player: the solo layout (W A S D, O P E Space and the arrows), all pink', () => {
  const b = soloBinding();
  assert.deepEqual(Object.keys(toMap(b)).sort(), Object.keys(SOLO).sort());
  for (const [c, bit] of Object.entries(SOLO)) assert.equal(toMap(b)[c], bit, c);
  check([b]);
  for (const [, v] of litKeys([b])) assert.equal(v.p, 0);
});

test('a rebind moves the light: P1 light G → V, P2 block Num 6 → K, P2 takes P1\'s E', () => {
  let b = rebind(VERSUS_DEFAULT, 0, 'light', 'KeyV');
  b = rebind(b, 1, 'block', 'KeyK');
  check(b);
  const D = drawn(keyboardSVG(b));
  assert.ok(!D.get('KeyG').lit && D.get('KeyV').lit && D.get('KeyV').p === 0);
  assert.ok(!D.get('Numpad6').lit && D.get('KeyK').p === 1 && D.get('KeyK').fill === P_COLORS[1]);
  // P2 takes E: E goes mint, P1's block is left unbound and listed
  const c = rebind(VERSUS_DEFAULT, 1, 'special', 'KeyE');
  const E = drawn(keyboardSVG(c)).get('KeyE');
  assert.equal(E.p, 1); assert.equal(E.fill, P_COLORS[1]);
  assert.deepEqual(strays(c, keyCap).map((s) => `${s.p}:${s.a}`), ['0:block']);
});

test('a key off the board (F5) is listed under it, and the wait state marks the key being rebound', () => {
  const b = rebind(VERSUS_DEFAULT, 0, 'special', 'F5');
  assert.deepEqual(strays(b, keyCap).map((s) => s.text), ['Special: F5']);
  assert.ok(!drawn(keyboardSVG(b)).get('Space').lit);
  assert.match(keyboardSVG(VERSUS_DEFAULT, { wait: { p: 1, a: 'light' } }), /class="k lit p2 wait" data-code="Numpad4"/);
});

test('names and labels are escaped', () => {
  assert.doesNotMatch(keyboardSVG(VERSUS_DEFAULT, { title: '<b>"x"</b>' }), /<b>/);
});
