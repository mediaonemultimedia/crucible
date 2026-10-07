/* Everything about a character that isn't physics or mesh: its colourways
   (fur, belly/muzzle `under`, mane/saddle `accent`; stitch in linear RGB),
   where its bead eyes sit, its embroidered face (painted into the mask
   atlas), and the words around it.

   Faces are painted in each part's own atlas rectangle. `at(part, u, v)` is
   a pixel in that part's region; `blob(part, u, v, w, h)` is an ellipse w × h
   in world units there, so a nose is nose-sized whatever the region's scale. */

export const CHARACTER_INFO = {
  octopus: {
    label: 'Octopus',
    colors: {
      coral: { fur: '#ef7a5f', under: '#f6dcc3', accent: '#ef7a5f' },
      lilac: { fur: '#a596d8', under: '#ece4f6', accent: '#a596d8' },
      lagoon: { fur: '#3fa9a8', under: '#d9f0e8', accent: '#3fa9a8' },
      oat: { fur: '#d6c2a0', under: '#f6efe2', accent: '#d6c2a0' },
    },
    eyes: { part: 'head', u: 0.068, v: 0.5, lift: 0.035, scale: [0.15, 0.175, 0.1] },
    unit: ['arm', 'arms'], readout: 'Holding on', stitch: [0.16, 0.08, 0.07],
    aria: 'A plush octopus you can pull, poke, comb and hand a stick',
    blurb: 'Eight soft arms in a coat of flock. Pull it and it gives; let go and it comes back. Comb it against the nap and it stays ruffled. Offer it a stick.',
    hand: 'Grab the head or any arm and pull — it stretches, then springs back. Shift as you let go to pin that point, then grab another.',
    face: octopusFace,
  },
  wolf: {
    label: 'Wolf',
    colors: {
      grey: { fur: '#9a9ca3', under: '#f1e9da', accent: '#5f626b' },
      timber: { fur: '#a08670', under: '#efe2cc', accent: '#6b5544' },
      arctic: { fur: '#e8e6e1', under: '#fbf8f1', accent: '#b9bcc4' },
      dusk: { fur: '#6d6f7c', under: '#d9d3cb', accent: '#3d3f4a' },
    },
    eyes: { part: 'head', u: 0.074, v: 0.45, lift: 0.03, scale: [0.12, 0.135, 0.08] },
    unit: ['part', 'parts'], readout: 'Held', stitch: [0.045, 0.04, 0.045],
    aria: 'A plush wolf you can pull, poke and comb',
    blurb: 'A sitting wolf in a grey coat, ears up. Tug an ear and it springs back; comb the tail against the nap and it stays rough.',
    hand: 'Grab the head, an ear or the tail and pull — it gives, then springs back. Shift as you let go to pin that point, then grab another.',
    face: wolfFace,
  },
  lion: {
    label: 'Lion',
    colors: {
      golden: { fur: '#e2aa50', under: '#f7e8c9', accent: '#a55a22' },
      sandy: { fur: '#e6c58d', under: '#faf0dc', accent: '#b98448' },
      ember: { fur: '#d9874a', under: '#f6dfc4', accent: '#7c3a1c' },
      snow: { fur: '#efe7d8', under: '#fdf9f0', accent: '#d7c4a2' },
    },
    eyes: { part: 'head', u: 0.074, v: 0.47, lift: 0.03, scale: [0.12, 0.135, 0.08] },
    unit: ['part', 'parts'], readout: 'Held', stitch: [0.11, 0.045, 0.035],
    aria: 'A plush lion with a long mane you can pull, poke and comb',
    blurb: 'A golden lion with a long mane. Comb the mane out from the face and it lies glossy; brush it back the wrong way and it stands up wild.',
    hand: 'Grab the head, an ear or the tail and pull — it gives, then springs back. Shift as you let go to pin that point, then grab another.',
    face: lionFace,
  },
  llama: {
    label: 'Llama',
    colors: {
      oat: { fur: '#efe4cf', under: '#fbf6ec', accent: '#e4d3b4' },
      blush: { fur: '#f2c2c8', under: '#fbf6ec', accent: '#ecdcc0' },
      mint: { fur: '#bfe3d0', under: '#fbf6ec', accent: '#ecdcc0' },
      lavender: { fur: '#cfc3ec', under: '#fbf6ec', accent: '#ecdcc0' },
    },
    eyes: { part: 'head', u: 0.1, v: 0.45, lift: 0.02, scale: [0.09, 0.105, 0.06] },
    unit: ['part', 'parts'], readout: 'Held', stitch: [0.13, 0.085, 0.075],
    aria: 'A plush llama in a shaggy fleece you can pull, poke and comb',
    blurb: 'A llama in a shaggy fleece. Pull its long neck and it sways back up; comb the fleece flat, or rough it up again.',
    hand: 'Grab the head, the neck, an ear or the body and pull — it gives, then sways back. Shift as you let go to pin that point, then grab another.',
    face: llamaFace,
  },
};

/* paint a character's mask into the shared canvas texture */
export function paintFace(tex, name, rig) {
  const g = tex.userData.ctx, size = tex.userData.size;
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = 'rgb(255,0,0)';
  g.fillRect(0, 0, size, size);
  const parts = {};
  for (const P of rig.parts) if (P.kind === 'grid' && !parts[P.name]) parts[P.name] = P;
  const reg = (name) => rig.regions[parts[name].region];
  const at = (name, u, v) => {
    const R = reg(name);
    return [(R.x0 + u * (R.x1 - R.x0)) * size, (R.y0 + v * (R.y1 - R.y0)) * size];
  };
  // world size → pixels at (u, v) on an ellipsoid part
  const px = (name, v, w, h) => {
    const P = parts[name], R = reg(name);
    const sp = Math.max(0.2, Math.sin(v * Math.PI));
    return [w / (2 * Math.PI * Math.max(P.r[0], P.r[2]) * sp) * (R.x1 - R.x0) * size, h / (Math.PI * P.r[1]) * (R.y1 - R.y0) * size];
  };
  const blob = (name, u, v, w, h, style) => {
    const [x, y] = at(name, u, v), [rx, ry] = px(name, v, w, h);
    g.fillStyle = style;
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
  };
  const eyeRing = (name, u, v, w) => {
    for (const s of [-1, 1]) {
      const [x, y] = at(name, 0.5 + s * u, v), [rx, ry] = px(name, v, w, w);
      const gr = g.createRadialGradient(x, y, 0, x, y, 1);
      gr.addColorStop(0, 'rgb(40,0,0)'); gr.addColorStop(0.6, 'rgb(90,0,0)'); gr.addColorStop(1, 'rgb(255,0,0)');
      g.save(); g.translate(x, y); g.scale(rx, ry); g.translate(-x, -y);
      g.fillStyle = gr;
      g.beginPath(); g.arc(x, y, 1, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  };
  // stitched line through points given in (u, v) on a part, w world-units thick
  const stitch = (name, pts, w) => {
    const [, ry] = px(name, pts[0][1], w, w);
    g.strokeStyle = 'rgb(0,0,255)';
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.lineWidth = Math.max(1.5, ry * 2);
    g.beginPath();
    pts.forEach(([u, v], k) => { const [x, y] = at(name, u, v); if (k) g.lineTo(x, y); else g.moveTo(x, y); });
    g.stroke();
  };
  CHARACTER_INFO[name].face(g, size, { at, px, blob, eyeRing, stitch });
  tex.needsUpdate = true;
}

/* the Phase 1 face, drawn exactly as before */
function octopusFace(g, size) {
  // head occupies v ∈ [0, ½): x = u·size, y = v·size; face centre at u = ½
  const H = (u, v) => [u * size, v * size * 0.5];
  // eyes: short fur ring so the beads sit proud
  for (const s of [-1, 1]) {
    const [x, y] = H(0.5 + s * 0.068, 0.5);
    const gr = g.createRadialGradient(x, y, 0, x, y, size * 0.05);
    gr.addColorStop(0, 'rgb(40,0,0)'); gr.addColorStop(0.6, 'rgb(90,0,0)'); gr.addColorStop(1, 'rgb(255,0,0)');
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(x, y, size * 0.05, size * 0.05, 0, 0, Math.PI * 2); g.fill();
  }
  g.globalCompositeOperation = 'lighter';
  // blush
  for (const s of [-1, 1]) {
    const [x, y] = H(0.5 + s * 0.112, 0.575);
    const gr = g.createRadialGradient(x, y, 0, x, y, size * 0.04);
    gr.addColorStop(0, 'rgba(0,255,0,0.9)'); gr.addColorStop(1, 'rgba(0,255,0,0)');
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(x, y, size * 0.045, size * 0.03, 0, 0, Math.PI * 2); g.fill();
  }
  // embroidered smile: a short shallow arc of satin stitch
  g.strokeStyle = 'rgb(0,0,255)';
  g.lineCap = 'round';
  g.lineWidth = size * 0.009;
  const [sx, sy] = H(0.5, 0.585);
  g.beginPath();
  g.ellipse(sx, sy - size * 0.016, size * 0.036, size * 0.02, 0, 0.14 * Math.PI, 0.86 * Math.PI);
  g.stroke();
}

function wolfFace(g, size, { blob, eyeRing, stitch }) {
  eyeRing('head', 0.074, 0.45, 0.32);
  g.globalCompositeOperation = 'lighter';
  // nose: a big soft satin-stitched pad on the end of the snout
  blob('snout', 0.5, 0.36, 0.25, 0.15, 'rgb(0,0,255)');
  blob('snout', 0.5, 0.29, 0.17, 0.08, 'rgb(0,0,255)');
  // mouth: down from the nose, then a small smile each way
  stitch('snout', [[0.5, 0.42], [0.5, 0.6]], 0.05);
  stitch('snout', [[0.42, 0.67], [0.46, 0.66], [0.5, 0.6], [0.54, 0.66], [0.58, 0.67]], 0.05);
}

function lionFace(g, size, { blob, eyeRing, stitch }) {
  eyeRing('head', 0.074, 0.47, 0.3);
  g.globalCompositeOperation = 'lighter';
  // a rosy blush on the cheeks
  blob('head', 0.385, 0.6, 0.24, 0.13, 'rgba(0,200,0,0.75)');
  blob('head', 0.615, 0.6, 0.24, 0.13, 'rgba(0,200,0,0.75)');
  // broad nose pad, mouth and the classic split muzzle
  blob('muzzle', 0.5, 0.3, 0.24, 0.13, 'rgb(0,0,255)');
  stitch('muzzle', [[0.5, 0.36], [0.5, 0.56]], 0.035);
  stitch('muzzle', [[0.41, 0.61], [0.46, 0.61], [0.5, 0.56], [0.54, 0.61], [0.59, 0.61]], 0.035);
  // whisker dots
  for (const s of [-1, 1])
    for (const [du, dv] of [[0.1, 0.42], [0.13, 0.5], [0.095, 0.53]]) blob('muzzle', 0.5 + s * du, dv, 0.03, 0.03, 'rgb(0,0,200)');
}

function llamaFace(g, size, { blob, eyeRing, stitch }) {
  eyeRing('head', 0.1, 0.44, 0.2);
  g.globalCompositeOperation = 'lighter';
  blob('head', 0.375, 0.58, 0.14, 0.08, 'rgba(0,220,0,0.8)');
  blob('head', 0.625, 0.58, 0.14, 0.08, 'rgba(0,220,0,0.8)');
  // little nostrils, and the llama's Y: a stitch down, then a soft smile
  blob('snout', 0.46, 0.33, 0.05, 0.03, 'rgb(0,0,255)');
  blob('snout', 0.54, 0.33, 0.05, 0.03, 'rgb(0,0,255)');
  stitch('snout', [[0.5, 0.4], [0.5, 0.55]], 0.028);
  stitch('snout', [[0.42, 0.6], [0.47, 0.59], [0.5, 0.55], [0.53, 0.59], [0.58, 0.6]], 0.028);
}
