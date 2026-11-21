# Manju Menace

First-person horror game (work in progress) set in a hostel building, built from a Shapr3D model.

```bash
./run.sh
```

Click the screen to start. WASD walk, mouse look, Shift run, E open/close doors, Space jump, F fly/no-clip (Space/C up/down), R back to start, V retro look on/off, Esc pause.

## Look (src/retro.js)
Baldi's-Basics-style analog look: ~240-line render upscaled with hard pixels, procedural pixel textures
(checker tiles, acoustic ceiling, green school wainscot, red pavers, pixel grass, marble steps), PS1 vertex
wobble, palette reduction with ordered dithering, VHS grain, scanlines, colour fringe and vignette.

## How it's built
- `tools/convert.mjs` turns the Shapr3D OBJ into `public/building.glb`:
  export units ÷ 2.54 → metres (the model was typed in metres in an inch document), Z-up → Y-up, simplifies over-detailed parts (door handles were 30k tris each),
  renders faces single-sided with fixed winding (the courtyard slab is 1 mm thick; drawing its grey
  underside caused the floor glitch), merges 1,534 bodies into one
  mesh per colour. No position compression (it flattens the 1 mm slabs). 17.7 MB / 150k tris → 2.4 MB / 63k tris.
  Rebuild: `./run.sh convert ~/Downloads/<export>.obj`
- `src/main.js` is three.js + three-mesh-bvh: capsule collision against the whole building
  (walls, steps, landings), gravity, fly mode, floor indicator.

## What's generated (tools/interior.mjs)
The Shapr3D export only modelled the outside. The converter completes it from the owner's two reference
videos and corrections:
- **Every floor is the same continuous ring** (G+2 all round): thin outer walls (same outer faces as the
  model), a central corridor with **rooms on both sides**: outer rooms along the outside walls,
  courtyard rooms behind the model's courtyard facades (outline kept exactly, real openings at its windows;
  the south wing gets matching second-floor windows). 64 rooms.
- **Courtyard facades are just windows**, as in the model: no walkway, no balconies. Window openings are
  lined to the depth of the model's panes so its frames sit in proper recesses; the entrance block's 0.5 m
  portal round the door is rebuilt.
- **Corners are exactly the original model** (light-well halls entered from the courtyard corners, with the
  model's walls, steps, ledges, pillars and curved gallery fronts). The generator leaves those squares
  untouched (`QUADS`); corridors wrap round their outer sides (`CORNER_CORR`) with railings upstairs, as in
  the model. NE/SW/SE lacked the NW hall's steps up to the corridor, so matching steps are added there.
- **Stairs** (owner's markup + video 3): two switchback stairwells halfway along the west and east wings on
  the courtyard side of the corridor, behind a beige wood-framed glass partition with a glass door;
  ground→first→second; marble steps, black balusters, wooden rail.
- **Doors**: 193 doorways with door leaves (`public/doors.json`, built by `src/doors.js`). E opens/closes;
  room doors swing into the room so corridors stay clear; closed doors are solid.
- **Props from the videos**: shoe racks full of shoes beside most doors, door mats, room number plates,
  fire extinguishers along the corridors, red hose reels by the stair doors, tube lights on every corridor
  ceiling, CCTV cameras at the corridor corners, paintings, dustbins and a water dispenser in the halls.
- Main entrance (north) with steps into the lobby; street entrances north and south.
- Floors: ground 0.76 m (plinth; courtyard at 0), first 4.03 m, second 7.17 m.

## Checking walkability
`tools/navcheck.js` builds a 0.5 m nav grid over the collision mesh and flood-fills from the spawn.
In the game page's console: `(await import('/tools/navcheck.js')).run()`. Other debug tools:
`debug.html?f=building.glb` (orbit view, `dbg.section(h)` cuts the roof off at height h),
`tools/section_svg.py` (true cut-plan of the OBJ), `DEBUG_PLAN=1 node tools/convert.mjs …` (ASCII room map).
Every door was also checked by walking through it with the game's physics (all 185 pass).

## Not done yet
- Rooms are empty (waiting for the interior photos).
- Graphics pass (materials, lighting, night) and NPCs come next.
