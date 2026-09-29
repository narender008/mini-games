# Toy Tanks: model build scripts

The six toy tanks (`classic`, `chunky`, `mini`, `long`, `twin`, `dome`) are modelled in Blender with Python and exported as compressed GLB files in `../assets/models/tank-<id>.glb`. No `.blend` file is kept: the scripts are the source.

## Rebuild

Needs Blender 5.2 (headless) and Node (for `npx gltfpack`).

```sh
cd games/toy-tanks/blender
./build.sh                  # all six
./build.sh classic,chunky   # some of them
BLENDER=/path/to/Blender ./build.sh
```

`build.sh` runs Blender with `--background --factory-startup --python tanks.py`, which builds each tank and writes a raw GLB to a temp folder, then compresses it with `gltfpack@1.3.0 -cc -kn -km -ke -vp 16 -vn 12`:

- `-cc` meshopt compression (`EXT_meshopt_compression`, decoded in the game by the vendored `meshopt_decoder`)
- `-kn -km -ke` keep the named nodes, the named materials and the node extras the game reads
- `-vp 16 -vn 12` finer positions and normals than the defaults, so the glossy paint reflects smoothly

To look at a tank without building the game, render a preview picture (Cycles, glossy plastic):

```sh
Blender -b --factory-startup --python tanks.py -- --only classic --preview /tmp/tank-previews --views side,ref,q3 --samples 64 --res 1100x700
```

Views: `side`, `ref` (low three-quarter, like the reference picture), `q3`, `rear`, `top`, `front`.

## Files

- `tanks.py`: the six tank designs and the exporter (start here). Sizes are in millimetres.
- `parts.py`: wheels, tracks (belt and tread lugs) and the gun.
- `lib.py`: bmesh helpers (rounded boxes, lathe, bevel, boolean, the raised star, the track path), materials, GLB export and the preview scene.
- `build.sh`: Blender, then gltfpack, into `../assets/models/`.

## What the game relies on

Node names: `tank` > `hull` > (`turret` > `barrel` > `muzzle`, `wheel_L0..`, `wheel_R0..`, `track_L`, `track_R`). The tank faces +X, +Y is up, the bottom of the tracks is at y = 0 and the origin is the middle of the tracks. `turret`'s origin is the turret ring centre, `barrel`'s is the trunnion (the barrel points +X at zero elevation, and turns about Z), `muzzle` is an empty at the tip. Wheels turn about their local Z.

Materials: `paint` (the body colour; the game tints it), `rubber`, `hub`, `star`, `metal`.

Node extras (kept by gltfpack): `tank` has `dims` (length, width, height in metres), `muzzleHeight`, `muzzleX` and `contacts` (front and rear road-wheel x); each wheel has `radius` and `kind`; each track has `path` (its centre line, x and y pairs) and `length`, which the game uses to scroll the tread round the loop.
