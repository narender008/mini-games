// Oblique 3/4 projection and the camera (binding; see the build brief).
// World: tiles, x east, y north (away from the viewer), z altitude.
//   sx = (x + y * DX) * T,  sy = (-y * DY - z) * T     (DX 0.55, DY 0.36)
// A box of footprint w x d draws its front face w*T wide and its depth going
// up-right by (DX, -DY) * d * T, like box() in the concept prototype.
import { T } from '../config.js';
export const DX = 0.55, DY = 0.36;
export { T };

export function createCamera() {
  return { x: 0, y: 0, z: 0, zoom: 1, minZoom: 0.35, maxZoom: 2.4, w: 1280, h: 720, dpr: 1,
    // targets for smooth moves (input/scene ease toward these)
    tx: null, ty: null, tzoom: null };
}

// world tiles -> unzoomed world pixels
export const wpx = (x, y, z = 0) => [(x + y * DX) * T, (-y * DY - z) * T];

// world tiles -> CSS pixels on screen
export function toScreen(cam, x, y, z = 0) {
  const [px, py] = wpx(x, y, z), [cx, cy] = wpx(cam.x, cam.y, cam.z);
  return [cam.w / 2 + (px - cx) * cam.zoom, cam.h / 2 + (py - cy) * cam.zoom];
}

// CSS pixels -> world tiles on the plane at altitude z
export function toWorld(cam, sx, sy, z = 0) {
  const [cx, cy] = wpx(cam.x, cam.y, cam.z);
  const px = (sx - cam.w / 2) / cam.zoom + cx, py = (sy - cam.h / 2) / cam.zoom + cy;
  const y = -(py / T + z) / DY;
  const x = px / T - y * DX;
  return [x, y];
}

// Apply the camera transform to a 2D context (after the dpr scale): afterwards
// draw in unzoomed world pixels from wpx().
export function applyCamera(g, cam) {
  const [cx, cy] = wpx(cam.x, cam.y, cam.z);
  g.translate(cam.w / 2, cam.h / 2); g.scale(cam.zoom, cam.zoom); g.translate(-cx, -cy);
}
