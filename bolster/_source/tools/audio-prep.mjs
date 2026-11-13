/* The supplied SFX drafts (assets/audio/*.mp3) → the clips the game embeds
   (src/assets/sfx/*.mp3): trimmed to the sound, high-passed, faded at both
   ends (no clicks), peak-normalised to -1 dBFS, mono 44.1 kHz, 56 kb/s MP3
   (decodeAudioData reads MP3 in every target browser, Safari included). The
   relative loudness is set at play time from the measured loudness of each
   processed clip (LOUDNESS below → src/audio/sfx.js's MIX table).

   Five drafts are not used (judged by their envelopes and spectra; see the
   README): whoosh (a sub-bass rumble at ~50 Hz, no swing), grab, block,
   ui-tick and ui-confirm (steady hiss 3–18 dB over the floor, no event in
   it). Those slots keep a synthesised sound (src/audio/synth.js).

   node tools/audio-prep.mjs                                              */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IN = path.join(root, 'assets/audio'), OUT = path.join(root, 'src/assets/sfx');
fs.mkdirSync(OUT, { recursive: true });

/* start, end (s, in the draft), fade in / out (s), high-pass (Hz), extra */
export const CLIPS = {
  'hit-light':     { from: 0.0,  to: 0.32, fi: 0.002, fo: 0.22, hp: 35 },
  'hit-heavy':     { from: 0.0,  to: 0.62, fi: 0.002, fo: 0.40, hp: 40 },
  'knockdown':     { from: 0.0,  to: 0.90, fi: 0.004, fo: 0.45, hp: 40 },
  'land':          { from: 0.69, to: 1.02, fi: 0.006, fo: 0.18, hp: 35 },
  'jump':          { from: 0.46, to: 0.74, fi: 0.012, fo: 0.12, hp: 150 },
  'crowd-ooh':     { from: 0.0,  to: 1.85, fi: 0.04,  fo: 0.70, hp: 90 },
  // a 2 s roar at a steady level: shaped into a burst (quick in, an exponential tail)
  'feather-burst': { from: 0.0,  to: 1.10, fi: 0.004, fo: 1.05, hp: 80, curve: 'exp' },
};

for (const [name, c] of Object.entries(CLIPS)) {
  const src = path.join(IN, `sfx-${name}.mp3`), dst = path.join(OUT, `${name}.mp3`);
  const len = c.to - c.from;
  const af = [
    `atrim=${c.from}:${c.to}`, 'asetpts=PTS-STARTPTS',
    `highpass=f=${c.hp}`,
    `afade=t=in:d=${c.fi}`,
    `afade=t=out:st=${(len - c.fo).toFixed(3)}:d=${c.fo}${c.curve ? `:curve=${c.curve}` : ''}`,
  ].join(',');
  // pass 1: the peak after the shaping
  const err = execFileSync('sh', ['-c', `ffmpeg -hide_banner -i "${src}" -af "${af},volumedetect" -f null - 2>&1`]).toString();
  const peak = +/max_volume: (-?[\d.]+) dB/.exec(err)[1];
  const gain = -1 - peak;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-af', `${af},volume=${gain.toFixed(2)}dB`, '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '56k', '-map_metadata', '-1', dst]);
  // loudness: the loudest 100 ms (RMS) — EBU R128's gate needs 400 ms, longer than most of these
  const m = execFileSync('sh', ['-c', `ffmpeg -hide_banner -i "${dst}" -af astats=length=0.1:metadata=0 -f null - 2>&1`]).toString();
  const rms = +/RMS peak dB: (-?[\d.]+)/.exec(m)[1];
  console.log(`${name.padEnd(14)} ${len.toFixed(2)} s  gain ${gain >= 0 ? '+' : ''}${gain.toFixed(1)} dB  loudest 100 ms ${rms.toFixed(1)} dB RMS  ${(fs.statSync(dst).size / 1024).toFixed(1)} KB`);
}
