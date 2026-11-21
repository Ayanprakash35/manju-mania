// Procedural horror ambience (Web Audio, no sound files): low drone, fluorescent hum, footsteps,
// door creaks and the occasional distant bang somewhere in the building. Starts on the first click.
export class HorrorAudio {
  constructor() { this.muted = false; this.volume = 1; this.ctx = null; this.stepT = 0; this.nextBang = 25 + Math.random() * 30; }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.55 * this.volume; this.master.connect(ctx.destination);
    // noise buffer reused for everything
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    // drone: two detuned low saws through a slowly breathing low-pass
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180; lp.Q.value = 6;
    const dg = ctx.createGain(); dg.gain.value = 0.10; lp.connect(dg); dg.connect(this.master);
    for (const f of [43.6, 44.1, 65.3]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(); }
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; const lg = ctx.createGain(); lg.gain.value = 90; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
    // air: very quiet filtered noise
    const air = ctx.createBufferSource(); air.buffer = buf; air.loop = true;
    const af = ctx.createBiquadFilter(); af.type = 'bandpass'; af.frequency.value = 500; af.Q.value = 0.6;
    const ag = ctx.createGain(); ag.gain.value = 0.025; air.connect(af); af.connect(ag); ag.connect(this.master); air.start();
    // fluorescent hum (mains buzz)
    const hum = ctx.createOscillator(); hum.type = 'square'; hum.frequency.value = 100;
    const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 900;
    this.humGain = ctx.createGain(); this.humGain.gain.value = 0.0; hum.connect(hf); hf.connect(this.humGain); this.humGain.connect(this.master); hum.start();
  }

  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.55 * this.volume; }
  setHum(v = 0) { if (this.humGain) this.humGain.gain.value = v; }

  tick() {          // menu blip: a short filtered click
    const ctx = this.ctx; if (!ctx) return;
    const o = ctx.createOscillator(); o.type = 'square'; const t = ctx.currentTime;
    o.frequency.setValueAtTime(1400, t); o.frequency.exponentialRampToValueAtTime(500, t + 0.05);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.08);
  }

  // ---- positional one-shots for the scare director (pan -1..1; 'far' muffles and quietens) ----
  out(pan = 0, far = 0) {
    const ctx = this.ctx, p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 4000 - far * 3300;
    const g = ctx.createGain(); g.gain.value = 1 - far * 0.6;
    f.connect(g); g.connect(p); p.connect(this.master); return f;
  }
  noiseHit(dst, freq, q, dur, vol, type = 'bandpass', delay = 0) {
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.playbackRate.value = 0.7 + Math.random() * 0.3;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dst); src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }
  stepAt(pan, far = 0.3, vol = 0.4) { if (!this.ctx) return; this.noiseHit(this.out(pan, far), 130 + Math.random() * 40, 1.1, 0.13, vol, 'lowpass'); }
  knock(pan, n = 3) { if (!this.ctx) return; const o = this.out(pan, 0.15); for (let i = 0; i < n; i++) this.noiseHit(o, 210, 2, 0.12, 0.55, 'bandpass', i * (0.32 + Math.random() * 0.12)); }
  slam(pan) { if (!this.ctx) return; const o = this.out(pan, 0.1); this.noiseHit(o, 90, 0.7, 0.9, 0.9, 'lowpass'); this.noiseHit(o, 400, 1, 0.25, 0.3); }
  pop() { if (!this.ctx) return; const o = this.out((Math.random() - 0.5) * 0.4, 0); this.noiseHit(o, 2500, 0.8, 0.08, 0.35, 'highpass'); this.noiseHit(o, 120, 1, 0.3, 0.2, 'lowpass', 0.02); }
  thump() { if (!this.ctx) return; this.noiseHit(this.out(0, 0.5), 60, 0.8, 1.2, 0.8, 'lowpass'); }
  whisper(pan) {                // breathy, formant-ish noise that swells and fades
    if (!this.ctx) return; const ctx = this.ctx, t = ctx.currentTime, o = this.out(pan, 0);
    for (let w = 0; w < 4; w++) {
      const src = ctx.createBufferSource(); src.buffer = this.noise;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 9; const t0 = t + w * (0.35 + Math.random() * 0.2);
      f.frequency.setValueAtTime(900 + Math.random() * 1600, t0); f.frequency.linearRampToValueAtTime(700 + Math.random() * 2200, t0 + 0.4);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.16, t0 + 0.12); g.gain.linearRampToValueAtTime(0, t0 + 0.45);
      src.connect(f); f.connect(g); g.connect(o); src.start(t0, Math.random()); src.stop(t0 + 0.5);
    }
  }
  heartbeat(beats = 6, rate = 1.1) {
    if (!this.ctx) return; const o = this.out(0, 0.6);
    for (let i = 0; i < beats; i++) { const d = i / rate; this.noiseHit(o, 55, 1, 0.18, 0.7, 'lowpass', d); this.noiseHit(o, 50, 1, 0.16, 0.45, 'lowpass', d + 0.24); }
  }
  breath(pan = 0) {             // slow exhale close by
    if (!this.ctx) return; const ctx = this.ctx, t = ctx.currentTime, o = this.out(pan, 0);
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 600; f.Q.value = 1.2;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.6); g.gain.linearRampToValueAtTime(0, t + 1.8);
    src.connect(f); f.connect(g); g.connect(o); src.start(t, Math.random()); src.stop(t + 1.9);
  }

  burst(freq, q, dur, vol, type = 'bandpass', pitchTo = null) {
    const ctx = this.ctx; if (!ctx) return;
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.playbackRate.value = 0.6 + Math.random() * 0.3;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    if (pitchTo) f.frequency.exponentialRampToValueAtTime(pitchTo, ctx.currentTime + dur);
    const g = ctx.createGain(); const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }

  door() {          // creak: a resonant, slowly sweeping sawtooth
    const ctx = this.ctx; if (!ctx) return;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; const t = ctx.currentTime;
    o.frequency.setValueAtTime(70 + Math.random() * 30, t); o.frequency.linearRampToValueAtTime(130 + Math.random() * 60, t + 0.7);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 12;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(f); f.connect(g); g.connect(this.master); o.start(t); o.stop(t + 1);
  }

  // called every frame: moving = walking on the ground, indoors = under a ceiling, nearLight = 0..1
  update(dt, { moving, running, nearLight, frozen = false }) {
    if (!this.ctx) return;
    if (moving) {
      this.stepT -= dt;
      if (this.stepT <= 0) { this.stepT = running ? 0.32 : 0.52; this.burst(140 + Math.random() * 40, 1.2, 0.12, running ? 0.5 : 0.35, 'lowpass'); this.onStep?.(running); }
    } else this.stepT = 0.05;
    this.humGain.gain.value += ((nearLight * 0.035) - this.humGain.gain.value) * Math.min(1, dt * 3);
    if (!frozen) {
      this.nextBang -= dt;
      if (this.nextBang <= 0) {            // something, somewhere
        this.nextBang = 30 + Math.random() * 50;
        const r = Math.random();
        if (r < 0.5) this.burst(90, 0.8, 1.4, 0.35, 'lowpass');                      // distant slam
        else if (r < 0.8) { for (let i = 0; i < 3; i++) setTimeout(() => this.burst(160, 1, 0.15, 0.18, 'lowpass'), i * 420); }  // three slow knocks
        else this.door();                                                            // a door, far away
      }
    }
  }
}
