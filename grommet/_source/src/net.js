/* The goal and its net.

   The frame is capsules (posts, crossbar, a lighter back frame) that the
   ball bounces off. The net is a verlet mesh of knots in four panels —
   back, roof, two sides — each pinned all round its edge to the frame,
   a little slack so it sags. A ball that gets in shoves the knots it
   touches (they're light) and is slowed by them in turn (it's heavier), so
   the net bellies out, ripples and drops the ball.                       */

export function makeGoalSpec({ z = -1.3, w = 3.15, h = 3.15, depth = 1.75, backH = 2.5 } = {}) {
  const zb = z - depth;
  const front = 0.1, back = 0.055;
  const bars = [
    [[-w, 0, z], [-w, h, z], front], [[w, 0, z], [w, h, z], front], [[-w, h, z], [w, h, z], front],
    [[-w, 0, zb], [-w, backH, zb], back], [[w, 0, zb], [w, backH, zb], back], [[-w, backH, zb], [w, backH, zb], back],
    [[-w, h, z], [-w, backH, zb], back], [[w, h, z], [w, backH, zb], back],
    [[-w, 0, z], [-w, 0, zb], back], [[w, 0, z], [w, 0, zb], back], [[-w, 0, zb], [w, 0, zb], back],
  ];
  return { z, w, h, depth, backH, zb, bars, posts: bars.slice(0, 3) };
}

export class Net {
  constructor(G) {
    this.G = G;
    const pts = [], pin = [], panels = [], links = [];
    const quad = (A, B, C, D, cols, rows) => {
      // A bottom-left, B bottom-right, C top-right, D top-left
      const ix = [];
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const u = i / (cols - 1), v = j / (rows - 1);
        const p = [0, 1, 2].map((d) => (A[d] * (1 - u) + B[d] * u) * (1 - v) + (D[d] * (1 - u) + C[d] * u) * v);
        ix.push(pts.length / 3);
        pts.push(...p);
        pin.push(i === 0 || j === 0 || i === cols - 1 || j === rows - 1 ? 1 : 0);
      }
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const k = ix[j * cols + i];
        if (i < cols - 1) links.push([k, ix[j * cols + i + 1]]);
        if (j < rows - 1) links.push([k, ix[(j + 1) * cols + i]]);
      }
      panels.push({ ix: Int32Array.from(ix), cols, rows });
    };
    const { z, w, h, backH, zb } = G;
    quad([-w, 0, zb], [w, 0, zb], [w, backH, zb], [-w, backH, zb], 30, 12);            // back
    quad([-w, h, z], [w, h, z], [w, backH, zb], [-w, backH, zb], 30, 8);                // roof
    quad([-w, 0, z], [-w, 0, zb], [-w, backH, zb], [-w, h, z], 9, 14);                  // left side
    quad([w, 0, zb], [w, 0, z], [w, h, z], [w, backH, zb], 9, 14);                      // right side
    this.n = pts.length / 3;
    this.x = Float64Array.from(pts);
    this.p = Float64Array.from(pts);
    this.rest = Float64Array.from(pts);
    this.pin = Uint8Array.from(pin);
    this.panels = panels;
    this.la = Int32Array.from(links.map((l) => l[0]));
    this.lb = Int32Array.from(links.map((l) => l[1]));
    // a little slack, so it hangs
    this.len = Float64Array.from(links.map(([a, b]) => 1.035 * Math.hypot(pts[a * 3] - pts[b * 3], pts[a * 3 + 1] - pts[b * 3 + 1], pts[a * 3 + 2] - pts[b * 3 + 2])));
    this.energy = 0;
  }

  reset() { this.x.set(this.rest); this.p.set(this.rest); }

  /* verlet: gravity, drag, links, the floor; then a ball can push in */
  step(h) {
    const { x, p, pin, n } = this;
    const g = 9 * h * h, drag = Math.exp(-2.5 * h);
    let e = 0;
    for (let i = 0; i < n; i++) {
      if (pin[i]) continue;
      for (let d = 0; d < 3; d++) {
        const v = (x[i * 3 + d] - p[i * 3 + d]) * drag;
        p[i * 3 + d] = x[i * 3 + d];
        x[i * 3 + d] += v - (d === 1 ? g : 0);
        e += v * v;
      }
    }
    this.energy = e / (h * h) * 0.5;
    const { la, lb, len } = this;
    for (let it = 0; it < 4; it++) {
      for (let l = 0; l < la.length; l++) {
        const a = la[l], b = lb[l];
        const dx = x[b * 3] - x[a * 3], dy = x[b * 3 + 1] - x[a * 3 + 1], dz = x[b * 3 + 2] - x[a * 3 + 2];
        const d = Math.hypot(dx, dy, dz) || 1e-9;
        if (d <= len[l]) continue;                // net: holds its length, never pushes
        const wa = pin[a] ? 0 : 1, wb = pin[b] ? 0 : 1, ws = wa + wb;
        if (!ws) continue;
        const f = (d - len[l]) / d / ws;
        x[a * 3] += dx * f * wa; x[a * 3 + 1] += dy * f * wa; x[a * 3 + 2] += dz * f * wa;
        x[b * 3] -= dx * f * wb; x[b * 3 + 1] -= dy * f * wb; x[b * 3 + 2] -= dz * f * wb;
      }
    }
    for (let i = 0; i < n; i++) if (!pin[i] && x[i * 3 + 1] < 0.02) x[i * 3 + 1] = 0.02;
  }

  /* a ball against the knots: knots shoved aside, the ball slowed */
  collide(ball, h) {
    const { x, pin, n } = this;
    const b = ball.x, m = ball.r + 0.03;
    let hit = 0;
    for (let i = 0; i < n; i++) {
      if (pin[i]) continue;
      const dx = x[i * 3] - b[0], dy = x[i * 3 + 1] - b[1], dz = x[i * 3 + 2] - b[2];
      if (dx > m || dx < -m || dy > m || dy < -m || dz > m || dz < -m) continue;
      const d = Math.hypot(dx, dy, dz);
      if (d >= m || d < 1e-9) continue;
      const pen = m - d, nx = dx / d, ny = dy / d, nz = dz / d;
      x[i * 3] += nx * pen * 0.85; x[i * 3 + 1] += ny * pen * 0.85; x[i * 3 + 2] += nz * pen * 0.85;
      const k = pen * 0.15;
      b[0] -= nx * k; b[1] -= ny * k; b[2] -= nz * k;
      ball.v[0] -= nx * k / h; ball.v[1] -= ny * k / h; ball.v[2] -= nz * k / h;
      hit++;
    }
    return hit;
  }
}
