// The easel's layout and its baked backdrop, shared by the paint screen and
// the come-alive screen so the page sits in exactly the same place on both.
// The page is always 4:3; around it: Home top left, the star meter at the
// top, Undo on the left, the magic wand on the right, paint pots below
// (one row on wide screens, two rows of five on narrow ones).
import { meadow, scatter } from '../art.js';
import { INK, rgba, bl, rrect, wob, spath, inkLine, wash, softShadow, layer, clamp } from '../lib.js';

export function easelLayout(W, H, br, phone) {
  const por = H > W * 1.05, m = br * 0.35, L = { por, m };
  L.home = [m + br, m + br, br];
  const minPot = phone ? 60 : 84;
  const gr = br * 1.45, ur = br * 1.12;
  let rows = 1, potW = Math.min((W - 2 * m) / 10.4, Math.max(H * 0.15, por ? 0 : minPot), 128);
  if (por || potW < minPot) { rows = 2; potW = Math.min((W - 2 * m) / 5.4, H * (por ? 0.1 : 0.13), 128); }
  potW = Math.max(potW, Math.min(minPot, (W - 2 * m) / (rows === 1 ? 10 : 5)));
  const potH = potW * (!por && H < 500 ? 1.18 : 1.32), trayH = rows * potH + m * 0.4;
  const mr = clamp(Math.min(W, H) * 0.032, 13, 30);
  L.meter = { r: mr };
  if (!por) {
    L.meter.x = W / 2; L.meter.y = m + mr * 1.7;
    const top = L.meter.y + mr * 1.8 + m * 0.5, bottom = H - trayH - m * 0.9;
    const colW = Math.max(gr, ur) * 2 + m * 2;
    const ph = Math.max(80, Math.min(bottom - top, (W - colW * 2) * 0.75)), pw = ph / 0.75;
    L.page = { x: W / 2 - pw / 2, y: top + (bottom - top - ph) / 2, w: pw, h: ph };
    const cy = L.page.y + ph * 0.52;
    L.undo = [Math.max(m + ur, L.page.x - m * 1.5 - ur), cy, ur];
    L.go = [Math.min(W - m - gr, L.page.x + pw + m * 1.5 + gr), cy, gr];
  } else {
    L.meter.x = Math.max(W / 2, m * 2 + br * 2 + mr * 7); L.meter.y = m + br;
    const top = m * 2 + br * 2;
    const goRow = gr * 2 + m;
    const avail = H - top - goRow - trayH - m * 2.5;
    const pw = Math.max(120, Math.min(W - 2 * m, avail / 0.75)), ph = pw * 0.75;
    const stack = ph + goRow + trayH + m * 1.5, y0 = top + Math.max(0, (H - top - stack) / 2);
    L.page = { x: W / 2 - pw / 2, y: y0, w: pw, h: ph };
    const ry = y0 + ph + m * 0.6 + gr;
    L.undo = [m + ur + m, ry, ur];
    L.go = [W - m - gr - m, ry, gr];
  }
  // paint pots
  const pots = [], py0 = H - trayH - m * 0.2;
  const perRow = rows === 1 ? 10 : 5, rowW = perRow * potW;
  for (let i = 0; i < 10; i++) {
    const row = Math.floor(i / perRow), col = i % perRow;
    pots.push({ x: W / 2 - rowW / 2 + (col + 0.5) * potW, y: py0 + row * potH + potH * 0.62, w: potW * 0.96, h: potH * 0.98, s: (potW * 0.86) / 100 });
  }
  L.pots = pots; L.tray = { x: W / 2 - rowW / 2 - m, y: py0 - m * 0.3, w: rowW + 2 * m, h: trayH + m * 2 };
  return L;
}

// sky, meadow, easel legs, the taped sheet of paper and the pot shelf
export function paintEaselBg(g, W, H, L, o = {}) {
  const k = Math.max(Math.min(W / 1600, H / 900), W / 1400);
  const p = L.page;
  meadow(g, W, H, k, { sunX: W - L.m - 60 * k, sunY: L.por ? H * 0.04 + 50 * k : 92 * k + L.m, sunR: 44 * k, clouds: [[W * 0.11, H * 0.1, 0.7 * k, 1], [W * 0.72, H * 0.08, 0.6 * k, 3]], ground: Math.max(p.y + p.h * 0.55, H * 0.5), far: Math.max(p.y + p.h * 0.4, H * 0.42), skyTo: H * 0.7 });
  scatter(g, W, Math.max(p.y + p.h * 0.6, H * 0.6), H, Math.round(W / 22), 21, [[W / 2, H, p.w * 0.6, H * 0.15]], k);
  const wood = '#c98a52', s = p.h / 566;
  for (const [x0, x1] of [[p.x + p.w * 0.15, p.x + p.w * 0.09], [p.x + p.w * 0.85, p.x + p.w * 0.91]]) {
    const Lg = bl(x0 - 14 * s, p.y + 40 * s, x0 + 14 * s, p.y + 40 * s, x1 + 16 * s, p.y + p.h + 70 * s, x1 - 16 * s, p.y + p.h + 70 * s);
    wash(g, Lg, wood, Math.round(x0), { top: '#e8b57e', edge: 0.4, k: s, wob: 3 * s }); inkLine(g, Lg, Math.max(2, 4 * s), Math.round(x0));
  }
  const top = rrect(p.x + p.w / 2 - 40 * s, p.y - 40 * s, 80 * s, 60 * s, 14 * s); wash(g, top, wood, 3, { top: '#e8b57e', k: s, wob: 3 * s }); inkLine(g, top, Math.max(2, 4 * s), 3);
  softShadow(g, p.x + p.w / 2, p.y + p.h + 10 * s, p.w * 0.55, 26 * s, 0.3);
  g.save(); g.shadowColor = 'rgba(60,30,80,0.25)'; g.shadowBlur = 24 * s; g.shadowOffsetY = 10 * s;
  const sheet = wob(rrect(p.x, p.y, p.w, p.h, 10 * s), 1.5 * s, 2); g.fillStyle = '#fffcf3'; g.fill(spath(sheet)); g.restore();
  g.save(); g.clip(spath(sheet));
  const gr = g.createRadialGradient(p.x + p.w / 2, p.y + p.h / 2, p.h * 0.35, p.x + p.w / 2, p.y + p.h / 2, p.w * 0.75);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(200,170,120,0.18)'); g.fillStyle = gr; g.fillRect(p.x, p.y, p.w, p.h); g.restore();
  inkLine(g, sheet, Math.max(1.5, 3 * s), 9, { col: rgba(INK, 0.55), second: 0.25 });
  const ledge = rrect(p.x + p.w * 0.03, p.y + p.h + 4 * s, p.w * 0.94, 26 * s, 10 * s); wash(g, ledge, wood, 7, { top: '#e8b57e', k: s, wob: 2 * s }); inkLine(g, ledge, Math.max(2, 4 * s), 7);
  if (o.shelf !== false) {
    const t = L.tray, sh = rrect(t.x, t.y, t.w, t.h + 60, Math.min(40, t.h * 0.3));
    wash(g, sh, '#f3e3c3', 11, { top: '#fff6e0', bottom: '#d9bf8f', edge: 0.3, k: Math.max(0.5, t.h / 200), wob: 3 });
    inkLine(g, sh, 3.5, 11, { col: rgba(INK, 0.7) });
  }
}

// the four bits of tape over the corners, drawn above the paint
export function drawTape(g, p) {
  const s = p.h / 566;
  for (const [x, y, a] of [[p.x + 18 * s, p.y + 12 * s, -0.6], [p.x + p.w - 18 * s, p.y + 12 * s, 0.6], [p.x + 18 * s, p.y + p.h - 12 * s, 0.6], [p.x + p.w - 18 * s, p.y + p.h - 12 * s, -0.6]]) {
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = 'rgba(255,214,120,0.82)'; g.fillRect(-36 * s, -14 * s, 72 * s, 28 * s);
    g.strokeStyle = 'rgba(180,130,50,0.5)'; g.lineWidth = 1.5; g.strokeRect(-36 * s, -14 * s, 72 * s, 28 * s);
    g.restore();
  }
}
export { layer };
