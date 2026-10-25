# Emberfall tests

Run from this folder (`npm install` once, then `npx playwright install chromium` if no Chromium is around):

- `npm test` runs everything below and exits non-zero on any failure.
- `npm run smoke`: browser smoke tests (`smoke.test.cjs`): clean load with no network calls, non-blank animated title, title to play by button and Enter, keyboard run / jump / swing, mouse swing, the touch thumb stick on a phone-sized screen, pause and the map hold the sim, death and rekindle, a corrupt save, and a running AudioContext (Chromium is muted).
- `npm run world`: world and physics checks (`world.test.cjs`): `world()` is consistent; the graph solver (`lib/graph.cjs`) finds every ability, every boss and the ending reachable from a fresh start, and the ending out of reach with no abilities; every room renders without errors; dropping the player over floors in every room never falls through; jump, tap jump, Twin Leap, Ember Dash and run speed match `PHYS` in `src/config.js`; and every gate is played from its `from` spot without its ability (must hold) and with it (must reach `to`). Writes `out/route.json` and `out/gates.json`.
- `npm run bot`: critical-path playthrough (`bot.cjs`). From a fresh game it follows the solver's route, walking out through each exit, picking up each ability by touch, fighting each boss in god mode (attacks must do damage) before `kill()`, saving after the second boss, reloading and continuing, and finishing on the `won` scene. Writes `out/path.md` and `out/path.json`.
- `npm run shots`: every scene at 1280x720 into `out/screens/` with an `index.html` contact sheet: title, a room per biome, each boss, map, pause, death, the ending and the phone layout.

What the suite assumes about the game (debug hook `window.__eb`, button ids, keys, tile chars, gate kinds) is in `lib/game.cjs`; the hook is documented at the top of `../src/main.js`. `EB_ROOT=<dir>` serves another root instead of the repository, and `EB_CHROMIUM=<path>` picks the browser. Chromium always runs muted.

CI: `.github/workflows/emberfall-tests.yml` runs `npm test` on pull requests that touch `games/emberfall/` and uploads `out/` as an artifact.
