// Loader: checks for WebGL2, downloads the engine and the game code with a
// progress bar (ES modules cannot report progress themselves), then starts.
const fill = document.getElementById('loader-fill');
const text = document.getElementById('loader-text');
const loader = document.getElementById('loader');

function progress(p, label) {
  fill.style.transform = `scaleX(${Math.max(0.02, Math.min(1, p))})`;
  loader.setAttribute('aria-valuenow', String(Math.round(p * 100)));
  if (label) text.textContent = label;
}

function fail(message) {
  loader.classList.add('error');
  text.textContent = message;
}

const FILES = [
  '../../vendor/three/build/three.core.js',
  '../../vendor/three/build/three.module.js',
  '../../vendor/three/examples/jsm/postprocessing/UnrealBloomPass.js',
  '../../vendor/three/examples/jsm/postprocessing/EffectComposer.js',
  'src/main.js',
  'src/post.js',
  'src/world/world.js',
  'src/world/foliage.js',
  'src/world/sky.js',
  'src/world/textures.js',
  'src/paint/engine.js',
  'src/paint/canvas.js',
  'src/paint/magic.js',
  'src/paint/outline.js',
  'src/paint/brush3d.js',
  'src/creatures/friend.js',
  'src/creatures/materials.js',
  'src/creatures/sculpt.js',
  'src/creatures/sculptcore.js',
  'src/creatures/parts.js',
  'src/creatures/dragon.js',
  'src/sound/audio.js',
  'src/fx.js',
  'src/alive.js',
  'src/friends.js',
  'src/ui.js',
];

async function fetchWithProgress(files, onBytes) {
  let done = 0;
  await Promise.all(
    files.map(async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url}: ${res.status}`);
      if (!res.body) {
        const b = await res.arrayBuffer();
        done += b.byteLength;
        onBytes(done);
        return;
      }
      const reader = res.body.getReader();
      for (;;) {
        const { done: end, value } = await reader.read();
        if (end) break;
        done += value.byteLength;
        onBytes(done);
      }
    }),
  );
}

async function boot() {
  const probe = document.createElement('canvas');
  if (!probe.getContext('webgl2')) {
    fail('This game needs WebGL 2, which this browser or device does not provide. Try an up-to-date Chrome, Edge, Firefox or Safari.');
    return null;
  }
  progress(0.02, 'Opening the paint box');
  const expected = 2_400_000; // rough uncompressed size of the files above
  try {
    await fetchWithProgress(FILES, (bytes) => progress(0.02 + 0.45 * Math.min(1, bytes / expected)));
  } catch {
    // the module import below reports real failures
  }
  progress(0.5, 'Setting up the easel');
  try {
    const { start } = await import('./main.js');
    const app = await start(document.getElementById('scene'), progress);
    loader.classList.add('done');
    setTimeout(() => loader.remove(), 900);
    return app;
  } catch (err) {
    console.error(err);
    fail('Something went wrong while starting the game. Please reload the page.');
  }
  return null;
}

boot();
