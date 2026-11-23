// The story layer: what you're trying to do, and the stuff you do it with.
//
// New game: a short context card, then the cutscene — you're sitting in room 15 with your laptop, tablet, music player
// and face mask out; it's past laptop submission, Manju barges in furious and everything gets sucked out of the room.
// Your things land in random rooms across all three floors. Objective 1: get them back (each shows how to use it when
// you pick it up). Objective 2 (once you have all four): turn on the corridor lights — 6 switches per floor; each one
// takes longer to hold on than the last, and every light that comes on makes it easier for them to find you.
//
// Items: laptop = the minimap (M: big map); tablet = everyone's position on the map; music player = throw it, it
// plays where it lands and pulls Manju, Mutty and Zoya over (90 s cooldown); face mask = click it on Zoya and she
// can't call Manju for 60 s (2 min cooldown); food (the Choco Pies and Lay's in room 15) = throw it and Mutty stops
// to eat it for 3 minutes, or right-click to eat it yourself (+1 heart).
// Rest-room cubicles: shut yourself in and nobody can see you, but stay longer than 10 s and Mutty comes in under
// the door.
import * as THREE from 'three';
import { icon } from './icons.js';

const CORR = { xo0: -31.2, xi0: -29.5, xi1: 23.6, xo1: 25.3, zo0: -8.75, zi0: -7.05, zi1: 22.8, zo1: 24.5 };
const FLOOR_Y = [0.766, 4.03, 7.17], CEIL_Y = [3.83, 6.97, 10.67];
export const floorOf = (y) => (y < 2.4 ? 0 : y < 5.6 ? 1 : 2);
const FLOOR_NAME = ['Ground floor', 'First floor', 'Second floor'];
const rnd = (a, b) => a + Math.random() * (b - a);

export const ITEMS = [
  { id: 'laptop', name: 'Laptop', icon: '💻', desc: 'Your laptop. The hostel map is open in the corner now: you, every room, the stairs. Press M for the big map.' },
  { id: 'tablet', name: 'Tablet', icon: '📱', desc: 'Your tablet. It tracks everyone — Manju, Mutty and Zoya show up on the map, wherever they are.' },
  { id: 'music', name: 'Music player', icon: '🎵', desc: 'Select it (3), aim, and click to throw it. It blasts music where it lands and pulls Manju, Mutty and Zoya over to it. Back in your pocket after 90 seconds.' },
  { id: 'mask', name: 'Face mask', icon: '😷', desc: 'Select it (4), get close to Zoya and click on her. Masked, she can\'t call Manju for 60 seconds. Recharges in 2 minutes.' },
];
const FOOD = { id: 'food', name: 'Food', icon: '🍫', desc: 'Select it (5). Click to throw it: Mutty stops to eat it for 3 minutes. Right-click to eat it yourself (+1 heart).' };
const SLOTS = [...ITEMS, FOOD];
const CD = { music: 90, mask: 120, food: 15 };
const MUSIC_TIME = 15, MASK_TIME = 60, MUTTY_EAT = 180, STALL_LIMIT = 10;

// ---------------------------------------------------------------------------------------------- textures / meshes
function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,240,190,0.95)'); gr.addColorStop(0.35, 'rgba(255,210,120,0.35)'); gr.addColorStop(1, 'rgba(255,200,100,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
function itemMesh(id) {
  const g = new THREE.Group(), L = (c, e = 0) => new THREE.MeshLambertMaterial({ color: c, emissive: e ? c : 0x000000, emissiveIntensity: e });
  const box = (w, h, d, m, x = 0, y = 0, z = 0, rx = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.rotation.x = rx; g.add(b); return b; };
  if (id === 'laptop') { box(0.33, 0.022, 0.23, L(0x3a3d42), 0, 0.011, 0); box(0.33, 0.012, 0.22, L(0x2a2c30), 0, 0.11, -0.105, -1.75); box(0.3, 0.004, 0.19, L(0x4a7fd0, 0.9), 0, 0.115, -0.1, -1.75 + Math.PI); }
  else if (id === 'tablet') { box(0.19, 0.01, 0.27, L(0x111214), 0, 0.005, 0); box(0.17, 0.004, 0.24, L(0xe07030, 0.9), 0, 0.011, 0); }
  else if (id === 'music') { box(0.065, 0.02, 0.105, L(0xc8202a), 0, 0.01, 0); const w = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.006, 14), L(0xf2f2f2, 0.4)); w.position.set(0, 0.021, 0.02); g.add(w); box(0.05, 0.004, 0.03, L(0x7fd0ff, 0.9), 0, 0.021, -0.03); }
  else if (id === 'mask') { box(0.17, 0.02, 0.1, L(0x9cc9e6, 0.25), 0, 0.012, 0); for (const s of [-1, 1]) box(0.012, 0.006, 0.09, L(0xf2f2f2), s * 0.095, 0.01, 0); }
  else if (id === 'food') { box(0.11, 0.035, 0.11, L(0xc4161c, 0.2), 0, 0.018, 0); }
  g.userData.item = id;
  return g;
}

export class Story {
  // o: { scene, camera, player, roomDoors, audio, voices, health, getCollider, room15, manju, mutty, zoya, inSafe15,
  //      damage(n, src), heal(n), listener(), respawn(), spawn: Vector3, seat: Vector3 }
  constructor(o) {
    Object.assign(this, o);
    this.glow = glowTex();
    this.items = {};                       // id -> { mesh, sprite, home (on the desk), spot, taken }
    for (const it of ITEMS) {
      const mesh = itemMesh(it.id); mesh.visible = false; this.scene.add(mesh);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffe2a8 }));
      sprite.scale.setScalar(0.7); sprite.visible = false; this.scene.add(sprite);
      this.items[it.id] = { mesh, sprite, taken: false, spot: null };
    }
    this.switches = []; this.flickers = null;
    this.thrown = [];                       // music player / food in flight or lying where they landed
    this.ui(); this.reset(true);
  }

  // ------------------------------------------------------------------------------------------ state
  reset(full = true) {
    if (full) {
      this.phase = 'menu';
      this.have = { laptop: false, tablet: false, music: false, mask: false };
      this.food = 0; this.sel = -1;
      this.cd = { music: 0, mask: 0, food: 0 };
      for (const s of this.switches) this.setSwitch(s, false);
      for (const id in this.items) { const it = this.items[id]; it.taken = false; it.mesh.visible = false; it.sprite.visible = false; }
      this.room15?.reset();
    }
    for (const t of this.thrown) { this.scene.remove(t.mesh); t.sound?.stop(); }
    this.thrown = [];
    this.zoyaMaskT = 0; this.removeZoyaMask();
    this.hideT = 0; this.hidden = false; this.hideBroken = false; this.hunt = null;
    this.hold = null; this.noise = 0; this.cut = null; this.mapBig = false;
    this.render();
  }
  get lit() { return this.switches.length ? this.switches.filter((s) => s.on).length / this.switches.length : 0; }
  get cutscene() { return !!this.cut; }
  get busy() { return this.phase === 'intro'; }         // context card + cutscene: no walking, no AI
  get zoyaMuted() { return this.zoyaMaskT > 0; }
  get playing() { return this.phase === 'items' || this.phase === 'lights' || this.phase === 'done'; }

  // called once the building and doors are loaded (raycasts need the collider)
  setup(flickers) {
    this.flickers = flickers;
    this.stalls = this.roomDoors.list.filter((d) => d.r.kind === 'stall' && d.r.stall);
    this.makeSwitches();
    this.mapData = null;
    fetch('./public/map.json?v=' + Date.now()).then((r) => r.json()).then((m) => { this.mapData = m; }).catch(() => {});
  }

  // ------------------------------------------------------------------------------------------ switches
  makeSwitches() {
    const col = this.getCollider(); if (!col) return;
    const rc = new THREE.Raycaster(); rc.firstHitOnly = true;
    // per floor: corridor, position along it, which wall to try first
    const plan = [['N', -19.5], ['N', 12.5], ['S', -17.5], ['S', 10.5], ['W', 13.5], ['E', 9.5]];
    const run = {
      N: { ax: 'x', c: (CORR.zo0 + CORR.zi0) / 2, dirs: [[0, 0, -1], [0, 0, 1]] }, S: { ax: 'x', c: (CORR.zi1 + CORR.zo1) / 2, dirs: [[0, 0, 1], [0, 0, -1]] },
      W: { ax: 'z', c: (CORR.xo0 + CORR.xi0) / 2, dirs: [[-1, 0, 0], [1, 0, 0]] }, E: { ax: 'z', c: (CORR.xi1 + CORR.xo1) / 2, dirs: [[1, 0, 0], [-1, 0, 0]] },
    };
    const plateGeo = new THREE.BoxGeometry(0.14, 0.2, 0.02), ledGeo = new THREE.BoxGeometry(0.03, 0.03, 0.012), togGeo = new THREE.BoxGeometry(0.04, 0.06, 0.02);
    this.switches = [];
    for (let fl = 0; fl < 3; fl++) for (const [k, u0] of plan) {
      const R = run[k], y = FLOOR_Y[fl] + 1.3;
      let placed = null;
      for (let tries = 0; tries < 12 && !placed; tries++) {
        const u = u0 + (tries % 2 ? -1 : 1) * Math.ceil(tries / 2) * 0.6;
        for (const dv of R.dirs) {
          const o = R.ax === 'x' ? new THREE.Vector3(u, y, R.c) : new THREE.Vector3(R.c, y, u);
          rc.set(o, new THREE.Vector3(...dv)); rc.far = 1.3;
          const h = rc.intersectObject(col, false)[0];
          if (!h || h.distance < 0.6 || h.distance > 1.05) continue;
          // not on a door: nothing within 0.7 m along the wall
          if (this.roomDoors.list.some((d) => Math.abs(d.r.y - FLOOR_Y[fl]) < 1.2 && Math.hypot(d.r.x - h.point.x, d.r.z - h.point.z) < 0.9)) continue;
          placed = { p: h.point.clone(), n: new THREE.Vector3(-dv[0], 0, -dv[2]), u, R };
          break;
        }
      }
      if (!placed) continue;
      const g = new THREE.Group();
      const plate = new THREE.Mesh(plateGeo, new THREE.MeshLambertMaterial({ color: 0xeeeeea }));
      const tog = new THREE.Mesh(togGeo, new THREE.MeshLambertMaterial({ color: 0xd8d8d2 })); tog.position.set(0, 0.02, 0.015);
      const led = new THREE.Mesh(ledGeo, new THREE.MeshBasicMaterial({ color: 0xff2a1a })); led.position.set(0, -0.06, 0.012);
      g.add(plate, tog, led);
      g.position.copy(placed.p).addScaledVector(placed.n, 0.011);
      g.lookAt(g.position.clone().add(placed.n));
      g.userData.noRetro = true;
      this.scene.add(g);
      // its corridor light, on the ceiling above the switch, part of the game's flicker set (off until switched)
      const pl = new THREE.PointLight(0xdfe6ff, 0, 11, 1.5);
      pl.position.set(placed.R.ax === 'x' ? placed.u : placed.R.c, CEIL_Y[fl] - 0.3, placed.R.ax === 'x' ? placed.R.c : placed.u);
      this.scene.add(pl);
      const f = { pl, base: 3.2, dead: false, t: Math.random() * 10, sw: true, on: false };
      this.flickers.push(f);
      this.switches.push({ fl, g, plate, led, tog, f, on: false, pos: g.position.clone() });
    }
  }
  setSwitch(s, on) {
    s.on = on; s.f.on = on;
    s.led.material.color.set(on ? 0x2aff4a : 0xff2a1a);
    s.tog.position.y = on ? -0.02 : 0.02;
  }

  // ------------------------------------------------------------------------------------------ new game / retry
  newGame() {
    this.reset(true);
    this.phase = 'intro';
    this.placeOnDesk();
    this.showContext();
  }
  retry() { this.reset(false); if (this.phase === 'intro' || this.phase === 'menu') this.finishIntro(); this.render(); }
  quit() { this.introT?.forEach(clearTimeout); this.endCutscene(true); this.reset(true); this.contextEl.hidden = true; this.dlgHide(); this.fadeTo(false); }

  placeOnDesk() {        // your things laid out in room 15, where the cutscene finds them
    const at = { laptop: [28.22, 1.516, 18.55, -Math.PI / 2], tablet: [27.55, 1.326, 17.55, 0.4], music: [28.3, 1.516, 19.28, 0.3], mask: [28.15, 1.516, 19.62, -0.5] };
    for (const [id, [x, y, z, ry]] of Object.entries(at)) { const it = this.items[id]; it.mesh.position.set(x, y, z); it.mesh.rotation.set(0, ry, 0); it.mesh.scale.setScalar(1); it.mesh.visible = true; it.sprite.visible = false; it.home = it.mesh.position.clone(); }
  }

  // the intro: the warden's notice (stamped), then the clock, then two lines — and then him
  showContext() {
    const C = this.contextEl;
    C.innerHTML = `<div class="notice"><h1>BOYS' HOSTEL</h1><div class="sub">NOTICE TO ALL RESIDENTS</div>
      All laptops, tablets and personal devices are to be handed in to the Warden by <b>9:30 PM</b> sharp.<br><br>
      Anything found after that time will be <b>CONFISCATED</b>. No exceptions. No excuses.<div class="sig">— Warden</div>
      <div class="stamp">WARDEN<br>· · ·<br>OFFICE</div></div>
      <div class="clock"><div class="digits">9<span class="c">:</span>52</div><div class="line"></div></div><div class="skip">[space] skip</div>`;
    C.hidden = false;
    const at = (ms, fn) => this.introT.push(setTimeout(() => { if (this.phase === 'intro' && !C.hidden) fn(); }, ms));
    this.introT?.forEach(clearTimeout); this.introT = [];
    at(1300, () => { C.querySelector('.stamp').classList.add('down'); this.audio.pop?.(); });
    at(4200, () => C.querySelector('.notice').classList.add('gone'));
    at(4900, () => { C.querySelector('.clock').classList.add('on'); this.audio.tick?.(); });
    const line = C.querySelector('.line');
    at(5900, () => this.typeInto(line, 'You never handed yours in.', 28, 330));
    at(8600, () => this.typeInto(line, 'Footsteps in the corridor.', 24, 330));
    at(11000, () => this.fadeTo(true));
    at(11700, () => { C.hidden = true; this.startCutscene(); this.fadeTo(false); });
  }
  skip() {
    if (this.phase !== 'intro') return false;
    if (!this.contextEl.hidden) { this.introT?.forEach(clearTimeout); this.contextEl.hidden = true; this.startCutscene(); return true; }
    if (this.cut && !this.cut.ending) { this.cut.ending = true; this.fadeTo(true); setTimeout(() => { this.endCutscene(); this.fadeTo(false); }, 600); return true; }
    return false;
  }
  fadeTo(on) { this.fadeEl.classList.toggle('on', on); }

  // ---- the cutscene: you're on your bed. Footsteps. The door bursts open, Manju steps in, shouts, and everything
  // you own trembles and rips across the room into his hands. He turns, walks out, the door slams. Black.
  startCutscene() {
    const m = this.manju, V = THREE.Vector3;
    const P = { far: new V(24.45, 0.766, 13.6), out: new V(24.45, 0.766, 17.77), inn: new V(25.55, 0.766, 17.85), stand: new V(25.78, 0.766, 17.98), away: new V(24.45, 0.766, 14.2) };
    this.cut = { t: 0, phase: 'approach', pt: 0, P, path: [P.far, P.out], yaw: Math.PI, step: 0.3, shake: 0, look: new V(25.3, 1.85, 17.8), push: 0, said: [] };
    this.prevManjuState = m.state; m.state = 'cutscene';
    if (m.root) {
      m.root.visible = true; m.root.traverse((o) => { if (o.isSkinnedMesh || o.isMesh) o.visible = true; });
      for (const e of m.eyes || []) e.visible = false;
      m.root.position.copy(P.far); m.root.rotation.y = Math.PI; m.play?.('Walk', 0.1);
    }
    this.lbEl.classList.add('on');
    this.lightBase = [this.room15?.light?.intensity ?? 0, this.room15?.light2?.intensity ?? 0];
    this.seatCam(0);
  }
  seatCam(push) {         // sitting on the edge of bed 1, a little forward when he looms
    const c = this.camera, cut = this.cut, t = cut ? cut.t : 0;
    c.position.set(27.25 - push * 0.35, 0.766 + 1.1 + Math.sin(t * 1.3) * 0.006, 18.25 - push * 0.08);
    c.position.x += Math.sin(t * 0.7) * 0.004;                               // breathing, a hand-held camera
  }
  endCutscene(silent = false) {
    if (!this.cut) return;
    const m = this.manju, d = this.room15Door;
    this.cut = null;
    for (const id in this.items) this.items[id].mesh.visible = false;
    if (d && d.target !== 0) { this.roomDoors.toggle(d, this.camera.position); d.speed = 0; }
    m.state = 'off'; if (m.root) m.root.visible = false;
    for (const e of m.eyes || []) e.visible = false;
    if (this.room15?.light) { this.room15.light.intensity = this.lightBase?.[0] ?? this.room15.light.intensity; if (this.room15.light2) this.room15.light2.intensity = this.lightBase?.[1] ?? this.room15.light2.intensity; }
    this.lbEl.classList.remove('on'); this.dlgHide();
    if (!silent) this.finishIntro();
  }
  finishIntro() {
    this.scatter();
    this.phase = 'items';
    this.respawn();
    this.banner('NEW OBJECTIVE', 'get my stuff back', 'Manju scattered it across all three floors');
    this.render();
  }

  updateCutscene(dt) {
    const c = this.cut, m = this.manju, d = this.room15Door, cam = this.camera, V = THREE.Vector3;
    c.t += dt; c.pt += dt;
    const go = (ph) => { c.phase = ph; c.pt = 0; };
    const walk = (speed) => {                                                // along c.path at walking pace, turning smoothly
      if (!m.root || !c.path.length) return true;
      const p = m.root.position, tgt = c.path[0], to = new V(tgt.x - p.x, 0, tgt.z - p.z), dist = to.length();
      if (dist < 0.04) { c.path.shift(); return !c.path.length; }
      const want = Math.atan2(to.x, to.z);
      let dy = want - c.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      c.yaw += dy * Math.min(1, dt * 7);
      const v = Math.min(dist, speed * dt * (Math.abs(dy) > 1.2 ? 0.35 : 1));
      p.addScaledVector(to.normalize(), v);
      c.step -= dt; if (c.step <= 0) { c.step = 0.5; this.footAt(p); }
      return false;
    };
    const face = (yaw) => { let dy = yaw - c.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; c.yaw += dy * Math.min(1, dt * 5); };
    const lights = (k) => { if (!this.room15?.light) return; this.room15.light.intensity = this.lightBase[0] * k; if (this.room15.light2) this.room15.light2.intensity = this.lightBase[1] * k; };
    const say = (key, text, who, opts) => { if (!c.said.includes(key)) { c.said.push(key); this.dialog(text, who, opts); } };
    const ids = ['laptop', 'tablet', 'music', 'mask'];
    switch (c.phase) {
      case 'approach':                                                      // you hear him first
        if (walk(1.25)) { go('burst'); if (d && d.target === 0) { this.roomDoors.toggle(d, new V(24.3, 1.5, 17.77)); d.speed = 9; } this.audio.door?.(); this.audio.pop?.(); c.shake = 0.06; lights(0.35); m.play?.('Idle', 0.2); }
        break;
      case 'burst':
        lights(c.pt < 0.15 ? 0.3 : 1);
        if (c.pt > 0.55) { go('enter'); c.path = [c.P.inn, c.P.stand]; m.play?.('Walk', 0.2); }
        break;
      case 'enter':
        if (walk(1.15)) { go('stare'); m.play?.('Stare', 0.25); this.audio.stareSting?.(); for (const e of m.eyes || []) { e.visible = true; e.material.opacity = 1; } }
        break;
      case 'stare': {
        face(Math.atan2(cam.position.x - m.root.position.x, cam.position.z - m.root.position.z));
        c.push = Math.min(0.55, c.push + dt * 0.12);
        if (c.pt > 0.3) say('a', 'Laptop submission was at *NINE-THIRTY.*', 'MANJU', { face: 'manju', blip: 92, speed: 26 });
        if (c.pt > 3.1) say('b', 'And you thought I wouldn\'t _check?_', 'MANJU', { face: 'manju', blip: 92, speed: 26 });
        if (c.pt > 5.6) say('c', '*EVERYTHING.  CONFISCATED.*', 'MANJU', { face: 'manju', blip: 80, speed: 18 });
        if (c.pt > 7.6) { go('tremble'); this.dlgHide(); this.audio.burst?.(90, 0.8, 1.1, 0.12, 'lowpass'); }
        break;
      }
      case 'tremble':                                                       // everything you own starts to shake
        lights(0.55 + Math.random() * 0.5);
        for (const id of ids) { const it = this.items[id]; it.mesh.position.copy(it.home).add(new V((Math.random() - 0.5) * 0.02, Math.random() * 0.012 * (c.pt / 0.8), (Math.random() - 0.5) * 0.02)); }
        c.shake = Math.max(c.shake, 0.008 * c.pt);
        if (c.pt > 1.3) { go('suck'); }
        break;
      case 'suck': {                                                        // ...and rips across the room into his hands
        lights(Math.random() < 0.25 ? 0.15 : 0.9);
        const hand = m.root.position.clone().add(new V(0, 1.15, 0)).addScaledVector(new V(Math.sin(c.yaw), 0, Math.cos(c.yaw)), 0.35);
        let done = 0;
        ids.forEach((id, i) => {
          const it = this.items[id], t0 = i * 0.2, k = THREE.MathUtils.clamp((c.pt - t0) / 0.55, 0, 1);
          if (c.pt < t0) { it.mesh.position.copy(it.home).add(new V((Math.random() - 0.5) * 0.02, 0.01, (Math.random() - 0.5) * 0.02)); return; }
          if (!it.whooshed) { it.whooshed = true; this.audio.burst?.(500 + i * 160, 1.4, 0.45, 0.1, 'bandpass', 2600); c.shake = 0.05; }
          const e = k * k * k;                                              // slow to tear loose, then gone
          const prev = it.mesh.position.clone();
          it.mesh.position.lerpVectors(it.home, hand, e); it.mesh.position.y += Math.sin(k * Math.PI) * 0.22;
          const vel = it.mesh.position.clone().sub(prev).length() / Math.max(dt, 1e-3);
          it.mesh.rotation.y += dt * (4 + 18 * e); it.mesh.rotation.z += dt * 10 * e;
          it.mesh.scale.set(1, 1, 1 + Math.min(1.6, vel * 0.12)).multiplyScalar(k > 0.85 ? (1 - k) / 0.15 : 1);
          it.mesh.visible = k < 1; if (k >= 1) done++;
        });
        if (done === ids.length && c.pt > 1.3) { go('turn'); lights(1); this.audio.pop?.(); c.shake = 0.03; m.play?.('Idle', 0.3); }
        break;
      }
      case 'turn':
        face(-Math.PI / 2);
        if (c.pt > 0.9) { go('leave'); c.path = [c.P.out, c.P.away]; m.play?.('Walk', 0.25); for (const e of m.eyes || []) e.visible = false; }
        break;
      case 'leave':
        if (m.root && m.root.position.x < 25.2 && !c.slammed) { c.slammed = true; c.slamT = 0.7; }
        if (c.slamT != null && (c.slamT -= dt) <= 0 && !c.shut) { c.shut = true; if (d && d.target !== 0) { this.roomDoors.toggle(d, cam.position); d.speed = 10; } this.audio.door?.(); this.audio.pop?.(); c.shake = 0.07; lights(0.25); }
        if (c.shut) lights(Math.min(1, 0.25 + c.slamT * -2));
        if (walk(1.3) || (c.shut && c.slamT < -1.0)) { go('black'); this.fadeTo(true); }
        break;
      case 'black':
        if (m.root) m.root.visible = false;
        if (c.pt > 0.7) say('n1', 'Your stuff is out there now.  Somewhere on every floor.', '', { blip: 330, speed: 30 });
        if (c.pt > 3.6) say('n2', 'Get it back.', '', { blip: 330, speed: 22 });
        if (c.pt > 5.4 && !c.ending) { c.ending = true; this.endCutscene(); this.fadeTo(false); }
        return;
    }
    if (m.root) { m.root.rotation.y = c.yaw; m.mixer?.update(dt); m.root.updateMatrixWorld(true); }
    // camera: sitting on your bed; it follows him (smoothed), leans in when he looms, jolts on the door
    const head = new V(); if (m.head) m.head.getWorldPosition(head); else head.copy(m.root.position).add(new V(0, 1.7, 0));
    let target = head;
    if (c.phase === 'approach' || c.phase === 'burst') target = new V(25.3, 1.8, 17.8);
    if (c.phase === 'tremble') target = new V(28.2, 1.5, 18.75);                 // your desk: everything on it shaking
    if (c.phase === 'suck') {                                                // follow your things as they rip past you into his hands
      const fly = ids.map((id) => this.items[id].mesh).filter((m2) => m2.visible);
      target = fly.length ? fly.reduce((a, m2) => a.add(m2.position), new V()).multiplyScalar(1 / fly.length) : head.clone().add(new V(0, -0.5, 0));
    }
    if (c.phase === 'leave' && c.shut) target = new V(25.3, 1.7, 17.8);
    c.look.lerp(target, Math.min(1, dt * (c.phase === 'suck' ? 5 : c.phase === 'tremble' ? 3.2 : 2.6)));
    this.seatCam(c.push);
    c.shake *= Math.pow(0.02, dt);
    cam.lookAt(c.look);
    if (c.shake > 0.001) { cam.rotateX((Math.random() - 0.5) * c.shake); cam.rotateY((Math.random() - 0.5) * c.shake); }
  }
  // a footstep from where he is (panned, quieter when far)
  footAt(p) {
    const cam = this.camera, to = p.clone().sub(cam.position), d = to.length(), r = new THREE.Vector3();
    cam.getWorldDirection(r); r.set(-r.z, 0, r.x).normalize();
    this.audio.stepAt?.(Math.max(-1, Math.min(1, to.normalize().dot(r))), Math.min(1, d / 10), Math.max(0.12, 0.6 - d * 0.05));
  }

  // ------------------------------------------------------------------------------------------ scatter
  scatter() {
    const col = this.getCollider(); if (!col) return;
    const rc = new THREE.Raycaster(); rc.firstHitOnly = true;
    const rooms = this.roomDoors.list.filter((d) => d.r.kind === 'room' && d.r.into && !d.r.locked && d.side < 0 && !(Math.abs(d.r.x - 25.3) < 0.1 && Math.abs(d.r.z - 17.77) < 0.2 && d.r.y < 1));
    const floors = [0, 1, 2, Math.floor(Math.random() * 3)].sort(() => Math.random() - 0.5);
    ITEMS.forEach((it, i) => {
      const fl = floors[i], pool = rooms.filter((d) => floorOf(d.r.y + 0.1) === fl).sort(() => Math.random() - 0.5);
      for (const d of pool) {
        const r = d.r, nx = r.axis === 'z' ? r.into : 0, nz = r.axis === 'x' ? r.into : 0, ax = r.axis === 'x' ? 1 : 0, az = r.axis === 'z' ? 1 : 0;
        let ok = null;
        for (const [depth, side] of [[1.4, 0], [1.9, 0.5], [1.9, -0.5], [1.0, 0.6], [1.0, -0.6], [2.4, 0]]) {
          const p = new THREE.Vector3(r.x + nx * depth + ax * side, r.y + 2.2, r.z + nz * depth + az * side);
          rc.set(p, new THREE.Vector3(0, -1, 0)); rc.far = 2.6;
          const h = rc.intersectObject(col, false)[0];
          if (h && h.point.y < r.y + 0.08 && h.point.y > r.y - 0.1) { ok = h.point; break; }
        }
        if (!ok) continue;
        const m = this.items[it.id];
        m.mesh.position.set(ok.x, ok.y + 0.012, ok.z); m.mesh.rotation.set(0, Math.random() * 6.28, 0); m.mesh.scale.setScalar(1.6);   // a bit bigger on the floor: findable
        m.mesh.visible = !m.taken; m.sprite.visible = !m.taken; m.sprite.position.set(ok.x, ok.y + 0.18, ok.z);
        m.spot = { fl, room: d };
        break;
      }
    });
  }

  // ------------------------------------------------------------------------------------------ interaction
  // what's under the crosshair: an item, food, or a switch
  look() {
    const rc = this._rc ||= new THREE.Raycaster();
    rc.setFromCamera({ x: 0, y: 0 }, this.camera); rc.far = 2.6;
    const targets = [];
    for (const id in this.items) { const it = this.items[id]; if (it.mesh.visible && !it.taken && this.phase !== 'intro') targets.push(it.mesh); }
    for (const f of this.room15?.foods || []) if (f.visible) targets.push(f);
    for (const t of this.thrown) if (t.landed && t.kind === 'food' && !t.eaten) targets.push(t.mesh);
    for (const s of this.switches) targets.push(s.plate);
    const hits = rc.intersectObjects(targets, true); if (!hits.length) return null;
    const h = hits[0];
    const col = this.getCollider(); if (col) { const o = rc.intersectObject(col, false)[0]; if (o && o.distance < h.distance - 0.05) return null; }
    let o = h.object; while (o && !o.userData.item && !o.userData.food && !targets.includes(o)) o = o.parent;
    const sw = this.switches.find((s) => s.plate === h.object);
    if (sw) return { kind: 'switch', sw, dist: h.distance };
    if (h.object.userData.food || this.room15?.foods.includes(h.object)) return { kind: 'food', mesh: h.object };
    const th = this.thrown.find((t) => t.mesh === o || t.mesh === h.object); if (th) return { kind: 'thrownFood', t: th };
    for (const id in this.items) if (this.items[id].mesh === o) return { kind: 'item', id };
    return null;
  }
  hint() {
    if (this.cut) return null;
    const L = this.lookAt;
    if (!L) return null;
    const K = (k, t) => `<span class="key">${k}</span>${t}`;
    if (L.kind === 'item') return K('E', `pick up the ${ITEMS.find((i) => i.id === L.id).name.toLowerCase()}`);
    if (L.kind === 'food' || L.kind === 'thrownFood') return this.food >= 3 ? 'my pockets are full of food' : K('E', 'take it');
    if (L.kind === 'switch') {
      if (L.sw.on) return 'it\'s on';
      if (this.phase !== 'lights' && this.phase !== 'done') return 'dead. find your stuff first.';
      if (this.hold?.sw === L.sw) return `${K('E', 'keep holding…')}<span class="bar"><i style="width:${Math.min(100, this.hold.t / this.holdNeed() * 100).toFixed(0)}%"></i></span>`;
      return K('E', `hold to switch the lights on  (${this.holdNeed().toFixed(1)}s)`);
    }
    return null;
  }
  holdNeed() { return 1.5 + 0.45 * this.switches.filter((s) => s.on).length; }

  // E pressed (true if the story used it)
  interact() {
    if (this.cut) return true;
    const L = this.lookAt || this.look(); if (!L) return false;
    if (L.kind === 'item') { this.collect(L.id); return true; }
    if (L.kind === 'food') { if (this.food < 3) { this.food++; L.mesh.visible = false; this.toast('Food +1', 'Select it with 5.'); this.audio.tick?.(); this.render(); } return true; }
    if (L.kind === 'thrownFood') { if (this.food < 3) { this.food++; this.scene.remove(L.t.mesh); this.thrown = this.thrown.filter((t) => t !== L.t); this.render(); } return true; }
    if (L.kind === 'switch') { if (!L.sw.on && (this.phase === 'lights' || this.phase === 'done')) this.hold = { sw: L.sw, t: 0 }; else this.audio.tick?.(); return true; }
    return false;
  }
  release() { this.hold = null; }

  collect(id) {
    const it = this.items[id]; if (!it || it.taken) return;
    it.taken = true; it.mesh.visible = false; it.sprite.visible = false;
    this.have[id] = true;
    if (this.sel < 0) this.sel = SLOTS.findIndex((s) => s.id === id);
    const def = ITEMS.find((i) => i.id === id);
    this.card(def);
    this.audio.pickup?.() ?? this.audio.tick?.();
    if (ITEMS.every((i) => this.have[i.id]) && this.phase === 'items') {
      this.phase = 'lights';
      setTimeout(() => this.banner('NEW OBJECTIVE', 'turn every corridor light on', 'six switches on each floor.  they won\'t like it.'), 5600);
    }
    this.render();
  }

  select(i) { const s = SLOTS[i]; if (!s) return; if (s.id === 'food' ? this.food > 0 : this.have[s.id]) { this.sel = i; this.render(); } }
  cycle(dir) { for (let k = 1; k <= SLOTS.length; k++) { const i = (this.sel + dir * k + SLOTS.length * 2) % SLOTS.length; const s = SLOTS[i]; if (s.id === 'food' ? this.food > 0 : this.have[s.id]) { this.sel = i; this.render(); return; } } }

  // mouse: button 0 = use, 2 = alternate (eat)
  use(button) {
    if (this.cut || !this.playing) return;
    const s = SLOTS[this.sel]; if (!s) return;
    if (s.id === 'food') {
      if (this.food <= 0) return;
      if (button === 2) { if (this.health.hearts >= this.health.max) { this.toast('Hearts full', ''); return; } if (this.heal(1)) { this.food--; this.audio.eat?.(); this.render(); } return; }
      if (this.cd.food > 0) return this.toast('Not yet', `${Math.ceil(this.cd.food)} s`);
      this.food--; this.cd.food = CD.food; this.throwThing('food'); this.render(); return;
    }
    if (button !== 0) return;
    if (s.id === 'music') { if (this.cd.music > 0) return this.toast('Music player recharging', `${Math.ceil(this.cd.music)} s`); this.cd.music = CD.music; this.throwThing('music'); this.render(); return; }
    if (s.id === 'mask') {
      if (this.cd.mask > 0) return this.toast('Face mask recharging', `${Math.ceil(this.cd.mask)} s`);
      const z = this.zoya;
      if (!z?.root || z.state === 'off' || !z.ready) return this.toast('Nobody to put it on', 'Get close to Zoya and click on her.');
      const zp = z.pos.clone(); zp.y += 1.45;                     // her face
      const cp = this.camera.position, to = zp.clone().sub(cp), d = to.length(), fwd = new THREE.Vector3(); this.camera.getWorldDirection(fwd);
      if (d > 4.5 || to.normalize().dot(fwd) < 0.82) return this.toast('Too far', 'Get right up to Zoya and look at her.');
      this.zoyaMaskT = MASK_TIME; this.cd.mask = CD.mask; this.putZoyaMask(); this.audio.tick?.();
      this.toast('Masked', 'Zoya can\'t call Manju for 60 seconds.'); this.render(); return;
    }
    if (s.id === 'laptop') { this.mapBig = !this.mapBig; this.render(); }
  }

  throwThing(kind) {
    const mesh = itemMesh(kind); this.scene.add(mesh);
    const fwd = new THREE.Vector3(); this.camera.getWorldDirection(fwd);
    const p = this.camera.position.clone().addScaledVector(fwd, 0.45); p.y -= 0.15;
    const v = fwd.clone().multiplyScalar(kind === 'music' ? 8.5 : 7).add(new THREE.Vector3(0, 2.4, 0));
    mesh.position.copy(p);
    this.thrown.push({ kind, mesh, v, t: 0, landed: false, life: kind === 'music' ? MUSIC_TIME : 999 });
  }
  updateThrown(dt) {
    const col = this.getCollider(); const rc = this._trc ||= new THREE.Raycaster(); rc.firstHitOnly = true;
    for (const t of [...this.thrown]) {
      t.t += dt;
      if (!t.landed) {
        t.v.y -= 9.8 * dt;
        const step = t.v.clone().multiplyScalar(dt), len = step.length();
        rc.set(t.mesh.position, step.clone().normalize()); rc.far = len + 0.04;
        const h = col && rc.intersectObject(col, false)[0];
        if (h) {
          const n = h.face ? h.face.normal.clone().transformDirection(col.matrixWorld) : new THREE.Vector3(0, 1, 0);
          if (n.y > 0.55 || t.t > 2.5) { t.mesh.position.copy(h.point).addScaledVector(n, 0.012); t.mesh.rotation.set(0, Math.random() * 6, 0); t.landed = true; this.landed(t); }
          else { t.mesh.position.copy(h.point).addScaledVector(n, 0.05); t.v.reflect(n).multiplyScalar(0.35); }
        } else { t.mesh.position.add(step); t.mesh.rotation.x += dt * 8; }
      } else {
        t.life -= dt;
        if (t.kind === 'music' && t.life <= 0) { t.sound?.stop(); this.scene.remove(t.mesh); this.thrown = this.thrown.filter((x) => x !== t); }
        if (t.kind === 'food' && t.eatenBy && (t.eatT -= dt) <= 0) { this.scene.remove(t.mesh); this.thrown = this.thrown.filter((x) => x !== t); }
      }
    }
  }
  landed(t) {
    const p = t.mesh.position.clone();
    if (t.kind === 'music') {
      t.sound = this.musicAt(p, MUSIC_TIME);
      this.lure(p, 32, MUSIC_TIME);
    } else if (t.kind === 'food') {
      const m = this.mutty;
      if (m?.distract && floorOf(p.y) === 0 && m.state !== 'off' && m.state !== 'away' && Math.hypot(m.pos.x - p.x, m.pos.z - p.z) < 40 && m.distract(p, MUTTY_EAT)) {
        t.eatenBy = 'mutty'; t.eatT = 6;
        this.toast('Mutty smells food', 'He\'ll be busy eating for 3 minutes.');
      }
    }
  }
  // the music player pulls everyone on that floor within range over to it
  lure(p, range, secs) {
    const fl = floorOf(p.y);
    for (const n of [this.manju, this.mutty, this.zoya]) {
      if (!n?.pos || !n.distract || n.state === 'off' || n.state === 'cutscene') continue;
      if (floorOf(n.pos.y + 0.1) !== fl || n.pos.distanceTo(p) > range) continue;
      n.distract(p, secs);
    }
  }
  musicAt(p, secs) {       // a tinny little loop through a panner where it landed
    const ctx = this.audio.ctx; if (!ctx) return null;
    const pan = ctx.createPanner(); Object.assign(pan, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 2, rolloffFactor: 1.2, maxDistance: 60 });
    pan.positionX.value = p.x; pan.positionY.value = p.y + 0.1; pan.positionZ.value = p.z;
    const g = ctx.createGain(); g.gain.value = 0.22; g.connect(pan); pan.connect(this.audio.master);
    const notes = [523, 659, 784, 659, 587, 698, 880, 698, 523, 659, 784, 1047, 988, 784, 659, 587];
    const t0 = ctx.currentTime + 0.05, beat = 0.19, oscs = [];
    for (let rep = 0; rep * notes.length * beat < secs; rep++) notes.forEach((f, i) => {
      const t = t0 + (rep * notes.length + i) * beat; if (t - t0 > secs) return;
      const o = ctx.createOscillator(), e = ctx.createGain(); o.type = i % 4 === 0 ? 'square' : 'triangle'; o.frequency.value = f;
      e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(0.5, t + 0.01); e.gain.exponentialRampToValueAtTime(0.01, t + beat * 0.95);
      o.connect(e); e.connect(g); o.start(t); o.stop(t + beat); oscs.push(o);
    });
    return { stop: () => { for (const o of oscs) { try { o.stop(); } catch (e) { /* done */ } } try { g.disconnect(); } catch (e) { /* gone */ } } };
  }

  putZoyaMask() {
    const z = this.zoya; if (!z?.root) return;
    this.removeZoyaMask();
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.09, 0.05), new THREE.MeshLambertMaterial({ color: 0x9cc9e6 }));
    const host = z.head || z.root;
    if (z.head) { m.position.set(0, 0.06, 0.1); m.scale.setScalar(1 / (z.root.scale.x || 1)); } else m.position.set(0, 1.52, 0.13);
    host.add(m); this.zoyaMask = m;
  }
  removeZoyaMask() { if (this.zoyaMask) { this.zoyaMask.parent?.remove(this.zoyaMask); this.zoyaMask = null; } }

  // ------------------------------------------------------------------------------------------ per frame
  // ctx: { feet, safe, state }   returns nothing; read .hidden / .noise / .lit
  update(dt, ctx) {
    // the context card times out into the cutscene
    if (this.cut) { this.updateCutscene(dt); return; }
    if (!this.playing) return;
    for (const k in this.cd) this.cd[k] = Math.max(0, this.cd[k] - dt);
    if (this.zoyaMaskT > 0) { this.zoyaMaskT -= dt; if (this.zoyaMaskT <= 0) { this.removeZoyaMask(); this.toast('Zoya\'s mask is off', ''); } }
    this.updateThrown(dt);
    // glow pulse on the items still out there
    const s = 0.55 + Math.sin(performance.now() * 0.004) * 0.15;
    for (const id in this.items) { const it = this.items[id]; if (it.sprite.visible) it.sprite.scale.setScalar(s); }
    // what you're looking at (8 Hz)
    this.lookT = (this.lookT || 0) - dt;
    if (this.lookT <= 0) { this.lookT = 0.12; this.lookAt = this.look(); }
    // holding a switch
    this.noise = 0;
    if (this.hold) {
      const L = this.lookAt;
      if (!L || L.kind !== 'switch' || L.sw !== this.hold.sw) this.hold = null;
      else {
        this.hold.t += dt; this.noise = 7;                              // fiddling with it makes noise
        if (this.hold.t >= this.holdNeed()) {
          const sw = this.hold.sw; this.hold = null;
          this.setSwitch(sw, true); this.audio.rattle?.(); this.audio.pop?.();
          this.noise = 16;                                               // the clunk carries
          this.lure(sw.pos, 18 + 10 * this.lit, 6);                       // and they come to see who turned the lights on
          if (this.switches.every((x) => x.on)) { this.phase = 'done'; this.banner('ALL THE LIGHTS ARE ON', 'something is waiting', 'the finale comes later'); }
          this.render();
        }
      }
    }
    this.updateStall(dt, ctx);
    this.mapT = (this.mapT || 0) - dt;
    if (this.mapT <= 0) { this.mapT = 1 / 12; this.drawMap(ctx); }
    if (this.hold) this.renderBar();
  }

  // ------------------------------------------------------------------------------------------ stalls
  stallAt(p) {
    for (const d of this.stalls || []) {
      const [x0, x1, z0, z1] = d.r.stall;
      if (p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1 && Math.abs(p.y - (d.r.y - 0.17)) < 1.0) return d;
    }
    return null;
  }
  updateStall(dt, ctx) {
    if (this.hunt) { this.updateHunt(dt, ctx); return; }
    const st = this.stallAt(ctx.feet);
    const shut = st && st.open < 0.06;
    if (!st) { this.hideBroken = false; }
    this.hidden = !!shut && !this.hideBroken;
    if (this.hidden) {
      this.hideT += dt;
      if (this.hideT > STALL_LIMIT) this.startHunt(st, ctx);
    } else this.hideT = Math.max(0, this.hideT - dt * 2);
  }
  // Mutty comes in under the cubicle door
  startHunt(st, ctx) {
    const m = this.mutty; this.hideT = 0; this.hideBroken = true; this.hidden = false;
    const r = st.r, inX = r.axis === 'z';                                // door plane normal
    const c = { x: (r.stall[0] + r.stall[1]) / 2, z: (r.stall[2] + r.stall[3]) / 2 };
    const sgn = inX ? Math.sign(c.x - r.x) : Math.sign(c.z - r.z);
    const at = new THREE.Vector3(r.x + (inX ? sgn * 0.12 : 0), r.y - 0.17, r.z + (inX ? 0 : sgn * 0.12));
    this.hunt = { t: 0, st, at, bit: false, opened: false, fl: floorOf(at.y + 0.1), prev: m?.state };
    this.voices?.play?.(this.voices.pick?.('mutty', ['mutty_3', 'mutty_6']), at.clone(), { listener: this.listener(), gain: 1.6, ref: 4 });
    if (m?.root && m.ready) {
      m.state = 'scripted';
      m.root.visible = true; m.root.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) o.visible = true; });
      m.root.position.copy(at); m.root.rotation.y = Math.atan2(c.x - at.x, c.z - at.z);
      m.play?.('Attack', 0.05, true);
    }
  }
  updateHunt(dt, ctx) {
    const h = this.hunt, m = this.mutty; h.t += dt;
    if (m?.state === 'scripted') m.mixer?.update(dt);
    if (!h.bit && h.t > 0.35) { h.bit = true; this.damage(1, 'mutty'); }
    if (!h.opened && h.t > 0.7) { h.opened = true; if (h.st.target === 0) this.roomDoors.toggle(h.st, h.at); }
    if (h.t > 1.3) {
      this.hunt = null;
      if (!m?.ready) return;
      if (h.fl === 0 && m.nav?.ready) {                                // ground floor: he keeps hunting you
        m.place(h.at); m.lastKnown?.copy(ctx.feet); m.setState?.('chase');
      } else { m.state = 'off'; m.root.visible = false; m.startAway?.(); }   // upstairs: back down where he came from
    }
  }

  // ------------------------------------------------------------------------------------------ UI (styles: src/ui.css)
  ui() {
    const el = (id, html = '', tag = 'div') => { const e = document.createElement(tag); e.id = id; e.innerHTML = html; document.body.appendChild(e); return e; };
    this.objEl = el('obj'); this.barEl = el('bar'); this.barLabel = el('barlabel');
    this.dlgEl = el('dlg', '<div class="face"></div><div class="body"><div class="who"></div><div class="say"></div></div><div class="more" hidden>▼</div>'); this.dlgEl.hidden = true;
    this.toastEl = el('toast'); this.toastEl.hidden = true;
    this.bannerEl = el('banner'); this.bannerEl.hidden = true;
    this.contextEl = el('ctx'); this.contextEl.hidden = true;
    this.lbEl = el('lb'); this.fadeEl = el('fade');
    this.mapEl = el('map', '', 'canvas'); this.mapEl.hidden = true; this.mapEl.width = 250; this.mapEl.height = 166;
  }
  // a voice blip per letter or two (Undertale-style), pitched per speaker
  blip(hz) {
    const ctx = this.audio.ctx; if (!ctx || !this.audio.master) return;
    const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
    o.type = 'square'; o.frequency.value = hz * (0.94 + Math.random() * 0.12);
    g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    o.connect(g); g.connect(this.audio.master); o.start(t); o.stop(t + 0.06);
  }
  // type text into an element. *shout* and _quiet_ are styled; one blip every other letter
  typeInto(elm, text, cps = 30, blipHz = 0) {
    clearInterval(elm._typing);
    const segs = []; text.replace(/\*([^*]+)\*|_([^_]+)_|([^*_]+)/g, (m0, a, b, c) => { segs.push(a ? ['shout', a] : b ? ['quiet', b] : ['', c]); return m0; });
    const total = segs.reduce((n, [, t]) => n + t.length, 0); let n = 0;
    const draw = () => { let left = n; elm.innerHTML = segs.map(([cls, t]) => { const part = t.slice(0, Math.max(0, left)); left -= t.length; const esc = part.replace(/&/g, '&amp;').replace(/</g, '&lt;'); return cls ? `<span class="${cls}">${esc}</span>` : esc; }).join(''); };
    draw();
    return new Promise((res) => {
      elm._typing = setInterval(() => {
        n++; draw();
        const ch = segs.map(([, t]) => t).join('')[n - 1];
        if (blipHz && ch && /\S/.test(ch) && n % 2) this.blip(blipHz);
        if (n >= total) { clearInterval(elm._typing); res(); }
      }, 1000 / cps);
    });
  }
  // the game speaking: name, portrait, typed line. opts: { face: 'manju' | item id, blip, speed, hold (ms), cls }
  dialog(text, who = '', opts = {}) {
    const D = this.dlgEl, face = D.querySelector('.face');
    D.hidden = false; D.className = opts.cls || '';
    D.querySelector('.who').textContent = who;
    let url = null;
    if (opts.face === 'manju') url = this.book?.portrait('manju');
    else if (opts.face) url = icon(opts.face, 8);
    face.style.backgroundImage = url ? `url(${url})` : ''; D.classList.toggle('noface', !url);
    D.querySelector('.more').hidden = true;
    clearTimeout(this._dlgT);
    this.typeInto(D.querySelector('.say'), text, opts.speed || 30, opts.blip || 0).then(() => {
      D.querySelector('.more').hidden = !opts.hold;
      if (opts.hold) this._dlgT = setTimeout(() => this.dlgHide(), opts.hold);
    });
  }
  dlgHide() { this.dlgEl.hidden = true; clearTimeout(this._dlgT); clearInterval(this.dlgEl.querySelector('.say')._typing); }
  card(def) {
    const how = { laptop: 'The map is open in the top corner now.  [M] makes it big.', tablet: 'Manju, Mutty and Zoya show up on the map now.  Wherever they are.',
      music: '[3], then click to throw it.  Whoever hears it goes to look.', mask: '[4], get right up to Zoya, click.  Masked, she can\'t call Manju.' }[def.id] || def.desc;
    this.dialog(`Got my ${def.name.toLowerCase()} back.\n_${how}_`, def.name.toUpperCase(), { face: def.id, cls: 'item', blip: 520, speed: 40, hold: 5200 });
  }
  toast(t, s) {
    const T = this.toastEl; T.innerHTML = `${t}${s ? `<small>${s}</small>` : ''}`; T.hidden = false;
    T.classList.remove('in'); void T.offsetWidth; T.classList.add('in');
    clearTimeout(this._toastT); this._toastT = setTimeout(() => { T.hidden = true; }, 2400);
  }
  banner(k, t, s) {
    const B = this.bannerEl; B.innerHTML = `<div class="k">${k}</div><div class="t">${t}</div>${s ? `<div class="s">${s}</div>` : ''}`;
    B.hidden = false; B.className = ''; void B.offsetWidth; B.className = 'in';
    clearTimeout(this._banT); clearTimeout(this._banT2);
    this._banT = setTimeout(() => { B.className = 'out'; }, 4200); this._banT2 = setTimeout(() => { B.hidden = true; }, 5000);
  }

  render() { this.renderObjectives(); this.renderBar(); }
  // the to-do list: a torn notebook page taped to the corner of the screen, in pencil; done things struck through
  renderObjectives() {
    if (!this.objEl) return;
    if (!this.playing) { this.objEl.innerHTML = ''; this._objKey = ''; return; }
    const got = ITEMS.filter((i) => this.have[i.id]).length, on = this.switches.filter((s) => s.on).length, tot = this.switches.length;
    const itemsDone = got === ITEMS.length, lightsDone = tot > 0 && on === tot;
    const key = `${got}|${on}|${this.phase}`; if (key === this._objKey) return;
    const bump = this._objKey && this._objKey !== key; this._objKey = key;
    const it = (done, lbl, extra = '') => `<div class="item${done ? ' done' : ''}"><span class="box"></span><span class="lbl">${lbl}</span>${extra}</div>`;
    const names = { laptop: 'laptop', tablet: 'tablet', music: 'music player', mask: 'face mask' };
    let h = '<div class="page"><div class="tape"></div><h4>to do</h4>';
    h += it(itemsDone, 'get my stuff back', itemsDone ? '' : `<span class="count">${got}/4</span>`);
    if (!itemsDone) h += '<div class="sub">' + ITEMS.map((i) => it(this.have[i.id], names[i.id])).join('') + '</div>';
    if (itemsDone) {
      h += it(lightsDone, 'turn every corridor light on', lightsDone ? '' : `<span class="count">${on}/${tot}</span>`);
      if (!lightsDone) h += '<div class="sub">' + ['ground floor', 'first floor', 'second floor'].map((n, f) => { const a = this.switches.filter((s) => s.fl === f), b = a.filter((s) => s.on).length; return it(b === a.length, n, `<span class="count">${b}/${a.length}</span>`); }).join('') + '</div>';
      h += lightsDone ? '<div class="item"><span class="box"></span><span class="lbl">???</span></div>' : '<div class="later">then… ?</div>';
    } else h += '<div class="later locked">then… ?</div>';
    this.objEl.innerHTML = h + '</div>';
    if (bump) this.objEl.querySelector('.page').classList.add('bump');
  }
  renderBar() {
    if (!this.barEl) return;
    if (!this.playing) { this.barEl.innerHTML = ''; this.barLabel.innerHTML = ''; this.mapEl.hidden = true; return; }
    this.barEl.innerHTML = SLOTS.map((s, i) => {
      const owned = s.id === 'food' ? this.food > 0 : this.have[s.id];
      const cd = this.cd[s.id] || 0, frac = cd > 0 ? cd / CD[s.id] : 0;
      return `<div class="s${i === this.sel ? ' sel' : ''}${owned ? '' : ' off'}"><span class="n">${i + 1}</span><img alt="" src="${icon(s.id)}">${s.id === 'food' && this.food ? `<span class="q">×${this.food}</span>` : ''}${frac > 0 ? `<div class="cd" style="background:conic-gradient(rgba(0,0,0,.72) ${(frac * 360).toFixed(0)}deg, transparent 0)"></div><div class="cdt">${Math.ceil(cd)}</div>` : ''}</div>`;
    }).join('');
    const s = SLOTS[this.sel];
    const tips = { laptop: '<span class="k">[M]</span> big map', tablet: 'everyone, on the map', music: '<span class="k">[click]</span> throw it', mask: '<span class="k">[click]</span> on Zoya', food: '<span class="k">[click]</span> throw to Mutty   <span class="k">[right-click]</span> eat' };
    this.barLabel.innerHTML = s && (s.id === 'food' ? this.food > 0 : this.have[s.id]) ? `${SLOTS[this.sel].name.toLowerCase()}  ·  ${tips[s.id]}` : '';
    this.mapEl.hidden = !(this.have.laptop || this.have.tablet);
    this.mapEl.classList.toggle('big', this.mapBig);
  }
  tickUi() { if (this.playing && Object.values(this.cd).some((v) => v > 0)) this.renderBar(); }

  // minimap: the laptop draws the plan of the floor you're on and you; the tablet adds everyone else
  drawMap(ctx) {
    if (this.mapEl.hidden) return;
    const big = this.mapBig, W = big ? 720 : 240, H = big ? 480 : 160;
    if (this.mapEl.width !== W) { this.mapEl.width = W; this.mapEl.height = H; }
    const g = this.mapEl.getContext('2d'); g.clearRect(0, 0, W, H);
    const m = this.mapData, fl = floorOf(ctx.feet.y + 0.1);
    const b = m?.bounds || [-38.3, 32.1, -15, 30.9], sx = W / (b[1] - b[0]), sz = H / (b[3] - b[2]), s = Math.min(sx, sz);
    const ox = (W - (b[1] - b[0]) * s) / 2, oz = (H - (b[3] - b[2]) * s) / 2;
    const P = (x, z) => [ox + (x - b[0]) * s, oz + (z - b[2]) * s];
    if (this.have.laptop && m) {
      const fills = { corr: '#7c8a8a', room: '#2e3a3c', bath: '#3c4a5a', stair: '#4f8a5a', void: '#0a0d10' };
      for (const [x0, x1, z0, z1, k] of m.rects) { const [a, c] = P(x0, z0), [e, f] = P(x1, z1); g.fillStyle = fills[k] || '#333'; g.fillRect(a, c, e - a, f - c); if (k === 'room' || k === 'bath') { g.strokeStyle = '#0a0d10'; g.lineWidth = 1; g.strokeRect(a + 0.5, c + 0.5, e - a - 1, f - c - 1); } }
      if (this.phase === 'lights' || this.phase === 'done') for (const sw of this.switches) if (sw.fl === fl) { const [x, y] = P(sw.pos.x, sw.pos.z); g.fillStyle = sw.on ? '#3cff5a' : '#ffd23a'; g.fillRect(x - 2, y - 2, 4, 4); }
      g.fillStyle = '#efe9dc'; g.font = `${big ? 26 : 17}px VT323, monospace`; g.fillText(FLOOR_NAME[fl].toUpperCase(), 6, big ? 24 : 15);
    } else { g.fillStyle = 'rgba(239,233,220,.6)'; g.font = '17px VT323, monospace'; g.fillText('NO MAP - FIND THE LAPTOP', 6, 15); }
    // characters (tablet)
    if (this.have.tablet) {
      const dots = [[this.manju, '#ff3b30', 'M'], [this.mutty, '#ff9a1a', 'm'], [this.zoya, '#c06bff', 'Z']];
      for (const [n, c, lab] of dots) {
        if (!n?.pos || n.state === 'off' || n.state === 'away' || n.state === 'cutscene') continue;
        const nf = floorOf(n.pos.y + 0.1), [x, y] = P(n.pos.x, n.pos.z);
        g.globalAlpha = nf === fl ? 1 : 0.4; g.fillStyle = c; g.beginPath(); g.arc(x, y, big ? 6 : 3.5, 0, 7); g.fill();
        if (nf !== fl) { g.fillStyle = '#fff'; g.font = `${big ? 18 : 13}px VT323, monospace`; g.fillText(`${lab}${nf}`, x + 4, y - 3); }
        g.globalAlpha = 1;
      }
    }
    // you: an arrow
    const [px, pz] = P(ctx.feet.x, ctx.feet.z), fwd = new THREE.Vector3(); this.camera.getWorldDirection(fwd);
    const a = Math.atan2(fwd.x, fwd.z), r = big ? 9 : 5;
    g.fillStyle = '#ffffff'; g.beginPath();
    g.moveTo(px + Math.sin(a) * r, pz + Math.cos(a) * r); g.lineTo(px + Math.sin(a + 2.5) * r * 0.7, pz + Math.cos(a + 2.5) * r * 0.7); g.lineTo(px + Math.sin(a - 2.5) * r * 0.7, pz + Math.cos(a - 2.5) * r * 0.7); g.fill();
  }
}
