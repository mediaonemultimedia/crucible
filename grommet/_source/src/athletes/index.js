/* The athletes, physics side (no three.js here: the Node tests import it).

   Each athlete is a rig builder and a game. To add one, see README.md:
   write NAME.rig.js (rest shape, kit, fur mask), NAME.game.js (the sport,
   on top of Athlete in game.js), a face + colourways in ../characters.js,
   and a view in ../views/ for whatever it plays with.                     */

import { buildLeopard } from './leopard.rig.js';
import { buildBear } from './bear.rig.js';
import { LeopardGame } from './leopard.game.js';
import { BearGame } from './bear.game.js';

export const ATHLETES = {
  leopard: { build: buildLeopard, Game: LeopardGame },
  bear: { build: buildBear, Game: BearGame },
};
export const ORDER = ['leopard', 'bear'];

export function buildRig(name) { return ATHLETES[name].build(); }
