# DOWN HILL: Stage 4, music pass (Kevin-approved, Sun Nov 22)
- **Repo:** https://github.com/mediaonemultimedia/crucible
- **Branch:** `kart-source`, in `down-hill/_source/`. Stage 3 (playtest fixes) may still be running or may have just shipped. Pull first and build on top of it; never discard its work. If it's mid-run, only touch the audio files (`src/audio/`) to avoid conflicts.

## Kevin's note, verbatim-ish
"The music wasn't bad. I don't mind the 8-bit sound, it's fun. But it was more beeps than an actual song: bang bang bang bang, not do-do-do-do-do. Maybe more lower tones than high-pitched tones."

## The goal
Keep the chiptune palette, but make each track an actual SONG: a singable, catchy melody you'd hum after the race, in a warmer and lower register. It must be ORIGINAL; don't imitate any existing game's themes.

## Changes (src/audio/music.js + engine.js / synth.js as needed)
1. **Melody first:**
   - Write a real lead tune with phrases (4-bar question and answer), stepwise motion with a few leaps, held notes and rests to breathe, and a hook that repeats.
   - Avoid machine-gun repeated 16th notes on one pitch. That's the "beeps" Kevin hears.
2. **Lower and warmer:**
   - Move the lead down about an octave (mostly octave 4, with peaks in octave 5).
   - Use a 50% or 25% pulse with a gentle low-pass filter and a touch of delayed vibrato on long notes.
   - Turn down or remove the 12.5% high arp. Keep a quiet arp only where it adds shimmer.
3. **Harmony and groove:**
   - Use a moving chord progression with some colour (vi, ii, borrowed IV/iv, a key-change lift for the B section), plus a counter-melody in `lead2` under the tune.
   - Make the bass a bouncy, syncopated walking line, the thing that makes you bob your head.
   - Drums: sit back, with fewer hats, a groove kick, and fills into new sections.
4. **Structure:** intro (2 bars), A, A', B (a lift), A, then a turnaround back to the loop. Roughly 60 to 90 seconds before it repeats, so it doesn't feel like a short loop.
5. **Final lap:** the same song, nudged about 6% faster with the `hype` layer on. The switch must be smooth, on a bar line.
6. **Mix:**
   - Lower overall music gain so engines, items and voices sit on top.
   - Add a soft master compressor or limiter, and a small stereo spread or echo on the lead.
   - No harsh highs.
7. **All three tracks** (race/The Landing, laundry, park) get this treatment, each with its own personality:
   - **The Landing:** bright and bouncy.
   - **Laundry Day:** a funky, swung "spin cycle" bass groove.
   - **Sprinkler Park:** a sunny, golden-hour feel.
   - Also refresh the title/select theme to match.
8. **No audio files and no external services.** Everything stays synthesized from data, and the build's no-network gate must pass.

## Evidence
- Render each track to WAV offline (an OfflineAudioContext in the headless page, or a node port of the synth) and attach short MP3 or OGG clips to the PR (30 to 45 seconds each), so Kevin can listen before playing.
- Describe each tune in one line in the PR.

## Shipping
- Create `kart-release-4` off `main`. It touches ONLY `down-hill/index.html`.
- Auto-merge your own PR only if `tools/check.mjs` passes (zero errors, 60 fps, zero network requests). Then confirm the Pages deploy.
- Never push to `main`, never force-push, no self-scheduled follow-ups and no polling.
