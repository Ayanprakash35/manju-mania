// The character book: who's in the hostel, what they do, how to get past them. An entry unlocks the first time you
// properly see that character (in front of you, close enough, nothing in the way) or the first time one gets you;
// unlocks are remembered between sessions. When a character kills you, the death screen shows its entry.
// Portraits are rendered from the game's own models (a clone posed in a little studio), not from photos.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

export const ENTRIES = [
  {
    id: 'manju', name: 'Manju', short: 'manju', role: 'The warden',
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
    id: 'mutty', name: 'Mutty', short: 'mutty', role: 'The crawler',
    what: 'Crawls the ground floor. He hears running from far off, closes in fast and pounces from a metre or two — every bite takes a heart. After biting he scuttles off to tell Manju exactly where you are.',
    avoid: [
      'Walk or crouch on the ground floor; never run near him.',
      'Step into any student room: he loses you at the door.',
      'Throw him food — he stops to eat it for three minutes.',
      'Don\'t stay shut in a rest-room cubicle for more than 10 seconds. He comes in under the door.',
    ],
  },
  {
    id: 'zoya', name: 'Dr Zoya', short: 'zoya', role: 'The spotter',
    what: 'Walks the first floor. She won\'t touch you — she spots you, shouts "These boys!", points, and calls Manju, who turns up close by within seconds.',
    avoid: [
      'Her eyes are narrow but sharp: about 14 m straight ahead. Stay out of the line of the corridor she\'s facing.',
      'Get close behind her and put the face mask on her: she can\'t call Manju for 60 seconds.',
      'The music player pulls her off her patrol.',
    ],
  },
  {
    id: 'komynini', name: 'CowShit Komynini', short: 'komynini', role: 'Room 15',
    what: 'Lives on the bed on the right in room 15, scrolling reels under his duvet. Completely harmless. Very loud.',
    avoid: ['Close the door behind you.'],
  },
  {
    id: 'figure', name: 'The figures', short: 'them?', role: 'Second floor',
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
    if (!quiet) this.toast?.('new page in my notebook', `${this.entry(id).name.toLowerCase()}  ·  pause menu → character book`);
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
    if (ctx?.cutscene && !this.seen.has('manju')) { this.discover('manju', true); this.pending = 'manju'; }   // no pop-ups during the intro
    if (this.pending && !ctx?.cutscene && !ctx?.busy) { const id = this.pending; this.pending = null; setTimeout(() => this.toast?.('new page in my notebook', `${this.entry(id).name.toLowerCase()}  ·  pause menu → character book`), 7000); }
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
    scene.add(new THREE.AmbientLight(0xffffff, 1.7));
    const key = new THREE.DirectionalLight(0xfff2e0, 3.2); key.position.set(1.2, 2, 2.5); scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 1.2); fill.position.set(-1.5, 0.5, 2); scene.add(fill);
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

  // ------------------------------------------------------------------ UI (styles: src/ui.css)
  // the book is the student's own notebook: "people to avoid", a taped polaroid per person, notes in pen
  ui() {
    const el = this.el = document.createElement('div'); el.id = 'book'; el.hidden = true;
    el.innerHTML = `<div class="nb"><div class="pg l"><h2><u>people to avoid</u></h2><ul class="idx"></ul><div class="doodle"></div></div><div class="spine"></div><div class="rings"></div><div class="pg r"></div></div><button class="close">[esc] close</button>`;
    document.body.appendChild(el);
    el.querySelector('.close').addEventListener('click', () => this.close());
    addEventListener('keydown', (e) => {
      if (el.hidden) return;
      if (e.code === 'Escape' || e.code === 'Backspace') { e.stopImmediatePropagation(); this.close(); }
      if (e.code === 'ArrowDown' || e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'KeyS') { e.stopImmediatePropagation(); const i = ENTRIES.findIndex((x) => x.id === this.sel), d = e.code === 'ArrowDown' || e.code === 'KeyS' ? 1 : -1; this.sel = ENTRIES[(i + d + ENTRIES.length) % ENTRIES.length].id; this.render(); }
    }, true);
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
  polaroid(e, known, crossed = false) {
    const pic = known ? this.portrait(e.id) : null;
    return `<div class="polaroid">${pic ? `<img alt="${e.name}" src="${pic}">` : '<div class="blank">?</div>'}${crossed ? '<div class="x"></div>' : ''}<div class="cap">${known ? e.short || e.name.split(' ').pop().toLowerCase() : '???'}</div></div>`;
  }
  render() {
    const list = this.el.querySelector('.idx'), pg = this.el.querySelector('.pg.r');
    const n = ENTRIES.filter((e) => this.seen.has(e.id)).length;
    list.innerHTML = ENTRIES.map((e) => { const s = this.seen.has(e.id); return `<li data-id="${e.id}" class="${s ? '' : 'locked'}${e.id === this.sel ? ' sel' : ''}"><b>${s ? e.name.toLowerCase() : '???'}</b><i>${s ? e.role.toLowerCase() : 'haven\'t seen them yet'}</i></li>`; }).join('');
    list.querySelectorAll('li').forEach((li) => li.addEventListener('click', () => { this.sel = li.dataset.id; this.render(); }));
    this.el.querySelector('.doodle').textContent = n === ENTRIES.length ? 'that\'s everyone. i hope.' : `${n} of ${ENTRIES.length}.  there are more out there.`;
    const e = this.entry(this.sel);
    if (!this.seen.has(e.id)) { pg.innerHTML = `<div class="entry locked">${this.polaroid(e, false)}<h3>???</h3><div class="role">haven't seen this one yet</div><p class="what">keep my eyes open. this page fills in when i do.</p></div>`; return; }
    pg.innerHTML = `<div class="entry">${this.polaroid(e, true)}<h3>${e.name}</h3><div class="role">${e.role.toLowerCase()}</div><p class="what">${e.what}</p><h5><span>how to get past</span></h5><ul>${e.avoid.map((a) => `<li>${a}</li>`).join('')}</ul></div>`;
  }
  // the death screen: a torn page — who got you, and what to do next time
  deathCard(id) {
    const e = this.entry(id); if (!e) return '';
    const got = { manju: 'Manju caught me.', mutty: 'Mutty got me.', zoya: 'Zoya got me.' }[id] || `${e.name} got me.`;
    return `${this.polaroid(e, true)}<div class="got">${got}</div><div>${e.what}</div><div style="margin-top:6px;color:var(--red-pen)">next time:</div><ul>${e.avoid.slice(0, 3).map((a) => `<li>${a}</li>`).join('')}</ul>`;
  }
}
