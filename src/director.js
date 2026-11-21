// Scare director: paces small psychological-horror events instead of constant jump scares.
// Tension builds while you're indoors and in the dark; an event fires every so often, more often as tension
// rises, and resets it. Most events are ambiguous (did that door just move? were those my footsteps?).
//
//   follower   footsteps behind you that keep your pace and stop a beat after you stop
//   figure     a tall thin silhouette at the far end of the corridor / out in the fog; gone when you light it
//              up, get close, or look away
//   blackout   the torch dies for a moment; when it comes back the figure may be closer
//   lightDies  the tube light ahead pops and stays dead
//   doorCreak  a door ahead slowly swings open on its own
//   doorSlam   an open door somewhere behind you slams shut
//   knock      knocking from inside a room you're next to
//   whisper    a breathy whisper on one side
import * as THREE from 'three';

const rnd = (a, b) => a + Math.random() * (b - a);

function makeFigure() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x6a645e, fog: true });   // only ever half-lit: a grey shape at the edge of the torch
  const add = (geo, x, y, z, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); m.userData.noRetro = true; g.add(m); };
  add(new THREE.CylinderGeometry(0.17, 0.11, 0.8, 8), 0, 1.38, 0);           // torso
  add(new THREE.BoxGeometry(0.46, 0.08, 0.16), 0, 1.76, 0);                  // shoulders
  add(new THREE.SphereGeometry(0.12, 10, 8), 0.02, 1.93, 0, 0, -0.18);       // head, tilted
  add(new THREE.CylinderGeometry(0.035, 0.025, 0.95, 6), -0.24, 1.3, 0, 0, 0.05);   // long arms
  add(new THREE.CylinderGeometry(0.035, 0.025, 0.95, 6), 0.24, 1.3, 0, 0, -0.04);
  add(new THREE.CylinderGeometry(0.06, 0.04, 1.0, 6), -0.08, 0.5, 0);        // legs
  add(new THREE.CylinderGeometry(0.06, 0.04, 1.0, 6), 0.08, 0.5, 0);
  g.visible = false;
  return g;
}

export class Director {
  constructor({ scene, camera, player, getCollider, roomDoors, flickers, audio }) {
    Object.assign(this, { scene, camera, getCollider, roomDoors, flickers, audio, player });
    this.shape = makeFigure(); scene.add(this.shape);
    this.rc = new THREE.Raycaster(); this.rc.firstHitOnly = true;
    this.tension = 0; this.next = rnd(20, 35); this.torchOut = 0;
    this.fig = null; this.follow = null; this.lastPos = new THREE.Vector3(); this.wasMoving = false;
    this.recent = [];
    audio.onStep = () => this.onPlayerStep();
  }

  // ---- helpers ----
  hit(from, dir, far) {
    const col = this.getCollider(); if (!col) return null;
    this.rc.set(from, dir); this.rc.far = far;
    return this.rc.intersectObject(col, false)[0] || null;
  }
  indoors() { return !!this.hit(this.camera.position, new THREE.Vector3(0, 1, 0), 4); }
  fwd() { const f = new THREE.Vector3(); this.camera.getWorldDirection(f); f.y = 0; return f.normalize(); }
  panOf(p) {           // -1 left .. 1 right, from the camera's point of view
    const f = this.fwd(), r = new THREE.Vector3(-f.z, 0, f.x);
    const d = new THREE.Vector3().subVectors(p, this.camera.position); d.y = 0; d.normalize();
    return d.dot(r);
  }
  behind(p) { const d = new THREE.Vector3().subVectors(p, this.camera.position); d.y = 0; return d.normalize().dot(this.fwd()) < -0.2; }

  // ---- main loop ----
  update(dt, { moving, torchOn }) {
    const cam = this.camera.position;
    this.torchOut = Math.max(0, this.torchOut - dt);
    const inside = this.indoors();
    // tension: rises indoors and while the torch is off, slowly decays outside
    this.tension = Math.min(1, Math.max(0, this.tension + dt * (inside ? 0.012 : -0.004) + (torchOn ? 0 : dt * 0.01)));
    this.updateFigure(dt);
    this.updateFollower(moving);
    this.next -= dt * (0.6 + this.tension * 1.4);
    if (this.next <= 0 && !this.fig) {
      this.fire(inside);
      this.next = rnd(22, 45);
    }
    this.lastPos.copy(cam); this.wasMoving = moving;
  }

  fire(inside, forced) {
    const pool = forced ? [forced] : (inside
      ? ['follower', 'figure', 'figure', 'lightDies', 'doorCreak', 'doorSlam', 'knock', 'whisper', this.tension > 0.5 ? 'blackout' : 'whisper']
      : ['figure', 'figure', 'whisper', 'follower']);
    const choices = pool.filter((e) => !this.recent.includes(e));
    for (let tries = 0; tries < 6; tries++) {
      const e = (choices.length ? choices : pool)[Math.floor(Math.random() * (choices.length || pool.length))];
      if (this[e]?.()) { this.recent = [e, ...this.recent].slice(0, 3); this.tension *= 0.35; return e; }
    }
    return null;
  }
  force(name) { return this.fire(this.indoors(), name); }   // debug: __game.director.force('figure')

  // ---- events ----
  follower() {
    this.follow = { left: rnd(7, 11), stops: 0, pan: (Math.random() - 0.5) * 0.5 };
    return true;
  }
  onPlayerStep() {
    if (!this.follow) return;
    const f = this.follow;
    setTimeout(() => this.audio.stepAt(f.pan, 0.45, 0.32), 210 + Math.random() * 60);   // a beat behind yours
  }
  updateFollower(moving) {
    const f = this.follow; if (!f) return;
    if (!moving && this.wasMoving) {
      // you stopped... they take one more step
      setTimeout(() => this.audio.stepAt(f.pan, 0.45, 0.3), 420);
      if (++f.stops >= 2) this.follow = null;
    }
    f.left -= 1 / 60;
    if (f.left <= 0 && !moving) this.follow = null;
  }

  figureSpot(minD, maxD) {
    if (minD == null) [minD, maxD] = this.indoors() ? [6.5, 10] : [12, 18];   // just inside what the fog lets you see
    const cam = this.camera.position, f = this.fwd(), feet = cam.y - 1.43;
    const down = new THREE.Vector3(0, -1, 0);
    for (const d of [maxD, (minD + maxD) / 2, minD + 2, minD]) for (const yaw of [0.14, -0.14, 0.3, -0.3, 0]) {
      const dir = f.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const p = cam.clone().addScaledVector(dir, d);
      const fl = this.hit(new THREE.Vector3(p.x, feet + 1.6, p.z), down, 2.4);
      if (!fl || Math.abs(fl.point.y - feet) > 0.45) continue;            // same floor, no stairs or drops
      const head = new THREE.Vector3(p.x, fl.point.y + 1.5, p.z);
      const toHead = head.clone().sub(cam), L = toHead.length();
      if (this.hit(cam, toHead.normalize(), L - 0.4)) continue;              // must be in plain sight
      let tight = false;                                                     // not inside a wall
      for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) if (this.hit(head, new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), 0.3)) tight = true;
      if (tight) continue;
      return new THREE.Vector3(p.x, fl.point.y, p.z);
    }
    return null;
  }
  figure(minD, maxD) {
    const p = this.figureSpot(minD, maxD); if (!p) return false;
    this.figure_place(p);
    return true;
  }
  figure_place(p) {
    const g = this.shape; g.position.copy(p);
    g.lookAt(this.camera.position.x, p.y, this.camera.position.z);         // it faces you
    g.visible = true;
    this.fig = { t: 0, seen: 0, beat: false };
  }
  vanish(flicker = true) {
    this.shape.visible = false; this.fig = null;
    if (flicker) { this.torchOut = Math.max(this.torchOut, 0.12); for (const f of this.flickers) f.t += 2.2; }
  }
  updateFigure(dt) {
    const s = this.fig; if (!s) return;
    s.t += dt;
    const cam = this.camera.position, p = this.shape.position;
    const d = Math.hypot(p.x - cam.x, p.z - cam.z);
    const dir = new THREE.Vector3(p.x - cam.x, 0, p.z - cam.z).normalize();
    const look = dir.dot(this.fwd());                                        // 1 = dead ahead
    if (look > 0.8 && !s.beat) { s.beat = true; this.audio.heartbeat(5, 1.25); }
    if (d < 5) return this.vanish();                                          // never lets you reach it
    if (look > 0.97 && d < 10 && this.torchOut <= 0) { s.seen += dt; if (s.seen > 1.2) return this.vanish(); }   // lit by the torch
    if (s.t > 6 && look < 0.4) return this.vanish(false);                     // gone when you look back
    if (s.t > 14) return this.vanish();
  }

  blackout() {
    this.torchOut = rnd(1.4, 2.4);
    this.audio.breath((Math.random() - 0.5) * 0.6);
    // when the light comes back, something is standing closer than before
    if (Math.random() < 0.7) setTimeout(() => { if (!this.fig) this.figure(5.5, 8); }, this.torchOut * 1000 - 60);
    return true;
  }

  lightDies() {
    const cam = this.camera.position;
    let best = null, bd = 12;
    for (const f of this.flickers) {
      if (f.dead) continue;
      const d = f.pl.position.distanceTo(cam);
      if (d < bd) { bd = d; best = f; }
    }
    if (!best) return false;
    best.dead = true; this.audio.pop();
    return true;
  }

  nearDoors(maxD, filter) {
    const cam = this.camera.position;
    return this.roomDoors.list.filter((d) => d.r.kind === 'room' && Math.abs(d.r.y - (cam.y - 1.43)) < 1 && Math.hypot(d.r.x - cam.x, d.r.z - cam.z) < maxD && filter(d));
  }
  doorCreak() {
    const cam = this.camera.position;
    const ds = this.nearDoors(9, (d) => d.target === 0 && Math.hypot(d.r.x - cam.x, d.r.z - cam.z) > 3 && !this.behind(new THREE.Vector3(d.r.x, cam.y, d.r.z)));
    if (!ds.length) return false;
    const d = ds[Math.floor(Math.random() * ds.length)];
    this.roomDoors.toggle(d, cam); this.audio.door();
    // it only opens partway, slowly
    d.target = 0.3 + Math.random() * 0.15; d.speed = 0.12;
    return true;
  }
  doorSlam() {
    const cam = this.camera.position;
    const ds = this.nearDoors(14, (d) => d.target > 0 && this.behind(new THREE.Vector3(d.r.x, cam.y, d.r.z)));
    if (!ds.length) return false;
    const d = ds[0];
    for (const e of d.group || [d]) e.target = 0;
    setTimeout(() => this.audio.slam(this.panOf(new THREE.Vector3(d.r.x, 0, d.r.z))), 280);
    return true;
  }
  knock() {
    const ds = this.nearDoors(4.5, (d) => d.target === 0);
    if (!ds.length) return false;
    const d = ds[0];
    this.audio.knock(this.panOf(new THREE.Vector3(d.r.x, 0, d.r.z)), Math.random() < 0.5 ? 3 : 2);
    return true;
  }
  whisper() { this.audio.whisper(Math.random() < 0.5 ? -0.85 : 0.85); return true; }
}
