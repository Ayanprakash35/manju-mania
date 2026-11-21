// Shapr3D OBJ -> optimized GLB for the walkable game.
//   node tools/convert.mjs <input.obj> [out.glb]
//
// What it does:
//  * reads the OBJ (global indices, per-vertex RGB, v/vt/vn faces, one group per body)
//  * converts units: export units / 2.54 -> metres, Z-up -> Y-up, ground slab top at y = 0
//  * simplifies over-tessellated bodies (door handles had 30k triangles each)
//  * merges every body into one mesh per colour (19 colours -> 19 draw calls instead of 1534)
//  * keeps the entrance doors (+ their handles) as separate nodes so the game can swing them open
//  * writes a meshopt-compressed GLB
import fs from 'node:fs';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, dedup, prune, meshopt, quantize } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { buildInterior, CLIP_RECTS } from './interior.mjs';

// Export units: every dimension / 2.54 is a round number (16, 7, 14, 33, 39...), i.e. the model was
// typed in metres in a document set to inches and exported in cm. So metres = value / 2.54.
// (Owner confirmed the earlier feet reading, x0.3048, made the building too small.)
const UNIT = 1 / 2.54;
const GROUND_Z = 1.99344;            // top of the ground-floor slab in the export (raw units)
// Fixed horizontal centring (was the footprint centre of the original export). Fixed so that the
// coordinates measured in tools/interior.mjs stay valid when generated geometry changes the footprint.
const CX = -3.88, CZ = 11.75;
// Courtyard facade blocks: solid in the export. They are removed and rebuilt hollow (rooms) by interior.mjs.
const REBUILD = /^Body_(4483|4745|4746)(_|$)/;
// Perimeter walls: rebuilt as solid boxes so window and door openings can be cut through them.
const REBUILD_SOLID = /^Body_4744(_|$)/;
// Dropped entirely: a dark slab floating in the north corridor zone (z -10.3..-8.3, y 3.7..9.8).
const DROP = /^Body_1182_\(3\)_\(2\)$/;
const [, , inPath, outPath = 'public/building.glb'] = process.argv;
if (!inPath) { console.error('usage: node tools/convert.mjs <input.obj> [out.glb]'); process.exit(1); }

// ---------- parse ----------
const src = fs.readFileSync(inPath, 'utf8').split('\n');
const P = [], COL = [], N = [];
const bodies = []; let cur = null;
for (const line of src) {
  const c0 = line.charCodeAt(0), c1 = line.charCodeAt(1);
  if (c0 === 118 && c1 === 32) {                    // 'v '
    const p = line.trim().split(/\s+/);
    P.push(+p[1], +p[2], +p[3]);
    COL.push(p.length >= 7 ? `${(+p[4]).toFixed(3)},${(+p[5]).toFixed(3)},${(+p[6]).toFixed(3)}` : '0.800,0.800,0.800');
  } else if (c0 === 118 && c1 === 110) {            // 'vn'
    const p = line.trim().split(/\s+/);
    N.push(+p[1], +p[2], +p[3]);
  } else if (c0 === 102 && c1 === 32) {             // 'f '
    const t = line.trim().split(/\s+/).slice(1).map(s => { const q = s.split('/'); return [q[0] - 1, (q[2] || q[0]) - 1]; });
    for (let k = 1; k < t.length - 1; k++) cur.tris.push(t[0], t[k], t[k + 1]);
  } else if ((c0 === 103 || c0 === 111) && c1 === 32) { // 'g ' / 'o '
    cur = { name: line.slice(2).trim(), tris: [] }; bodies.push(cur);
  }
}
console.log(`parsed ${P.length / 3} verts, ${bodies.length} bodies, ${bodies.reduce((s, b) => s + b.tris.length / 3, 0)} tris`);

// export units -> metres, Y-up (x, z, -y), centred
const tx = (i) => [P[3 * i] * UNIT - CX, (P[3 * i + 2] - GROUND_Z) * UNIT, -P[3 * i + 1] * UNIT - CZ];
const tn = (i) => [N[3 * i], N[3 * i + 2], -N[3 * i + 1]];

// which node a body goes to
const DOOR_L = new Set(['Body_1531', 'Body_1533', 'Body_1534']);
const DOOR_R = new Set(['Body_1531_(1)', 'Body_1533_(1)', 'Body_1534_(1)']);

await MeshoptSimplifier.ready;
// buckets: key -> { color, pos:[], nrm:[] } (non-indexed; welded later)
const buckets = new Map();
const bucket = (key, color) => {
  if (!buckets.has(key)) buckets.set(key, { color, pos: [], nrm: [] });
  return buckets.get(key);
};
let trisIn = 0, trisOut = 0, flipped = 0;
const removed = [], solids = [], kept = [], droppedNames = [];
const bbox = (pos) => { const r = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (let i = 0; i < pos.length; i += 3) { r.minX = Math.min(r.minX, pos[i]); r.maxX = Math.max(r.maxX, pos[i]); r.minY = Math.min(r.minY, pos[i + 1]); r.maxY = Math.max(r.maxY, pos[i + 1]); r.minZ = Math.min(r.minZ, pos[i + 2]); r.maxZ = Math.max(r.maxZ, pos[i + 2]); }
  return r; };
for (const b of bodies) {
  if (!b.tris.length) continue;
  // build indexed body mesh keyed by (v, vn)
  const map = new Map(), pos = [], nrm = [], colr = [], idx = [];
  for (const [v, n] of b.tris) {
    const k = v * 1e6 + n;
    let j = map.get(k);
    if (j === undefined) { j = pos.length / 3; map.set(k, j); pos.push(...tx(v)); nrm.push(...tn(n)); colr.push(COL[v]); }
    idx.push(j);
  }
  // Faces are rendered single-sided (thin slabs are only ~1 mm thick, so drawing back faces lets the
  // grey underside bleed through the top). Make every triangle's winding agree with its OBJ normal.
  for (let t = 0; t < idx.length; t += 3) {
    const a = 3 * idx[t], b2 = 3 * idx[t + 1], c = 3 * idx[t + 2];
    const ux = pos[b2] - pos[a], uy = pos[b2 + 1] - pos[a + 1], uz = pos[b2 + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
    const nx = nrm[a] + nrm[b2] + nrm[c], ny = nrm[a + 1] + nrm[b2 + 1] + nrm[c + 1], nz = nrm[a + 2] + nrm[b2 + 2] + nrm[c + 2];
    if (gx * nx + gy * ny + gz * nz < 0) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; flipped++; }
  }
  const lum = colr[0].split(',').map(Number).reduce((a, c) => a + c, 0) / 3;
  const info = { name: b.name, pos, idx, dark: lum < 0.4, ...bbox(pos) };
  if (DROP.test(b.name)) continue;
  if (REBUILD.test(b.name)) { removed.push(info); continue; }
  if (REBUILD_SOLID.test(b.name)) { solids.push(info); continue; }
  kept.push(info);
  let I = Uint32Array.from(idx);
  trisIn += I.length / 3;
  if (I.length / 3 > 1500 && Math.hypot(info.maxX - info.minX, info.maxY - info.minY, info.maxZ - info.minZ) < 0.6) {
    // weld by position only for the simplifier, then simplify to ~1mm error
    const F = Float32Array.from(pos);
    const [simp] = MeshoptSimplifier.simplify(I, F, 3, Math.max(300, (I.length / 3 * 0.05) | 0) * 3, 0.001, ['ErrorAbsolute']);
    I = simp;
  }
  trisOut += I.length / 3;
  // Zero-thickness floor patches (paving, rugs, tiles) are coplanar with the slab under them and
  // z-fight. Lift each flat body a few mm, smaller patches higher, so the detail sits on top.
  let ymin = Infinity, ymax = -Infinity;
  for (let i = 1; i < pos.length; i += 3) { ymin = Math.min(ymin, pos[i]); ymax = Math.max(ymax, pos[i]); }
  if (ymax - ymin < 0.02) {
    let area = 0;
    for (let t = 0; t < I.length; t += 3) {
      const a = 3 * I[t], b = 3 * I[t + 1], c = 3 * I[t + 2];
      const ux = pos[b] - pos[a], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vz = pos[c + 2] - pos[a + 2];
      area += Math.abs(ux * vz - uz * vx) / 2;
    }
    const lift = 0.004 + 0.012 / (1 + area / 10);
    for (let i = 1; i < pos.length; i += 3) pos[i] += lift;
  }
  const group = DOOR_L.has(b.name) ? 'doorL' : DOOR_R.has(b.name) ? 'doorR' : 'static';
  const clipHere = CLIP_RECTS.filter((r) => info.maxX > r[0] && info.minX < r[1] && info.maxZ > r[2] && info.minZ < r[3]);
  for (let t = 0; t < I.length; t += 3) {
    const color = colr[I[t]];
    const bk = bucket(`${group}|${color}`, color);
    const V3 = [0, 1, 2].map((q) => { const j = I[t + q]; return [pos[3 * j], pos[3 * j + 1], pos[3 * j + 2], nrm[3 * j], nrm[3 * j + 1], nrm[3 * j + 2]]; });
    for (const poly of clipHere.length ? subtractRectsFromPoly(V3, clipHere) : [V3]) {
      for (let k = 1; k + 1 < poly.length; k++) for (const v of [poly[0], poly[k], poly[k + 1]]) { bk.pos.push(v[0], v[1], v[2]); bk.nrm.push(v[3], v[4], v[5]); }
    }
  }
}
console.log(`triangles ${trisIn} -> ${trisOut}, winding fixed on ${flipped}`);

// polygon (array of [x,y,z,nx,ny,nz]) minus axis-aligned xz rectangles -> list of convex polygons
function clipHalf(poly, axis, value, keepLess) {
  const out = [], k = axis === 'x' ? 0 : 2, inside = (v) => (keepLess ? v[k] <= value : v[k] >= value);
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], ia = inside(a), ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) { const t = (value - a[k]) / (b[k] - a[k]); out.push(a.map((x, j) => x + (b[j] - x) * t)); }
  }
  return out.length >= 3 ? out : null;
}
function subtractRectsFromPoly(poly, rects) {
  let pieces = [poly];
  for (const [x0, x1, z0, z1] of rects) {
    const next = [];
    for (const p of pieces) {
      const xs = p.map((v) => v[0]), zs = p.map((v) => v[2]);
      if (Math.max(...xs) <= x0 || Math.min(...xs) >= x1 || Math.max(...zs) <= z0 || Math.min(...zs) >= z1) { next.push(p); continue; }
      const A = clipHalf(p, 'x', x0, true), B = clipHalf(p, 'x', x1, false);
      let M = clipHalf(p, 'x', x0, false); M = M && clipHalf(M, 'x', x1, true);
      const C = M && clipHalf(M, 'z', z0, true), D = M && clipHalf(M, 'z', z1, false);
      for (const q of [A, B, C, D]) if (q) next.push(q);
    }
    pieces = next;
  }
  return pieces;
}

// ---------- generated interior / missing exterior ----------
const corner = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
function addQuad(col, a, b, c, d, n) {
  const bk = bucket(`static|${col}`, col);
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const flip = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2] < 0;
  const tri = flip ? [a, c, b, a, d, c] : [a, b, c, a, c, d];
  for (const p of tri) { bk.pos.push(p[0], p[1], p[2]); bk.nrm.push(n[0], n[1], n[2]); }
}
function addBox(x0, x1, y0, y1, z0, z1, col) {
  if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4 || z1 - z0 < 1e-4) return;
  addQuad(col, [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]);
  addQuad(col, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);
  addQuad(col, [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0]);
  addQuad(col, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
  addQuad(col, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
  addQuad(col, [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [0, 0, -1]);
}
// a box beam between two points (handrails): w = horizontal width, h = vertical height
function addBeam(a, b, w, h, col) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  let sx = -d[2], sz = d[0]; const sl = Math.hypot(sx, sz) || 1; sx *= w / 2 / sl; sz *= w / 2 / sl;
  const P = (p, ss, uu) => [p[0] + ss * sx, p[1] + uu * h / 2, p[2] + ss * sz];
  const c = [P(a, -1, -1), P(a, 1, -1), P(a, 1, 1), P(a, -1, 1), P(b, -1, -1), P(b, 1, -1), P(b, 1, 1), P(b, -1, 1)];
  const faces = [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [3, 2, 6, 7], [0, 3, 7, 4], [1, 5, 6, 2]];
  const ctr = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  for (const f of faces) {
    const q = f.map((i) => c[i]);
    const fc = [0, 1, 2].map((k) => (q[0][k] + q[1][k] + q[2][k] + q[3][k]) / 4);
    const u = [q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]], v = [q[3][0] - q[0][0], q[3][1] - q[0][1], q[3][2] - q[0][2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const out = [fc[0] - ctr[0], fc[1] - ctr[1], fc[2] - ctr[2]];
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) n = n.map((x) => -x);
    const nl = Math.hypot(...n) || 1; n = n.map((x) => x / nl);
    addQuad(col, q[0], q[1], q[2], q[3], n);
  }
}
// cylinder along an axis ('x'|'y'|'z') centred at c
function addCyl(c, r, len, axis, col, seg = 14) {
  const P = (ang, t) => { const a = Math.cos(ang) * r, b = Math.sin(ang) * r, h = t * len / 2;
    return axis === 'y' ? [c[0] + a, c[1] + h, c[2] + b] : axis === 'x' ? [c[0] + h, c[1] + a, c[2] + b] : [c[0] + a, c[1] + b, c[2] + h]; };
  const N = (ang) => { const a = Math.cos(ang), b = Math.sin(ang); return axis === 'y' ? [a, 0, b] : axis === 'x' ? [0, a, b] : [a, b, 0]; };
  const ax = axis === 'y' ? [0, 1, 0] : axis === 'x' ? [1, 0, 0] : [0, 0, 1];
  const top = [c[0] + ax[0] * len / 2, c[1] + ax[1] * len / 2, c[2] + ax[2] * len / 2], bot = [c[0] - ax[0] * len / 2, c[1] - ax[1] * len / 2, c[2] - ax[2] * len / 2];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2, am = (a0 + a1) / 2;
    addQuad(col, P(a0, -1), P(a1, -1), P(a1, 1), P(a0, 1), N(am));
    addQuad(col, top, P(a0, 1), P(a1, 1), top, ax);
    addQuad(col, bot, P(a1, -1), P(a0, -1), bot, ax.map((v) => -v));
  }
}
const { stats, doors } = buildInterior({ removed, solids, kept, addBox, addQuad, addBeam, addCyl });
console.log('interior:', stats);
fs.writeFileSync(outPath.replace(/[^/]*$/, 'doors.json'), JSON.stringify(doors));

// ---------- write glTF ----------
const doc = new Document();
const buf = doc.createBuffer();
const scene = doc.createScene('building');
const mats = new Map();
const matFor = (color) => {
  if (!mats.has(color)) {
    const [r, g, b] = color.split(',').map(Number);
    // sRGB vertex colours -> linear base colour
    const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const glass = color === '0.780,0.851,0.878';
    const m = doc.createMaterial(`c_${color}`).setBaseColorFactor([lin(r), lin(g), lin(b), glass ? 0.22 : 1]).setRoughnessFactor(glass ? 0.1 : 0.85).setMetallicFactor(0).setDoubleSided(glass);
    if (glass) m.setAlphaMode('BLEND');
    mats.set(color, m);
  }
  return mats.get(color);
};
const groupNodes = {};
for (const g of ['static', 'doorL', 'doorR']) {
  const node = doc.createNode(g); const mesh = doc.createMesh(g); node.setMesh(mesh); scene.addChild(node); groupNodes[g] = mesh;
}
for (const [key, bk] of buckets) {
  const g = key.split('|')[0];
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(bk.pos)).setBuffer(buf))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(bk.nrm)).setBuffer(buf))
    .setMaterial(matFor(bk.color));
  groupNodes[g].addPrimitive(prim);
}
scene.listChildren().forEach((n) => { if (!n.getMesh().listPrimitives().length) n.dispose(); });

await MeshoptEncoder.ready;
// No meshopt/quantize: both snap positions to a grid that flattens the 1 mm floor slabs.
await doc.transform(weld(), dedup(), prune());
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
fs.mkdirSync(outPath.replace(/\/[^/]*$/, ''), { recursive: true });
await io.write(outPath, doc);
console.log(`wrote ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(0)} KB)`);
