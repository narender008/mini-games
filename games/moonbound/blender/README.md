# Moonbound sprite pipeline

Every sprite in Moonbound is modelled, posed, simulated and rendered by these Blender 5.2 scripts; no `.blend` file is
kept. `build.sh` runs Blender headless (Cycles on the CPU), renders each frame four ways (albedo, camera-space normals,
glow and gloss, ambient occlusion), paints it (`bl.combine`: baked AO, cavity and edge light, a thin dark rim), trims it,
packs each set into 2048x2048 albedo pages and 1024x1024 normal pages (`pack.py`) and compresses them with `cwebp`:

```sh
./build.sh                                   # everything (wipes the frame cache first)
ONLY=thrall,gravebow ./build.sh              # only those modules; other frames come from the cache
FRAME=thrall_attack_d2_5 ONLY=thrall ./build.sh   # FRAME needs ONLY
REVIEW=/some/dir ./build.sh                  # also a lit contact sheet of the frames this run rendered (REVIEW_MATCH=thrall_ narrows it)
NOPACK=1 / PACKONLY=1 / SETS=gloamwall / QUALITY=fast|high / ATLAS_OUT=dir CODEX_OUT=dir / ALLOW_SHRINK=1
```

The build stops at the first failure (a Python error in any script, a missing Blender or cwebp). Sets are packed into
`$WORK/stage` and the shipped files are replaced only once every set has packed; a set that would lose frames its shipped
json has (a partial frame cache) fails unless `ALLOW_SHRINK=1`.

Outputs: `../assets/sprites/<set>_<n>.webp` (albedo), `<set>_<n>_n.webp` (RG normal, B gloss, A glow), `<set>.json`
(frames with pivots, animations, light anchors and footprints) and `../assets/codex/<name>.webp` (codex portraits).
Intermediate files live under `$TMPDIR/moonbound-build`, never in the repository. The build holds one of two machine-wide
slots for heavy jobs and waits for a calm machine.

| File | What it is |
| --- | --- |
| `bl.py` | mesh primitives (bmesh with UVs), the game camera (looking north, 50 degrees down, orthographic), directions, the sheet renderer and the painterly combine |
| `mats.py` | the four-pass materials (albedo, normal, glow and gloss, AO) and the shared palette |
| `rig.py`, `cloth.py` | an FK skeleton with two-bone IK and easing; Verlet cloth, hair and chains baked per frame (loops simulate several cycles and keep the last) |
| `render.py` | module list and the context modules use: `ctx.anim`, `ctx.one`, `ctx.portrait`, `ctx.anchor`, `ctx.value` |
| `pack.py`, `review.py` | atlas packing; lit contact sheets for review |
| `heroine*.py` | Maelis with the Waning Twins and the Tidecaller (sets `hero_twins`, `hero_staff`, 16 directions) |
| `undead.py`, `thrall.py`, `gravebow.py`, `warden.py` | the bone legion (set `gloamwall`) |
| `spirits_*.py`, `skitter.py`, `mourner.py`, `lampwight.py` | the Skitterskull and the spirits (set `gloamwall`) |
| `bosses_*.py`, `gaoler.py`, `seraph.py` | the Bone Gaoler (set `gaoler`) and the Hollow Seraph (set `seraph`) |
| `gwkit_*.py`, `gloamwall_props.py`, `common_fx.py` | the Gloamwall's walls, gates, decor, traps, room features and far ruins; pickups (set `common`) |
| `hollow_*.py`, `hollow_props.py`, `hollow_folk.py`, `dummy.py` | the Hollow: roots, cauldron, furniture, candles, ghost cats, wisps, the training dummy (set `hollow`) |

Conventions (DESIGN.md sections 2, 4 and 5): build every model facing south (Blender -Y) standing on z = 0; the kit renders
the directions (only the eastern half when mirrored). Frame names are `<prefix>_d<d>_<i>`; the game code depends on the
prefixes, frame counts and rates listed in DESIGN.md.

Pitfalls the first builds ran into: `render_cells` moves each frame to its place on the render sheet, so a material whose
pattern comes from world position (the `fade` and `dirt` options of `mats.surface`) changes from frame to frame and swims
between directions; drive patterns from object space or UVs instead. `Cloth.bake` needs a few warm-up cycles (and a low
damping) before a loop closes cleanly from a pose far from the setup pose. `Mesh.grid_sheet` has v = 0 at the top.
