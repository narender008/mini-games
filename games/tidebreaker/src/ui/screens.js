// Tidebreaker: the full screens painted over the world: title (concept
// 1-title.png: the TIDEBREAKER logo and menu), paused, lost, won and the
// Shipwright (meta upgrades bought with renown). screenButtons(G) gives the
// clickable rects for main.js's transparent button overlay.
import { W, H, LEGS, SERIF, SANS } from '../config.js';
import { UPGRADES } from '../upgrades.js';
import { META, metaCost } from '../save.js';
import { artFor } from './cards.js';
import { panel, pill, title, rule, dim, vignette, star, GOLD, CREAM, sans, text, rr, glow, rgba, fmtTime, fmtNum } from './kit.js';

const STAGES = LEGS.length * 3;

// ------------------------------------------------------------- layouts
const MENU_X = W - 320, MENU_Y = 396, MENU_W = 270, MENU_H = 48, MENU_GAP = 58;
const titleMenu = (G) => [
  { id: 'btn-start', action: 'start', label: 'SET SAIL', kind: 'gold' },
  { id: 'btn-shop', action: 'shop', label: 'SHIPWRIGHT' },
  { id: 'btn-mute', action: 'mute', label: G.prefs?.muted ? 'SOUND OFF' : 'SOUND ON' },
].map((b, i) => ({ ...b, rect: [MENU_X, MENU_Y + i * MENU_GAP, MENU_W, MENU_H] }));

const PANEL = [W / 2 - 330, 110, 660, 470];
const endButtons = () => [
  { id: 'btn-restart', action: 'restart', label: 'SAIL AGAIN', kind: 'gold', rect: [W / 2 - 250, 500, 240, 50] },
  { id: 'btn-menu', action: 'menu', label: 'MAIN MENU', rect: [W / 2 + 10, 500, 240, 50] },
];
const pauseButtons = (G) => [
  { id: 'btn-resume', action: 'resume', label: 'RESUME', kind: 'gold', rect: [W / 2 - 130, 330, 260, 50] },
  { id: 'btn-menu', action: 'menu', label: 'ABANDON VOYAGE', rect: [W / 2 - 130, 394, 260, 50] },
];
const TILE_W = 340, TILE_H = 176, TILE_GAP = 24, TILE_Y = 170;
const tileRect = (i) => {
  const x0 = W / 2 - (TILE_W * 3 + TILE_GAP * 2) / 2;
  return [x0 + (i % 3) * (TILE_W + TILE_GAP), TILE_Y + Math.floor(i / 3) * (TILE_H + TILE_GAP), TILE_W, TILE_H];
};
const shopButtons = (G) => [
  ...META.map((m, i) => {
    const cost = metaCost(G.meta, m.id);
    return { id: `buy-${m.id}`, action: 'buy', arg: m.id, rect: tileRect(i), data: { meta: m.id },
      label: cost == null ? `${m.name}: fully upgraded` : `Buy ${m.name} for ${cost} renown`,
      disabled: cost == null || G.meta.renown < cost };
  }),
  { id: 'btn-menu', action: 'menu', label: 'BACK TO HARBOUR', rect: [W / 2 - 140, H - 92, 280, 50] },
];

export function screenButtons(G) {
  const list = { title: titleMenu, paused: pauseButtons, lost: endButtons, won: endButtons, shop: shopButtons }[G.scene];
  return list ? list(G).map(({ kind, ...b }) => ({ label: b.label, ...b })) : [];
}

export function drawScreen(g, G) {
  const fn = { title: drawTitle, paused: drawPaused, lost: drawEnd, won: drawEnd, shop: drawShop }[G.scene];
  if (fn) fn(g, G);
}

function buttons(g, G, list, size = 20) {
  for (const b of list) pill(g, ...b.rect, b.label, b.kind || 'glass', { hover: G.ui.hover === b.id, disabled: b.disabled }, size);
}

// ------------------------------------------------------------- title
let logo = null;
function paintLogo() {
  const K = 1.5, c = document.createElement('canvas'); c.width = W * K; c.height = 240 * K;
  const g = c.getContext('2d'); g.scale(K, K);
  g.font = `bold 108px ${SERIF}`; g.textAlign = 'center'; if ('letterSpacing' in g) g.letterSpacing = '6px';
  g.shadowColor = 'rgba(255,90,160,0.9)'; g.shadowBlur = 40; g.fillStyle = '#ff6ab0'; g.fillText('TIDEBREAKER', W / 2, 150);
  g.shadowColor = 'transparent';
  g.lineWidth = 12; g.strokeStyle = '#1a0a30'; g.lineJoin = 'round'; g.strokeText('TIDEBREAKER', W / 2, 150);
  const gr = g.createLinearGradient(0, 70, 0, 155);
  gr.addColorStop(0, '#fffbe0'); gr.addColorStop(0.45, '#ffd34a'); gr.addColorStop(0.55, '#ff9a1f'); gr.addColorStop(1, '#ffcf6a');
  g.fillStyle = gr; g.fillText('TIDEBREAKER', W / 2, 150);
  g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,0.7)'; g.strokeText('TIDEBREAKER', W / 2, 148);
  return c;
}

function drawTitle(g, G) {
  if (!logo) logo = paintLogo();
  const t = G.vt;
  g.drawImage(logo, 0, 0, W, 240);
  // a glint sweeping across the logo now and then
  const sweep = ((t * 0.18) % 1.6) - 0.3;
  if (sweep > 0 && sweep < 1) {
    g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.35 * Math.sin(sweep * Math.PI);
    glow(g, 300 + sweep * 680, 112, 90, '#fff4c0', 1); g.restore();
  }
  rule(g, W / 2, 182, 330);
  text(g, 'A STORM-CHASING NAVAL ROGUELITE', W / 2, 215, 20, '#ffe8f4', sans({ align: 'center', spacing: 5, weight: '700', shadow: 'rgba(0,0,0,0.6)', blur: 6 }));

  const menu = titleMenu(G);
  buttons(g, G, menu, 22);
  // renown next to the Shipwright
  const shop = menu[1].rect, rn = G.meta?.renown || 0;
  if (rn > 0) {
    const cheapest = Math.min(...META.map((m) => metaCost(G.meta, m.id) ?? Infinity));
    star(g, shop[0] + shop[2] - 30, shop[1] + 2, 11);
    if (rn >= cheapest) { g.beginPath(); g.arc(shop[0] + shop[2] - 6, shop[1] + 4, 5, 0, 7); g.fillStyle = '#ff4f7a'; g.fill(); }
  }
  text(g, `${fmtNum(rn)} RENOWN`, MENU_X + MENU_W / 2, MENU_Y + MENU_GAP * 3 + 12, 13, 'rgba(255,232,200,0.75)', sans({ align: 'center', spacing: 2 }));

  // best voyage and controls
  const b = G.meta?.best || {};
  const best = G.meta?.runs
    ? `BEST VOYAGE  ·  ${b.wins ? `${b.wins} ${b.wins === 1 ? 'VICTORY' : 'VICTORIES'}${b.fastest ? `  ·  ${fmtTime(b.fastest)}` : ''}` : `STAGE ${Math.min(STAGES, b.stage + 1)} OF ${STAGES}`}  ·  SCORE ${fmtNum(b.score)}`
    : 'FIVE SEAS  ·  FIFTEEN BATTLES  ·  ONE LEVIATHAN';
  text(g, best, 40, H - 66, 14, 'rgba(255,232,244,0.85)', sans({ weight: '700', spacing: 2, shadow: 'rgba(0,0,0,0.6)', blur: 4 }));
  text(g, 'MOUSE AIM · CLICK FIRE · RIGHT-HOLD SAIL   ·   A/D SAIL · SPACE FIRE · Q E R F ABILITIES   ·   TOUCH: DRAG SHIP, TAP TO FIRE',
    40, H - 44, 11, 'rgba(255,232,244,0.6)', sans({ weight: '700', spacing: 1, shadow: 'rgba(0,0,0,0.6)', blur: 4 }));
}

// ------------------------------------------------------------- paused
function drawPaused(g, G) {
  dim(g, 0.55);
  const [x, y, w, h] = [W / 2 - 220, 170, 440, 300];
  panel(g, x, y, w, h, 0.82, 18);
  title(g, 'BECALMED', W / 2, 238, 44);
  text(g, 'The voyage waits for your word, captain.', W / 2, 272, 15, '#ffd8ec', sans({ align: 'center', weight: '600' }));
  if (G.run) {
    const s = `${(G.legDef?.name || '').toUpperCase()}  ·  STAGE ${G.stage + 1} / ${STAGES}  ·  ${fmtTime(G.t)}`;
    text(g, s, W / 2, 302, 12, '#9fdcff', sans({ align: 'center', spacing: 1.5 }));
  }
  buttons(g, G, pauseButtons(G), 18);
  if (G.run?.picks.length) upgradeStrip(g, G, W / 2, y + h + 34);
}

// The cards taken this voyage, as small chips.
function upgradeStrip(g, G, cx, y) {
  const ranks = Object.entries(G.run.upgrades).filter(([, r]) => r > 0);
  const items = ranks.map(([id, r]) => `${(UPGRADES[id]?.name || id).toUpperCase()}${r > 1 ? ` ${r}` : ''}`);
  const rows = [[]]; let rowW = 0;
  for (const it of items) { g.font = `800 11px ${SANS}`; const w = g.measureText(it).width + 22; if (rowW + w > 900) { rows.push([]); rowW = 0; } rows[rows.length - 1].push([it, w]); rowW += w + 6; }
  rows.forEach((row, ri) => {
    const tot = row.reduce((a, [, w]) => a + w + 6, -6);
    let x = cx - tot / 2;
    for (const [it, w] of row) {
      rr(g, x, y + ri * 30, w, 24, 12); g.fillStyle = 'rgba(12,16,40,0.7)'; g.fill(); g.strokeStyle = 'rgba(255,214,120,0.45)'; g.lineWidth = 1; g.stroke();
      text(g, it, x + w / 2, y + ri * 30 + 13, 11, CREAM, sans({ align: 'center', base: 'middle' }));
      x += w + 6;
    }
  });
}

// ------------------------------------------------------------- lost / won
function drawEnd(g, G) {
  const won = G.scene === 'won';
  const R = G.result || { renown: 0, parts: {}, stage: G.stage, kills: G.run?.kills || 0, gold: G.run?.gold || 0, score: G.run?.score || 0, time: G.t, bosses: 0 };
  dim(g, won ? 0.35 : 0.5, won ? '20,6,40' : '10,2,20');
  vignette(g, 0.7);
  const [x, y, w, h] = PANEL;
  panel(g, x, y, w, h, 0.8, 18);
  if (won) {
    g.save(); g.globalCompositeOperation = 'lighter'; glow(g, W / 2, y + 40, 260, '#ffb03a', 0.25 + 0.08 * Math.sin(G.vt * 2)); g.restore();
    title(g, 'VICTORY', W / 2, y + 74, 54);
    text(g, 'The Drowned Leviathan sinks into the Maelstrom.', W / 2, y + 108, 16, '#ffd8ec', sans({ align: 'center', weight: '600' }));
  } else {
    title(g, 'THE GULL HAS SUNK', W / 2, y + 72, 40, '#ffd0d8', 'rgba(255,60,90,0.9)');
    const where = LEGS[Math.min(LEGS.length - 1, Math.floor(R.stage / 3))]?.name || '';
    text(g, `Lost in ${where}, battle ${R.stage + 1} of ${STAGES}.`, W / 2, y + 108, 16, '#ffd8ec', sans({ align: 'center', weight: '600' }));
  }
  // stats grid
  const stats = [
    ['BATTLES', `${Math.min(STAGES, R.stage)} / ${STAGES}`], ['SHIPS SUNK', fmtNum(R.kills)], ['BOSSES', `${R.bosses ?? 0}`],
    ['SCORE', fmtNum(R.score)], ['GOLD', fmtNum(R.gold)], ['TIME', fmtTime(R.time)],
  ];
  stats.forEach(([k, v], i) => {
    const cx = x + 110 + (i % 3) * 220, cy = y + 160 + Math.floor(i / 3) * 70;
    text(g, k, cx, cy, 11, '#9fdcff', sans({ align: 'center', spacing: 2 }));
    text(g, v, cx, cy + 30, 26, '#fff1d0', sans({ align: 'center', weight: '900' }));
  });
  // renown
  const ry = y + 318;
  g.strokeStyle = 'rgba(255,214,120,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + 60, ry - 26); g.lineTo(x + w - 60, ry - 26); g.stroke();
  star(g, W / 2 - 92, ry - 6, 15);
  text(g, `+${fmtNum(R.renown)} RENOWN`, W / 2 - 70, ry + 2, 24, '#ffe07a', sans({ weight: '900', stroke: 'rgba(0,0,0,0.5)', sw: 3 }));
  const p = R.parts || {};
  const parts = [p.stage && `${p.stage} voyage`, p.kills && `${p.kills} plunder`, p.bosses && `${p.bosses} bosses`, p.win && `${p.win} victory`].filter(Boolean).join('  ·  ');
  if (parts) text(g, parts, W / 2, ry + 30, 12, 'rgba(255,232,200,0.7)', sans({ align: 'center', weight: '700', spacing: 1 }));
  const badges = [R.newBest && 'NEW BEST VOYAGE', R.fastest && 'FASTEST VICTORY'].filter(Boolean);
  badges.forEach((b, i) => {
    const bw = 190, bx = W / 2 - (badges.length * (bw + 10) - 10) / 2 + i * (bw + 10);
    const pulse = 0.85 + 0.15 * Math.sin(G.vt * 4);
    rr(g, bx, y - 16, bw, 30, 15); g.fillStyle = rgba('#ff4f9a', pulse); g.fill(); g.strokeStyle = '#ffe0f0'; g.lineWidth = 1.5; g.stroke();
    text(g, b, bx + bw / 2, y, 12, '#ffffff', sans({ align: 'center', base: 'middle', weight: '900', spacing: 2 }));
  });
  buttons(g, G, endButtons(), 20);
  text(g, `${fmtNum(G.meta?.renown)} renown to spend at the Shipwright`, W / 2, y + h + 34, 13, 'rgba(255,232,244,0.75)', sans({ align: 'center', weight: '700', spacing: 1 }));
}

// ------------------------------------------------------------- Shipwright
const META_ART = { hull: 'armor', gunners: 'cannons', maps: 'doubloons', charm: 'reload', veteran: 'gunners', figurehead: 'rigging' };
function drawShop(g, G) {
  dim(g, 0.6);
  vignette(g, 0.6);
  title(g, 'THE SHIPWRIGHT', W / 2, 78, 44);
  text(g, 'Renown earned at sea buys lasting improvements to the Gilded Gull.', W / 2, 112, 16, '#ffd8ec', sans({ align: 'center', weight: '600' }));
  // renown balance
  const rn = G.meta?.renown || 0;
  panel(g, W / 2 - 110, 124, 220, 36, 0.7, 18);
  star(g, W / 2 - 78, 142, 11);
  text(g, `${fmtNum(rn)} RENOWN`, W / 2 + 10, 148, 16, '#ffe07a', sans({ align: 'center', weight: '900', spacing: 1 }));

  const bought = G.ui.bought && G.vt - G.ui.bought.t < 0.8 ? G.ui.bought : null;
  shopButtons(G).forEach((b) => {
    if (b.action !== 'buy') return;
    const m = META.find((q) => q.id === b.arg);
    tile(g, G, m, b.rect, G.ui.hover === b.id, b.disabled, bought?.id === m.id ? 1 - (G.vt - bought.t) / 0.8 : 0);
  });
  const back = shopButtons(G).find((b) => b.id === 'btn-menu');
  pill(g, ...back.rect, back.label, 'glass', { hover: G.ui.hover === 'btn-menu' }, 18);
}

function tile(g, G, m, [x, y, w, h], hover, disabled, flash) {
  const rank = G.meta.upgrades[m.id] || 0, max = m.costs.length, cost = metaCost(G.meta, m.id);
  const can = cost != null && G.meta.renown >= cost;
  g.save();
  if (hover && can) g.translate(0, -4);
  if (hover && can) { g.shadowColor = 'rgba(255,190,90,0.7)'; g.shadowBlur = 28; }
  rr(g, x, y, w, h, 16);
  const bg = g.createLinearGradient(0, y, 0, y + h); bg.addColorStop(0, '#2a1d4a'); bg.addColorStop(1, '#130c2a');
  g.fillStyle = bg; g.fill(); g.shadowColor = 'transparent';
  g.lineWidth = hover && can ? 3 : 2; g.strokeStyle = rank >= max ? '#ffb22a' : can ? 'rgba(255,214,120,0.9)' : 'rgba(255,214,120,0.4)'; g.stroke();
  if (flash > 0) { g.save(); g.globalCompositeOperation = 'lighter'; glow(g, x + w / 2, y + h / 2, w * 0.6, '#ffd36a', flash * 0.6); g.restore(); }
  // art
  const art = artFor(META_ART[m.id] || 'heavy', 110, 110);
  g.save(); rr(g, x + 14, y + 14, 96, 96, 10); g.clip(); g.drawImage(art, x + 14 - 7, y + 14 - 7, 110, 110); g.restore();
  rr(g, x + 14, y + 14, 96, 96, 10); g.strokeStyle = 'rgba(255,214,120,0.6)'; g.lineWidth = 1.5; g.stroke();
  // words
  g.font = `bold 20px ${SERIF}`;
  const ns = g.measureText(m.name).width > w - 140 ? Math.floor(20 * (w - 140) / g.measureText(m.name).width) : 20;
  text(g, m.name, x + 124, y + 38, ns, '#fff1d0', { shadow: 'rgba(255,140,60,0.6)', blur: 8, oy: 0 });
  wrap(g, m.desc, x + 124, y + 60, w - 138, 13, '#d8d0f0');
  text(g, m.per, x + 124, y + 100, 11, '#ffd36a', sans({ spacing: 1 }));
  // rank pips
  for (let k = 0; k < max; k++) {
    g.beginPath(); g.arc(x + 22 + k * 16, y + 130, 5, 0, 7);
    g.fillStyle = k < rank ? GOLD : 'rgba(255,255,255,0.18)'; g.fill();
  }
  text(g, `RANK ${rank} / ${max}`, x + 22, y + 156, 11, 'rgba(255,232,200,0.7)', sans({ spacing: 1.5 }));
  // price
  const bx = x + w - 136, by = y + h - 50;
  rr(g, bx, by, 122, 36, 18);
  if (cost == null) { g.fillStyle = 'rgba(255,178,42,0.25)'; g.fill(); text(g, 'MAXED', bx + 61, by + 19, 14, '#ffd36a', sans({ align: 'center', base: 'middle', weight: '900', spacing: 2 })); }
  else {
    if (can) { const gg = g.createLinearGradient(bx, 0, bx + 122, 0); gg.addColorStop(0, '#ffd34a'); gg.addColorStop(1, '#ff7a3a'); g.fillStyle = gg; }
    else g.fillStyle = 'rgba(16,10,50,0.7)';
    g.fill(); if (!can) { g.strokeStyle = 'rgba(255,214,120,0.35)'; g.lineWidth = 1; g.stroke(); }
    star(g, bx + 24, by + 18, 9);
    text(g, fmtNum(cost), bx + 72, by + 19, 16, can ? '#2a0a20' : 'rgba(255,232,200,0.5)', sans({ align: 'center', base: 'middle', weight: '900' }));
  }
  g.restore();
}

function wrap(g, s, x, y, maxW, size, col) {
  g.font = `600 ${size}px ${SANS}`;
  const words = s.split(' '); let line = '', ly = y;
  for (const wd of words) {
    const tryL = line ? `${line} ${wd}` : wd;
    if (g.measureText(tryL).width > maxW && line) { text(g, line, x, ly, size, col, sans({ weight: '600' })); line = wd; ly += size + 4; }
    else line = tryL;
  }
  if (line) text(g, line, x, ly, size, col, sans({ weight: '600' }));
}
