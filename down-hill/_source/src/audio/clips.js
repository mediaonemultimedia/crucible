/* The SFX clips (src/assets/sfx, made by tools/audio-prep.mjs from the
   owner's drafts), inlined into the page as base64 MP3 by the build
   (esbuild's base64 loader); decoded on the first gesture (audio/engine.js). */
import hitLight from '../assets/sfx/hit-light.mp3';
import hitHeavy from '../assets/sfx/hit-heavy.mp3';
import knockdown from '../assets/sfx/knockdown.mp3';
import land from '../assets/sfx/land.mp3';
import jump from '../assets/sfx/jump.mp3';
import crowdOoh from '../assets/sfx/crowd-ooh.mp3';
import featherBurst from '../assets/sfx/feather-burst.mp3';

export const CLIPS = {
  'hit-light': hitLight, 'hit-heavy': hitHeavy, 'knockdown': knockdown, 'land': land,
  'jump': jump, 'crowd-ooh': crowdOoh, 'feather-burst': featherBurst,
};
