// Mutty, the ground-floor crawler. A low, fast thing that patrols the ground-floor corridors and rooms.
// It cannot use the stairs: its nav grid is a ground-floor slice and every goal is checked against
// floorRange. It notices torchlight and running, chases on the floor, pounces from 1.2-2.3 m, bites once,
// then scuttles away for a moment before coming back.
//
// Senses: 10 Hz. Body: only drawn where there is light on it. Eyes: glow while it is chasing or attacking,
// even in the dark. Callbacks: onBite() (no args) exactly once per pounce.
import * as THREE from 'three';
import { FloorNPC } from './npc.js';

const SPEED = { roam: 1.05, investigate: 2.9, chase: 6.8, retreat: 4.6 };
const SENSE_HZ = 10;
const LOSE_T = 4.0;
const POUNCE_MIN = 1.2, POUNCE_MAX = 2.3;
const POUNCE_CD = 2.2;
const BITE_AT = 0.35;
const ATTACK_END = 0.62;
const RETREAT_T = 1.2;
const GROUND_TOP = 2.0;                 // player feet at/above this are not on Mutty's floor
const rnd = (a, b) => a + Math.random() * (b - a);
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

export class Mutty extends FloorNPC {
  constructor(o) {
    super(o);
    this.onBite = o.onBite;
    this.getManju = o.getManju;
    this.onInform = o.onInform;
    this.moveClip = 'Crawl';
    this.idleClip = 'Idle';
    this.floorRange = [-0.2, GROUND_TOP];
    this.eyeH = 0.55;
    this.chestH = 0.45;
    this.turnRate = 10;
    this.state = 'off';

    this.alert = 0; this.prox = 0;
    this.biteCd = 0;
    this.senseT = 0; this.seeT = 0; this.lostT = 0; this.repathT = 0;
    this.idleT = 0; this.investT = 0; this.retreatT = 0;
    this.seeing = false; this.heard = false; this.givingUp = false;
    this.lastKnown = new THREE.Vector3();
    this.attack = null; this.report = null; this.awayT = 0;
    this.visible = false; this.flickT = 0;
  }

  async load(url = './public/models/crawler.glb') {
    await super.load(url, {
      scale: 1,
      // local to the head bone: two glints just in front of the face surface
      eyeLocal: [[-0.05, 0.115, 0.125], [0.05, 0.115, 0.125]],
      eyeScale: 0.055,
    });
    return this.root;
  }

  onPlace() {
    this.state = 'roam';
    this.play('Idle', 0.15);
    this.path = []; this.doorWait = null;
    this.idleT = 0; this.investT = 0; this.retreatT = 0;
    this.seeT = 0; this.lostT = 0; this.repathT = 0;
    this.seeing = false; this.heard = false; this.givingUp = false;
    this.alert = 0; this.prox = 0; this.biteCd = 0;
    this.attack = null; this.report = null; this.awayT = 0;
    this.lastKnown.copy(this.pos);
    this.visible = false; this.flickT = 0; this.lightT = 0; this.light = 0;
  }

  onReset() {
    this.attack = null; this.report = null; this.awayT = 0;
    this.retreatT = 0; this.biteCd = 0;
    this.seeT = 0; this.lostT = 0; this.repathT = 0;
    this.idleT = 0; this.investT = 0;
    this.seeing = false; this.heard = false; this.givingUp = false;
    this.alert = 0; this.prox = 0;
    this.visible = false; this.flickT = 0; this.lightT = 0; this.light = 0;
  }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    if (s === 'roam') { this.play('Idle', 0.2); this.idleT = 0; this.givingUp = false; }
    if (s === 'investigate') { this.play('Crawl', 0.2); this.investT = 3.0; this.heard = false; }
    if (s === 'chase') { this.play('Crawl', 0.15); this.lostT = 0; this.repathT = 0; this.givingUp = false; }
    if (s === 'attack') this.play('Attack', 0.1, true);
    if (s === 'retreat') { this.play('Crawl', 0.15); this.retreatT = RETREAT_T; }
  }

  // ------------------------------------------------------------------ hearing / sight
  sense(ctx) {
    this.seeing = false; this.heard = false;
    const P = ctx.feet; if (!P) return;
    if (ctx.inRoom) { this.seeT = 0; return; }             // student rooms are safe from Mutty
    if (P.y < this.floorRange[0] || P.y >= GROUND_TOP) { this.seeT = 0; return; }

    const E = this.eye(this._eye), EP = ctx.eyePos;
    const to = new THREE.Vector3().subVectors(EP, E), d = to.length();
    let range = ctx.torchOn ? 18 : 10;
    if (ctx.crouch) range *= 0.7;
    const flat = Math.atan2(P.x - this.pos.x, P.z - this.pos.z);
    const off = Math.abs(angDiff(flat, this.yaw));
    const inCone = off < 1.15 || d < 3.0 || this.state === 'chase' || this.state === 'attack';

    const doors = this.closedDoorMeshes();
    if (!ctx.hidden && d < range && inCone && !this.hitWall(E, EP, doors)) this.seeing = true;

    // a torch pointed straight at it gives it an instant fix even from outside the cone
    if (ctx.torchOn && d < 18) {
      const toHim = new THREE.Vector3().subVectors(this.chest(this._chest), EP).normalize();
      if (toHim.dot(ctx.camDir) > 0.95 && !this.hitWall(EP, this.chest(this._chest), doors)) this.seeing = true;
    }

    if (this.seeing) this.seeT = Math.min(1, this.seeT + 1 / SENSE_HZ);
    else this.seeT = 0;

    // running, walking, a landing from a fall: go and look, if it is close enough
    if (!this.seeing && ctx.noise > 0) {
      const hd = Math.hypot(P.x - this.pos.x, P.z - this.pos.z) + Math.abs(P.y - this.pos.y) * 3;
      if (hd < ctx.noise) { this.lastKnown.copy(P); this.heard = true; }
    }
  }

  // ------------------------------------------------------------------ pounce
  startAttack(ctx) {
    this.attack = {
      t: 0,
      bite: false,
      home: this.pos.clone(),                  // ground-bound position (authoritative)
      target: ctx.feet.clone(),                // where the player was when it jumped
      eyeY: ctx.eyePos.y,
    };
    this.path = [];
    this.doorWait = null;
    this.biteCd = POUNCE_CD;
    this.setState('attack');
    this.alert = 1;
  }

  updateAttack(dt, ctx) {
    const a = this.attack;
    if (!a) { this.beginRetreat(ctx); return; }
    a.t += dt;

    if (!a.bite && a.t >= BITE_AT) {
      a.bite = true;
      const P = ctx.feet;
      const d = Math.hypot(P.x - this.pos.x, P.z - this.pos.z);
      const dy = Math.abs(ctx.eyePos.y - (this.pos.y + this.eyeH));
      const reach = 2.4;
      if (d <= reach && dy < 1.9 && !this.hitWall(this.eye(), ctx.eyePos, this.closedDoorMeshes())) {
        this.onBite?.();                      // exactly once per attack; main removes a heart
        this.audio?.muttyBite?.(this.pan(ctx));
        this.report = { pos: ctx.feet.clone(), t: 0, told: false, repath: 0 };
      }
      if (this.state !== 'attack') return;    // onBite may have ended/reset the round
    }
    if (a.t >= ATTACK_END) {
      if (this.report) {
        this.attack = null;
        this.state = 'report';
        this.path = []; this.doorWait = null;
        this.report.t = 0;
        this.play('Crawl', 0.15);
      } else this.beginRetreat(ctx);
    }
  }

  // After a bite Mutty runs to Manju, tells him where the player is, then clears out for a while.
  finishReport() {
    if (!this.report || this.report.told) return;
    this.report.told = true;
    this.onInform?.(this.report.pos);
    this.startAway();
  }

  updateReport(dt, ctx) {
    const rep = this.report;
    if (!rep) { this.startAway(); return; }
    rep.t += dt;
    if (rep.t >= 2.0) { this.finishReport(); return; }
    rep.repath -= dt;
    if (rep.repath <= 0) {
      rep.repath = 0.4;
      const m = this.getManju?.();
      if (m?.ready) {
        let id = this._inFloor(m.pos.y) ? this.nav.nearest(m.pos) : -1;
        if (id < 0) id = this.nearestAllowed(m.pos);
        if (id >= 0) this.goTo(id);
      }
    }
    const m = this.getManju?.();
    if (m?.ready && Math.hypot(m.pos.x - this.pos.x, m.pos.z - this.pos.z) < 1.8 && Math.abs(m.pos.y - this.pos.y) < 1.2) this.finishReport();
  }

  startAway() {
    this.state = 'away';
    this.awayT = 6 + Math.random() * 3;
    this.attack = null; this.report = null;
    this.path = []; this.doorWait = null;
    this.seeing = false; this.heard = false;
    this.alert = 0; this.prox = 0;
    if (this.root) this.root.visible = false;
  }

  beginRetreat(ctx) {
    this.attack = null;
    this.setState('retreat');
    this.path = [];
    const P = ctx.feet;
    const away = new THREE.Vector3(this.pos.x - P.x, 0, this.pos.z - P.z);
    if (away.lengthSq() < 1e-4) away.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    away.normalize();
    const target = new THREE.Vector3(this.pos.x + away.x * 5, this.pos.y, this.pos.z + away.z * 5);
    if (!this.goTo(target)) {
      const g = this.randomGoal(this.pos, 7, true);
      if (g >= 0) this.goTo(g); else this.path = [];
    }
  }

  // ------------------------------------------------------------------ per frame
  update(dt, ctx) {
    if (!this.ready || !this.nav?.ready || this.state === 'off') {
      if (this.root) this.root.visible = false;
      return;
    }
    if (this.state === 'away') {
      this.awayT -= dt;
      if (this.root) this.root.visible = false;
      if (this.awayT <= 0) {
        this.awayT = 0;
        if (!this.spawnFar(ctx.feet, 18)) this.state = 'roam';
      }
      return;
    }
    this.root.visible = true;
    this.biteCd = Math.max(0, this.biteCd - dt);

    this.senseT -= dt;
    if (this.senseT <= 0) { this.senseT = 1 / SENSE_HZ; this.sense(ctx); }

    const P = ctx.feet;
    const dist = Math.hypot(P.x - this.pos.x, P.z - this.pos.z);
    const dy = Math.abs(P.y - this.pos.y);
    const offFloor = P.y < this.floorRange[0] || P.y >= GROUND_TOP;

    // A student room breaks the hunt. If it already bit you, it keeps its report errand.
    if (ctx.inRoom && !this.report && (this.state === 'chase' || this.state === 'investigate' || this.state === 'attack')) {
      this.startAway();
      return;
    }

    switch (this.state) {
      case 'roam':
        if (this.seeing) {
          this.lastKnown.copy(P);
          if (this.seeT >= 0.3 || dist < 6 || ctx.torchOn) this.setState('chase');
          else {
            this.setState('investigate'); this.alert = Math.max(this.alert, 0.7);
            if (!this.goTo(P)) this.path = [];
          }
        } else if (this.heard) {
          this.heard = false;
          this.setState('investigate'); this.alert = Math.max(this.alert, 0.7);
          if (!this.goTo(this.lastKnown)) this.path = [];
        } else if (!this.path.length) {
          this.idleT -= dt;
          if (this.cur !== this.actions.Idle) this.play('Idle');
          if (this.idleT <= 0) {
            const g = this.randomGoal();
            if (g >= 0 && this.goTo(g)) this.idleT = rnd(3, 7); else this.idleT = 1.2;
          }
        }
        break;

      case 'investigate':
        if (this.heard) {                       // a fresh noise while it is already looking
          this.heard = false;
          if (!this.goTo(this.lastKnown)) this.path = [];
          this.investT = Math.max(this.investT, 2.5);
        }
        if (this.seeing && (this.seeT >= 0.25 || dist < 6 || ctx.torchOn)) { this.setState('chase'); break; }
        if (!this.path.length) {
          this.investT -= dt;
          this.faceTowards(this.lastKnown, dt, 3);
          if (this.cur !== this.actions.Idle) this.play('Idle');
          if (this.investT <= 0) this.setState('roam');
        }
        break;

      case 'chase': {
        if (offFloor) {                         // player crossed to another floor: only floor nodes
          this.seeT = 0; this.givingUp = true; this.lostT += dt;
          this.repathT -= dt;
          if (this.repathT <= 0) {
            this.repathT = 0.4;
            const id = this.nearestAllowed(P);
            if (id >= 0) this.goTo(id); else this.path = [];
          }
          if (!this.path.length) this.setState('roam');
          break;
        }

        if (this.seeing) { this.lostT = 0; this.lastKnown.copy(P); } else this.lostT += dt;

        this.repathT -= dt;
        if (this.repathT <= 0) {
          this.repathT = 0.3;
          const target = this.seeing ? P : this.lastKnown;
          if (!this.goTo(target)) {
            // the target is off the floor or unreachable: move to the nearest allowed node and give up
            const id = this.nearestAllowed(target);
            if (id >= 0) this.goTo(id); else this.path = [];
            this.givingUp = true;
          } else if (this.seeing) this.givingUp = false;
        }

        const canPounce = dist >= POUNCE_MIN && dist <= POUNCE_MAX;
        const pointBlank = dist < POUNCE_MIN;
        if (this.seeing && this.biteCd <= 0 && (canPounce || pointBlank) && Math.abs(P.y - this.pos.y) < 1.0) {
          // pounce from the 1.2-2.3 m band; below POUNCE_MIN it bites point-blank instead
          this.startAttack(ctx);
          break;
        }
        if (this.lostT > LOSE_T) {
          this.setState('investigate'); this.investT = 2.0;
          if (!this.goTo(this.lastKnown)) this.path = [];
          break;
        }
        if (this.givingUp && !this.path.length) this.setState('roam');
        else if (!this.path.length && !this.seeing) { this.setState('investigate'); this.investT = 2.5; }
        break;
      }

      case 'attack':
        this.updateAttack(dt, ctx);
        break;

      case 'report':
        this.updateReport(dt, ctx);
        break;

      case 'retreat':
        this.retreatT -= dt;
        if (this.seeing) this.lastKnown.copy(P);
        if (this.retreatT <= 0) {
          if (this.seeing) this.setState('chase'); else this.setState('roam');
        }
        break;
    }

    let sp = 0;
    if (this.state === 'roam') sp = this.path.length ? SPEED.roam : 0;
    else if (this.state === 'investigate') sp = SPEED.investigate;
    else if (this.state === 'chase') sp = SPEED.chase;
    else if (this.state === 'report') sp = 5.2;
    else if (this.state === 'retreat') sp = SPEED.retreat;

    if (this.state === 'off') { this.root.visible = false; return; }
    if (this.state !== 'attack' && this.path.length && sp > 0) this.follow(dt, sp);

    if (this.cur === this.actions.Crawl) this.cur.timeScale = Math.max(0.55, Math.min(2.2, sp / 1.2 || 0.55));
    else if (this.cur) this.cur.timeScale = 1;

    this.mixer.update(dt);
    this.syncRoot();
    if (this.state === 'attack') this.lungeRoot(dt);

    // scuttle on the stride, in step with the actual distance covered
    const a = this.audio, far = Math.min(1, dist / 22 + (dy > 2 ? 0.35 : 0));
    const stride = this.state === 'chase' ? 0.9 : 0.6;
    if (dist <= 24 && this.stepDist > stride) {
      this.stepDist = 0;
      a?.muttyScuttle?.(this.pan(ctx), far, (this.state === 'chase' ? 0.55 : 0.32) * (1 - far * 0.6));
    }

    const targetAlert = this.state === 'chase' || this.state === 'attack' ? 1
      : this.state === 'investigate' || this.state === 'retreat' ? 0.7 : 0;
    this.alert += (targetAlert - this.alert) * Math.min(1, dt * (targetAlert > this.alert ? 5 : 0.45));
    this.prox = Math.max(0, 1 - Math.hypot(dist, dy * 2) / 18);

    // body only where light falls on it; eyes stay lit while hunting
    this.lightT -= dt;
    if (this.lightT <= 0) { this.lightT = 1 / 15; this.light = this.lightLevel(ctx); }
    const want = this.light > 0.22;
    if (want !== this.visible) { this.visible = want; this.flickT = 0.16; }
    let show = this.visible;
    if (this.flickT > 0) { this.flickT -= dt; show = Math.random() < 0.5; }
    else if (show && this.light < 0.32 && Math.random() < 0.06) show = false;

    const alertEyes = this.state === 'chase' || this.state === 'attack';
    const eyeOn = show || alertEyes;
    const eyeSize = (alertEyes ? 0.12 : this.eyeScale) * (0.92 + Math.random() * 0.08);
    this.updateVisibility(dt, { body: show, eyes: eyeOn, eyeScale: eyeSize });
  }

  // visual-only jump: root rises toward face height and forward, this.pos stays on the floor
  lungeRoot(dt) {
    const a = this.attack; if (!a) return;
    const t = Math.min(1, a.t / BITE_AT), e = t * t * (3 - 2 * t);
    const dx = a.target.x - this.pos.x, dz = a.target.z - this.pos.z;
    const L = Math.hypot(dx, dz) || 1;
    const reach = Math.min(1.05, L * 0.8);
    const rise = Math.min(1.05, Math.max(0.45, (a.eyeY - this.pos.y) * 0.75)) * e;
    this.root.position.set(this.pos.x + dx / L * reach * e, this.pos.y + rise, this.pos.z + dz / L * reach * e);
    const want = Math.atan2(dx, dz);
    this.yaw += angDiff(want, this.yaw) * Math.min(1, dt * 14);
    this.root.rotation.y = this.yaw;
  }
}
