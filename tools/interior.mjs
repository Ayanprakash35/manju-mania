import { planRooms, typeAt, labelFor, furnishAll, furnishNook } from './furnish.mjs';
// Procedural interior + missing exterior for the Shapr3D courtyard building (v2, from the owner's two
// reference videos and their stair markup).
//
// The export only has the outside: thick perimeter walls, solid courtyard-facade blocks with window frames
// set into them, corner towers with decorative spiral stairs. This module rebuilds the inside as the real
// building is laid out:
//   * thin outer walls (same outer faces as the model) with a window per room per floor
//   * a central ring corridor on every floor with rooms on BOTH sides (outer rooms / courtyard rooms)
//   * courtyard-side walls follow the model's facade outline exactly, with real openings at its windows
//   * two switchback stairwells, middle of the west and east wings against the outer wall (owner's markup),
//     ground -> first -> second, behind glass doors, black balusters and a wooden handrail (video 2)
//   * double-height entrance lobby with a first-floor gallery and railings, steps up from the courtyard
//   * a covered walkway with square pillars round the courtyard (video 2), doors from it into the rooms
//   * entrance balcony + canopy (video 1), north/south street entrances
//   * every doorway gets a door leaf (returned in `doors`; the game builds and animates them)
//
// Method: one rectilinear grid over the whole plan, built from every coordinate that matters. Each cell is
// labelled (outside / courtyard / corridor / a room id / stair / lobby). Walls go on the edges between cells
// with different labels; floors, slabs and roofs are merged rectangles of cells.
//
// All coordinates are game metres (x east, y up, z south), after convert.mjs's transform.
//
// NOTE: generated geometry changes here only take effect after public/building.glb is rebuilt from the
// original Shapr3D OBJ (not in the repo) with tools/convert.mjs.

export const LEVELS = [0.76, 4.03, 7.17];       // ground = the model's plinth top; first/second from its spirals
const PLINTH = 0.76, SLAB = 0.2;
const TOP_TALL = 10.92, TOP_LOW = 7.82, SPLIT_Z = 9.62;   // G+2 everywhere (owner); SPLIT_Z divides the W/E wings from the S wing
const DOOR_W = 0.95, DOOR_H = 2.15;
const ROOM_MIN = 2.8, ROOM_TARGET = 3.8;

export const COL = {
  facade: '0.831,0.831,0.831',   // matches the model's wall colour
  inner: '0.902,0.894,0.871',    // interior walls (white, like the video)
  floor: '0.792,0.776,0.737',    // light beige tiles
  ceiling: '0.937,0.933,0.922',
  frame: '0.267,0.212,0.180',    // dark brown door frames
  glass: '0.180,0.220,0.251',
  trim: '0.929,0.871,0.851',     // pinkish-white window surrounds (video)
  rail: '0.141,0.141,0.149',     // black balusters
  wood: '0.420,0.243,0.157',     // handrail
  stone: '0.322,0.400,0.373',    // green marble steps (video 2)
  wood2: '0.788,0.690,0.533',    // beige wood partition frames (video 3)
  glassClear: '0.780,0.851,0.878',   // see-through glass (transparent material in convert.mjs)
};

// ----- plan constants (game metres), measured from the export -----
const OUTER = { xw: -35.12, xe: 28.88, zn: -11.75, zs: 20.25 };
const OW = 0.3;
const IN = { xw: OUTER.xw + OW, xe: OUTER.xe - OW, zn: OUTER.zn + OW, zs: OUTER.zs - OW };
// corridor ring: outer edges (xo/zo) and inner edges (xi/zi)
const CORR = { xo0: -31.2, xi0: -29.5, xi1: 23.6, xo1: 25.3, zo0: -8.75, zi0: -7.05, zi1: 15.4, zo1: 17.1 };
// The model's corner halls (raised tiled platform, enclosure walls up to 7.17 m, steps and porch from the
// courtyard corner, curved gallery fronts) are kept exactly as modelled: the generator leaves these squares alone.
const QUADS = {
  NW: [-31.85, -24.0, -8.95, -0.8], NE: [18.5, 26.5, -8.65, -0.85],
  SW: [-31.95, -24.0, 9.35, 17.1], SE: [18.5, 26.4, 9.4, 17.45],
};
// Owner: the corridor is one plain rectangle loop on every floor, straight past the corners. So the loop
// runs through each corner square; the part of the square inside the loop is the light well (kept as modelled),
// and the model's corner pieces that sat where the loop and the outer rooms now are get trimmed away
// (CLIP_RECTS, used by convert.mjs to cut those triangles exactly at the lines).
const INNER_RECT = [CORR.xi0, CORR.xi1, CORR.zi0, CORR.zi1];
export const CLIP_RECTS = Object.values(QUADS).flatMap((q) => subtractRects([q], [INNER_RECT]));
const WELLS = Object.fromEntries(Object.entries(QUADS).map(([k, [x0, x1, z0, z1]]) => [k, [Math.max(x0, CORR.xi0), Math.min(x1, CORR.xi1), Math.max(z0, CORR.zi0), Math.min(z1, CORR.zi1)]]));
// stairwells (owner): middle of the west and east wings on the COURTYARD side of the corridor, windows on the courtyard
const STAIRS = [
  // laneB runs against the courtyard facade (bLow: facade on the low-x side), entry at the north end from the corridor
  { id: 'stW', x0: CORR.xi0, x1: -26.15, z0: 3.8, z1: 9.3, bLow: false },
  { id: 'stE', x0: 20.58, x1: CORR.xi1, z0: 3.8, z1: 9.35, bLow: true },
];
const LOBBY = { x0: -8.33, x1: 1.37, z0: CORR.zi0, z1: -4.02, voidX0: -7.33, voidX1: 0.37, voidZ1: -5.0 };
const EXIT_HALL = { x0: -4.55, x1: -2.55 };
const ENTRANCE = { x: -3.52, z: -4.02, doorZ: -3.6 };
// owner: the two recesses either side of the entrance block are open entrances into the corridor
const RECESS_ENTRANCES = [-11.4, 6.4];
// owner: windows above the main door on the upper floors (same size as the block's ground-floor windows)
const ABOVE_DOOR = [-7.0, -3.52, 0.0];
const SPIRALS = [[-26.85, -24.25, -4.0, -1.25], [18.75, 21.55, -3.6, -1.0], [-27.0, -24.25, 9.5, 12.1], [18.75, 21.35, 9.7, 12.45]];
// covered walkway: courtyard cells outside this rectangle (2.2 m deep along the facades)
const WALK = { x0: -23.95, x1: 18.38, z0: -1.82, z1: 10.31, roof: 3.75, pillar: 0.35 };
const EXITS = [];
// Rooms pushed out into the exterior (the player never goes outside) so they have the video's scale:
// the common room beside the entrance and the three washrooms. face: which outer wall; u0..u1 along it; depth outward.
const EXT = [
  { id: 'oN6', face: 'N', u0: -15.3, u1: -8.1, depth: 3.5 },
  { id: 'oS7', face: 'S', u0: -11.7, u1: -2.5, depth: 2.5 },
  { id: 'oW2', face: 'W', u0: -5.1, u1: 2.3, depth: 2.5 },
  { id: 'oE2', face: 'E', u0: -5.1, u1: 2.3, depth: 2.5 },
];
const extRects = (e) => {          // [room rect, outer-wall band rect] as [x0, x1, z0, z1]
  const t = 0.3;
  if (e.face === 'N') { const f = OUTER.zn - e.depth; return [[e.u0, e.u1, f + t, IN.zn], [e.u0, e.u1, f, f + t]]; }
  if (e.face === 'S') { const f = OUTER.zs + e.depth; return [[e.u0, e.u1, IN.zs, f - t], [e.u0, e.u1, f - t, f]]; }
  if (e.face === 'W') { const f = OUTER.xw - e.depth; return [[f + t, IN.xw, e.u0, e.u1], [f, f + t, e.u0, e.u1]]; }
  const f = OUTER.xe + e.depth; return [[IN.xe, f - t, e.u0, e.u1], [f - t, f, e.u0, e.u1]];
};
// the open gap next to room 18 leading to the towel stand (video): part of the corridor, no wall, no door
const NOOKS = ['oE6'];   // owner: no doors through the outer walls (the old street entrances are removed)

const tallAt = () => true;
const topAt = (z) => (tallAt(z) ? TOP_TALL : TOP_LOW);
const floorsAt = (z) => (tallAt(z) ? LEVELS : LEVELS.slice(0, 2));
const inRect = (x, z, [x0, x1, z0, z1]) => x > x0 && x < x1 && z > z0 && z < z1;

// =====================================================================================
export function buildInterior({ removed, solids = [], kept, addBox, addQuad, addBeam, addCyl }) {
  const stats = { rooms: 0, doors: 0, windows: 0, stairs: 0 };
  const doors = [];
  const panes = findWindowPanes(kept);
  const wings = unionByWing(removed.map((b) => ({ body: b, poly: outline(b) })).filter((x) => x.poly));
  const inFiller = (x, z) => wings.some((w) => w.poly.inside(x, z));

  // ---------- partitions (room splits) ----------
  const split = (a, b, target = ROOM_TARGET) => { const n = Math.max(1, Math.round((b - a) / target)); return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n); };
  const outerX = [IN.xw, ...split(-29.6, EXIT_HALL.x0).slice(0, -1), EXIT_HALL.x0, EXIT_HALL.x1, ...split(EXIT_HALL.x1, 23.9).slice(1), IN.xe];
  const outerZ = split(CORR.zo0, CORR.zo1);   // W/E outer strips
  // courtyard rooms: between window centres of the facade
  const paneCentres = (filter) => [...new Set(panes.filter(filter).map((p) => +((p.u0 + p.u1) / 2).toFixed(2)))].sort((a, b) => a - b);
  const nWin = paneCentres((p) => p.axis === 'x' && p.plane < -2 && p.plane > -8 && p.y0 < LEVELS[1]);
  const sWin = paneCentres((p) => p.axis === 'x' && p.plane > 11 && p.plane < 17 && p.y0 < LEVELS[1]);
  const wWin = paneCentres((p) => p.axis === 'z' && p.plane < -24 && p.plane > -32 && p.y0 < LEVELS[1]);
  const eWin = paneCentres((p) => p.axis === 'z' && p.plane > 19 && p.plane < 27 && p.y0 < LEVELS[1]);
  const innerN = [...roomBounds(-24.0, LOBBY.x0, nWin), ...roomBounds(LOBBY.x1, 18.5, nWin)];
  const innerS = roomBounds(-24.0, 18.5, sWin);
  const innerW = roomBounds(-0.8, STAIRS[0].z0, wWin);
  const innerE = roomBounds(-0.85, STAIRS[1].z0, eWin);
  const idx = (arr, v) => { let i = 0; while (i + 1 < arr.length && v > arr[i + 1]) i++; return i; };

  // ---------- grid ----------
  const X = new Set([OUTER.xw, OUTER.xe, IN.xw, IN.xe, CORR.xo0, CORR.xi0, CORR.xi1, CORR.xo1, LOBBY.x0, LOBBY.x1, LOBBY.voidX0, LOBBY.voidX1,
    EXIT_HALL.x0, EXIT_HALL.x1, WALK.x0, WALK.x1, ...outerX, ...innerN, ...innerS]);
  const Z = new Set([OUTER.zn, OUTER.zs, IN.zn, IN.zs, CORR.zo0, CORR.zi0, CORR.zi1, CORR.zo1, LOBBY.z1, LOBBY.voidZ1, SPLIT_Z, WALK.z0, WALK.z1, ...outerZ, ...innerW, ...innerE]);
  for (const r of Object.values(QUADS)) { X.add(r[0]); X.add(r[1]); Z.add(r[2]); Z.add(r[3]); }
  for (const e of EXT) for (const r of extRects(e)) { X.add(r[0]); X.add(r[1]); Z.add(r[2]); Z.add(r[3]); }
  for (const st of STAIRS) {
    X.add(st.x0); X.add(st.x1); Z.add(st.z0); Z.add(st.z1); Z.add(st.z0 + STAIR.entry);
    const { laneA, laneB } = stairLanes(st); for (const v of [...laneA, ...laneB]) X.add(v);
  }
  for (const w of wings) for (const s of w.poly.segs) { if (s.axis === 'x') { X.add(s.u0); X.add(s.u1); Z.add(s.c); } else { Z.add(s.u0); Z.add(s.u1); X.add(s.c); } }
  for (const [x0, x1, z0, z1] of SPIRALS) { for (const m of [0.1, 0.4]) { X.add(x0 - m); X.add(x1 + m); Z.add(z0 - m); Z.add(z1 + m); } }
  const xs = [...X].map((v) => +v.toFixed(3)).sort((a, b) => a - b).filter((v, i, a) => i === 0 || v - a[i - 1] > 0.004);
  const zs = [...Z].map((v) => +v.toFixed(3)).sort((a, b) => a - b).filter((v, i, a) => i === 0 || v - a[i - 1] > 0.004);
  const NX = xs.length - 1, NZ = zs.length - 1;

  const classify = (x, z) => {
    for (const e of EXT) { const [room, band] = extRects(e); if (inRect(x, z, room)) return e.id; if (inRect(x, z, band)) return 'wall'; }
    if (!inRect(x, z, [IN.xw, IN.xe, IN.zn, IN.zs])) return inRect(x, z, [OUTER.xw, OUTER.xe, OUTER.zn, OUTER.zs]) ? 'wall' : 'out';
    for (const w of Object.values(WELLS)) if (inRect(x, z, w)) return 'void';
    for (const st of STAIRS) if (inRect(x, z, [st.x0, st.x1, st.z0, st.z1])) return st.id;
    const inOuterRect = inRect(x, z, [CORR.xo0, CORR.xo1, CORR.zo0, CORR.zo1]);
    const inInnerRect = inRect(x, z, [CORR.xi0, CORR.xi1, CORR.zi0, CORR.zi1]);
    if (inOuterRect && !inInnerRect) return 'corr';
    if (!inOuterRect) {                                  // outer strips
      if (z < CORR.zo0 || z > CORR.zo1) {
        return (z < 0 ? 'oN' : 'oS') + idx(outerX, x);
      }
      return (x < 0 ? 'oW' : 'oE') + idx(outerZ, z);
    }
    const wNotch = x > CORR.xi0 && x < -26.15 && z > -0.8 && z < STAIRS[0].z0;     // owner: rooms here, not a gap
    if (!wNotch && !inFiller(x, z)) return 'court';
    const deep = wNotch || (z < -0.9 ? inFiller(x, CORR.zi0 + 1.4) : z > SPLIT_Z ? inFiller(x, CORR.zi1 - 1.4) : x < 0 ? inFiller(CORR.xi0 + 1.4, z) : inFiller(CORR.xi1 - 1.4, z));
    if (!deep) return 'court';                         // a sliver behind a deep facade recess: walkway, not a room
    if (z < -0.9) return x > LOBBY.x0 && x < LOBBY.x1 ? 'lobby' : 'iN' + idx(innerN, x);
    if (z > SPLIT_Z) return 'iS' + idx(innerS, x);
    return (x < 0 ? 'iW' + idx(innerW, z) : 'iE' + idx(innerE, z));
  };
  // rooms merged into one bigger space (owner's walkthrough: the bathrooms, common room and study room are big halls);
  // the partition between them disappears on every floor
  const MERGE = { oS6: 'oS7', oS8: 'oS7', oW1: 'oW2', oE1: 'oE2', oN5: 'oN6', iS5: 'iS4' };
  const classifyM = (x, z) => { const l = classify(x, z); if (NOOKS.includes(l)) return 'corr'; return MERGE[l] || l; };
  const lab = [];
  for (let i = 0; i < NX; i++) { lab[i] = []; for (let k = 0; k < NZ; k++) lab[i][k] = classifyM((xs[i] + xs[i + 1]) / 2, (zs[k] + zs[k + 1]) / 2); }
  const L = (i, k) => (i < 0 || k < 0 || i >= NX || k >= NZ ? 'out' : lab[i][k]);
  const isBld = (l) => l !== 'out' && l !== 'court' && l !== 'wall' && l !== 'void';
  const isRoom = (l) => /^(o|i)[NSWE]\d/.test(l);
  const isStair = (l) => l.startsWith('st');
  // walkway cells: courtyard, outside the inner walkway rectangle, clear of the spiral towers and the entrance
  const isWalk = () => false;     // no covered walkway (owner: the courtyard facades are just windows)
  const isWalkOld = (i, k) => {
    if (L(i, k) !== 'court') return false;
    const x = (xs[i] + xs[i + 1]) / 2, z = (zs[k] + zs[k + 1]) / 2;
    if (inRect(x, z, [WALK.x0, WALK.x1, WALK.z0, WALK.z1])) return false;
    if (SPIRALS.some(([a, b, c, d]) => inRect(x, z, [a - 0.4, b + 0.4, c - 0.4, d + 0.4]))) return false;
    if (x > -8.4 && x < 1.4 && z < -1.5) return false;                         // entrance landing
    return inRect(x, z, [CORR.xi0, CORR.xi1, CORR.zi0, CORR.zi1]);
  };
  if (process.env.DEBUG_PLAN) {
    const sym = (l) => l === 'out' ? ' ' : l === 'wall' ? '#' : l === 'court' ? '.' : l === 'corr' ? '=' : l === 'lobby' ? 'L' : l.startsWith('st') ? 'S' : (l.charCodeAt(l.length - 1) % 2 ? (l[0] === 'i' ? 'a' : l[0] === 'o' ? 'o' : 'c') : (l[0] === 'i' ? 'b' : l[0] === 'o' ? 'p' : 'd'));
    for (let z = OUTER.zn - 0.25; z <= OUTER.zs + 0.25; z += 0.5) {
      let row = (z.toFixed(1) + '     ').slice(0, 6);
      for (let x = OUTER.xw - 0.25; x <= OUTER.xe + 0.25; x += 0.5) row += sym(classifyM(x, z));
      console.log(row);
    }
  }
  const roomIds = new Set(); for (let i = 0; i < NX; i++) for (let k = 0; k < NZ; k++) if (isRoom(lab[i][k])) roomIds.add(lab[i][k]);
  stats.rooms = roomIds.size;
  // each room's bounding rectangle (rooms are rectangles of grid cells)
  const roomRect = {};
  for (let i = 0; i < NX; i++) for (let k = 0; k < NZ; k++) {
    const l = lab[i][k]; if (!isRoom(l)) continue;
    const r = roomRect[l] ||= { id: l, x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
    r.x0 = Math.min(r.x0, xs[i]); r.x1 = Math.max(r.x1, xs[i + 1]); r.z0 = Math.min(r.z0, zs[k]); r.z1 = Math.max(r.z1, zs[k + 1]);
  }

  // ---------- floors, slabs, roofs (merged rectangles) ----------
  const cellRects = (pred) => mergeCells(NX, NZ, pred).map(([i0, i1, k0, k1]) => [xs[i0], xs[i1], zs[k0], zs[k1]]);
  const cx = (i) => (xs[i] + xs[i + 1]) / 2, cz = (k) => (zs[k] + zs[k + 1]) / 2;
  const stairHole = (st) => { const { laneA, laneB } = stairLanes(st); return [Math.min(laneA[0], laneB[0]), Math.max(laneA[1], laneB[1]), st.z0 + STAIR.entry, st.z1]; };
  const inHole = (x, z) => STAIRS.some((st) => inRect(x, z, stairHole(st)));
  for (const [a, b, c, d] of cellRects((i, k) => isBld(L(i, k)))) {
    addBox(a, b, -0.2, PLINTH - 0.02, c, d, COL.ceiling);
    addBox(a, b, PLINTH - 0.02, PLINTH + 0.006, c, d, COL.floor);
  }
  for (const [a, b, c, d] of cellRects((i, k) => isWalk(i, k))) {          // walkway floor + roof
    addBox(a, b, -0.2, PLINTH - 0.02, c, d, COL.ceiling);
    addBox(a, b, PLINTH - 0.02, PLINTH, c, d, COL.floor);
    addBox(a, b, WALK.roof - 0.25, WALK.roof, c, d, COL.ceiling);
  }
  const voidLobby = () => false;
  for (const [a, b, c, d] of cellRects((i, k) => isBld(L(i, k)) && !voidLobby(cx(i), cz(k)) && !inHole(cx(i), cz(k)))) slab(addBox, a, b, c, d, LEVELS[1]);
  for (const [a, b, c, d] of cellRects((i, k) => isBld(L(i, k)) && tallAt(cz(k)) && !inHole(cx(i), cz(k)))) slab(addBox, a, b, c, d, LEVELS[2]);
  for (const [a, b, c, d] of cellRects((i, k) => isBld(L(i, k)) && tallAt(cz(k)))) addBox(a, b, TOP_TALL - 0.25, TOP_TALL, c, d, COL.ceiling);
  for (const [a, b, c, d] of cellRects((i, k) => isBld(L(i, k)) && !tallAt(cz(k)))) addBox(a, b, TOP_LOW - 0.25, TOP_LOW, c, d, COL.ceiling);

  // ---------- interior walls on label boundaries ----------
  // collect edge pieces: key = kind|axis|c|side labels ; merge along the line
  const pieces = new Map();
  const addPiece = (kind, axis, c, u0, u1, lo, hi, inward) => {
    const key = [kind, axis, c.toFixed(3), lo, hi].join('|');
    if (!pieces.has(key)) pieces.set(key, { kind, axis, c, lo, hi, inward, spans: [] });
    pieces.get(key).spans.push([u0, u1]);
  };
  const kindOf = (a, b) => {
    if (a === b) return null;
    if (a === 'void' || b === 'void') {
      const o = a === 'void' ? b : a;
      if (o === 'corr') return 'voidrail';        // corridor passing a corner hall: the model's own walls/steps; railings upstairs
      return isBld(o) ? 'facade' : null;
    }
    const A = isBld(a), Bb = isBld(b);
    if (!A && !Bb) return null;
    if (a === 'wall' || b === 'wall' || a === 'out' || b === 'out') return null;      // outer walls built separately
    if (A !== Bb) return a === 'hall' || b === 'hall' ? 'porch' : 'facade';
    if ((a === 'hall' && b === 'corr') || (a === 'corr' && b === 'hall')) return null;   // halls are part of the corridor ring
    if (a === 'corr' || b === 'corr' || a === 'hall' || b === 'hall') return 'corr';
    return 'part';
  };
  for (let i = 0; i < NX; i++) for (let k = 0; k <= NZ; k++) {            // edges along x at z = zs[k]
    const a = L(i, k - 1), b = L(i, k), kind = kindOf(a, b);
    if (kind) addPiece(kind, 'x', zs[k], xs[i], xs[i + 1], a, b, isBld(b) && !isBld(a) ? 1 : isBld(a) && !isBld(b) ? -1 : 0);
    // storey step at the tall/low boundary: wall above the low roof
  }
  for (let k = 0; k < NZ; k++) for (let i = 0; i <= NX; i++) {            // edges along z at x = xs[i]
    const a = L(i - 1, k), b = L(i, k), kind = kindOf(a, b);
    if (kind) addPiece(kind, 'z', xs[i], zs[k], zs[k + 1], a, b, isBld(b) && !isBld(a) ? 1 : isBld(a) && !isBld(b) ? -1 : 0);
  }
  const runs = [];
  for (const p of pieces.values()) {
    p.spans.sort((s, t) => s[0] - t[0]);
    let cur = null;
    for (const [u0, u1] of p.spans) { if (cur && u0 <= cur.u1 + 1e-3) cur.u1 = u1; else { cur = { ...p, u0, u1 }; delete cur.spans; runs.push(cur); } }
  }
  const midZ = (r) => (r.axis === 'x' ? r.c : (r.u0 + r.u1) / 2);

  // door choice: each room/stair/corner/lobby gets one door on its longest corridor run
  const corrRunsOf = (id) => runs.filter((r) => r.kind === 'corr' && (r.lo === id || r.hi === id));
  const doorOn = new Map();          // run -> [{u, floors, kind}]
  const pushDoor = (run, u, floors, kind, w = DOOR_W) => { if (!doorOn.has(run)) doorOn.set(run, []); doorOn.get(run).push({ u, floors, kind, w }); };
  for (const id of [...roomIds, ...STAIRS.map((s) => s.id)]) {
    const rs = corrRunsOf(id).filter((r) => r.u1 - r.u0 >= DOOR_W + 0.35).sort((p, q) => (q.u1 - q.u0) - (p.u1 - p.u0));
    if (!rs.length) { console.warn('no corridor door for', id); continue; }
    const r = rs[0];
    const st = STAIRS.find((s) => s.id === id);
    let u = (r.u0 + r.u1) / 2;
    if (st) u = st.z0 + 0.1 + STAIR.entry / 2;                                // into the stair's entry strip
    pushDoor(r, u, floorsAt(midZ(r)), st ? 'glass' : 'room');
  }

  // which wall each room's door is on, and which way is into the room; then what each room is (furnish.mjs)
  for (const [r, ds] of doorOn) for (const d of ds) {
    const id = isRoom(r.lo) ? r.lo : isRoom(r.hi) ? r.hi : null;
    if (!id || d.kind !== 'room' || !roomRect[id]) continue;
    roomRect[id].door = { axis: r.axis, c: r.c, u: d.u, w: d.w, into: r.hi === id ? 1 : -1 };
  }
  const roomList = Object.values(roomRect);
  const roomPlan = planRooms(roomList);
  CTX.roomPlan = roomPlan;
  for (const [r, ds] of doorOn) for (const d of [...ds]) {
    const id = isRoom(r.lo) ? r.lo : isRoom(r.hi) ? r.hi : null;
    if (!id || roomPlan[id]?.type !== 'common' || d.kind !== 'room') continue;
    d.floors = d.floors.filter((Lv) => Lv !== LEVELS[0]);
    ds.push({ u: d.u, floors: [LEVELS[0]], kind: 'open', w: Math.min(2.6, r.u1 - r.u0 - 0.6) });   // wide doorless opening (video)
  }

  // walkway doors: every ground-floor courtyard room with a facade on the walkway gets a door onto it
  const walkDoorRuns = new Map();
  for (const r of runs) {
    if (r.kind !== 'facade') continue;
    const id = isBld(r.lo) ? r.lo : r.hi;
    if (!isRoom(id) || !id.startsWith('i')) continue;
    if ((id.startsWith('iN') || id.startsWith('iS')) !== (r.axis === 'x')) continue;    // only on the main facade line
    // the courtyard side of this run must be walkway
    const off = -0.3 * r.inward, m = (r.u0 + r.u1) / 2;
    const px = r.axis === 'x' ? m : r.c + off, pz = r.axis === 'x' ? r.c + off : m;
    const ci = idx(xs, px), ck = idx(zs, pz);
    if (!isWalk(ci, ck)) continue;
    if (!walkDoorRuns.has(id) || (walkDoorRuns.get(id).u1 - walkDoorRuns.get(id).u0) < r.u1 - r.u0) walkDoorRuns.set(id, r);
  }
  CTX.walkDoorRuns = walkDoorRuns;

  const walkDoorU = new Map();     // run -> u of its walkway door
  for (const [id, r] of walkDoorRuns) {
    const taken = panes.filter((p) => p.axis === r.axis && Math.abs(p.plane - r.c) < 1.4 && p.y0 < LEVELS[1]).map((p) => [p.u0 - 0.15, p.u1 + 0.15]);
    let best = null;
    for (let u = r.u0 + 0.7; u <= r.u1 - 0.7; u += 0.05) {
      if (taken.some(([a, b]) => u + DOOR_W / 2 > a && u - DOOR_W / 2 < b)) continue;
      if (best == null || Math.abs(u - (r.u0 + r.u1) / 2) < Math.abs(best - (r.u0 + r.u1) / 2)) best = u;
    }
    if (best != null) walkDoorU.set(r, best);
  }

  // the space above the lobby is a room on each upper floor, with its own corridor door
  for (const r of runs) if (r.kind === 'corr' && (r.lo === 'lobby' || r.hi === 'lobby')) pushDoor(r, (LOBBY.x0 + LOBBY.x1) / 2, LEVELS.slice(1), 'room');
  const porchEdges = [], extraWins = [], recesses = [];
  // ---------- build interior walls ----------
  for (const r of runs) {
    if (r.kind === 'voidrail') {
      const side = r.lo === 'corr' ? -1 : 1;                          // corridor side of the line
      for (const Lv of LEVELS.slice(1)) railing(addBox, addBeam, r.axis, r.c + side * 0.06, r.u0, r.u1, Lv);
      continue;
    }
    const top = topAt(midZ(r));
    const holes = [];
    const fl = floorsAt(midZ(r));
    for (const d of doorOn.get(r) || []) for (const Lv of d.floors) {
      holes.push([d.u - d.w / 2, d.u + d.w / 2, Lv, Lv + DOOR_H]);
      if (d.kind === 'open') continue;                                     // just an opening, no door leaf
      const rec = doorRecord(r, d.u, Lv, d.w, d.kind);
      const rid = isRoom(r.lo) ? r.lo : isRoom(r.hi) ? r.hi : null;
      const label = rid && d.kind === 'room' ? labelFor(typeAt(roomPlan, rid, Lv, LEVELS[0])) : null;
      if (label) rec.label = label;
      doors.push(rec);
    }
    if (r.kind === 'corr' && (r.lo === 'lobby' || r.hi === 'lobby')) {
      holes.push([LOBBY.voidX0 + 0.3, LOBBY.voidX1 - 0.3, LEVELS[0], LEVELS[1] - 0.45]);   // wide opening at ground

    }
    if (r.kind === 'facade') {
      const bldSide = r.inward;                     // +1: building on the + side of the line
      for (const p of panes) {
        if (p.axis !== r.axis) continue;
        const off = (p.plane - r.c) * bldSide;      // how far into the building the pane sits
        if (off < -0.4 || off > 1.4) continue;
        const o0 = Math.max(p.u0, r.u0 + 0.05), o1 = Math.min(p.u1, r.u1 - 0.05);
        if (o1 - o0 < 0.3) continue;
        holes.push([o0, o1, p.y0, p.y1]);
        if (off > 0.3) recesses.push({ run: r, o0, o1, y0: p.y0, y1: p.y1, depth: off + 0.03, side: bldSide });
        else recesses.push({ run: r, o0, o1, y0: p.y0, y1: p.y1, shallow: off, side: bldSide });   // pane at/near the face: seal the gap round it
        if (p.y0 > LEVELS[1] && p.y0 < LEVELS[2] - 0.5 && p.y1 + (LEVELS[2] - LEVELS[1]) < TOP_TALL - 0.4 && !panes.some((q) => q !== p && q.axis === p.axis && Math.abs(q.plane - p.plane) < 0.3 && Math.abs(q.u0 - p.u0) < 0.3 && q.y0 > LEVELS[2])) {
          const d = LEVELS[2] - LEVELS[1];
          holes.push([o0, o1, p.y0 + d, p.y1 + d]);
          extraWins.push({ axis: r.axis, plane: r.c, sgn: -bldSide, u: (o0 + o1) / 2, sill: p.y0 + d, w: o1 - o0, h: p.y1 - p.y0 });
        }
      }
      // main entrance doors and the balcony door above them
      for (const d of kept.filter((k) => /^Body_1531/.test(k.name))) {
        if (r.axis !== 'x' || Math.abs(r.c - (d.minZ + d.maxZ) / 2) > 1.0) continue;
        const o0 = Math.max(d.minX, r.u0), o1 = Math.min(d.maxX, r.u1);
        if (o1 - o0 > 0.3) holes.push([o0, o1, -0.2, d.maxY]);
      }
      if (r.axis === 'x' && Math.abs(r.c - CORR.zi0) < 0.05) for (const u of RECESS_ENTRANCES) if (u - 0.9 > r.u0 && u + 0.9 < r.u1) {
        holes.push([u - 0.8, u + 0.8, -0.2, PLINTH + 2.6]);
        for (let st = 0; st < 3; st++) addBox(u - 0.9, u + 0.9, -0.2, PLINTH * (3 - st) / 4, r.c + st * 0.32, r.c + (st + 1) * 0.32, COL.stone);
        doorFrame(addBox, { axis: 'x', c: r.c, u0: r.u0, u1: r.u1, inward: r.inward }, 0.25, false, u, PLINTH, 1.6);
      }
      if (r.axis === 'x' && Math.abs(r.c - ENTRANCE.z) < 0.05 && ENTRANCE.x > r.u0 && ENTRANCE.x < r.u1) {
        for (const u of ABOVE_DOOR) for (const Lv of LEVELS.slice(1)) {
          const sill = Lv + 0.37, w = 1.59, h = 1.49;
          holes.push([u - w / 2, u + w / 2, sill, sill + h]);
          extraWins.push({ axis: 'x', plane: r.c, sgn: -bldSide, u, sill, w, h });
        }
      }
      if (walkDoorU.has(r)) {
        const u = walkDoorU.get(r);
        holes.push([u - DOOR_W / 2, u + DOOR_W / 2, LEVELS[0], LEVELS[0] + DOOR_H]);
        doors.push(doorRecord(r, u, LEVELS[0], DOOR_W, 'room'));
      }

    }
    const thick = r.kind === 'facade' || r.kind === 'porch' ? 0.25 : r.kind === 'corr' ? 0.15 : 0.12;
    // corridor walls sit on the room side, partitions centred, facades inside the building
    let inward = r.inward, centred = false;
    if (r.kind === 'corr') inward = r.hi === 'corr' ? -1 : 1;
    if (r.kind === 'part') centred = true;
    const push = r.kind === 'facade' ? 0.012 : 0;
    const seg = { axis: r.axis, c: r.c - push * inward, u0: r.u0, u1: r.u1, inward };
    const stairGlass = r.kind === 'corr' && (isStair(r.lo) || isStair(r.hi));
    if (stairGlass) for (const Lv of LEVELS) holes.push([r.u0 + 0.12, r.u1 - 0.12, Lv + 0.9, Lv + 2.75]);
    wallWithHoles(addBox, seg, thick + push, -0.2, top, mergeHoles(holes), r.kind === 'facade' ? COL.facade : stairGlass ? COL.wood2 : COL.inner, centred);
    if (stairGlass) glassPartition(addBox, seg, thick, r, doorOn.get(r) || []);
    // window recesses: the model's frames sit in recesses as deep as its panes; line the openings to that depth
    if (r.kind === 'facade') for (const w of recesses) if (w.run === r) recess(addBox, r, w);
    // dark frames round interior doorways
    for (const d of doorOn.get(r) || []) for (const Lv of d.floors) doorFrame(addBox, seg, thick, centred, d.u, Lv, d.w);
    if (walkDoorU.has(r)) doorFrame(addBox, seg, thick, centred, walkDoorU.get(r), LEVELS[0], DOOR_W);
  }

  // ---------- outer walls (thin, same outer faces as the model) with windows ----------
  const wins = [];
  const outerRooms = [];
  // north / south faces: one window per outer room (from outerX splits), per floor
  for (const [plane, sgn, zIn] of [[OUTER.zn, -1, IN.zn], [OUTER.zs, 1, IN.zs]]) {
    for (let j = 0; j + 1 < outerX.length; j++) {
      const a = outerX[j], b = outerX[j + 1];
      const u = (a + b) / 2;
      for (const Lv of floorsAt(zIn)) wins.push({ axis: 'x', plane, sgn, u, sill: Lv + 0.9, w: 1.4, h: 1.4 });
    }
  }
  for (const [plane, sgn] of [[OUTER.xw, -1], [OUTER.xe, 1]]) {
    for (let j = 0; j + 1 < outerZ.length; j++) { const u = (outerZ[j] + outerZ[j + 1]) / 2; for (const Lv of LEVELS) wins.push({ axis: 'z', plane, sgn, u, sill: Lv + 0.9, w: 1.4, h: 1.4 }); }
    for (const u of [(IN.zn + CORR.zo0) / 2, (CORR.zo1 + IN.zs) / 2]) for (const Lv of LEVELS) wins.push({ axis: 'z', plane, sgn, u, sill: Lv + 0.9, w: 1.2, h: 1.4 });
  }
  stats.windows = wins.length;
  // extensions: drop the original windows inside each gap; build the bump's far wall (with windows) and side walls
  const gapOn = (axis, c) => EXT.filter((e) => (e.face === 'N' && axis === 'x' && c === OUTER.zn) || (e.face === 'S' && axis === 'x' && c === OUTER.zs) || (e.face === 'W' && axis === 'z' && c === OUTER.xw) || (e.face === 'E' && axis === 'z' && c === OUTER.xe));
  for (let i = wins.length - 1; i >= 0; i--) { const w = wins[i]; if (gapOn(w.axis, w.plane).some((e) => w.u > e.u0 - 0.2 && w.u < e.u1 + 0.2)) wins.splice(i, 1); }
  const bumpWins = [];
  for (const e of EXT) {
    const axis = e.face === 'N' || e.face === 'S' ? 'x' : 'z', sgn = e.face === 'N' || e.face === 'W' ? -1 : 1;
    const base = e.face === 'N' ? OUTER.zn : e.face === 'S' ? OUTER.zs : e.face === 'W' ? OUTER.xw : OUTER.xe;
    const far = base + sgn * e.depth, isBath = CTX.roomPlan?.[e.id]?.type === 'bath';
    const holes = [];
    const len = e.u1 - e.u0, n = Math.max(1, Math.round(len / (isBath ? 1.9 : 2.4)));
    for (let k = 0; k < n; k++) {
      const u = e.u0 + (len * (k + 0.5)) / n;
      for (const Lv of LEVELS) {
        const w = isBath ? { sill: Lv + 2.15, w: 1.1, h: 0.62 } : { sill: Lv + 0.9, w: 1.4, h: 1.4 };   // washrooms: high windows with exhaust fans
        holes.push([u - w.w / 2, u + w.w / 2, w.sill, w.sill + w.h]);
        windowUnit(addBox, axis, far, sgn, u, w.sill, w.w, w.h);
        bumpWins.push({ axis, plane: far, u0: u - w.w / 2, u1: u + w.w / 2, y0: w.sill, y1: w.sill + w.h });
        if (isBath && k % 2 === 0) addCyl(axis === 'x' ? [u - 0.25, w.sill + w.h / 2, far - sgn * 0.08] : [far - sgn * 0.08, w.sill + w.h / 2, u - 0.25], 0.22, 0.05, axis === 'x' ? 'z' : 'x', COL.trim);
      }
    }
    wallWithHoles(addBox, { axis, c: far, u0: e.u0 - 0.1, u1: e.u1 + 0.1, inward: -sgn }, OW, -0.2, TOP_TALL + 0.04, holes, COL.facade);
    for (const u of [e.u0, e.u1]) {                                   // side walls, centred on the partition lines
      const a = Math.min(base, far), b = Math.max(base, far);
      wallWithHoles(addBox, { axis: axis === 'x' ? 'z' : 'x', c: u, u0: a, u1: b, inward: 1 }, 0.2, -0.2, TOP_TALL + 0.04, [], COL.facade, true);
    }
  }
  CTX.bumpWins = bumpWins;
  for (const w of wins) windowUnit(addBox, w.axis, w.plane, w.sgn, w.u, w.sill, w.w, w.h);
  for (const [axis, c, inward, u0, u1] of [['x', OUTER.zn, 1, OUTER.xw, OUTER.xe], ['x', OUTER.zs, -1, OUTER.xw, OUTER.xe], ['z', OUTER.xw, 1, IN.zn, IN.zs], ['z', OUTER.xe, -1, IN.zn, IN.zs]]) {
    // split each face at the tall/low boundary so the wall height steps like the model's
    let parts = [[u0, u1]];
    for (const e of gapOn(axis, c)) parts = parts.flatMap(([a, b]) => (e.u1 <= a || e.u0 >= b ? [[a, b]] : [[a, e.u0], [e.u1, b]].filter(([p, q]) => q - p > 0.01)));
    for (const [a, b] of parts) {
      const top = TOP_TALL + 0.04;
      const holes = [];
      for (const w of wins) if (w.axis === axis && w.plane === c && w.u > a && w.u < b) holes.push([w.u - w.w / 2, w.u + w.w / 2, w.sill, w.sill + w.h]);
      for (const e of EXITS) if (e.axis === axis && e.plane === c && e.u > a && e.u < b) holes.push([e.u - e.w / 2, e.u + e.w / 2, PLINTH, PLINTH + 2.6]);
      wallWithHoles(addBox, { axis, c, u0: a, u1: b, inward }, OW, -0.2, top, holes, COL.facade);
    }
  }
  for (const e of EXITS) { exitSteps(addBox, e); doors.push({ x: e.u, z: e.plane - e.sgn * OW / 2, y: PLINTH, w: e.w, h: 2.6, axis: e.axis, kind: 'main', double: true }); }

  // ---------- stairs ----------
  for (const st of STAIRS) { buildStair(st, addBox, addBeam); stats.stairs++; }

  // ---------- lobby gallery railings + entrance ----------
  entrance(addBox);

  // ---------- covered walkway: pillars, edge, steps down to the courtyard ----------
  for (const w of extraWins) windowUnit(addBox, w.axis, w.plane, w.sgn, w.u, w.sill, w.w, w.h);
  // light wells: green marble L-steps along the two corridor edges, from the well floor up to the corridor
  for (const [k, sx, sz] of [['NW', -1, -1], ['NE', 1, -1], ['SW', -1, 1], ['SE', 1, 1]]) {
    const [x0, x1, z0, z1] = WELLS[k];
    const zEdge = sz < 0 ? z0 : z1, xEdge = sx < 0 ? x0 : x1;
    for (let st = 0; st < 3; st++) {
      const top = PLINTH * (3 - st) / 4, d0 = st * 0.32, d1 = (st + 1) * 0.32;
      const za = zEdge - sz * d1, zb = zEdge - sz * d0, xa = xEdge - sx * d1, xb = xEdge - sx * d0;
      addBox(x0, x1, -0.2, top, Math.min(za, zb), Math.max(za, zb), COL.stone);
      addBox(Math.min(xa, xb), Math.max(xa, xb), -0.2, top, z0, z1, COL.stone);
    }
  }
  stats.props = props({ addBox, addCyl, runs, doorOn });
  // room interiors (furnish.mjs): windows of every kind so curtains line up with the real openings
  const winRects = [
    ...[...wins, ...extraWins].map((w) => ({ axis: w.axis, plane: w.plane, u0: w.u - w.w / 2, u1: w.u + w.w / 2, y0: w.sill, y1: w.sill + w.h })),
    ...panes.map((p) => ({ axis: p.axis, plane: p.plane, u0: p.u0, u1: p.u1, y0: p.y0, y1: p.y1 })),
    ...(CTX.bumpWins || []),
  ];
  const inRoom = (id, x, z) => { const i = idx(xs, x), k = idx(zs, z); return x > xs[0] && x < xs[NX] && z > zs[0] && z < zs[NZ] && lab[i][k] === id; };
  stats.furniture = furnishAll({ addBox, addCyl, rooms: roomList, plan: roomPlan, levels: LEVELS, windows: winRects, inRoom,
    ceilAt: (Lv) => { const i = LEVELS.indexOf(Lv); return i + 1 < LEVELS.length ? LEVELS[i + 1] - SLAB : TOP_TALL - 0.25; } });
  for (const id of NOOKS) {                                         // the towel nook beside room 18, on every floor
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < NX; i++) for (let k = 0; k < NZ; k++) if (classify(cx(i), cz(k)) === id) { x0 = Math.min(x0, xs[i]); x1 = Math.max(x1, xs[i + 1]); z0 = Math.min(z0, zs[k]); z1 = Math.max(z1, zs[k + 1]); }
    if (x0 < x1) for (const Lv of LEVELS) furnishNook({ addBox, addCyl, rect: [x0, x1, z0, z1], corrX: CORR.xo1, Lv });
  }
  stats.roomTypes = Object.fromEntries(Object.entries(roomPlan).map(([id, p]) => [id, p.type + (p.ground ? ' (ground)' : ' (all floors)') + ` ${(roomRect[id].x1 - roomRect[id].x0).toFixed(1)}x${(roomRect[id].z1 - roomRect[id].z0).toFixed(1)} at x ${roomRect[id].x0.toFixed(1)}..${roomRect[id].x1.toFixed(1)} z ${roomRect[id].z0.toFixed(1)}..${roomRect[id].z1.toFixed(1)}`]));
  if (process.env.DUMP_ROOMS) stats.allRooms = roomList.filter((r) => /^oN/.test(r.id)).map((r) => `${r.id} x ${r.x0.toFixed(1)}..${r.x1.toFixed(1)} z ${r.z0.toFixed(1)}..${r.z1.toFixed(1)}${r.door ? '' : ' (no door)'}`);
  stats.doors = doors.length;
  return { stats, doors };
}

const CTX = {};

// ---------- props from the videos ----------
// deterministic pseudo-random in [0,1) from numbers
const hash = (...v) => { let h = 2166136261; for (const x of v) { h ^= Math.round(x * 1000); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10000) / 10000; };
const PCOL = {
  black: '0.090,0.090,0.094', red: '0.749,0.110,0.086', white: '0.965,0.965,0.950', light: '0.996,0.996,0.980',
  mat: ['0.180,0.369,0.208', '0.231,0.231,0.239', '0.337,0.251,0.196'],
  shoe: ['0.900,0.900,0.900', '0.110,0.110,0.120', '0.851,0.329,0.149', '0.894,0.773,0.180', '0.294,0.420,0.643', '0.549,0.420,0.322', '0.173,0.553,0.329'],
  paint: ['0.776,0.329,0.482', '0.243,0.557,0.643', '0.894,0.584,0.290', '0.302,0.459,0.255'],
  bin: '0.157,0.706,0.620', blue: '0.502,0.718,0.878', grey: '0.420,0.420,0.430',
};
function props({ addBox, addCyl, runs, doorOn }) {
  let n = 0;
  // helper: box placed against a wall face. along (u0..u1), height (y0..y1), out from the face (o0..o1)
  const WB = (r, side, u0, u1, y0, y1, o0, o1, col) => {
    const p0 = r.c + side * o0, p1 = r.c + side * o1;
    if (r.axis === 'x') addBox(u0, u1, y0, y1, Math.min(p0, p1), Math.max(p0, p1), col); else addBox(Math.min(p0, p1), Math.max(p0, p1), y0, y1, u0, u1, col);
    n++;
  };
  const corrSide = (r) => (r.hi === 'corr' || r.hi === 'hall' ? 1 : -1);
  for (const r of runs) {
    if (r.kind !== 'corr') continue;
    if (r.lo === 'lobby' || r.hi === 'lobby' || r.lo.startsWith('st') || r.hi.startsWith('st')) continue;   // open / glass walls
    const side = corrSide(r);
    const ds = doorOn.get(r) || [];
    const busy = (u, half) => ds.some((d) => Math.abs(d.u - u) < d.w / 2 + half + 0.12);
    for (const Lv of LEVELS) {
      for (const d of ds) {
        if (!d.floors.includes(Lv)) continue;
        const h = hash(d.u, Lv, r.c);
        // number plate above the door, mat in front
        WB(r, side, d.u - 0.09, d.u + 0.09, Lv + DOOR_H + 0.12, Lv + DOOR_H + 0.24, 0, 0.015, PCOL.black);
        if (d.kind === 'room' && h < 0.7) WB(r, side, d.u - 0.33, d.u + 0.33, Lv, Lv + 0.015, 0.05, 0.5, PCOL.mat[Math.floor(h * 30) % 3]);
        // shoe rack beside most room doors (video: black 4-5 shelf racks full of shoes)
        if (d.kind !== 'room' || h > 0.75) continue;
        const dir = h < 0.37 ? 1 : -1;
        const uc = d.u + dir * (d.w / 2 + 0.45);
        if (uc - 0.3 < r.u0 + 0.1 || uc + 0.3 > r.u1 - 0.1 || ds.some((e) => e !== d && Math.abs(e.u - uc) < e.w / 2 + 0.45)) continue;
        const shelves = 4 + Math.floor(h * 10) % 2, H = 0.2 * shelves + 0.1;
        for (const uu of [uc - 0.29, uc + 0.27]) WB(r, side, uu, uu + 0.02, Lv, Lv + H, 0.02, 0.04, PCOL.black), WB(r, side, uu, uu + 0.02, Lv, Lv + H, 0.28, 0.3, PCOL.black);
        for (let k = 0; k < shelves; k++) {
          const y = Lv + 0.1 + k * 0.2;
          WB(r, side, uc - 0.29, uc + 0.29, y, y + 0.015, 0.02, 0.3, PCOL.black);
          for (let j = 0; j < 3; j++) {                                  // pairs of shoes
            const hh = hash(uc, y, j);
            if (hh < 0.25) continue;
            const s0 = uc - 0.26 + j * 0.18;
            WB(r, side, s0, s0 + 0.15, y + 0.015, y + 0.09, 0.05, 0.27, PCOL.shoe[Math.floor(hh * 70) % PCOL.shoe.length]);
          }
        }
      }
      // fire extinguishers every ~14 m on the corridor walls
      const len = r.u1 - r.u0;
      if (len > 7) {
        const m = Math.floor(len / 14) + 1;
        for (let j = 0; j < m; j++) {
          let u = r.u0 + (len * (j + 0.5)) / m;
          if (busy(u, 0.2)) u += 1.3;
          if (busy(u, 0.2) || u > r.u1 - 0.3) continue;
          WB(r, side, u - 0.08, u + 0.08, Lv + 0.95, Lv + 1.5, 0.03, 0.19, PCOL.red);
          WB(r, side, u - 0.03, u + 0.03, Lv + 1.5, Lv + 1.6, 0.06, 0.14, PCOL.black);
          WB(r, side, u + 0.08, u + 0.1, Lv + 1.05, Lv + 1.45, 0.08, 0.12, PCOL.black);
          WB(r, side, u - 0.15, u + 0.15, Lv + 1.65, Lv + 1.85, 0, 0.012, PCOL.red);            // sign
        }
      }
    }
  }
  // tube lights along the corridor ceilings and CCTV cameras at the corridor corners
  const lines = [['x', (CORR.zo0 + CORR.zi0) / 2, CORR.xo0, CORR.xo1], ['x', (CORR.zo1 + CORR.zi1) / 2, CORR.xo0, CORR.xo1],
    ['z', (CORR.xo0 + CORR.xi0) / 2, CORR.zo0, CORR.zo1], ['z', (CORR.xo1 + CORR.xi1) / 2, CORR.zo0, CORR.zo1]];
  for (let f = 0; f < LEVELS.length; f++) {
    const ceil = f + 1 < LEVELS.length ? LEVELS[f + 1] - SLAB : TOP_TALL - 0.25;
    const inQuad = (x, z) => Object.values(WELLS).some((q) => inRect(x, z, q));
    const allLines = lines;
    for (const [axis, c, u0, u1] of allLines) {
      for (let u = u0 + 2; u < u1 - 1; u += 4) {
        if (axis === 'x' ? inQuad(u, c) : inQuad(c, u)) continue;
        if (axis === 'x') addBox(u - 0.6, u + 0.6, ceil - 0.05, ceil, c - 0.05, c + 0.05, PCOL.light); else addBox(c - 0.05, c + 0.05, ceil - 0.05, ceil, u - 0.6, u + 0.6, PCOL.light);
        n++;
      }
    }
    for (const [x, z] of [[CORR.xo0 + 0.35, CORR.zo0 + 0.35], [CORR.xo1 - 0.35, CORR.zo0 + 0.35], [CORR.xo0 + 0.35, CORR.zo1 - 0.35], [CORR.xo1 - 0.35, CORR.zo1 - 0.35]]) {
      addBox(x - 0.06, x + 0.06, ceil - 0.12, ceil, z - 0.06, z + 0.06, PCOL.white);
      addCyl([x, ceil - 0.18, z], 0.05, 0.12, 'y', PCOL.white);
      n += 2;
    }
  }
  // red hose reels on the corridor wall beside each stair door (video 2)
  for (const r of runs) {
    if (r.kind !== 'corr' || !(r.lo.startsWith('st') || r.hi.startsWith('st'))) continue;
    const side = corrSide(r);
    for (const d of doorOn.get(r) || []) for (const Lv of d.floors) {
      const u = d.u + d.w / 2 + 0.6;
      const x = r.axis === 'x' ? u : r.c + side * 0.09, z = r.axis === 'x' ? r.c + side * 0.09 : u;
      addCyl([x, Lv + 1.6, z], 0.33, 0.12, r.axis === 'x' ? 'z' : 'x', PCOL.red);
      addCyl([x, Lv + 1.6, z], 0.1, 0.16, r.axis === 'x' ? 'z' : 'x', PCOL.white);
      n += 2;
    }
  }
  // water dispensers and dustbins at the corridor corners (video 2)
  for (const [x, z] of [[CORR.xo0 + 0.4, CORR.zo0 + 0.4], [CORR.xo1 - 0.4, CORR.zo0 + 0.4], [CORR.xo0 + 0.4, CORR.zo1 - 0.4], [CORR.xo1 - 0.4, CORR.zo1 - 0.4]]) {
    for (const Lv of LEVELS) {
      addBox(x - 0.17, x + 0.17, Lv, Lv + 1.05, z - 0.17, z + 0.17, PCOL.white);
      addCyl([x, Lv + 1.27, z], 0.13, 0.42, 'y', PCOL.blue);
      addCyl([x + (x < 0 ? 0.6 : -0.6), Lv + 0.25, z], 0.17, 0.5, 'y', PCOL.bin);
      n += 3;
    }
  }
  return n;
}

// door record for the game: opening centre on the wall line, axis of the wall, which side is "into the room"
function doorRecord(run, u, y, w, kind) {
  const x = run.axis === 'x' ? u : run.c, z = run.axis === 'x' ? run.c : u;
  // doors off a corridor open into the room (the side away from the corridor), never into the corridor.
  // Facade/walkway doors have the room on the building side of the wall, so keep that direction too.
  const into = run.kind === 'corr'
    ? (run.hi === 'corr' || run.hi === 'hall' ? -1 : 1)
    : run.kind === 'facade' ? (run.inward || 1) : 0;
  return { x: +x.toFixed(3), z: +z.toFixed(3), y: +y.toFixed(3), w: +w.toFixed(3), h: DOOR_H, axis: run.axis, kind, into };
}
// lining of a window opening from the wall's inner face to the depth of the model's pane
function recess(addBox, r, w) {
  if (w.shallow != null) {
    // reveal from just outside the pane to the back of the wall, so no sliver of sky shows round the frame
    const t = 0.05, p0 = r.c + w.side * (w.shallow - 0.03), p1 = r.c + w.side * 0.27, a = Math.min(p0, p1), b = Math.max(p0, p1);
    const B = (u0, u1, y0, y1) => (r.axis === 'x' ? addBox(u0, u1, y0, y1, a, b, COL.facade) : addBox(a, b, y0, y1, u0, u1, COL.facade));
    B(w.o0, w.o0 + t, w.y0, w.y1); B(w.o1 - t, w.o1, w.y0, w.y1);
    B(w.o0, w.o1, w.y0, w.y0 + t); B(w.o0, w.o1, w.y1 - t, w.y1);
    return;
  }
  const d0 = 0.2, d1 = w.depth, t = 0.1;
  const p0 = r.c + w.side * d0, p1 = r.c + w.side * d1, a = Math.min(p0, p1), b = Math.max(p0, p1);
  const B = (u0, u1, y0, y1) => (r.axis === 'x' ? addBox(u0, u1, y0, y1, a, b, COL.facade) : addBox(a, b, y0, y1, u0, u1, COL.facade));
  B(w.o0 - t, w.o0, w.y0 - t, w.y1 + t); B(w.o1, w.o1 + t, w.y0 - t, w.y1 + t);
  B(w.o0, w.o1, w.y0 - t, w.y0); B(w.o0, w.o1, w.y1, w.y1 + t);
}
// stair partition (video): beige wood frame, clear glass above a solid lower panel, mullions every ~1 m
function glassPartition(addBox, seg, thick, r, doorsHere) {
  const t0 = seg.inward > 0 ? seg.c : seg.c - thick, t1 = t0 + thick, mid = (t0 + t1) / 2;
  const B = (u0, u1, y0, y1, a, b, col) => (r.axis === 'x' ? addBox(u0, u1, y0, y1, a, b, col) : addBox(a, b, y0, y1, u0, u1, col));
  for (const Lv of LEVELS) {
    const y0 = Lv + 0.9, y1 = Lv + 2.75;
    const cuts = [r.u0 + 0.12];
    for (const d of doorsHere) if (d.floors.includes(Lv)) cuts.push(d.u - d.w / 2 - 0.07, d.u + d.w / 2 + 0.07);
    cuts.push(r.u1 - 0.12);
    for (let i = 0; i + 1 < cuts.length; i += 2) {
      const a = cuts[i], b = cuts[i + 1];
      if (b - a < 0.1) continue;
      B(a, b, y0, y1, mid - 0.006, mid + 0.006, COL.glassClear);
      const n = Math.max(1, Math.round((b - a) / 1.0));
      for (let k = 0; k <= n; k++) { const u = a + ((b - a) * k) / n; B(u - 0.03, u + 0.03, y0, y1, t0 - 0.01, t1 + 0.01, COL.wood2); }
      B(a, b, y0 - 0.04, y0, t0 - 0.01, t1 + 0.01, COL.wood2); B(a, b, y1, y1 + 0.04, t0 - 0.01, t1 + 0.01, COL.wood2);
    }
  }
}
function doorFrame(addBox, seg, thick, centred, u, y, w) {
  const t0 = centred ? seg.c - thick / 2 - 0.02 : seg.inward > 0 ? seg.c - 0.02 : seg.c - thick - 0.02;
  const t1 = t0 + thick + 0.04, f = 0.07;
  const B = (a, b, y0, y1) => (seg.axis === 'x' ? addBox(a, b, y0, y1, t0, t1, COL.frame) : addBox(t0, t1, y0, y1, a, b, COL.frame));
  B(u - w / 2 - f, u - w / 2, y, y + DOOR_H + f);
  B(u + w / 2, u + w / 2 + f, y, y + DOOR_H + f);
  B(u - w / 2 - f, u + w / 2 + f, y + DOOR_H, y + DOOR_H + f);
}

// ---- stairs: switchback, lanes along z, entry at the north (z0) end next to the corridor ----
const STAIR = { entry: 1.25, landing: 1.15, lane: 1.15, well: 0.12, riser: 0.165 };
// lane B against the outer wall, lane A beside it, walkway strip along the corridor wall
function stairLanes(st) {
  // inside the facade wall (0.25) on the lane-B side and the corridor wall (0.15) on the other
  const xin0 = st.x0 + (st.bLow ? 0.25 : 0.15), xin1 = st.x1 - (st.bLow ? 0.15 : 0.25);
  const laneB = st.bLow ? [xin0, xin0 + STAIR.lane] : [xin1 - STAIR.lane, xin1];
  const laneA = st.bLow ? [laneB[1] + STAIR.well, laneB[1] + STAIR.well + STAIR.lane] : [laneB[0] - STAIR.well - STAIR.lane, laneB[0] - STAIR.well];
  return { laneA, laneB };
}
function buildStair(st, addBox, addBeam) {
  const { laneA, laneB } = stairLanes(st);
  const us = st.z0 + STAIR.entry, ue = st.z1 - STAIR.landing, run = ue - us;
  const well = [Math.min(laneA[1], laneB[1]), Math.max(laneA[0], laneB[0])];
  for (let f = 0; f + 1 < LEVELS.length; f++) {
    const L0 = LEVELS[f], H = LEVELS[f + 1] - L0;
    const n = Math.max(4, Math.round(H / STAIR.riser / 2)), r = H / (2 * n), t = run / (n - 1);
    const base = (y) => (f === 0 ? PLINTH - 0.02 : y - 0.3);
    for (let k = 1; k < n; k++) { const y = L0 + k * r; addBox(laneA[0], laneA[1], base(y), y, us + (k - 1) * t, us + k * t, COL.stone); }
    const yl = L0 + n * r;
    addBox(Math.min(laneA[0], laneB[0]), Math.max(laneA[1], laneB[1]), base(yl), yl, ue, st.z1, COL.stone);
    for (let k = 1; k < n; k++) { const y = yl + k * r; addBox(laneB[0], laneB[1], base(y), y, ue - k * t, ue - (k - 1) * t, COL.stone); }
    // balusters + handrail on the well side of both flights (video: black twisted balusters, wooden rail)
    const xA = st.bLow ? laneA[0] + 0.04 : laneA[1] - 0.04, xB = st.bLow ? laneB[1] - 0.04 : laneB[0] + 0.04;
    for (let k = 1; k < n; k++) {
      const zA = us + (k - 0.5) * t, yA = L0 + k * r, zB = ue - (k - 0.5) * t, yB = yl + k * r;
      addBox(xA - 0.012, xA + 0.012, yA, yA + 0.9, zA - 0.012, zA + 0.012, COL.rail);
      addBox(xB - 0.012, xB + 0.012, yB, yB + 0.9, zB - 0.012, zB + 0.012, COL.rail);
    }
    addBeam([xA, L0 + r + 0.92, us + 0.5 * t], [xA, L0 + (n - 1) * r + 0.92, us + (n - 1.5) * t], 0.06, 0.05, COL.wood);
    addBeam([xB, yl + r + 0.92, ue - 0.5 * t], [xB, yl + (n - 1) * r + 0.92, ue - (n - 1.5) * t], 0.06, 0.05, COL.wood);
    // low wall under the flights on the well side keeps you from slipping between lanes
    addBox(well[0], well[1], PLINTH, L0 + H + 0.9, us, ue, COL.inner);
  }
  // guards on the upper floors along the hole edge next to the walkway strip, and across lane A at the top
  const edge = st.bLow ? laneA[1] : laneA[0];
  for (let f = 1; f < LEVELS.length; f++) {
    const Lv = LEVELS[f];
    railing(addBox, addBeam, 'z', edge, us + 0.9, st.z1, Lv);
    if (f === LEVELS.length - 1) railing(addBox, addBeam, 'x', us, laneA[0], laneA[1], Lv);
  }
}

// balusters + top rail along an axis-aligned line at floor level y
function railing(addBox, addBeam, axis, c, u0, u1, y) {
  const n = Math.max(2, Math.round((u1 - u0) / 0.13));
  for (let i = 0; i <= n; i++) {
    const u = u0 + ((u1 - u0) * i) / n;
    if (axis === 'x') addBox(u - 0.012, u + 0.012, y, y + 1.0, c - 0.012, c + 0.012, COL.rail);
    else addBox(c - 0.012, c + 0.012, y, y + 1.0, u - 0.012, u + 0.012, COL.rail);
  }
  if (axis === 'x') { addBox(u0, u1, y + 1.0, y + 1.06, c - 0.035, c + 0.035, COL.wood); addBox(u0, u1, y, y + 0.06, c - 0.02, c + 0.02, COL.rail); }
  else { addBox(c - 0.035, c + 0.035, y + 1.0, y + 1.06, u0, u1, COL.wood); addBox(c - 0.02, c + 0.02, y, y + 0.06, u0, u1, COL.rail); }
}

// covered walkway: square pillars along its courtyard edge, steps down to the courtyard on each side
function walkway(addBox, NX, NZ, xs, zs, isWalk) {
  const edges = [];
  // courtyard-facing edges of the walkway region
  for (let i = 0; i < NX; i++) for (let k = 0; k <= NZ; k++) {
    const a = isWalk(i, k - 1), b = isWalk(i, k);
    if (a !== b) edges.push({ axis: 'x', c: zs[k], u0: xs[i], u1: xs[i + 1], out: a ? 1 : -1 });
  }
  for (let k = 0; k < NZ; k++) for (let i = 0; i <= NX; i++) {
    const a = isWalk(i - 1, k), b = isWalk(i, k);
    if (a !== b) edges.push({ axis: 'z', c: xs[i], u0: zs[k], u1: zs[k + 1], out: a ? 1 : -1 });
  }
  // only the edges on the walkway rectangle boundary are open to the courtyard
  const onRect = (e) => (e.axis === 'x' ? Math.abs(e.c - WALK.z0) < 1e-3 || Math.abs(e.c - WALK.z1) < 1e-3 : Math.abs(e.c - WALK.x0) < 1e-3 || Math.abs(e.c - WALK.x1) < 1e-3);
  const merged = mergeCollinear(edges.filter(onRect).map((e) => ({ ...e, inward: e.out })));
  for (const e of merged) {
    const len = e.u1 - e.u0;
    const n = Math.max(1, Math.round(len / 3.6));
    const p = WALK.pillar;
    for (let j = 0; j <= n; j++) {
      const u = e.u0 + (len * j) / n;
      const uu = Math.min(Math.max(u, e.u0 + p / 2), e.u1 - p / 2);
      const off = e.inward > 0 ? [e.c - p, e.c] : [e.c, e.c + p];     // pillar on the walkway side of the edge
      if (e.axis === 'x') addBox(uu - p / 2, uu + p / 2, PLINTH, WALK.roof - 0.25, off[0], off[1], COL.facade);
      else addBox(off[0], off[1], PLINTH, WALK.roof - 0.25, uu - p / 2, uu + p / 2, COL.facade);
    }
    // beam along the edge under the roof
    const off = e.inward > 0 ? [e.c - 0.3, e.c] : [e.c, e.c + 0.3];
    if (e.axis === 'x') addBox(e.u0, e.u1, WALK.roof - 0.55, WALK.roof - 0.25, off[0], off[1], COL.facade);
    else addBox(off[0], off[1], WALK.roof - 0.55, WALK.roof - 0.25, e.u0, e.u1, COL.facade);
    // steps down into the courtyard every ~12 m (3 risers, 1.6 m wide)
    const ns = Math.max(1, Math.round(len / 12));
    for (let j = 0; j < ns; j++) {
      const u = e.u0 + (len * (j + 0.5)) / ns;
      if (u - 1.0 < e.u0 || u + 1.0 > e.u1) continue;
      for (let s = 0; s < 2; s++) {
        const yTop = PLINTH * (2 - s) / 3, d0 = s * 0.32, d1 = (s + 1) * 0.32;
        const o0 = e.c + (e.inward > 0 ? d0 : -d1), o1 = e.c + (e.inward > 0 ? d1 : -d0);
        if (e.axis === 'x') addBox(u - 0.8, u + 0.8, -0.2, yTop, Math.min(o0, o1), Math.max(o0, o1), COL.floor);
        else addBox(Math.min(o0, o1), Math.max(o0, o1), -0.2, yTop, u - 0.8, u + 0.8, COL.floor);
      }
    }
  }
}

// merge grid cells satisfying pred into rectangles (greedy: extend along i, then k)
function mergeCells(NX, NZ, pred) {
  const used = Array.from({ length: NX }, () => new Uint8Array(NZ));
  const out = [];
  for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
    if (used[i][k] || !pred(i, k)) continue;
    let i1 = i + 1; while (i1 < NX && !used[i1][k] && pred(i1, k)) i1++;
    let k1 = k + 1;
    outer: while (k1 < NZ) { for (let ii = i; ii < i1; ii++) if (used[ii][k1] || !pred(ii, k1)) break outer; k1++; }
    for (let ii = i; ii < i1; ii++) for (let kk = k; kk < k1; kk++) used[ii][kk] = 1;
    out.push([i, i1, k, k1]);
  }
  return out;
}

// three steps down from a hall's porch edge into the porch (0.76 -> 0), plus yellow-tiled ledges at the ends
function porchSteps(addBox, r) {
  const out = -r.inward;                     // courtyard side
  for (let s = 0; s < 3; s++) {
    const yTop = PLINTH * (3 - s) / 3 - PLINTH / 3 + 0.0001 + (s === 0 ? 0 : 0);
    const top = PLINTH * (2 - s) / 3;        // 0.507, 0.253, 0
    if (top <= 0.01) continue;
    const d0 = s * 0.32, d1 = (s + 1) * 0.32;
    const p0 = r.c + out * d0, p1 = r.c + out * d1;
    const B = (a, b, y0, y1, q0, q1, col) => (r.axis === 'x' ? addBox(a, b, y0, y1, Math.min(q0, q1), Math.max(q0, q1), col) : addBox(Math.min(q0, q1), Math.max(q0, q1), y0, y1, a, b, col));
    B(r.u0 + 0.05, r.u1 - 0.05, -0.2, top, p0, p1, COL.stone);
  }
}
function entrance(addBox) {
  // the entrance block's portal (part of the model's facade block, projecting 0.5 m around the door; its
  // outline sits above floor level so the floor-plan outline missed it): two dark jambs up to 3.22 m
  addBox(-5.41, -4.61, 0.29, 3.22, ENTRANCE.z - 0.012, -3.52, '0.208,0.208,0.208');
  addBox(-2.42, -1.62, 0.29, 3.22, ENTRANCE.z - 0.012, -3.52, '0.208,0.208,0.208');
  // steps just inside the doors: landing 0.29 -> ground floor 0.76 (green marble, video 2)
  for (let i = 0; i < 3; i++) {
    const zf = ENTRANCE.doorZ - i * 0.32;
    addBox(ENTRANCE.x - 1.5, ENTRANCE.x + 1.5, -0.2, 0.29 + (i + 1) * ((PLINTH - 0.29) / 3), zf - 0.32, zf, COL.stone);
  }
}

function exitSteps(addBox, e) {
  const g0 = -0.16, n = 6, r = (PLINTH - g0) / n, t = 0.32;
  for (let i = 0; i < n; i++) {
    const p0 = e.plane + e.sgn * i * t, p1 = e.plane + e.sgn * (i + 1) * t;
    addBox(e.u - e.w / 2 - 0.4, e.u + e.w / 2 + 0.4, g0, PLINTH - i * r, Math.min(p0, p1), Math.max(p0, p1), COL.floor);
  }
  const F = (a, b, y0, y1) => { const p0 = e.plane, p1 = e.plane + e.sgn * 0.08; addBox(a, b, y0, y1, Math.min(p0, p1), Math.max(p0, p1), COL.frame); };
  F(e.u - e.w / 2 - 0.12, e.u - e.w / 2, PLINTH, PLINTH + 2.72);
  F(e.u + e.w / 2, e.u + e.w / 2 + 0.12, PLINTH, PLINTH + 2.72);
  F(e.u - e.w / 2 - 0.12, e.u + e.w / 2 + 0.12, PLINTH + 2.6, PLINTH + 2.72);
  const c0 = e.plane, c1 = e.plane + e.sgn * 1.4;
  addBox(e.u - e.w / 2 - 0.7, e.u + e.w / 2 + 0.7, PLINTH + 2.9, PLINTH + 3.1, Math.min(c0, c1), Math.max(c0, c1), COL.facade);
}

const wingOf = (poly) => { const cx = (poly.minX + poly.maxX) / 2, cz = (poly.minZ + poly.maxZ) / 2; return cz < -2 ? 'N' : cz > 11 ? 'S' : cx < 0 ? 'W' : 'E'; };
// Overlapping facade blocks of one wing are merged into one exact rectilinear outline: a grid built from
// every block's edge coordinates, each cell tested against the blocks, boundary edges extracted.
function unionByWing(items) {
  const groups = {};
  for (const it of items) (groups[wingOf(it.poly)] ||= []).push(it);
  const out = [];
  for (const [wing, list] of Object.entries(groups)) {
    const xs = [...new Set(list.flatMap((it) => it.poly.segs.flatMap((s) => (s.axis === 'x' ? [s.u0, s.u1] : [s.c]))).map((v) => +v.toFixed(3)))].sort((a, b) => a - b);
    const zs = [...new Set(list.flatMap((it) => it.poly.segs.flatMap((s) => (s.axis === 'z' ? [s.u0, s.u1] : [s.c]))).map((v) => +v.toFixed(3)))].sort((a, b) => a - b);
    const ins = (x, z) => list.some((it) => it.poly.inside(x, z));
    const NX = xs.length - 1, NZ = zs.length - 1;
    const cell = [];
    for (let i = 0; i < NX; i++) { cell[i] = []; for (let k = 0; k < NZ; k++) cell[i][k] = (xs[i + 1] - xs[i] > 0.005 && zs[k + 1] - zs[k] > 0.005) ? ins((xs[i] + xs[i + 1]) / 2, (zs[k] + zs[k + 1]) / 2) : null; }
    const at = (i, k) => (i < 0 || k < 0 || i >= NX || k >= NZ ? false : cell[i][k]);
    // thin slivers (< 5 mm) take the value of a neighbour so they don't create fake edges
    for (let i = 0; i < NX; i++) for (let k = 0; k < NZ; k++) if (cell[i][k] === null) cell[i][k] = !!(at(i - 1, k) || at(i, k - 1));
    const segs = [];
    for (let k = 0; k <= NZ; k++) for (let i = 0; i < NX; i++) {          // edges along x at z = zs[k]
      const a = at(i, k - 1), b = at(i, k);
      if (a !== b) segs.push({ axis: 'x', c: zs[k], u0: xs[i], u1: xs[i + 1], inward: b ? 1 : -1 });
    }
    for (let i = 0; i <= NX; i++) for (let k = 0; k < NZ; k++) {          // edges along z at x = xs[i]
      const a = at(i - 1, k), b = at(i, k);
      if (a !== b) segs.push({ axis: 'z', c: xs[i], u0: zs[k], u1: zs[k + 1], inward: b ? 1 : -1 });
    }
    const merged = mergeCollinear(segs);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const s of merged) {
      if (s.axis === 'x') { minX = Math.min(minX, s.u0); maxX = Math.max(maxX, s.u1); minZ = Math.min(minZ, s.c); maxZ = Math.max(maxZ, s.c); }
      else { minZ = Math.min(minZ, s.u0); maxZ = Math.max(maxZ, s.u1); minX = Math.min(minX, s.c); maxX = Math.max(maxX, s.c); }
    }
    const body = { name: 'wing_' + wing, minY: Math.min(...list.map((it) => it.body.minY)), maxY: Math.max(...list.map((it) => it.body.maxY)), parts: list.map((it) => it.body.name) };
    out.push({ body, poly: { segs: merged, minX, maxX, minZ, maxZ, inside: ins } });
  }
  return out;
}

function windowUnit(addBox, axis, plane, sgn, u, sill, w, h) {
  // helper: box given along-wall range, height range, and offset range outward from the face
  const B = (a, b, y0, y1, o0, o1, col) => {
    const p0 = plane + sgn * o0, p1 = plane + sgn * o1;
    if (axis === 'x') addBox(a, b, y0, y1, Math.min(p0, p1), Math.max(p0, p1), col);
    else addBox(Math.min(p0, p1), Math.max(p0, p1), y0, y1, a, b, col);
  };
  const t = 0.12;
  B(u - w / 2, u + w / 2, sill, sill + h, -0.01, 0.03, COL.glass);                   // glass
  B(u - w / 2 - t, u - w / 2, sill, sill + h, 0, 0.07, COL.trim);                     // surround
  B(u + w / 2, u + w / 2 + t, sill, sill + h, 0, 0.07, COL.trim);
  B(u - 0.03, u + 0.03, sill, sill + h, 0, 0.05, COL.trim);                           // mullion
  B(u - w / 2 - 0.2, u + w / 2 + 0.2, sill - 0.1, sill, 0, 0.2, COL.trim);           // sill
  B(u - w / 2 - 0.25, u + w / 2 + 0.25, sill + h, sill + h + 0.12, 0, 0.28, COL.trim); // hood
}


// =====================================================================================
// geometry helpers

function slab(addBox, x0, x1, z0, z1, L) {
  addBox(x0, x1, L - SLAB, L - 0.02, z0, z1, COL.ceiling);
  addBox(x0, x1, L - 0.02, L, z0, z1, COL.floor);
}

// A wall along an axis-aligned segment. seg = {axis:'x'|'z' (direction of the edge), c (constant
// coordinate), u0,u1 (range along the edge), inward (+1/-1 side the thickness grows to)}.
// centred=true puts the thickness either side of c (partitions).
function wallWithHoles(addBox, seg, thick, y0, y1, holes, col, centred = false) {
  const t0 = centred ? seg.c - thick / 2 : seg.inward > 0 ? seg.c : seg.c - thick;
  const t1 = t0 + thick;
  const cuts = new Set([seg.u0, seg.u1]);
  for (const [a, b] of holes) { if (a > seg.u0 && a < seg.u1) cuts.add(a); if (b > seg.u0 && b < seg.u1) cuts.add(b); }
  const us = [...cuts].sort((a, b) => a - b);
  for (let i = 0; i + 1 < us.length; i++) {
    const a = us[i], b = us[i + 1], m = (a + b) / 2;
    if (b - a < 1e-3) continue;
    const spans = holes.filter((h) => h[0] <= m && h[1] >= m).map((h) => [Math.max(y0, h[2]), Math.min(y1, h[3])]).filter(([p, q]) => q > p).sort((p, q) => p[0] - q[0]);
    let y = y0;
    for (const [p, q] of spans) { if (p > y + 1e-3) put(a, b, y, p); y = Math.max(y, q); }
    if (y1 > y + 1e-3) put(a, b, y, y1);
  }
  function put(a, b, ya, yb) {
    if (seg.axis === 'x') addBox(a, b, ya, yb, t0, t1, col); else addBox(t0, t1, ya, yb, a, b, col);
  }
}

function mergeHoles(h) { return h.filter(([a, b, c, d]) => b - a > 0.05 && d - c > 0.05); }

// room boundaries: split [u0,u1] at midpoints between windows so each room is ROOM_MIN..~ROOM_TARGET*1.6
function roomBounds(u0, u1, centres) {
  const len = u1 - u0;
  if (len < ROOM_MIN * 1.6) return [u0, u1];
  const cands = [];
  for (let i = 0; i + 1 < centres.length; i++) cands.push((centres[i] + centres[i + 1]) / 2);
  const out = [u0];
  let last = u0;
  for (const c of cands) if (c - last >= ROOM_MIN && u1 - c >= ROOM_MIN) { out.push(c); last = c; }
  // fill long blank stretches
  const filled = [out[0]];
  const all = [...out.slice(1), u1];
  for (const b of all) {
    const a = filled[filled.length - 1];
    const n = Math.floor((b - a) / (ROOM_TARGET * 1.5));
    for (let k = 1; k <= n; k++) filled.push(a + ((b - a) * k) / (n + 1));
    filled.push(b);
  }
  return filled;
}

// --- outline of a closed rectilinear body ---
// Boundary edges of its downward-facing bottom faces. The export's meshes have T-junctions, so some
// "boundary" edges are really internal: every edge is classified by testing points just either side of it
// against the bottom triangles themselves; edges with the body on both sides (or neither) are dropped.
function outline(body) {
  const { pos, idx } = body;
  const tris = [];
  const edges = new Map();
  const key = (i) => `${pos[3 * i].toFixed(3)},${pos[3 * i + 2].toFixed(3)}`;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    if (Math.max(pos[3 * a + 1], pos[3 * b + 1], pos[3 * c + 1]) > body.minY + 0.01) continue;
    tris.push([pos[3 * a], pos[3 * a + 2], pos[3 * b], pos[3 * b + 2], pos[3 * c], pos[3 * c + 2]]);
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      const kp = key(p), kq = key(q), k = kp < kq ? kp + '|' + kq : kq + '|' + kp;
      edges.set(k, (edges.get(k) || 0) + 1);
    }
  }
  if (!tris.length) return null;
  const inside = (x, z) => tris.some(([ax, az, bx, bz, cx, cz]) => {
    const d1 = (x - bx) * (az - bz) - (ax - bx) * (z - bz), d2 = (x - cx) * (bz - cz) - (bx - cx) * (z - cz), d3 = (x - ax) * (cz - az) - (cx - ax) * (z - az);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  });
  const raw = [];
  for (const [k, n] of edges) if (n === 1) raw.push(k.split('|').map((s) => s.split(',').map(Number)));
  const segs = [];
  for (const [[x0, z0], [x1, z1]] of raw) {
    let s;
    // the export has ~1 cm misalignments, so "axis-aligned" is judged with a 3 cm tolerance
    if (Math.abs(z0 - z1) < 0.03 && Math.abs(x0 - x1) > 0.03) s = { axis: 'x', c: (z0 + z1) / 2, u0: Math.min(x0, x1), u1: Math.max(x0, x1) };
    else if (Math.abs(x0 - x1) < 0.03 && Math.abs(z0 - z1) > 0.03) s = { axis: 'z', c: (x0 + x1) / 2, u0: Math.min(z0, z1), u1: Math.max(z0, z1) };
    else continue;
    const m = (s.u0 + s.u1) / 2, e = 0.04;
    const inP = s.axis === 'x' ? inside(m, s.c + e) : inside(s.c + e, m);
    const inN = s.axis === 'x' ? inside(m, s.c - e) : inside(s.c - e, m);
    if (inP === inN) continue;                       // internal (T-junction) or degenerate
    s.inward = inP ? 1 : -1;
    segs.push(s);
  }
  const merged = mergeCollinear(segs);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const s of merged) {
    if (s.axis === 'x') { minX = Math.min(minX, s.u0); maxX = Math.max(maxX, s.u1); minZ = Math.min(minZ, s.c); maxZ = Math.max(maxZ, s.c); }
    else { minZ = Math.min(minZ, s.u0); maxZ = Math.max(maxZ, s.u1); minX = Math.min(minX, s.c); maxX = Math.max(maxX, s.c); }
  }
  return { segs: merged, minX, maxX, minZ, maxZ, inside };
}
function mergeCollinear(segs) {
  const out = [];
  const groups = new Map();
  for (const s of segs) { const k = s.axis + s.c.toFixed(3) + (s.inward || 0); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); }
  for (const g of groups.values()) {
    g.sort((a, b) => a.u0 - b.u0);
    let cur = { ...g[0] };
    for (const s of g.slice(1)) { if (s.u0 <= cur.u1 + 1e-3) cur.u1 = Math.max(cur.u1, s.u1); else { out.push(cur); cur = { ...s }; } }
    out.push(cur);
  }
  return out;
}
function pointInPoly(segs, x, z) {
  // ray toward +x crossing vertical edges (axis 'z')
  let inside = false;
  for (const s of segs) if (s.axis === 'z' && s.c > x && z > s.u0 && z < s.u1) inside = !inside;
  return inside;
}
// intervals inside the polygon along the cross axis at long-axis coordinate u
function crossIntervals(segs, longAxis, u) {
  const cs = segs.filter((s) => s.axis === longAxis && u > s.u0 + 1e-3 && u < s.u1 - 1e-3).map((s) => s.c).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < cs.length; i += 2) out.push([cs[i], cs[i + 1]]);
  return out;
}
// rectangles covering a rectilinear polygon (vertical strips between unique x's)
function rectilinearFill(segs) {
  const xs = [...new Set(segs.flatMap((s) => (s.axis === 'x' ? [s.u0, s.u1] : [s.c])).map((v) => +v.toFixed(4)))].sort((a, b) => a - b);
  const rects = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    const m = (xs[i] + xs[i + 1]) / 2;
    for (const [z0, z1] of crossIntervals(segs, 'x', m)) rects.push([xs[i], xs[i + 1], z0, z1]);
  }
  return rects;
}
// rect list minus hole rects
function subtractRects(rects, holes) {
  let cur = rects;
  for (const [hx0, hx1, hz0, hz1] of holes) {
    const next = [];
    for (const [x0, x1, z0, z1] of cur) {
      if (hx1 <= x0 || hx0 >= x1 || hz1 <= z0 || hz0 >= z1) { next.push([x0, x1, z0, z1]); continue; }
      if (hx0 > x0) next.push([x0, hx0, z0, z1]);
      if (hx1 < x1) next.push([hx1, x1, z0, z1]);
      const a = Math.max(x0, hx0), b = Math.min(x1, hx1);
      if (hz0 > z0) next.push([a, b, z0, hz0]);
      if (hz1 < z1) next.push([a, b, hz1, z1]);
    }
    cur = next;
  }
  return cur;
}

// window panes in the model: thin vertical panels (window_back*, and other thin dark panes)
function findWindowPanes(kept) {
  const out = [];
  for (const b of kept) {
    const dx = b.maxX - b.minX, dy = b.maxY - b.minY, dz = b.maxZ - b.minZ;
    const thin = Math.min(dx, dz), wide = Math.max(dx, dz);
    if (!(/window_back/.test(b.name) || (thin < 0.06 && b.dark))) continue;
    if (thin > 0.08 || wide < 0.4 || wide > 3 || dy < 0.6 || dy > 2.8) continue;
    const axis = dx > dz ? 'x' : 'z';
    out.push({ name: b.name, axis, plane: axis === 'x' ? (b.minZ + b.maxZ) / 2 : (b.minX + b.maxX) / 2,
      u0: axis === 'x' ? b.minX : b.minZ, u1: axis === 'x' ? b.maxX : b.maxZ, y0: b.minY, y1: b.maxY });
  }
  return out;
}
