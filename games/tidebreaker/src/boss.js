// Tidebreaker: the set pieces. startBoss(G, kind) / updateBoss(G, dt) for
//   'fortress'  end of legs 1 and 2: an island with walls and three gun towers
//               (each a hittable part) slides in at the back of the lane, lobs
//               mortars and sends escort sloops; leg 2's is tougher and lit;
//   'serpent'   end of leg 4, in the fog: the Mistcoil Serpent spits venom,
//               lunges at the lane, dives and resurfaces (and in phase 2
//               erupts under you); its head is the weak spot;
//   'leviathan' the finale: tentacles slam and sweep the lane (phase 1), an
//               eye opens as the weak spot while the maw fires bolts and
//               summons ghost ships (phase 2), then a whirlpool drags you in
//               while it charges a beam (phase 3).
// Every attack telegraphs on the water first; G.enc.hazards lists them for
// bots: [{ kind, x, w, t }] (t = seconds until it hits, w = half width).
// Hittable parts live in G.enemies (entity contract in game.js); purely
// visual layers are entities with alive: false and hitTest -> 0 that we
// remove when the set piece ends. G.boss { kind, name, hp, maxHp, phase,
// phases, x, y } is kept current; x, y = the weak spot when open.
import { LANE_Y, PLAYER_X, W } from './config.js';
import { clamp, lerp, smooth, rgba, mix } from './util.js';
import { bez, layer } from './gfx.js';
import { emit } from './events.js';
import { laneY, aboveLane } from './world/ocean.js';
import { spawn, paintFire, paintSmoke } from './world/fx.js';
import { damage, enemyFire } from './combat.js';
import { makeShip } from './ships.js';
import { SERPENT, LEV_TENTACLE, GHOST_TENTACLE, paintBody, paintSerpentHead, serpentHeadPoint, paintTentacle, tentacleRad,
  tubeHit, paintLeviathan, leviathanHit, LEV, addGlow, softGlow } from './creatures.js';

const NAMES = { fortress: ['CORALHOLD FORT', 'EMBER KEEP'], serpent: 'THE MISTCOIL SERPENT', leviathan: 'THE DROWNED LEVIATHAN' };
const PHASES = { fortress: 1, serpent: 2, leviathan: 3 };
const DEATH = 3.2;
// Half width of every blow on the lane, from the ship's centre: a ship that
// moves about 70 px off the marked spot is clear (lobbed shots: radius + the
// ship's 41 px, see combat.js land).
const REACH = 64, LOB_R = 25, SPREAD = 165;           // seconds of death animation before the encounter is done

// ------------------------------------------------------------ shared
function part(o) {
  return { kind: 'part', x: 0, y: 0, cx: 0, cy: 0, hp: 1, maxHp: 1, alive: true, gone: false, layer: 'far', boss: true, bounty: 0,
    burn: 0, burnDps: 0, slow: 0, hurt: 0, floor: 0, side: 'enemy', vx: 0,
    hitTest: () => 0, update() {}, draw() {},
    // floor: hp it cannot drop below (intro and phase changes); damage() takes what we return
    onDamage(G, amt) { this.hurt = 1; if (this.floor > 0) return Math.max(0, Math.min(amt, this.hp - this.floor)); }, ...o };
}
// Visual-only layer: never hittable, never counted.
function decor(layerName, draw, update) {
  return { kind: 'decor', decor: true, x: 0, y: 0, cx: 0, cy: 0, hp: 0, maxHp: 1, alive: false, gone: false, layer: layerName, boss: false, bounty: 0,
    hitTest: () => 0, update: update || (() => {}), draw };
}
const rnd = (G, a, b) => a + (b - a) * G.rng();
// The finale hits a little softer than its numbers: players arrive worn down.
const bossDmgK = (G) => (G.enc?.type === 'leviathan' ? 0.7 : 1);
function hurtPlayer(G, amount, kind, x) {
  const p = G.player; if (!p || !p.alive) return;
  damage(G, p, amount * bossDmgK(G), { kind, x: x ?? p.x, y: p.cy ?? p.y - 50, src: 'boss' });
}
// Fire through combat.js. kind 'mortar' lobs onto the lane at tx (combat
// draws its landing ring), anything else flies through (tx, ty). look: how
// drawShotLooks paints it over combat's ball ('venom' | 'spit' | 'bolt').
function shoot(G, B, x, y, tx, ty, opts) {
  const from = { x, y, cx: x, cy: y, kind: B.kind, side: 'enemy', dir: -1, boss: true };
  let out = [];
  if (opts.dmg) opts = { ...opts, dmg: opts.dmg * bossDmgK(G) };
  try { out = enemyFire(G, from, tx, ty ?? laneY(G, tx), { x0: x, y0: y, ...opts }) || []; } catch (e) { console.error(e); }
  if (!Array.isArray(out)) out = [out];
  for (const s of out) {
    if (!s) continue;
    if (opts.look) s.look = opts.look;
    if (s.kind !== 'mortar') B.marks.push({ s, x: s.landX ?? tx, col: opts.col || '#ff5a5a' });
  }
  return out;
}
// Escort and ghost ships: ships.js hulls with a simple captain of our own.
function escort(G, B, kind, x, opts = {}) {
  let s = null;
  try { s = makeShip(G, kind, x, { think: escortThink, ...opts }); } catch (e) { console.error(e); }
  if (!s) return null;
  s.think = s.think || escortThink;
  s.station = opts.station ?? rnd(G, 640, 860);
  s.reload = 1.5 + G.rng() * 1.5;
  if (opts.ghost) { s.ghost = true; s.reveal = 0; }
  if (!G.enemies.includes(s)) G.enemies.push(s);
  B.escorts.push(s);
  return s;
}
function escortThink(G, e, dt) {
  const p = G.player, sp = (e.speed || 90) * (e.slow > 0 ? 1 - (e.slowK || 0.4) : 1);
  if (e.ghost) {
    // ghost ships drift in, fire a few volleys and fade back into the mist
    const fade = e.t > 20 || (G.enc?.B?.phase ?? 2) > 2;
    e.reveal = fade ? (e.reveal || 0) - dt * 0.6 : Math.min(0.72, (e.reveal || 0) + dt * 0.5);
    if (fade && e.reveal <= 0.02) { e.alive = false; e.gone = true; return; }
    if (fade) { e.vx *= 0.95; return; }
  }
  if (e.held > 0) { e.held -= dt; e.vx = 0; return; }
  e.station += Math.sin(e.t * 0.7 + e.seed) * 40 * dt;
  e.station = clamp(e.station, 620, 1000);
  const want = clamp((e.station - e.x) * 1.4, -sp, sp);
  e.vx += (want - e.vx) * Math.min(1, dt * 1.6);
  if (!p || !p.alive || e.x > W - 60) return;
  if (e.charge > 0) {
    e.charge -= dt;
    if (e.charge <= 0) {
      e.charge = 0; e.kick = 1;
      const k = 1 + G.stage * 0.07, n = e.kind === 'sloop' ? 1 + (G.rng() < 0.5 ? 1 : 0) : (e.guns || 2);
      enemyFire(G, e, p.cx + (p.vx || 0) * 0.5, p.cy - p.s * 0.1, { kind: 'ball', n, err: 40, spread: 30, dmg: (e.gunDmg || 5) * k * (e.ghost ? 0.45 : 1), delay: 0.06 });
    }
    return;
  }
  e.reload -= dt;
  if (e.reload <= 0) { e.charge = 0.6; e.reload = (e.reloadT || 3.5) * (0.9 + G.rng() * 0.4) * (e.ghost ? 1.5 : 1); }
}
// A telegraph on the water: kind, x, w (half width), t (seconds to impact), hold
// (seconds it stays dangerous after), col. It also puts a threat marker in
// G.shots (side 'enemy', landX, delay > 0 so nothing moves or draws it) so
// bots that dodge shots by landX dodge it too; B.hazards removes it.
function hazard(B, h) {
  const z = { life: h.t, age: 0, ...h };
  if (B.G && h.x > 0) {
    z.threat = { side: 'enemy', kind: 'threat', threat: true, x: h.x, y: -999, vx: 0, vy: 1, g: 0, r: 0, t: 0, dmg: 0, delay: 1e9, landX: h.x };
    B.G.shots.push(z.threat);
  }
  B.hazards.push(z);
  return z;
}
function clearHazards(G, B, keep = () => false) {
  for (const h of B.hazards) if (!keep(h)) dropThreat(G, h);
  B.hazards = B.hazards.filter(keep);
}
function dropThreat(G, h) { if (h.threat) { const i = G.shots.indexOf(h.threat); if (i >= 0) G.shots.splice(i, 1); h.threat = null; } }

// ------------------------------------------------------------ start / update
export function startBoss(G, kind) {
  const phases = PHASES[kind] || 1;
  const B = { kind, t: 0, phase: 1, phases, parts: [], escorts: [], hazards: [], marks: [], decor: [], dying: 0, trans: 0, maxHp: 1, aim: [900, 400] };
  Object.defineProperty(B, 'G', { value: G, enumerable: false });
  G.enc = { type: kind, done: false, wave: 1, waves: phases, t: 0, hazards: [], B };
  const name = kind === 'fortress' ? NAMES.fortress[Math.min(1, G.leg)] : NAMES[kind] || 'BOSS';
  G.boss = { kind, name, hp: 1, maxHp: 1, phase: 1, phases, x: 900, y: 400 };
  if (kind === 'fortress') initFortress(G, B);
  else if (kind === 'serpent') initSerpent(G, B);
  else initLeviathan(G, B);
  const lane = decor('lane', (g) => drawLaneMarks(g, G, B));
  const looks = decor('front', (g) => drawShotLooks(g, G));
  B.decor.push(lane, looks); G.enemies.unshift(lane); G.enemies.push(looks);
  B.maxHp = B.parts.filter((p) => p.boss).reduce((a, p) => a + p.maxHp, 0);
  sync(G, B);
  G.banner = { title: name, sub: kind === 'leviathan' ? 'FINAL BOSS' : kind === 'fortress' ? 'TAKE THE FORT' : 'BOSS', t: 0, life: 2.8 };
  emit('boss-spawn', { kind });
}

export function updateBoss(G, dt) {
  const B = G.enc?.B;
  if (!B) { G.enc.t = (G.enc.t || 0) + dt; if (G.enc.t > 3) G.enc.done = true; return; }
  B.t += dt; G.enc.t = B.t;
  // parts: death bookkeeping and hp floors (invulnerable phases)
  for (const p of B.parts) {
    p.hurt = Math.max(0, p.hurt - dt * 4);
    if (p.hp < p.floor) p.hp = p.floor;
    if (p.alive && p.hp <= 0) { p.alive = false; p.onDeath?.(G); }
    else if (!p.alive && !p._dead) p.onDeath?.(G);
  }
  if (B.kind === 'fortress') updateFortress(G, B, dt);
  else if (B.kind === 'serpent') updateSerpent(G, B, dt);
  else updateLeviathan(G, B, dt);
  // telegraphs
  for (const h of B.hazards) {
    h.age += dt; h.t -= dt;
    if (h.threat) h.threat.landX = h.x;
    // a sweep: keep the marker just on the danger side of the ship until it is clear of the band
    if (h.kind === 'band' && h.threat && G.player) {
      const px = G.player.x, inBand = px > h.x - h.w - REACH && px < h.x + h.w + REACH;
      h.threat.landX = inBand ? px - 30 * h.safe : h.x;
    }
    if (h.t <= -(h.hold ?? 0.25)) dropThreat(G, h);
  }
  B.hazards = B.hazards.filter((h) => h.threat || h.t > -(h.hold ?? 0.25));
  for (const m of B.marks) if (m.t != null) m.t -= dt;
  B.marks = B.marks.filter((m) => (m.s ? G.shots.includes(m.s) : m.t > 0));
  G.enc.hazards = B.hazards.filter((h) => h.t > -0.05).map((h) => ({ kind: h.kind, x: h.x, w: h.w, t: Math.max(0, h.t) }));
  sync(G, B);
  if (B.dying) {
    B.dying += dt;
    if (B.dying > DEATH && !G.enc.done) {
      G.enc.done = true;
      for (const d of B.decor) d.gone = true;
      for (const p of B.parts) p.gone = true;
      clearHazards(G, B); G.enc.hazards = [];
    }
  }
}

function sync(G, B) {
  let hp = 0;
  for (const p of B.parts) if (p.boss) hp += Math.max(0, p.hp);
  const b = G.boss; if (!b) return;
  b.hp = B.dying ? 0 : hp; b.maxHp = B.maxHp; b.phase = B.phase; b.phases = B.phases;
  b.x = B.aim[0]; b.y = B.aim[1];
  G.enc.wave = B.phase;
}
function setPhase(G, B, n) {
  B.phase = n;
  emit('boss-phase', { kind: B.kind, phase: n });
  emit('boss-roar', { kind: B.kind });
}
function startDeath(G, B, x, y) {
  if (B.dying) return;
  B.dying = 0.0001;
  clearHazards(G, B);
  for (const p of B.parts) { p.floor = 0; }
  emit('boss-dead', { kind: B.kind });
  emit('explode', { x, y, size: 3 });
  spawn(G, 'explosion', x, y, { size: 112 });
}

// Telegraph shadows, rings and bands on the lane (drawn just after the lane).
function drawLaneMarks(g, G, B) {
  const t = G.vt;
  for (const h of B.hazards) {
    const k = clamp(h.age / Math.max(0.01, h.life), 0, 1), on = h.t <= 0;
    if (h.kind === 'band') {
      const y0 = laneY(G, h.x);
      g.save();
      g.fillStyle = rgba('#ff2a4a', on ? 0.28 : 0.1 + 0.14 * k * (0.6 + 0.4 * Math.sin(t * 14)));
      g.beginPath(); g.moveTo(h.x - h.w, laneY(G, h.x - h.w) - 6);
      for (let x = h.x - h.w; x <= h.x + h.w; x += 12) g.lineTo(x, laneY(G, x) - 6);
      for (let x = h.x + h.w; x >= h.x - h.w; x -= 12) g.lineTo(x, laneY(G, x) + 16);
      g.closePath(); g.fill();
      g.strokeStyle = rgba('#ffd0d8', 0.35 + 0.4 * k); g.lineWidth = 2; g.setLineDash([10, 8]); g.lineDashOffset = -t * 60 * (h.dir || 1);
      g.stroke(); g.setLineDash([]);
      // chevrons pointing the way it sweeps
      g.fillStyle = rgba('#ffffff', 0.25 + 0.4 * k);
      for (let i = 0; i < 4; i++) {
        const x = h.x - h.w + ((i + 0.5) / 4) * h.w * 2, d = h.dir || 1, y = y0 + 5;
        g.beginPath(); g.moveTo(x - 8 * d, y - 7); g.lineTo(x + 6 * d, y); g.lineTo(x - 8 * d, y + 7); g.closePath(); g.fill();
      }
      g.restore();
      continue;
    }
    const x = h.x, y = laneY(G, x) + 4, w = h.w;
    g.save();
    // shadow growing as the blow comes
    g.fillStyle = rgba(h.kind === 'beam' ? '#ff2040' : '#0a0418', (0.18 + 0.35 * k) * (on ? 1 : 1));
    g.beginPath(); g.ellipse(x, y, w * (0.5 + 0.5 * k), w * 0.2 * (0.5 + 0.5 * k), 0, 0, 7); g.fill();
    g.strokeStyle = rgba(h.col || '#ff4a6a', 0.45 + 0.45 * Math.abs(Math.sin(t * (6 + k * 10))));
    g.lineWidth = 2.5;
    g.beginPath(); g.ellipse(x, y, w, w * 0.2, 0, 0, 7); g.stroke();
    if (h.kind === 'wake') {
      g.strokeStyle = rgba('#ffffff', 0.6);
      for (let i = 0; i < 3; i++) { const r = ((t * 1.6 + i / 3) % 1) * w; g.beginPath(); g.ellipse(x, y, r, r * 0.2, 0, 0, 7); g.stroke(); }
    }
    g.restore();
  }
  for (const m of B.marks) {
    const x = m.s ? (m.s.landX ?? m.x) : m.x, y = laneY(G, x) + 4;
    g.strokeStyle = rgba(m.col, 0.55 + 0.35 * Math.sin(t * 12)); g.lineWidth = 2;
    g.beginPath(); g.ellipse(x, y, 26, 6, 0, 0, 7); g.stroke();
    g.beginPath(); g.moveTo(x - 8, y); g.lineTo(x + 8, y); g.stroke();
  }
}

// Our shots ride on combat's (it moves them and lands them); this paints their look over the ball.
function drawShotLooks(g, G) {
  const t = G.vt, op = g.globalCompositeOperation;
  for (const s of G.shots) {
    if (!s.look || s.delay > 0) continue;
    const ang = Math.atan2(s.vy, s.vx);
    if (s.look === 'bolt') {
      g.globalCompositeOperation = 'lighter';
      softGlow(g, s.x, s.y, 34, '#ff4aa8', 0.9);
      g.save(); g.translate(s.x, s.y); g.rotate(ang);
      g.fillStyle = 'rgba(255,120,200,0.55)'; g.beginPath(); g.ellipse(-16, 0, 26, 6, 0, 0, 7); g.fill();
      g.fillStyle = '#fff0fa'; g.beginPath(); g.ellipse(0, 0, 11, 6, 0, 0, 7); g.fill();
      g.restore();
      softGlow(g, s.x, s.y, 14, '#3affe0', 0.6);
      g.globalCompositeOperation = op;
    } else {
      const venom = s.look === 'venom', r = venom ? 10 : 15, col = venom ? '#b8ff3a' : '#ff9a3a', core = venom ? '#f0ffb0' : '#fff0b0';
      addGlow(g, s.x, s.y, r * 3.2, col, 0.7);
      g.save(); g.translate(s.x, s.y); g.rotate(ang);
      const wob = 1 + Math.sin(t * 20 + s.x * 0.05) * 0.12;
      g.fillStyle = venom ? '#6ad81a' : '#e8481a'; g.beginPath(); g.ellipse(-r * 0.4, 0, r * 1.4 * wob, r / wob, 0, 0, 7); g.fill();
      g.fillStyle = core; g.beginPath(); g.ellipse(r * 0.1, -r * 0.25, r * 0.55, r * 0.4, 0, 0, 7); g.fill();
      g.fillStyle = venom ? 'rgba(160,255,60,0.7)' : 'rgba(255,140,60,0.7)';
      for (let i = 1; i <= 3; i++) { g.beginPath(); g.arc(-r * (1.4 + i * 0.8), Math.sin(t * 15 + i) * 3, r * (0.4 - i * 0.08), 0, 7); g.fill(); }
      g.restore();
    }
  }
}

// ================================================================ fortress
const FORT_COL = {
  dawn: { rock: '#4a3358', rockHi: '#c88aa8', stone: '#9a7aa6', dark: '#4a3360', roof: '#8a3a5a', rim: '#ffd0b0', flag: '#d94b4b' },
  sunset: { rock: '#2e1238', rockHi: '#a04a78', stone: '#5a2a66', dark: '#2a1034', roof: '#3a1748', rim: '#ffb36b', flag: '#c12f3f', lit: '#ffcf6a' },
};
function initFortress(G, B) {
  const tough = G.leg >= 1;
  B.col = FORT_COL[tough ? 'sunset' : 'dawn'];
  B.lit = tough;
  B.x = 1620; B.tx = 965; B.y = LANE_Y - 30; B.ground = B.y - 46; B.sink = 0;
  B.next = 9; B.esc = tough ? 2 : 1;
  B.cache = fortLayer(B);
  const hp = Math.round(230 * G.diff * (tough ? 1.3 : 1));
  const deco = decor('far', (g) => drawFortress(g, G, B));
  B.decor.push(deco); G.enemies.push(deco);
  const specs = [[-178, 118, 62], [0, 172, 82], [178, 108, 58]];
  specs.forEach(([ox, h, w], i) => {
    const tw = part({ kind: 'tower', ox, h, w, hp, maxHp: hp, i, fireT: 2.6 + i * 1.3, charge: 0, tx: 0, rubble: 0,
      bounty: 30, layer: 'far',
      hitTest(x, y, r) {
        if (!this.alive || B.x > W + 40) return 0;
        const cx = B.x + this.ox, top = B.ground - this.h - 18;
        if (x < cx - this.w / 2 - r || x > cx + this.w / 2 + r || y < top - r || y > B.ground + 20 + r) return 0;
        if (this.charge > 0 && Math.hypot(x - cx, y - (B.ground - this.h * 0.58)) < 16 + r) return 2;
        return 1;
      },
      update() { this.cx = this.x = B.x + this.ox; this.cy = B.ground - this.h * 0.55; this.y = B.ground; },
      draw(g) { drawTower(g, G, B, this); },
      onDeath(G2) {
        if (this._dead) return; this._dead = true; this.alive = false; this.rubble = 0.0001;
        const x = B.x + this.ox, y = B.ground - this.h * 0.5;
        emit('explode', { x, y, size: 2 }); emit('sink', { x, y, kind: 'tower', boss: false });
        spawn(G2, 'explosion', x, y, { size: 72 }); spawn(G2, 'debris', x, y, { n: 14, size: 1.4 });
      } });
    tw.update(G); tw.floor = hp;   // untouchable until it has slid into place
    B.parts.push(tw); G.enemies.push(tw);
  });
}
function fortLayer(B) {
  const c = B.col, K = 1.5, Wd = 680, Hd = 200, cnv = layer(Wd * K, Hd * K), g = cnv.getContext('2d');
  g.scale(K, K); g.translate(Wd / 2, Hd - 42);   // origin: island centre at the waterline
  const gy = -46;
  // rock
  const rg = g.createLinearGradient(0, gy - 30, 0, 30); rg.addColorStop(0, c.rockHi); rg.addColorStop(0.35, c.rock); rg.addColorStop(1, mix(c.rock, '#000000', 0.5));
  g.fillStyle = rg; g.beginPath(); g.moveTo(-320, 40);
  const bumps = [[-300, -6], [-262, -26], [-230, gy + 6], [-120, gy - 4], [0, gy - 8], [140, gy - 2], [236, gy + 4], [270, -20], [306, -4]];
  for (const [x, y] of bumps) g.lineTo(x, y);
  g.lineTo(326, 40); g.closePath(); g.fill();
  g.strokeStyle = rgba(c.rim, 0.45); g.lineWidth = 2; g.beginPath(); g.moveTo(-262, -26); g.lineTo(-230, gy + 6); g.lineTo(-120, gy - 4); g.stroke();
  // curtain walls with crenellations
  const sg = g.createLinearGradient(0, gy - 58, 0, gy); sg.addColorStop(0, c.stone); sg.addColorStop(1, c.dark);
  g.fillStyle = sg; g.fillRect(-232, gy - 54, 464, 56);
  for (let x = -232; x < 232; x += 18) g.fillRect(x, gy - 64, 10, 11);
  g.strokeStyle = rgba('#000000', 0.25); g.lineWidth = 1;
  for (let y = gy - 44; y < gy; y += 11) { g.beginPath(); g.moveTo(-232, y); g.lineTo(232, y); g.stroke(); }
  g.fillStyle = rgba(c.rim, 0.35); g.fillRect(-232, gy - 54, 464, 3);
  // gate
  g.fillStyle = '#140818'; g.beginPath(); g.moveTo(-26, gy + 2); g.lineTo(-26, gy - 24); g.arc(0, gy - 24, 26, Math.PI, 0); g.lineTo(26, gy + 2); g.fill();
  g.strokeStyle = rgba(c.rim, 0.3); g.lineWidth = 2; g.stroke();
  // palms
  g.strokeStyle = c.rock; g.fillStyle = c.rock; g.lineCap = 'round';
  for (const [x, h, lean] of [[-286, 54, 0.4], [-258, 42, 0.15], [282, 50, -0.35]]) {
    const y = -20, tx = x + h * lean, ty = y - h;
    g.lineWidth = h * 0.07; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + h * lean * 0.2, y - h * 0.6, tx, ty); g.stroke();
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * 0.55, L = h * (0.45 + (i % 3) * 0.08), ex = tx + Math.cos(a) * L, ey = ty + Math.sin(a) * L * 0.6 + L * 0.35;
      g.lineWidth = h * 0.05; g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo((tx + ex) / 2, ty - L * 0.25, ex, ey); g.stroke();
    }
  }
  if (c.lit) for (const x of [-150, -90, 90, 150]) { g.fillStyle = c.lit; g.fillRect(x - 3, gy - 34, 6, 9); }
  return { cnv, K, Wd, Hd };
}
function drawFortress(g, G, B) {
  const { cnv, Wd, Hd } = B.cache, x = B.x, y = B.y + B.sink;
  if (x > W + 360) return;
  const L = G.world.light || {};
  g.drawImage(cnv, x - Wd / 2, y - Hd + 42, Wd, Hd);
  if (B.lit) for (const ox of [-150, -90, 90, 150]) addGlow(g, x + ox, y - 46 - 30, 16, B.col.lit, 0.6 + 0.2 * Math.sin(G.vt * 3 + ox));
  // a wash of foam where the rock meets the sea
  g.strokeStyle = rgba('#ffffff', 0.4); g.lineWidth = 2;
  for (let i = 0; i < 7; i++) { const fx = x - 280 + i * 90 + Math.sin(G.vt * 1.3 + i) * 10; g.beginPath(); g.moveTo(fx - 30, y + 30); g.quadraticCurveTo(fx, y + 25, fx + 30, y + 30); g.stroke(); }
  if (L.dark > 0.5) { g.fillStyle = rgba('#000000', 0.2); g.fillRect(x - 330, y - 230, 660, 260); }
}
function drawTower(g, G, B, tw) {
  if (B.x > W + 360) return;
  const c = B.col, x = B.x + tw.ox, base = B.ground + B.sink, t = G.vt;
  const k = tw.rubble ? clamp(1 - tw.rubble * 1.5, 0.32, 1) : 1, h = tw.h * k, w = tw.w, top = base - h;
  g.save();
  const sg = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  sg.addColorStop(0, mix(c.stone, c.rim, 0.25)); sg.addColorStop(0.45, c.stone); sg.addColorStop(1, c.dark);
  g.fillStyle = sg;
  if (tw.rubble) {
    g.beginPath(); g.moveTo(x - w / 2 - 6, base);
    for (let i = 0; i <= 6; i++) g.lineTo(x - w / 2 + (i / 6) * w, top + ((i * 37) % 23) - 6);
    g.lineTo(x + w / 2 + 6, base); g.closePath(); g.fill();
  } else {
    g.fillRect(x - w / 2, top, w, h);
    // crenellations and a corbel ring
    g.fillRect(x - w / 2 - 5, top - 4, w + 10, 8);
    for (let i = 0; i < 4; i++) g.fillRect(x - w / 2 - 5 + i * (w + 10 - 12) / 3, top - 18, 12, 15);
    // masonry lines
    g.strokeStyle = rgba('#000000', 0.22); g.lineWidth = 1;
    for (let y = top + 14; y < base; y += 13) { g.beginPath(); g.moveTo(x - w / 2, y); g.lineTo(x + w / 2, y); g.stroke(); }
    g.fillStyle = rgba(c.rim, 0.5); g.fillRect(x - w / 2, top, 3, h);
    // the keep's spire and every tower's flag
    if (tw.i === 1) {
      g.fillStyle = c.roof; g.beginPath(); g.moveTo(x - w * 0.36, top - 18); g.lineTo(x, top - 18 - w * 0.75); g.lineTo(x + w * 0.36, top - 18); g.fill();
      g.fillStyle = rgba(c.rim, 0.35); g.beginPath(); g.moveTo(x - w * 0.36, top - 18); g.lineTo(x, top - 18 - w * 0.75); g.lineTo(x - w * 0.1, top - 18); g.fill();
    }
    const fy = top - (tw.i === 1 ? 18 + w * 0.75 : 18), fl = 26;
    g.strokeStyle = '#2a1420'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, fy); g.lineTo(x, fy - 26); g.stroke();
    g.fillStyle = c.flag; g.beginPath(); g.moveTo(x, fy - 26);
    for (let i = 0; i <= 6; i++) { const u = i / 6; g.lineTo(x + u * fl, fy - 26 + Math.sin(t * 6 - u * 4 + tw.i) * 2.5 * u + u * 2); }
    for (let i = 6; i >= 0; i--) { const u = i / 6; g.lineTo(x + u * fl, fy - 14 + Math.sin(t * 6 - u * 4 + tw.i) * 2.5 * u - u * 2); }
    g.fill();
    // windows (lit at sunset)
    if (B.lit) for (const wy of [0.3, 0.78]) { g.fillStyle = c.lit; g.fillRect(x - 3, top + h * wy - 5, 6, 9); addGlow(g, x, top + h * wy, 14, c.lit, 0.55); }
    // gun port: glows while the mortar charges (the weak spot)
    const py = base - tw.h * 0.58;
    g.fillStyle = '#12060e'; g.beginPath(); g.moveTo(x - 12, py + 10); g.lineTo(x - 12, py - 2); g.arc(x, py - 2, 12, Math.PI, 0); g.lineTo(x + 12, py + 10); g.fill();
    if (tw.charge > 0) {
      addGlow(g, x, py, 26 + tw.charge * 30, '#ff8a2a', 0.5 + tw.charge * 0.5);
      g.fillStyle = rgba('#ffd27a', 0.6 + 0.4 * tw.charge); g.beginPath(); g.arc(x, py + 1, 6 * tw.charge + 2, 0, 7); g.fill();
    }
    // cracks with damage
    const d = 1 - tw.hp / tw.maxHp;
    if (d > 0.3) {
      g.strokeStyle = rgba('#0a0208', 0.6); g.lineWidth = 2; g.beginPath();
      g.moveTo(x - w * 0.2, top + 6); g.lineTo(x - w * 0.05, top + h * 0.25); g.lineTo(x - w * 0.22, top + h * 0.4);
      if (d > 0.6) { g.moveTo(x + w * 0.3, top + h * 0.5); g.lineTo(x + w * 0.1, top + h * 0.7); g.lineTo(x + w * 0.28, base - 8); }
      g.stroke();
    }
    if (tw.hurt) { g.fillStyle = rgba('#ffffff', 0.35 * tw.hurt); g.fillRect(x - w / 2, top, w, h); }
  }
  g.restore();
  if (tw.rubble || tw.hp < tw.maxHp * 0.45) {
    const a = tw.rubble ? 1 : 0.6;
    paintSmoke(g, x, top - 10, 7, 14, '#3a2034', tw.i * 7 + 3, 1.6, -0.6, 0.45 * a);
    paintFire(g, x, top + 6, w * 0.6, 34 * a, tw.i * 5 + 1, a, t);
  }
}
function updateFortress(G, B, dt) {
  // slide in
  if (B.x > B.tx) B.x = Math.max(B.tx, B.x - dt * Math.max(80, (B.x - B.tx) * 1.1));
  const arrived = B.x <= B.tx + 4;
  const towers = B.parts.filter((p) => p.kind === 'tower');
  for (const tw of towers) { tw.update(G); tw.floor = arrived || !tw.alive ? 0 : tw.maxHp; }
  const live = towers.filter((p) => p.alive);
  for (const tw of towers) if (tw.rubble) tw.rubble += dt;
  if (!live.length) {
    if (!B.dying) {
      startDeath(G, B, B.x, B.ground - 60);
      for (const s of B.escorts) if (s.alive) damage(G, s, s.hp + 1, { kind: 'sunk', quiet: true, noBounty: true });
    }
    B.sink += dt * 14;
    B.boom = (B.boom || 0) - dt;
    if (B.boom <= 0 && B.dying < DEATH - 0.6) {
      B.boom = 0.28;
      const x = B.x + rnd(G, -240, 240), y = B.ground - rnd(G, 0, 120);
      spawn(G, 'explosion', x, y, { size: 45 * rnd(G, 0.8, 1.6) }); emit('explode', { x, y, size: 1 });
    }
    B.aim = [B.x, B.ground - 80];
    return;
  }
  // aim point: the weakest tower's gun port
  let focus = live[0]; for (const tw of live) if (tw.hp < focus.hp) focus = tw;
  B.aim = [B.x + focus.ox, B.ground - focus.h * 0.58];
  if (!arrived) return;
  const p = G.player, rate = 1 / Math.sqrt(G.diff) * (B.lit ? 0.85 : 1);
  for (const tw of live) {
    tw.fireT -= dt;
    if (tw.fireT < 0.95 && tw.charge === 0 && p && B.t - (B.lastShot ?? -9) < 1.4) tw.fireT = 0.95 + rnd(G, 0.2, 0.8);  // one gun at a time
    if (tw.fireT < 0.95 && tw.charge === 0 && p) {
      B.lastShot = B.t + 0.95;
      tw.charge = 0.001;
      tw.tx = clamp(p.x + rnd(G, -70, 70), PLAYER_X.min - 20, PLAYER_X.max + 20);
      hazard(B, { kind: 'mortar', x: tw.tx, w: REACH, t: 0.95, hold: 0, col: '#ff8a3a' });
    }
    if (tw.charge > 0) tw.charge = Math.min(1, tw.charge + dt / 0.95);
    if (tw.fireT <= 0) {
      const x = B.x + tw.ox, y = B.ground - tw.h - 10;
      shoot(G, B, x, y, tw.tx, null, { kind: 'mortar', T: 1.9, radius: LOB_R, dmg: Math.round(8 * Math.pow(G.diff, 0.65)) });
      tw.charge = 0;
      tw.fireT = (5 + rnd(G, 0, 2)) * rate * (live.length === 1 ? 0.6 : 1);
    }
  }
  // escorts
  B.next -= dt;
  const alive = B.escorts.filter((s) => s.alive).length;
  if (B.next <= 0 || (B.t > 2 && !B.sent)) {
    B.sent = true;
    if (alive < B.esc) escort(G, B, B.lit && G.rng() < 0.4 ? 'brig' : 'sloop', W + 120 + rnd(G, 0, 120));
    B.next = 22 - Math.min(6, G.diff * 2);
  }
}

// ================================================================ serpent
function initSerpent(G, B) {
  const hp = Math.round(2600 * G.diff);
  B.sx = 830; B.rise = 0; B.mode = 'rise'; B.mt = 0; B.next = 2.2; B.diveT = 14;
  B.head = { x: 905, y: 206, tilt: 0.42, open: 0.3, s: 120 };
  B.reach = 0; B.target = [400, 480]; B.back = [0, 0]; B.wake = null; B.arch = null; B.lungeLayer = false;
  const S = part({ kind: 'serpent', hp, maxHp: hp, bounty: 400, layer: 'far',
    hitTest(x, y, r) {
      if (!this.alive || B.rise < 0.55 || B.trans > 0) return 0;
      const hc = headCentre(B);
      if (Math.hypot(x - hc[0], y - hc[1]) < 62 + r) return 2;
      if (tubeHit(B.neck, B.neckR, x, y, r)) return 1;
      for (const c of B.coils) if (tubeHit(c.pts, c.rad, x, y, r)) return 1;
      if (B.arch && B.arch.up > 0.5 && tubeHit(B.arch.pts, B.arch.rad, x, y, r)) return 1;
      return 0;
    },
    draw(g) { if (!B.lungeLayer) drawSerpent(g, G, B, false); },
    onDeath() { if (this._dead) return; this._dead = true; this.alive = false; const h = headCentre(B); startDeath(G, B, h[0], h[1]); } });
  B.S = S; B.intro = true; S.floor = hp;
  serpentGeo(G, B);
  B.parts.push(S); G.enemies.push(S);
  const front = decor('front', (g) => { if (B.lungeLayer) drawSerpent(g, G, B, true); drawArch(g, G, B); });
  const wake = decor('far', (g) => drawWake(g, G, B));
  B.decor.push(front, wake); G.enemies.splice(G.enemies.length - 1, 0, wake);
  G.enemies.push(front);
}
const headCentre = (B) => serpentHeadPoint(B.head.x, B.head.y, B.head.s, B.head.tilt, 0.5, -0.05);
function serpentGeo(G, B) {
  const t = G.vt, drop = (1 - smooth(clamp(B.rise, 0, 1))) * 470 + (B.dying ? smooth(Math.min(1, B.dying / DEATH)) * 470 : 0);
  const base = [B.sx, LANE_Y + 30 + drop];
  const rest = [B.sx + 72 + Math.sin(t * 0.9) * 12 + B.back[0], 208 + drop + Math.sin(t * 1.3) * 8 + B.back[1]];
  const r = smooth(clamp(B.reach, 0, 1));
  const hx = lerp(rest[0], B.target[0], r), hy = lerp(rest[1], B.target[1], r);
  const restTilt = 0.42 + Math.sin(t * 0.8) * 0.05 - B.back[1] * 0.004;
  const lt = Math.atan2(B.target[1] - rest[1], rest[0] - B.target[0]);
  B.head.x = hx; B.head.y = hy; B.head.tilt = lerp(restTilt, clamp(lt, -0.2, 1.1), r);
  const p1 = [base[0] - 50, base[1] - 210], p2 = [hx + 60 + r * 200, hy + 120 - r * 190], p3 = [hx - 5, hy + 4];
  B.neck = bez(base, p1, p2, p3, 34);
  B.neckR = (u) => lerp(46, 30, u);
  B.coils = [[B.sx + 220, 80, 70, 26], [B.sx + 380, 60, 48, 20]].map(([cx, rw, rh, rr], k) => {
    const pts = [], h = rh * (1 + 0.1 * Math.sin(t * 1.5 + k * 2)), sh = Math.sin(t * 0.7 + k) * 8;
    for (let i = 0; i <= 24; i++) { const a = Math.PI * (1 - i / 24); pts.push([cx + sh + Math.cos(a) * rw, LANE_Y + 20 + drop - Math.sin(a) * h]); }
    pts.reverse();
    return { pts, rad: () => rr };
  });
  if (B.arch) {
    const a = B.arch, up = smooth(clamp(a.up, 0, 1)), pts = [];
    for (let i = 0; i <= 20; i++) { const ang = Math.PI * (i / 20); pts.push([a.x + Math.cos(ang) * 84, laneY(G, a.x) + 30 - Math.sin(ang) * 130 * up]); }
    a.pts = pts; a.rad = () => 30;
  }
  const h = headCentre(B);
  B.aim = [h[0], h[1]];
  B.S.cx = h[0]; B.S.cy = h[1]; B.S.x = B.sx; B.S.y = LANE_Y;
}
function drawSerpent(g, G, B, front) {
  if (B.rise <= 0.01 && !B.dying) return;
  const t = G.vt, lo = G.quality === 'low', c = B.phase > 1 ? { ...SERPENT, fin: '#ff2f8a', spots: '#c8ffff' } : SERPENT;
  const paint = () => {
    for (const k of B.coils) paintBody(g, k.pts, k.rad, c, 'L', true, t, lo);
    paintBody(g, B.neck, B.neckR, c, 'L', true, t, lo);
  };
  if (front) aboveLane(g, G, paint, 6); else paint();
  const hurt = B.S.hurt;
  paintSerpentHead(g, B.head.x, B.head.y, B.head.s, B.head.tilt, c, B.head.open, t, { hurt, glare: B.mode === 'lunge' ? 1 : 0 });
  // water streaming off the neck as it rises
  if (B.rise > 0.3 && !lo) {
    g.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 26; i++) {
      const u = ((i * 0.618) % 1), p = B.neck[Math.floor(u * 30)], fall = ((t * 1.4 + i * 0.37) % 1);
      g.fillRect(p[0] - 30 + ((i * 53) % 60), p[1] + fall * 120, 1.5, 5 + (i % 5) * 2);
    }
  }
  if (B.mode === 'spit' && B.head.open > 0.6) {
    const m = serpentHeadPoint(B.head.x, B.head.y, B.head.s, B.head.tilt, 0.9, 0.12);
    addGlow(g, m[0], m[1], 30 + B.head.open * 30, '#c8ff3a', 0.8);
  }
}
function drawArch(g, G, B) {
  const a = B.arch; if (!a || !a.pts) return;
  const c = B.phase > 1 ? { ...SERPENT, fin: '#ff2f8a' } : SERPENT;
  aboveLane(g, G, () => paintBody(g, a.pts, a.rad, c, 'L', true, G.vt, G.quality === 'low'), 4);
}
function drawWake(g, G, B) {
  const w = B.wake; if (!w) return;
  const y = LANE_Y - 34, t = G.vt;
  g.save();
  for (let i = 0; i < 6; i++) {
    const x = w.x + i * 26 * w.dir * -1, a = (1 - i / 6) * 0.7;
    g.strokeStyle = rgba('#ffffff', a); g.lineWidth = 2.5;
    g.beginPath(); g.ellipse(x, y + Math.sin(t * 6 + i) * 1.5, 24 + i * 6, 4 + i, 0, Math.PI * 0.05, Math.PI * 0.95); g.stroke();
  }
  g.fillStyle = rgba('#ffffff', 0.5); g.beginPath(); g.ellipse(w.x, y, 16, 5, 0, 0, 7); g.fill();
  g.restore();
}
function updateSerpent(G, B, dt) {
  const S = B.S, p = G.player, fast = B.phase > 1 ? 0.72 : 1;
  B.mt += dt;
  if (B.dying) {
    B.head.open = 0.9; B.reach = Math.max(0, B.reach - dt * 2); B.arch = null; B.wake = null; B.lungeLayer = false;
    serpentGeo(G, B);
    B.boom = (B.boom || 0) - dt;
    if (B.boom <= 0 && B.dying < DEATH - 0.8) { B.boom = 0.35; const h = headCentre(B); spawn(G, 'splash', h[0] + rnd(G, -80, 80), LANE_Y - 10, { size: 32 }); spawn(G, 'sparks', h[0], h[1], { n: 10 }); }
    return;
  }
  if (B.trans > 0) B.trans -= dt;
  // phase 2 at half health
  if (B.phase === 1 && S.hp <= S.maxHp * 0.5) {
    setPhase(G, B, 2); B.trans = 2.2; S.floor = Math.max(1, S.hp);
    B.mode = 'roar'; B.mt = 0; B.reach = 0; B.lungeLayer = false; B.arch = null; clearHazards(G, B);
    G.banner = { title: 'THE MISTCOIL RAGES', sub: 'PHASE 2', t: 0, life: 1.8 };
  }
  if (B.trans <= 0) S.floor = B.intro ? S.maxHp : 0;
  const m = B.mode;
  if (m === 'rise') {
    B.rise = Math.min(1, B.rise + dt / 1.4);
    B.head.open = 0.3 + 0.4 * B.rise;
    if (B.mt < 0.1 && !B.splashed) { B.splashed = true; spawn(G, 'splash', B.sx, LANE_Y - 20, { size: 44 }); spawn(G, 'splash', B.sx + 220, LANE_Y - 20, { size: 30 }); emit('splash', { x: B.sx, y: LANE_Y - 20, size: 3 }); emit('boss-roar', { kind: 'serpent' }); }
    if (B.rise >= 1) { B.mode = 'idle'; B.mt = 0; B.intro = false; }
  } else if (m === 'roar') {
    const k = clamp(B.mt / 2.2, 0, 1);
    B.back = [18 * Math.sin(k * Math.PI), -40 * Math.sin(k * Math.PI)]; B.head.open = 0.3 + 0.7 * Math.sin(k * Math.PI);
    if (k >= 1) { B.mode = 'idle'; B.mt = 0; B.next = 0.8; B.back = [0, 0]; }
  } else if (m === 'idle') {
    B.head.open = lerp(B.head.open, 0.35, dt * 3);
    B.next -= dt; B.diveT -= dt;
    if (B.next <= 0 && p) {
      if (B.diveT <= 0) { B.mode = 'dive'; B.mt = 0; B.diveT = (B.phase > 1 ? 10 : 15) + rnd(G, 0, 3); }
      else {
        const r = G.rng();
        if (B.phase > 1 && r < 0.3) startErupt(G, B);
        else if (r < (B.phase > 1 ? 0.62 : 0.6)) startSpit(G, B);
        else startLunge(G, B);
      }
    }
  } else if (m === 'spit') {
    const wind = 0.85 * fast;
    if (B.mt < wind) { const k = B.mt / wind; B.back = [22 * k, -26 * k]; B.head.open = 0.35 + 0.6 * k; }
    else if (!B.fired) {
      B.fired = true;
      const mth = serpentHeadPoint(B.head.x, B.head.y, B.head.s, B.head.tilt, 0.95, 0.12);
      for (const tx of B.spitX) shoot(G, B, mth[0], mth[1], tx, null, { kind: 'mortar', T: 1.25, radius: LOB_R, dmg: Math.round(9 * Math.pow(G.diff, 0.65)), look: 'venom' });
      spawn(G, 'spray', mth[0], mth[1], { col: '#c8ff3a', n: 12 });
    } else if (B.mt > wind + 0.5) { B.back = [B.back[0] * 0.9, B.back[1] * 0.9]; if (B.mt > wind + 0.9) toIdle(G, B, 1.6); }
  } else if (m === 'lunge') {
    const wind = 1.15 * fast, strike = 0.26, hold = 0.55, back = 0.6;
    if (B.mt < wind) { const k = B.mt / wind; B.back = [40 * k, -50 * k]; B.head.open = 0.4 + 0.5 * k; B.lungeLayer = false; }
    else if (B.mt < wind + strike) {
      B.lungeLayer = true; B.back = [0, 0];
      B.reach = (B.mt - wind) / strike; B.head.open = 0.95;
      if (B.reach >= 0.92 && !B.bit) {
        B.bit = true;
        spawn(G, 'splash', B.target[0], laneY(G, B.target[0]) - 6, { size: 36 }); emit('splash', { x: B.target[0], y: LANE_Y, size: 2 });
        if (p && Math.abs(p.x - B.target[0]) < REACH) hurtPlayer(G, Math.round(17 * Math.pow(G.diff, 0.65)), 'bite', B.target[0]);
      }
    } else if (B.mt < wind + strike + hold) { B.reach = 1; B.head.open = 0.5; }
    else if (B.mt < wind + strike + hold + back) { B.reach = 1 - (B.mt - wind - strike - hold) / back; B.head.open = 0.4; }
    else { B.reach = 0; B.lungeLayer = false; toIdle(G, B, 1.5); }
  } else if (m === 'dive') {
    if (B.mt < 1) { B.rise = 1 - B.mt; if (!B.dsplash) { B.dsplash = true; spawn(G, 'splash', B.sx, LANE_Y - 20, { size: 40 }); emit('splash', { x: B.sx, y: LANE_Y, size: 2 }); } }
    else if (!B.wake) {
      B.rise = 0;
      let nx = rnd(G, 690, 1000); if (Math.abs(nx - B.sx) < 150) nx = B.sx > 845 ? nx - 170 : nx + 170;
      B.wake = { x: B.sx + 200, to: clamp(nx, 680, 1010), dir: Math.sign(nx - B.sx) || 1 };
    } else if (B.mt < 2.8) {
      const k = (B.mt - 1) / 1.8; B.wake.x = lerp(B.sx + 200, B.wake.to, smooth(k));
    } else {
      B.sx = B.wake.to; B.wake = null; B.rise = 0; B.mode = 'rise'; B.mt = 0; B.splashed = false; B.dsplash = false;
    }
  } else if (m === 'erupt') {
    const wind = 1.35 * fast, a = B.arch;
    if (B.mt < wind) { a.up = 0; B.head.open = 0.7; }
    else if (B.mt < wind + 1.4) {
      a.up = Math.min(1, (B.mt - wind) / 0.22);
      if (!a.hit) {
        a.hit = true;
        spawn(G, 'splash', a.x, laneY(G, a.x) - 8, { size: 44 }); emit('splash', { x: a.x, y: LANE_Y, size: 3 });
        if (p && Math.abs(p.x - a.x) < REACH) hurtPlayer(G, Math.round(16 * Math.pow(G.diff, 0.65)), 'coil', a.x);
      }
    } else if (B.mt < wind + 1.9) a.up = 1 - (B.mt - wind - 1.4) / 0.5;
    else { B.arch = null; toIdle(G, B, 1.2); }
  }
  serpentGeo(G, B);
}
function toIdle(G, B, wait) { B.mode = 'idle'; B.mt = 0; B.fired = false; B.bit = false; B.next = wait * (B.phase > 1 ? 0.7 : 1) + rnd(G, 0, 0.8); }
function startSpit(G, B) {
  // one glob on you and the others a gap away on each side: step aside into a gap
  const px = G.player.x, n = B.phase > 1 ? 5 : 3;
  B.spitX = []; for (let i = 0; i < n; i++) B.spitX.push(clamp(px + (i - (n - 1) / 2) * SPREAD, 60, 660));
  B.mode = 'spit'; B.mt = 0; B.fired = false;
  hazard(B, { kind: 'spit', x: px, w: REACH, t: 0.85 * (B.phase > 1 ? 0.72 : 1), hold: 0, col: '#c8ff3a' });
}
function startLunge(G, B) {
  const tx = clamp(G.player.x + rnd(G, -20, 20), PLAYER_X.min, PLAYER_X.max);
  B.target = [tx, LANE_Y - 70]; B.mode = 'lunge'; B.mt = 0; B.bit = false;
  hazard(B, { kind: 'bite', x: tx, w: REACH, t: 1.15 * (B.phase > 1 ? 0.72 : 1) + 0.24, hold: 0.5 });
  emit('boss-roar', { kind: 'serpent', small: true });
}
function startErupt(G, B) {
  const tx = clamp(G.player.x, PLAYER_X.min, PLAYER_X.max);
  B.arch = { x: tx, up: 0 }; B.mode = 'erupt'; B.mt = 0;
  hazard(B, { kind: 'wake', x: tx, w: REACH, t: 1.35 * 0.72, hold: 1.2, col: '#9affff' });
}

// ================================================================ leviathan
const TENT = [
  // back-left, far: [base, idle p1, p2, p3], r0
  { layer: 'far', r0: 36, base: [500, 560], p: [[430, 330], [600, 180], [520, 120]], reach: [140, 520] },
  // back-right, far
  { layer: 'far', r0: 44, base: [1240, 560], p: [[1300, 300], [1120, 120], [1180, 60]], reach: [300, 560] },
  // front, reaching over the lane
  { layer: 'front', r0: 40, base: [560, 580], p: [[470, 300], [270, 150], [340, 230]], reach: [120, 470] },
];
function initLeviathan(G, B) {
  const H = Math.round(1250 * G.diff), T = Math.round(H * 0.1);
  B.H = H; B.top = 700; B.rise = 0; B.eyes = [0.3, 0.3]; B.weak = 0; B.maw = 0; B.charge = 0; B.rage = 0;
  B.next = 3.2; B.lock = 0; B.atk = null; B.pull = 0; B.whirl = 0; B.beam = null; B.summons = 0; B.phantoms = [];
  B.tents = [];
  // tentacles first so shots that cross one hit it before the head
  const back = [], front = [];
  TENT.forEach((d, i) => {
    const tp = part({ kind: 'tentacle', hp: T, maxHp: T, bounty: 60, layer: d.layer, d, i, st: 'idle', st_t: 0, rise: 0, pose: null,
      sink: 0, seed: i * 3 + 1,
      hitTest(x, y, r) { if (!this.alive || this.rise < 0.6 || !this.pts || B.trans > 0) return 0; return tubeHit(this.pts, this.rad, x, y, r) ? 1 : 0; },
      draw(g) { drawTentacle(g, G, B, this); },
      onDeath(G2) {
        if (this._dead) return; this._dead = true; this.alive = false; this.st = 'dead'; this.st_t = 0;
        const m = this.pts ? this.pts[20] : [this.d.base[0], 400];
        emit('sink', { x: m[0], y: m[1], kind: 'tentacle', boss: false }); emit('boss-roar', { kind: 'leviathan', small: true });
        spawn(G2, 'splash', this.d.base[0], LANE_Y - 10, { size: 40 }); spawn(G2, 'sparks', m[0], m[1], { n: 16, col: '#3affe0' });
        clearHazards(G2, B, (h) => h.src !== this);
        if (B.lock === this) B.lock = 0;
      } });
    tp.rad = tentacleRad(d.r0);
    B.tents.push(tp); B.parts.push(tp);
    (d.layer === 'front' ? front : back).push(tp);
  });
  const head = part({ kind: 'leviathan', hp: H, maxHp: H, bounty: 1200, layer: 'far',
    hitTest(x, y, r) {
      if (!this.alive || B.rise < 0.9 || B.trans > 0) return 0;
      if (B.phase >= 2) {
        const [ex, ey] = eyePos(B);
        const dx = (x - ex) / (52 + r), dy = (y - ey) / (30 + r);
        if (dx * dx + dy * dy < 1) return 2;
      }
      if (!leviathanHit(LEV.x, B.top, x, y)) return 0;
      return B.phase === 1 ? 0.25 : 0.5;
    },
    draw(g) { drawLevHead(g, G, B); },
    onDeath() { if (this._dead) return; this._dead = true; this.alive = false; const [ex, ey] = eyePos(B); startDeath(G, B, ex, ey); } });
  head.floor = Math.round(H * 0.8);
  B.head = head;
  const fx = decor('front', (g) => drawLevFront(g, G, B));
  const whirl = decor('lane', (g) => drawWhirl(g, G, B));
  B.decor.push(fx, whirl);
  B.parts.push(head);
  G.enemies.push(...back, head, whirl, ...front, fx);
}
const eyePos = (B) => [LEV.eyeL[0], LEV.eyeL[1] + (B.top - LEV.top)];
const mawPos = (B) => [LEV.maw[0], LEV.maw[1] + (B.top - LEV.top) - 10];
function tentPose(G, B, tp) {
  const d = tp.d, t = G.vt, k = tp.seed, ly = LANE_Y;
  const sw = tp.st === 'idle' || tp.st === 'rise' ? 1 : 0.3;
  const idle = [d.base, d.p[0],
    [d.p[1][0] + Math.sin(t * 0.8 + k) * 22 * sw, d.p[1][1] + Math.cos(t * 0.7 + k) * 14 * sw],
    [d.p[2][0] + Math.sin(t * 0.9 + k * 1.3) * 34 * sw, d.p[2][1] + Math.sin(t * 1.1 + k) * 20 * sw]];
  let pose = idle;
  const st = tp.st, s = tp.st_t;
  if (st === 'wind' || st === 'slam' || st === 'hold' || st === 'back') {
    const tx = tp.tx, base = d.base;
    const up = [base, [base[0], base[1] - 260], [lerp(base[0], tx, 0.6), 40], [tx + 30 * Math.sign(base[0] - tx), 90 + Math.sin(t * 9) * 6]];
    const down = [base, [base[0] + (tx - base[0]) * 0.1, base[1] - 230], [lerp(base[0], tx, 0.55), ly - 170], [tx, laneY(G, tx) - 14]];
    if (st === 'wind') pose = lerpPose(idle, up, smooth(clamp(s / 0.6, 0, 1)));
    else if (st === 'slam') pose = lerpPose(up, down, clamp(s / 0.2, 0, 1) ** 2);
    else if (st === 'hold') pose = down;
    else pose = lerpPose(down, idle, smooth(clamp(s / 0.7, 0, 1)));
  } else if (st === 'sweep' || st === 'swwind') {
    const [x0, x1] = tp.band, dir = tp.dir, from = dir > 0 ? x0 : x1, to = dir > 0 ? x1 : x0, base = d.base;
    const ready = [base, [base[0], base[1] - 240], [from + 80 * -dir, ly - 220], [from - 20 * dir, ly - 140]];
    if (st === 'swwind') pose = lerpPose(idle, ready, smooth(clamp(s / 0.7, 0, 1)));
    else {
      const u = clamp(s / 0.65, 0, 1), x = lerp(from, to, smooth(u));
      pose = [base, [base[0], base[1] - 200], [lerp(base[0], x, 0.5), ly - 170], [x, laneY(G, x) - 26]];
      tp.sweepX = x;
    }
  }
  // rise out of the sea / sink when dead
  const drop = (1 - smooth(clamp(tp.rise, 0, 1))) * 520 + (tp.st === 'dead' ? smooth(clamp(tp.st_t / 1.4, 0, 1)) * 560 : 0) + (B.dying ? smooth(clamp(B.dying / DEATH, 0, 1)) * 520 : 0);
  if (drop) pose = pose.map(([x, y]) => [x, y + drop]);
  tp.pose = pose;
  tp.pts = bez(pose[0], pose[1], pose[2], pose[3], 20);
  const m = tp.pts[9]; tp.cx = m[0]; tp.cy = m[1]; tp.x = d.base[0]; tp.y = LANE_Y;
}
const lerpPose = (a, b, k) => a.map((p, i) => [lerp(p[0], b[i][0], k), lerp(p[1], b[i][1], k)]);
function drawTentacle(g, G, B, tp) {
  if (!tp.pose || tp.gone) return;
  const p = tp.pose, c = tp.hurt ? { ...LEV_TENTACLE, base: mix(LEV_TENTACLE.base, '#ffffff', tp.hurt * 0.4) } : LEV_TENTACLE;
  const draw = () => paintTentacle(g, p[0], p[1], p[2], p[3], tp.d.r0, c, tp.seed, 1, G.vt);
  if (tp.layer === 'front') aboveLane(g, G, draw, 4); else draw();
}
function drawLevHead(g, G, B) {
  const dying = B.dying ? clamp(B.dying / DEATH, 0, 1) : 0;
  const shake = (B.trans > 0 || dying) ? Math.sin(G.vt * 40) * 3 : 0;
  paintLeviathan(g, { x: LEV.x + shake, top: B.top, t: G.vt, eyes: dying ? [B.eyes[0] * (1 - dying), B.eyes[1] * (1 - dying)] : B.eyes, weak: B.weak,
    maw: B.maw, charge: B.charge, rage: B.rage, hurt: B.head.hurt, lo: G.quality === 'low' });
  // water pouring off as it rises
  if (G.quality !== 'low' && B.rise > 0.2) {
    const t = G.vt;
    for (let i = 0; i < 30; i++) {
      const x = 580 + ((i * 197) % 580); if (Math.abs(x - 860) < 190) continue;
      const fall = (t * 0.9 + i * 0.137) % 1, y0 = B.top + 160 + ((i * 71) % 180) + fall * 120;
      g.strokeStyle = `rgba(230,220,255,${(0.15 + (i % 4) * 0.08) * (1 - fall)})`; g.lineWidth = 1 + (i % 3);
      g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 + 20 + (i % 5) * 10); g.stroke();
    }
  }
}
function drawLevFront(g, G, B) {
  // phantom slams (phase 3): tentacles that are not hittable
  for (const ph of B.phantoms) {
    const k = ph.k, base = [ph.bx, LANE_Y + 40], tx = ph.tx;
    const up = [base, [base[0], base[1] - 240], [lerp(base[0], tx, 0.6), 60], [tx + 20, 110]];
    const down = [base, [base[0] + (tx - base[0]) * 0.1, base[1] - 220], [lerp(base[0], tx, 0.55), LANE_Y - 160], [tx, laneY(G, tx) - 12]];
    const rise = smooth(clamp(ph.t / 0.5, 0, 1)), sink = smooth(clamp((ph.t - ph.end) / 0.6, 0, 1));
    let pose = ph.t < ph.wind ? lerpPose(up, up, 0) : ph.t < ph.wind + 0.2 ? lerpPose(up, down, ((ph.t - ph.wind) / 0.2) ** 2) : down;
    const drop = (1 - rise) * 500 + sink * 520;
    pose = pose.map(([x, y]) => [x, y + drop]);
    aboveLane(g, G, () => paintTentacle(g, pose[0], pose[1], pose[2], pose[3], 34, GHOST_TENTACLE, ph.seed, 1, G.vt), 4);
    void k;
  }
  // the charge beam
  const bm = B.beam;
  if (bm) {
    const [mx, my] = mawPos(B), y1 = laneY(G, bm.x) - 6, t = G.vt;
    if (bm.st === 'charge') {
      g.save(); g.strokeStyle = rgba('#ff3a5a', 0.3 + 0.4 * Math.abs(Math.sin(t * 16))); g.lineWidth = 2; g.setLineDash([14, 10]); g.lineDashOffset = -t * 120;
      g.beginPath(); g.moveTo(mx, my); g.lineTo(bm.x, y1); g.stroke(); g.restore();
    } else {
      const w = 22 + Math.sin(t * 40) * 4, op = g.globalCompositeOperation;
      g.globalCompositeOperation = 'lighter';
      g.lineCap = 'round';
      for (const [lw, col, a] of [[w * 2.6, '#ff2a6a', 0.25], [w * 1.4, '#ff8a4a', 0.55], [w * 0.6, '#fff6d0', 0.95]]) {
        g.strokeStyle = rgba(col, a); g.lineWidth = lw; g.beginPath(); g.moveTo(mx, my); g.lineTo(bm.x, y1); g.stroke();
      }
      softGlow(g, bm.x, y1, 120, '#ff6a3a', 0.9); softGlow(g, mx, my, 90, '#fff0c0', 0.9);
      g.globalCompositeOperation = op;
    }
  }
}
function drawWhirl(g, G, B) {
  const a = B.whirl; if (a <= 0.01) return;
  const cx = 640, cy = laneY(G, 640) + 8, t = G.vt;
  g.save();
  g.translate(cx, cy); g.scale(1, 0.2);
  g.fillStyle = rgba('#05021a', 0.45 * a); g.beginPath(); g.arc(0, 0, 70, 0, 7); g.fill();
  for (let i = 0; i < 7; i++) {
    const r0 = 30 + i * 32, rot = -t * (2.6 - i * 0.25) + i;
    g.strokeStyle = rgba(i % 2 ? '#ff7ab8' : '#c8b0ff', (0.55 - i * 0.06) * a); g.lineWidth = 5 - i * 0.4;
    g.beginPath(); g.arc(0, 0, r0, rot, rot + 2.4); g.stroke();
    g.beginPath(); g.arc(0, 0, r0 + 12, rot + Math.PI, rot + Math.PI + 1.8); g.stroke();
  }
  g.restore();
}
function updateLeviathan(G, B, dt) {
  const head = B.head, p = G.player, fast = B.phase === 3 ? 0.7 : 1;
  // rising
  if (B.rise < 1) {
    B.rise = Math.min(1, B.rise + dt / 3.4);
    B.top = lerp(720, LEV.top, smooth(B.rise));
    if (!B.risen) { B.risen = true; emit('boss-roar', { kind: 'leviathan' }); spawn(G, 'splash', 700, LANE_Y - 30, { size: 60 }); spawn(G, 'splash', 1040, LANE_Y - 30, { size: 60 }); }
  } else B.top = LEV.top + Math.sin(G.vt * 0.6) * 6 - (B.trans > 0 ? Math.sin(clamp(B.trans / 2.5, 0, 1) * Math.PI) * 24 : 0);
  for (const tp of B.tents) {
    tp.st_t += dt;
    if (tp.st !== 'dead') tp.rise = Math.min(1, tp.rise + dt / (2.2 + tp.i * 0.4) * (B.rise > 0.3 ? 1 : 0));
    else if (tp.st_t > 1.6) tp.gone = true;
    if (tp.alive) tp.floor = tp.rise < 1 || B.rise < 1 ? tp.maxHp : 0;
    if (!tp.gone) tentPose(G, B, tp);
  }
  if (B.dying) {
    const k = clamp(B.dying / DEATH, 0, 1);
    B.top = LEV.top + smooth(k) * 560; B.whirl = Math.max(0, B.whirl - dt); B.beam = null; B.charge = 0; B.maw = 1 - k;
    B.boom = (B.boom || 0) - dt;
    if (B.boom <= 0 && k < 0.8) { B.boom = 0.22; const x = rnd(G, 600, 1130), y = B.top + rnd(G, 60, 300); spawn(G, 'explosion', x, y, { size: 45 * rnd(G, 1, 2) }); spawn(G, 'sparks', x, y, { n: 12, col: '#3affe0' }); emit('explode', { x, y, size: 1.5 }); }
    for (const s of B.escorts) if (s.alive) damage(G, s, s.hp + 1, { kind: 'sunk', quiet: true, noBounty: true });
    B.phantoms = [];
    return;
  }
  if (B.trans > 0) { B.trans -= dt; B.maw = 0.5 + 0.5 * Math.sin(B.trans * 6); }
  // phase changes
  const liveT = B.tents.filter((tp) => tp.alive);
  if (B.phase === 1 && !liveT.length) {
    setPhase(G, B, 2); B.trans = 2.5; head.floor = head.hp; B.next = 2.8; B.lock = 0; B.p2t = B.t;
    G.banner = { title: 'ITS EYE OPENS', sub: 'PHASE 2 · AIM FOR THE EYE', t: 0, life: 2.2 };
  } else if (B.phase === 2 && head.hp <= B.H * 0.45) {
    setPhase(G, B, 3); B.trans = 2.5; head.floor = head.hp; B.next = 2.6; B.atk = null; B.charge = 0;
    G.banner = { title: 'THE MAELSTROM WAKES', sub: 'PHASE 3 · SAIL AGAINST THE PULL', t: 0, life: 2.2 };
  }
  if (B.trans <= 0) head.floor = B.phase === 1 ? Math.round(B.H * 0.8) : 0;
  // eyes and mood
  const wantEyes = B.phase === 1 ? [0.32, 0.32] : B.phase === 2 ? [1, 0.45] : [1, 1];
  B.eyes = B.eyes.map((e, i) => lerp(e, wantEyes[i], dt * 2));
  B.weak = lerp(B.weak, B.phase >= 2 && B.trans <= 0 ? 1 : 0, dt * 3);
  B.rage = lerp(B.rage, B.phase === 3 ? 1 : 0, dt * 1.5);
  if (!B.trans) B.maw = lerp(B.maw, B.atk?.glow ?? 0.2, dt * 5);
  // whirlpool drag (phase 3)
  B.whirl = lerp(B.whirl, B.phase === 3 && B.trans <= 0 ? 1 : 0, dt * 0.8);
  if (B.whirl > 0.05 && p && p.alive) {
    const pull = 62 * B.whirl * (0.85 + 0.15 * Math.sin(G.vt * 1.7));
    p.x = clamp(p.x + pull * dt, PLAYER_X.min, PLAYER_X.max);
  }
  head.x = LEV.x; head.y = LANE_Y;
  [head.cx, head.cy] = B.phase >= 2 ? eyePos(B) : [LEV.x, B.top + 210];
  // aim point
  if (B.phase === 1) {
    let best = null;
    for (const tp of liveT) if (tp.rise > 0.6 && (!best || (tp.st === 'hold' && best.st !== 'hold') || (best.st !== 'hold' && tp.i === 2))) best = tp;
    if (best && best.pts) { const m = best.pts[best.st === 'hold' ? 12 : 9]; B.aim = [m[0], m[1]]; } else B.aim = eyePos(B);
  } else B.aim = eyePos(B);
  // phantom slams
  for (const ph of B.phantoms) {
    ph.t += dt;
    if (!ph.hit && ph.t >= ph.wind + 0.2) {
      ph.hit = true; spawn(G, 'splash', ph.tx, LANE_Y - 10, { size: 40 }); emit('splash', { x: ph.tx, y: LANE_Y, size: 3 });
      if (p && Math.abs(p.x - ph.tx) < REACH) hurtPlayer(G, Math.round(15 * Math.pow(G.diff, 0.65)), 'slam', ph.tx);
    }
  }
  B.phantoms = B.phantoms.filter((ph) => ph.t < ph.end + 0.6);
  if (B.rise < 1 || B.trans > 0) return;
  // tentacle slams and sweeps
  for (const tp of liveT) tentacleAct(G, B, tp);
  if (B.phase === 1) {
    B.next -= dt;
    if (B.next <= 0 && !B.lock && p) {
      const ready = liveT.filter((tp) => tp.st === 'idle' && tp.rise >= 1);
      if (ready.length) {
        const front = ready.find((tp) => tp.i === 2);
        const tp = front && G.rng() < 0.3 ? front : ready[(G.rng() * ready.length) | 0];
        if (tp.i === 2 && G.rng() < 0.45) startSweep(G, B, tp); else startSlam(G, B, tp);
        B.next = (liveT.length === 1 ? 2.4 : 3.3) + rnd(G, 0, 1.2);
      }
    }
    return;
  }
  // phase 2 and 3: the maw
  if (B.phase === 2 && B.summons < 1 && B.t - B.p2t > 4) {
    B.summons++;
    escort(G, B, 'brig', W + 100, { ghost: true, hpMul: G.diff * 0.6, bountyMul: 0.5 }); escort(G, B, 'sloop', W + 260, { ghost: true, hpMul: G.diff * 0.6, bountyMul: 0.5 });
    emit('boss-roar', { kind: 'leviathan', small: true });
  }
  const atk = B.atk;
  if (atk) {
    atk.t += dt;
    if (atk.kind === 'bolts') {
      atk.glow = clamp(atk.t / atk.wind, 0, 1);
      if (atk.t >= atk.wind && !atk.done) {
        atk.done = true;
        const [mx, my] = mawPos(B);
        for (const tx of atk.xs) shoot(G, B, mx, my, tx, null, { kind: 'mortar', T: 1.2, radius: LOB_R, dmg: Math.round(9 * Math.pow(G.diff, 0.65)), look: 'bolt', col: '#ff6aa8' });
      }
      if (atk.t > atk.wind + 0.5) B.atk = null;
    } else if (atk.kind === 'spit') {
      atk.glow = clamp(atk.t / atk.wind, 0, 1);
      if (atk.t >= atk.wind && !atk.done) {
        atk.done = true;
        const [mx, my] = mawPos(B);
        shoot(G, B, mx, my, atk.tx, null, { kind: 'mortar', T: 1.5, radius: LOB_R + 4, dmg: Math.round(14 * Math.pow(G.diff, 0.65)), look: 'spit' });
      }
      if (atk.t > atk.wind + 0.4) B.atk = null;
    } else if (atk.kind === 'beam') {
      const bm = B.beam;
      if (atk.t < atk.wind) { B.charge = atk.t / atk.wind; atk.glow = 1; bm.st = 'charge'; }
      else if (atk.t < atk.wind + 1.7) {
        if (bm.st !== 'fire') { bm.st = 'fire'; emit('boss-roar', { kind: 'leviathan', beam: true }); emit('explode', { x: bm.x, y: LANE_Y, size: 2 }); }
        B.charge = 1;
        if (p) bm.x = clamp(bm.x + clamp(p.x - bm.x, -1, 1) * 70 * dt, p.x + 1, PLAYER_X.max + 60);
        bm.tick -= dt;
        if (bm.tick <= 0) { bm.tick = 0.25; spawn(G, 'splash', bm.x, LANE_Y - 10, { size: 24 }); if (p && Math.abs(p.x - bm.x) < REACH) hurtPlayer(G, Math.round(5 * Math.pow(G.diff, 0.65)), 'beam', bm.x); }
        if (bm.zone) { bm.zone.x = bm.x; bm.zone.t = 0; }
      } else { B.beam = null; B.charge = 0; B.atk = null; }
    }
    return;
  }
  B.next -= dt;
  if (B.next > 0 || !p) return;
  const r = G.rng();
  if (B.phase === 3 && r < 0.3 && B.t - (B.lastBeam || -99) > 9) startBeam(G, B);
  else if (B.phase === 3 && r < 0.55) {
    const tx = clamp(p.x + rnd(G, -30, 30), PLAYER_X.min, PLAYER_X.max);
    const ph = { tx, bx: tx < 330 ? tx + 260 : tx - 200, t: 0, wind: 1.25, end: 2.6, hit: false, seed: rnd(G, 0, 9) };
    B.phantoms.push(ph);
    hazard(B, { kind: 'slam', x: tx, w: REACH, t: ph.wind + 0.2, hold: 0.6 });
    B.next = 1.4;
  } else if (r < (B.phase === 3 ? 0.82 : 0.7)) {
    const n = B.phase === 3 ? 5 : 3, xs = [];
    for (let i = 0; i < n; i++) xs.push(clamp(p.x + (i - (n - 1) / 2) * SPREAD, 60, 660));
    B.atk = { kind: 'bolts', t: 0, wind: 0.9 * fast, xs, glow: 0 };
    hazard(B, { kind: 'spit', x: p.x, w: REACH, t: B.atk.wind, hold: 0, col: '#ff6aa8' });
    B.next = 2.6 * fast + rnd(G, 0, 0.8);
  } else {
    B.atk = { kind: 'spit', t: 0, wind: 1.0 * fast, tx: p.x, glow: 0 };
    hazard(B, { kind: 'spit', x: p.x, w: REACH, t: B.atk.wind, hold: 0, col: '#ffb03a' });
    B.next = 2.8 * fast + rnd(G, 0, 0.8);
  }
}
function startBeam(G, B) {
  // it lands just beside you on the whirlpool's side and creeps after you: sail away from the pull
  const tx = clamp(G.player.x + 36, PLAYER_X.min, PLAYER_X.max + 60);
  B.lastBeam = B.t;
  B.beam = { x: tx, st: 'charge', tick: 0 };
  B.beam.zone = hazard(B, { kind: 'beam', x: tx, w: REACH, t: 1.6, hold: 1.7, col: '#ff3a5a' });
  B.atk = { kind: 'beam', t: 0, wind: 1.6, glow: 1 };
  B.next = 3.2;
}
function startSlam(G, B, tp) {
  const [lo, hi] = tp.d.reach;
  tp.tx = clamp(G.player.x + rnd(G, -25, 25), lo, hi);
  tp.st = 'wind'; tp.st_t = 0; B.lock = tp; tp.hit = false;
  hazard(B, { kind: 'slam', x: tp.tx, w: REACH, t: 1.3 + 0.2, hold: 0.9, src: tp });
}
function startSweep(G, B, tp) {
  const px = G.player.x, left = px < 340;
  tp.band = left ? [110, 370] : [300, 570];
  tp.dir = left ? 1 : -1;
  tp.st = 'swwind'; tp.st_t = 0; B.lock = tp; tp.hits = false;
  hazard(B, { kind: 'band', x: (tp.band[0] + tp.band[1]) / 2, w: (tp.band[1] - tp.band[0]) / 2, t: 1.55 + 0.3, hold: 0.4, dir: tp.dir, safe: left ? 1 : -1, src: tp });
}
function tentacleAct(G, B, tp) {
  const p = G.player, s = tp.st_t;
  if (tp.st === 'wind' && s >= 1.3) { tp.st = 'slam'; tp.st_t = 0; }
  else if (tp.st === 'slam' && s >= 0.2) {
    tp.st = 'hold'; tp.st_t = 0;
    spawn(G, 'splash', tp.tx, LANE_Y - 10, { size: 44 }); emit('splash', { x: tp.tx, y: LANE_Y, size: 3 }); emit('explode', { x: tp.tx, y: LANE_Y, size: 0.5 });
    if (p && Math.abs(p.x - tp.tx) < REACH) hurtPlayer(G, Math.round(12 * Math.pow(G.diff, 0.65)), 'slam', tp.tx);
  } else if (tp.st === 'hold' && s >= 0.9) { tp.st = 'back'; tp.st_t = 0; }
  else if (tp.st === 'back' && s >= 0.7) { tp.st = 'idle'; tp.st_t = 0; if (B.lock === tp) B.lock = 0; }
  else if (tp.st === 'swwind' && s >= 1.55) { tp.st = 'sweep'; tp.st_t = 0; spawn(G, 'splash', tp.band[tp.dir > 0 ? 0 : 1], LANE_Y - 10, { size: 32 }); }
  else if (tp.st === 'sweep') {
    if (!tp.hits && p && tp.sweepX != null && Math.abs(p.x - tp.sweepX) < REACH) { tp.hits = true; hurtPlayer(G, Math.round(12 * Math.pow(G.diff, 0.65)), 'sweep', tp.sweepX); }
    if (s >= 0.3 && ((s * 10) | 0) % 2 === 0 && tp.sweepX != null) spawn(G, 'spray', tp.sweepX, LANE_Y - 14, { n: 4 });
    if (s >= 0.75) { tp.st = 'back'; tp.st_t = 0; tp.tx = tp.sweepX ?? tp.band[0]; }
  }
}
// Exposed for the kraken and the HUD: the live boss parts and the aim point.
export function bossParts(G) { return G.enc?.B ? G.enc.B.parts.filter((p) => p.alive) : []; }
