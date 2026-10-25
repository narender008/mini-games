// Emberfall interface kit: drawing helpers shared by the HUD, the screens and
// the map (ported from the concept renderer). Everything takes the 2D context
// g and works in 1280 x 720 screen px; nothing here touches the sim.
import { SERIF, SANS, ABILITIES, ABILITY_NAMES } from '../config.js';
import { rgba, mixHex } from '../util.js';

export const TAU = Math.PI * 2;
// Interface clock in seconds: real time, so menus and HUD effects animate even while the sim is frozen.
export const clock = () => performance.now() / 1000;
export const INK = '#ffe9b8', DIM = 'rgba(255,220,200,0.62)', FAINT = 'rgba(255,220,200,0.42)', LINE = 'rgba(255,190,140,0.45)';
export { SERIF, SANS };

// Ability presentation: glyph shape, colour, key hint and the journal line.
export const ABIL = {
  'twin-leap': { glyph: 'jump', c: '#7ad8ff', key: 'JUMP ×2', desc: 'Leap again in mid-air.', hint: 'Sleeps in the Hollow Caves.' },
  'ember-dash': { glyph: 'dash', c: '#6ef2ff', key: 'SHIFT', desc: 'Burst across gaps, shatter cracks.', hint: 'Guarded by the Gravel Wyrm.' },
  'root-grip': { glyph: 'climb', c: '#9cff6a', key: 'INTO WALL', desc: 'Slide down walls and leap off them.', hint: 'Grows deep in the Lumen Thicket.' },
  'chain-hook': { glyph: 'hook', c: '#ffd36a', key: 'E', desc: 'Pull yourself to glowing rings.', hint: 'Held by the Sporemother.' },
  'fire-form': { glyph: 'fire', c: '#ff6a2a', key: 'F', desc: 'Wade through lava, burn thorns.', hint: 'Sleeps beneath the Drowned Cloister.' },
};
export const abilityList = () => ABILITIES.map((id) => ({ id, name: ABILITY_NAMES[id], ...ABIL[id] }));

export const BOSS_EPITHET = {
  'gravel-wyrm': 'it swallows the light',
  'sporemother': 'queen of the glowing rot',
  'drowned-abbot': 'he keeps the bells below',
  'cinder-king': 'heart of the mountain',
};

export function rr(g, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
export function glow(g, x, y, r, c, a = 1) {
  if (r <= 0 || a <= 0) return;
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, rgba(c, a)); gr.addColorStop(0.3, rgba(c, a * 0.4)); gr.addColorStop(1, rgba(c, 0));
  g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
}
export function additive(g, fn) { g.save(); g.globalCompositeOperation = 'lighter'; fn(); g.restore(); }

export function flamePath(g, x, y, s, lean = 0) {
  g.beginPath(); g.moveTo(x, y);
  g.bezierCurveTo(x - s * 0.7, y - s * 0.2, x - s * 0.5 + lean, y - s * 1.1, x + lean * 1.6, y - s * 1.9);
  g.bezierCurveTo(x + s * 0.2 + lean, y - s * 1.2, x + s * 0.75, y - s * 0.6, x + s * 0.5, y - s * 0.1);
  g.quadraticCurveTo(x + s * 0.2, y + s * 0.25, x, y); g.closePath();
}
export function flame(g, x, y, s, c, a = 1, lean = 0) {
  const gr = g.createLinearGradient(0, y, 0, y - s * 1.9);
  gr.addColorStop(0, rgba(c, a)); gr.addColorStop(1, rgba(c, 0));
  g.fillStyle = gr; flamePath(g, x, y, s, lean); g.fill();
}
// A health flame: lit (with a flicker phase t) or an empty outline.
export function flameIcon(g, x, y, s, lit, t = 0, k = 1) {
  if (lit) {
    const f = 1 + Math.sin(t * 9 + x) * 0.06 + Math.sin(t * 23 + x * 3) * 0.03, lean = Math.sin(t * 5 + x) * 1.6;
    additive(g, () => {
      glow(g, x, y - s, s * 2.4, '#ff6a1a', 0.55 * k);
      flame(g, x, y, s * f, '#ff4a1c', k, lean); flame(g, x, y, s * 0.62 * f, '#ffc14a', k, lean * 0.7); flame(g, x, y - 1, s * 0.3, '#ffffff', k);
    });
  } else { g.strokeStyle = 'rgba(255,190,140,0.38)'; g.lineWidth = 1.6; flamePath(g, x, y, s); g.stroke(); }
}
export function crystalIcon(g, x, y, s) {
  additive(g, () => glow(g, x, y, s * 2.2, '#5ae8ff', 0.6));
  g.fillStyle = '#9af4ff'; g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s * 0.6, y); g.lineTo(x, y + s); g.lineTo(x - s * 0.6, y); g.closePath(); g.fill();
  g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s * 0.6, y); g.lineTo(x, y); g.closePath(); g.fill();
}
export function skull(g, x, y, s, c, beaten = false) {
  if (!beaten) additive(g, () => glow(g, x, y, s * 2.5, c, 0.5));
  g.fillStyle = beaten ? 'rgba(200,180,190,0.55)' : c;
  g.beginPath(); g.arc(x, y - s * 0.15, s * 0.7, 0, TAU); g.fill(); g.fillRect(x - s * 0.4, y + s * 0.2, s * 0.8, s * 0.5);
  g.fillStyle = '#1a0808'; g.beginPath(); g.arc(x - s * 0.28, y - s * 0.1, s * 0.18, 0, TAU); g.arc(x + s * 0.28, y - s * 0.1, s * 0.18, 0, TAU); g.fill();
  if (beaten) { g.strokeStyle = 'rgba(255,230,200,0.8)'; g.lineWidth = Math.max(1.5, s * 0.16); g.beginPath(); g.moveTo(x - s * 0.9, y + s * 0.8); g.lineTo(x + s * 0.9, y - s * 0.9); g.stroke(); }
}
export function vesselIcon(g, x, y, s, taken) {
  g.save();
  g.strokeStyle = taken ? 'rgba(255,200,150,0.35)' : '#ff9a5a'; g.lineWidth = Math.max(1.4, s * 0.14);
  g.beginPath(); g.moveTo(x - s * 0.35, y - s * 0.7); g.lineTo(x + s * 0.35, y - s * 0.7); g.moveTo(x - s * 0.22, y - s * 0.7);
  g.quadraticCurveTo(x - s * 0.9, y + s * 0.1, x, y + s * 0.75); g.quadraticCurveTo(x + s * 0.9, y + s * 0.1, x + s * 0.22, y - s * 0.7); g.stroke();
  if (!taken) additive(g, () => { glow(g, x, y + s * 0.2, s * 1.8, '#ff6a1a', 0.5); flame(g, x, y + s * 0.5, s * 0.4, '#ffb347', 1); });
  g.restore();
}

export function abilityGlyph(g, glyph, x, y, s, c, lit) {
  g.save(); g.translate(x, y);
  g.strokeStyle = lit ? c : 'rgba(200,190,220,0.3)'; g.fillStyle = g.strokeStyle; g.lineWidth = s * 0.12; g.lineCap = 'round'; g.lineJoin = 'round';
  const k = s / 2;
  const line = (ax, ay, bx, by) => { g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); };
  if (glyph === 'jump') for (const o of [-0.35, 0.25]) { g.beginPath(); g.moveTo(-k * 0.55, k * o + k * 0.25); g.lineTo(0, k * o - k * 0.25); g.lineTo(k * 0.55, k * o + k * 0.25); g.stroke(); }
  if (glyph === 'dash') { g.beginPath(); g.moveTo(k * 0.1, -k * 0.45); g.lineTo(k * 0.6, 0); g.lineTo(k * 0.1, k * 0.45); g.stroke(); for (const o of [-0.25, 0, 0.25]) line(-k * 0.65, k * o, k * 0.2 - Math.abs(o) * k, k * o); }
  if (glyph === 'climb') { line(-k * 0.5, -k * 0.6, -k * 0.5, k * 0.6); for (const o of [-0.4, 0, 0.4]) { g.beginPath(); g.moveTo(-k * 0.3, k * o); g.quadraticCurveTo(k * 0.2, k * o - k * 0.25, k * 0.55, k * o + k * 0.1); g.stroke(); } }
  if (glyph === 'hook') { g.beginPath(); g.arc(0, k * 0.15, k * 0.38, 0, Math.PI * 1.1); g.stroke(); line(k * 0.38, k * 0.15, k * 0.38, -k * 0.6); line(-k * 0.38, k * 0.1, -k * 0.55, -k * 0.12); g.beginPath(); g.arc(k * 0.38, -k * 0.65, k * 0.12, 0, TAU); g.stroke(); }
  g.restore();
  if (glyph === 'fire') {
    if (lit) additive(g, () => { flame(g, x, y + k * 0.6, k * 0.62, c, 1); flame(g, x, y + k * 0.6, k * 0.35, '#ffd27a', 1); });
    else { g.save(); g.strokeStyle = 'rgba(200,190,220,0.3)'; g.lineWidth = s * 0.08; flamePath(g, x, y + k * 0.6, k * 0.62); g.stroke(); g.restore(); }
    return;
  }
  if (lit) additive(g, () => glow(g, x, y, s * 0.9, c, 0.25));
}
// A round ability badge. state: 'lit' | 'dim' (owned, unusable now) | 'none' (not found yet)
export function abilityBadge(g, x, y, r, a, state, sel = false) {
  const lit = state === 'lit';
  g.save();
  const gr = g.createRadialGradient(x, y - r * 0.3, 1, x, y, r);
  gr.addColorStop(0, lit ? '#2a2236' : '#17141e'); gr.addColorStop(1, '#0b0910');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.strokeStyle = lit ? rgba(a.c, 0.9) : state === 'dim' ? rgba(a.c, 0.35) : 'rgba(140,130,160,0.35)'; g.lineWidth = sel ? 3 : 1.6; g.stroke();
  if (sel) additive(g, () => glow(g, x, y, r * 2, a.c, 0.4));
  g.restore();
  if (state === 'dim') { g.save(); g.globalAlpha = 0.45; abilityGlyph(g, a.glyph, x, y, r * 1.1, a.c, true); g.restore(); }
  else abilityGlyph(g, a.glyph, x, y, r * 1.1, a.c, lit);
  if (state === 'none') { g.fillStyle = 'rgba(200,190,220,0.45)'; g.font = `bold ${Math.round(r * 0.55)}px ${SANS}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillText('?', x + r * 0.62, y + r * 0.85); }
}

export function logo(g, x, y, size) {
  g.save(); g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.font = `bold ${size}px ${SERIF}`;
  if ('letterSpacing' in g) g.letterSpacing = `${Math.round(size * 0.08)}px`;
  additive(g, () => glow(g, x, y - size * 0.35, size * 4.2, '#ff5a1a', 0.3));
  g.shadowColor = 'rgba(255,90,20,0.9)'; g.shadowBlur = 40;
  const gr = g.createLinearGradient(0, y - size, 0, y + 6);
  gr.addColorStop(0, '#fff6d0'); gr.addColorStop(0.45, '#ffc14a'); gr.addColorStop(0.8, '#ff5a1a'); gr.addColorStop(1, '#b8200c');
  g.fillStyle = gr; g.fillText('EMBERFALL', x, y);
  g.shadowBlur = 0; g.lineWidth = 1.2; g.strokeStyle = 'rgba(80,10,0,0.7)'; g.strokeText('EMBERFALL', x, y);
  if ('letterSpacing' in g) g.letterSpacing = '0px';
  g.restore();
}

export function text(g, s, x, y, { font = `20px ${SERIF}`, color = INK, align = 'center', base = 'alphabetic', a = 1, shadow = 0, spacing = 0 } = {}) {
  g.save(); g.globalAlpha *= a; g.font = font; g.fillStyle = color; g.textAlign = align; g.textBaseline = base;
  if (spacing && 'letterSpacing' in g) g.letterSpacing = spacing + 'px';
  if (shadow) { g.shadowColor = 'rgba(0,0,0,0.85)'; g.shadowBlur = shadow; }
  g.fillText(s, x, y);
  g.restore();
}
export function wrap(g, s, maxW, font) {
  g.save(); g.font = font;
  const out = [];
  for (const para of String(s).split('\n')) {
    let line = '';
    for (const w of para.split(/\s+/)) {
      const t = line ? line + ' ' + w : w;
      if (line && g.measureText(t).width > maxW) { out.push(line); line = w; } else line = t;
    }
    out.push(line);
  }
  g.restore();
  return out;
}

export function panel(g, x, y, w, h, a = 0.88) {
  g.save();
  g.fillStyle = `rgba(14,10,22,${a})`; rr(g, x, y, w, h, 16); g.fill();
  g.strokeStyle = LINE; g.lineWidth = 1.5; g.stroke();
  rr(g, x + 8, y + 8, w - 16, h - 16, 12); g.strokeStyle = 'rgba(255,190,140,0.14)'; g.stroke();
  g.restore();
}
export function vignette(g, a = 0.7, c = '#000000', W = 1280, H = 720) {
  const gr = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
  gr.addColorStop(0, rgba(c, 0)); gr.addColorStop(1, rgba(c, a));
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
}

// A menu entry drawn in the concept's style: serif text, flames either side when
// hovered or primary. b: { rect, label, disabled }, opts: { primary, hover, t, sub }
export function menuItem(g, b, { primary = false, hover = false, t = 0, size = 28, sub = '' } = {}) {
  const [x, y, w, h] = b.rect, cx = x + w / 2, cy = y + h / 2;
  const on = (hover || primary) && !b.disabled;
  g.save();
  if (hover && !b.disabled) {
    const gr = g.createLinearGradient(x, 0, x + w, 0);
    gr.addColorStop(0, 'rgba(255,140,60,0)'); gr.addColorStop(0.5, 'rgba(255,140,60,0.16)'); gr.addColorStop(1, 'rgba(255,140,60,0)');
    g.fillStyle = gr; g.fillRect(x, cy - h * 0.36, w, h * 0.72);
  }
  const lw = (() => { g.font = `${on ? 'bold ' : ''}${size}px ${SERIF}`; return g.measureText(b.label).width; })();
  text(g, b.label, cx, cy + size * 0.34 - (sub ? 8 : 0), { font: `${on ? 'bold ' : ''}${size}px ${SERIF}`, color: b.disabled ? 'rgba(220,200,210,0.35)' : on ? INK : 'rgba(255,220,200,0.72)', shadow: 8 });
  if (sub) text(g, sub, cx, cy + size * 0.34 + 16, { font: `17px ${SANS}`, color: 'rgba(255,228,210,0.7)', shadow: 6 });
  if (on) { flameIcon(g, cx - lw / 2 - 26, cy + 6 - (sub ? 8 : 0), 10, true, t); flameIcon(g, cx + lw / 2 + 26, cy + 6 - (sub ? 8 : 0), 10, true, t + 1.3); }
  g.restore();
}
// A small round icon button (pause, map, mute, close). icon: 'pause'|'map'|'sound'|'mute'|'close'
export function iconButton(g, b, icon, hover = false) {
  const [x, y, w, h] = b.rect, cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) * 0.34;
  g.save();
  g.fillStyle = hover ? 'rgba(40,24,40,0.85)' : 'rgba(10,8,16,0.62)'; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
  g.strokeStyle = hover ? 'rgba(255,200,140,0.85)' : 'rgba(255,200,150,0.42)'; g.lineWidth = 1.5; g.stroke();
  g.strokeStyle = g.fillStyle = hover ? INK : 'rgba(255,230,210,0.85)'; g.lineWidth = 2.4; g.lineCap = 'round'; g.lineJoin = 'round';
  const k = r * 0.5;
  if (icon === 'pause') { g.fillRect(cx - k * 0.6, cy - k * 0.7, k * 0.38, k * 1.4); g.fillRect(cx + k * 0.22, cy - k * 0.7, k * 0.38, k * 1.4); }
  if (icon === 'map') { g.beginPath(); g.moveTo(cx - k, cy - k * 0.6); g.lineTo(cx - k * 0.33, cy - k * 0.85); g.lineTo(cx + k * 0.33, cy - k * 0.6); g.lineTo(cx + k, cy - k * 0.85); g.lineTo(cx + k, cy + k * 0.6); g.lineTo(cx + k * 0.33, cy + k * 0.85); g.lineTo(cx - k * 0.33, cy + k * 0.6); g.lineTo(cx - k, cy + k * 0.85); g.closePath(); g.lineWidth = 1.8; g.stroke(); g.beginPath(); g.moveTo(cx - k * 0.33, cy - k * 0.85); g.lineTo(cx - k * 0.33, cy + k * 0.6); g.moveTo(cx + k * 0.33, cy - k * 0.6); g.lineTo(cx + k * 0.33, cy + k * 0.85); g.stroke(); }
  if (icon === 'sound' || icon === 'mute') {
    g.beginPath(); g.moveTo(cx - k, cy - k * 0.35); g.lineTo(cx - k * 0.5, cy - k * 0.35); g.lineTo(cx, cy - k * 0.85); g.lineTo(cx, cy + k * 0.85); g.lineTo(cx - k * 0.5, cy + k * 0.35); g.lineTo(cx - k, cy + k * 0.35); g.closePath(); g.fill();
    g.lineWidth = 2;
    if (icon === 'sound') { g.beginPath(); g.arc(cx + k * 0.1, cy, k * 0.5, -0.8, 0.8); g.stroke(); g.beginPath(); g.arc(cx + k * 0.1, cy, k * 0.95, -0.8, 0.8); g.stroke(); }
    else { g.beginPath(); g.moveTo(cx + k * 0.35, cy - k * 0.45); g.lineTo(cx + k * 1.05, cy + k * 0.45); g.moveTo(cx + k * 1.05, cy - k * 0.45); g.lineTo(cx + k * 0.35, cy + k * 0.45); g.stroke(); }
  }
  if (icon === 'close') { g.beginPath(); g.moveTo(cx - k * 0.7, cy - k * 0.7); g.lineTo(cx + k * 0.7, cy + k * 0.7); g.moveTo(cx + k * 0.7, cy - k * 0.7); g.lineTo(cx - k * 0.7, cy + k * 0.7); g.stroke(); }
  g.restore();
}

// Time as 1h 04m or 12m 30s.
export function fmtTime(s) {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(sec).padStart(2, '0')}s`;
}

// Cosmetic drifting embers (Math.random is fine: never touches the sim).
export function makeEmbers(n, box) {
  return Array.from({ length: n }, () => spawnEmber(box, true));
}
function spawnEmber([x, y, w, h], anywhere) {
  return { x: x + Math.random() * w, y: anywhere ? y + Math.random() * h : y + h + Math.random() * 30, vx: (Math.random() - 0.5) * 18, vy: -(20 + Math.random() * 60), s: 0.6 + Math.random() * 1.8, ph: Math.random() * TAU, c: Math.random() < 0.5 ? '#ffb347' : '#ff4a1c', box: [x, y, w, h] };
}
export function drawEmbers(g, list, dt, t) {
  additive(g, () => {
    for (let i = 0; i < list.length; i++) {
      let e = list[i];
      e.x += (e.vx + Math.sin(t * 1.3 + e.ph) * 14) * dt; e.y += e.vy * dt;
      if (e.y < e.box[1] - 20) e = list[i] = spawnEmber(e.box, false);
      const a = 0.55 + Math.sin(t * 6 + e.ph) * 0.35, len = 4 + e.s * 4;
      g.strokeStyle = rgba(e.c, a); g.lineWidth = e.s; g.lineCap = 'round';
      g.beginPath(); g.moveTo(e.x, e.y); g.lineTo(e.x - e.vx * 0.05, e.y + len); g.stroke();
      glow(g, e.x, e.y, e.s * 5, e.c, 0.3 * a);
    }
  });
}
export { rgba, mixHex };
