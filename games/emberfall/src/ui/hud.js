// Emberfall HUD, drawn over the play scene in 1280 x 720 screen px (ported from
// the concept's hud()): health flames (flicker, burst when one is lost), the
// ember energy bar, shards, ability badges, the minimap, the area name, banners
// (G.banner: ability gained, boss title cards, lore tablets, biome names), the
// boss bar and "▲ Rest / ▲ Read" prompts over things the player is near.
// hudButtons: #btn-pause and #btn-map (the minimap itself), sized for thumbs.
import { W, H, BIOMES, BOSSES } from '../config.js';
import { clamp } from '../util.js';
import { rr, glow, additive, flameIcon, crystalIcon, abilityBadge, abilityList, iconButton, text, wrap, BOSS_EPITHET, ABIL, TAU, SERIF, SANS, INK, rgba, clock } from './kit.js';
import { drawMiniMap } from './map.js';
import { knowRooms } from '../save.js';

const MINI = [W - 196, 20, 176, 104];
const PAUSE = [MINI[0] - 92, 16, 84, 84];

// HUD memory between frames (purely visual).
const S = { last: 0, hp: null, maxHp: 0, sparks: [], flash: [], room: null, biome: null, areaT: 9, area: '', card: null, shards: null, boss: null, bossShown: 1, ghost: 1 };

export function hudButtons(G) {
  return [
    { id: 'btn-pause', action: 'pause', rect: PAUSE, label: 'Pause' },
    { id: 'btn-map', action: 'map', rect: MINI, label: 'Map' },
  ];
}

export function drawHud(g, G) {
  const p = G.player; if (!p || !G.room) return;
  knowRooms(G.world);
  const t = clock(), dt = clamp(t - S.last, 0, 0.1); S.last = t;
  track(G, dt);
  g.save(); g.textBaseline = 'alphabetic';
  prompts(g, G, t);
  // top-left wash so the flames read on any background
  const pg = g.createLinearGradient(0, 0, 380, 0); pg.addColorStop(0, 'rgba(8,4,12,0.62)'); pg.addColorStop(1, 'rgba(8,4,12,0)');
  g.fillStyle = pg; g.fillRect(0, 0, 380, 120);
  if (p.hp <= 1 && p.hp > 0) { // last flame: a slow red pulse at the edges
    const a = 0.22 + 0.12 * Math.sin(t * 4);
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95); vg.addColorStop(0, 'rgba(120,0,0,0)'); vg.addColorStop(1, `rgba(120,10,0,${a})`);
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }
  flames(g, G, p, t, dt);
  energy(g, p, t);
  crystalIcon(g, 38, 100, 10);
  text(g, String(Math.round(S.shards)), 56, 107, { font: `bold 21px ${SANS}`, color: '#ffe6c8', align: 'left', shadow: 4 });
  badges(g, G, p);
  area(g, t, dt);
  drawMiniMap(g, G, ...MINI);
  iconButton(g, { rect: PAUSE }, 'pause', G.ui.hover === 'btn-pause');
  if (G.boss) bossBar(g, G, dt); else S.boss = null;
  banner(g, G);
  g.restore();
}

// ------------------------------------------------------------ bookkeeping
function track(G, dt) {
  const p = G.player, r = G.room;
  if (S.hp == null || p.maxHp !== S.maxHp && S.hp > p.hp) S.hp = p.hp;
  if (p.hp < S.hp) for (let i = Math.max(0, p.hp); i < S.hp; i++) burst(flameX(i), 54);
  S.hp = p.hp; S.maxHp = p.maxHp;
  if (r.id !== S.room) {
    if (S.room !== null && r.def?.name && r.def.name !== S.area) { S.area = r.def.name; S.areaT = 0; }
    else if (S.room === null) S.area = r.def?.name || '';
    if (S.biome && r.biome !== S.biome && !G.banner) S.card = { title: BIOMES[r.biome]?.name || r.biome, t: 0, life: 3.2 };
    S.room = r.id; S.biome = r.biome;
  }
  S.areaT += dt;
  if (S.card) { S.card.t += dt; if (S.card.t > S.card.life || G.banner) S.card = null; }
  const sh = G.prog.shards;
  S.shards = S.shards == null || Math.abs(sh - S.shards) > 500 ? sh : S.shards + (sh - S.shards) * Math.min(1, dt * 8);
  if (Math.abs(sh - S.shards) < 0.5) S.shards = sh;
}
const flameX = (i) => 40 + i * 36;
function burst(x, y) {
  for (let i = 0; i < 16; i++) {
    const a = Math.random() * TAU, v = 60 + Math.random() * 160;
    S.sparks.push({ x, y: y - 14, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 0.5 + Math.random() * 0.4, t: 0, c: Math.random() < 0.5 ? '#ffb347' : '#ff4a1c' });
  }
  S.flash.push({ x, y: y - 14, t: 0 });
}

// ------------------------------------------------------------ parts
function flames(g, G, p, t, dt) {
  const max = Math.max(1, p.maxHp | 0);
  for (let i = 0; i < max; i++) {
    const lit = i < p.hp, last = lit && p.hp === 1;
    flameIcon(g, flameX(i), 54, 16, lit, t + i * 0.7, last ? 0.65 + 0.35 * Math.sin(t * 7) : 1);
  }
  additive(g, () => {
    for (const f of S.flash) { f.t += dt; const k = f.t / 0.35; g.strokeStyle = rgba('#ffe0a0', Math.max(0, 1 - k)); g.lineWidth = 3; g.beginPath(); g.arc(f.x, f.y, 6 + k * 34, 0, TAU); g.stroke(); }
    for (const s of S.sparks) {
      s.t += dt; s.vy += 420 * dt; s.x += s.vx * dt; s.y += s.vy * dt;
      const a = Math.max(0, 1 - s.t / s.life); glow(g, s.x, s.y, 7, s.c, a); g.fillStyle = rgba('#ffffff', a); g.fillRect(s.x - 1, s.y - 1, 2, 2);
    }
  });
  S.flash = S.flash.filter((f) => f.t < 0.35); S.sparks = S.sparks.filter((s) => s.t < s.life);
}

function energy(g, p, t) {
  const e = clamp((p.energy ?? 0) / (p.maxEnergy || 100), 0, 1), x = 26, y = 70, w = 190;
  g.fillStyle = 'rgba(0,0,0,0.6)'; rr(g, x, y, w, 11, 5.5); g.fill();
  if (e > 0.01) {
    const eg = g.createLinearGradient(x, 0, x + w, 0); eg.addColorStop(0, '#ff3a14'); eg.addColorStop(1, '#ffd36a');
    g.fillStyle = eg; rr(g, x + 1, y + 1, (w - 2) * e, 9, 4.5); g.fill();
    additive(g, () => glow(g, x + 1 + (w - 2) * e, y + 5, 16 + Math.sin(t * 8) * 2, '#ffd36a', 0.8));
  }
  // the Fire Form threshold
  if (p.form !== 'fire') { g.fillStyle = 'rgba(255,230,200,0.35)'; g.fillRect(x + w * 0.3, y + 1, 1.5, 9); }
  g.strokeStyle = 'rgba(255,200,150,0.35)'; g.lineWidth = 1; rr(g, x, y, w, 11, 5.5); g.stroke();
}

function badges(g, G, p) {
  const list = abilityList();
  if (!list.some((a) => G.prog.abilities[a.id])) return;
  const e = p.energy ?? 0;
  list.forEach((a, i) => {
    const own = !!G.prog.abilities[a.id];
    let state = own ? 'lit' : 'none', sel = false;
    if (own && a.id === 'fire-form') { sel = p.form === 'fire'; if (!sel && e < 30) state = 'dim'; }
    if (own && a.id === 'ember-dash') { sel = p.state === 'dash'; if (p.dashReady === false) state = 'dim'; }
    if (own && a.id === 'chain-hook') sel = !!p.hooked;
    if (own && a.id === 'root-grip') sel = !!p.onWall && !p.onGround;
    abilityBadge(g, 44 + i * 46, H - 42, 18, a, state, sel);
  });
}

function area(g, t, dt) {
  const k = S.areaT, a = k < 0.6 ? k / 0.6 : k < 3 ? 1 : Math.max(0, 1 - (k - 3) / 0.8);
  if (a > 0 && S.area) {
    g.save(); g.globalAlpha = a;
    text(g, S.area, W / 2, 38, { font: `italic 22px ${SERIF}`, color: 'rgba(255,236,210,0.85)', shadow: 8 });
    const lw = 130 * (0.6 + 0.4 * Math.min(1, k / 0.8));
    g.strokeStyle = 'rgba(255,200,150,0.4)'; g.lineWidth = 1; g.beginPath(); g.moveTo(W / 2 - lw, 50); g.lineTo(W / 2 + lw, 50); g.stroke();
    g.restore();
  }
  if (S.card) titleCard(g, S.card.title, '', S.card.t, S.card.life);
}

function fade(t, life, i = 0.5, o = 0.8) { return clamp(Math.min(t / i, (life - t) / o), 0, 1); }

function titleCard(g, title, sub, t, life) {
  const a = fade(t, life, 0.7, 1);
  g.save(); g.globalAlpha = a;
  const y = 200 + (1 - a) * 8;
  additive(g, () => glow(g, W / 2, y - 18, 300, '#ff8a3a', 0.12));
  text(g, title, W / 2, y, { font: `56px ${SERIF}`, color: INK, shadow: 18, spacing: 4 });
  const lw = 220 * Math.min(1, t / 1.2);
  g.strokeStyle = 'rgba(255,200,150,0.5)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(W / 2 - lw, y + 22); g.lineTo(W / 2 + lw, y + 22); g.stroke();
  if (sub) text(g, sub, W / 2, y + 56, { font: `italic 24px ${SERIF}`, color: 'rgba(255,220,195,0.85)', shadow: 8 });
  g.restore();
}

function banner(g, G) {
  const b = G.banner; if (!b) return;
  const t = b.t || 0, life = b.life || 3;
  if (b.kind === 'ability') return abilityCard(g, b, t, life);
  if (b.kind === 'boss') return bossCard(g, b, t, life);
  if (b.kind === 'lore') return loreCard(g, b, t, life);
  titleCard(g, b.title || '', b.sub || '', t, life);
}

function abilityCard(g, b, t, life) {
  const a = fade(t, life, 0.5, 0.9), info = ABIL[b.id] || { glyph: 'fire', c: '#ffb347' };
  g.save(); g.globalAlpha = a;
  const band = g.createLinearGradient(0, 120, 0, 460); band.addColorStop(0, 'rgba(6,3,10,0)'); band.addColorStop(0.5, 'rgba(6,3,10,0.6)'); band.addColorStop(1, 'rgba(6,3,10,0)');
  g.fillStyle = band; g.fillRect(0, 120, W, 340);
  const cy = 240, pop = 1 + 0.25 * Math.max(0, 1 - t / 0.4);
  additive(g, () => { glow(g, W / 2, cy, 220 * pop, info.c, 0.35); glow(g, W / 2, cy, 90, '#ffffff', 0.15 * Math.max(0, 1 - t)); });
  for (let i = 0; i < 12; i++) { // rays
    const ang = i / 12 * TAU + t * 0.3, r0 = 64, r1 = 110 + 14 * Math.sin(t * 3 + i);
    g.strokeStyle = rgba(info.c, 0.35); g.lineWidth = 2; g.beginPath(); g.moveTo(W / 2 + Math.cos(ang) * r0, cy + Math.sin(ang) * r0); g.lineTo(W / 2 + Math.cos(ang) * r1, cy + Math.sin(ang) * r1); g.stroke();
  }
  abilityBadge(g, W / 2, cy, 54 * pop, info, 'lit', true);
  text(g, 'A GIFT OF THE FLAME', W / 2, 340, { font: `bold 16px ${SANS}`, color: rgba(info.c, 0.95), spacing: 4 });
  text(g, b.title || '', W / 2, 390, { font: `bold 48px ${SERIF}`, color: INK, shadow: 16 });
  if (b.sub) text(g, b.sub, W / 2, 430, { font: `22px ${SANS}`, color: 'rgba(255,230,210,0.85)', shadow: 6 });
  g.restore();
}

function bossCard(g, b, t, life) {
  const a = fade(t, life, 0.6, 1);
  g.save(); g.globalAlpha = a;
  const y = 250;
  const band = g.createLinearGradient(0, y - 90, 0, y + 70); band.addColorStop(0, 'rgba(20,0,0,0)'); band.addColorStop(0.5, 'rgba(20,0,0,0.55)'); band.addColorStop(1, 'rgba(20,0,0,0)');
  g.fillStyle = band; g.fillRect(0, y - 90, W, 160);
  const bossId = Object.keys(BOSSES).find((id) => b.title === BOSSES[id].name);
  const sub = b.sub || (bossId ? BOSS_EPITHET[bossId] : '');
  g.save(); g.shadowColor = '#ff3a0a'; g.shadowBlur = 24;
  text(g, (b.title || '').toUpperCase(), W / 2, y, { font: `bold 46px ${SERIF}`, color: '#ffe2b8', spacing: 10 });
  g.restore();
  const lw = 300 * Math.min(1, t / 1);
  g.strokeStyle = 'rgba(255,120,60,0.6)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(W / 2 - lw, y + 20); g.lineTo(W / 2 + lw, y + 20); g.stroke();
  if (sub) text(g, sub, W / 2, y + 52, { font: `italic 24px ${SERIF}`, color: 'rgba(255,210,180,0.85)' });
  g.restore();
}

function loreCard(g, b, t, life) {
  const a = fade(t, life, 0.35, 0.6);
  const body = b.text || b.sub || '', font = `italic 23px ${SERIF}`;
  const lines = wrap(g, body, 600, font).slice(0, 8);
  const pw = 680, ph = 70 + lines.length * 32 + (b.title ? 34 : 0), px = (W - pw) / 2, py = H - 150 - ph;
  g.save(); g.globalAlpha = a;
  g.fillStyle = 'rgba(16,10,20,0.88)'; rr(g, px, py, pw, ph, 14); g.fill();
  g.strokeStyle = 'rgba(255,190,140,0.5)'; g.lineWidth = 1.5; g.stroke();
  rr(g, px + 7, py + 7, pw - 14, ph - 14, 10); g.strokeStyle = 'rgba(255,190,140,0.15)'; g.stroke();
  let y = py + 50;
  if (b.title) { text(g, b.title, W / 2, y - 6, { font: `bold 20px ${SERIF}`, color: '#ffd8a0', spacing: 2 }); y += 34; }
  for (const l of lines) { text(g, l, W / 2, y, { font, color: 'rgba(255,236,215,0.92)' }); y += 32; }
  g.restore();
}

function bossBar(g, G, dt) {
  const b = G.boss, f = clamp(b.hp / (b.maxHp || 1), 0, 1);
  if (S.boss !== b.id) { S.boss = b.id; S.bossShown = 0; S.ghost = f; }
  S.bossShown = Math.min(1, S.bossShown + dt * 1.5);
  S.ghost = S.ghost > f ? Math.max(f, S.ghost - dt * 0.35) : f;
  const a = S.bossShown, bw = 600 * a, x = W / 2 - bw / 2, y = H - 40;
  g.save(); g.globalAlpha = Math.min(1, a * 1.5);
  g.save(); g.shadowColor = '#ff3a0a'; g.shadowBlur = 18;
  text(g, (b.name || BOSSES[b.id]?.name || '').toUpperCase(), W / 2, H - 74, { font: `bold 24px ${SERIF}`, color: '#ffe2b8', spacing: 6 });
  g.restore();
  const epi = BOSS_EPITHET[b.id];
  if (epi) text(g, epi, W / 2, H - 52, { font: `italic 16px ${SERIF}`, color: 'rgba(255,210,180,0.75)' });
  g.fillStyle = 'rgba(0,0,0,0.65)'; rr(g, x, y, bw, 14, 7); g.fill();
  if (S.ghost > f) { g.fillStyle = 'rgba(255,240,200,0.4)'; rr(g, x + 2, y + 2, (bw - 4) * S.ghost, 10, 5); g.fill(); }
  if (f > 0) {
    const gr = g.createLinearGradient(x, 0, x + bw, 0); gr.addColorStop(0, '#ff2a0a'); gr.addColorStop(1, '#ffb347');
    g.fillStyle = gr; rr(g, x + 2, y + 2, (bw - 4) * f, 10, 5); g.fill();
  }
  // phase marks: the thresholds (if the boss lists them) and the current phase as pips
  for (const th of b.thresholds || []) { g.fillStyle = 'rgba(255,240,220,0.6)'; g.fillRect(x + bw * th - 1, y - 3, 2, 20); }
  g.strokeStyle = 'rgba(255,200,150,0.5)'; g.lineWidth = 1; rr(g, x, y, bw, 14, 7); g.stroke();
  const n = Math.max(b.phases || 0, b.phase || 1);
  for (let i = 0; i < n; i++) {
    const px = x + bw + 18 + i * 16, py = y + 7, on = i < (b.phase || 1);
    g.fillStyle = on ? '#ff8a3a' : 'rgba(255,200,150,0.25)';
    g.beginPath(); g.moveTo(px, py - 6); g.lineTo(px + 5, py); g.lineTo(px, py + 6); g.lineTo(px - 5, py); g.closePath(); g.fill();
  }
  g.restore();
}

function prompts(g, G, t) {
  const cx = G.cam.x + (G.cam.sx || 0), cy = G.cam.y + (G.cam.sy || 0);
  for (const e of G.room.ents || []) {
    if (!e.near || e.taken) continue;
    const label = e.prompt || (e.t === 'brazier' ? '▲ Rest' : e.t === 'lore' ? '▲ Read' : null);
    if (!label) continue;
    const x = e.x + (e.w || 0) / 2 - cx, y = e.y - cy - 26 + Math.sin(t * 3) * 3;
    g.save(); g.font = `bold 20px ${SANS}`;
    const w = g.measureText(label).width + 30;
    g.fillStyle = 'rgba(12,8,18,0.78)'; rr(g, x - w / 2, y - 20, w, 36, 18); g.fill();
    g.strokeStyle = 'rgba(255,200,140,0.6)'; g.lineWidth = 1.2; g.stroke();
    g.restore();
    text(g, label, x, y + 5, { font: `bold 20px ${SANS}`, color: INK });
  }
}
