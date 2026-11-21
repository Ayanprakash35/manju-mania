// Walkability check, run in the game page (debug only):
//   const m = await import('/tools/navcheck.js'); await m.run()
// Builds a 0.5 m grid of standable spots on every floor (needs 1.8 m headroom), links neighbours
// when the step is < 0.4 m and nothing blocks the way at knee/chest/head height, flood-fills from
// the spawn and draws the result as an overlay map (colour = height, grey = standable but unreachable).
import * as THREE from 'three';

export async function run({ x0 = -36, x1 = 30, z0 = -13, z1 = 22, cell = 0.5, start = [-3.55, 9] } = {}) {
  const g = window.__game;
  // the game's collision mesh: world-space, everything the player collides with, BVH already built
  const col = g.collider;
  col.material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  col.updateMatrixWorld();
  const meshes = [col];
  const rc = new THREE.Raycaster(); rc.firstHitOnly = false;
  const down = new THREE.Vector3(0, -1, 0), up = new THREE.Vector3(0, 1, 0);
  const NX = Math.round((x1 - x0) / cell), NZ = Math.round((z1 - z0) / cell);
  const cols = new Array(NX * NZ);
  const hitAll = (o, d, far) => { rc.set(o, d); rc.far = far; return rc.intersectObjects(meshes, false); };
  for (let i = 0; i < NX; i++) for (let k = 0; k < NZ; k++) {
    const x = x0 + (i + 0.5) * cell, z = z0 + (k + 0.5) * cell;
    const hits = hitAll(new THREE.Vector3(x, 14, z), down, 20).filter((h) => h.face && h.face.normal.y > 0.7);
    const nodes = [];
    for (const h of hits) {
      const y = h.point.y;
      if (y > 12) continue;
      if (nodes.some((n) => Math.abs(n.y - y) < 0.3)) continue;
      const head = hitAll(new THREE.Vector3(x, y + 0.05, z), up, 1.75);
      if (head.length) continue;
      nodes.push({ i, k, x, z, y, reach: false });
    }
    cols[i * NZ + k] = nodes;
  }
  const blocked = (a, b, dy) => {
    const o = new THREE.Vector3(a.x, a.y + dy, a.z), d = new THREE.Vector3(b.x - a.x, (b.y - a.y), b.z - a.z);
    const len = d.length(); d.normalize();
    return hitAll(o, d, len + 0.15).length > 0;
  };
  // flood fill from the node nearest the start
  const si = Math.floor((start[0] - x0) / cell), sk = Math.floor((start[1] - z0) / cell);
  const s = (cols[si * NZ + sk] || []).sort((a, b) => a.y - b.y)[0];
  if (!s) return 'no start node';
  s.reach = true; const q = [s];
  while (q.length) {
    const a = q.pop();
    for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = a.i + di, nk = a.k + dk;
      if (ni < 0 || nk < 0 || ni >= NX || nk >= NZ) continue;
      for (const b of cols[ni * NZ + nk]) {
        if (b.reach || Math.abs(b.y - a.y) > 0.4) continue;
        if (blocked(a, b, 0.45) || blocked(a, b, 1.0) || blocked(a, b, 1.6)) continue;
        b.reach = true; q.push(b);
      }
    }
  }
  // summary per height band and overlay maps (one per floor)
  const bands = [['ground', -0.5, 2.5], ['first', 2.5, 5.6], ['second', 5.6, 9.5], ['roof', 9.5, 13]];
  const all = cols.flat();
  const summary = {};
  for (const [n, lo, hi] of bands) {
    const inb = all.filter((v) => v.y >= lo && v.y < hi);
    summary[n] = { standable: inb.length, reachable: inb.filter((v) => v.reach).length };
  }
  let cv = document.getElementById('navmap');
  if (!cv) { cv = document.createElement('canvas'); cv.id = 'navmap'; Object.assign(cv.style, { position: 'fixed', left: 0, top: 0, zIndex: 50, background: '#fff' }); document.body.appendChild(cv); }
  const S = 5, W = NX * S, H = NZ * S;
  cv.width = W * 2 + 30; cv.height = H * 2 + 30;
  const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height);
  bands.forEach(([n, lo, hi], bi) => {
    const ox = (bi % 2) * (W + 30), oy = Math.floor(bi / 2) * (H + 30);
    c.fillStyle = '#f4f4f4'; c.fillRect(ox, oy, W, H);
    for (const v of all) if (v.y >= lo && v.y < hi) {
      c.fillStyle = v.reach ? `hsl(${(v.y - lo) / (hi - lo) * 240},80%,50%)` : '#999';
      c.fillRect(ox + v.i * S, oy + v.k * S, S, S);
    }
    c.fillStyle = '#000'; c.font = '14px sans-serif'; c.fillText(`${n}: ${summary[n].reachable}/${summary[n].standable}`, ox + 4, oy + 14);
  });
  window.__nav = { cols, NX, NZ, x0, z0, cell };
  return summary;
}
export function hide() { document.getElementById('navmap')?.remove(); }
