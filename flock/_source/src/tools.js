/* Pointer input → the four tools, plus camera orbit and zoom. The fourth
   tool is the character's toy: the octopus's stick, or a Play toy.


   Every pointer is tracked on its own, so two fingers (or a mouse plus a
   pinned grab — Shift on release pins a Hand grab in place) can hold the
   octopus at two points and stretch or twist it between them.            */

import * as THREE from 'three/webgpu';

const BRUSH = 0.24;

export class Tools {
  constructor({ canvas, camera, body, soft, grasp, groom, stickMesh, onStick, play = null }) {
    Object.assign(this, { canvas, camera, body, soft, grasp, groom, stickMesh, onStick });
    this.mode = 'hand';
    this.ptrs = new Map();
    this.pins = new Map();
    this.ray = new THREE.Raycaster();
    this.pickMat = new THREE.MeshBasicMaterial();
    this.stickEnabled = true;
    this.attach({ body, soft, grasp, play });
    this.orbit = { az: 0.0, el: 0.4, dist: 12.4, target: new THREE.Vector3(0, 0.75, 0) };
    this._applyOrbit();
    this.combing = false;

    canvas.addEventListener('pointerdown', (e) => this._down(e));
    canvas.addEventListener('pointermove', (e) => this._move(e));
    canvas.addEventListener('pointerup', (e) => this._up(e));
    canvas.addEventListener('pointercancel', (e) => this._up(e));
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.orbit.dist = THREE.MathUtils.clamp(this.orbit.dist * Math.exp(e.deltaY * 0.0012), 5.2, 18);
      this._applyOrbit();
    }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setMode(m) { this.mode = m; this.canvas.dataset.tool = m; }

  /* a new character: drop every pointer's hold on the old one */
  attach({ body, soft, grasp, play = null }) {
    if (this.soft) {
      this.releasePins();
      for (const id of this.ptrs.keys()) this.soft.release(id);
      this.soft.spheres = [];
      this.soft.stick = null;
      this.onStick?.(false);
    }
    this.ptrs?.clear();
    Object.assign(this, { body, soft, grasp, play });
    this.pick = new THREE.Mesh(body.geometry, this.pickMat);
    this.pick.updateMatrixWorld();
    if (this.canvas) this.canvas.dataset.grabbing = '';
  }

  releasePins() {
    for (const id of this.pins.keys()) this.soft.release(id);
    this.pins.clear();
  }

  holding() { return this.soft.grabs.size; }

  /* fur flattening under hands, fingers and the comb */
  pressPoints() {
    const out = [];
    const x = this.soft.x;
    for (const g of this.soft.grabs.values()) out.push({ x: x[g.i * 3], y: x[g.i * 3 + 1], z: x[g.i * 3 + 2], r: 0.42, amt: 0.95 });
    for (const s of this.soft.spheres) out.push({ x: s.x, y: s.y, z: s.z, r: s.r + 0.25, amt: 1 });
    for (const p of this.ptrs.values()) if (p.kind === 'comb' && p.last) out.push({ x: p.last.x, y: p.last.y, z: p.last.z, r: BRUSH, amt: 0.55 });
    return out;
  }

  applyOrbit() { this._applyOrbit(); }

  _applyOrbit() {
    const o = this.orbit;
    const c = this.camera;
    c.position.set(
      o.target.x + o.dist * Math.cos(o.el) * Math.sin(o.az),
      o.target.y + o.dist * Math.sin(o.el),
      o.target.z + o.dist * Math.cos(o.el) * Math.cos(o.az),
    );
    c.lookAt(o.target);
    c.updateMatrixWorld();
  }

  _ndc(e) {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  _cast(e) {
    this.ray.setFromCamera(this._ndc(e), this.camera);
    return this.ray.intersectObject(this.pick, false)[0] || null;
  }

  _camPlane(point) {
    const n = new THREE.Vector3();
    this.camera.getWorldDirection(n);
    return new THREE.Plane().setFromNormalAndCoplanarPoint(n.negate(), point);
  }

  _onPlane(e, plane) {
    this.ray.setFromCamera(this._ndc(e), this.camera);
    const out = new THREE.Vector3();
    return this.ray.ray.intersectPlane(plane, out) ? out : null;
  }

  _nearestVertex(hit) {
    const f = hit.face, P = this.body.pos;
    let best = f.a, bd = 1e9;
    for (const v of [f.a, f.b, f.c]) {
      const d = hit.point.distanceToSquared(new THREE.Vector3(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]));
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  _stickHit(e) {
    const s = this.soft.stick;
    if (!s) return null;
    this.ray.setFromCamera(this._ndc(e), this.camera);
    const a = new THREE.Vector3(...s.a), b = new THREE.Vector3(...s.b);
    const onRay = new THREE.Vector3(), onSeg = new THREE.Vector3();
    const d2 = this.ray.ray.distanceSqToSegment(a, b, onRay, onSeg);
    return d2 < (s.r * 3.2) ** 2 ? onSeg : null;
  }

  _down(e) {
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
    const p = { id: e.pointerId, x: e.clientX, y: e.clientY };
    this.ptrs.set(e.pointerId, p);

    // the stick is grabbable whichever tool is active
    const sh = this._stickHit(e);
    if (sh || (this.mode === 'toy' && this.stickEnabled)) {
      if (sh) return this._startStickDrag(p, e, sh);
      if (this.mode === 'toy' && this.stickEnabled) {
        const floor = this._onPlane(e, new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
        if (floor) {
          this._placeStick(floor);
          return this._startStickDrag(p, e, new THREE.Vector3(...this.soft.stick.a).lerp(new THREE.Vector3(...this.soft.stick.b), 0.5));
        }
      }
    }

    // so is a toy; with the Toy tool, the floor is where a new one goes
    if (this.play) {
      const th = this._toyHit(e);
      if (th) return this._startToyDrag(p, th);
      if (this.mode === 'toy') {
        const floor = this._onPlane(e, new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
        if (floor) {
          const dir = new THREE.Vector3();
          this.camera.getWorldDirection(dir);
          const toCam = new THREE.Vector2(-dir.x, -dir.z).normalize();
          this.play.place([floor.x, 0, floor.z], [toCam.x, 0, toCam.y]);
          this.onStick?.(true);
          const a = this.play.target();
          return this._startToyDrag(p, new THREE.Vector3(...a));
        }
      }
    }

    const hit = this._cast(e);
    if (!hit) { p.kind = 'orbit'; return; }
    const v = this._nearestVertex(hit);
    const i = this.body.part[v];
    const x = this.soft.x;

    if (this.mode === 'hand') {
      // un-pin if this point was pinned
      for (const [pid, g] of this.pins) if (g === i) { this.soft.release(pid); this.pins.delete(pid); }
      p.kind = 'hand';
      p.plane = this._camPlane(hit.point);
      p.off = new THREE.Vector3(x[i * 3], x[i * 3 + 1], x[i * 3 + 2]).sub(hit.point);
      p.i = i;
      this.soft.grab(e.pointerId, i, [x[i * 3], x[i * 3 + 1], x[i * 3 + 2]]);
      this.canvas.dataset.grabbing = '1';
    } else if (this.mode === 'finger') {
      p.kind = 'finger';
      p.depth = hit.distance;
      p.sphere = { x: 0, y: 0, z: 0, r: 0.27 };
      p.t = 0;
      this.soft.spheres.push(p.sphere);
      this._fingerTo(p, e);
    } else if (this.mode === 'comb') {
      p.kind = 'comb';
      p.last = hit.point.clone();
    }
  }

  _fingerTo(p, e) {
    p.e = { clientX: e.clientX, clientY: e.clientY };
    this.ray.setFromCamera(this._ndc(e), this.camera);
    // press in a little deeper than the surface: a poke, not a touch
    const pt = this.ray.ray.at(p.depth + 0.2 + Math.min(0.42, p.t * 1.4), new THREE.Vector3());
    p.sphere.x = pt.x; p.sphere.y = pt.y; p.sphere.z = pt.z;
  }

  _placeStick(at) {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const side = new THREE.Vector3(dir.z, 0, -dir.x).normalize();
    const half = 2.1;
    const y = 0.62;
    this.soft.stick = {
      a: [at.x - side.x * half, y, at.z - side.z * half],
      b: [at.x + side.x * half, y, at.z + side.z * half],
      r: 0.075,
    };
    this.onStick?.(true);
  }

  removeStick() {
    this.soft.stick = null;
    this.play?.remove();
    this.onStick?.(false);
  }

  /* nearest point on a toy under the pointer, if any */
  _toyHit(e) {
    const segs = this.play?.segments();
    if (!segs?.length) return null;
    this.ray.setFromCamera(this._ndc(e), this.camera);
    const onRay = new THREE.Vector3(), onSeg = new THREE.Vector3();
    let best = null, bd = 1e9;
    for (const s of segs) {
      const a = new THREE.Vector3(...s.a), b = new THREE.Vector3(...s.b);
      let d2;
      if (a.distanceToSquared(b) < 1e-10) { d2 = this.ray.ray.distanceSqToPoint(a); onSeg.copy(a); }
      else d2 = this.ray.ray.distanceSqToSegment(a, b, onRay, onSeg);
      const r = s.r * 1.6;
      if (d2 < r * r && d2 / (r * r) < bd) { bd = d2 / (r * r); best = onSeg.clone(); }
    }
    return best;
  }

  _startToyDrag(p, point) {
    p.kind = 'toy';
    p.plane = this._camPlane(point);
    this.play.dragStart([point.x, point.y, point.z]);
  }

  _startStickDrag(p, e, point) {
    p.kind = 'stick';
    p.plane = this._camPlane(point);
    p.from = point.clone();
    p.a0 = [...this.soft.stick.a];
    p.b0 = [...this.soft.stick.b];
  }

  _move(e) {
    const p = this.ptrs.get(e.pointerId);
    if (!p) { this._hover(e); return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;

    if (p.kind === 'orbit') {
      this.orbit.az -= dx * 0.0055;
      this.orbit.el = THREE.MathUtils.clamp(this.orbit.el + dy * 0.004, 0.06, 1.25);
      this._applyOrbit();
    } else if (p.kind === 'hand') {
      const at = this._onPlane(e, p.plane);
      if (!at) return;
      at.add(p.off);
      at.y = Math.max(at.y, 0.12);
      this.soft.moveGrab(e.pointerId, [at.x, at.y, at.z]);
    } else if (p.kind === 'finger') {
      this._fingerTo(p, e);
    } else if (p.kind === 'stick') {
      const at = this._onPlane(e, p.plane);
      if (!at) return;
      const d = at.sub(p.from);
      const s = this.soft.stick;
      const lowest = Math.min(p.a0[1], p.b0[1]) + d.y;
      if (lowest < s.r) d.y += s.r - lowest;   // never through the floor
      for (let k = 0; k < 3; k++) { s.a[k] = p.a0[k] + d.getComponent(k); s.b[k] = p.b0[k] + d.getComponent(k); }
    } else if (p.kind === 'toy') {
      const at = this._onPlane(e, p.plane);
      if (at) this.play.dragTo([at.x, at.y, at.z]);
    } else if (p.kind === 'comb') {
      const hit = this._cast(e);
      if (!hit) { p.last = null; return; }
      if (p.last) {
        const d = hit.point.clone().sub(p.last);
        if (d.lengthSq() > 1e-6) this._comb(hit, d);
      }
      p.last = hit.point.clone();
    }
  }

  _comb(hit, d) {
    const f = hit.face, B = this.body;
    const bc = new THREE.Vector3();
    THREE.Triangle.getBarycoord(hit.point,
      new THREE.Vector3().fromArray(B.pos, f.a * 3),
      new THREE.Vector3().fromArray(B.pos, f.b * 3),
      new THREE.Vector3().fromArray(B.pos, f.c * 3), bc);
    const interp = (arr, size, k) => arr[f.a * size + k] * bc.x + arr[f.b * size + k] * bc.y + arr[f.c * size + k] * bc.z;
    const u = interp(B.uv, 2, 0), v = interp(B.uv, 2, 1);
    const tu = new THREE.Vector3(interp(B.tu, 3, 0), interp(B.tu, 3, 1), interp(B.tu, 3, 2)).normalize();
    const tv = new THREE.Vector3(interp(B.tv, 3, 0), interp(B.tv, 3, 1), interp(B.tv, 3, 2)).normalize();
    const S = this.groom.size;
    // the brush is the same size in the world wherever it lands in the atlas
    const [rx, ry] = this.body.brushTexels(u, v, BRUSH, S);
    const steps = Math.max(1, Math.ceil(d.length() / (BRUSH * 0.3)));
    for (let k = 0; k < steps; k++) this.groom.paint(u, v, d.dot(tu), d.dot(tv), 0.42, rx, ry);
  }

  _hover(e) {
    if (this._toyHit(e)) { this.canvas.dataset.hover = 'stick'; return; }
    if (this.mode === 'toy' || this._stickHit(e)) { this.canvas.dataset.hover = this._stickHit(e) ? 'stick' : ''; return; }
    this.canvas.dataset.hover = this._cast(e) ? 'body' : '';
  }

  _up(e) {
    const p = this.ptrs.get(e.pointerId);
    this.ptrs.delete(e.pointerId);
    if (!p) return;
    if (p.kind === 'hand') {
      if (e.shiftKey) this.pins.set(e.pointerId, p.i);
      else this.soft.release(e.pointerId);
      this.canvas.dataset.grabbing = this.soft.grabs.size ? '1' : '';
    } else if (p.kind === 'finger') {
      this.soft.spheres = this.soft.spheres.filter((s) => s !== p.sphere);
    } else if (p.kind === 'toy') {
      this.play?.dragEnd();
    }
  }

  update(dt) {
    for (const p of this.ptrs.values()) if (p.kind === 'finger') { p.t += dt; this._fingerTo(p, p.e); }
  }
}
