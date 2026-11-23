/* The music: original chiptune, composed here as data (no audio files).

   A track is bars of tokens per channel, on a grid (steps per bar, 4/4):
   a note `c5`, `f#4`, `bb3`; `-` holds the note before; `.` rests. Drums:
   `k` kick, `s` snare, `h` closed hat, `o` open hat, `c` crash, `t` / `l`
   high / low tom (`kh` both). Bass lines are written over a chord chart
   with a pattern (`R` root, `O` the root an octave up, `3` `5` `6` `7` the
   chord's third, fifth, sixth and seventh, `A` a step into the next
   chord's root); a chart bar can hold two chords (`'Bb C7'`, half each).
   `compile()` turns a track into one sorted list of note events in beats;
   the engine (audio/engine.js) schedules them on the AudioContext clock.

   Channels: lead (the tune), lead2 (the counter-melody under it), arp
   (quiet shimmer), bass (triangle with a soft pulse body), drums (noise,
   pitch-dropped sines), tbone (the lose jingle), fx (one-off sounds). A
   channel can pick its pulse (`wave`: p50 / p25 / p12) and a low-pass
   (`lp`, Hz). A channel marked `hype` only plays when the race is tense
   (the final lap); the track's `hypeTempo` nudges the tempo then, from the
   next bar line. `loopFrom` (a bar): the loop goes back there, not to the
   intro.                                                                 */

const PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/* 'c#5' → MIDI 73; null for a rest/hold */
export function midi(tok) {
  const m = /^([a-g])(#|b)?(-?\d)$/.exec(tok);
  if (!m) return null;
  return 12 * (+m[3] + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
export const hz = (n) => 440 * 2 ** ((n - 69) / 12);

/* chord symbol → { root pitch class, tones (semitones over the root) } */
export function chord(sym) {
  const m = /^([A-G])(#|b)?(m)?(7)?$/.exec(sym);
  if (!m) throw new Error(`chord ${sym}`);
  const root = (PC[m[1].toLowerCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  const tones = [0, m[3] ? 3 : 4, 7];
  if (m[4]) tones.push(10);
  return { root, tones };
}

/* a bass bar from a pattern over a chord (`next`: the following chord, for A).
   oct 'auto': every root between E2 and D#3 (no mud, no squeak) */
export function bassBar(sym, pattern, next = sym, oct = 2) {
  const c = chord(sym), n = chord(next);
  const at = (pc) => (oct === 'auto' ? 40 + ((pc - 4 + 12) % 12) : 12 * (oct + 1) + pc);
  const R = at(c.root);
  const N = at(n.root);
  // the approach: a semitone under the next root (or over, if that's nearer to where we are)
  const A = N - 1 >= R - 5 ? N - 1 : N + 1;
  const T = { R, O: R + 12, 5: R + 7, 3: R + c.tones[1], 6: R + 9, 7: R + (c.tones[3] ?? 10), A, L: R - 5 };
  return pattern.split(/\s+/).map((t) => (t in T ? T[t] : t));
}

/* a whole bass line over a chart (bars of one chord, or two: 'Bb C7').
   pat(i, split) → the bar's pattern (8 or 16 tokens; a split bar's halves
   take one half each). The last bar leads into the loop's first. */
export function bassLine(chart, pat, loopFrom = 0) {
  return chart.map((sym, i) => {
    const next = chart[i + 1 < chart.length ? i + 1 : loopFrom].split(' ')[0];
    const halves = sym.split(' ');
    const p = pat(i, halves.length > 1).trim().split(/\s+/);
    if (halves.length === 1) return bassBar(sym, p.join(' '), next, 'auto');
    const h = p.length / 2;
    return [...bassBar(halves[0], p.slice(0, h).join(' '), halves[1], 'auto'), ...bassBar(halves[1], p.slice(h).join(' '), next, 'auto')];
  });
}

/* an arpeggio bar over a chord: `shape` indexes the chord tones (0 root …), 8 adds an octave */
export function arpBar(sym, shape, oct = 4) {
  const c = chord(sym), base = 12 * (oct + 1) + c.root;
  return shape.map((i) => (i === '.' ? '.' : base + (i >= 8 ? 12 + c.tones[(i - 8) % c.tones.length] : c.tones[i % c.tones.length] + 12 * Math.floor(i / c.tones.length))));
}
/* …over a chart (two-chord bars split the shape); `on(i)` picks the bars that play */
export function arpLine(chart, shape, oct, on = () => true) {
  return chart.map((sym, i) => {
    if (!on(i)) return ['.'];
    const halves = sym.split(' ');
    if (halves.length === 1) return arpBar(sym, shape, oct);
    const h = shape.length / 2;
    return [...arpBar(halves[0], shape.slice(0, h), oct), ...arpBar(halves[1], shape.slice(h), oct)];
  });
}

const bars = (s) => s.trim().split('|').map((b) => b.trim().split(/\s+/));
/* sections → one list of bars (each section a '|'-separated string) */
const song = (...secs) => secs.flatMap((s) => bars(s));
/* drum bars by role: the groove (alternating), a fill into each new section,
   a crash on its downbeat */
function drumLine(chart, starts, { groove, fill, crash, intro = [] }) {
  return chart.map((_, i) => {
    if (i < intro.length) return intro[i].split(' ');
    if (starts.includes(i + 1) || i === chart.length - 1) return fill.split(' ');
    if (starts.includes(i)) return crash.split(' ');
    return groove[i % groove.length].split(' ');
  });
}

/* ── the tracks ──────────────────────────────────────────────────────── */

/* the fight: D minor, A section (16 bars), B in F major (16), a breakdown (4) */
const FA = ['Dm', 'Bb', 'C', 'Dm', 'Dm', 'Bb', 'C', 'A', 'Dm', 'Bb', 'C', 'Dm', 'Dm', 'Bb', 'C', 'A'];
const FB = ['F', 'C', 'Dm', 'Bb', 'F', 'C', 'Bb', 'C', 'Gm', 'Bb', 'C', 'A', 'F', 'C', 'Bb', 'A'];
const FD = ['Dm', 'Dm', 'Bb', 'A'];
const FIGHT_CHORDS = [...FA, ...FB, ...FD];
const fightBass = FIGHT_CHORDS.map((c, i) => {
  const next = FIGHT_CHORDS[(i + 1) % FIGHT_CHORDS.length];
  if (i >= 32) return bassBar(c, i === 35 ? 'R . R . 5 . A .' : 'R . . . R . . .', next);
  if (i >= 16) return bassBar(c, (i % 4 === 3) ? 'R O R O 5 O R A' : 'R R O R 5 R O 5', next);
  return bassBar(c, (i % 8 === 7) ? 'R O R O 5 5 A A' : 'R O R O R O R O', next);
});
const D_A = 'k . h . s . h k . k h . s . h h';
const D_A2 = 'k . h . s . h k . k h . s . h .';
const D_B = 'k . h h s . h k k . h h s . o .';
const D_FILL = 'k . h . s . s s . s s . s s s s';
const fightDrums = FIGHT_CHORDS.map((_, i) => {
  if (i === 0 || i === 16) return ('kc . h . s . h k . k h . s . h h').split(' ');
  if (i >= 32) return (i === 35 ? 's . s . s . s . s s s s s s s s' : i === 34 ? 'k . . . s . h . k . . . s . h .' : 'k . . . . . h . k . . . . . h .').split(' ');
  if (i % 8 === 7) return D_FILL.split(' ');
  return (i >= 16 ? D_B : i % 2 ? D_A2 : D_A).split(' ');
});
const fight = {
  name: 'fight', bpm: 150, swing: 0.54, loop: true, hypeTempo: 1.07,
  channels: {
    lead: { grid: 8, gain: 0.85, bars: bars(`
      d5 . a4 d5 f5 . e5 d5 | f5 - d5 . bb4 . d5 f5 | g5 . e5 c5 g4 . c5 e5 | d5 - - . . a4 c5 d5 |
      f5 . a5 . g5 f5 e5 d5 | bb4 d5 f5 . d5 . f5 g5 | e5 - c5 . g5 . e5 . | c#5 . e5 . a5 - g5 e5 |
      d5 . a4 d5 f5 . e5 d5 | f5 - d5 . bb4 . d5 f5 | g5 . e5 c5 g4 . c5 e5 | d5 - - . a5 . g5 f5 |
      a5 . f5 d5 a5 . f5 d5 | bb5 . f5 d5 bb5 . a5 g5 | g5 e5 c5 e5 g5 . c6 . | a5 - - . e5 . c#5 e5 |
      . . . . . . . . | . . . . . . . . | . . . . . . . . | . . . . . . . . |
      . . . . . . . . | . . . . . . . . | . . . . . . . . | . . . . . . . . |
      . . . . . . . . | . . . . . . . . | . . . . . . . . | . . . . . . . . |
      . . . . . . . . | . . . . . . . . | . . . . . . . . | . . . . . . . . |
      . | . | . | . . . . a4 c5 d5 e5`) },
    // B: the tune goes up an octave on the thin pulse (and A has a high answer)
    lead2: { grid: 8, gain: 0.8, bars: bars(`
      . | . | . | . . . . . a5 . . | . | . | . | . . . . . . . . |
      . | . | . | . . . . . f5 a5 . | . | . | . | . |
      c6 - a5 . f5 . a5 c6 | d6 c6 . g5 - . e5 g5 | f5 . a5 d6 - . c6 a5 | bb5 - - . a5 . g5 f5 |
      a5 . c6 . f6 - e6 c6 | d6 - g5 . c6 . bb5 a5 | g5 . bb5 d6 - c6 bb5 a5 | g5 - - - e5 f5 g5 . |
      bb5 . g5 . d6 . bb5 g5 | f5 - d5 . f5 . bb5 . | e5 g5 c6 . e6 - d6 c6 | c#6 - - . a5 . e5 . |
      f5 a5 c6 a5 f5 . c6 . | e5 g5 c6 g5 e5 . g5 . | d5 f5 bb5 f5 d5 . bb5 a5 | a5 - - . c#5 e5 g5 . |
      . | . | . | .`) },
    arp: { grid: 16, gain: 0.5, bars: FIGHT_CHORDS.map((c, i) => (i >= 16 && i < 32 ? arpBar(c, [0, 1, 2, 8, 2, 1, 0, 1, 0, 1, 2, 8, 9, 8, 2, 1], 4) : ['.'])) },
    bass: { grid: 8, gain: 1, bars: fightBass },
    drums: { grid: 16, gain: 0.85, bars: fightDrums },
    // tense: 16th hats all the way, and the arpeggio under the A section too
    hats: { grid: 16, gain: 0.55, hype: true, drum: true, bars: FIGHT_CHORDS.map(() => 'h h h h h h h h h h h h h h h h'.split(' ')) },
    arp2: { grid: 16, gain: 0.45, hype: true, inst: 'arp', bars: FIGHT_CHORDS.map((c, i) => (i < 16 ? arpBar(c, [0, 1, 2, 8, 2, 1, 0, 1, 0, 1, 2, 8, 9, 8, 2, 1], 4) : ['.'])) },
  },
};

/* stings and jingles (not loops) */
const vs = {
  name: 'vs', bpm: 140, swing: 0.5,
  channels: {
    lead: { grid: 16, gain: 1, bars: bars('d4 f4 a4 d5 f5 a5 d6 - - - - - - - - .') },
    lead2: { grid: 16, gain: 0.8, bars: bars('. . . a4 d5 f5 a5 - - - - - - - - .') },
    bass: { grid: 16, gain: 1, bars: bars('d2 - - - - - d3 - - - - - - - - .') },
    drums: { grid: 16, gain: 1, bars: bars('k . . . k . kc . . . . . . . . .') },
  },
};
const roundStart = {
  name: 'round', bpm: 160, swing: 0.5,
  channels: {
    lead: { grid: 8, gain: 0.9, bars: bars('g4 c5 . g5 - - . .') },
    lead2: { grid: 8, gain: 0.7, bars: bars('e4 g4 . e5 - - . .') },
    drums: { grid: 8, gain: 0.9, bars: bars('k k . kc . . . .') },
  },
};
const win = {
  name: 'win', bpm: 165, swing: 0.5,
  channels: {
    lead: { grid: 8, gain: 1, wave: 'p50', lp: 2600, bars: bars('g4 c5 e5 g5 - - e5 g5 | a5 - f5 a5 b5 - g5 b5 | c6 - - - - - - .') },
    lead2: { grid: 8, gain: 0.8, wave: 'p25', lp: 2000, bars: bars('e4 g4 c5 e5 - - c5 e5 | f5 - c5 f5 g5 - d5 g5 | e5 - - - - - - .') },
    arp: { grid: 16, gain: 0.6, bars: [['.'], ['.'], arpBar('C', [0, 1, 2, 8, 9, 10, 16, 10, 9, 8, 2, 1, 0, '.', '.', '.'], 5)] },
    bass: { grid: 8, gain: 1, bars: bars('c3 . c3 . c3 . c3 . | f2 . f2 . g2 . g2 . | c3 - - - - - - .') },
    drums: { grid: 8, gain: 1, bars: bars('k . s . k . s . | k . s . k s s s | kc . . . . . . .') },
  },
};
const lose = {
  name: 'lose', bpm: 92, swing: 0.5,
  channels: {
    tbone: { grid: 8, gain: 1, bars: bars('g4 - f#4 - f4 - e4 - | - - - - . . . .') },
    bass: { grid: 8, gain: 0.8, bars: bars('c3 - b2 - bb2 - a2 - | - - - . . . . .') },
    fx: { grid: 8, gain: 1, bars: bars('. . . . . . . . | . . . . . bloop . .') },
  },
};

/* ── Down Hill's songs ────────────────────────────────────────────────────
   Each: intro (2 bars), A (8), A' (8), B (8: a key-change lift), A (8),
   a turnaround (2) back to the first A. The tune is in octave 4 with peaks
   in 5, on a filtered pulse; lead2 is a counter-melody under it; the bass
   walks and syncopates; the drums sit back and fill into each section.
   All original. */

/* The Landing — bright and bouncy. F major; D7 lifts B a whole step to
   G, and it comes home on C7 (IV7 of G = V7 of F). 136 bpm: a 60 s loop. */
const L_CHART = [
  'F', 'C7',
  'F', 'Dm', 'Bb', 'C', 'F', 'Am', 'Bb C7', 'F',
  'F', 'Dm', 'Bb', 'Bbm', 'Am', 'D7', 'Gm C7', 'F D7',
  'G', 'D', 'Em', 'C', 'Am', 'D7', 'Cm', 'C7',
  'F', 'Dm', 'Bb', 'C', 'F', 'Am', 'Bb C7', 'F',
  'Gm', 'C7',
];
const L_A = `c4 . f4 g4 a4 - c5 . | d5 - c5 a4 - . f4 . | g4 - bb4 a4 g4 . f4 . | g4 - - - . . . . |
             c4 . f4 g4 a4 - c5 . | e5 - c5 a4 - . e4 . | d5 . c5 bb4 g4 . e4 g4 | f4 - - - . . . .`;
const L_A2 = `c4 . f4 g4 a4 - c5 . | d5 - c5 a4 - . f4 . | bb4 - d5 c5 bb4 . a4 . | db5 - - - c5 - bb4 . |
              c5 - a4 . e4 . a4 c5 | d5 - - . f#4 . a4 c5 | bb4 - a4 g4 e4 . c4 . | f4 - - . a4 . c5 .`;
const L_B = `g4 . b4 . d5 - - . | f#5 - e5 d5 - . a4 . | b4 - - . e5 . g5 . | e5 - - - - . . . |
             c5 . e5 . a5 - g5 . | f#5 - e5 . d5 . c5 . | eb5 - - - d5 . c5 . | bb4 - - - g4 . e4 .`;
const L_C2_A = `a3 - - - c4 - - - | d4 - - - a3 - - - | bb3 - - - d4 - - - | c4 - - - e4 d4 c4 bb3 |
                a3 - - - c4 - - - | c4 - - - e4 - - - | d4 - - - bb3 - - - | a3 - - - . f3 g3 g#3`;
const L_STARTS = [2, 10, 18, 26, 34];
const landing = {
  name: 'race', bpm: 136, swing: 0.56, loop: true, loopFrom: 2, hypeTempo: 1.06,
  channels: {
    lead: { grid: 8, gain: 1, wave: 'p50', lp: 2400, bars: song('. | .', L_A, L_A2, L_B, L_A,
      'bb4 . a4 g4 f4 . d4 . | e4 - g4 - bb4 - . .') },
    lead2: { grid: 8, gain: 1, wave: 'p25', lp: 1500, bars: song(
      'f3 - - - a3 - - - | bb3 - - - - - . .',
      L_C2_A,
      `a3 - - - c4 - - - | d4 - - - a3 - - - | d4 - - - f4 - - - | f4 - - - db4 - - - |
       c4 - - - e4 - - - | a3 - - - c4 - - - | d4 - - - e4 - - - | c4 - - - c4 - - -`,
      `b3 - - - d4 - - - | a3 - - - d4 - - - | b3 - - - e4 - - - | e4 - d4 - b3 - g3 - |
       a3 - - - c4 - - - | a3 - - - c4 - - - | c4 - - - eb4 - - - | e4 - - - bb3 - - -`,
      L_C2_A,
      'bb3 - - - d4 - - - | bb3 - - - - - - -') },
    // a soft shimmer: the intro and the lift only
    arp: { grid: 8, gain: 1, wave: 'p25', lp: 2200, bars: arpLine(L_CHART, [0, 1, 2, 8, 2, 1, 0, 1], 4, (i) => i < 2 || (i >= 18 && i < 26)) },
    bass: { grid: 8, gain: 1, bars: bassLine(L_CHART, (i, split) => (split ? 'R - . O R . 5 A' : i % 4 === 1 ? 'R . 5 R . O 3 A' : 'R - . R O . 5 A'), 2) },
    drums: { grid: 8, gain: 0.9, bars: drumLine(L_CHART, L_STARTS, {
      intro: ['k . . h k . . h'],
      groove: ['k . s h . k s h', 'k . s h k . s h'],
      fill: 'k . s . t t l l',
      crash: 'kc . s h . k s h',
    }) },
    // the final lap: off-beat hats and the shimmer under the tune too
    hats: { grid: 8, gain: 0.8, hype: true, drum: true, bars: L_CHART.map((_, i) => (i < 2 ? ['.'] : '. h . h . h . o'.split(' '))) },
    arp2: { grid: 8, gain: 0.8, hype: true, inst: 'arp', wave: 'p25', lp: 2200, bars: arpLine(L_CHART, [0, 1, 2, 8, 2, 1, 0, 1], 4, (i) => i >= 2 && (i < 18 || i >= 26)) },
  },
};

/* Laundry Day — the spin cycle: a swung-16th funk bass under a lazy tune.
   E dorian; B lifts a whole step to F# dorian (C#7 takes it there) and
   B7 brings it home. 104 bpm: a 78 s loop. */
const W_CHART = [
  'Em7', 'A7',
  'Em7', 'A7', 'Em7', 'A7', 'C', 'Bm7', 'Am7', 'B7',
  'Em7', 'A7', 'G', 'C', 'Am7', 'D7', 'C B7', 'Em7 C#7',
  'F#m7', 'B7', 'F#m7', 'B7', 'D', 'E', 'G A', 'B7',
  'Em7', 'A7', 'Em7', 'A7', 'C', 'Bm7', 'Am7', 'B7',
  'Am7', 'B7',
];
const W_A = `e4 - g4 . a4 b4 - . | d5 - b4 . a4 - g4 . | e4 - g4 . a4 b4 - . | c#5 - - . e5 - d5 . |
             e5 - - . d5 . b4 . | d5 - - . b4 . a4 . | c5 . b4 a4 g4 . e4 . | f#4 - - - d#4 - - .`;
const W_C2_A = `g3 - - - - - - - | g3 - - - c#4 - - - | g3 - - - b3 - - - | c#4 - - - g3 . a3 b3 |
                c4 - - - e4 - - - | d4 - - - f#4 - - - | c4 - - - e4 - - - | b3 - - - a3 - - -`;
const W_STARTS = [2, 10, 18, 26, 34];
const laundry = {
  name: 'laundry', bpm: 104, swing: 0.6, loop: true, loopFrom: 2, hypeTempo: 1.06,
  channels: {
    lead: { grid: 8, gain: 1, swing: 0.5, wave: 'p25', lp: 2200, bars: song('. | .', W_A,
      `e4 - g4 . a4 b4 - . | d5 - b4 . a4 - g4 . | d5 - b4 . g4 . a4 b4 | c5 - - - . . e4 g4 |
       a4 - - . c5 . b4 a4 | f#4 - - . a4 . c5 . | e5 - d5 c5 b4 - a4 . | g4 - - e4 g#4 - b4 .`,
      `c#5 - - . a4 . b4 c#5 | d#5 - - . c#5 . b4 a4 | c#5 - - . e5 . c#5 a4 | b4 - - - - . . . |
       a4 - f#4 . a4 . d5 . | g#4 - b4 . e5 - - . | d5 - b4 . c#5 - a4 . | b4 - - . a4 . f#4 d#4`,
      W_A,
      'c5 - b4 a4 - . e4 . | d#4 - - - f#4 - - .') },
    lead2: { grid: 8, gain: 1, swing: 0.5, wave: 'p50', lp: 1300, bars: song('. | .',
      W_C2_A,
      `g3 - - - - - - - | g3 - - - c#4 - - - | b3 - - - d4 - - - | e4 - - - g4 e4 c4 . |
       c4 - - - e4 - - - | c4 - - - a3 - - - | e4 - - - d#4 - - - | g3 - - - b3 - - -`,
      `a3 - - - e4 - - - | a3 - - - d#4 - - - | a3 - - - c#4 - - - | d#4 - - - f#4 e4 d#4 b3 |
       a3 - - - d4 - - - | b3 - - - e4 - - - | b3 - - - c#4 - - - | d#4 - - - . . . .`,
      W_C2_A,
      'c4 - - - e4 - - - | a3 - - - . . . .') },
    // off-beat stabs (a scratchy rhythm guitar, very quiet): the lift only
    arp: { grid: 16, gain: 1, wave: 'p25', lp: 2000, bars: arpLine(W_CHART, ['.', '.', 1, '.', '.', '.', 2, '.', '.', '.', 1, '.', '.', 2, '.', '.'], 4, (i) => i >= 18 && i < 26) },
    bass: { grid: 16, gain: 1.05, bars: bassLine(W_CHART, (i, split) => (split ? 'R - . O . R 5 . R . 7 . 5 . A .' : i % 2 ? 'R - . R . . O . 7 . 5 . R . A .' : 'R - . . O . R . . R 7 . 5 . O 5'), 2) },
    drums: { grid: 16, gain: 0.9, bars: drumLine(W_CHART, W_STARTS, {
      intro: ['k . . . . . . k . . k . . . . .'],
      groove: ['k . . . s . . k . . k . s . h .', 'k . . h s . . . k . k . s . . h'],
      fill: 'k . . . s . t t . t l . l l s s',
      crash: 'kc . . . s . . k . . k . s . h .',
    }) },
    hats: { grid: 16, gain: 0.8, hype: true, drum: true, bars: W_CHART.map((_, i) => (i < 2 ? ['.'] : '. . h . . . h . . . h . . . o .'.split(' '))) },
    arp2: { grid: 16, gain: 0.8, hype: true, inst: 'arp', wave: 'p25', lp: 2000, bars: arpLine(W_CHART, ['.', '.', 1, '.', '.', '.', 2, '.', '.', '.', 1, '.', '.', 2, '.', '.'], 4, (i) => i >= 2 && (i < 18 || i >= 26)) },
  },
};

/* Sprinkler Park — golden hour: long lazy notes over a loping bass.
   B♭ major; B lifts to D♭ (A♭7 takes it there) and slides home through
   G♭ to F7. 118 bpm: a 69 s loop. */
const P_CHART = [
  'Eb', 'F',
  'Bb', 'F', 'Gm', 'Eb', 'Bb', 'F', 'Eb Ebm', 'Bb',
  'Bb', 'F', 'Gm', 'Eb', 'Cm', 'F7', 'Gm Eb', 'F Ab7',
  'Db', 'Bbm', 'Gb', 'Ab', 'Db', 'Fm', 'Ebm Ab', 'Gb F7',
  'Bb', 'F', 'Gm', 'Eb', 'Bb', 'F', 'Eb Ebm', 'Bb',
  'Cm', 'F7',
];
const P_A = `f4 - - d4 f4 - bb4 - | a4 - - . g4 f4 c4 - | d4 - - g4 bb4 - d5 - | c5 - - - bb4 . g4 . |
             f4 - - d4 f4 - bb4 - | c5 - - a4 c5 - f5 - | eb5 - d5 c5 bb4 - gb4 - | f4 - - - . . . .`;
const P_C2_A = `d4 - - - - - - - | c4 - - - - - - - | bb3 - - - d4 - - - | g3 - - - bb3 - c4 - |
                d4 - - - - - - - | c4 - - - a3 - - - | g3 - - - gb3 - - - | f3 - - - . d4 c4 bb3`;
const P_STARTS = [2, 10, 18, 26, 34];
const park = {
  name: 'park', bpm: 118, swing: 0.58, loop: true, loopFrom: 2, hypeTempo: 1.06,
  channels: {
    lead: { grid: 8, gain: 1, wave: 'p50', lp: 2100, bars: song('. | .', P_A,
      `f4 - - d4 f4 - bb4 - | a4 - - . g4 f4 c4 - | d4 - - g4 bb4 - d5 - | eb5 - - - d5 . c5 . |
       c5 - - . eb5 . d5 c5 | a4 - - - f4 - - . | d5 - c5 bb4 g4 - bb4 - | a4 - - - c5 - eb5 -`,
      `ab4 - - db5 f5 - - - | f5 - db5 . bb4 - - . | db5 - - bb4 gb4 - db5 - | c5 - - - - . . . |
       ab4 - - db5 f5 - - - | f5 - eb5 db5 c5 - ab4 - | gb4 - bb4 - eb5 - c5 - | db5 - - bb4 a4 - - .`,
      P_A,
      'g4 - - . eb4 . c4 . | f4 - - - a4 - c5 .') },
    lead2: { grid: 8, gain: 1, wave: 'p25', lp: 1400, bars: song(
      'g3 - - - bb3 - - - | a3 - - - c4 - - -',
      P_C2_A,
      `d4 - - - - - - - | c4 - - - - - - - | bb3 - - - d4 - - - | g3 - - - bb3 - - - |
       eb4 - - - g3 - - - | c4 - - - eb4 d4 c4 a3 | bb3 - - - g3 - - - | a3 - - - c4 - - -`,
      `f4 - - - - - - - | db4 - - - f4 - - - | db4 - - - - - - - | c4 - - - eb4 - ab3 - |
       f4 - - - - - - - | ab3 - - - c4 - - - | bb3 - - - c4 - - - | bb3 - - - a3 - - -`,
      P_C2_A,
      'eb4 - - - - - - - | eb4 - - - - - - -') },
    // sun on the water: the intro and the lift
    arp: { grid: 8, gain: 1, wave: 'p25', lp: 2300, bars: arpLine(P_CHART, [0, 1, 2, 8, 9, 8, 2, 1], 4, (i) => i < 2 || (i >= 18 && i < 26)) },
    bass: { grid: 8, gain: 1, bars: bassLine(P_CHART, (i, split) => (split ? 'R - . 5 O . 5 A' : i % 4 === 3 ? 'R . 5 R . O 5 A' : 'R - . 3 5 - O A'), 2) },
    drums: { grid: 16, gain: 0.85, bars: drumLine(P_CHART, P_STARTS, {
      intro: ['k . . . . . . . k . . . . . . .'],
      groove: ['k . . . s . . . . . k . s . . h', 'k . . . s . . h k . . . s . . .'],
      fill: 'k . . . s . . . t . t . l . l .',
      crash: 'kc . . . s . . . . . k . s . . h',
    }) },
    hats: { grid: 16, gain: 0.8, hype: true, drum: true, bars: P_CHART.map((_, i) => (i < 2 ? ['.'] : '. . h . . . h . . . h . . . o .'.split(' '))) },
    arp2: { grid: 8, gain: 0.8, hype: true, inst: 'arp', wave: 'p25', lp: 2300, bars: arpLine(P_CHART, [0, 1, 2, 8, 9, 8, 2, 1], 4, (i) => i >= 2 && (i < 18 || i >= 26)) },
  },
};

/* The title / select theme — the same family, easy-going: G major, 100
   bpm, an A and an A' (a 38 s loop) after a 2-bar intro. */
const M_CHART = [
  'C', 'D',
  'G', 'Em', 'C', 'D', 'G', 'Bm', 'C Cm', 'G',
  'Em', 'C', 'G', 'D', 'Am', 'D7', 'C D', 'G',
];
const menu = {
  name: 'menu', bpm: 100, swing: 0.56, loop: true, loopFrom: 2,
  channels: {
    lead: { grid: 8, gain: 1, wave: 'p50', lp: 2200, bars: song('. | .',
      `d4 . g4 . b4 - a4 g4 | e4 - - . g4 . b4 . | c5 - b4 a4 g4 . e4 . | a4 - - - . . . . |
       d4 . g4 . b4 - a4 g4 | f#4 - - . b4 . d5 . | e5 - d5 c5 eb5 - c5 . | b4 - - - . . . .`,
      `b4 - - . g4 . e4 . | e4 - g4 . c5 - - . | d5 - b4 . g4 . b4 . | a4 - - - . . d4 . |
       c5 - - . a4 . e4 . | f#4 - - . a4 . c5 . | e5 - d5 c5 a4 - f#4 . | g4 - - - . . . .`) },
    lead2: { grid: 8, gain: 1, wave: 'p25', lp: 1400, bars: song(
      'g3 - - - c4 - - - | a3 - - - d4 - - -',
      `b3 - - - d4 - - - | g3 - - - b3 - - - | g3 - - - c4 - - - | a3 - - - d4 c4 b3 a3 |
       b3 - - - d4 - - - | b3 - - - d4 - - - | e4 - - - eb4 - - - | d4 - - - g4 f#4 e4 d4`,
      `g3 - - - - - - - | c4 - - - - - - - | b3 - - - d4 - - - | d4 - - - f#4 e4 d4 c4 |
       c4 - - - e4 - - - | c4 - - - a3 - - - | e4 - - - f#4 - - - | d4 - - - b3 - - -`) },
    arp: { grid: 8, gain: 0.9, wave: 'p25', lp: 2200, bars: arpLine(M_CHART, [0, 1, 2, 8, 2, 1, 0, 1], 4, (i) => i < 2 || i >= 10) },
    bass: { grid: 8, gain: 0.95, bars: bassLine(M_CHART, (i, split) => (split ? 'R . 5 . O . 5 A' : i % 4 === 3 ? 'R . 5 R . O 3 A' : 'R . 5 . O . 5 A'), 2) },
    drums: { grid: 8, gain: 0.75, bars: drumLine(M_CHART, [2, 10], {
      intro: ['. . . . . . . .'],
      groove: ['k . s h . k s .', 'k . s . k . s h'],
      fill: 'k . s . t . l l',
      crash: 'kc . s h . k s .',
    }) },
  },
};

export const TRACKS = { menu, fight, vs, round: roundStart, win, lose, race: landing, laundry, park };

/* ── compile: a track → { beats, loopBeat, events: [{ beat, dur, ch, inst, note, drum, gain, hype, wave, lp }] } ── */
export function compile(track) {
  const events = [];
  let nBars = 0;
  for (const ch of Object.values(track.channels)) nBars = Math.max(nBars, ch.bars.length);
  for (const [name, ch] of Object.entries(track.channels)) {
    const inst = ch.inst || name;
    const drum = ch.drum || inst === 'drums' || inst === 'hats';
    const step = 4 / ch.grid;                    // beats per step
    const swing = ch.swing ?? track.swing ?? 0.5;
    // swing the off-beat of each pair of steps (8ths or 16ths)
    const at = (i) => { const pair = Math.floor(i / 2) * 2 * step; return i % 2 ? pair + 2 * step * swing : pair; };
    let open = null;                             // the note being held
    for (let b = 0; b < nBars; b++) {
      const bar = ch.bars[b] || ['.'];
      const toks = bar.length === 1 && bar[0] === '.' ? new Array(ch.grid).fill('.') : bar;
      if (toks.length !== ch.grid) throw new Error(`${track.name}.${name} bar ${b + 1}: ${toks.length} steps, want ${ch.grid}`);
      for (let i = 0; i < ch.grid; i++) {
        const t = toks[i], beat = b * 4 + at(i), end = b * 4 + (i + 1 < ch.grid ? at(i + 1) : 4);
        if (t === '-') { if (open) open.end = end; continue; }
        if (open) { events.push(open.ev); open.ev.dur = Math.max(0.05, open.end - open.ev.beat); open = null; }
        if (t === '.') continue;
        if (drum) {
          for (const d of t) events.push({ beat, dur: step, ch: name, inst: 'drums', drum: d, gain: ch.gain, hype: !!ch.hype });
          continue;
        }
        if (inst === 'fx') { events.push({ beat, dur: step, ch: name, inst: 'fx', fx: t, gain: ch.gain, hype: !!ch.hype }); continue; }
        const note = typeof t === 'number' ? t : midi(t);
        if (note === null) throw new Error(`${track.name}.${name} bar ${b + 1}: bad token ${t}`);
        const ev = { beat, dur: 0, ch: name, inst, note, gain: ch.gain, hype: !!ch.hype, wave: ch.wave, lp: ch.lp };
        open = { ev, end };
      }
    }
    if (open) { open.ev.dur = Math.max(0.05, open.end - open.ev.beat); events.push(open.ev); }
  }
  events.sort((a, b) => a.beat - b.beat);
  const loopBeat = (track.loopFrom || 0) * 4;
  const loopIdx = Math.max(0, events.findIndex((e) => e.beat >= loopBeat - 1e-6));
  return { name: track.name, bpm: track.bpm, loop: !!track.loop, beats: nBars * 4, bars: nBars, loopBeat, loopIdx, hypeTempo: track.hypeTempo ?? 1, events };
}

/* the loop's length (the part that repeats) in seconds */
export const seconds = (c, tempo = 1) => (c.beats - (c.loop ? c.loopBeat : 0)) * 60 / (c.bpm * tempo);
