// Manju, the hostel guard. Roams all three floors; when he spots you he stares you down, then chases.
// He is only drawn where there is light on him (your torch, a live tube light, moonlight outside):
// in the dark you can hear him but not see him, except for his eyes while he is staring at you.
//
//   roam -> idle (smoking) -> roam ...          wandering corridors and stairs on every floor
//   investigate                                  walks to a noise he heard (running, landing)
//   lured                                        the music player: hurries over and stands there glaring at it while it plays
//   stare                                        spotted you: stops, turns, eyes flare (~1.5 s)
//   chase                                        runs at you; opens/bursts doors; loses you after ~6 s unseen
//   search                                       looks round your last known spot, checks nearby, gives up
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const SCALE = 1.23;                         // model is 1.40 m; ~1.72 m in game
const EYE_H = 1.29 * SCALE;
const SPEED = { roam: 1.25, investigate: 1.7, chase: 4.6, search: 1.5, lured: 2.7 };
const CORR = { xo0: -31.2, xi0: -29.5, xi1: 23.6, xo1: 25.3, zo0: -8.75, zi0: -7.05, zi1: 22.8, zo1: 24.5 };   // south corridor moved 7.4 m (wing stretch)
const STAIR_RECTS = [[-29.5, -26.15, 3.8, 9.3], [20.58, 23.6, 3.8, 9.35]];
const inCorridor = (x, z) => {
  const inO = x > CORR.xo0 && x < CORR.xo1 && z > CORR.zo0 && z < CORR.zo1, inI = x > CORR.xi0 && x < CORR.xi1 && z > CORR.zi0 && z < CORR.zi1;
  return (inO && !inI) || STAIR_RECTS.some(([a, b, c, d]) => x > a && x < b && z > c && z < d);
};
const rnd = (a, b) => a + Math.random() * (b - a);
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

function glowTexture(rgb = '255,40,20') {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,230,220,1)'); grd.addColorStop(0.18, `rgba(${rgb},0.95)`); grd.addColorStop(0.5, 'rgba(200,0,0,0.25)'); grd.addColorStop(1, 'rgba(120,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Manju {
  constructor(o) {
    // o: { scene, camera, getCollider, nav, roomDoors, audio, flickers, onCatch }
    Object.assign(this, o);
    this.state = 'off'; this.enabled = true; this.god = false;
    this.pos = new THREE.Vector3(); this.yaw = 0;
    this.path = []; this.pathFrom = new THREE.Vector3(); this.repathT = 0;
    this.timer = 0; this.awareness = 0; this.lostT = 0; this.seeing = false;
    this.lastKnown = new THREE.Vector3(); this.searchStops = 0;
    this.visible = false; this.flickT = 0; this.light = 0;
    this.alert = 0; this.prox = 0; this.stepDist = 0; this.breathT = 0; this.senseT = 0; this.lightT = 0;
    this.speedBoost = 1;                       // main raises this for the 8 s reinforced response
    this.doorWait = null;
    this.rc = new THREE.Raycaster(); this.rc.firstHitOnly = true;
    this.ready = false;
  }

  async load(url) {
    const gltf = await new GLTFLoader().loadAsync(url);
    const root = this.root = gltf.scene;
    root.updateMatrixWorld(true);
    this.head = root.getObjectByName('head');
    this.ember = root.getObjectByName('ember');
    this.smokes = [0, 1, 2, 3, 4].map((i) => root.getObjectByName('smoke' + i)).filter(Boolean);
    if (this.ember) {                                  // the joint's tip: a small orange glow that swells on each drag
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('255,150,60'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: true }));
      sp.userData.noRetro = true; sp.scale.setScalar(0.035); this.ember.add(sp); this.emberGlow = sp;   // ~4 cm, swells with the drag
    }
    // eyes: two glow sprites parented to the head bone, at the painted eyes
    let zFront = 0.1;
    root.traverse((m) => {
      if (!m.isSkinnedMesh) return;
      m.frustumCulled = false;
      const p = m.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i), x = p.getX(i); if (y > 1.25 && y < 1.32 && Math.abs(x) < 0.06) zFront = Math.max(zFront, p.getZ(i)); }
    });
    const tex = glowTexture();
    this.eyes = [-1, 1].map((s) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: true }));
      sp.userData.noRetro = true;
      const w = new THREE.Vector3(s * 0.034, 1.288, zFront + 0.012);
      this.head.worldToLocal(w); sp.position.copy(w);
      this.head.add(sp); return sp;
    });
    root.scale.setScalar(SCALE);
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = {};
    for (const clip of gltf.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
    this.play('Idle', 0);
    root.visible = false;
    this.scene.add(root);
    this.ready = true;
    return root;
  }

  play(name, fade = 0.25) {
    const a = this.actions[name]; if (!a || this.cur === a) return a;
    a.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (this.cur) this.cur.fadeOut(fade);
    this.cur = a; return a;
  }

  // ------------------------------------------------------------------ helpers
  hitWall(from, to, extra = []) {
    const col = this.getCollider(); if (!col) return true;
    const d = new THREE.Vector3().subVectors(to, from), L = d.length(); if (L < 1e-3) return false;
    this.rc.set(from, d.normalize()); this.rc.far = L;
    if (this.rc.intersectObject(col, false).length) return true;
    if (extra.length && this.rc.intersectObjects(extra, false).length) return true;
    return false;
  }
  eye(out = new THREE.Vector3()) { return out.copy(this.pos).setY(this.pos.y + EYE_H); }
  chest(out = new THREE.Vector3()) { return out.copy(this.pos).setY(this.pos.y + 1.1); }
  closedDoorMeshes() { return this.roomDoors.list.filter((d) => d.open < 0.5).flatMap((d) => d.leaf.children); }

  // a random goal: mostly corridors and stairs on any floor, sometimes anywhere walkable
  randomGoal(near = null, radius = 0) {
    const n = this.nav, N = n.x.length;
    for (let t = 0; t < 200; t++) {
      const id = Math.floor(Math.random() * N);
      if (!n.reach[id]) continue;
      const x = n.x[id], z = n.z[id];
      if (near) { if (Math.hypot(x - near.x, z - near.z) > radius || Math.abs(n.y[id] - near.y) > 1) continue; }
      else {
        if (!inCorridor(x, z) && Math.random() > 0.12) continue;
        if (Math.hypot(x - this.pos.x, z - this.pos.z) < 10 && Math.abs(n.y[id] - this.pos.y) < 1) continue;
      }
      return id;
    }
    return -1;
  }
  goTo(target) {          // target: node id or Vector3
    const n = this.nav;
    const a = n.nearest(this.pos), b = typeof target === 'number' ? target : n.nearest(target);
    const p = n.path(a, b);
    if (!p) { this.path = []; return false; }
    this.path = n.smooth(p, this.pos) || p;
    this.pathFrom.copy(this.pos);
    return true;
  }

  spawnFar(from) {
    const n = this.nav;
    for (let t = 0; t < 400; t++) {
      const id = Math.floor(Math.random() * n.x.length);
      if (!n.reach[id] || !inCorridor(n.x[id], n.z[id])) continue;
      const d = Math.hypot(n.x[id] - from.x, n.z[id] - from.z), dy = Math.abs(n.y[id] - from.y);
      if (d < 28 && dy < 2) continue;
      this.place(n.pos(id)); return true;
    }
    return false;
  }
  // the music player (src/story.js): he drops whatever he was doing (a chase too), hurries over and stands there
  // glaring at it until it stops; then he searches round it. While he's at it he only notices you right next to him.
  distract(p, secs = 20) {
    if (['off', 'catch', 'cutscene'].includes(this.state) || !this.nav?.ready) return false;
    if (this.state === 'lured' && this.lurePos?.distanceTo(p) < 0.5) { this.timer = Math.max(this.timer, secs); return true; }
    this.lurePos = p.clone(); this.lastKnown.copy(p); this.awareness = 0; this.lostT = 0;
    this.setState('lured'); this.timer = secs;
    return true;
  }
  place(p) {
    this.pos.copy(p); this.path = []; this.awareness = 0; this.lostT = 0; this.doorWait = null;
    this.setState('roam');
  }
  setState(s) {
    this.state = s; this.timer = 0;
    if (s === 'idle') { this.play('Idle'); this.timer = rnd(8, 16); }                 // one or two full drags (the loop is 8 s)
    if (s === 'roam') { this.smokeBreak = rnd(14, 28); this.play('Walk'); const g = this.randomGoal(); if (g < 0 || !this.goTo(g)) this.path = []; }
    if (s === 'investigate') { this.play('Walk'); this.goTo(this.lastKnown); }
    if (s === 'lured') { this.play('Walk'); if (!this.goTo(this.lurePos)) this.path = []; }
    if (s === 'stare') { this.play('Stare', 0.15); this.timer = 1.5; this.path = []; this.audio.stareSting?.(); }
    if (s === 'chase') { this.play('Chase', 0.15); this.repathT = 0; this.lostT = 0; }
    if (s === 'search') { this.play('Idle'); this.timer = rnd(3.5, 5); this.searchStops = 3; this.path = []; }
  }

  // ------------------------------------------------------------------ per frame
  // ctx: { feet, eyePos, camDir, torchOn, torchI, noise, hidden }
  update(dt, ctx) {
    if (this.state === 'cutscene') return;                 // the intro drives him (src/story.js)
    if (!this.ready || !this.nav?.ready || this.state === 'off' || !this.enabled) { if (this.root) this.root.visible = false; return; }
    this.lit = ctx.lit || 0;                               // corridor lights on (0..1): he sees further and runs faster
    const P = ctx.feet;
    // ---------- senses (10 Hz)
    this.senseT -= dt;
    if (this.senseT <= 0) {
      this.senseT = 0.1;
      this.sense(ctx, 0.1);
    }
    const dist = Math.hypot(P.x - this.pos.x, P.z - this.pos.z), dy = Math.abs(P.y - this.pos.y);
    // ---------- state machine
    switch (this.state) {
      case 'roam':
        if (!this.path.length) { if (Math.random() < 0.75) this.setState('idle'); else this.setState('roam'); }
        else if ((this.smokeBreak -= dt) <= 0) { this.setState('idle'); }          // stops mid-patrol for a smoke
        break;
      case 'idle':
        this.timer -= dt; if (this.timer <= 0) this.setState('roam');
        break;
      case 'investigate':
        if (!this.path.length) this.setState('search');
        break;
      case 'lured':
        this.timer -= dt;
        if (!this.path.length && !this.doorWait) { this.faceTowards(this.lurePos, dt, 4); if (this.cur !== this.actions.Idle) this.play('Idle', 0.3); }
        if (this.timer <= 0) { this.lastKnown.copy(this.lurePos); this.setState('search'); }
        break;
      case 'stare': {
        this.timer -= dt;
        this.faceTowards(P, dt, 10);
        if (!this.seeing) { this.lostT += dt; if (this.lostT > 1.2) { this.setState('investigate'); break; } } else this.lostT = 0;
        if (this.timer <= 0) this.setState('chase');
        break;
      }
      case 'chase': {
        if (this.seeing) { this.lostT = 0; this.lastKnown.copy(P); } else this.lostT += dt;
        this.repathT -= dt;
        if (this.repathT <= 0) { this.repathT = 0.35; if (!this.goTo(this.seeing ? P : this.lastKnown)) this.path = []; }
        if (!this.god && dist < 1.05 && dy < 1.2 && this.seeing) { this.state = 'catch'; this.play('Stare', 0.1); this.onCatch?.(this); return; }
        if (this.lostT > 6 || (!this.seeing && !this.path.length)) this.setState('search');
        break;
      }
      case 'search': {
        if (!this.path.length) {
          this.timer -= dt;
          this.yaw += Math.sin(performance.now() * 0.0011) * dt * 1.4;          // looking round
          if (this.timer <= 0) {
            if (this.searchStops-- > 0) { const g = this.randomGoal(this.lastKnown, 10); this.play('Walk'); if (g < 0 || !this.goTo(g)) this.path = []; this.timer = rnd(2, 3.5); }
            else this.setState('roam');
          } else if (this.cur !== this.actions.Idle) this.play('Idle');
        }
        break;
      }
      case 'catch': return;
    }
    // ---------- movement along the path (stops for doors)
    const sp = this.state === 'chase' ? SPEED.chase * this.speedBoost * (dist > 18 ? 1.15 : 1) * (1 + 0.22 * this.lit) : SPEED[this.state] || 0;
    if (this.path.length && sp > 0 && this.state !== 'stare') this.follow(dt, sp, ctx);
    // ---------- animation speed, footsteps
    if (this.cur === this.actions.Walk) this.cur.timeScale = sp / 1.25;
    if (this.cur === this.actions.Chase) this.cur.timeScale = 1;
    this.mixer.update(dt);
    this.root.position.copy(this.pos); this.root.rotation.y = this.yaw;
    if (this.ember && this.state === 'chase') this.ember.scale.setScalar(0.6);
    // ---------- threat level for music / post (alert) and proximity heartbeat
    const target = this.state === 'chase' ? 1 : this.state === 'stare' ? 0.7 : this.state === 'search' ? 0.35 : 0;
    this.alert += (target - this.alert) * Math.min(1, dt * (target > this.alert ? 3 : 0.35));
    this.prox = Math.max(0, 1 - Math.hypot(dist, dy * 2) / 20);
    this.sounds(dt, ctx, dist, dy);
    // ---------- light on him decides whether you can see him (15 Hz)
    this.lightT -= dt;
    if (this.lightT <= 0) { this.lightT = 1 / 15; this.light = this.lightLevel(ctx); }
    this.updateVisibility(dt);
  }

  sense(ctx, dt) {
    const P = ctx.eyePos, E = this.eye();
    const to = new THREE.Vector3().subVectors(P, E), d = to.length();
    const flat = Math.atan2(to.x, to.z), off = Math.abs(angDiff(flat, this.yaw));
    let range = (ctx.torchOn ? 22 : 8) * (1 + 0.8 * (ctx.lit || 0)); if (ctx.crouch) range *= 0.7;
    const inCone = off < 1.05 || d < 2.5 || this.state === 'chase' || this.state === 'stare';
    this.seeing = false;
    if (d < range && inCone && !ctx.hidden && !this.hitWall(E, P, this.closedDoorMeshes())) this.seeing = true;
    // torch straight in his face: noticed at once
    let blinded = false;
    if (ctx.torchOn && d < 16) {
      const toHim = new THREE.Vector3().subVectors(this.chest(), P).normalize();
      if (toHim.dot(ctx.camDir) > 0.96 && !this.hitWall(P, this.chest(), this.closedDoorMeshes())) { blinded = true; this.seeing = true; }
    }
    if (this.state === 'lured' && d > 3) this.seeing = false;          // busy with the music
    if (this.seeing) this.awareness += dt * (blinded ? 6 : 1.1 + (1 - d / range) * 2.8);
    else this.awareness = Math.max(0, this.awareness - dt * 0.35);
    const calm = this.state === 'roam' || this.state === 'idle' || this.state === 'investigate' || this.state === 'search' || this.state === 'lured';
    if (calm && this.awareness >= 1) { this.awareness = 1; this.lastKnown.copy(ctx.feet); this.setState('stare'); return; }
    // hearing: running / landing nearby makes him come and look
    if (calm && this.state !== 'investigate' && this.state !== 'lured' && ctx.noise > 0) {
      const hd = Math.hypot(ctx.feet.x - this.pos.x, ctx.feet.z - this.pos.z) + Math.abs(ctx.feet.y - this.pos.y) * 3;
      if (hd < ctx.noise) { this.lastKnown.copy(ctx.feet); this.awareness = Math.max(this.awareness, 0.35); this.setState('investigate'); }
    }
  }

  faceTowards(p, dt, rate = 6) {
    const want = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    this.yaw += angDiff(want, this.yaw) * Math.min(1, dt * rate);
  }

  follow(dt, speed, ctx) {
    const n = this.nav;
    // a closed door in the way? stop, then open it (bang on it first if you're hiding behind it)
    if (this.doorWait) {
      this.doorWait.t -= dt;
      this.faceTowards(new THREE.Vector3(this.doorWait.d.r.x, 0, this.doorWait.d.r.z), dt, 8);
      if (this.doorWait.bang && this.doorWait.t < this.doorWait.nextBang) { this.doorWait.nextBang -= 0.75; this.audio.slam?.(this.pan(ctx)); }
      if (this.doorWait.t <= 0) {
        const d = this.doorWait.d; this.doorWait = null;
        if (d.target === 0) { this.roomDoors.toggle(d, this.pos); for (const e of d.group || [d]) e.speed = this.state === 'chase' ? 6 : 2; }
        if (this.state === 'chase') this.audio.slam?.(this.pan(ctx));
      }
      return;
    }
    const next = n.pos(this.path[0]);
    const dx = next.x - this.pos.x, dz = next.z - this.pos.z, L = Math.hypot(dx, dz);
    const door = this.doorAhead(next);
    if (door) {
      const behind = this.state === 'chase' && Math.hypot(ctx.feet.x - door.r.x, ctx.feet.z - door.r.z) < 7;
      this.doorWait = { d: door, t: behind ? 2.3 : this.state === 'chase' ? 0.5 : 0.8, bang: behind, nextBang: 2.0 };
      this.play(this.state === 'chase' ? 'Stare' : 'Idle', 0.15);
      return;
    }
    if (this.cur !== this.actions[this.state === 'chase' ? 'Chase' : 'Walk']) this.play(this.state === 'chase' ? 'Chase' : 'Walk');
    const step = speed * dt;
    if (L <= step || L < 0.12) {
      this.pos.copy(next); this.pathFrom.copy(next); this.path.shift();
    } else {
      this.pos.x += dx / L * step; this.pos.z += dz / L * step;
      // height follows the segment (stairs)
      const total = Math.hypot(next.x - this.pathFrom.x, next.z - this.pathFrom.z) || 1;
      const t = 1 - Math.min(1, L / total);
      this.pos.y = this.pathFrom.y + (next.y - this.pathFrom.y) * t;
      const want = Math.atan2(dx, dz);
      this.yaw += angDiff(want, this.yaw) * Math.min(1, dt * (this.state === 'chase' ? 10 : 5));
    }
    this.stepDist += step;
  }

  doorAhead(next) {
    for (const d of this.roomDoors.list) {
      if (d.target !== 0 || d.open > 0.3) continue;
      const r = d.r; if (Math.abs(r.y - this.pos.y) > 1.2) continue;
      if (Math.hypot(r.x - this.pos.x, r.z - this.pos.z) > 1.4) continue;
      // does the segment to the next node cross this door's plane within its width?
      const a = r.axis === 'x' ? this.pos.z - r.z : this.pos.x - r.x, b = r.axis === 'x' ? next.z - r.z : next.x - r.x;
      if (Math.sign(a) === Math.sign(b) && Math.abs(b) > 0.05) continue;
      const along = r.axis === 'x' ? (this.pos.x + next.x) / 2 - r.x : (this.pos.z + next.z) / 2 - r.z;
      if (Math.abs(along) < r.w / 2 + 0.3) return d;
    }
    return null;
  }

  pan(ctx) {
    const right = new THREE.Vector3(-ctx.camDir.z, 0, ctx.camDir.x).normalize();
    const to = new THREE.Vector3(this.pos.x - ctx.feet.x, 0, this.pos.z - ctx.feet.z).normalize();
    return to.dot(right);
  }

  sounds(dt, ctx, dist, dy) {
    const a = this.audio, far = Math.min(1, dist / 20 + (dy > 2.5 ? 0.35 : 0));
    if (dist > 24) return;
    const stride = this.state === 'chase' ? 1.0 : 0.62;
    if (this.stepDist > stride) {
      this.stepDist = 0;
      const vol = (this.state === 'chase' ? 0.6 : 0.32) * (1 - far * 0.85);
      a.slapAt?.(this.pan(ctx), far, vol);
    }
    this.breathT -= dt;
    if (this.breathT <= 0) {
      if (this.state === 'chase' && dist < 9) { this.breathT = 1.3; a.breath?.(this.pan(ctx)); }
      else if ((this.state === 'idle') && dist < 6) { this.breathT = rnd(1.5, 3); a.crackle?.(this.pan(ctx), far); }
      else this.breathT = 0.5;
    }
  }

  // how much light is on him right now
  lightLevel(ctx) {
    const C = this.chest(); let L = 0;
    // moonlight outdoors (no ceiling above him)
    const col = this.getCollider();
    this.rc.set(this.eye(), new THREE.Vector3(0, 1, 0)); this.rc.far = 6;
    if (col && !this.rc.intersectObject(col, false).length) L += 0.4;
    // the player's torch
    if (ctx.torchI > 0.5) {
      const v = new THREE.Vector3().subVectors(C, ctx.eyePos), d = v.length();
      if (d < 23) {
        const cos = v.normalize().dot(ctx.camDir);
        const edge = THREE.MathUtils.smoothstep(cos, Math.cos(0.62), Math.cos(0.38));
        if (edge > 0 && !this.hitWall(ctx.eyePos, C)) L += edge * (1 - d / 23) * 1.4 * (ctx.torchI / 6);
      }
    }
    // corridor tubes that are on
    for (const f of this.flickers) {
      if (f.pl.intensity <= 0) continue;
      const d = f.pl.position.distanceTo(C); if (d > 9) continue;
      if (!this.hitWall(f.pl.position, C)) L += (f.pl.intensity / f.base) * (1 - d / 9);
    }
    return L;
  }

  updateVisibility(dt) {
    const want = this.light > 0.22;
    if (want !== this.visible) { this.visible = want; this.flickT = 0.16; }
    let show = this.visible;
    if (this.flickT > 0) { this.flickT -= dt; show = Math.random() < 0.5; }          // analog stutter in and out
    else if (show && this.light < 0.32 && Math.random() < 0.06) show = false;         // edge of the light: drops out
    this.root.visible = true;
    this.root.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) o.visible = show; });
    const smoking = this.cur === this.actions.Idle && (this.state === 'idle' || this.state === 'search');
    for (const sm of this.smokes) sm.traverse((o) => { if (o.isMesh) o.visible = show && smoking; });
    if (this.ember) { this.ember.traverse((o) => { if (o.isMesh) o.visible = show || smoking; }); this.emberGlow.visible = smoking; }
    // eyes: dim when he's calm and lit; bright when he's after you; while staring they show even in the dark
    const staring = this.state === 'stare' || this.state === 'catch';
    const alertEyes = staring || this.state === 'chase';
    const eyeOn = show || staring;
    for (const e of this.eyes) {
      e.visible = eyeOn;
      const s = (alertEyes ? 0.13 : 0.06) * (0.92 + Math.random() * 0.08);
      e.scale.setScalar(s / SCALE);
      e.material.opacity = staring && !show ? 0.75 : alertEyes ? 1 : 0.5;
    }
  }
}
