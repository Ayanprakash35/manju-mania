// Shared base for floor-bound characters (Mutty and Zoya). Manju keeps his own implementation.
//
// A FloorNPC owns a GLTF root, a Mixer, a walk/crawl clip, a nav grid (or a slice of one) and a simple
// "move along the smoothed path" loop. Subclasses decide when to move, what to play and how visible they are.
// Floor bounds are enforced twice: random/spawn goals are filtered by `floorRange`, and goTo() rejects any
// target outside it. That is what stops a ground-floor character from pathing upstairs.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// same corridor / stair footprint as manju.js
const CORR = { xo0: -31.2, xi0: -29.5, xi1: 23.6, xo1: 25.3, zo0: -8.75, zi0: -7.05, zi1: 15.4, zo1: 17.1 };
const STAIR_RECTS = [[-29.5, -26.15, 3.8, 9.3], [20.58, 23.6, 3.8, 9.35]];

const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

export const inStair = (x, z) => STAIR_RECTS.some(([a, b, c, d]) => x > a && x < b && z > c && z < d);

export const inCorridor = (x, z) => {
  const inO = x > CORR.xo0 && x < CORR.xo1 && z > CORR.zo0 && z < CORR.zo1;
  const inI = x > CORR.xi0 && x < CORR.xi1 && z > CORR.zi0 && z < CORR.zi1;
  return (inO && !inI) || inStair(x, z);
};

function glowTexture(rgb = '255,40,20') {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,230,220,1)'); grd.addColorStop(0.18, `rgba(${rgb},0.95)`); grd.addColorStop(0.5, 'rgba(200,0,0,0.25)'); grd.addColorStop(1, 'rgba(120,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function eyePoint(v) {
  if (v.isVector3) return v.clone();
  if (Array.isArray(v)) return new THREE.Vector3(v[0] || 0, v[1] || 0, v[2] || 0);
  return new THREE.Vector3(v?.x || 0, v?.y || 0, v?.z || 0);
}

export class FloorNPC {
  constructor({ scene, camera, getCollider, roomDoors, audio, flickers = null } = {}) {
    Object.assign(this, { scene, camera, getCollider, roomDoors, audio });
    this.flickers = flickers || [];

    this.root = null; this.mixer = null; this.actions = {}; this.cur = null;
    this.head = null; this.eyes = [];
    this.pos = new THREE.Vector3(); this.yaw = 0;
    this.path = []; this.state = 'off';
    this.ready = false; this.nav = null; this.doorWait = null;
    this.stepDist = 0;
    this.eyeH = 1.3; this.chestH = 1.1;
    this.floorRange = [-Infinity, Infinity];
    this.scale = 1; this.eyeScale = 0.06;
    this.moveClip = 'Walk'; this.idleClip = 'Idle'; this.turnRate = 6;
    this.pathFrom = new THREE.Vector3();
    this.rc = new THREE.Raycaster(); this.rc.firstHitOnly = true;
    this.light = 0; this.lightT = 0;
    this._next = new THREE.Vector3(); this._eye = new THREE.Vector3();
    this._chest = new THREE.Vector3(); this._dir = new THREE.Vector3();
  }

  // ------------------------------------------------------------------ model
  async load(url, { scale = 1, eyeLocal = null, eyeScale = 0.06 } = {}) {
    const gltf = await new GLTFLoader().loadAsync(url);
    const root = this.root = gltf.scene;
    root.updateMatrixWorld(true);

    this.scale = scale;
    this.eyeScale = eyeScale;
    this.head = root.getObjectByName('head') || root;
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = {};
    for (const clip of gltf.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
    this.cur = null;

    if (eyeLocal) {
      let pts = Array.isArray(eyeLocal) && eyeLocal.length && (Array.isArray(eyeLocal[0]) || eyeLocal[0]?.isVector3)
        ? eyeLocal.map(eyePoint) : [eyePoint(eyeLocal)];
      if (pts.length === 1) {                         // one point means "mirror it across x"
        const p = pts[0], ox = Math.abs(p.x) || 0.03;
        pts = [p.clone().setX(-ox), p.clone().setX(ox)];
      }
      const tex = glowTexture();
      const parent = this.head || root;
      this.eyes = pts.map((p) => {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({
          map: tex, color: 0xffffff, blending: THREE.AdditiveBlending,
          depthWrite: false, transparent: true, fog: true,
        }));
        sp.userData.noRetro = true;
        sp.position.copy(p);
        sp.scale.setScalar(eyeScale / scale);
        parent.add(sp);
        return sp;
      });
    } else this.eyes = [];

    root.scale.setScalar(scale);
    root.visible = false;
    this.scene?.add(root);
    this.ready = true;
    return root;
  }

  play(name, fade = 0.2, once = false) {
    const a = this.actions?.[name]; if (!a) return null;
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    a.clampWhenFinished = !!once;
    if (a === this.cur) return a;
    a.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (this.cur) this.cur.fadeOut(fade);
    this.cur = a;
    return a;
  }

  setNav(nav) { this.nav = nav || null; }

  // ------------------------------------------------------------------ placement
  spawnFar(from, minDist = 18) {
    const n = this.nav; if (!n?.ready) return false;
    const N = n.x.length; let fallback = -1;
    for (let t = 0; t < 500; t++) {
      const id = Math.floor(Math.random() * N);
      if (n.reach && !n.reach[id]) continue;
      if (!this._inFloor(n.y[id])) continue;
      const d = Math.hypot(n.x[id] - from.x, n.z[id] - from.z);
      if (d < minDist) continue;
      if (fallback < 0) fallback = id;
      if (!inCorridor(n.x[id], n.z[id])) continue;
      this.place(n.pos(id)); return true;
    }
    if (fallback >= 0) { this.place(n.pos(fallback)); return true; }
    // random probing failed (tiny slice): deterministic scan for the farthest reachable node
    let best = -1, bd = -Infinity;
    for (let id = 0; id < N; id++) {
      if (n.reach && !n.reach[id]) continue;
      if (!this._inFloor(n.y[id])) continue;
      const d = Math.hypot(n.x[id] - from.x, n.z[id] - from.z);
      if (d > bd) { bd = d; best = id; }
    }
    if (best < 0 || bd < minDist) return false;
    this.place(n.pos(best)); return true;
  }

  place(p) {
    this.pos.copy(p);
    this.path = []; this.doorWait = null;
    this.pathFrom.copy(p);
    this.stepDist = 0;
    this.onPlace();
  }

  reset() {
    this.state = 'off';
    if (this.root) this.root.visible = false;
    this.path = []; this.doorWait = null;
    this.stepDist = 0;
    this.onReset();
  }

  onPlace() {}
  onReset() {}

  // ------------------------------------------------------------------ navigation
  _inFloor(y) { const [lo, hi] = this.floorRange || [-Infinity, Infinity]; return y >= lo - 1e-3 && y <= hi + 1e-3; }

  // closest reachable node that is actually allowed on this floor (never an unrestricted nav.nearest)
  nearestAllowed(p) {
    const n = this.nav; if (!n?.ready) return -1;
    let best = -1, bd = Infinity;
    for (let id = 0; id < n.x.length; id++) {
      if (n.reach && !n.reach[id]) continue;
      const y = n.y[id]; if (!this._inFloor(y)) continue;
      const d = (n.x[id] - p.x) ** 2 + (n.z[id] - p.z) ** 2 + (y - p.y) ** 2 * 0.1;
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  }

  goTo(target) {
    const n = this.nav; if (!n?.ready) return false;
    let b;
    if (typeof target === 'number') {
      if (target < 0 || target >= n.x.length || !this._inFloor(n.y[target])) return false;
      b = target;
    } else {
      if (!target || !this._inFloor(target.y)) return false;
      b = n.nearest(target);
      if (b < 0 || !this._inFloor(n.y[b])) return false;
    }
    const a = n.nearest(this.pos);
    if (a < 0) { this.path = []; return false; }
    const p = n.path(a, b);
    if (!p) { this.path = []; return false; }
    this.path = n.smooth(p, this.pos) || p;
    this.pathFrom.copy(this.pos);
    return true;
  }

  randomGoal(near = null, radius = 0, corridorOnly = false) {
    const n = this.nav; if (!n?.ready) return -1;
    const N = n.x.length; let fallback = -1;
    for (let t = 0; t < 400; t++) {
      const id = Math.floor(Math.random() * N);
      if (n.reach && !n.reach[id]) continue;
      const y = n.y[id], x = n.x[id], z = n.z[id];
      if (!this._inFloor(y)) continue;
      if (near) {
        if (radius > 0 && Math.hypot(x - near.x, z - near.z) > radius) continue;
        if (Math.abs(y - near.y) > 1) continue;
        if (corridorOnly && !inCorridor(x, z)) continue;
        return id;
      }
      if (corridorOnly ? !inCorridor(x, z) : (!inCorridor(x, z) && Math.random() > 0.12)) continue;
      if (Math.hypot(x - this.pos.x, z - this.pos.z) < 10 && Math.abs(y - this.pos.y) < 1) continue;
      if (fallback < 0) fallback = id;
      if (inCorridor(x, z)) return id;
    }
    // a tight near/radius can exhaust random probing; scan once for the nearest valid node
    if (near) {
      let best = -1, bd = Infinity;
      for (let id = 0; id < N; id++) {
        if (n.reach && !n.reach[id]) continue;
        const y = n.y[id]; if (!this._inFloor(y) || Math.abs(y - near.y) > 1) continue;
        if (corridorOnly && !inCorridor(n.x[id], n.z[id])) continue;
        const d = Math.hypot(n.x[id] - near.x, n.z[id] - near.z);
        if (radius > 0 && d > radius) continue;
        if (d < bd) { bd = d; best = id; }
      }
      return best;
    }
    return fallback;
  }

  // ------------------------------------------------------------------ movement
  follow(dt, speed) {
    const n = this.nav; if (!n?.ready || !this.path.length) return false;

    if (this.doorWait) {
      this.doorWait.t -= dt;
      const d = this.doorWait.d;
      this.faceTowards(new THREE.Vector3(d.r.x, this.pos.y, d.r.z), dt, 8);
      if (this.doorWait.t <= 0) {
        this.doorWait = null;
        if (d.target === 0) {
          this.roomDoors?.toggle?.(d, this.pos);
          for (const e of d.group || [d]) e.speed = this.state === 'chase' ? 5 : 2.2;
        }
      }
      return false;
    }

    const next = n.pos(this.path[0], this._next);
    const dx = next.x - this.pos.x, dz = next.z - this.pos.z, L = Math.hypot(dx, dz);

    const door = this.doorAhead(next);
    if (door) {
      this.doorWait = { d: door, t: 0.35 };
      this.play(this.idleClip || this.moveClip, 0.12);
      return false;
    }

    this.play(this.moveClip);
    const step = speed * dt;
    if (L <= step || L < 0.12) {
      this.pos.copy(next);
      this.pathFrom.copy(next);
      this.path.shift();
    } else {
      this.pos.x += dx / L * step;
      this.pos.z += dz / L * step;
      // height follows the current segment, which keeps stairs smooth
      const total = Math.hypot(next.x - this.pathFrom.x, next.z - this.pathFrom.z) || 1;
      const t = 1 - Math.min(1, L / total);
      this.pos.y = this.pathFrom.y + (next.y - this.pathFrom.y) * t;
      const want = Math.atan2(dx, dz);
      this.yaw += angDiff(want, this.yaw) * Math.min(1, dt * this.turnRate);
    }
    this.stepDist += Math.min(step, L);
    return true;
  }

  doorAhead(next) {
    if (!this.roomDoors?.list) return null;
    for (const d of this.roomDoors.list) {
      if (d.target !== 0 || d.open >= 0.3) continue;
      const r = d.r;
      if (Math.abs(r.y - this.pos.y) > 1.2) continue;
      if (Math.hypot(r.x - this.pos.x, r.z - this.pos.z) > 1.4) continue;
      // does the segment to the next node cross this door's plane within its width?
      const a = r.axis === 'x' ? this.pos.z - r.z : this.pos.x - r.x;
      const b = r.axis === 'x' ? next.z - r.z : next.x - r.x;
      if (Math.sign(a) === Math.sign(b) && Math.abs(b) > 0.05) continue;
      const along = r.axis === 'x' ? (this.pos.x + next.x) / 2 - r.x : (this.pos.z + next.z) / 2 - r.z;
      if (Math.abs(along) < r.w / 2 + 0.3) return d;
    }
    return null;
  }

  faceTowards(p, dt, rate = 6) {
    const want = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    this.yaw += angDiff(want, this.yaw) * Math.min(1, dt * rate);
  }

  eye(out = new THREE.Vector3()) { return out.copy(this.pos).setY(this.pos.y + this.eyeH); }
  chest(out = new THREE.Vector3()) { return out.copy(this.pos).setY(this.pos.y + this.chestH); }

  // ------------------------------------------------------------------ world queries
  hitWall(from, to, extra = []) {
    const col = this.getCollider?.(); if (!col) return true;
    const d = this._dir.subVectors(to, from), L = d.length(); if (L < 1e-3) return false;
    this.rc.set(from, d.normalize()); this.rc.far = L;
    if (this.rc.intersectObject(col, false).length) return true;
    if (extra.length && this.rc.intersectObjects(extra, false).length) return true;
    return false;
  }

  closedDoorMeshes() {
    const list = this.roomDoors?.list || [];
    return list.filter((d) => d.open < 0.5).flatMap((d) => d.leaf?.children || []);
  }

  // how much light is on this character right now (moonlight, torch, live corridor tubes)
  lightLevel(ctx) {
    const C = this.chest(this._chest); let L = 0;
    const col = this.getCollider?.();
    this.rc.set(this.eye(this._eye), new THREE.Vector3(0, 1, 0)); this.rc.far = 6;
    if (col && !this.rc.intersectObject(col, false).length) L += 0.4;
    const torchI = ctx.torchI || 0;
    if (torchI > 0.5) {
      const v = new THREE.Vector3().subVectors(C, ctx.eyePos), d = v.length();
      if (d < 17) {
        const cos = v.normalize().dot(ctx.camDir);
        const edge = THREE.MathUtils.smoothstep(cos, Math.cos(0.42), Math.cos(0.24));
        if (edge > 0 && !this.hitWall(ctx.eyePos, C)) L += edge * (1 - d / 17) * 1.4 * (torchI / 6);
      }
    }
    for (const f of this.flickers || []) {
      const pl = f.pl || f; if (!pl || pl.intensity <= 0) continue;
      const d = pl.position.distanceTo(C); if (d > 9) continue;
      if (!this.hitWall(pl.position, C)) L += ((pl.intensity / (f.base || pl.intensity || 1)) * (1 - d / 9));
    }
    return L;
  }

  // body toggles meshes; eye sprites stay independent so they can glow in the dark
  updateVisibility(dt, { body = true, eyes = false, eyeScale = null } = {}) {
    if (!this.root) return;
    this.root.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) o.visible = body; });
    const size = eyeScale == null ? this.eyeScale : eyeScale;
    for (const e of this.eyes || []) {
      e.visible = eyes;
      if (!eyes) continue;
      e.scale.setScalar(size / (this.scale || 1));
      e.material.opacity = body ? 0.9 : 1;
    }
  }

  syncRoot() {
    if (!this.root) return;
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
  }

  pan(ctx) {
    if (!ctx?.camDir || !ctx.feet) return 0;
    const right = new THREE.Vector3(-ctx.camDir.z, 0, ctx.camDir.x).normalize();
    const to = new THREE.Vector3(this.pos.x - ctx.feet.x, 0, this.pos.z - ctx.feet.z).normalize();
    return to.dot(right);
  }
}
