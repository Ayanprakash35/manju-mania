// Room interiors, from the owner's ground-floor walkthrough (IMG_2565: a full loop starting in room 18, going left).
//
//   default    double room: two metal-frame beds along the side walls (heads at the window wall), one shared desk
//              with a bookshelf hutch under the window between them, two black office chairs, two steel almirahs
//              by the door, a mirror by the door, a wall fan, curtains, a mint accent wall
//   bath       tiled toilet / shower cubicles along the far wall, black granite basin counter with mirrors,
//              white tiles with a yellow band
//   study      long wall desks with rows of plastic chairs, a TV under a red cloth, red curtains
//   common     yellow accent wall, carrom table, small tables with plastic chairs, library cubbies, TV, whiteboard
//   hp         house parent's residence: double bed, wardrobe, sofa, side table, rug
//   office     house parent's office: wood-panelled walls, desk facing the door, chairs, key box, filing cabinet
//   laundry    steel slotted racks with blue laundry sacks, one desk beside the door, brown curtains, wall fan
//   store      steel slotted racks, blue steel cupboard, cartons
//
// Where (ground floor unless noted), matched to the walk: H.P. residence, study room, bathroom and a store along
// the south wing (east to west); the laundry at the south-west end; a bathroom in each of the west and east wings
// (north of the stairs, outer side; bathrooms repeat on every floor); the common room west of the entrance lobby;
// stores east of the lobby; the office just south of the east stairs.

export const FCOL = {
  frame: '0.090,0.090,0.094',        // black metal (beds, chairs, racks)
  mattress: '0.137,0.427,0.533',     // teal-blue mattresses (video)
  sheet: '0.886,0.878,0.851',
  wood: '0.420,0.243,0.157',         // textured wood (retro 'wood')
  lightWood: '0.788,0.690,0.533',    // textured light wood
  steel: '0.231,0.302,0.388',        // blue-grey steel almirahs
  steelGrey: '0.620,0.631,0.643',    // slotted angle racks
  mirror: '0.682,0.722,0.749',
  fan: '0.886,0.886,0.878',
  mint: '0.608,0.808,0.737',         // accent wall
  yellow: '0.882,0.667,0.200',       // common room accent wall
  tileW: '0.925,0.925,0.910',
  tileY: '0.851,0.620,0.149',
  granite: '0.071,0.075,0.082',
  plastic: '0.851,0.788,0.667',      // cream plastic chairs
  curtainRed: '0.596,0.082,0.125',
  curtainGrey: '0.431,0.459,0.502',
  curtainOrange: '0.851,0.651,0.392',
  screen: '0.047,0.051,0.063',
  carton: '0.588,0.435,0.282',
  laminate: '0.741,0.698,0.639',     // beige 'wood-tile' cubicle partitions (video)
  steelDark: '0.110,0.165,0.157',    // dark green-black steel cupboards (video)
  bucketBlue: '0.180,0.400,0.690',
  sackBlue: '0.118,0.247,0.659',     // blue laundry sacks (video)
  curtainBrown: '0.267,0.110,0.086', // laundry room curtains (video)
  bucket: '0.157,0.620,0.541',
  red: '0.596,0.161,0.110',           // entrance lobby accent wall (video)
  floorGrey: '0.588,0.600,0.608',    // washroom floor tiles
  glass: '0.780,0.851,0.878',        // clear glass (transparent in convert.mjs)
  cushion: '0.204,0.247,0.231',
  // horror: filth, grime, blood, the dead (2nd floor)
  filth: '0.231,0.141,0.063', filthDark: '0.149,0.090,0.039', grime: '0.329,0.278,0.165', urine: '0.620,0.553,0.259',
  rust: '0.400,0.200,0.098', blood: '0.478,0.031,0.031', bloodDry: '0.310,0.035,0.027', tissue: '0.902,0.894,0.863',
  skinDead: '0.573,0.494,0.431', skinDead2: '0.420,0.333,0.275', hair: '0.075,0.059,0.051', shirtW: '0.835,0.835,0.800',
  shorts: '0.337,0.361,0.408', adultTop: '0.239,0.282,0.361', adultLegs: '0.137,0.137,0.157', shoe: '0.090,0.078,0.071',
  paint: ['0.776,0.329,0.482', '0.243,0.557,0.643', '0.894,0.584,0.290', '0.302,0.459,0.255'],
};

const LABEL = { bath: 'REST ROOM', study: 'STUDY ROOM', common: 'COMMON ROOM', hp: 'H.P. RESIDENCE', office: 'OFFICE', laundry: 'LAUNDRY ROOM', store: 'STORE' };

// pick a room for each special function by position; returns { id: { type, ground } }
export function planRooms(rooms) {
  const plan = {};
  const centre = (r) => [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];
  const pick = (prefix, score, type, ground = true, upper = 'default') => {
    let best = null, bs = Infinity;
    for (const r of rooms) {
      if (!r.id.startsWith(prefix) || plan[r.id] || !r.door) continue;
      const s = score(...centre(r)); if (s < bs) { bs = s; best = r; }
    }
    if (best) plan[best.id] = { type, ground, upper };
  };
  pick('oS', (x) => Math.abs(x - 11), 'hp');
  pick('iS', (x) => Math.abs(x - 0), 'study', true, 'study');
  for (const id of ['oS7', 'oW2', 'oE2']) if (rooms.some((r) => r.id === id && r.door)) plan[id] = { type: 'bath', ground: false };   // the three washrooms (merged + pushed out)
  if (rooms.some((r) => r.id === 'oE3' && r.door)) plan.oE3 = { type: 'office', ground: true };          // opposite the east stairs
  if (rooms.some((r) => r.id === 'oE7' && r.door)) plan.oE7 = { type: 'room15', ground: true, upper: 'default' };   // room 15: built at runtime (src/room15.js)
  if (rooms.some((r) => r.id === 'oE8' && r.door)) plan.oE8 = { type: 'store', ground: false, upper: 'store' };     // the small room beside it
  pick('oS', (x) => x, 'laundry');                                   // westmost on the south side
  pick('oS', (x) => Math.abs(x + 17.5), 'store');
  if (rooms.some((r) => r.id === 'lobby')) plan.lobby = { type: 'common', ground: true, upper: 'study' };
  if (rooms.some((r) => r.id === 'entry')) plan.entry = { type: 'entry', ground: true, upper: 'study' };   // across the corridor: the way out   // the open entrance hall with the courtyard door
  // video (238-244 s): the store rooms on the courtyard side east of the common room, past the east entrance recess
  for (const r of rooms) if (/^iN/.test(r.id) && r.door && (r.x0 + r.x1) / 2 > 7.9 && (r.x0 + r.x1) / 2 < 13.7 && !plan[r.id]) plan[r.id] = { type: 'store', ground: true, upper: 'default' };
  pick('oN', (x) => (x > 1.4 ? Math.abs(x - 8) : 99 - x), 'store');
  return plan;
}
export const typeAt = (plan, id, Lv, ground) => { const p = plan[id]; if (!p) return 'default'; return !p.ground || Lv === ground ? p.type : p.upper || 'default'; };
export const labelFor = (type) => LABEL[type] || null;

// deterministic hash for small variations
const hash = (...v) => { let h = 2166136261; for (const x of v) { h ^= Math.round(x * 1000); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10000) / 10000; };

export function furnishAll({ addBox, addCyl, rooms, plan, levels, ceilAt, windows, inRoom }) {
  let n = 0;
  furnishAll.stalls = [];                                  // cubicle doors: real door leaves at runtime (kind 'stall')
  for (const room of rooms) {
    if (!room.door) { (furnishAll.skipped ||= []).push(`${room.id} no door`); continue; }
    for (const Lv of levels) {
      const type = typeAt(plan, room.id, Lv, levels[0]);
      n += furnishRoom({ addBox, addCyl, room, Lv, ceil: ceilAt(Lv), type, windows, inRoom, gore: Lv === levels[levels.length - 1] });
    }
  }
  return n;
}

function furnishRoom({ addBox, addCyl, room, Lv, ceil, type, windows, inRoom, gore = false }) {
  const d = room.door, into = d.into;
  // local frame: a along the door wall, b = depth from the door wall's room-side face toward the far wall
  const along = d.axis === 'x' ? [room.ax0 ?? room.x0, room.x1] : [room.z0, room.z1];   // ax0: lay out from here (the lobby's model sliver stays an alcove)
  const farEdge = d.axis === 'x' ? (into > 0 ? room.z1 : room.z0) : (into > 0 ? room.x1 : room.x0);
  const SIDE = 0.1, NEAR = 0.17, FAR = room.id[0] === 'o' || room.id === 'entry' ? 0.06 : 0.3;   // outer rooms end at the outer wall's face; courtyard rooms have the facade inside their cells
  const a0 = along[0] + SIDE, a1 = along[1] - SIDE;
  // the courtyard facade zigzags, so a room can be deeper in one part than another: depth profile along the door wall
  const ptAt = (u, b) => (d.axis === 'x' ? [u, d.c + into * (NEAR + b)] : [d.c + into * (NEAR + b), u]);
  const full = Math.abs(farEdge - d.c) - NEAR;
  const prof = [];
  for (let u = along[0] + 0.05; u < along[1]; u += 0.1) {
    let b = 0.05; while (b < full + 0.05 && inRoom(room.id, ...ptAt(u, b))) b += 0.1;
    prof.push([u, Math.max(0, b - 0.1 - FAR)]);
  }
  const Dat = (u0, u1) => { let m = Infinity; for (const [u, dd] of prof) if (u >= u0 - 0.05 && u <= u1 + 0.05) m = Math.min(m, dd); return m === Infinity ? 0 : m; };
  const D = Dat(a0, a1);                                   // depth that is inside the room all along its width
  const W = a1 - a0;
  if (type === 'room15') return 0;                       // furnished at runtime from the owner's video (src/room15.js)
  if (W < 1.6 || (D < 0.9 && !['default', 'store', 'common'].includes(type))) { (furnishAll.skipped ||= []).push(`${room.id} too small ${W.toFixed(1)}x${D.toFixed(1)}`); return 0; }
  let n = 0;
  const toW = (b) => d.c + into * (NEAR + b);
  const B = (u0, u1, y0, y1, b0, b1, col) => {           // box in local coords (y relative to the floor)
    const p0 = toW(b0), p1 = toW(b1);
    if (d.axis === 'x') addBox(Math.min(u0, u1), Math.max(u0, u1), Lv + y0, Lv + y1, Math.min(p0, p1), Math.max(p0, p1), col);
    else addBox(Math.min(p0, p1), Math.max(p0, p1), Lv + y0, Lv + y1, Math.min(u0, u1), Math.max(u0, u1), col);
    if (process.env.DEBUG_OUT && y1 - y0 > 0.3) { const pm = (p0 + p1) / 2, um = (u0 + u1) / 2, [x, z] = d.axis === 'x' ? [um, pm] : [pm, um]; if (!inRoom(room.id, x, z)) console.log('OUTSIDE', room.id, type, Lv, x.toFixed(2), z.toFixed(2), col, globalThis.__labelAt?.(x, z)); }
    n++;
  };
  const C = (u, y, b, r, h, ax, col) => {                  // cylinder; ax: 'y', 'a' (along), 'b' (depth)
    const p = toW(b), pos = d.axis === 'x' ? [u, Lv + y, p] : [p, Lv + y, u];
    const axis = ax === 'y' ? 'y' : (ax === 'a') === (d.axis === 'x') ? 'x' : 'z';
    addCyl(pos, r, h, axis, col); n++;
  };
  const doorU = d.u, clearOfDoor = (u0, u1) => u1 < doorU - d.w / 2 - 0.15 || u0 > doorU + d.w / 2 + 0.15;
  const swingB = (u0, u1) => (clearOfDoor(u0, u1) ? 0 : d.w + 0.1);      // the door leaf sweeps this deep into the room
  const h = hash(room.x0, room.z0, Lv);
  // windows on the far wall of this room on this floor
  const farPlane = farEdge;
  const myWins = windows.filter((w) => {
    if (w.axis !== d.axis || w.u1 <= a0 || w.u0 >= a1 || w.y0 < Lv - 0.2 || w.y0 > Lv + 2.2) return false;
    const off = (w.plane - d.c) * into;                     // the window's wall, measured from the door wall
    return off > 1.2 && off < Math.abs(farPlane - d.c) + 0.4;
  });
  const curtains = (col) => {
    for (const w of myWins) {
      if (w.y0 - Lv < 0.7) continue;                       // glazed door side panels: no curtains
      const top = Math.min(w.y1 - Lv + 0.25, ceil - Lv - 0.1);
      const bw = Math.min(Dat(w.u0, w.u1) + 0.02, (w.plane - d.c) * into - NEAR - FAR + 0.02);   // just inside that wall
      for (const [u0, u1] of [[w.u0 - 0.2, w.u0 + 0.12], [w.u1 - 0.12, w.u1 + 0.2]]) B(Math.max(a0, u0), Math.min(a1, u1), Math.max(0.3, w.y0 - Lv - 0.25), top, bw - 0.12, bw - 0.06, col);
      B(Math.max(a0, w.u0 - 0.25), Math.min(a1, w.u1 + 0.25), top, top + 0.025, bw - 0.1, bw - 0.07, FCOL.frame);   // rod
    }
  };
  const wallPaint = (side, col) => {                       // a whole side wall painted (side -1: a0 wall, +1: a1 wall)
    const u = side < 0 ? along[0] + 0.061 : along[1] - 0.061;
    B(u, u + side * -0.006, 0.12, ceil - Lv - 0.02, 0.0, D + FAR - 0.3, col);
  };
  const plasticChair = (u, b, facing) => {                 // facing: +1 faces +b, -1 faces -b
    B(u - 0.22, u + 0.22, 0.42, 0.46, b - 0.2, b + 0.2, FCOL.plastic);
    B(u - 0.22, u + 0.22, 0.46, 0.85, b - facing * 0.22, b - facing * 0.18, FCOL.plastic);
    for (const du of [-0.18, 0.18]) for (const db of [-0.16, 0.16]) B(u + du - 0.02, u + du + 0.02, 0, 0.42, b + db - 0.02, b + db + 0.02, FCOL.plastic);
  };
  const officeChair = (u, b, facing) => {
    B(u - 0.23, u + 0.23, 0.44, 0.5, b - 0.22, b + 0.22, FCOL.frame);
    B(u - 0.21, u + 0.21, 0.55, 0.95, b - facing * 0.24, b - facing * 0.2, FCOL.frame);
    C(u, 0.22, b, 0.03, 0.42, 'y', FCOL.frame);
    B(u - 0.25, u + 0.25, 0.0, 0.04, b - 0.04, b + 0.04, FCOL.frame); B(u - 0.04, u + 0.04, 0.0, 0.04, b - 0.25, b + 0.25, FCOL.frame);
  };
  const bed = (u0, u1, b0, b1, headAtB1 = true, mattress = FCOL.mattress, along = 'b') => {   // metal frame bed
    if (along === 'a') {                                    // lying along the wall: head at u0
      B(u0, u1, 0.3, 0.36, b0, b1, FCOL.frame); B(u0 + 0.03, u1 - 0.03, 0.36, 0.5, b0 + 0.03, b1 - 0.03, mattress);
      B(u0 + 0.08, u0 + 0.42, 0.5, 0.6, b0 + 0.12, b1 - 0.12, FCOL.sheet); B(u0 + 0.55, u0 + 1.25, 0.5, 0.56, b0 + 0.04, b1 - 0.04, FCOL.sheet);
      B(u0, u0 + 0.04, 0, 1.0, b0, b1, FCOL.frame); B(u1 - 0.04, u1, 0, 0.7, b0, b1, FCOL.frame);
      return;
    }
    B(u0, u1, 0.3, 0.36, b0, b1, FCOL.frame);                                  // frame
    B(u0 + 0.03, u1 - 0.03, 0.36, 0.5, b0 + 0.03, b1 - 0.03, mattress);
    const hb = headAtB1 ? b1 : b0, sgn = headAtB1 ? -1 : 1;
    B(u0 + 0.12, u1 - 0.12, 0.5, 0.6, hb + sgn * 0.08, hb + sgn * 0.42, FCOL.sheet);    // pillow
    B(u0 + 0.04, u1 - 0.04, 0.5, 0.56, hb + sgn * 0.55, hb + sgn * 1.25, FCOL.sheet);   // folded sheet / blanket
    B(u0, u1, 0.0, 1.0, hb - sgn * 0.0, hb + sgn * 0.04, FCOL.frame);                    // headboard (bars read as a panel)
    B(u0, u1, 0.0, 0.7, (headAtB1 ? b0 : b1) - sgn * 0.04, headAtB1 ? b0 : b1, FCOL.frame);
  };
  const almirah = (u0, u1, b0, b1, col = FCOL.steel) => {
    B(u0, u1, 0, 1.85, b0, b1, col);
    const um = (u0 + u1) / 2, front = b1 > b0 ? b1 : b0, s = b1 > b0 ? 1 : -1;
    B(um - 0.005, um + 0.005, 0.1, 1.75, front, front + s * 0.006, FCOL.frame);           // door split
    B(um + 0.04, um + 0.07, 0.9, 1.1, front, front + s * 0.02, FCOL.steelGrey);           // handle
  };
  const rack = (u0, u1, b0, b1, H = 1.8) => {               // steel slotted angle rack
    for (const u of [u0, u1 - 0.04]) for (const b of [b0, b1 - 0.04]) B(u, u + 0.04, 0, H, b, b + 0.04, FCOL.steelGrey);
    for (let k = 0; k < 4; k++) { const y = 0.1 + k * (H - 0.2) / 3; B(u0, u1, y, y + 0.02, b0, b1, FCOL.steelGrey); }
  };

  // the wall facing the door, painted around its windows (mint window wall in every bedroom, video)
  // exact depth of the far wall's room-side face (the 0.1 m depth profile is too coarse for a 6 mm paint layer):
  // find the far cell edge where the room is shallowest, to 5 mm; courtyard facades stand 0.25 m inside their cells
  const outerRoom = room.id[0] === 'o' || room.id === 'entry';
  let faceB = D + (outerRoom ? 0.155 : 0.13);
  {
    let uMin = null, dMin = Infinity;
    for (const [u, dd] of prof) if (u >= a0 && u <= a1 && dd < dMin) { dMin = dd; uMin = u; }
    if (uMin != null) {
      let lo = Math.max(0, dMin - 0.2), hi = Math.min(full + 0.1, dMin + FAR + 0.3);
      if (inRoom(room.id, ...ptAt(uMin, lo)) && !inRoom(room.id, ...ptAt(uMin, hi))) {
        while (hi - lo > 0.005) { const m = (lo + hi) / 2; if (inRoom(room.id, ...ptAt(uMin, m))) lo = m; else hi = m; }
        faceB = lo - (outerRoom ? 0 : 0.25) - 0.004;
      }
    }
  }
  const paintFar = (col, yTop = ceil - Lv - 0.02) => {
    if (process.env.DEBUG_PAINT && room.id === process.env.DEBUG_PAINT && Lv < 1) console.log('PAINT', room.id, 'D', D.toFixed(3), 'faceB', faceB.toFixed(3), 'full', full.toFixed(3), 'wins', JSON.stringify(myWins.map((w) => [w.plane.toFixed(2), w.u0.toFixed(2), w.u1.toFixed(2), w.y0.toFixed(2), ((w.plane - d.c) * into - NEAR - faceB).toFixed(2)])), 'prof', prof.filter((_, i) => i % 5 === 0).map(([u, dd]) => dd.toFixed(2)).join(','));
    const u0 = along[0] + 0.065, u1 = along[1] - 0.065;
    const ws = myWins.filter((w) => Math.abs((w.plane - d.c) * into - NEAR - faceB) < 0.4).map((w) => [Math.max(u0, w.u0 - 0.14), Math.min(u1, w.u1 + 0.14), w.y0 - Lv - 0.12, w.y1 - Lv + 0.06]).sort((p, q) => p[0] - q[0]);
    let u = u0;
    for (const [w0, w1, y0, y1] of ws) {
      if (w0 > u) B(u, w0, 0.12, yTop, faceB - 0.006, faceB, col);
      B(w0, w1, 0.12, Math.max(0.12, y0), faceB - 0.006, faceB, col); if (y1 < yTop) B(w0, w1, y1, yTop, faceB - 0.006, faceB, col);
      u = Math.max(u, w1);
    }
    if (u < u1) B(u, u1, 0.12, yTop, faceB - 0.006, faceB, col);
  };
  const desk = (u0, u1, D = Dat(u0, u1)) => {              // study table with its own bookshelf hutch and a black chair (video)
    const dd = 0.55;
    B(u0, u1, 0.72, 0.76, D - dd, D, FCOL.wood);
    B(u0, u0 + 0.03, 0, 0.72, D - dd, D, FCOL.wood); B(u1 - 0.03, u1, 0, 0.72, D - dd, D, FCOL.wood);
    B(u1 - 0.36, u1 - 0.03, 0.5, 0.72, D - dd + 0.02, D, FCOL.wood);                    // drawer
    B(u0, u1, 0.76, 1.62, D - 0.03, D, FCOL.wood);                                      // hutch back
    for (const y of [1.15, 1.59]) B(u0, u1, y, y + 0.03, D - 0.3, D, FCOL.wood);
    for (const uu of [u0, (u0 + u1) / 2 - 0.015, u1 - 0.03]) B(uu, uu + 0.03, 0.76, 1.62, D - 0.3, D, FCOL.wood);
    for (let k = 0; k < 3; k++) { const uu = u0 + 0.06 + k * (u1 - u0 - 0.2) / 3; B(uu, uu + 0.12, 1.18, 1.36 + hash(uu, k) * 0.12, D - 0.25, D - 0.05, FCOL.paint[(k + Math.floor(hash(u0) * 4)) % 4]); }
    officeChair((u0 + u1) / 2, D - dd - 0.28, 1);
  };
  const deskAt = (u0, u1) => {                             // a table against the door wall (small rooms)
    B(u0, u1, 0.72, 0.76, 0, 0.55, FCOL.wood); B(u0, u0 + 0.03, 0, 0.72, 0, 0.55, FCOL.wood); B(u1 - 0.03, u1, 0, 0.72, 0, 0.55, FCOL.wood);
    B(u0, u1, 0.76, 1.5, -0.005, 0.02, FCOL.wood); B(u0, u1, 1.15, 1.18, 0, 0.28, FCOL.wood);
    officeChair((u0 + u1) / 2, 0.85, -1);
  };
  if (type === 'default') {
    curtains(FCOL.curtainGrey);
    paintFar(FCOL.mint); wallPaint(-1, FCOL.mint);
    // the courtyard facade zigzags: find the widest stretch deep enough for a bed and lay the room out there
    const need = 2.15;
    let zs0 = null, best = [a0, a0];
    for (const [u, dd] of prof) {
      const ok = u >= a0 - 0.05 && u <= a1 + 0.05 && dd >= need;
      if (ok && zs0 === null) zs0 = u;
      if ((!ok || u > a1) && zs0 !== null) { if (u - zs0 > best[1] - best[0]) best = [zs0, u - 0.1]; zs0 = null; }
    }
    if (zs0 !== null && a1 - zs0 > best[1] - best[0]) best = [zs0, a1];
    const L = Math.max(a0, best[0]), R = Math.min(a1, best[1]), Dz = Dat(L, R);
    const bedW = 0.9, used = [];
    if (R - L >= 2.3) {
      const bedL = Math.max(1.8, Math.min(1.95, Dz - 0.6));
      bed(L, L + bedW, Dz - bedL, Dz);                                                       // two beds along the walls,
      bed(R - bedW, R, Dz - bedL, Dz);                                                       // heads at the window wall
      used.push([L, L + bedW, Dz - bedL], [R - bedW, R, Dz - bedL]);
      const du0 = L + bedW + 0.05, du1 = R - bedW - 0.05, dw = (du1 - du0 - 0.04) / 2;
      if (dw > 0.5) { desk(du0, du0 + dw, Dz); desk(du1 - dw, du1, Dz); }                  // two tables under the window
      else deskSlots(2);
    } else {
      // too narrow for two beds side by side: beds head to foot along the window wall where the room allows, else one
      const Df = Dat(a0, a1);
      if (W >= 4.0 && Df >= 1.0) { bed(a0, a0 + 1.95, Df - bedW, Df, true, FCOL.mattress, 'a'); bed(a0 + 2.05, a0 + 4.0, Df - bedW, Df, true, FCOL.mattress, 'a'); }
      else if (Df >= 1.0) bed(a0, Math.min(a1, a0 + 1.95), Df - bedW, Df, true, FCOL.mattress, 'a');
      deskSlots(2);
    }
    // two steel cupboards by the door: first free slots along the door wall
    let nA = 0;
    for (const [u0, u1] of [[a0, a0 + 0.85], [a1 - 0.85, a1], [a0 + 0.9, a0 + 1.75], [a1 - 1.75, a1 - 0.9]]) {
      if (nA >= 2 || !clearOfDoor(u0, u1) || Dat(u0, u1) < 0.6 || used.some(([p, q, bmin]) => u0 < q && u1 > p && (bmin === undefined || bmin < 0.55))) continue;
      almirah(u0, u1, 0, 0.5, nA ? FCOL.steel : FCOL.steelDark); used.push([u0, u1]); nA++;
    }
    const mu = doorU + (doorU - a0 > a1 - doorU ? -1 : 1) * (d.w / 2 + 0.3);
    if (mu - 0.2 > a0 && mu + 0.2 < a1 && !used.some(([p, q, bmin]) => mu + 0.2 > p && mu - 0.2 < q && (bmin === undefined || bmin < 0.1))) { B(mu - 0.2, mu + 0.2, 1.3, 1.85, -0.005, 0.02, FCOL.fan); B(mu - 0.16, mu + 0.16, 1.34, 1.81, 0.02, 0.025, FCOL.mirror); }
    C(a1 - 0.08, Math.min(ceil - Lv - 0.45, 2.35), Math.max(0.6, Dz * 0.45), 0.22, 0.08, 'a', FCOL.fan);
    const bb = Dz - 2.2;
    if (bb > 0.6 && R - L >= 2.3) for (const k of [0, 1]) C(R - 0.25 - k * 0.42, 0.17, bb, 0.17, 0.34, 'y', FCOL.bucketBlue);
    function deskSlots(nWant) {                              // tables against the door wall where the door leaves room
      let k = 0;
      for (const [u0, u1] of [[a1 - 0.85, a1], [a0, a0 + 0.85], [a1 - 1.75, a1 - 0.9], [a0 + 0.9, a0 + 1.75]]) {
        if (k >= nWant || !clearOfDoor(u0, u1) || Dat(u0, u1) < 0.6 || used.some(([p, q, bmin]) => u0 < q && u1 > p && (bmin === undefined || bmin < 0.65))) continue;
        deskAt(u0, u1); used.push([u0, u1]); k++;
      }
    }
  } else if (type === 'bath') {
    // REST ROOM (video, the same in all three): a yellow-tiled screen inside the door; a row of WC / shower cubicles
    // down one side wall (beige grooved laminate partitions ~2 m, white doors, a steel rail along the top); a free-
    // standing laminate island with a black granite counter, round basins and a framed mirror over each; on the far
    // side a urinal bank on a white half-wall capped with yellow tiles and a row of showers along the other side
    // wall. White tiles to 2 m everywhere with a solid yellow band low and a yellow/white checker band high, grey
    // floor tiles, high windows with exhaust fans (outer wall), tubelights, a notice board and switches by the door.
    // tiles sit on the wall faces: the outer/bump far wall face is the room's edge; the bump side walls are 0.2 thick
    const Wf = along[1] - along[0], sf = 0.105, fb = Math.abs(farEdge - d.c) - NEAR - 0.004;
    const mir = doorU - along[0] < along[1] - doorU;                // the cubicle row goes down the side away from the door
    const U = (q) => (mir ? along[1] - q : along[0] + q);
    const BS = (q0, q1, y0, y1, b0, b1, col) => B(Math.min(U(q0), U(q1)), Math.max(U(q0), U(q1)), y0, y1, b0, b1, col);
    const CS = (q, y, b, r, hh, ax, col) => C(U(q), y, b, r, hh, ax, col);
    const sDoor = mir ? along[1] - doorU : doorU - along[0];
    B(along[0] + 0.06, along[1] - 0.06, 0.006, 0.012, -0.02, fb, FCOL.floorGrey);
    // wall tiles: [s0, s1] along a wall; wall: 'L' (s = sf side), 'R' (far side wall), 'F' (far), 'N' (door wall)
    const tile = (wall, t0, t1, y0, y1, col, dep) => {
      if (wall === 'L') BS(sf, sf + dep, y0, y1, t0, t1, col);
      else if (wall === 'R') BS(Wf - sf - dep, Wf - sf, y0, y1, t0, t1, col);
      else if (wall === 'F') BS(t0, t1, y0, y1, fb - dep, fb, col);
      else BS(t0, t1, y0, y1, -0.02, -0.02 + dep, col);
    };
    const tiled = (wall, t0, t1) => {
      if (t1 - t0 < 0.05) return;
      tile(wall, t0, t1, 0.1, 2.05, FCOL.tileW, 0.006);
      tile(wall, t0, t1, 0.62, 0.78, FCOL.tileY, 0.01);
      for (let t = t0; t < t1 - 0.05; t += 0.6) tile(wall, t, Math.min(t1, t + 0.3), 1.75, 2.05, FCOL.tileY, 0.01);
    };
    tiled('L', -0.02, fb); tiled('R', -0.02, fb); tiled('F', sf, Wf - sf);
    tiled('N', sf, sDoor - d.w / 2 - 0.08); tiled('N', sDoor + d.w / 2 + 0.08, Wf - sf);
    for (const k of [0.3, 0.7]) B(a0 + W * k - 0.6, a0 + W * k + 0.6, ceil - Lv - 0.05, ceil - Lv, fb * 0.5 - 0.05, fb * 0.5 + 0.05, FCOL.fan);
    // the screen just inside the door, a mug left on top
    const sc0 = Math.max(doorU - 0.85, a0 + 1.6), sc1 = Math.min(doorU + 0.85, a1 - 0.2);
    B(sc0, sc1, 0, 1.85, d.w + 0.15, d.w + 0.27, FCOL.tileY);
    C(sc1 - 0.25, 1.92, d.w + 0.21, 0.05, 0.12, 'y', FCOL.curtainRed);
    // a row of cubicles against a side wall: q0..q1 across (q1 = front with the doors), b0..b1 along
    const cubicles = (q0, q1, b0, b1, wcFirst) => {
      const front = q1 > q0 ? 1 : -1, n = Math.max(1, Math.floor((b1 - b0) / 1.02)), cw = (b1 - b0) / n;
      for (let i = 0; i <= n; i++) { const bb = b0 + i * cw; BS(q0, q1, 0.12, 2.05, bb - 0.02, bb + 0.02, FCOL.laminate); }
      BS(q1 - front * 0.035, q1, 2.06, 2.09, b0, b1, FCOL.steelGrey);                           // rail along the top
      for (let i = 0; i < n; i++) {
        const c0 = b0 + i * cw, c1 = c0 + cw, cm = (c0 + c1) / 2, dw = Math.min(0.82, cw - 0.2);
        BS(q1 - front * 0.035, q1, 0.12, 2.05, c0, cm - dw / 2, FCOL.laminate);
        BS(q1 - front * 0.035, q1, 0.12, 2.05, cm + dw / 2, c1, FCOL.laminate);
        // the door: a real leaf at runtime (src/doors.js 'stall'), a gap under it; record the cubicle for hiding
        {
          const aD = U(q1 - front * 0.0175), qa = U(q0), qb = U(q1), wb = (bb) => toW(bb);
          const rect = d.axis === 'x' ? [Math.min(qa, qb), Math.max(qa, qb), Math.min(wb(c0), wb(c1)), Math.max(wb(c0), wb(c1))]
            : [Math.min(wb(c0), wb(c1)), Math.max(wb(c0), wb(c1)), Math.min(qa, qb), Math.max(qa, qb)];
          const rec = d.axis === 'x' ? { x: aD, z: wb(cm), axis: 'z' } : { x: wb(cm), z: aD, axis: 'x' };
          furnishAll.stalls.push({ ...rec, y: Lv + 0.17, w: dw - 0.02, h: 1.83, kind: 'stall', stall: rect.map((v) => +v.toFixed(3)), wc: wcFirst !== null && (i % 2 === 0) === wcFirst });
        }
        const back = q0 + front * 0.01;
        if (wcFirst !== null && (i % 2 === 0) === wcFirst) {                                      // wall-hung WC, white seat, flush plate
          BS(back, back + front * 0.5, 0.36, 0.44, cm - 0.18, cm + 0.18, FCOL.tileW);
          BS(back + front * 0.02, back + front * 0.51, 0.44, 0.47, cm - 0.19, cm + 0.19, FCOL.sheet);
          BS(back, back + front * 0.08, 0.3, 0.9, cm - 0.2, cm + 0.2, FCOL.tileW);
          BS(back, back + front * 0.015, 1.0, 1.15, cm - 0.1, cm + 0.1, FCOL.steelGrey);
          CS(back + front * 0.08, 0.7, cm + 0.32, 0.05, 0.1, 'b', FCOL.sheet);         // tissue roll
          // filth (horror): shit in the bowl and on the seat, smeared up the wall, on the floor, wet tissue everywhere
          const hh = hash(cm, q0, Lv);
          for (let k = 0; k < 3; k++) BS(back + front * (0.18 + k * 0.08), back + front * (0.26 + k * 0.08), 0.47, 0.5 + hash(k, cm) * 0.05, cm - 0.06 + k * 0.04, cm + 0.02 + k * 0.03, k % 2 ? FCOL.filthDark : FCOL.filth);
          BS(back + front * 0.005, back + front * 0.012, 0.95, 1.5 + hh * 0.3, cm - 0.18, cm - 0.02, FCOL.filth);
          BS(back + front * 0.005, back + front * 0.012, 1.1, 1.35, cm + 0.05, cm + 0.2, FCOL.filthDark);
          BS(back + front * 0.6, back + front * 0.95, 0.012, 0.018, cm - 0.25 + hh * 0.1, cm + 0.1 + hh * 0.1, FCOL.filth);
          BS(back + front * 0.4, back + front * 0.9, 0.012, 0.016, cm - 0.3, cm + 0.3, FCOL.urine);
          for (let k = 0; k < 4; k++) { const q = back + front * (0.3 + hash(k, cm, 2) * 0.6), bq = cm - 0.3 + hash(cm, k) * 0.6; BS(q, q + front * 0.12, 0.012, 0.02, bq, bq + 0.25, FCOL.tissue); }
        } else {                                                               // shower head and mixer
          CS(back + front * 0.12, 2.0, cm, 0.07, 0.03, 'y', FCOL.steelGrey);
          BS(back, back + front * 0.14, 1.98, 2.0, cm - 0.015, cm + 0.015, FCOL.steelGrey);
          BS(back, back + front * 0.06, 1.0, 1.08, cm - 0.12, cm + 0.12, FCOL.steelGrey);
          CS(back + front * 0.2, 0.17, cm - 0.2, 0.15, 0.3, 'y', FCOL.bucketBlue);      // bucket
        }
      }
    };
    const cD = Math.min(1.9, Wf * 0.24);                    // deep enough to step in past the WC (player is 0.6 m wide)
    cubicles(sf, cD, 0.15, fb, true);                                       // WC row (alternating with showers)
    // the island: counter and mirrors facing the cubicle row
    const sI = cD + 1.3 + 0.55, bI0 = Math.max(1.5, d.w + 0.5), bI1 = fb - 1.35;
    const halfB = fb - 0.9, sR = Wf - sf - 1.15;
    if (bI1 - bI0 > 1.1 && sI + 0.1 < sR - 1.0) {
      BS(sI, sI + 0.1, 0.0, 2.05, bI0, bI1, FCOL.laminate);
      BS(sI, sI + 0.1, 1.8, 2.05, bI0 - 0.005, bI0 + 0.3, FCOL.tileY);       // yellow strip at its top end
      BS(sI - 0.55, sI, 0.0, 0.84, bI0 + 0.1, bI1 - 0.1, FCOL.granite);
      for (let bq = bI0 + 0.5; bq < bI1 - 0.35; bq += 0.85) {
        CS(sI - 0.28, 0.845, bq, 0.19, 0.012, 'y', FCOL.tileW);
        BS(sI - 0.06, sI - 0.02, 0.84, 1.08, bq - 0.015, bq + 0.015, FCOL.steelGrey);
        BS(sI - 0.012, sI, 1.15, 1.85, bq - 0.29, bq + 0.29, FCOL.fan);
        BS(sI - 0.016, sI - 0.012, 1.2, 1.8, bq - 0.24, bq + 0.24, FCOL.mirror);
      }
      BS(sI + 0.1, sI + 0.11, 1.4, 1.8, bI1 - 0.55, bI1 - 0.15, FCOL.yellow);   // 'please flush the toilet before you leave'
    }
    // urinal half-wall, capped with yellow tiles, across the far part of the room; urinals on the door side
    const hw0 = Math.max(sI + 1.0, sR - 0.25 - 4 * 0.72);
    if (sR - hw0 > 0.9) {
      BS(hw0, sR, 0.0, 1.5, halfB - 0.05, halfB + 0.05, FCOL.tileW);
      BS(hw0, sR, 1.5, 1.82, halfB - 0.06, halfB + 0.06, FCOL.tileY);
      for (let q = sR - 0.45; q > hw0 + 0.3; q -= 0.72) {
        BS(q - 0.18, q + 0.18, 0.45, 1.05, halfB - 0.42, halfB - 0.05, FCOL.tileW);
        BS(q - 0.02, q + 0.02, 1.05, 1.42, halfB - 0.1, halfB - 0.06, FCOL.steelGrey);
        BS(q - 0.06, q + 0.06, 1.3, 1.36, halfB - 0.13, halfB - 0.05, FCOL.steelGrey);
      }
    }
    // shower row down the other side wall, up to the half-wall
    const bS0 = sDoor + d.w / 2 + 0.3 > sR ? d.w + 0.5 : 0.15;
    if (halfB - 0.05 - bS0 > 0.95) cubicles(Wf - sf, sR, bS0, halfB - 0.05, null);   // all showers
    // notice board and switchboard beside the door (door wall)
    const nq = sDoor - d.w / 2 - 0.95;
    if (nq - 0.35 > cD + 0.2) { BS(nq - 0.35, nq + 0.35, 1.45, 1.9, -0.01, 0.0, FCOL.sheet); BS(nq - 0.3, nq + 0.3, 1.5, 1.56, 0.0, 0.004, FCOL.paint[0]); BS(nq - 0.3, nq + 0.1, 1.62, 1.66, 0.0, 0.004, FCOL.screen); BS(nq - 0.3, nq + 0.3, 1.78, 1.81, 0.0, 0.004, FCOL.paint[1]); }
    const wq = sDoor + d.w / 2 + 0.35;
    if (wq + 0.35 < sR - 0.1 || bS0 > 0.5) BS(wq, wq + 0.35, 1.2, 1.45, -0.01, 0.01, FCOL.sheet);
    // horror: the rest rooms are filthy — grime and urine puddles on the floor, rust and filth running down the tiles,
    // filth trodden out of the cubicles, a bloody handprint on a mirror, wet tissue
    for (let k = 0; k < 16; k++) {
      const q = sf + 0.3 + hash(k, Lv, 1) * (Wf - 2 * sf - 0.9), bq = 0.3 + hash(k, Lv, 2) * (fb - 0.9), sz = 0.25 + hash(k, 3) * 0.6;
      BS(q, q + sz, 0.013, 0.016 + (k % 3) * 0.001, bq, bq + sz * (0.6 + hash(k, 4)), [FCOL.grime, FCOL.urine, FCOL.filthDark, FCOL.grime][k % 4]);
    }
    for (let k = 0; k < 10; k++) {                             // streaks down the tiled walls
      const t = 0.3 + hash(k, Lv, 5) * (fb - 0.6), w = 0.04 + hash(k, 6) * 0.1, y1 = 1.2 + hash(k, 7) * 0.85, col = k % 3 ? FCOL.rust : FCOL.filth;
      if (k % 2) BS(Wf - sf - 0.012, Wf - sf - 0.008, 0.1, y1, t, t + w, col); else BS(sf + 0.008, sf + 0.012, 0.1, y1, t, t + w, col);
    }
    for (let k = 0; k < 6; k++) { const bq = 0.3 + hash(k, Lv, 8) * (fb - 0.6); BS(cD + 0.05 + k * 0.1, cD + 0.35 + k * 0.1, 0.012, 0.017, bq, bq + 0.12, FCOL.filth); }   // footprints out of the stalls
    if (bI1 - bI0 > 1.1) { const bq = bI0 + 0.5; BS(sI - 0.02, sI - 0.018, 1.35, 1.52, bq - 0.08, bq + 0.06, FCOL.blood); BS(sI - 0.02, sI - 0.018, 1.2, 1.36, bq - 0.04, bq + 0.0, FCOL.blood); }
    for (let k = 0; k < 8; k++) { const q = sf + 0.4 + hash(k, Lv, 9) * (Wf - 2 * sf - 0.8), bq = 0.4 + hash(k, 10) * (fb - 0.8); BS(q, q + 0.1, 0.012, 0.02, bq, bq + 0.22, FCOL.tissue); }
  } else if (type === 'study') {
    curtains(FCOL.curtainRed);
    paintFar(FCOL.mint);                                   // mint walls (video 58 s)
    // desks along both side walls and the far wall, plastic chairs facing the walls
    const deskD = 0.6;
    for (const s of [-1, 1]) {
      const u0 = s < 0 ? a0 : a1 - deskD, u1 = s < 0 ? a0 + deskD : a1;
      const b0 = 0.6, b1 = D - deskD - 0.05;
      if (b1 - b0 < 0.6) continue;
      B(u0, u1, 0.72, 0.76, b0, b1, FCOL.wood);
      for (const b of [b0, b1 - 0.04]) B(u0, u1, 0, 0.72, b, b + 0.04, FCOL.wood);
      for (let b = b0 + 0.35; b < b1 - 0.25; b += 0.75) plasticChairSide(s < 0 ? u1 + 0.25 : u0 - 0.25, b, s);
    }
    B(a0, a1, 0.72, 0.76, D - deskD, D, FCOL.wood);
    for (const u of [a0, a1 - 0.04]) B(u, u + 0.04, 0, 0.72, D - deskD, D, FCOL.wood);
    for (let u = a0 + deskD + 0.4; u < a1 - deskD - 0.3; u += 0.75) plasticChair(u, D - deskD - 0.25, 1);
    // owner: the study is deep now; rows of back-to-back tables down the middle with chairs both sides
    if (D > 4) {
      const cb0 = 1.7, cb1 = D - deskD - 1.2, inner0 = a0 + deskD + 1.25, inner1 = a1 - deskD - 1.25;
      const nRow = Math.max(1, Math.floor((inner1 - inner0 + 0.6) / 2.6));
      for (let i = 0; i < nRow; i++) {
        const uc = inner0 + (inner1 - inner0) * (nRow === 1 ? 0.5 : i / (nRow - 1));
        if (cb1 - cb0 < 1) break;
        B(uc - 0.6, uc + 0.6, 0.72, 0.76, cb0, cb1, FCOL.wood);
        for (const du of [-0.57, 0.53]) for (const bb of [cb0 + 0.02, cb1 - 0.06]) B(uc + du, uc + du + 0.04, 0, 0.72, bb, bb + 0.04, FCOL.frame);
        B(uc - 0.01, uc + 0.01, 0.76, 1.05, cb0, cb1, FCOL.lightWood);                            // low divider
        for (let b = cb0 + 0.4; b < cb1 - 0.25; b += 0.8) { plasticChairSide(uc - 0.85, b, 1); plasticChairSide(uc + 0.85, b, -1); }
      }
    }
    // TV under a red cloth on the door wall
    const tu = (doorU - a0 > a1 - doorU) ? (a0 + doorU - d.w / 2) / 2 : (a1 + doorU + d.w / 2) / 2;
    B(tu - 0.55, tu + 0.55, 1.3, 1.95, 0.0, 0.08, FCOL.curtainRed);
  } else if (type === 'common') {
    // the open front common area (video): west, the library (L bookcase in the courtyard corner, a bench desk with
    // plastic chairs along the wall, TV and whiteboard on stands, the wooden French doors to the courtyard);
    // east, open to it (owner: no glass), the games room (yellow wall with a big painting and a long
    // laminate desk with plastic chairs, two carrom boards on X stands). Both open onto the corridor.
    curtains(FCOL.curtainGrey);
    // the common room's side walls are courtyard facades (0.26 m inside its cells): lay out from their faces
    const a0 = along[0] + 0.27, a1 = along[1] - 0.27;
    const gU = room.glassU ?? (a0 + a1) / 2, mainU = room.mainDoorU ?? (a0 + gU) / 2, top = ceil - Lv - 0.02;
    // owner: no glass partition; library and games room are one open space (gU only splits the layout)
    // library: bookcase in the far corner (along the courtyard wall and down the side wall)
    const book = (u0, u1, b0, b1, alongA) => {
      B(u0, u1, 0, 1.85, b0, b1, FCOL.lightWood);
      const n2 = Math.floor(((alongA ? u1 - u0 : b1 - b0) - 0.04) / 0.38);
      for (let r = 0; r < 5; r++) for (let j = 0; j < n2; j++) {
        const y = 0.08 + r * 0.36, c0 = (alongA ? u0 : b0) + 0.04 + j * 0.38;
        const col = hash(r, j, u0) < 0.7 ? FCOL.paint[(r + j) % 4] : FCOL.frame;
        if (alongA) B(c0, c0 + 0.3, y, y + 0.27, b0 - 0.012, b0, col); else B(u1, u1 + 0.012, y, y + 0.27, c0, c0 + 0.3, col);
      }
    };
    book(a0 + 0.36, a0 + 1.55, D - 0.36, D, true);
    book(a0, a0 + 0.36, D - 1.75, D, false);
    // bench desk down the side wall with plastic chairs facing it, a big painting above
    const bd0 = room.ax0 != null ? 2.35 : 0.45, bd1 = D - 1.95;                  // past the alcove by the corridor
    if (room.ax0 != null) { const u = (room.x0 + room.ax0) / 2; C(u, 0.2, 1.0, 0.2, 0.4, 'y', FCOL.carton); C(u, 0.75, 1.0, 0.3, 0.7, 'y', FCOL.paint[3]); }
    if (bd1 - bd0 > 1) {
      B(a0, a0 + 0.5, 0.73, 0.77, bd0, bd1, FCOL.lightWood);
      for (let bq = bd0; bq <= bd1 - 0.03; bq += Math.max(0.9, (bd1 - bd0 - 0.04) / Math.ceil((bd1 - bd0) / 1.4))) B(a0 + 0.03, a0 + 0.47, 0, 0.73, bq, bq + 0.04, FCOL.frame);
      for (let bq = bd0 + 0.4; bq < bd1 - 0.2; bq += 0.75) plasticChairSide(a0 + 0.75, bq, -1);
      const pu = a0 - 0.002; B(pu, pu + 0.02, 1.45, 2.35, (bd0 + bd1) / 2 - 0.65, (bd0 + bd1) / 2 + 0.65, FCOL.curtainRed);
      B(pu + 0.02, pu + 0.025, 1.6, 2.2, (bd0 + bd1) / 2 - 0.5, (bd0 + bd1) / 2 + 0.1, FCOL.yellow);
    }
    // TV and whiteboard on stands where the library meets the games room, facing the library
    const tvB = D - 2.3;
    B(gU - 0.55, gU - 0.1, 0, 0.75, tvB - 0.5, tvB + 0.5, FCOL.frame);
    B(gU - 0.4, gU - 0.36, 0.8, 1.45, tvB - 0.6, tvB + 0.6, FCOL.screen);
    const wbB = tvB - 1.5;
    if (wbB > 1.2) {
      for (const db of [-0.55, 0.55]) B(gU - 0.35, gU - 0.31, 0, 1.85, wbB + db - 0.02, wbB + db + 0.02, FCOL.steelGrey);
      B(gU - 0.36, gU - 0.33, 0.85, 1.75, wbB - 0.6, wbB + 0.6, FCOL.sheet);
      B(gU - 0.6, gU - 0.1, 0.05, 0.08, wbB - 0.6, wbB + 0.6, FCOL.steelGrey);
    }
    // plant beside the French doors
    { const u = mainU - 1.15; C(u, 0.2, D - 0.3, 0.2, 0.4, 'y', FCOL.carton); C(u, 0.75, D - 0.3, 0.33, 0.7, 'y', FCOL.paint[3]); }
    // games room: yellow wall, the painting, long desk with chairs facing the wall
    B(a1 + 0.002, a1 - 0.004, 0.12, ceil - Lv - 0.02, 0.0, faceB, FCOL.yellow);
    const py = a1 - 0.005, pc = D * 0.5;
    B(py, py + 0.01, 1.3, 2.45, pc - 0.95, pc + 0.95, FCOL.screen);
    B(py - 0.004, py, 1.38, 2.37, pc - 0.87, pc + 0.87, FCOL.paint[1]);
    B(py - 0.008, py - 0.004, 1.5, 2.25, pc - 0.75, pc - 0.1, FCOL.plastic);
    B(a1 - 0.5, a1, 0.72, 0.76, 0.35, D - 0.15, FCOL.lightWood);
    for (const bq of [0.37, (0.35 + D - 0.15) / 2, D - 0.2]) B(a1 - 0.48, a1 - 0.02, 0, 0.72, bq - 0.02, bq + 0.02, FCOL.frame);
    for (let bq = 0.75; bq < D - 0.4; bq += 0.78) plasticChairSide(a1 - 0.75, bq, 1);
    // two carrom boards on X stands with chairs round them
    const cu = (gU + 0.05 + a1 - 1.05) / 2;
    for (const cb of [D * 0.3, D * 0.7]) {
      B(cu - 0.35, cu + 0.35, 0, 0.68, cb - 0.015, cb + 0.015, FCOL.frame); B(cu - 0.015, cu + 0.015, 0, 0.68, cb - 0.35, cb + 0.35, FCOL.frame);
      B(cu - 0.44, cu + 0.44, 0.68, 0.74, cb - 0.44, cb + 0.44, FCOL.wood); B(cu - 0.37, cu + 0.37, 0.74, 0.745, cb - 0.37, cb + 0.37, FCOL.lightWood);
      for (const s2 of [-1, 1]) { plasticChairSide(cu + s2 * 0.78, cb, -s2); plasticChair(cu, cb + s2 * 0.78, -s2); }
    }
    // ceiling fans
    for (const fu of [(a0 + gU) / 2, (gU + a1) / 2]) { C(fu, ceil - Lv - 0.35, D * 0.5, 0.12, 0.12, 'y', FCOL.fan); B(fu - 0.6, fu + 0.6, ceil - Lv - 0.42, ceil - Lv - 0.4, D * 0.5 - 0.05, D * 0.5 + 0.05, FCOL.fan); }
  } else if (type === 'entry') {
    // the entrance lobby (video): open to the corridor between pillars; the exit door in the far wall with glazed
    // panels either side, potted plants by it, a mirror, curtained windows; a red accent wall with a landscape
    // painting and a wooden sofa set; downlights; a CCTV camera up in the corner
    curtains(FCOL.curtainGrey);
    const mainU = room.mainDoorU ?? (a0 + a1) / 2;
    wallPaint(1, FCOL.red);
    const c = D * 0.5, sw = FCOL.wood;
    // three-seater against the red wall
    B(a1 - 0.75, a1 - 0.02, 0.0, 0.38, c - 0.95, c + 0.95, sw); B(a1 - 0.72, a1 - 0.15, 0.38, 0.5, c - 0.9, c + 0.9, FCOL.cushion);
    B(a1 - 0.15, a1 - 0.02, 0.38, 0.9, c - 0.95, c + 0.95, sw); B(a1 - 0.2, a1 - 0.14, 0.5, 0.85, c - 0.88, c + 0.88, FCOL.cushion);
    for (const s2 of [-1, 1]) B(a1 - 0.75, a1 - 0.02, 0.38, 0.65, c + s2 * 0.95 - (s2 > 0 ? 0.06 : 0), c + s2 * 0.95 + (s2 < 0 ? 0.06 : 0), sw);
    // low table and two armchairs facing the sofa
    B(a1 - 1.75, a1 - 1.15, 0.38, 0.42, c - 0.5, c + 0.5, sw);
    for (const db of [-0.42, 0.42]) for (const du of [-0.27, 0.27]) B(a1 - 1.45 + du - 0.02, a1 - 1.45 + du + 0.02, 0, 0.38, c + db - 0.02, c + db + 0.02, sw);
    for (const s2 of [-1, 1]) {
      const ub = a1 - 2.45, bb = c + s2 * 0.6;
      B(ub, ub + 0.65, 0.0, 0.38, bb - 0.33, bb + 0.33, sw); B(ub + 0.03, ub + 0.6, 0.38, 0.5, bb - 0.28, bb + 0.28, FCOL.cushion);
      B(ub, ub + 0.08, 0.38, 0.85, bb - 0.33, bb + 0.33, sw);
      for (const e of [-1, 1]) B(ub, ub + 0.65, 0.38, 0.62, bb + e * 0.33 - 0.03, bb + e * 0.33 + 0.03, sw);
    }
    // landscape painting on the red wall
    const py = along[1] - 0.075;
    B(py, py + 0.01, 1.35, 2.05, c - 0.55, c + 0.55, FCOL.frame); B(py - 0.004, py, 1.4, 2.0, c - 0.5, c + 0.5, FCOL.paint[3]);
    B(py - 0.008, py - 0.004, 1.4, 1.62, c - 0.5, c + 0.5, FCOL.carton);
    // plants by the door, mirror beside it, doormat
    for (const [du, r] of [[-1.55, 0.36], [-2.15, 0.28], [1.6, 0.3]]) { const u = mainU + du; if (u - r < a0 || u + r > a1) continue; C(u, 0.2, D - 0.32, 0.2, 0.4, 'y', FCOL.carton); C(u, 0.8, D - 0.32, r, 0.8, 'y', FCOL.paint[3]); }
    const mu = mainU + 2.2;
    if (mu + 0.3 < a1) { B(mu - 0.32, mu + 0.32, 0.95, 2.05, faceB - 0.03, faceB, FCOL.wood); B(mu - 0.26, mu + 0.26, 1.01, 1.99, faceB - 0.035, faceB - 0.03, FCOL.mirror); }
    B(mainU - 0.7, mainU + 0.7, 0.006, 0.016, D - 1.0, D - 0.05, FCOL.frame);
    // a wooden bench and a painting on the other side wall
    B(a0, a0 + 0.45, 0.4, 0.45, c - 0.9, c + 0.9, sw); for (const bq of [c - 0.85, c + 0.8]) B(a0 + 0.03, a0 + 0.42, 0, 0.4, bq, bq + 0.05, sw);
    B(along[0] + 0.07, along[0] + 0.08, 1.3, 2.1, c - 0.45, c + 0.45, FCOL.paint[0]);
    // downlights, CCTV
    for (const fu of [a0 + W * 0.25, a0 + W * 0.5, a0 + W * 0.75]) for (const fb2 of [D * 0.3, D * 0.75]) C(fu, ceil - Lv - 0.012, fb2, 0.07, 0.012, 'y', FCOL.sheet);
    B(a0 + 0.02, a0 + 0.16, ceil - Lv - 0.25, ceil - Lv - 0.15, D - 0.15, D + 0.05, FCOL.sheet);
  } else if (type === 'hp') {
    curtains(FCOL.curtainOrange);
    const bw = Math.min(1.5, W - 1.2), bu = (a0 + a1) / 2;
    if (bw > 1) {
      B(bu - bw / 2, bu + bw / 2, 0.0, 0.45, D - 2.0, D, FCOL.wood);
      B(bu - bw / 2 + 0.03, bu + bw / 2 - 0.03, 0.45, 0.6, D - 1.97, D - 0.03, FCOL.sheet);
      B(bu - bw / 2, bu + bw / 2, 0.0, 1.1, D - 0.05, D, FCOL.wood);
      for (const du of [-bw / 4, bw / 4]) B(bu + du - 0.25, bu + du + 0.25, 0.6, 0.7, D - 0.45, D - 0.1, FCOL.sheet);
      B(bu - bw / 2 - 0.5, bu - bw / 2 - 0.05, 0, 0.5, D - 0.45, D, FCOL.wood);               // side table
    }
    if (clearOfDoor(a1 - 1.0, a1)) almirah(a1 - 1.0, a1, 0.0, 0.58, FCOL.wood);
    if (clearOfDoor(a0, a0 + 1.4)) { B(a0, a0 + 1.4, 0, 0.42, 0.1, 0.8, FCOL.curtainGrey); B(a0, a0 + 1.4, 0.42, 0.8, 0.1, 0.25, FCOL.curtainGrey); }   // sofa
    B(bu - 0.8, bu + 0.8, 0, 0.01, D * 0.25, D * 0.25 + 1.0, FCOL.curtainRed);                // rug
  } else if (type === 'office') {
    curtains(FCOL.curtainGrey);
    // wood panelling to 1 m on the walls
    for (const s of [-1, 1]) { const u = s < 0 ? along[0] + 0.061 : along[1] - 0.061; B(u, u - s * 0.012, 0.1, 1.0, 0, D + FAR - 0.3, FCOL.wood); }
    B(a0 - SIDE + 0.06, a1 + SIDE - 0.06, 0.1, 1.0, D + 0.03, D + 0.045, FCOL.wood);
    // desk facing the door, chair behind, two visitors' chairs
    const du = (a0 + a1) / 2, db = D * 0.62;
    B(du - 0.75, du + 0.75, 0.72, 0.77, db - 0.38, db + 0.38, FCOL.granite);
    B(du - 0.75, du + 0.75, 0, 0.72, db + 0.3, db + 0.36, FCOL.wood);
    for (const s of [-1, 1]) B(du + s * 0.72 - 0.03, du + s * 0.72 + 0.03, 0, 0.72, db - 0.36, db + 0.36, FCOL.wood);
    officeChair(du, db + 0.7, -1);
    plasticChair(du - 0.4, db - 0.75, 1); plasticChair(du + 0.4, db - 0.75, 1);
    // key box and filing cabinet
    B(a0 + 0.3, a0 + 0.75, 1.4, 1.85, -0.005, 0.08, FCOL.plastic);
    if (clearOfDoor(a1 - 0.5, a1)) B(a1 - 0.5, a1, 0, 1.3, 0.05, 0.55, FCOL.steelGrey);
    B(a0 - SIDE + 0.07, a0 - SIDE + 0.09, 1.35, 1.85, D * 0.4, D * 0.4 + 0.6, FCOL.paint[1]);   // framed picture
  } else if (type === 'laundry') {
    // video (112-120 s) + owner: a plain room of steel slotted racks with blue laundry sacks on them, brown curtains,
    // a wall fan, and one desk tucked against the wall beside the door
    curtains(FCOL.curtainBrown);
    const sack = (u0, u1, y, b0, b1, k) => {                 // a stuffed blue laundry bag sitting on a shelf
      const r = hash(u0, y, b0, k), w = Math.min(u1 - u0, 0.42 + r * 0.18), uc = u0 + (u1 - u0 - w) * hash(k, u0, y), h2 = 0.2 + r * 0.12;
      const bm = (b0 + b1) / 2, bd = Math.min(Math.abs(b1 - b0) - 0.04, 0.34) / 2;
      B(uc, uc + w, y, y + h2, bm - bd, bm + bd, FCOL.sackBlue);
      B(uc + w * 0.2, uc + w * 0.8, y + h2, y + h2 + 0.07, bm - bd * 0.6, bm + bd * 0.6, FCOL.sackBlue);    // gathered neck
      B(uc + w * 0.45, uc + w * 0.55, y + h2 + 0.07, y + h2 + 0.11, bm - 0.02, bm + 0.02, FCOL.sheet);       // drawstring tie
    };
    const shelves = (H) => [0, 1, 2, 3].map((k) => 0.1 + k * (H - 0.2) / 3 + 0.02);
    const fill = (u0, u1, b0, b1, H, alongA, seed) => {     // sacks on some of the shelves
      const ys = shelves(H);
      ys.forEach((y, k) => {
        if (y > H - 0.1 && H > 1.2) return;
        const len = alongA ? u1 - u0 : b1 - b0;
        for (let t = 0.05; t + 0.45 < len; t += 0.55) {
          if (hash(seed, k, t) < 0.45) continue;
          if (alongA) sack(u0 + t, u0 + t + 0.55, y, b0, b1, k);
          else { const bb0 = b0 + t; sackB(u0, u1, y, bb0, bb0 + 0.55, k); }
        }
      });
    };
    const sackB = (u0, u1, y, b0, b1, k) => {                // a bag on a rack that runs down a side wall
      const r = hash(b0, y, u0, k), w = 0.42 + r * 0.12, bc = b0 + (b1 - b0 - w) * hash(k, b0), h2 = 0.2 + r * 0.12;
      const um = (u0 + u1) / 2, ud = Math.min(u1 - u0 - 0.04, 0.34) / 2;
      B(um - ud, um + ud, y, y + h2, bc, bc + w, FCOL.sackBlue);
      B(um - ud * 0.6, um + ud * 0.6, y + h2, y + h2 + 0.07, bc + w * 0.2, bc + w * 0.8, FCOL.sackBlue);
    };
    // low racks under the window wall, tall racks down both side walls (clear of the door corner)
    const lowH = 1.0, tallH = 1.85, rd = 0.42;
    for (let u = a0; u + 0.9 <= a1 + 0.001; u += 0.95) { const u1 = Math.min(u + 0.9, a1); rack(u, u1, D - rd, D, lowH); fill(u, u1, D - rd, D, lowH, true, u); }
    const sb0 = Math.max(0.75, d.w + 0.2), sb1 = D - rd - 0.05;
    for (const sd of [-1, 1]) {
      const u0 = sd < 0 ? a0 : a1 - rd, u1 = sd < 0 ? a0 + rd : a1;
      if (!clearOfDoor(u0, u1) && sb0 < d.w + 0.2) continue;
      for (let b = sb0; b + 0.9 <= sb1 + 0.001; b += 0.95) { rack(u0, u1, b, b + 0.9, tallH); fill(u0, u1, b, b + 0.9, tallH, false, b * 7 + sd); }
    }
    // the desk: against the door wall, right beside the door, on the roomier side, with a plastic chair
    const dw = 1.0, gap = d.w / 2 + 0.2;
    const left = doorU - gap - (a0 + rd + 0.05), right = (a1 - rd - 0.05) - (doorU + gap);
    if (Math.max(left, right) >= dw) {
      const u0 = right >= left ? doorU + gap : doorU - gap - dw, u1 = u0 + dw;
      B(u0, u1, 0.72, 0.76, 0, 0.55, FCOL.wood); for (const uu of [u0, u1 - 0.04]) B(uu, uu + 0.04, 0, 0.72, 0.02, 0.53, FCOL.frame);
      plasticChair((u0 + u1) / 2, 0.85, -1);
      B(u0 + 0.15, u0 + 0.45, 0.76, 0.78, 0.1, 0.4, FCOL.sheet);                                 // a register on it
    }
    // wall fan high on a side wall near the window
    { const fb = D - rd - 0.5, fu = W > 3 ? a0 + 0.02 : a0; B(fu, fu + 0.06, 2.0, 2.15, fb - 0.06, fb + 0.06, FCOL.fan); C(fu + 0.14, 2.1, fb, 0.24, 0.08, 'a', FCOL.fan); }
  } else if (type === 'store') {
    curtains(FCOL.curtainRed);
    for (let u = a0; u + 1.0 <= a1 - 0.05; u += 1.1) if (clearOfDoor(u, u + 1.0) || D > 1.6) rack(u, u + 1.0, D - 0.42, D);
    for (let b = 0.7; b + 1.0 <= D - 0.6; b += 1.1) rack(a0, a0 + 0.42, b, b + 1.0);
    if (clearOfDoor(a1 - 0.9, a1)) almirah(a1 - 0.9, a1, 0.05, 0.5, FCOL.steel);
    for (let k = 0; k < 3; k++) { const u = a0 + 0.1 + k * 0.33; B(u, u + 0.3, 0.12 + 0.02, 0.12 + 0.3, D - 0.4, D - 0.08, FCOL.carton); }
  }
  if (gore) goreRoom();
  return n;

  // 2nd floor (grades 5-8 and the adults): Manju has already been through. A body on the floor of every room (a kid in
  // uniform, or an adult), sometimes a second, blood pooled under them and dragged toward the door, sprayed up a wall,
  // a handprint by the door.
  function goreRoom() {
    const hh = hash(room.x0, room.z0, Lv, 7);
    const nB = W > 4.2 && D > 3 ? 2 : 1;
    for (let k = 0; k < nB; k++) {
      const kid = (k === 0) === (hh < 0.65), sc = kid ? 0.78 : 1, len = 1.72 * sc;
      const u = Math.max(a0 + 0.5, Math.min(a1 - 0.5, (a0 + a1) / 2 + (k ? 0.9 : -0.2) * (hash(k, hh) - 0.3)));
      const b0 = Math.max(0.55, Math.min(D - len - 0.15, 0.6 + hash(hh, k, 2) * Math.max(0, D - len - 0.9)));
      if (D - 0.2 < len || W < 1.3) break;
      const fl = hash(k, hh, 3) < 0.5 ? 1 : -1;                    // which way the limbs are flung
      const top = kid ? FCOL.shirtW : FCOL.adultTop, legs = kid ? FCOL.shorts : FCOL.adultLegs, skin = hash(k, 4) < 0.5 ? FCOL.skinDead : FCOL.skinDead2;
      // blood first (under), pooled at the chest and head, dragged toward the door
      B(u - 0.45 * sc, u + 0.5 * sc, 0.008, 0.011, b0 + 0.55 * sc, b0 + 1.45 * sc, FCOL.blood);
      B(u - 0.3 * sc, u + 0.62 * sc, 0.008, 0.012, b0 + 0.8 * sc, b0 + 1.2 * sc, FCOL.bloodDry);
      for (let t = b0 + 0.3; t > 0.25; t -= 0.28) B(u - 0.12 + Math.sin(t * 3) * 0.06, u + 0.12 + Math.sin(t * 3) * 0.06, 0.008, 0.01, t - 0.24, t, FCOL.bloodDry);
      // the body, lying along the room, head away from the door
      B(u - 0.17 * sc, u + 0.17 * sc, 0.02, 0.2 * sc, b0 + 0.82 * sc, b0 + 1.42 * sc, top);                              // torso
      B(u - 0.1 * sc, u + 0.12 * sc, 0.1 * sc, 0.205 * sc, b0 + 1.0 * sc, b0 + 1.3 * sc, FCOL.blood);                     // soaked shirt
      B(u - 0.095 * sc, u + 0.095 * sc, 0.02, 0.2 * sc, b0 + 1.44 * sc, b0 + 1.66 * sc, skin);                           // head
      B(u - 0.1 * sc, u + 0.1 * sc, 0.12 * sc, 0.21 * sc, b0 + 1.52 * sc, b0 + 1.7 * sc, FCOL.hair);
      B(u - 0.16 * sc, u - 0.02 * sc, 0.02, 0.15 * sc, b0 + 0.38 * sc, b0 + 0.84 * sc, legs);                           // thighs
      B(u + 0.02 * sc, u + 0.16 * sc, 0.02, 0.15 * sc, b0 + 0.38 * sc, b0 + 0.84 * sc, legs);
      B(u - 0.16 * sc - 0.08 * fl, u - 0.04 * sc - 0.08 * fl, 0.02, 0.12 * sc, b0 + 0.02, b0 + 0.4 * sc, skin);        // shins, one bent out
      B(u + 0.04 * sc, u + 0.15 * sc, 0.02, 0.12 * sc, b0 + 0.02, b0 + 0.4 * sc, skin);
      B(u - 0.17 * sc - 0.08 * fl, u - 0.03 * sc - 0.08 * fl, 0.02, 0.13 * sc, b0 - 0.08, b0 + 0.04, FCOL.shoe);
      B(u + 0.03 * sc, u + 0.16 * sc, 0.02, 0.13 * sc, b0 - 0.08, b0 + 0.04, FCOL.shoe);
      B(u + fl * 0.17 * sc, u + fl * 0.62 * sc, 0.02, 0.11 * sc, b0 + 1.28 * sc, b0 + 1.38 * sc, skin);                  // one arm flung out
      B(u - fl * 0.27 * sc, u - fl * 0.17 * sc, 0.02, 0.11 * sc, b0 + 0.85 * sc, b0 + 1.35 * sc, skin);                  // the other at the side
    }
    // sprayed up the far wall and a side wall; a handprint by the door
    for (let k = 0; k < 5; k++) {
      const u = a0 + 0.3 + hash(k, hh, 5) * (W - 0.6), y0 = 0.5 + hash(k, 6) * 0.9, w = 0.08 + hash(hh, k) * 0.35;
      B(u, u + w, y0, y0 + 0.1 + hash(k, 7) * 0.6, faceB - 0.009, faceB - 0.006, k % 2 ? FCOL.blood : FCOL.bloodDry);
    }
    const sideU = hh < 0.5 ? along[0] + 0.066 : along[1] - 0.066, sg = hh < 0.5 ? 1 : -1;
    for (let k = 0; k < 4; k++) { const bq = 0.5 + hash(k, hh, 8) * Math.max(0.2, D - 1), y0 = 0.4 + hash(k, 9) * 1.0; B(sideU, sideU + sg * 0.004, y0, y0 + 0.15 + hash(k, 10) * 0.5, bq, bq + 0.06 + hash(k, 11) * 0.3, FCOL.blood); }
    const hu = doorU + (doorU - a0 > a1 - doorU ? -1 : 1) * (d.w / 2 + 0.25);
    if (hu > a0 && hu < a1) { B(hu - 0.07, hu + 0.07, 1.05, 1.22, 0.004, 0.008, FCOL.blood); for (let k = 0; k < 3; k++) B(hu - 0.06 + k * 0.05, hu - 0.035 + k * 0.05, 0.75, 1.05, 0.004, 0.008, FCOL.bloodDry); }
  }

  function plasticChairSide(u, b, wallSide) {               // chair facing a side wall (wallSide -1: a0 wall)
    B(u - 0.2, u + 0.2, 0.42, 0.46, b - 0.22, b + 0.22, FCOL.plastic);
    const back = u - wallSide * 0.2;
    B(Math.min(back, back - wallSide * 0.04), Math.max(back, back - wallSide * 0.04), 0.46, 0.85, b - 0.22, b + 0.22, FCOL.plastic);
    for (const du of [-0.16, 0.16]) for (const db of [-0.18, 0.18]) B(u + du - 0.02, u + du + 0.02, 0, 0.42, b + db - 0.02, b + db + 0.02, FCOL.plastic);
  }
}

// towel nooks (video): where a corridor runs on past a corner to a window in the outer wall: a clothes-drying stand
// with towels, a plastic chair with clothes piled on it, a bucket. rect [x0,x1,z0,z1]; end: 'N'|'S'|'W'|'E' (window wall)
export function furnishNook({ addBox, addCyl, rect, end, Lv }) {
  const [x0, x1, z0, z1] = rect;
  const alongX = end === 'E' || end === 'W';                // the nook's length runs toward the end wall
  const sgn = end === 'E' || end === 'S' ? 1 : -1;
  const endC = end === 'E' ? x1 : end === 'W' ? x0 : end === 'S' ? z1 : z0;
  const w0 = alongX ? z0 : x0, w1 = alongX ? z1 : x1;       // across the nook
  const P = (t, w) => (alongX ? [endC - sgn * t, w] : [w, endC - sgn * t]);    // t: distance back from the end wall
  const box = (t0, t1, y0, y1, wa, wb, col) => {
    const [ax, az] = P(t0, wa), [bx, bz] = P(t1, wb);
    addBox(Math.min(ax, bx), Math.max(ax, bx), Lv + y0, Lv + y1, Math.min(az, bz), Math.max(az, bz), col);
  };
  const wm = (w0 + w1) / 2;
  // clothes stand along the nook, 0.5 m back from the window wall
  for (const t of [0.35, 0.85]) for (const dw of [-0.5, 0.48]) box(t, t + 0.02, 0, 1.0, wm + dw, wm + dw + 0.02, FCOL.steelGrey);
  for (let k = 0; k < 4; k++) box(0.35 + k * 0.16, 0.36 + k * 0.16, 0.95, 0.96, wm - 0.5, wm + 0.5, FCOL.steelGrey);
  box(0.37, 0.43, 0.45, 0.96, wm - 0.45, wm + 0.15, FCOL.sheet);
  box(0.55, 0.61, 0.5, 0.96, wm - 0.2, wm + 0.4, FCOL.curtainOrange);
  box(0.72, 0.78, 0.55, 0.96, wm - 0.4, wm + 0.05, FCOL.frame);
  // chair with clothes in a corner by the window, bucket in the other
  const cw = w1 - 0.35;
  box(0.15, 0.55, 0.42, 0.46, cw - 0.2, cw + 0.2, FCOL.bucketBlue); box(0.11, 0.15, 0.46, 0.9, cw - 0.2, cw + 0.2, FCOL.bucketBlue);
  for (const dt of [0.19, 0.51]) for (const dw of [-0.18, 0.16]) box(dt, dt + 0.04, 0, 0.42, cw + dw, cw + dw + 0.04, FCOL.bucketBlue);
  box(0.18, 0.5, 0.46, 0.62, cw - 0.18, cw + 0.18, FCOL.curtainGrey);
  const [bx, bz] = P(0.3, w0 + 0.3); addCyl([bx, Lv + 0.2, bz], 0.2, 0.4, 'y', FCOL.bucket);
}
