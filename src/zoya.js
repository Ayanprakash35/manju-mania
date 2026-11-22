// Dr Zoya, the first-floor warden. She never leaves her storey: patrols the corridors, stops to
// look around, and when she sees you she points and shouts for Manju. She does no damage and never
// chases — the threat is the guard she calls.
//
//   patrol (Walk 0.83 m/s) -> scan (LookAround, 3 s) -> patrol ...
//   spot   (Spot, 2 s)      first sight: turns, calls onAlert once, shouts down the corridor
//   point  (Point, up to 8 s) keeps pointing and tracking you until Manju gets close
import * as THREE from 'three';
import { FloorNPC } from './npc.js';

const WALK = 0.83;
const STRIDE = 0.62;
const SIGHT = 14;
const CONE = 1.0;
const rnd = (a, b) => a + Math.random() * (b - a);
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

// a small cold white glint, used for the glasses rather than glowing animal eyes
function glintTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.22, 'rgba(200,230,255,0.9)');
  grd.addColorStop(0.55, 'rgba(120,180,255,0.22)'); grd.addColorStop(1, 'rgba(80,140,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Zoya extends FloorNPC {
  constructor(o = {}) {
    super(o);
    this.onAlert = o.onAlert;
    this.onManjuNear = o.onManjuNear;
    this.onShout = o.onShout;
    this.moveClip = 'Walk';
    this.floorRange = [3.35, 4.65];
    this.eyeH = 1.6;
    this.chestH = 1.15;
    this.state = 'off';
    this.alert = 0; this.prox = 0;
    this.seeing = false; this.alerted = false;
    this.timer = 0; this.patrolT = rnd(8, 14); this.pointT = 0;
    this.senseT = 0; this.alertT = 0;
    this.lastSeen = new THREE.Vector3();
    this._eye = new THREE.Vector3(); this._target = new THREE.Vector3();
  }

  async load(url) {
    await super.load(url, { scale: 1 });                 // 1.73 m model, game height as authored
    const root = this.root;
    if (!root) return root;
    root.updateMatrixWorld(true);
    this.head = this.head || root.getObjectByName('head');
    // painted-on glasses: find the face surface, then put two tiny glints just in front of it
    let zFront = 0.13;
    root.traverse((m) => {
      if (!m.isSkinnedMesh) return;
      m.frustumCulled = false;
      const p = m.geometry?.attributes?.position; if (!p) return;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i), x = p.getX(i);
        if (y > 1.54 && y < 1.62 && Math.abs(x) < 0.09) zFront = Math.max(zFront, p.getZ(i));
      }
    });
    const tex = glintTexture(), head = this.head || root;
    this.eyes = [-1, 1].map((s) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false,
        transparent: true, fog: true, opacity: 0,
      }));
      sp.userData.noRetro = true;
      const w = new THREE.Vector3(s * 0.037, 1.585, zFront + 0.015);
      head.worldToLocal(w); sp.position.copy(w);
      sp.scale.setScalar(0.026);
      sp.visible = false;
      head.add(sp); return sp;
    });
    return root;
  }

  // the base class calls this from place()
  onPlace() {
    this.state = 'patrol';
    this.path = [];
    this.timer = 0; this.patrolT = rnd(8, 14);
    this.senseT = 0; this.alertT = 0;
    this.seeing = false; this.alerted = false;
    this.alert = 0;
    this.play('Walk', 0.2);
  }

  reset() {
    super.reset();
    this.state = 'off';
    if (this.root) this.root.visible = false;
    this.path = [];
    this.timer = 0; this.patrolT = rnd(8, 14); this.pointT = 0;
    this.senseT = 0; this.alertT = 0;
    this.seeing = false; this.alerted = false;
    this.alert = 0; this.prox = 0;
    this.lastSeen.set(0, 0, 0);
  }

  // ------------------------------------------------------------------ states
  patrol() {
    this.state = 'patrol';
    this.path = [];
    this.patrolT = rnd(8, 14);
    this.play('Walk', 0.25);
  }

  scan() {
    this.state = 'scan';
    this.path = [];
    this.timer = 3;
    this.alerted = false;
    this.play('LookAround', 0.25);
  }

  spot(ctx) {
    if (this.alerted) return;
    this.state = 'spot';
    this.path = [];
    this.timer = 2;
    this.alerted = true;
    this.lastSeen.copy(ctx.feet);
    this.play('Spot', 0.15, true);
    if (!this.onShout?.()) this.audio?.zoyaShout?.(this.pan(ctx));      // her recorded line if loaded, else the synth shout
    this.onAlert?.(ctx.feet.clone());
  }

  // ------------------------------------------------------------------ per frame
  // ctx: { feet, eyePos, camDir, hidden, ... }
  update(dt, ctx) {
    if (!ctx?.feet) return;
    if (this.state === 'off' || !this.ready || !this.nav?.ready || !this.root) {
      if (this.root) this.root.visible = false;
      return;
    }
    // the nav slice is first-floor-only; if she ever drifts off it, put her back on it
    if (this.pos.y < this.floorRange[0] - 0.3 || this.pos.y > this.floorRange[1] + 0.3) {
      const id = this.nav.nearest(this.pos, 8);
      if (id < 0) { this.state = 'off'; this.root.visible = false; return; }
      this.place(this.nav.pos(id));
      if (this.state === 'off') this.onPlace();
    }

    const P = ctx.feet;
    const dist = Math.hypot(P.x - this.pos.x, P.z - this.pos.z);
    const dy = Math.abs(P.y - this.pos.y);

    // ---------- sight (10 Hz)
    this.senseT -= dt;
    if (this.senseT <= 0) { this.senseT = 0.1; this.sense(ctx); }
    if (this.seeing && (this.state === 'patrol' || this.state === 'scan')) this.spot(ctx);

    // ---------- state machine
    switch (this.state) {
      case 'patrol':
        if ((this.patrolT -= dt) <= 0) { this.scan(); break; }
        if (!this.path.length) {
          const g = this.randomGoal(null, 0, true);
          if (g >= 0) this.goTo(g);
          if (!this.path.length) { this.scan(); break; }
        }
        this.follow(dt, WALK);
        if (this.cur === this.actions?.Walk) this.cur.timeScale = 0.85;
        break;

      case 'scan':
        this.timer -= dt;
        if (this.timer <= 0) this.patrol();
        break;

      case 'spot':
        this.timer -= dt;
        this.faceTowards(P, dt, 9);
        if (this.timer <= 0) {
          this.state = 'point';
          this.pointT = 0; this.alertT = 2;
          this.play('Point', 0.15);
        }
        break;

      case 'point':
        this.pointT += dt;
        if (this.seeing) this.faceTowards(P, dt, 9);
        this.alertT -= dt;
        if (this.alertT <= 0) {                         // keep the guard pointed at you
          this.alertT = 2;
          if (this.seeing) { this.lastSeen.copy(P); this.onAlert?.(P.clone()); }
        }
        if (this.pointT >= 8 || this.onManjuNear?.()) this.scan();
        break;
    }

    // ---------- animation / root / footsteps
    this.mixer?.update(dt);
    this.syncRoot();
    if (this.stepDist > STRIDE) {
      this.stepDist = 0;
      if (dist < 24) {
        const far = Math.min(1, dist / 20 + (dy > 2.5 ? 0.35 : 0));
        this.audio?.stepAt?.(this.pan(ctx), far, 0.22);
      }
    }

    // ---------- threat level (music/post) — she never chases, proximity stays zero
    const target = this.state === 'spot' || this.state === 'point' ? 0.5 : 0;
    this.alert += (target - this.alert) * Math.min(1, dt * (target > this.alert ? 6 : 2));
    this.prox = 0;

    // ---------- always drawn while active; glasses only glint when she is on to you
    this.root.visible = true;
    this.updateVisibility(dt, { body: true, eyes: false });
    const stare = this.state === 'spot' || this.state === 'point';
    for (const e of this.eyes || []) {
      e.visible = stare;
      if (stare) {
        e.material.opacity = 0.35 + 0.65 * this.alert;
        e.scale.setScalar(0.024 + 0.012 * this.alert);
      }
    }
  }

  // is the player on Zoya's floor, in front of her (or close), visible, and not hiding?
  sense(ctx) {
    this.seeing = false;
    const P = ctx.feet;
    if (ctx.hidden) return;
    if (P.y < this.floorRange[0] || P.y > this.floorRange[1]) return;
    const dx = P.x - this.pos.x, dz = P.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > SIGHT) return;
    if (dist > 3) {
      const off = Math.abs(angDiff(Math.atan2(dx, dz), this.yaw));
      if (off > CONE) return;
    }
    const target = ctx.eyePos || this._target.set(P.x, P.y + 1.6, P.z);
    if (this.hitWall(this.eye(this._eye), target, this.roomDoors ? this.closedDoorMeshes() : [])) return;
    this.seeing = true;
    this.lastSeen.copy(P);
  }
}
