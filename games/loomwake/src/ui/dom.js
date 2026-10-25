// Small DOM helpers and the interface's painted SVG sigils.
// Everything here is cosmetic; nothing touches the simulation.

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k.startsWith('--')) el.style.setProperty(k, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const c of kids.flat()) {
    if (c == null || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// set text only when it changed (cheap per-frame updates)
export function setText(el, s) { s = String(s); if (el.__t !== s) { el.__t = s; el.textContent = s; } }
export function setHTML(el, s) { if (el.__h !== s) { el.__h = s; el.innerHTML = s; } }
export function setStyle(el, k, v) { const key = '__s' + k; if (el[key] !== v) { el[key] = v; el.style.setProperty(k, v); } }
export function toggle(el, cls, on) { if (!!el.__c?.[cls] !== !!on) { (el.__c ||= {})[cls] = !!on; el.classList.toggle(cls, !!on); } }

export function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }

export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const hh = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return hh ? `${hh}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
export function fmtNum(n) { n = Math.round(n || 0); return n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(n); }
export function ago(ms) {
  if (!ms) return '';
  const d = (Date.now() - ms) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return Math.floor(d / 60) + ' min ago';
  if (d < 86400) return Math.floor(d / 3600) + ' h ago';
  return Math.floor(d / 86400) + ' days ago';
}

// ---------------------------------------------------------------------------
// Sigils. viewBox 0 0 32 32, stroke-based so they tint with currentColor.
// ---------------------------------------------------------------------------
const S = (body, extra = '') => `<svg viewBox="0 0 32 32" aria-hidden="true" ${extra}>${body}</svg>`;
const sun = () => {
  let r = '<circle cx="16" cy="16" r="5.5" fill="currentColor"/>';
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const l = i % 2 ? 11 : 13.5; r += `<line x1="${(16 + Math.cos(a) * 8.5).toFixed(1)}" y1="${(16 + Math.sin(a) * 8.5).toFixed(1)}" x2="${(16 + Math.cos(a) * l).toFixed(1)}" y2="${(16 + Math.sin(a) * l).toFixed(1)}"/>`; }
  return r;
};
const st = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';

export const ICONS = {
  // action slots
  attack: S(`<g ${st}><path d="M7 25 L22 8 L25.5 6.5 L24 10 L9 27"/><path d="M5.5 21.5 L10.5 26.5"/><path d="M6 26 L4 28"/></g>`),
  special: S(`<g ${st}>${sun()}</g>`),
  snare: S(`<g ${st}><path d="M5 27 C 11 24, 9 15, 16 13 S 24 9, 27 5"/><path d="M24 4.5 L28 4 L27.5 8"/><circle cx="5" cy="27" r="1.6" fill="currentColor"/></g>`),
  dash: S(`<g ${st}><path d="M4 12 H19 A5 5 0 1 0 14 7"/><path d="M4 19 H24 A5 5 0 1 1 19 24"/><path d="M8 15.5 H14"/></g>`),
  call: S(`<g ${st}><path d="M16 3 L19 12.5 L28.5 12.5 L20.8 18.3 L23.7 28 L16 22 L8.3 28 L11.2 18.3 L3.5 12.5 L13 12.5 Z"/><circle cx="16" cy="16.5" r="2" fill="currentColor"/></g>`),
  passive: S(`<g ${st}><circle cx="16" cy="16" r="9"/><path d="M10 16 C 13 10, 19 22, 22 16"/></g>`),
  interact: S(`<g ${st}><path d="M11 15 V7 a2 2 0 0 1 4 0 V14 M15 13 V11 a2 2 0 0 1 4 0 V15 M19 14 a2 2 0 0 1 4 0 V20 c0 5 -3 8 -7 8 c-3 0 -5 -1 -7 -4 l-3 -5 a2 2 0 0 1 3 -2 l2 2"/></g>`),
  // patrons
  dawn: S(`<g ${st}>${sun()}</g>`),
  tide: S(`<g ${st}><path d="M3 18 C7 10, 12 10, 14 15 C15 19, 20 19, 20 14 C21 9, 16 7, 14 10"/><path d="M4 25 C10 22, 15 27, 20 24 C25 21, 27 25, 30 23"/></g>`),
  storm: S(`<path d="M18.5 2.5 L7.5 18 L14.5 18 L11.5 29.5 L24.5 12.5 L17.5 12.5 Z" fill="currentColor"/>`),
  stone: S(`<g ${st}><path d="M16 3 L27 9.5 V22.5 L16 29 L5 22.5 V9.5 Z"/><path d="M5 9.5 L16 16 L27 9.5 M16 16 V29"/></g>`),
  shade: S(`<g ${st}><path d="M21 4.5 A12 12 0 1 0 27.5 22 A9.5 9.5 0 1 1 21 4.5 Z" fill="currentColor" fill-opacity=".25"/><circle cx="22" cy="12" r="1.5" fill="currentColor"/></g>`),
  wind: S(`<g ${st}><path d="M4 11 H19 A4.5 4.5 0 1 0 14.5 6.5"/><path d="M3 17 H25 A4.5 4.5 0 1 1 20.5 21.5"/><path d="M6 23 H13"/></g>`),
  weaver: S(`<g ${st}><path d="M16 3 C 24 9, 24 23, 16 29 C 8 23, 8 9, 16 3 Z"/><path d="M4 16 H28"/></g>`),
  // currencies and rewards
  gilt: S(`<g ${st}><circle cx="16" cy="16" r="10.5" fill="currentColor" fill-opacity=".22"/><circle cx="16" cy="16" r="6.5"/><path d="M8 24 C 12 18, 20 14, 24 8"/></g>`),
  lumen: S(`<g ${st}><path d="M16 3 C 21 10, 23 14, 23 18.5 A7 7 0 0 1 9 18.5 C 9 14, 11 10, 16 3 Z" fill="currentColor" fill-opacity=".25"/><path d="M16 13 C 18.5 16.5, 18.5 19.5, 16 22 C 13.5 19.5, 13.5 16.5, 16 13 Z" fill="currentColor"/></g>`),
  keys: S(`<g ${st}><circle cx="10" cy="10" r="5.5"/><path d="M14 14 L27 27 M22 22 L25 19 M25.5 25.5 L28 23"/><path d="M7.5 10 C 9 8, 11 12, 12.5 10"/></g>`),
  shards: S(`<g ${st}><path d="M16 3 L24 13 L16 29 L8 13 Z" fill="currentColor" fill-opacity=".25"/><path d="M8 13 H24 M12.5 13 L16 29 L19.5 13 M12 3.5 L16 13 L20 3.5"/></g>`),
  heal: S(`<path d="M16 27.5 C 6 20, 3.5 14, 6 9.5 C 8.5 5, 14 5.5, 16 10 C 18 5.5, 23.5 5, 26 9.5 C 28.5 14, 26 20, 16 27.5 Z" fill="currentColor"/>`),
  knot: S(`<g ${st}><path d="M9 9 C 20 9, 23 23, 12 23 C 5 23, 7 13, 16 13 C 25 13, 27 23, 20 23 C 9 23, 12 9, 23 9"/></g>`),
  temper: S(`<g ${st}><path d="M5 20 H23 L27 15 H9 Z"/><path d="M11 20 V26 H21 V20"/><path d="M15 12 C 13 9, 17 7, 15 3 C 20 6, 20 10, 18 12"/></g>`),
  memory: S(`<g ${st}><ellipse cx="16" cy="16" rx="12" ry="7.5"/><circle cx="16" cy="16" r="3.5" fill="currentColor"/><path d="M4 27 C 12 22, 20 30, 28 25"/></g>`),
  boon: S(`<g ${st}><circle cx="16" cy="16" r="11"/><path d="M16 5 V27 M5 16 H27"/><circle cx="16" cy="16" r="4" fill="currentColor"/></g>`),
  shop: S(`<g ${st}><circle cx="16" cy="16" r="11" fill="currentColor" fill-opacity=".18"/><circle cx="12.5" cy="12.5" r="1.6" fill="currentColor"/><circle cx="19.5" cy="12.5" r="1.6" fill="currentColor"/><circle cx="12.5" cy="19.5" r="1.6" fill="currentColor"/><circle cx="19.5" cy="19.5" r="1.6" fill="currentColor"/></g>`),
  fountain: S(`<g ${st}><path d="M16 4 C 21 11, 23 15, 23 19 A7 7 0 0 1 9 19 C 9 15, 11 11, 16 4 Z"/><path d="M5 28 H27"/></g>`),
  boss: S(`<g ${st}><path d="M5 24 L7 9 L12.5 15 L16 6 L19.5 15 L25 9 L27 24 Z" fill="currentColor" fill-opacity=".22"/><path d="M5 28 H27"/></g>`),
  elite: S(`<g ${st}><path d="M16 3 L27 8 V16 C 27 22, 22 27, 16 29 C 10 27, 5 22, 5 16 V8 Z"/><path d="M11 16 L15 20 L21 12"/></g>`),
  defy: S(`<g ${st}><path d="M16 4 C 26 10, 26 22, 16 28 C 6 22, 6 10, 16 4 Z" fill="currentColor" fill-opacity=".3"/><path d="M10 13 C 16 17, 16 17, 22 13 M10 19 C 16 15, 16 15, 22 19"/></g>`),
  shield: S(`<g ${st}><path d="M16 3 L27 7.5 V15 C 27 22, 22 27, 16 29 C 10 27, 5 22, 5 15 V7.5 Z" fill="currentColor" fill-opacity=".25"/></g>`),
  pause: S(`<g fill="currentColor"><rect x="9" y="7" width="5" height="18" rx="1.5"/><rect x="18" y="7" width="5" height="18" rx="1.5"/></g>`),
  close: S(`<g ${st}><path d="M8 8 L24 24 M24 8 L8 24"/></g>`),
  door: S(`<g ${st}><path d="M8 28 V12 A8 8 0 0 1 24 12 V28 Z" fill="currentColor" fill-opacity=".18"/><path d="M4 28 H28"/><circle cx="16" cy="15" r="2.5" fill="currentColor"/></g>`),
  book: S(`<g ${st}><path d="M4 7 C 9 5, 13 6, 16 9 C 19 6, 23 5, 28 7 V26 C 23 24, 19 25, 16 28 C 13 25, 9 24, 4 26 Z"/><path d="M16 9 V28"/></g>`),
  gear: S(`<g ${st}><circle cx="16" cy="16" r="4.5"/><path d="M16 3 V7 M16 25 V29 M3 16 H7 M25 16 H29 M6.8 6.8 L9.6 9.6 M22.4 22.4 L25.2 25.2 M6.8 25.2 L9.6 22.4 M22.4 9.6 L25.2 6.8"/><circle cx="16" cy="16" r="9"/></g>`),
  tapestry: S(`<g ${st}><path d="M5 5 H27"/><path d="M7 5 V25 L11 28 L16 25 L21 28 L25 25 V5"/><path d="M11 10 L16 15 L21 10 M11 18 L16 23 L21 18"/></g>`),
  weapons: S(`<g ${st}><path d="M6 26 L22 10 L26 6 L26 10 M8 20 L12 24"/><path d="M26 26 L10 10 L6 6 L6 10 M24 20 L20 24"/></g>`),
  keepsakes: S(`<g ${st}><path d="M16 6 C 13 2, 6 3, 6 9 C 6 15, 16 22, 16 22 C 16 22, 26 15, 26 9 C 26 3, 19 2, 16 6 Z"/><path d="M16 22 V29 M12 26 H20"/></g>`),
  pacts: S(`<g ${st}><path d="M7 4 H22 L26 8 V28 H7 Z"/><path d="M11 12 H22 M11 17 H22 M11 22 H18"/><circle cx="22" cy="23" r="3" fill="currentColor"/></g>`),
  archive: S(`<g ${st}><path d="M4 7 C 9 5, 13 6, 16 9 C 19 6, 23 5, 28 7 V26 C 23 24, 19 25, 16 28 C 13 25, 9 24, 4 26 Z"/><path d="M16 9 V28"/></g>`),
  lock: S(`<g ${st}><rect x="7" y="14" width="18" height="13" rx="2"/><path d="M11 14 V10 a5 5 0 0 1 10 0 V14"/></g>`),
  check: S(`<g ${st}><path d="M6 17 L13 24 L26 9"/></g>`),
  copy: S(`<g ${st}><rect x="10" y="10" width="15" height="17" rx="2"/><path d="M7 21 V7 a2 2 0 0 1 2 -2 H19"/></g>`),
  download: S(`<g ${st}><path d="M16 4 V20 M9 13 L16 20 L23 13 M5 27 H27"/></g>`),
  upload: S(`<g ${st}><path d="M16 22 V6 M9 13 L16 6 L23 13 M5 27 H27"/></g>`),
  trash: S(`<g ${st}><path d="M6 9 H26 M12 9 V5 H20 V9 M8.5 9 L10 28 H22 L23.5 9"/></g>`),
  arrow: S(`<path d="M6 16 L24 6 L19 16 L24 26 Z" fill="currentColor"/>`),
  chevron: S(`<g ${st}><path d="M12 6 L22 16 L12 26"/></g>`),
  play: S(`<path d="M10 6 L26 16 L10 26 Z" fill="currentColor"/>`),
  reroll: S(`<g ${st}><path d="M25 12 A10 10 0 0 0 7 11 M7 20 A10 10 0 0 0 25 21"/><path d="M25 5 V12 H18 M7 27 V20 H14"/></g>`),
  thread: S(`<g ${st}><path d="M3 22 C 9 8, 14 28, 19 14 S 26 6, 29 12"/></g>`),
};
Object.assign(ICONS, {
  star: S(`<g ${st}><path d="M16 3 L18.6 13.4 L29 16 L18.6 18.6 L16 29 L13.4 18.6 L3 16 L13.4 13.4 Z" fill="currentColor" fill-opacity=".25"/></g>`),
  card: S(`<g ${st}><rect x="6" y="4" width="14" height="20" rx="2" transform="rotate(-8 13 14)"/><rect x="12" y="8" width="14" height="20" rx="2" fill="currentColor" fill-opacity=".2"/></g>`),
  eye: S(`<g ${st}><path d="M3 16 C 8 8, 24 8, 29 16 C 24 24, 8 24, 3 16 Z"/><circle cx="16" cy="16" r="4" fill="currentColor"/></g>`),
  clock: S(`<g ${st}><circle cx="16" cy="16" r="11"/><path d="M16 9 V16 L21 19"/></g>`),
});
const ALIAS = { heart: 'heal', spool: 'defy', needle: 'snare', blade: 'attack', wing: 'wind', button: 'shop', crown: 'boss', wave: 'tide', sun: 'dawn', bolt: 'storm', moon: 'shade', mountain: 'stone', feather: 'wind', glint: 'gilt', heal: 'heal', ward: 'shield' };
export const icon = (name) => ICONS[name] || ICONS[ALIAS[name]] || ICONS.boon;

// The golden thread ornament used on dividers and panel headers.
export const ORNAMENT = `<svg class="orn" viewBox="0 0 240 20" preserveAspectRatio="none" aria-hidden="true"><path d="M0 10 H96 C 104 10, 106 3, 112 3 C 118 3, 118 17, 124 17 C 130 17, 130 3, 136 3 C 140 3, 142 10, 144 10 H240" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="120" cy="10" r="2.6" fill="currentColor"/></svg>`;

// Corner flourishes for framed panels (four spans styled by CSS).
export function corners() {
  const f = document.createDocumentFragment();
  for (const p of ['tl', 'tr', 'bl', 'br']) f.appendChild(h('span', { class: 'cnr ' + p, 'aria-hidden': 'true' }));
  return f;
}

export function hexA(hex, a) {
  if (!hex || hex[0] !== '#') return hex || `rgba(242,196,107,${a})`;
  if (hex.length === 4) hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
