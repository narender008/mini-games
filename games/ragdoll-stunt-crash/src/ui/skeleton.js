// The BODY DAMAGE picture: a front-view stick skeleton as inline SVG, one
// group per part id in BODY_PARTS. Each part has a level (0 fine, 1 hurt,
// 2 fractured, 3 severed) and set() only touches the DOM when it changes:
// the class on the group is the whole state, CSS does the colours, the crack
// and the blinking stump.
import { h } from './dom.js';
import { BODY_PARTS } from '../sim/defs.js';

const SHOULDER_Y = 49;
// Where each part is drawn, in a 120 x 190 box. `a` is the joint end (where a
// stump shows when the part is gone), `b` the far end; limbs are lines, the
// rest have their own shapes.
const LIMBS = {
  uarmF: { a: [40, SHOULDER_Y], b: [27, 81] },
  larmF: { a: [27, 81], b: [19, 113], hand: true },
  uarmB: { a: [80, SHOULDER_Y], b: [93, 81] },
  larmB: { a: [93, 81], b: [101, 113], hand: true },
  ulegF: { a: [51, 99], b: [47, 141] },
  llegF: { a: [47, 141], b: [45, 177], foot: -1 },
  ulegB: { a: [69, 99], b: [73, 141] },
  llegB: { a: [73, 141], b: [75, 177], foot: 1 },
};

const bone = (inner) => `<g class="bn"><g class="bo">${inner}</g><g class="bi">${inner}</g></g>`;

function limb(l) {
  const [x0, y0] = l.a;
  const [x1, y1] = l.b;
  let d = `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}"/><circle cx="${x1}" cy="${y1}" r="3.4"/><circle cx="${x0}" cy="${y0}" r="3.4"/>`;
  if (l.hand) d += `<circle cx="${x1 + (x1 > 60 ? 1.5 : -1.5)}" cy="${y1 + 4}" r="3"/>`;
  if (l.foot) d += `<line x1="${x1}" y1="${y1}" x2="${x1 + l.foot * 10}" y2="${y1 + 3}"/>`;
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const crack = `<path class="cr" d="M${mx - 5} ${my - 4}l4 3-3 3 4 3-3 3"/>`;
  return `${bone(d)}${crack}<circle class="st" cx="${x0}" cy="${y0}" r="4.6"/>`;
}

const SHAPES = {
  head:
    bone(`<circle cx="60" cy="21" r="13.5"/><rect x="53" y="30" width="14" height="8" rx="2"/>`) +
    `<g class="dk"><ellipse cx="54.2" cy="20" rx="3.4" ry="3.9"/><ellipse cx="65.8" cy="20" rx="3.4" ry="3.9"/><path d="M60 24.5l-2 3.8h4z"/><path class="ln" d="M55 33.6h10M58 31.2v4.6M62 31.2v4.6"/></g>` +
    `<path class="cr" d="M64 9l-4 6 4 4-5 5 4 4"/><circle class="st" cx="60" cy="38" r="4.6"/>`,
  neck: bone(`<rect x="56.5" y="37" width="7" height="12" rx="2.4"/>`) + `<path class="cr" d="M55 42l4 2-3 2 5 2"/><circle class="st" cx="60" cy="49" r="4.6"/>`,
  chest:
    bone(
      `<line x1="60" y1="46" x2="60" y2="74"/><path d="M60 47L39 51M60 47L81 51" /><path d="M60 54C50 52 42 55 38 64M60 54C70 52 78 55 82 64" fill="none"/>` +
        `<path d="M60 61C51 59 44 62 41 70M60 61C69 59 76 62 79 70" fill="none"/><path d="M60 68C53 66 47 69 45 76M60 68C67 66 73 69 75 76" fill="none"/>`
    ) +
    `<path class="cr" d="M52 54l4 4-3 3 4 4-3 4"/><path class="cr" d="M68 56l-3 4 3 3-4 3"/>`,
  pelvis: bone(`<line x1="60" y1="74" x2="60" y2="90"/><path class="f" d="M42 88Q60 80 78 88L75 101Q69 109 62 103L60 98L58 103Q51 109 45 101Z"/>`) + `<path class="cr" d="M55 90l3 4-3 3 4 3"/>`,
};

export class Skeleton {
  constructor() {
    this.el = h('div', { class: 'skel' });
    let inner = '';
    this.ids = [];
    for (const bp of BODY_PARTS) {
      const art = LIMBS[bp.id] ? limb(LIMBS[bp.id]) : SHAPES[bp.shape];
      if (!art) continue;
      this.ids.push(bp.id);
      // back-side limbs are drawn first so the body overlaps them
      inner += `<g class="bp l0${bp.side === 'B' ? ' far' : ''}" data-part="${bp.id}"><title>${bp.label}</title>${art}</g>`;
    }
    this.el.innerHTML = `<svg viewBox="8 3 104 186" role="img" aria-label="Body damage">${inner}</svg>`;
    this.groups = new Map();
    this.level = new Map();
    for (const g of this.el.querySelectorAll('.bp')) {
      this.groups.set(g.dataset.part, g);
      this.level.set(g.dataset.part, 0);
    }
  }

  // writes the DOM only when the level really changed; returns true then
  set(id, level) {
    const g = this.groups.get(id);
    const l = level < 0 ? 0 : level > 3 ? 3 : level | 0;
    if (!g || this.level.get(id) === l) return false;
    this.level.set(id, l);
    g.setAttribute('class', `bp l${l}${g.classList.contains('far') ? ' far' : ''}`);
    return true;
  }

  reset() {
    for (const id of this.ids) this.set(id, 0);
  }
}
