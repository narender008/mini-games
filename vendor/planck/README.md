# Planck.js 1.5.0

Unmodified `dist/planck.mjs` from the `planck@1.5.0` npm package, with its `LICENSE.txt` kept as `LICENSE` (MIT, see `LICENSE`). Planck.js is a JavaScript rewrite of the Box2D 2D rigid-body physics engine, as one ES module with no dependencies. Its source map (`planck.mjs.map`) is not kept, so browser developer tools may note it as missing.

Games load it through an import map:

```html
<script type="importmap">
  { "imports": { "planck": "../../vendor/planck/planck.mjs" } }
</script>
```

```js
import * as pl from 'planck';
const world = new pl.World({ gravity: pl.Vec2(0, -10) });
```

To upgrade, replace both files from the new package version, update the version here and in `LICENSES.md`, and re-test every game that uses it.

SHA-256 of the npm tarball `planck-1.5.0.tgz`: `e67f906f6a1c93e0db686784e78365453d10c86d5621d33956bc53814e66acf5`

SHA-256 of the vendored files:

```
5832d56882935a4eec44274dd481bbcf77b35992bbbe010e4d242db639a27674  ./planck.mjs
49fd3df949edd5f294edafb22e8905263dd7560b514bee6df2f17538069aafca  ./LICENSE
```
