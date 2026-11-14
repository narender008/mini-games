// HUD and card icons, drawn as pixel art and handed to the DOM as data URLs.
import { makeCanvas, Pix, mix, shade, type RGBA } from './pix';
import { P } from './palette';
import { drawKeeper } from './keeper';

const cache = new Map<string, string>();
function url(key: string, pix: Pix, scale = 4) {
  if (cache.has(key)) return cache.get(key)!;
  const c = makeCanvas(pix.w * scale, pix.h * scale);
  pix.drawTo(c.getContext('2d')!, 0, 0, scale);
  const u = c.toDataURL();
  cache.set(key, u);
  return u;
}

function glowDot(p: Pix, cx: number, cy: number, r: number, c: RGBA) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    const d = Math.hypot(x, y) / r;
    if (d <= 1) p.set(cx + x, cy + y, [c[0], c[1], c[2], Math.round(255 * (1 - d) * 0.6)]);
  }
}

export function iconLantern(): string {
  const p = new Pix(20, 20);
  glowDot(p, 10, 11, 9, P.amber);
  p.rect(9, 1, 2, 2, P.brassD); p.rect(7, 3, 6, 2, P.brass);
  p.rect(5, 5, 10, 11, P.brassD); p.rect(6, 5, 8, 10, P.glass);
  p.rect(8, 7, 4, 6, P.core); p.rect(9, 6, 2, 1, P.core);
  p.rect(6, 15, 8, 2, P.brass); p.rect(7, 17, 6, 1, P.brassD);
  p.set(6, 5, P.brassH); p.set(7, 3, P.brassH);
  p.outline(P.ink);
  return url('lantern', p);
}

export function iconDash(): string {
  const p = new Pix(20, 20);
  const c = P.cyan, cl = P.cyanL;
  for (let i = 0; i < 4; i++) p.line(1 + i, 7 + i * 2, 7 + i, 7 + i * 2, mix(c, P.ink, 0.4 + i * 0.1));
  // A running figure leaning forward.
  p.ellipse(13, 5, 2.2, 2.2, cl);
  p.stroke([12, 7, 10, 12], 2.5, 2, c);
  p.stroke([11, 9, 15, 10, 17, 8], 1.5, 1.2, cl);
  p.stroke([10, 12, 13, 15, 12, 18], 1.6, 1.4, c);
  p.stroke([10, 12, 7, 14, 5, 13], 1.6, 1.4, c);
  p.outline(P.ink);
  return url('dash', p);
}

export function iconSlash(): string {
  const p = new Pix(20, 20);
  for (let i = 0; i < 40; i++) {
    const t = i / 39, a = -2.4 + t * 2.2, r = 8 + t * 0.5;
    const x = 4 + Math.cos(a) * r * -1 + 6, y = 14 + Math.sin(a) * r;
    p.set(x, y, t > 0.7 ? P.core : t > 0.35 ? P.glass : P.amberD);
    if (t > 0.3) p.set(x + 1, y, t > 0.6 ? P.glass : P.amber);
    if (t > 0.5) p.set(x, y + 1, P.amber);
  }
  p.line(4, 17, 15, 3, P.core);
  p.line(5, 17, 16, 3, P.glass);
  p.outline(P.ink);
  return url('slash', p);
}

export function iconBolt(): string {
  const p = new Pix(20, 20);
  glowDot(p, 13, 7, 6, P.amber);
  p.line(3, 17, 14, 6, P.amberD, 2);
  p.line(4, 16, 15, 5, P.glass);
  p.poly([12, 4, 18, 2, 16, 8], P.core);
  p.outline(P.ink);
  return url('bolt', p);
}

export function iconStar(): string {
  const p = new Pix(16, 16);
  glowDot(p, 8, 8, 7, P.amber);
  p.line(8, 1, 8, 15, P.glass); p.line(1, 8, 15, 8, P.glass);
  p.line(5, 5, 11, 11, P.amber); p.line(11, 5, 5, 11, P.amber);
  p.rect(7, 7, 3, 3, P.core);
  return url('star', p);
}

export function iconPortrait(): string {
  const f = drawKeeper('down', 'idle', 0).pix;
  const p = new Pix(16, 16);
  // Crop the hood.
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const c = f.get(x + 5, y + 1);
    if (c[3]) p.set(x, y, c);
  }
  return url('portrait', p, 5);
}

/** Card art per upgrade category, with a small glyph that differs per upgrade. */
export function iconUpgrade(id: string, cat: 'offense' | 'defense' | 'mobility' | 'light'): string {
  const key = 'up_' + id;
  if (cache.has(key)) return cache.get(key)!;
  const p = new Pix(24, 24);
  const col = cat === 'offense' ? P.amber : cat === 'defense' ? mix(P.amber, P.danger, 0.5) : cat === 'mobility' ? P.cyan : P.magenta;
  const light = shade(col, 0.5);
  glowDot(p, 12, 12, 11, col);
  const g = GLYPHS[id];
  if (g) g(p, col, light);
  p.outline(P.ink);
  return url(key, p);
}

type Glyph = (p: Pix, c: RGBA, l: RGBA) => void;
const GLYPHS: Record<string, Glyph> = {
  kindled: (p, c, l) => { p.line(5, 19, 17, 5, c, 2); p.line(6, 18, 18, 4, l); p.poly([15, 3, 21, 2, 19, 8], l); },
  quickened: (p, c, l) => { for (let i = 0; i < 3; i++) { p.line(4 + i * 5, 6, 9 + i * 5, 12, l, 2); p.line(9 + i * 5, 12, 4 + i * 5, 18, c, 2); } },
  brand: (p, c, l) => { p.poly([12, 3, 18, 13, 15, 20, 9, 20, 6, 13], c); p.poly([12, 8, 15, 14, 12, 19, 9, 14], l); p.rect(11, 15, 2, 3, P.core); },
  arc: (p, _c, l) => { p.line(4, 4, 10, 11, P.cyanL, 2); p.line(10, 11, 7, 13, P.cyanL, 2); p.line(7, 13, 19, 20, P.cyan, 2); p.set(12, 12, l); },
  shardbloom: (p, c, l) => { for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; p.line(12, 12, 12 + Math.cos(a) * 9, 12 + Math.sin(a) * 9, i % 2 ? c : l, 2); } p.rect(10, 10, 4, 4, P.core); },
  piercing: (p, c, l) => { p.line(2, 12, 21, 12, c, 3); p.line(3, 12, 22, 12, l); p.poly([18, 7, 23, 12, 18, 17], P.core); p.rect(8, 6, 2, 12, P.ink2); },
  glass: (p, _c, l) => { p.rect(8, 4, 8, 15, P.ink2); p.rect(9, 5, 6, 13, mix(P.cyanL, P.glass, 0.5)); p.line(9, 8, 14, 15, P.ink); p.set(11, 9, l); },
  reaper: (p, c, l) => { p.stroke([6, 20, 8, 12, 14, 6], 2, 2, P.brassD); p.stroke([14, 6, 20, 5, 21, 10], 2.5, 1, l); p.set(16, 7, c); },
  heartwood: (p, c, l) => { p.ellipse(9, 10, 4, 4, c); p.ellipse(15, 10, 4, 4, c); p.poly([5, 11, 19, 11, 12, 20], c); p.set(8, 8, l); p.set(9, 8, l); },
  wisp: (p, c, l) => { p.ellipse(12, 12, 4, 4, l); p.ellipse(12, 12, 2, 2, P.core); for (let i = 0; i < 10; i++) { const a = i * 0.6; p.set(12 + Math.cos(a) * 9, 12 + Math.sin(a) * 6, c); } },
  emberheart: (p, c, l) => { p.ellipse(9, 11, 4, 4, P.danger); p.ellipse(15, 11, 4, 4, P.danger); p.poly([5, 12, 19, 12, 12, 21], P.danger); p.poly([12, 6, 15, 12, 12, 16, 9, 12], l); void c; },
  mending: (p, c, l) => { p.rect(10, 5, 4, 14, l); p.rect(5, 10, 14, 4, l); p.rect(11, 6, 2, 12, P.core); for (let i = 0; i < 4; i++) p.set(4 + i * 5, 4 + (i % 2) * 15, c); },
  aegis: (p, c, l) => { p.poly([5, 5, 19, 5, 18, 14, 12, 20, 6, 14], c); p.poly([8, 7, 16, 7, 15, 13, 12, 17, 9, 13], l); p.rect(11, 9, 2, 5, P.core); },
  phase: (p, c, l) => { for (let i = 0; i < 3; i++) p.ellipse(7 + i * 5, 12, 3, 6, i === 2 ? l : mix(c, P.ink, 0.5 - i * 0.2)); },
  trail: (p, c, l) => { for (let i = 0; i < 5; i++) p.poly([3 + i * 4, 18, 5 + i * 4, 10 + (i % 2) * 2, 7 + i * 4, 18], i % 2 ? c : l); p.line(2, 19, 22, 19, P.amberD); },
  fleet: (p, c, l) => { p.poly([4, 16, 14, 6, 20, 6, 10, 16], c); p.line(6, 15, 15, 7, l); for (let i = 0; i < 3; i++) p.line(2, 8 + i * 4, 6, 8 + i * 4, l); },
  afterglow: (p, c, l) => { p.ellipse(12, 12, 8, 8, mix(c, P.ink, 0.6)); p.ellipse(12, 12, 8, 8, (x, y) => (Math.hypot(x - 12, y - 12) > 6.5 ? l : null)); p.line(12, 12, 12, 6, P.core); p.line(12, 12, 16, 14, P.core); },
  flare: (p, c, l) => { for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; p.line(12 + Math.cos(a) * 5, 12 + Math.sin(a) * 5, 12 + Math.cos(a) * 10, 12 + Math.sin(a) * 10, i % 2 ? c : l); } p.ellipse(12, 12, 4, 4, P.core); },
  hoard: (p, c, l) => { for (let i = 0; i < 5; i++) { const x = 5 + (i * 7) % 15, y = 5 + (i * 11) % 14; p.line(x - 2, y, x + 2, y, l); p.line(x, y - 2, x, y + 2, l); p.set(x, y, P.core); } p.ellipse(12, 13, 3, 3, c); },
};
