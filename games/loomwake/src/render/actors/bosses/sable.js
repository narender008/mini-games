// placeholder, replaced below
import { shadow } from './kit.js';
export default function draw(ctx, e, G, P) { if (!e) return; shadow(ctx, 60, 20, 0.5); ctx.fillStyle = '#444'; ctx.fillRect(-30, -150, 60, 150); }
export function drawZone() {}
export function drawProjectile() { return false; }
