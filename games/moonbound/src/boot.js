// Loader: checks for WebGL2, downloads the game code and the first sprites
// with a progress bar (ES modules cannot report progress themselves), then
// starts.
const L = document.getElementById('loading');
const fill = L.querySelector('.bar i');
const cap = L.querySelector('.cap');

function progress(p, label) {
  fill.style.width = `${Math.round(Math.max(0.02, Math.min(1, p)) * 100)}%`;
  if (label) cap.textContent = label;
}

function fail(message) {
  cap.textContent = message;
  L.classList.add('error');
}

async function boot() {
  const probe = document.createElement('canvas');
  if (!probe.getContext('webgl2')) {
    fail('Moonbound needs WebGL 2, which this browser or device does not provide. Try an up-to-date Chrome, Edge, Firefox or Safari.');
    return;
  }
  progress(0.02, 'Loading…');
  try {
    const { start } = await import('./main.js');
    await start(progress);
    L.classList.add('out');
    setTimeout(() => {
      if (L.classList.contains('out')) L.hidden = true;
    }, 500);
  } catch (e) {
    console.error(e);
    fail(`Something went wrong while loading: ${e.message || e}`);
  }
}

boot();
