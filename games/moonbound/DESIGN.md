# Moonbound: design and art guide

Moonbound is a dark-fantasy action roguelike seen from high above at an angle: a witch fights her way up a ruined citadel that
floats over a void, one chamber at a time, dies, returns home stronger and tries again. This guide is the contract every later
delivery follows. When the code and this guide disagree, fix one of them in the same change.

## 1. World and lore

**The Stopped Hour.** A hundred years ago the Hour Tyrant seized the Midnight Clock at the summit of Nocthelm, the citadel that
turns night into day, and stopped it at the last stroke of midnight. Since then the night has never ended. The dead can no
longer cross the Last Horizon, so they walk the citadel's walls, vaults and sanctums, bound to the Tyrant's endless midnight.
Nocthelm itself tore loose from the earth and now hangs over the Undervoid, a lightless abyss of fog and drifting ruins.

**The Celestine.** Four sky-spirits once kept the night: Vaela of the Waning Moon, Aurin the Dawn Star, Umbriel of the Eclipse
and Corvane the Wandering Comet. Their light is fading with every unturned hour. They cannot walk Nocthelm themselves, but they
lend their power (blessings) to the one mortal who still can.

**Maelis, the last Moonbound.** The Moonbound were witches who drew their strength from the moon. When the clock stopped they
fell one by one, until only Maelis remained, carrying the moon's last sliver inside her. The sliver will not let her die:
whenever she falls in Nocthelm, the moon pulls her soul back to her refuge.

**The Hollow.** Maelis's refuge is a cavern crossroads in the roots of the Elder Yew, the tree that still binds Nocthelm to
what is left of the world. Lost things gather there: ghost cats (the familiars of the fallen witches), small wisps (souls too
gentle to haunt the walls), candles that never burn down. At its heart stands the Moonwell Cauldron, which turns moonshards
into lasting power. The Gate of Roots leads up into the citadel.

**The road to the summit** (one region per delivery):

| # | Region | What it is | Region boss | Status |
| --- | --- | --- | --- | --- |
| 1 | The Gloamwall | Nocthelm's outer ramparts and bridges under a cold moon, patrolled by the bone legion that once defended the city. Mini-boss: the Bone Gaoler. | The Hollow Seraph, once the moon's own warden, now the Tyrant's jailer on the wall | built |
| 2 | The Vigil Vaults | Candlelit undercroft, ossuaries and reliquaries where the dead keep an endless vigil: shadow wraiths, screaming skull spirits, wax-sealed tombs, moonlit lancet windows. | The Wax Abbess, who keeps the vigil and melts and reforms in candle flame | later |
| 3 | The Fallen Orrery | A ruined astral sanctum floating over violet fog, constellation lines in the floor, the Celestine's broken altars under pillars of light. | The Orrery Engine, a brass-and-starlight machine that once moved the heavens | later |
| 4 | The Midnight Clock | The summit: a vast cracked marble arena inlaid with gold clockwork rings and rune circles, hooded statues and braziers under the full moon. | The Hour Tyrant, a giant gilded knight with a halo of spikes and an hourglass staff; the final boss | later |

A run climbs every region built so far, in this order, without going home: past each region's boss the stair leads on into
the next. Above the highest region built so far the way is sealed by the stopped clock "for now": its boss ends the run, the
ending card says so, and progress is saved. Each later delivery adds its region to the climb (section 10).

## 2. Camera, scale and space

* **Camera**: orthographic, looking north and down at **ELEV = 50 degrees** below the horizon (`src/config.js` ELEV,
  `blender/bl.py` ELEV). No yaw: north is up the screen.
* **Units**: metres. The ground plane is (x, y) with x east (right) and **y south (down the screen)**; z is height.
  Screen = (x, y * sin(ELEV) - z * cos(ELEV)). Ground circles therefore draw as ellipses squashed to 0.766, as in the key art.
* **Zoom**: the view shows about 370 square screen-metres whatever the window's shape (16:9 shows about 25.6 x 14.4 m), never less
  than 11 m across its short side. Everything keeps its size; a bigger window sees more.
* **Heights**: Maelis 1.68 m (2.1 m to the hat tip). Human-sized undead 1.7-2.0 m. Skitterskull 0.5 m tall, 1 m legspan.
  Bone Gaoler 3 m. Hollow Seraph 3.2 m, 4.5 m wingspan. Doors 3.5 m. Rampart walls 1.1 m (parapets) to 4 m (gate walls).
* **Collision**: everything is a circle on the ground plane (Maelis r = 0.35 m, thrall 0.4, gaoler 1.1, seraph 1.0).

## 3. Palette and lighting

The look is painted dark fantasy: deep cold shadows, a few strong saturated light sources, rich texture in the darks, never
flat black. Only light sources and magic are saturated.

| Role | Colours |
| --- | --- |
| Maelis | navy `#1c2340`, deep teal lining `#1f4a50`, silver-white hair `#dfe3e8`, aged gold `#c9a14a`, moon cyan magic `#b9e6ff` |
| Undead and soul light | bone `#d6ccb4`, tattered navy and violet cloth `#2a2d48` / `#36324e`, soul teal `#3fe0c5`, soul cyan `#7ff3ff` |
| Gloamwall | blue-black stone `#262a36`, wet flagstone highlights `#5a6478`, cold cyan soul-fire braziers, gold inlay `#a8823e`, navy banners with silver crescents, moonlight `#9fb4e0` |
| The Hollow | warm root-brown `#3a2a20`, candle amber `#ffb35a`, cauldron green-violet `#7dff9a` / `#b98cff`, chasm glows ember red `#ff5a36` and void blue `#4a6aff` |
| Patrons | Vaela pale cyan `#9fe8ff`, Aurin gold `#ffcf6a`, Umbriel violet `#b48cff`, Corvane ember-rose `#ff8a6a` |
| Danger | enemy telegraphs are warm: amber `#ffb347` fill, red-orange `#ff5a2a` edge; Maelis's own effects are always cool (cyan, white, violet) so the two never read alike |

**Lights** (`src/gl/shaders.js`): a moon key light from the upper left and behind (world direction toward the light
(-0.35, -0.55, 0.76), cool blue-white), hemispheric ambient (cool from above, dim violet bounce from below), a rim light on
sprite edges, and up to 24 dynamic point lights (braziers, candles, soul fire, spells, projectiles) that light floors and
sprites in true 3D: a sprite pixel's height is recovered from its position above the sprite's ground pivot. Every sprite has
baked ambient occlusion, cavity darkening and edge light in its albedo, and gloss and glow masks in its normal map.

## 4. Sprite pipeline

Everything visible that is not a shader effect is modelled by the Blender 5.2 scripts in `blender/` and pre-rendered from the
game camera into atlases (`assets/sprites/<set>_<n>.webp` albedo, `<set>_<n>_n.webp` normal + gloss + glow, `<set>.json`).
No `.blend` files are kept. See `blender/README.md` for the commands.

* **Sets** are loaded together: `hero_twins` and `hero_staff` (Maelis with each weapon; only the equipped one is resident),
  `hollow` (home base), `gloamwall` (region 1 creatures and kit), `gaoler` and `seraph` (loaded for their chambers only),
  `common` (shared effects sprites). Later regions add their own sets; a region's sets are resident only while the run is in
  it and are let go as the run climbs on.
* **Pages**: albedo 2048x2048, normals half size (1024x1024, same UVs). Low quality, and phones and tablets at every
  quality, halve both at upload. A rebuild decodes and uploads one page at a time.
* **Resolution**: Maelis 80 px/m, creatures 72 px/m, bosses 60 px/m, props 64 px/m.
* **Directions**: Maelis 16, every creature 8, mirrored (only the eastern half is rendered; the game flips the western half).
  Direction d faces angle d * 360 / N degrees with 0 = east, 90 = south (toward the camera).
* **Frames** are trimmed one by one and keep a pivot (the ground point under the character). Names:
  `<prefix>_d<d>_<i>`, for example `thrall_attack_d2_5`.
* **Models** face south when built (Blender -Y), stand on z = 0, and use the shared rig (`blender/rig.py`), materials
  (`blender/mats.py`) and baked cloth and hair (`blender/cloth.py`). Hair, coats, rags, banners and chains are simulated so they
  trail, swing and settle: loops are simulated for several cycles and the last is kept, so they loop seamlessly.
* **Codex portraits**: each creature and Maelis also render a large, lit portrait from a lower camera
  (`ctx.portrait`), shipped as `assets/codex/<id>.webp`.

## 5. Animation standards

Rates are frames per second of the sprite animation; the game also adds squash, lean, hit flashes and afterimages in the shader.
The table is the design; the atlas JSON is the truth. One-shot animations are timed by the game in seconds and mapped onto however
many frames the atlas holds (`Painter.frameOf`, `Foe.specFrame`), so a set rendered with fewer frames (the bosses under
`BOSS_FIT=1`, for a smaller download) plays at the same speed with its key frames in the same place. The bosses ship at the
counts below: the Gaoler fills 4 pages and the Seraph 6, which are resident only in their own chambers.

| Who | Animations (frames @ fps) |
| --- | --- |
| Maelis, each weapon | idle 10 @ 10 (loop), run 10 @ 18 (loop), dash 6 @ 30, attack1-3 (see weapons), dash strike 6 @ 24, special, cast 8 @ 20, hit 4 @ 20, death 12 @ 12 |
| Bone Thrall | idle 6 @ 8, walk 8 @ 12, attack 9 @ 14 (strike on frame 5), hit 3 @ 16, death 8 @ 12 |
| Gravebow | idle 6 @ 8, walk 8 @ 12, shoot 10 @ 12 (loose on frame 6), hit 3 @ 16, death 8 @ 12 |
| Skitterskull | idle 4 @ 10, scuttle 6 @ 20, leap 6 @ 14 (airborne 2-4), hit 2 @ 16, death 5 @ 14 |
| Mourner | idle 8 @ 10, drift 8 @ 10, lunge 6 @ 14 (streak from frame 3), hit 3 @ 16, death 8 @ 12 |
| Lampwight | idle 8 @ 8, drift 8 @ 8, cast 10 @ 12 (orbs on frame 6), pyre 10 @ 12 (burst on frame 7), hit 3 @ 16, death 10 @ 12 |
| Rampart Warden | idle 6 @ 8, walk 8 @ 11, thrust 10 @ 14 (strike on frame 6), charge 6 @ 14 (loop), hit 3 @ 16, death 10 @ 12 |
| Bone Gaoler | idle 8 @ 8, walk 8 @ 9, slam 12 @ 12 (impact on 7), sweep 12 @ 12 (swing 6-8), charge 6 @ 14 (loop), roar 10 @ 10, hit 3 @ 14, death 14 @ 10 |
| Hollow Seraph | idle 8 @ 10 (hover), glide 8 @ 12, sweep 12 @ 14 (strike 7-8), throw 10 @ 14 (release 6), cast 10 @ 12 (lantern raised from 5), dive 10 @ 12 (rise 0-4, fall 5-9), gust 10 @ 12 (wings forward 6), hit 3 @ 14, death 16 @ 10 |

Deaths end in the **shatter into light**: the last death frame dissolves in the shader into soul light, wisps and bone dust.
There is no blood anywhere.

## 6. Combat, controls and feel

All numbers live in `src/game/feel.js` (movement, dash, buffer, hit-stop, shake, aim assist, camera), the weapon files
(`src/game/weapons/*.js`) and the foe files; this section is the summary.

**Control map** (rebindable in Settings, Controls; saved per device):

| Action | Keyboard and mouse | Gamepad (standard mapping) | Touch |
| --- | --- | --- | --- |
| Move | W A S D (or arrows) | left stick | drag on the left half |
| Aim | the mouse | right stick (or the move direction), with aim assist | the attack stick |
| Attack | left mouse button (or J) | X / Square, RT | hold and drag the attack stick |
| Special | right mouse button (or K) | Y / Triangle, LT | Special button (drag to aim) |
| Dash | Space (or Shift) | A / Cross | Dash button |
| Cast | Q (or L) | B / Circle, LB | Cast button |
| Interact | E | RB | tap the prompt |
| Pause | Esc (or P) | Start / Options | the pause button |
| Full screen | F | | the full screen button; the first tap on the title |

Prompts show the glyphs of whichever device was used last (keys, Xbox or PlayStation letters); first-time hints appear once
each, in context (move on arrival, attack when the first foe rises, dash when the first telegraph appears, and so on).

**Feel numbers.** Maelis runs at 7.5 m/s with snappy acceleration (70 m/s²). Dash: 0.18 s, 4.2 m, invulnerable for
0.22 s, one charge (two with Shadowstep or Second Wind), 0.32 s before the next. Every press is buffered for 0.18 s.
A dash cancels an attack once its hit has landed; an attack during the second half of a dash or within 0.22 s after it
becomes a dash strike. Attacks snap to the aim. Hit-stop: 45 ms on a hit, 75 ms on heavy hits and crits, 90 ms on bosses,
100 ms when Maelis is hurt. Screen shake is trauma-squared (0.12 light, 0.28 heavy, 0.4 hurt), scaled by the Settings
slider. After a hit she is invulnerable for 0.9 s. Damage numbers can be turned off.

**Weapons.** The Waning Twins: forehand 14, backhand 15 (2.15 m arcs, 0.29 s each), a leaping spin 13 + 17 all round;
dash strike 22; Special *Eclipse Whirl* (hold: 8 per hit every 0.16 s in 2.3 m, moving at 3.2 m/s, 0.45-1.8 s).
The Tidecaller: sweeps 21 and 22 (2.9 m, 0.4 s), an overhead thrust 34 that also looses an 18-damage moon bolt;
a spinning dash strike 24; Special *Crescent Tide* (a 30-damage wave 3.2 m wide rolling 10 m through everything).
Cast, shared: the *Moon Rune*, three charges (one returns every 5.5 s), placed at the cursor up to 7 m away (or along the
stick toward a foe), bursting 0.55 s later for 45 in 2.4 m.

**Patrons and blessings** (`src/game/blessings/`). Four patrons, eight blessings each: one for each move (Attack, Special,
Cast, Dash; a move holds one blessing, a new one replaces it) and four passives. Rarity (Faint, Bright, Radiant,
Celestial; 62/27/9/2 weighted, shifted by luck) scales the numbers. A blessing door offers three of one patron's, chosen
with the mouse, keys 1-3, or the pad.

| Patron | Status | Attack / Special / Cast / Dash | Passives |
| --- | --- | --- | --- |
| Vaela of the Waning Moon | Chill: 8% slow a stack; 5 stacks freeze (1.3 s) | Frost Edge, Rime Arc, Frozen Rune, Glacial Step | Hoarfrost, Winter's Ward, Shatterpoint, Long Night |
| Aurin the Dawn Star | Dawnmark: bursts for 30 in 1.9 m after 1.1 s | Dawnblade, Sunflare, Daybreak Rune, Gleaming Step | Kindled Heart, Solar Ward, Zenith, First Light |
| Umbriel of the Eclipse | Umbra: 3 a stack every 0.5 s, 5 stacks | Shadow Cut, Penumbra, Eclipse Rune, Umbral Passage | Deepening Dark, Grim Omen, Totality, Night Harvest |
| Corvane the Wandering Comet | Starfall: delayed star strikes | Comet Strike, Starfall, Meteor Rune, Comet Trail | Swift Orbit, Second Wind, Wanderer's Luck, Trajectory |

**Foes of the Gloamwall** (health at the first chamber of a run; +6% per chamber climbed after the second, damage +3.5%
after the fourth):
Bone Thrall 60 (a 100-degree, 2.2 m falchion cut, 0.62 s wind-up, 9 damage), Gravebow 42 (keeps 6-9 m away, a 14 m arrow
line, 0.85 s draw, 8), Skitterskull 20 (swarms, a leap onto a 1.15 m circle, 6), Mourner 50 (floats, a 6.5 m streak through
her, 9), Lampwight 75 (fans of soul orbs that drift toward her, 7 each; a 1.9 m pyre under her, 11), Rampart Warden 120 + 90
ward (does not flinch while warded; a 3.4 m spear thrust, 13; a shield charge along 8 m, 14, stunned if it hits a wall).
Elites (from the third combat chamber, up to 32%): +80% health, +20% damage, an aura and one trait: Swift, Warded,
Vengeful (bursts into six soul orbs), Hulking.

**Bosses.** The Bone Gaoler (950): fist slam (2.4 m circle, 18; a 5 m shockwave ring after it in phase 2), chain sweep
(300 degrees, 3.8 m, 14), charge (11 m line, 20; a charge into a wall stuns it for 1.6 s and it takes 30% more), and at
half health a roar that frees five caged souls. The Hollow Seraph (2300): scythe sweep (160 degrees, 4.4 m, 18), crescent
throw (one, then three), soul-orb spirals from her lantern (two arms, then three), a dive (she rises out of reach and falls
on a 2.5 m circle, 22; a ring follows from phase 2), and a wing gust that throws Maelis back. Phase 2 at two thirds calls
Mourners and a Lampwight; phase 3 at one third is the eclipse: the light drains (`world.darkness`), Skitterskulls keep
coming, and she dives twice.

**Run structure.** A run climbs the built regions in order (`src/regions/index.js`), each region's chambers following its
`plan` (`src/game/run.js` runs it). The Gloamwall's: the Gate (a first blessing on the pedestal), four combat chambers, the
Bone Gaoler, the Pale Pedlar's shop, three combat chambers, the Moonwell fountain, the Hollow Seraph. Combat chambers come in
2-3 waves from a threat budget (the region's `encounters.js`, planned by `src/game/waves.js`). Doors show their reward: a
patron's blessing, silver, a heartroot (+15 max health) or moonshards (more for each combat chamber of the whole climb);
a shop may be offered on the third and eighth steps (`shopOffers`). A mini-boss leaves 15 moonshards and a blessing with
better odds. A region's boss leaves 30 moonshards and a heartroot, then its gate opens on the way up: the passage card (the
next region's art and name, and a line about the climb)
covers the swap of sprite sets, and the next region begins at its Gate with its banner. Maelis keeps her health, blessings,
silver and everything else. Difficulty runs on through the whole climb: foe health and damage grow with every chamber
climbed, never below a region's own `baseline`, and a region's combat chambers never plan a smaller budget, fewer waves or a
lower elite chance than the last combat chamber of the region below. Above the highest region built, its boss ends the run
with that region's ending card (the path deeper sealed, for now); the final region, the Midnight Clock, ends it with its own
finale. The save keeps how often each region has been cleared (Maelis's journal reads it). Silver buys the
Pedlar's wares (healing, a sealed prayer for a blessing, a heartroot, a Moon Tear for +1 cast charge, a whetstone for +12%
damage, moonshards). Moonshards are kept on death and brewed at the Moonwell Cauldron (`src/game/upgrades.js`): Deep Roots,
Moonsteel, Shadowstep, Tidewell, Last Light (a revive), Pedlar's Favour, Lucky Star, Silver Purse. The Mercy of the Moon
(assist mode, Settings, Gameplay or the journal by the bed) reduces the damage Maelis takes by 20%, plus 2% per fall, to 80%.

## 7. Telegraphs and readability

* Every enemy attack is announced on the ground before it lands: a warm amber fill that grows to a red-orange edge over the
  wind-up, in the exact shape of the hit (cone, line, circle, ring), and a brief flash when it fires.
* Projectiles are bright and slow enough to dodge; enemy projectiles are warm (amber, sickly teal for soul orbs with a dark
  core), never cyan-white like Maelis's.
* Elites wear a violet-teal aura and a crown of light over the health pip, and their name gets a prefix.
* Damage numbers: white for hits, gold for critical hits, cyan for cast, violet for curses, larger for bigger hits.

## 8. UI

One dark-and-gold style everywhere: near-black panels with a soft violet-navy gradient, thin aged-gold rules and corner
filigree, serif small caps titles, white body text, gold for selection.

## 9. Sound

Synthesised in WebAudio, no spoken voice. Dark and atmospheric: low drones and slow choir-like pads per region, a combat layer
(taiko-like drums, low string ostinato) that rises with the number of foes, a boss theme. Hits are punchy and weighty: a sharp
transient, a low thump and a crunch or a crystalline shatter for bone.

## 10. Extending the game

**A region** is a folder `src/regions/<id>/` whose `index.js` default-exports one object (the Gloamwall's,
`regions/gloamwall/index.js`, is the pattern). It joins the climb by one line: its own slot in `CLIMB` in `src/regions/index.js`
becomes `{ id: '<id>', load: () => import('./<id>/index.js') }`. That list fixes the order (`gloamwall`, `vaults`, `orrery`,
`clock`) whatever order the regions are built in; an empty slot is skipped. `run.js`, `main.js` and the interface read
everything region-specific from the object, so nothing else changes:

| Field | What it is |
| --- | --- |
| `id`, `name`, `subtitle` | the slot's id; the banner at the region's Gate, and the passage card's title |
| `music` | the score theme of its chambers (`src/audio/themes_*.js`) |
| `sets` | its sprite sets, resident while the run is in the region (section 4) |
| `look`, `floor`, `kit`, `lights` | lighting and grade (`gl/look.js`); the floor shader (a GLSL function `void floorX(vec2 w, vec4 m, out vec3 col, out float h)` plus eight colours and four parameter vectors); the wall kit (sprite names the room builder places along edges); the light each kind of prop gives off |
| `layouts` | hand-made chambers (`layouts.js`, legend in `src/game/room.js`): one each of kind `start`, `shop`, `fountain`, `miniboss` and `boss` (whose gate is the way up), and at least 16 combat layouts each with two or three exit gates |
| `plan`, `shopOffers` | the chamber kind of each step, `start` first and `boss` last; the steps whose doors may offer the Pedlar instead of a reward |
| `encounters` | `encounters.js`: `budget(d)`, `waves(d)` and `eliteChance(d)` by the region's combat depth d (1 at its first combat chamber; its mini-boss counts once she is past it), `elites`, `noElite` (swarms), `pool`, set pieces in `sets`, `threat` |
| `planWaves` (optional) | `planWaves(encounters, depth, rng, numbers)`: the region's own wave planner for its combat chambers, in place of `src/game/waves.js`'s; `numbers` is the chamber's `{budget, waves, elite}` (`chamberNumbers`), and it returns the waves |
| `miniboss`, `boss` | foe ids (section 10, "A boss"); their names and titles (the banners), music themes and sprite sets come from their foe data |
| `foes` | the foes the codex lists under the region, in this order |
| `rooms` | per chamber kind, optional `title` (its banner), `subtitle` (the line under the banner), `music` (its theme, in place of a boss's or the region's) and `door` (the label over a door leading there); the Gloamwall's name the shop and fountain chambers and the boss's door |
| `cards` | loading cards `{art, text}` (art is `art/<art>.webp`): `region` (also the passage card's picture, and shuffled in with the others), `miniboss`, `boss` |
| `passage` | the line on the passage card as Maelis climbs on past its boss |
| `ending` | `{art, title, text, note}`: the ending card when the run stops at its boss because nothing above is built yet; the card adds "The path deeper is sealed, for now." |
| `journal` | `{ahead, behind}`: Maelis's journal line before the region is first cleared, and after while it is the top of the climb |
| `lore` | its codex world pages `{id, name, art, unlock, text}` (`unlock`: a foe id that must have been beaten) |
| `baseline` (optional) | `{hp, dmg}`: floors under the foe health and damage multipliers in its chambers |
| `final`, `finale(run, done)` | the Midnight Clock only: its boss ends the run with `finale` (call `done()` to send Maelis home), or without one with its `ending` card, unsealed |

Its art is a set built by new `blender/<region>_props.py` and creature modules. To test it, `?room=<layout id>` opens one of
its chambers and `__mb.region(id)` climbs on into it mid-run, keeping the run's kit (`src/main.js` header). `?region=<id>`
(and `__mb.region(id)` with no run going) is debug tooling: it starts a run at the region's Gate, partway up, with roughly
what a climb through the regions below would have gathered (`Run.outfit()` in `src/game/run.js`). For each region below:
its chambers count towards the depth (foe health and damage), its last combat chamber's numbers floor the wave planning,
and Maelis gets 2 heartroots (+30 max health), 150 silver and one Gift. She also starts with a Bright blessing on each of
Attack, Special, Cast and Dash. The blessings are drawn at random from all patrons.

**A foe** is a file in `src/game/enemies/` with a data object (name, codex blurb, health, size, speed, animation names, threat,
silver) and a class extending `Foe` (`enemies/base.js`) whose `think(dt, k)` walks, turns and starts attacks. Attacks are
data with a wind-up, a strike frame, a recovery and a telegraph shape; `fire`/`during` hooks do anything special. Register it
in `enemies/index.js` and the region's encounter pool. Its sprites follow section 5; its portrait goes in the codex.

**A boss** is the same with `boss: true`, phases switched in `think()` (call `world.bossPhase(this, n)`), its own sprite set
(`set`, loaded only for its chamber) and a `kind: 'boss'` or `'miniboss'` layout. Its data also names its chamber's banner
(`name`, `title`), its theme (`music`), the boss bar's phase ticks (`marks`, in % of health; one at 50 by default) and the
banner line of each phase (`phaseLines`; "grows desperate" by default). A region names it as its `miniboss` or `boss`.

**A blessing** is an entry in a patron file: id, slot, name, values per rarity, text, and `apply(mods, value)` writing into
the modifier object (`blessings/index.js` `baseMods()` lists every field; new behaviour needs a field read by
`combat.js`, `hero.js` or `world.js`). **A patron** is a new file plus an entry in `PATRONS`, an icon in `ui/icons.js` and a
status in `combat.js` if it brings one.

**A weapon** is a data file in `src/game/weapons/` (chain steps, dash strike, special) plus its animations rendered by
`blender/heroine.py` into a new `hero_<id>` set, an entry in `weapons/index.js` and a rack sprite in the Hollow. A new special
kind needs a case in `hero.js` (`startSpecial`, `updateSpecial`).

## 11. What comes later

* **The Vigil Vaults** (region 2): candlelit undercroft, ossuaries and reliquaries. Foes: shadow wraiths that only exist in
  darkness (candles reveal them), screaming skull spirits, wax-sealed tomb guardians, censer monks. Mini-boss: the Reliquary
  Knight. Boss: the Wax Abbess, who melts into pools and reforms in candle flame; snuffing candles changes the arena.
* **The Fallen Orrery** (region 3): a ruined astral sanctum over violet fog, constellation lines in the floor that become
  hazards when struck, brass automata and star-spirits; the Celestine's broken altars restore a patron. Boss: the Orrery
  Engine, a brass-and-starlight machine whose rings sweep the arena.
* **The Midnight Clock** (region 4, the final region): the summit arena of marble and gold clockwork under the full moon
  (picture 1). Final boss: **the Hour Tyrant**, a giant gilded knight with a halo of spikes and an hourglass staff who
  stops and rewinds time in his phases (frozen projectiles that resume, a rewound arena); his defeat restarts the clock and
  ends the endless night.
* Between regions the Hollow grows: new folk rescued in the citadel, a second cauldron tier, more weapons on the rack (a
  bell-chain flail and a crescent bow are planned), and the patrons' stories told through their lines.
