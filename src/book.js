// The character book: who's in the hostel, what they do, how to get past them. An entry unlocks the first time you
// properly see that character (in front of you, close enough, nothing in the way) or the first time one gets you;
// unlocks are remembered between sessions. When a character kills you, the death screen shows its entry.
// Portraits are rendered from the game's own models (a clone posed in a little studio), not from photos.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

export const ENTRIES = [
  {
    id: 'manju', name: 'Manju', role: 'The warden',
    what: 'Patrols the ground and first floors, stopping for a smoke. If he notices you he stares for a moment, then charges — and if he reaches you, you\'re caught. Zoya and Mutty both report to him, and he comes running.',
    avoid: [
      'He sees a torch from about 22 m, but only about 8 m without one — switch it off when you hear him.',
      'Crouch: slower, and silent. Running and landing carry a long way.',
      'Break his line of sight; he loses you after a few seconds without it.',
      'Throw the music player and he goes to see what the noise is.',
      'Room 15 is safe — he never comes in. The second floor too: he\'s already done with it.',
    ],
  },
  {
    id: 'mutty', name: 'Mutty', role: 'The crawler',
    what: 'Crawls the ground floor. He hears running from far off, closes in fast and pounces from a metre or two — every bite takes a heart. After biting he scuttles off to tell Manju exactly where you are.',
    avoid: [
      'Walk or crouch on the ground floor; never run near him.',
      'Step into any student room: he loses you at the door.',
      'Throw him food — he stops to eat it for three minutes.',
      'Don\'t stay shut in a rest-room cubicle for more than 10 seconds. He comes in under the door.',
    ],
  },
  {
    id: 'zoya', name: 'Dr Zoya', role: 'The spotter',
    what: 'Walks the first floor. She won\'t touch you — she spots you, shouts "These boys!", points, and calls Manju, who turns up close by within seconds.',
    avoid: [
      'Her eyes are narrow but sharp: about 14 m straight ahead. Stay out of the line of the corridor she\'s facing.',
      'Get close behind her and put the face mask on her: she can\'t call Manju for 60 seconds.',
      'The music player pulls her off her patrol.',
    ],
  },
  {
    id: 'komynini', name: 'CowShit Komynini', role: 'Room 15',
    what: 'Lives on the bed on the right in room 15, scrolling reels under his duvet. Completely harmless. Very loud.',
    avoid: ['Close the door behind you.'],
  },
  {
    id: 'figure', name: 'The figures', role: 'Second floor',
    what: 'Something stands at the far end of the dark corridors, and all over the second floor, where Manju has already been. It\'s there for a heartbeat. Then it isn\'t.',
    avoid: ['You can\'t. Don\'t stare.'],
  },
];
const KEY = 'manju.book';

export class Book {
  // o: { renderer, camera, getCollider, chars: () => ({ manju, mutty, zoya, komynini, director }), toast(t, s) }
  constructor(o) {
    Object.assign(this, o);
    this.seen = new Set();
    try { for (const id of JSON.parse(localStorage.getItem(KEY) || '[]')) this.seen.add(id); } catch { /* private mode */ }
    this.portraits = {};
    this.t = 0;
    this.ui();
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify([...this.seen])); } catch { /* ignore */ } }
  entry(id) { return ENTRIES.find((e) => e.id === id); }

  discover(id, quiet = false) {
    if (!this.entry(id) || this.seen.has(id)) return false;
    this.seen.add(id); this.save();
    if (!quiet) this.toast?.('New in the character book', this.entry(id).name + '  ·  open it from the pause menu');
    if (!this.el.hidden) this.render();
    return true;
  }

  // first proper sighting: in front of you, close, not behind a wall (4 Hz)
  update(dt, ctx) {
    this.t -= dt; if (this.t > 0) return; this.t = 0.25;
    const { manju, mutty, zoya, komynini, director } = this.chars();
    const cam = this.camera.position, fwd = this.camera.getWorldDirection(new THREE.Vector3());
    const col = this.getCollider();
    const sees = (p, maxD) => {
      const to = p.clone().sub(cam), d = to.length(); if (d > maxD || d < 0.01) return false;
      if (to.clone().normalize().dot(fwd) < 0.55) return false;
      if (!col) return true;
      const rc = this._rc ||= new THREE.Raycaster(); rc.firstHitOnly = true;
      rc.set(cam, to.normalize()); rc.far = d - 0.3;
      return !rc.intersectObject(col, false).length;
    };
    for (const [id, n, h] of [['manju', manju, 1.3], ['mutty', mutty, 0.4], ['zoya', zoya, 1.3]]) {
      if (this.seen.has(id) || !n?.root || !n.pos || ['off', 'away', 'cutscene'].includes(n.state)) continue;
      if (!n.root.visible || n.visible === false) continue;           // in the dark you can't see him: no sighting
      if (sees(n.pos.clone().add(new THREE.Vector3(0, h, 0)), id === 'mutty' ? 12 : 18)) this.discover(id);
    }
    if (ctx?.cutscene && !this.seen.has('manju')) this.discover('manju');
    if (!this.seen.has('komynini') && komynini?.root && ctx?.safe && sees(komynini.root.position.clone().add(new THREE.Vector3(0, 0.3, 0)), 6)) this.discover('komynini');
    if (!this.seen.has('figure') && director?.fig?.beat) this.discover('figure');
  }

  // ------------------------------------------------------------------ portraits
  portrait(id) {
    if (this.portraits[id]) return this.portraits[id];
    const { manju, mutty, zoya, komynini, director } = this.chars();
    const src = { manju: manju?.root, mutty: mutty?.root, zoya: zoya?.root, komynini: komynini?.root, figure: director?.shape }[id];
    if (!src) return null;
    const W = 240, H = 300, R = this.renderer;
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0b1013);
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const key = new THREE.DirectionalLight(0xfff2e0, 2.2); key.position.set(1.2, 2, 2.5); scene.add(key);
    const rim = new THREE.DirectionalLight(0x6fb4ff, 1.2); rim.position.set(-2, 1.5, -2); scene.add(rim);
    let obj;
    try { obj = id === 'figure' ? src.clone(true) : cloneSkinned(src); } catch { return null; }
    obj.position.set(0, 0, 0); obj.rotation.set(0, 0, 0);
    obj.traverse((o) => { o.visible = true; if (o.isSprite) o.visible = false; if (o.material && !Array.isArray(o.material) && o.material.opacity === 0) o.material.opacity = 1; });
    scene.add(obj); obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const cam = new THREE.PerspectiveCamera(30, W / H, 0.01, 50);
    if (id === 'manju' || id === 'zoya') {                 // head and shoulders
      const ty = box.max.y - size.y * 0.2, span = size.y * 0.42;
      cam.position.set(c.x + span * 0.6, ty + 0.02, c.z + span / Math.tan(THREE.MathUtils.degToRad(15)) * 0.62);
      cam.lookAt(c.x, ty - span * 0.12, c.z);
    } else if (id === 'komynini') {                        // lying in bed: from the room side, above
      const s = Math.max(size.x, size.z);
      cam.position.set(c.x - s * 0.9, c.y + s * 1.1, c.z + s * 0.25); cam.lookAt(c.x, c.y, c.z - s * 0.2);
    } else {                                               // the crawler, the figure: the whole body
      const s = Math.max(size.x, size.y, size.z);
      cam.position.set(c.x + s * 0.7, c.y + s * 0.35, c.z + s * 1.9); cam.lookAt(c.x, c.y, c.z);
    }
    const rt = new THREE.WebGLRenderTarget(W, H);
    const prevRT = R.getRenderTarget(), prevClip = R.clippingPlanes;
    R.clippingPlanes = []; R.setRenderTarget(rt); R.render(scene, cam); R.setRenderTarget(prevRT); R.clippingPlanes = prevClip;
    const px = new Uint8Array(W * H * 4); R.readRenderTargetPixels(rt, 0, 0, W, H, px); rt.dispose();
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d'), img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    g.putImageData(img, 0, 0);
    return (this.portraits[id] = cv.toDataURL('image/png'));
  }

  // ------------------------------------------------------------------ UI
  ui() {
    const css = document.createElement('style');
    css.textContent = `
      #book { position: fixed; inset: 0; z-index: 30; background: rgba(2,5,7,.985); color: #e8ecea; display: flex; flex-direction: column; font: 14px/1.55 ui-monospace, Menlo, monospace; }
      #book[hidden] { display: none; }
      #book header { display: flex; align-items: center; justify-content: space-between; padding: 18px 26px 6px; }
      #book h2 { margin: 0; font: 900 clamp(22px, 3.4vw, 38px) "Arial Black", Impact, sans-serif; letter-spacing: .1em; text-shadow: -3px 0 #ff2a2a, 3px 0 #22e0ff; }
      #book .close { all: unset; cursor: pointer; padding: 6px 16px; border: 1px solid rgba(232,236,234,.3); font-size: 13px; }
      #book .close:hover { background: #5fa49e; color: #071012; }
      #book .wrap { flex: 1; display: flex; gap: 22px; padding: 10px 26px 24px; min-height: 0; }
      #book ul { list-style: none; margin: 0; padding: 0; width: 220px; flex: none; overflow: auto; }
      #book li { padding: 8px 12px; cursor: pointer; border-left: 3px solid transparent; }
      #book li:hover { background: rgba(95,164,158,.15); } #book li.sel { border-left-color: #5fa49e; background: rgba(95,164,158,.2); }
      #book li.locked { color: rgba(232,236,234,.35); } #book li small { display: block; font-size: 11px; opacity: .6; }
      #book .detail { flex: 1; display: flex; gap: 22px; overflow: auto; align-items: flex-start; }
      #book .detail img, #book .detail .sil { width: 240px; height: 300px; flex: none; border: 2px solid rgba(232,236,234,.18); background: #0b1013; image-rendering: pixelated; }
      #book .detail .sil { display: flex; align-items: center; justify-content: center; font: 900 90px "Arial Black", sans-serif; color: rgba(232,236,234,.12); }
      #book .detail h3 { margin: 0; font: 900 26px "Arial Black", Impact, sans-serif; letter-spacing: .06em; } #book .detail .role { color: #5fa49e; letter-spacing: 3px; font-size: 12px; text-transform: uppercase; margin-bottom: 10px; }
      #book .detail h4 { margin: 14px 0 4px; font-size: 12px; letter-spacing: 3px; color: #ff8a6a; } #book .detail ul.av { width: auto; padding-left: 18px; list-style: square; } #book .detail ul.av li { padding: 2px 0; cursor: default; border: 0; background: none; }
      @media (max-width: 760px) { #book .wrap { flex-direction: column; } #book ul { width: auto; display: flex; flex-wrap: wrap; } #book .detail { flex-direction: column; } }
      #deadprofile { display: flex; gap: 16px; align-items: flex-start; max-width: min(760px, 88vw); margin: 0 0 14px; padding: 12px 14px; background: rgba(0,0,0,.55); border-left: 3px solid #ff5a3a; text-align: left; font: 13px/1.5 ui-monospace, Menlo, monospace; color: rgba(232,236,234,.9); }
      #deadprofile[hidden] { display: none; }
      #deadprofile img { width: 112px; height: 140px; flex: none; border: 1px solid rgba(232,236,234,.25); image-rendering: pixelated; }
      #deadprofile b.n { display: block; font: 900 18px "Arial Black", Impact, sans-serif; letter-spacing: .06em; color: #fff; }
      #deadprofile .h { margin-top: 6px; color: #ff8a6a; font-size: 11px; letter-spacing: 2px; }
      #deadprofile ul { margin: 2px 0 0; padding-left: 16px; }`;
    document.head.appendChild(css);
    const el = this.el = document.createElement('div'); el.id = 'book'; el.hidden = true;
    el.innerHTML = '<header><h2>CHARACTER BOOK</h2><button class="close">Close  (Esc)</button></header><div class="wrap"><ul class="list"></ul><div class="detail"></div></div>';
    document.body.appendChild(el);
    el.querySelector('.close').addEventListener('click', () => this.close());
    addEventListener('keydown', (e) => { if (!el.hidden && (e.code === 'Escape' || e.code === 'Backspace')) { e.stopImmediatePropagation(); this.close(); } }, true);
    this.sel = 'manju';
  }
  open(id) {
    if (id) this.sel = id;
    else if (!this.seen.has(this.sel)) this.sel = ENTRIES.find((e) => this.seen.has(e.id))?.id || ENTRIES[0].id;
    this.el.hidden = false; this.render();
    this.onOpen?.();
  }
  close() { this.el.hidden = true; this.onClose?.(); }
  get isOpen() { return !this.el.hidden; }
  render() {
    const list = this.el.querySelector('.list'), det = this.el.querySelector('.detail');
    list.innerHTML = ENTRIES.map((e) => { const s = this.seen.has(e.id); return `<li data-id="${e.id}" class="${s ? '' : 'locked'}${e.id === this.sel ? ' sel' : ''}">${s ? e.name : '???'}<small>${s ? e.role : 'not met yet'}</small></li>`; }).join('');
    list.querySelectorAll('li').forEach((li) => li.addEventListener('click', () => { this.sel = li.dataset.id; this.render(); }));
    const e = this.entry(this.sel);
    if (!this.seen.has(e.id)) { det.innerHTML = '<div class="sil">?</div><div><h3>???</h3><div class="role">Not met yet</div><p>Keep exploring. This page fills in when you first see them.</p></div>'; return; }
    const pic = this.portrait(e.id);
    det.innerHTML = `${pic ? `<img alt="${e.name}" src="${pic}">` : '<div class="sil">?</div>'}<div><h3>${e.name}</h3><div class="role">${e.role}</div><p>${e.what}</p><h4>HOW TO GET PAST</h4><ul class="av">${e.avoid.map((a) => `<li>${a}</li>`).join('')}</ul></div>`;
  }
  // the death screen: who got you, what they do, how to avoid them
  deathCard(id) {
    const e = this.entry(id); if (!e) return '';
    const pic = this.portrait(id);
    return `${pic ? `<img alt="${e.name}" src="${pic}">` : ''}<div><b class="n">${e.name}</b><span>${e.what}</span><div class="h">HOW TO AVOID</div><ul>${e.avoid.slice(0, 3).map((a) => `<li>${a}</li>`).join('')}</ul></div>`;
  }
}
