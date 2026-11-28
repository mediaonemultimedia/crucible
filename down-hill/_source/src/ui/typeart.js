/* The overhaul's display type in the DOM: the pre-rendered images from
   src/assets/type (tools/render-type.mjs) in place of live lettering, the
   title's wordmark lockup, the compact controls strip and the How to play
   card (H). See docs/ui-kit.md. */
import { TYPE } from '../assets/type/index.js';

// (built through the DOM: the build's no-network check reads src="${…}" templates as fetches)
const img = (url, cls, alt) => { const i = new Image(); i.src = url; i.className = cls; i.alt = alt; i.draggable = false; return i.outerHTML; };
export const typeImg = (id, alt = '') => TYPE[id] ? img(TYPE[id], 'k-type', alt) : alt;
export const placeImg = (n) => typeImg(`place-${n}`, String(n));
export const countImg = (n) => typeImg(n === 'GO!' ? 'count-go' : `count-${n}`, String(n));

export function installTypeArt() {
  const root = document.documentElement.style;
  for (const [k, id] of [['--t-howto', 'h-howto'], ['--t-pick', 'h-pick'], ['--t-results', 'h-results'], ['--t-setup', 'h-setup']]) root.setProperty(k, `url(${TYPE[id]})`);
  // the title lockup: FLUFFED & / FURIOUS, dropping in word by word, then breathing
  const l1 = document.querySelector('#title .logo .l1');
  if (l1) l1.innerHTML = `<span class="wm">${img(TYPE['wordmark-1'], 'w1', 'Fluffed')}${img(TYPE['wordmark-amp'], 'wa', '&')}</span><span class="wm">${img(TYPE['wordmark-2'], 'w2', 'Furious')}</span>`;
  const press = document.querySelector('#title .press');
  if (press) press.innerHTML = typeImg('press-start', 'Press start');
  const title = document.getElementById('title');
  if (title && !title.querySelector('.kstrip')) {
    const s = document.createElement('div');
    s.className = 'kstrip';
    s.innerHTML = '<span><kbd>←</kbd><kbd>→</kbd> steer</span><span><kbd>↑</kbd> gas</span><span><kbd>K</kbd> drift</span><span><kbd>J</kbd> item</span><span><kbd>X</kbd> wallop</span><span><b>H</b> how to play</span>';
    title.appendChild(s);
  }
  // race setup: music as a chunky carousel over the (hidden) select, which stays the source of truth
  const sel = document.getElementById('race-music');
  if (sel && !document.querySelector('.k-music')) {
    const m = document.createElement('div');
    m.className = 'k-music';
    m.innerHTML = '<button type="button" class="k-btn" data-d="-1" aria-label="Previous music">‹</button><div class="k-disc"><i>♪</i><span></span><small></small></div><button type="button" class="k-btn" data-d="1" aria-label="Next music">›</button>';
    sel.closest('label').after(m);
    m.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-d]'); if (!b) return;
      sel.selectedIndex = (sel.selectedIndex + Number(b.dataset.d) + sel.options.length) % sel.options.length;
      sel.dispatchEvent(new Event('change'));
    });
    sel.addEventListener('change', paintMusic);
  }
  // results: big buttons (Enter / Esc, or click)
  document.getElementById('again')?.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) dispatchEvent(new KeyboardEvent('keydown', { code: b.dataset.code, key: b.dataset.code })); });
  addEventListener('keydown', (e) => {
    const onTitle = document.body.dataset.screen === 'title';
    if (e.code === 'KeyH' && onTitle) { document.body.classList.toggle('howto'); e.stopImmediatePropagation(); }
    else if (document.body.classList.contains('howto') && (e.code === 'Escape' || e.code === 'Enter')) { document.body.classList.remove('howto'); e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);
  // gamepads/phones connected: the keyboard strip steps aside
  const pads = () => document.body.classList.toggle('pads-live', [...(navigator.getGamepads?.() || [])].some(Boolean));
  addEventListener('gamepadconnected', pads); addEventListener('gamepaddisconnected', pads);
}

/* the results screen's two big buttons: race → RETRY / NEXT (new racers);
   in a cup → NEXT race / QUIT, or the cup podium */
export function resultsButtons(el, mode) {
  const b = (cls, code, art, alt, key) => `<button type="button" class="k-btn ${cls}" data-code="${code}">${art ? typeImg(art, alt) : `<span>${alt}</span>`}<kbd>${key}</kbd></button>`;
  el.innerHTML = mode === 'race' ? b('mint', 'Enter', 'b-retry', 'Retry', 'Enter') + b('', 'Escape', 'b-next', 'Next', 'Esc')
    : mode === 'next' ? b('mint', 'Enter', 'b-next', 'Next race', 'Enter') + b('berry', 'Escape', null, 'Quit cup', 'Esc')
    : b('mint', 'Enter', 'b-next', 'Cup podium', 'Enter') + b('', 'Escape', null, 'New racers', 'Esc');
}

/* the music carousel shows the select's current choice; spins its disc on every change */
export function paintMusic() {
  const sel = document.getElementById('race-music'), m = document.querySelector('.k-music');
  if (!sel || !m) return;
  const [title, artist] = (sel.options[sel.selectedIndex]?.text || '').split(' · ');
  m.querySelector('span').textContent = title || '';
  m.querySelector('small').textContent = artist || 'Fluffed & Furious';
  m.querySelector('small').hidden = false;
  const d = m.querySelector('.k-disc'); d.classList.remove('spin'); void d.offsetWidth; d.classList.add('spin');
}
