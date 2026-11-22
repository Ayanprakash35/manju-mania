// Door leaves for every doorway the generator made (public/doors.json).
// White flush doors with a small vision panel and lever (video), wood-framed glass doors on the stairwells,
// double doors at the street entrances. E toggles the door you're looking at; a door swings away from you.
// Closed doors are solid: the player is pushed out of their (axis-aligned) boxes after the BVH collision.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const T = 0.045;              // leaf thickness
const SPEED = 3.0;            // open/close speed (1/s)

// Each door is ONE mesh (parts merged, colours in vertex colours) so ~200 doors cost ~200 draw calls, not ~800.
const C = { white: [0.95, 0.94, 0.92], dark: [0.16, 0.14, 0.13], wood: [0.35, 0.23, 0.15], metal: [0.6, 0.6, 0.6] };
const leafMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const glassMat = new THREE.MeshLambertMaterial({ color: 0x9fb4bf, transparent: true, opacity: 0.3 });
function part(w, h, d, col, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const c = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < c.length; i += 3) c.set(col, i);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.deleteAttribute('uv');
  return g;
}
function mergeParts(parts) { return mergeGeometries(parts, false); }

function makeLeaf(kind, w, h) {
  // leaf built along +x from its hinge at x = 0, centred on z = 0
  const g = new THREE.Group();
  const parts = [];
  if (kind === 'glass') {
    const f = 0.08;
    parts.push(part(f, h, T, C.wood, f / 2, h / 2, 0), part(f, h, T, C.wood, w - f / 2, h / 2, 0));
    parts.push(part(w, f, T, C.wood, w / 2, h - f / 2, 0), part(w, 0.2, T, C.wood, w / 2, 0.1, 0));
    parts.push(part(0.03, 0.3, 0.06, C.metal, w - 0.12, 1.0, 0));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(w - 2 * f, h - f - 0.2, 0.01).translate(w / 2, 0.2 + (h - f - 0.2) / 2, 0), glassMat));
  } else if (kind === 'main') {
    parts.push(part(w, h, T, C.wood, w / 2, h / 2, 0), part(0.03, 0.4, 0.08, C.metal, w - 0.1, 1.05, 0));
  } else {
    parts.push(part(w, h, T, C.white, w / 2, h / 2, 0));
    parts.push(part(0.12, 0.45, T + 0.006, C.dark, w / 2, 1.45, 0));      // vision panel
    parts.push(part(0.13, 0.025, 0.07, C.metal, w - 0.14, 1.0, 0));       // lever
    parts.push(part(0.05, 0.12, T + 0.01, C.metal, w - 0.1, 1.0, 0));
  }
  g.add(new THREE.Mesh(mergeParts(parts), leafMat));
  return g;
}

export class Doors {
  constructor(scene) { this.scene = scene; this.list = []; this.meshes = []; }

  async load(url) {
    const recs = await (await fetch(url + '?v=' + Date.now())).json();
    for (const r of recs) {
      const leaves = r.double ? [[-1, r.w / 2], [1, r.w / 2]] : [[-1, r.w]];
      for (const [side, lw] of leaves) {
        // hinge at one end of the opening; for doubles, one leaf per end
        const lw2 = lw - 0.01;
        const hu = side < 0 ? -r.w / 2 + 0.005 : r.w / 2 - 0.005;
        const hinge = r.axis === 'x' ? new THREE.Vector3(r.x + hu, r.y, r.z) : new THREE.Vector3(r.x, r.y, r.z + hu);
        const pivot = new THREE.Group();
        pivot.position.copy(hinge);
        // base yaw: leaf runs along the wall from the hinge toward the opening's centre
        const dirToCentre = side < 0 ? 1 : -1;
        const base = r.axis === 'x' ? (dirToCentre > 0 ? 0 : Math.PI) : (dirToCentre > 0 ? -Math.PI / 2 : Math.PI / 2);
        pivot.rotation.y = base;
        const leaf = makeLeaf(r.kind, lw2, r.h - 0.01);
        pivot.add(leaf);
        this.scene.add(pivot);
        const d = { r, pivot, leaf, base, lw: lw2, open: 0, target: 0, swing: 1, hinge, axis: r.axis, side, group: null };
        leaf.traverse((o) => { if (o.isMesh) { o.userData.door = d; this.meshes.push(o); } });
        this.list.push(d);
      }
    }
    // doubles open together
    for (const d of this.list) if (d.r.double) d.group = this.list.filter((e) => e.r === d.r);
    this.numberPlates(recs);
    this.buildPlates();
    return this.list.length;
  }

  // small number plaques above the doors, on the corridor side (video: dark numbers on a white plate).
  // Ground floor 1.., first 101.., second 201..; numbered clockwise round the building from the north.
  numberPlates(recs) {
    const cx = -3, cz = 4.25;
    const floors = [...new Set(recs.map((r) => r.y))].sort((a, b) => a - b);
    const ang = (r) => (Math.atan2(r.x - cx, -(r.z - cz)) + Math.PI * 2) % (Math.PI * 2);
    floors.forEach((y, fi) => {
      for (const r of recs) if (r.y === y && r.into && r.label) this.plate(r, r.label);          // named rooms (bathroom, office, ...)
      const rooms = recs.filter((r) => r.y === y && r.into && r.kind === 'room' && !r.label).sort((a, b) => ang(a) - ang(b));
      rooms.forEach((r, i) => this.plate(r, String(fi * 100 + i + 1)));
      recs.filter((r) => r.y === y && r.into && r.kind === 'glass').forEach((r) => this.plate(r, 'STAIRS'));
    });
  }

  plate(r, text) { (this._plates ||= []).push({ r, text }); }

  // all number plaques share one atlas texture and one mesh (192 plaques = 1 draw call)
  buildPlates() {
    const P = this._plates || []; if (!P.length) return;
    const CW = 256, CH = 64, cols = 8, rows = Math.ceil(P.length / cols);   // numbers use the left half of a cell, names the whole cell
    const cv = document.createElement('canvas'); cv.width = CW * cols; cv.height = CH * rows;
    const g = cv.getContext('2d');
    const pos = [], uv = [], nrm = [], idx = [];
    P.forEach(({ r, text }, i) => {
      const ox = (i % cols) * CW, oy = Math.floor(i / cols) * CH;
      const long = text.length > 5, cw = long ? CW : CW / 2;
      g.fillStyle = '#f4f2ec'; g.fillRect(ox, oy, cw, CH);
      g.strokeStyle = '#2a2420'; g.lineWidth = 4; g.strokeRect(ox + 2, oy + 2, cw - 4, CH - 4);
      g.fillStyle = '#1c1a18'; let px = long ? 30 : 40;
      g.font = `bold ${px}px Helvetica, Arial, sans-serif`;
      while (g.measureText(text).width > cw - 16 && px > 12) { px -= 1; g.font = `bold ${px}px Helvetica, Arial, sans-serif`; }
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, ox + cw / 2, oy + CH / 2 + 2);
      const w = long ? 0.42 : 0.2, h = 0.1, out = -r.into, y = r.y + r.h + 0.18;
      // corners in the wall plane, facing the corridor
      const t = r.axis === 'x' ? [out > 0 ? 1 : -1, 0] : [0, out > 0 ? -1 : 1];      // "right" direction seen from the corridor
      const cx = r.axis === 'x' ? r.x : r.x + out * 0.022, cz = r.axis === 'x' ? r.z + out * 0.022 : r.z;
      const n = r.axis === 'x' ? [0, 0, out] : [out, 0, 0];
      const base = pos.length / 3;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        pos.push(cx + t[0] * sx * w / 2, y + sy * h / 2, cz + t[1] * sx * w / 2); nrm.push(...n);
        uv.push((ox + (sx > 0 ? cw : 0)) / cv.width, 1 - (oy + (sy > 0 ? 0 : CH)) / cv.height);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    this.scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex })));
  }

  // door under the crosshair within reach; a nearer wall blocks the pick
  pick(camera, reach = 2.6) {
    this._rc ||= new THREE.Raycaster();
    this._rc.setFromCamera(new THREE.Vector2(0, 0), camera);
    this._rc.far = reach;
    const h = this._rc.intersectObjects(this.meshes, false)[0];
    if (!h) return null;
    if (this.occluder) {
      const o = this._rc.intersectObject(this.occluder, false)[0];
      if (o && o.distance < h.distance - 0.02) return null;
    }
    return h.object.userData.door;
  }

  toggle(d, from) {
    const ds = d.group || [d];
    const opening = d.target === 0;
    for (const e of ds) {
      if (opening) {
        // swing away from the player: which side of the wall are they on?
        const dirAt = (s) => { const a = e.base + s * Math.PI / 2; return [Math.cos(a), -Math.sin(a)]; };
        const [dx, dz] = dirAt(1);
        if (e.r.into) {
          // swing into the room
          const nx = e.axis === 'z' ? e.r.into : 0, nz = e.axis === 'x' ? e.r.into : 0;
          e.swing = dx * nx + dz * nz > 0 ? 1 : -1;
        } else {
          // swing away from the player
          const px = from.x - e.r.x, pz = from.z - e.r.z;
          e.swing = dx * px + dz * pz < 0 ? 1 : -1;
        }
      }
      e.target = opening ? 1 : 0; e.speed = 0;
    }
  }

  update(dt) {
    for (const d of this.list) {
      if (d.open === d.target) continue;
      d.open += Math.sign(d.target - d.open) * Math.min(Math.abs(d.target - d.open), dt * (d.speed || SPEED));
      d.pivot.rotation.y = d.base + d.swing * d.open * Math.PI * 0.5;
    }
  }

  // push a vertical capsule (centre x,z, feet y0..head y1, radius) out of door leaves. Returns true if moved.
  collide(pos, y0, y1, radius) {
    let moved = false;
    for (const d of this.list) {
      const r = d.r;
      if (y1 < r.y || y0 > r.y + r.h) continue;
      if (Math.abs(pos.x - r.x) > 3 || Math.abs(pos.z - r.z) > 3) continue;
      // leaf as a segment from the hinge along its current direction
      const a = d.pivot.rotation.y;
      const dx = Math.cos(a), dz = -Math.sin(a);
      const ax = d.hinge.x, az = d.hinge.z, bx = ax + dx * d.lw, bz = az + dz * d.lw;
      const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz;
      let t = ((pos.x - ax) * vx + (pos.z - az) * vz) / L2; t = Math.max(0, Math.min(1, t));
      const cx = ax + vx * t, cz = az + vz * t;
      let ox = pos.x - cx, oz = pos.z - cz;
      const dist = Math.hypot(ox, oz), min = radius + T / 2;
      if (dist < min) {
        if (dist < 1e-4) { ox = -vz; oz = vx; }
        const k = (min - dist) / (Math.hypot(ox, oz) || 1);
        pos.x += ox * k; pos.z += oz * k; moved = true;
      }
    }
    return moved;
  }
}
