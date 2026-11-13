/* The music, composed here as data (original tunes; no samples, no files):
   a bright pulse lead, a triangle bass, noise drums, a little swing.
   Each piece compiles to a flat list of notes on a 16th-note grid:
   { s: step, i: instrument, n: MIDI note, d: length in steps, v: velocity,
     b: 1 = only in the boost layer (the fight's last 15 s / low stuffing),
     slide: semitones glided over the note, vib: vibrato depth (semitones) }.
   Pure: the tests check every bar adds up and every piece's length.       */

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function midi(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  return 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

/* 'A4:2 C5 r:4 …' → [{ s, n, d }] (default length: an 8th, 2 steps; r a rest) */
export function mel(str, from = 0) {
  const out = [];
  let s = from;
  for (const tok of str.trim().split(/\s+/)) {
    const [name, len] = tok.split(':');
    const d = len ? +len : 2;
    if (name !== 'r') out.push({ s, n: midi(name), d });
    s += d;
  }
  out.end = s;
  return out;
}

const QUAL = { maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], 7: [0, 4, 7, 10], m: [0, 3, 7], '': [0, 4, 7], sus: [0, 5, 7] };
export function chord(name) {
  const m = /^([A-G][#b]?)(maj7|m7|7|m|sus)?$/.exec(name);
  if (!m) throw new Error(`bad chord ${name}`);
  const root = midi(`${m[1]}2`);
  return { root: root < 40 ? root + 12 : root, tones: QUAL[m[2] || ''] };
}

/* a bar's drum lane: 16 chars, x = hit, X = accent, . = rest */
const lane = (str, s0, i, v, out, vx = 1) => { [...str].forEach((c, k) => { if (c === 'x' || c === 'X') out.push({ s: s0 + k, i, n: 0, d: 1, v: c === 'X' ? Math.min(1, v * 1.35 * vx) : v * vx }); }); };

/* ── bass styles, per bar: (chord, next chord) → notes ──────────────────── */
const BASS = {
  // laid back: a dotted root, a hop up the octave, the fifth, a chromatic walk into the next bar
  groove: (c, nx) => [[0, 0, 3], [3, 12, 1], [6, 7, 2], [8, 0, 2], [10, 12, 2], [14, (nx.root - 1) - c.root, 2]],
  drive: () => [[0, 0, 2], [2, 12, 2], [4, 0, 2], [6, 12, 2], [8, 0, 2], [10, 12, 2], [12, 7, 2], [14, 12, 2]],
  bounce: (c, nx) => [[0, 0, 3], [3, 0, 1], [4, 12, 2], [6, 0, 2], [8, 7, 2], [10, 0, 2], [12, 12, 2], [14, (nx.root + 2) - c.root, 2]],
  pump: () => [0, 2, 4, 6, 8, 10, 12, 14].map((s, k) => [s, k % 4 === 3 ? 12 : 0, 1]),
};

function build({ bpm, swing = 0.5, bars, chords, lead, lead2, bass, comp, arp, drums, extra = [] }) {
  const N = [];
  const steps = bars * 16;
  const ch = chords.map(chord);
  lead.forEach((x) => N.push({ ...x, i: 'lead', v: x.v ?? 0.9 }));
  (lead2 || []).forEach((x) => N.push({ ...x, i: 'lead2', v: x.v ?? 0.5 }));
  ch.forEach((c, b) => {
    const nx = ch[(b + 1) % ch.length], s0 = b * 16;
    const st = typeof bass === 'function' ? bass(b) : bass;
    if (st) for (const [s, o, d] of BASS[st](c, nx)) N.push({ s: s0 + s, i: 'bass', n: c.root + o, d, v: s === 0 ? 0.95 : 0.8 });
    const cp = typeof comp === 'function' ? comp(b) : comp;
    if (cp) for (const s of cp) for (const t of c.tones.slice(1, 3)) N.push({ s: s0 + s, i: 'comp', n: c.root + 12 + t, d: 1, v: 0.32 });
    const ap = typeof arp === 'function' ? arp(b) : arp;
    if (ap) {
      const tones = [...c.tones.slice(0, 3), 12];
      for (let s = 0; s < 16; s++) N.push({ s: s0 + s, i: 'arp', n: c.root + 24 + tones[s % tones.length], d: 1, v: s % 4 === 0 ? 0.32 : 0.22, b: ap === 'boost' ? 1 : 0 });
    }
    drums(b, s0, N);
  });
  for (const x of extra) N.push(x);
  N.sort((a, b) => a.s - b.s);
  return { bpm, swing, steps, notes: N };
}

const repeat = (arr, n) => Array.from({ length: n }, () => arr).flat();
const join = (...parts) => { const out = []; let s = 0; for (const p of parts) { for (const x of p) out.push({ ...x, s: x.s + s }); s += p.end; } out.end = s; return out; };
const echo = (L, delay, v, oct = 0) => L.map((x) => ({ ...x, s: x.s + delay, n: x.n + oct, v }));

/* ── Menu / select: 110 BPM, F major, swung, 16 bars (≈ 35 s) ──────────── */
const MENU_LEAD = mel(`
  r:4 A4 C5 F5:3 E5:1 C5:4
  r:2 E5 D5 C5 A4:6 r:2
  r:4 D5 F5 A5:3 G5:1 F5 D5
  E5:3 F5:1 G5:4 r:2 Bb4 C5:4
  r:4 A4 C5 F5:3 E5:1 C5 A5
  G5:3 E5:1 C5 E5 D5:6 r:2
  r:2 D5 F5 Bb5 A5 G5 F5 D5
  C5:6 Bb4 G4:4 r:4
  r:2 F5 A5 C6:4 A5 G5 F5
  G5:3 F5:1 D5:4 Bb4 C5 D5:4
  r:2 D5:1 F5:1 A5:4 G5 F5 D5 C5
  E5:4 G5:4 Bb5:4 r:4
  A5:3 G5:1 F5 C5 r:2 F5 A5 C6
  E5:4 r:2 E5 G5 E5 C5:4
  D5 F5 A5 G5 F5:3 D5:1 Bb4:4
  C5:4 E5 G5 Bb5 G5 r:4`);

export const MENU = build({
  bpm: 110, swing: 0.6, bars: 16,
  chords: ['Fmaj7', 'Am7', 'Bbmaj7', 'C7', 'Fmaj7', 'Am7', 'Bbmaj7', 'C7', 'Dm7', 'Gm7', 'Bbmaj7', 'C7', 'Fmaj7', 'Am7', 'Bbmaj7', 'C7'],
  lead: MENU_LEAD.map((x) => ({ ...x, v: 0.72 })),
  // the chiptune echo: the lead again, three 16ths late, soft
  lead2: echo(MENU_LEAD, 3, 0.22),
  bass: 'groove',
  comp: (b) => (b % 4 === 3 ? [2, 7, 10] : [2, 10]),
  drums: (b, s0, N) => {
    lane('x......x..x.....', s0, 'kick', 0.8, N);
    lane('....x.......x...', s0, 'snare', 0.42, N);
    lane('x.x.x.x.x.x.x.x.', s0, 'hat', 0.2, N);
    if (b % 2) lane('..............x.', s0, 'ohat', 0.22, N);
    if (b % 8 === 7) lane('.............xxx', s0, 'snare', 0.22, N);
  },
});

/* ── The fight: 150 BPM, A minor, a little swing, 40 bars (64 s):
       A (16) · B (16) · a breakdown (8), then round again ───────────────── */
const A1 = `
  A4 C5 E5 A5 G5:1 A5:1 G5 E5:4
  F5 E5 C5 A4 C5:3 D5:1 C5:4
  E5 G5 C6 B5:1 C6:1 G5:4 E5 G5
  D5:3 E5:1 D5 B4 G4:4 r:2 B4:1 C5:1`;
const A1b = `
  A4 C5 E5 A5 B5:1 C6:1 B5 A5 E5
  F5 A5 C6:3 A5:1 F5 E5 F5 A5
  G5:3 E5:1 C5 E5 G5 C6 E6:4
  D6 B5 G5 D5 G5 r:2 E5:1 F#5:1 G#5`;
const A2 = `
  A4 C5 E5 A5 G5:1 A5:1 G5 E5:4
  F5 E5 C5 A4 C5:3 D5:1 C5:4
  E5 G5 C6 B5:1 C6:1 G5:4 E5 G5
  D5 B4 D5 G5 F5 E5 D5 B4`;
const A2b = `
  C5:4 E5:4 A5:6 G5:1 F5:1
  E5 F5 A5:4 C6 A5 F5:4
  G5 E5 C5 E5 D5 C5 B4 G4
  B4:4 D5:4 G5:6 r:2`;
const B1 = `
  r:2 C6 A5 F5 r:2 C6 A5 C6
  D6:3 B5:1 G5 D5 G5 B5 D6:4
  r:2 B5 G5 E5 r:2 B5 G5 B5
  C6:3 B5:1 A5 E5 A5:8
  F5 A5 C6 A5 F5 A5 C6 F6
  E6:3 D6:1 B5 G5 D6:3 B5:1 G5:4
  G#5 B5 E6:4 D6 B5 G#5:4
  E5 r:2 E5 F5 G#5 B5 D6:4`;
const B2 = `
  r:2 C6 A5 F5 r:2 C6 A5 C6
  D6:3 B5:1 G5 D5 G5 B5 D6:4
  r:2 B5 G5 E5 r:2 B5 G5 B5
  C6:3 B5:1 A5 E5 A5:8
  r:2 D6 A5 F5 D5 F5 A5 D6
  B5:3 C6:1 D6 B5 G5:4 F5 D5
  E5 G5 C6:4 B5 C6 E6:4
  D6 B5 G#5 E5 G#5 B5 E6:4`;
const C1 = `
  F5:6 E5 D5:4 A4:4
  G#4:6 B4 E5:8
  A5 E5 C5 A4 C5 E5 A5:4
  G5 E5 C5 E5 A5:8
  F5 A5 D6:4 C6 A5 F5:4
  E5 G#5 B5:4 D6:4 B5:4
  C6:3 B5:1 A5:4 E5:4 C5:4
  B4 D5 E5 G#5 B5 D6 E6:4`;

const FIGHT_LEAD = join(mel(A1), mel(A1b), mel(A2), mel(A2b), mel(B1), mel(B2), mel(C1));
const FIGHT_CHORDS = [
  ...repeat(['Am', 'F', 'C', 'G'], 4),
  'F', 'G', 'Em', 'Am', 'F', 'G', 'E', 'E',
  'F', 'G', 'Em', 'Am', 'Dm', 'G', 'C', 'E',
  'Dm', 'E', 'Am', 'Am', 'Dm', 'E', 'Am', 'E7',
];
const sec = (b) => (b < 16 ? 'A' : b < 32 ? 'B' : 'C');

export const FIGHT = build({
  bpm: 150, swing: 0.54, bars: 40,
  chords: FIGHT_CHORDS,
  lead: FIGHT_LEAD.map((x) => ({ ...x, v: 0.78 })),
  // the second pulse: an octave under the lead through B (fuller), an
  // octave over it in the boost layer
  lead2: [
    ...FIGHT_LEAD.filter((x) => x.s >= 16 * 16 && x.s < 32 * 16).map((x) => ({ ...x, n: x.n - 12, v: 0.3 })),
    ...FIGHT_LEAD.map((x) => ({ ...x, n: x.n + 12 > 93 ? x.n : x.n + 12, v: 0.16, b: 1 })),
  ],
  bass: (b) => (sec(b) === 'A' ? 'drive' : sec(b) === 'B' ? 'bounce' : 'pump'),
  arp: (b) => (sec(b) === 'C' || (b >= 8 && b < 16) || b >= 24 ? 1 : 'boost'),
  drums: (b, s0, N) => {
    const S = sec(b), fill = b % 8 === 7;
    if (b % 8 === 0) N.push({ s: s0, i: 'crash', n: 0, d: 1, v: 0.5 });
    if (S === 'A') {
      lane('x.....x.x.......', s0, 'kick', 0.9, N);
      lane(fill ? '....x.......xxxx' : '....X.......X...', s0, 'snare', 0.55, N);
      lane('x.x.x.x.x.x.x.x.', s0, 'hat', 0.26, N);
    } else if (S === 'B') {
      lane('x..x..x...x.....', s0, 'kick', 0.9, N);
      lane(fill ? '....x.......xxxx' : '....X.......X..x', s0, 'snare', 0.55, N);
      lane('X.x.X.x.X.x.X.x.', s0, 'hat', 0.24, N);
      lane('.x.x.x.x.x.x.x.x', s0, 'hat', 0.12, N);
    } else {
      lane('x...x...x...x...', s0, 'kick', 0.95, N);
      lane(fill ? '........x.x.xxxx' : '............X...', s0, 'snare', 0.55, N);
      lane('..x...x...x...x.', s0, 'ohat', 0.24, N);
    }
    // the boost layer: 16th hats all through
    for (let s = 1; s < 16; s += 2) N.push({ s: s0 + s, i: 'hat', n: 0, d: 1, v: 0.14, b: 1 });
  },
});

/* ── Stings ──────────────────────────────────────────────────────────── */
const notes = (i, list, v = 0.8) => list.map(([s, n, d, o = {}]) => ({ s, i, n: typeof n === 'string' ? midi(n) : n, d, v: o.v ?? v, ...o }));
const hits = (i, steps, v) => steps.map((s) => ({ s, i, n: 0, d: 1, v: Array.isArray(v) ? v[steps.indexOf(s)] : v }));
const sting = (bpm, steps, parts, swing = 0.5) => ({ bpm, swing, steps, notes: parts.flat().sort((a, b) => a.s - b.s) });

/* VS card (~2 s): stabs, a snare roll and a run up into a held chord */
export const VS = sting(150, 24, [
  ...['A3', 'E4', 'A4'].map((n) => notes('comp', [[0, n, 2], [3, n, 1], [6, n, 2]], 0.45)),
  notes('bass', [[0, 'A2', 2], [3, 'A2', 1], [6, 'A2', 2], [16, 'A2', 8]], 0.95),
  notes('lead', [[8, 'A4', 1], [9, 'C5', 1], [10, 'E5', 1], [11, 'G5', 1], [12, 'A5', 1], [13, 'C6', 1], [14, 'D6', 1], [15, 'D#6', 1], [16, 'E6', 8, { vib: 0.25 }]], 0.8),
  notes('lead2', [[16, 'A5', 8]], 0.4),
  hits('kick', [0, 3, 6, 16], 0.95),
  hits('snare', [8, 9, 10, 11, 12, 13, 14, 15], [0.2, 0.25, 0.3, 0.35, 0.42, 0.5, 0.58, 0.66]),
  hits('crash', [16], 0.6),
]);

/* round start (~1 s): ding, ding, DING */
export const ROUND = sting(150, 10, [
  notes('lead', [[0, 'A5', 1], [2, 'A5', 1], [4, 'E6', 5, { vib: 0.2 }]], 0.75),
  notes('lead2', [[4, 'A5', 5]], 0.35),
  notes('bass', [[4, 'A2', 4]], 0.9),
  hits('snare', [0, 2], 0.4),
  hits('kick', [4], 0.9),
  hits('crash', [4], 0.5),
]);

/* win (~4 s): a fanfare, C major, I–vi–IV–V–I */
export const WIN = sting(140, 36, [
  notes('lead', [[0, 'C5', 1], [1, 'E5', 1], [2, 'G5', 1], [3, 'C6', 3], [6, 'G5', 1], [7, 'C6', 1], [8, 'E6', 4],
    [12, 'D6', 2], [14, 'E6', 2], [16, 'F6', 2], [18, 'D6', 2], [20, 'B5', 1], [21, 'C6', 1], [22, 'D6', 2], [24, 'C6', 12, { vib: 0.18 }]], 0.82),
  notes('lead2', [[3, 'G5', 3], [8, 'C6', 4], [12, 'A5', 4], [16, 'A5', 4], [20, 'G5', 4], [24, 'E6', 12]], 0.38),
  notes('bass', [[0, 'C3', 3], [3, 'C3', 3], [6, 'G2', 2], [8, 'A2', 4], [12, 'A2', 4], [16, 'F2', 4], [20, 'G2', 2], [22, 'B2', 2], [24, 'C3', 10]], 0.95),
  notes('comp', [[24, 'G4', 10], [24, 'E4', 10]], 0.3),
  hits('kick', [0, 3, 6, 8, 12, 16, 20, 24], 0.9),
  hits('snare', [4, 10, 14, 18, 20, 21, 22, 23], [0.45, 0.45, 0.45, 0.45, 0.3, 0.38, 0.46, 0.55]),
  hits('crash', [0, 24], 0.55),
]);

/* lose (~4 s): a sad trombone sliding down, wah, wah, wah, waaah … and the
   stuffing goes out of it (a deflating bloop) */
export const LOSE = sting(90, 25, [
  notes('horn', [[0, 'G4', 3, { slide: -0.4 }], [3, 'F#4', 3, { slide: -0.4 }], [6, 'F4', 3, { slide: -0.4 }], [9, 'E4', 9, { vib: 0.45, slide: -0.6 }]], 0.8),
  notes('bass', [[0, 'G2', 3], [3, 'F#2', 3], [6, 'F2', 3], [9, 'E2', 8]], 0.7),
  [{ s: 19, i: 'bloop', n: midi('C5'), d: 5, v: 0.75, slide: -36 }],
  hits('snare', [0], 0.25),
]);

export const SONGS = { menu: MENU, fight: FIGHT, vs: VS, round: ROUND, win: WIN, lose: LOSE };

/* seconds per step at tempo × k */
export const stepDur = (song, k = 1) => 60 / (song.bpm * k) / 4;
export const songSeconds = (song, k = 1) => song.steps * stepDur(song, k);
