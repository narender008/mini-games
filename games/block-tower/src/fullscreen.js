// Full screen through the Fullscreen API on the game's root element. PLAY
// asks for it inside its own tap (browsers only allow it during a user
// gesture), the toggle button and the F key switch it, and Esc or the
// browser's own exit leave it. Where the API is missing (iPhone Safari) the
// buttons stay hidden and every call quietly does nothing; there, "Add to Home
// Screen" opens the game full screen instead (see manifest.webmanifest).
const root = document.documentElement;
const request = root.requestFullscreen || root.webkitRequestFullscreen;
const leave = document.exitFullscreen || document.webkitExitFullscreen;

export const canFullscreen = !!request && !!leave && (document.fullscreenEnabled ?? document.webkitFullscreenEnabled ?? false);

export function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

function quietly(call) {
  try {
    const p = call();
    if (p && p.catch) p.catch(() => {});
  } catch {
    /* refused or unsupported: stay in the page */
  }
}

export function enterFullscreen() {
  if (!canFullscreen || isFullscreen()) return;
  quietly(() => request.call(root, { navigationUI: 'hide' }));
}

export function exitFullscreen() {
  if (!canFullscreen || !isFullscreen()) return;
  quietly(() => leave.call(document));
}

export function toggleFullscreen() {
  if (isFullscreen()) exitFullscreen();
  else enterFullscreen();
}

export function onFullscreenChange(fn) {
  document.addEventListener('fullscreenchange', fn);
  document.addEventListener('webkitfullscreenchange', fn);
}
