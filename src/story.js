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
  quit() { this.endCutscene(true); this.reset(true); this.contextEl.hidden = true; this.subEl.hidden = true; }

  placeOnDesk() {        // your things laid out in room 15, where the cutscene finds them
    const at = { laptop: [28.22, 1.516, 18.55, -Math.PI / 2], tablet: [27.55, 1.326, 17.55, 0.4], music: [28.3, 1.516, 19.28, 0.3], mask: [28.15, 1.516, 19.62, -0.5] };
    for (const [id, [x, y, z, ry]] of Object.entries(at)) { const it = this.items[id]; it.mesh.position.set(x, y, z); it.mesh.rotation.set(0, ry, 0); it.mesh.scale.setScalar(1); it.mesh.visible = true; it.sprite.visible = false; it.home = it.mesh.position.clone(); }
  }

  showContext() {
    const lines = ['ROOM 15  ·  9:52 PM', 'Laptop submission closed at 9:30.', 'Yours is still sitting on your desk. So are your tablet, your music player and your face mask.', 'Footsteps in the corridor.', 'It\'s Manju.'];
    this.contextEl.hidden = false; this.contextEl.querySelector('.lines').innerHTML = '';
    lines.forEach((t, i) => setTimeout(() => { if (this.phase !== 'intro' || this.contextEl.hidden) return; const p = document.createElement('p'); p.textContent = t; if (i === lines.length - 1) p.className = 'big'; this.contextEl.querySelector('.lines').appendChild(p); }, 300 + i * 1100));
    this.contextT = 300 + lines.length * 1100 + 1600;
    this.contextStart = performance.now();
  }
  skip() {
    if (this.phase !== 'intro') return false;
    if (!this.contextEl.hidden) { this.contextEl.hidden = true; this.startCutscene(); return true; }
    if (this.cut) { this.endCutscene(); return true; }
    return false;
  }

  startCutscene() {
    const m = this.manju;
    this.cut = { t: 0, sucked: 0, said: 0, slam: false, opened: false, manjuOut: false };
    this.prevManjuState = m.state; m.state = 'cutscene';
    if (m.root) { m.root.visible = true; m.root.traverse((o) => { if (o.isSkinnedMesh || o.isMesh) o.visible = true; }); for (const e of m.eyes || []) e.visible = false; m.root.position.set(24.35, 0.766, 17.77); m.root.rotation.y = Math.PI / 2; m.play?.('Walk', 0.1); }
    this.seatCam();
  }
  seatCam() { const c = this.camera; c.position.set(27.25, 0.766 + 1.12, 18.2); c.lookAt(25.3, 1.9, 17.8); }
  endCutscene(silent = false) {
    if (!this.cut) return;
    const m = this.manju, d = this.room15Door;
    this.cut = null;
    for (const id in this.items) { const it = this.items[id]; it.mesh.visible = false; }
    if (d && d.target !== 0) this.roomDoors.toggle(d, this.camera.position);
    m.state = 'off'; if (m.root) m.root.visible = false;
    this.subEl.hidden = true;
    if (!silent) this.finishIntro();
  }
  finishIntro() {
    this.scatter();
    this.phase = 'items';
    this.respawn();
    this.banner('GET YOUR STUFF BACK', 'Manju scattered it across all three floors.');
    this.render();
  }

  updateCutscene(dt) {
    const c = this.cut, m = this.manju, d = this.room15Door; c.t += dt;
    const T = c.t, cam = this.camera;
    const sub = (txt) => { this.subEl.hidden = !txt; if (txt) this.subEl.innerHTML = txt; };
    // the door bursts open
    if (!c.opened && T > 0.2) { c.opened = true; if (d && d.target === 0) this.roomDoors.toggle(d, new THREE.Vector3(24.3, 1.5, 17.77)); this.audio.door?.(); }
    const head = new THREE.Vector3();
    if (m.root) {
      // walk in (0.4 - 2.4 s), stare and shout, then walk back out (8.4 - 10.4 s)
      const a = new THREE.Vector3(24.35, 0.766, 17.77), b = new THREE.Vector3(26.0, 0.766, 17.95), out = new THREE.Vector3(24.45, 0.766, 15.6);
      if (T < 2.4) { const k = THREE.MathUtils.smoothstep(T, 0.4, 2.4); m.root.position.lerpVectors(a, b, k); m.root.rotation.y = Math.PI / 2; }
      else if (T < 8.4) { m.root.position.copy(b); if (!c.stared) { c.stared = true; m.play?.('Stare', 0.15); this.audio.stareSting?.(); } }
      else if (T < 10.6) {
        if (!c.leaving) { c.leaving = true; m.play?.('Walk', 0.2); }
        const k = THREE.MathUtils.smoothstep(T, 8.4, 10.6), mid = new THREE.Vector3(24.45, 0.766, 17.77);
        if (k < 0.5) { m.root.position.lerpVectors(b, mid, k * 2); m.root.rotation.y = -Math.PI / 2; } else { m.root.position.lerpVectors(mid, out, k * 2 - 1); m.root.rotation.y = Math.PI; }
      } else m.root.visible = false;
      m.mixer?.update(dt);
      m.root.updateMatrixWorld(true);
      if (m.head) m.head.getWorldPosition(head); else head.copy(m.root.position).add(new THREE.Vector3(0, 1.7, 0));
    }
    // what he says
    if (T > 2.6 && T < 4.6) sub('<b>MANJU:</b> Laptop submission was at <i>nine-thirty</i>.');
    else if (T > 4.6 && T < 8.2) sub('<b>MANJU:</b> You think the rules don\'t apply to you? <b>Everything. Confiscated.</b>');
    else if (T > 10.4 && T < 13) sub('Your stuff is scattered across all three floors. <b>Get it back.</b>');
    else sub('');
    // everything gets sucked out of the room into him (5.2 - 8.0 s)
    const ids = ['laptop', 'tablet', 'music', 'mask'];
    ids.forEach((id, i) => {
      const it = this.items[id], t0 = 5.2 + i * 0.5, k = THREE.MathUtils.clamp((T - t0) / 0.9, 0, 1);
      if (T < t0) return;
      if (!it.whoosh) { it.whoosh = true; this.audio.burst?.(600 + i * 200, 1.2, 0.5, 0.08, 'bandpass', 3200); }
      const p = it.home.clone().lerp(head.clone().add(new THREE.Vector3(0.2, -0.35, 0)), k * k);
      p.y += Math.sin(k * Math.PI) * 0.35;
      it.mesh.position.copy(p); it.mesh.rotation.y += dt * 14; it.mesh.rotation.x += dt * 9;
      it.mesh.scale.setScalar(1 - k * 0.85); it.mesh.visible = k < 1;
    });
    if (T > 5.0 && T < 8.0) { cam.position.x += (Math.random() - 0.5) * 0.012; cam.position.y += (Math.random() - 0.5) * 0.012; }
    // the door slams behind him
    if (!c.slam && T > 10.7) { c.slam = true; if (d && d.target !== 0) this.roomDoors.toggle(d, this.camera.position); this.audio.door?.(); this.audio.rattle?.(); }
    // camera: seated on the bed, watching him (and the stuff flying)
    this.seatCam();
    const look = T < 0.5 ? new THREE.Vector3(25.3, 1.9, 17.77) : T < 10.6 ? head : new THREE.Vector3(25.3, 1.7, 17.77);
    const q0 = cam.quaternion.clone(); cam.lookAt(look);
    if (this.camQ) { cam.quaternion.copy(this.camQ.slerp(cam.quaternion, Math.min(1, dt * 4))); } this.camQ = cam.quaternion.clone(); void q0;
    if (T > 13.2) this.endCutscene();
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
    if (L.kind === 'item') return `E  pick up ${ITEMS.find((i) => i.id === L.id).name}`;
    if (L.kind === 'food' || L.kind === 'thrownFood') return this.food >= 3 ? 'Pockets full of food' : 'E  take the food';
    if (L.kind === 'switch') {
      if (L.sw.on) return 'Light switch — on';
      if (this.phase !== 'lights' && this.phase !== 'done') return 'Light switch — dead. Find your stuff first.';
      if (this.hold?.sw === L.sw) return `Hold E…  ${Math.round(this.hold.t / this.holdNeed() * 100)}%`;
      return `Hold E  turn on the lights  (${this.holdNeed().toFixed(1)} s)`;
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
      setTimeout(() => this.banner('NEW OBJECTIVE', 'Turn on all the corridor lights — 6 switches on every floor.'), 2600);
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
    if (this.phase === 'intro' && !this.contextEl.hidden && performance.now() - this.contextStart > this.contextT) { this.contextEl.hidden = true; this.startCutscene(); }
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
          if (this.switches.every((x) => x.on)) { this.phase = 'done'; this.banner('ALL THE LIGHTS ARE ON', 'Something is waiting. (The finale comes later.)'); }
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

  // ------------------------------------------------------------------------------------------ UI
  ui() {
    const css = document.createElement('style');
    css.textContent = `
      #obj { position: fixed; right: 16px; top: 14px; width: 270px; color: #e8ecea; font: 13px/1.45 ui-monospace, Menlo, monospace; text-shadow: 0 1px 3px #000; pointer-events: none; z-index: 6; }
      #obj h4 { margin: 0 0 6px; font: 600 11px ui-monospace, Menlo, monospace; letter-spacing: 3px; color: #5fa49e; }
      #obj .o { margin: 0 0 6px; } #obj .o.done { opacity: .45; } #obj .o.locked { opacity: .35; }
      #obj .t { font-weight: 700; } #obj .sub { margin-left: 16px; } #obj .sub .ok { color: #8fe08f; } #obj .sub .no { color: rgba(232,236,234,.75); }
      #bar { position: fixed; left: 50%; bottom: 64px; transform: translateX(-50%); display: flex; gap: 6px; z-index: 6; pointer-events: none; }
      #bar .s { position: relative; width: 50px; height: 50px; background: rgba(5,9,11,.62); border: 2px solid rgba(232,236,234,.18); display: flex; align-items: center; justify-content: center; font-size: 24px; }
      #bar .s.sel { border-color: #5fa49e; background: rgba(20,40,40,.75); } #bar .s.off { opacity: .25; filter: grayscale(1); }
      #bar .s i { position: absolute; left: 3px; top: 1px; font: 10px ui-monospace, monospace; font-style: normal; color: #cfd6d4; }
      #bar .s b { position: absolute; right: 3px; bottom: 1px; font: 700 11px ui-monospace, monospace; color: #fff; }
      #bar .s .cd { position: absolute; left: 0; right: 0; bottom: 0; background: rgba(192,69,58,.55); }
      #bar .s .t { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font: 700 12px ui-monospace, monospace; color: #fff; text-shadow: 0 1px 2px #000; }
      #barlabel { position: fixed; left: 50%; bottom: 120px; transform: translateX(-50%); font: 12px ui-monospace, Menlo, monospace; color: rgba(232,236,234,.8); text-shadow: 0 1px 3px #000; pointer-events: none; z-index: 6; white-space: nowrap; }
      #card { position: fixed; left: 50%; bottom: 150px; transform: translateX(-50%); width: min(460px, 86vw); padding: 12px 16px; background: rgba(4,9,11,.86); border-left: 3px solid #5fa49e; color: #e8ecea; font: 13px/1.5 ui-monospace, Menlo, monospace; z-index: 7; pointer-events: none; }
      #card[hidden], #toast[hidden], #banner[hidden], #ctx[hidden], #sub[hidden], #map[hidden] { display: none; }
      #card h3 { margin: 0 0 4px; font: 700 15px ui-monospace, monospace; letter-spacing: 1px; }
      #toast { position: fixed; left: 50%; top: 58%; transform: translateX(-50%); font: 13px ui-monospace, Menlo, monospace; color: #e8ecea; text-shadow: 0 1px 3px #000; text-align: center; pointer-events: none; z-index: 7; }
      #toast b { display: block; font-size: 15px; }
      #banner { position: fixed; left: 0; right: 0; top: 22%; text-align: center; color: #f2f4f2; pointer-events: none; z-index: 7; text-shadow: 0 2px 6px #000; }
      #banner h2 { margin: 0; font: 900 clamp(24px, 4vw, 46px) "Arial Black", Impact, sans-serif; letter-spacing: .1em; text-shadow: -3px 0 #ff2a2a, 3px 0 #22e0ff; }
      #banner p { margin: 6px 0 0; font: 14px ui-monospace, Menlo, monospace; }
      #ctx { position: fixed; inset: 0; z-index: 15; background: #000; color: #e8ecea; display: flex; flex-direction: column; justify-content: center; padding: 0 12vw; box-sizing: border-box; font: 18px/1.7 ui-monospace, Menlo, monospace; }
      #ctx p { margin: 0 0 10px; animation: ctxin .6s ease-out; } #ctx p.big { font: 900 clamp(28px, 5vw, 56px) "Arial Black", Impact, sans-serif; letter-spacing: .08em; color: #f2f4f2; text-shadow: -3px 0 #ff2a2a, 3px 0 #22e0ff; margin-top: 14px; }
      #ctx .skip { position: absolute; right: 24px; bottom: 20px; font-size: 12px; opacity: .55; }
      @keyframes ctxin { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
      #sub { position: fixed; left: 50%; bottom: 13vh; transform: translateX(-50%); max-width: 80vw; padding: 6px 14px; background: rgba(0,0,0,.6); color: #f2f4f2; font: 16px/1.5 ui-monospace, Menlo, monospace; text-align: center; z-index: 8; pointer-events: none; }
      #sub b { color: #ff6a55; } body.cut #crosshair, body.cut #hud, body.cut #hint, body.cut #hearts, body.cut #bar, body.cut #barlabel, body.cut #obj, body.cut #map { display: none !important; }
      #map { position: fixed; left: 14px; top: 62px; width: min(240px, 30vw); z-index: 6; pointer-events: none; border: 2px solid rgba(232,236,234,.22); background: rgba(5,9,11,.7); image-rendering: pixelated; }
      #map.big { left: 50%; top: 50%; width: min(720px, 92vw); transform: translate(-50%, -50%); }
      body.inmenu #obj, body.inmenu #bar, body.inmenu #barlabel, body.inmenu #map, body.inmenu #card, body.inmenu #toast, body.inmenu #banner, body.inmenu #sub { display: none !important; }`;
    document.head.appendChild(css);
    const el = (id, html = '', tag = 'div') => { const e = document.createElement(tag); e.id = id; e.innerHTML = html; document.body.appendChild(e); return e; };
    this.objEl = el('obj'); this.barEl = el('bar'); this.barLabel = el('barlabel');
    this.cardEl = el('card'); this.cardEl.hidden = true;
    this.toastEl = el('toast'); this.toastEl.hidden = true;
    this.bannerEl = el('banner'); this.bannerEl.hidden = true;
    this.contextEl = el('ctx', '<div class="lines"></div><div class="skip">Space — skip</div>'); this.contextEl.hidden = true;
    this.subEl = el('sub'); this.subEl.hidden = true;
    this.mapEl = el('map', '', 'canvas'); this.mapEl.hidden = true; this.mapEl.width = 240; this.mapEl.height = 160;
  }
  card(def) {
    this.cardEl.innerHTML = `<h3>${def.icon} ${def.name}</h3>${def.desc}`; this.cardEl.hidden = false;
    clearTimeout(this._cardT); this._cardT = setTimeout(() => { this.cardEl.hidden = true; }, 9000);
  }
  toast(t, s) { this.toastEl.innerHTML = `<b>${t}</b>${s || ''}`; this.toastEl.hidden = false; clearTimeout(this._toastT); this._toastT = setTimeout(() => { this.toastEl.hidden = true; }, 2600); }
  banner(t, s) { this.bannerEl.innerHTML = `<h2>${t}</h2><p>${s || ''}</p>`; this.bannerEl.hidden = false; clearTimeout(this._banT); this._banT = setTimeout(() => { this.bannerEl.hidden = true; }, 4200); }

  render() { this.renderObjectives(); this.renderBar(); }
  renderObjectives() {
    if (!this.objEl) return;
    if (!this.playing) { this.objEl.innerHTML = ''; return; }
    const got = ITEMS.filter((i) => this.have[i.id]).length, on = this.switches.filter((s) => s.on).length;
    const itemsDone = got === ITEMS.length;
    let h = '<h4>OBJECTIVES</h4>';
    h += `<div class="o${itemsDone ? ' done' : ''}"><div class="t">${itemsDone ? '☑' : '▸'} Get your stuff back  ${got}/${ITEMS.length}</div>`;
    if (!itemsDone) h += ITEMS.map((i) => `<div class="sub"><span class="${this.have[i.id] ? 'ok' : 'no'}">${this.have[i.id] ? '☑' : '☐'} ${i.name}</span></div>`).join('');
    h += '</div>';
    if (itemsDone) {
      const lightsDone = on === this.switches.length && on > 0;
      h += `<div class="o${lightsDone ? ' done' : ''}"><div class="t">${lightsDone ? '☑' : '▸'} Turn on the corridor lights  ${on}/${this.switches.length}</div>`;
      if (!lightsDone) for (let f = 0; f < 3; f++) { const n = this.switches.filter((s) => s.fl === f && s.on).length, t = this.switches.filter((s) => s.fl === f).length; h += `<div class="sub"><span class="${n === t ? 'ok' : 'no'}">${n === t ? '☑' : '☐'} ${FLOOR_NAME[f]}  ${n}/${t}</span></div>`; }
      h += '</div>';
      if (lightsDone) h += '<div class="o"><div class="t">▸ ??? </div><div class="sub"><span class="no">The finale comes later.</span></div></div>';
    } else h += '<div class="o locked"><div class="t">▸ ???</div></div>';
    this.objEl.innerHTML = h;
  }
  renderBar() {
    if (!this.barEl) return;
    if (!this.playing) { this.barEl.innerHTML = ''; this.barLabel.textContent = ''; this.mapEl.hidden = true; return; }
    this.barEl.innerHTML = SLOTS.map((s, i) => {
      const owned = s.id === 'food' ? this.food > 0 : this.have[s.id];
      const cd = this.cd[s.id] || 0, frac = cd > 0 ? cd / CD[s.id] : 0;
      return `<div class="s${i === this.sel ? ' sel' : ''}${owned ? '' : ' off'}"><i>${i + 1}</i>${s.icon}${s.id === 'food' && this.food ? `<b>×${this.food}</b>` : ''}${frac > 0 ? `<div class="cd" style="height:${(frac * 100).toFixed(0)}%"></div><div class="t">${Math.ceil(cd)}</div>` : ''}</div>`;
    }).join('');
    const s = SLOTS[this.sel];
    const tips = { laptop: 'Laptop — the map  (click / M: big map)', tablet: 'Tablet — everyone on the map', music: 'Music player — click to throw', mask: 'Face mask — click on Zoya', food: 'Food — click: throw to Mutty   right-click: eat' };
    this.barLabel.textContent = s && (s.id === 'food' ? this.food > 0 : this.have[s.id]) ? tips[s.id] : '';
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
      g.fillStyle = '#cfd6d4'; g.font = `${big ? 14 : 10}px ui-monospace, monospace`; g.fillText(FLOOR_NAME[fl], 6, big ? 18 : 12);
    } else { g.fillStyle = '#cfd6d4'; g.font = '10px ui-monospace, monospace'; g.fillText('no map — find the laptop', 6, 12); }
    // characters (tablet)
    if (this.have.tablet) {
      const dots = [[this.manju, '#ff3b30', 'M'], [this.mutty, '#ff9a1a', 'm'], [this.zoya, '#c06bff', 'Z']];
      for (const [n, c, lab] of dots) {
        if (!n?.pos || n.state === 'off' || n.state === 'away' || n.state === 'cutscene') continue;
        const nf = floorOf(n.pos.y + 0.1), [x, y] = P(n.pos.x, n.pos.z);
        g.globalAlpha = nf === fl ? 1 : 0.4; g.fillStyle = c; g.beginPath(); g.arc(x, y, big ? 6 : 3.5, 0, 7); g.fill();
        if (nf !== fl) { g.fillStyle = '#fff'; g.font = `${big ? 11 : 8}px ui-monospace`; g.fillText(`${lab}${nf}`, x + 4, y - 3); }
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
