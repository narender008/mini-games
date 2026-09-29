# three.js 0.186.0, glTF loader

Unmodified files from the `three@0.186.0` npm package (tarball `https://registry.npmjs.org/three/-/three-0.186.0.tgz`, SHA-256 `61eeff9d7616005c9a481c796f52287d81fbbbc0d55eaca5565322924252c1aa`), the same version as `vendor/three/`. The licence is MIT for three.js, and MIT for `libs/meshopt_decoder.module.js`, which is the meshoptimizer decoder (see `LICENSE`). Only the files needed to load compressed `.glb` models are kept, in the same folder layout as `examples/jsm/` so the loader's relative imports resolve. Nothing here is modified.

| File | What it is |
| --- | --- |
| `loaders/GLTFLoader.js` | Loads `.glb` / `.gltf` files, including `EXT_meshopt_compression` when a decoder is set |
| `utils/BufferGeometryUtils.js` | Imported by `GLTFLoader.js` |
| `utils/SkeletonUtils.js` | Imported by `GLTFLoader.js`; also has `clone()` for skinned models |
| `libs/meshopt_decoder.module.js` | meshoptimizer 1.1 WebAssembly decoder (inlined, no extra fetch) |

Games load it through an import map, next to the three.js one:

```html
<script type="importmap">
  {
    "imports": {
      "three": "../../vendor/three/build/three.module.js",
      "three/addons/": "../../vendor/three/examples/jsm/",
      "three-gltf/": "../../vendor/three-gltf/"
    }
  }
</script>
```

```js
import { GLTFLoader } from 'three-gltf/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three-gltf/libs/meshopt_decoder.module.js';

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
```

`GLTFLoader.js` imports `three` (resolved by the import map) and `../utils/BufferGeometryUtils.js` and `../utils/SkeletonUtils.js` (resolved by the layout above).

To upgrade, replace these files from the new package version (keep the same version as `vendor/three/`), keep the same folder layout, update the version here and in `LICENSES.md`, and re-test every game that uses them.

SHA-256 of the vendored files:

```
d428e73a000057c6c94bfcedc3412d0c2dc14ca8800e88553aab05113ad2bf19  ./libs/meshopt_decoder.module.js
131c0f78c01d19368ae495caa65b3adaa10487810a36a05bb5901b769a35ac16  ./loaders/GLTFLoader.js
9fb63427ce6641fa14fd0baff9cc4d1b5f9c3d85fd084bf2e90e803c44ec1797  ./utils/BufferGeometryUtils.js
b1632a703206c3d830de9fcbe515696770d04b71a15ee6b50afa6d2c3298c86f  ./utils/SkeletonUtils.js
```
