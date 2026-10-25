// A friend on screen is a few cached bitmaps ("layers") plus a live face.
//
// The texture is the paint the friend wears: a canvas in friend units (k px
// per unit, origin ox, oy). For a painted friend it is the child's own page,
// cropped around the outline after the golden sweep filled any bare parts;
// for the title screen it is a procedural "kid paint" texture.
//
// buildRig() cuts that texture into the friend's parts: each part is clipped
// to its (slightly wobbly) outline so a little paint slips over the line,
// gets a cel shadow and a soft highlight, then a hand-inked line. Parts that
// share a rig group and sit next to each other in draw order merge into one
// bitmap. Per frame only transforms are applied: drawRig() walks the layers
// in order, nests each group's transform (body > head > ear, legs at the
// root) and draws the face (blinks, moods, looking around) on top of its group.
import {
  INK, PAPER, RAINBOW, GLITTER, TAU, rng, clamp, lerp, shade, rgba, mix, layer, el, bbox, wob, offsetPts, spath,
  inkLine, inkStroke, dotLine, circ, ell, rr, zigzag, star4, inkFill,
} from './lib.js';
import { FRIENDS, partsOf, friendBox, groupChain } from './friends.js';

export const TEX_K = 2; // texture px per friend unit
export const TEX_PAD = 16; // texture margin around the friend box, units

// ---------------------------------------------------------------- textures

export function texFrame(kind) {
  const b = friendBox(kind);
  return { ox: Math.floor(b.x - TEX_PAD), oy: Math.floor(b.y - TEX_PAD), w: Math.ceil(b.w + TEX_PAD * 2), h: Math.ceil(b.h + TEX_PAD * 2) };
}

// one part filled the way a child would: base, streaky back-and-forth strokes, a missed fleck
export function kidFill(g, pts, col, seed, o = {}) {
  const path = spath(wob(offsetPts(pts, 1.6), 3, seed + 7.7, 0.18)), b = bbox(pts), R = rng(Math.floor(seed * 131) + 7);
  const rainbow = col === 'rainbow', glitter = col === 'glitter', base = rainbow ? '#ffd23f' : glitter ? GLITTER : col;
  g.save(); g.clip(path);
  g.fillStyle = base; g.fillRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12);
  const ang = o.ang ?? R() * Math.PI, step = clamp(Math.min(b.w, b.h) * 0.22, 4, 12);
  if (rainbow) zigzag(g, b, ang, step * 0.9, step * 1.15, RAINBOW, R, { alpha: 0.95, bristle: 0.25 });
  else zigzag(g, b, ang, step, step * 1.1, [shade(base, 0.26), shade(base, -0.16), base], R, { alpha: o.alpha ?? 0.55, bristle: 0.22 });
  if (glitter) sprinkleGlitter(g, b, R, 1);
  if (b.w * b.h > 900 && !o.noFleck) {
    const flecks = Math.round(R() * 2);
    for (let i = 0; i < flecks; i++) { const x = b.x + b.w * (0.2 + R() * 0.6), y = b.y + b.h * (0.2 + R() * 0.6); g.strokeStyle = rgba(PAPER, 0.7); g.lineWidth = 1.6; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 4, y - 3, x + 8, y + 1); g.stroke(); }
  }
  g.restore();
  return path;
}
export function sprinkleGlitter(g, b, R, u) {
  const n = Math.min(400, (b.w * b.h) / (70 * u * u));
  for (let i = 0; i < n; i++) {
    const x = b.x + R() * b.w, y = b.y + R() * b.h;
    if (R() < 0.18) star4(g, x, y, (2 + R() * 3) * u, '#fffef2');
    else { g.fillStyle = R() < 0.5 ? 'rgba(255,255,255,0.9)' : 'rgba(255,226,122,0.9)'; circ(g, x, y, (0.6 + R()) * u); g.fill(); }
  }
}

const DEF_TEX = new Map();
// procedural kid paint in the friend's palette (title screen, fallbacks)
export function defaultTexture(kind, pal, seed = 1) {
  const key = kind + '|' + (pal || []).join(',') + '|' + seed;
  if (DEF_TEX.has(key)) return DEF_TEX.get(key);
  const F = FRIENDS[kind], fr = texFrame(kind), k = TEX_K;
  const c = layer(fr.w * k, fr.h * k), g = c.getContext('2d');
  g.setTransform(k, 0, 0, k, -fr.ox * k, -fr.oy * k);
  const p = pal || F.pal;
  partsOf(kind).forEach((part, i) => kidFill(g, part.pts, p[part.slot] || F.pal[part.slot], seed + i * 3.17 + kind.length));
  const tex = { canvas: c, ox: fr.ox, oy: fr.oy, k };
  DEF_TEX.set(key, tex);
  return tex;
}

// ---------------------------------------------------------------- rig build

function partPathFor(part, i, kind) { return spath(wob(offsetPts(part.pts, 1.2), 2.2, i * 3.17 + kind.length + 7.7, 0.18)); }

function shadePart(g, pts, path) {
  const b = bbox(pts);
  const k = clamp(Math.min(b.w, b.h) * 0.16, 2.5, 18), sh = new Path2D();
  sh.rect(b.x - 60, b.y - 60, b.w + 120, b.h + 120);
  sh.addPath(path, new DOMMatrix().translate(-k * 0.6, -k));
  g.fillStyle = 'rgba(70,30,110,0.2)'; g.fill(sh, 'evenodd');
  const hx = b.x + b.w * 0.32, hy = b.y + b.h * 0.25;
  const hl = g.createRadialGradient(hx, hy, 0, hx, hy, Math.max(b.w, b.h) * 0.45);
  hl.addColorStop(0, 'rgba(255,252,240,0.36)'); hl.addColorStop(1, 'rgba(255,252,240,0)');
  g.fillStyle = hl; g.fillRect(b.x, b.y, b.w, b.h);
}

function drawLines(g, lines, dots, col, w) {
  g.save(); g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
  for (const L of lines) { g.beginPath(); g.moveTo(L[0][0], L[0][1]); for (let i = 1; i < L.length; i++) g.lineTo(L[i][0], L[i][1]); g.stroke(); }
  g.fillStyle = col; for (const [dx, dy, dr] of dots) { circ(g, dx, dy, dr); g.fill(); }
  g.restore();
}

// which layer index carries each ink detail line
function assignLines(def, parts, runs) {
  const out = runs.map(() => ({ lines: [], dots: [] }));
  const faceRun = (() => { let r = -1; runs.forEach((run, i) => { if (run.group === def.face.group) r = i; }); return r < 0 ? runs.length - 1 : r; })();
  const find = (x, y) => {
    for (let pi = parts.length - 1; pi >= 0; pi--) { const b = bbox(parts[pi].pts); if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return runs.findIndex((r) => r.parts.includes(pi)); }
    return faceRun;
  };
  for (const L of def.lines || []) out[find(L[0][0], L[0][1])].lines.push(L);
  for (const d of def.dots || []) out[faceRun].dots.push(d);
  return out;
}

// cut the texture into cached layer bitmaps at kpx device px per unit
export function buildRig(kind, tex, kpx, o = {}) {
  const def = FRIENDS[kind], parts = partsOf(kind);
  const runs = [];
  parts.forEach((p, i) => {
    const last = runs[runs.length - 1];
    if (last && last.group === p.group) last.parts.push(i);
    else runs.push({ group: p.group, parts: [i] });
  });
  const details = assignLines(def, parts, runs);
  const inkW = Math.max(3.6, 2.1 / (kpx / (o.dpr || 1)));
  const layers = runs.map((run, ri) => {
    const pts = []; for (const i of run.parts) pts.push(...parts[i].pts);
    for (const L of details[ri].lines) pts.push(...L);
    for (const [x, y, r] of details[ri].dots) pts.push([x - r, y - r], [x + r, y + r]);
    const b = bbox(pts), m = 8 + inkW;
    const x0 = b.x - m, y0 = b.y - m, w = b.w + 2 * m, h = b.h + 2 * m;
    const c = layer(w * kpx, h * kpx), g = c.getContext('2d');
    g.setTransform(kpx, 0, 0, kpx, -x0 * kpx, -y0 * kpx);
    for (const i of run.parts) {
      const part = parts[i], path = partPathFor(part, i, kind);
      g.save(); g.clip(path);
      if (tex) {
        if (o.backfill) { g.fillStyle = o.backfill; g.fillRect(x0, y0, w, h); }
        g.drawImage(tex.canvas, tex.ox, tex.oy, tex.canvas.width / tex.k, tex.canvas.height / tex.k);
      } else { g.fillStyle = '#f7f4f1'; g.fillRect(x0, y0, w, h); }
      if (!o.flat) shadePart(g, part.pts, path);
      g.restore();
      inkLine(g, part.pts, inkW, i * 3.17 + kind.length);
    }
    if (details[ri].lines.length || details[ri].dots.length) drawLines(g, details[ri].lines, details[ri].dots, INK, Math.max(2.6, inkW * 0.75));
    return { group: run.group, chain: groupChain(def, run.group), canvas: c, x0, y0, w, h, face: false };
  });
  // the face rides on the last layer of its group
  let fi = -1; layers.forEach((l, i) => { if (l.group === def.face.group) fi = i; });
  if (fi < 0) fi = layers.length - 1;
  layers[fi].face = true;
  return { kind, def, layers, kpx, faceChain: groupChain(def, def.face.group) };
}

// ---------------------------------------------------------------- doodle buddy

// the blank page comes alive as whatever was painted: googly eyes, a smile, little feet
export function makeDoodleDef(tex, eyeInfo) {
  const { ex, ey, ew, mouthY } = eyeInfo;
  const er = clamp(ew * 0.2, 12, 22);
  return {
    pal: [eyeInfo.color || '#9b6ff0'], doodle: true,
    groups: { footL: { pivot: [-30, -12], root: true }, footR: { pivot: [30, -12], root: true } },
    face: { group: 'body', googly: true, eyes: [[ex - er * 1.15, ey], [ex + er * 1.15, ey]], er, mouth: [ex, mouthY, clamp(ew * 0.45, 18, 40)], blush: [[ex - er * 2.3, mouthY - 4], [ex + er * 2.3, mouthY - 4]] },
    mouthAt: [ex, mouthY], gait: 'waddle', voice: 1.1, trick: 'jelly', box: { x: tex.ox, y: tex.oy, w: tex.canvas.width / tex.k, h: tex.canvas.height / tex.k, cx: tex.ox + tex.canvas.width / tex.k / 2, cy: tex.oy + tex.canvas.height / tex.k / 2 },
  };
}

export function buildDoodleRig(tex, def, kpx, o = {}) {
  const footCol = shade(def.pal[0], -0.15);
  const w = tex.canvas.width / tex.k, h = tex.canvas.height / tex.k;
  const inkW = Math.max(3.6, 2.1 / (kpx / (o.dpr || 1)));
  // body: the painting itself with an ink rim grown around its shape
  const m = 10 + inkW, x0 = tex.ox - m, y0 = tex.oy - m;
  const c = layer((w + 2 * m) * kpx, (h + 2 * m) * kpx), g = c.getContext('2d');
  g.setTransform(kpx, 0, 0, kpx, -x0 * kpx, -y0 * kpx);
  const sil = layer(c.width, c.height), sg = sil.getContext('2d');
  sg.setTransform(kpx, 0, 0, kpx, -x0 * kpx, -y0 * kpx);
  for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; sg.drawImage(tex.canvas, tex.ox + Math.cos(a) * inkW * 0.9, tex.oy + Math.sin(a) * inkW * 0.9, w, h); }
  sg.setTransform(1, 0, 0, 1, 0, 0); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = INK; sg.fillRect(0, 0, sil.width, sil.height);
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(sil, 0, 0); g.restore();
  g.drawImage(tex.canvas, tex.ox, tex.oy, w, h);
  // a soft highlight and shade so it reads as a little round body
  g.save(); g.globalCompositeOperation = 'source-atop';
  const hl = g.createRadialGradient(tex.ox + w * 0.35, tex.oy + h * 0.25, 0, tex.ox + w * 0.35, tex.oy + h * 0.25, Math.max(w, h) * 0.6);
  hl.addColorStop(0, 'rgba(255,252,240,0.3)'); hl.addColorStop(1, 'rgba(255,252,240,0)'); g.fillStyle = hl; g.fillRect(x0, y0, w + 2 * m, h + 2 * m);
  const sh = g.createLinearGradient(0, tex.oy + h * 0.5, 0, tex.oy + h); sh.addColorStop(0, 'rgba(70,30,110,0)'); sh.addColorStop(1, 'rgba(70,30,110,0.18)'); g.fillStyle = sh; g.fillRect(x0, y0, w + 2 * m, h + 2 * m);
  g.restore();
  const body = { group: 'body', chain: ['body'], canvas: c, x0, y0, w: w + 2 * m, h: h + 2 * m, face: true };
  const foot = (fx) => {
    const fw = 26, fh = 13, P = el(fx, -9, fw, fh), b = bbox(P), mm = 6 + inkW;
    const fc = layer((b.w + 2 * mm) * kpx, (b.h + 2 * mm) * kpx), fg = fc.getContext('2d');
    fg.setTransform(kpx, 0, 0, kpx, -(b.x - mm) * kpx, -(b.y - mm) * kpx);
    fg.fillStyle = footCol; fg.fill(spath(P)); fg.fillStyle = 'rgba(255,255,255,0.35)'; ell(fg, fx - 8, -14, 8, 3); fg.fill();
    inkLine(fg, P, inkW, fx);
    return { canvas: fc, x0: b.x - mm, y0: b.y - mm, w: b.w + 2 * mm, h: b.h + 2 * mm };
  };
  const fl = foot(-30), fr2 = foot(30);
  const layers = [
    { group: 'footL', chain: ['footL'], ...fl, face: false },
    { group: 'footR', chain: ['footR'], ...fr2, face: false },
    body,
  ];
  return { kind: 'doodle', def, layers, kpx, faceChain: ['body'] };
}

// ---------------------------------------------------------------- per-frame drawing

const BODY_PIVOT = [0, -40];

function applyGroup(g, def, name, pose) {
  const a = pose.g && pose.g[name];
  if (name === 'body') {
    if (!a) return;
    g.translate((a.dx || 0), (a.dy || 0));
    if (a.r || a.sx || a.sy) { g.translate(BODY_PIVOT[0], BODY_PIVOT[1]); if (a.r) g.rotate(a.r); if (a.sx || a.sy) g.scale(a.sx || 1, a.sy || 1); g.translate(-BODY_PIVOT[0], -BODY_PIVOT[1]); }
    return;
  }
  if (!a) return;
  const gd = def.groups && def.groups[name];
  const pv = gd ? gd.pivot : [0, 0];
  g.translate(pv[0] + (a.dx || 0), pv[1] + (a.dy || 0));
  if (a.r) g.rotate(a.r);
  if (a.sx || a.sy) g.scale(a.sx || 1, a.sy || 1);
  g.translate(-pv[0], -pv[1]);
}

// pose: { x, y, s, flip, rot, sx, sy, lift, g: { group: { r, dx, dy, sx, sy } }, mood, blink, look, alpha, clipY }
export function drawRig(g, rig, pose) {
  const def = rig.def, s = pose.s, inv = 1 / rig.kpx;
  g.save();
  if (pose.alpha != null && pose.alpha < 1) g.globalAlpha *= pose.alpha;
  g.translate(pose.x, pose.y - (pose.lift || 0));
  if (pose.rot) g.rotate(pose.rot);
  g.scale(s * (pose.flip ? -1 : 1) * (pose.sx || 1), s * (pose.sy || 1));
  for (const L of rig.layers) {
    g.save();
    for (const name of L.chain) applyGroup(g, def, name, pose);
    g.drawImage(L.canvas, L.x0, L.y0, L.canvas.width * inv, L.canvas.height * inv);
    if (L.face) {
      drawFace(g, def, pose, s);
    }
    g.restore();
  }
  g.restore();
}

// ---------------------------------------------------------------- faces

export function drawFace(g, def, o, s = 1) {
  const f = def.face, mood = o.mood || 'happy', line = !!o.line, col = line ? '#a39cab' : INK;
  const blink = o.blink || 0, look = o.look || [0, 0], t = o.time || 0;
  g.save();
  g.lineCap = 'round'; g.lineJoin = 'round';
  const minW = (w) => Math.max(w, 1.6 / Math.max(0.05, s));
  if (!line && f.blush) {
    const pink = mood === 'joy' || mood === 'love' ? 0.62 : 0.45;
    for (const [bx, by] of f.blush) { g.fillStyle = `rgba(255,110,140,${pink})`; ell(g, bx, by, 10, 6.5); g.fill(); }
  }
  const closedEyes = mood === 'sleep' || mood === 'joy' || mood === 'love' || mood === 'munch' || blink > 0.7;
  for (const [ex, ey] of f.eyes) {
    if (f.googly && !line) {
      const R = f.er;
      g.fillStyle = '#ffffff'; circ(g, ex, ey, R); g.fill(); g.strokeStyle = INK; g.lineWidth = minW(3.2); g.stroke();
      if (mood === 'sleep' || blink > 0.7) { g.beginPath(); g.moveTo(ex - R * 0.7, ey); g.lineTo(ex + R * 0.7, ey); g.stroke(); continue; }
      const jx = Math.sin(t * 9 + ex) * (o.jiggle || 0), jy = Math.cos(t * 11 + ex) * (o.jiggle || 0);
      const px = ex + clamp(look[0] * 0.45 + jx, -0.45, 0.45) * R, py = ey + clamp(look[1] * 0.45 + jy + 0.1, -0.45, 0.5) * R;
      g.fillStyle = INK; circ(g, px, py, R * 0.5); g.fill();
      g.fillStyle = '#fff'; circ(g, px + R * 0.17, py - R * 0.17, R * 0.15); g.fill();
      continue;
    }
    if (closedEyes) {
      g.strokeStyle = col; g.lineWidth = Math.max(3.2, f.er * 0.42);
      g.beginPath();
      if (mood === 'joy' || mood === 'love' || mood === 'munch') g.arc(ex, ey + 4, f.er * 0.85, 1.15 * Math.PI, 1.85 * Math.PI);
      else g.arc(ex, ey - 2, f.er * 0.8, 0.15 * Math.PI, 0.85 * Math.PI);
      g.stroke(); continue;
    }
    if (line) { g.fillStyle = '#c9c3cf'; ell(g, ex, ey, f.er * 0.8, f.er); g.fill(); continue; }
    const sy = 1 - blink * 0.9;
    const lx = clamp(look[0], -1, 1) * f.er * 0.22, ly = clamp(look[1], -1, 1) * f.er * 0.2;
    g.fillStyle = INK; ell(g, ex + lx, ey + ly, f.er * 0.82, f.er * sy); g.fill();
    if (sy > 0.4) {
      g.fillStyle = '#ffffff'; circ(g, ex + lx + f.er * 0.25, ey + ly - f.er * 0.38 * sy, f.er * 0.34); g.fill();
      circ(g, ex + lx - f.er * 0.3, ey + ly + f.er * 0.4 * sy, f.er * 0.15); g.fill();
    }
  }
  if (f.noseBlob) { const [nx, ny, nr] = f.noseBlob; g.fillStyle = col; ell(g, nx, ny, nr, nr * 0.72); g.fill(); if (!line) { g.fillStyle = 'rgba(255,255,255,0.7)'; ell(g, nx - nr * 0.3, ny - nr * 0.3, nr * 0.3, nr * 0.2); g.fill(); } }
  if (f.noseTri) { const [nx, ny] = f.noseTri; g.fillStyle = line ? col : '#e8607e'; g.beginPath(); g.moveTo(nx - 6, ny - 3); g.quadraticCurveTo(nx, ny - 6, nx + 6, ny - 3); g.quadraticCurveTo(nx, ny + 6, nx - 6, ny - 3); g.fill(); }
  if (f.nose) for (const [nx, ny] of f.nose) { g.fillStyle = col; ell(g, nx, ny, 3, 2.2); g.fill(); }
  if (f.mouth) {
    const [mx, my, mw] = f.mouth;
    g.strokeStyle = col; g.lineWidth = minW(3.2);
    let open = mood === 'open' || mood === 'joy' || mood === 'love' ? 1 : 0;
    if (mood === 'munch') open = 0.25 + 0.75 * Math.abs(Math.sin(t * 14));
    if (mood === 'oh') {
      g.fillStyle = '#7a2a48'; ell(g, mx, my + 3, mw * 0.2, mw * 0.26); g.fill(); g.stroke();
    } else if (open > 0 && !line) {
      g.fillStyle = '#7a2a48'; g.beginPath(); g.moveTo(mx - mw / 2, my - 2); g.quadraticCurveTo(mx, my + mw * 0.95 * open, mx + mw / 2, my - 2); g.closePath(); g.fill(); g.stroke();
      g.save(); g.clip(); g.fillStyle = '#ff7f9e'; ell(g, mx, my + mw * 0.55 * open, mw * 0.3, mw * 0.25 * open); g.fill(); g.restore();
    } else {
      g.beginPath(); g.moveTo(mx - mw / 2, my - 2); g.quadraticCurveTo(mx, my + mw * 0.45, mx + mw / 2, my - 2); g.stroke();
      if (f.tongue && !line) { g.fillStyle = '#ff7f9e'; g.beginPath(); g.moveTo(mx - 6, my + 3); g.quadraticCurveTo(mx, my + 18, mx + 6, my + 3); g.fill(); }
    }
  } else if (def.mouthAt && (mood === 'munch' || mood === 'open' || mood === 'joy') && !line) {
    // penguin: the beak opens
    const [mx, my] = def.mouthAt; const open = mood === 'munch' ? Math.abs(Math.sin(t * 14)) : 1;
    g.fillStyle = '#7a2a48'; ell(g, mx, my + 2, 7, 4 * open + 1); g.fill();
  }
  if (f.teeth && !line && mood !== 'open' && mood !== 'joy') { const [tx, ty] = f.teeth; g.fillStyle = '#fff'; g.strokeStyle = col; g.lineWidth = 2; rr(g, tx - 5, ty, 10, 8, 2); g.fill(); g.stroke(); }
  if (f.whiskers) { const [wx, wy] = f.whiskers; g.strokeStyle = col; g.lineWidth = minW(2.2); for (const sd of [-1, 1]) for (const dy of [-4, 4]) { g.beginPath(); g.moveTo(wx + sd * 24, wy + dy * 0.5); g.lineTo(wx + sd * 50, wy + dy * 2 - 2); g.stroke(); } }
  g.restore();
}

// ---------------------------------------------------------------- outlines

// grey line art (pick bubbles), drawn at x, y with s px per unit
export function drawLineArt(g, kind, x, y, s, o = {}) {
  const def = FRIENDS[kind], parts = partsOf(kind);
  g.save(); g.translate(x, y); g.scale(s, s);
  const inkW = (o.ink ?? 4.5) / s;
  parts.forEach((part, i) => {
    const path = spath(wob(part.pts, 0.8, i * 3.17 + kind.length));
    g.fillStyle = o.fill || '#f6f3ef'; g.fill(path);
    g.strokeStyle = o.lineCol || '#a39cab'; g.lineWidth = inkW * 0.9; g.lineJoin = 'round'; g.stroke(path);
  });
  drawFace(g, def, { line: true });
  g.strokeStyle = o.lineCol || '#a39cab'; drawLines(g, def.lines || [], def.dots || [], '#a39cab', inkW * 0.7);
  g.restore();
}

// the chunky dotted outline for the easel: hidden lines of covered parts are
// erased, so the result is a transparent overlay that sits above the paint
export function drawDottedOutline(g, kind, x, y, s, o = {}) {
  const def = FRIENDS[kind], parts = partsOf(kind);
  g.save(); g.translate(x, y); g.scale(s, s);
  const inkW = (o.ink ?? 6) / s, col = o.col || '#5b4a6e';
  parts.forEach((part) => {
    const path = spath(part.pts);
    g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.fill(path); g.restore();
    dotLine(g, part.pts, inkW * 1.25, inkW * 2.3, col);
  });
  if (o.face !== false) drawFace(g, def, { mood: 'happy' }, s);
  drawLines(g, def.lines || [], def.dots || [], col, inkW * 0.6);
  g.restore();
}

// union of all parts (for coverage and for the hollow left on the page)
export function friendUnionPath(kind, x, y, s) {
  const p = new Path2D(), m = new DOMMatrix().translate(x, y).scale(s, s);
  for (const part of partsOf(kind)) p.addPath(spath(part.pts), m);
  return p;
}

export { partsOf, friendBox };
