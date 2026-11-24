import * as THREE from 'three/webgpu';
import { RacerView } from '../../src/render/racer.js';
import { createRaceRemesh } from '../../src/render/race-remesh.js';
import { RACERS, ORDER } from '../../src/race/roster.js';
const alt = new URLSearchParams(location.search).get('alt') === '1';

async function start() {
  document.title = 'Fluffed and Furious · Smooth roster';
  document.querySelector('h1').textContent = document.title;
  const cards = document.querySelector('#cards');
  const stages = await Promise.all(ORDER.map(async (driverId) => {
    const racer = RACERS[driverId];
    const title = alt ? racer.altName : racer.name;
    const kart = alt ? racer.altKart : racer.kartName;
    const card = document.createElement('article');
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', title + ' in ' + kart);
    const caption = document.createElement('div');
    const heading = document.createElement('h2');
    heading.textContent = title;
    const detail = document.createElement('p');
    detail.textContent = racer.animal + ' · ' + kart;
    caption.append(heading, detail);
    card.append(canvas, caption);
    cards.append(card);
    const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL: true });
    await renderer.init();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#e1dfd5');
    scene.add(new THREE.HemisphereLight('#fbf4e7', '#8c8d8e', 2.1));
    for (const [pos, color, strength] of [[[-3,7,5], '#fff6ee', 2.0], [[4,4,-4], '#d5e8ff', 1.75]]) {
      const light = new THREE.DirectionalLight(color, strength);
      light.position.set(...pos);
      scene.add(light);
    }
    const car = new RacerView(scene, driverId, alt);
    const plush = car.driver.p;
    Object.assign(plush.shells, createRaceRemesh(plush, 'smooth'));
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(2.40, 2.52, 0.16, 64), new THREE.MeshStandardMaterial({ color: '#bdb9ae', roughness: 0.85 }));
    plinth.position.y = -0.105;
    scene.add(plinth);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 40);
    camera.position.set(0, driverId === 'k8e' ? 5.3 : 4.4, driverId === 'k8e' ? 10.5 : 8.8);
    camera.lookAt(0, driverId === 'k8e' ? 1.91 : 1.27, 0);
    car.driver.light(camera.quaternion);
    return { renderer, canvas, scene, camera, car };
  }));
  let angle = -0.58, spin = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const button = document.querySelector('#spin');
  const slider = document.querySelector('#angle');
  const refreshButton = () => { button.textContent = spin ? 'Pause spin' : 'Play spin'; };
  const stop = () => { spin = false; refreshButton(); };
  button.onclick = () => { spin = !spin; refreshButton(); };
  slider.oninput = () => { stop(); angle = Number(slider.value) * Math.PI / 180; };
  refreshButton();
  for (const { canvas } of stages) {
    let x = 0;
    canvas.onpointerdown = (e) => { stop(); x = e.clientX; canvas.setPointerCapture(e.pointerId); };
    canvas.onpointermove = (e) => { if (canvas.hasPointerCapture(e.pointerId)) { angle += (e.clientX - x) * 0.012; x = e.clientX; } };
  }
  const resize = () => {
    for (const { renderer, canvas, camera } of stages) {
      const { width, height } = canvas.getBoundingClientRect();
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
  };
  addEventListener('resize', resize);
  resize();
  document.body.dataset.ready = 'true';
  let previous = 0;
  function frame(now) {
    if (spin && previous) angle += Math.min(50, now - previous) * 0.00023;
    previous = now;
    slider.value = Math.atan2(Math.sin(angle), Math.cos(angle)) * 180 / Math.PI;
    for (const { renderer, scene, camera, car } of stages) {
      car.group.rotation.y = angle;
      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
start().catch((e) => {
  document.querySelector('#status').textContent = 'The 3D turntable could not start in this browser.';
  console.error(e);
});
