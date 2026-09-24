// The DOM layer for Block Tower: the start screen with its picture pickers,
// the in-game HUD for both modes (Little ones: one big knock-down button;
// Big kid: height, best, wobble meter, block tray, challenges and a Crash!
// button), the settings overlay that leaves the game running behind it,
// callouts and floating points.
//
// Block pictures (tray shapes, block sets, modes, challenges) are drawn here
// in code from the real sizes in shapes.js, in the current set's colours, so
// the tray always matches the blocks in the scene. Rooms and tools are
// hand-drawn symbols in index.html.
import { MODES, SETS, ROOMS, TOOLS, LABELS, REDUCED_MOTION } from './config.js';
import { SHAPES, SET_SHAPES } from './shapes.js';
import { canFullscreen } from './fullscreen.js';

const $ = (id) => document.getElementById(id);

export const CHALLENGES = ['free', 'bridge', 'arch', 'staircase', 'pyramid', 'castle'];

const NAMES = {
  ...LABELS,
  free: 'Free build',
  bridge: 'Bridge',
  arch: 'Arch',
  staircase: 'Staircase',
  pyramid: 'Pyramid',
  castle: 'Castle',
  cube: 'Cube',
  brick: 'Brick',
  plank: 'Plank',
  pillar: 'Pillar',
  cylinder: 'Cylinder',
  roof: 'Roof',
  halfround: 'Half-round',
};

// ------------------------------------------------------------ block pictures

// Oblique projection: x right, y up, z (depth) runs up and to the right, so
// every block shows its front, top and right faces like a toy on a shelf.
const KX = 0.55;
const KY = 0.4;
const S = 4; // SVG units per centimetre
const PHI = Math.atan2(KX, KY); // curved faces past this angle turn away from the viewer

const WOOD = { maple: '#e8c38f', beech: '#dea47c', walnut: '#8f5d3c' };
const RAINBOW = ['#e2483d', '#f28b2e', '#f4c531', '#4fae4f', '#3a85d8', '#8b5fc8', '#23a69a', '#ea6ea1'];
const INKS = ['#d8342c', '#2f6fd0', '#3a9a3e', '#e5761c', '#7c4fc0'];
const LETTERS = 'A1B2C3';

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// mix a colour toward white (t > 0) or black (t < 0)
function shade(hex, t) {
  const to = t > 0 ? 255 : 0;
  const k = Math.abs(t);
  const [r, g, b] = rgb(hex).map((c) => Math.round(c + (to - c) * k));
  return `rgb(${r},${g},${b})`;
}

// Colour for the i-th block of a picture in a set. Letters are cubes with
// printed faces; the set's other shapes are plain wood.
// `k` counts the cubes so far, so a picture's letters read A, 1, B...
function paint(setId, shapeId, i, k = 0) {
  if (setId === 'rainbow') return { c: RAINBOW[i % RAINBOW.length], gloss: true };
  const tones = [WOOD.maple, WOOD.beech, WOOD.walnut];
  if (setId === 'letters') {
    if (shapeId === 'cube') return { c: WOOD.maple, grain: true, letter: LETTERS[k % LETTERS.length], ink: INKS[k % INKS.length] };
    return { c: tones[i % 2], grain: true };
  }
  return { c: tones[i % 3], grain: true };
}

// perceived brightness 0..1, to keep printed details readable on dark wood
function light(hex) {
  const [r, g, b] = rgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

let gradId = 0;

/**
 * Draw toy blocks as an SVG string. parts: [{ s: shapeId, at: [x, y, z] in
 * cm (the block's min corner), c: colour, grain?, gloss?, letter?, ink?,
 * face? (a smiley), ruler? (a yellow ruler instead of a block, at size) }].
 * opts.min pads the view to at least that many cm so small shapes keep
 * their true size next to big ones.
 */
export function blockPicture(parts, { min = 0 } = {}) {
  const out = [];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const P = (x, y, z) => {
    const px = (x + z * KX) * S;
    const py = (-y - z * KY) * S;
    x0 = Math.min(x0, px);
    x1 = Math.max(x1, px);
    y0 = Math.min(y0, py);
    y1 = Math.max(y1, py);
    return `${px.toFixed(2)} ${py.toFixed(2)}`;
  };
  const poly = (pts, fill, edge) => out.push(`<path d="M${pts.map((p) => P(...p)).join('L')}Z" fill="${fill}" stroke="${edge}"/>`);
  const ring = (cx, y, cz, r, a0, a1, n = 18) => {
    const pts = [];
    for (let k = 0; k <= n; k++) {
      const a = a0 + ((a1 - a0) * k) / n;
      pts.push([cx + r * Math.cos(a), y, cz + r * Math.sin(a)]);
    }
    return pts;
  };
  // an arc in the x-y plane (front or back face of arches and half-rounds)
  const arc = (cx, y, z, r, a0, a1, n = 14) => {
    const pts = [];
    for (let k = 0; k <= n; k++) {
      const a = a0 + ((a1 - a0) * k) / n;
      pts.push([cx + r * Math.cos(a), y + r * Math.sin(a), z]);
    }
    return pts;
  };

  // back to front, bottom to top, left to right, so nearer blocks cover farther ones
  const sorted = [...parts].sort((a, b) => b.at[2] - a.at[2] || a.at[1] - b.at[1] || a.at[0] - b.at[0]);
  for (const part of sorted) {
    const [x, y, z] = part.at;
    const c = part.c;
    const top = shade(c, 0.3);
    const side = shade(c, -0.2);
    const edge = shade(c, -0.5);
    const size = part.ruler ? part.ruler : SHAPES[part.s].size.map((v) => v * 100);
    const [w, h, d] = size;
    const front = [];

    if (part.ruler || ['cube', 'brick', 'plank', 'pillar'].includes(part.s)) {
      poly([[x + w, y, z], [x + w, y, z + d], [x + w, y + h, z + d], [x + w, y + h, z]], side, edge);
      poly([[x, y + h, z], [x + w, y + h, z], [x + w, y + h, z + d], [x, y + h, z + d]], top, edge);
      front.push([[x, y, z], [x + w, y, z], [x + w, y + h, z], [x, y + h, z]]);
    } else if (part.s === 'cylinder') {
      const r = w / 2;
      const cx = x + r;
      const cz = z + r;
      const te = Math.atan(KX); // where the outline is widest on screen
      const body = [...ring(cx, y, cz, r, te + Math.PI, te + 2 * Math.PI), ...ring(cx, y + h, cz, r, te + 2 * Math.PI, te + Math.PI)];
      const id = `bt-cyl-${++gradId}`;
      out.push(`<defs><linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="${shade(c, -0.1)}"/><stop offset=".38" stop-color="${shade(c, 0.16)}"/><stop offset="1" stop-color="${shade(c, -0.28)}"/></linearGradient></defs>`);
      poly(body, `url(#${id})`, edge);
      poly(ring(cx, y + h, cz, r, 0, 2 * Math.PI, 28), top, edge);
    } else if (part.s === 'arch') {
      const r = SHAPES.arch.opening.radius * 100;
      const cx = x + w / 2;
      // the sliver of tunnel wall seen through the opening
      poly([...arc(cx, y, z, r, Math.PI - PHI, Math.PI), ...arc(cx, y, z + d, r, Math.PI, Math.PI - PHI)], shade(c, -0.42), edge);
      poly([[x + w, y, z], [x + w, y, z + d], [x + w, y + h, z + d], [x + w, y + h, z]], side, edge);
      poly([[x, y + h, z], [x + w, y + h, z], [x + w, y + h, z + d], [x, y + h, z + d]], top, edge);
      front.push([[x, y, z], ...arc(cx, y, z, r, Math.PI, 0), [x + w, y, z], [x + w, y + h, z], [x, y + h, z]]);
    } else if (part.s === 'roof') {
      poly([[x + w / 2, y + h, z], [x + w, y, z], [x + w, y, z + d], [x + w / 2, y + h, z + d]], shade(c, 0.18), edge);
      front.push([[x, y, z], [x + w, y, z], [x + w / 2, y + h, z]]);
    } else if (part.s === 'halfround') {
      const r = w / 2;
      const cx = x + r;
      poly([...arc(cx, y, z, r, 0, Math.PI - PHI), ...arc(cx, y, z + d, r, Math.PI - PHI, 0)], top, edge);
      front.push(arc(cx, y, z, r, 0, Math.PI, 18));
    }

    for (const f of front) poly(f, c, edge);

    // printed and painted details on the front face
    const fx = (x + w / 2) * S;
    const fy = -(y + h / 2) * S;
    if (part.grain && !part.letter && w >= 2) {
      const g = shade(c, -0.3);
      for (const t of h > 3 ? [0.3, 0.62] : [0.5]) {
        const gy = -(y + h * t) * S;
        const gx0 = (x + w * 0.14) * S;
        const gx1 = (x + w * 0.86) * S;
        if (part.s === 'roof' || part.s === 'halfround') continue;
        out.push(`<path d="M${gx0.toFixed(1)} ${gy.toFixed(1)}Q${fx.toFixed(1)} ${(gy - S * 0.5).toFixed(1)} ${gx1.toFixed(1)} ${(gy + S * 0.2).toFixed(1)}" fill="none" stroke="${g}" stroke-opacity=".45" stroke-width=".8"/>`);
      }
    }
    // a lacquer glint on flat fronts (curved and sloped faces get their shading instead)
    if (part.gloss && ['cube', 'brick', 'plank', 'pillar', 'arch'].includes(part.s)) {
      const gx = (x + Math.min(w * 0.18, 1.2)) * S;
      const gy = -(y + h * 0.84) * S;
      out.push(`<path d="M${gx.toFixed(1)} ${gy.toFixed(1)}h${(Math.min(w * 0.3, 3) * S).toFixed(1)}" stroke="#fff" stroke-opacity=".55" stroke-width="1.6" stroke-linecap="round"/>`);
    }
    if (part.letter) {
      const inset = 0.45 * S;
      out.push(`<rect x="${(x * S + inset).toFixed(1)}" y="${(-(y + h) * S + inset).toFixed(1)}" width="${(w * S - 2 * inset).toFixed(1)}" height="${(h * S - 2 * inset).toFixed(1)}" rx="1.4" fill="none" stroke="${part.ink}" stroke-width="1.1"/>`);
      out.push(`<text x="${fx.toFixed(1)}" y="${(fy + h * S * 0.25).toFixed(1)}" font-size="${(h * S * 0.68).toFixed(1)}" font-weight="900" font-family="Arial Rounded MT Bold, Arial, sans-serif" text-anchor="middle" fill="${part.ink}" stroke="none">${part.letter}</text>`);
    }
    if (part.face) {
      const e = w * S * 0.16;
      const ink = light(c) < 0.45 ? '#fff3dc' : '#3b2415';
      out.push(`<g fill="${ink}" stroke="none"><circle cx="${(fx - e).toFixed(1)}" cy="${(fy - e * 0.3).toFixed(1)}" r="1.5"/><circle cx="${(fx + e).toFixed(1)}" cy="${(fy - e * 0.3).toFixed(1)}" r="1.5"/></g>`);
      out.push(`<path d="M${(fx - e).toFixed(1)} ${(fy + e * 0.6).toFixed(1)}q${e.toFixed(1)} ${(e * 0.9).toFixed(1)} ${(2 * e).toFixed(1)} 0" fill="none" stroke="${ink}" stroke-width="1.3" stroke-linecap="round"/>`);
    }
    if (part.ruler) {
      const tick = [];
      for (let k = 1; k < h; k++) {
        const ty = -(y + k) * S;
        const len = k % 5 === 0 ? w * 0.7 : w * 0.4;
        tick.push(`M${(x * S).toFixed(1)} ${ty.toFixed(1)}h${(len * S).toFixed(1)}`);
      }
      out.push(`<path d="${tick.join('')}" stroke="#8a5a14" stroke-width=".8"/>`);
    }
  }

  // square view around the picture, at least `min` cm, with room for strokes
  const pad = 2;
  const m = min * S;
  let vw = Math.max(x1 - x0, m) + pad * 2;
  let vh = Math.max(y1 - y0, m) + pad * 2;
  vw = vh = Math.max(vw, vh);
  const vx = (x0 + x1) / 2 - vw / 2;
  const vy = (y0 + y1) / 2 - vh / 2;
  return `<svg viewBox="${vx.toFixed(1)} ${vy.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}" aria-hidden="true" class="blocks" stroke-width="1" stroke-linejoin="round">${out.join('')}</svg>`;
}

// Little pictures made of blocks, in cm (min corners). Colours come from the set.
const PICTURES = {
  // block sets: a toy house of two cubes on a brick under a roof
  set: [
    ['brick', 0, 0, 0],
    ['cube', 0, 4, 0],
    ['cube', 4, 4, 0],
    ['roof', 0, 8, 0],
  ],
  // modes: three chunky blocks with a smile, or a tall tower with a ruler
  little: [
    ['cube', 0, 0, 0],
    ['cube', 4.4, 0, 0],
    ['cube', 2.2, 4, 0, { face: true }],
  ],
  big: [
    ['brick', 0, 0, 0],
    ['cube', 2, 4, 0],
    ['brick', 0, 8, 0],
    ['cylinder', 2, 12, 0],
    ['roof', 0, 16, 0],
    ['ruler', -3.2, 0, 0, { ruler: [1.6, 20, 0.4] }],
  ],
  // challenges
  free: [
    ['brick', 0, 0, 0],
    ['cylinder', 0.6, 4, 0],
    ['halfround', 4.6, 4, 0],
    ['roof', 0, 8, 0],
  ],
  bridge: [
    ['pillar', 0, 0, 0.75],
    ['pillar', 9.5, 0, 0.75],
    ['plank', 0, 8, 0],
  ],
  arch: [
    ['cube', 0, 0, 0],
    ['cube', 8, 0, 0],
    ['arch', 2, 4, 0],
  ],
  staircase: [
    ['cube', 0, 0, 0],
    ['cube', 4, 0, 0],
    ['cube', 8, 0, 0],
    ['cube', 4, 4, 0],
    ['cube', 8, 4, 0],
    ['cube', 8, 8, 0],
  ],
  pyramid: [
    ['cube', 0, 0, 0],
    ['cube', 4, 0, 0],
    ['cube', 8, 0, 0],
    ['cube', 2, 4, 0],
    ['cube', 6, 4, 0],
    ['cube', 4, 8, 0],
  ],
  castle: [
    ['cube', 0, 0, 0],
    ['cube', 0, 4, 0],
    ['halfround', 0, 8, 0],
    ['arch', 4, 0, 0],
    ['cube', 12, 0, 0],
    ['cube', 12, 4, 0],
    ['halfround', 12, 8, 0],
  ],
};

function picture(name, setId) {
  let i = 0;
  let k = 0;
  const parts = PICTURES[name].map(([s, x, y, z, extra]) => {
    if (s === 'ruler') return { s, at: [x, y, z], c: '#f6cf4a', ...extra };
    const look = paint(setId, s, i++, k);
    if (s === 'cube') k++;
    return { s, at: [x, y, z], ...look, ...extra };
  });
  return blockPicture(parts);
}

// one tray shape on its own, true to size against a 9 cm frame
function shapePicture(shapeId, setId, index) {
  return blockPicture([{ s: shapeId, at: [0, 0, 0], ...paint(setId, shapeId, index) }], { min: 9 });
}

// ------------------------------------------------------------ picker groups

const GROUPS = [
  { key: 'mode', title: 'Who is playing', list: MODES, settingsOnly: true },
  { key: 'set', title: 'Blocks', list: SETS },
  { key: 'room', title: 'Room', list: ROOMS, cls: 'room', icon: (id) => `i-room-${id}` },
  { key: 'tool', title: 'Knock down', list: TOOLS, icon: (id) => `i-tool-${id}` },
];

const useIcon = (id) => `<svg viewBox="0 0 64 64" aria-hidden="true"><use href="#${id}" /></svg>`;

export class UI {
  constructor(handlers, sel = {}) {
    this.h = handlers;
    this.sel = { mode: 'little', set: 'wood', room: 'playroom', tool: 'flick', challenge: 'free', ...sel };
    if (!this.sel.challenge) this.sel.challenge = 'free';
    this.body = document.body;
    this.trayShapes = SET_SHAPES[this.sel.set];
    this.height = -1;
    this.best = -1;
    this.wobble = -1;
    this.progress = 0;
    // full screen is only offered where the browser supports it
    this.body.classList.toggle('can-fs', canFullscreen);
    for (const b of document.querySelectorAll('.fs')) b.hidden = !canFullscreen || b.classList.contains('menu-fs');
    this.buildPickers();
    this.buildChallenges();
    this.bind();
    this.setSelection(this.sel);
    this.setMode(this.sel.mode);
  }

  // ------------------------------------------------------------ building

  buildPickers() {
    for (const host of document.querySelectorAll('.pickers')) {
      host.textContent = '';
      const where = host.dataset.where;
      for (const g of GROUPS) {
        if (g.settingsOnly && where !== 'settings') continue;
        const box = document.createElement('div');
        box.className = `group g-${g.key}`;
        const head = document.createElement('h2');
        head.innerHTML = `<span>${g.title}</span><small data-choice="${g.key}"></small>`;
        box.appendChild(head);
        const grid = document.createElement('div');
        grid.className = 'grid';
        grid.setAttribute('role', 'radiogroup');
        grid.setAttribute('aria-label', g.title);
        for (const id of g.list) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = `tile ${g.cls || ''}`;
          b.dataset.key = g.key;
          b.dataset.id = id;
          b.setAttribute('role', 'radio');
          b.setAttribute('aria-label', NAMES[id]);
          b.title = NAMES[id];
          b.innerHTML = g.icon ? useIcon(g.icon(id)) : '';
          b.addEventListener('click', () => this.choose(g.key, id));
          grid.appendChild(b);
        }
        box.appendChild(grid);
        host.appendChild(box);
      }
    }
    this.paintPictures();
  }

  buildChallenges() {
    const grid = $('challenge-grid');
    grid.textContent = '';
    for (const id of CHALLENGES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tile chal';
      b.dataset.challenge = id;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', 'false');
      b.innerHTML = `<i class="pic"></i><span>${NAMES[id]}</span>`;
      b.addEventListener('click', () => {
        this.setChallenge(id, 0);
        this.openChallenges(false);
        this.h.challenge(id);
      });
      grid.appendChild(b);
    }
  }

  // Block pictures follow the chosen set, so repaint them when it changes.
  paintPictures() {
    const set = this.sel.set;
    for (const b of document.querySelectorAll('.tile[data-key="set"]')) {
      b.innerHTML = picture('set', b.dataset.id);
    }
    for (const b of document.querySelectorAll('[data-key="mode"], .mode[data-mode]')) {
      const id = b.dataset.id || b.dataset.mode;
      const label = b.querySelector('span');
      b.innerHTML = picture(id, set);
      if (label) b.appendChild(label);
    }
    for (const b of document.querySelectorAll('.chal')) {
      b.querySelector('.pic').innerHTML = picture(b.dataset.challenge, set);
    }
    $('challenge-pic').innerHTML = picture(this.sel.challenge, set);
  }

  // ------------------------------------------------------------ events

  bind() {
    $('play').addEventListener('click', () => this.h.play());
    for (const b of document.querySelectorAll('.mode[data-mode]')) {
      b.addEventListener('click', () => {
        this.setMode(b.dataset.mode);
        this.h.mode(b.dataset.mode);
      });
    }
    for (const b of document.querySelectorAll('.mute')) b.addEventListener('click', () => this.h.mute());
    for (const b of document.querySelectorAll('.fs')) b.addEventListener('click', () => this.h.fullscreen());
    $('to-menu').addEventListener('click', () => this.h.menu());
    $('settings-btn').addEventListener('click', () => this.toggleSettings());
    $('settings-close').addEventListener('click', () => this.toggleSettings(false));

    // Knock and turn answer on pointerdown: a toddler's tap feels instant, and
    // turn must work with a second finger while the first drags a block.
    // Keyboard presses arrive as clicks with no pointer (detail 0).
    const press = (el, fn) => {
      el.addEventListener('pointerdown', (e) => {
        if (e.button > 0 || el.disabled) return;
        e.preventDefault();
        e.stopPropagation();
        el.classList.add('down');
        fn();
      });
      const up = () => el.classList.remove('down');
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
      el.addEventListener('click', (e) => {
        if (e.detail === 0) fn();
      });
    };
    press($('knock'), () => this.h.knock());
    press($('turn'), () => this.h.turn());
    $('finish').addEventListener('click', () => this.h.finish());

    $('challenge-btn').addEventListener('click', () => this.openChallenges());
    // tapping anywhere else closes the challenge list
    document.addEventListener(
      'pointerdown',
      (e) => {
        if (!this.challengesOpen()) return;
        if (e.target.closest('#challenges, #challenge-btn')) return;
        this.openChallenges(false);
      },
      true,
    );
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (this.challengesOpen()) {
        this.openChallenges(false);
        $('challenge-btn').focus();
      } else if (this.settingsOpen()) {
        this.toggleSettings(false);
      }
    });
  }

  choose(key, id) {
    if (key === 'mode') this.setMode(id);
    else this.setSelection({ [key]: id });
    this.h.choose(key, id);
  }

  // ------------------------------------------------------------ state

  // 'loading' | 'menu' | 'playing'
  show(state) {
    this.state = state;
    this.body.dataset.state = state;
    $('menu').hidden = state !== 'menu';
    $('hud').hidden = state !== 'playing';
    document.querySelector('.menu-mute').hidden = state !== 'menu';
    document.querySelector('.menu-fs').hidden = state !== 'menu' || !canFullscreen;
    if (state !== 'playing') {
      if (this.settingsOpen()) this.toggleSettings(false);
      this.openChallenges(false);
      this.setHolding(false);
    }
  }

  setMode(mode) {
    this.sel.mode = mode;
    this.body.dataset.mode = mode;
    for (const b of document.querySelectorAll('.mode[data-mode]')) b.setAttribute('aria-checked', String(b.dataset.mode === mode));
    this.markTiles('mode', mode);
    if (mode !== 'big') {
      this.openChallenges(false);
      this.setHolding(false);
    }
  }

  // Any subset of { mode, set, room, tool, challenge }.
  setSelection(sel) {
    for (const key of ['set', 'room', 'tool']) {
      if (!sel[key]) continue;
      const changed = sel[key] !== this.sel[key];
      this.sel[key] = sel[key];
      this.markTiles(key, sel[key]);
      if (key === 'room') this.body.dataset.room = sel[key];
      if (key === 'tool') {
        for (const u of document.querySelectorAll('.tool-icon use')) u.setAttribute('href', `#i-tool-${sel[key]}`);
        $('knock').setAttribute('aria-label', `Knock the tower down: ${NAMES[sel[key]]}`);
        $('finish').setAttribute('aria-label', `Crash! Knock the tower down: ${NAMES[sel[key]]}`);
      }
      if (key === 'set' && (changed || !this.trayBuilt)) {
        this.setTray(sel[key]);
        this.paintPictures();
      }
    }
    if (sel.mode) this.setMode(sel.mode);
    if ('challenge' in sel) this.setChallenge(sel.challenge, sel.challenge === this.sel.challenge ? this.progress : 0);
  }

  markTiles(key, id) {
    for (const b of document.querySelectorAll(`.tile[data-key="${key}"]`)) b.setAttribute('aria-checked', String(b.dataset.id === id));
    for (const s of document.querySelectorAll(`[data-choice="${key}"]`)) s.textContent = NAMES[id] || '';
  }

  setMuted(m) {
    for (const b of document.querySelectorAll('.mute')) {
      b.setAttribute('aria-pressed', String(m));
      b.setAttribute('aria-label', m ? 'Sound on' : 'Sound off');
    }
  }

  setFullscreen(on) {
    for (const b of document.querySelectorAll('.fs')) {
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', on ? 'Leave full screen' : 'Full screen');
    }
  }

  setBest(cm) {
    const v = Math.max(0, Math.round(cm || 0));
    if (v === this.best) return;
    this.best = v;
    $('best').textContent = v;
    $('menu-best-cm').textContent = v;
    $('best-box').hidden = v === 0;
    $('menu-best').hidden = v === 0;
  }

  setHeight(cm) {
    const v = Math.max(0, Math.round(cm || 0));
    if (v === this.height) return;
    this.height = v;
    $('height').textContent = v;
  }

  // 0 = rock solid .. 1 = about to topple
  setWobble(v) {
    v = Math.max(0, Math.min(1, v || 0));
    if (Math.abs(v - this.wobble) < 0.004) return;
    this.wobble = v;
    const el = $('wobble');
    $('wobble-needle').style.transform = `rotate(${(-90 + v * 180).toFixed(1)}deg)`;
    const level = v > 0.72 ? 'high' : v > 0.42 ? 'warn' : 'calm';
    if (el.dataset.level !== level) el.dataset.level = level;
    el.setAttribute('aria-valuenow', String(Math.round(v * 100)));
    el.setAttribute('aria-valuetext', level === 'high' ? 'Very wobbly' : level === 'warn' ? 'A bit wobbly' : 'Steady');
  }

  // Rebuild the tray for a set (shapes default to the set's list in shapes.js).
  setTray(setId, shapes = SET_SHAPES[setId]) {
    this.trayBuilt = true;
    this.trayShapes = shapes;
    const tray = $('tray');
    tray.textContent = '';
    tray.dataset.count = String(shapes.length);
    shapes.forEach((shapeId, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'shape';
      b.dataset.shape = shapeId;
      b.setAttribute('aria-label', `${NAMES[shapeId] || shapeId}: drag it onto the tower`);
      b.title = NAMES[shapeId] || shapeId;
      b.innerHTML = shapePicture(shapeId, setId, i);
      // Hand the drag to the game straight away. Touch pointers are captured
      // by the button they start on; releasing that lets the game's
      // window-level move and up listeners follow the finger into the scene.
      b.addEventListener('pointerdown', (e) => {
        if (e.button > 0) return;
        e.preventDefault();
        if (b.hasPointerCapture && b.hasPointerCapture(e.pointerId)) b.releasePointerCapture(e.pointerId);
        this.h.trayStart(shapeId, e);
      });
      // keyboard: Enter or Space asks for the block without a pointer
      b.addEventListener('click', (e) => {
        if (e.detail === 0) this.h.trayStart(shapeId, null);
      });
      tray.appendChild(b);
    });
  }

  // true while (x, y) in screen px is over the tray, e.g. to put a dragged block back
  overTray(x, y) {
    if ($('hud').hidden || this.sel.mode !== 'big') return false;
    const r = $('tray').getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  setHolding(on) {
    $('turn').hidden = !on;
  }

  // id null means free build; progress 0..1 fills the ring
  setChallenge(id, progress = 0) {
    id = id || 'free';
    const p = Math.max(0, Math.min(1, progress || 0));
    const btn = $('challenge-btn');
    if (id !== this.sel.challenge || !$('challenge-pic').firstChild) {
      this.sel.challenge = id;
      $('challenge-pic').innerHTML = picture(id, this.sel.set);
    }
    this.progress = p;
    btn.dataset.challenge = id;
    $('challenge-name').textContent = NAMES[id];
    btn.classList.toggle('done', id !== 'free' && p >= 1);
    $('challenge-ring').style.strokeDashoffset = String(100 - p * 100);
    btn.setAttribute('aria-label', id === 'free' ? 'Challenges: free build' : `Challenge: ${NAMES[id]}, ${Math.round(p * 100)}% built`);
    for (const b of document.querySelectorAll('.chal')) b.setAttribute('aria-checked', String(b.dataset.challenge === id));
  }

  challengesOpen() {
    return !$('challenges').hidden;
  }

  openChallenges(open = !this.challengesOpen()) {
    $('challenges').hidden = !open;
    $('challenge-btn').setAttribute('aria-expanded', String(open));
    if (open) (document.querySelector('.chal[aria-checked="true"]') || document.querySelector('.chal')).focus({ preventScroll: true });
  }

  settingsOpen() {
    return !$('settings').hidden;
  }

  // The overlay floats over the running game; nothing is paused.
  toggleSettings(open = !this.settingsOpen()) {
    if (open === this.settingsOpen()) return;
    $('settings').hidden = !open;
    $('settings-btn').setAttribute('aria-expanded', String(open));
    if (open) this.openChallenges(false);
    this.h.settings(open);
  }

  setKnockEnabled(on) {
    $('knock').disabled = !on;
    $('finish').disabled = !on;
  }

  // ------------------------------------------------------------ celebrations

  // kind: '' | 'best' | 'challenge'
  callout(text, kind = '') {
    const host = $('callout');
    while (host.childElementCount > 1) host.firstElementChild.remove();
    const el = document.createElement('div');
    el.className = `call ${kind}`;
    const icon = kind === 'best' ? 'i-trophy' : kind === 'challenge' ? 'i-ribbon' : 'i-star';
    el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#${icon}" /></svg><span></span>`;
    el.querySelector('span').textContent = text;
    host.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  // floating "+10" at a screen position (px)
  points(x, y, text) {
    const host = $('points');
    if (host.childElementCount > 30) return;
    const el = document.createElement('div');
    el.className = 'pts';
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    if (!REDUCED_MOTION.matches) el.style.setProperty('--drift', `${Math.round((Math.random() - 0.5) * 40)}px`);
    host.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
}
