// Damage rules: enemies taking hits (shields, armour, vulnerability, burn, chain lightning, kills and
// on-kill effects) and the player taking hits (dodges, wards, revive, death). Also the Sunburst.
import { PLAYER } from '../config';
import { angleDiff } from '../core/math';
import type { Enemy } from './types';
import type { World } from './world';
import { onDodged } from './player';

export interface HitSrc {
  src: 'melee' | 'bolt' | 'burn' | 'chain' | 'shard' | 'flare' | 'wisp' | 'fire' | 'crescent';
  x: number; y: number; // where the hit came from (for knockback and armour)
  knock: number;
  heavy: boolean;
  proc: boolean; // may trigger on-hit effects (burn, chain)
  empowered?: boolean;
}

export const XP_BY_KIND: Record<Enemy['kind'], number> = {
  stalker: 3, sentinel: 4, charger: 6, warden: 5, colossus: 12, boss: 0, dummy: 0,
};

/** Returns the damage actually dealt. */
export function damageEnemy(w: World, e: Enemy, amount: number, h: HitSrc): number {
  if (e.dead || e.spawnT > 0) return 0;
  const s = w.run.stats;
  let dmg = amount;
  if (s.reaper && e.hp < e.maxHp * 0.35) dmg *= 1.6;
  dmg *= e.vulnerable || 1;
  // The charger's armoured head shrugs off half of any frontal blow unless it is stunned.
  if (e.kind === 'charger' && e.stun <= 0 && h.src !== 'burn') {
    const from = Math.atan2(h.y - e.y, h.x - e.x);
    if (Math.abs(angleDiff(e.face, from)) < 0.9) dmg *= 0.5;
  }
  if (e.kind === 'boss') dmg *= w.bossDamageMul(e);
  // Eclipse: empowered blows execute weakened foes.
  if (h.empowered && s.synergies.has("eclipse") && e.kind !== "boss" && e.hp - dmg < e.maxHp * 0.35) dmg = e.hp + (e.shield?.hp ?? 0);

  let shielded = false;
  if (e.shield && e.shield.hp > 0) {
    shielded = true;
    const absorbed = Math.min(e.shield.hp, dmg);
    e.shield.hp -= absorbed;
    dmg -= absorbed;
    if (e.shield.hp <= 0) {
      e.shield = null;
      w.emit({ type: 'shieldBreak', x: e.x, y: e.y - e.r });
    }
  }
  dmg = Math.max(0, dmg);
  e.hp -= dmg;
  w.run.damageDealt += dmg;
  e.flash = 0.11;
  e.hitCount++;
  const ang = Math.atan2(e.y - h.y, e.x - h.x);
  if (h.knock > 0 && !e.superArmor) {
    const k = h.knock / e.mass;
    e.kx += Math.cos(ang) * k;
    e.ky += Math.sin(ang) * k;
  }
  if (h.empowered && e.kind !== 'boss') e.stun = Math.max(e.stun, 1.2);
  if (h.src === 'melee') w.hitstop = Math.max(w.hitstop, h.heavy ? 0.075 : 0.045);
  if (h.src !== 'burn' && h.src !== 'fire') {
    w.emit({ type: 'hit', x: e.x, y: e.y - e.r, dmg, heavy: h.heavy, id: e.id, ang, shielded: shielded && dmg === 0, crit: !!h.empowered });
  } else if (dmg > 0) w.emit({ type: 'burnTick', x: e.x, y: e.y - e.r });

  if (h.proc) {
    if (s.burnFrac > 0) {
      e.burn = 3;
      e.burnDps = Math.max(e.burnDps * 0.5, amount * s.burnFrac);
    }
    if (s.chainEvery > 0) {
      w.run.hitCounter++;
      if (w.run.hitCounter % s.chainEvery === 0) chainLightning(w, e.x, e.y - e.r, s.chainTargets, s.chainDmg * s.dmgMul, e.id);
    }
  }
  if (e.hp <= 0) killEnemy(w, e);
  return dmg;
}

export function chainLightning(w: World, x: number, y: number, n: number, dmg: number, skip = -1) {
  const pts = [x, y];
  const hit = new Set<number>([skip]);
  let cx = x, cy = y;
  for (let i = 0; i < n; i++) {
    let best: Enemy | null = null, bd = 120;
    for (const e of w.enemies) {
      if (e.dead || e.spawnT > 0 || hit.has(e.id)) continue;
      const d = Math.hypot(e.x - cx, e.y - cy);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) break;
    hit.add(best.id);
    cx = best.x; cy = best.y - best.r;
    pts.push(cx, cy);
    damageEnemy(w, best, dmg, { src: 'chain', x: cx, y: cy, knock: 30, heavy: false, proc: false });
  }
  if (pts.length > 2) w.emit({ type: 'chain', pts });
}

export function killEnemy(w: World, e: Enemy) {
  if (e.dead) return;
  e.dead = true;
  e.deathT = 0;
  e.hp = 0;
  e.shield = null;
  w.removeTelegraphsOf(e);
  w.run.kills++;
  const big = e.kind === 'colossus' || e.kind === 'boss' || e.elite;
  w.emit({ type: 'kill', x: e.x, y: e.y, kind: e.kind, big, id: e.id });
  if (big) w.shake(3, 0.25);
  if (e.kind !== 'boss' && e.kind !== 'dummy') {
    const n = Math.round((XP_BY_KIND[e.kind] ?? 3) * (e.elite ? 1.6 : 1));
    for (let i = 0; i < n; i++) w.spawnMote(e.x, e.y - 4, 1);
  }
  const s = w.run.stats;
  if (s.shards > 0 && e.kind !== 'dummy') releaseShards(w, e.x, e.y - e.r, s.shards, e.id);
  if (s.synergies.has('wildfire') && e.burn > 0) {
    w.addHazard({ kind: 'fire', team: 'player', x: e.x, y: e.y, r: 26, t: 0, dur: 1.4, delay: 0, dmg: 6, tick: 0.3 });
    for (const o of w.enemies) {
      if (!o.dead && o !== e && Math.hypot(o.x - e.x, o.y - e.y) < 46) { o.burn = 3; o.burnDps = Math.max(o.burnDps, 5); }
    }
  }
}

export function releaseShards(w: World, x: number, y: number, n: number, skip: number) {
  const off = w.rng.next() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = off + (i / n) * Math.PI * 2;
    w.spawnProjectile({ x, y, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, r: 2.5, team: 'player', dmg: 6 * s(w), life: 0.9, pierce: 0, kind: 'shard', homing: 7, skip });
  }
}
const s = (w: World) => w.run.stats.dmgMul;

export function sunburst(w: World, x: number, y: number, free: boolean) {
  const st = w.run.stats;
  const r = PLAYER.sunburstRadius * st.flareRadiusMul;
  w.emit({ type: 'sunburst', x, y, r });
  w.shake(4, 0.3);
  w.hitstop = Math.max(w.hitstop, 0.06);
  for (const e of w.enemies) {
    if (e.dead || e.spawnT > 0) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d > r + e.r) continue;
    if (e.kind !== 'boss') e.stun = Math.max(e.stun, 1.4);
    damageEnemy(w, e, PLAYER.sunburstDamage * st.dmgMul, { src: 'flare', x, y, knock: 260, heavy: true, proc: false });
  }
  for (const p of w.projectiles) if (p.team === 'enemy' && Math.hypot(p.x - x, p.y - y) < r + 10) { p.dead = true; w.emit({ type: 'impact', x: p.x, y: p.y, kind: p.kind, team: 'enemy' }); }
  if (st.synergies.has('supernova')) releaseShards(w, x, y, 12, -1);
  if (st.aegis) w.run.ward = 6;
  w.player.iframes = Math.max(w.player.iframes, free ? 1.5 : 0.35);
}

/**
 * The player is hit. Returns true if damage was taken. Dash invulnerability turns the hit into a dodge.
 * `ox, oy` is the source position for knockback.
 */
export function damagePlayer(w: World, amount: number, ox: number, oy: number, knock = 90): boolean {
  const p = w.player;
  if (p.state === 'dead' || w.god) return false;
  if (p.dashIframes > 0) { onDodged(w); return false; }
  if (p.iframes > 0 || w.roomState === 'transition') return false;
  if (w.run.ward > 0) {
    w.run.ward = 0;
    p.iframes = 0.6;
    w.emit({ type: 'shieldBreak', x: p.x, y: p.y - 8 });
    return false;
  }
  p.hp -= amount;
  w.run.damageTaken += amount;
  p.iframes = PLAYER.hurtIframes;
  p.hurtFlash = 0.25;
  const a = Math.atan2(p.y - oy, p.x - ox);
  p.kx += Math.cos(a) * knock;
  p.ky += Math.sin(a) * knock;
  w.hitstop = Math.max(w.hitstop, 0.07);
  w.shake(3.5, 0.25);
  w.emit({ type: 'hurt', x: p.x, y: p.y, dmg: amount });
  if (p.hp <= 0) {
    if (w.run.stats.revive && !p.reviveUsed) {
      p.reviveUsed = true;
      p.hp = 3;
      w.emit({ type: 'text', x: p.x, y: p.y - 30, text: 'Ember Heart', tone: 'good' });
      sunburst(w, p.x, p.y - 6, true);
      return true;
    }
    p.hp = 0;
    p.state = 'dead';
    p.st = 0;
    w.emit({ type: 'death', x: p.x, y: p.y });
    w.slowMo(1.2, 0.25);
  }
  return true;
}

export function healPlayer(w: World, amt: number) {
  const p = w.player;
  const before = p.hp;
  p.hp = Math.min(p.maxHp, p.hp + amt);
  if (p.hp > before) w.emit({ type: 'heal', x: p.x, y: p.y - 10, amt: p.hp - before });
}
