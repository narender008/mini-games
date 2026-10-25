# Magic Brush tests

Run from this folder (`npm install` once, then `npx playwright install chromium` if no Chromium is around):

- `npm test` runs everything below and exits non-zero on any failure (about 7 minutes). Reports land in `out/`: a JUnit file per step, `perf.json`, `screens/` and `summary.txt`.
- `npm run smoke`: every `?screen=` alone and with `?cover` and `?mute` loads with no console errors or warnings, page errors, unhandled rejections or failed requests; nothing leaves localhost and three.js is gone; every button has a unique id and a label; `?pick=`, `?screen=alive`, the sound button and a page without `?debug`.
- `npm run loop`: the whole loop with real input only (mouse, touchscreen taps, DevTools touch drags, two fingers at once): title, pick, paint strokes, a pot change, undo, GO, alive, meadow, book, then a reload proves the friend and its painting were kept. At 1280x800 (mouse), 1024x768, 390x844 and 844x390 (touch).
- `npm run regressions`: the old game's bugs (`/mnt/project-files/magic-brush/evaluation.md`): the picked friend comes alive even with GO straight after the pick; mashing Play, GO, Home, paint-another, book, the book's empty frame and a book friend makes exactly one transition and never leaves the game; no auto-GO and no paint carried over; each painting saved once; GO on a blank or almost blank page only hints; resizing and rotating mid-transition and mid-alive; the save cap of 60; tap targets of at least 56 px on phones and 80 px on tablets, on screen and not overlapping.
- `npm run friends`: all twelve friends and the doodle buddy go paint, alive, meadow wearing their painted texture, and are stored.
- `npm run meadow`: the six-friend cap, all four toys and tapping friends by real mouse and touch input, and the loop pausing while the tab is hidden.
- `npm run perf`: the meadow with six friends and toys, and the easel while a mouse paints, each hold `MB_FPS_MIN` fps (default 50) at 1280x800, dpr 1, with `--disable-gpu`, counted over `MB_PERF_SECS` (6) seconds after a warm-up; ten paint, meadow cycles grow the JS heap (after GC) by under `MB_HEAP_MB` (16).
- `npm run shots`: every screen (including three moments of coming alive) at 1280x800, 390x844 and 844x390 into `out/screens/` with an `index.html` contact sheet.

What the suite assumes about the game (the `window.__mb` hook, button ids, save keys) is in `lib/game.cjs`; the hook is documented at the end of `../src/main.js`. `MB_ROOT=<dir>` serves another root instead of the repository, and `MB_CHROMIUM=<path>` picks the browser. Chromium always runs with `--mute-audio --disable-gpu`.

CI: `.github/workflows/magic-brush-tests.yml` runs `npm test` on pull requests that touch `games/magic-brush/` with `MB_FPS_MIN=40` (shared runners are slower) and uploads `out/` as an artifact.
