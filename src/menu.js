// Title / pause menu: glitched wordmark (canvas), menu list with keyboard + mouse, side panels.
// The live 3D scene behind it is driven by main.js (menuCamera + random torch).

const TITLE = ['MANJU', 'MANIA'];

export class Menu {
  constructor(handlers) {
    this.h = handlers;                 // { newGame, resume, quit, setRetro, setSound, retro(), sound() }
    this.root = document.getElementById('menu');
    this.list = document.getElementById('items');
    this.panel = document.getElementById('panel');
    this.tear = document.getElementById('tear');
    this.canvas = document.getElementById('title');
    this.ctx = this.canvas.getContext('2d');
    this.mode = 'title';               // 'title' | 'pause'
    this.sel = 0;
    this.ready = false;
    this.glitch = 0; this.nextGlitch = 1.5;
    this.buildWord();
    addEventListener('resize', () => this.buildWord());
    addEventListener('keydown', (e) => this.key(e));
    this.render();
  }

  // ---------- menu list ----------
  items() {
    if (this.mode === 'pause') return [
      { t: 'Resume', go: () => this.h.resume() },
      { t: 'Controls', go: () => this.show('controls') },
      { t: 'Settings', go: () => this.show('settings') },
      { t: 'Quit to menu', go: () => this.h.quit() },
    ];
    return [
      { t: 'New game', go: () => this.h.newGame(), off: !this.ready },
      { t: 'Continue', off: true },
      { t: 'Controls', go: () => this.show('controls') },
      { t: 'Settings', go: () => this.show('settings') },
    ];
  }

  render() {
    const its = this.items();
    if (this.sel >= its.length || its[this.sel].off) this.sel = Math.max(0, its.findIndex((i) => !i.off));
    this.list.innerHTML = '';
    its.forEach((it, i) => {
      const b = document.createElement('button');
      b.textContent = it.t;
      b.className = (i === this.sel ? 'sel ' : '') + (it.off ? 'off' : '');
      b.disabled = !!it.off;
      b.addEventListener('mouseenter', () => { if (!it.off && this.sel !== i) { this.sel = i; this.render(); this.h.tick?.(); } });
      b.addEventListener('click', () => { if (!it.off) { this.h.tick?.(); it.go(); } });
      this.list.appendChild(b);
    });
    document.getElementById('loading').hidden = this.ready || this.mode === 'pause';
  }

  key(e) {
    if (this.root.hidden) return;
    if (e.repeat) return;
    const its = this.items();
    const move = (d) => { let i = this.sel; do { i = (i + d + its.length) % its.length; } while (its[i].off); this.sel = i; this.render(); this.h.tick?.(); };
    if (e.code === 'ArrowDown' || e.code === 'KeyS') move(1);
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') move(-1);
    // a focused <button> already activates itself on Space/Enter; don't double-fire
    else if ((e.code === 'Enter' || e.code === 'Space') && document.activeElement?.tagName === 'BUTTON') return;
    else if (e.code === 'Enter' || e.code === 'Space') { const it = its[this.sel]; if (it && !it.off) { this.h.tick?.(); it.go(); } }
    else if (e.code === 'Escape' || e.code === 'Backspace') this.show(null);
  }

  show(which) {
    this.panel.innerHTML = '';
    this.panel.hidden = !which;
    if (which === 'controls') {
      this.panel.innerHTML = `<h3>Controls</h3><table>${[
        ['W A S D', 'Walk'], ['Mouse', 'Look'], ['Shift', 'Run'], ['E', 'Open / close door'], ['F', 'Flashlight'],
        ['Ctrl / C', 'Crouch'], ['1 – 5', 'Pick an item'], ['Click', 'Use item'], ['Right-click', 'Eat food'], ['Hold E', 'Light switch'], ['M', 'Big map (laptop)'], ['R', 'Back to start'], ['V', 'Retro filter'], ['Esc', 'Pause'],
      ].map(([k, v]) => `<tr><td>${k.split(' ').map((x) => `<kbd>${x}</kbd>`).join('')}</td><td>${v}</td></tr>`).join('')}</table>`;
    } else if (which === 'settings') {
      const row = (label, on, fn) => {
        const b = document.createElement('button'); b.className = 'opt';
        const draw = () => { b.innerHTML = `<span>${label}</span><span class="v">${on() ? 'ON' : 'OFF'}</span>`; };
        b.addEventListener('click', () => { fn(!on()); draw(); this.h.tick?.(); }); draw(); return b;
      };
      const h = document.createElement('h3'); h.textContent = 'Settings'; this.panel.appendChild(h);
      this.panel.appendChild(row('Retro filter', this.h.retro, this.h.setRetro));
      this.panel.appendChild(row('Sound', this.h.sound, this.h.setSound));
      if (this.h.saturation) {                       // saturation slider, 0-200 %
        const wrap = document.createElement('label'); wrap.className = 'opt slider';
        const name = document.createElement('span'); name.textContent = 'Saturation';
        const val = document.createElement('span'); val.className = 'v';
        const inp = document.createElement('input'); inp.type = 'range'; inp.min = '0'; inp.max = '200'; inp.step = '5';
        inp.value = String(Math.round(this.h.saturation() * 100));
        const draw = () => { val.textContent = inp.value + '%'; };
        inp.addEventListener('input', () => { this.h.setSaturation(+inp.value / 100); draw(); });
        inp.addEventListener('keydown', (e) => e.stopPropagation());     // arrows move the slider, not the menu
        draw(); wrap.append(name, inp, val); this.panel.appendChild(wrap);
      }
    }
  }

  open(mode) { this.mode = mode; this.sel = 0; this.show(null); this.root.hidden = false; this.root.classList.toggle('pause', mode === 'pause'); this.render(); }
  close() { this.root.hidden = true; this.show(null); }
  setReady() { this.ready = true; const its = this.items(); this.sel = Math.max(0, its.findIndex((i) => !i.off)); this.render(); }

  // full-screen tear, used on camera cuts
  burst(ms = 220) {
    this.glitch = Math.max(this.glitch, ms / 1000);
    this.tear.style.display = 'block';
    let n = 0;
    const tick = () => {
      if (++n > ms / 40) { this.tear.style.display = 'none'; return; }
      let h = '';
      for (let i = 0; i < 9; i++) {
        const y = Math.random() * 100, hh = 0.4 + Math.random() * 5, x = (Math.random() - 0.5) * 12;
        h += `<i style="top:${y}%;height:${hh}%;transform:translateX(${x}vw);opacity:${0.35 + Math.random() * 0.5}"></i>`;
      }
      this.tear.innerHTML = h;
      setTimeout(tick, 40);
    };
    tick();
  }

  // ---------- glitched wordmark ----------
  buildWord() {
    const W = Math.max(40, Math.min(820, innerWidth * 0.62, Math.max(200, innerHeight * 0.9))), lineH = W * 0.2;   // never 0 (minimised window)
    const dpr = Math.min(devicePixelRatio, 2);
    this.cw = W; this.ch = lineH * 2.25;
    this.canvas.width = W * dpr; this.canvas.height = this.ch * dpr;
    this.canvas.style.width = W + 'px'; this.canvas.style.height = this.ch + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // the clean word, white on transparent
    const off = this.word = document.createElement('canvas');
    off.width = W * dpr; off.height = this.ch * dpr;
    const g = off.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#f2f4f2';
    g.textBaseline = 'alphabetic';
    const font = (px) => `900 ${px}px "Arial Black", "Helvetica Neue", Impact, sans-serif`;
    TITLE.forEach((word, li) => {
      // fit with wide tracking
      let px = lineH * 0.95; g.font = font(px);
      const track = px * 0.28;
      const width = () => [...word].reduce((s, ch) => s + g.measureText(ch).width, 0) + track * (word.length - 1);
      while (width() > W * 0.97) { px *= 0.96; g.font = font(px); }
      let x = px * 0.05; const y = lineH * (li + 1) * 1.06;
      g.strokeStyle = '#f2f4f2'; g.lineWidth = px * 0.075; g.lineJoin = 'miter';
      for (const ch of word) { g.fillText(ch, x, y); g.strokeText(ch, x, y); x += g.measureText(ch).width + px * 0.28; }
    });
    // engraved look: knock thin horizontal scratches out of the letters
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 14; i++) { const y = Math.random() * this.ch; g.fillRect(Math.random() * W, y, 20 + Math.random() * W * 0.4, 1 + Math.random() * 1.5); }
    // a few chunky dropouts, like a damaged tape
    for (let i = 0; i < 6; i++) g.fillRect(Math.random() * W, Math.random() * this.ch, 8 + Math.random() * 30, 4 + Math.random() * 10);
    g.globalCompositeOperation = 'source-over';
    // static decoration: thin crosshair lines through the letters
    this.lines = [];
    for (let i = 0; i < 5; i++) this.lines.push({ y: lineH * (0.25 + Math.random() * 1.9), x0: Math.random() * W * 0.3, x1: W * (0.5 + Math.random() * 0.5) });
    this.ticks = [];
    for (let i = 0; i < 4; i++) this.ticks.push({ x: W * (0.1 + Math.random() * 0.8), y0: Math.random() * this.ch * 0.4, y1: this.ch * (0.5 + Math.random() * 0.5) });
  }

  update(dt) {
    if (this.root.hidden || !this.word?.width || !this.word?.height) return;
    this.nextGlitch -= dt; this.glitch -= dt;
    if (this.nextGlitch <= 0) { this.nextGlitch = 1.2 + Math.random() * 4; this.glitch = 0.08 + Math.random() * 0.35; }
    const g = this.ctx, W = this.cw, H = this.ch, src = this.word, sx = src.width / W;
    g.clearRect(0, 0, W, H);
    const hot = this.glitch > 0;
    // thin lines + ticks (always)
    g.fillStyle = 'rgba(235,240,238,0.55)';
    for (const l of this.lines) g.fillRect(l.x0, l.y, l.x1 - l.x0, 1);
    for (const t of this.ticks) g.fillRect(t.x, t.y0, 1, t.y1 - t.y0);
    // RGB ghosts
    const split = hot ? 3 + Math.random() * 7 : 1.2;
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = hot ? 0.75 : 0.35;
    g.filter = 'none';
    this.tinted(g, src, -split, 0, '#ff2a2a');
    this.tinted(g, src, split, 0, '#22e0ff');
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    // main word in horizontal slices; during a glitch some slices jump sideways
    const slices = hot ? 26 : 1;
    for (let i = 0; i < slices; i++) {
      const y0 = (H / slices) * i, hh = H / slices;
      const dx = hot && Math.random() < 0.35 ? (Math.random() - 0.5) * W * 0.12 : 0;
      g.drawImage(src, 0, y0 * sx, src.width, hh * sx, dx, y0, W, hh);
    }
    // dropouts / blocks while glitching
    if (hot) {
      for (let i = 0; i < 7; i++) {
        const x = Math.random() * W, y = Math.random() * H, w = 10 + Math.random() * 90, h = 3 + Math.random() * 16;
        if (Math.random() < 0.5) g.clearRect(x, y, w, h);
        else { g.fillStyle = Math.random() < 0.3 ? 'rgba(200,40,40,0.8)' : 'rgba(240,244,242,0.9)'; g.fillRect(x, y, w, h * 0.4); }
      }
    } else if (Math.random() < 0.04) {       // the odd single-frame flicker
      g.clearRect(0, Math.random() * H, W, 2 + Math.random() * 6);
    }
  }

  tinted(g, src, dx, dy, col) {
    this._t ||= document.createElement('canvas');
    const t = this._t; if (t.width !== src.width || t.height !== src.height) { t.width = src.width; t.height = src.height; }
    const c = t.getContext('2d');
    c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, t.width, t.height);
    c.drawImage(src, 0, 0); c.globalCompositeOperation = 'source-in'; c.fillStyle = col; c.fillRect(0, 0, t.width, t.height);
    g.drawImage(t, dx, dy, this.cw, this.ch);
  }
}
