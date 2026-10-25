// Emberfall camera. G.cam = { x, y } is the room px of the screen's top-left,
// { sx, sy } the shake offset added when drawing. It follows the wanderer
// with a look-ahead in the facing and running direction, a vertical deadzone
// (it only moves up or down when the wanderer leaves a band, or settles on
// the floor height when standing), smooth damping, and stays inside the room
// (a room narrower than the screen is centred). Shake comes from 'shake'
// events (render/fx.js keeps the strength) and is a deterministic wobble.
// While G.boss is set (with its box x, y, w, h) the camera frames both the
// wanderer and the boss so its tells stay visible.
import { W, H } from '../config.js';
import { clamp } from '../util.js';
import { shakeAmount } from './fx.js';

export function updateCamera(G, dt) {
  const c = G.cam, p = G.player, r = G.room;
  if (!p || !r) return;
  if (c.look == null) c.look = 0;
  const px = p.x + p.w / 2, py = p.y + p.h / 2;
  // look-ahead: lean toward where you face, further when running or dashing
  const want = clamp((p.facing || 1) * 110 + (p.vx || 0) * 0.28, -240, 240);
  c.look += (want - c.look) * (1 - Math.exp(-dt * 2.2));
  let tx = px + c.look - W / 2;
  // vertical: settle on the ground; in the air only follow outside a band
  let ty = c.ty ?? (py - H * 0.55);
  if (p.onGround || p.state === 'wall' || p.hooked) ty = py - H * 0.56;
  else {
    const sy = py - c.y;
    if (sy < H * 0.3) ty = py - H * 0.3;
    else if (sy > H * 0.68) ty = py - H * 0.68;
    else ty = c.y;
    if ((p.vy || 0) > 700) ty = py - H * 0.45; // falling far: look down
  }
  c.ty = ty;
  // boss fight: frame both, biased to the midpoint, the wanderer kept on screen
  const b = G.boss;
  if (b && b.x != null) {
    const bx = b.x + (b.w || 0) / 2, by = b.y + (b.h || 0) / 2, m = 150;
    tx = clamp((px + bx) / 2 - W / 2, px - W + m, px - m);
    ty = clamp(py + (by - py) * 0.4 - H * 0.55, py - H + m, py - m);
  }
  const kx = 1 - Math.exp(-dt * 6), ky = 1 - Math.exp(-dt * (p.onGround ? 4 : 7));
  c.x += (clampX(tx, r) - c.x) * kx;
  c.y += (clampY(ty, r) - c.y) * ky;
  c.x = clampX(c.x, r); c.y = clampY(c.y, r);
  shake(G);
}

export function snapCamera(G) {
  const c = G.cam, p = G.player, r = G.room;
  if (!p || !r) return;
  c.look = (p.facing || 1) * 110;
  c.x = clampX(p.x + p.w / 2 + c.look - W / 2, r);
  c.y = clampY(p.y + p.h / 2 - H * 0.56, r);
  c.ty = c.y;
  c.sx = c.sy = 0;
}

const clampX = (x, r) => (r.w <= W ? (r.w - W) / 2 : clamp(x, 0, r.w - W));
const clampY = (y, r) => (r.h <= H ? (r.h - H) / 2 : clamp(y, 0, r.h - H));

function shake(G) {
  const a = shakeAmount(), t = G.vt;
  const c = G.cam;
  if (a <= 0.05) { c.sx = c.sy = 0; return; }
  c.sx = (Math.sin(t * 61.3) + Math.sin(t * 97.1) * 0.6) * a * 0.65;
  c.sy = (Math.sin(t * 73.7 + 1.3) + Math.sin(t * 89.9) * 0.6) * a * 0.65;
}
