// Tidebreaker: the upgrade card screen, "Blessings of the Tide" (concept
// 5-cards.png): the world blurred and darkened behind (captured once when the
// screen opens), god rays, three or four cards with rarity ribbons, painted
// art, rank pips and stat chips, a combo look for combo cards, and the footer
// with gold, reroll and skip. cardButtons(G) gives the clickable rects.
import { W, H, SERIF, SANS } from '../config.js';
import { layer } from '../gfx.js';
import { UPGRADES, RARITY, cardText } from '../upgrades.js';
import { paintBall } from '../combat.js';
import { paintFire, paintSparks, paintBolt, paintSplash } from '../world/fx.js';
import { paintTentacle, KRAKEN } from '../creatures.js';
import { panel, coin, GOLD, sans, text, rr, glow, rgba, vignette, title, fmtNum } from './kit.js';

const CH = 460, Y0 = 150, FOOT = [W / 2 - 250, H - 62, 500, 46];
function layout(n) {
  const cw = n > 3 ? 272 : 300, gap = n > 3 ? 22 : 36;
  const x0 = W / 2 - (cw * n + gap * (n - 1)) / 2;
  return Array.from({ length: n }, (_, i) => [x0 + i * (cw + gap), Y0, cw, CH]);
}
const REROLL = [W / 2 - 86, H - 60, 190, 42], SKIP = [W / 2 + 116, H - 60, 128, 42];

export function cardButtons(G) {
  if (!G.cards) return [];
  const ids = G.cards.ids;
  const out = layout(ids.length).map((rect, i) => ({
    id: `card-${i}`, action: 'pick', arg: i, rect, data: { card: ids[i] },
    label: `${UPGRADES[ids[i]]?.name || ids[i]} (${i + 1})`,
  }));
  const cost = G.stats.rerollCost;
  out.push({ id: 'btn-reroll', action: 'reroll', rect: REROLL, label: `Reroll for ${cost} gold`, disabled: (G.run?.gold || 0) < cost });
  out.push({ id: 'btn-skip', action: 'skip', rect: SKIP, label: 'Skip for 80 gold' });
  return out;
}

// ------------------------------------------------------------- backdrop
let back = null, lastVt = -1;
function capture(g) {
  if (!back) back = layer(W, H);
  const b = back.getContext('2d');
  b.setTransform(1, 0, 0, 1, 0, 0);
  if ('filter' in b) {
    b.filter = 'blur(5px) brightness(0.45) saturate(1.2)';
    b.drawImage(g.canvas, -8, -8, W + 16, H + 16);
    b.filter = 'none';
  } else { // downscale and back up: a cheap soft blur
    const s = layer(W / 8, H / 8), sg = s.getContext('2d');
    sg.drawImage(g.canvas, 0, 0, W / 8, H / 8);
    b.imageSmoothingEnabled = true; b.drawImage(s, 0, 0, W, H);
    b.fillStyle = 'rgba(8,4,24,0.55)'; b.fillRect(0, 0, W, H);
  }
  vignette(b, 0.85);
}
let rayGrad = null;
function rays(g, t) {
  if (!rayGrad) { rayGrad = g.createLinearGradient(0, 0, 0, H); rayGrad.addColorStop(0, 'rgba(255,200,120,0.12)'); rayGrad.addColorStop(1, 'rgba(255,200,120,0)'); }
  g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = rayGrad;
  for (let k = 0; k < 6; k++) {
    const x = 200 + k * 180 + Math.sin(t * 0.3 + k * 1.7) * 14, sw = 0.7 + 0.3 * Math.sin(t * 0.5 + k);
    g.globalAlpha = sw;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 60, 0); g.lineTo(x + 160, H); g.lineTo(x + 40, H); g.fill();
  }
  g.restore();
}

// ------------------------------------------------------------- the screen
export function drawCards(g, G) {
  if (!G.cards) return;
  const t = G.vt;
  if (!back || t - lastVt > 0.3 || t < lastVt) capture(g);
  lastVt = t;
  g.drawImage(back, 0, 0, W, H);
  rays(g, t);

  title(g, 'BLESSINGS OF THE TIDE', W / 2, 70, 40);
  const sub = { fortress: 'The fortress falls!', serpent: 'The Serpent sinks beneath the mist!', leviathan: 'The deep is quiet.' }[G.enc?.type] || 'Fleet sunk!';
  text(g, `${sub} Choose one upgrade for the Gilded Gull`, W / 2, 104, 17, '#ffd8ec', sans({ align: 'center', weight: '600' }));

  const ids = G.cards.ids, rects = layout(ids.length);
  const hov = (i) => G.ui.hover === `card-${i}` || G.cards.hover === i;
  // the hovered card draws last so its glow sits on top
  const order = ids.map((_, i) => i).sort((a, b) => (hov(a) ? 1 : 0) - (hov(b) ? 1 : 0));
  for (const i of order) card(g, G, ids[i], rects[i], hov(i), i, t);

  footer(g, G);
}

function footer(g, G) {
  const [fx, fy, fw, fh] = FOOT;
  panel(g, fx, fy, fw, fh, 0.7);
  coin(g, fx + 30, fy + 23, 12);
  text(g, fmtNum(G.run?.gold), fx + 50, fy + 30, 18, '#ffe07a', sans({ weight: '900' }));
  const cost = G.stats.rerollCost, can = (G.run?.gold || 0) >= cost;
  for (const [id, r] of [['btn-reroll', REROLL], ['btn-skip', SKIP]]) {
    if (G.ui.hover !== id || (id === 'btn-reroll' && !can)) continue;
    rr(g, r[0], r[1] + 4, r[2], r[3] - 8, (r[3] - 8) / 2); g.fillStyle = 'rgba(255,214,120,0.16)'; g.fill();
    g.strokeStyle = 'rgba(255,214,120,0.6)'; g.lineWidth = 1; g.stroke();
  }
  text(g, `REROLL  ·  ${cost}`, REROLL[0] + REROLL[2] / 2, fy + 30, 16, can ? '#ffe8c8' : 'rgba(255,232,200,0.35)', sans({ align: 'center', spacing: 2 }));
  text(g, 'SKIP  +80', SKIP[0] + SKIP[2] / 2, fy + 30, 16, G.ui.hover === 'btn-skip' ? '#ffe8c8' : 'rgba(255,232,200,0.7)', sans({ align: 'center', spacing: 2 }));
}

// Fit a serif name into the card width.
function fitSize(g, s, size, maxW, font = SERIF) {
  g.font = `bold ${size}px ${font}`;
  const w = g.measureText(s).width;
  return w > maxW ? Math.floor(size * maxW / w) : size;
}

function card(g, G, id, [x, y, w, h], lift, i, t) {
  const u = UPGRADES[id]; if (!u) return;
  const R = RARITY[u.rarity], rare = R.col;
  const have = G.run?.upgrades[id] || 0, next = have + 1;
  const { desc, chips } = cardText(id, next);
  const combo = !!u.combo;
  g.save();
  if (lift) g.translate(0, -18);
  // body
  g.shadowColor = lift ? rgba(rare, 0.9) : 'rgba(0,0,0,0.6)'; g.shadowBlur = lift ? 46 : 20; g.shadowOffsetY = lift ? 0 : 10;
  rr(g, x, y, w, h, 18);
  const bg = g.createLinearGradient(0, y, 0, y + h);
  bg.addColorStop(0, combo ? '#3a1a52' : '#2a1d4a'); bg.addColorStop(1, combo ? '#1a0a2a' : '#130c2a');
  g.fillStyle = bg; g.fill();
  g.shadowColor = 'transparent';
  if (combo) { // shimmering gold-pink-cyan rim
    const ph = (t * 0.25) % 1;
    const cg = g.createLinearGradient(x - w * ph * 2, y, x + w * 2 - w * ph * 2, y + h);
    ['#ffd36a', '#ff6ad5', '#7fe0ff', '#ffd36a', '#ff6ad5'].forEach((c, k) => cg.addColorStop(k / 4, c));
    g.lineWidth = 5; g.strokeStyle = cg; g.stroke();
  } else { g.lineWidth = 4; g.strokeStyle = rare; g.stroke(); }
  rr(g, x + 8, y + 8, w - 16, h - 16, 13); g.lineWidth = 1.5; g.strokeStyle = rgba('#ffd36a', 0.55); g.stroke();
  for (const [cx, cy] of [[x + 16, y + 16], [x + w - 16, y + 16], [x + 16, y + h - 16], [x + w - 16, y + h - 16]]) { g.beginPath(); g.arc(cx, cy, 4, 0, 7); g.fillStyle = GOLD; g.fill(); }
  // art
  const ax = x + 22, ay = y + 52, aw = w - 44, ah = 190;
  g.drawImage(artFor(u.art, aw, ah), ax, ay, aw, ah);
  if (lift) { g.save(); rr(g, ax, ay, aw, ah, 10); g.clip(); g.globalCompositeOperation = 'lighter'; glow(g, ax + aw * (0.5 + 0.35 * Math.sin(t * 1.3)), ay + ah * 0.4, aw * 0.5, rare, 0.18); g.restore(); }
  rr(g, ax, ay, aw, ah, 10); g.strokeStyle = rgba(rare, 0.8); g.lineWidth = 2; g.stroke();
  // ribbon
  const rib = combo ? `COMBO · ${R.label}` : R.label;
  g.font = `900 12px ${SANS}`; const rw = Math.max(124, g.measureText(rib).width + 40);
  rr(g, x + w / 2 - rw / 2, y + 22, rw, 24, 12);
  if (combo) { const rg = g.createLinearGradient(x + w / 2 - rw / 2, 0, x + w / 2 + rw / 2, 0); rg.addColorStop(0, '#ffd36a'); rg.addColorStop(0.5, '#ff8ad8'); rg.addColorStop(1, '#8ae8ff'); g.fillStyle = rg; }
  else g.fillStyle = rare;
  g.fill();
  text(g, rib, x + w / 2, y + 35, 12, '#120a20', sans({ align: 'center', base: 'middle', weight: '900', spacing: 2 }));
  // name and words
  const ns = fitSize(g, u.name, 25, w - 40);
  text(g, u.name, x + w / 2, y + 282, ns, '#fff1d0', { align: 'center', shadow: rgba(combo ? '#ff6ad5' : rare, 0.8), blur: 10, oy: 0 });
  g.font = `600 15px ${SANS}`; g.fillStyle = '#d8d0f0'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  desc.forEach((l, k) => g.fillText(l, x + w / 2, y + 314 + k * 22));
  // combo recipe or rank
  const ry = y + 372;
  if (combo) {
    const recipe = u.requires.map((r) => UPGRADES[r].name.toUpperCase()).join('  +  ');
    text(g, recipe, x + w / 2, ry + 4, 11, '#ffc8f0', sans({ align: 'center', weight: '800', spacing: 1 }));
  } else if (u.max < 20) rankPips(g, x + w / 2, ry, have, u.max, rare);
  else text(g, 'REPEATABLE', x + w / 2, ry + 4, 11, 'rgba(255,232,200,0.6)', sans({ align: 'center', spacing: 2 }));
  // chips
  g.font = `800 12px ${SANS}`;
  const cws = chips.map((c) => Math.max(92, g.measureText(c).width + 24));
  const tot = cws.reduce((a, b) => a + b, 0) + (chips.length - 1) * 8;
  let cx = x + w / 2 - tot / 2;
  chips.forEach((c, k) => {
    const cw = cws[k];
    rr(g, cx, y + h - 62, cw, 28, 14); g.fillStyle = rgba(rare, 0.22); g.fill(); g.strokeStyle = rgba(rare, 0.7); g.lineWidth = 1.5; g.stroke();
    text(g, c, cx + cw / 2, y + h - 47, 12, '#ffffff', sans({ align: 'center', base: 'middle' }));
    cx += cw + 8;
  });
  if (lift) text(g, `PRESS ${i + 1}`, x + w / 2, y + h + 26, 12, 'rgba(255,232,200,0.75)', sans({ align: 'center', spacing: 3 }));
  g.restore();
}

function rankPips(g, cx, y, have, max, col) {
  const label = have ? `RANK ${have + 1} / ${max}` : (max > 1 ? `NEW · ${max} RANKS` : 'NEW');
  text(g, label, cx, y + 4, 11, 'rgba(255,232,200,0.75)', sans({ align: 'center', spacing: 2 }));
  if (max < 2) return;
  const sp = 14, x0 = cx - (max - 1) * sp / 2;
  for (let k = 0; k < max; k++) {
    g.beginPath(); g.arc(x0 + k * sp, y + 15, 4, 0, 7);
    g.fillStyle = k < have ? col : k === have ? '#ffffff' : 'rgba(255,255,255,0.18)'; g.fill();
    if (k === have) { g.strokeStyle = col; g.lineWidth = 1.5; g.beginPath(); g.arc(x0 + k * sp, y + 15, 6.5, 0, 7); g.stroke(); }
  }
}

// ------------------------------------------------------------- card art
// Painted once per kind and size into an offscreen canvas.
const ART_K = 1.5, artCache = new Map();
export function artFor(kind, w, h) {
  const key = `${kind}|${w}|${h}`;
  let c = artCache.get(key);
  if (!c) {
    c = layer(Math.round(w * ART_K), Math.round(h * ART_K));
    const a = c.getContext('2d'); a.scale(ART_K, ART_K);
    try { cardArt(a, kind, 0, 0, w, h); } catch (e) { console.warn('card art', kind, e); }
    artCache.set(key, c);
  }
  return c;
}

const BGS = {
  chain: ['#1a2a6a', '#5a8aff'], fire: ['#5a0f1a', '#ff7a2a'], bolt: ['#120a4a', '#7a5aff'], kraken: ['#2a0a4a', '#ff4fb8'],
  heavy: ['#2a1a3a', '#c86a3a'], cannons: ['#3a1a10', '#ff9a3a'], reload: ['#1a2a3a', '#4ac8a8'], grapeshot: ['#2a1a4a', '#c88aff'],
  gunners: ['#3a0a1a', '#ff4a5a'], explosive: ['#3a0a0a', '#ffb02a'], longnines: ['#0a2a3a', '#5ae0ff'], hull: ['#2a1408', '#d8803a'],
  surgeon: ['#0a2a2a', '#5affb0'], armor: ['#1a1a2a', '#8a9ab8'], rigging: ['#0a2a4a', '#8ad8ff'], doubloons: ['#3a2a0a', '#ffd04a'],
  repair: ['#2a1a0a', '#e0a050'], fourth: ['#2a0a3a', '#ff8ad8'],
  thunderfire: ['#2a0a3a', '#ff7a4a'], hellfire: ['#3a0505', '#ff3a1a'], stormgunners: ['#0a1040', '#5ad8ff'],
  skipping: ['#0a2040', '#4ac8ff'], abyssal: ['#140a30', '#b04aff'],
};

function sea(g, x, y, w, h, col, a = 0.85) {
  g.fillStyle = rgba(col, a); g.beginPath(); g.moveTo(x, y + h);
  for (let i = 0; i <= 20; i++) g.lineTo(x + i * w / 20, y + h * 0.78 + Math.sin(i * 0.9) * 4);
  g.lineTo(x + w, y + h); g.fill();
}
function barrel(g, cx, cy, bw, bh) {
  g.fillStyle = '#6a3a1a'; rr(g, cx - bw / 2, cy - bh / 2, bw, bh, bw * 0.22); g.fill();
  g.fillStyle = '#3a1a0a'; g.fillRect(cx - bw / 2, cy - bh * 0.3, bw, bh * 0.1); g.fillRect(cx - bw / 2, cy + bh * 0.22, bw, bh * 0.1);
}
function gun(g, x, y, len, r, ang) {
  g.save(); g.translate(x, y); g.rotate(ang);
  const gr = g.createLinearGradient(0, -r, 0, r); gr.addColorStop(0, '#8a8f9a'); gr.addColorStop(0.4, '#3a3e48'); gr.addColorStop(1, '#14161c');
  g.fillStyle = gr; rr(g, -len * 0.2, -r, len, r * 2, r * 0.6); g.fill();
  g.fillRect(len * 0.76, -r * 1.25, r * 0.8, r * 2.5);
  g.fillStyle = '#05060a'; g.beginPath(); g.ellipse(len * 0.8 + r * 0.4, 0, r * 0.3, r * 0.75, 0, 0, 7); g.fill();
  g.restore();
}
function crosshair(g, x, y, r, col) {
  g.strokeStyle = col; g.lineWidth = 3;
  g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke();
  g.beginPath(); g.arc(x, y, r * 0.45, 0, 7); g.stroke();
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6); g.lineTo(x + Math.cos(a) * r * 1.3, y + Math.sin(a) * r * 1.3); g.stroke(); }
}
function sail(g, x, y, w, h) {
  const gr = g.createLinearGradient(x, y, x + w, y); gr.addColorStop(0, '#fff4dc'); gr.addColorStop(1, '#e2c79a');
  g.fillStyle = gr; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w * 0.6, y + h * 0.1, x + w, y); g.quadraticCurveTo(x + w * 1.25, y + h * 0.5, x + w, y + h);
  g.quadraticCurveTo(x + w * 0.6, y + h * 0.92, x, y + h); g.quadraticCurveTo(x + w * 0.22, y + h * 0.5, x, y); g.fill();
  g.fillStyle = '#1f7ae0'; g.fillRect(x + 4, y + h * 0.62, w * 0.95, h * 0.08);
}

export function cardArt(g, kind, x, y, w, h) {
  g.save(); rr(g, x, y, w, h, 10); g.clip();
  const [a, b] = BGS[kind] || BGS.heavy;
  const gr = g.createRadialGradient(x + w / 2, y + h * 0.6, 10, x + w / 2, y + h / 2, w);
  gr.addColorStop(0, b); gr.addColorStop(1, a); g.fillStyle = gr; g.fillRect(x, y, w, h);
  sea(g, x, y, w, h, a);
  const cx = x + w / 2, cy = y + h / 2;
  const lit = (fn) => { g.save(); g.globalCompositeOperation = 'lighter'; fn(); g.restore(); };
  switch (kind) {
    case 'chain':
      g.strokeStyle = '#c8d0e8'; g.lineWidth = 6; g.beginPath(); g.moveTo(cx - 60, cy + 10); g.bezierCurveTo(cx - 20, cy - 50, cx + 20, cy + 50, cx + 60, cy - 10); g.stroke();
      g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.setLineDash([6, 5]); g.stroke(); g.setLineDash([]);
      paintBall(g, cx - 60, cy + 10, 1, 0.3, 22, '#bfd0ff'); paintBall(g, cx + 60, cy - 10, 1, -0.3, 22, '#bfd0ff');
      break;
    case 'fire':
      paintFire(g, cx, cy + 50, 120, 90, 3); barrel(g, cx, cy + 25, 64, 70);
      g.strokeStyle = '#ffcf6a'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, cy - 10); g.quadraticCurveTo(cx + 10, cy - 30, cx + 4, cy - 44); g.stroke();
      paintSparks(g, cx + 4, cy - 46, 12, 18, 2, '#ffe08a'); paintFire(g, cx, cy - 4, 50, 40, 9, 0.8);
      break;
    case 'bolt':
      g.strokeStyle = '#3a2414'; g.lineWidth = 8; g.beginPath(); g.moveTo(cx, y + h); g.lineTo(cx, cy - 40); g.stroke();
      g.fillStyle = '#c8b8a0'; g.fillRect(cx - 40, cy - 10, 80, 6);
      lit(() => glow(g, cx, cy - 50, 70, '#5ad8ff', 1));
      g.strokeStyle = GOLD; g.lineWidth = 3; for (let k = 0; k < 5; k++) { g.beginPath(); g.ellipse(cx, cy - 34 + k * 7, 12, 4, 0, 0, 7); g.stroke(); }
      paintBolt(g, cx, cy - 56, cx - 90, y + 20, 4, '#9fe8ff', 0.6, 0); paintBolt(g, cx, cy - 56, cx + 95, cy - 10, 5, '#9fe8ff', 0.6, 0); paintBolt(g, cx, cy - 56, cx + 40, y + 6, 6, '#9fe8ff', 0.5, 0);
      break;
    case 'kraken':
      paintTentacle(g, [cx - 40, y + h], [cx - 90, cy], [cx - 10, y + 10], [cx + 30, cy - 30], 22, KRAKEN, 1);
      paintTentacle(g, [cx + 50, y + h], [cx + 100, cy + 10], [cx + 60, y + 30], [cx + 10, cy - 10], 16, KRAKEN, 2);
      break;
    case 'heavy':
      lit(() => glow(g, cx, cy, 90, '#ffb06a', 0.7));
      paintBall(g, cx + 10, cy - 4, 1, -0.15, 40, '#ffd38a', '#ff7a2a');
      text(g, '12', cx + 10, cy + 2, 22, 'rgba(255,230,200,0.5)', { align: 'center', base: 'middle' });
      paintSparks(g, cx + 54, cy - 10, 10, 20, 3, '#ffe08a');
      break;
    case 'cannons':
      g.fillStyle = '#5a2e14'; g.fillRect(x, cy + 6, w * 0.5, h); g.fillStyle = '#ffcc4d'; g.fillRect(x, cy + 6, w * 0.5, 5);
      for (let k = 0; k < 3; k++) { const gy = cy + 26 + k * 28; gun(g, x + 30, gy, 80, 9, -0.08); lit(() => glow(g, x + 130, gy - 6, 40, '#ffb04a', 0.9)); }
      paintBall(g, x + w - 50, cy - 40, 1, -0.2, 9, '#ffd36a'); paintBall(g, x + w - 70, cy - 4, 1, -0.1, 9, '#ffd36a');
      break;
    case 'reload':
      for (const [dx, dy] of [[-22, 30], [22, 30], [0, -8]]) paintBall(g, cx + dx, cy + dy, 0, 0, 22, '#cfe0ff');
      g.strokeStyle = '#7affd8'; g.lineWidth = 5; g.lineCap = 'round';
      g.beginPath(); g.arc(cx, cy + 14, 72, -2.6, 0.3); g.stroke();
      g.fillStyle = '#7affd8'; g.beginPath(); const ex = cx + Math.cos(0.3) * 72, ey = cy + 14 + Math.sin(0.3) * 72; g.moveTo(ex + 12, ey - 6); g.lineTo(ex - 6, ey + 14); g.lineTo(ex - 10, ey - 10); g.fill();
      g.lineCap = 'butt';
      break;
    case 'grapeshot':
      for (let k = 0; k < 11; k++) { const an = -0.5 + k * 0.1, d = 60 + (k * 37 % 50); paintBall(g, x + 40 + Math.cos(an) * d * 1.6, cy + 10 + Math.sin(an) * d, Math.cos(an), Math.sin(an), 7, '#e0c8ff'); }
      lit(() => glow(g, x + 30, cy + 10, 50, '#ffb04a', 0.9));
      break;
    case 'gunners':
      lit(() => glow(g, cx, cy, 80, '#ff4a5a', 0.6));
      crosshair(g, cx, cy, 44, '#ffe0e0');
      paintSparks(g, cx, cy, 14, 26, 7, '#ffd36a');
      text(g, 'CRIT', cx, cy - 64, 20, '#ffe14a', sans({ align: 'center', weight: '900', stroke: '#2a0d0d', sw: 5 }));
      break;
    case 'explosive':
      lit(() => { glow(g, cx + 30, cy - 10, 110, '#ff8a2a', 0.9); glow(g, cx + 30, cy - 10, 40, '#fff0a0', 1); });
      paintSparks(g, cx + 30, cy - 10, 24, 60, 11, '#ffe08a');
      paintBall(g, cx - 40, cy + 30, 1, -0.4, 24, '#ffd36a', '#ff7a2a');
      g.strokeStyle = '#d8c8a0'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 32, cy + 8); g.quadraticCurveTo(cx - 24, cy - 6, cx - 12, cy - 6); g.stroke();
      paintSparks(g, cx - 12, cy - 6, 8, 10, 4, '#fff0a0');
      break;
    case 'longnines':
      gun(g, x + 10, cy + 30, 150, 12, -0.18);
      lit(() => glow(g, x + 165, cy + 4, 46, '#ffd06a', 1));
      g.strokeStyle = 'rgba(200,250,255,0.6)'; g.lineWidth = 2; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(x + 170, cy - 2 - k * 8); g.lineTo(x + w - 20, cy - 34 - k * 10); g.stroke(); }
      paintBall(g, x + w - 30, cy - 46, 1, -0.3, 10, '#cff8ff');
      break;
    case 'hull': {
      for (let k = 0; k < 5; k++) { g.fillStyle = k % 2 ? '#b8682a' : '#d8803a'; g.fillRect(x, cy - 50 + k * 26, w, 26); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, cy - 50 + k * 26 + 24, w, 2); }
      g.fillStyle = '#e8a060'; for (let k = 0; k < 5; k++) for (let j = 0; j < 9; j++) { g.beginPath(); g.arc(x + 14 + j * 28 + (k % 2) * 14, cy - 37 + k * 26, 2.5, 0, 7); g.fill(); }
      lit(() => glow(g, cx, cy - 40, 90, '#ffd0a0', 0.35));
      sea(g, x, y, w, h, '#0a3a5a', 0.9);
      break;
    }
    case 'surgeon':
      lit(() => glow(g, cx, cy, 90, '#5affb0', 0.6));
      g.fillStyle = '#f4ecd8'; rr(g, cx - 50, cy - 30, 100, 76, 12); g.fill(); g.fillStyle = '#6a3a1a'; rr(g, cx - 22, cy - 46, 44, 20, 8); g.lineWidth = 6; g.strokeStyle = '#6a3a1a'; g.stroke();
      g.fillStyle = '#e03a4a'; g.fillRect(cx - 8, cy - 18, 16, 52); g.fillRect(cx - 26, cy, 52, 16);
      break;
    case 'armor':
      g.save(); g.translate(cx, cy);
      g.beginPath(); g.moveTo(0, -70); g.lineTo(62, -48); g.quadraticCurveTo(60, 30, 0, 70); g.quadraticCurveTo(-60, 30, -62, -48); g.closePath();
      { const ag = g.createLinearGradient(-60, -70, 60, 70); ag.addColorStop(0, '#d8e0f0'); ag.addColorStop(0.5, '#6a7488'); ag.addColorStop(1, '#2a2e3a'); g.fillStyle = ag; }
      g.fill(); g.strokeStyle = '#1a1c24'; g.lineWidth = 4; g.stroke();
      g.fillStyle = '#c8d0e0'; for (const [rx, ry] of [[-40, -38], [40, -38], [-34, 20], [34, 20], [0, 50], [0, -56]]) { g.beginPath(); g.arc(rx, ry, 4, 0, 7); g.fill(); }
      g.restore();
      break;
    case 'rigging':
      g.strokeStyle = '#3a2414'; g.lineWidth = 6; g.beginPath(); g.moveTo(cx - 30, y + h); g.lineTo(cx - 30, y + 6); g.stroke();
      sail(g, cx - 30, y + 26, 100, 110);
      g.strokeStyle = 'rgba(220,250,255,0.7)'; g.lineWidth = 2.5; g.lineCap = 'round';
      for (let k = 0; k < 4; k++) { const wy = y + 40 + k * 30; g.beginPath(); g.moveTo(x + 14, wy); g.quadraticCurveTo(x + 50, wy - 10, x + 70, wy + 2); g.stroke(); }
      g.lineCap = 'butt';
      break;
    case 'doubloons':
      lit(() => glow(g, cx, cy + 20, 100, '#ffd04a', 0.7));
      for (let k = 0; k < 14; k++) { const px = cx - 60 + ((k * 47) % 120), py = cy + 50 - ((k * 13) % 5) * 12 - (k > 9 ? 30 : 0); coinArt(g, px, py, 16); }
      paintSparks(g, cx + 30, cy - 30, 10, 20, 5, '#fff0a0');
      break;
    case 'repair':
      g.save(); g.translate(cx - 20, cy + 20); g.rotate(-0.25);
      g.fillStyle = '#b8783a'; g.fillRect(-90, -12, 180, 24); g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(-90, 6, 180, 6); g.restore();
      g.save(); g.translate(cx + 30, cy - 10); g.rotate(0.6);
      g.fillStyle = '#7a4a1a'; rr(g, -6, -10, 12, 90, 4); g.fill();
      g.fillStyle = '#b0b8c8'; rr(g, -30, -26, 60, 22, 4); g.fill(); g.restore();
      paintSparks(g, cx + 6, cy + 14, 10, 18, 9, '#ffe08a');
      break;
    case 'fourth':
      for (let k = 0; k < 4; k++) {
        g.save(); g.translate(cx, cy + 70); g.rotate(-0.45 + k * 0.3);
        rr(g, -26, -120, 52, 80, 6); g.fillStyle = k === 3 ? '#ffd36a' : '#2a1d4a'; g.fill(); g.strokeStyle = k === 3 ? '#fff4c0' : '#c66aff'; g.lineWidth = 2; g.stroke();
        g.restore();
      }
      lit(() => glow(g, cx + 40, cy - 30, 60, '#ffd36a', 0.6));
      break;
    case 'thunderfire':
      paintFire(g, cx + 30, cy + 54, 110, 80, 5); barrel(g, cx + 30, cy + 30, 50, 56);
      lit(() => glow(g, cx - 40, y + 20, 70, '#7fe0ff', 0.9));
      paintBolt(g, cx - 50, y, cx + 24, cy + 6, 7, '#bff4ff', 1, 2);
      paintSparks(g, cx + 24, cy + 6, 16, 30, 8, '#ffe8a0');
      break;
    case 'hellfire':
      for (let k = 0; k < 4; k++) { const by = cy - 40 + k * 30; paintFire(g, x + 50 + k * 30, by + 10, 50, 30, 20 + k, 0.8); paintBall(g, x + 90 + k * 30, by, 1, -0.1, 10, '#ff9a4a', '#ff3a1a'); }
      lit(() => glow(g, cx, cy, 120, '#ff3a1a', 0.4));
      break;
    case 'stormgunners':
      crosshair(g, cx + 20, cy, 36, '#cff4ff');
      paintBolt(g, cx + 20, cy, x + 20, y + 30, 3, '#9ff4ff', 0.8, 1); paintBolt(g, cx + 20, cy, x + w - 10, cy + 50, 4, '#9ff4ff', 0.8, 1);
      lit(() => glow(g, cx + 20, cy, 60, '#5ad8ff', 0.8));
      break;
    case 'skipping': {
      const wy = y + h * 0.78;
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2; g.setLineDash([5, 5]);
      g.beginPath(); g.moveTo(x + 10, cy - 30);
      let px = x + 10;
      for (const [len, hh] of [[70, 50], [60, 34], [50, 22], [40, 12]]) { g.quadraticCurveTo(px + len / 2, wy - hh * 2, px + len, wy); px += len; }
      g.stroke(); g.setLineDash([]);
      px = x + 10; for (const len of [70, 60, 50]) { px += len; paintSplash(g, px, wy, 14, px | 0, '#ffffff'); }
      paintBall(g, px + 40, wy - 4, 1, -0.2, 9, '#cff8ff');
      break;
    }
    case 'abyssal':
      paintTentacle(g, [cx - 30, y + h], [cx - 90, cy], [cx + 10, y + 10], [cx + 40, cy - 10], 22, KRAKEN, 4);
      g.strokeStyle = '#c8d0e8'; g.lineWidth = 5; g.setLineDash([7, 4]);
      g.beginPath(); g.moveTo(x + 10, cy + 40); g.bezierCurveTo(cx - 20, cy - 10, cx + 30, cy + 70, x + w - 10, cy + 10); g.stroke(); g.setLineDash([]);
      lit(() => glow(g, cx, cy, 80, '#b04aff', 0.5));
      break;
    default: break;
  }
  g.restore();
}
function coinArt(g, x, y, r) {
  g.save(); g.translate(x, y); g.scale(1, 0.45);
  const gr = g.createLinearGradient(0, -r, 0, r); gr.addColorStop(0, '#fff3a8'); gr.addColorStop(1, '#c88a10');
  g.fillStyle = '#8a5500'; g.beginPath(); g.arc(0, 6, r, 0, 7); g.fill();
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill(); g.restore();
}
