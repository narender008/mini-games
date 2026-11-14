# Emberfall: The Last Light — progress

## Status

Playable start to finish: title → sanctum (weapon pick, training dummy, onboarding tips) → 7 seeded combat rooms over three areas (causeway, flooded aqueduct gardens, ember foundry) with door choices between reward rooms (upgrade shrine, heartbloom, light cache, ember trial) → the Choked Star (two phases) → victory or defeat screen with run stats → restart without reload. All checks below pass locally.

## Architecture decisions

- TypeScript + Phaser 3.90 (vendored at `vendor/phaser/`, external to the bundle) built with Vite into `index.html` + `build/`, which are committed so the static site needs no build step. CI rebuilds and fails if the committed build differs.
- `src/sim/` is pure TypeScript (no Phaser, DOM or audio) stepped at a fixed 120 Hz with render interpolation; it talks to the view through `world.fx` events. That makes the whole run testable in Node (unit tests and a headless bot).
- Rooms: hand maps (`src/sim/level/rooms.ts`: sanctum, plaza, boss arena) plus a seeded generator (`src/sim/level/gen.ts`) that validates connectivity (doors and ≥55% of the floor reachable from the spawn) and retries otherwise. `src/sim/run.ts` holds the arc, door offers and the wave point budget.
- Art is pixel art drawn in code at 1x and upscaled ×3 (`src/art/`): characters, the boss, room floors (flagstones, ruin holes, pools, magma), per-row wall/foliage strips cropped into 256 px chunks and depth-sorted, props. Lighting is a low-res multiply light map with additive glows (`src/view/lighting.ts`). Camera shows at least 600×340 art px, matching the concept's character scale.
- UI is DOM over the canvas (`src/ui/`): HUD, menus (`screens.ts`), keyboard navigation everywhere; menus swallow input so it never reaches the game. Settings and best runs persist in localStorage with sanitising.
- Audio is procedural Web Audio (`src/audio/`), started on the first input, with master/music/effects volume and mute.

## Commands (in `games/last-light/`)

- `npm ci` — install pinned dev dependencies.
- `npm run dev` — Vite dev server (`/index.html`, plus dev-only `/art.html`, `/env.html`, `/screens.html`).
- `npm run typecheck` · `npm run test:unit` · `npm run build` · `npm run test:browser` (builds must be current; serves the repo root statically).

## Passes

1. **Vertical slice / reference room.** Built the plaza against the supplied concept image and iterated with screenshots: closer camera (character scale), slate flagstones in running bond with rounded worn edges, missing stones overgrown, leaf-by-leaf bushes and ground cover, luminous pools with rock rims, tall dressed-block walls with overgrown tops, banners and wall lanterns, an arched gate with steps into darkness, warm lantern light pools, golden crescent slash. Verified by screenshots at 1600×900.
2. **Complete game.** Run director, generator, reward rooms and props, sanctum onboarding, boss, menus, records, door labels, area looks (aqueduct shallows, foundry palette and magma pits). Verified by browser flow tests and the headless bot.
3. **Visual cohesion.** Redrew keeper and all enemies larger with rim light, outlines and emissive accents; boss art and effects in the same palette; shadows and bars resized. Remaining: enemy accents are softened by the multiply light pass.
4. **Feel and balance.** The bot with a 150 ms reaction delay died in 5 of 6 seeds; changes: keeper health 6 → 8, room clear mends 1, smaller early wave budgets, stalker windup 0.44 → 0.56 s, sentinel orbs 112 → 98 px/s. After: 5 of 6 seeds win at 150 ms; 1 of 6 at 250 ms. Frame-perfect bot wins all gated seeds in 380–560 s of game time.
5. **Reliability and performance.** Fixed: built bundle failed to import Phaser's default export; canvas CSS size not updated on resize at DPR 1 (aim drift); keyboard-only audio unlock; level-up card interrupting the victory beat; row strips cropped into chunks (headless frame rate ~2 → ~10 fps, far less texture memory). Pause on blur/tab hide; inputs released on blur and menu open.
6. **Final acceptance.** See "Checks" below.

## Checks (actual results, last run)

- `npm run typecheck`: clean.
- `npm run test:unit`: 9 files, 103 tests passed (upgrades, combat, persistence, run plan, generator, boss, audio, screens, bot).
- `npm run test:browser`: see the PR description for the latest run (17 tests: boot, title navigation, WASD, wall collision, mouse attack, dash, pause/resume, no menu input leaks, upgrade pick, death → restart, victory, resize aim, 4 viewports, malformed storage, settings persistence, audio unlock and mute).

## Known issues

- Headless software rendering runs at 2–10 fps, so most browser tests freeze the sim and step it while real input is held; real-hardware frame rate has not been measured here.
- Victory and defeat in browser tests use debug shortcuts; the full run is proven by the Node bot instead.
- The bot reacts with no or fixed delay; a human's difficulty is estimated from that, not measured.
- Enemy emissive accents are dimmer in game than on the contact sheets.

## Next tasks

- Measure frame time on real hardware (integrated GPU at 1440p) and tune the light map resolution if needed.
- More hand-made room shapes per area; touch and gamepad controls.
