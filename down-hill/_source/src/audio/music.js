/* The music: original chiptune, composed here as data (no audio files).

   A track is bars of tokens per channel, on a grid (steps per bar, 4/4):
   a note `c5`, `f#4`, `bb3`; `-` holds the note before; `.` rests. Drums:
   `k` kick, `s` snare, `h` closed hat, `o` open hat, `c` crash (`kh` both).
   Bass lines are written over the chords with a pattern (`R` root, `O` the
   root an octave up, `5` the fifth, `A` a step into the next chord's root).
   `compile()` turns a track into one sorted list of note events in beats;
   the engine (audio/engine.js) schedules them on the AudioContext clock.

   Channels: lead (25 % pulse), lead2 (12.5 % pulse, a harmony or the high
   line), arp (12.5 % pulse, quiet), bass (triangle), drums (noise and a
   pitch-dropped sine), tbone (a muted saw that sags: the lose jingle), fx
   (one-off sounds). A channel marked `hype` only plays when the fight is
   tense (the last 15 s, or someone under 25 % stuffing).                 */

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

/* a bass bar from a pattern over a chord (`next`: the following chord, for A) */
export function bassBar(sym, pattern, next = sym, oct = 2) {
  const c = chord(sym), n = chord(next);
  const R = 12 * (oct + 1) + c.root;
  const N = 12 * (oct + 1) + n.root;
  // the approach: a semitone under the next root (or over, if that's nearer to where we are)
  const A = N - 1 >= R - 5 ? N - 1 : N + 1;
  return pattern.split(/\s+/).map((t) => (t === 'R' ? R : t === 'O' ? R + 12 : t === '5' ? R + 7 : t === '3' ? R + c.tones[1] : t === 'A' ? A : t === 'L' ? R - 5 : t));
}

/* an arpeggio bar over a chord: `shape` indexes the chord tones (0 root …), 8 adds an octave */
export function arpBar(sym, shape, oct = 4) {
  const c = chord(sym), base = 12 * (oct + 1) + c.root;
  return shape.map((i) => (i === '.' ? '.' : base + (i >= 8 ? 12 + c.tones[(i - 8) % c.tones.length] : c.tones[i % c.tones.length] + 12 * Math.floor(i / c.tones.length))));
}

const bars = (s) => s.trim().split('|').map((b) => b.trim().split(/\s+/));

/* ── the tracks ──────────────────────────────────────────────────────── */

const MENU_CHORDS = ['F', 'Dm', 'Bb', 'C', 'F', 'Am', 'Bb', 'C7', 'Dm', 'Bb', 'Gm', 'C', 'F', 'Dm', 'Bb', 'C7'];
const MENU_BASS = 'R - . O 5 . R A';
const menu = {
  name: 'menu', bpm: 110, swing: 0.62, loop: true,
  channels: {
    lead: { grid: 8, gain: 0.85, bars: bars(`
      f4 a4 c5 . a4 . c5 d5 | f5 - d5 . c5 . a4 . | bb4 . d5 f5 - . d5 bb4 | c5 - - . g4 a4 bb4 . |
      a4 c5 f5 . e5 f5 . c5 | e5 - c5 . a4 . e4 . | d5 . f5 . bb5 - a5 g5 | g5 - - . e5 . c5 . |
      d5 f5 a5 . f5 . d5 . | f5 - d5 . bb4 . d5 f5 | g5 . bb5 . a5 g5 f5 d5 | e5 - - . c5 . e5 g5 |
      a5 - f5 . c5 . a4 c5 | d5 . f5 . e5 d5 . a4 | bb4 . d5 . f5 . d5 . | e5 - c5 . g4 . e4 .`) },
    // the high answer: a few notes in the gaps, the second half only
    lead2: { grid: 8, gain: 0.7, bars: bars(`
      . | . | . | . | . | . | . | . |
      . . . . . . a5 . | . . . . . . . . | . . . . . . . . | . . . . g5 . . . |
      . . . . . . . . | . . . . . a5 . . | . . . . . . . . | . . . . . . . .`) },
    arp: { grid: 8, gain: 0.55, bars: MENU_CHORDS.map((c, i) => (i < 8 ? ['.'] : arpBar(c, [0, 1, 2, 1, 8, 2, 1, 2], 4))) },
    bass: { grid: 8, gain: 1, bars: MENU_CHORDS.map((c, i) => bassBar(c, MENU_BASS, MENU_CHORDS[(i + 1) % 16])) },
    drums: { grid: 8, gain: 0.8, bars: bars(`
      k . h k s . h . | k . h . s h h . | k . h k s . h . | k . h k s . s s |
      k . h k s . h . | k . h . s h h . | k . h k s . h . | k . h k s . o . |
      k . h k s . h . | k . h . s h h . | k . h k s . h . | k . h k s . s s |
      k . h k s . h . | k . h . s h h . | k . h k s h h k | k . s . s s s s`) },
  },
};

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
  name: 'fight', bpm: 150, swing: 0.54, loop: true,
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
    lead: { grid: 8, gain: 1, bars: bars('g4 c5 e5 g5 - - e5 g5 | a5 - f5 a5 b5 - g5 b5 | c6 - - - - - - .') },
    lead2: { grid: 8, gain: 0.8, bars: bars('e4 g4 c5 e5 - - c5 e5 | f5 - c5 f5 g5 - d5 g5 | e5 - - - - - - .') },
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

export const TRACKS = { menu, fight, vs, round: roundStart, win, lose };

/* ── compile: a track → { beats, events: [{ beat, dur, ch, inst, note, drum, gain, hype }] } ── */
export function compile(track) {
  const events = [];
  let nBars = 0;
  for (const ch of Object.values(track.channels)) nBars = Math.max(nBars, ch.bars.length);
  const swing = track.swing ?? 0.5;
  for (const [name, ch] of Object.entries(track.channels)) {
    const inst = ch.inst || name;
    const drum = ch.drum || inst === 'drums' || inst === 'hats';
    const step = 4 / ch.grid;                    // beats per step
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
        const ev = { beat, dur: 0, ch: name, inst, note, gain: ch.gain, hype: !!ch.hype };
        open = { ev, end };
      }
    }
    if (open) { open.ev.dur = Math.max(0.05, open.end - open.ev.beat); events.push(open.ev); }
  }
  events.sort((a, b) => a.beat - b.beat);
  return { name: track.name, bpm: track.bpm, loop: !!track.loop, beats: nBars * 4, bars: nBars, events };
}

export const seconds = (c, tempo = 1) => c.beats * 60 / (c.bpm * tempo);
