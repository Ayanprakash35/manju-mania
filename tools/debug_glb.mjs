// Debug export: one mesh per OBJ body (names kept), same transform as convert.mjs, no merging.
//   node tools/debug_glb.mjs <input.obj> public/debug.glb
import fs from 'node:fs';
import { Document, NodeIO } from '@gltf-transform/core';
const UNIT = 1 / 2.54, GROUND_Z = 1.99344, CX = -3.88, CZ = 11.75;
const [, , inPath, outPath] = process.argv;
const P = [], COL = []; const bodies = []; let cur;
for (const line of fs.readFileSync(inPath, 'utf8').split('\n')) {
  if (line.startsWith('v ')) { const p = line.trim().split(/\s+/); P.push(+p[1], +p[2], +p[3]); COL.push([+p[4], +p[5], +p[6]]); }
  else if (line.startsWith('f ')) { const t = line.trim().split(/\s+/).slice(1).map(s => s.split('/')[0] - 1); for (let k = 1; k < t.length - 1; k++) cur.t.push(t[0], t[k], t[k + 1]); }
  else if (line.startsWith('g ')) { cur = { name: line.slice(2).trim(), t: [] }; bodies.push(cur); }
}
const doc = new Document(); const buf = doc.createBuffer(); const scene = doc.createScene();
const mats = new Map();
for (const b of bodies) {
  const pos = new Float32Array(b.t.length * 3);
  b.t.forEach((v, i) => { pos[3*i] = P[3*v]*UNIT - CX; pos[3*i+1] = (P[3*v+2]-GROUND_Z)*UNIT; pos[3*i+2] = -P[3*v+1]*UNIT - CZ; });
  const c = COL[b.t[0]]; const key = c.join();
  if (!mats.has(key)) mats.set(key, doc.createMaterial().setBaseColorFactor([...c.map(x => x ** 2.2), 1]).setDoubleSided(true));
  const prim = doc.createPrimitive().setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(pos).setBuffer(buf)).setMaterial(mats.get(key));
  scene.addChild(doc.createNode(b.name).setMesh(doc.createMesh(b.name).addPrimitive(prim)));
}
await new NodeIO().write(outPath, doc);
console.log('wrote', outPath, bodies.length, 'bodies');
