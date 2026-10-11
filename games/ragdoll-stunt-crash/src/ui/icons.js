// Every icon in the interface, drawn as inline SVG (no image files). They are
// <symbol>s in one hidden sprite, mounted once; icon('pause') is then a tiny
// <svg><use/></svg>. All of them draw in currentColor on a 24 x 24 grid, so
// CSS colours and sizes them. An unknown id falls back to the star.

const n1 = (v) => +v.toFixed(2);

function starPoints(cx, cy, ro, ri) {
  const p = [];
  for (let i = 0; i < 10; i++) {
    const a = ((-90 + i * 36) * Math.PI) / 180;
    const r = i % 2 ? ri : ro;
    p.push(`${n1(cx + Math.cos(a) * r)},${n1(cy + Math.sin(a) * r)}`);
  }
  return p.join(' ');
}

// a cog with trapezoid teeth and a hole
function gear(teeth, ro, ri) {
  const step = (Math.PI * 2) / teeth;
  let d = '';
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const pt = (r, da) => `${n1(12 + Math.cos(a + da) * r)} ${n1(12 + Math.sin(a + da) * r)}`;
    d += `${i ? 'L' : 'M'}${pt(ri, -step * 0.3)}L${pt(ro, -step * 0.17)}L${pt(ro, step * 0.17)}L${pt(ri, step * 0.3)}`;
  }
  return `${d}ZM15.2 12a3.2 3.2 0 1 0-6.4 0 3.2 3.2 0 1 0 6.4 0z`;
}

const stroke = (d, w = 2.4) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const fill = (d, extra = '') => `<path d="${d}" fill="currentColor" ${extra}/>`;
const CUT = 'fill="#0c0e16" fill-opacity=".55"';

const SYMBOLS = {
  play: fill('M7 4.2v15.6a.6.6 0 0 0 .9.5l12.6-7.8a.6.6 0 0 0 0-1L7.9 3.7a.6.6 0 0 0-.9.5z'),
  pause: fill('M6 4h4.2v16H6zM13.8 4H18v16h-4.2z'),
  retry: stroke('M19.5 12a7.5 7.5 0 1 1-2.4-5.5') + fill('M20.6 3.4v6.2h-6.2z'),
  speaker: fill('M3 9.5v5h3.6L11.5 19V5L6.6 9.5z') + stroke('M14.6 9a4.2 4.2 0 0 1 0 6M17.2 6.3a8 8 0 0 1 0 11.4', 2),
  mute: fill('M3 9.5v5h3.6L11.5 19V5L6.6 9.5z') + stroke('M15 9.5l5 5M20 9.5l-5 5', 2.2),
  fsenter: stroke('M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5', 2.6),
  fsexit: stroke('M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5', 2.6),
  back: stroke('M15 5l-7 7 7 7', 3),
  next: stroke('M9 5l7 7-7 7', 3),
  arrow: stroke('M4 12h15M13 6l6 6-6 6', 2.8),
  close: stroke('M6 6l12 12M18 6L6 18', 2.8),
  check: stroke('M4.5 12.5l5 5L19.5 7', 3.2),
  gear: `<path fill="currentColor" fill-rule="evenodd" d="${gear(8, 10.4, 7.8)}"/>`,
  star: `<polygon fill="currentColor" points="${starPoints(12, 12.8, 10.6, 4.5)}" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>`,
  starOff: `<polygon fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" points="${starPoints(12, 12.8, 9.8, 4.2)}"/>`,
  cash: `<path fill="currentColor" fill-rule="evenodd" d="M3.5 6.5h17a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-17a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM5 9.4a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zM19 12.4a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2z"/>`,
  lock: `<rect x="4.8" y="10.4" width="14.4" height="10.4" rx="2.2" fill="currentColor"/>` + stroke('M8 10.4V8a4 4 0 0 1 8 0v2.4', 2.6) + `<circle cx="12" cy="15.4" r="1.7" fill="#0c0e16"/>`,
  unlock: `<rect x="4.8" y="10.4" width="14.4" height="10.4" rx="2.2" fill="currentColor"/>` + stroke('M8 10.4V8a4 4 0 0 1 7.6-1.7', 2.6) + `<circle cx="12" cy="15.4" r="1.7" fill="#0c0e16"/>`,
  home: fill('M2.6 11.4L11.2 3.8a1.2 1.2 0 0 1 1.6 0l8.6 7.6a.6.6 0 0 1-.4 1H19.5V20a1 1 0 0 1-1 1H15v-6H9v6H5.5a1 1 0 0 1-1-1v-7.6H3a.6.6 0 0 1-.4-1z'),
  flag: fill('M4.2 3h2v18h-2z') + fill('M7 4h12.5l-2.8 4.2 2.8 4.2H7z'),
  trophy: fill('M7 3.5h10v5.4a5 5 0 0 1-10 0zM10.6 14h2.8v3.2h2.8V20H7.8v-2.8h2.8z') + stroke('M7 5H4v2.2A3 3 0 0 0 7 10M17 5h3v2.2A3 3 0 0 1 17 10', 2),
  warn: `<path fill="currentColor" fill-rule="evenodd" d="M12 2.8l10 17.4H2zM11 9v5h2V9zM11 15.6v2h2v-2z"/>`,
  car: fill('M1.6 15.6v-2.7c0-.8.5-1.4 1.3-1.6l2.5-.6 2.1-3.2c.4-.6 1-.9 1.7-.9h6c.6 0 1.2.3 1.6.7l2.6 3.2 2.1.5c.9.2 1.4.9 1.4 1.8v2.8z') +
    `<path d="M8.2 8.6h3.1v2.7H6.4zM12.6 8.6h2.8l2 2.7h-4.8z" ${CUT}/>` +
    `<circle cx="7" cy="16.6" r="3.1" fill="currentColor" stroke="#0c0e16" stroke-width="1.5"/><circle cx="17.4" cy="16.6" r="3.1" fill="currentColor" stroke="#0c0e16" stroke-width="1.5"/>` +
    `<circle cx="7" cy="16.6" r="1" fill="#0c0e16" fill-opacity=".7"/><circle cx="17.4" cy="16.6" r="1" fill="#0c0e16" fill-opacity=".7"/>`,
  ramp: fill('M1.5 20.5L21.5 8.4v12.1z') + `<circle cx="9.2" cy="12.9" r="2.5" fill="currentColor" stroke="#0c0e16" stroke-width="1.2"/>` + stroke('M3 20.8h19', 1.6),
  cannon: `<g transform="rotate(-32 12 13)"><rect x="3.2" y="9.4" width="18.4" height="7.2" rx="2.4" fill="currentColor"/><rect x="16.6" y="8.4" width="3" height="9.2" rx="1" fill="currentColor" stroke="#0c0e16" stroke-width=".9"/></g>` +
    `<circle cx="9.2" cy="17.4" r="4.4" fill="currentColor" stroke="#0c0e16" stroke-width="1.4"/><circle cx="9.2" cy="17.4" r="1.4" fill="#0c0e16" fill-opacity=".7"/>`,
  bolt: fill('M13.4 2L4.5 13.6h6L9.3 22l9.2-12h-6z'),
  skull: `<path fill="currentColor" fill-rule="evenodd" d="M12 2.6a8.4 8.4 0 0 0-8.4 8.4c0 2.7 1.3 4.7 3.2 6v3.2a.8.8 0 0 0 .8.8h2.2v-2h1.2v2h2.4v-2h1.2v2h2.2a.8.8 0 0 0 .8-.8V17c1.9-1.3 3.2-3.3 3.2-6A8.4 8.4 0 0 0 12 2.6zM8.4 9.2a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4zM15.6 9.2a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4z"/>`,
  rec: `<circle cx="12" cy="12" r="6.5" fill="currentColor"/>`,
};

export function mountSprite(root) {
  const svg = `<svg class="sprite" width="0" height="0" aria-hidden="true"><defs>${Object.keys(SYMBOLS)
    .map((k) => `<symbol id="rsc-${k}" viewBox="0 0 24 24">${SYMBOLS[k]}</symbol>`)
    .join('')}</defs></svg>`;
  root.insertAdjacentHTML('afterbegin', svg);
}

export function icon(id, cls = '') {
  return `<svg class="ic${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" aria-hidden="true"><use href="#rsc-${SYMBOLS[id] ? id : 'star'}"/></svg>`;
}

export const kindIcon = (kind) => (kind === 'ramp' ? 'ramp' : kind === 'cannon' ? 'cannon' : 'car');
