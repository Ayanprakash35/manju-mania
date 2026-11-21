// Procedural horror ambience (Web Audio, no sound files): low drone, fluorescent hum, footsteps,
// door creaks and the occasional distant bang somewhere in the building. Starts on the first click.
export class HorrorAudio {
  constructor() { this.muted = false; this.ctx = null; this.stepT = 0; this.nextBang = 25 + Math.random() * 30; }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.55; this.master.connect(ctx.destination);
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

  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.55; }

  tick() {          // menu blip: a short filtered click
    const ctx = this.ctx; if (!ctx) return;
    const o = ctx.createOscillator(); o.type = 'square'; const t = ctx.currentTime;
    o.frequency.setValueAtTime(1400, t); o.frequency.exponentialRampToValueAtTime(500, t + 0.05);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.08);
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
  update(dt, { moving, running, nearLight }) {
    if (!this.ctx) return;
    if (moving) {
      this.stepT -= dt;
      if (this.stepT <= 0) { this.stepT = running ? 0.32 : 0.52; this.burst(140 + Math.random() * 40, 1.2, 0.12, running ? 0.5 : 0.35, 'lowpass'); }
    } else this.stepT = 0.05;
    this.humGain.gain.value += ((nearLight * 0.035) - this.humGain.gain.value) * Math.min(1, dt * 3);
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
