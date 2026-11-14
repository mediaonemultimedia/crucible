/* Player names and the leaderboard, kept on this device (localStorage —
   no server). Pure apart from the storage object handed in, so the tests
   run it on a Map.

   Names: a most-recently-used list (16 at most) and the last name each
   seat used (player 1, player 2), so the name screen pre-selects it.
   Names are trimmed, single-spaced, 1–16 characters; two names that only
   differ in case are the same player.

   The board, per player: wins, losses, draws; wins and losses against
   another person (versus or online) as well; the current and best win
   streak; Fluffless rounds (a round won without losing any stuffing);
   matches per fighter (the favourite is the most played). A match against
   the computer counts for the person only.                             */

export const NAMES_KEY = 'pillowfight.names.v1';
export const BOARD_KEY = 'pillowfight.board.v1';
export const MAX_NAME = 16;

export function cleanName(s) {
  return String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME).trim();
}
export const nameKey = (s) => cleanName(s).toLowerCase();

const read = (storage, key, fallback) => {
  try { const v = JSON.parse(storage?.getItem(key) || 'null'); return v && typeof v === 'object' ? v : fallback; } catch { return fallback; }
};
const write = (storage, key, v) => { try { storage?.setItem(key, JSON.stringify(v)); } catch { /* full or private: this session only */ } };

/* ── names ─────────────────────────────────────────────────────────────── */
export function loadNames(storage) {
  const v = read(storage, NAMES_KEY, {});
  const list = Array.isArray(v.list) ? v.list.map(cleanName).filter(Boolean) : [];
  const last = Array.isArray(v.last) ? [v.last[0] || '', v.last[1] || ''].map(cleanName) : ['', ''];
  return { list, last };
}

/* seat k used `name`: to the front of the list, remembered for that seat */
export function useName(storage, k, name) {
  const n = cleanName(name);
  const v = loadNames(storage);
  if (!n) { v.last[k] = ''; write(storage, NAMES_KEY, v); return v; }
  v.list = [n, ...v.list.filter((x) => nameKey(x) !== nameKey(n))].slice(0, 16);
  v.last[k] = n;
  write(storage, NAMES_KEY, v);
  return v;
}

/* ── the board ────────────────────────────────────────────────────────── */
export function loadBoard(storage) {
  const b = read(storage, BOARD_KEY, null);
  return b && b.players && typeof b.players === 'object' ? b : { v: 1, players: {} };
}

const blank = (name) => ({ name, w: 0, l: 0, d: 0, pw: 0, pl: 0, streak: 0, best: 0, fluffless: 0, fighters: {}, last: 0 });

/* one match: players [{ name, fighter }, { name, fighter }] ('' for the
   computer or an unnamed player), winner 0 / 1 / 2 (a draw), fluffless:
   rounds won Fluffless by each, at: a timestamp. Returns the new board. */
export function recordMatch(board, { players, winner, fluffless = [0, 0], at = 0 }) {
  const out = { v: 1, players: { ...board.players } };
  const named = players.map((p) => cleanName(p.name));
  const pvp = !!(named[0] && named[1]);
  if (pvp && nameKey(named[0]) === nameKey(named[1])) return out;     // one person can't beat themselves
  players.forEach((p, k) => {
    const n = named[k];
    if (!n) return;
    const key = nameKey(n);
    const r = { ...(out.players[key] || blank(n)) };
    r.name = n;
    r.fighters = { ...r.fighters, [p.fighter]: (r.fighters[p.fighter] || 0) + 1 };
    if (winner === 2) { r.d++; r.streak = 0; }
    else if (winner === k) { r.w++; if (pvp) r.pw++; r.streak++; r.best = Math.max(r.best, r.streak); }
    else { r.l++; if (pvp) r.pl++; r.streak = 0; }
    r.fluffless += fluffless[k] || 0;
    r.last = at;
    out.players[key] = r;
  });
  return out;
}

export function saveBoard(storage, board) { write(storage, BOARD_KEY, board); }
export function resetBoard(storage) { try { storage?.removeItem(BOARD_KEY); } catch { /* */ } return { v: 1, players: {} }; }

export function favourite(r) {
  let best = '', n = 0;
  for (const [id, c] of Object.entries(r.fighters || {})) if (c > n) { best = id; n = c; }
  return best;
}

/* the table: most wins first, then the better record, then the fewest
   matches; each row with a title for the top and the bottom of it */
export function standings(board) {
  const rows = Object.values(board.players).map((r) => {
    const m = r.w + r.l + r.d;
    return { ...r, matches: m, pct: m ? r.w / m : 0, fav: favourite(r) };
  });
  rows.sort((a, b) => b.w - a.w || b.pct - a.pct || a.matches - b.matches || a.name.localeCompare(b.name));
  rows.forEach((r, i) => {
    r.rank = i + 1;
    r.title = '';
    if (i === 0 && r.w > 0) r.title = 'Big Pillow';
  });
  // the roasts: most losses, and a long streak
  const most = rows.filter((r) => r.l > 0).sort((a, b) => b.l - a.l || a.w - b.w)[0];
  if (most && rows.length > 1 && !most.title) most.title = 'Professional Cushion';
  for (const r of rows) if (!r.title && r.streak >= 3) r.title = 'On a Tear';
  for (const r of rows) if (!r.title && r.fluffless >= 3) r.title = 'Untouched Upholstery';
  return rows;
}
