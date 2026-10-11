// Painters for the small and medium props: oil drums, crates, a plank, glass,
// a tyre, hay, a cone, the circus bumper, the ring of fire, the bullseye mat,
// the snowman, ice, an air-conditioner, the wrecking ball, a log, a lava rock,
// the spike strip and the trampoline. Each is (ctx, p) => void in metres,
// y down, centred on the prop's box (see props.js). Props are painted fully
// opaque so blood stamped on with source-atop sticks; only glass and ice are
// see-through.
import {
  OUT, YELLOW, RED, BLUE, TAU, rng, mix, lit, shade, rgba, grad, body, tube, rrect, poly, circle, ellipse, outline, plate, line, fillRect, underside,
  gloss, rivet, hazard, grime, runs, scratches, crack, label, grain, sparkle, flame, drop,
} from './props-kit.js';

// ------------------------------------------------------------------- drums
const DRUMS = {
  coolant: { base: '#f2c418', ink: '#2b2218', text: 'COOLANT' },
  waste: { base: '#3fa152', ink: '#f6f3ec', text: 'WASTE OIL' },
  lube: { base: '#d8262c', ink: '#f6f3ec', text: 'LUBE 40' },
  water: { base: '#2f7fe0', ink: '#f6f3ec', text: 'WATER' },
};

export function paintDrum(ctx, p) {
  const d = DRUMS[p.variant] || DRUMS.coolant;
  const r = rng(p.seed);
  const hw = p.w / 2;
  const hh = p.h / 2;
  const bx = hw * 0.97;
  const ry = 0.065 * (p.w / 0.58);
  const top = -hh + ry;
  const bot = hh - ry;
  const span = bot - top;
  const path = new Path2D();
  path.moveTo(-bx, top);
  path.lineTo(bx, top);
  path.lineTo(bx, bot);
  path.ellipse(0, bot, bx, ry, 0, 0, Math.PI);
  path.closePath();
  const lw = 0.04;
  plate(ctx, path, tube(ctx, -bx, 2 * bx, d.base), lw, (c) => {
    // rolled hoops
    for (const f of [0.17, 0.83]) {
      const y = top + span * f;
      c.beginPath();
      c.ellipse(0, y, bx, ry, 0, 0, Math.PI);
      c.lineWidth = 0.055;
      c.strokeStyle = shade(d.base, 0.5);
      c.stroke();
      c.beginPath();
      c.ellipse(0, y - 0.03, bx, ry, 0, 0, Math.PI);
      c.lineWidth = 0.02;
      c.strokeStyle = lit(d.base, 0.55);
      c.stroke();
    }
    // spills under the lid and rust at the foot
    runs(c, r, -bx, top, 2 * bx, 5, 0.3, shade(d.base, 0.55), 0.35);
    grime(c, r, -bx, bot - 0.2, 2 * bx, 0.3, 7, '#7a3a1c', 0.3, 0.07);
    grime(c, r, -bx, top, 2 * bx, span, 10, '#1d1320', 0.1, 0.06);
    if (p.variant === 'lube') {
      hazard(c, -bx, top + span * 0.88, 2 * bx, span * 0.1, 0.07);
      // an old dent
      c.fillStyle = 'rgba(29,19,32,.18)';
      c.beginPath();
      c.ellipse(bx * 0.45, top + span * 0.62, 0.09, 0.05, 0.6, 0, TAU);
      c.fill();
    }
    // label
    const cy = top + span * 0.5;
    if (p.variant === 'lube') {
      plate(c, poly([0, cy - 0.3, 0.15, cy - 0.15, 0, cy, -0.15, cy - 0.15]), YELLOW, 0.025);
      flame(c, 0, cy - 0.152, 0.075, OUT);
      label(c, 'LUBE 40', 0, cy + 0.07, 0.15, d.ink, { maxW: 0.46, stroke: OUT, strokeW: 0.03 });
      label(c, 'FLAMMABLE', 0, cy + 0.2, 0.05, YELLOW, { maxW: 0.4 });
    } else if (p.variant === 'waste') {
      plate(c, poly([0, cy - 0.29, 0.14, cy - 0.04, -0.14, cy - 0.04]), YELLOW, 0.022);
      label(c, '!', 0, cy - 0.1, 0.12, OUT);
      label(c, 'WASTE', 0, cy + 0.07, 0.15, d.ink, { maxW: 0.46, stroke: OUT, strokeW: 0.03 });
      label(c, 'OIL', 0, cy + 0.2, 0.12, d.ink, { maxW: 0.3, stroke: OUT, strokeW: 0.025 });
    } else if (p.variant === 'water') {
      drop(c, 0, cy - 0.12, 0.13, '#f6f3ec');
      label(c, 'WATER', 0, cy + 0.14, 0.14, d.ink, { maxW: 0.46, stroke: OUT, strokeW: 0.03 });
    } else {
      drop(c, -0.17, cy - 0.17, 0.065, '#2a5fe0');
      label(c, 'COOLANT', 0, cy + 0.02, 0.14, d.ink, { maxW: 0.46 });
      c.fillStyle = d.ink;
      c.fillRect(-bx, cy + 0.12, 2 * bx, 0.02);
      label(c, 'DO NOT DRINK', 0, cy + 0.22, 0.05, d.ink, { maxW: 0.4 });
    }
    // roundness
    gloss(c, -bx * 0.62, top + 0.09, 0.05, span - 0.18, 0.5);
    c.fillStyle = 'rgba(29,19,32,.28)';
    c.fillRect(bx * 0.72, top, bx, span + ry);
  });
  // the lid
  const lid = ellipse(0, top, bx, ry);
  plate(ctx, lid, grad(ctx, -bx, 0, bx, 0, [0, lit(d.base, 0.6), 1, shade(d.base, 0.1)]), 0.035, (c) => {
    c.strokeStyle = rgba(shade(d.base, 0.45), 0.8);
    c.lineWidth = 0.02;
    c.beginPath();
    c.ellipse(0, top, bx * 0.82, ry * 0.7, 0, 0, TAU);
    c.stroke();
    c.fillStyle = shade(d.base, 0.55);
    c.beginPath();
    c.ellipse(-bx * 0.38, top, 0.05, ry * 0.5, 0, 0, TAU);
    c.fill();
    c.beginPath();
    c.ellipse(bx * 0.35, top, 0.035, ry * 0.4, 0, 0, TAU);
    c.fill();
  });
}

// ------------------------------------------------------------------ crates
const CRATES = {
  wood: { planks: ['#d79a52', '#c98c46', '#dba660'], frame: '#a8692f', brace: '#b8773a', grain: '#6b3d17' },
  tnt: { planks: ['#e53a30', '#d2302a', '#ea4a3c'], frame: '#8f1d1d', brace: '#a82424', grain: '#5a0e0e' },
  ice: { planks: ['#c6edff', '#a9ddf6', '#d3f1ff'], frame: '#7fc4ee', brace: '#93d1f5', grain: '#3a86b8' },
};

export function paintCrate(ctx, p) {
  const c = CRATES[p.variant] || CRATES.wood;
  const r = rng(p.seed + (p.variant === 'tnt' ? 7 : 0));
  const hw = p.w / 2;
  const hh = p.h / 2;
  const f = Math.min(p.w, p.h) * 0.125;
  const ix = -hw + f;
  const iy = -hh + f;
  const iw = p.w - 2 * f;
  const ih = p.h - 2 * f;
  const ph = ih / 3;
  const outer = rrect(-hw, -hh, p.w, p.h, 0.045);
  plate(ctx, outer, c.frame, 0, (g) => {
    for (let i = 0; i < 3; i++) {
      const y = iy + ph * i;
      g.fillStyle = body(g, ix, y, iw, ph, c.planks[i], 0.22, 0.12);
      g.fillRect(ix, y, iw, ph);
      grain(g, r, ix, y, iw, ph, c.grain, 3, 0.22);
      if (r() > 0.4) {
        g.fillStyle = rgba(c.grain, 0.35);
        g.beginPath();
        g.ellipse(ix + iw * (0.2 + r() * 0.6), y + ph * 0.5, 0.035, 0.02, 0, 0, TAU);
        g.fill();
      }
      line(g, ix, y, ix + iw, y, 0.022, rgba(OUT, 0.8));
    }
    // diagonal brace
    const bw = f * 0.55;
    const a = Math.atan2(ih, iw);
    g.save();
    g.beginPath();
    g.rect(ix, iy, iw, ih);
    g.clip();
    g.translate(0, 0);
    g.rotate(-a);
    const len = Math.hypot(iw, ih) + 0.3;
    g.fillStyle = grad(g, 0, -bw, 0, bw, [0, lit(c.brace, 0.2), 1, shade(c.brace, 0.25)]);
    g.fillRect(-len / 2, -bw, len, 2 * bw);
    g.strokeStyle = rgba(OUT, 0.9);
    g.lineWidth = 0.025;
    g.strokeRect(-len / 2, -bw, len, 2 * bw);
    g.restore();
    // frame: rails and posts
    const rails = [[-hw, -hh, p.w, f], [-hw, hh - f, p.w, f], [-hw, -hh, f, p.h], [hw - f, -hh, f, p.h]];
    for (let i = 0; i < 4; i++) {
      const q = rails[i];
      if (p.variant === 'tnt' && i < 2) {
        hazard(g, q[0], q[1], q[2], q[3], f * 0.8);
      } else {
        g.fillStyle = body(g, q[0], q[1], q[2], q[3], c.frame, 0.25, 0.18);
        g.fillRect(q[0], q[1], q[2], q[3]);
        if (i < 2) grain(g, r, q[0], q[1], q[2], q[3], c.grain, 2, 0.25);
      }
      g.lineWidth = 0.028;
      g.strokeStyle = OUT;
      g.strokeRect(q[0], q[1], q[2], q[3]);
    }
    const nail = p.variant === 'tnt' ? '#e8d8b0' : p.variant === 'ice' ? '#ffffff' : '#59606b';
    for (const sx of [-1, 1]) {
      for (const sy of [-0.82, -0.28, 0.28, 0.82]) {
        g.fillStyle = nail;
        g.beginPath();
        g.arc(sx * (hw - f / 2), sy * (hh - f * 0.6), 0.017, 0, TAU);
        g.fill();
        g.lineWidth = 0.008;
        g.strokeStyle = rgba(OUT, 0.8);
        g.stroke();
      }
    }
    // variant paint
    if (p.variant === 'tnt') {
      label(g, 'TNT', 0, -0.02, 0.4, '#f6efd8', { maxW: iw * 0.92, stroke: OUT, strokeW: 0.065, track: 0.01 });
      label(g, 'HIGH EXPLOSIVE', 0, 0.2, 0.065, '#f6efd8', { maxW: iw * 0.8 });
      grime(g, r, -hw, -hh, p.w, p.h, 8, '#1d1320', 0.18, 0.08);
    } else if (p.variant === 'ice') {
      // frost on top, a bright glint, a crack, and deep blue shade under
      g.fillStyle = 'rgba(255,255,255,.85)';
      g.beginPath();
      g.moveTo(-hw, -hh);
      for (let x = -hw; x <= hw + 0.01; x += 0.09) g.lineTo(x, -hh + 0.05 + r() * 0.11);
      g.lineTo(hw, -hh);
      g.fill();
      crack(g, r, hw * 0.25, -hh + 0.2, 0.3, 0.012, 'rgba(40,110,170,.7)', 1.5);
      gloss(g, -hw + 0.1, -hh + 0.2, 0.05, p.h * 0.5, 0.6);
      sparkle(g, hw * 0.45, -hh * 0.2, 0.09);
      sparkle(g, -hw * 0.5, hh * 0.45, 0.06);
      underside(g, -hw, hh - 0.2, p.w, 0.2, 0.18);
    } else {
      grime(g, r, -hw, -hh, p.w, p.h, 12, '#3a210e', 0.2, 0.09);
      label(g, 'THIS WAY UP', hw * 0.22, 0.26, 0.065, rgba(OUT, 0.6), { maxW: iw * 0.5 });
      underside(g, -hw, hh - 0.14, p.w, 0.14, 0.2);
    }
  });
  outline(ctx, outer, 0.045);
}

// -------------------------------------------------------------- crate plank
export function paintPlank(ctx, p) {
  const r = rng(p.seed);
  const k = CRATES[p.variant] || CRATES.wood;
  const ice = p.variant === 'ice';
  const hw = p.w / 2;
  const hh = p.h / 2;
  // torn ends: a zigzag of splinters at each side, joined by the long straight edges
  const pts = [];
  const steps = 4;
  for (let i = 0; i <= steps; i++) pts.push(-hw + (i % 2 ? 0.03 + r() * 0.08 : 0.005 + r() * 0.02), hh - (i / steps) * p.h);
  for (let i = 0; i <= steps; i++) pts.push(hw - (i % 2 ? 0.03 + r() * 0.08 : 0.005 + r() * 0.02), -hh + (i / steps) * p.h);
  const path = poly(pts);
  plate(ctx, path, body(ctx, -hw, -hh, p.w, p.h, k.planks[0], 0.28, 0.15), 0.022, (c) => {
    grain(c, r, -hw, -hh, p.w, p.h, k.grain, 2, 0.35);
    fillRect(c, -hw, hh - 0.04, p.w, 0.04, OUT, 0.2);
    // pale torn wood (or frosted ice) at both ends
    c.fillStyle = ice ? '#f2fbff' : '#f2d9a0';
    c.fillRect(-hw, -hh, 0.09, p.h);
    c.fillRect(hw - 0.09, -hh, 0.09, p.h);
    c.fillStyle = ice ? '#ffffff' : '#59606b';
    c.beginPath();
    c.arc(hw - 0.19, 0, 0.018, 0, TAU);
    c.fill();
    c.beginPath();
    c.arc(-hw + 0.21, 0.005, 0.018, 0, TAU);
    c.fill();
  });
}

// -------------------------------------------------------------------- glass
export function paintGlass(ctx, p) {
  const r = rng(p.seed);
  const hw = p.w / 2;
  const hh = p.h / 2;
  const win = p.variant === 'window';
  const pane = rrect(-hw, -hh, p.w, p.h, 0.012);
  ctx.fillStyle = win
    ? grad(ctx, 0, -hh, 0, hh, [0, 'rgba(176,236,226,.5)', 0.5, 'rgba(110,196,200,.42)', 1, 'rgba(60,130,160,.55)'])
    : grad(ctx, 0, -hh, 0, hh, [0, 'rgba(200,240,255,.55)', 0.5, 'rgba(130,205,238,.4)', 1, 'rgba(70,150,205,.55)']);
  ctx.fill(pane);
  ctx.save();
  ctx.clip(pane);
  // a bright vertical shine and slanted glints
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.fillRect(-hw + p.w * 0.12, -hh + 0.05, p.w * 0.26, p.h * 0.5);
  ctx.fillRect(-hw + p.w * 0.12, hh - 0.7, p.w * 0.26, 0.45);
  ctx.strokeStyle = 'rgba(255,255,255,.9)';
  ctx.lineWidth = 0.014;
  for (let i = 0; i < 7; i++) {
    const y = -hh + 0.2 + i * (p.h / 7) + r() * 0.1;
    const l = 0.07 + r() * 0.1;
    ctx.beginPath();
    ctx.moveTo(-hw, y + l);
    ctx.lineTo(hw, y - l * 0.3);
    ctx.stroke();
  }
  ctx.restore();
  if (win) {
    outline(ctx, pane, 0.016, 'rgba(255,255,255,.8)');
    outline(ctx, rrect(-hw - 0.008, -hh - 0.008, p.w + 0.016, p.h + 0.016, 0.014), 0.012, 'rgba(29,19,32,.75)');
    return;
  }
  // thin steel frame, a top channel and two feet
  outline(ctx, pane, 0.02, '#2c3440');
  const steel = grad(ctx, -hw, 0, hw, 0, [0, '#dfe5ec', 1, '#6c7886']);
  plate(ctx, rrect(-hw - 0.035, -hh - 0.06, p.w + 0.07, 0.1, 0.02), steel, 0.025);
  plate(ctx, rrect(-0.17, hh - 0.1, 0.34, 0.1, 0.025), steel, 0.03, (c) => {
    rivet(c, -0.11, hh - 0.05, 0.015);
    rivet(c, 0.11, hh - 0.05, 0.015);
  });
  plate(ctx, rrect(-hw - 0.02, hh - 0.28, p.w + 0.04, 0.2, 0.015), steel, 0.025);
}

// ------------------------------------------------------------------- tyre
export function paintTyre(ctx, p) {
  const r = rng(p.seed);
  const hw = p.w / 2;
  const hh = p.h / 2;
  const path = rrect(-hw, -hh, p.w, p.h, hh * 0.85);
  plate(ctx, path, grad(ctx, 0, -hh, 0, hh, [0, '#7a7588', 0.35, '#413c4a', 1, '#1a1620']), 0.035, (c) => {
    // tread blocks
    c.fillStyle = 'rgba(0,0,0,.45)';
    for (let x = -hw + 0.1; x < hw - 0.05; x += 0.085) {
      c.beginPath();
      c.moveTo(x, -hh);
      c.lineTo(x + 0.03, -hh);
      c.lineTo(x + 0.055, hh);
      c.lineTo(x + 0.025, hh);
      c.fill();
    }
    c.fillStyle = 'rgba(255,255,255,.28)';
    c.fillRect(-hw + 0.12, -hh + 0.025, p.w - 0.24, 0.025);
    // worn tan dust and a pale wear line
    grime(c, r, -hw, -hh, p.w, p.h, 4, '#b59a6a', 0.12, 0.06);
    c.fillStyle = 'rgba(240,235,225,.4)';
    c.fillRect(-hw + 0.05, hh * 0.45, p.w - 0.1, 0.018);
    // rounded sidewall bulges at each end
    c.fillStyle = 'rgba(0,0,0,.3)';
    c.fillRect(-hw, -hh, 0.06, p.h);
    c.fillRect(hw - 0.06, -hh, 0.06, p.h);
  });
}

// ------------------------------------------------------------------ haybale
export function paintHay(ctx, p) {
  const r = rng(p.seed);
  const hw = p.w / 2;
  const hh = p.h / 2;
  const dark = '#8a5a12';
  // wisps sticking out of the edge, painted behind the bale
  ctx.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    const side = Math.floor(r() * 4);
    const t = r();
    let x;
    let y;
    let nx = 0;
    let ny = 0;
    if (side === 0) { x = -hw + p.w * t; y = -hh; ny = -1; }
    else if (side === 1) { x = -hw + p.w * t; y = hh; ny = 1; }
    else if (side === 2) { x = -hw; y = -hh + p.h * t; nx = -1; }
    else { x = hw; y = -hh + p.h * t; nx = 1; }
    const l = 0.05 + r() * 0.07;
    const sx = (r() - 0.5) * 0.06;
    const sy = (r() - 0.5) * 0.06;
    const ex = x - nx * 0.04 + nx * l + (nx ? sx * 0.2 : sx);
    const ey = y - ny * 0.04 + ny * l + (ny ? sy * 0.2 : sy);
    line(ctx, x - nx * 0.04, y - ny * 0.04, ex, ey, 0.04, OUT);
    line(ctx, x - nx * 0.04, y - ny * 0.04, ex, ey, 0.02, r() > 0.5 ? '#e8c24a' : '#c9972b');
  }
  const path = rrect(-hw, -hh, p.w, p.h, 0.17);
  plate(ctx, path, body(ctx, -hw, -hh, p.w, p.h, '#e8c24a', 0.32, 0.18), 0.04, (c) => {
    c.lineCap = 'round';
    for (let i = 0; i < 200; i++) {
      const x = -hw + r() * p.w;
      const y = -hh + r() * p.h;
      const l = 0.06 + r() * 0.12;
      const a = (r() - 0.5) * 0.5;
      c.strokeStyle = r() > 0.5 ? rgba(dark, 0.45) : rgba('#fff2a8', 0.65);
      c.lineWidth = 0.012 + r() * 0.012;
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(x + l * 0.5, y + a * l, x + l, y + a * l * 0.4);
      c.stroke();
    }
    // two twine bands
    for (const bx of [-hw * 0.42, hw * 0.4]) {
      c.fillStyle = '#d9531e';
      c.fillRect(bx - 0.03, -hh, 0.06, p.h);
      c.fillStyle = 'rgba(255,255,255,.35)';
      c.fillRect(bx - 0.03, -hh, 0.015, p.h);
      c.fillStyle = 'rgba(29,19,32,.45)';
      c.fillRect(bx + 0.025, -hh, 0.008, p.h);
      line(c, bx - 0.03, -hh + 0.05, bx + 0.03, -hh + 0.05, 0.012, rgba(OUT, 0.7));
    }
    underside(c, -hw, hh - 0.2, p.w, 0.2, 0.18);
    grime(c, r, -hw, -hh, p.w, p.h, 6, '#6b4a10', 0.2, 0.09);
  });
}

// --------------------------------------------------------------------- cone
export function paintCone(ctx, p) {
  const hw = p.w / 2;
  const hh = p.h / 2;
  const baseH = p.h * 0.14;
  const tipW = p.w * 0.1;
  const botW = p.w * 0.38;
  const path = new Path2D();
  path.moveTo(-tipW, -hh + 0.02);
  path.quadraticCurveTo(0, -hh - 0.02, tipW, -hh + 0.02);
  path.lineTo(botW, hh - baseH);
  path.lineTo(-botW, hh - baseH);
  path.closePath();
  const slab = rrect(-hw, hh - baseH, p.w, baseH, 0.025);
  plate(ctx, slab, grad(ctx, 0, hh - baseH, 0, hh, [0, '#ff7a1c', 1, '#b83a05']), 0.026);
  plate(ctx, path, grad(ctx, -botW, 0, botW, 0, [0, '#ff8a34', 0.3, '#ff7016', 1, '#d03d04']), 0.03, (c) => {
    for (const f of [0.38, 0.7]) {
      const y = -hh + p.h * f * 0.86;
      const half = tipW + (botW - tipW) * ((y + hh) / (p.h - baseH));
      const bh = p.h * 0.1;
      const half2 = tipW + (botW - tipW) * ((y + bh + hh) / (p.h - baseH));
      c.fillStyle = '#f6f3ec';
      c.beginPath();
      c.moveTo(-half, y);
      c.lineTo(half, y);
      c.lineTo(half2, y + bh);
      c.lineTo(-half2, y + bh);
      c.fill();
      c.fillStyle = 'rgba(29,19,32,.2)';
      c.fillRect(-half2, y + bh * 0.7, half2 * 2, bh * 0.3);
    }
    gloss(c, -botW * 0.45, -hh + 0.07, 0.035, p.h * 0.55, 0.55);
    c.fillStyle = 'rgba(29,19,32,.22)';
    c.fillRect(botW * 0.45, -hh, botW, p.h);
  });
  plate(ctx, rrect(-hw, hh - baseH, p.w, baseH * 0.25, 0.01), 'rgba(255,255,255,.28)', 0);
}

// ------------------------------------------------------------ circus bumper
export function paintBumper(ctx, p) {
  const R = Math.min(p.w, p.h) / 2;
  const disc = circle(0, 0, R);
  // striped skirt
  plate(ctx, disc, '#f6f3ec', 0.045, (c) => {
    c.fillStyle = RED;
    for (let i = 0; i < 12; i += 2) {
      c.beginPath();
      c.moveTo(0, 0);
      c.arc(0, 0, R, (i / 12) * TAU, ((i + 1) / 12) * TAU);
      c.closePath();
      c.fill();
    }
    c.fillStyle = 'rgba(29,19,32,.2)';
    c.beginPath();
    c.arc(0, 0, R, 0.1, Math.PI - 0.1);
    c.arc(0, -R * 0.15, R * 0.9, Math.PI - 0.1, 0.1, true);
    c.fill();
  });
  // gold ring with bulbs
  const ringR = R * 0.74;
  plate(ctx, circle(0, 0, ringR), grad(ctx, -ringR, -ringR, ringR, ringR, [0, '#ffe27a', 1, '#c9831a']), 0.035);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + 0.3;
    const bx = Math.cos(a) * R * 0.6;
    const by = Math.sin(a) * R * 0.6;
    ctx.fillStyle = '#fff6c0';
    ctx.beginPath();
    ctx.arc(bx, by, R * 0.065, 0, TAU);
    ctx.fill();
    outline(ctx, circle(bx, by, R * 0.065), 0.016);
  }
  // domed cap
  const capR = R * 0.46;
  plate(ctx, circle(0, 0, capR), grad(ctx, -capR, -capR, capR, capR, [0, '#ff6a6a', 0.5, '#e02a2a', 1, '#8f1214']), 0.04, (c) => {
    c.fillStyle = '#ffd24a';
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * TAU;
      const rr = i % 2 ? capR * 0.2 : capR * 0.5;
      c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr + 0.01);
    }
    c.closePath();
    c.fill();
    c.lineWidth = 0.014;
    c.strokeStyle = OUT;
    c.stroke();
  });
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.beginPath();
  ctx.ellipse(-capR * 0.45, -capR * 0.5, capR * 0.3, capR * 0.14, -0.7, 0, TAU);
  ctx.fill();
}

// ------------------------------------------------------------- ring of fire
export function paintHoop(ctx, p) {
  const hw = p.w / 2;
  const hh = p.h / 2;
  const t = Math.min(0.1, hw * 0.5);
  const ringPath = new Path2D();
  ringPath.ellipse(0, 0, hw, hh, 0, 0, TAU);
  ringPath.ellipse(0, 0, hw - t, hh - t, 0, 0, TAU);
  ctx.fillStyle = '#f6f3ec';
  ctx.fill(ringPath, 'evenodd');
  ctx.save();
  ctx.clip(ringPath, 'evenodd');
  ctx.fillStyle = RED;
  const seg = 0.28;
  for (let y = -hh, i = 0; y < hh; y += seg, i++) if (i % 2) ctx.fillRect(-hw, y, p.w, seg);
  ctx.fillStyle = 'rgba(29,19,32,.28)';
  ctx.fillRect(hw * 0.2, -hh, hw, p.h);
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.fillRect(-hw, -hh, hw * 0.35, p.h);
  ctx.restore();
  outline(ctx, ellipse(0, 0, hw, hh), 0.03);
  outline(ctx, ellipse(0, 0, hw - t, hh - t), 0.025);
  // the heat glowing on the inside edge
  ctx.strokeStyle = 'rgba(255,170,40,.85)';
  ctx.lineWidth = 0.02;
  ctx.beginPath();
  ctx.ellipse(0, 0, hw - t - 0.02, hh - t - 0.02, 0, 0, TAU);
  ctx.stroke();
}

// ------------------------------------------------------------- bullseye mat
export function paintTarget(ctx, p) {
  const hw = p.w / 2;
  const hh = p.h / 2;
  const rx = hw;
  const ry = hh * 0.62;
  const cy = -hh * 0.34;
  const thick = p.h * 0.26;
  // the mat's thickness
  const edge = new Path2D();
  edge.moveTo(-rx, cy);
  edge.lineTo(-rx, cy + thick);
  edge.ellipse(0, cy + thick, rx, ry, 0, Math.PI, 0, true);
  edge.lineTo(rx, cy);
  edge.closePath();
  plate(ctx, edge, grad(ctx, 0, cy, 0, cy + thick + ry, [0, '#7a4a22', 1, '#3a2210']), 0.03);
  const top = ellipse(0, cy, rx, ry);
  const rings = ['#f6f3ec', '#e02a2a', '#f6f3ec', '#2a5fe0', '#f6f3ec', '#ffc21a'];
  plate(ctx, top, '#f6f3ec', 0.035, (c) => {
    for (let i = 0; i < rings.length; i++) {
      const k = 1 - i / rings.length;
      c.fillStyle = rings[i];
      c.beginPath();
      c.ellipse(0, cy, rx * k, ry * k, 0, 0, TAU);
      c.fill();
      c.lineWidth = 0.012;
      c.strokeStyle = rgba(OUT, 0.6);
      c.stroke();
    }
    c.fillStyle = 'rgba(255,255,255,.45)';
    c.beginPath();
    c.ellipse(-rx * 0.3, cy - ry * 0.3, rx * 0.4, ry * 0.18, -0.1, 0, TAU);
    c.fill();
  });
}

// ------------------------------------------------------------------ snowman
export function paintSnowman(ctx, p) {
  const sc = p.h / 1.7;
  ctx.save();
  ctx.scale(sc, sc);
  const hh = 0.85;
  const balls = [[0, hh - 0.45, 0.45], [0, -0.21, 0.33], [0, -0.61, 0.24]];
  // stick arms behind the balls
  const arm = (x0, y0, x1, y1, tw) => {
    line(ctx, x0, y0, x1, y1, 0.07, OUT);
    line(ctx, x0, y0, x1, y1, 0.035, '#6b4524');
    line(ctx, (x0 + x1) / 2, (y0 + y1) / 2, (x0 + x1) / 2 + tw, (y0 + y1) / 2 - 0.1, 0.06, OUT);
    line(ctx, (x0 + x1) / 2, (y0 + y1) / 2, (x0 + x1) / 2 + tw, (y0 + y1) / 2 - 0.1, 0.028, '#6b4524');
  };
  arm(-0.25, -0.18, -0.68, -0.5, -0.06);
  arm(0.25, -0.12, 0.72, 0.0, 0.05);
  for (const b of balls) {
    const R = b[2];
    plate(ctx, circle(b[0], b[1], R), grad(ctx, b[0] - R, b[1] - R, b[0] + R * 0.7, b[1] + R, [0, '#ffffff', 0.55, '#eef4fb', 1, '#9db8dc']), 0.04, (c) => {
      c.fillStyle = 'rgba(70,110,180,.25)';
      c.beginPath();
      c.ellipse(b[0] + R * 0.25, b[1] + R * 0.85, R * 0.9, R * 0.38, 0, 0, TAU);
      c.fill();
    });
  }
  // scarf
  const sy = -0.4;
  plate(ctx, rrect(-0.27, sy - 0.07, 0.54, 0.13, 0.06), RED, 0.03, (c) => {
    c.fillStyle = '#f6f3ec';
    for (let x = -0.24; x < 0.27; x += 0.12) c.fillRect(x, sy - 0.08, 0.05, 0.16);
  });
  plate(ctx, poly([0.14, sy + 0.03, 0.3, sy + 0.05, 0.36, sy + 0.34, 0.2, sy + 0.34]), RED, 0.03, (c) => {
    c.fillStyle = '#f6f3ec';
    c.fillRect(0.1, sy + 0.14, 0.3, 0.05);
  });
  // buttons
  for (const y of [-0.21, -0.07, 0.07]) {
    ctx.fillStyle = '#26212b';
    ctx.beginPath();
    ctx.arc(-0.02, y, 0.03, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.beginPath();
    ctx.arc(-0.03, y - 0.01, 0.01, 0, TAU);
    ctx.fill();
  }
  // face, looking left: eyes, a long carrot, a coal grin
  for (const ex of [-0.17, -0.02]) {
    ctx.fillStyle = OUT;
    ctx.beginPath();
    ctx.ellipse(ex, -0.67, 0.028, 0.038, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ex - 0.01, -0.68, 0.01, 0, TAU);
    ctx.fill();
  }
  plate(ctx, poly([-0.06, -0.62, -0.06, -0.54, -0.47, -0.545]), '#ff7a18', 0.026, (c) => {
    line(c, -0.2, -0.6, -0.2, -0.55, 0.012, 'rgba(29,19,32,.5)');
    line(c, -0.32, -0.58, -0.32, -0.55, 0.012, 'rgba(29,19,32,.5)');
  });
  for (let i = 0; i < 5; i++) {
    const a = 0.25 + i * 0.4;
    ctx.fillStyle = '#26212b';
    ctx.beginPath();
    ctx.arc(-0.09 + Math.cos(a) * 0.12 - 0.02, -0.56 + Math.sin(a) * 0.04 + 0.04, 0.014, 0, TAU);
    ctx.fill();
  }
  // top hat
  plate(ctx, rrect(-0.15, -1.02, 0.3, 0.2, 0.03), grad(ctx, -0.15, 0, 0.15, 0, [0, '#4a4452', 1, '#16121a']), 0.03, (c) => {
    c.fillStyle = RED;
    c.fillRect(-0.15, -0.88, 0.3, 0.05);
  });
  plate(ctx, ellipse(0, -0.82, 0.25, 0.05), '#1c1822', 0.03);
  ctx.restore();
}

// ---------------------------------------------------------------- ice block
export function paintIce(ctx, p) {
  const r = rng(p.seed);
  const hw = p.w / 2;
  const hh = p.h / 2;
  const path = rrect(-hw, -hh, p.w, p.h, 0.07);
  ctx.fillStyle = grad(ctx, -hw, -hh, hw, hh, [0, 'rgba(225,248,255,.92)', 0.5, 'rgba(150,215,245,.88)', 1, 'rgba(70,150,215,.92)']);
  ctx.fill(path);
  ctx.save();
  ctx.clip(path);
  // frosted inner core and bevelled faces
  ctx.fillStyle = 'rgba(80,160,220,.28)';
  ctx.fill(rrect(-hw * 0.62, -hh * 0.55, p.w * 0.62, p.h * 0.62, 0.05));
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.fill(poly([-hw, -hh, hw, -hh, hw - 0.14, -hh + 0.14, -hw + 0.14, -hh + 0.14]));
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  ctx.fill(poly([-hw, -hh, -hw + 0.14, -hh + 0.14, -hw + 0.14, hh - 0.14, -hw, hh]));
  ctx.fillStyle = 'rgba(30,90,160,.35)';
  ctx.fill(poly([hw, -hh, hw, hh, hw - 0.14, hh - 0.14, hw - 0.14, -hh + 0.14]));
  ctx.fillStyle = 'rgba(20,70,150,.4)';
  ctx.fill(poly([-hw, hh, hw, hh, hw - 0.14, hh - 0.14, -hw + 0.14, hh - 0.14]));
  // slanted glossy band
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.beginPath();
  ctx.moveTo(-hw * 0.2, -hh);
  ctx.lineTo(hw * 0.15, -hh);
  ctx.lineTo(-hw * 0.65, hh * 0.8);
  ctx.lineTo(-hw * 0.9, hh * 0.8);
  ctx.fill();
  // air bubbles and cracks
  ctx.strokeStyle = 'rgba(255,255,255,.8)';
  ctx.lineWidth = 0.012;
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    ctx.arc(-hw * 0.5 + r() * p.w * 0.8, -hh * 0.4 + r() * p.h * 0.8, 0.012 + r() * 0.025, 0, TAU);
    ctx.stroke();
  }
  crack(ctx, r, hw * 0.3, -hh * 0.3, 0.45, 0.012, 'rgba(255,255,255,.9)', 2.0);
  crack(ctx, r, hw * 0.1, hh * 0.1, 0.3, 0.01, 'rgba(255,255,255,.7)', 0.8);
  sparkle(ctx, hw * 0.5, -hh * 0.55, 0.1);
  sparkle(ctx, -hw * 0.45, hh * 0.45, 0.06);
  ctx.restore();
  outline(ctx, path, 0.04, OUT);
}

// ------------------------------------------------------- air-conditioning unit
export function paintAc(ctx, p) {
  const r = rng(p.seed);
  const hw = p.w / 2;
  const hh = p.h / 2;
  const footH = p.h * 0.1;
  for (const fx of [-hw + 0.14, hw - 0.14]) {
    plate(ctx, rrect(fx - 0.09, hh - footH - 0.02, 0.18, footH + 0.02, 0.02), '#4a4452', 0.028);
  }
  const bh = p.h - footH;
  const path = rrect(-hw, -hh, p.w, bh, 0.06);
  plate(ctx, path, body(ctx, -hw, -hh, p.w, bh, '#c7cfd8', 0.32, 0.22), 0.04, (c) => {
    // louvres on the left
    const lx = -hw + 0.08;
    const lw2 = p.w * 0.36;
    c.fillStyle = 'rgba(29,19,32,.55)';
    c.fillRect(lx, -hh + 0.1, lw2, bh - 0.2);
    for (let y = -hh + 0.13; y < -hh + bh - 0.14; y += 0.075) {
      c.fillStyle = '#d9dfe6';
      c.fillRect(lx, y, lw2, 0.04);
      c.fillStyle = 'rgba(29,19,32,.4)';
      c.fillRect(lx, y + 0.04, lw2, 0.012);
    }
    // fan grille
    const fcx = hw * 0.34;
    const fcy = -hh + bh / 2;
    const fr = Math.min(p.w * 0.27, bh * 0.4);
    c.fillStyle = '#26212b';
    c.beginPath();
    c.arc(fcx, fcy, fr, 0, TAU);
    c.fill();
    c.strokeStyle = '#aab3be';
    c.lineWidth = 0.014;
    for (const k of [1, 0.74, 0.48]) {
      c.beginPath();
      c.arc(fcx, fcy, fr * k, 0, TAU);
      c.stroke();
    }
    for (let i = 0; i < 8; i++) {
      c.beginPath();
      c.moveTo(fcx, fcy);
      c.lineTo(fcx + Math.cos((i / 8) * TAU) * fr, fcy + Math.sin((i / 8) * TAU) * fr);
      c.stroke();
    }
    c.fillStyle = '#cfd5dd';
    c.beginPath();
    c.arc(fcx, fcy, fr * 0.16, 0, TAU);
    c.fill();
    outline(c, circle(fcx, fcy, fr + 0.02), 0.03);
    // warning sticker, rust, grime
    hazard(c, hw - 0.3, -hh + 0.05, 0.22, 0.06, 0.04);
    rivet(c, -hw + 0.05, -hh + 0.05, 0.016);
    rivet(c, hw - 0.05, hh - footH - 0.05, 0.016);
    grime(c, r, -hw, -hh, p.w, bh, 10, '#6b3a1c', 0.16, 0.08);
    runs(c, r, -hw, -hh + bh - 0.2, p.w, 5, 0.2, '#6b3a1c', 0.3);
    gloss(c, -hw + 0.03, -hh + 0.02, p.w - 0.06, 0.035, 0.5);
  });
  // copper pipe
  line(ctx, -hw - 0.03, 0.15, -hw - 0.17, 0.15, 0.06, OUT);
  line(ctx, -hw - 0.03, 0.15, -hw - 0.17, 0.15, 0.03, '#d8803a');
}

// ------------------------------------------------------------- wrecking ball
export function paintWreckingBall(ctx, p) {
  const r = rng(p.seed);
  const R = Math.min(p.w, p.h) / 2;
  // shackle on the top
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-R * 0.14, -R * 0.9);
  ctx.bezierCurveTo(-R * 0.2, -R * 1.2, R * 0.2, -R * 1.2, R * 0.14, -R * 0.9);
  ctx.lineWidth = R * 0.2;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  ctx.lineWidth = R * 0.1;
  ctx.strokeStyle = '#8a93a2';
  ctx.stroke();
  const ball = circle(0, 0, R);
  plate(ctx, ball, grad(ctx, -R, -R, R, R, [0, '#b4c0d6', 0.35, '#566380', 1, '#161a2a']), 0.06, (c) => {
    // band with warning paint and the weight
    c.save();
    c.beginPath();
    c.rect(-R, -R * 0.2, 2 * R, R * 0.42);
    c.clip();
    hazard(c, -R, -R * 0.2, 2 * R, R * 0.42, R * 0.15);
    c.fillStyle = 'rgba(29,19,32,.35)';
    c.fillRect(-R, R * 0.07, 2 * R, R * 0.2);
    c.restore();
    c.fillStyle = 'rgba(29,19,32,.5)';
    c.fillRect(-R * 0.62, -R * 0.07, R * 1.24, R * 0.26);
    label(c, '5 TON', 0, R * 0.065, R * 0.25, YELLOW, { maxW: R * 1.1 });
    // dents and scrapes
    for (let i = 0; i < 6; i++) {
      const a = r() * TAU;
      const d = R * (0.35 + r() * 0.5);
      c.fillStyle = 'rgba(10,8,16,.35)';
      c.beginPath();
      c.ellipse(Math.cos(a) * d, Math.sin(a) * d, R * 0.1, R * 0.06, a, 0, TAU);
      c.fill();
    }
    scratches(c, r, -R, -R, 2 * R, 2 * R, 10, '#ffffff', 0.3, 0.2);
    c.fillStyle = 'rgba(120,60,20,.3)';
    c.beginPath();
    c.ellipse(R * 0.5, R * 0.5, R * 0.3, R * 0.2, 0.6, 0, TAU);
    c.fill();
    // rim light underneath and the big shine
    const g = c.createRadialGradient(R * 0.35, R * 0.55, R * 0.3, R * 0.25, R * 0.4, R * 1.1);
    g.addColorStop(0, 'rgba(255,150,70,0)');
    g.addColorStop(1, 'rgba(255,150,70,.16)');
    c.fillStyle = g;
    c.fillRect(-R, -R, 2 * R, 2 * R);
    c.fillStyle = 'rgba(255,255,255,.75)';
    c.beginPath();
    c.ellipse(-R * 0.38, -R * 0.5, R * 0.24, R * 0.12, -0.75, 0, TAU);
    c.fill();
    c.beginPath();
    c.arc(-R * 0.1, -R * 0.74, R * 0.04, 0, TAU);
    c.fill();
  });
  plate(ctx, rrect(-R * 0.26, -R * 0.99, R * 0.52, R * 0.17, R * 0.04), '#8a93a2', 0.04);
}

// --------------------------------------------------------------------- log
export function paintLog(ctx, p) {
  const r = rng(p.seed);
  const hw = p.w / 2;
  const hh = p.h / 2;
  const endRx = hh * 0.55;
  const bark = rrect(-hw, -hh, p.w, p.h, hh * 0.9);
  plate(ctx, bark, grad(ctx, 0, -hh, 0, hh, [0, '#a8703a', 0.4, '#7e4d24', 1, '#4a2b14']), 0.04, (c) => {
    // bark ridges
    c.lineCap = 'round';
    for (let i = 0; i < 46; i++) {
      const x = -hw + r() * p.w;
      const y = -hh + r() * p.h;
      const l = 0.12 + r() * 0.3;
      c.strokeStyle = r() > 0.3 ? 'rgba(40,20,8,.55)' : 'rgba(200,140,80,.45)';
      c.lineWidth = 0.012 + r() * 0.014;
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(x + l / 2, y + (r() - 0.5) * 0.05, x + l, y + (r() - 0.5) * 0.03);
      c.stroke();
    }
    // mossy patches and knots
    grime(c, r, -hw, -hh, p.w, p.h, 6, '#5e8a2e', 0.4, 0.14);
    for (const kx of [-hw * 0.35, hw * 0.12]) {
      c.fillStyle = '#3a2008';
      c.beginPath();
      c.ellipse(kx, (r() - 0.5) * 0.12, 0.05, 0.036, 0.3, 0, TAU);
      c.fill();
      c.lineWidth = 0.014;
      c.strokeStyle = 'rgba(29,19,32,.8)';
      c.stroke();
    }
    gloss(c, -hw + 0.4, -hh + 0.04, p.w - 0.9, 0.035, 0.28);
    // rope bindings with an iron eye each
    for (const bx of [-hw * 0.7, hw * 0.7]) {
      c.fillStyle = '#d6b574';
      c.fillRect(bx - 0.08, -hh, 0.16, p.h);
      c.strokeStyle = 'rgba(90,60,20,.9)';
      c.lineWidth = 0.014;
      for (let y = -hh - 0.05; y < hh + 0.05; y += 0.07) {
        c.beginPath();
        c.moveTo(bx - 0.08, y + 0.05);
        c.lineTo(bx + 0.08, y);
        c.stroke();
      }
      c.fillStyle = 'rgba(29,19,32,.5)';
      c.fillRect(bx - 0.08, -hh, 0.012, p.h);
      c.fillRect(bx + 0.07, -hh, 0.012, p.h);
    }
    underside(c, -hw, hh - 0.14, p.w, 0.14, 0.25);
  });
  for (const bx of [-hw * 0.7, hw * 0.7]) {
    const eye = ellipse(bx, -hh - 0.005, 0.045, 0.05);
    outline(ctx, eye, 0.07);
    outline(ctx, eye, 0.03, '#9aa3ae');
  }
  // the cut end on the right, with growth rings
  const end = ellipse(hw - endRx * 0.7, 0, endRx, hh - 0.015);
  plate(ctx, end, '#e8c488', 0.035, (c) => {
    for (let k = 0.85; k > 0.1; k -= 0.17) {
      c.strokeStyle = 'rgba(120,70,30,.7)';
      c.lineWidth = 0.014;
      c.beginPath();
      c.ellipse(hw - endRx * 0.7, 0, endRx * k, (hh - 0.015) * k, 0, 0, TAU);
      c.stroke();
    }
    crack(c, r, hw - endRx * 0.7, 0, 0.14, 0.01, 'rgba(60,30,10,.8)', -0.4);
  });
}

// ---------------------------------------------------------------- lava rock
export function paintLavaRock(ctx, p) {
  const r = rng(p.seed);
  const sx = p.w / 2.4;
  const sy = p.h / 1.4;
  const P = [-1.2, 0.7, -1.17, 0.25, -1.0, 0.0, -0.98, -0.3, -0.72, -0.5, -0.62, -0.82, -0.3, -0.62, -0.1, -0.7, 0.15, -0.4, 0.3, -0.42, 0.45, -0.7, 0.75, -0.5, 0.85, -0.2, 1.1, -0.05, 1.12, 0.3, 1.2, 0.7];
  for (let i = 0; i < P.length; i += 2) {
    P[i] *= sx;
    P[i + 1] *= sy;
  }
  const n = P.length / 2;
  const cx = 0;
  const cy = 0.12 * sy;
  const path = poly(P);
  plate(ctx, path, '#2b2631', 0.05, (c) => {
    // faceted sides: each edge to a shrunken copy of the outline, lit from the upper left
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = P[2 * i];
      const ay = P[2 * i + 1];
      const bx = P[2 * j];
      const by = P[2 * j + 1];
      const k = 0.5;
      const a2x = cx + (ax - cx) * k;
      const a2y = cy + (ay - cy) * k;
      const b2x = cx + (bx - cx) * k;
      const b2y = cy + (by - cy) * k;
      const ex = bx - ax;
      const ey = by - ay;
      const L = Math.hypot(ex, ey) || 1;
      const nx = ey / L;
      const ny = -ex / L;
      const lt = Math.max(0, Math.min(1, 0.5 + (nx * -0.6 + ny * -0.8) * 0.55));
      c.fillStyle = mix('#201b27', '#8a8296', lt);
      c.beginPath();
      c.moveTo(ax, ay);
      c.lineTo(bx, by);
      c.lineTo(b2x, b2y);
      c.lineTo(a2x, a2y);
      c.closePath();
      c.fill();
      c.lineWidth = 0.014;
      c.strokeStyle = 'rgba(10,6,14,.8)';
      c.stroke();
    }
    // the top of the rock: a fan of facets from a high point out to the inner ring
    const hx = -0.08 * sx;
    const hy = -0.3 * sy;
    for (let i = 0; i < n - 1; i++) {
      const j = i + 1;
      const ax = cx + (P[2 * i] - cx) * 0.5;
      const ay = cy + (P[2 * i + 1] - cy) * 0.5;
      const bx = cx + (P[2 * j] - cx) * 0.5;
      const by = cy + (P[2 * j + 1] - cy) * 0.5;
      const mx = (ax + bx) / 2 - hx;
      const my = (ay + by) / 2 - hy;
      const L = Math.hypot(mx, my) || 1;
      const lt = Math.max(0, Math.min(1, 0.45 + ((mx / L) * -0.6 + (my / L) * -0.8) * 0.4 + (r() - 0.5) * 0.12));
      c.fillStyle = mix('#241f2c', '#7a7288', lt);
      c.beginPath();
      c.moveTo(ax, ay);
      c.lineTo(bx, by);
      c.lineTo(hx, hy);
      c.closePath();
      c.fill();
      c.lineWidth = 0.012;
      c.strokeStyle = 'rgba(10,6,14,.7)';
      c.stroke();
    }
    // glow from below
    const g = c.createLinearGradient(0, 0.7 * sy, 0, -0.1 * sy);
    g.addColorStop(0, 'rgba(255,110,10,.65)');
    g.addColorStop(1, 'rgba(255,110,10,0)');
    c.fillStyle = g;
    c.fillRect(-p.w, -p.h, 2 * p.w, 2 * p.h);
    // glowing cracks: a wide faint halo, orange body, yellow core
    const cracks = [];
    for (let k = 0; k < 6; k++) {
      const x0 = (-0.9 + k * 0.36 + (r() - 0.5) * 0.1) * sx;
      const pts = [x0, 0.7 * sy];
      let x = x0;
      let y = 0.7 * sy;
      const up = (0.45 + r() * 0.8) * sy;
      const steps = 5;
      for (let s = 0; s < steps; s++) {
        x += (r() - 0.5) * 0.3 * sx;
        y -= (up / steps) * (0.7 + r() * 0.6);
        pts.push(x, y);
      }
      cracks.push(pts);
    }
    for (const [lwd, col] of [[0.1, 'rgba(255,120,0,.22)'], [0.05, '#ff5a00'], [0.022, '#ffd23a']]) {
      c.lineWidth = lwd;
      c.strokeStyle = col;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      for (const pts of cracks) {
        c.beginPath();
        c.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
        c.stroke();
      }
    }
  });
}

// ------------------------------------------------------------------- spikes
export function paintSpikes(ctx, p) {
  const r = rng(p.seed);
  const hw = p.w / 2;
  const hh = p.h / 2;
  const baseH = p.h * 0.28;
  const n = Math.max(6, Math.round(p.w / 0.15));
  const pitch = p.w / n;
  const steel = (x, w) => grad(ctx, x, 0, x + w, 0, [0, '#eef3fa', 0.5, '#aab4c3', 1, '#566073']);
  // back row, darker
  for (let i = 0; i < n; i++) {
    const x = -hw + pitch * (i + 0.5) + pitch * 0.25;
    const th = (p.h - baseH * 0.8) * (0.82 + r() * 0.12);
    plate(ctx, poly([x - pitch * 0.4, hh - baseH, x + pitch * 0.4, hh - baseH, x + (r() - 0.5) * 0.01, hh - baseH * 0.6 - th]), '#6c7686', 0.022);
  }
  for (let i = 0; i < n; i++) {
    const x = -hw + pitch * (i + 0.5);
    const th = (p.h - baseH) * (0.9 + r() * 0.1);
    const tx = x + (r() - 0.5) * 0.015;
    const ty = hh - baseH - th;
    const sp = poly([x - pitch * 0.46, hh - baseH, x + pitch * 0.46, hh - baseH, tx, ty]);
    plate(ctx, sp, steel(x - pitch * 0.46, pitch * 0.92), 0.026, (c) => {
      c.fillStyle = 'rgba(29,19,32,.28)';
      c.fillRect(x + 0.005, ty, pitch, th);
      c.fillStyle = 'rgba(255,255,255,.85)';
      c.beginPath();
      c.moveTo(tx - 0.002, ty + th * 0.12);
      c.lineTo(x - pitch * 0.3, hh - baseH - 0.01);
      c.lineTo(x - pitch * 0.14, hh - baseH - 0.01);
      c.fill();
    });
  }
  // base with warning stripes and bolts
  plate(ctx, rrect(-hw, hh - baseH, p.w, baseH, 0.03), '#3a3544', 0.04, (c) => {
    hazard(c, -hw, hh - baseH * 0.78, p.w, baseH * 0.58, 0.1);
    c.fillStyle = 'rgba(255,255,255,.2)';
    c.fillRect(-hw, hh - baseH, p.w, 0.02);
    for (let x = -hw + 0.2; x < hw; x += 0.6) rivet(c, x, hh - baseH * 0.89, 0.014);
    underside(c, -hw, hh - 0.05, p.w, 0.05, 0.35);
  });
}

// --------------------------------------------------------------- trampoline
export function paintTrampoline(ctx, p) {
  const r = rng(p.seed);
  const hw = p.w / 2;
  const hh = p.h / 2;
  const matH = 0.1;
  const rail = -hh + p.h * 0.5;
  const steel = (y0, y1) => grad(ctx, 0, y0, 0, y1, [0, '#f2f5fa', 0.4, '#b4bdcb', 1, '#5f6a7c']);
  // dark recess with the springs
  plate(ctx, rrect(-hw + 0.04, -hh + matH, p.w - 0.08, rail - (-hh + matH) + 0.06, 0.02), '#241b30', 0.03, (c) => {
    const y0 = -hh + matH;
    const y1 = rail;
    c.lineCap = 'round';
    for (let x = -hw + 0.22; x < hw - 0.1; x += 0.26) {
      c.beginPath();
      c.moveTo(x, y0);
      const zig = 2;
      for (let k = 0; k < zig; k++) {
        c.lineTo(x + 0.085, y0 + ((k + 0.5) / zig) * (y1 - y0));
        c.lineTo(x - 0.085, y0 + ((k + 1) / zig) * (y1 - y0));
      }
      c.lineWidth = 0.05;
      c.strokeStyle = OUT;
      c.stroke();
      c.lineWidth = 0.028;
      c.strokeStyle = '#d9dfe8';
      c.stroke();
    }
  });
  // skirt between the legs
  const skirtTop = rail - 0.02;
  plate(ctx, rrect(-hw + 0.08, skirtTop, p.w - 0.16, hh - skirtTop - 0.02, 0.025), body(ctx, 0, skirtTop, 0, hh - skirtTop, BLUE, 0.35, 0.15), 0.04, (c) => {
    c.fillStyle = '#ffc21a';
    c.fillRect(-hw, skirtTop + 0.015, p.w, 0.03);
    label(c, 'BOING!', 0, skirtTop + (hh - skirtTop) * 0.55, 0.16, '#f6f3ec', { italic: true, stroke: OUT, strokeW: 0.03 });
    grime(c, r, -hw, skirtTop, p.w, hh - skirtTop, 5, '#0b1030', 0.25, 0.1);
  });
  // steel rail and legs
  plate(ctx, rrect(-hw, rail - 0.03, p.w, 0.09, 0.04), steel(rail - 0.03, rail + 0.06), 0.035);
  for (const lx of [-hw + 0.16, hw - 0.16]) {
    plate(ctx, rrect(lx - 0.07, rail - 0.04, 0.14, hh - rail + 0.04, 0.03), steel(0, 1), 0.035);
    plate(ctx, rrect(lx - 0.15, hh - 0.06, 0.3, 0.06, 0.02), '#3a3544', 0.03);
  }
  // the mat, with red safety pads on both ends
  plate(ctx, rrect(-hw, -hh, p.w, matH, 0.04), grad(ctx, 0, -hh, 0, -hh + matH, [0, '#7a86e8', 0.4, '#2a3070', 1, '#15183a']), 0.04, (c) => {
    c.fillStyle = 'rgba(255,255,255,.55)';
    c.fillRect(-hw + 0.5, -hh + 0.012, p.w - 1.0, 0.018);
  });
  for (const s of [-1, 1]) {
    const px = s < 0 ? -hw : hw - 0.46;
    plate(ctx, rrect(px, -hh - 0.04, 0.46, matH + 0.06, 0.05), grad(ctx, 0, -hh - 0.04, 0, -hh + matH, [0, '#ff6a6a', 0.5, RED, 1, '#9a1518']), 0.035, (c) => {
      c.fillStyle = '#f6f3ec';
      for (let x = px + 0.04; x < px + 0.46; x += 0.15) c.fillRect(x, -hh - 0.05, 0.06, 0.2);
    });
  }
}
