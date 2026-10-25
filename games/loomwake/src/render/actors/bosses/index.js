// Boss painters and the boss arena layers, for the renderer.
//
// Exports (the engine's renderer calls these):
//   PAINTERS[id](ctx, e, G, P)       the boss at its foot point (ctx translated to e.x, e.y - e.z), world scale
//   drawZone(ctx, z, G, P)           ground-layer set pieces: G.zones entries whose kind starts with 'boss:'
//   drawProjectile(ctx, p, G, P)     projectiles whose kind starts with 'boss:' (world space)
//   drawOverlay(ctx, G, P)           once per frame after actors (world space): forge heat, flood shimmer,
//                                    choir spirits, the unravelling edge, the true-ending braid
//   drawBossGround(ctx, G, P)        fallback: draws every boss zone (for renderers without per-zone dispatch)
// Painters set e.lights = [{ x, y, r, color, i }] (world) and e.light for the light layer.
import veyl, * as V from './veyl.js';
import morrow, * as M from './morrow.js';
import aurum, * as A from './aurum.js';
import sable, * as S from './sable.js';
import { drawShared, drawSharedProjectile, drawSharedOverlay } from './shared.js';

export const PAINTERS = { veyl, morrow, aurum, sable };
const MODS = { veyl: V, morrow: M, aurum: A, sable: S };

export function drawZone(ctx, z, G, P) {
  if (!z || typeof z.kind !== 'string' || !z.kind.startsWith('boss:')) return;
  const m = MODS[z.boss];
  ctx.save();
  try {
    if (!(m && m.drawZone && m.drawZone(ctx, z, G, P) === true)) drawShared(ctx, z, G, P);
  } finally { ctx.restore(); }
}
export function drawProjectile(ctx, p, G, P) {
  const m = MODS[p.boss];
  ctx.save();
  try {
    if (!(m && m.drawProjectile && m.drawProjectile(ctx, p, G, P))) drawSharedProjectile(ctx, p, G, P);
  } finally { ctx.restore(); }
}
export function drawOverlay(ctx, G, P) {
  const b = G.boss;
  ctx.save();
  try {
    drawSharedOverlay(ctx, G, P);
    if (b && MODS[b.kind] && MODS[b.kind].drawOverlay) MODS[b.kind].drawOverlay(ctx, G, P, b);
  } finally { ctx.restore(); }
}
export function drawBossGround(ctx, G, P) {
  for (const z of G.zones) if (typeof z.kind === 'string' && z.kind.startsWith('boss:')) drawZone(ctx, z, G, P);
}
