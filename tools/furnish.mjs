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
//   laundry    washing machines, utility sink, clothes-drying racks, bucket
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
  bucket: '0.157,0.620,0.541',
  paint: ['0.776,0.329,0.482', '0.243,0.557,0.643', '0.894,0.584,0.290', '0.302,0.459,0.255'],
};

const LABEL = { bath: 'BATHROOM', study: 'STUDY ROOM', common: 'COMMON ROOM', hp: 'H.P. RESIDENCE', office: 'OFFICE', laundry: 'LAUNDRY ROOM', store: 'STORE' };

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
  pick('oS', (x) => Math.abs(x + 5), 'bath', false);
  pick('oS', (x) => x, 'laundry');                                   // westmost on the south side
  pick('oS', (x) => Math.abs(x + 17.5), 'store');
  pick('oW', (x, z) => Math.abs(z - 0), 'bath', false);
  pick('oE', (x, z) => Math.abs(z - 1), 'bath', false);
  pick('oE', (x, z) => Math.abs(z - 4.1), 'office');          // opposite the east stairs; room 18 is the next-but-one south
  pick('oN', (x) => Math.abs(x + 11.7), 'common', true, 'study');   // beside the entrance, pushed out into the exterior; upstairs a study hall
  pick('oN', (x) => (x > 1.4 ? Math.abs(x - 8) : 99 - x), 'store');
  return plan;
}
export const typeAt = (plan, id, Lv, ground) => { const p = plan[id]; if (!p) return 'default'; return !p.ground || Lv === ground ? p.type : p.upper || 'default'; };
export const labelFor = (type) => LABEL[type] || null;

// deterministic hash for small variations
const hash = (...v) => { let h = 2166136261; for (const x of v) { h ^= Math.round(x * 1000); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10000) / 10000; };

export function furnishAll({ addBox, addCyl, rooms, plan, levels, ceilAt, windows, inRoom }) {
  let n = 0;
  for (const room of rooms) {
    if (!room.door) continue;
    for (const Lv of levels) {
      const type = typeAt(plan, room.id, Lv, levels[0]);
      n += furnishRoom({ addBox, addCyl, room, Lv, ceil: ceilAt(Lv), type, windows, inRoom });
    }
  }
  return n;
}

function furnishRoom({ addBox, addCyl, room, Lv, ceil, type, windows, inRoom }) {
  const d = room.door, into = d.into;
  // local frame: a along the door wall, b = depth from the door wall's room-side face toward the far wall
  const along = d.axis === 'x' ? [room.x0, room.x1] : [room.z0, room.z1];
  const farEdge = d.axis === 'x' ? (into > 0 ? room.z1 : room.z0) : (into > 0 ? room.x1 : room.x0);
  const SIDE = 0.1, NEAR = 0.17, FAR = room.id[0] === 'o' ? 0.06 : 0.3;   // outer rooms end at the outer wall's face; courtyard rooms have the facade inside their cells
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
  if (W < 1.6 || D < 1.6) return 0;
  let n = 0;
  const toW = (b) => d.c + into * (NEAR + b);
  const B = (u0, u1, y0, y1, b0, b1, col) => {           // box in local coords (y relative to the floor)
    const p0 = toW(b0), p1 = toW(b1);
    if (d.axis === 'x') addBox(Math.min(u0, u1), Math.max(u0, u1), Lv + y0, Lv + y1, Math.min(p0, p1), Math.max(p0, p1), col);
    else addBox(Math.min(p0, p1), Math.max(p0, p1), Lv + y0, Lv + y1, Math.min(u0, u1), Math.max(u0, u1), col);
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
  const bed = (u0, u1, b0, b1, headAtB1 = true, mattress = FCOL.mattress) => {   // metal frame bed
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
  const faceB = D + (room.id[0] === 'o' ? 0.155 : 0.13);
  const paintFar = (col, yTop = ceil - Lv - 0.02) => {
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
  const desk = (u0, u1) => {                               // study table with its own bookshelf hutch and a black chair (video)
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
  if (type === 'default') {
    curtains(FCOL.curtainGrey);
    paintFar(FCOL.mint); wallPaint(-1, FCOL.mint);
    const bedW = 0.9, bedL = Math.max(1.8, Math.min(1.95, D - 0.6));
    bed(a0, a0 + bedW, D - bedL, D);                                                       // two beds along the side walls,
    bed(a1 - bedW, a1, D - bedL, D);                                                       // heads at the window wall
    const du0 = a0 + bedW + 0.05, du1 = a1 - bedW - 0.05, dw = (du1 - du0 - 0.04) / 2;
    if (dw > 0.5) { desk(du0, du0 + dw); desk(du1 - dw, du1); }                            // two tables under the window
    else if (du1 - du0 > 0.5) desk(du0, du1);
    // two steel cupboards by the door: first two free slots along the door wall
    const slots = [[a0, a0 + 0.85], [a1 - 0.85, a1], [a0 + 0.9, a0 + 1.75], [a1 - 1.75, a1 - 0.9]], used = [];
    for (const [u0, u1] of slots) {
      if (used.length >= 2 || !clearOfDoor(u0, u1) || used.some(([p, q]) => u0 < q && u1 > p)) continue;
      almirah(u0, u1, 0, 0.5, used.length ? FCOL.steel : FCOL.steelDark); used.push([u0, u1]);
    }
    // white-framed mirror beside the door, wall fan, two blue buckets by a bed's foot
    const mu = doorU + (doorU - a0 > a1 - doorU ? -1 : 1) * (d.w / 2 + 0.3);
    if (mu - 0.2 > a0 && mu + 0.2 < a1 && !used.some(([p, q]) => mu + 0.2 > p && mu - 0.2 < q)) { B(mu - 0.2, mu + 0.2, 1.3, 1.85, -0.005, 0.02, FCOL.fan); B(mu - 0.16, mu + 0.16, 1.34, 1.81, 0.02, 0.025, FCOL.mirror); }
    else if (D > 1.2) { const mb = Math.min(D - bedL - 0.25, 0.9); if (mb > 0.25) { const u = along[1] - 0.07; B(u - 0.02, u, 1.3, 1.85, mb - 0.2, mb + 0.2, FCOL.fan); } }
    C(a1 - 0.08, Math.min(ceil - Lv - 0.45, 2.35), D * 0.45, 0.22, 0.08, 'a', FCOL.fan);
    const bb = D - bedL - 0.25;
    if (bb > 0.6) for (const k of [0, 1]) C(a1 - 0.25 - k * 0.42, 0.17, bb, 0.17, 0.34, 'y', FCOL.bucketBlue);
  } else if (type === 'bath') {
    // white tiles to 2 m with yellow bands at waist and top on every wall (video), tubelights
    const bands = (u, s2, b0, b1) => { B(u, u - s2 * 0.006, 0.12, 2.02, b0, b1, FCOL.tileW); B(u, u - s2 * 0.01, 0.84, 0.96, b0, b1, FCOL.tileY); B(u, u - s2 * 0.01, 1.86, 2.02, b0, b1, FCOL.tileY); };
    bands(along[0] + 0.061, -1, 0, faceB); bands(along[1] - 0.061, 1, 0, faceB);
    for (const [y0, y1, col] of [[0.12, 2.02, FCOL.tileW], [0.84, 0.96, FCOL.tileY], [1.86, 2.02, FCOL.tileY]]) B(along[0] + 0.06, along[1] - 0.06, y0, y1, faceB - (col === FCOL.tileW ? 0.006 : 0.01), faceB, col);
    for (const k of [0.33, 0.66]) B(a0 + W * k - 0.6, a0 + W * k + 0.6, ceil - Lv - 0.05, ceil - Lv, D * 0.5 - 0.05, D * 0.5 + 0.05, FCOL.fan);
    // yellow-tiled privacy screen just inside the door
    B(doorU - 0.85, doorU + 0.85, 0, 1.85, d.w + 0.15, d.w + 0.27, FCOL.tileY);
    // row of cubicles along the far wall: beige laminate partitions, white doors; showers and WCs alternate
    const cd = D >= 4 ? 1.55 : Math.min(1.3, D * 0.45), nC = Math.max(1, Math.min(10, Math.floor((W - 0.1) / 1.05))), cw = W / nC;
    for (let i = 0; i < nC; i++) {
      const u0 = a0 + i * cw, u1 = u0 + cw, dm = (u0 + u1) / 2, dw = Math.min(0.7, cw - 0.22);
      if (i > 0) B(u0 - 0.025, u0 + 0.025, 0.1, 2.05, D - cd, D, FCOL.laminate);
      B(u0, dm - dw / 2, 0.1, 2.05, D - cd - 0.025, D - cd + 0.025, FCOL.laminate);
      B(dm + dw / 2, u1, 0.1, 2.05, D - cd - 0.025, D - cd + 0.025, FCOL.laminate);
      B(dm - dw / 2, dm + dw / 2, 0.15, 2.0, D - cd - 0.03, D - cd + 0.01, FCOL.tileW);   // door
      B(dm + dw / 2 - 0.1, dm + dw / 2 - 0.06, 0.95, 1.05, D - cd - 0.06, D - cd - 0.03, FCOL.steelGrey);
      if (i % 2) { C(dm, 2.0, D - 0.14, 0.08, 0.03, 'b', FCOL.steelGrey); B(dm - 0.015, dm + 0.015, 1.05, 2.0, D - 0.04, D - 0.01, FCOL.steelGrey); B(dm - 0.09, dm + 0.09, 1.0, 1.1, D - 0.07, D - 0.01, FCOL.steelGrey); }
      else { B(dm - 0.19, dm + 0.19, 0.38, 0.42, D - 0.62, D - 0.1, FCOL.tileW); B(dm - 0.2, dm + 0.2, 0.42, 0.45, D - 0.64, D - 0.1, FCOL.sheet); B(dm - 0.2, dm + 0.2, 0.3, 0.85, D - 0.12, D - 0.01, FCOL.tileW); }
    }
    // basin counter (black granite, round basins, a framed mirror over each) along one side wall
    const free0 = Math.max(swingB(a0, a0 + 0.6), 0.3) + 0.2, free1 = D - cd - 0.3;
    if (free1 - free0 > 0.9) {
      B(a0, a0 + 0.55, 0, 0.8, free0, free1, FCOL.granite);
      for (let bq = free0 + 0.45; bq < free1 - 0.3; bq += 0.85) {
        C(a0 + 0.3, 0.81, bq, 0.18, 0.04, 'y', FCOL.tileW); B(a0 + 0.02, a0 + 0.08, 0.8, 1.02, bq - 0.02, bq + 0.02, FCOL.steelGrey);
        const mu = along[0] + 0.07; B(mu, mu + 0.02, 1.15, 1.8, bq - 0.27, bq + 0.27, FCOL.fan); B(mu + 0.02, mu + 0.025, 1.19, 1.76, bq - 0.23, bq + 0.23, FCOL.mirror);
      }
    }
    // urinals on the other side wall, a yellow 'please flush' sign
    const f0 = Math.max(swingB(a1 - 0.6, a1), 0.3) + 0.3, f1 = D - cd - 0.3;
    for (let bq = f0 + 0.35, k = 0; bq < f1 - 0.2 && k < 3; bq += 0.8, k++) {
      B(a1 - 0.36, a1, 0.45, 1.05, bq - 0.2, bq + 0.2, FCOL.tileW); B(a1 - 0.06, a1, 1.1, 1.35, bq - 0.03, bq + 0.03, FCOL.steelGrey);
    }
    if (f1 - f0 > 0.6) B(along[1] - 0.075, along[1] - 0.065, 1.45, 1.85, f0 - 0.15, f0 + 0.15, FCOL.yellow);
  } else if (type === 'study') {
    curtains(FCOL.curtainRed);
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
    // TV under a red cloth on the door wall
    const tu = (doorU - a0 > a1 - doorU) ? (a0 + doorU - d.w / 2) / 2 : (a1 + doorU + d.w / 2) / 2;
    B(tu - 0.55, tu + 0.55, 1.3, 1.95, 0.0, 0.08, FCOL.curtainRed);
  } else if (type === 'common') {
    // (video) yellow long wall with a big portrait painting and a bench desk with a row of cream plastic chairs;
    // carrom board on an X-frame stand, small square tables, L-shaped corner bookcase, TV and whiteboard, ceiling fan
    curtains(FCOL.curtainGrey);
    wallPaint(-1, FCOL.yellow);
    const pu = along[0] + 0.07; B(pu, pu + 0.025, 1.45, 2.55, D * 0.5 - 0.85, D * 0.5 + 0.85, FCOL.paint[1]);   // portrait
    B(pu + 0.025, pu + 0.03, 1.55, 2.45, D * 0.5 - 0.75, D * 0.5 + 0.35, FCOL.plastic);
    const bdb0 = Math.max(0.5, swingB(a0, a0 + 0.5)), bdb1 = D - 0.35;
    B(a0, a0 + 0.45, 0.73, 0.77, bdb0, bdb1, FCOL.wood);
    for (let bq = bdb0; bq <= bdb1; bq += 1.2) B(a0 + 0.05, a0 + 0.4, 0, 0.73, bq, bq + 0.04, FCOL.frame);
    for (let bq = bdb0 + 0.35; bq < bdb1 - 0.2; bq += 0.72) plasticChairSide(a0 + 0.72, bq, -1);
    // carrom on an X stand with four chairs
    const cu = a0 + W * 0.42, cb = D * 0.42;
    B(cu - 0.35, cu + 0.35, 0, 0.68, cb - 0.015, cb + 0.015, FCOL.frame); B(cu - 0.015, cu + 0.015, 0, 0.68, cb - 0.35, cb + 0.35, FCOL.frame);
    B(cu - 0.42, cu + 0.42, 0.68, 0.74, cb - 0.42, cb + 0.42, FCOL.wood); B(cu - 0.36, cu + 0.36, 0.74, 0.745, cb - 0.36, cb + 0.36, FCOL.lightWood);
    plasticChair(cu, cb - 0.8, 1); plasticChair(cu, cb + 0.8, -1); plasticChairSide(cu - 0.8, cb, 1); plasticChairSide(cu + 0.8, cb, -1);
    // small square tables with chairs toward the windows
    for (const k of [0.35, 0.68]) {
      const tu = a0 + W * k, tb = D - 1.3;
      if (tb < cb + 1.4) continue;
      B(tu - 0.38, tu + 0.38, 0.72, 0.76, tb - 0.38, tb + 0.38, FCOL.lightWood);
      for (const du of [-0.33, 0.33]) for (const db of [-0.33, 0.33]) B(tu + du - 0.02, tu + du + 0.02, 0, 0.72, tb + db - 0.02, tb + db + 0.02, FCOL.frame);
      plasticChair(tu, tb - 0.7, 1); plasticChair(tu, tb + 0.7, -1);
    }
    // L-shaped corner bookcase (far wall + a1 wall corner)
    const book = (u0, u1, b0, b1, alongA) => {
      B(u0, u1, 0, 1.85, b0, b1, FCOL.lightWood);
      const n2 = Math.floor(((alongA ? u1 - u0 : b1 - b0) - 0.04) / 0.38);
      for (let r = 0; r < 5; r++) for (let j = 0; j < n2; j++) {
        const y = 0.08 + r * 0.36, c0 = (alongA ? u0 : b0) + 0.04 + j * 0.38;
        const col = hash(r, j, u0) < 0.7 ? FCOL.paint[(r + j) % 4] : FCOL.frame;
        if (alongA) B(c0, c0 + 0.3, y, y + 0.27, b0 - 0.012, b0, col); else B(u0 - 0.012, u0, y, y + 0.27, c0, c0 + 0.3, col);
      }
    };
    book(a1 - 2.0, a1 - 0.36, D - 0.36, D, true);
    book(a1 - 0.36, a1, D - 2.0, D, false);
    // TV on a low cabinet and a whiteboard on a stand along the a1 wall nearer the door
    const tvb = Math.max(1.0, swingB(a1 - 0.5, a1) + 0.3);
    if (tvb + 1.3 < D - 2.1) {
      B(a1 - 0.45, a1, 0, 0.5, tvb, tvb + 1.3, FCOL.frame); B(a1 - 0.3, a1 - 0.25, 0.55, 1.3, tvb + 0.05, tvb + 1.25, FCOL.screen);
      B(a1 - 0.9, a1 - 0.86, 0.85, 1.7, tvb + 1.45, tvb + 2.3, FCOL.sheet); B(a1 - 0.89, a1 - 0.87, 0, 0.85, tvb + 1.45, tvb + 2.3, FCOL.steelGrey);
    }
    const pu2 = along[1] - 0.07; B(pu2 - 0.025, pu2, 1.4, 2.3, D * 0.3, D * 0.3 + 0.7, FCOL.paint[2]);
    // ceiling fan
    C(a0 + W * 0.5, ceil - Lv - 0.35, D * 0.5, 0.12, 0.12, 'y', FCOL.fan);
    B(a0 + W * 0.5 - 0.6, a0 + W * 0.5 + 0.6, ceil - Lv - 0.42, ceil - Lv - 0.4, D * 0.5 - 0.05, D * 0.5 + 0.05, FCOL.fan);
    B(a0 + W * 0.5 - 0.05, a0 + W * 0.5 + 0.05, ceil - Lv - 0.42, ceil - Lv - 0.4, D * 0.5 - 0.6, D * 0.5 + 0.6, FCOL.fan);
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
    // washing machines along the far wall
    const nM = Math.max(1, Math.min(3, Math.floor((W - 0.7) / 0.68)));
    for (let i = 0; i < nM; i++) {
      const u = a0 + 0.05 + i * 0.68;
      B(u, u + 0.6, 0, 0.85, D - 0.62, D - 0.02, FCOL.tileW);
      C(u + 0.3, 0.45, D - 0.62, 0.19, 0.03, 'b', FCOL.screen);
      B(u + 0.05, u + 0.55, 0.78, 0.83, D - 0.64, D - 0.6, FCOL.steelGrey);
    }
    // utility sink on the remaining far-wall stretch
    if (a1 - (a0 + 0.05 + nM * 0.68) > 0.6) { const su = a1 - 0.35; B(su - 0.3, su + 0.3, 0, 0.85, D - 0.55, D - 0.02, FCOL.tileW); B(su - 0.02, su + 0.02, 0.85, 1.05, D - 0.1, D - 0.05, FCOL.steelGrey); }
    // drying racks (clothes horses) in the middle, a bucket
    for (const ru of [a0 + W * 0.3, a0 + W * 0.7]) {
      const rb = D * 0.42;
      for (const du of [-0.55, 0.53]) for (const db of [-0.28, 0.26]) B(ru + du, ru + du + 0.02, 0, 1.0, rb + db, rb + db + 0.02, FCOL.steelGrey);
      for (let k = 0; k < 5; k++) { const db = -0.28 + k * 0.135; B(ru - 0.55, ru + 0.55, 0.95, 0.965, rb + db, rb + db + 0.01, FCOL.steelGrey); }
      B(ru - 0.4, ru + 0.1, 0.55, 0.96, rb - 0.15, rb - 0.13, FCOL.paint[Math.floor(hash(ru) * 4)]);   // a towel hung over it
    }
    C(a1 - 0.3, 0.2, 0.5, 0.2, 0.4, 'y', FCOL.bucket);
  } else if (type === 'store') {
    curtains(FCOL.curtainRed);
    for (let u = a0; u + 1.0 <= a1 - 0.05; u += 1.1) if (clearOfDoor(u, u + 1.0) || D > 1.6) rack(u, u + 1.0, D - 0.42, D);
    for (let b = 0.7; b + 1.0 <= D - 0.6; b += 1.1) rack(a0, a0 + 0.42, b, b + 1.0);
    if (clearOfDoor(a1 - 0.9, a1)) almirah(a1 - 0.9, a1, 0.05, 0.5, FCOL.steel);
    for (let k = 0; k < 3; k++) { const u = a0 + 0.1 + k * 0.33; B(u, u + 0.3, 0.12 + 0.02, 0.12 + 0.3, D - 0.4, D - 0.08, FCOL.carton); }
  }
  return n;

  function plasticChairSide(u, b, wallSide) {               // chair facing a side wall (wallSide -1: a0 wall)
    B(u - 0.2, u + 0.2, 0.42, 0.46, b - 0.22, b + 0.22, FCOL.plastic);
    const back = u - wallSide * 0.2;
    B(Math.min(back, back - wallSide * 0.04), Math.max(back, back - wallSide * 0.04), 0.46, 0.85, b - 0.22, b + 0.22, FCOL.plastic);
    for (const du of [-0.16, 0.16]) for (const db of [-0.18, 0.18]) B(u + du - 0.02, u + du + 0.02, 0, 0.42, b + db - 0.02, b + db + 0.02, FCOL.plastic);
  }
}

// the open gap next to room 18 (video): a nook off the corridor with a window, a clothes stand with towels, a chair
export function furnishNook({ addBox, addCyl, rect, corrX, Lv }) {
  const [x0, x1, z0, z1] = rect, xo = x1 - 0.1;              // outer wall side is +x (east wing)
  const n0 = addBox.length;
  // clothes-drying stand with towels near the window
  const zc = (z0 + z1) / 2, xs = xo - 0.6;
  for (const dz of [-0.55, 0.53]) for (const dx of [-0.25, 0.23]) addBox(xs + dx, xs + dx + 0.02, Lv, Lv + 1.0, zc + dz, zc + dz + 0.02, FCOL.steelGrey);
  for (let k = 0; k < 4; k++) addBox(xs - 0.25 + k * 0.16, xs - 0.24 + k * 0.16, Lv + 0.95, Lv + 0.96, zc - 0.55, zc + 0.55, FCOL.steelGrey);
  addBox(xs - 0.27, xs - 0.2, Lv + 0.45, Lv + 0.96, zc - 0.5, zc + 0.1, FCOL.sheet);          // towels over the bars
  addBox(xs + 0.0, xs + 0.07, Lv + 0.5, Lv + 0.96, zc - 0.2, zc + 0.45, FCOL.curtainOrange);
  addBox(xs + 0.16, xs + 0.22, Lv + 0.55, Lv + 0.96, zc - 0.45, zc + 0.05, FCOL.frame);
  // blue plastic chair with clothes piled on it, in the corner
  const cz = z1 - 0.45, cx = xo - 0.35;
  addBox(cx - 0.2, cx + 0.2, Lv + 0.42, Lv + 0.46, cz - 0.2, cz + 0.2, FCOL.bucketBlue);
  addBox(cx + 0.16, cx + 0.2, Lv + 0.46, Lv + 0.9, cz - 0.2, cz + 0.2, FCOL.bucketBlue);
  for (const dx of [-0.16, 0.16]) for (const dz of [-0.16, 0.16]) addBox(cx + dx - 0.02, cx + dx + 0.02, Lv, Lv + 0.42, cz + dz - 0.02, cz + dz + 0.02, FCOL.bucketBlue);
  addBox(cx - 0.18, cx + 0.14, Lv + 0.46, Lv + 0.62, cz - 0.18, cz + 0.18, FCOL.curtainGrey);
  // a bucket
  addCyl([xo - 0.3, Lv + 0.2, z0 + 0.4], 0.2, 0.4, 'y', FCOL.bucket);
  void n0; void corrX;
}
