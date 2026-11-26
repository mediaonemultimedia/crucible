/* Stage 3: "make it clear where to go", and "if there's a barrier, you
   collide with it". Shared by all three worlds, built from the track's
   own arrays so what you see is what the sim does:

   - rails: a candy-striped toy rail on posts along every 'rail' section
     (the sim's solid edge, at w + m), unless the world draws its own
     there (the banister's rounded lips);
   - kerbs: red / cream blocks at the road's edges through the sharp turns;
   - chevrons: sticky-note arrow signs on the outside of every sharp turn,
     facing the karts coming in;
   - floor arrows: a faint glowing chevron trail down the middle of the
     junctions (the doorways, the drawer, the ramps, open floor), never on
     top of a boost pad.

   Everything is plain meshes over a handful of shared materials, so the
   world's mergeStatic folds each kind into one draw call.             */

import * as THREE from 'three/webgpu';
import { canvasTex, mesh } from './geo.js';
import { rightX, rightZ } from '../race/track.js';

/* the road's turn, smoothed over ±8 samples (+ = left) */
function smoothCurv(T) {
  const N = T.N, out = new Float32Array(N);
  for (let k = 0; k < N; k++) { let c = 0; for (let q = -8; q <= 8; q++) c += T.curv[(k + q + N) % N]; out[k] = c / 17; }
  return out;
}

function stripeTex(a, b) {
  return canvasTex(64, 16, (g, w, h) => { g.fillStyle = a; g.fillRect(0, 0, w, h); g.fillStyle = b; g.fillRect(0, 0, w / 2, h); g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, h - 3, w, 3); }, { repeat: [1, 1] });
}
function chevronTex(dir) {
  // a sticky note: yellow paper, a curled corner, two fat black chevrons
  return canvasTex(128, 96, (g, w, h) => {
    g.fillStyle = '#ffe14a'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 0, w, 8);
    g.fillStyle = '#f1c21f'; g.beginPath(); g.moveTo(w, h - 22); g.lineTo(w - 22, h); g.lineTo(w, h); g.fill();
    g.strokeStyle = '#17121f'; g.lineWidth = 15; g.lineCap = 'round'; g.lineJoin = 'round';
    g.save(); if (dir < 0) { g.translate(w, 0); g.scale(-1, 1); }
    for (const x of [34, 74]) { g.beginPath(); g.moveTo(x, 20); g.lineTo(x + 22, h / 2); g.lineTo(x, h - 20); g.stroke(); }
    g.restore();
  });
}
function arrowTex() {
  return canvasTex(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#fff'; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round';
    g.shadowColor = '#fff'; g.shadowBlur = 6;
    g.beginPath(); g.moveTo(12, 46); g.lineTo(32, 20); g.lineTo(52, 46); g.stroke();
  });
}

/* opts: own (tags whose rails the world draws itself), arrowTags, colours */
export function buildReadable(W, opts = {}) {
  const T = W.T, N = T.N, def = T.def, root = W.root;
  const tag = (k) => def.points[T.sec[k]].tag;
  const own = opts.own || new Set();
  const sm = smoothCurv(T);
  const [cA, cB] = opts.railCols || ['#ff3b6b', '#fff4e6'];
  const out = { rails: 0, posts: 0, kerbs: 0, signs: 0, arrows: 0 };

  // ── rails ──
  const railMat = new THREE.MeshStandardMaterial({ map: stripeTex(cA, cB), roughness: 0.5 });
  const postMat = new THREE.MeshStandardMaterial({ color: cB, roughness: 0.55 });
  const H0 = 0.55, H1 = 1.85, TH = 0.7;   // the bar: its bottom and top over the road, its thickness
  for (const s of [-1, 1]) {
    const runs = [];
    let cur = null;
    for (let k = 0; k < N; k++) {
      const on = T.rail[k] && !own.has(tag(k)) && !opts.railGap?.(k, s);
      if (on) { if (!cur) runs.push((cur = [])); cur.push(k); } else cur = null;
    }
    if (runs.length > 1 && runs[0][0] === 0 && runs[runs.length - 1].at(-1) === N - 1) runs[0] = [...runs.pop(), ...runs[0]];
    for (const run of runs) {
      const ks = [(run[0] - 1 + N) % N, ...run, (run.at(-1) + 1) % N];
      const pos = [], uv = [], idx = [];
      let v = 0;
      ks.forEach((k, i) => {
        const o = T.w[k] + T.m[k] + TH / 2, rx = rightX(T, k) * s, rz = rightZ(T, k) * s, y = T.y[k];
        const xi = T.x[k] + rx * (o - TH / 2), zi = T.z[k] + rz * (o - TH / 2), xo = T.x[k] + rx * (o + TH / 2), zo = T.z[k] + rz * (o + TH / 2);
        // inner face bottom/top, outer face top/bottom
        pos.push(xi, y + H0, zi, xi, y + H1, zi, xo, y + H1, zo, xo, y + H0, zo);
        uv.push(v, 0, v, 0.5, v, 0.6, v, 1);
        v += T.step / 3.2;
        if (i) {
          const a = (i - 1) * 4, b = i * 4;
          for (const [p, q] of [[0, 1], [1, 2], [2, 3]]) idx.push(a + p, b + p, a + q, a + q, b + p, b + q);
        }
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      const m = mesh(g, railMat, 0, 0, 0, root); m.material.side = THREE.DoubleSide; m.userData.cast = true;
      out.rails++;
      for (let i = 0; i < run.length; i += 5) {
        const k = run[i], o = T.w[k] + T.m[k] + TH / 2;
        mesh(new THREE.BoxGeometry(0.8, H1 + 0.9, 0.8), postMat, T.x[k] + rightX(T, k) * o * s, T.y[k] + (H1 + 0.9) / 2 - 0.9, T.z[k] + rightZ(T, k) * o * s, root);
        out.posts++;
      }
    }
  }

  // ── kerbs: through the sharp turns, on the road's own edges ──
  const kerbA = new THREE.MeshStandardMaterial({ color: cA, roughness: 0.6 });
  const kerbB = new THREE.MeshStandardMaterial({ color: cB, roughness: 0.6 });
  const kerbG = new THREE.BoxGeometry(1.5, 0.3, 2.1);
  const lift = W.dashLift || ((k) => (T.y[k] > 19 ? 0.9 : 0));
  let n = 0;
  for (let k = 0; k < N; k += 2) {
    if (Math.abs(sm[k]) < 0.013 || W.noDash.has(tag(k)) || T.rail[k]) continue;
    for (const s of [-1, 1]) {
      const o = T.w[k] + 0.8;
      const b = mesh(kerbG, n % 2 ? kerbA : kerbB, T.x[k] + rightX(T, k) * o * s, T.y[k] + 0.2 + lift(k), T.z[k] + rightZ(T, k) * o * s, root);
      b.rotation.y = Math.atan2(T.tx[k], T.tz[k]); b.userData.noShadow = true;
      out.kerbs++;
    }
    n++;
  }

  // ── chevron signs on the outside of the sharp turns ──
  const signR = new THREE.MeshBasicMaterial({ map: chevronTex(1), side: THREE.DoubleSide });
  const signL = new THREE.MeshBasicMaterial({ map: chevronTex(-1), side: THREE.DoubleSide });
  const stick = new THREE.MeshStandardMaterial({ color: '#3a2c3e', roughness: 0.7 });
  const signG = new THREE.PlaneGeometry(4.6, 3.4);
  let lastSign = -99;
  for (let k = 0; k < N; k++) {
    const c = sm[k];
    if (Math.abs(c) < (opts.signCurv || 0.017) || k - lastSign < 9) continue;
    lastSign = k;
    const s = c > 0 ? 1 : -1;                       // the outside: right of a left turn
    const o = T.w[k] + T.m[k] + (T.rail[k] ? 2.2 : 1.8);
    const x = T.x[k] + rightX(T, k) * o * s, z = T.z[k] + rightZ(T, k) * o * s, y = T.y[k] + lift(k);
    // face the karts coming in (a touch turned toward the road)
    const p = mesh(signG, c > 0 ? signL : signR, x, y + 4.2, z, root);
    p.rotation.y = Math.atan2(T.tx[k], T.tz[k]) + Math.PI - s * 0.35;
    p.userData.noShadow = true;
    mesh(new THREE.BoxGeometry(0.45, 4.4, 0.45), stick, x, y + 1.3, z, root);
    out.signs++;
  }

  // ── a faint glowing arrow trail through the junctions ──
  const arrowM = new THREE.MeshBasicMaterial({ map: arrowTex(), color: opts.arrowCol || '#9ff7ff', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
  const arrowG = new THREE.PlaneGeometry(4.2, 4.2);
  const tags = opts.arrowTags || new Set();
  const nearPad = (k) => { for (let q = -7; q <= 7; q++) if (T.pad[(k + q + N) % N]) return true; return false; };
  for (let k = 0; k < N; k += 9) {
    const t = tag(k);
    if (!(tags.has(t) || (W.runnerTags.has(t) && Math.abs(sm[k]) > 0.015)) || nearPad(k) || T.launch[k]) continue;
    const a = mesh(arrowG, arrowM, T.x[k], T.y[k] + 0.32 + lift(k), T.z[k], root);
    a.rotation.order = 'YXZ'; a.rotation.y = Math.atan2(T.tx[k], T.tz[k]) + Math.PI; a.rotation.x = -Math.PI / 2;
    a.userData.noShadow = true; a.renderOrder = 1;
    out.arrows++;
  }
  return out;
}
