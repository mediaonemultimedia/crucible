/* The phone pad's layout and per-skin colours, ported exactly from the
   Kevin-approved reference (docs/friday-nov20/skin-template.html): the
   canvas is 2400×1100, full bleed; x 222–2178 always shows. L: stick
   [cx, cy, R], buttons [cx, cy] (BOP WALLOP GRAB / BLOCK JUMP TAUNT),
   SUPER [cx, cy, w, h], START, MOVES, LED, the safe zone, the plate.
   SK: caps[6], ring, ball, sup(er), st (SUPER text), lab(el), slab (the
   START label, else lab), mv / mt (MOVES), led.                         */

export const L = {stick:[604,517,185],btn:[[1550,425],[1762,361],[1979,348],[1550,692],[1764,637],[1979,626]],
 lbl:['BOP','WALLOP','GRAB','BLOCK','JUMP','TAUNT'],super:[1097,550,262,112],start:[1132,215,176,62],moves:[2062,1012,190,62],led:[2139,92],
 safe:[222,0,1956,1100],plate:[1395,235,745,620]};

export const SK = {
  "kevalanche": {"caps": ["#33a3e6", "#e21b26", "#ececee", "#e21b26", "#33a3e6", "#ececee"], "ring": "#6aa9d4", "ball": "#5fb0e6", "sup": "#e2b52a", "st": "#3a2a05", "lab": "#ffffff", "mv": "#f2d40c", "mt": "#111", "led": "#3fdc7a", "slab": "#13294d"},
  "kevalanche-alt": {"caps": ["#1f2c78", "#f26a1b", "#ececee", "#f26a1b", "#1f2c78", "#ececee"], "ring": "#b5440f", "ball": "#f26a1b", "sup": "#e8641a", "st": "#2a0e02", "lab": "#f2c9a0", "slab": "#f0a088", "mv": "#f2d40c", "mt": "#111", "led": "#ff6a1b"},
  "sebas": {"caps": ["#f08a1a", "#17a6a8", "#efe5cf", "#2ca23a", "#d6242a", "#efe5cf"], "ring": "#c9a04a", "ball": "#e0742c", "sup": "#ffe27a", "st": "#4a3205", "lab": "#f3e3b0", "slab": "#5a1a12", "mv": "#f2a12a", "mt": "#2a1505", "led": "#5cff5c"},
  "sebas-alt": {"caps": ["#4a4c51", "#a3161f", "#ece3cf", "#4a4c51", "#a3161f", "#ece3cf"], "ring": "#6e7075", "ball": "#a3161f", "sup": "#ff8a8a", "st": "#7a0a10", "lab": "#efe2c6", "slab": "#ffffff", "mv": "#f2a12a", "mt": "#2a1505", "led": "#5cff5c"},
  "zach": {"caps": ["#7b2a9e", "#2f5fd0", "#efe5cf", "#4b2a7a", "#1fa79a", "#efe5cf"], "ring": "#e8c21a", "ball": "#7b5bc8", "sup": "#6fd3b0", "st": "#16303a", "lab": "#ffffff", "mv": "#f2dcd6", "mt": "#222", "led": "#3fdc7a"},
  "zach-alt": {"caps": ["#7488a8", "#6f7a96", "#5f8f86", "#5f8f86", "#6f7f9e", "#5f8f86"], "ring": "#e8b22a", "ball": "#1f6b45", "sup": "#3fb35a", "st": "#0a2010", "lab": "#cfe8e0", "mv": "#f05a3a", "mt": "#fff", "led": "#3fdc7a", "slab": "#0e2a2a"},
  "k8-e": {"caps": ["#f08a1a", "#7a3e1c", "#efe5cf", "#f2cf1a", "#d4500f", "#efe5cf"], "ring": "#e8c21a", "ball": "#8a4a24", "sup": "#ffd36a", "st": "#7a1a0a", "lab": "#f3e3b0", "mv": "#f2a12a", "mt": "#2a1505", "led": "#5cff5c"},
  "k8-e-alt": {"caps": ["#ff2fa0", "#d8f21a", "#1fd08a", "#f2d01a", "#ff2fa0", "#efe5cf"], "ring": "#d8e21a", "ball": "#ff3fae", "sup": "#ffd36a", "st": "#a0102a", "lab": "#f3e3b0", "mv": "#f2a12a", "mt": "#2a1505", "led": "#5cff5c"},
  "johnny": {"caps": ["#ecebe4", "#b9bab6", "#ecebe4", "#b9bab6", "#ecebe4", "#b9bab6"], "ring": "#e8d21a", "ball": "#d6e83a", "sup": "#ffe35a", "st": "#4a3a05", "lab": "#f3e3b0", "mv": "#e8e04a", "mt": "#123", "led": "#5cff5c"},
  "johnny-alt": {"caps": ["#b3121f", "#4a4c51", "#ece3cf", "#b3121f", "#4a4c51", "#ece3cf"], "ring": "#55575c", "ball": "#9a1a1a", "sup": "#ff4a4a", "st": "#3a0508", "lab": "#e8e2d6", "slab": "#ffffff", "mv": "#c8202a", "mt": "#fff", "led": "#ff3030"},
  "rubberta": {"caps": ["#22a33a", "#2a6fd6", "#ececee", "#22a33a", "#2a6fd6", "#ececee"], "ring": "#d9c24a", "ball": "#d8cf4a", "sup": "#e2b52a", "st": "#3a2a05", "lab": "#e8e8e8", "mv": "#f2d40c", "mt": "#111", "led": "#3fe0c0"},
  "rubberta-alt": {"caps": ["#28306e", "#6a3aa0", "#ececee", "#2d4f9e", "#6a3aa0", "#ececee"], "ring": "#9ac83a", "ball": "#2f4a3a", "sup": "#f2c12a", "st": "#3a2a05", "lab": "#dfe6f0", "mv": "#d8e08a", "mt": "#123", "led": "#2fe0e0"},
  "sumaura": {"caps": ["#1f2c78", "#d4202a", "#ececee", "#d4202a", "#1f2c78", "#ececee"], "ring": "#c9a04a", "ball": "#1f2c58", "sup": "#f2c12a", "st": "#4a3205", "lab": "#f0d8d0", "mv": "#f2d40c", "mt": "#111", "led": "#5cff5c", "slab": "#ffffff"},
  "sumaura-alt": {"caps": ["#2a2224", "#8a1426", "#d4a84a", "#2a2224", "#8a1426", "#d4a84a"], "ring": "#c9a04a", "ball": "#b3202a", "sup": "#d9b25a", "st": "#3a2405", "lab": "#e8c87a", "slab": "#e8c87a", "mv": "#d9b25a", "mt": "#2a1505", "led": "#ff3030"}};

/* game fighter id (+ ALT) → skin id (Kevin's file names) */
export const skinId = (id, alt) => `${id === 'k8e' ? 'k8-e' : id}${alt ? '-alt' : ''}`;
export const SKIN_IDS = Object.keys(SK);
