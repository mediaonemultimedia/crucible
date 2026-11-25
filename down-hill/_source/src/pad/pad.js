/* Phone pad with the original fourteen skins, stick steering and motion drift. */
import { L, SK, skinId } from './skins.js';
import { joinPad } from './padlink.js';
import { encodeInput, decode, pong, TAPS, T_PING, HEARTBEAT_MS, LEFT, RIGHT, UP, DOWN, GAS, DRIFT, BRAKE, START, SUPER } from './wire.js';
import { sheetHTML } from './sheet.js';
import { driftPitch, motionDrift } from './tilt.js';
import { ledOf } from './host.js';

const BUTTONS = [
  { k: 3, x: 1645, y: 574, radius: 126, bit: BRAKE, label: 'BRAKE / REVERSE' },
  { k: 0, x: 1970, y: 482, radius: 135, bit: GAS, label: 'ACCELERATE' },
];
const STICK_MAX = 60, DEAD = 20, FOLLOW = 110, STEER_DEAD = 8;


/* ── drawing (the template's functions) ─────────────────────────────── */
function sh(hex, a) { const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255; const f = a < 0 ? 0 : 255, t = Math.abs(a); r = Math.round(r + (f - r) * t); g = Math.round(g + (f - g) * t); b = Math.round(b + (f - b) * t); return `rgb(${r},${g},${b})`; }

export function panelSVG(skin, art) {
  const C = SK[skin] || SK.sebas;
  let D = '', i = 0;
  const id = (p) => p + (++i);
  function btn(cx, cy, col, label, lc, k, radius) {
    const ring = id('r'), cap = id('c'), s = radius / 46;
    D += `<radialGradient id="${ring}" cx="40%" cy="28%" r="80%"><stop offset="0" stop-color="${sh(col, 0.5)}"/><stop offset=".45" stop-color="${col}"/><stop offset=".92" stop-color="${sh(col, -0.5)}"/><stop offset="1" stop-color="${sh(col, -0.75)}"/></radialGradient>
 <linearGradient id="${cap}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sh(col, -0.45)}"/><stop offset=".45" stop-color="${sh(col, -0.08)}"/><stop offset="1" stop-color="${sh(col, 0.3)}"/></linearGradient>`;
    return `<g class="b" data-k="${k}" data-snd="${k === 0 ? 900 : 850}"><g transform="translate(${cx} ${cy}) scale(${s})">
 <ellipse cx="2" cy="8" rx="48" ry="45" fill="#000" opacity=".55" filter="url(#b4)"/>
 <circle r="46" fill="url(#${ring})" stroke="${sh(col, -0.8)}" stroke-width="1.4"/>
 <path d="M-37 -24 A44 44 0 0 1 24 -38" stroke="#fff" stroke-opacity=".6" stroke-width="2.6" fill="none" stroke-linecap="round"/>
 <circle r="36.5" fill="#0b0b0d"/>
 <g class="cap"><circle r="33" fill="url(#${cap})"/>
 <circle r="33" fill="none" stroke="#000" stroke-opacity=".55" stroke-width="7" filter="url(#b2)" clip-path="url(#capclip)" transform="translate(0 -3)"/>
 <path d="M-24 22 A33 33 0 0 0 24 22" stroke="#fff" stroke-opacity=".45" stroke-width="2" fill="none" stroke-linecap="round"/>
 <ellipse cx="0" cy="14" rx="17" ry="6" fill="#fff" opacity=".14" filter="url(#b2)"/></g>
 </g>` + (label ? `<text x="${cx}" y="${cy + radius + 38}" text-anchor="middle" font-size="31" font-weight="600" letter-spacing="1" fill="${lc}">${label}</text>` : '') + '</g>';
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
    o += `<g id="stickG">${stick(...L.stick, C.ring, C.ball)}</g>`;
    BUTTONS.forEach(({ k, x, y, radius, label }) => { o += btn(x, y, cols[k], label, C.lab, k, radius); });
    o += pill(L.super[0], L.super[1], L.super[2], L.super[3], C.sup, 'SUPER', C.st);
    o += nesStart(L.start[0], L.start[1], L.start[2], L.start[3], C.slab || C.lab);
    const m = L.moves, tw = 230, th = 78, tx = m[0] - tw / 2, ty = 1100 - th;
    D += '<linearGradient id="kraft" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d8b67e"/><stop offset="1" stop-color="#c49a5c"/></linearGradient>';
    o += `<g class="pl" id="movesBtn" data-snd="520"><g class="cap"><path d="M${tx} 1110 V${ty + 18} q0 -18 18 -18 H${tx + tw - 18} q18 0 18 18 V1110Z" fill="#000" opacity=".45" filter="url(#b8)" transform="translate(0 -6)"/>
 <path d="M${tx} 1110 V${ty + 18} q0 -18 18 -18 H${tx + tw - 18} q18 0 18 18 V1110Z" fill="url(#kraft)" stroke="#6b4a1e" stroke-opacity=".5" stroke-width="2"/>
 <path d="M${tx + 12} ${ty + 8} H${tx + tw - 12}" stroke="#fff" stroke-opacity=".25" stroke-width="2"/>
 <text x="${m[0]}" y="${ty + 52}" text-anchor="middle" font-family="'Bolster Hand',Oswald" font-size="38" fill="#2b1d0e">▲ HOW TO</text></g></g>`;
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
.x{position:absolute;z-index:2;right:calc(3*var(--u));top:calc(2*var(--u));font:700 calc(4.5*var(--u)) system-ui,sans-serif;padding:0 calc(1*var(--u))}
#rot{position:fixed;inset:0;display:none;z-index:20;background:#140b22;color:#fff;align-items:center;justify-content:center;flex-direction:column;gap:18px;text-align:center;font:700 22px "Bolster Condensed",Oswald,sans-serif;letter-spacing:.06em;text-transform:uppercase}
#rot svg{width:96px;height:96px;animation:rt 1.6s ease-in-out infinite}
@keyframes rt{0%,20%{transform:rotate(0)}60%,100%{transform:rotate(-90deg)}}
@media (orientation:portrait){#rot{display:flex}}
#st{position:fixed;left:50%;top:2.5vh;transform:translateX(-50%);z-index:8;padding:.6vh 2vh;border-radius:99px;background:#000b;color:#fff;font:700 max(13px,3.2vh) "Bolster Condensed",Oswald,sans-serif;letter-spacing:.08em;text-transform:uppercase;pointer-events:none;opacity:0;transition:opacity .25s;white-space:nowrap}
#st.on{opacity:1}
#sel{position:fixed;left:50%;top:1.5vh;transform:translateX(-50%);z-index:8;display:none;align-items:center;gap:1.2vh;padding:1vh 1.4vh;border-radius:2vh;background:#120a1ee6;border:2px solid #ffffff30;color:#fff;font:700 max(13px,3.6vh) "Bolster Condensed",Oswald,sans-serif;letter-spacing:.04em;text-transform:uppercase;box-shadow:0 1vh 3vh #0009}
#sel.on{display:flex}
#sel.setup .arw,#sel.setup .tg{display:none}
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
#tilt{position:fixed;left:3vh;bottom:4vh;z-index:8;display:none;padding:1.4vh 2.4vh;border-radius:99px;background:#3ff0c8;color:#06221a;font:700 max(13px,3.4vh) "Bolster Condensed",Oswald,sans-serif;letter-spacing:.06em;text-transform:uppercase;border:0;box-shadow:0 1vh 3vh #0008}
#tilt.on{display:block}
.cols{display:grid;grid-template-columns:52% 1fr;gap:calc(3*var(--u))}
.sheet h3{margin:0 0 calc(.6*var(--u));font:400 calc(4.4*var(--u)) "Bolster Hand",cursive;color:#8b1a1a}
.it{display:grid;grid-template-columns:calc(6*var(--u)) 1fr;column-gap:calc(1.2*var(--u));align-items:center;padding:calc(.3*var(--u)) 0;border-bottom:calc(.3*var(--u)) dashed #24170a33}
.it .ic{grid-row:span 2;width:calc(6*var(--u));height:calc(6*var(--u))}.it .ic svg{width:100%;height:100%;filter:url(#dhHand) drop-shadow(0 calc(.3*var(--u)) 0 #24170a44)}
.it b{font:700 calc(3*var(--u)) "Bolster Condensed",Oswald,sans-serif;line-height:1}.it small{font-size:calc(2.3*var(--u));line-height:1.05;opacity:.8}
.sp{display:inline-flex;gap:calc(.5*var(--u))}.sp i{width:calc(3.4*var(--u));height:calc(1.4*var(--u));border-radius:99px;background:#fff;box-shadow:0 0 0 1px #0003}.sp .t2{background:#ffc93a}.sp .t3{background:#4dffc3}
.set{margin-top:calc(1*var(--u));display:flex;flex-direction:column;gap:calc(.9*var(--u));font:700 calc(3*var(--u)) "Bolster Condensed",Oswald,sans-serif;text-transform:uppercase}
.opt{display:flex;align-items:center;gap:calc(1.2*var(--u))}.opt>span:first-child{min-width:calc(12*var(--u))}.opt.off{opacity:.4}
.set .tg{display:flex;border-radius:99px;overflow:hidden;border:2px solid #24170a66}
.set .tg b{padding:calc(.7*var(--u)) calc(1.5*var(--u));font-weight:700}.set .tg b.on{background:#1f2c78;color:#fff}
.set .btn{padding:calc(.7*var(--u)) calc(1.5*var(--u));border-radius:99px;background:#c4520f;color:#fff}
#sel .trk{padding:1vh 1.6vh;border-radius:99px;background:#ffffff22;font-size:.62em;max-width:24vh;text-align:center;line-height:1.05}
.sheet .mv small{white-space:normal;line-height:1.05}
#hud{position:fixed;right:3vh;top:2.5vh;z-index:5;pointer-events:none;display:none;align-items:center;gap:1.4vh;padding:.6vh 1.8vh;border-radius:99px;background:#000a;color:#fff;font:700 max(13px,3.4vh) "Bolster Condensed",Oswald,sans-serif;letter-spacing:.06em;text-transform:uppercase}
#hud.on{display:flex}#hud .pl{font-family:"Bolster Display",sans-serif;font-size:1.3em}
`;

/* ── the app ────────────────────────────────────────────────────────── */
export function runPad(params) {
  const code = (params.get('pad') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const art = params.get('art') || 'controller/backgrounds/';
  const LS = (() => { try { const s = window.localStorage; s.getItem('x'); return s; } catch { return null; } })();
  let uid = '';
  try { uid = LS?.getItem('downhill.padId') || ''; } catch { /* */ }
  if (!uid) { uid = Math.random().toString(36).slice(2, 10); try { LS?.setItem('downhill.padId', uid); } catch { /* */ } }
  if (params.get('uid')) uid = params.get('uid');
  const SET = { auto: false };
  try { SET.auto = JSON.parse(LS?.getItem('downhill.padSet') || '{}').auto === true; } catch { /* */ }
  const saveSet = () => { try { LS?.setItem('downhill.padSet', JSON.stringify(SET)); } catch { /* */ } };

  document.title = 'Fluffed and Furious · Phone Pad';
  let vp = document.querySelector('meta[name=viewport]');
  if (!vp) { vp = document.createElement('meta'); vp.name = 'viewport'; document.head.appendChild(vp); }
  vp.content = 'width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover';
  // the game's stylesheets go (their class names would leak onto the pad); their @font-face rules stay
  const faces = [];
  for (const el of [...document.querySelectorAll('style')]) { faces.push(...(el.textContent.match(/@font-face\s*\{[^}]*\}/g) || [])); el.remove(); }
  const st = document.createElement('style'); st.textContent = faces.join('\n') + CSS; document.head.appendChild(st);
  document.body.className = 'pad';
  document.body.innerHTML = `<svg id="s" viewBox="0 0 2400 1100"></svg><div id="hf"></div><div id="st"></div><div id="hud"><span class="pl"></span><span class="lp"></span></div>
<div id="sel"><button class="arw" data-dx="-1">◀</button><div class="nm"><small>Pick</small><span></span></div><button class="arw" data-dx="1">▶</button><div class="tg"><b class="og" data-alt="0">OG</b><b class="alt" data-alt="1">ALT</b></div><b class="trk" data-trk="1"></b><b class="lk">Lock</b></div>
<button id="tilt">Enable tilt drift</button>
<div class="sheet" id="sh"></div><div id="ko"><div class="card"></div></div>
<div id="rot"><svg viewBox="0 0 96 96" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"><rect x="28" y="10" width="40" height="76" rx="8"/><circle cx="48" cy="76" r="3" fill="#fff"/></svg>Rotate your phone<small style="font-size:14px;opacity:.6;letter-spacing:.1em">the pad plays sideways</small></div>`;
  for (const ev of ['contextmenu', 'selectstart', 'dragstart', 'gesturestart', 'dblclick']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  document.addEventListener('touchstart', (e) => { if (e.cancelable && (e.touches.length > 1 || !e.target.closest?.('#sh'))) e.preventDefault(); }, { passive: false });

  const svg = document.getElementById('s');
  const fit = () => svg.setAttribute('preserveAspectRatio', innerWidth / innerHeight >= 1956 / 1100 ? 'xMidYMid slice' : 'xMidYMid meet');
  fit(); addEventListener('resize', fit);

  /* state */
  const S = { skin: '', seat: -1, link: null, connecting: false, rtt: 0, lastPing: 0, view: null, sheetOpen: false };
  const btnDown = { 0: 0, 3: 0 };
  let superDown = 0, startDown = 0;
  let stickBits = 0, stickX = 0;
  const counts = new Array(TAPS.length).fill(0);
  let seq = 0, lastMask = 0;
  let ball = null, ledEl = null;
  const drift = { centre: null, pitch: 0, held: false, last: 0 };
  const steerNow = () => stickX;
  const mask = () => {
    let m = stickBits;
    for (const { k, bit } of BUTTONS) if (btnDown[k]) m |= bit;
    if (drift.held && S.view?.scr === 'race' && !S.sheetOpen) m |= DRIFT;
    if (SET.auto && !btnDown[3] && S.view?.scr === 'race') m |= GAS;
    if (superDown) m |= SUPER;
    if (startDown) m |= START;
    return m;
  };
  const send = () => {
    const m = mask();
    const pressed = m & ~lastMask;
    if (pressed) TAPS.forEach((b, i) => { if (pressed & b) counts[i] = (counts[i] + 1) & 15; });
    lastMask = m;
    seq = (seq + 1) & 255;
    S.link?.send('pi', encodeInput(seq, m, counts, steerNow()));
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
    paintAuto();
  }

  const tiltBtn = document.getElementById('tilt');
  const orientation = window.DeviceOrientationEvent;
  let asking = false, listening = false;
  function resetDrift() {
    const wasHeld = drift.held;
    Object.assign(drift, { centre: null, pitch: 0, held: false, last: 0 });
    if (wasHeld) send();
  }
  function onTilt(e) {
    if (document.hidden || S.sheetOpen) return;
    const pitch = driftPitch(e.beta, e.gamma);
    if (pitch === null) return;
    drift.last = performance.now();
    if (drift.centre === null) drift.centre = pitch;
    drift.pitch += (drift.centre - pitch - drift.pitch) * 0.35;
    if (S.view?.scr !== 'race') return;
    const held = motionDrift(drift.pitch, drift.held);
    if (held !== drift.held) { drift.held = held; send(); }
  }
  function listen() {
    if (listening) return;
    listening = true;
    addEventListener('deviceorientation', onTilt);
    setInterval(() => {
      if (drift.last && performance.now() - drift.last > 750) resetDrift();
    }, 250);
  }
  async function ask(e) {
    e.preventDefault(); e.stopPropagation();
    if (asking || listening) return;
    asking = true;
    try {
      if (await orientation.requestPermission() === 'granted') {
        tiltBtn.classList.remove('on');
        listen();
        status('Hold the phone in your normal driving position', 2200);
      } else status('Tilt drift needs motion permission', 2600);
    } catch { status('Motion permission is unavailable', 2600); }
    finally { asking = false; }
  }
  if (window.isSecureContext && orientation) {
    if (typeof orientation.requestPermission === 'function') tiltBtn.classList.add('on');
    else listen();
  }
  tiltBtn.addEventListener('touchend', ask, { passive: false });
  tiltBtn.addEventListener('click', ask);
  tiltBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  screen.orientation?.addEventListener('change', resetDrift);
  addEventListener('orientationchange', resetDrift);

  function paintAuto() {
    const g = svg.querySelector('.b[data-k="0"] text');
    if (g) g.textContent = SET.auto ? 'AUTO-GAS' : 'ACCELERATE';
    svg.querySelector('.b[data-k="0"]')?.classList.toggle('dn', SET.auto && S.view?.scr === 'race' && !btnDown[3] || btnDown[0] > 0);
  }

  /* ── input: every pointer on its own ─────────────────────────────── */
  const ptrs = new Map();
  const toSvg = (e) => { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const m = svg.getScreenCTM(); return m ? p.matrixTransform(m.inverse()) : { x: 0, y: 0 }; };
  const els = () => ({ sup: svg.querySelector('#superBtn'), start: svg.querySelector('#startBtn'), moves: svg.querySelector('#movesBtn') });
  function hit(p) {
    let best = -1, bd = Infinity;
    for (const { k, x, y, radius } of BUTTONS) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < radius + 25 && d < bd) { bd = d; best = k; }
    }
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
    if (h.t === 'btn') {
      const el = svg.querySelector(`.b[data-k="${h.k}"]`);
      btnDown[h.k] = Math.max(0, btnDown[h.k] + (on ? 1 : -1));
      el?.classList.toggle('dn', btnDown[h.k] > 0);
      if (on && el) { snd(+el.dataset.snd); flash(el); }
      paintAuto();
    }
    if (h.t === 'super') { superDown = Math.max(0, superDown + (on ? 1 : -1)); E.sup?.classList.toggle('dn', superDown > 0); if (on) snd(440); }
    if (h.t === 'start') { startDown = Math.max(0, startDown + (on ? 1 : -1)); E.start?.classList.toggle('dn', startDown > 0); if (on) snd(700); }
    if (h.t === 'moves') { E.moves?.classList.toggle('dn', on); if (on) { snd(520); openSheet(true); } }
    if (on) buzz(10);
    send();
  }
  const flash = (el) => { el.classList.add('fl'); setTimeout(() => el.classList.remove('fl'), 70); };

  /* the stick: an analogue steer (its X) and 4-way bits for the menus */
  function setStick(dx, dy) {
    const d = Math.hypot(dx, dy);
    let bits = 0;
    if (d >= DEAD) {
      if (Math.abs(dx) >= Math.abs(dy) * 0.8) bits |= dx < 0 ? LEFT : RIGHT;
      if (Math.abs(dy) >= Math.abs(dx) * 0.8) bits |= dy < 0 ? UP : DOWN;
    }
    const ax = Math.abs(dx) < STEER_DEAD ? 0 : Math.sign(dx) * Math.min(1, (Math.abs(dx) - STEER_DEAD) / (STICK_MAX - STEER_DEAD));
    if (bits !== stickBits || Math.abs(ax - stickX) > 0.02) { stickBits = bits; stickX = ax; send(); }
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
      setStick(dx, dy);
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
    if (q.t === 'stick') { setStick(0, 0); ball?.setAttribute('transform', ''); return; }
    press(q, false);
  };
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) svg.addEventListener(t, up);
  addEventListener('blur', () => { resetDrift(); for (const id of [...ptrs.keys()]) up({ pointerId: id }); });

  /* swipe up from the bottom edge: the sheet */
  let sw = null;
  addEventListener('pointerdown', (e) => { if (e.clientY > innerHeight * 0.8 && e.clientX > innerWidth * 0.6) sw = { y: e.clientY, id: e.pointerId }; }, true);
  addEventListener('pointermove', (e) => { if (sw && e.pointerId === sw.id && sw.y - e.clientY > innerHeight * 0.12) { sw = null; openSheet(true); } }, true);
  addEventListener('pointerup', () => { sw = null; }, true);

  /* ── the "how to race" sheet ─────────────────────────────────────── */
  const sheetEl = document.getElementById('sh');
  function sheet() {
    sheetEl.innerHTML = sheetHTML(SET);
    sheetEl.querySelector('.x').addEventListener('pointerdown', (e) => { e.stopPropagation(); openSheet(false); });
    sheetEl.querySelectorAll('[data-auto],[data-recentre]').forEach((el) => el.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); snd(800); buzz(10);
      const d = el.dataset;
      if (d.auto) { SET.auto = d.auto === '1'; saveSet(); paintAuto(); sheet(); send(); }
      else if (d.recentre) { resetDrift(); status('Hold the phone normally and close How To', 2200); }
    }));
  }
  function openSheet(on) {
    if (S.sheetOpen === on) return;
    S.sheetOpen = on;
    if (on) { resetDrift(); for (const id of [...ptrs.keys()]) up({ pointerId: id }); }
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

  /* ── the select strip: fighter, OG / ALT, steering, (P1: the track), lock ── */
  const selEl = document.getElementById('sel');
  selEl.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    const t = e.target.closest('[data-dx],[data-alt],[data-trk],.lk');
    if (!t) return;
    snd(800); buzz(10);
    if (!S.link) return;
    if (t.dataset.dx) S.link.send('pc', { t: 'sel', dx: +t.dataset.dx });
    else if (t.dataset.alt) S.link.send('pc', { t: 'sel', alt: t.dataset.alt === '1' });
    else if (t.dataset.trk) S.link.send('pc', { t: 'sel', trk: 1 });
    else S.link.send('pc', { t: 'sel', lock: true });
  });
  function paintSel() {
    const v = S.view;
    const setup = v?.scr === 'setup' && !!v.trk;
    const on = setup || (v?.scr === 'select' && v.pick);
    selEl.classList.toggle('on', !!on);
    selEl.classList.toggle('setup', !!setup);
    if (!on) return;
    selEl.querySelector('.nm span').textContent = v.name;
    selEl.querySelector('.nm small').textContent = v.who || 'Pick';
    const a = v.alt;
    selEl.querySelector('.og').classList.toggle('on', !a);
    selEl.querySelector('.alt').classList.toggle('on', !!a);
    const trk = selEl.querySelector('.trk');
    trk.style.display = v.trk ? '' : 'none';
    trk.textContent = v.trk ? `${v.trk} ▸` : '';
    selEl.classList.toggle('locked', !setup && !!v.locked);
    selEl.querySelector('.lk').textContent = setup ? 'Start race' : v.locked ? 'Locked' : 'Lock';
  }
  const hudEl = document.getElementById('hud');
  function paintHud() {
    const v = S.view, on = !!v && v.scr === 'race' && v.place;
    hudEl.classList.toggle('on', !!on);
    if (!on) return;
    hudEl.querySelector('.pl').textContent = `${v.place}${['th', 'st', 'nd', 'rd'][v.place] || 'th'}`;
    hudEl.querySelector('.lp').textContent = `${v.who || ''} · lap ${v.lap}`;
  }

  /* ── status, LED, hits, the results card ─────────────────────────── */
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
  let lastBuzz = null;
  function hitFx(kind) {
    // hit by an item: a buzz you can feel (the alarm clock: a long ring)
    const big = kind === 'alarm' || kind === 'missile';
    const pat = kind === 'alarm' ? [90, 50, 90, 50, 260] : big ? [140, 50, 90] : kind === 'bump' ? 18 : 70;
    lastBuzz = { kind, pat, at: performance.now() };
    const ok = buzz(pat);
    if (!ok || big) { hf.classList.add('on'); setTimeout(() => hf.classList.remove('on'), big ? 160 : 90); }
    if (!ok) { svg.classList.remove('shk'); void svg.getBoundingClientRect(); svg.classList.add('shk'); }
  }
  const koEl = document.getElementById('ko');
  let koT = 0;
  function card(line, who) {
    koEl.querySelector('.card').innerHTML = `${line.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}<small>— ${who}</small>`;
    koEl.classList.add('on');
    clearTimeout(koT); koT = setTimeout(() => koEl.classList.remove('on'), 6200);
  }

  /* ── messages from the game ──────────────────────────────────────── */
  function onCtl(m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'seat') { S.seat = m.k; status(m.who ? `You’re ${m.who}` : 'Paired!', 2200); S.link?.send('pc', { t: 'mode', mode: 'stick' }); }
    else if (m.t === 'st') {
      const prev = S.view;
      S.view = m;
      if (m.skin && SK[m.skin]) draw(m.skin);
      if (prev?.scr === 'results' && m.scr !== 'results') koEl.classList.remove('on');
      if (prev?.scr !== m.scr) { resetDrift(); paintAuto(); }
      paintSel(); paintHud();
    } else if (m.t === 'bz') hitFx(m.kind);
    else if (m.t === 'ko') card(m.line, m.who);
    else if (m.t === 'full') status('All four pads are taken', 0);
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
        link.onclose = () => { if (S.link === link) { resetDrift(); S.link = null; paintLed(); schedule(800); } };
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
    else { resetDrift(); for (const id of [...ptrs.keys()]) up({ pointerId: id }); }
  });

  /* ── keep the screen on ──────────────────────────────────────────── */
  let lock = null, full = false;
  async function wake(force, gesture) {
    if (gesture && !full && !document.fullscreenElement && document.documentElement.requestFullscreen && !params.has('nofs')) { full = true; try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); await screen.orientation?.lock?.('landscape'); } catch { /* not allowed here: fine */ } }
    if (lock && !force) return;
    try { if (navigator.wakeLock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener?.('release', () => { lock = null; }); } } catch { lock = null; }
  }

  draw(params.get('skin') && SK[params.get('skin')] ? params.get('skin') : 'kevalanche');
  sheet();
  wake();
  // ?pad=DEMO: the panel alone, no game (for looking at the skins)
  if (code !== 'DEMO') connect();
  window.__pad = { S, SET, drift, mask, steer: steerNow, openSheet, get sheetOpen() { return S.sheetOpen; }, hit, toSvg, card, hitFx, skinId, get lastBuzz() { return lastBuzz; } };
}
