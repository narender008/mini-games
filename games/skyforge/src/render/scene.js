// STUB by lead: RENDERER replaces this. createRenderer(canvas, app) -> { resize(), draw(realDt), invalidate(what) }
export function createRenderer(canvas, app) {
  const g = canvas.getContext('2d');
  function resize() { const d = devicePixelRatio || 1; canvas.width = innerWidth * d; canvas.height = innerHeight * d; app.cam.w = innerWidth; app.cam.h = innerHeight; app.cam.dpr = d; }
  addEventListener('resize', resize); resize();
  return { resize, invalidate() {}, draw() { g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#8fc3ea'; g.fillRect(0, 0, canvas.width, canvas.height); } };
}
