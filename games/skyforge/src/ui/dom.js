// DOM helpers for the interface: element builder, cached text setters, number
// and time formats, icons (PANELS' painted medallion icons from ui/icons.js,
// loaded lazily, with a small fallback), content lookups, tooltips and the
// parchment grain texture. No game rules live here.

let ICON = null;                     // ui/icons.js icon(id, size) once loaded
const iconWaiters = new Set();
export const iconsReady = import('./icons.js').then((m) => {
  ICON = m.icon || m.default?.icon || null;
  for (const fn of iconWaiters) { try { fn(); } catch (e) { console.error(e); } }
  iconWaiters.clear();
}).catch(() => { /* PANELS has not delivered icons.js yet: fallbacks stay */ });
export const onIcons = (fn) => { if (ICON) return; iconWaiters.add(fn); };
export const haveIcons = () => !!ICON;

// h('div.glass#id', { onclick, data: {...}, style: {...} }, ...children)
export function h(sel, attrs, ...kids) {
  if (attrs == null || typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs)) { if (attrs != null) kids.unshift(attrs); attrs = {}; }
  const m = sel.match(/^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i);
  const el = document.createElement((m && m[1]) || 'div');
  if (m && m[2]) for (const part of m[2].match(/[.#][\w-]+/g)) { if (part[0] === '.') el.classList.add(part.slice(1)); else el.id = part.slice(1); }
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'data') for (const [dk, dv] of Object.entries(v)) el.dataset[dk] = dv;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'cls') el.className += ' ' + v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  add(el, kids);
  return el;
}
function add(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) add(el, k);
    else el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

// only touch the DOM when the value changes
export function setText(el, s) { s = String(s); if (el.__t !== s) { el.__t = s; el.textContent = s; } }
export function setHTML(el, s) { if (el.__h !== s) { el.__h = s; el.innerHTML = s; } }
export function setClass(el, cls, on) { on = !!on; if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on); }
export function setHidden(el, hidden) { hidden = !!hidden; if (el.hidden !== hidden) el.hidden = hidden; }
export function setStyle(el, k, v) { if (el.style[k] !== v) el.style[k] = v; }
export function setVar(el, k, v) { const key = '__v' + k; if (el[key] !== v) { el[key] = v; el.style.setProperty(k, v); } }
export function setBar(bar, f) { const i = bar.firstChild || bar.appendChild(document.createElement('i')); setStyle(i, 'width', `${Math.round(Math.max(0, Math.min(1, f || 0)) * 1000) / 10}%`); }
export const bar = (cls = '') => h('div.bar' + cls, h('i'));

// numbers: 1,240 / 18.4k / 2.1M
export function fmt(n) {
  if (n == null || !isFinite(n)) return '0';
  const a = Math.abs(n), s = n < 0 ? '-' : '';
  if (a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
  if (a >= 1e5) return s + Math.round(a / 1e3) + 'k';
  return s + Math.floor(a).toLocaleString('en-US');
}
export function fmtRate(r) {
  if (!r || Math.abs(r) < 0.05) return '';
  const a = Math.abs(r), v = a >= 10 ? Math.round(a) : Math.round(a * 10) / 10;
  return (r > 0 ? '+' : '−') + v;
}
// game seconds -> "2:14", "1h 05m"
export function fmtTime(s) {
  s = Math.max(0, Math.ceil(s || 0));
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${String(Math.floor(s / 60) % 60).padStart(2, '0')}m`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export function fmtDays(s, day = 300) {
  const d = s / day;
  if (d >= 1.5) return `${Math.round(d)} days`;
  if (d >= 0.95) return '1 day';
  return fmtTime(s);
}
export const cap1 = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
export const plural = (n, one, many = one + 's') => `${fmt(n)} ${n === 1 ? one : many}`;

// ---------- icons ----------
const FB_COL = { wood: '#b07a48', planks: '#d8a868', stone: '#b8b0b8', ore: '#9a6a52', coal: '#3a3a44', iron: '#b8c4d0', parts: '#e0b25a', grain: '#f2c84a', flour: '#f4ead8', bread: '#d89a50', skystone: '#5fd8ee', aether: '#a88af0', coin: '#e8b448', insight: '#7ce0b0' };
// icon(id, cls) -> element sized by CSS (.ico); the canvas is painted at 64 px
export function ico(id, cls = '', opts = { style: 'plain' }) {
  if (ICON) {
    try {
      const r = ICON(id, 48, opts);
      if (r instanceof HTMLCanvasElement || r instanceof HTMLImageElement || r instanceof SVGElement) { const el = r.isConnected ? (r instanceof HTMLCanvasElement ? cloneCanvas(r) : r.cloneNode(true)) : r; el.style.width = el.style.height = ''; el.classList.add('ico', ...cls.split(' ').filter(Boolean)); el.dataset.icon = id; return el; }
      if (r instanceof Element) { r.classList.add('ico', ...cls.split(' ').filter(Boolean)); return r; }
      if (typeof r === 'string') { const img = h('img.ico', { src: r, alt: '' }); if (cls) img.classList.add(...cls.split(' ').filter(Boolean)); return img; }
    } catch (e) { /* fall through */ }
  }
  const el = h('span.ico.ico-fb', { 'aria-hidden': 'true' }, (id || '?')[0].toUpperCase());
  if (FB_COL[id]) el.style.background = `radial-gradient(circle at 35% 35%, #fff8e0, ${FB_COL[id]} 60%, #5a3a20)`;
  if (cls) el.classList.add(...cls.split(' ').filter(Boolean));
  el.dataset.icon = id; el.__opts = opts;
  return el;
}
function cloneCanvas(src) {
  // icons.js may return a shared cached canvas: copy it so one element per slot
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}
// replace fallback icons in a subtree once the real icons have loaded
export function upgradeIcons(root) {
  if (!ICON) return;
  for (const el of root.querySelectorAll('.ico-fb[data-icon]')) {
    const cls = [...el.classList].filter((c) => c !== 'ico' && c !== 'ico-fb').join(' ');
    el.replaceWith(ico(el.dataset.icon, cls, el.__opts));
  }
}

// tiny inline SVG glyphs for controls (pause/play/fast, close, check, cross)
export const SVG = {
  pause: '<svg viewBox="0 0 20 20"><rect x="4.5" y="3.5" width="4" height="13" rx="1"/><rect x="11.5" y="3.5" width="4" height="13" rx="1"/></svg>',
  play: '<svg viewBox="0 0 20 20"><path d="M6 3.5 L16 10 L6 16.5Z"/></svg>',
  fast: '<svg viewBox="0 0 20 20"><path d="M2.5 4 L10 10 L2.5 16Z M10 4 L17.5 10 L10 16Z"/></svg>',
  faster: '<svg viewBox="0 0 20 20"><path d="M0.5 5 L6.5 10 L0.5 15Z M6.5 5 L12.5 10 L6.5 15Z M12.5 5 L18.5 10 L12.5 15Z"/></svg>',
  menu: '<svg viewBox="0 0 20 20"><rect x="3" y="4" width="14" height="2.4" rx="1.2"/><rect x="3" y="8.8" width="14" height="2.4" rx="1.2"/><rect x="3" y="13.6" width="14" height="2.4" rx="1.2"/></svg>',
  close: '<svg viewBox="0 0 20 20"><path d="M5 5 L15 15 M15 5 L5 15"/></svg>',
  check: '<svg viewBox="0 0 20 20"><path d="M4 10.5 L8.3 14.5 L16 5.5"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><path fill="#f3d58a" stroke="#5a3a10" stroke-width="1" d="M12 1.8l1.6 2.6 3-.9.5 3.1 3 .9-1 3 2.3 2-2.3 2 1 3-3 .9-.5 3.1-3-.9L12 22.2l-1.6-2.6-3 .9-.5-3.1-3-.9 1-3L2.6 12l2.3-2-1-3 3-.9.5-3.1 3 .9z"/><circle cx="12" cy="12" r="3.4" fill="#2c2a58" stroke="#5a3a10"/></svg>',
};

// ---------- content lookups ----------
export function contentIndex(C) {
  const by = (arr) => Object.fromEntries((arr || []).map((x) => [x.id, x]));
  return {
    res: by(C.RESOURCES), bld: by(C.BUILDINGS), link: by(C.LINKS), tech: by(C.RESEARCH), isl: by(C.ISLANDS),
    port: by(C.PORTS), ship: by(C.SHIPS), ev: by(C.EVENTS), ach: by(C.ACHIEVEMENTS), def: by(C.DEFENDS), pir: by(C.PIRATES),
    chap: (C.CHAPTERS || []),
  };
}
export const resName = (X, id) => X.res[id]?.name || cap1(id);
export const bldName = (X, id) => X.bld[id]?.name || X.link[id]?.name || cap1(id);
export const techName = (X, id) => X.tech[id]?.name || cap1(id);

// stock and caps of the pool for an island (coin and insight are colony-wide)
export function poolOf(G, islandId) {
  const root = G.tmp?.netOf?.[islandId] ?? islandId;
  return { root, pool: G.pools?.[root] || G.pools?.[islandId] || null };
}
export function have(G, res, islandId = 'hearthrock') {
  if (res === 'coin' || res === 'insight') return G.colony?.[res] ?? G.pools?.colony?.res?.[res] ?? 0;
  const { pool } = poolOf(G, islandId);
  return pool?.res?.[res] ?? 0;
}
// cost object -> [chip...] marking what the island's network cannot pay
export function costChips(G, cost, islandId, cls = '') {
  const out = [];
  for (const [res, n] of Object.entries(cost || {})) {
    if (!n) continue;
    const short = G && have(G, res, islandId) < n;
    out.push(h('span.chip' + (short ? '.short' : '') + cls, ico(res), fmt(n)));
  }
  return out;
}
export function canPay(G, cost, islandId) {
  for (const [res, n] of Object.entries(cost || {})) if (n && have(G, res, islandId) < n) return false;
  return true;
}

// ---------- parchment grain ----------
export function paperTexture() {
  try {
    const c = document.createElement('canvas'); c.width = c.height = 160;
    const g = c.getContext('2d');
    let a = 7;
    const R = () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    for (let i = 0; i < 260; i++) {
      g.fillStyle = R() < 0.5 ? `rgba(180,138,80,${0.05 + R() * 0.07})` : `rgba(255,255,255,${0.05 + R() * 0.08})`;
      g.beginPath(); g.arc(R() * 160, R() * 160, 0.6 + R() * 2.6, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 14; i++) { g.strokeStyle = `rgba(150,110,60,${0.04 + R() * 0.04})`; g.lineWidth = 0.6; g.beginPath(); const x = R() * 160, y = R() * 160; g.moveTo(x, y); g.lineTo(x + 10 + R() * 30, y + (R() - 0.5) * 6); g.stroke(); }
    document.documentElement.style.setProperty('--paper', `url(${c.toDataURL()})`);
  } catch (e) { /* plain parchment */ }
}

// ---------- tooltips: [data-tip] or el.__tip = () => Node|string ----------
// Mouse: hover 300 ms. Touch: press and hold 400 ms. Never the only way to learn
// something: every tooltip repeats info that is also on a card or panel.
export function createTips(layer, app) {
  const tip = h('div#tip', { role: 'tooltip' });
  layer.append(tip);
  let cur = null, timer = 0, touchT = 0;
  const enabled = () => app.settings?.tooltips !== false;
  function content(el) {
    const f = el.__tip || el.dataset.tip;
    const v = typeof f === 'function' ? f() : f;
    return v;
  }
  function show(el, x, y) {
    const v = content(el); if (!v) return hide();
    tip.replaceChildren(v instanceof Node ? v : h('span', { html: String(v) }));
    tip.classList.add('on');
    const r = el.getBoundingClientRect(), W = innerWidth, H = innerHeight;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let left = Math.min(W - tw - 8, Math.max(8, (x ?? r.left + r.width / 2) - tw / 2));
    let top = r.bottom + 10;
    if (top + th > H - 8) top = r.top - th - 10;
    if (top < 8) top = 8;
    tip.style.left = left + 'px'; tip.style.top = top + 'px';
  }
  function hide() { clearTimeout(timer); cur = null; tip.classList.remove('on'); }
  const target = (e) => e.target instanceof Element ? e.target.closest('[data-tip], .has-tip') : null;
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse' || !enabled()) return;
    const el = target(e); if (el === cur) return;
    hide(); if (!el) return;
    cur = el; timer = setTimeout(() => cur === el && el.isConnected && show(el), 300);
  });
  document.addEventListener('pointerdown', (e) => {
    hide();
    if (e.pointerType === 'mouse' || !enabled()) return;
    const el = target(e); if (!el) return;
    clearTimeout(touchT); touchT = setTimeout(() => { cur = el; show(el); el.__tipShown = performance.now(); }, 420);
  }, true);
  const end = () => { clearTimeout(touchT); if (cur) setTimeout(hide, 1600); };
  document.addEventListener('pointerup', end, true);
  document.addEventListener('pointercancel', end, true);
  // swallow the click that ends a long-press, so holding a slot to read it does not also pick it
  document.addEventListener('click', (e) => {
    const el = target(e);
    if (el && el.__tipShown && performance.now() - el.__tipShown < 2000) { el.__tipShown = 0; e.stopPropagation(); e.preventDefault(); }
  }, true);
  return { hide, refresh() { if (cur && cur.isConnected && tip.classList.contains('on')) show(cur); else if (cur && !cur.isConnected) hide(); } };
}

// a tooltip body: title + text + optional chips
export function tipCard(title, text, chips) {
  return h('div', h('b', title), text ? h('div', text) : null, chips && chips.length ? h('div.chips', chips) : null);
}
