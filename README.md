# Manju Mania

First-person horror game (work in progress) set in a hostel building, built from a Shapr3D model.

```bash
./run.sh
```

## The story (src/story.js)
**New game:** a short context card (room 15, 9:52 PM, laptop submission closed at 9:30), then the cutscene: you're
sitting on your bed, Manju bursts in furious and your laptop, tablet, music player and face mask are sucked out of the
room into him. They land in random rooms across all three floors (at least one per floor). Space skips.

**Objectives** (top right): 1. get your stuff back (a sub-list of the four items); 2. once you have all four, turn on
the corridor lights: 6 wall switches per floor, 18 in all (each lights a bright tube over it; a toast counts them; hold E; each one takes longer than the last, holding makes
noise, and every light that comes on lets Manju, Mutty and Zoya see you from further off and move a little faster);
3. the finale (not built yet).

**Items** (1-5 to pick, click to use; each explains itself when you pick it up):
- **Laptop**: the map, shown as a tablet you're holding (bottom left, tilted; FIND MY / MAP app with floor, clock and
  battery): the floor you're on, north up with N/E/S/W on the edges, stairs (ST), toilets (WC), room 15 and the switches
  during the lights objective. M or clicking it: the big map.
- **Tablet**: the people on your floor as lettered dots (MA Manju, MU Mutty, ZO Zoya) and Find My circles round your
  missing stuff on that floor; a legend along the bottom. Only the floor you're on.
- **Music player**: thrown, it plays a tune where it lands for 25 s and pulls everyone on that floor within ~48 m
  over to it (anyone who comes into earshot while it plays too); a toast says who heard it. Manju drops whatever he's
  doing, even a chase, hurries over and stands glaring at it until it stops, noticing you only within ~3 m, then
  searches round it. 90 s cooldown.
- **Face mask**: click it on Zoya (within ~5.5 m, looking at her): she never calls Manju or shouts again, for the rest
  of the run (it stays on through retries). One use.
- **Picking things up**: your stuff counts as under the crosshair if it's within ~2.9 m and the aim is within about
  0.5 m of it, with no wall or door leaf in between.
- **Food** (the Choco Pies and Lay's from room 15, up to 3): click to throw it — on the ground floor Mutty goes and
  eats it and leaves you alone for 3 minutes (if he doesn't, you can pick it back up); right-click to eat (+1 heart).

**Rest-room cubicles**: every cubicle door opens (E) and hangs off the floor. Shut yourself in and nobody can see you,
but after 10 s Mutty comes in under the door, bites, flings it open, and (on the ground floor) keeps hunting you. The
rest rooms are filthy: shit in the bowls and up the walls, grime and urine on the floor, rust down the tiles, wet
tissue, a bloody handprint on a mirror.

**2nd floor** (grades 5-8 and the adults): Manju has already been through, and he still comes up here on his rounds
(Mutty and Zoya don't), a body in every room (kids in uniform, adults), blood pooled, dragged and sprayed, more in
the corridors, and figures that stand far down a corridor for a heartbeat and are gone.

## Look and feel of the UI (src/ui.css, src/icons.js)
Two voices. The student's own stuff: the to-do list is a torn notebook page taped top-right, in pencil, struck through
in red pen as you go, with the clues you've picked up written in blue pen. The game speaking: black boxes with a thick
white frame and pixel type typed out with voice blips and the speaker's portrait, in the spirit of Undertale (dialogue,
item pickups, Manju muttering). Character cards are the game's own bestiary in that voice: a portrait on a scanline
screen, the name, threat pips, floors, sight and hearing, a one-line description, what it does and how to survive;
the death screen shows the compact card of whoever got you. Pixel-art hotbar icons with a radial cooldown sweep. Fonts:
Patrick Hand (handwriting), VT323 (pixel), Special Elite (the printed notice).

**Finding your stuff (clues):** CowShit Komynini (E, in room 15) saw where everything went: one clue per visit, the
tablet first (floor, wing, which side of the corridor, the room number), then the rest (floor, wing, side, a landmark
nearby). Once you've got your first item back, Komynini has more to tell (before that he only repeats the tablet), and Manju
starts muttering: creep close while he patrols without seeing you and he mutters where he dumped something (floor and
wing; never while you're in room 15, at most once a minute). Every clue is written onto the to-do page (top right)
under its item; Komynini tells you to check it, a note says so a few seconds into the game, and the page wiggles each
time it's pointed out. Once you have the tablet, Find My draws a 10 m circle
on the map round each missing item on your floor, with the item somewhere off-centre inside it.

**The intro** is the warden's printed notice ("devices by 9:30 PM, or CONFISCATED") with the stamp coming down, then a
red alarm clock reading 9:52 and two typed lines, then the cutscene behind letterbox bars. You hear him coming, the door
bursts open with a camera jolt, he walks in and turns to you, the camera leans in to his glowing eyes as he shouts. The
camera then swings to your desk as everything starts shaking, follows your things as they rip past you into his hands,
and watches him turn and walk out. The door slams, there's a fade to black and a closing line, then you play.

## Character book (src/book.js)
Manju, Mutty, Dr Zoya, CowShit Komynini and the figures each have a page: what they do and how to get past them, with
a portrait rendered from the game's own model. A page unlocks the first time you properly see that character (in
front of you, close enough, lit, not behind a wall), Manju during the intro, the figures once you've looked at one,
or when one of them gets you. Unlocks are saved in the browser. Open the book from the title or pause menu, or from
the death screen, which also shows the card of whoever caught you (Manju) or bit you to death (Mutty).

**Room 15 (src/room15.js)** is where you start and the one safe place: inside it nobody can see, hear, catch or hurt
you (Manju and Mutty's nav grids leave it out, so they stop at the door; when you go in, Manju gives up whatever he
was doing and his wandering keeps 14 m away from the room until you come out), its tube light never goes out, and there's
food: two Choco Pies and a Lay's packet (E takes them; see the items below); the food comes back on a new game. The room is a recreation of the owner's video (IMG_2567): two
almirahs, laundry baskets and a guitar case on the door wall, a floral bed and a geometric-print bed, two teak desks
with hutches under the mint window wall, grey satin curtains, a wall fan, the runner, mats, bags and slippers.

**CowShit Komynini (src/komynini.js, public/models/komynini.glb)** lies on the bed on your right as you come into room
15, curled on his side under a grey duvet facing the wall, scrolling reels on his tablet (the screen swipes between
reels) and glancing back at the door now and then. Walk in with the door open and he twists round and yells "Close the
door!", and keeps at it every few seconds until you shut it. He does no harm. His two lines (public/audio/komynini_*.m4a)
are generated with macOS `say` (voice Rishi), stand-ins until there's a recording.

The title menu starts on "New game" (Enter). WASD walk, mouse look, Shift run, E open/close doors, F flashlight, Ctrl or C crouch, R back to start, V retro look on/off, Esc pause.

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
- **Caught:** camera snaps to his face, scream and glitch, then CONFISCATED (Try again / Quit to menu) with a random warden line under the title.
- Console: `manju [status|here|away|off|on|chase|stare]`, `god`.

## Mutty (src/mutty.js)
The crawler (`public/models/crawler.glb`), **ground floor only** (stairs are his border; he never follows you up).
- Scuttles on all fours at speed, elbows and knees splayed; pounces up to face height and bites once for **one heart**.
- After a bite he runs to Manju and tells him where you were; Manju sets off from wherever he is and walks there
  briskly (2.6 m/s), without appearing near you or tracking you on the way. A toast warns you.
- **Student rooms are safe:** once you cross a room door (not a stair/lobby opening), Mutty loses you and clears out
  for a while, letting you continue.
- Body is only drawn when light is on him; his eyes catch the torch in the dark.

## Dr Zoya (src/zoya.js)
First-floor warden (`public/models/zoya.glb`); she does no damage herself.
- Patrols the first-floor corridors and stops to scan. When she sees you she freezes, snaps round, points and
  calls Manju to your position; she keeps pointing until he arrives (or loses interest after ~8 s).
- She never leaves the first floor.

## Health (src/health.js)
- **5 hearts**, 1.25 s of invulnerability after a hit, no regeneration.
- Mutty takes one heart per bite; Manju's catch is still instant confiscation; Zoya deals no damage.
- At zero hearts the same **CONFISCATED** screen appears (with a random warden line). Try Again / New Game
  restore five hearts; R respawn does not heal.

## Voices (src/voices.js, public/audio/)
Recorded lines, cut from the owner's recordings at their pauses and transcribed with Whisper (see the table in src/voices.js), played as positional sound from where each character
is (quieter and duller with distance, more muffled from another floor):
- **Zoya:** "These boys!" (`zoya_1`-`zoya_3`) when she spots you, usually followed by "What are you doing, boys? I will
  not handle this attitude!" (`zoya_5`) while she points; "Stop causing a ruckus in the boarding!" (`zoya_4`) and the
  attitude line at random while she patrols. Her spot also brings Manju to ~5 m from you, on your floor, out of view.
- **Mutty:** "Kya karega?" / "So jao, so jao" (`mutty_3`, `mutty_6`) when he starts running at you; a grunt (`mutty_2`)
  when he bites; his other lines (`mutty_1`, `4`, `5`, `7`) at random.
- **Ravi:** "MOVE!" (`ravi_1`, `ravi_2`) at random from somewhere 18-40 m away (he has no body in the game).

## Room interiors (tools/furnish.mjs), from the ground-floor walkthrough video
- **Bedrooms (double):** two metal-frame beds along the side walls, heads at the window; two separate study tables, each
  with its own bookshelf hutch and black chair, under the window; two steel cupboards by the door; white-framed mirror,
  wall fan, grey curtains, mint window wall, blue buckets. Room 18 is the fourth east-wing room south of the stairs.
- **Rest rooms** (south, west and east wings, every floor; merged rooms pushed 2.5 m out into the exterior), laid out as
  in the video: a yellow-tiled screen inside the door; a row of WC / shower cubicles down the side wall away from the
  door (beige laminate partitions, white doors, a steel rail along the top); a free-standing laminate island with a
  black granite counter, round basins and a framed mirror over each, yellow strip at its end; a bank of four urinals on
  a white half-wall capped with yellow tiles across the far end; a row of showers down the other side wall; white tiles
  with a solid yellow band low and a yellow/white checker band high; grey floor; high windows with exhaust fans; a
  notice board and switches by the door.
- **Common room** (courtyard side of the front, pushed 3.4 m out into the courtyard so it has the video's depth): open
  to the corridor. West, the library: L bookcase in the courtyard corner, bench desk with plastic chairs, TV and
  whiteboard on stands, the wooden French doors to the courtyard. East, open to it (no glass partition), the games
  room: yellow wall with a big painting and a long desk with plastic chairs, two carrom boards on X stands. Outside
  the French doors, a wide stone platform level with the floor runs the full width of the front, three steps down
  along its edge, a potted plant at each front corner.
- **Study room** (south wing, courtyard side, also pushed 3.4 m out into the courtyard): mint window wall, red curtains,
  desks down both side walls and along the windows, two rows of back-to-back tables down the middle, plastic chairs,
  a TV under a red cloth by the door.
- **Laundry room** (south-west, video 112-120 s): steel slotted racks (low under the window, tall down the side walls)
  with blue laundry sacks on the shelves, one desk tucked against the wall beside the door, brown curtains, a wall fan.
- **Entrance lobby** (across the corridor; three outer rooms merged and pushed 3 m out through the north wall): open to
  the corridor between pillars; the glazed wooden exit door (locked) between glass side panels with steps outside,
  potted plants, a mirror, curtained windows, a red accent wall with a painting and a wooden sofa set, downlights.
- **Locked:** only the H.P. residence and the exit. E on them rattles the handle; a solid slab in each locked doorway
  keeps the player and the guards' nav grid out. Every other door opens.
- **Room doors:** white flush leaves with a see-through glass vision panel (a real opening with a dark bead and a clear
  pane), lever handle.
- **Towel nooks** at all four corners: the corridor runs on past the turn to a window in the outer wall (south-east: the
  south corridor runs on east, beside room 16); a clothes stand
  with towels, a chair piled with clothes, a bucket.
- **Courtyard-side rooms** (all open, every floor): the model's courtyard facade on the north and south wings stood only
  1.7-1.8 m from the corridor, so those faces are pushed out into the courtyard (north 1.47 m, south 1.61 m; `INNER` in
  tools/interior.mjs): the main faces end up 3.3 m from the corridor like the west wing, and the facade's zigzag (the
  protruding end bays) and the entrance recesses are kept. Each run between the corner wells, recesses, common room and
  study is split evenly into rooms the size of the outer ones (~3.5 m), each with its own window above the desks. The two
  solid blocks beside the common room are rooms too. West/east rooms the model left without a window get one, and the
  model's brown window panels on those facades are swapped for the standard window. Courtyard rooms are bedrooms,
  except the two store rooms past the east entrance recess (ground floor, video 238-244 s) and the study.
- **Wings stretched to the video's length:** the walkthrough shows the wings ~2 rooms longer south of each stairwell than
  the Shapr3D model, so everything south of a cut just past the stairwells is moved 7.4 m south (`STRETCH` in
  tools/interior.mjs, applied to the model's vertices in tools/convert.mjs); the wings, slabs and courtyard stretch to
  fill the band. East wing from the stairs south: office, three bedrooms, room 18, the towel nook.
- **Ground floor also:** H.P. residence, stores, and the house parent's office opposite the east
  stairs.

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
| `mutty [status\|here\|off\|on\|chase]` | Mutty's state / bring him near / enable / disable / chase |
| `zoya [status\|here\|off\|on\|spot]` | Dr Zoya's state / bring her near / enable / disable / spot |
| `hurt [n]`, `heal [n]`, `hearts` | health testing |
| `pause`, `menu` | pause menu / back to the title |

## Title menu (src/menu.js)
Glitched wordmark and menu (new game / controls / settings); Esc opens it as a pause menu. Settings: retro filter,
sound, and a saturation slider (0-200 %, a CSS `saturate()` on the canvas so it works with or without the retro
filter; remembered in localStorage). Behind it the live
scene plays slow camera shots cut with glitch tears, with the torch cutting in and out.

## Night, fog & horror (src/main.js, src/atmosphere.js, src/director.js, src/audio.js)
- Fog is done in the shaders: a dark distance haze plus a pale, moonlit ground mist that is thick at knee height,
  thins with height and rolls slowly in patches (outdoors only). The sky fades from near-black overhead into the
  fog colour at the horizon, with a faint moon glow, so distant buildings melt into it. Indoors the haze goes to
  near-black, so the far end of a corridor is just gone. The weak, yellowed torch (F) shows as a beam in the haze.
- Walking motion: the head dips as each foot lands and rises mid-stride, sways and rolls slightly with each step
  (bigger and quicker when running), footsteps land on the dips, a knee-bend on landing from a fall,
  slow breathing when standing still, and the torch beam lags behind quick turns.
- A scare director paces small, ambiguous events rather than constant jump scares. Tension builds indoors and in
  the dark, and it fires more often as tension rises: footsteps behind you that stop a beat after you do; a tall
  pale figure at the edge of the torchlight, there for a glimpse (2-3 s at most) and gone the moment you're within 4 m,
  light it up or look away; the torch
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
