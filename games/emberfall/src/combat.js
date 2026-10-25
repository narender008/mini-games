// Combat: the lantern swing against enemies, enemy contact, Fire Form burning,
// the down-swing pogo, and every projectile (G.shots).
//
// Shot: spawnShot(G, { side: 'player'|'enemy', kind, x, y, vx, vy, r, dmg, life, gravity?,
//   w?, h? (a box centred on x, y instead of a circle r), ghost? (ignores tiles), pierce? (keeps going
//   after a hit), homing? (turn rate, rad/s, toward the player), arm? (s before it can hurt),
//   fire? (Fire Form is immune), breakable? (a swing pops it), floor? (rides the floor: dies off a ledge),
//   color?, onDie?(G, s) }). side 'fx' is decoration: it hurts nobody.
// Kinds drawn here: bolt (the player's ember bolt), glob, fireball, spore, cloud, flame, gravel,
// wave (a ground shockwave box), stream, shard (rock), ring (an expanding ring, r grows by s.grow).
// The swing is p.attack { x, y, w, h, dmg, id, dir (facing), kind: 'side'|'up'|'down' }; each enemy
// takes one hit per swing id (info.part names the box hit when an enemy's boxes carry a part). Any hit (blocked ones too) sets p.hitLanded = true (player.js recoils,
// or pogo-bounces after a down swing; spikes it handles itself); a down hit also sets p.pogo = true.
import { TILE } from './config.js';
import { emit } from './events.js';
import { hurtPlayer } from './player.js';
import { solidAt } from './physics.js';
import { glow, additive, flame, rgba, TAU, low, useG } from './enemies/paint.js';

export function spawnShot(G, o) {
  const s = { side: 'enemy', kind: 'glob', vx: 0, vy: 0, r: 8, dmg: 1, life: 3, gravity: 0, t: 0, alive: true, ...o };
  G.shots.push(s);
  return s;
}

const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const boxesOf = (e) => (e.spec?.boxes ? e.spec.boxes(e) : e.boxes ? e.boxes() : [e]);
function shotBox(s) { return s.w ? { x: s.x - s.w / 2, y: s.y - s.h / 2, w: s.w, h: s.h } : { x: s.x - s.r, y: s.y - s.r, w: s.r * 2, h: s.r * 2 }; }
function shotHits(s, b) {
  if (s.kind === 'ring') {   // a band at radius r
    const cx = Math.max(b.x, Math.min(s.x, b.x + b.w)), cy = Math.max(b.y, Math.min(s.y, b.y + b.h));
    const near = Math.hypot(cx - s.x, cy - s.y);
    const far = Math.max(Math.hypot(b.x - s.x, b.y - s.y), Math.hypot(b.x + b.w - s.x, b.y - s.y), Math.hypot(b.x - s.x, b.y + b.h - s.y), Math.hypot(b.x + b.w - s.x, b.y + b.h - s.y));
    return near <= s.r + 8 && far >= s.r - 8;
  }
  if (s.w) return overlap(shotBox(s), b);
  const cx = Math.max(b.x, Math.min(s.x, b.x + b.w)), cy = Math.max(b.y, Math.min(s.y, b.y + b.h));
  return (cx - s.x) ** 2 + (cy - s.y) ** 2 < s.r * s.r;
}

// A boss or enemy attack box against the player: hurts through hurtPlayer. opts.fire: Fire Form is immune.
export function hitPlayerBox(G, x, y, w, h, dmg, fromX, opts = {}) {
  const p = G.player;
  if (!p || p.hp <= 0) return false;
  if (opts.fire && p.form === 'fire') return false;
  if (!overlap({ x, y, w, h }, p)) return false;
  hurtPlayer(G, dmg, fromX ?? x + w / 2, { enemy: opts.kind || 'attack' });
  return true;
}

export function updateCombat(G, dt) {
  const p = G.player;
  if (!p) return;
  const alive = G.enemies.filter((e) => e.alive);

  // the lantern swing
  const a = p.attack;
  if (a) {
    const down = a.kind === 'down' || a.dir === 'down';
    for (const e of alive) {
      if (e.lastSwing === a.id || e.untouchable) continue;
      const hb = boxesOf(e).find((b) => overlap(a, b));
      if (!hb) continue;
      e.lastSwing = a.id;
      const r = e.hurt(G, a.dmg ?? 1, { src: 'swing', dir: down ? 'down' : a.kind || 'side', fromX: p.x + p.w / 2, id: a.id, part: hb.part });
      if (r) { p.hitLanded = true; if (down) p.pogo = true; }
    }
    for (const s of G.shots) if (s.side === 'enemy' && s.breakable && s.alive && overlap(a, shotBox(s))) { killShot(G, s); p.hitLanded = true; if (down) p.pogo = true; }
  }

  // touching enemies
  for (const e of alive) {
    const touching = boxesOf(e).some((b) => overlap(p, b));
    if (!touching) { e.fireT = 0; continue; }
    if (p.form === 'fire' && !e.untouchable) {
      e.fireT -= dt;
      if (e.fireT <= 0) { e.fireT = 0.4; e.hurt(G, 1, { src: 'fire', fromX: p.x + p.w / 2 }); }
    }
    if (e.alive && e.contact > 0 && !e.harmless) hurtPlayer(G, e.contact, e.x + e.w / 2, { enemy: e.kind });
  }

  // projectiles
  for (const s of G.shots) {
    if (!s.alive) continue;
    s.t += dt; s.life -= dt;
    if (s.homing && G.player) {
      const want = Math.atan2(p.y + p.h / 2 - s.y, p.x + p.w / 2 - s.x), sp = Math.hypot(s.vx, s.vy);
      let cur = Math.atan2(s.vy, s.vx), d = ((want - cur + Math.PI * 3) % TAU) - Math.PI;
      cur += Math.max(-s.homing * dt, Math.min(s.homing * dt, d));
      s.vx = Math.cos(cur) * sp; s.vy = Math.sin(cur) * sp;
    }
    s.vy += (s.gravity || 0) * dt;
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (s.grow) s.r += s.grow * dt;
    if (s.life <= 0) { killShot(G, s, true); continue; }
    if (!s.ghost) {
      const fy = s.floor ? s.y + (s.h || s.r * 2) / 2 + 6 : null;
      if (solidAt(G, s.x, s.y) || (s.floor && !solidAt(G, s.x, fy))) { killShot(G, s); continue; }
    }
    if (s.arm && s.t < s.arm) continue;
    if (s.side === 'player') {
      for (const e of G.enemies) {
        if (!e.alive || e.untouchable || (s.hitSet && s.hitSet.has(e))) continue;
        const hb = boxesOf(e).find((b) => shotHits(s, b));
        if (!hb) continue;
        e.hurt(G, s.dmg, { src: 'bolt', fromX: s.x - s.vx * 0.01, part: hb.part });
        if (s.pierce) (s.hitSet ||= new Set()).add(e); else { killShot(G, s); break; }
      }
    } else if (s.side === 'enemy' && p.hp > 0 && !(s.fire && p.form === 'fire') && shotHits(s, p)) {
      hurtPlayer(G, s.dmg, s.x, { shot: s.kind });
      if (!s.pierce) killShot(G, s);
    }
  }
  G.shots = G.shots.filter((s) => s.alive);
}

function killShot(G, s, expired = false) {
  if (!s.alive) return;
  s.alive = false;
  emit('shot-die', { x: s.x, y: s.y, kind: s.kind, side: s.side });
  if (s.onDie) s.onDie(G, s, expired);
}

// ---------------------------------------------------------------- drawing
const COL = {
  bolt: '#ffb347', glob: '#ff6a1a', fireball: '#ff7a2a', spore: '#c8ff5a', cloud: '#b4ff6a', flame: '#ff6a1a',
  gravel: '#c89a6a', wave: '#ffb36a', stream: '#ff8a2a', shard: '#9a8a7a', ring: '#7af0ff', water: '#7af0ff', pollen: '#ff7ae0',
};
export function drawShots(g, G) {
  useG(G);
  const lo = low(G);
  for (const s of G.shots) {
    const c = s.color || COL[s.kind] || '#ffb347', k = Math.min(1, s.life / 0.3);
    switch (s.kind) {
      case 'gravel': case 'shard':
        g.save(); g.translate(s.x, s.y); g.rotate(s.t * 6 + s.x);
        g.fillStyle = '#3a2e28'; g.beginPath(); g.moveTo(-s.r, -s.r * 0.4); g.lineTo(-s.r * 0.2, -s.r); g.lineTo(s.r, -s.r * 0.3); g.lineTo(s.r * 0.6, s.r); g.lineTo(-s.r * 0.7, s.r * 0.7); g.closePath(); g.fill();
        g.strokeStyle = s.ember ? '#ff8a2a' : '#7a6656'; g.lineWidth = 1.5; g.stroke(); g.restore();
        if (s.ember) { additive(g, () => glow(g, s.x, s.y, s.r * 2.5, '#ff6a1a', 0.6)); G.lights.push({ x: s.x, y: s.y, r: 60, c: '#ff6a1a', a: 0.4 }); }
        break;
      case 'cloud': {
        const a = Math.min(1, s.t / 0.3) * k * (s.arm && s.t < s.arm ? 0.5 : 1);
        g.save(); g.globalAlpha = 0.35 * a;
        for (let i = 0; i < 6; i++) { const an = i * 1.05 + s.t * 0.7; g.fillStyle = rgba(c, 0.5); g.beginPath(); g.arc(s.x + Math.cos(an) * s.r * 0.45, s.y + Math.sin(an) * s.r * 0.35, s.r * 0.6, 0, TAU); g.fill(); }
        g.restore();
        additive(g, () => { glow(g, s.x, s.y, s.r * 1.4, c, 0.35 * a); for (let i = 0; i < 8; i++) { const an = i * 0.8 + s.t * 1.7; g.fillStyle = rgba('#ffffe0', 0.8 * a); g.fillRect(s.x + Math.cos(an) * s.r * (0.3 + (i % 3) * 0.2), s.y + Math.sin(an * 1.3) * s.r * 0.5, 2, 2); } });
        G.lights.push({ x: s.x, y: s.y, r: s.r * 2, c, a: 0.35 * a });
        break;
      }
      case 'flame': {
        const a = Math.min(1, s.life / 0.5);
        additive(g, () => {
          glow(g, s.x, s.y, s.w * 0.9, '#ff4a1a', 0.5 * a);
          for (let i = -1; i <= 1; i++) flame(g, s.x + i * s.w * 0.28, s.y + s.h / 2, s.h * 0.55 * (0.8 + 0.3 * Math.sin(s.t * 13 + i * 2)), i ? '#ff6a1a' : '#ffc14a', 0.9 * a, Math.sin(s.t * 9 + i) * 2);
        });
        G.lights.push({ x: s.x, y: s.y, r: 70, c: '#ff6a1a', a: 0.4 * a });
        break;
      }
      case 'wave': {
        const big = s.h > 60;
        additive(g, () => {
          glow(g, s.x, s.y + s.h * 0.2, s.h * 1.1, c, 0.6);
          const n = big ? 5 : 3;
          for (let i = 0; i < n; i++) flame(g, s.x + (i - (n - 1) / 2) * s.w / n, s.y + s.h / 2, s.h * (0.35 + 0.15 * Math.sin(s.t * 20 + i * 1.7)) * (big ? 1.2 : 1), i % 2 ? c : '#ffffff', 0.85, -Math.sign(s.vx) * 4);
        });
        if (!big && !s.fireWave) { g.fillStyle = '#2a1e18'; for (let i = 0; i < 4; i++) { const ox = ((i * 13 + s.t * 400) % s.w) - s.w / 2; g.fillRect(s.x + ox, s.y + s.h / 2 - 8 - (i % 2) * 6, 5, 5); } }
        G.lights.push({ x: s.x, y: s.y, r: s.h * 2.5, c, a: 0.6 });
        break;
      }
      case 'ring':
        additive(g, () => {
          g.strokeStyle = rgba(c, 0.85 * k); g.lineWidth = 4; g.beginPath(); g.arc(s.x, s.y, s.r, 0, TAU); g.stroke();
          g.strokeStyle = rgba('#ffffff', 0.7 * k); g.lineWidth = 1.5;
          g.beginPath(); for (let i = 0; i <= 24; i++) { const an = i / 24 * TAU, rr = s.r + Math.sin(i * 7 + s.t * 60) * 5; g[i ? 'lineTo' : 'moveTo'](s.x + Math.cos(an) * rr, s.y + Math.sin(an) * rr); } g.stroke();
        });
        G.lights.push({ x: s.x, y: s.y, r: s.r + 60, c, a: 0.35 * k });
        break;
      case 'spore': case 'pollen':
        additive(g, () => { glow(g, s.x, s.y, s.r * 3, c, 0.7); g.fillStyle = '#ffffe8'; g.beginPath(); g.arc(s.x, s.y, s.r * 0.45, 0, TAU); g.fill(); });
        if (!lo) G.lights.push({ x: s.x, y: s.y, r: 50, c, a: 0.4 });
        break;
      default: { // bolt, glob, fireball, stream, water
        const sp = Math.hypot(s.vx, s.vy) || 1, tl = Math.min(s.kind === 'bolt' ? 46 : 30, sp * 0.06);
        additive(g, () => {
          const tx = s.x - s.vx / sp * tl * 1.6, ty = s.y - s.vy / sp * tl * 1.6;
          const tg = g.createLinearGradient(tx, ty, s.x, s.y); tg.addColorStop(0, rgba(c, 0)); tg.addColorStop(1, rgba(c, 0.85));
          g.strokeStyle = tg; g.lineWidth = s.r * 1.6; g.lineCap = 'round'; g.beginPath(); g.moveTo(tx, ty); g.lineTo(s.x, s.y); g.stroke();
          glow(g, s.x, s.y, s.r * 4, c, 0.85); glow(g, s.x, s.y, s.r * 1.4, '#ffffff', 1);
        });
        G.lights.push({ x: s.x, y: s.y, r: s.r * 12, c, a: 0.55 });
      }
    }
  }
}

export { TILE };
