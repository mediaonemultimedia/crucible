/* What the fighters say through the phone pads, in the cast's usual
   trash-talk tone (fighters/index.js catchphrases): TAUNT (the pad's
   TAUNT button: a bubble over your fighter on the big screen) and the
   KO roast (the match winner's voice, on the LOSER's phone). ALT voices
   for the evil twins. Cosmetic only: never in the sim.                   */

export const TAUNT_LINES = {
  kevalanche: ['Come get some, eh!', 'Sorry, not sorry.', 'I eat seals bigger than you.', 'Drop the gloves, bud.'],
  rubberta: ['Eight arms. Count ’em.', 'Vem, querido!', 'I’ll ink you good.', 'Too slippery for you.'],
  johnny: ['Love means nothing.', 'Your serve. Oh wait.', 'Kom maar op!', 'Out! Like you, soon.'],
  sumaura: ['Come on then, love.', 'I’ve sat on bigger.', 'Fancy a cuppa first?', 'Bamboo’s tougher than you.'],
  k8e: ['Look up, shorty.', 'Neck and neck? Hardly.', 'I can see your bald spot.', 'Long neck, short fight.'],
  sebas: ['Ándale, ándale!', '¿Qué pasó, cachorro?', 'Howl if you’re scared.', 'Tu mamá pega más duro.'],
  zach: ['Caw caw, loser.', 'Shiny. Mine now.', 'Arre, come on yaar!', 'Birdbrain? Look who’s talking.'],
};

export const TAUNT_LINES_ALT = {
  kevalanche: ['Penalty box is for wimps.', 'Five for fighting. You.', 'Teeth are optional.'],
  rubberta: ['From the deep, with love.', 'Follow the light, snack.', 'Lights out down here.'],
  johnny: ['Feel the dark side spin.', 'Your racquet is weak.', 'I serve the Empire.'],
  sumaura: ['How positively common.', 'Do mind the cufflinks.', 'You’re not on the list.'],
  k8e: ['Anarchy in the savanna!', 'Mosh pit’s open.', 'No future. Yours.'],
  sebas: ['El Rudo no perdona.', 'Rudos rule, técnicos drool.', 'Pray, cachorro.'],
  zach: ['Yo ho, you’re done.', 'Dead crows tell no tales.', 'Walk the plank, yaar.'],
};

/* the winner roasts the loser (shown on the loser's phone) */
export const KO_LINES = {
  kevalanche: ['Knocked out cold, eh.', 'You just lost to a pillow, bud.', 'Go cry to your mom, eh. I’ll wait.', 'Ice that ego, sweetheart.'],
  rubberta: ['Eight arms, zero chances.', 'Tentacle-ly speaking… you suck.', 'Go home and cry in the shower, querido.', 'Washed up like seaweed.'],
  johnny: ['Game, set, match. Sorry ’bout that.', 'My mom has a better backhand, and she’s a house cat.', 'Love–forty. You’re the love.', 'Ball boy material, at best.'],
  sumaura: ['Right. That’s you squashed.', 'Blimey, you’re absolutely cream crackered.', 'Sat on you. Didn’t even notice.', 'Run along, sunshine.'],
  k8e: ['Heads up next time, eh.', 'I can see your house from up here. It’s sad.', 'Get some neck, loser.', 'Short neck, shorter career.'],
  sebas: ['Rápido next time, bitch!', 'Who’s the perra now, huh?', 'Go back to the kiddie ring, cachorro.', 'Your mask is crying, loser.'],
  zach: ['Finders keepers, loser.', 'Arre yaar, my mother-in-law hits harder than you.', 'Caw-caw-can’t fight, huh?', 'Nest’s that way. Go cry in it.'],
};

export const KO_LINES_ALT = {
  kevalanche: ['Five-minute major. For crying.', 'Lost a tooth? Lost the fight too.'],
  rubberta: ['Swallowed whole. Spat out.', 'You’re fish food, darling.'],
  johnny: ['The dark side wins. Again.', 'Double fault. Your whole life.'],
  sumaura: ['Frightfully dull. Do leave.', 'Not even worth the cufflinks.'],
  k8e: ['Moshed. Get out of my pit.', 'Your mixtape sucks too.'],
  sebas: ['El Rudo te mandó a casa, llorón.', 'Rudo 1, crybaby 0.'],
  zach: ['Davy Jones says hi, loser.', 'Sunk. Arre, pathetic.'],
};

/* a line from a list; n picks it (a counter, so it rotates) */
export const pickLine = (list, n) => list[((n % list.length) + list.length) % list.length];
export const tauntLine = (id, alt, n) => pickLine(alt && n % 2 ? TAUNT_LINES_ALT[id] : TAUNT_LINES[id], n >> (alt ? 1 : 0));
export const koLine = (id, alt, n) => pickLine(alt && n % 2 ? KO_LINES_ALT[id] : KO_LINES[id], n >> (alt ? 1 : 0));

/* the results roast for LAST place: the winner's voice, at whoever came 8th
   (the board's last row and, if that's a phone player, their phone) */
export const LAST_LINES = {
  kevalanche: ['Dead last, eh? Even the Zamboni lapped you.', 'Last place. Go sit in the penalty box, bud.', 'You drove like a moose on ice, sweetheart.'],
  rubberta: ['Last? Querido, I had eight arms free and still waved bye.', 'Even the bathwater finished ahead of you.', 'Sink back to the bottom, darling.'],
  johnny: ['Last. That’s a double fault on four wheels.', 'You finished after the ball boy. On foot.', 'Love–eight. You’re the love.'],
  sumaura: ['Dead last, love. Did you stop for tea?', 'The bus timetable beat you, sunshine.', 'Absolutely last. Frightfully on brand.'],
  k8e: ['I could see you from the finish line. Way back there.', 'Last place. Get some neck, get some speed.', 'You drive like a shorty.'],
  sebas: ['¡Último! Your mask is crying again, cachorro.', 'Last place, perra. Ándale next time.', 'My abuela drives faster, and she’s a chihuahua.'],
  zach: ['Last? I’d steal your trophy but there isn’t one.', 'Arre yaar, even my cart has more shine than your driving.', 'Caw-caw-crawled in last, loser.'],
};
export const lastLine = (id, n) => pickLine(LAST_LINES[id], n);
