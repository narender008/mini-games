// Camera control: pan in screen pixels, zoom about a screen anchor, clamp to the
// islands, and ease toward cam.tx / cam.ty / cam.tzoom (input owns the easing;
// the renderer only reads cam.x / y / z / zoom). Pure math, node-safe.
import { toWorld } from '../render/camera.js';
import { viewBounds } from './pick.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const damp = (v, t, rate, dt) => v + (t - v) * (1 - Math.exp(-rate * dt));

// Move the view so world content follows the pointer by (dsx, dsy) CSS px.
export function panBy(cam, dsx, dsy) {
  const cx = cam.w / 2, cy = cam.h / 2;
  const [x0, y0] = toWorld(cam, cx, cy, cam.z);
  const [x1, y1] = toWorld(cam, cx - dsx, cy - dsy, cam.z);
  cam.x += x1 - x0; cam.y += y1 - y0;
  // a manual pan cancels a scripted glide
  cam.tx = cam.ty = null;
}

// Set zoom keeping the world point under (ax, ay) fixed on screen.
export function zoomAbout(cam, zoom, ax, ay) {
  zoom = clamp(zoom, cam.minZoom, cam.maxZoom);
  const [wx0, wy0] = toWorld(cam, ax, ay, cam.z);
  cam.zoom = zoom;
  const [wx1, wy1] = toWorld(cam, ax, ay, cam.z);
  cam.x += wx0 - wx1; cam.y += wy0 - wy1;
}

// Keep the view centre inside the islands' padded box (soft: eases back when outside).
export function clampCam(cam, G, dt = 0, hard = false) {
  const b = viewBounds(G); if (!b) return;
  const x = clamp(cam.x, b.x0, b.x1), y = clamp(cam.y, b.y0, b.y1);
  if (hard || dt <= 0) { cam.x = x; cam.y = y; return; }
  cam.x = damp(cam.x, x, 10, dt); cam.y = damp(cam.y, y, 10, dt);
}

// Ease toward the targets. cam.anchor = [sx, sy] keeps a zoom centred on a point.
export function easeCam(cam, dt, rate = 9) {
  if (cam.tx != null) { cam.x = damp(cam.x, cam.tx, rate, dt); if (Math.abs(cam.x - cam.tx) < 0.005) { cam.x = cam.tx; cam.tx = null; } }
  if (cam.ty != null) { cam.y = damp(cam.y, cam.ty, rate, dt); if (Math.abs(cam.y - cam.ty) < 0.005) { cam.y = cam.ty; cam.ty = null; } }
  if (cam.tz != null) { cam.z = damp(cam.z, cam.tz, rate, dt); if (Math.abs(cam.z - cam.tz) < 0.005) { cam.z = cam.tz; cam.tz = null; } }
  if (cam.tzoom != null) {
    const t = clamp(cam.tzoom, cam.minZoom, cam.maxZoom);
    let z = Math.exp(damp(Math.log(cam.zoom), Math.log(t), rate * 1.4, dt));
    const done = Math.abs(Math.log(z / t)) < 0.002;
    if (done) z = t;
    if (cam.anchor && cam.tx == null) zoomAbout(cam, z, cam.anchor[0], cam.anchor[1]); else cam.zoom = z;
    if (done) { cam.tzoom = null; cam.anchor = null; }
  }
}

// Glide to a world point (and optionally altitude and zoom).
export function glideTo(cam, x, y, z = null, zoom = null) {
  cam.tx = x; cam.ty = y; if (z != null) cam.tz = z;
  if (zoom != null) { cam.tzoom = zoom; cam.anchor = null; }
}
