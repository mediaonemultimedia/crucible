/* Gravity relative to the screen face. Pitch drops as the screen tilts
   down, and is independent of which way the screen is turned. */
export function driftPitch(beta, gamma) {
  if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return null;
  const rad = Math.PI / 180;
  return Math.asin(Math.cos(beta * rad) * Math.cos(gamma * rad)) / rad;
}

export function motionDrift(degrees, held) {
  return held ? degrees > 7 : degrees >= 14;
}
