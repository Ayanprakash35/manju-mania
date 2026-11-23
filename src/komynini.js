// CowShit Komynini — room 15's resident (public/models/komynini.glb, built by tools/komynini.py).
// Harmless: he lies on the bed on the right as you come in (bed 2, against the south wall), on his side facing the
// wall, scrolling reels on his tablet. Now and then he glances back at the door. When you come in and the door is
// open he twists round and yells at you to close it, and keeps on at you every few seconds until it's shut.
//
// The model ships lying in bed: origin = middle of the mattress top, head toward -Z, the wall on +X, the room on -X.
// Clips: Scroll (4.4 s loop, thumb swipes at ~0.7/1.9/3.5 s), Glance (2.4 s), Yell (3.4 s, the shout ~0.6-1.75 s).
// The tablet screen ('TabletScreen') shows a vertical strip of three reels in its emissive map: offset.y += 1/3 swipes.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const SWIPES = [1.02, 2.22, 3.82];        // just after each thumb swipe in Scroll
const SHOUT_AT = 0.6;                     // into Yell
const REYELL = 7.5;                       // seconds between yells while the door stays open

export class Komynini {
  constructor({ scene, audio, voices }) {
    Object.assign(this, { scene, audio, voices });
    this.root = null; this.mixer = null; this.actions = {}; this.screen = null;
    this.mode = 'scroll'; this.modeT = 0; this.shouted = false;
    this.glanceIn = 12 + Math.random() * 14;
    this.yellCool = 0; this.wasIn = false; this.lastScrollT = 0; this.openT = 0; this.pending = null;
  }

  load(url, at) {
    return new Promise((resolve, reject) => new GLTFLoader().load(url, (gltf) => {
      const root = this.root = gltf.scene;
      root.position.set(at.x, at.y, at.z);
      root.rotation.y = -Math.PI / 2;      // head (-Z) to the window wall (+x), the wall he faces (+X) to the south wall (+z)
      root.traverse((o) => {
        if (!o.isMesh) return;
        o.frustumCulled = false;            // skinned: the bind-pose bounds don't follow the pose
        if (o.name === 'BlanketPillow') o.material.color.multiplyScalar(1.45);   // the thick grey duvet reads grey under the room's tube light, not charcoal
        if (o.material?.name === 'TabletScreen' && o.material.emissiveMap) {
          this.screen = o.material.emissiveMap;
          this.screen.wrapT = THREE.RepeatWrapping; this.screen.needsUpdate = true;
        }
      });
      this.scene.add(root);
      this.mixer = new THREE.AnimationMixer(root);
      for (const clip of gltf.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
      for (const n of ['Glance', 'Yell']) if (this.actions[n]) { this.actions[n].setLoop(THREE.LoopOnce, 1); this.actions[n].clampWhenFinished = true; }
      this.actions.Scroll?.play();
      this.mixer.addEventListener('finished', (e) => { if (e.action === this.actions.Yell || e.action === this.actions.Glance) this.backToScroll(); });
      resolve(root);
    }, undefined, reject));
  }

  play(name) {
    const a = this.actions[name]; if (!a) return;
    const from = this.actions[this.mode === 'scroll' ? 'Scroll' : this.mode === 'yell' ? 'Yell' : 'Glance'];
    a.reset(); a.play();
    if (from && from !== a) a.crossFadeFrom(from, 0.15, false);
    this.mode = name.toLowerCase(); this.modeT = 0; this.shouted = false;
  }

  backToScroll() {
    const s = this.actions.Scroll, from = this.mode === 'yell' ? this.actions.Yell : this.actions.Glance; if (!s) return;
    s.reset(); s.play(); if (from) s.crossFadeFrom(from, 0.2, false);    // both one-shots end on Scroll's first frame
    this.mode = 'scroll'; this.modeT = 0; this.lastScrollT = 0;
  }

  // ctx: { inRoom (player inside room 15), doorOpen, listener (voices listener info) }
  update(dt, ctx) {
    if (!this.mixer) return;
    this.mixer.update(dt);
    this.modeT += dt;
    // reels: swipe to the next one just after each thumb flick
    if (this.mode === 'scroll' && this.screen && this.actions.Scroll) {
      const t = this.actions.Scroll.time;
      for (const s of SWIPES) if ((this.lastScrollT < s && t >= s) || (t < this.lastScrollT && s > this.lastScrollT)) this.screen.offset.y = (this.screen.offset.y + 1 / 3) % 1;
      this.lastScrollT = t;
    }
    // the shout, timed to his mouth
    if (this.mode === 'yell' && !this.shouted && this.modeT >= SHOUT_AT) {
      this.shouted = true;
      const name = this.voices?.pick('komynini');
      if (name) this.voices.play(name, this.mouth(), { listener: ctx.listener, gain: 2.2, ref: 3.5 });
    }
    // you came in and left the door open: a beat later he yells, and keeps at it while you're in with it open
    // (open it from inside and he gives you a moment to go)
    this.yellCool = Math.max(0, this.yellCool - dt);
    this.openT = ctx.doorOpen ? this.openT + dt : 0;
    const cameIn = ctx.inRoom && !this.wasIn;
    this.wasIn = ctx.inRoom;
    if (cameIn && ctx.doorOpen && this.yellCool <= 0) this.pending = 0.45;
    const go = () => { if (this.mode !== 'yell') { this.play('Yell'); this.yellCool = REYELL; } };
    if (this.pending != null) { this.pending -= dt; if (this.pending <= 0) { this.pending = null; if (ctx.inRoom && ctx.doorOpen) go(); } }
    else if (ctx.inRoom && ctx.doorOpen && this.openT > 1.5 && this.yellCool <= 0) go();
    // an idle glance back at the door now and then
    if (this.mode === 'scroll') {
      this.glanceIn -= dt;
      if (this.glanceIn <= 0) { this.play('Glance'); this.glanceIn = 15 + Math.random() * 20; }
    }
  }

  // where his voice comes from (Voices adds 1.4 m to y, so pass a point 1.4 m under his head)
  mouth() { const p = this.root.position; return new THREE.Vector3(p.x + 0.6, p.y + 0.15 - 1.4, p.z); }
}
