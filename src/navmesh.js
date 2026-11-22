// Walkable grid for Manju, built from the collision mesh at load time (no hand-placed waypoints):
// every 0.35 m column over the building is raycast top to bottom; each upward-facing surface with
// headroom and clearance from walls becomes a node. Nodes on neighbouring columns join when the step
// between them is small enough to walk (which is what lets stairs connect the floors). A* on top.
import * as THREE from 'three';

const CELL = 0.35;
const HEADROOM = 1.6, STEP = 0.42, CLEAR = 0.17;

export class NavGrid {
  constructor(collider, bounds) {
    this.col = collider;
    this.b = bounds;                                  // { x0, x1, z0, z1 }
    this.nx = Math.ceil((bounds.x1 - bounds.x0) / CELL); this.nz = Math.ceil((bounds.z1 - bounds.z0) / CELL);
    this.cols = new Array(this.nx * this.nz);         // per column: list of node ids
    this.x = []; this.y = []; this.z = []; this.nb = [];
    this.ready = false;
  }

  // build in slices so loading doesn't freeze; resolves when done
  build(sliceMs = 10) {
    const rc = new THREE.Raycaster(); rc.firstHitOnly = false;
    const down = new THREE.Vector3(0, -1, 0), o = new THREE.Vector3();
    const box = new THREE.Box3(), I = new THREE.Matrix4();
    const bvh = this.col.geometry.boundsTree;
    let c = 0;
    const total = this.nx * this.nz;
    return new Promise((resolve) => {
      const slice = () => {
        const t0 = performance.now();
        while (c < total && performance.now() - t0 < sliceMs) {
          const i = c % this.nx, k = Math.floor(c / this.nx);
          const x = this.b.x0 + (i + 0.5) * CELL, z = this.b.z0 + (k + 0.5) * CELL;
          o.set(x, 14, z); rc.set(o, down); rc.far = 20;
          const hits = rc.intersectObject(this.col, false);
          const ids = [];
          for (let h = 0; h < hits.length; h++) {
            const hit = hits[h];
            if (!hit.face || hit.face.normal.y < 0.6) continue;           // floors, treads, landings only
            const y = hit.point.y;
            // headroom: the next surface above must be high enough
            let above = Infinity;
            for (let g = h - 1; g >= 0; g--) { if (hits[g].point.y > y + 0.05) { above = hits[g].point.y; break; } }
            if (above - y < HEADROOM) continue;
            if (ids.some((id) => Math.abs(this.y[id] - y) < 0.3)) continue;   // same surface twice (double faces)
            // clearance from walls between knee and head height
            box.min.set(x - CLEAR, y + 0.35, z - CLEAR); box.max.set(x + CLEAR, y + 1.5, z + CLEAR);
            if (bvh.intersectsBox(box, I)) continue;
            const id = this.x.length;
            this.x.push(x); this.y.push(y); this.z.push(z); this.nb.push([]);
            ids.push(id);
          }
          this.cols[c] = ids;
          c++;
        }
        if (c < total) { setTimeout(slice, 0); return; }          // timers keep going while the tab is in the background
        this.link();
        this.components();
        this.ready = true;
        resolve(this);
      };
      slice();
    });
  }

  // Restricted view over one floor, for characters that never leave it: Mutty slices y < 2.0 (ground
  // floor), Zoya roughly 3.35-4.65 (first floor), both excluding the stair rectangles. Keeps the grid bounds/collider, remaps the kept
  // nodes to 0..n-1 and rebuilds neighbour lists, column buckets and reachability for the subset.
  slice(predicate) {
    const oldToNew = new Int32Array(this.x.length).fill(-1), keep = [];
    for (let id = 0; id < this.x.length; id++) {
      if (!predicate(this, id)) continue;
      oldToNew[id] = keep.length;
      keep.push(id);
    }
    const s = Object.create(NavGrid.prototype);          // keeps nearest/pos/path/smooth; caches stay lazy
    s.col = this.col;
    s.b = this.b;
    s.nx = this.nx; s.nz = this.nz;
    s.x = new Array(keep.length); s.y = new Array(keep.length); s.z = new Array(keep.length);
    s.nb = new Array(keep.length);
    s.cols = new Array(this.nx * this.nz);
    for (let n = 0; n < keep.length; n++) {
      const id = keep[n];
      s.x[n] = this.x[id]; s.y[n] = this.y[id]; s.z[n] = this.z[id];
      s.nb[n] = [];
      for (const m of this.nb[id]) { const m2 = oldToNew[m]; if (m2 >= 0) s.nb[n].push(m2); }
      const c = Math.floor((s.x[n] - this.b.x0) / CELL) + Math.floor((s.z[n] - this.b.z0) / CELL) * this.nx;
      (s.cols[c] ||= []).push(n);
    }
    s.ready = true;
    s.components();                                       // empty slice: reach is empty, no throwing
    return s;
  }

  link() {
    const rc = new THREE.Raycaster(); rc.firstHitOnly = true;
    const a = new THREE.Vector3(), d = new THREE.Vector3();
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (let k = 0; k < this.nz; k++) for (let i = 0; i < this.nx; i++) {
      for (const id of this.cols[k * this.nx + i] || []) {
        for (const [di, dk] of dirs) {
          const i2 = i + di, k2 = k + dk;
          if (i2 < 0 || k2 < 0 || i2 >= this.nx || k2 >= this.nz) continue;
          for (const id2 of this.cols[k2 * this.nx + i2] || []) {
            if (Math.abs(this.y[id2] - this.y[id]) > STEP) continue;
            if (di && dk) {                                                // diagonals: make sure no thin wall in between
              a.set(this.x[id], Math.max(this.y[id], this.y[id2]) + 0.6, this.z[id]);
              d.set(this.x[id2] - this.x[id], 0, this.z[id2] - this.z[id]); const L = d.length(); d.normalize();
              rc.set(a, d); rc.far = L;
              if (rc.intersectObject(this.col, false).length) continue;
            }
            this.nb[id].push(id2); this.nb[id2].push(id);
          }
        }
      }
    }
  }

  // mark the largest connected area (the building's floors + stairs); goals are only picked from it
  components() {
    const N = this.x.length, comp = new Int32Array(N).fill(-1); let best = -1, bestN = 0, c = 0;
    for (let s = 0; s < N; s++) {
      if (comp[s] >= 0) continue;
      let n = 0; const q = [s]; comp[s] = c;
      while (q.length) { const a = q.pop(); n++; for (const b of this.nb[a]) if (comp[b] < 0) { comp[b] = c; q.push(b); } }
      if (n > bestN) { bestN = n; best = c; }
      c++;
    }
    this.reach = new Uint8Array(N); for (let i = 0; i < N; i++) this.reach[i] = comp[i] === best ? 1 : 0;
  }

  // nearest node to a world point (same storey: within 1.2 m vertically), searching outward
  nearest(p, maxR = 6) {
    const ci = Math.floor((p.x - this.b.x0) / CELL), ck = Math.floor((p.z - this.b.z0) / CELL);
    let best = -1, bd = Infinity;
    const R = Math.ceil(maxR / CELL);
    for (let r = 0; r <= R; r++) {
      for (let k = ck - r; k <= ck + r; k++) for (let i = ci - r; i <= ci + r; i++) {
        if (Math.max(Math.abs(i - ci), Math.abs(k - ck)) !== r) continue;
        if (i < 0 || k < 0 || i >= this.nx || k >= this.nz) continue;
        for (const id of this.cols[k * this.nx + i] || []) {
          const dy = p.y - this.y[id];
          if (dy < -0.6 || dy > 1.9) continue;                           // p may be feet or eyes
          const d = (this.x[id] - p.x) ** 2 + (this.z[id] - p.z) ** 2 + dy * dy * 0.1;
          if (d < bd && this.nb[id].length) { bd = d; best = id; }
        }
      }
      if (best >= 0 && r * CELL > Math.sqrt(bd) + CELL) break;
    }
    return best;
  }

  pos(id, out = new THREE.Vector3()) { return out.set(this.x[id], this.y[id], this.z[id]); }

  // A* from node a to node b; returns node ids (start excluded) or null
  path(a, b, maxNodes = 60000) {
    if (a < 0 || b < 0 || a >= this.x.length || b >= this.x.length) return null;
    if (a === b) return [b];
    const N = this.x.length;
    const g = this._g ||= new Float32Array(N), came = this._came ||= new Int32Array(N), stamp = this._st ||= new Uint32Array(N);
    const closed = this._cl ||= new Uint32Array(N);
    const run = this._run = (this._run || 0) + 1;
    const h = (n) => Math.hypot(this.x[n] - this.x[b], this.z[n] - this.z[b]) + Math.abs(this.y[n] - this.y[b]) * 1.5;
    const heap = new MinHeap();
    g[a] = 0; stamp[a] = run; came[a] = -1; heap.push(a, h(a));
    let seen = 0;
    while (heap.size) {
      const n = heap.pop();
      if (n === b) break;
      if (closed[n] === run) continue; closed[n] = run;
      if (++seen > maxNodes) return null;
      for (const m of this.nb[n]) {
        if (closed[m] === run) continue;
        const cost = g[n] + Math.hypot(this.x[m] - this.x[n], this.y[m] - this.y[n], this.z[m] - this.z[n]);
        if (stamp[m] !== run || cost < g[m]) { stamp[m] = run; g[m] = cost; came[m] = n; heap.push(m, cost + h(m)); }
      }
    }
    if (stamp[b] !== run) return null;
    const out = []; for (let n = b; n !== a && n >= 0; n = came[n]) out.push(n);
    return out.reverse();
  }

  // remove intermediate nodes that have a clear straight line between them (smoother walking)
  smooth(ids, from) {
    if (!ids || ids.length < 3) return ids;
    const rc = new THREE.Raycaster(); rc.firstHitOnly = true;
    const out = [], a = from.clone(), p = new THREE.Vector3(), d = new THREE.Vector3();
    let i = 0;
    while (i < ids.length) {
      let j = Math.min(ids.length - 1, i + 12);
      for (; j > i; j--) {
        this.pos(ids[j], p);
        if (Math.abs(p.y - a.y) > 0.25) continue;                        // keep every node on stairs
        d.subVectors(p, a); d.y = 0; const L = d.length(); if (L < 1e-3) break;
        d.normalize();
        let clear = true;
        for (const [ox, h] of [[0, 0.5], [CLEAR, 0.9], [-CLEAR, 0.9]]) {
          rc.set(new THREE.Vector3(a.x - d.z * ox, a.y + h, a.z + d.x * ox), d); rc.far = L;
          if (rc.intersectObject(this.col, false).length) { clear = false; break; }
        }
        if (clear) break;
      }
      out.push(ids[j]); this.pos(ids[j], a); i = j + 1;
    }
    return out;
  }
}

class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(k, v) {
    const K = this.k, V = this.v; let i = K.length; K.push(k); V.push(v);
    while (i > 0) { const p = (i - 1) >> 1; if (V[p] <= v) break; K[i] = K[p]; V[i] = V[p]; i = p; }
    K[i] = k; V[i] = v;
  }
  pop() {
    const K = this.k, V = this.v, top = K[0], lk = K.pop(), lv = V.pop();
    if (K.length) {
      let i = 0; const n = K.length;
      while (true) {
        let l = 2 * i + 1, r = l + 1, m = i;
        let mv = lv;
        if (l < n && V[l] < mv) { m = l; mv = V[l]; }
        if (r < n && V[r] < mv) { m = r; mv = V[r]; }
        if (m === i) break;
        K[i] = K[m]; V[i] = V[m]; i = m;
      }
      K[i] = lk; V[i] = lv;
    }
    return top;
  }
}
