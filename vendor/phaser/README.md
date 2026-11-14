# Phaser 3.90.0 (ES module build)

Unmodified `dist/phaser.esm.min.js` and `LICENSE.md` from the `phaser@3.90.0` npm package (MIT, see `LICENSE.md`). Its source map is not kept, so browser developer tools may note it as missing.

Games load it through an import map:

```html
<script type="importmap">
  { "imports": { "phaser": "../../vendor/phaser/phaser.esm.min.js" } }
</script>
```

```js
import Phaser from 'phaser';
```

Used by Emberfall: The Last Light (`games/last-light/`), whose build marks `phaser` as external so the game bundle stays small. To upgrade, replace both files from the new package version, update the version here, in `LICENSES.md` and in the game's `package.json`, rebuild the game and re-run its tests.

SHA-256 of the vendored files:

```
9327deb5e2f7d382cd054842f641fd504b9a784a730a2bdb94ea63516790ead1  ./phaser.esm.min.js
080f3d5539e766bb556df5b8e86c4f5d581ece35c692b80956ca352b84d29134  ./LICENSE.md
```
