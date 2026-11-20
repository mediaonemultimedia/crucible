/* The phone pad (index.html?pad=CODE): an arcade control panel on the
   phone. Kevin's painted background per fighter (+ ALT) with the controls
   drawn in code on top, the same for everyone — layout L, colours SK and
   the drawing (dished buttons, ring + ball stick, flat SUPER pill, NES
   START, MOVES tab, LED) ported from docs/friday-nov20/skin-template.html,
   with its ?mode=live feel (press-in caps, click, 10 ms buzz, the
   floating stick).

   It sends only its raw state (wire.js) — on every change and at 60 Hz —
   over the unreliable channel; the game is the only sim. Input is read on
   pointerdown (never click), every finger tracked on its own (multi-touch).
   No zoom, scroll, selection or long-press menu; a screen wake lock; a
   rotate prompt in portrait; reconnects by itself after the phone sleeps. */

import { L, SK, skinId } from './skins.js';
import { joinPad } from './padlink.js';
import { encodeInput, decode, pong, TAPS, T_PING, START, TAUNT, HEARTBEAT_MS, LEFT, RIGHT, UP, DOWN, LIGHT, HEAVY, SPECIAL, BLOCK, JUMP, CROUCH } from './wire.js';
import { sheetHTML } from './sheet.js';
import { ledOf } from './host.js';

const W = 2400, H = 1100;
const BTN_BITS = [LIGHT, HEAVY, LIGHT | HEAVY, BLOCK, JUMP, TAUNT];   // BOP WALLOP GRAB / BLOCK JUMP TAUNT
const STICK_MAX = 60, DEAD = 20, FOLLOW = 110, DD_MS = 280;

/* ── drawing (the template's functions) ─────────────────────────────── */
function sh(hex, a) { const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255; const f = a < 0 ? 0 : 255, t = Math.abs(a); r = Math.round(r + (f - r) * t); g = Math.round(g + (f - g) * t); b = Math.round(b + (f - b) * t); return `rgb(${r},${g},${b})`; }

export function panelSVG(skin, art) {
  const C = SK[skin] || SK.sebas;
  let D = '', i = 0, bi = 0;
  const SND = [900, 600, 780, 850, 1000, 520];
  const id = (p) => p + (++i);
  function btn(cx, cy, col, label, lc, k) {
    const ring = id('r'), cap = id('c'), s = 89 / 46;
    D += `<radialGradient id="${ring}" cx="40%" cy="28%" r="80%"><stop offset="0" stop-color="${sh(col, 0.5)}"/><stop offset=".45" stop-color="${col}"/><stop offset=".92" stop-color="${sh(col, -0.5)}"/><stop offset="1" stop-color="${sh(col, -0.75)}"/></radialGradient>
 <linearGradient id="${cap}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sh(col, -0.45)}"/><stop offset=".45" stop-color="${sh(col, -0.08)}"/><stop offset="1" stop-color="${sh(col, 0.3)}"/></linearGradient>`;
    return `<g class="b" data-k="${k}" data-snd="${SND[bi++ % 6]}"><g transform="translate(${cx} ${cy}) scale(${s})">
 <ellipse cx="2" cy="8" rx="48" ry="45" fill="#000" opacity=".55" filter="url(#b4)"/>
 <circle r="46" fill="url(#${ring})" stroke="${sh(col, -0.8)}" stroke-width="1.4"/>
 <path d="M-37 -24 A44 44 0 0 1 24 -38" stroke="#fff" stroke-opacity=".6" stroke-width="2.6" fill="none" stroke-linecap="round"/>
 <circle r="36.5" fill="#0b0b0d"/>
 <g class="cap"><circle r="33" fill="url(#${cap})"/>
 <circle r="33" fill="none" stroke="#000" stroke-opacity=".55" stroke-width="7" filter="url(#b2)" clip-path="url(#capclip)" transform="translate(0 -3)"/>
 <path d="M-24 22 A33 33 0 0 0 24 22" stroke="#fff" stroke-opacity=".45" stroke-width="2" fill="none" stroke-linecap="round"/>
 <ellipse cx="0" cy="14" rx="17" ry="6" fill="#fff" opacity=".14" filter="url(#b2)"/></g>
 </g>` + (label ? `<text x="${cx}" y="${cy + 89 + 38}" text-anchor="middle" font-size="31" font-weight="600" letter-spacing="1" fill="${lc}">${label}</text>` : '') + '</g>';
  }
  function stick(cx, cy, R, ring, ball) {
    const a = id('sa'), b = id('sb');
    D += `<radialGradient id="${a}" cx="35%" cy="28%" r="80%"><stop offset="0" stop-color="${sh(ring, 0.5)}"/><stop offset=".5" stop-color="${ring}"/><stop offset="1" stop-color="${sh(ring, -0.6)}"/></radialGradient>
 <radialGradient id="${b}" cx="38%" cy="30%" r="72%"><stop offset="0" stop-color="${sh(ball, 0.5)}"/><stop offset=".45" stop-color="${ball}"/><stop offset="1" stop-color="${sh(ball, -0.6)}"/></radialGradient>`;
    const r2 = R * 0.76, rb = R * 0.72;
    return `<g transform="translate(${cx} ${cy})"><ellipse cx="6" cy="18" rx="${R + 10}" ry="${R + 4}" fill="#000" opacity=".5" filter="url(#b8)"/>
 <circle r="${R}" fill="url(#${a})" stroke="${sh(ring, -0.75)}" stroke-width="3"/><circle r="${(R + r2) / 2}" fill="none" stroke="${sh(ring, -0.45)}" stroke-width="3" opacity=".7"/>
 <circle r="${r2}" fill="#0c0c0e"/><g id="ball"><ellipse cx="10" cy="24" rx="${rb}" ry="${rb * 0.9}" fill="#000" opacity=".6" filter="url(#b8)"/>
 <circle r="${rb}" fill="url(#${b})" stroke="${sh(ball, -0.7)}" stroke-width="2"/><ellipse cx="${-rb * 0.3}" cy="${-rb * 0.42}" rx="${rb * 0.38}" ry="${rb * 0.2}" fill="#fff" opacity=".55" filter="url(#b4)"/></g></g>`;
  }
  function pill(cx, cy, w, h, col, txt, tc) {
    const g = id('p'), bv = id('bv');
    D += `<linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sh(col, 0.06)}"/><stop offset="1" stop-color="${sh(col, -0.1)}"/></linearGradient>
 <linearGradient id="${bv}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sh(col, 0.55)}"/><stop offset=".45" stop-color="${sh(col, 0.1)}"/><stop offset=".55" stop-color="${sh(col, -0.25)}"/><stop offset="1" stop-color="${sh(col, -0.6)}"/></linearGradient>`;
    return `<g class="pl" id="superBtn" data-snd="440" transform="translate(${cx} ${cy})"><rect x="${-w / 2 - 12}" y="${-h / 2 - 12}" width="${w + 24}" height="${h + 24}" rx="${h / 2 + 12}" fill="#141416" stroke="#000" stroke-width="3"/>
 <ellipse cx="0" cy="${h * 0.2}" rx="${w / 2}" ry="${h / 2}" fill="#000" opacity=".7" filter="url(#b4)"/>
 <g class="cap"><rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${h / 2}" fill="url(#${bv})" stroke="${sh(col, -0.75)}" stroke-width="2.5"/>
 <rect x="${-w / 2 + 9}" y="${-h / 2 + 8}" width="${w - 18}" height="${h - 16}" rx="${(h - 16) / 2}" fill="url(#${g})"/>
 <path d="M${-w / 2 + h / 2} ${-h / 2 + 8.5} H${w / 2 - h / 2}" stroke="#fff" stroke-opacity=".35" stroke-width="1.5" stroke-linecap="round"/>
 ${txt ? `<text y="${h * 0.17 + 2}" text-anchor="middle" font-size="${h * 0.46}" font-weight="600" letter-spacing="1" fill="${tc}">${txt}</text>` : ''}</g></g>`;
  }
  function nesStart(cx, cy, w, h, lab) {
    D += `<linearGradient id="rub" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d3e42"/><stop offset=".3" stop-color="#2a2b2e"/><stop offset="1" stop-color="#151618"/></linearGradient>
 <linearGradient id="lip" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".0"/><stop offset=".6" stop-color="#fff" stop-opacity=".0"/><stop offset="1" stop-color="#fff" stop-opacity=".22"/></linearGradient>
 <linearGradient id="shn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`;
    const Wd = w + 30, Hd = h + 26;
    return `<text x="${cx}" y="${cy - Hd / 2 - 16}" text-anchor="middle" font-size="30" font-weight="600" fill="${lab}" letter-spacing="1.5">START</text>
 <g class="pl" id="startBtn" data-snd="700" transform="translate(${cx} ${cy})">
 <rect x="${-Wd / 2}" y="${-Hd / 2}" width="${Wd}" height="${Hd}" rx="${Hd / 2}" fill="#08080a"/>
 <rect x="${-Wd / 2}" y="${-Hd / 2}" width="${Wd}" height="${Hd}" rx="${Hd / 2}" fill="none" stroke="url(#lip)" stroke-width="3"/>
 <rect x="${-Wd / 2 + 3}" y="${-Hd / 2 + 2}" width="${Wd - 6}" height="${Hd - 4}" rx="${Hd / 2 - 2}" fill="none" stroke="#000" stroke-width="8" opacity=".8" filter="url(#b4)"/>
 <ellipse cx="0" cy="${h * 0.18}" rx="${w / 2}" ry="${h / 2}" fill="#000" opacity=".7" filter="url(#b4)"/>
 <g class="cap"><rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${h / 2}" fill="url(#rub)" stroke="#050506" stroke-width="2.5"/>
 <rect x="${-w / 2 + 8}" y="${-h / 2 + 3}" width="${w - 16}" height="${h * 0.42}" rx="${h * 0.21}" fill="url(#shn)"/>
 <path d="M${-w / 2 + h / 2} ${-h / 2 + 2.5} H${w / 2 - h / 2}" stroke="#6a6c71" stroke-width="2" stroke-linecap="round" opacity=".7"/></g></g>`;
  }
  function controls() {
    const cols = C.caps;
    let o = '';
    o += stick(...L.stick, C.ring, C.ball);
    L.btn.forEach((p, k) => { o += btn(p[0], p[1], cols[k], L.lbl[k], C.lab, k); });
    o += pill(L.super[0], L.super[1], L.super[2], L.super[3], C.sup, 'SUPER', C.st);
    o += nesStart(L.start[0], L.start[1], L.start[2], L.start[3], C.slab || C.lab);
    const m = L.moves, tw = 230, th = 78, tx = m[0] - tw / 2, ty = 1100 - th;
    D += '<linearGradient id="kraft" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d8b67e"/><stop offset="1" stop-color="#c49a5c"/></linearGradient>';
    o += `<g class="pl" id="movesBtn" data-snd="520"><g class="cap"><path d="M${tx} 1110 V${ty + 18} q0 -18 18 -18 H${tx + tw - 18} q18 0 18 18 V1110Z" fill="#000" opacity=".45" filter="url(#b8)" transform="translate(0 -6)"/>
 <path d="M${tx} 1110 V${ty + 18} q0 -18 18 -18 H${tx + tw - 18} q18 0 18 18 V1110Z" fill="url(#kraft)" stroke="#6b4a1e" stroke-opacity=".5" stroke-width="2"/>
 <path d="M${tx + 12} ${ty + 8} H${tx + tw - 12}" stroke="#fff" stroke-opacity=".25" stroke-width="2"/>
 <text x="${m[0]}" y="${ty + 52}" text-anchor="middle" font-family="'Bolster Hand',Oswald" font-size="38" fill="#2b1d0e">▲ MOVES</text></g></g>`;
    o += `<g id="led"><circle cx="${L.led[0]}" cy="${L.led[1]}" r="24" fill="${C.led}" opacity=".5" filter="url(#b8)"/><circle cx="${L.led[0]}" cy="${L.led[1]}" r="10" fill="${sh(C.led, 0.55)}"/></g>`;
    return o;
  }
  const body = `<image href="${art}${skin}.webp" width="2400" height="1100" preserveAspectRatio="none"/>` + controls();
  return `<defs><filter id="b2"><feGaussianBlur stdDeviation="2"/></filter><filter id="b4"><feGaussianBlur stdDeviation="4"/></filter><filter id="b8"><feGaussianBlur stdDeviation="8"/></filter><clipPath id="capclip"><circle r="33"/></clipPath>${D}</defs>` + body;
}

const CSS = `
html,body.pad{margin:0;background:#000;height:100%;overflow:hidden;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;overscroll-behavior:none;font-family:"Bolster Condensed",Oswald,"Arial Narrow",sans-serif}
body.pad *{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
#s{position:fixed;inset:0;width:100vw;height:100vh;height:100dvh;display:block;font-family:"Bolster Condensed",Oswald,"Arial Narrow",sans-serif;font-weight:700}
.b .cap,.pl .cap{transition:transform .09s cubic-bezier(.3,1.6,.5,1),filter .09s;transform-box:fill-box;transform-origin:center}
.b.dn .cap{transform:translateY(2px) scale(.92);filter:brightness(.72)}.pl.dn .cap{transform:translateY(2px) scale(.95);filter:brightness(.8)}
.b.fl .cap{filter:brightness(1.35)}
#hf{position:fixed;inset:0;pointer-events:none;box-shadow:inset 0 0 80px 20px rgba(255,30,30,0);transition:box-shadow .3s;z-index:6}#hf.on{box-shadow:inset 0 0 80px 20px rgba(255,30,30,.75);transition:none}
:root{--u:min(1vh,.5vw)}
.sheet{position:fixed;left:50%;top:50%;width:min(80vw,132vh);max-height:94vh;overflow:hidden;transform:translate(-50%,72vh) rotate(-1.2deg);transition:transform .45s cubic-bezier(.2,1.25,.4,1);z-index:9;visibility:hidden;
 background:radial-gradient(circle at 84% 80%,transparent 0 calc(6.5*var(--u)),#7a4f1c33 calc(6.6*var(--u)) calc(7.4*var(--u)),transparent calc(7.5*var(--u))),radial-gradient(#0000 60%,#6b4a1e22),repeating-linear-gradient(0deg,#0000 0 3px,#00000008 3px 4px),linear-gradient(#d8b67e,#cba366);
 border-radius:calc(1*var(--u));box-shadow:0 2vh 5vh #000a;padding:calc(3.4*var(--u)) calc(5*var(--u)) calc(2.4*var(--u));color:#24170a;font-family:"Bolster Hand",cursive}
.sheet.open{transform:translate(-50%,-50%) rotate(-1.2deg);visibility:visible}.sheet.vis{visibility:visible}
.tape{position:absolute;width:calc(14*var(--u));height:calc(5*var(--u));background:#f4f1e3b0;top:calc(-2*var(--u))}.tape.l{left:5%;transform:rotate(-8deg)}.tape.r{right:5%;transform:rotate(7deg)}
.sheet h2{margin:0 0 calc(1*var(--u));font-size:calc(6*var(--u));font-weight:400;color:#8b1a1a;transform:rotate(-1deg);white-space:nowrap}
.row{display:grid;grid-template-columns:44% 1fr;align-items:center;gap:calc(2*var(--u));padding:calc(1*var(--u)) 0;border-bottom:calc(.35*var(--u)) dashed #24170a44}
.row:last-child{border:0}
.mv{font:700 calc(4*var(--u)) "Bolster Condensed",Oswald,sans-serif;line-height:1.1}.mv small{display:block;font:400 calc(3*var(--u)) "Bolster Hand",cursive;opacity:.78;white-space:nowrap}
.in{font-size:calc(4.3*var(--u));display:flex;align-items:center;flex-wrap:wrap;gap:calc(.6*var(--u))}
.in .ar{font-family:system-ui,sans-serif;font-weight:700;letter-spacing:.05em}
.chip{display:inline-block;font:700 calc(2.9*var(--u)) "Bolster Condensed",Oswald,sans-serif;color:#fff;background:#1f2c78;border-radius:99px;padding:calc(.3*var(--u)) calc(1.3*var(--u))}
.chip.w{background:#d4560f}.chip.g{background:#555}.chip.s{background:#c4520f}
.x{position:absolute;right:calc(3*var(--u));top:calc(2*var(--u));font:700 calc(4.5*var(--u)) system-ui,sans-serif;padding:0 calc(1*var(--u))}
#rot{position:fixed;inset:0;display:none;z-index:20;background:#140b22;color:#fff;align-items:center;justify-content:center;flex-direction:column;gap:18px;text-align:center;font:700 22px "Bolster Condensed",Oswald,sans-serif;letter-spacing:.06em;text-transform:uppercase}
#rot svg{width:96px;height:96px;animation:rt 1.6s ease-in-out infinite}
@keyframes rt{0%,20%{transform:rotate(0)}60%,100%{transform:rotate(-90deg)}}
@media (orientation:portrait){#rot{display:flex}}
#st{position:fixed;left:50%;top:2.5vh;transform:translateX(-50%);z-index:8;padding:.6vh 2vh;border-radius:99px;background:#000b;color:#fff;font:700 max(13px,3.2vh) "Bolster Condensed",Oswald,sans-serif;letter-spacing:.08em;text-transform:uppercase;pointer-events:none;opacity:0;transition:opacity .25s;white-space:nowrap}
#st.on{opacity:1}
#sel{position:fixed;left:50%;top:1.5vh;transform:translateX(-50%);z-index:8;display:none;align-items:center;gap:1.2vh;padding:1vh 1.4vh;border-radius:2vh;background:#120a1ee6;border:2px solid #ffffff30;color:#fff;font:700 max(13px,3.6vh) "Bolster Condensed",Oswald,sans-serif;letter-spacing:.04em;text-transform:uppercase;box-shadow:0 1vh 3vh #0009}
#sel.on{display:flex}
#sel .arw{width:7.5vh;height:7.5vh;border-radius:50%;border:0;background:#ffffff22;color:#fff;font:700 3.6vh system-ui,sans-serif;display:flex;align-items:center;justify-content:center}
#sel .nm{min-width:28vh;text-align:center;line-height:1}#sel .nm small{display:block;font-size:.55em;opacity:.7;letter-spacing:.12em}
#sel .tg{display:flex;border-radius:99px;overflow:hidden;border:2px solid #ffffff40}
#sel .tg b{padding:.8vh 1.6vh;font-size:.8em;opacity:.55}#sel .tg b.on{background:#ff3b6b;opacity:1}#sel .tg b.alt.on{background:#b3121f}
#sel .lk{padding:1.2vh 2vh;border-radius:99px;background:#3ff0c8;color:#06221a;font-size:.8em}
#sel.locked .lk{background:#ffffff30;color:#fff}#sel.locked .arw,#sel.locked .tg{opacity:.35}
#ko{position:fixed;inset:0;z-index:10;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:0;transition:opacity .35s}
#ko.on{opacity:1}
#ko .card{max-width:72vw;padding:3.5vh 5vh;background:#fff6e0;color:#1a0f05;border-radius:1vh;transform:rotate(-2deg);box-shadow:0 2vh 6vh #000c;text-align:center;font:400 7.5vh/1.05 "Bolster Hand",cursive}
#ko .card small{display:block;margin-top:1.2vh;font:700 2.8vh "Bolster Condensed",Oswald,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#8b1a1a}
#ink{position:fixed;inset:0;z-index:7;pointer-events:none}
#ink svg{position:absolute;inset:0;width:100%;height:100%}
.shk{animation:shk .22s}
@keyframes shk{0%{transform:translate(0,0)}33%{transform:translate(-8px,4px)}66%{transform:translate(6px,-3px)}100%{transform:translate(0,0)}}
`;

/* an ink splat (Rubberta's Ink Jet): blobs + drips, over the art but kept
   clear of every control's hit area (and pointer-events: none anyway) */
function inkSVG(seed) {
  let s = seed;
  const R = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  // between and around the controls (stick 419–789, SUPER 966–1228, START, the plate 1460–2070)
  const spots = [[1100, 820, 1], [880, 300, 0.6], [270, 930, 0.75], [1330, 990, 0.55], [1240, 90, 0.5]];
  const INK = '#160a26';
  let o = '';
  spots.forEach(([cx, cy, big]) => {
    const r = 110 * big, k = 22, pts = [];
    for (let i = 0; i < k; i++) { const a = (i / k) * Math.PI * 2, rr = r * (0.8 + R() * 0.35) * (i % 4 === 0 ? 1.3 + R() * 0.3 : 1); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.9]); }
    // a smooth closed curve through the points (midpoint quadratics)
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    let d = `M${mid(pts[k - 1], pts[0]).map((v) => v.toFixed(0)).join(' ')}`;
    for (let i = 0; i < k; i++) { const p = pts[i], m = mid(p, pts[(i + 1) % k]); d += `Q${p[0].toFixed(0)} ${p[1].toFixed(0)} ${m[0].toFixed(0)} ${m[1].toFixed(0)}`; }
    o += `<path d="${d}Z" fill="${INK}" stroke="${INK}" stroke-width="18" stroke-linejoin="round"/>`;
    for (let j = 0; j < 6; j++) { const a = R() * Math.PI * 2, dd = r * (1.35 + R() * 0.7); o += `<circle cx="${(cx + Math.cos(a) * dd).toFixed(0)}" cy="${(cy + Math.sin(a) * dd * 0.8).toFixed(0)}" r="${(5 + R() * 16 * big).toFixed(0)}" fill="${INK}"/>`; }
    for (let j = 0; j < 3; j++) { const x = cx + (R() - 0.5) * r * 1.1, w = 12 + R() * 14 * big; o += `<g class="drip" style="transform-origin:${x.toFixed(0)}px ${cy.toFixed(0)}px"><rect x="${(x - w / 2).toFixed(0)}" y="${cy.toFixed(0)}" width="${w.toFixed(0)}" height="${(r * 0.8 + R() * 90).toFixed(0)}" rx="${(w / 2).toFixed(0)}" fill="${INK}"/></g>`; }
    // the wet sheen
    o += `<ellipse cx="${(cx - r * 0.3).toFixed(0)}" cy="${(cy - r * 0.35).toFixed(0)}" rx="${(r * 0.32).toFixed(0)}" ry="${(r * 0.14).toFixed(0)}" fill="#fff" opacity=".22" transform="rotate(-20 ${cx} ${cy})"/>`;
  });
  return `<svg viewBox="0 0 2400 1100" preserveAspectRatio="xMidYMid slice"><g opacity=".94">${o}</g></svg>`;
}

/* ── the app ────────────────────────────────────────────────────────── */
export function runPad(params) {
  const code = (params.get('pad') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const art = params.get('art') || 'controller/backgrounds/';
  const LS = (() => { try { const s = window.localStorage; s.getItem('x'); return s; } catch { return null; } })();
  let uid = '';
  try { uid = LS?.getItem('pillowfight2.padId') || ''; } catch { /* */ }
  if (!uid) { uid = Math.random().toString(36).slice(2, 10); try { LS?.setItem('pillowfight2.padId', uid); } catch { /* */ } }
  if (params.get('uid')) uid = params.get('uid');

  document.title = 'Pillow Fight 2 · Phone Pad';
  let vp = document.querySelector('meta[name=viewport]');
  if (!vp) { vp = document.createElement('meta'); vp.name = 'viewport'; document.head.appendChild(vp); }
  vp.content = 'width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover';
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  document.body.className = 'pad';
  document.body.innerHTML = `<svg id="s" viewBox="0 0 2400 1100"></svg><div id="ink"></div><div id="hf"></div><div id="st"></div>
<div id="sel"><button class="arw" data-dx="-1">◀</button><div class="nm"><small>Pick</small><span></span></div><button class="arw" data-dx="1">▶</button><div class="tg"><b class="og" data-alt="0">OG</b><b class="alt" data-alt="1">ALT</b></div><b class="lk">Lock</b></div>
<div class="sheet" id="sh"></div><div id="ko"><div class="card"></div></div>
<div id="rot"><svg viewBox="0 0 96 96" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"><rect x="28" y="10" width="40" height="76" rx="8"/><circle cx="48" cy="76" r="3" fill="#fff"/></svg>Rotate your phone<small style="font-size:14px;opacity:.6;letter-spacing:.1em">the pad plays sideways</small></div>`;
  for (const ev of ['contextmenu', 'selectstart', 'dragstart', 'gesturestart', 'dblclick']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('touchstart', (e) => { if (e.touches.length > 1 || !e.target.closest?.('#sh')) e.preventDefault(); }, { passive: false });

  const svg = document.getElementById('s');
  const fit = () => svg.setAttribute('preserveAspectRatio', innerWidth / innerHeight >= 1956 / 1100 ? 'xMidYMid slice' : 'xMidYMid meet');
  fit(); addEventListener('resize', fit);

  /* state */
  const S = { skin: '', seat: -1, link: null, connecting: false, rtt: 0, lastPing: 0, view: null, sheetOpen: false };
  const btnDown = [0, 0, 0, 0, 0, 0];
  let superDown = 0, startDown = 0;
  let stickBits = 0, ddArmed = 0, lastDownEnd = 0, lastDownWasPure = false;
  const counts = new Array(TAPS.length).fill(0);
  let seq = 0, lastMask = 0;
  let ball = null, ledEl = null;

  const mask = () => {
    let m = stickBits;
    BTN_BITS.forEach((b, k) => { if (btnDown[k]) m |= b; });
    if (superDown) m |= SPECIAL;
    if (startDown) m |= START;
    return m;
  };
  const send = () => {
    const m = mask();
    const pressed = m & ~lastMask;
    if (pressed) TAPS.forEach((b, i) => { if (pressed & b) counts[i] = (counts[i] + 1) & 15; });
    lastMask = m;
    seq = (seq + 1) & 255;
    S.link?.send('pi', encodeInput(seq, m, counts));
  };
  setInterval(send, HEARTBEAT_MS);

  /* sound: the template's click */
  let ac;
  const snd = (f) => { try { ac = ac || new AudioContext(); if (ac.state === 'suspended') ac.resume(); const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f; o.type = 'square'; g.gain.setValueAtTime(0.05, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.05); o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.06); } catch { /* */ } };
  const canBuzz = typeof navigator.vibrate === 'function';
  const buzz = (p) => { if (!canBuzz) return false; try { return navigator.vibrate(p); } catch { return false; } };

  function draw(skin) {
    if (skin === S.skin) return;
    S.skin = skin;
    svg.innerHTML = panelSVG(skin, art);
    ball = svg.querySelector('#ball');
    ledEl = svg.querySelector('#led');
    paintLed();
    sheet();
  }

  /* ── input: every pointer on its own ─────────────────────────────── */
  const ptrs = new Map();
  const toSvg = (e) => { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const m = svg.getScreenCTM(); return m ? p.matrixTransform(m.inverse()) : { x: 0, y: 0 }; };
  const els = () => ({ b: [...svg.querySelectorAll('.b')], sup: svg.querySelector('#superBtn'), start: svg.querySelector('#startBtn'), moves: svg.querySelector('#movesBtn') });
  function hit(p) {
    // the six buttons: the nearest within its reach (generous: thumbs)
    let best = -1, bd = 132;
    L.btn.forEach(([x, y], k) => { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = k; } });
    if (best >= 0) return { t: 'btn', k: best };
    const [sx, sy, sw, shh] = L.super;
    if (Math.abs(p.x - sx) < sw / 2 + 40 && Math.abs(p.y - sy) < shh / 2 + 40) return { t: 'super' };
    const [tx, ty, tw, th] = L.start;
    if (Math.abs(p.x - tx) < tw / 2 + 50 && Math.abs(p.y - ty) < th / 2 + 45) return { t: 'start' };
    if (Math.abs(p.x - L.moves[0]) < 150 && p.y > 960) return { t: 'moves' };
    if (p.x < 1000) return { t: 'stick' };
    return null;
  }
  function press(h, on) {
    const E = els();
    if (h.t === 'btn') { btnDown[h.k] += on ? 1 : -1; if (btnDown[h.k] < 0) btnDown[h.k] = 0; E.b[h.k]?.classList.toggle('dn', btnDown[h.k] > 0); if (on) { snd(+E.b[h.k].dataset.snd); flash(E.b[h.k]); } }
    if (h.t === 'super') { superDown = Math.max(0, superDown + (on ? 1 : -1)); E.sup?.classList.toggle('dn', superDown > 0); if (on) snd(440); }
    if (h.t === 'start') { startDown = Math.max(0, startDown + (on ? 1 : -1)); E.start?.classList.toggle('dn', startDown > 0); if (on) snd(700); }
    if (h.t === 'moves') { E.moves?.classList.toggle('dn', on); if (on) { snd(520); openSheet(true); } }
    if (on) buzz(10);
    send();
  }
  const flash = (el) => { el.classList.add('fl'); setTimeout(() => el.classList.remove('fl'), 70); };

  function stickDir(dx, dy) {
    const d = Math.hypot(dx, dy);
    if (d < DEAD) return 0;
    const a = Math.atan2(-dy, dx), s = Math.round(a / (Math.PI / 4));   // 0 →, 1 ↗, 2 ↑, … (8-way)
    const R = [RIGHT, RIGHT | UP, UP, LEFT | UP, LEFT, LEFT | CROUCH, CROUCH, RIGHT | CROUCH][(s + 8) % 8];
    return R;
  }
  function setStick(bits) {
    // ↓↓ (two quick downs): the second one is the sidestep out (DOWN), not a crouch
    const wasDown = (stickBits & (CROUCH | DOWN)) !== 0, isDown = (bits & CROUCH) !== 0;
    if (isDown && !wasDown) ddArmed = lastDownWasPure && performance.now() - lastDownEnd < DD_MS ? 1 : 0;
    if (!isDown && wasDown) { lastDownEnd = performance.now(); lastDownWasPure = (stickBits & (LEFT | RIGHT)) === 0; }
    if (isDown && ddArmed && !(bits & (LEFT | RIGHT))) bits = (bits & ~CROUCH) | DOWN;
    else if (bits & (LEFT | RIGHT)) ddArmed = 0;
    if (bits !== stickBits) { stickBits = bits; send(); }
  }

  svg.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    wake(false, true);
    if (S.sheetOpen) return;
    const p = toSvg(e), h = hit(p);
    if (!h) return;
    try { svg.setPointerCapture(e.pointerId); } catch { /* */ }
    if (h.t === 'stick') {
      if ([...ptrs.values()].some((q) => q.t === 'stick')) return;
      ptrs.set(e.pointerId, { t: 'stick', ox: p.x, oy: p.y });
      return;
    }
    ptrs.set(e.pointerId, h);
    press(h, true);
  }, { passive: false });
  svg.addEventListener('pointermove', (e) => {
    const q = ptrs.get(e.pointerId);
    if (!q) return;
    const p = toSvg(e);
    if (q.t === 'stick') {
      let dx = p.x - q.ox, dy = p.y - q.oy;
      const d = Math.hypot(dx, dy);
      // the origin follows a finger that keeps going, so a reversal is quick
      if (d > FOLLOW) { q.ox = p.x - (dx / d) * FOLLOW; q.oy = p.y - (dy / d) * FOLLOW; dx = p.x - q.ox; dy = p.y - q.oy; }
      setStick(stickDir(dx, dy));
      const m = Math.hypot(dx, dy), k = m > STICK_MAX ? STICK_MAX / m : 1;
      ball?.setAttribute('transform', `translate(${(dx * k).toFixed(1)} ${(dy * k).toFixed(1)})`);
      return;
    }
    if (q.t === 'btn') {
      // slide from one button onto the next (arcade piano)
      const h = hit(p);
      if (h && h.t === 'btn' && h.k !== q.k) { press(q, false); q.k = h.k; press(q, true); }
    }
  });
  const up = (e) => {
    const q = ptrs.get(e.pointerId);
    if (!q) return;
    ptrs.delete(e.pointerId);
    if (q.t === 'stick') { setStick(0); ball?.setAttribute('transform', ''); return; }
    press(q, false);
  };
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) svg.addEventListener(t, up);
  addEventListener('blur', () => { for (const id of [...ptrs.keys()]) up({ pointerId: id }); });

  /* swipe up from the bottom edge: the cheat sheet */
  let sw = null;
  addEventListener('pointerdown', (e) => { if (e.clientY > innerHeight * 0.8 && e.clientX > innerWidth * 0.6) sw = { y: e.clientY, id: e.pointerId }; }, true);
  addEventListener('pointermove', (e) => { if (sw && e.pointerId === sw.id && sw.y - e.clientY > innerHeight * 0.12) { sw = null; openSheet(true); } }, true);
  addEventListener('pointerup', () => { sw = null; }, true);

  /* ── the cheat sheet ─────────────────────────────────────────────── */
  const sheetEl = document.getElementById('sh');
  function sheet() { const v = S.view; sheetEl.innerHTML = sheetHTML(v?.fid || 'kevalanche', !!v?.alt); sheetEl.querySelector('.x').addEventListener('pointerdown', (e) => { e.stopPropagation(); openSheet(false); }); }
  function openSheet(on) {
    if (S.sheetOpen === on) return;
    S.sheetOpen = on;
    if (on) { for (const id of [...ptrs.keys()]) up({ pointerId: id }); }
    sheetEl.classList.add('vis');
    sheetEl.classList.toggle('open', on);
    if (!on) setTimeout(() => { if (!S.sheetOpen) sheetEl.classList.remove('vis'); }, 460);
    S.link?.send('pc', { t: 'sheet', open: on });
  }
  let shy = null;
  sheetEl.addEventListener('pointerdown', (e) => { shy = e.clientY; });
  sheetEl.addEventListener('pointermove', (e) => { if (shy !== null && e.clientY - shy > innerHeight * 0.15) { shy = null; openSheet(false); } });
  sheetEl.addEventListener('pointerup', () => { shy = null; });
  document.addEventListener('pointerdown', (e) => { if (S.sheetOpen && !e.target.closest('#sh')) { openSheet(false); e.stopPropagation(); e.preventDefault(); } }, true);

  /* ── the select strip: OG / ALT and the cursor, from the phone ───── */
  const selEl = document.getElementById('sel');
  selEl.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    const t = e.target.closest('[data-dx],[data-alt],.lk');
    if (!t || !S.link) return;
    snd(800); buzz(10);
    if (t.dataset.dx) S.link.send('pc', { t: 'sel', dx: +t.dataset.dx });
    else if (t.dataset.alt) S.link.send('pc', { t: 'sel', alt: t.dataset.alt === '1' });
    else S.link.send('pc', { t: 'sel', lock: true });
  });
  function paintSel() {
    const v = S.view, on = !!v && v.scr === 'select' && v.pick;
    selEl.classList.toggle('on', on);
    if (!on) return;
    selEl.querySelector('.nm span').textContent = v.name;
    selEl.querySelector('.nm small').textContent = v.who || 'Pick';
    const a = v.salt ?? v.alt;
    selEl.querySelector('.og').classList.toggle('on', !a);
    selEl.querySelector('.alt').classList.toggle('on', !!a);
    selEl.classList.toggle('locked', !!v.locked);
    selEl.querySelector('.lk').textContent = v.locked ? 'Locked' : 'Lock';
  }

  /* ── status, LED, hit / KO / ink ─────────────────────────────────── */
  const stEl = document.getElementById('st');
  let stT = 0;
  const status = (text, ms = 0) => { stEl.textContent = text; stEl.classList.toggle('on', !!text); clearTimeout(stT); if (ms) stT = setTimeout(() => stEl.classList.remove('on'), ms); };
  function paintLed() {
    if (!ledEl) return;
    const c = !S.link ? 'off' : performance.now() - S.lastPing > 2500 ? 'red' : ledOf(S.rtt, true);
    const col = { green: '#3fdc7a', amber: '#ffb020', red: '#ff3030', off: '#555' }[c];
    ledEl.dataset.c = c;
    ledEl.querySelectorAll('circle').forEach((el, i) => el.setAttribute('fill', i ? sh(col, 0.55) : col));
  }
  setInterval(paintLed, 500);

  const hf = document.getElementById('hf');
  function hitFx(kind) {
    const ko = kind === 'ko';
    const ok = buzz(ko ? [180, 60, 380] : 35);
    if (!ok || ko) { hf.classList.add('on'); setTimeout(() => hf.classList.remove('on'), ko ? 160 : 70); }
    if (!ok) { svg.classList.remove('shk'); void svg.getBoundingClientRect(); svg.classList.add('shk'); }
  }
  const inkEl = document.getElementById('ink');
  let inkN = 1;
  function ink() {
    inkEl.innerHTML = inkSVG(inkN++ * 7919);
    const g = inkEl.querySelector('g');
    g.animate([{ transform: 'scale(.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 0.93, offset: 0.06 }, { transform: 'translateY(0)', opacity: 0.93, offset: 0.35 }, { transform: 'translateY(60px)', opacity: 0 }], { duration: 2100, easing: 'ease-in', fill: 'forwards' });
    g.style.transformOrigin = '50% 50%';
    for (const d of inkEl.querySelectorAll('.drip')) d.animate([{ transform: 'scaleY(.3)' }, { transform: 'scaleY(1.8)' }], { duration: 2000, easing: 'ease-in', fill: 'forwards' });
    setTimeout(() => { inkEl.textContent = ''; }, 2150);
    buzz(60);
  }
  const koEl = document.getElementById('ko');
  let koT = 0;
  function koLine(line, who) {
    koEl.querySelector('.card').innerHTML = `${line.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}<small>— ${who}</small>`;
    koEl.classList.add('on');
    clearTimeout(koT); koT = setTimeout(() => koEl.classList.remove('on'), 5200);
  }

  /* ── messages from the game ──────────────────────────────────────── */
  function onCtl(m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'seat') { S.seat = m.k; status(`You’re Player ${m.k + 1}`, 2200); }
    else if (m.t === 'st') {
      const prev = S.view;
      S.view = m;
      if (m.skin && SK[m.skin]) draw(m.skin);
      if (!prev || prev.fid !== m.fid || prev.alt !== m.alt) sheet();
      if (prev?.scr === 'win' && m.scr !== 'win') koEl.classList.remove('on');
      paintSel();
    } else if (m.t === 'bz') hitFx(m.kind);
    else if (m.t === 'ink') ink();
    else if (m.t === 'ko') koLine(m.line, m.who);
    else if (m.t === 'full') status('Both pads are taken', 0);
  }
  function onPi(data) {
    const p = decode(data);
    if (p?.t === T_PING) { S.link?.send('pi', pong(p.id)); S.rtt = p.rtt; S.lastPing = performance.now(); }
  }

  /* ── connect, and reconnect after a sleep ───────────────────────── */
  let retryT = 0;
  function connect() {
    if (S.link || S.connecting || !code) return;
    S.connecting = true;
    status(S.seat >= 0 ? 'Reconnecting…' : 'Connecting…');
    joinPad(params, code, uid, {
      open: (link) => {
        S.connecting = false; S.link = link; S.lastPing = performance.now();
        link.on = (ch, m) => (ch === 'pc' ? onCtl(m) : onPi(m));
        link.onclose = () => { if (S.link === link) { S.link = null; paintLed(); schedule(800); } };
        link.send('pc', { t: 'hi', uid });
        status('', 0);
        paintLed();
        send();
      },
      error: (kind) => { S.connecting = false; status(kind === 'notfound' ? 'Game not found — scan the QR again' : 'No connection — retrying…'); schedule(kind === 'notfound' ? 4000 : 1500); },
    });
  }
  const schedule = (ms) => { clearTimeout(retryT); retryT = setTimeout(connect, ms); };
  // a link that has gone quiet (the phone slept, the network changed): drop it and rejoin
  setInterval(() => { if (S.link && document.visibilityState === 'visible' && performance.now() - S.lastPing > 4000) { const l = S.link; S.link = null; try { l.close(); } catch { /* */ } connect(); } }, 1000);
  addEventListener('pagehide', () => { const l = S.link; S.link = null; try { l?.close(); } catch { /* */ } });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { wake(true); S.lastPing = performance.now(); if (!S.link) connect(); }
    else { for (const id of [...ptrs.keys()]) up({ pointerId: id }); }
  });

  /* ── keep the screen on ──────────────────────────────────────────── */
  let lock = null, full = false;
  async function wake(force, gesture) {
    if (gesture && !full && !document.fullscreenElement && document.documentElement.requestFullscreen && !params.has('nofs')) { full = true; try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); await screen.orientation?.lock?.('landscape'); } catch { /* not allowed here: fine */ } }
    if (lock && !force) return;
    try { if (navigator.wakeLock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener?.('release', () => { lock = null; }); } } catch { lock = null; }
  }

  draw(params.get('skin') && SK[params.get('skin')] ? params.get('skin') : 'kevalanche');
  wake();
  // ?pad=DEMO: the panel alone, no game (for looking at the skins)
  if (code === 'DEMO') { S.view = { fid: (params.get('skin') || 'kevalanche').replace(/-alt$/, '').replace('k8-e', 'k8e'), alt: /-alt$/.test(params.get('skin') || '') }; sheet(); } else connect();
  window.__pad = { S, mask, openSheet, get sheetOpen() { return S.sheetOpen; }, hit, toSvg, ink, koLine, hitFx, skinId };
}
