// Skyforge Academy (concept 5): the four-branch research board on parchment,
// medallion nodes [data-research=id] with done / researching / ready / locked
// states, prerequisite lines (solid when met, dashed when not, curves across
// branches), the insight counter, and the right-hand detail card with a painted
// vignette per tech, unlocks, cost chips, #btn-begin-research, the queue and
// the "Now studying" bar. Reads app.G and content; acts only through app.act.
//   createResearch(app) -> { el, open(), close(), update(realDt), select(id) }
import {
  h, setText, makePanel, chipEl, content, nameOf, resName, stock, fmt, clock, dur, humanize, rgba, shade, mix, TAU, INK, BRASS, BRASS_D,
  circ, ell, rr, vgrad, glow, pathPts, layer, DPR, puffGroup, cloud, island, cottage, windmill, tree, crystal, miniAirship, rng, strSeed, ENV, text, SERIF,
} from './panelkit.js';
import { glyph, iconImg, hasGlyph } from './icons.js';
import * as RS from '../sim/research.js';

const SW = 1120, SH = 676;                         // logical stage (bands + nodes)
const LX0 = 298, LDX = 186, LY0 = 82, LDY = 170;   // node grid
const BRANCH_STYLE = [
  { key: /indus|forge|craft/i, color: '#cf6f34', icon: 'anvil' },
  { key: /aero|air|sky ?ship|flight/i, color: '#3e74c0', icon: 'skiffs' },
  { key: /arcan|skystone|crystal|aether/i, color: '#2a9eb4', icon: 'skystone' },
  { key: /defen|guard|war/i, color: '#b8423a', icon: 'shield' },
];
const DEFAULT_COLORS = ['#cf6f34', '#3e74c0', '#2a9eb4', '#b8423a'];

function branches(app) {
  const C = content(app);
  return C.branches.slice(0, 4).map((b, i) => {
    const st = BRANCH_STYLE.find((s) => s.key.test(b.id + ' ' + (b.name || ''))) || { color: DEFAULT_COLORS[i], icon: 'flask' };
    return { id: b.id, name: b.name || humanize(b.id), color: b.color || st.color, icon: b.icon && hasGlyph(b.icon) ? b.icon : st.icon, i };
  });
}
function layout(app) {
  const C = content(app), B = branches(app), pos = {};
  for (const b of B) {
    const list = C.research.filter((r) => r.branch === b.id || r.branch === b.i).sort((a, c) => (a.tier || 0) - (c.tier || 0));
    list.forEach((r, k) => { const col = Math.max(0, Math.min(4, (r.tier ? r.tier - 1 : k))); pos[r.id] = { x: LX0 + col * LDX, y: LY0 + b.i * LDY, b }; });
  }
  return { B, pos, list: C.research.filter((r) => pos[r.id]) };
}
function progressOf(G, r) {
  if (!G || !r) return 0;
  if (G.research.current !== r.id) return G.research.done.includes(r.id) ? 1 : 0;
  return Math.max(0, Math.min(1, G.research.progress ?? G.tmp?.researchProgress ?? 0));
}
// game seconds left (current project) or needed (any other) at today's scholar speed; Infinity with no scholars
function etaOf(G, r) {
  try { const e = RS.eta(G, r.id); if (e != null) return e; } catch (e) { /* mock G */ }
  return (1 - progressOf(G, r)) * (r.time || 0);
}
const costOfR = (r) => { try { const c = RS.costOf(r.id); if (c && Object.keys(c).length) return c; } catch (e) { /* noop */ } return r.cost || {}; };
const left = (s) => (isFinite(s) ? clock(s) : '--:--');
function stateOf(G, r) {
  if (!G) return 'locked';
  const R = G.research;
  if (R.done.includes(r.id)) return 'done';
  if (R.current === r.id) return 'prog';
  if (R.queue?.includes(r.id)) return 'queued';
  return (r.needs || []).every((n) => R.done.includes(n)) ? 'avail' : 'locked';
}
const scholars = (G) => { if (!G) return 0; try { return RS.scholars(G); } catch (e) { return G.buildings.filter((b) => b.type === 'academy' && b.state === 'built').reduce((s, b) => s + (b.workers || 0), 0); } };

// ---------------------------------------------------------------- node medallion
function paintNode(c, r, st, col, prog, sel, k, q = 0) {
  const L = 108, d = DPR() * k, g = c.getContext('2d');
  if (c.width !== Math.round(L * d)) { c.width = c.height = Math.round(L * d); }
  g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, L, L);
  const x = L / 2, y = L / 2, R = sel ? 37 : 32;
  circ(g, x, y, R + 5);
  g.fillStyle = st === 'locked' ? vgrad(g, y - R, y + R, [[0, '#cfc2ae'], [1, '#9a8e7e']]) : vgrad(g, y - R, y + R, [[0, '#f8dc94'], [0.5, '#dcae58'], [1, '#a8702a']]);
  g.save(); g.shadowColor = 'rgba(60,36,20,0.35)'; g.shadowBlur = 6; g.shadowOffsetY = 3; g.fill(); g.restore();
  g.strokeStyle = 'rgba(60,36,20,0.8)'; g.lineWidth = 1.5; g.stroke();
  circ(g, x, y, R);
  if (st === 'done') g.fillStyle = vgrad(g, y - R, y + R, [[0, shade(col, 0.28)], [1, shade(col, -0.28)]]);
  else if (st === 'locked') g.fillStyle = vgrad(g, y - R, y + R, [[0, '#ddd4c4'], [1, '#aea290']]);
  else g.fillStyle = vgrad(g, y - R, y + R, [[0, '#fff8e6'], [1, '#efdcb4']]);
  g.fill(); g.strokeStyle = 'rgba(60,36,20,0.55)'; g.lineWidth = 1; g.stroke();
  if (st === 'avail' || st === 'queued' || sel) { circ(g, x, y, R - 2.5); g.strokeStyle = col; g.lineWidth = 3; g.stroke(); }
  g.save(); circ(g, x, y, R); g.clip(); g.fillStyle = rgba('#ffffff', 0.18); ell(g, x, y - R * 0.55, R * 0.85, R * 0.42); g.fill(); g.restore();
  g.save(); if (st === 'locked') g.globalAlpha = 0.42; glyph(g, hasGlyph(r.id) ? r.id : r.icon, x, y, R / 15.5); g.restore();
  if (st === 'prog') {
    g.beginPath(); g.arc(x, y, R + 2.5, 0, TAU); g.strokeStyle = rgba('#2e8a4a', 0.18); g.lineWidth = 5; g.stroke();
    g.beginPath(); g.arc(x, y, R + 2.5, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.02, prog)); g.strokeStyle = '#4cc070'; g.lineWidth = 5; g.lineCap = 'round'; g.stroke();
  }
  const bx = x + R * 0.74, by = y + R * 0.7;
  if (st === 'done') { g.save(); g.translate(bx, by); g.scale(0.78, 0.78); glyph(g, 'check', 0, 0, 1); g.restore(); }
  if (st === 'locked') { circ(g, bx, by, 9.5); g.fillStyle = '#5a4a48'; g.fill(); g.strokeStyle = '#efe4cc'; g.lineWidth = 1.5; g.stroke(); glyph(g, 'lock', bx, by + 0.5, 0.52); }
  if (st === 'queued') { circ(g, bx, by, 10); g.fillStyle = col; g.fill(); g.strokeStyle = '#fff6e0'; g.lineWidth = 1.5; g.stroke(); text(g, String(q || ''), bx, by + 4.5, { size: 12, weight: 'bold', align: 'center', color: '#fff' }); }
  if (sel) { circ(g, x, y, R + 10); g.strokeStyle = '#fff3c4'; g.lineWidth = 2.5; g.setLineDash([5, 4]); g.stroke(); g.setLineDash([]); circ(g, x, y, R + 10); g.strokeStyle = rgba(BRASS_D, 0.35); g.lineWidth = 1; g.stroke(); }
}

// ---------------------------------------------------------------- the board under the nodes (bands, ribbons, links, glows)
function paintBoard(c, app, L, sel, k) {
  const G = app.G, d = DPR() * k, g = c.getContext('2d');
  const W = Math.round(SW * d), H = Math.round(SH * d);
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, SW, SH);
  for (const b of L.B) {
    const y = LY0 + b.i * LDY;
    rr(g, 2, y - 66, SW - 4, 136, 14); g.fillStyle = rgba(b.color, 0.09); g.fill(); g.strokeStyle = rgba(b.color, 0.28); g.lineWidth = 1; g.stroke();
    // ribbon tab
    g.save(); g.shadowColor = 'rgba(60,30,10,0.25)'; g.shadowBlur = 4; g.shadowOffsetY = 2;
    pathPts(g, [[2, y - 24], [196, y - 24], [212, y], [196, y + 24], [2, y + 24]]); g.fillStyle = vgrad(g, y - 24, y + 24, [[0, shade(b.color, 0.12)], [1, shade(b.color, -0.12)]]); g.fill(); g.restore();
    pathPts(g, [[2, y - 24], [196, y - 24], [212, y], [196, y + 24], [2, y + 24]]); g.strokeStyle = rgba(shade(b.color, -0.4), 0.6); g.lineWidth = 1; g.stroke();
    g.fillStyle = rgba('#ffffff', 0.18); g.fillRect(3, y - 23, 193, 9);
    glyph(g, b.icon, 28, y, 0.92);
    text(g, b.name, 50, y + 6, { size: b.name.length > 13 ? 15 : 16.5, weight: 'bold', font: SERIF, color: '#fff6e0', shadow: 'rgba(0,0,0,0.35)', blur: 2, sy: 1 });
  }
  const done = new Set(G ? G.research.done : []);
  const links = [];
  for (const r of L.list) for (const n of r.needs || []) if (L.pos[n]) links.push([n, r.id]);
  // dashed (unmet) first, solid (met) on top
  for (const pass of [0, 1]) for (const [a, b] of links) {
    const on = done.has(a); if (on !== !!pass) continue;
    const A = L.pos[a], B = L.pos[b];
    const x0 = A.x + (A.y === B.y ? 38 : 30), x1 = B.x - (A.y === B.y ? 38 : 30);
    g.beginPath();
    if (A.y === B.y) { g.moveTo(x0, A.y); g.lineTo(x1, B.y); }
    else { const dy = B.y > A.y ? 1 : -1; g.moveTo(A.x + 26, A.y + dy * 18); g.bezierCurveTo((A.x + B.x) / 2, A.y + dy * 30, (A.x + B.x) / 2, B.y - dy * 30, B.x - 28, B.y - dy * 16); }
    g.save(); g.lineCap = 'round';
    if (!on) { g.setLineDash([7, 7]); g.strokeStyle = rgba('#8a7a6a', 0.75); g.lineWidth = 2.6; g.stroke(); }
    else { g.strokeStyle = '#a8702a'; g.lineWidth = 5; g.stroke(); g.strokeStyle = rgba('#ffe6a0', 0.85); g.lineWidth = 1.5; g.stroke(); }
    g.restore();
  }
  for (const r of L.list) {
    const st = stateOf(G, r), p = L.pos[r.id];
    if (st === 'avail' || r.id === sel) glow(g, p.x, p.y, r.id === sel ? 92 : 70, p.b.color, r.id === sel ? 0.55 : 0.32);
    if (st === 'prog') glow(g, p.x, p.y, 70, '#4cc070', 0.28);
  }
}

// ---------------------------------------------------------------- painted vignette per tech
const SKIES = {
  0: [[0, '#5a4a88'], [0.55, '#f0a070'], [1, '#ffd8a0']],
  1: [[0, '#3a6ab8'], [0.6, '#8ac0f0'], [1, '#e8f4ff']],
  2: [[0, '#1c2a6a'], [0.55, '#3a7ab0'], [1, '#a8e8f0']],
  3: [[0, '#2a2048'], [0.55, '#6a4a7a'], [1, '#d88a7a']],
};
export function paintVignette(g, r, cx, cy, R, bi = 0) {
  const id = r.id, seed = strSeed(id);
  const e = { ...ENV }; ENV.lx = -0.6; ENV.ly = -0.7;
  g.save(); circ(g, cx, cy, R); g.clip();
  g.fillStyle = vgrad(g, cy - R, cy + R, SKIES[bi] || SKIES[1]); g.fillRect(cx - R, cy - R, R * 2, R * 2);
  const night = id === 'beacon' || id === 'stormtaming' || id === 'rods';
  if (night) { g.fillStyle = rgba('#0a0a30', 0.45); g.fillRect(cx - R, cy - R, R * 2, R * 2); const S = rng(seed); g.fillStyle = '#fff'; for (let i = 0; i < 26; i++) { circ(g, cx + (S() - 0.5) * 2 * R, cy - R + S() * R, 0.6 + S()); g.fill(); } }
  else glow(g, cx - R * 0.45, cy - R * 0.5, R * 0.9, '#fff2c0', 0.5);
  cloud(g, cx - R * 0.55, cy - R * 0.45, R * 0.8, R / 200, '#ffffff', '#c8d4ec', seed % 97, 0.55);
  const lit = night ? '#9aa4d0' : '#ffffff', dark = night ? '#3a3a6a' : '#b4c8e8';
  const s = R / 104, isl = (o) => island(g, { x: cx, y: cy + 4 * s, rx: 70 * s, ry: 20 * s, depth: 64 * s, seed: (seed % 50) + 3, cs: 0.7 * s, roots: 6, spikes: 1, ...o });
  const big = (gid, x, y, k) => glyph(g, gid, x, y, k * s);
  const lowCloud = () => cloud(g, cx - 20 * s, cy + 100 * s, 260 * s, 0.95 * s, lit, dark, seed % 13 + 2);
  switch (id) {
    case 'skiffs': case 'cargoholds': case 'propellers': case 'charters': case 'militia': case 'galleons': {
      lowCloud();
      island(g, { x: cx - 52 * s, y: cy + 54 * s, rx: 42 * s, ry: 12 * s, depth: 38 * s, seed: 9, cs: 0.4 * s, roots: 3, spikes: 1 });
      cottage(g, cx - 66 * s, cy + 56 * s, 0.5 * s, { roof: '#5d6fa6' });
      if (id === 'skiffs') { big('skiffs', cx + 18 * s, cy - 8 * s, 3.4); big('skiffs', cx + 66 * s, cy - 48 * s, 1.4); }
      else if (id === 'galleons') { big('galleons', cx + 14 * s, cy - 10 * s, 4.2); }
      else if (id === 'militia') { miniAirship(g, cx + 22 * s, cy - 26 * s, 0.5 * s, { env: ['#e0ecf8', '#7a90b0'], band: '#3e74c0', cannons: true, flag: '#3e74c0', hull: '#6a5a50' }); miniAirship(g, cx + 70 * s, cy + 18 * s, 0.26 * s, { env: ['#e0ecf8', '#7a90b0'], band: '#3e74c0', cannons: true }); }
      else { miniAirship(g, cx + 18 * s, cy - 22 * s, 0.52 * s, { band: id === 'charters' ? '#c84a3a' : '#3e74c0', cargo: id === 'cargoholds' ? '#c08a4e' : null, flag: '#c84a3a' }); if (id === 'propellers') big('propellers', cx + 64 * s, cy + 26 * s, 1.9); if (id === 'charters') big('coin', cx + 62 * s, cy + 34 * s, 1.7); }
      break;
    }
    case 'stormtaming': case 'rods': {
      puffGroup(g, [[cx - 50 * s, cy - 58 * s, 34 * s], [cx, cy - 72 * s, 42 * s], [cx + 52 * s, cy - 56 * s, 32 * s]], '#9aa0c8', '#3a3a6a');
      lowCloud();
      isl({ crystals: id === 'stormtaming' ? undefined : false });
      big('rod', cx + 18 * s, cy - 22 * s, 2.2);
      g.strokeStyle = '#fff6b0'; g.lineWidth = 3 * s; g.lineJoin = 'round'; g.beginPath(); g.moveTo(cx - 10 * s, cy - 54 * s); g.lineTo(cx + 4 * s, cy - 40 * s); g.lineTo(cx - 2 * s, cy - 36 * s); g.lineTo(cx + 18 * s, cy - 50 * s); g.stroke();
      glow(g, cx + 18 * s, cy - 48 * s, 50 * s, '#bfefff', 0.8);
      if (id === 'stormtaming') { big('stormtaming', cx - 42 * s, cy - 14 * s, 1.5); }
      break;
    }
    case 'beacon': {
      lowCloud(); isl({ grass: ['#9ac0a0', '#4a7a5a'] });
      glow(g, cx, cy - 70 * s, 130 * s, '#c08aff', 0.6);
      g.fillStyle = rgba('#e8d8ff', 0.35); pathPts(g, [[cx - 6 * s, cy - 40 * s], [cx + 6 * s, cy - 40 * s], [cx + 30 * s, cy - R], [cx - 30 * s, cy - R]]); g.fill();
      big('beacon', cx, cy - 26 * s, 2.8);
      break;
    }
    case 'levitation': case 'drift': {
      lowCloud();
      isl({});
      cottage(g, cx - 40 * s, cy + 2 * s, 0.6 * s); tree(g, cx + 30 * s, cy + 2 * s, 0.6 * s); windmill(g, cx - 4 * s, cy - 6 * s, 0.5 * s, 0.5);
      for (const sx of [-1, 1]) { const ex = cx + sx * 66 * s, ey = cy + 22 * s; pathPts(g, [[ex - 10 * s, ey - 8 * s], [ex + 10 * s, ey - 8 * s], [ex + 8 * s, ey + 12 * s], [ex - 8 * s, ey + 12 * s]]); g.fillStyle = vgrad(g, ey - 8 * s, ey + 12 * s, [[0, '#f0d080'], [1, '#a8702a']]); g.fill(); g.strokeStyle = 'rgba(42,24,34,0.8)'; g.lineWidth = 1.2; g.stroke(); glow(g, ex, ey + 18 * s, 30 * s, '#6fe8ff', 0.8); }
      for (let i = 0; i < 3; i++) { g.strokeStyle = rgba('#e8fbff', 0.5 - i * 0.12); g.lineWidth = 2; ell(g, cx, cy + 70 * s + i * 12 * s, (40 + i * 14) * s, (6 + i * 2) * s); g.stroke(); }
      if (id === 'drift') { g.strokeStyle = rgba('#ffffff', 0.8); g.lineWidth = 2.4 * s; g.lineCap = 'round'; for (const yy of [-40, -10, 20]) { g.beginPath(); g.moveTo(cx - 96 * s, cy + yy * s); g.lineTo(cx - 76 * s, cy + yy * s); g.stroke(); } big('compass', cx + 62 * s, cy - 56 * s, 1.5); }
      break;
    }
    case 'shields': {
      lowCloud(); isl({}); cottage(g, cx - 30 * s, cy + 2 * s, 0.6 * s, { roof: '#5d6fa6' }); cottage(g, cx + 6 * s, cy - 4 * s, 0.5 * s);
      g.beginPath(); g.ellipse(cx, cy + 8 * s, 76 * s, 82 * s, 0, Math.PI, 0); g.fillStyle = rgba('#9fe0ff', 0.25); g.fill(); g.strokeStyle = rgba('#bff0ff', 0.9); g.lineWidth = 2.4 * s; g.stroke();
      g.strokeStyle = rgba('#ffffff', 0.6); g.lineWidth = 1.2 * s; g.beginPath(); g.ellipse(cx, cy + 8 * s, 64 * s, 70 * s, 0, Math.PI + 0.3, Math.PI + 1.1); g.stroke();
      glow(g, cx, cy - 30 * s, 70 * s, '#9fe0ff', 0.3);
      break;
    }
    case 'crystallore': {
      lowCloud(); isl({ grass: ['#a8d8c8', '#4a8a7a'] });
      const S = rng(5); const cols = ['#e9feff', '#64e0f0', '#2a6ab0'];
      for (let i = 0; i < 7; i++) crystal(g, cx + (S() - 0.5) * 100 * s, cy + (S() - 0.2) * 14 * s, (14 + S() * 22) * s, Math.PI + (S() - 0.5) * 0.7, cols);
      glow(g, cx, cy - 10 * s, 70 * s, '#6fe8ff', 0.5);
      break;
    }
    default: {
      lowCloud(); isl({});
      const S = rng(seed); if (S() < 0.7) tree(g, cx - 54 * s, cy + 4 * s, 0.55 * s, { kind: S() < 0.5 ? 'pine' : null });
      cottage(g, cx + 34 * s, cy + 2 * s, 0.45 * s);
      const gid = hasGlyph(id) ? id : r.icon;
      g.save(); g.fillStyle = 'rgba(20,30,15,0.28)'; ell(g, cx + 4 * s, cy + 2 * s, 34 * s, 8 * s); g.fill(); g.restore();
      big(gid, cx, cy - 26 * s, 3.1);
      if (/bellows|foundry|turbines|assembly|automatons/.test(id)) glow(g, cx, cy - 20 * s, 70 * s, '#ffb050', 0.35);
    }
  }
  // rim light / vignette
  const vg = g.createRadialGradient(cx, cy, R * 0.6, cx, cy, R); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(20,10,40,0.3)'); g.fillStyle = vg; g.fillRect(cx - R, cy - R, R * 2, R * 2);
  g.restore();
  circ(g, cx, cy, R); g.strokeStyle = BRASS_D; g.lineWidth = 5; g.stroke(); circ(g, cx, cy, R + 4.5); g.strokeStyle = BRASS; g.lineWidth = 1.6; g.stroke();
  Object.assign(ENV, e);
}
const vigCache = new Map();
function vignetteCanvas(r, bi, size) {
  const k = `${r.id}|${size}|${DPR()}`;
  let c = vigCache.get(k);
  if (!c) { const d = DPR(); c = layer(size * d, size * d); const g = c.getContext('2d'); g.scale(d, d); paintVignette(g, r, size / 2, size / 2, size / 2 - 7, bi); vigCache.set(k, c); }
  return c;
}

// ---------------------------------------------------------------- unlock rows
function unlockRow(app, u) {
  const C = content(app);
  if (u && typeof u === 'object') return h('li', null, iconImg(u.icon || 'star', 30), h('span', null, u.text || ''));
  u = String(u);
  const m = /^(link|ship|ability|feature):(.+)$/.exec(u);
  if (m) {
    if (m[1] === 'feature') return h('li', null, iconImg('star', 30), h('span', null, humanize(m[2])));
    u = m[2];
  }
  const b = C.buildings.find((x) => x.id === u), sh = C.ships.find((x) => x.id === u), df = C.defends.find((x) => x.id === u), ln = C.links.find((x) => x.id === u);
  const abil = ['volley', 'lash', 'shield', 'militia'].includes(u);
  let ic = 'star', label = String(u), kind = '';
  if (b) { ic = u; label = b.name; kind = 'building'; }
  else if (ln) { ic = u; label = ln.name || humanize(u); kind = 'link'; }
  else if (sh) { ic = hasGlyph(u) ? u : 'airship'; label = sh.name; kind = 'airship'; }
  else if (df || abil) { ic = u; label = df?.name || nameOf(app, u); kind = 'ability'; }
  else if (hasGlyph(u) && !/\s/.test(u)) { ic = u; label = nameOf(app, u); }
  else if (/trade|route|income|price|contract/i.test(label)) ic = 'coin';
  else if (/ship|fly|cargo/i.test(label)) ic = 'airship';
  else if (/island|chart|drift/i.test(label)) ic = 'island';
  else if (/storm|lightning|tempest/i.test(label)) ic = 'storm';
  else if (/worker|settler/i.test(label)) ic = 'settler';
  else if (/\+|%|faster|more/i.test(label)) ic = 'up';
  return h('li', null, iconImg(ic, 30), h('span', null, label, kind ? h('small', null, ' · ' + kind) : null));
}

export function createResearch(app) {
  let L = null, sel = null, k = 1, nodes = {}, ui = {}, sig = '', acc = 0, msg = '';
  const P = makePanel(app, {
    name: 'research', scene: 'research', title: 'Skyforge Academy',
    build(el) {
      L = layout(app);
      const G = app.G;
      if (!sel || !L.pos[sel]) sel = pickDefault();
      ui = {};
      ui.insight = h('b', null, '0');
      ui.sub = h('p', { class: 'rs-sub' });
      ui.board = h('canvas', { class: 'rs-lines' });
      ui.stage = h('div', { class: 'rs-stage' }, ui.board);
      ui.sizer = h('div', { class: 'rs-sizer' }, ui.stage);
      ui.scroll = h('div', { class: 'rs-scroll' }, ui.sizer);
      nodes = {};
      for (const r of L.list) {
        const p = L.pos[r.id], c = h('canvas', { class: 'rs-med' });
        const lab = h('span', { class: 'rs-name' }, r.name || humanize(r.id)), st = h('span', { class: 'rs-st' });
        const btn = h('button', { class: 'rs-node', type: 'button', 'data-research': r.id, style: { left: p.x - 60 + 'px', top: p.y - 54 + 'px', '--bc': p.b.color }, onclick: () => select(r.id) }, c, lab, st);
        nodes[r.id] = { btn, c, st, r, key: '' };
        ui.stage.appendChild(btn);
      }
      ui.card = h('aside', { class: 'rs-card sfp-parch' });
      el.appendChild(h('div', { class: 'sfp-veil' }));
      el.appendChild(h('div', { class: 'rs-wrap' },
        h('div', { class: 'rs-book sfp-parch' },
          h('header', { class: 'rs-head' }, h('div', null, h('h1', null, 'Skyforge Academy'), ui.sub), h('div', { class: 'sfp-pill', title: 'Insight' }, iconImg('insight', 26, { style: 'plain' }), ui.insight, h('span', null, ' insight'))),
          ui.scroll),
        ui.card));
      sig = ''; fit(); refresh(true);
      // refit once laid out in the host, and whenever the board's box changes size
      if (typeof ResizeObserver === 'function') { ui.ro = new ResizeObserver(() => { if (ui.scroll && `${ui.scroll.clientWidth}x${ui.scroll.clientHeight}` !== ui.fitKey) fit(); }); ui.ro.observe(ui.scroll); }
      if (G && G.research.current && L.pos[G.research.current]) requestAnimationFrame(() => scrollTo(sel));
    },
    resize() { fit(); refresh(true); },
    update(dt) { acc += dt; if (acc > 0.2) { acc = 0; refresh(false); } },
    teardown() { ui.ro?.disconnect(); nodes = {}; ui = {}; },
  });
  function pickDefault() {
    const G = app.G; if (!G || !L) return L?.list[0]?.id || null;
    const avail = L.list.filter((r) => stateOf(G, r) === 'avail').sort((a, b) => (a.tier || 0) - (b.tier || 0));
    return avail[0]?.id || G.research.current || L.list[0]?.id;
  }
  function fit() {
    if (!ui.scroll) return;
    ui.fitKey = `${ui.scroll.clientWidth}x${ui.scroll.clientHeight}`;
    const narrow = innerWidth < 760 || innerWidth / innerHeight < 0.9;
    const aw = ui.scroll.clientWidth || innerWidth * 0.7, ah = ui.scroll.clientHeight || innerHeight * 0.7;
    k = narrow ? Math.max(0.6, Math.min(0.7, aw / SW)) : Math.max(0.42, Math.min(aw / SW, ah / SH, 1.35));
    ui.stage.style.transform = `scale(${k})`;
    ui.sizer.style.width = SW * k + 'px'; ui.sizer.style.height = SH * k + 'px';
    ui.board.style.width = SW + 'px'; ui.board.style.height = SH + 'px';
    ui.scroll.classList.toggle('pan', narrow || SW * k > aw + 1);
    ui.stage.classList.toggle('narrow', narrow);
  }
  function scrollTo(id) { const p = L?.pos[id]; if (!p || !ui.scroll) return; ui.scroll.scrollLeft = Math.max(0, p.x * k - ui.scroll.clientWidth / 2); }
  function select(id, user = true) {
    if (!L || !L.pos[id]) return; sel = id; msg = ''; sig = ''; refresh(true); app.ev?.emit('ui:research-select', { id });
    if (user && ui.stage?.classList.contains('narrow')) requestAnimationFrame(() => ui.card?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  function begin() {
    const r = L.list.find((x) => x.id === sel); if (!r) return;
    const res = app.act.research(r.id);
    msg = res && res.ok ? '' : (res?.error || 'Cannot start this yet');
    if (res?.ok) app.ev?.emit('ui:sfx', { kind: 'research' });
    sig = ''; refresh(true);
  }
  function cancel() { const res = app.act.cancelResearch(); msg = res?.ok ? '' : res?.error || ''; sig = ''; refresh(true); }

  function refresh(force) {
    const G = app.G; if (!L || !ui.card) return;
    const R = G ? G.research : { current: null, done: [], queue: [] };
    const cur = L.list.find((x) => x.id === R.current);
    const prog = cur ? progressOf(G, cur) : 0;
    setText(ui.insight, fmt(stock(G, 'insight')));
    const sch = scholars(G);
    setText(ui.sub, `Research · ${sch ? `${sch} scholar${sch === 1 ? '' : 's'} at work` : 'build an Academy to train scholars'}`);
    const s2 = JSON.stringify([R.current, R.done, R.queue, sel, Math.floor(stock(G, 'insight')), k, msg]);
    const structural = force || s2 !== sig;
    if (structural) { sig = s2; paintBoard(ui.board, app, L, sel, Math.max(1, k)); }
    for (const id in nodes) {
      const n = nodes[id], st = stateOf(G, n.r), p = st === 'prog' ? Math.round(prog * 100) / 100 : 0;
      const qn = st === 'queued' ? R.queue.indexOf(id) + 1 : 0;
      const key = `${st}|${p}|${id === sel}|${qn}|${k}`;
      if (key !== n.key) { n.key = key; paintNode(n.c, n.r, st, L.pos[id].b.color, p, id === sel, Math.max(1, k), qn); }
      n.btn.dataset.state = st; n.btn.classList.toggle('sel', id === sel);
      n.btn.setAttribute('aria-label', `${n.r.name}: ${({ done: 'researched', prog: 'researching', avail: 'ready', queued: 'queued', locked: 'locked' })[st]}`);
      setText(n.st, st === 'prog' ? `${Math.round(prog * 100)}% · ${left(etaOf(G, n.r))}` : st === 'avail' ? 'Ready' : st === 'queued' ? `Queued #${qn}` : '');
    }
    if (structural) buildCard(); else tickCard();
  }

  function buildCard() {
    const G = app.G, r = L.list.find((x) => x.id === sel), card = ui.card;
    card.replaceChildren();
    if (!r) return;
    const b = L.pos[r.id].b, st = stateOf(G, r), bi = b.i;
    const vsize = Math.round(Math.max(120, Math.min(212, innerHeight * (innerHeight < 800 ? 0.2 : 0.26))));
    const vc = h('canvas', { class: 'rs-vig', width: 1, height: 1 });
    const src = vignetteCanvas(r, bi, vsize); vc.width = src.width; vc.height = src.height; vc.style.width = vc.style.height = vsize + 'px'; vc.getContext('2d').drawImage(src, 0, 0);
    const cost = costOfR(r);
    const costs = Object.entries(cost).map(([res, n]) => chipEl(iconImg(res, 22, { style: 'plain' }), fmt(n), { cls: stock(G, res) >= n ? '' : 'short', title: `${resName(app, res)}: ${fmt(stock(G, res))} / ${fmt(n)}` }));
    const unlocks = Array.isArray(r.effects) && r.effects.length ? r.effects : (r.unlocks || []).filter((u) => !/^feature:/.test(u));
    const needsMissing = (r.needs || []).filter((n) => !R().done.includes(n));
    const affordable = Object.entries(cost).every(([res, n]) => stock(G, res) >= n);
    let label = 'Begin Research', dis = false, note = '';
    if (st === 'done') { label = 'Researched'; dis = true; }
    else if (st === 'prog') { label = 'Studying…'; dis = true; }
    else if (st === 'queued') { label = 'In the queue'; dis = true; }
    else if (st === 'locked') { label = 'Locked'; dis = true; note = 'Needs ' + needsMissing.map((n) => nameOf(app, n)).join(' and '); }
    else if (R().current) { label = 'Add to Queue'; }
    if (!dis && !affordable) note = 'Not enough ' + Object.entries(cost).filter(([res, n]) => stock(G, res) < n).map(([res]) => resName(app, res).toLowerCase()).join(', ');
    const sch = scholars(G);
    ui.btn = h('button', { id: 'btn-begin-research', class: 'sfp-btn primary big', type: 'button', disabled: dis || null, onclick: begin }, label);
    ui.cur = h('div', { class: 'rs-now' });
    card.append(...[
      h('div', { class: 'rs-ribbon', style: { background: b.color } }, `${b.name} · Tier ${r.tier || (L.list.filter((x) => L.pos[x.id].b === b).indexOf(r) + 1)}`),
      h('div', { class: 'rs-vigwrap' }, vc),
      h('h2', null, r.name || humanize(r.id)),
      h('p', { class: 'rs-desc' }, r.desc || ''),
      unlocks.length ? h('h3', null, 'Unlocks') : null,
      unlocks.length ? h('ul', { class: 'rs-unlocks' }, unlocks.slice(0, 4).map((u) => unlockRow(app, u))) : null,
      Object.keys(cost).length ? h('h3', null, 'Cost') : null,
      h('div', { class: 'sfp-chips' }, costs),
      h('p', { class: 'rs-time' }, `Time ${isFinite(etaOf(G, r)) ? dur(st === 'prog' ? etaOf(G, r) / Math.max(0.01, 1 - progressOf(G, r)) : etaOf(G, r)) : dur(r.time || 0)} · ${sch ? `${sch} scholar${sch === 1 ? '' : 's'}` : 'no scholars yet'}`),
      ui.btn,
      note || msg ? h('p', { class: 'rs-note' + (msg ? ' err' : '') }, msg || note) : null,
      queueEl(),
      ui.cur,
    ].filter(Boolean));
    tickCard();
  }
  const R = () => (app.G ? app.G.research : { current: null, done: [], queue: [] });
  function queueEl() {
    const q = (R().queue || []).filter((id) => L.pos[id]);
    if (!q.length) return null;
    return h('div', { class: 'rs-queue' }, h('h3', null, 'Queue'), h('ol', null, q.map((id) => h('li', null, iconImg(id, 24, { style: 'parchment' }), nameOf(app, id)))));
  }
  function tickCard() {
    const G = app.G, el = ui.cur; if (!el) return;
    const cur = L.list.find((x) => x.id === R().current);
    if (!cur) {
      if (el.dataset.k !== 'idle') { el.dataset.k = 'idle'; el.replaceChildren(h('small', null, 'Now studying'), h('div', { class: 'rs-nowrow' }, h('b', null, 'Nothing'), h('span', { class: 'idle' }, 'scholars idle'))); }
      return;
    }
    const p = progressOf(G, cur);
    if (el.dataset.k !== cur.id) {
      el.dataset.k = cur.id;
      ui.left = h('span', null, ''); ui.bar = h('i');
      el.replaceChildren(h('small', null, 'Now studying'), h('div', { class: 'rs-nowrow' }, h('b', null, cur.name), ui.left),
        h('div', { class: 'sfp-bar green' }, ui.bar),
        h('button', { id: 'btn-cancel-research', class: 'sfp-link', type: 'button', onclick: cancel }, 'Cancel'));
    }
    setText(ui.left, isFinite(etaOf(G, cur)) ? `${clock(etaOf(G, cur))} left` : 'no scholars');
    ui.bar.style.width = Math.round(p * 1000) / 10 + '%';
  }
  P.select = (id) => select(id, false);
  return P;
}
