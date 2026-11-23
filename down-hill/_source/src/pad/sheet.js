/* The phone's "how to race" sheet, behind the MOVES tab: PF2's kraft card
   taped to the cabinet (marker hand, tape corners, a coffee ring — the CSS
   is in pad.js), here listing the buttons, the ten items (names and icons
   from the game's own tables, so it can never disagree with the HUD), and
   the phone's own settings: STICK or TILT steering, tilt sensitivity
   (3 steps), re-centre, and auto-gas.                                   */

import { ITEM_NAMES } from '../race/sim.js';
import { ICONS } from '../ui/icons.js';

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const chip = (b, k = '') => `<span class="chip${k}">${b}</span>`;

export const ITEM_HOW = {
  slick: 'drop it behind you · whoever drives through spins out',
  missile: 'throw it ahead (hold LOOK BACK: behind, or keep it there as a shield)',
  espresso: 'a big speed boost · jittery steering',
  cuffs: 'chains the two racers just ahead together',
  case: 'over a rival’s head · wobbly steering, a fabric view',
  alarm: 'flies to whoever’s in 1st and wakes them up · BRRRING!',
  sugar: 'a giant lollipop · 6 s of candy speed, nothing can touch you, bump to spin them',
  plane: 'homes in on the racer just ahead · block it with a missile held behind',
  wash: 'hot steam · everyone else shrinks for 5 s · squash the little ones flat',
  spring: 'locks onto the racer ahead · press again: their seat springs them out',
};

export function sheetHTML(o = {}) {
  const rows = [
    ['Drive', 'hold GAS · BRAKE backs up', `${chip('GAS')} ${chip('BRAKE', ' g')}`],
    ['Drift', 'hold while turning · let go to boost', `${chip('DRIFT', ' w')} <span class="sp"><i class="t1"></i><i class="t2"></i><i class="t3"></i></span>`],
    ['Trick', 'TAUNT in the air · landing boost', chip('TAUNT', ' s')],
    ['Items', 'ITEM or the big pill', `${chip('ITEM')} ${chip('USE ITEM', ' s')}`],
  ].map(([n, s, i]) => `<div class="row"><div class="mv">${esc(n)}<small>${esc(s)}</small></div><div class="in">${i}</div></div>`).join('');
  const items = Object.keys(ITEM_HOW).map((k) => `<div class="it"><span class="ic">${ICONS[k] || ''}</span><b>${esc(ITEM_NAMES[k])}</b><small>${esc(ITEM_HOW[k])}</small></div>`).join('');
  const tilt = o.mode === 'tilt';
  const seg = (on, attr, label) => `<b class="${on ? 'on' : ''}" ${attr}>${label}</b>`;
  const set = `<div class="set">
    <div class="opt"><span>Steer</span><span class="tg">${seg(!tilt, 'data-mode="stick"', 'Stick')}${seg(tilt, 'data-mode="tilt"', 'Tilt')}</span></div>
    <div class="opt${tilt ? '' : ' off'}"><span>Tilt</span><span class="tg">${[0, 1, 2].map((s) => seg((o.sens ?? 1) === s, `data-sens="${s}"`, ['Calm', 'Normal', 'Twitchy'][s])).join('')}</span><b class="btn" data-recentre="1">Re-centre</b></div>
    <div class="opt"><span>Auto-gas</span><span class="tg">${seg(!o.auto, 'data-auto="0"', 'Off')}${seg(!!o.auto, 'data-auto="1"', 'On')}</span></div>
  </div>`;
  // a marker-drawn wobble on the icons (an SVG filter, no images)
  const hand = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="dhHand"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="2.4"/></filter></svg>';
  return `${hand}<div class="tape l"></div><div class="tape r"></div><div class="x">✕</div><h2>How to race</h2>
<div class="cols"><div class="c1">${rows}${set}</div><div class="c2"><h3>Items</h3>${items}</div></div>`;
}
