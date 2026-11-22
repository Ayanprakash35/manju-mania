// Cheat / dev console. Backquote (`) opens it; type `help`. Up/Down = history, Tab = complete, Esc = close.
// Commands act through the `api` object main.js passes in.

const LEVELS = [0.76, 4.03, 7.17];
// teleport spots: [x, z, feet height or 'floor' (uses the floor argument), facing x, facing z]
const PLACES = {
  start:     null,
  courtyard: [-3.5, 4, 0.3, -3.5, -4],
  lobby:     [-3.5, -5.6, 0.76, -3.5, 10],
  north:     [-3.5, -7.9, 'floor', 20, -7.9],        // corridors (add a floor: tp north 2)
  south:     [-3.5, 23.65, 'floor', 20, 23.65],
  west:      [-30.35, 4, 'floor', -30.35, 16],
  east:      [24.45, 4, 'floor', 24.45, -8],
  stairs:    [-27.8, 3.3, 'floor', -27.8, 9],         // west stairwell
  stairs2:   [22.1, 3.3, 'floor', 22.1, 9],           // east stairwell
  wellne:    [21.1, -4, 0.3, 21.1, 3],                // light wells
  wellnw:    [-26.8, -4, 0.3, -26.8, 3],
  wellse:    [21.1, 19.8, 0.3, 21.1, 12],
  wellsw:    [-26.8, 19.8, 0.3, -26.8, 12],
  outside:   [-3.5, -19, 0.1, -3.5, 0],
  roof:      [-3.5, -7.9, 11.1, -3.5, 10],
};
const SCARES = ['figure', 'follower', 'blackout', 'lightDies', 'doorCreak', 'doorSlam', 'knock', 'whisper'];

export class DevConsole {
  constructor(api) {
    this.api = api;
    this.open = false;
    this.hist = []; this.hi = 0;
    const el = this.el = document.createElement('div');
    el.id = 'devcon'; el.hidden = true;
    el.innerHTML = '<div class="log"></div><div class="row"><span>&gt;</span><input spellcheck="false" autocomplete="off"></div>';
    document.body.appendChild(el);
    this.log = el.querySelector('.log'); this.input = el.querySelector('input');
    this.cmds = this.commands();
    addEventListener('keydown', (e) => {
      if (e.code === 'Backquote' || e.key === '`' || e.key === '~') { e.preventDefault(); e.stopPropagation(); this.toggle(); return; }
      if (!this.open) return;
      if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); this.toggle(false); }
    }, true);
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Enter') { const v = this.input.value.trim(); this.input.value = ''; if (v) this.run(v); }
      else if (e.code === 'ArrowUp') { e.preventDefault(); if (this.hist.length) { this.hi = Math.max(0, this.hi - 1); this.input.value = this.hist[this.hi]; } }
      else if (e.code === 'ArrowDown') { e.preventDefault(); this.hi = Math.min(this.hist.length, this.hi + 1); this.input.value = this.hist[this.hi] || ''; }
      else if (e.code === 'Tab') { e.preventDefault(); this.complete(); }
    });
    this.print('Console ready. Type <b>help</b> for commands.', 'dim');
  }

  toggle(v = !this.open) {
    if (v === this.open) return;
    this.open = v; this.el.hidden = !v;
    this.api.onToggle(v);
    if (v) setTimeout(() => this.input.focus(), 0); else this.input.blur();
  }

  print(html, cls = '') {
    const d = document.createElement('div'); d.className = cls; d.innerHTML = html;
    this.log.appendChild(d);
    while (this.log.children.length > 120) this.log.firstChild.remove();
    this.log.scrollTop = this.log.scrollHeight;
  }

  run(line) {
    this.hist.push(line); this.hi = this.hist.length;
    this.print('&gt; ' + esc(line), 'cmd');
    const [name, ...args] = line.split(/\s+/);
    const c = this.cmds[name.toLowerCase()] || this.cmds[ALIAS[name.toLowerCase()]];
    if (!c) return this.print(`Unknown command "${esc(name)}". Try <b>help</b>.`, 'err');
    try { const out = c.run(args.map((a) => a.toLowerCase())); if (out) this.print(out); }
    catch (err) { this.print(esc(String(err.message || err)), 'err'); }
  }

  complete() {
    const v = this.input.value, parts = v.split(/\s+/);
    let pool;
    if (parts.length <= 1) pool = Object.keys(this.cmds);
    else if (['tp', 'goto'].includes(parts[0])) pool = Object.keys(PLACES);
    else if (parts[0] === 'scare') pool = SCARES.map((s) => s.toLowerCase());
    else return;
    const last = parts[parts.length - 1].toLowerCase(), hits = pool.filter((p) => p.startsWith(last));
    if (hits.length === 1) { parts[parts.length - 1] = hits[0]; this.input.value = parts.join(' ') + ' '; }
    else if (hits.length) this.print(hits.join('  '), 'dim');
  }

  commands() {
    const a = this.api;
    const onoff = (x, cur) => (x === 'on' || x === '1' || x === 'true' ? true : x === 'off' || x === '0' || x === 'false' ? false : !cur);
    const num = (x, name) => { const n = parseFloat(x); if (!Number.isFinite(n)) throw new Error(`${name} needs a number`); return n; };
    const C = {
      help: { h: 'help [command] — list commands', run: ([c]) => {
        if (c && (this.cmds[c] || this.cmds[ALIAS[c]])) return esc((this.cmds[c] || this.cmds[ALIAS[c]]).h);
        return Object.values(this.cmds).map((x) => `<span class="k">${esc(x.h.split(' — ')[0])}</span> — ${esc(x.h.split(' — ')[1] || '')}`).join('<br>');
      } },
      clear: { h: 'clear — clear the console', run: () => { this.log.innerHTML = ''; } },
      freeze: { h: 'freeze [on|off] — stop the world (lights, scares, doors, mist); you can still move', run: ([x]) => { a.cheat.frozen = onoff(x, a.cheat.frozen); a.director.setFrozen(a.cheat.frozen); return `World ${a.cheat.frozen ? 'frozen' : 'running'}.`; } },
      unfreeze: { h: 'unfreeze — start the world again', run: () => { a.cheat.frozen = false; a.director.setFrozen(false); return 'World running.'; } },
      timescale: { h: 'timescale <x> — slow motion / fast forward (1 = normal, 0.3 = slow-mo)', run: ([x]) => { a.cheat.timeScale = Math.max(0, Math.min(5, num(x, 'timescale'))); return `Time x${a.cheat.timeScale}.`; } },
      pause: { h: 'pause — open the pause menu', run: () => { a.pause(); this.toggle(false); } },
      menu: { h: 'menu — quit to the title screen', run: () => { a.quit(); this.toggle(false); } },
      tp: { h: 'tp <place> [floor 0-2] | tp <x> <y> <z> — teleport (see "places")', run: (args) => {
        if (args.length >= 3 && args.every((v) => Number.isFinite(parseFloat(v)))) { a.teleport(+args[0], +args[1], +args[2]); return `Teleported to ${args.join(', ')}.`; }
        const p = args[0]; if (!(p in PLACES)) throw new Error(`No place "${p || ''}". Try: places`);
        if (!PLACES[p]) { a.respawn(); return 'Back at the start.'; }
        const [x, z, y, lx, lz] = PLACES[p], f = Math.max(0, Math.min(2, parseInt(args[1] ?? '0', 10) || 0));
        a.teleport(x, y === 'floor' ? LEVELS[f] : y, z, lx, lz);
        return `Teleported to ${p}${y === 'floor' ? ' (floor ' + f + ')' : ''}.`;
      } },
      places: { h: 'places — list teleport spots', run: () => Object.keys(PLACES).join('  ') + '<br><span class="dim">corridors/stairs take a floor: tp west 2</span>' },
      pos: { h: 'pos — where you are (feet position)', run: () => { const p = a.feet(); return `x ${p.x.toFixed(2)}  y ${p.y.toFixed(2)}  z ${p.z.toFixed(2)}`; } },
      respawn: { h: 'respawn — back to the start', run: () => { a.respawn(); return 'Back at the start.'; } },
      fly: { h: 'fly [on|off] — no-clip flying (Space up, C down)', run: ([x]) => { a.setFly(onoff(x, a.flying())); return `Fly ${a.flying() ? 'on' : 'off'}.`; } },
      speed: { h: 'speed <x> — movement speed multiplier (1 = normal)', run: ([x]) => { a.cheat.speed = Math.max(0.1, Math.min(10, num(x, 'speed'))); return `Speed x${a.cheat.speed}.`; } },
      scare: { h: 'scare <name> — trigger a scare now: ' + SCARES.join(', '), run: ([x]) => {
        const name = SCARES.find((s) => s.toLowerCase() === x); if (!name) throw new Error('Scares: ' + SCARES.join(', '));
        const r = a.director.force(name); return r ? `Scare: ${name}.` : `Couldn't do "${name}" here (no spot / door nearby).`;
      } },
      scares: { h: 'scares [on|off] — random scares on or off', run: ([x]) => { a.director.paused = !onoff(x, !a.director.paused); return `Random scares ${a.director.paused ? 'off' : 'on'}.`; } },
      tension: { h: 'tension [0-1] — show or set tension (higher = scares sooner)', run: ([x]) => { if (x != null) a.director.tension = Math.max(0, Math.min(1, num(x, 'tension'))); if (x != null) a.director.next = Math.min(a.director.next, 30 * (1 - a.director.tension) + 2); return `Tension ${a.director.tension.toFixed(2)}, next scare in ~${Math.max(0, a.director.next).toFixed(0)}s.`; } },
      summon: { h: 'summon [distance] — put the figure in front of you', run: ([x]) => { const d = x ? num(x, 'distance') : null; return a.director.summon(d) ? 'It is there.' : 'No room for it here.'; } },
      banish: { h: 'banish — make the figure disappear', run: () => { a.director.vanish(); return 'Gone.'; } },
      torch: { h: 'torch [on|off|<power>] — flashlight (power 6 = normal)', run: ([x]) => {
        if (x && Number.isFinite(parseFloat(x))) { a.cheat.torchPower = Math.max(0, num(x, 'power')); a.setTorch(true); return `Torch power ${a.cheat.torchPower}.`; }
        a.setTorch(onoff(x, a.torchOn())); return `Torch ${a.torchOn() ? 'on' : 'off'}.`;
      } },
      lights: { h: 'lights on|off|flicker — corridor lights', run: ([x]) => { if (!['on', 'off', 'flicker'].includes(x)) throw new Error('lights on | off | flicker'); a.setLights(x); return `Lights ${x}.`; } },
      bright: { h: 'bright [on|off] — see everything (for exploring)', run: ([x]) => { a.cheat.bright = onoff(x, a.cheat.bright); a.applyBright(); return `Bright ${a.cheat.bright ? 'on' : 'off'}.`; } },
      fog: { h: 'fog <density>|off|auto — override the fog (auto = normal, 0.06 outside)', run: ([x]) => {
        if (x === 'auto' || x == null) { a.cheat.fog = null; return 'Fog back to normal.'; }
        a.cheat.fog = x === 'off' ? 0 : Math.max(0, num(x, 'fog')); return `Fog ${a.cheat.fog}.`;
      } },
      retro: { h: 'retro [on|off] — pixel/VHS filter', run: ([x]) => { a.retro.setEnabled(onoff(x, a.retro.enabled)); return `Retro ${a.retro.enabled ? 'on' : 'off'}.`; } },
      fov: { h: 'fov <degrees> — field of view (60 = normal)', run: ([x]) => { a.setFov(Math.max(20, Math.min(120, num(x, 'fov')))); return `FOV ${a.fov()}.`; } },
      sound: { h: 'sound [on|off] — mute / unmute', run: ([x]) => { a.audio.setMuted(!onoff(x, !a.audio.muted)); return `Sound ${a.audio.muted ? 'off' : 'on'}.`; } },
      volume: { h: 'volume <0-1> — master volume', run: ([x]) => { a.setVolume(Math.max(0, Math.min(1, num(x, 'volume')))); return 'Volume set.'; } },
      doors: { h: 'doors open|close — every room door at once', run: ([x]) => { if (!['open', 'close'].includes(x)) throw new Error('doors open | close'); a.setDoors(x === 'open'); return `All doors ${x === 'open' ? 'open' : 'closed'}.`; } },
      manju: { h: 'manju [status|here|away|off|on|chase|stare] — the guard', run: ([x = 'status']) => {
        const m = a.manju, f = a.feet0();
        if (!m.ready || !m.nav?.ready) return 'Manju is still loading (the walkable map builds in the first few seconds).';
        if (x === 'status') { const d = Math.hypot(m.pos.x - f.x, m.pos.z - f.z); return `state ${m.state}, ${d.toFixed(1)} m away, floor ${m.pos.y > 6.5 ? 2 : m.pos.y > 3.4 ? 1 : 0}, light ${m.light.toFixed(2)} (${m.visible ? 'visible' : 'in the dark'}), awareness ${m.awareness.toFixed(2)}`; }
        if (x === 'here') { const dir = a.camDirNow(); dir.y = 0; dir.normalize(); const p = f.clone().addScaledVector(dir, 8); const id = m.nav.nearest(p); if (id < 0) throw new Error('no walkable spot in front of you'); m.place(m.nav.pos(id)); m.setState('idle'); return 'Manju is 8 m in front of you.'; }
        if (x === 'away') { m.spawnFar(f); return 'Sent him far away.'; }
        if (x === 'off') { m.enabled = false; m.state = 'off'; m.alert = 0; return 'Manju off.'; }
        if (x === 'on') { m.enabled = true; if (m.state === 'off') m.spawnFar(f); return 'Manju on.'; }
        if (x === 'chase' || x === 'stare') { if (m.state === 'off') m.spawnFar(f); m.lastKnown.copy(f); m.awareness = 1; m.setState(x); return x === 'chase' ? 'Run.' : 'He sees you.'; }
        throw new Error('manju status | here | away | off | on | chase | stare');
      } },
      mutty: { h: 'mutty [status|here|away|off|on|chase] — the ground-floor crawler', run: ([x = 'status']) => {
        const m = a.mutty, f = a.feet0();
        if (!m.ready || !m.nav?.ready) return 'Mutty is still loading (the walkable map builds in the first few seconds).';
        if (x === 'status') return `state ${m.state}, ${Math.hypot(m.pos.x - f.x, m.pos.z - f.z).toFixed(1)} m away, ${m.alert.toFixed(2)} alert.`;
        if (x === 'here') { const dir = a.camDirNow(); dir.y = 0; dir.normalize(); const id = m.nav.nearest(f.clone().addScaledVector(dir, 4)); if (id < 0) throw new Error('no ground-floor spot in front of you'); m.place(m.nav.pos(id)); return 'Mutty is 4 m in front of you.'; }
        if (x === 'away') { m.spawnFar(f); return 'Sent him away.'; }
        if (x === 'off') { m.state = 'off'; if (m.root) m.root.visible = false; return 'Mutty off.'; }
        if (x === 'on') { if (m.state === 'off') m.spawnFar(f); return 'Mutty on.'; }
        if (x === 'chase') { if (m.state === 'off') m.spawnFar(f); m.lastKnown.copy(f); m.setState('chase'); return 'Mutty is coming.'; }
        throw new Error('mutty status | here | away | off | on | chase');
      } },
      zoya: { h: 'zoya [status|here|away|off|on|spot] — the first-floor warden', run: ([x = 'status']) => {
        const m = a.zoya, f = a.feet0();
        if (!m.ready || !m.nav?.ready) return 'Zoya is still loading (the walkable map builds in the first few seconds).';
        if (x === 'status') return `state ${m.state}, ${Math.hypot(m.pos.x - f.x, m.pos.z - f.z).toFixed(1)} m away, ${m.alert.toFixed(2)} alert.`;
        if (x === 'here') { const dir = a.camDirNow(); dir.y = 0; dir.normalize(); const id = m.nav.nearest(f.clone().addScaledVector(dir, 4)); if (id < 0) throw new Error('no first-floor spot in front of you'); m.place(m.nav.pos(id)); return 'Zoya is 4 m in front of you.'; }
        if (x === 'away') { m.spawnFar(f); return 'Sent her away.'; }
        if (x === 'off') { m.state = 'off'; if (m.root) m.root.visible = false; return 'Zoya off.'; }
        if (x === 'on') { if (m.state === 'off') m.spawnFar(f); return 'Zoya on.'; }
        if (x === 'spot') { m.spot({ feet: f, eyePos: a.eyePos(), camDir: a.camDirNow(), hidden: false }); return 'Zoya has spotted you.'; }
        throw new Error('zoya status | here | away | off | on | spot');
      } },
      god: { h: 'god [on|off] — Manju and Mutty can\'t hurt you', run: ([x]) => { a.cheat.god = onoff(x, a.cheat.god); a.manju.god = a.cheat.god; return `God mode ${a.cheat.god ? 'on' : 'off'}.`; } },
      hurt: { h: 'hurt [n] — take n hearts (console testing)', run: ([x]) => { const n = Math.max(1, parseInt(x ?? '1', 10) || 1); const ok = a.damagePlayer(n, 'console', true); return ok ? `Took ${n}. ${a.health.hearts}/${a.health.max} hearts.` : 'No damage (already dead).'; } },
      heal: { h: 'heal [n] — restore n hearts', run: ([x]) => { const n = Math.max(1, parseInt(x ?? '1', 10) || 1); const h = a.healPlayer(n); return `Healed ${h}. ${a.health.hearts}/${a.health.max} hearts.`; } },
      hearts: { h: 'hearts — current health', run: () => `${a.health.hearts}/${a.health.max} hearts${a.health.low ? ' (low)' : ''}.` },
      hud: { h: 'hud [on|off] — floor label, crosshair', run: ([x]) => { const on = onoff(x, !document.body.classList.contains('nohud')); document.body.classList.toggle('nohud', !on); return `HUD ${on ? 'on' : 'off'}.`; } },
    };
    return C;
  }
}

const ALIAS = { goto: 'tp', teleport: 'tp', noclip: 'fly', slowmo: 'timescale', spawn: 'summon', cls: 'clear', '?': 'help' };
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
