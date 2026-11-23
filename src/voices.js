// Recorded voice lines (public/audio/*.m4a), played as positional sounds in the building.
// Each line comes from where its character is: distance makes it quieter and duller, another floor
// muffles it further, and the panner follows a moving source (Mutty running at you).
//
// What each clip says (transcribed with Whisper, checked against the full recordings):
//   zoya_1-3   "These boys!" (three takes)                       -> when she spots you
//   zoya_4     "Stop causing a ruckus in the boarding!"          -> random while patrolling
//   zoya_5     "What are you doing, boys? I will not handle this attitude!"  -> patrolling, and after a spot
//   mutty_1    "Hey, sab mein ... laaya hoon"                    -> random
//   mutty_2    a short grunt                                     -> when he bites
//   mutty_3    "Kya karega?" (what will you do?)                 -> when he starts running at you
//   mutty_4    "Hai, lag to sabhi karega"                        -> random
//   mutty_5    "Jalega nahi hai" (it won't burn)                 -> random
//   mutty_6    "So jao, so jao" (go to sleep, go to sleep)       -> when he starts running at you
//   mutty_7    "Sir, mere ... maarega" (sir, he'll hit me)       -> random
//   ravi_1-2   "MOVE!" (two takes)                               -> random, from somewhere far off (no body in the game)
//   komynini_1-2  "Close the door!" / "Arre, close the door!"     -> room 15, when you come in and leave the door open
import * as THREE from 'three';

export const VOICE_FILES = {
  zoya: ['zoya_1', 'zoya_2', 'zoya_3', 'zoya_4', 'zoya_5'],
  mutty: ['mutty_1', 'mutty_2', 'mutty_3', 'mutty_4', 'mutty_5', 'mutty_6', 'mutty_7'],
  ravi: ['ravi_1', 'ravi_2'],
  komynini: ['komynini_1', 'komynini_2'],   // generated with macOS say (voice Rishi): "Close the door!", "Arre, close the door!"
};

export class Voices {
  constructor(audio, base = './public/audio/') {
    this.audio = audio; this.base = base;
    this.raw = {}; this.buf = {}; this.live = [];
    this.recent = {};
    // fetch now (no AudioContext needed yet); decode once the game's audio has started
    for (const list of Object.values(VOICE_FILES)) for (const n of list) {
      fetch(base + n + '.m4a').then((r) => (r.ok ? r.arrayBuffer() : null)).then((ab) => { if (ab) this.raw[n] = ab; }).catch(() => {});
    }
  }

  decode() {
    const ctx = this.audio.ctx; if (!ctx) return;
    for (const [n, ab] of Object.entries(this.raw)) {
      delete this.raw[n];
      ctx.decodeAudioData(ab).then((b) => { this.buf[n] = b; }).catch((e) => console.warn('voice', n, e));
    }
  }

  // pick a line for a character: index, or random among `pool` avoiding the last one played
  pick(who, pool) {
    const names = (pool || VOICE_FILES[who]).filter((n) => this.buf[n]);
    if (!names.length) return null;
    let n = names[Math.floor(Math.random() * names.length)];
    if (names.length > 1) while (n === this.recent[who]) n = names[Math.floor(Math.random() * names.length)];
    this.recent[who] = n; return n;
  }

  // play a line at a source: { getPos: () => Vector3 } (moving) or a fixed Vector3; ctx: listener info
  play(name, source, opts = {}) {
    const ctx = this.audio.ctx; if (!ctx || !name || !this.buf[name]) return null;
    const src = ctx.createBufferSource(); src.buffer = this.buf[name];
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6000; lp.Q.value = 0.5;
    const pan = ctx.createPanner();
    Object.assign(pan, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: opts.ref ?? 3, rolloffFactor: opts.rolloff ?? 1.1, maxDistance: 80 });
    const g = ctx.createGain(); g.gain.value = opts.gain ?? 1;
    src.connect(lp); lp.connect(pan); pan.connect(g); g.connect(this.audio.master);
    const v = { src, lp, pan, g, source, done: false };
    src.onended = () => { v.done = true; try { g.disconnect(); } catch (e) { /* already gone */ } };
    this.place(v, opts.listener);
    src.start();
    this.live.push(v);
    return v;
  }

  srcPos(v) { return typeof v.source?.getPos === 'function' ? v.source.getPos() : v.source; }

  // keep panners on their sources and the muffling right; listener = { pos (camera), dir, feetY }
  place(v, L) {
    const p = this.srcPos(v); if (!p || !L) return;
    const t = this.audio.ctx.currentTime;
    v.pan.positionX.setTargetAtTime(p.x, t, 0.05); v.pan.positionY.setTargetAtTime(p.y + 1.4, t, 0.05); v.pan.positionZ.setTargetAtTime(p.z, t, 0.05);
    const d = Math.hypot(p.x - L.pos.x, p.z - L.pos.z), floors = Math.round(Math.abs(p.y - L.feetY) / 3.2);
    const f = Math.max(450, 7000 - d * 160) / (1 + floors * 2.5);          // further and other floors = duller
    v.lp.frequency.setTargetAtTime(f, t, 0.1);
  }

  update(L) {
    const ctx = this.audio.ctx; if (!ctx) return;
    if (Object.keys(this.raw).length) this.decode();
    const lis = ctx.listener, t = ctx.currentTime;
    if (lis.positionX) {
      lis.positionX.setTargetAtTime(L.pos.x, t, 0.03); lis.positionY.setTargetAtTime(L.pos.y, t, 0.03); lis.positionZ.setTargetAtTime(L.pos.z, t, 0.03);
      lis.forwardX.setTargetAtTime(L.dir.x, t, 0.03); lis.forwardY.setTargetAtTime(L.dir.y, t, 0.03); lis.forwardZ.setTargetAtTime(L.dir.z, t, 0.03);
      lis.upX.value = 0; lis.upY.value = 1; lis.upZ.value = 0;
    } else { lis.setPosition(L.pos.x, L.pos.y, L.pos.z); lis.setOrientation(L.dir.x, L.dir.y, L.dir.z, 0, 1, 0); }
    this.live = this.live.filter((v) => !v.done);
    for (const v of this.live) if (v.source?.getPos) this.place(v, L);
  }

  isPlaying(name) { return this.live.some((v) => !v.done && v.src.buffer === this.buf[name]); }
  playing(who) { return this.live.some((v) => !v.done && v.src.buffer && VOICE_FILES[who].some((n) => this.buf[n] === v.src.buffer)); }
  stopAll() { for (const v of this.live) { try { v.src.stop(); } catch (e) { /* not started */ } } this.live = []; }
}

// Ravi has no body: his lines come from a random point 18-40 m away, often on another floor
export function farPoint(feet) {
  const a = Math.random() * Math.PI * 2, d = 18 + Math.random() * 22;
  const floors = [0.76, 4.03, 7.17];
  return new THREE.Vector3(feet.x + Math.cos(a) * d, floors[Math.floor(Math.random() * 3)], feet.z + Math.sin(a) * d);
}
