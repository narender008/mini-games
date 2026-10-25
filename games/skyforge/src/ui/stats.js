// Colony Chronicle (the "Colony ledger" of the pause menu and the HUD settler
// counter): painted graphs of settlers, coin, mood and production over the
// days (G.stats.samples, one a game minute, written by sim/goals.js), the
// colony's records (G.stats.totals and the samples) and the achievements grid
// ([data-achievement=id], earned ones in gold, the rest with their progress).
// Not scene-bound: UI shows it with ui.toggle('stats'). Without a running
// colony it shows the achievements to earn and an empty chronicle.
//   createStats(app) -> { el, open(), close(), update(realDt), select(graph) }
import { h, setText, makePanel, content, stock, fmt, clamp, sizeCanvas, rgba, mix, SERIF, SANS } from './panelkit.js';
import { iconImg, hasGlyph } from './icons.js';

const DAY = 300;
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const GRAPHS = [
  { id: 'pop', label: 'Settlers', icon: 'settler' },
  { id: 'coin', label: 'Coin', icon: 'coin' },
  { id: 'mood', label: 'Mood', icon: 'happy' },
  { id: 'prod', label: 'Production', icon: 'graph' },
];
const safe = (fn, d = null) => { try { return fn(); } catch (e) { return d; } };

export function createStats(app) {
  let ui = {}, graph = 'pop', hidden = new Set(), hover = null, acc = 0, sig = '', ro = null;
  const P = makePanel(app, {
    name: 'stats', title: 'Colony Chronicle',
    build(el) {
      ui = {}; sig = ''; hover = null;
      ui.sub = h('p', { class: 'rs-sub' });
      ui.count = h('b', null, '0');
      ui.tabs = h('nav', { class: 'st-tabs' }, GRAPHS.map((g) => h('button', { type: 'button', 'data-graph': g.id, class: g.id === graph ? 'on' : '', onclick: () => pickGraph(g.id) }, iconImg(g.icon, 22, { style: 'plain' }), g.label)));
      ui.canvas = h('canvas', { class: 'st-canvas', 'aria-label': 'Chronicle graph', role: 'img' });
      ui.plot = h('div', { class: 'st-plot' }, ui.canvas);
      ui.legend = h('div', { class: 'st-legend' });
      ui.records = h('ul', { class: 'st-records' });
      ui.achs = h('ul', { class: 'st-achs' });
      ui.achHead = h('span', { class: 'st-achcount' });
      el.append(h('div', { class: 'sfp-veil' }), h('div', { class: 'st-wrap sfp-parch' },
        h('header', { class: 'st-head' }, iconImg('codex', 46), h('div', null, h('h1', null, 'Colony Chronicle'), ui.sub),
          h('div', { class: 'sfp-pill', title: 'Achievements earned' }, iconImg('trophy', 24, { style: 'plain' }), ui.count)),
        h('div', { class: 'st-body' },
          h('div', { class: 'st-main' },
            h('section', { class: 'st-graph' }, ui.tabs, ui.plot, ui.legend),
            h('h3', null, 'Records'), ui.records),
          h('section', { class: 'st-side' }, h('div', { class: 'st-sidehead' }, h('h2', null, 'Achievements'), ui.achHead), ui.achs))));
      ui.canvas.addEventListener('pointermove', (e) => { const r = ui.canvas.getBoundingClientRect(); hover = e.clientX - r.left; paint(); });
      ui.canvas.addEventListener('pointerleave', () => { hover = null; paint(); });
      ui.canvas.addEventListener('pointerdown', (e) => { const r = ui.canvas.getBoundingClientRect(); hover = e.clientX - r.left; paint(); });
      if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => paint()); ro.observe(ui.plot); }
      refresh(true);
      requestAnimationFrame(() => paint());
    },
    update(dt) { acc += dt; if (acc > 1) { acc = 0; refresh(false); } },
    resize() { paint(); },
    teardown() { ro?.disconnect(); ro = null; ui = {}; },
  });
  const G = () => app.G;

  function pickGraph(id) {
    graph = id; hover = null;
    for (const b of ui.tabs.children) b.classList.toggle('on', b.dataset.graph === id);
    legend(); paint();
  }

  // ------------------------------------------------------------ data
  // the samples plus a live point for "now"
  function samples() {
    const g = G(); if (!g) return [];
    const S = (g.stats && g.stats.samples) || [];
    const out = S.slice();
    const last = out[out.length - 1];
    if (!last || g.t - last.t > 5) {
      const home = safe(() => g.islands.find((i) => i.kind === 'home')?.id, null) || 'hearthrock';
      const root = g.tmp?.netOf?.[home] || home;
      out.push({ t: g.t, day: g.day, pop: g.colony?.pop || 0, popCap: g.colony?.popCap || 0, coin: g.colony?.coin || 0, insight: g.colony?.insight || 0, happiness: g.colony?.happiness ?? 0, prod: { ...(g.tmp?.rates?.[root] || {}) }, made: S.some((x) => x.made) ? { ...(g.tmp?.made?.[root] || {}) } : undefined, chapter: g.goals?.chapter, live: true });
    }
    return out;
  }
  const prodOf = (s, r) => (s.made ? s.made[r] : s.prod ? s.prod[r] : s[r]) ?? 0;
  const PAL = ['#3a6fb8', '#c0392b', '#2e8a4a', '#c08a1e', '#7a4ab8', '#1f8a8a'];
  const madeMode = (S) => S.some((s) => s.made);
  function prodRes(S) {
    const res = content(app).resources.filter((r) => r.pooled !== false && r.id !== 'coin' && r.id !== 'insight');
    const tail = S.slice(-Math.max(10, Math.floor(S.length / 2)));
    return res.map((r) => ({ r, w: tail.reduce((a, s) => a + Math.abs(prodOf(s, r.id)), 0) / Math.max(1, tail.length) }))
      .filter((x) => x.w > 0.05).sort((a, b) => b.r.tier - a.r.tier || b.w - a.w).slice(0, 6).map((x) => x.r);
  }
  function seriesFor(S) {
    if (graph === 'pop') return { unit: '', series: [{ id: 'pop', label: 'Settlers', color: '#3a6fb8', area: true, v: (s) => s.pop }, { id: 'cap', label: 'Housing', color: '#8a6a4a', dash: true, v: (s) => s.popCap }] };
    if (graph === 'coin') return { unit: '', series: [{ id: 'coin', label: 'Coin in the treasury', color: '#c08a1e', area: true, v: (s) => s.coin }] };
    if (graph === 'mood') return { unit: '%', max: 100, series: [{ id: 'mood', label: 'Happiness', color: '#2e8a4a', area: true, v: (s) => Math.round((s.happiness || 0) * 100) }] };
    const rs = prodRes(S);
    const col = (r) => PAL[rs.indexOf(r) % PAL.length];
    return { unit: '/min', signed: !madeMode(S), smooth: 3, series: rs.filter((r) => !hidden.has(r.id)).map((r) => ({ id: r.id, label: r.name, color: col(r), v: (s) => prodOf(s, r.id) })), all: rs, col };
  }

  // ------------------------------------------------------------ painting
  function niceStep(span, n) {
    const raw = span / Math.max(1, n), p = Math.pow(10, Math.floor(Math.log10(raw || 1))), f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  function paint() {
    const c = ui.canvas; if (!c || !ui.plot) return;
    const W = Math.max(200, ui.plot.clientWidth), H = Math.max(150, ui.plot.clientHeight);
    const g = sizeCanvas(c, W, H);
    g.clearRect(0, 0, W, H);
    const S = samples(), spec = seriesFor(S);
    const narrow = W < 460;
    const L = narrow ? 42 : 54, R = narrow ? 14 : 22, T = 26, B = 30;
    const pw = W - L - R, ph = H - T - B;
    // plot paper
    g.save();
    g.fillStyle = 'rgba(255, 250, 236, 0.55)'; g.fillRect(L, T, pw, ph);
    g.restore();
    if (S.length < 2 || !spec.series.length) {
      axes(g, L, T, pw, ph, 0, 1, 0, 100, spec, narrow, true);
      g.save(); g.textAlign = 'center'; g.fillStyle = 'rgba(59, 42, 34, 0.75)';
      g.font = `italic 600 ${narrow ? 15 : 18}px ${SERIF}`;
      g.fillText(!G() ? 'No colony is aloft.' : !spec.series.length ? 'Nothing is being made yet.' : 'The chronicle begins.', L + pw / 2, T + ph / 2 - 6);
      g.font = `500 ${narrow ? 12 : 13.5}px ${SANS}`; g.fillStyle = 'rgba(90, 70, 54, 0.85)';
      g.fillText(!G() ? 'Start or continue a colony to keep its chronicle.' : 'A new entry is written every minute of play.', L + pw / 2, T + ph / 2 + 18);
      g.restore();
      return;
    }
    const x0 = S[0].t, x1 = Math.max(S[S.length - 1].t, x0 + 60);
    // values (optionally smoothed)
    const vals = spec.series.map((s) => {
      const raw = S.map((p) => +s.v(p) || 0);
      if (!spec.smooth) return raw;
      const k = spec.smooth; return raw.map((_, i) => { let a = 0, n = 0; for (let j = Math.max(0, i - k); j <= Math.min(raw.length - 1, i + k); j++) { a += raw[j]; n++; } return a / n; });
    });
    let lo = 0, hi = spec.max ?? 0;
    for (const v of vals) for (const x of v) { if (x > hi) hi = x; if (x < lo) lo = x; }
    if (spec.max == null) { const st = niceStep(hi - lo || 1, narrow ? 3 : 4); hi = Math.ceil((hi * 1.06) / st) * st || st; lo = spec.signed ? Math.floor((lo * 1.06) / st) * st : 0; }
    const X = (t) => L + ((t - x0) / (x1 - x0)) * pw, Y = (v) => T + ph - ((v - lo) / (hi - lo || 1)) * ph;
    chapters(g, S, X, T, ph, narrow);
    axes(g, L, T, pw, ph, x0, x1, lo, hi, spec, narrow, false, X, Y);
    // series: area wash, an ink under-stroke, then the colour
    spec.series.forEach((s, k) => {
      const v = vals[k];
      const pts = v.map((y, i) => [X(S[i].t), Y(y)]);
      if (s.area) {
        g.save(); g.beginPath(); g.moveTo(pts[0][0], Y(Math.max(lo, 0)));
        for (const p of pts) g.lineTo(p[0], p[1]);
        g.lineTo(pts[pts.length - 1][0], Y(Math.max(lo, 0))); g.closePath();
        const gr = g.createLinearGradient(0, T, 0, T + ph); gr.addColorStop(0, rgba(s.color, 0.38)); gr.addColorStop(1, rgba(s.color, 0.04));
        g.fillStyle = gr; g.fill(); g.restore();
      }
      g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
      if (s.dash) g.setLineDash([7, 6]);
      const line = () => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); };
      if (!s.dash) { line(); g.strokeStyle = 'rgba(59, 42, 34, 0.35)'; g.lineWidth = 5; g.stroke(); }
      line(); g.strokeStyle = s.color; g.lineWidth = s.dash ? 2 : 2.8; g.stroke();
      g.restore();
    });
    // end markers with a value tag
    const tags = [];
    spec.series.forEach((s, k) => { if (s.dash) return; const v = vals[k], y = Y(v[v.length - 1]); tags.push({ s, v: v[v.length - 1], y }); });
    tags.sort((a, b) => a.y - b.y);
    for (let i = 1; i < tags.length; i++) if (tags[i].y - tags[i - 1].y < 20) tags[i].y = tags[i - 1].y + 20;
    for (const t of tags) {
      const ex = X(S[S.length - 1].t), ey = Y(t.v);
      g.save();
      g.beginPath(); g.arc(ex, ey, 5.5, 0, Math.PI * 2); g.fillStyle = t.s.color; g.fill(); g.lineWidth = 2.2; g.strokeStyle = '#fbf1da'; g.stroke();
      g.beginPath(); g.arc(ex, ey, 7.5, 0, Math.PI * 2); g.lineWidth = 1.4; g.strokeStyle = 'rgba(138, 95, 34, 0.9)'; g.stroke();
      if (spec.series.length <= 2) {
        const label = fmtV(t.v, spec); g.font = `700 12.5px ${SANS}`;
        const tw = g.measureText(label).width + 16, tx = Math.min(ex - tw - 12, W - R - tw), ty = clamp(t.y - 11, T + 2, T + ph - 24);
        pill(g, tx, ty, tw, 22, t.s.color); g.fillStyle = '#fbf1da'; g.textBaseline = 'middle'; g.fillText(label, tx + 8, ty + 11.5);
      }
      g.restore();
    }
    // hover readout
    if (hover != null && hover >= L && hover <= L + pw) {
      const t = x0 + ((hover - L) / pw) * (x1 - x0);
      let i = 0; for (let j = 1; j < S.length; j++) if (Math.abs(S[j].t - t) < Math.abs(S[i].t - t)) i = j;
      const hx = X(S[i].t);
      g.save(); g.strokeStyle = 'rgba(59, 42, 34, 0.55)'; g.lineWidth = 1.2; g.setLineDash([3, 3]);
      g.beginPath(); g.moveTo(hx, T); g.lineTo(hx, T + ph); g.stroke(); g.setLineDash([]);
      spec.series.forEach((s, k) => { g.beginPath(); g.arc(hx, Y(vals[k][i]), 4, 0, Math.PI * 2); g.fillStyle = s.color; g.fill(); g.strokeStyle = '#fbf1da'; g.lineWidth = 1.5; g.stroke(); });
      const lines = [`Day ${Math.floor(S[i].t / DAY) + 1}${S[i].live ? ' · now' : ''}`, ...spec.series.map((s, k) => [s, `${s.label}: ${fmtV(vals[k][i], spec)}`])];
      g.font = `600 12.5px ${SANS}`;
      const bw = Math.max(...lines.map((l) => g.measureText(typeof l === 'string' ? l : l[1]).width)) + 30, bh = 10 + lines.length * 18;
      const bx = hx + 12 + bw > W - R ? hx - 12 - bw : hx + 12, by = T + 8;
      g.fillStyle = 'rgba(29, 26, 68, 0.94)'; g.strokeStyle = '#e0b25a'; g.lineWidth = 1.5;
      g.beginPath(); g.roundRect ? g.roundRect(bx, by, bw, bh, 8) : g.rect(bx, by, bw, bh); g.fill(); g.stroke();
      lines.forEach((l, n) => {
        const yy = by + 18 + n * 18;
        if (typeof l === 'string') { g.fillStyle = '#ffe2a0'; g.font = `700 12.5px ${SANS}`; g.fillText(l, bx + 10, yy); return; }
        g.fillStyle = l[0].color; g.beginPath(); g.arc(bx + 14, yy - 4, 4, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#fbf1da'; g.font = `600 12.5px ${SANS}`; g.fillText(l[1], bx + 24, yy);
      });
      g.restore();
    }
  }
  function fmtV(v, spec) {
    if (spec.unit === '/min') return `${v > 0 ? '+' : ''}${Math.abs(v) < 10 ? (Math.round(v * 10) / 10).toString() : fmt(v)}/min`;
    return fmt(v) + (spec.unit === '%' ? '%' : '');
  }
  function pill(g, x, y, w, hh, col) {
    g.beginPath(); g.roundRect ? g.roundRect(x, y, w, hh, hh / 2) : g.rect(x, y, w, hh);
    g.fillStyle = mix(col, '#1d1a44', 0.35); g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#e0b25a'; g.stroke();
  }
  // faint bands per chapter with a ribbon numeral where it began
  function chapters(g, S, X, T, ph, narrow) {
    const marks = []; let cur = null;
    for (const s of S) if (s.chapter != null && s.chapter !== cur) { marks.push([s.t, s.chapter]); cur = s.chapter; }
    marks.forEach(([t, ch], i) => {
      const xa = X(t), xb = i + 1 < marks.length ? X(marks[i + 1][0]) : X(S[S.length - 1].t);
      g.save();
      if (i % 2) { g.fillStyle = 'rgba(160, 110, 50, 0.07)'; g.fillRect(xa, T, xb - xa, ph); }
      if (i > 0) { g.strokeStyle = 'rgba(138, 95, 34, 0.45)'; g.lineWidth = 1; g.beginPath(); g.moveTo(xa + 0.5, T); g.lineTo(xa + 0.5, T + ph); g.stroke(); }
      if (xb - xa > (narrow ? 22 : 28)) {
        const label = 'Ch. ' + (ROMAN[ch] || ch);
        g.font = `700 ${narrow ? 10 : 11}px ${SERIF}`; const tw = g.measureText(label).width + 10;
        if (xb - xa > tw + 4) {
          g.fillStyle = 'rgba(138, 95, 34, 0.85)'; g.beginPath(); g.moveTo(xa + 2, T - 18); g.lineTo(xa + 2 + tw, T - 18); g.lineTo(xa + 2 + tw - 4, T - 11); g.lineTo(xa + 2 + tw, T - 4); g.lineTo(xa + 2, T - 4); g.closePath(); g.fill();
          g.fillStyle = '#fbf1da'; g.textBaseline = 'middle'; g.fillText(label, xa + 6, T - 10.5);
        }
      }
      g.restore();
    });
  }
  function axes(g, L, T, pw, ph, x0, x1, lo, hi, spec, narrow, empty, X, Y) {
    g.save();
    g.strokeStyle = 'rgba(138, 95, 34, 0.75)'; g.lineWidth = 1.5; g.strokeRect(L + 0.5, T + 0.5, pw - 1, ph - 1);
    g.font = `600 ${narrow ? 10.5 : 11.5}px ${SANS}`; g.fillStyle = 'rgba(90, 70, 54, 0.95)';
    if (!empty) {
      // y grid
      const st = niceStep(hi - lo || 1, narrow ? 3 : 4);
      g.textAlign = 'right'; g.textBaseline = 'middle';
      for (let v = lo; v <= hi + st * 0.01; v += st) {
        const y = Math.round(Y(v)) + 0.5;
        g.strokeStyle = v === 0 && lo < 0 ? 'rgba(59, 42, 34, 0.55)' : 'rgba(138, 95, 34, 0.22)'; g.setLineDash(v === 0 && lo < 0 ? [] : [4, 5]); g.lineWidth = 1;
        if (v > lo && v < hi) { g.beginPath(); g.moveTo(L, y); g.lineTo(L + pw, y); g.stroke(); }
        g.fillText(fmtAxis(v, spec), L - 7, y);
      }
      g.setLineDash([]);
      // x ticks in days
      const days = (x1 - x0) / DAY, step = [0.25, 0.5, 1, 2, 5, 10, 20, 50, 100, 200].find((s) => days / s <= (narrow ? 4 : 7)) || 500;
      g.textAlign = 'center'; g.textBaseline = 'top';
      const first = Math.ceil(x0 / DAY / step) * step;
      for (let d = first; d * DAY <= x1 + 1; d += step) {
        const x = Math.round(X(d * DAY)) + 0.5;
        g.strokeStyle = 'rgba(138, 95, 34, 0.6)'; g.beginPath(); g.moveTo(x, T + ph); g.lineTo(x, T + ph + 5); g.stroke();
        const lab = step < 1 ? (d % 1 ? '' : `Day ${d + 1}`) : `Day ${Math.round(d) + 1}`;
        if (lab && x > L + 14 && x < L + pw - 6) g.fillText(lab, x, T + ph + 8);
      }
    } else {
      g.strokeStyle = 'rgba(138, 95, 34, 0.18)'; g.setLineDash([4, 5]); g.lineWidth = 1;
      for (let i = 1; i < 4; i++) { const y = Math.round(T + (ph * i) / 4) + 0.5; g.beginPath(); g.moveTo(L, y); g.lineTo(L + pw, y); g.stroke(); }
    }
    g.restore();
  }
  const fmtAxis = (v, spec) => (spec.unit === '%' ? v + '%' : Math.abs(v) >= 1000 ? fmt(v / 1000) + 'k' : String(Math.round(v * 10) / 10));

  // ------------------------------------------------------------ legend, records, achievements
  function legend() {
    if (!ui.legend) return;
    const spec = seriesFor(samples());
    if (graph !== 'prod') {
      ui.legend.replaceChildren(...spec.series.map((s) => h('span', { class: 'st-key' + (s.dash ? ' dash' : '') }, h('i', { style: { background: s.dash ? 'none' : s.color, borderColor: s.color } }), s.label)),
        h('small', null, graph === 'mood' ? 'Food, homes, taverns and wells keep spirits up' : graph === 'pop' ? 'Settlers arrive while there is housing and food' : 'Taxes, trade and contracts fill the treasury'));
      return;
    }
    const all = spec.all || [];
    ui.legend.replaceChildren(...(all.length ? all.map((r) => h('button', { type: 'button', class: 'st-key' + (hidden.has(r.id) ? ' off' : ''), 'data-res': r.id, onclick: () => { if (hidden.has(r.id)) hidden.delete(r.id); else hidden.add(r.id); legend(); paint(); } },
      iconImg(r.id, 18, { style: 'plain' }), h('i', { style: { background: spec.col(r) } }), r.short || r.name)) : []),
    h('small', null, madeMode(samples()) ? 'Goods made per minute' : 'Net per minute: made, less what the colony uses'));
  }
  function records() {
    const g = G(), S = samples(), T = g?.stats?.totals || {}, C = content(app);
    const peak = (k) => S.reduce((a, s) => Math.max(a, +s[k] || 0), 0);
    const rows = [
      ['days', 'sun', 'Days aloft', g ? fmt(Math.floor(g.day)) : '-'],
      ['peakpop', 'settler', 'Peak settlers', g ? fmt(Math.max(peak('pop'), g.colony?.pop || 0)) : '-'],
      ['peakcoin', 'coin', 'Most coin held', g ? fmt(Math.max(peak('coin'), stock(g, 'coin'))) : '-'],
      ['islands', 'island', 'Islands owned', g ? `${g.islands.filter((i) => i.owned).length} / ${g.islands.length}` : '-'],
      ['buildings', 'hammer', 'Buildings standing', g ? fmt(g.buildings.filter((b) => b.state === 'built').length) : '-'],
      ['research', 'flask', 'Research done', g ? `${g.research?.done?.length || 0} / ${C.research.length}` : '-'],
      ['ships', 'airship', 'Airships', g ? fmt(g.ships.length) : '-'],
      ['trade', 'cargo', 'Coin from trade', fmt(T.tradeCoin || 0)],
      ['contracts', 'contract', 'Contracts fulfilled', fmt(T.contracts || 0)],
      ['raids', 'harpoon', 'Raids driven off', fmt(T.raids || 0)],
      ['storms', 'storm', 'Storms weathered', fmt(T.storms || 0)],
      ['expeditions', 'compass', 'Expeditions', fmt(T.expeditions || 0)],
    ];
    ui.records.replaceChildren(...rows.map(([id, ic, label, v]) => h('li', { 'data-record': id }, iconImg(ic, 34), h('div', null, h('b', null, v), h('small', null, label)))));
  }
  function achProgress(g, c) {
    if (!g || !c) return null;
    const T = g.stats?.totals || {}, C = content(app), own = g.islands.filter((i) => i.owned).length;
    const f = (n, m) => clamp(n / Math.max(1, m), 0, 1);
    if (c.pop != null) return [g.colony?.pop || 0, c.pop];
    if (c.owned != null) return [own, c.owned];
    if (c.allIslands) return [own, g.islands.length];
    if (c.researched != null) return [g.research.done.length, c.researched];
    if (c.allResearch) return [g.research.done.length, C.research.length];
    if (c.day != null) return [Math.floor(g.day), c.day];
    if (c.chapter != null) return [g.goals?.chapter || 1, c.chapter];
    if (c.ships != null) return [g.ships.filter((s) => s.state !== 'building').length, c.ships];
    if (c.routes != null) return [g.routes.length, c.routes];
    if (c.buildings != null) return [g.buildings.filter((b) => b.state === 'built').length, c.buildings];
    if (c.coinHeld != null) return [stock(g, 'coin'), c.coinHeld];
    if (c.allRep != null) return [g.ports.length ? Math.min(...g.ports.map((p) => p.rep || 0)) : 0, c.allRep];
    for (const k of ['tradeCoin', 'contracts', 'raids', 'storms', 'drifted', 'events']) if (c[k] != null) return [T[k] || 0, c[k]];
    if (c.stock) { const [r, n] = Object.entries(c.stock)[0]; return [stock(g, r), n]; }
    void f; return null;
  }
  function achievements() {
    const g = G(), list = content(app).achievements.map((a) => (Array.isArray(a) ? { id: a[0], name: a[1], desc: a[2] } : a));
    const got = new Set(g?.goals?.achievements || []);
    const n = list.filter((a) => got.has(a.id)).length;
    setText(ui.count, `${n} / ${list.length}`);
    setText(ui.achHead, g ? `${n} of ${list.length} earned` : `${list.length} to earn`);
    const sorted = list.map((a, i) => ({ a, i, done: got.has(a.id), p: got.has(a.id) ? null : achProgress(g, a.check) }))
      .sort((x, y) => (y.done - x.done) || ((y.p ? y.p[0] / y.p[1] : 0) - (x.p ? x.p[0] / x.p[1] : 0)) || x.i - y.i);
    ui.achs.replaceChildren(...sorted.map(({ a, done, p }) => {
      const ic = a.icon && hasGlyph(a.icon) ? a.icon : hasGlyph(a.id) ? a.id : 'trophy';
      const frac = p ? clamp(p[0] / Math.max(1, p[1]), 0, 1) : 0;
      return h('li', { class: done ? 'done' : '', 'data-achievement': a.id, title: a.desc || '' },
        h('span', { class: 'st-medal' }, iconImg(ic, 46, { style: done ? 'gold' : 'grey' }), done ? null : iconImg('lock', 20, { style: 'plain' })),
        h('div', null, h('b', null, a.name), h('small', null, a.desc || ''),
          done ? h('em', null, 'Earned') : p ? h('div', { class: 'st-prog' }, h('div', { class: 'sfp-bar' }, h('i', { style: { width: Math.round(frac * 100) + '%' } })), h('span', null, `${fmt(Math.min(p[0], p[1]))} / ${fmt(p[1])}`)) : null));
    }));
  }
  function refresh(force) {
    const g = G(); if (!ui.records) return;
    setText(ui.sub, g ? `${g.colony?.name || 'Your colony'} · Day ${Math.floor(g.day)} · Chapter ${ROMAN[g.goals?.chapter] || g.goals?.chapter || 'I'} · ${fmt(g.colony?.pop || 0)} settlers` : 'No colony aloft yet');
    const S = g?.stats?.samples || [];
    const s = JSON.stringify([S.length, S[S.length - 1]?.t, g?.goals?.achievements?.length, g && Math.floor(g.t / 15)]);
    if (!force && s === sig) return;
    sig = s;
    records(); achievements(); legend(); paint();
  }

  P.select = (id) => { if (GRAPHS.some((x) => x.id === id)) { graph = id; if (P.isOpen()) pickGraph(id); } };
  return P;
}
