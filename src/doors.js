// Door leaves for every doorway the generator made (public/doors.json).
// White flush doors with a small vision panel and lever (video), wood-framed glass doors on the stairwells,
// double doors at the street entrances. E toggles the door you're looking at; a door swings away from you.
// Closed doors are solid: the player is pushed out of their (axis-aligned) boxes after the BVH collision.
import * as THREE from 'three';

const T = 0.045;              // leaf thickness
const SPEED = 3.0;            // open/close speed (1/s)

const mats = {
  white: new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.6 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.5 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x5a3a26, roughness: 0.55 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x9fb4bf, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.35 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.3, metalness: 0.8 }),
};
const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };

function makeLeaf(kind, w, h) {
  // leaf built along +x from its hinge at x = 0, centred on z = 0
  const g = new THREE.Group();
  if (kind === 'glass') {
    const f = 0.08;
    g.add(box(f, h, T, mats.wood, f / 2, h / 2), box(f, h, T, mats.wood, w - f / 2, h / 2));
    g.add(box(w, f, T, mats.wood, w / 2, h - f / 2), box(w, 0.2, T, mats.wood, w / 2, 0.1));
    g.add(box(w - 2 * f, h - f - 0.2, 0.01, mats.glass, w / 2, 0.2 + (h - f - 0.2) / 2));
    g.add(box(0.03, 0.3, 0.06, mats.metal, w - 0.12, 1.0));
  } else if (kind === 'main') {
    g.add(box(w, h, T, mats.wood, w / 2, h / 2));
    g.add(box(0.03, 0.4, 0.08, mats.metal, w - 0.1, 1.05));
  } else {
    g.add(box(w, h, T, mats.white, w / 2, h / 2));
    g.add(box(0.12, 0.45, T + 0.006, mats.dark, w / 2, 1.45));       // vision panel
    g.add(box(0.13, 0.025, 0.07, mats.metal, w - 0.14, 1.0));        // lever
    g.add(box(0.05, 0.12, T + 0.01, mats.metal, w - 0.1, 1.0));
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
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
    return this.list.length;
  }

  // small number plaques above the doors, on the corridor side (video: dark numbers on a white plate).
  // Ground floor 1.., first 101.., second 201..; numbered clockwise round the building from the north.
  numberPlates(recs) {
    const cx = -3, cz = 4.25;
    const floors = [...new Set(recs.map((r) => r.y))].sort((a, b) => a - b);
    const ang = (r) => (Math.atan2(r.x - cx, -(r.z - cz)) + Math.PI * 2) % (Math.PI * 2);
    floors.forEach((y, fi) => {
      const rooms = recs.filter((r) => r.y === y && r.into && r.kind === 'room').sort((a, b) => ang(a) - ang(b));
      rooms.forEach((r, i) => this.plate(r, String(fi * 100 + i + 1)));
      recs.filter((r) => r.y === y && r.into && r.kind === 'glass').forEach((r) => this.plate(r, 'STAIRS'));
    });
  }

  plate(r, text) {
    const W = 128, H = 64, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#f4f2ec'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#2a2420'; g.lineWidth = 4; g.strokeRect(2, 2, W - 4, H - 4);
    g.fillStyle = '#1c1a18'; g.font = `bold ${text.length > 3 ? 26 : 40}px -apple-system, Helvetica, Arial, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, W / 2, H / 2 + 2);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(text.length > 3 ? 0.3 : 0.2, 0.1), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
    // corridor side of the wall line: opposite the side the door opens into
    const out = -r.into;
    if (r.axis === 'x') { m.position.set(r.x, r.y + r.h + 0.18, r.z + out * 0.022); m.rotation.y = out > 0 ? 0 : Math.PI; }
    else { m.position.set(r.x + out * 0.022, r.y + r.h + 0.18, r.z); m.rotation.y = out > 0 ? Math.PI / 2 : -Math.PI / 2; }
    this.scene.add(m);
  }

  // door under the crosshair within reach
  pick(camera, reach = 2.6) {
    this._rc ||= new THREE.Raycaster();
    this._rc.setFromCamera(new THREE.Vector2(0, 0), camera);
    this._rc.far = reach;
    const h = this._rc.intersectObjects(this.meshes, false)[0];
    return h ? h.object.userData.door : null;
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
      e.target = opening ? 1 : 0;
    }
  }

  update(dt) {
    for (const d of this.list) {
      if (d.open === d.target) continue;
      d.open += Math.sign(d.target - d.open) * Math.min(Math.abs(d.target - d.open), dt * SPEED);
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
