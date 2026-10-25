# Rocket Blast tests

Run from this folder (`npm install` once, then `npx playwright install chromium` if no Chromium is around):

- `npm test` runs everything below and exits non-zero on any failure (`node run.cjs <prefix>...` runs only some steps, e.g. `node run.cjs smoke ace`).
- `npm run sim`: the Ace Pilot sim tests and balance bot, node only: every `sim/*.test.mjs` through `node --test`, then `sim/bot.mjs` if present. They are owned with the sim (`../src/ace/sim/`).
- `npm run smoke`: browser smoke tests for the kids' modes (`smoke.test.cjs`): clean load (no console or page errors, failed requests or requests leaving the origin), non-blank animated canvas, the zoomed-out field (half height 9.9 at 1440x900), menu to Little Pilot / Big Kid / Free Blast by mouse, keyboard and touch, Big Kid waves through the boss, back to the menu, and a 390x844 phone in portrait.
- `npm run ace`: Ace Pilot browser tests (`ace.test.cjs`): mode card and sector map, flying by mouse / keyboard / touch drag, EMP, pause, the upgrade pick, losing and retrying, sector 1 cleared by the autopilot with saved progress (`mini-games.rocket-blast.ace`), every sector's backdrop and boss, and draw calls / triangles in a busy boss fight. While an Ace module is missing these skip and say which.
- `npm run shots`: kids' modes at 1440x900 and 390x844, and every Ace screen (menu card, map, each sector mid-wave, each boss, upgrade, pause, win, fail, phone) into `out/screens/` with an `index.html` contact sheet.

Browsers run headless on SwiftShader (`--use-angle=swiftshader --enable-unsafe-swiftshader --disable-gpu`, as on CI) and always muted. Frames take a fraction of a second there, so the tests freeze the app and drive time with the `?debug` hook's fixed steps (`window.__rb.step`, `window.__rb.ace.step`), never wall-clock waits. What the suite assumes about the game (debug hook, element ids) is in `lib/game.cjs`; the hook is documented at the top and end of `../src/main.js` and in `debugApi()` of `../src/ace/ace.js`. `RB_ROOT=<dir>` serves another root instead of the repository, `RB_CHROMIUM=<path>` picks the browser, and `RB_ALLOW=<regex>` ignores matching page problems (for work in progress; CI never sets it).

CI: `.github/workflows/rocket-blast-tests.yml` runs `npm test` on pull requests that touch `games/rocket-blast/` and on pushes to main, and uploads `out/` as an artifact.
