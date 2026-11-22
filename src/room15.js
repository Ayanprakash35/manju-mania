// Room 15 — the spawn room and safe room (owner's video IMG_2567; also the opening seconds of IMG_2565).
// East wing, outer side, by the south-east light well. Built at runtime so it can carry textures (bedsheets, rugs,
// snack packets) and edible food; the generator (tools/interior.mjs ROOM15) only places its walls, window and door.
//
// Layout from the video, standing inside facing the door wall (west): the door is in the north (right) corner with a
// fanlight above it; along the door wall from the south: a grey steel almirah with dark-teal doors standing open (a
// Yonex kit bag on one door, a pink striped towel on the other), two light-blue laundry baskets with a black guitar
// case between them, two jackets on wall hooks, a closed dark-teal almirah (a carton, bubble wrap and a blue cloth on
// top, a beige trellis doormat in front), then the door. North wall: a small white-framed mirror by the door, then bed 1
// (floral sheet, a Lotte Choco Pie box, an orange, a laptop, heaped grey/teal blankets) with its head at the mint window
// wall. Window wall: two teak study desks with hutches between the bed heads (books, Woody and Spider-Man figures,
// lamps, bottles, baskets and bowls on top, a Lay's packet), black visitor chairs, grey satin curtains, mosquito mesh.
// South wall: bed 2 (white geometric-print sheet, grey blanket, maroon cloth), a wall fan above it, a switchboard with a
// red socket by the almirah. Floor: white tiles, grey skirting, a long runner, a grey mat, sliders and sandals, a
// backpack, a badminton kit bag. A tube light on the ceiling, always on.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// interior faces (metres, game coords) — must match tools/interior.mjs: corridor wall 25.30 (+0.15 on the room side),
// outer wall inner face 28.58, partitions at z 17.11 / 20.81 (0.12 thick), ground floor 0.766, ceiling 3.83
export const ROOM15 = { x0: 25.45, x1: 28.58, z0: 17.17, z1: 20.75, y0: 0.766, y1: 3.83, doorZ: 17.771, doorW: 0.95, doorH: 2.15,
  win: { z: 18.96, w: 1.4, sill: 1.66, h: 1.4 } };
// the safe area (feet inside this box): the whole room, ground floor
export const SAFE15 = { x0: 25.3, x1: 28.6, z0: 17.11, z1: 20.81, y0: 0.3, y1: 3.0 };
export const inSafe15 = (x, y, z) => x > SAFE15.x0 && x < SAFE15.x1 && z > SAFE15.z0 && z < SAFE15.z1 && y > SAFE15.y0 && y < SAFE15.y1;

const R = ROOM15;
const rand = (() => { let s = 15; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();

function canvasTex(w, h, draw, repeat = [1, 1]) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat);
  return t;
}
const blobs = (g, n, w, h, cols, rMin, rMax) => { for (let i = 0; i < n; i++) { g.fillStyle = cols[i % cols.length]; g.beginPath(); g.ellipse(rand() * w, rand() * h, rMin + rand() * (rMax - rMin), rMin + rand() * (rMax - rMin), rand() * 3, 0, 7); g.fill(); } };

const TEX = {
  tiles: () => canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#eeebe4'; g.fillRect(0, 0, w, h); g.fillStyle = '#c9c4ba'; g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h); g.fillRect(0, h / 2, w, 2); g.fillRect(w / 2, 0, 2, h); }),
  floral: () => canvasTex(256, 256, (g, w, h) => {      // cream sheet, pink/rose and sage florals, striped border
    g.fillStyle = '#efe7da'; g.fillRect(0, 0, w, h);
    blobs(g, 70, w, h, ['#d9a3a0', '#c98a8f', '#a9b89a', '#e4c4b8', '#b8c9b0'], 5, 16);
    blobs(g, 40, w, h, ['#b8676f', '#8fa27e'], 2, 6);
    for (let y = 0; y < 22; y += 4) { g.fillStyle = y % 8 ? '#d8b9b4' : '#c47b80'; g.fillRect(0, h - 26 + y, w, 2); }
  }),
  geometric: () => canvasTex(256, 256, (g, w, h) => {   // white sheet with grey, orange, green, teal, red shapes
    g.fillStyle = '#f4f2ee'; g.fillRect(0, 0, w, h);
    const cols = ['#8e9496', '#e0703a', '#5aa36a', '#3c8f8c', '#c94a3c', '#f0c84a', '#3e4446'];
    for (let i = 0; i < 46; i++) { g.fillStyle = cols[i % cols.length]; const x = rand() * w, y = rand() * h, s = 10 + rand() * 18; g.beginPath(); if (i % 3 === 0) g.ellipse(x, y, s, s * 0.7, rand() * 3, 0, 7); else { g.moveTo(x, y); g.lineTo(x + s, y + rand() * s); g.lineTo(x + rand() * s, y + s); g.lineTo(x - s * 0.4, y + s * 0.6); } g.fill(); }
  }),
  runner: () => canvasTex(512, 128, (g, w, h) => {      // wavy blue / grey / beige / brown cells with dark outlines, cream edge (long along u)
    g.fillStyle = '#e4dccb'; g.fillRect(0, 0, w, h);
    const cols = ['#7f9fb8', '#9a9a95', '#c4ad8a', '#8a7a68', '#6f8ea6'];
    for (let x = 10, i = 0; x < w - 10; x += 50, i++) for (let y = 10, j = 0; y < h - 10; y += 54, j++) {
      g.fillStyle = cols[(i * 2 + j) % cols.length]; g.strokeStyle = '#3c4246'; g.lineWidth = 4;
      g.beginPath(); g.ellipse(x + 24, y + 26 + (i % 2) * 6, 23, 26, (i + j) % 2 ? 0.6 : -0.6, 0, 7); g.fill(); g.stroke();
    }
    g.strokeStyle = '#d8ccb2'; g.lineWidth = 10; g.strokeRect(0, 0, w, h);
  }),
  trellis: () => canvasTex(128, 96, (g, w, h) => {      // beige doormat with a brown quatrefoil lattice
    g.fillStyle = '#ece3d3'; g.fillRect(0, 0, w, h); g.strokeStyle = '#9c8268'; g.lineWidth = 7;
    for (let y = -12; y < h + 24; y += 24) for (let x = -16; x < w + 32; x += 32) { g.beginPath(); g.ellipse(x + ((y / 24) % 2 ? 16 : 0), y, 13, 9, 0, 0, 7); g.stroke(); }
  }),
  greyMat: () => canvasTex(96, 64, (g, w, h) => { g.fillStyle = '#7d8288'; g.fillRect(0, 0, w, h); g.strokeStyle = '#9da2a7'; g.lineWidth = 3; g.strokeRect(7, 7, w - 14, h - 14); g.strokeRect(12, 12, w - 24, h - 24); }),
  mesh: () => canvasTex(64, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(70,74,70,0.55)'; g.lineWidth = 1; for (let i = 0; i < w; i += 4) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); } }, [6, 6]),
  chocoBox: () => canvasTex(256, 96, (g, w, h) => {
    g.fillStyle = '#c4161c'; g.fillRect(0, 0, w, h); g.fillStyle = '#7a0b10'; g.fillRect(0, h - 14, w, 14);
    g.fillStyle = '#fff'; g.font = 'bold 18px Arial'; g.fillText('LOTTE', 12, 26); g.font = 'italic bold 38px Georgia'; g.fillText('Choco Pie', 12, 66);
    g.fillStyle = '#5a3420'; g.beginPath(); g.ellipse(212, 48, 30, 22, 0, 0, 7); g.fill(); g.fillStyle = '#e8d7b8'; g.fillRect(184, 46, 56, 5);
  }),
  chocoPack: () => canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#c4161c'; g.fillRect(0, 0, w, h); g.fillStyle = '#5a3420'; g.beginPath(); g.ellipse(64, 74, 38, 28, 0, 0, 7); g.fill();
    g.fillStyle = '#e8d7b8'; g.fillRect(28, 72, 72, 6); g.fillStyle = '#fff'; g.font = 'italic bold 22px Georgia'; g.fillText('Choco Pie', 14, 32);
    g.fillStyle = '#e8a33a'; g.fillRect(0, 0, w, 5); g.fillRect(0, h - 5, w, 5);
  }),
  lays: () => canvasTex(128, 176, (g, w, h) => {        // red packet with the yellow sun logo
    g.fillStyle = '#c8202a'; g.fillRect(0, 0, w, h); g.fillStyle = '#f6efe3'; g.fillRect(10, 100, w - 20, 50);
    g.fillStyle = '#f5c400'; g.beginPath(); g.arc(64, 54, 34, 0, 7); g.fill(); g.fillStyle = '#d0141e'; g.fillRect(18, 44, 92, 24);
    g.fillStyle = '#fff'; g.font = 'bold 22px Arial'; g.fillText("Lay's", 34, 64);
    g.fillStyle = '#e7b04a'; for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(26 + i * 15, 125, 9, 6, i, 0, 7); g.fill(); }
    g.fillStyle = '#8a1016'; g.fillRect(0, 0, w, 8); g.fillRect(0, h - 8, w, 8);
  }),
  books: () => canvasTex(256, 64, (g, w, h) => { let x = 0; const cols = ['#f2f2ee', '#2f6b45', '#e98a2c', '#f2f2ee', '#3d5a8a', '#2f6b45', '#d9d2c2', '#7a2a2a', '#f2f2ee', '#2f6b45']; for (let i = 0; x < w; i++) { const bw = 8 + rand() * 14; g.fillStyle = cols[i % cols.length]; g.fillRect(x, rand() * 10, bw - 1, h); x += bw; } }),
};

export function buildRoom15(scene) {
  const group = new THREE.Group(); group.name = 'room15';
  const parts = new Map();              // colour -> geometries (merged into one mesh per colour)
  const colliders = [];                 // simple boxes the player (and nav) bump into
  const add = (geo, col) => { const k = String(col); if (!parts.has(k)) parts.set(k, []); parts.get(k).push(geo); };
  // box from world min/max
  const B = (x0, x1, y0, y1, z0, z1, col, collide = false) => {
    const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    add(g, col); if (collide) colliders.push([x0, x1, y0, y1, z0, z1]);
  };
  const F = R.y0;                       // floor
  const C = (x, y, z, rT, rB, h, col, seg = 12) => add(new THREE.CylinderGeometry(rT, rB, h, seg).translate(x, y + h / 2, z), col);
  const T = (x0, x1, y0, y1, z0, z1, tex, col = 0xffffff) => {           // textured box (its own mesh)
    const m = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)), new THREE.MeshLambertMaterial({ map: tex, color: col }));
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); group.add(m); return m;
  };

  // ---------------- walls, floor, ceiling ----------------
  const CREAM = 0xf0e6d2, MINT = 0x9fe0cf, SKIRT = 0x8d9196;
  const tiles = TEX.tiles(); tiles.repeat.set((R.x1 - R.x0) / 1.2, (R.z1 - R.z0) / 1.2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(R.x1 - R.x0, R.z1 - R.z0), new THREE.MeshLambertMaterial({ map: tiles }));
  floor.rotation.x = -Math.PI / 2; floor.position.set((R.x0 + R.x1) / 2, F + 0.004, (R.z0 + R.z1) / 2); group.add(floor);
  B(R.x0, R.x1, R.y1 - 0.004, R.y1 - 0.001, R.z0, R.z1, 0xf4f1ea);                                     // ceiling
  const e = 0.012, dz0 = R.doorZ - R.doorW / 2 - 0.08, dz1 = R.doorZ + R.doorW / 2 + 0.08, dTop = F + R.doorH + 0.08;
  // door wall (cream), around the door and its frame
  B(R.x0, R.x0 + e, F, R.y1, dz1, R.z1, CREAM); B(R.x0, R.x0 + e, dTop, R.y1, dz0, dz1, CREAM); B(R.x0, R.x0 + e, F, R.y1, R.z0, dz0, CREAM);
  B(R.x0, R.x1, F, R.y1, R.z0, R.z0 + e, CREAM);                         // north wall
  B(R.x0, R.x1, F, R.y1, R.z1 - e, R.z1, CREAM);                         // south wall
  // window wall (mint) around the window opening
  const w0 = R.win.z - R.win.w / 2, w1 = R.win.z + R.win.w / 2, ws = R.win.sill, wt = R.win.sill + R.win.h;
  B(R.x1 - e, R.x1, F, R.y1, R.z0, w0, MINT); B(R.x1 - e, R.x1, F, R.y1, w1, R.z1, MINT);
  B(R.x1 - e, R.x1, F, ws, w0, w1, MINT); B(R.x1 - e, R.x1, wt, R.y1, w0, w1, MINT);
  // skirting (grey band, video) — stops at the door
  const sk = 0.085, st = 0.012;
  B(R.x0 + e, R.x0 + e + st, F, F + sk, dz1, R.z1, SKIRT); B(R.x0 + e, R.x0 + e + st, F, F + sk, R.z0, dz0, SKIRT);
  B(R.x0, R.x1, F, F + sk, R.z0 + e, R.z0 + e + st, SKIRT); B(R.x0, R.x1, F, F + sk, R.z1 - e - st, R.z1 - e, SKIRT); B(R.x1 - e - st, R.x1 - e, F, F + sk, R.z0, R.z1, SKIRT);
  // fanlight over the door (dark wood frame, frosted glass), inside face
  const fx = R.x0 + e;
  B(fx, fx + 0.03, dTop + 0.02, dTop + 0.48, dz0, dz1, 0x3b2418); B(fx + 0.03, fx + 0.035, dTop + 0.07, dTop + 0.43, dz0 + 0.06, dz1 - 0.06, 0xb9c3c6);
  B(fx + 0.03, fx + 0.05, dTop + 0.07, dTop + 0.43, R.doorZ - 0.015, R.doorZ + 0.015, 0x3b2418);
  // window: white inner frame, mosquito mesh, sill
  B(R.x1 - 0.06, R.x1 - e, ws - 0.05, ws, w0 - 0.06, w1 + 0.06, 0xf2f0ea);
  for (const [z0, z1] of [[w0 - 0.05, w0], [w1, w1 + 0.05], [R.win.z - 0.025, R.win.z + 0.025]]) B(R.x1 - 0.05, R.x1 - e, ws, wt, z0, z1, 0xf2f0ea);
  B(R.x1 - 0.05, R.x1 - e, wt, wt + 0.05, w0 - 0.05, w1 + 0.05, 0xf2f0ea);
  const net = new THREE.Mesh(new THREE.PlaneGeometry(R.win.w, R.win.h), new THREE.MeshLambertMaterial({ map: TEX.mesh(), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  net.rotation.y = -Math.PI / 2; net.position.set(R.x1 + 0.02, ws + R.win.h / 2, R.win.z); group.add(net);

  // ---------------- tube light (always on) ----------------
  const tubeMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1 });
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.2, 8), tubeMat); tube.rotation.x = Math.PI / 2;
  tube.position.set(R.x0 + 1.15, R.y1 - 0.06, (R.z0 + R.z1) / 2); group.add(tube);
  B(R.x0 + 1.12, R.x0 + 1.18, R.y1 - 0.04, R.y1 - 0.004, (R.z0 + R.z1) / 2 - 0.62, (R.z0 + R.z1) / 2 + 0.62, 0xe8e8e4);
  const light = new THREE.PointLight(0xf1f5ff, 3.4, 5.2, 1.3);
  light.position.set(R.x0 + 1.5, R.y1 - 0.35, (R.z0 + R.z1) / 2); group.add(light);

  // ---------------- beds (black metal, head at the window wall) ----------------
  const BLK = 0x16181a;
  const bed = (z0, z1, sheetTex, sheetCol) => {
    const xh = R.x1 - 0.02, xf = xh - 1.95, top = F + 0.42;
    for (const z of [z0 + 0.02, z1 - 0.02]) { B(xh - 0.04, xh, F, F + 0.98, z - 0.02, z + 0.02, BLK); B(xf, xf + 0.04, F, F + 0.78, z - 0.02, z + 0.02, BLK); C(xf + 0.02, F + 0.78, z, 0.03, 0.03, 0.04, BLK, 8); }
    for (const y of [F + 0.62, F + 0.78, F + 0.94]) B(xh - 0.035, xh - 0.005, y, y + 0.025, z0, z1, BLK);          // headboard rails
    for (const y of [F + 0.55, F + 0.7]) B(xf + 0.005, xf + 0.035, y, y + 0.025, z0, z1, BLK);                       // footboard rails
    for (const z of [z0 + 0.2, (z0 + z1) / 2, z1 - 0.2]) B(xf + 0.005, xf + 0.035, F + 0.42, F + 0.72, z - 0.012, z + 0.012, BLK);
    B(xf, xh, top - 0.06, top, z0, z0 + 0.04, BLK); B(xf, xh, top - 0.06, top, z1 - 0.04, z1, BLK);                 // side rails
    B(xf + 0.04, xh - 0.04, top - 0.02, top + 0.11, z0 + 0.03, z1 - 0.03, 0xe8dcc4);                                 // mattress
    T(xf + 0.03, xh - 0.03, top + 0.11, top + 0.125, z0 + 0.01, z1 - 0.01, sheetTex, sheetCol);                       // sheet
    T(xf + 0.03, xf + 0.05, top - 0.05, top + 0.12, z0 + 0.01, z1 - 0.01, sheetTex, sheetCol);                        // sheet hanging over the foot
    colliders.push([xf, xh, F, top + 0.12, z0, z1]);
    return { xh, xf, top: top + 0.125 };
  };
  const b1 = bed(R.z0, R.z0 + 0.92, TEX.floral(), 0xffffff);
  const b2 = bed(R.z1 - 0.92, R.z1, TEX.geometric(), 0xffffff);
  // bed 1: beige woven pillow + white floral pillow at the head, heaped grey blanket and teal cloth at the foot
  B(b1.xh - 0.42, b1.xh - 0.08, b1.top, b1.top + 0.12, R.z0 + 0.12, R.z0 + 0.6, 0xf2ece0);
  B(b1.xh - 0.36, b1.xh - 0.1, b1.top + 0.05, b1.top + 0.2, R.z0 + 0.48, R.z0 + 0.86, 0xf2ece0);
  B(b1.xh - 0.95, b1.xh - 0.62, b1.top, b1.top + 0.1, R.z0 + 0.35, R.z0 + 0.78, 0xcdb48a);
  for (const [a, b, c, d, h] of [[0.04, 0.4, 0.06, 0.4, 0.14], [0.22, 0.58, 0.02, 0.32, 0.1], [0.1, 0.34, 0.3, 0.55, 0.08]]) B(b1.xf + a, b1.xf + b, b1.top, b1.top + h, R.z0 + c, R.z0 + d, 0xc9cbcc);   // crumpled grey blanket
  for (const [a, b, c, d, h] of [[0.3, 0.62, 0.42, 0.86, 0.07], [0.14, 0.4, 0.55, 0.82, 0.05]]) B(b1.xf + a, b1.xf + b, b1.top + 0.01, b1.top + h, R.z0 + c, R.z0 + d, 0x1d6a80);                // teal cloth
  B(b1.xf - 0.015, b1.xf + 0.02, b1.top - 0.3, b1.top + 0.04, R.z0 + 0.5, R.z0 + 0.74, 0x1d6a80);                  // hanging off the end
  // laptop, an orange and a small black thing on bed 1
  B(b1.xh - 1.05, b1.xh - 0.72, b1.top, b1.top + 0.018, R.z0 + 0.5, R.z0 + 0.84, 0x9a9da0);
  C(b1.xh - 1.22, b1.top, R.z0 + 0.62, 0.04, 0.04, 0.075, 0xf07a14, 10);
  C(b1.xh - 1.05, b1.top, R.z0 + 0.32, 0.035, 0.035, 0.03, 0x111111, 10);
  // bed 2: printed pillow, grey-green blanket and a maroon cloth heaped at the foot end
  B(b2.xh - 0.45, b2.xh - 0.08, b2.top, b2.top + 0.13, R.z1 - 0.82, R.z1 - 0.1, 0xf4f2ee);
  for (const [a, b, c, d, h] of [[0.35, 0.8, 0.5, 0.85, 0.13], [0.55, 0.95, 0.15, 0.55, 0.1], [0.3, 0.6, 0.2, 0.45, 0.07]]) B(b2.xf + a, b2.xf + b, b2.top, b2.top + h, R.z1 - d, R.z1 - c, 0x7c8577);   // grey-green blanket
  for (const [a, b, c, d, h] of [[0.6, 1.0, 0.25, 0.6, 0.16], [0.85, 1.12, 0.35, 0.55, 0.12]]) B(b2.xf + a, b2.xf + b, b2.top + 0.05, b2.top + h, R.z1 - d, R.z1 - c, 0x4a1a24);           // maroon cloth

  // ---------------- desks with hutches, between the bed heads under the window ----------------
  const TEAK = 0xbd6c32, TEAK_D = 0x92502a, PIN = 0x1b4434;
  const dz = [R.z0 + 0.94, R.z1 - 0.94], dw = (dz[1] - dz[0]) / 2;
  const desks = [[dz[0], dz[0] + dw], [dz[0] + dw, dz[1]]];
  const dx0 = R.x1 - 0.56, dTopY = F + 0.75;
  desks.forEach(([z0, z1], i) => {
    B(dx0, R.x1, dTopY - 0.03, dTopY, z0, z1, TEAK);                                   // top
    B(dx0, R.x1, F, dTopY - 0.03, z0, z0 + 0.03, TEAK); B(dx0, R.x1, F, dTopY - 0.03, z1 - 0.03, z1, TEAK);   // side panels
    B(R.x1 - 0.03, R.x1, F + 0.1, dTopY - 0.03, z0 + 0.03, z1 - 0.03, TEAK_D);                       // modesty panel
    // hutch: dark green pinboard back, a cubby shelf, top
    const hx = R.x1 - 0.3, h0 = dTopY, h1 = dTopY + 0.42, h2 = dTopY + 0.82, h3 = dTopY + 0.85;
    B(R.x1 - 0.02, R.x1, h0, h1, z0 + 0.03, z1 - 0.03, PIN);
    B(R.x1 - 0.02, R.x1, h1, h3, z0, z1, TEAK_D);
    B(hx, R.x1, h0, h3, z0, z0 + 0.025, TEAK); B(hx, R.x1, h0, h3, z1 - 0.025, z1, TEAK);
    B(hx, R.x1, h1 - 0.02, h1, z0, z1, TEAK); B(hx, R.x1, h2 - 0.02, h3, z0, z1, TEAK);
    B(hx, R.x1, h1, h2 - 0.02, (z0 + z1) / 2 - 0.01, (z0 + z1) / 2 + 0.01, TEAK);                    // cubby divider
    colliders.push([dx0, R.x1, F, h3, z0, z1]);
    // books in the cubbies (textured spines)
    T(hx + 0.04, hx + 0.26, h1, h1 + 0.3, z0 + 0.04, (z0 + z1) / 2 - 0.03, TEX.books());
    // chair: black visitor chair facing the desk
    const cx = dx0 - 0.33, cz = (z0 + z1) / 2 + (i ? 0.04 : -0.04);
    B(cx - 0.21, cx + 0.21, F + 0.44, F + 0.5, cz - 0.22, cz + 0.22, 0x1b1c1e);
    B(cx - 0.25, cx - 0.21, F + 0.55, F + 0.92, cz - 0.21, cz + 0.21, 0x1b1c1e);
    for (const [ox, oz] of [[-0.2, -0.2], [-0.2, 0.2], [0.18, -0.2], [0.18, 0.2]]) B(cx + ox - 0.012, cx + ox + 0.012, F, F + 0.45, cz + oz - 0.012, cz + oz + 0.012, 0x2a2c2e);
    B(cx - 0.24, cx - 0.22, F + 0.45, F + 0.92, cz - 0.2, cz - 0.18, 0x2a2c2e); B(cx - 0.24, cx - 0.22, F + 0.45, F + 0.92, cz + 0.18, cz + 0.2, 0x2a2c2e);
    colliders.push([cx - 0.25, cx + 0.22, F, F + 0.5, cz - 0.22, cz + 0.22]);
    // things on the desk and in the hutch
    if (i === 0) {
      C(R.x1 - 0.12, h1, (z0 + z1) / 2 + 0.12, 0.035, 0.035, 0.12, 0xd9b48a, 8);                      // Woody
      C(R.x1 - 0.12, h1, (z0 + z1) / 2 + 0.22, 0.04, 0.04, 0.1, 0xc8202a, 8);                          // Spider-Man
      B(R.x1 - 0.2, R.x1 - 0.1, h1, h1 + 0.03, (z0 + z1) / 2 + 0.3, (z0 + z1) / 2 + 0.38, 0xf2f2ee);   // desk lamp
      B(R.x1 - 0.16, R.x1 - 0.14, h1 + 0.03, h1 + 0.28, (z0 + z1) / 2 + 0.33, (z0 + z1) / 2 + 0.35, 0xf2f2ee);
      C(R.x1 - 0.15, dTopY, z0 + 0.14, 0.035, 0.035, 0.25, 0x1a1a1a, 10);                              // black bottle
      C(R.x1 - 0.32, dTopY, z0 + 0.2, 0.04, 0.04, 0.09, 0xf2f2ee, 10);                                 // white tub
      B(R.x1 - 0.45, R.x1 - 0.3, dTopY, dTopY + 0.04, z0 + 0.4, z0 + 0.58, 0x6d7275);                  // game controller / charger
      B(R.x1 - 0.32, R.x1 - 0.28, h3, h3 + 0.15, z0 + 0.06, z0 + 0.32, 0x8796a2);                      // grey basket on top
      B(R.x1 - 0.3, R.x1 - 0.05, h3, h3 + 0.13, z0 + 0.36, z0 + 0.62, 0x3f8e93);                       // teal basket
    } else {
      C(R.x1 - 0.18, dTopY, z0 + 0.5, 0.045, 0.04, 0.3, 0x31b5b0, 12);                                 // teal water bottle
      C(R.x1 - 0.2, dTopY, z0 + 0.22, 0.07, 0.07, 0.17, 0xeef0ea, 12);                                 // protein jar
      C(R.x1 - 0.1, dTopY, z0 + 0.65, 0.03, 0.03, 0.18, 0xf4f4f0, 10);                                 // lotion pump bottle
      B(R.x1 - 0.48, R.x1 - 0.18, dTopY, dTopY + 0.015, z0 + 0.12, z0 + 0.45, 0x9a9da0);               // closed laptop
      B(R.x1 - 0.26, R.x1 - 0.06, h1, h1 + 0.12, z0 + 0.05, z0 + 0.3, 0x8a7a6a);                       // woven basket in the cubby
      C(R.x1 - 0.15, h3, z0 + 0.2, 0.1, 0.07, 0.08, 0xf2c21a, 12);                                     // yellow bowl on top
      C(R.x1 - 0.15, h3, z0 + 0.45, 0.1, 0.075, 0.08, 0x8d8f8c, 12);                                   // grey bowl
      B(R.x1 - 0.12, R.x1 - 0.06, h3, h3 + 0.14, z1 - 0.3, z1 - 0.1, 0xf4f4f0);                        // desk calendar
    }
  });

  // curtains: grey satin, pleated, on a white rod over the window
  const rodY = R.y1 - 0.42;
  B(R.x1 - 0.1, R.x1 - 0.08, rodY, rodY + 0.025, w0 - 0.5, w1 + 0.5, 0xeee6e6);
  for (const [z0, z1] of [[w0 - 0.45, w0 + 0.3], [w1 - 0.15, w1 + 0.45]]) {
    const n = 7, pw = (z1 - z0) / n;
    for (let k = 0; k < n; k++) B(R.x1 - 0.13 - (k % 2) * 0.03, R.x1 - 0.1 - (k % 2) * 0.03, dTopY + 0.9, rodY, z0 + k * pw, z0 + (k + 1) * pw + 0.01, k % 2 ? 0x7d878d : 0x95a0a5);
  }

  // switchboards: above each bed head on the mint wall, by the almirah on the south wall (red socket), high on the door wall
  B(R.x1 - 0.012, R.x1 - e, F + 1.05, F + 1.17, R.z0 + 0.3, R.z0 + 0.52, 0xf4f4f0);
  B(R.x1 - 0.012, R.x1 - e, F + 1.05, F + 1.17, R.z1 - 0.52, R.z1 - 0.3, 0xf4f4f0);
  B(R.x0 + 0.7, R.x0 + 0.92, F + 1.0, F + 1.12, R.z1 - 0.012, R.z1 - e, 0xf4f4f0); C(R.x0 + 0.76, F + 1.02, R.z1 - 0.03, 0.025, 0.025, 0.06, 0xd1202a, 8);
  B(R.x0 + e, R.x0 + 0.012, F + 2.12, F + 2.22, R.z1 - 0.6, R.z1 - 0.48, 0xf4f4f0);
  // wall fan high on the south wall above bed 2
  const fanX = R.x1 - 1.25, fanY = F + 2.3;
  B(fanX - 0.05, fanX + 0.05, fanY - 0.1, fanY + 0.06, R.z1 - 0.06, R.z1 - e, 0xf2f2ee);
  C(fanX, fanY - 0.02, R.z1 - 0.2, 0.06, 0.06, 0.14, 0xf2f2ee, 10);
  add(new THREE.TorusGeometry(0.21, 0.012, 6, 20).translate(fanX, fanY, R.z1 - 0.3), 0xf2f2ee);
  B(fanX - 0.004, fanX + 0.004, fanY - 0.45, fanY - 0.1, R.z1 - 0.06, R.z1 - 0.05, 0xd8d8d0);                        // pull cords
  // mirror: small, white rounded frame, on the north wall by the door
  B(R.x0 + 0.95, R.x0 + 1.4, F + 1.35, F + 1.95, R.z0 + e, R.z0 + 0.03, 0xf4f4f2);
  B(R.x0 + 0.99, R.x0 + 1.36, F + 1.39, F + 1.91, R.z0 + 0.03, R.z0 + 0.034, 0x9fb1bd);

  // ---------------- almirahs on the door wall ----------------
  const ALM = 0x113a4c, GREY = 0xc9cccd, IN = 0xd9dbd8;
  const aD = 0.5, aH = 1.92;
  // closed one, next to the door: dark-teal doors, grey plinth, silver handle and locks; carton + bubble wrap on top
  const ca0 = dz1 + 0.06, ca1 = ca0 + 0.88;
  B(R.x0, R.x0 + aD, F + 0.08, F + aH, ca0, ca1, ALM, true); B(R.x0, R.x0 + aD, F, F + 0.08, ca0, ca1, GREY);
  B(R.x0 + aD, R.x0 + aD + 0.004, F + 0.12, F + aH - 0.04, (ca0 + ca1) / 2 - 0.003, (ca0 + ca1) / 2 + 0.003, 0x0a2230);
  B(R.x0 + aD, R.x0 + aD + 0.03, F + 0.85, F + 1.05, (ca0 + ca1) / 2 - 0.06, (ca0 + ca1) / 2 - 0.02, 0xbfc3c4);
  for (const dzz of [-0.06, 0.02]) B(R.x0 + aD, R.x0 + aD + 0.02, F + 1.12, F + 1.16, (ca0 + ca1) / 2 + dzz, (ca0 + ca1) / 2 + dzz + 0.04, 0xd0a040);
  B(R.x0 + 0.04, R.x0 + 0.42, F + aH, F + aH + 0.26, ca0 + 0.3, ca1 - 0.04, 0xb08a5a);                                // carton
  const wrap = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.36, 0.5), new THREE.MeshLambertMaterial({ color: 0xe8ecef, transparent: true, opacity: 0.75 }));
  wrap.position.set(R.x0 + 0.26, F + aH + 0.3, ca0 + 0.4); wrap.rotation.y = 0.3; group.add(wrap);                   // bubble wrap bundle
  B(R.x0 + 0.05, R.x0 + 0.45, F + aH, F + aH + 0.04, ca0 + 0.02, ca0 + 0.3, 0x2f6fb2);                              // blue cloth
  // open one, south corner: grey body, shelves of clothes, both dark-teal doors open
  const oa0 = R.z1 - 0.88, oa1 = R.z1 - 0.01;
  B(R.x0, R.x0 + aD, F, F + aH, oa0, oa0 + 0.02, GREY); B(R.x0, R.x0 + aD, F, F + aH, oa1 - 0.02, oa1, GREY);
  B(R.x0, R.x0 + 0.02, F, F + aH, oa0, oa1, GREY); B(R.x0, R.x0 + aD, F + aH - 0.02, F + aH, oa0, oa1, GREY); B(R.x0, R.x0 + aD, F, F + 0.08, oa0, oa1, GREY);
  const om = oa0 + 0.42;
  B(R.x0, R.x0 + aD - 0.02, F + 0.08, F + aH - 0.02, om - 0.01, om + 0.01, IN);
  for (const y of [0.55, 0.95, 1.35, 1.62]) B(R.x0 + 0.02, R.x0 + aD - 0.02, F + y, F + y + 0.015, om, oa1 - 0.02, IN);   // cubby shelves (right)
  B(R.x0 + 0.02, R.x0 + aD - 0.02, F + 1.5, F + 1.515, oa0 + 0.02, om, IN);                                              // hat shelf (left)
  B(R.x0 + 0.03, R.x0 + 0.03 + 0.012, F + 1.45, F + 1.46, oa0 + 0.04, om - 0.03, 0x9a9c9e);                              // hanging rail
  const clothCols = [0x2e2a2a, 0x7a5a48, 0xd8d2c8, 0x445566, 0x8a2a2a, 0x2d4a3a, 0x9a9a9a];
  for (const y of [0.08, 0.55, 0.95, 1.35]) for (let k = 0; k < 2; k++) B(R.x0 + 0.06, R.x0 + 0.42, F + y + 0.016 + k * 0.1, F + y + 0.1 + k * 0.1, om + 0.03, oa1 - 0.04, clothCols[(Math.round(y * 10) + k) % clothCols.length]);
  B(R.x0 + 0.06, R.x0 + 0.44, F + 1.515, F + 1.7, oa0 + 0.04, om - 0.03, 0xd8d2c8);
  for (let k = 0; k < 4; k++) B(R.x0 + 0.08, R.x0 + 0.4, F + 0.75, F + 1.42, oa0 + 0.05 + k * 0.085, oa0 + 0.12 + k * 0.085, [0x1f3d2c, 0x2e2a2a, 0x3a4a5a, 0x222222][k]);   // hanging jackets
  B(R.x0 + 0.05, R.x0 + 0.45, F + aH, F + aH + 0.12, oa0 + 0.05, oa1 - 0.05, 0xe2ddd2);                                  // folded clothes on top
  colliders.push([R.x0, R.x0 + aD, F, F + aH, oa0, oa1]);
  // its doors: south one opened flat toward the south wall (Yonex bag hanging on it), north one opened past square (towel)
  B(R.x0 + aD, R.x0 + aD + 0.42, F + 0.06, F + aH - 0.03, oa1 - 0.03, oa1 - 0.01, ALM);
  B(R.x0 + aD + 0.1, R.x0 + aD + 0.33, F + 1.0, F + 1.5, oa1 - 0.17, oa1 - 0.03, 0xc8202a); B(R.x0 + aD + 0.12, R.x0 + aD + 0.31, F + 1.05, F + 1.2, oa1 - 0.18, oa1 - 0.17, 0x1a1a1a);
  const nd = new THREE.BoxGeometry(0.42, aH - 0.09, 0.02).translate(0.21, 0, 0).rotateY(0.35).translate(R.x0 + aD, F + 0.06 + (aH - 0.09) / 2, oa0 + 0.01);
  add(nd, ALM);
  for (const s2 of [-1, 1]) add(new THREE.BoxGeometry(0.3, 0.8, 0.012).rotateY(0.35).translate(R.x0 + aD + 0.3 * Math.cos(0.35) + s2 * 0.012 * Math.sin(0.35), F + aH - 0.43, oa0 + 0.01 - 0.3 * Math.sin(0.35) + s2 * 0.014 * Math.cos(0.35)), 0xe7b8bc);   // pink striped towel over the door
  add(new THREE.BoxGeometry(0.3, 0.03, 0.04).rotateY(0.35).translate(R.x0 + aD + 0.3 * Math.cos(0.35), F + aH - 0.02, oa0 + 0.01 - 0.3 * Math.sin(0.35)), 0xe7b8bc);
  // between them: two light-blue laundry baskets with lids, a black guitar case leaning, jackets on hooks above
  for (const zc of [ca1 + 0.2, oa0 - 0.2]) { C(R.x0 + 0.2, F, zc, 0.17, 0.14, 0.55, 0x7aaee0, 14); C(R.x0 + 0.2, F + 0.55, zc, 0.18, 0.18, 0.04, 0x6a9fd4, 14); }
  const gtr = new THREE.BoxGeometry(0.1, 1.0, 0.34).rotateZ(-0.18).translate(R.x0 + 0.17, F + 0.5, (ca1 + oa0) / 2); add(gtr, 0x111214);
  B(R.x0 + e, R.x0 + 0.03, F + 1.85, F + 1.88, ca1 + 0.04, ca1 + 0.3, 0x9a9a9a);                                          // hooks rail
  B(R.x0 + 0.02, R.x0 + 0.14, F + 1.1, F + 1.85, ca1 + 0.05, ca1 + 0.3, 0x1c1c1e);                                        // black jacket
  B(R.x0 + 0.05, R.x0 + 0.16, F + 1.2, F + 1.82, ca1 + 0.16, ca1 + 0.36, 0x8a8c8e);                                       // grey jacket
  B(R.x0 + 0.13, R.x0 + 0.16, F + 1.35, F + 1.42, ca1 + 0.1, ca1 + 0.28, 0xd8dadc);                                       // reflective band

  // ---------------- floor things ----------------
  T(R.x0 + aD + 0.02, R.x0 + aD + 0.62, F + 0.004, F + 0.016, ca0 + 0.02, ca1 - 0.02, TEX.trellis());                    // doormat
  const runnerZ0 = R.z0 + 0.98;
  T(R.x0 + 1.2, R.x1 - 0.62, F + 0.004, F + 0.014, runnerZ0, runnerZ0 + 0.55, TEX.runner());                               // runner by bed 1
  T(R.x1 - 1.35, R.x1 - 0.8, F + 0.004, F + 0.014, R.z1 - 1.55, R.z1 - 0.97, TEX.greyMat());                               // grey mat by bed 2
  // sliders (beige) and sandals (black/yellow) on the runner by the desk
  for (const [x, z, c] of [[R.x1 - 0.85, runnerZ0 + 0.12, 0xd8cdb8], [R.x1 - 0.85, runnerZ0 + 0.26, 0xd8cdb8], [R.x1 - 1.15, runnerZ0 + 0.2, 0x1a1a1a], [R.x1 - 1.15, runnerZ0 + 0.34, 0x1a1a1a]]) B(x - 0.14, x + 0.14, F + 0.014, F + 0.045, z - 0.05, z + 0.05, c);
  B(R.x1 - 1.2, R.x1 - 1.1, F + 0.045, F + 0.05, runnerZ0 + 0.18, runnerZ0 + 0.38, 0xe0b020);
  // black backpack at bed 2's foot, brown shoes beside it
  B(b2.xf - 0.32, b2.xf - 0.04, F, F + 0.45, R.z1 - 0.55, R.z1 - 0.22, 0x191a1c, true); B(b2.xf - 0.3, b2.xf - 0.06, F + 0.18, F + 0.32, R.z1 - 0.57, R.z1 - 0.55, 0xc8c8c8);
  B(b2.xf - 0.1, b2.xf + 0.15, F, F + 0.09, R.z1 - 0.2, R.z1 - 0.08, 0x4a3426);
  // badminton kit bag (silver, red trim) on the floor in front of the open almirah
  B(R.x0 + 0.56, R.x0 + 1.28, F, F + 0.28, oa0 - 0.36, oa0 - 0.04, 0xd5d8da, true); B(R.x0 + 0.56, R.x0 + 1.28, F + 0.12, F + 0.14, oa0 - 0.365, oa0 - 0.035, 0xc8202a);
  B(R.x0 + 0.75, R.x0 + 1.1, F + 0.28, F + 0.3, oa0 - 0.22, oa0 - 0.18, 0x2a2a2a);

  // merge the plain boxes per colour
  for (const [k, geos] of parts) {
    const m = new THREE.Mesh(mergeGeometries(geos.map((g) => g.index ? g.toNonIndexed() : g), false), new THREE.MeshLambertMaterial({ color: Number(k) }));
    group.add(m);
  }

  // ---------------- food: 2 Choco Pies + 1 Lay's; E eats one, +1 heart ----------------
  const foods = [];
  const food = (mesh, name) => { mesh.userData.food = { name }; foods.push(mesh); group.add(mesh); return mesh; };
  const red = new THREE.MeshLambertMaterial({ color: 0xc4161c }), print = new THREE.MeshLambertMaterial({ map: TEX.chocoBox() });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.06, 0.17), [red, red, print, red, red, red]);   // print on top
  box.userData.noRetro = true;            // retro.apply expects one material per mesh
  box.position.set(b1.xf + 0.75, b1.top + 0.03, R.z0 + 0.3); box.rotation.y = 0.35;
  food(box, 'Choco Pie');                                                                                                    // the red box on bed 1 (video)
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.035, 0.11), new THREE.MeshLambertMaterial({ map: TEX.chocoPack() }));
  pack.position.set(R.x1 - 0.42, F + 0.75 + 0.018, desks[1][0] + 0.62); pack.rotation.y = -0.4;
  food(pack, 'Choco Pie');
  const lays = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 0.2), new THREE.MeshLambertMaterial({ map: TEX.lays() }));
  lays.position.set(R.x1 - 0.33, F + 0.75 + 0.14, desks[0][1] - 0.18); lays.rotation.z = 0.12;
  food(lays, "Lay's");                                                                                                       // the packet on desk 1 (video)

  scene.add(group);
  // collision proxies (world-space boxes), for the player's collider and the nav grid
  const colliderMeshes = colliders.map(([x0, x1, y0, y1, z0, z1]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0)); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); m.updateMatrixWorld(); return m; });
  const reset = () => { for (const f of foods) f.visible = true; };
  return { group, light, foods, colliderMeshes, reset };
}
