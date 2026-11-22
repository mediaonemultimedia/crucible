/* The worlds, one per track (race/track.js TRACKS): each builds its scene
   round the track's spline and tells the app where to put the podium,
   the select turntable and the title camera (world.info), how to keep the
   chase camera out of the furniture (camFix) and where it's dark
   (darkAt). Switching tracks disposes one world and builds the next.   */

import { World } from './world.js';
import { LaundryWorld } from './laundry.js';
import { ParkWorld } from './park.js';

const BUILDERS = { landing: (scene, T) => new World(scene, T), laundry: (scene, T) => new LaundryWorld(scene, T), park: (scene, T) => new ParkWorld(scene, T) };
export const registerWorld = (id, make) => { BUILDERS[id] = make; };

export function makeWorld(scene, T) {
  const make = BUILDERS[T.def.id] || BUILDERS.landing;
  return make(scene, T);
}
