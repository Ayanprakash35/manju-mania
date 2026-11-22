# Manju Mania

First-person horror game (work in progress) set in a hostel building, built from a Shapr3D model.

```bash
./run.sh
```

The title menu starts on "New game" (Enter). WASD walk, mouse look, Shift run, E open/close doors, L flashlight, Space jump, F fly/no-clip (Space/C up/down), R back to start, V retro look on/off, Esc pause.

## Manju (src/manju.js, src/navmesh.js)
The hostel guard (`public/models/manju.glb`, built by `tools/manju.py` from the character sheet in `tools/ref/`).
- **Roams all three floors** using a walkable grid built from the collision mesh at load (stairs connect the floors).
  Stops now and then to smoke.
- **Senses:** sees in a ~120° cone (walls and closed doors block it); spots you from ~22 m with your torch on,
  ~8 m with it off; the torch in his face alerts him at once. Hears running (~12 m), walking (~4 m) and landings;
  crouching (Ctrl or C) is silent.
- **Stare, then chase:** stops, turns and stares (eyes flare) for ~1.5 s, then runs at 4.6 m/s. Sprinting (6.5 m/s)
  outruns him, but stamina lasts ~6 s. He opens doors in his way and bangs on the door before bursting into a room
  you're hiding in. Loses you after ~6 s unseen, searches the spot, then goes back to roaming.
- **You can't see him in the dark:** he is drawn only when light is on him (your torch cone, a live tube light,
  moonlight outside) and stutters in and out as lights flicker. In the dark you hear his chappals, breathing and the
  joint crackling; while he stares at you, his red eyes show even in total darkness.
- **Chase atmosphere:** stare sting, pulsing bass, string cluster and drums; the screen edge closes in and red seeps
  into the shadows; a heartbeat speeds up as he gets near, even unseen.
- **Caught:** camera snaps to his face, he transforms into his monster form (`manju_monster.glb`, built by `tools/manju_monster.py`), lunges and screams, then CONFISCATED (Try again / Quit to menu).
- Console: `manju [status|here|away|off|on|chase|stare]`, `god`.

## Cheat console (src/console.js)
Press <kbd>`</kbd> (the key left of 1) to open it, Esc or ` to close. Up/Down recalls commands, Tab completes.

| Command | What it does |
|---|---|
| `help [cmd]` | list commands |
| `freeze` / `unfreeze` | stop the world (lights, scares, doors, mist); you can still move |
| `timescale 0.3` | slow motion (1 normal, up to 5) |
| `tp <place> [floor]` / `tp x y z` | teleport; `places` lists spots (start, courtyard, lobby, north/south/east/west corridors, stairs, stairs2, wells, outside, roof) |
| `pos` | your position |
| `fly [on/off]`, `speed 2`, `respawn` | movement |
| `scare <name>` | figure, follower, blackout, lightDies, doorCreak, doorSlam, knock, whisper |
| `scares off/on`, `tension 0.8` | random scares, how soon the next one comes |
| `summon [dist]`, `banish` | put the figure in front of you / make it vanish |
| `torch on/off/3`, `lights on/off/flicker`, `bright on` | lighting |
| `fog 0.02` / `fog off` / `fog auto` | fog override |
| `retro`, `fov 75`, `sound off`, `volume 0.5`, `hud off` | display and sound |
| `doors open/close` | every room door at once |
| `pause`, `menu` | pause menu / back to the title |

## Title menu (src/menu.js)
Glitched wordmark and menu (new game / controls / settings); Esc opens it as a pause menu. Behind it the live
scene plays slow camera shots cut with glitch tears, with the torch cutting in and out.

## Night, fog & horror (src/main.js, src/atmosphere.js, src/director.js, src/audio.js)
- Fog is done in the shaders: a dark distance haze plus a pale, moonlit ground mist that is thick at knee height,
  thins with height and rolls slowly in patches (outdoors only). The sky fades from near-black overhead into the
  fog colour at the horizon, with a faint moon glow, so distant buildings melt into it. Indoors the haze goes to
  near-black, so the far end of a corridor is just gone. The weak, yellowed torch (L) shows as a beam in the haze.
- Walking motion: the head dips as each foot lands and rises mid-stride, sways and rolls slightly with each step
  (bigger and quicker when running), footsteps land on the dips, a knee-bend on landing from a jump or fall,
  slow breathing when standing still, and the torch beam lags behind quick turns.
- A scare director paces small, ambiguous events rather than constant jump scares. Tension builds indoors and in
  the dark, and it fires more often as tension rises: footsteps behind you that stop a beat after you do; a tall
  pale figure at the edge of the torchlight that's gone when you light it up, get close or look away; the torch
  dying and coming back with the figure closer; tube lights popping out; doors creaking open or slamming
  behind you; knocking from a room; whispers.
- Procedural audio (drone, fluorescent hum, footsteps, creaks, knocks, whispers, heartbeat). No shadows.

## Look (src/retro.js)
Low-res analog look: ~240-line render upscaled with hard pixels, procedural pixel textures (grey tiles, tired
grey paint with damp patches and grime, acoustic ceiling, pavers, grass), colour drained to ~30%, cold
shadows, ordered dithering, VHS grain, scanlines, colour fringe and a heavy vignette.

## How it's built
- `tools/convert.mjs` turns the Shapr3D OBJ into `public/building.glb`:
  export units ÷ 2.54 → metres (the model was typed in metres in an inch document), Z-up → Y-up, simplifies over-detailed parts (door handles were 30k tris each),
  renders faces single-sided with fixed winding (the courtyard slab is 1 mm thick; drawing its grey
  underside caused the floor glitch), merges 1,534 bodies into primitives grouped by
  colour/material (45 materials, 53 primitives across 3 meshes). No position compression (it flattens the 1 mm slabs).
  17.7 MB / 150k tris → ~6.75 MB / 164k tris (uncompressed: meshopt/quantize flatten the 1 mm slabs).
  Rebuild: `./run.sh convert ~/Downloads/<export>.obj`
  `public/building.glb` is rebuilt from the original export whenever the generator changes (the OBJ is not in the repo).
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
- **Doors**: 197 doorways with door leaves (`public/doors.json`, built by `src/doors.js`). E opens/closes;
  room doors swing into the room so corridors stay clear; closed doors are solid.
- **Props from the videos**: shoe racks full of shoes beside most doors, door mats, room number plates,
  fire extinguishers along the corridors, red hose reels by the stair doors, tube lights on every corridor
  ceiling, CCTV cameras at the corridor corners, water dispensers and dustbins in the corridor corners.
- Main entrance (north) with steps into the lobby; outer walls solid, no street entrances.
- Floors: ground 0.76 m (plinth; courtyard at 0), first 4.03 m, second 7.17 m.

## Checking walkability
`tools/navcheck.js` builds a 0.5 m nav grid over the collision mesh and flood-fills from the spawn.
In the game page's console: `(await import('/tools/navcheck.js')).run()`. Other debug tools:
`debug.html?f=building.glb` (orbit view, `dbg.section(h)` cuts the roof off at height h),
`tools/section_svg.py` (true cut-plan of the OBJ), `DEBUG_PLAN=1 node tools/convert.mjs …` (ASCII room map).
Every door was also checked by walking through it with the game's physics.

## Not done yet
- Rooms are empty (waiting for the interior photos).
- Graphics pass (materials, lighting, night) and NPCs come next.
