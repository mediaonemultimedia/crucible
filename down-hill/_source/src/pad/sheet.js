/* The phone's "how to race" sheet, behind the MOVES tab: PF2's kraft card
   taped to the cabinet (marker hand, tape corners, a coffee ring — the CSS
   is in pad.js), here listing the buttons, the ten items (names and icons
   from the game's own tables, so it can never disagree with the HUD), and
   the phone's own settings: drift calibration and auto-gas.                                   */

import { ITEM_NAMES } from '../race/sim.js';
import { ICONS } from '../ui/icons.js';

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const chip = (b, k = '') => `<span class="chip${k}">${b}</span>`;

export const ITEM_HOW = {
  slick: 'drop it behind you: they spin out',
  missile: 'throw it ahead at rivals',
  espresso: 'a big boost, jittery steering',
  cuffs: 'chains the two racers ahead together',
  case: 'over a rival’s head: wobbly and blind',
  alarm: 'flies to whoever’s 1st · BRRRING!',
  sugar: '6 s of candy speed, nothing touches you',
  plane: 'homes in on the racer just ahead',
  wash: 'everyone else shrinks: squash them flat',
  spring: 'lock on, press again: they fly out',
};

export function sheetHTML(o = {}) {
  const rows = [
    ['Drive', 'Steer with the stick · hold the pedals', `${chip('ACCELERATE')} ${chip('BRAKE / REVERSE', ' g')}`],
    ['Drift', 'Tilt your phone’s top edge toward you while turning. Return to centre to boost.', chip('TILT', ' w')],
    ['Items', 'Press SUPER to use your item', chip('SUPER', ' s')],
  ].map(([n, s, i]) => `<div class="row"><div class="mv">${esc(n)}<small>${esc(s)}</small></div><div class="in">${i}</div></div>`).join('');
  const items = Object.keys(ITEM_HOW).map((k) => `<div class="it"><span class="ic">${ICONS[k] || ''}</span><b>${esc(ITEM_NAMES[k])}</b><small>${esc(ITEM_HOW[k])}</small></div>`).join('');
  const seg = (on, attr, label) => `<b class="${on ? 'on' : ''}" ${attr}>${label}</b>`;
  const set = `<div class="set">
    <div class="opt"><span>Drift</span><b class="btn" data-recentre="1">Re-centre</b></div>
    <div class="opt"><span>Auto-gas</span><span class="tg">${seg(!o.auto, 'data-auto="0"', 'Off')}${seg(!!o.auto, 'data-auto="1"', 'On')}</span></div>
  </div>`;
  // a marker-drawn wobble on the icons (an SVG filter, no images)
  const hand = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="dhHand"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="2.4"/></filter></svg>';
  return `${hand}<div class="tape l"></div><div class="tape r"></div><div class="x">✕</div><h2>How to race</h2>
<div class="cols"><div class="c1">${rows}${set}</div><div class="c2"><h3>Items</h3>${items}</div></div>`;
}
