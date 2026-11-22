// Heart health: integer hearts, a short invulnerability window, and deterministic event callbacks.
// No DOM, audio, imports, or timers — advance invulnerability yourself with update(dt).
export class Health {
  constructor({ max = 3, invuln = 1.25, canDamage = () => true, onChange = null, onDamage = null, onDeath = null } = {}) {
    this._max = Math.max(1, Math.floor(max));
    this._hearts = this._max;
    this.invuln = Math.max(0, Number(invuln) || 0); // seconds of i-frames granted per hit
    this.invulnTime = 0;                           // seconds of i-frames remaining
    this.canDamage = canDamage;
    this.onChange = onChange; // (health, {type, ...}) => void — only fires on an actual state change
    this.onDamage = onDamage; // (health, source) => void
    this.onDeath = onDeath;   // (source) => void — fires once, when hearts reach 0
  }

  get max() { return this._max; }
  get hearts() { return this._hearts; }
  get low() { return this._hearts <= Math.ceil(this._max / 3); }
  get dead() { return this._hearts <= 0; }

  // Returns true only if the hit was applied. force bypasses i-frames/state checks (console testing).
  damage(amount = 1, source = '', force = false) {
    const n = Math.floor(Number(amount) || 0);
    if (this.dead || n <= 0 || (!force && (this.invulnTime > 0 || !this.canDamage()))) return false;
    this._hearts = Math.max(0, this._hearts - n);
    this.invulnTime = this.invuln;
    this.onChange?.(this, { type: 'damage', source });
    this.onDamage?.(this, source);
    if (this.dead) this.onDeath?.(source);
    return true;
  }

  // Returns the number of hearts actually restored (0 when dead or already full).
  heal(amount = 1) {
    const n = Math.floor(Number(amount) || 0);
    if (this.dead || n <= 0 || this._hearts >= this._max) return 0;
    const before = this._hearts;
    this._hearts = Math.min(this._max, this._hearts + n);
    const healed = this._hearts - before;
    if (healed > 0) this.onChange?.(this, { type: 'heal', amount: healed });
    return healed;
  }

  reset() {
    this._hearts = this._max;
    this.invulnTime = 0;
    this.onChange?.(this, { type: 'reset' });
  }

  update(dt) {
    if (!(dt > 0)) return;
    this.invulnTime = Math.max(0, this.invulnTime - dt);
  }
}
