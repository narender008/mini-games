// Overlay (RENDERER): the build ghost at the hovered cell (app.hover from
// INPUT: { island, u, v, w, d, type, valid, reason }), green/red footprint,
// ranges of batteries, rods and wells, the selection ring, the link preview,
// a reticle on the focused pirate, island name banners and the parchment trade
// labels of concept 3 ("From Verdant Drift · grain").
import { T, DX, DY, wpx, toScreen } from './camera.js';
import { CFG } from '../config.js';
import { rgba, mix, clamp, lerp, rr, circ, ell, glow, catenary, SANS, SERIF, BRASS, BRASS_D, INK, TAU } from './kit.js';
import { local, cellAt } from './islands.js';

const RANGE_COL = { harpoon: '#ffcf6a', bastion: '#ff9a6a', rod: '#9ef0ff', well: '#7fc8ff', shieldgen: '#9ef0ff', observatory: '#d8c0ff' };

export function rangeOf(type, level = 1) {
  const C = CFG.threats || {};
  const lv = level > 1 ? (C.defence?.lvl2 || 1.25) : 1;
  if (type === 'harpoon' || type === 'bastion') return (C.defence?.[type]?.range || (type === 'harpoon' ? 11 : 15)) * lv;
  if (type === 'rod') { for (const v of Object.values(C)) if (v && typeof v === 'object' && v.rodRange) return v.rodRange; return 4.5; }
  if (type === 'well') return C.combat?.wellR || 6;
  return 0;
}

export function createOverlay(app, R) {
  const content = () => app.content || {};
  const def = (type) => content().BUILDINGS?.find?.((b) => b.id === type);
  const isl = (G, id) => G.islands.find((i) => i.id === id);

  // ground ellipse of radius r tiles around world (x, y) at altitude z
  function ring(g, x, y, z, r, col, a, dash) {
    g.beginPath();
    for (let i = 0; i <= 64; i++) { const t = i / 64 * TAU, [px, py] = wpx(x + Math.cos(t) * r, y + Math.sin(t) * r, z); i ? g.lineTo(px, py) : g.moveTo(px, py); }
    g.fillStyle = rgba(col, a * 0.12); g.fill();
    if (dash) g.setLineDash(dash);
    g.strokeStyle = rgba(col, a); g.lineWidth = 2; g.stroke(); g.setLineDash([]);
  }
  function cellPoly(g, I, u, v, w = 1, d = 1, inset = 0.04) {
    const [ox, oy] = wpx(I.ox, I.oy, I.alt);
    const p = (a, b) => { const [x, y] = local(a, b); return [ox + x, oy + y]; };
    const A = p(u + inset, v + inset), B = p(u + w - inset, v + inset), C = p(u + w - inset, v + d - inset), D = p(u + inset, v + d - inset);
    g.beginPath(); g.moveTo(...A); g.lineTo(...B); g.lineTo(...C); g.lineTo(...D); g.closePath();
  }
  function tag(g, x, y, label, o = {}) {
    g.save();
    g.font = `bold ${o.size || 13}px ${SANS}`;
    const w = g.measureText(label).width + (o.icon ? 38 : 20), h = (o.size || 13) + 11;
    rr(g, x - w / 2, y - h / 2, w, h, 6); g.fillStyle = rgba(o.bg || '#fbf1da', 0.94); g.fill(); g.strokeStyle = o.border || BRASS_D; g.lineWidth = 1.5; g.stroke();
    if (o.icon) { g.fillStyle = o.iconCol || '#e0b25a'; circ(g, x - w / 2 + 15, y, 7); g.fill(); g.strokeStyle = 'rgba(30,16,24,0.8)'; g.lineWidth = 1.1; g.stroke(); if (o.glyph) o.glyph(g, x - w / 2 + 15, y); }
    g.fillStyle = o.color || INK; g.textBaseline = 'middle'; g.fillText(label, x - w / 2 + (o.icon ? 28 : 10), y + 1);
    g.restore();
  }
  function airGlyph(g, x, y) { g.fillStyle = '#f3e7cc'; ell(g, x, y - 1.5, 5.5, 2.6); g.fill(); g.fillStyle = '#8a5a3a'; g.fillRect(x - 2.5, y + 2, 5, 2); }

  return {
    drawWorld(g, G, clock) {
      const h = app.hover, m = app.mode;
      const pulse = 0.75 + 0.25 * Math.sin(clock * 4);
      // ranges of existing defences while placing one of the same kind
      if (m.build && rangeOf(m.build.type)) {
        for (const b of G.buildings) if (b.type === m.build.type && b.state !== 'ruin') {
          const I = isl(G, b.island); if (!I) continue; const [w, d] = R.sizeOf(b.type);
          ring(g, I.ox + b.u + w / 2, I.oy + b.v + d / 2, I.alt, rangeOf(b.type, b.level), RANGE_COL[b.type] || '#ffffff', 0.35, [4, 6]);
        }
      }
      // build ghost
      if (m.build && h && h.island && h.u != null) {
        const I = isl(G, h.island);
        if (I) {
          const type = m.build.type, [w0, d0] = R.sizeOf(type), w = h.w || w0, d = h.d || d0;
          const ok = !!h.valid, col = ok ? '#7dffb0' : '#ff6a5a';
          for (let v = h.v; v < h.v + d; v++) for (let u = h.u; u < h.u + w; u++) {
            const inside = cellAt(I, u, v) !== ' ';
            cellPoly(g, I, u, v); g.fillStyle = rgba(inside ? col : '#ff6a5a', 0.42 * pulse); g.fill();
          }
          cellPoly(g, I, h.u, h.v, w, d, -0.05); g.setLineDash([7, 5]); g.strokeStyle = rgba(ok ? '#c8ffe0' : '#ffb0a0', 0.95); g.lineWidth = 2.8; g.stroke(); g.setLineDash([]);
          const rg = rangeOf(type);
          if (rg) ring(g, I.ox + h.u + w / 2, I.oy + h.v + d / 2, I.alt, rg, ok ? (RANGE_COL[type] || '#ffffff') : '#ff6a5a', 0.75 * pulse);
          const [ox, oy] = wpx(I.ox, I.oy, I.alt), [X, Y] = local(h.u, h.v);
          R.drawBuildingGhost(g, type, ox + X, oy + Y, ok ? 0.62 : 0.4, G);
          if (ok) {
            const [cx, cy] = local(h.u + w / 2, h.v + d / 2);
            for (let i = 0; i < 3; i++) { const a = clock * 1.3 + i * 2.1; glow(g, ox + cx + Math.cos(a) * w * 18, oy + cy - 20 + Math.sin(a * 1.4) * 10, 16, '#ffe9a0', 0.55); }
          }
        }
      }
      // selection ring (+ range of a selected defence)
      if (m.select != null) {
        const b = G.buildings.find((x) => x.id === m.select), I = b && isl(G, b.island);
        if (b && I) {
          const [w, d] = R.sizeOf(b.type), cx = I.ox + b.u + w / 2, cy = I.oy + b.v + d / 2, r = Math.max(w, d) * 0.72 + 0.15;
          g.save();
          g.beginPath(); for (let i = 0; i <= 48; i++) { const t = i / 48 * TAU, [px, py] = wpx(cx + Math.cos(t) * r, cy + Math.sin(t) * r, I.alt); i ? g.lineTo(px, py) : g.moveTo(px, py); }
          g.strokeStyle = rgba('#2a1430', 0.5); g.lineWidth = 5; g.stroke();
          g.strokeStyle = rgba('#ffe2a0', 0.95); g.lineWidth = 2.4; g.setLineDash([10, 6]); g.lineDashOffset = -clock * 18; g.stroke(); g.setLineDash([]);
          g.restore();
          const rg = rangeOf(b.type, b.level); if (rg) ring(g, cx, cy, I.alt, rg, RANGE_COL[b.type] || '#ffffff', 0.6);
        }
      }
      // hover highlight on a building
      if (!m.build && h && h.building != null && h.building !== m.select) {
        const b = G.buildings.find((x) => x.id === h.building), I = b && isl(G, b.island);
        if (b && I) { const [w, d] = R.sizeOf(b.type); cellPoly(g, I, b.u, b.v, w, d, -0.08); g.strokeStyle = rgba('#fff4d0', 0.7); g.lineWidth = 1.6; g.stroke(); }
      }
      // link preview
      const lk = m.link && (h?.link || m.link);
      if (lk && lk.a) {
        const A = isl(G, lk.a), B = lk.b && isl(G, lk.b);
        if (A) {
          const pa = wpx(A.ox + A.w / 2, A.oy + A.h / 2, A.alt + (lk.kind === 'cable' ? 1.3 : 0.1));
          ring(g, A.ox + A.w / 2, A.oy + A.h / 2, A.alt, Math.max(A.w, A.h) * 0.42, '#ffe2a0', 0.5 * pulse, [6, 6]);
          if (B) {
            const pb = wpx(B.ox + B.w / 2, B.oy + B.h / 2, B.alt + (lk.kind === 'cable' ? 1.3 : 0.1));
            const ok = !!h?.valid, P = catenary(pa[0], pa[1], pb[0], pb[1], Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) * 0.08, 30);
            g.save(); g.lineCap = 'round';
            g.beginPath(); P.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.strokeStyle = rgba('#2a1430', 0.5); g.lineWidth = 6; g.stroke();
            g.setLineDash([10, 8]); g.lineDashOffset = -clock * 30; g.strokeStyle = ok ? '#9cf0a0' : '#ff8a7a'; g.lineWidth = 3; g.stroke(); g.setLineDash([]);
            g.restore();
            ring(g, B.ox + B.w / 2, B.oy + B.h / 2, B.alt, Math.max(B.w, B.h) * 0.42, ok ? '#9cf0a0' : '#ff8a7a', 0.6 * pulse, [6, 6]);
          }
        }
      }
      // focused pirate reticle
      const fid = app.focus ?? h?.pirate;
      if (fid != null) {
        const p = G.pirates?.find((x) => x.id === fid);
        if (p) {
          const [px, py] = wpx(p.x, p.y, p.z || 0), r = 46 + Math.sin(clock * 6) * 3;
          g.save(); g.translate(px, py - 20); g.rotate(clock * 0.8);
          g.strokeStyle = rgba('#ff6a5a', 0.9); g.lineWidth = 2.4;
          for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(0, 0, r, i * TAU / 4 + 0.25, i * TAU / 4 + TAU / 4 - 0.25); g.stroke(); }
          g.restore();
        }
      }
    },
    drawScreen(g, G, clock, W, H) {
      const cam = app.cam;
      // island banners: unclaimed islands always, owned ones when zoomed out
      for (const I of R.viewIslands(G)) {
        if (I.owned && cam.zoom > 0.6) continue;
        const geo = R.islandGeometry(I), [ox, oy] = wpx(I.ox, I.oy, I.alt);
        const x = W / 2 + (ox + geo.cx - wpx(cam.x, cam.y, cam.z)[0]) * cam.zoom, y = H / 2 + (oy + geo.minY - wpx(cam.x, cam.y, cam.z)[1]) * cam.zoom - 26;
        if (x < -150 || x > W + 150 || y < -40 || y > H + 40) continue;
        const label = I.owned ? I.name : `${I.name} · ${I.scouted || I.discovered ? 'unclaimed' : 'unexplored'}`;
        banner(g, x, y, label, !I.owned);
      }
      // trade labels above ships flying a route
      const ports = content().PORTS || [];
      for (const s of G.ships || []) {
        if (!s.route && s.dest?.kind !== 'port') continue;
        const [x, y] = toScreen(cam, s.x, s.y, (s.z || 0) + 2.2);
        if (x < -120 || x > W + 120 || y < 0 || y > H) continue;
        const route = (G.routes || []).find((r) => r.id === s.route);
        const portId = s.dest?.kind === 'port' ? s.dest.id : route?.to;
        const port = ports.find((p) => p.id === portId);
        const cargo = Object.entries(s.cargo || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
        let text;
        if (s.dest?.kind === 'port' && port) text = cargo.length ? `To ${port.name} · ${Math.round(cargo[0][1])} ${cargo[0][0]}` : `To ${port.name}`;
        else if (port && cargo.length) text = `From ${port.name} · ${cargo[0][0]}`;
        else continue;
        tag(g, x, y - 34 * cam.zoom, text, { icon: true, glyph: airGlyph, iconCol: '#3e4a8a' });
      }
      // invalid placement reason under the ghost
      const h = app.hover;
      if (app.mode.build && h && h.island && h.u != null && !h.valid && h.reason) {
        const I = isl(G, h.island);
        if (I) { const [x, y] = toScreen(cam, I.ox + h.u + (h.w || 1) / 2, I.oy + h.v - 0.3, I.alt); tag(g, x, y + 22, h.reason, { bg: '#3a1a24', border: '#ff8a7a', color: '#ffd8d0', size: 12 }); }
      }
      if (app.mode.build && h && h.island && h.u != null && h.valid) {
        const I = isl(G, h.island), d = def(app.mode.build.type);
        if (I && d) { const [x, y] = toScreen(cam, I.ox + h.u + (h.w || 1) / 2 + (h.d || 1) * 0.3, I.oy + h.v + (h.d || 1), I.alt + 2.4); ghostLabel(g, x, y, d.name.toUpperCase()); }
      }
    },
  };

  function banner(g, x, y, label, wild) {
    g.save();
    g.font = `bold 14px ${SERIF}`;
    const w = g.measureText(label).width + 34, h = 26;
    // ribbon tails
    g.fillStyle = wild ? '#5a4a6a' : '#7a2c34';
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(x + s * (w / 2 - 4), y - h / 2 + 4); g.lineTo(x + s * (w / 2 + 12), y - h / 2 + 6); g.lineTo(x + s * (w / 2 + 5), y + 2); g.lineTo(x + s * (w / 2 + 12), y + h / 2 + 2); g.lineTo(x + s * (w / 2 - 4), y + h / 2); g.closePath(); g.fill(); }
    rr(g, x - w / 2, y - h / 2, w, h, 5);
    const gr = g.createLinearGradient(0, y - h / 2, 0, y + h / 2); gr.addColorStop(0, wild ? '#efe4d0' : '#fbf1da'); gr.addColorStop(1, wild ? '#cfc0a8' : '#e8d4ac');
    g.fillStyle = gr; g.fill(); g.strokeStyle = BRASS_D; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = wild ? '#5a4a5a' : INK; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, x, y + 1);
    g.restore();
  }
  function ghostLabel(g, x, y, s) {
    g.save(); g.font = `bold 13px ${SANS}`; g.textAlign = 'center'; g.lineJoin = 'round';
    g.strokeStyle = 'rgba(20,60,40,0.75)'; g.lineWidth = 4; g.strokeText(s, x, y); g.fillStyle = '#eafff4'; g.fillText(s, x, y);
    g.restore();
  }
}
