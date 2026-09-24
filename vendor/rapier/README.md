# Rapier 0.20.0 (3D, compat build)

Unmodified `dist/rapier.mjs` and `LICENSE` from the `@dimforge/rapier3d-compat@0.20.0` npm package (Apache-2.0, see `LICENSE`). It is Rapier's rigid-body physics engine with its WebAssembly inlined as base64, so it loads as one ES module with no extra fetch. Its source map (`rapier.mjs.map`) is not kept, so browser developer tools may note it as missing.

Games load it through an import map and start it once:

```html
<script type="importmap">
  { "imports": { "@dimforge/rapier3d-compat": "../../vendor/rapier/rapier.mjs" } }
</script>
```

```js
import RAPIER from '@dimforge/rapier3d-compat';
await RAPIER.init();
```

To upgrade, replace both files from the new package version, update the version here and in `LICENSES.md`, and re-test every game that uses it.

SHA-256 of the vendored files:

```
09a000bee2ad827608780cf8821258cadc243aaeb8881ab3e769de73f945eee0  ./rapier.mjs
4c05555705e3efde601fb1252ae48f1d63992af8a8fb8947745b7fa834e8f519  ./LICENSE
```
