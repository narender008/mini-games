// Shader warm-up: get every material ready to draw before it first shows, and
// do it a little at a time, so no frame ever stalls on a shader compile.
//
// three.js compiles a material's shader program the first time it is drawn,
// and that takes tens of milliseconds a program: a new friend has half a dozen
// (its hide, fur, eyes, horns, wings), so its first frame on screen would
// freeze the picture. Here a friend's materials are compiled as soon as it is
// built, a couple of milliseconds of set-up per frame at most (the compile
// itself runs on the GPU process: KHR_parallel_shader_compile, see
// renderer.compileAsync), long before it is shown.
//
// A program depends on the light set-up, the fog, the environment and on
// what is drawn into: the scene is drawn into the post chain's render target,
// which changes the colour space of the output, so the compile must be done
// with that target set (a program compiled for the screen would never be
// used). Each kind of material (what makes its program differ) is compiled
// once; a friend has dozens of materials (each fur shell is one) but only a
// handful of kinds, and three.js shares one program between all of a kind.

// milliseconds of compile set-up per frame
const BUDGET = 2.5;

// what makes one material's program differ from another's
function signature(mesh) {
  const m = mesh.material;
  const g = mesh.geometry.attributes;
  return [
    m.type,
    m.customProgramCacheKey ? m.customProgramCacheKey() : '',
    m.defines ? Object.keys(m.defines).sort().join(',') : '',
    m.side,
    +m.transparent,
    +(m.alphaTest > 0),
    +!!m.alphaToCoverage,
    +(m.clearcoat > 0),
    +(m.sheen > 0),
    +(m.iridescence > 0),
    +(m.transmission > 0),
    +!!m.map,
    +!!m.vertexColors,
    +!!m.flatShading,
    +!!mesh.isSkinnedMesh,
    +!!mesh.isInstancedMesh,
    +mesh.receiveShadow,
    +!!g.uv,
    +!!g.normal,
  ].join('|');
}

export class Warmer {
  // target(): the render target the scene is drawn into (null: the screen)
  constructor(renderer, scene, camera, target = () => null) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.target = target;
    this.queue = []; // { mesh, entry }: waiting to be shown to three.js
    this.known = new Map(); // signature -> { promise, resolve }
  }

  // Queue one mesh of every kind of material under `object`; the promise
  // resolves when their programs are ready to draw. Nothing is compiled twice.
  warm(object) {
    const promises = [];
    const seen = new Set();
    object.traverse((o) => {
      if (!o.isMesh || !o.material || Array.isArray(o.material)) return;
      const sig = signature(o);
      if (seen.has(sig)) return;
      seen.add(sig);
      let entry = this.known.get(sig);
      if (!entry) {
        entry = {};
        entry.promise = new Promise((resolve) => (entry.resolve = resolve));
        this.known.set(sig, entry);
        this.queue.push({ mesh: o, entry });
      }
      promises.push(entry.promise);
    });
    return Promise.all(promises);
  }

  // start all that is queued at once (while the game is loading, behind the progress bar)
  async warmNow(object) {
    const done = this.warm(object);
    this.step(Infinity);
    await done;
  }

  // per frame: start the next few programs
  update() {
    this.step(BUDGET);
  }

  step(budget) {
    const t0 = performance.now();
    const r = this.renderer;
    while (this.queue.length && performance.now() - t0 < budget) {
      const { mesh, entry } = this.queue.shift();
      const prev = r.getRenderTarget();
      r.setRenderTarget(this.target());
      let started = null;
      try {
        // three.js takes the scene's lights, fog and environment and starts the program compile
        started = r.compileAsync(mesh, this.camera, this.scene);
      } catch {
        started = null;
      }
      r.setRenderTarget(prev);
      (started || Promise.resolve()).catch(() => {}).then(entry.resolve);
    }
  }
}
