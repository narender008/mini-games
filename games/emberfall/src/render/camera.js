// STUB (render agent replaces).
import { W, H } from '../config.js';
export function updateCamera(G) { const p = G.player, r = G.room; G.cam.x = Math.max(0, Math.min(r.w - W, p.x - W / 2)); G.cam.y = Math.max(0, Math.min(r.h - H, p.y - H / 2)); }
export function snapCamera(G) { updateCamera(G); }
