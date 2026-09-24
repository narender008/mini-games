# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Static site, no build step: serve the repo root (`python3 -m http.server 8000`) and open `/`. ES modules will not load from `file://`.
- `http.server` sends no cache headers, so browsers may keep serving an old module after an edit. When testing changes, disable the cache, hard-reload, or serve with `Cache-Control: no-store`.
- Any browser launched to test a game must pass `--mute-audio` (headless or not) and be closed when the check ends; check sound through the AudioContext, never by playing it aloud.
- Every URL must be relative (the site is served under `/mini-games/` on GitHub Pages). No CDN or other network calls at runtime; no tracking.
- A game lives entirely in `games/<slug>/`, links back to `../../index.html`, and is listed by one entry in `games.js` (front page renders cards from it via `assets/site.js`). Steps are in `README.md`.
- Shared libraries are vendored once, pinned and unmodified, under `vendor/<lib>/` with their licence, and loaded through an import map in the game's `index.html`. Record version and checksums in `vendor/<lib>/README.md` and `LICENSES.md`.
- Art and sound must be procedural or CC0, noted in `LICENSES.md`. Reference images supplied for a design are not committed.
- Balloon Pop debug switches: `?debug` exposes `window.__bp` (freeze, step(ms), popFirst, spawn), `?cover` hides UI, `?quality=high|medium|low`, `?msaa=N`, `?shadows=0`. See `games/balloon-pop/src/main.js` and `src/quality.js`.
- Cake Cut debug switches: `?debug` exposes `window.__cc` (freeze, thaw, step(ms), cut, stroke, lift, setCake, decor, blowOut, pieces, and for Little ones / Easy slices easyCut(angle), serve, front), `?cover` hides UI, `?cake=<id>`, plus `?quality=`, `?msaa=`, `?shadows=0`, `?ao=0`, `?dof=0`. See the end of `games/cake-cut/src/main.js` and `src/quality.js`.
- Rocket Blast debug switches: `?debug` exposes `window.__rb` (freeze, thaw, step(ms), hitFirst, mega, and pointer(x, y, down, type), which takes play-field cells, not pixels), `?play` starts straight into a game, `?mode=little|big|free`, `?weapon=`, `?world=`, `?style=`, `?cover` hides UI, plus `?quality=`, `?msaa=`, `?tone=`. See the header and end of `games/rocket-blast/src/main.js`.
- Garden Grow debug switches: `?debug` exposes `window.__gg` (freeze, thaw, step(ms), plant(species, x, z, growth), water, grow(g), bloomAll, spawn(kind), tap(x, y) and drag(x0, y0, x1, y1) in screen pixels, look, harvest), `?play` starts straight into a game, `?mode=little|big|bedtime`, `?time=`, `?weather=`, `?style=`, `?cover` hides UI, plus `?quality=`, `?msaa=`, `?shadows=0`, `?ao=0`, `?dof=0`. See the header and end of `games/garden-grow/src/main.js`.
- Block Tower debug switches: `?debug` exposes `window.__bt` (freeze, thaw, step(ms), drop, tower(n), knock, sweep, choose(key, id), place(shape, x, y, turns), fill, state), `?play` starts straight into a game, `?mode=little|big`, `?set=`, `?room=`, `?tool=`, `?challenge=`, `?cover` hides UI, plus `?quality=`, `?msaa=`, `?shadows=0`, `?ao=0`, `?dof=0`. Physics is Rapier (`vendor/rapier/`); settled blocks are frozen as sleeping kinematic bodies (not fixed ones, which trap Rapier 0.20 on removal) so towers stand perfectly still, see the header of `games/block-tower/src/physics.js`.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
