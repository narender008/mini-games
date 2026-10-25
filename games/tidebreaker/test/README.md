# Tidebreaker tests

Run from this folder (`npm install` once, then `npx playwright install chromium` if no Chromium is around):

- `npm test` runs everything below and exits non-zero on any failure.
- `npm run smoke`: browser smoke tests (`smoke.test.cjs`): clean load, non-blank animated canvas, title to play, mouse / keyboard / touch input, upgrade card click, pause and resume, and a run to the boss through `?debug`.
- `npm run bot`: bot playtest (`bot.cjs`). Plays full runs through `window.__tb` with several card builds and seeds, fails if a build never wins or the median winning run is outside 8 to 17 minutes of sim time (target 10 to 15), and writes `out/balance.md` and `out/balance.json`. `TB_SEEDS`, `TB_BUILDS`, `TB_MIN`, `TB_MAX`, `TB_CONC` tune it.
- `npm run shots`: every scene at 1280x720 into `out/screens/` with an `index.html` contact sheet.

What the suite assumes about the game (debug hook, button ids, scene names) is in `lib/game.cjs` and `lib/policy.cjs`; the hook itself is documented at the top of `../src/main.js`. `TB_ROOT=<dir>` serves another root instead of the repository, and `TB_CHROMIUM=<path>` picks the browser. Chromium always runs muted.

CI: `.github/workflows/tidebreaker-tests.yml` runs `npm test` on pull requests that touch `games/tidebreaker/` and uploads `out/` as an artifact.
