# Mini Games

A small collection of free games that run in the browser. Open the front page, pick a game, play. There is nothing to install and no sign-up, and the games make no network calls beyond loading their own files.

| Game | What it is |
| --- | --- |
| [Balloon Pop](games/balloon-pop/) | Pop photoreal hot-air balloons drifting over a dusk sea, with a pin, a dart, an air rifle or a slingshot. Pop them fast to build a streak. A relaxed endless mode and a 60-second challenge. |
| [Cake Cut](games/cake-cut/) | Decorate a photoreal birthday cake, blow out the candles, then cut it with a knife, serrated knife, cake wire or cake sword and serve the slices. Little ones mode for toddlers (tap for a slice that pops out and is served), Free play, Fair slices for a chosen number of guests, and a 90-second Party rush. |
| [Rocket Blast](games/rocket-blast/) | Fly a happy toy rocket and blast googly-eyed toy blocks, aliens or robots into showers of stars and sweets, with a laser, homing rockets, bubbles or a rainbow beam, across six worlds. Nobody can lose. Little Pilot for toddlers (auto-fire and a big FIRE! button), Big Kid (hold to fire, combos, power-ups, waves and a friendly boss), and Free Blast (tap anywhere, no score). |
| [Garden Grow](games/garden-grow/) | Plant seeds in a photoreal garden, water them with a watering can, and watch them sprout, bud and bloom while butterflies, bees, ladybirds and birds come to visit. Nothing ever wilts. Little ones (tap to plant, drag to water, blooms in seconds), Big kid (seed packets, sun and rain wands, harvest vegetables, pick a bouquet, a visitors book), and a Bedtime garden that drifts from dusk into a firefly night with a lullaby. Morning, golden hour or night; sun, gentle rain or a rainbow; a cottage bed, raised planters or balcony pots. |
| [Block Tower](games/block-tower/) | Stack photoreal wooden, painted and letter toy blocks, then knock the tower down with a finger flick, a rolling ball, a wind-up car or a wrecking ball, in a sunny playroom, a garden patio or a cosy bedtime room. Nobody can lose. Little ones for toddlers (tap to drop a block, swipe or press the big button to topple it) and Big kid (place blocks yourself, a wobble meter, shape challenges and a tallest-tower best). |
| [Marble Run](games/marble-run/) | Drop glass marbles down photoreal marble runs and watch them roll, spin round funnels, loop the loop, turn water wheels and ring tuned bells, then ride a lift back to the top. Four runs: a wooden run in a Sunny Playroom, glowing glass on a Crystal Night, a castle with a friendly dragon in the Storybook Kingdom and brass and planets in the Cosmic Observatory. Nobody can lose. Little ones (tap anywhere or the big marble button to drop a marble, tap bells and wheels) and Big kid (build your own run from each level's kit with snapping pieces, undo and saved runs, plus puzzles with goals and stars). |

## Play locally

The games use JavaScript modules, which browsers will not load from `file://`, so serve the repository root with any static server:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000/>.

There is no build step. The site is plain HTML, CSS and JavaScript, so publishing it (for example with GitHub Pages serving the repository root) needs nothing beyond the files in this repository. Every path is relative, so it works both at a domain root and under a sub-path such as `https://<user>.github.io/mini-games/`.

## Layout

```
index.html            front page: one card per game
games.js              the list of games the front page shows
assets/               front page styles, script and icon
games/<slug>/         one self-contained folder per game
vendor/<library>/     shared third-party libraries, pinned and vendored once
.nojekyll             tells GitHub Pages to serve files as they are
```

## Add a new game

1. Create `games/<slug>/` with an `index.html` that runs the game. Keep everything the game needs inside that folder, apart from shared libraries in `vendor/`.
2. Give the game a clear way back to the front page: a link to `../../index.html`.
3. Add a cover picture (16:9, about 1200 x 675, JPEG) to the game folder.
4. Add one entry to `games.js`:

   ```js
   {
     slug: 'my-game',
     name: 'My Game',
     description: 'One line that says what you do in the game.',
     path: 'games/my-game/',
     image: 'games/my-game/cover.jpg',
     imageAlt: 'What the cover picture shows',
     tags: ['2D', 'All ages'],
   },
   ```

5. If the game needs a library, vendor a pinned copy under `vendor/` with its licence file and load it through an import map (see `games/balloon-pop/index.html`). Do not load code from a CDN at runtime.
6. Any art, sound or data you add must be made in code or be CC0; note its source and licence in [LICENSES.md](LICENSES.md).

## Licences

See [LICENSES.md](LICENSES.md) for third-party code and assets.
