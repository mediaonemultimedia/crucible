/* Names and the leaderboard (on this device): names remembered most
   recent first with each seat's last one; results recorded per name. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanName, loadNames, useName, loadBoard, recordMatch, saveBoard, resetBoard, standings, favourite, NAMES_KEY } from '../src/ui/players.js';

const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };

test('names are cleaned', () => {
  assert.equal(cleanName('  Kevin   the  Great '), 'Kevin the Great');
  assert.equal(cleanName('<b>John</b>'), 'bJohn/b');
  assert.equal(cleanName('x'.repeat(40)).length, 16);
  assert.equal(cleanName(null), '');
});

test('names persist: most recent first, no duplicates by case, each seat its last', () => {
  const s = store();
  assert.deepEqual(loadNames(s), { list: [], last: ['', ''] });
  useName(s, 0, 'Kevin');
  useName(s, 1, 'John');
  useName(s, 0, 'sebas');
  useName(s, 0, 'KEVIN');
  const v = loadNames(s);
  assert.deepEqual(v.list, ['KEVIN', 'sebas', 'John']);
  assert.deepEqual(v.last, ['KEVIN', 'John']);
  // a second page load reads the same
  assert.deepEqual(loadNames(s), v);
  // playing without a name forgets the seat's last, keeps the list
  useName(s, 1, '');
  assert.deepEqual(loadNames(s).last, ['KEVIN', '']);
  assert.equal(loadNames(s).list.length, 3);
  // broken storage: empty, no throw
  s.setItem(NAMES_KEY, 'garbage{');
  assert.deepEqual(loadNames(s), { list: [], last: ['', ''] });
  const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.deepEqual(loadNames(bad), { list: [], last: ['', ''] });
  assert.doesNotThrow(() => useName(bad, 0, 'x'));
});

test('a versus match is recorded for both names', () => {
  const s = store();
  let b = loadBoard(s);
  b = recordMatch(b, { players: [{ name: 'Kevin', fighter: 'kevalanche' }, { name: 'John', fighter: 'johnny' }], winner: 0, fluffless: [1, 0], at: 1 });
  b = recordMatch(b, { players: [{ name: 'Kevin', fighter: 'kevalanche' }, { name: 'John', fighter: 'johnny' }], winner: 0, at: 2 });
  b = recordMatch(b, { players: [{ name: 'john', fighter: 'johnny' }, { name: 'kevin', fighter: 'sebas' }], winner: 0, at: 3 });
  saveBoard(s, b);
  const k = loadBoard(s).players.kevin, j = loadBoard(s).players.john;
  assert.deepEqual([k.w, k.l, k.d, k.pw, k.pl, k.streak, k.best, k.fluffless], [2, 1, 0, 2, 1, 0, 2, 1]);
  assert.deepEqual([j.w, j.l, j.pw, j.pl, j.streak, j.best], [1, 2, 1, 2, 1, 1]);
  assert.equal(favourite(k), 'kevalanche');
  assert.equal(k.name, 'kevin');       // shown as last typed
});

test('vs the computer counts for the person only; draws; one name on both sides is not a match', () => {
  let b = { v: 1, players: {} };
  b = recordMatch(b, { players: [{ name: 'Kevin', fighter: 'k8e' }, { name: '', fighter: 'zach' }], winner: 1 });
  assert.deepEqual(Object.keys(b.players), ['kevin']);
  assert.deepEqual([b.players.kevin.l, b.players.kevin.pl], [1, 0]);
  b = recordMatch(b, { players: [{ name: 'Kevin', fighter: 'k8e' }, { name: 'Sebas', fighter: 'zach' }], winner: 2 });
  assert.equal(b.players.kevin.d, 1); assert.equal(b.players.sebas.d, 1);
  const before = JSON.stringify(b);
  b = recordMatch(b, { players: [{ name: 'Kevin', fighter: 'k8e' }, { name: 'kevin ', fighter: 'zach' }], winner: 0 });
  assert.equal(JSON.stringify(b), before);
  // unnamed on both sides: nothing
  assert.equal(JSON.stringify(recordMatch(b, { players: [{ name: '' }, { name: '' }], winner: 0 })), before);
});

test('standings: most wins first, the titles, and reset', () => {
  const s = store();
  let b = loadBoard(s);
  const P = (a, c) => [{ name: a, fighter: 'johnny' }, { name: c, fighter: 'sebas' }];
  for (let i = 0; i < 4; i++) b = recordMatch(b, { players: P('John', 'Sebas'), winner: 0, fluffless: [1, 0] });
  b = recordMatch(b, { players: P('Kevin', 'Sebas'), winner: 0 });
  saveBoard(s, b);
  const rows = standings(loadBoard(s));
  assert.deepEqual(rows.map((r) => r.name), ['John', 'Kevin', 'Sebas']);
  assert.equal(rows[0].title, 'Big Pillow');
  assert.equal(rows[2].title, 'Professional Cushion');
  assert.equal(rows[0].fav, 'johnny');
  assert.deepEqual(resetBoard(s), { v: 1, players: {} });
  assert.deepEqual(standings(loadBoard(s)), []);
});
