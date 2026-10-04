# Iron Barrage sprite pipeline

Everything in `games/iron-barrage/assets/sprites/` (`units.webp`, `units_n.webp`, `units.json`) is generated here: fictional tanks,
crew, gore, debris, ordnance, a jet, a parachute and battlefield props are modelled in Python, rendered in Blender, and packed into one
atlas pair. There are no `.blend` files in the repo; the scripts are the source.

## Rebuild

```sh
bash games/iron-barrage/blender/build.sh
```

Needs Blender 5.2 (built with 5.2.2 LTS, `/Applications/Blender.app/Contents/MacOS/Blender`, override with `BLENDER=`), `cwebp`
(`CWEBP=` to override) and nothing else: the Python inside Blender provides numpy, and the PNGs are written by `bl.write_png`.
A full build takes about 2 minutes on 8 CPU threads (Cycles, CPU only). The build waits while the machine is busy (1 minute load
above 20 or less than 20% free memory). Run one build at a time.

Switches (environment variables):

| variable | effect |
| --- | --- |
| `ONLY=props,crew` | render only those groups, reuse every other frame from the last run in `$WORK/frames` |
| `INTERIM=1` | alias any missing bulwark/lynx frame to the warden rectangle (for a quick first atlas) |
| `REVIEW=dir` | also write `sprites-albedo.png`, `sprites-normal.png`, `sprites-mask.png`, `sprites-assembled.png` to `dir` |
| `QUALITY=fast\|high` | fewer or more Cycles samples than the default |
| `THREADS=8` | Blender threads (keep it at 8 or fewer) |
| `WORK=dir` | scratch directory, default `$TMPDIR/iron-barrage-build` (frames, atlas PNGs). Delete it with a guarded `rm -rf "${WORK:?}"` |

Groups: `warden bulwark lynx crew gore debris ordnance jet parachute props`. Without `ONLY` the frame directory is wiped first.
Geometry is deterministic: every random choice uses a fixed seed, and `Mesh.warp` uses `mathutils.noise.noise` (its `noise_vector` is not repeatable between runs). Rendering is repeatable except for rare single-pixel differences of one colour level between runs (Cycles' Bevel node samples at random, and the result also varies with machine load, even on one thread), so two builds can differ by a few bytes. Commit the output of one build; do not chase byte-identical rebuilds.

## Output

* `units.webp`: RGBA albedo. Albedo colour times ambient occlusion, sRGB, straight alpha. No directional lighting is baked in.
* `units_n.webp`: RGB camera-space normal (`n * 0.5 + 0.5`, R = +x right, G = +y up, B = +z toward the camera). Alpha is the paint
  mask: 255 on armour paint (neutral grey, the game multiplies it by a team colour), 0 on rubber, bare steel, tools, optics, crew,
  gore, charred metal and all props.
* `units.json`: `{size:[W,H], frames:{name:{x,y,w,h,px,py,ppm}}, tanks:{type:{turret,gun,muzzle,hatch,length,height,trackLength}}}`.
  `px, py` is the pivot in pixels from the frame's top-left (y down). Tank numbers are metres, y up: `turret` is relative to the hull
  pivot, `gun` (the trunnion) and `hatch` (the commander's waist) are relative to the turret pivot. They come from the constants at the
  top of `warden.py`, `bulwark.py` and `lynx.py` (`TURRET_AT`, `GUN_AT`, `MUZZLE`, `HATCH_AT`, `LENGTH`, `HEIGHT`, `TRACK_LEN`).
* The atlas is the smallest of 256-pixel multiples (at most 2048) that holds every frame (currently 1024x1536), with 2 px transparent
  padding per frame and 2 to 4 px of colour extruded past the edges so mip-maps do not bleed dark fringes. Both files together stay
  well under 1.4 MB (`cwebp -q 88 -alpha_q 100 -m 6 -exact` for albedo, `-q 92 -alpha_q 90 -m 6 -exact` for the normals).

## Conventions

* Orthographic side view. World X is right, Z is up, the camera sits on -Y looking +Y, and everything faces +x. Transparent film.
* Scale: 48 pixels per metre for tanks, crew, gore, debris, ordnance and most props; 24 ppm for the jet, the parachute and the tall
  props (`prop_deadtree`, `prop_pine`, `prop_pine_broken`, `prop_wall_ruin`, `prop_mast`). The `ppm` of each frame is in the json.
* Pivots: tank hull = midpoint of the ground-contact line (bottom centre); tank turret = ring centre at the bottom; gun = trunnion;
  `crew_commander` = the waist (bottom centre); `parachute` = where the risers meet; ordnance and small debris = centre of mass;
  props = bottom centre where the prop meets the ground (everything below the ground line is cut off).
* Tank frames: `<type>_hull_0..3` (track phases, each a quarter link pitch further along +x, so the four frames loop seamlessly),
  `_turret`, `_gun`, `_wreck_hull`, `_wreck_turret`, for `warden`, `bulwark` and `lynx`.
* Other frames: `crew_commander`, `gore_helmet`, `gore_boot`, `gore_chunk_0..3`, `debris_*` (wheel, sprocket, hatch, plate_0..2, track,
  jerrycan, toolbox, mg), the ordnance (`shell shell_heavy sabot cluster bomblet napalm missile buster roller nuke bomb flare`),
  `jet`, `parachute`, and 22 `prop_*` frames.

## What each script does

| file | role |
| --- | --- |
| `build.sh` | the whole pipeline: waits for a calm machine, runs `render.py`, `pack.py`, `cwebp` (and `review.py`) |
| `render.py` | builds each group's meshes and renders every frame to `<name>.a.png`, `.n.png`, `.json` in the frames directory |
| `pack.py` | MaxRects packer: writes `units.png`, `units_n.png` and `units.json` |
| `review.py` | decodes the final webp (`dwebp`) and writes the contact sheets and the assembled tanks, composed from the json mounts only |
| `bl.py` | geometry kit (`Mesh` with box, prism, slab, convex, lathe, cyl, sphere, tube, grid_sheet), matrices (`at_xz`: positive angle is counter-clockwise in the side view), scene setup, the four-pass render, PNG reader and writer |
| `mats.py` | procedural material library (node trees): paint with subtle three-tone camo, chips, rust, oil, dust, mud, soot, brick, wood, snow, rock and so on, each with an albedo, normal, paint-mask and ambient-occlusion output mode |
| `kit.py` | shared turret and hull detailing: appliqué plates and sloped side panels, sight hump, grab rails, spare track links, side bins, whip aerials, smoke launchers, cast mantlet, tow shackles, soot |
| `parts.py` | shared fittings: bolts, welds, tools, wheels, tracks, `Theme` (maps part names to paint or burnt materials for a tank or its wreck) |
| `gear.py` | running gear of the three tanks: track belt, road wheels, rollers, idler, sprocket, the wreck variant with a sagging track |
| `warden.py`, `bulwark.py`, `lynx.py` | the three tanks: hull, turret, gun, wreck hull, wreck turret, and the mount constants |
| `crew.py` | commander, helmet, boot, gore chunks |
| `debris.py` | wheel, sprocket, hatch, torn plates, track run, jerrycan, toolbox, machine gun |
| `ordnance.py` | the twelve projectile and bomb sprites |
| `aircraft.py` | the jet and the parachute |
| `props.py` | battlefield props (sandbags, drums, crates, hedgehog, wire, trees, wrecked vehicles, wall, rubble, rocks, mast ...); `PROPS` maps frame name to builder and ppm |

## How a frame is rendered

Cycles on the CPU, emission shaders only (no bounces, no lights), 32-bit EXR, 2x supersampled and box-filtered down. Each frame is
rendered four times by switching one shared `MODE` value in every material: albedo, camera-space normal, paint mask, and ambient
occlusion at three distances (small, large, crevice). `bl.combine` multiplies the albedo by the occlusion
(`shade = 1 - 0.68 * (1 - occlusion)`), renormalises the normal and stores the paint mask in the normal map's alpha.

To add a sprite: write a builder returning a `Mesh` (materials by key, see `mats.SPECS`), add it to a group in `render.py`
(`one(name, mesh, pivot, ppm, rect)`, or a `PROPS` entry for a prop), and run `build.sh`. Frame names and pivots of existing frames
must stay stable, because the game looks sprites up by name.
