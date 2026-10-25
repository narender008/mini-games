// Minimal stand-in for src/sim/combat.js, used only by dev/enemies.html (an
// import map points the foes at this file), so the gallery works on its own.
export function hurtHero(G, dmg, o = {}) {
  const h = G.hero; if (!h || h.inv > 0 || G.god) return false;
  h.hp = Math.max(0, h.hp - dmg); h.inv = 0.5; h.hurtT = 0.25;
  if (o.src) { const dx = h.x - o.src.x, dy = h.y - o.src.y, d = Math.hypot(dx, dy) || 1; h.kx = (dx / d) * (o.kb || 300); h.ky = (dy / d) * (o.kb || 300); }
  G.log && G.log.push(['heroHurt', dmg, o.kind]);
  if (h.hp <= 0) h.hp = h.maxHp;
  return true;
}
export function telegraph(G, tg) { tg.max = tg.max ?? tg.t; tg.t = Math.max(tg.t, 0.35); G.telegraphs.push(tg); return tg; }
export function shoot(G, p) { G.projectiles.push(p); return p; }
export function zone(G, z) { G.zones.push(z); return z; }
export function takeToken(G, e) { const n = G.foes.filter((f) => f.hasToken && !f.dead).length; return n < 3; }
export function freeToken() {}
export function addStatus(G, e, name, t, power) { e.status = e.status || {}; e.status[name] = { t, power }; }
export function knock(G, e, dx, dy, power) { const d = Math.hypot(dx, dy) || 1; e.kx = (e.kx || 0) + (dx / d) * power; e.ky = (e.ky || 0) + (dy / d) * power; }
export function damageFoe(G, e, dmg, opts = {}) {
  if (e.dead || e.spawning) return;
  if (e.armor > 0) { const a = Math.min(e.armor, dmg); e.armor -= a; dmg -= a; if (e.armor <= 0) { e.stun = 1.5; e.vuln = 1.5; G.bus && G.bus.emit('armorBreak', { e }); } }
  if (e.vuln > 0) dmg *= 1.5;
  e.hp -= dmg; e.flash = 0.1;
  if (e.onHit) e.onHit(G, e, opts);
  if (e.hp <= 0) killFoe(G, e);
}
export function killFoe(G, e) { if (e.dead) return; e.dead = true; e.hp = 0; G.bus && G.bus.emit('kill', { e }); }
export function hitFoes() { return []; }
