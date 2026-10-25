// Tidebreaker: the in-play HUD, ported from the concept's hud() and bossBar():
// ship panel (badge, hull bar, crew pips), gold and voyage track, the ability
// buttons with cooldown sweeps, the boss bar, the leg banner, the aim reticle
// and the pause / mute buttons. hudButtons(G) gives the clickable rects that
// main.js turns into transparent DOM buttons; the painted ones line up with them.
import { W, H, LEGS, SHIP_NAME, SERIF } from '../config.js';
import { layer } from '../gfx.js';
import { paintShip, STYLES } from '../ships.js';
import { panel, bar, coin, ICON, GOLD, CREAM, sans, text, rr, glow, rgba } from './kit.js';

export const ABILITY_SLOTS = [
  { id: 'broadside', icon: 'cannon', key: '␣', col: '#ffd36a', cd: 'reload', label: 'Fire broadside (Space or click)' },
  { id: 'chain', icon: 'chain', key: 'Q', col: '#d8dce8', cd: 'cdChain', label: 'Chain Shot (Q)' },
  { id: 'fire', icon: 'fire', key: 'E', col: '#ff7a1f', cd: 'cdFire', label: 'Fire Barrels (E)' },
  { id: 'lightning', icon: 'bolt', key: 'R', col: '#7fe0ff', cd: 'cdLightning', label: 'Lightning Masts (R)' },
  { id: 'kraken', icon: 'kraken', key: 'F', col: '#ff6ad5', cd: 'cdKraken', label: 'Kraken Ally (F)' },
];
const AB_R = 30, AB_Y = H - 54, AB_GAP = 84;
const abX = (i) => W / 2 - (ABILITY_SLOTS.length - 1) * AB_GAP / 2 + i * AB_GAP;
const SMALL = 36, SMALL_Y = 118;
const RECT = {
  'btn-mute': [W - 18 - SMALL, SMALL_Y, SMALL, SMALL],
  'btn-pause': [W - 18 - SMALL * 2 - 8, SMALL_Y, SMALL, SMALL],
};

const owned = (G, id) => id === 'broadside' || (G.stats?.[id] || 0) > 0;

export function hudButtons(G) {
  const out = ABILITY_SLOTS.map((a, i) => ({
    id: `ab-${a.id}`, action: a.id === 'broadside' ? 'fire' : 'ability', arg: a.id === 'broadside' ? undefined : a.id,
    rect: [abX(i) - AB_R - 2, AB_Y - AB_R - 2, AB_R * 2 + 4, AB_R * 2 + 14], label: owned(G, a.id) ? a.label : `${a.label}: locked`,
    disabled: !owned(G, a.id),
  }));
  out.push({ id: 'btn-pause', action: 'pause', rect: RECT['btn-pause'], label: 'Pause (P or Esc)' });
  out.push({ id: 'btn-mute', action: 'mute', rect: RECT['btn-mute'], label: G.prefs?.muted ? 'Sound on (M)' : 'Mute (M)' });
  return out;
}

// ------------------------------------------------------------- state for smooth numbers
const vis = { hp: null, ghost: 1, gold: 0, run: null };
let badge = null;
function shipBadge() {
  if (badge) return badge;
  badge = layer(136, 136); const b = badge.getContext('2d');
  b.scale(2, 2);
  b.beginPath(); b.arc(34, 34, 34, 0, 7);
  const gr = b.createLinearGradient(0, 0, 0, 68); gr.addColorStop(0, '#2a1d6a'); gr.addColorStop(0.55, '#d24a8a'); gr.addColorStop(0.62, '#3a2a8a'); gr.addColorStop(1, '#1b2f6a');
  b.fillStyle = gr; b.fill(); b.save(); b.clip();
  glow(b, 46, 36, 22, '#ffcf6a', 0.8);
  try { paintShip(b, 34, 50, 0, 26, 1, STYLES.player, {}, 0); } catch (e) { /* painter not ready */ }
  b.restore();
  return badge;
}

export function drawHud(g, G) {
  const p = G.player, st = G.stats, t = G.vt;
  if (!p || !G.run) return;
  if (vis.run !== G.run) { vis.run = G.run; vis.hp = null; vis.gold = G.run.gold; }

  // ---------------------------------------------- left: the ship
  panel(g, 18, 16, 330, 92);
  g.drawImage(shipBadge(), 28, 28, 68, 68);
  g.beginPath(); g.arc(62, 62, 34, 0, 7); g.strokeStyle = GOLD; g.lineWidth = 3; g.stroke();
  text(g, SHIP_NAME.toUpperCase(), 108, 40, 15, CREAM, sans({ spacing: 1.5 }));
  const frac = Math.max(0, p.hp / p.maxHp);
  vis.hp = vis.hp == null ? frac : vis.hp;
  vis.ghost = frac > vis.ghost ? frac : Math.max(frac, vis.ghost - 0.25 * (1 / 60));
  const low = frac < 0.3;
  bar(g, 108, 50, 225, 22, frac, low ? '#ff3f5a' : '#2fe08a', low ? '#ffb03a' : '#c8ff5a', `HULL ${Math.max(0, Math.ceil(p.hp))} / ${Math.round(p.maxHp)}`, vis.ghost);
  if (low && p.alive) { g.save(); g.globalAlpha = 0.25 + 0.25 * Math.sin(t * 8); rr(g, 108, 50, 225, 22, 11); g.strokeStyle = '#ff5a5a'; g.lineWidth = 2; g.stroke(); g.restore(); }
  const crew = Math.ceil(frac * 8);
  for (let i = 0; i < 8; i++) { g.beginPath(); g.arc(116 + i * 17, 88, 6, 0, 7); g.fillStyle = i < crew ? GOLD : 'rgba(255,255,255,0.18)'; g.fill(); }
  text(g, 'CREW', 260, 93, 12, CREAM, sans({ spacing: 1 }));

  // ---------------------------------------------- right: gold and the voyage
  panel(g, W - 330, 16, 312, 92);
  vis.gold += (G.run.gold - vis.gold) * 0.15; if (Math.abs(G.run.gold - vis.gold) < 0.5) vis.gold = G.run.gold;
  coin(g, W - 300, 48, 15);
  text(g, `${Math.round(vis.gold)}`, W - 276, 56, 24, '#ffe07a', sans({ weight: '900', stroke: 'rgba(0,0,0,0.5)', sw: 3 }));
  text(g, (G.legDef?.name || '').toUpperCase(), W - 34, 44, 12, '#9fdcff', sans({ align: 'right', spacing: 1.5 }));
  text(g, waveText(G), W - 34, 62, 12, CREAM, sans({ align: 'right', weight: '700', spacing: 1 }));
  voyageTrack(g, G, W - 304, 88);

  // ---------------------------------------------- abilities
  ABILITY_SLOTS.forEach((a, i) => ability(g, G, a, abX(i), AB_Y, t));

  // ---------------------------------------------- small buttons
  smallButton(g, RECT['btn-pause'], (x, y) => ICON.pause(g, x, y, 14), G.ui.hover === 'btn-pause');
  smallButton(g, RECT['btn-mute'], (x, y) => ICON.sound(g, x, y, 15, G.prefs?.muted), G.ui.hover === 'btn-mute');

  if (G.boss) bossBar(g, G);
  if (G.banner && G.scene === 'play') banner(g, G.banner);
  if (p.alive && G.scene === 'play') reticle(g, G);
}

function waveText(G) {
  const e = G.enc;
  if (!e) return '';
  if (e.type === 'fleet') {
    const n = Math.max(1, e.waves || 1), w = Math.min(n, Math.max(1, e.wave || 1));
    return `FLEET ${w} / ${n}`;
  }
  return { fortress: 'FORTRESS', serpent: 'SERPENT', leviathan: 'FINAL BOSS' }[e.type] || e.type.toUpperCase();
}

// Fifteen nodes in five legs; the final boss node is pink and larger.
function voyageTrack(g, G, x0, y) {
  const cur = G.stage, pos = [];
  let x = x0;
  LEGS.forEach((L, li) => L.nodes.forEach((type, ni) => { pos.push({ x, type, last: li === LEGS.length - 1 && ni === 2 }); x += ni === 2 ? 25 : 16; }));
  for (let i = 0; i < pos.length - 1; i++) {
    const a = pos[i], b = pos[i + 1];
    g.strokeStyle = i < cur ? GOLD : 'rgba(255,255,255,0.25)'; g.lineWidth = 2; g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(a.x + 5, y); g.lineTo(b.x - 5, y); g.stroke();
  }
  g.setLineDash([]);
  pos.forEach((n, i) => {
    const big = n.type !== 'fleet';
    const r = n.last ? 7.5 : big ? 5.5 : 4;
    g.beginPath(); g.arc(n.x, y, r, 0, 7);
    g.fillStyle = i < cur ? GOLD : i === cur ? '#ffffff' : n.last ? '#ff4f7a' : big ? 'rgba(255,140,190,0.55)' : 'rgba(255,255,255,0.25)';
    g.fill();
    if (i === cur) { g.strokeStyle = GOLD; g.lineWidth = 2; g.beginPath(); g.arc(n.x, y, r + 3.5, 0, 7); g.stroke(); }
  });
}

function ability(g, G, a, x, y, t) {
  const p = G.player, st = G.stats, have = owned(G, a.id);
  const hover = G.ui.hover === `ab-${a.id}`;
  const total = st[a.cd] || 1, cd = Math.max(0, p.cd?.[a.id] || 0), f = have ? Math.min(1, cd / total) : 0;
  const ready = have && cd <= 0;
  g.save();
  if (!have) g.globalAlpha = 0.55;
  if (ready && a.id !== 'broadside') glow(g, x, y, AB_R * 1.7, a.col, 0.28 + 0.1 * Math.sin(t * 4));
  g.beginPath(); g.arc(x, y, hover && have ? AB_R + 2 : AB_R, 0, 7); g.fillStyle = 'rgba(12,16,40,0.78)'; g.fill();
  g.lineWidth = 3; g.strokeStyle = have ? a.col : 'rgba(200,200,220,0.5)'; g.stroke();
  if (have) ICON[a.icon](g, x, y, AB_R * 0.55);
  else { g.globalAlpha = 0.35; ICON[a.icon](g, x, y, AB_R * 0.55); g.globalAlpha = 0.9; ICON.lock(g, x, y + 2, AB_R * 0.5); }
  if (f > 0) {
    g.beginPath(); g.moveTo(x, y); g.arc(x, y, AB_R - 2, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); g.closePath();
    g.fillStyle = 'rgba(0,0,0,0.58)'; g.fill();
    if (a.id !== 'broadside' && cd > 0.05) text(g, cd < 10 ? cd.toFixed(1) : `${Math.ceil(cd)}`, x, y + 1, 14, '#ffffff', sans({ align: 'center', base: 'middle', weight: '900', stroke: 'rgba(0,0,0,0.7)', sw: 3 }));
  }
  g.globalAlpha = have ? 1 : 0.7;
  rr(g, x - 11, y + AB_R - 10, 22, 20, 5); g.fillStyle = have ? GOLD : '#a8a0b8'; g.fill();
  text(g, a.key, x, y + AB_R + 1, a.key === '␣' ? 15 : 13, '#2a1a05', sans({ align: 'center', base: 'middle', weight: '900' }));
  const rank = st[a.id];
  if (a.id !== 'broadside' && rank > 1) text(g, 'I'.repeat(Math.min(3, rank)), x + AB_R - 2, y - AB_R + 8, 11, a.col, { font: SERIF, align: 'center', base: 'middle', stroke: 'rgba(0,0,0,0.7)', sw: 3 });
  g.restore();
}

function smallButton(g, [x, y, w, h], icon, hover) {
  rr(g, x, y, w, h, 10); g.fillStyle = hover ? 'rgba(40,26,90,0.8)' : 'rgba(12,16,40,0.6)'; g.fill();
  g.strokeStyle = hover ? 'rgba(255,214,120,0.95)' : 'rgba(255,214,120,0.6)'; g.lineWidth = 1.5; g.stroke();
  icon(x + w / 2, y + h / 2);
}

const BOSS_NAMES = { fortress: 'THE IRON FORTRESS', serpent: 'THE MISTCOIL SERPENT', leviathan: 'THE DROWNED LEVIATHAN' };
function bossBar(g, G) {
  const b = G.boss, v = b.maxHp ? Math.max(0, b.hp / b.maxHp) : 0;
  const name = (b.name || BOSS_NAMES[b.kind] || 'THE DEEP').toUpperCase();
  panel(g, W / 2 - 280, 16, 560, 70, 0.7);
  text(g, name, W / 2, 45, 21, '#ffd9f0', { align: 'center', spacing: 4, shadow: '#ff3fa8', blur: 12, oy: 0, weight: 'bold' });
  const pc = `${Math.ceil(v * 100)}%`;
  const sub = (b.phases || 1) > 1 ? `PHASE ${b.phase || 1} · ${pc}` : pc;
  bar(g, W / 2 - 260, 54, 520, 20, v, '#ff3f7a', '#b84dff', sub);
  // phase notches
  if ((b.phases || 1) > 1) for (let i = 1; i < b.phases; i++) {
    const nx = W / 2 - 258 + 516 * (1 - i / b.phases);
    g.fillStyle = 'rgba(255,230,250,0.75)'; g.fillRect(nx - 1, 52, 2, 6); g.fillRect(nx - 1, 70, 2, 6);
  }
}

function banner(g, B) {
  const a = Math.min(1, B.t / 0.35, (B.life - B.t) / 0.6);
  if (a <= 0) return;
  g.save(); g.globalAlpha = a;
  const y = 236 - (1 - Math.min(1, B.t / 0.35)) * 16;
  const gr = g.createLinearGradient(W / 2 - 360, 0, W / 2 + 360, 0);
  gr.addColorStop(0, 'rgba(12,16,40,0)'); gr.addColorStop(0.5, 'rgba(12,16,40,0.6)'); gr.addColorStop(1, 'rgba(12,16,40,0)');
  g.fillStyle = gr; g.fillRect(W / 2 - 360, y - 62, 720, B.sub ? 104 : 84);
  g.strokeStyle = 'rgba(255,214,120,0.6)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(W / 2 - 240, y - 62); g.lineTo(W / 2 + 240, y - 62); g.moveTo(W / 2 - 240, y + (B.sub ? 42 : 22)); g.lineTo(W / 2 + 240, y + (B.sub ? 42 : 22)); g.stroke();
  text(g, B.title.toUpperCase(), W / 2, y, 50, '#ffe08a', { align: 'center', spacing: 5, stroke: '#2a0a20', sw: 7, shadow: 'rgba(255,140,60,0.9)', blur: 22, oy: 0 });
  if (B.sub) text(g, B.sub, W / 2, y + 30, 15, '#ffd8ec', sans({ align: 'center', spacing: 4, weight: '700' }));
  g.restore();
}

function reticle(g, G) {
  const { x, y } = G.input.aim, t = G.vt;
  const total = G.stats.reload || 1, cd = Math.max(0, G.player.cd?.broadside || 0), f = 1 - Math.min(1, cd / total);
  g.save();
  g.strokeStyle = 'rgba(20,8,30,0.55)'; g.lineWidth = 4;
  g.beginPath(); g.arc(x, y, 15, 0, 7); g.stroke();
  g.strokeStyle = f >= 1 ? GOLD : 'rgba(255,230,180,0.55)'; g.lineWidth = 2;
  g.beginPath(); g.arc(x, y, 15, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); g.stroke();
  g.translate(x, y); g.rotate(t * 0.8);
  g.strokeStyle = f >= 1 ? '#fff4d0' : 'rgba(255,240,210,0.6)'; g.lineWidth = 2;
  for (let k = 0; k < 4; k++) { g.rotate(Math.PI / 2); g.beginPath(); g.moveTo(19, 0); g.lineTo(26, 0); g.stroke(); }
  g.restore();
  g.fillStyle = rgba('#fff4d0', 0.9); g.beginPath(); g.arc(x, y, 2, 0, 7); g.fill();
}
