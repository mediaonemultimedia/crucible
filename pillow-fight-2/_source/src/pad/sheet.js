/* The phone's cheat sheet: a move list taped to the cabinet (kraft card,
   marker hand, arrow glyphs, tape corners, a coffee ring — the CSS is in
   pad.js, from the reference template). It reads Run A's move-list data
   (fighters/movelist.js) and the fighter's names (fighters/index.js), so
   it can never disagree with the game.                                  */

import { SPECIALS, MOVE_LIST } from '../fighters/movelist.js';
import { FIGHTERS } from '../fighters/index.js';
import { TWIN_TITLE } from '../ui/variant.js';

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CHIP = { BOP: '', WALLOP: ' w', GRAB: ' g', SUPER: ' s' };
const chip = (b) => `<span class="chip${CHIP[b] ?? ''}">${b}</span>`;
const arrows = (a) => `<span class="ar">${a.map(esc).join(' ')}</span>`;

const SMALL = { projectile: 'a shot · one on screen', stretch: 'the neck can be hit', rush: 'charges across the ring' };

/* the rows: [name, small print, the input as HTML] */
export function sheetRows(id, alt = false) {
  const F = FIGHTERS[id], S = SPECIALS[id];
  const list = MOVE_LIST[id];
  const sig = list.find((m) => m.key === 'signature');
  const rows = [];
  // the motion special: its arrows; BOP / WALLOP versions
  const motion = S.charge ? `${arrows([`[${S.motion[0]}]`])} hold, ${arrows(S.motion.slice(1))}` : arrows(S.motion);
  const goon = alt && id === 'kevalanche';
  const word = (t) => (goon ? t.replace('snowball', 'glove') : t);
  const vers = S.buttons.map((b) => `${chip(b)} ${esc(word(b === 'BOP' ? S.bop : S.wallop))}`).join(' / ');
  rows.push([S.name, SMALL[S.kind] || 'special move', `${motion} + ${vers}`]);
  rows.push([F.throwName, 'throws toward the open side', `${chip('GRAB')} near them`]);
  rows.push([F.throwBackName, 'when there’s room behind', `${chip('GRAB')} (auto)`]);
  rows.push([sig.name, sig.travel === 'tracking' ? 'tracks a sidestep' : 'signature move', `${arrows(['↓'])} + ${chip('WALLOP')}`]);
  rows.push(['Sidestep', 'dodges linear moves; hold to circle', `${arrows(['↑'])} or ${arrows(['↓', '↓'])}`]);
  rows.push([F.specialName, 'super · needs a full meter', chip('SUPER')]);
  return rows;
}

export function sheetHTML(id, alt = false) {
  const F = FIGHTERS[id] || FIGHTERS.kevalanche;
  const title = alt ? TWIN_TITLE[F.id] || `Evil ${F.name}` : F.name;
  const rows = sheetRows(F.id, alt).map(([n, s, i]) => `<div class="row"><div class="mv">${esc(n)}<small>${esc(s)}</small></div><div class="in">${i}</div></div>`).join('');
  return `<div class="tape l"></div><div class="tape r"></div><div class="x">✕</div><h2>${esc(title)} moves</h2>${rows}`;
}
