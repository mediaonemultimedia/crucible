import { makeRenderer, Arena } from './render/arena.js';
import { Fight } from './fight.js';
import { Keyboard } from './input/keyboard.js';
const params = new URLSearchParams(location.search);
async function start() {
  const { renderer } = await makeRenderer(document.getElementById('stage'));
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.setSize(innerWidth, innerHeight);
  const arena = new Arena();
  const kb = new Keyboard();
  const fight = new Fight(arena, { p1: params.get('p1') || 'kevalanche', p2: params.get('p2') || 'rubberta', cpu: [null, null], keyboard: kb });
  window.__pf2 = { arena, fight, renderer };
  let last = performance.now();
  const hold = params.has('hold');
  renderer.setAnimationLoop(() => {
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!hold) fight.frame(dt);
    renderer.render(arena.scene, arena.camera);
  });
  window.__pf2.step = (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) fight.frame(dt); renderer.render(arena.scene, arena.camera); };
}
start();
