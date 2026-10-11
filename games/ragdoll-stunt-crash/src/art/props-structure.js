// Painters for the big fixed props: crash barriers (concrete, brick, jersey),
// poles (lamp, road sign, pine, tiki torch), the stunt-insurance billboard,
// scaffold planks and girders, the I-beam, kicker ramps, platforms, shipping
// containers and the rooftop water tower. Each is (ctx, p) => void in metres,
// y down, centred on the prop's w x h box, and sized from p.w and p.h so a
// track that overrides the default size still gets a clean drawing.
import {
  OUT, YELLOW, RED, BLUE, WHITE, TAU, rng, lit, shade, rgba, grad, body, rrect, poly, circle, ellipse, outline, plate, line, fillRect, bevel,
  underside, gloss, rivet, hazard, grime, runs, scratches, crack, label, grain, flame,
} from './props-kit.js';

// ------------------------------------------------------------------ barriers
function concreteWall(ctx, p) {
  const r = rng(p.seed);
  const hw = p.w / 2;
  const hh = p.h / 2;
  const bandH = Math.min(0.26, p.h * 0.16);
  const plinth = Math.min(0.2, p.h * 0.12);
  const path = rrect(-hw, -hh, p.w, p.h, 0.06);
  plate(ctx, path, body(ctx, -hw, -hh, p.w, p.h, '#cfc9bc', 0.3, 0.14), 0.05, (c) => {
    hazard(c, -hw, -hh, p.w, bandH, bandH * 0.9);
    line(c, -hw, -hh + bandH, hw, -hh + bandH, 0.03, OUT);
    c.fillStyle = 'rgba(29,19,32,.2)';
    c.fillRect(-hw, hh - plinth, p.w, plinth);
    line(c, -hw, hh - plinth, hw, hh - plinth, 0.02, rgba(OUT, 0.6));
    // lifting sockets and a stencil
    const y0 = -hh + bandH;
    const y1 = hh - plinth;
    const my = (y0 + y1) / 2;
    const ink = 'rgba(29,19,32,.8)';
    if (p.w >= p.h * 0.45) {
      label(c, 'THE', 0, my - 0.24, 0.17, ink, { maxW: p.w * 0.5, track: 0.04 });
      label(c, 'WALL', 0, my + 0.03, 0.38, ink, { maxW: p.w * 0.86 });
      line(c, -hw * 0.62, my + 0.3, hw * 0.62, my + 0.3, 0.025, ink);
    } else {
      label(c, 'THE WALL', 0, my, Math.min(0.36, p.w * 0.55), ink, { maxW: (y1 - y0) * 0.85, rot: -Math.PI / 2 });
    }
    for (const sx of [-1, 1]) for (const sy of [y0 + 0.1, y1 - 0.1]) rivet(c, sx * (hw - 0.1), sy, 0.02, '#8a857a');
    // years of impacts: rubber scuffs, chips, cracks, grime
    c.fillStyle = 'rgba(15,10,18,.5)';
    for (let i = 0; i < 4; i++) {
      const y = my + 0.1 + r() * (y1 - my - 0.1);
      c.beginPath();
      c.moveTo(-hw, y);
      c.quadraticCurveTo(-hw * 0.4, y - 0.04, -hw * (0.1 + r() * 0.4), y + 0.02);
      c.quadraticCurveTo(-hw * 0.4, y + 0.06, -hw, y + 0.05);
      c.fill();
    }
    crack(c, r, hw * 0.3, y0 + 0.02, 0.5, 0.013, 'rgba(29,19,32,.55)');
    crack(c, r, -hw * 0.5, my + 0.35, 0.3, 0.011, 'rgba(29,19,32,.5)', 1.2);
    c.fillStyle = '#f0ebdf';
    c.beginPath();
    c.moveTo(hw, y1 - 0.4);
    c.lineTo(hw - 0.12, y1 - 0.34);
    c.lineTo(hw - 0.05, y1 - 0.2);
    c.lineTo(hw, y1 - 0.18);
    c.fill();
    grime(c, r, -hw, -hh, p.w, p.h, 14, '#4a3a2a', 0.12, 0.12);
    runs(c, r, -hw, y0, p.w, 6, 0.5, '#3a2c20', 0.16);
    bevel(c, -hw, -hh, p.w, p.h, 0.05, 0.22);
  });
}

function brickWall(ctx, p) {
  const r = rng(p.seed);
  const hw = p.w / 2;
  const hh = p.h / 2;
  const rows = Math.max(6, Math.round(p.h / 0.115));
  const bh = p.h / rows;
  const bw = bh * 2.3;
  const path = rrect(-hw, -hh, p.w, p.h, 0.05);
  const cols = ['#c8553d', '#b8472f', '#d4684a', '#a83f2b', '#c05a3f', '#cf6a45'];
  plate(ctx, path, '#d6cdb8', 0.05, (c) => {
    for (let i = 0; i < rows; i++) {
      const y = -hh + i * bh;
      const off = i % 2 ? bw / 2 : 0;
      for (let x = -hw - off; x < hw; x += bw) {
        const col = cols[Math.floor(r() * cols.length)];
        c.fillStyle = grad(c, 0, y, 0, y + bh, [0, lit(col, 0.18), 0.5, col, 1, shade(col, 0.28)]);
        c.fillRect(x + 0.012, y + 0.012, bw - 0.024, bh - 0.024);
        c.fillStyle = 'rgba(255,255,255,.18)';
        c.fillRect(x + 0.012, y + 0.012, bw - 0.024, 0.014);
        if (r() > 0.85) {
          c.fillStyle = 'rgba(29,19,32,.28)';
          c.fillRect(x + 0.012, y + 0.012, bw - 0.024, bh - 0.024);
        }
      }
    }
    // soot, damp and a sprayed tag
    runs(c, r, -hw, -hh, p.w, 8, 0.9, '#1d1320', 0.18);
    grime(c, r, -hw, -hh, p.w, p.h, 12, '#2a1c14', 0.14, 0.12);
    label(c, 'BOB WOZ ERE', -0.02, 0.18, 0.1, 'rgba(240,235,225,.85)', { maxW: p.w * 0.75, rot: -0.07 });
    // coping stones
    c.fillStyle = body(c, -hw, -hh, p.w, 0.13, '#cfc9bc', 0.25, 0.2);
    c.fillRect(-hw, -hh, p.w, 0.13);
    line(c, -hw, -hh + 0.13, hw, -hh + 0.13, 0.03, OUT);
    for (let x = -hw + 0.4; x < hw; x += 0.42 + r() * 0.2) line(c, x, -hh, x, -hh + 0.13, 0.02, rgba(OUT, 0.8));
    underside(c, -hw, hh - 0.22, p.w, 0.22, 0.22);
    bevel(c, -hw, -hh, p.w, p.h, 0.05, 0.2);
  });
}

function jerseyWall(ctx, p) {
  const r = rng(p.seed);
  const hw = p.w / 2;
  const hh = p.h / 2;
  const fh = Math.min(0.2, p.h * 0.15);
  const midY = hh - fh - Math.min(0.5, p.h * 0.45);
  const midX = hw * 0.6;
  const topX = hw * 0.5;
  const pts = [-hw, hh, hw, hh, hw, hh - fh, midX, midY, topX, -hh + 0.14, topX - 0.1, -hh + 0.03, -topX + 0.1, -hh + 0.03, -topX, -hh + 0.14, -midX, midY, -hw, hh - fh];
  const path = poly(pts);
  plate(ctx, path, body(ctx, -hw, -hh, p.w, p.h, '#d9d4c9', 0.28, 0.15), 0.05, (c) => {
    // lit lower-left slope, shaded lower-right slope
    c.fillStyle = 'rgba(255,255,255,.25)';
    c.fill(poly([-hw, hh - fh, -midX, midY, -topX, -hh + 0.14, -topX + 0.14, -hh + 0.14, -midX + 0.16, midY, -hw + 0.1, hh - fh]));
    c.fillStyle = 'rgba(29,19,32,.2)';
    c.fill(poly([hw, hh - fh, midX, midY, topX, -hh + 0.14, topX - 0.14, -hh + 0.14, midX - 0.16, midY, hw - 0.1, hh - fh]));
    // painted band and a reflector
    hazard(c, -hw, hh - fh - 0.02, p.w, 0.1, 0.09);
    c.fillStyle = '#ff7a1a';
    c.fillRect(-topX + 0.12, -hh + 0.2, 2 * topX - 0.24, 0.1);
    c.fillStyle = '#fff1a8';
    c.fillRect(-topX + 0.12, -hh + 0.22, 2 * topX - 0.24, 0.025);
    line(c, -midX, midY, midX, midY, 0.025, rgba(OUT, 0.6));
    const ty = (-hh + 0.3 + midY) / 2;
    label(c, 'KEEP', 0, ty - 0.08, 0.15, 'rgba(29,19,32,.65)', { maxW: topX * 1.7 });
    label(c, 'OFF', 0, ty + 0.08, 0.15, 'rgba(29,19,32,.65)', { maxW: topX * 1.7 });
    grime(c, r, -hw, -hh, p.w, p.h, 12, '#3a2c20', 0.15, 0.1);
    runs(c, r, -hw, midY, p.w, 5, 0.4, '#3a2c20', 0.15);
    crack(c, r, hw * 0.1, midY + 0.1, 0.3, 0.012, 'rgba(29,19,32,.5)', 1.7);
    c.fillStyle = 'rgba(15,10,18,.45)';
    c.beginPath();
    c.moveTo(-hw, hh - 0.16);
    c.quadraticCurveTo(-hw * 0.5, hh - 0.2, -hw * 0.2, hh - 0.14);
    c.lineTo(-hw * 0.2, hh - 0.08);
    c.lineTo(-hw, hh - 0.08);
    c.fill();
    underside(c, -hw, hh - 0.1, p.w, 0.1, 0.2);
  });
}

export function paintWall(ctx, p) {
  if (p.variant === 'brick') brickWall(ctx, p);
  else if (p.variant === 'jersey') jerseyWall(ctx, p);
  else concreteWall(ctx, p);
}

// --------------------------------------------------------------------- poles
const STEEL = (hw) => (ctx) => grad(ctx, -hw, 0, hw, 0, [0, '#e4e9ef', 0.3, '#b8c1ce', 1, '#58637a']);

// a slightly tapered post from y0 (top) to y1 (bottom); returns nothing, draws the outline too
function shaft(ctx, hw0, hw1, y0, y1, fill, inside) {
  const path = poly([-hw0, y0, hw0, y0, hw1, y1, -hw1, y1]);
  plate(ctx, path, fill, 0.035, inside);
}

function lampPole(ctx, p) {
  const r = rng(p.seed);
  const hh = p.h / 2;
  const hw = p.w / 2;
  const yt = -hh + 0.22;
  // base cover and plate
  shaft(ctx, hw, hw * 1.1, yt, hh - 0.3, STEEL(hw)(ctx), (c) => {
    hazard(c, -hw * 2, hh - 1.45, hw * 4, 1.05, 0.11);
    c.fillStyle = 'rgba(29,19,32,.3)';
    c.fillRect(hw * 0.25, yt, hw, p.h);
    c.fillStyle = 'rgba(255,255,255,.7)';
    c.fillRect(-hw * 0.6, yt, 0.025, p.h - 0.6);
    grime(c, r, -hw, yt, hw * 2, p.h, 8, '#3a2c20', 0.2, 0.05);
  });
  for (const y of [-hh + 0.8, hh - 1.5, hh - 0.35]) plate(ctx, rrect(-hw * 1.5, y - 0.04, hw * 3, 0.09, 0.03), STEEL(hw * 1.5)(ctx), 0.025);
  plate(ctx, poly([-0.2, hh, 0.2, hh, 0.12, hh - 0.32, -0.12, hh - 0.32]), grad(ctx, -0.2, 0, 0.2, 0, [0, '#9aa5b6', 1, '#4a5366']), 0.04, (c) => {
    rivet(c, -0.14, hh - 0.08, 0.018);
    rivet(c, 0.14, hh - 0.08, 0.018);
  });
  // curved arm and the lamp head
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, yt + 0.02);
  ctx.bezierCurveTo(0, -hh - 0.14, 0.14, -hh - 0.24, 0.34, -hh - 0.2);
  ctx.lineWidth = 0.1;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  ctx.lineWidth = 0.05;
  ctx.strokeStyle = '#b8c1ce';
  ctx.stroke();
  const g = ctx.createRadialGradient(0.34, -hh - 0.02, 0, 0.34, -hh - 0.02, 0.34);
  g.addColorStop(0, 'rgba(255,240,170,.75)');
  g.addColorStop(1, 'rgba(255,200,90,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, -hh - 0.38, 0.7, 0.7);
  plate(ctx, poly([0.2, -hh - 0.3, 0.41, -hh - 0.3, 0.46, -hh - 0.12, 0.43, -hh - 0.02, 0.2, -hh - 0.02, 0.18, -hh - 0.14]), grad(ctx, 0, -hh - 0.3, 0, -hh, [0, '#a5b0a8', 1, '#4a5a58']), 0.035, (c) => {
    c.fillStyle = 'rgba(255,255,255,.55)';
    c.fillRect(0.22, -hh - 0.28, 0.17, 0.025);
  });
  plate(ctx, rrect(0.22, -hh - 0.03, 0.2, 0.06, 0.03), '#fff3b0', 0.025);
}

function signPole(ctx, p) {
  const r = rng(p.seed);
  const hh = p.h / 2;
  const hw = p.w / 2;
  const sy = -hh + 0.5;
  shaft(ctx, hw * 0.8, hw * 0.9, sy, hh - 0.2, STEEL(hw)(ctx), (c) => {
    c.fillStyle = 'rgba(29,19,32,.3)';
    c.fillRect(hw * 0.25, sy, hw, p.h);
    c.fillStyle = 'rgba(255,255,255,.7)';
    c.fillRect(-hw * 0.55, sy, 0.025, p.h - 0.6);
    for (let y = sy + 0.9; y < hh - 0.5; y += 1.1) rivet(c, 0, y, 0.016);
    hazard(c, -hw * 2, hh - 0.95, hw * 4, 0.7, 0.1);
    grime(c, r, -hw, sy, hw * 2, p.h, 6, '#3a2c20', 0.2, 0.05);
  });
  plate(ctx, poly([-0.18, hh, 0.18, hh, 0.11, hh - 0.2, -0.11, hh - 0.2]), grad(ctx, -0.2, 0, 0.2, 0, [0, '#9aa5b6', 1, '#4a5366']), 0.04);
  // the sign face
  const face = (((p.seed | 0) % 3) + 3) % 3;
  const R = 0.42;
  if (face === 0) {
    const o = [];
    for (let i = 0; i < 8; i++) o.push(Math.cos((i + 0.5) * TAU / 8) * R * 1.03, sy + Math.sin((i + 0.5) * TAU / 8) * R * 1.03);
    plate(ctx, poly(o), '#f6f3ec', 0.04, (c) => {
      const q = [];
      for (let i = 0; i < 8; i++) q.push(Math.cos((i + 0.5) * TAU / 8) * R * 0.9, sy + Math.sin((i + 0.5) * TAU / 8) * R * 0.9);
      c.fillStyle = '#d8232a';
      c.fill(poly(q));
      gloss(c, -R * 0.7, sy - R * 0.8, R * 0.7, 0.04, 0.4);
    });
    label(ctx, 'STOP', 0, sy + 0.01, 0.2, WHITE, { maxW: R * 1.5 });
  } else if (face === 1) {
    const d = poly([0, sy - R * 1.05, R * 1.05, sy, 0, sy + R * 1.05, -R * 1.05, sy]);
    plate(ctx, d, '#ffd21f', 0.04, (c) => {
      c.strokeStyle = OUT;
      c.lineWidth = 0.025;
      c.stroke(poly([0, sy - R * 0.88, R * 0.88, sy, 0, sy + R * 0.88, -R * 0.88, sy]));
      // a little man mid-tumble
      c.strokeStyle = OUT;
      c.lineWidth = 0.032;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-0.1, sy + 0.02);
      c.lineTo(0.02, sy - 0.04);
      c.lineTo(0.12, sy - 0.15);
      c.moveTo(0.02, sy - 0.04);
      c.lineTo(0.14, sy + 0.08);
      c.moveTo(-0.1, sy + 0.02);
      c.lineTo(-0.2, sy + 0.14);
      c.moveTo(-0.1, sy + 0.02);
      c.lineTo(-0.02, sy + 0.16);
      c.stroke();
      c.fillStyle = OUT;
      c.beginPath();
      c.arc(-0.2, sy - 0.07, 0.045, 0, TAU);
      c.fill();
    });
  } else {
    plate(ctx, circle(0, sy, R), '#f6f3ec', 0.04, (c) => {
      c.strokeStyle = '#d8232a';
      c.lineWidth = 0.075;
      c.beginPath();
      c.arc(0, sy, R * 0.8, 0, TAU);
      c.stroke();
      gloss(c, -R * 0.55, sy - R * 0.62, R * 0.5, 0.04, 0.5);
    });
    label(ctx, '30', 0, sy + 0.01, 0.3, OUT, { maxW: R * 1.0 });
  }
  rivet(ctx, 0, sy - R * 0.98, 0.02);
  rivet(ctx, 0, sy + R * 0.98, 0.02);
}

function pinePole(ctx, p) {
  const r = rng(p.seed);
  const hh = p.h / 2;
  const hw = p.w / 2;
  // trunk with flared roots
  const trunk = poly([-hw * 0.6, -hh + 0.5, hw * 0.6, -hh + 0.5, hw * 1.0, hh - 0.3, hw * 2.4, hh, -hw * 2.4, hh, -hw * 1.0, hh - 0.3]);
  plate(ctx, trunk, grad(ctx, -hw, 0, hw, 0, [0, '#a06a38', 0.4, '#7a4a24', 1, '#3e2210']), 0.04, (c) => {
    c.strokeStyle = 'rgba(29,19,32,.5)';
    c.lineWidth = 0.014;
    for (let i = 0; i < 12; i++) {
      const x = -hw * 0.8 + r() * hw * 1.6;
      const y = hh - 0.2 - r() * 2.6;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + (r() - 0.5) * 0.03, y - 0.15 - r() * 0.3);
      c.stroke();
    }
  });
  // tiers of boughs, top to bottom, each wider and drooping
  const tiers = 7;
  const top = -hh - 0.05;
  const bottom = hh - 1.3;
  const greens = ['#2f7d46', '#2a7240', '#256a3b'];
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const y0 = top + (bottom - top) * t * 0.88;
    const y1 = y0 + 0.75 + t * 0.35;
    const wHalf = 0.17 + 0.28 * t;
    const n = 4;
    // tip, right edge, then the scalloped base back to the left
    const poly2 = [0, y0, wHalf, y1 - 0.02];
    for (let k = 1; k < n; k++) poly2.push(wHalf - (2 * wHalf * k) / n, y1 - (k % 2 ? 0.0 : 0.13) + (r() - 0.5) * 0.02);
    poly2.push(-wHalf, y1 - 0.02);
    const col = greens[i % 3];
    plate(ctx, poly(poly2), grad(ctx, -wHalf, y0, wHalf * 0.6, y1, [0, lit(col, 0.2), 0.55, col, 1, shade(col, 0.4)]), 0.04, (c) => {
      c.fillStyle = 'rgba(180,235,150,.28)';
      c.fillRect(-wHalf, y0, wHalf * 0.5, y1 - y0);
      c.fillStyle = 'rgba(10,30,20,.3)';
      c.fillRect(wHalf * 0.35, y0, wHalf, y1 - y0);
      c.strokeStyle = 'rgba(10,50,30,.5)';
      c.lineWidth = 0.014;
      for (let k = 0; k < 3; k++) {
        const bx = (k - 1) * wHalf * 0.5;
        c.beginPath();
        c.moveTo(0, y0 + (y1 - y0) * 0.3);
        c.lineTo(bx, y1 - 0.06);
        c.stroke();
      }
    });
  }
  // a pinecone or two
  for (const [cx, cy] of [[-0.2, hh - 1.6], [0.25, hh - 2.6]]) {
    plate(ctx, ellipse(cx, cy, 0.04, 0.065), '#8a5628', 0.02);
  }
}

function torchPole(ctx, p) {
  const hh = p.h / 2;
  const hw = Math.max(0.07, p.w * 0.5);
  const cupY = -hh + 0.28;
  // bamboo with nodes
  shaft(ctx, hw, hw * 1.05, cupY, hh, grad(ctx, -hw, 0, hw, 0, [0, '#e4cd88', 0.35, '#c9a45a', 1, '#6e5224']), (c) => {
    c.fillStyle = 'rgba(255,255,255,.45)';
    c.fillRect(-hw * 0.6, cupY, 0.025, p.h);
    for (let y = cupY + 0.4; y < hh - 0.1; y += 0.46) {
      c.fillStyle = '#5e4418';
      c.fillRect(-hw * 1.1, y - 0.02, hw * 2.2, 0.05);
      c.fillStyle = 'rgba(255,230,160,.6)';
      c.fillRect(-hw * 1.1, y - 0.03, hw * 2.2, 0.015);
    }
    c.fillStyle = 'rgba(60,110,40,.25)';
    c.fillRect(hw * 0.2, cupY, hw, p.h);
  });
  // rope wrap and the metal cup
  plate(ctx, rrect(-hw * 1.3, cupY + 0.02, hw * 2.6, 0.12, 0.03), '#d6b574', 0.03, (c) => {
    c.strokeStyle = 'rgba(90,60,20,.8)';
    c.lineWidth = 0.014;
    for (let x = -hw * 1.3; x < hw * 1.4; x += 0.05) {
      c.beginPath();
      c.moveTo(x, cupY + 0.02);
      c.lineTo(x + 0.04, cupY + 0.14);
      c.stroke();
    }
  });
  const cup = poly([-0.1, cupY - 0.12, 0.1, cupY - 0.12, 0.075, cupY + 0.02, -0.075, cupY + 0.02]);
  plate(ctx, cup, grad(ctx, -0.1, 0, 0.1, 0, [0, '#c7794a', 0.4, '#8a4a28', 1, '#4a2410']), 0.035, (c) => {
    c.fillStyle = 'rgba(255,200,120,.5)';
    c.fillRect(-0.075, cupY - 0.11, 0.025, 0.1);
  });
  // flame, painted
  const fy = cupY - 0.1;
  const glow = ctx.createRadialGradient(0, fy - 0.2, 0, 0, fy - 0.2, 0.34);
  glow.addColorStop(0, 'rgba(255,170,40,.45)');
  glow.addColorStop(1, 'rgba(255,170,40,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(-0.4, fy - 0.55, 0.8, 0.7);
  flame(ctx, 0, fy - 0.2, 0.22, OUT);
  flame(ctx, 0, fy - 0.19, 0.185, '#ff6a00');
  flame(ctx, 0.01, fy - 0.14, 0.125, '#ffc21a');
  flame(ctx, 0.01, fy - 0.09, 0.065, '#fff6c8');
}

export function paintPole(ctx, p) {
  if (p.variant === 'sign') signPole(ctx, p);
  else if (p.variant === 'pine') pinePole(ctx, p);
  else if (p.variant === 'torch') torchPole(ctx, p);
  else lampPole(ctx, p);
}

// ------------------------------------------------------------------ billboard
export function paintBillboard(ctx, p) {
  const r = rng(p.seed);
  const W = 8;
  const H = 4;
  const bx = W / 2;
  const by = H / 2;
  const k = Math.min(p.w / W, p.h / H);
  // two steel posts from under the board down to the ground, 6 m below the box
  for (const sx of [-1, 1]) {
    const x = sx * 2.4 * k;
    plate(ctx, rrect(x - 0.13, by * k - 0.1, 0.26, p.h / 2 + 6 - by * k + 0.1, 0.03), grad(ctx, x - 0.13, 0, x + 0.13, 0, [0, '#8a93a6', 1, '#3a4152']), 0.04);
    plate(ctx, rrect(x - 0.3, p.h / 2 + 5.9, 0.6, 0.1, 0.03), '#4a5366', 0.03);
  }
  ctx.save();
  ctx.scale(k, k);
  // lamps on a rail above the board
  for (const lx of [-2.6, 0, 2.6]) {
    line(ctx, lx, -by, lx, -by - 0.12, 0.07, OUT);
    plate(ctx, poly([lx - 0.2, -by - 0.36, lx + 0.2, -by - 0.36, lx + 0.3, -by - 0.1, lx - 0.3, -by - 0.1]), grad(ctx, 0, -by - 0.36, 0, -by - 0.1, [0, '#5a6478', 1, '#2a3040']), 0.04);
    plate(ctx, rrect(lx - 0.22, -by - 0.13, 0.44, 0.06, 0.03), '#fff3b0', 0.025);
  }
  // frame
  const frame = rrect(-bx, -by, W, H, 0.1);
  plate(ctx, frame, grad(ctx, 0, -by, 0, by, [0, '#6a7488', 0.5, '#444c60', 1, '#262b3a']), 0.06, (c) => {
    bevel(c, -bx, -by, W, H, 0.05, 0.3);
    for (let x = -bx + 0.4; x < bx; x += 0.8) {
      rivet(c, x, -by + 0.11, 0.03);
      rivet(c, x, by - 0.11, 0.03);
    }
  });
  // the poster
  const px = -bx + 0.24;
  const py = -by + 0.24;
  const pw = W - 0.48;
  const ph = H - 0.48;
  plate(ctx, rrect(px, py, pw, ph, 0.04), grad(ctx, 0, py, 0, py + ph, [0, '#ffe566', 0.6, '#ffb62e', 1, '#ff8a28']), 0.04, (c) => {
    // sunburst behind the mascot
    c.save();
    c.translate(2.5, 0.0);
    for (let i = 0; i < 14; i++) {
      c.fillStyle = 'rgba(255,255,255,' + (i % 2 ? 0.12 : 0) + ')';
      c.beginPath();
      c.moveTo(0, 0);
      c.arc(0, 0, 6, (i / 14) * TAU, ((i + 1) / 14) * TAU);
      c.fill();
    }
    c.restore();
    // headline, the pitch, and the aside
    label(c, 'FLEW OFF A CLIFF?', -1.15, -1.2, 0.6, '#1d1320', { maxW: 4.9, italic: true, stroke: '#ffffff', strokeW: 0.1 });
    label(c, "WE'VE GOT YOUR BACK.", -1.15, -0.62, 0.5, '#c8141c', { maxW: 4.85, italic: true, stroke: '#ffffff', strokeW: 0.08 });
    label(c, '(AND YOUR ARMS. AND YOUR LEGS.)', -1.15, -0.2, 0.25, '#3a1c10', { maxW: 4.8, italic: true });
    // the company badge
    plate(c, rrect(-3.55, 0.1, 4.8, 0.95, 0.1), grad(c, 0, 0.1, 0, 1.05, [0, '#3a74f0', 1, '#1c3fa8']), 0.05, (d) => {
      label(d, 'SPLAT-SAFE', -1.0, 0.43, 0.46, '#ffffff', { maxW: 3.3, italic: true, stroke: '#0c1a4c', strokeW: 0.07 });
      label(d, 'STUNT INSURANCE', -1.0, 0.82, 0.27, '#ffd21f', { maxW: 3.3, italic: true, track: 0.04 });
      plate(d, circle(-3.05, 0.58, 0.32), '#ffd21f', 0.04);
      label(d, '+', -3.05, 0.6, 0.62, '#c8141c', { maxW: 0.4 });
    });
    label(c, 'CALL 555-OOF-OUCH', -1.15, 1.3, 0.27, '#3a1c10', { maxW: 4.8 });
    label(c, '*necks not covered. neither is the rest of you.', -1.15, 1.58, 0.12, 'rgba(58,28,16,.85)', { maxW: 4.6 });
    // the mascot
    c.save();
    c.translate(2.6, -0.05);
    c.scale(0.8, 0.8);
    mascot(c);
    c.restore();
    grime(c, r, px, py, pw, ph, 10, '#6b3a10', 0.08, 0.4);
  });
  ctx.restore();
}

// a battered, cheerful stuntman on the poster, about 3 tall, origin at his middle
function mascot(c) {
  const skin = '#f0b98a';
  // plaster leg and good leg
  plate(c, rrect(-0.45, 0.52, 0.36, 1.3, 0.14), grad(c, -0.45, 0, -0.09, 0, [0, '#ffffff', 1, '#cfc8bc']), 0.05, (d) => {
    label(d, 'GET WELL', -0.27, 1.0, 0.075, '#3a74f0', { maxW: 0.3, rot: -Math.PI / 2 });
    label(d, 'SOON!', -0.18, 1.2, 0.07, '#c8141c', { maxW: 0.26, rot: -Math.PI / 2 });
  });
  plate(c, rrect(-0.5, 1.68, 0.5, 0.2, 0.08), '#ffffff', 0.05);
  plate(c, rrect(0.02, 0.52, 0.34, 1.3, 0.14), '#f6f3ec', 0.05, (d) => {
    d.fillStyle = BLUE;
    d.fillRect(0.02, 0.52, 0.06, 1.3);
    d.fillStyle = RED;
    d.fillRect(0.28, 0.52, 0.06, 1.3);
  });
  plate(c, rrect(0.0, 1.7, 0.58, 0.2, 0.09), '#3a3a4e', 0.05);
  // torso
  plate(c, rrect(-0.46, -0.72, 0.92, 1.38, 0.2), grad(c, -0.46, 0, 0.46, 0, [0, '#ffffff', 1, '#d8d2c6']), 0.06, (d) => {
    d.fillStyle = BLUE;
    d.fillRect(-0.46, -0.72, 0.1, 1.4);
    d.fillRect(0.26, -0.72, 0.1, 1.4);
    d.fillStyle = RED;
    d.fillRect(-0.34, -0.72, 0.08, 1.4);
    d.fillRect(0.36, -0.72, 0.1, 1.4);
    d.fillStyle = RED;
    d.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * TAU;
      const rr = i % 2 ? 0.1 : 0.24;
      d.lineTo(Math.cos(a) * rr - 0.0, Math.sin(a) * rr - 0.1);
    }
    d.closePath();
    d.fill();
    d.lineWidth = 0.03;
    d.strokeStyle = OUT;
    d.stroke();
  });
  // arm in a sling on the left, thumbs-up on the right
  plate(c, rrect(-0.76, -0.55, 0.3, 0.95, 0.14), '#f6f3ec', 0.05);
  plate(c, poly([-0.88, -0.1, -0.4, 0.0, -0.45, 0.55, -0.8, 0.5]), '#2a5fe0', 0.05, (d) => {
    d.fillStyle = 'rgba(255,255,255,.25)';
    d.fillRect(-0.88, -0.1, 0.5, 0.1);
  });
  plate(c, circle(-0.62, 0.42, 0.14), skin, 0.045);
  c.save();
  c.translate(0.5, -0.55);
  c.rotate(-0.9);
  plate(c, rrect(-0.15, -0.1, 0.3, 0.95, 0.14), '#f6f3ec', 0.05);
  plate(c, rrect(-0.2, -0.46, 0.4, 0.4, 0.14), skin, 0.05);
  plate(c, rrect(-0.06, -0.8, 0.14, 0.4, 0.07), skin, 0.05);
  c.restore();
  // head
  plate(c, circle(0, -1.18, 0.5), grad(c, -0.5, -1.7, 0.5, -0.7, [0, '#ffd3a8', 1, '#d99b6a']), 0.06);
  // helmet with a band-aid
  plate(c, new Path2D('M -0.52 -1.2 A 0.52 0.52 0 0 1 0.52 -1.2 L 0.52 -1.3 L -0.52 -1.3 Z'), '#ffffff', 0.06, (d) => {
    d.fillStyle = RED;
    d.fillRect(-0.1, -1.8, 0.2, 0.7);
  });
  plate(c, rrect(-0.55, -1.34, 1.1, 0.12, 0.05), '#e9e4d8', 0.05);
  plate(c, rrect(0.12, -1.6, 0.3, 0.12, 0.05), '#ffd9a8', 0.04, (d) => {
    d.fillStyle = 'rgba(160,90,60,.5)';
    d.fillRect(0.2, -1.6, 0.1, 0.12);
  });
  // face: a black eye, a happy eye, a huge grin with a gap
  plate(c, circle(-0.17, -1.12, 0.12), '#fff', 0.04);
  plate(c, circle(0.2, -1.12, 0.12), '#fff', 0.04);
  c.fillStyle = OUT;
  c.beginPath();
  c.arc(-0.14, -1.11, 0.045, 0, TAU);
  c.arc(0.23, -1.11, 0.045, 0, TAU);
  c.fill();
  c.fillStyle = 'rgba(110,60,170,.65)';
  c.beginPath();
  c.ellipse(-0.17, -1.12, 0.17, 0.15, 0, 0, TAU);
  c.fill();
  plate(c, new Path2D('M -0.3 -0.88 Q 0 -0.62 0.32 -0.9 Q 0 -0.76 -0.3 -0.88 Z'), '#ffffff', 0.04);
  c.lineWidth = 0.05;
  c.strokeStyle = OUT;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(-0.32, -0.9);
  c.quadraticCurveTo(0, -0.58, 0.34, -0.92);
  c.stroke();
  c.fillStyle = OUT;
  c.beginPath();
  c.moveTo(-0.12, -0.78);
  c.lineTo(-0.02, -0.76);
  c.lineTo(-0.08, -0.7);
  c.fill();
  // OW! bubble
  plate(c, new Path2D('M 0.55 -2.1 Q 1.1 -2.35 1.5 -1.95 Q 1.65 -1.45 1.1 -1.4 L 0.85 -1.15 L 0.85 -1.42 Q 0.35 -1.5 0.55 -2.1 Z'), '#ffffff', 0.05);
  label(c, 'OW!', 1.0, -1.85, 0.4, '#c8141c', { maxW: 0.8 });
}

// ------------------------------------------------------ scaffold plank / girder
export function paintDeck(ctx, p) {
  const r = rng(p.seed);
  const hw = p.w / 2;
  const hh = p.h / 2;
  if (p.variant === 'girder') {
    plate(ctx, rrect(-hw, -hh, p.w, p.h, 0.02), grad(ctx, 0, -hh, 0, hh, [0, '#f06a52', 0.3, '#d23a2a', 1, '#8a1f18']), 0.03, (c) => {
      c.fillStyle = 'rgba(255,255,255,.45)';
      c.fillRect(-hw, -hh, p.w, 0.025);
      c.fillStyle = 'rgba(29,19,32,.3)';
      c.fillRect(-hw, hh - 0.03, p.w, 0.03);
      for (let x = -hw + 0.12; x < hw; x += 0.3) rivet(c, x, 0, 0.017, '#d9a09a');
      c.fillStyle = 'rgba(29,19,32,.18)';
      c.fillRect(-hw, -hh + 0.04, p.w, 0.012);
      label(c, 'G-7', hw * 0.55, 0.0, 0.07, 'rgba(255,255,255,.8)', { maxW: 0.2 });
      grime(c, r, -hw, -hh, p.w, p.h, 6, '#4a1810', 0.3, 0.06);
      hazard(c, -hw, -hh, 0.14, p.h, 0.05);
      hazard(c, hw - 0.14, -hh, 0.14, p.h, 0.05);
    });
    return;
  }
  plate(ctx, rrect(-hw, -hh, p.w, p.h, 0.025), body(ctx, -hw, -hh, p.w, p.h, '#d9a05a', 0.3, 0.14), 0.03, (c) => {
    grain(c, r, -hw, -hh, p.w, p.h, '#6b3d17', 3, 0.45);
    for (const sx of [-1, 1]) {
      const x = sx * (hw - 0.17);
      c.fillStyle = grad(c, x - 0.05, 0, x + 0.05, 0, [0, '#c9d1dc', 1, '#6e7a8a']);
      c.fillRect(x - 0.05, -hh, 0.1, p.h);
      c.strokeStyle = OUT;
      c.lineWidth = 0.015;
      c.strokeRect(x - 0.05, -hh, 0.1, p.h);
      rivet(c, x, -hh * 0.4, 0.012);
      rivet(c, x, hh * 0.4, 0.012);
    }
    c.fillStyle = 'rgba(29,19,32,.3)';
    c.beginPath();
    c.ellipse(hw * 0.35, 0, 0.05, 0.022, 0, 0, TAU);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,.3)';
    c.fillRect(-hw, -hh, p.w, 0.02);
    grime(c, r, -hw, -hh, p.w, p.h, 6, '#3a210e', 0.3, 0.1);
  });
}

// ----------------------------------------------------------------- steel beam
export function paintBeam(ctx, p) {
  const r = rng(p.seed);
  const hw = p.w / 2;
  const hh = p.h / 2;
  const fl = p.h * 0.2;
  plate(ctx, rrect(-hw, -hh, p.w, p.h, 0.03), grad(ctx, 0, -hh, 0, hh, [0, '#c4cedd', 0.2, '#8e9db3', 0.8, '#66748c', 1, '#3e4a60']), 0.045, (c) => {
    // web, set back between the flanges
    c.fillStyle = grad(c, 0, -hh + fl, 0, hh - fl, [0, 'rgba(20,30,50,.34)', 1, 'rgba(20,30,50,.12)']);
    c.fillRect(-hw, -hh + fl, p.w, p.h - 2 * fl);
    line(c, -hw, -hh + fl, hw, -hh + fl, 0.02, rgba(OUT, 0.8));
    line(c, -hw, hh - fl, hw, hh - fl, 0.02, rgba(OUT, 0.8));
    c.fillStyle = 'rgba(255,255,255,.55)';
    c.fillRect(-hw, -hh + 0.012, p.w, 0.02);
    // stiffeners and bolts
    for (const x of [-hw * 0.7, -hw * 0.25, hw * 0.25, hw * 0.7]) {
      c.fillStyle = '#7d8aa0';
      c.fillRect(x - 0.025, -hh + fl, 0.05, p.h - 2 * fl);
      c.strokeStyle = OUT;
      c.lineWidth = 0.012;
      c.strokeRect(x - 0.025, -hh + fl, 0.05, p.h - 2 * fl);
    }
    for (const sx of [-1, 1]) {
      c.fillStyle = '#5c6880';
      c.fillRect(sx < 0 ? -hw : hw - 0.1, -hh, 0.1, p.h);
      for (const y of [-0.08, 0.0, 0.08]) rivet(c, sx * (hw - 0.05), y, 0.014, '#b8c2d2');
    }
    // primer patches, rust, a number
    c.fillStyle = 'rgba(255,120,30,.55)';
    c.fillRect(-hw * 0.5, -hh + fl + 0.015, 0.5, 0.012);
    grime(c, r, -hw, -hh, p.w, p.h, 10, '#8a4a20', 0.3, 0.08);
    label(c, 'IB-5M', hw * 0.1, 0, 0.1, 'rgba(255,214,60,.9)', { maxW: 0.5 });
    scratches(c, r, -hw, -hh, p.w, p.h, 8, '#ffffff', 0.4, 0.2);
  });
}

// ------------------------------------------------------------------- ramps
export function paintRamp(ctx, p) {
  const r = rng(p.seed);
  const hw = p.w / 2;
  const hh = p.h / 2;
  const steel = p.variant === 'steel';
  const tri = poly([-hw, hh, hw, hh, hw, -hh]);
  const ang = Math.atan2(p.h, p.w);
  const L = Math.hypot(p.w, p.h);
  // unit normal pointing into the wedge (down and right)
  const nx = p.h / L;
  const ny = p.w / L;
  const strip = (t) => poly([-hw, hh, hw, -hh, hw, -hh + (t * L) / p.w, -hw + (t * L) / p.h, hh]);
  plate(ctx, tri, steel ? '#59667f' : '#9a6532', 0.055, (c) => {
    if (!steel) {
      // vertical side boards
      const bw = 0.26;
      const tones = ['#b0753a', '#a06a33', '#bb7f42'];
      for (let x = -hw, i = 0; x < hw; x += bw, i++) {
        c.fillStyle = body(c, x, -hh, bw, p.h, tones[i % 3], 0.2, 0.1);
        c.fillRect(x, -hh, bw, p.h);
        line(c, x, -hh, x, hh, 0.02, rgba(OUT, 0.75));
        grain(c, r, x, -hh, bw, p.h, '#4a2a10', 2, 0.25);
      }
      // frame: bottom beam, back post and two struts
      c.fillStyle = '#7a4a22';
      c.fillRect(-hw, hh - 0.14, p.w, 0.14);
      c.fillRect(hw - 0.16, -hh, 0.16, p.h);
      for (const s of [[-hw * 0.7, hh - 0.14, hw - 0.16, -hh * 0.35], [-hw * 0.05, hh - 0.14, hw - 0.16, -hh * 0.78]]) {
        c.save();
        c.beginPath();
        c.moveTo(s[0] - 0.08, s[1]);
        c.lineTo(s[0] + 0.08, s[1]);
        c.lineTo(s[2], s[3] + 0.08);
        c.lineTo(s[2], s[3] - 0.08);
        c.closePath();
        c.fillStyle = '#7a4a22';
        c.fill();
        c.lineWidth = 0.022;
        c.strokeStyle = OUT;
        c.stroke();
        c.restore();
      }
      c.lineWidth = 0.022;
      c.strokeStyle = OUT;
      c.strokeRect(-hw, hh - 0.14, p.w, 0.14);
      c.strokeRect(hw - 0.16, -hh, 0.16, p.h);
      grime(c, r, -hw, -hh, p.w, p.h, 10, '#2a1808', 0.22, 0.14);
    } else {
      // dark lattice behind steel bars
      c.fillStyle = '#242b3c';
      c.fillRect(-hw, -hh, p.w, p.h);
      c.strokeStyle = '#8c9bb5';
      c.lineWidth = 0.1;
      c.lineCap = 'butt';
      const px = p.w / 4;
      for (let i = 0; i < 4; i++) {
        const x0 = -hw + px * i;
        c.beginPath();
        c.moveTo(x0, hh);
        c.lineTo(x0 + px, hh - (p.h * (i + 1)) / 4 * 0.85);
        c.moveTo(x0 + px * 0.0, hh - 0.1);
        c.lineTo(x0 + px * 0.0, hh - (p.h * i) / 4);
        c.stroke();
      }
      c.fillStyle = '#6c7a94';
      c.fillRect(-hw, hh - 0.16, p.w, 0.16);
      c.fillRect(hw - 0.2, -hh, 0.2, p.h);
      hazard(c, hw - 0.2, -hh, 0.2, p.h, 0.1);
      for (let x = -hw + 0.2; x < hw - 0.2; x += 0.45) rivet(c, x, hh - 0.08, 0.02);
      grime(c, r, -hw, -hh, p.w, p.h, 10, '#8a4a20', 0.2, 0.12);
    }
  });
  // the slope: a thick running surface
  plate(ctx, strip(steel ? 0.12 : 0.14), steel ? grad(ctx, 0, -hh, 0, hh, [0, '#d4dbe8', 1, '#8a97ae']) : grad(ctx, 0, -hh, 0, hh, [0, '#f0c27a', 1, '#c78a45']), 0.045, (c) => {
    if (steel) {
      c.strokeStyle = 'rgba(29,19,32,.35)';
      c.lineWidth = 0.014;
      for (let t = 0.2; t < L; t += 0.16) {
        const x = -hw + (t / L) * p.w;
        const y = hh - (t / L) * p.h;
        c.beginPath();
        c.moveTo(x - 0.03, y + 0.05);
        c.lineTo(x + 0.03, y - 0.03);
        c.stroke();
      }
    } else {
      for (let t = 0.45; t < L; t += 0.5) {
        const x = -hw + (t / L) * p.w;
        const y = hh - (t / L) * p.h;
        line(c, x, y, x + nx * 0.16, y + ny * 0.16, 0.02, rgba(OUT, 0.8));
      }
      grain(c, r, -hw, -hh, p.w, p.h, '#6b3d17', 3, 0.0);
    }
  });
  // highlight along the running edge and a metal lip at the top
  line(ctx, -hw + 0.1, hh - 0.04 + 0.0, hw - 0.04, -hh + 0.05, 0.02, 'rgba(255,255,255,.55)');
  plate(ctx, poly([hw - 0.5 * (p.w / L), -hh + 0.5 * (p.h / L), hw, -hh, hw, -hh + 0.2]), '#dfe5ee', 0.035, (c) => {
    hazard(c, hw - 0.5, -hh, 0.5, 0.2, 0.06);
  });
}

// ---------------------------------------------------------------- platforms
export function paintPlatform(ctx, p) {
  const r = rng(p.seed);
  const hw = p.w / 2;
  const hh = p.h / 2;
  if (p.variant === 'steel') {
    plate(ctx, rrect(-hw, -hh, p.w, p.h, 0.03), grad(ctx, 0, -hh, 0, hh, [0, '#a7b4c8', 0.4, '#76849c', 1, '#434d63']), 0.05, (c) => {
      c.fillStyle = YELLOW;
      c.fillRect(-hw, -hh, p.w, 0.05);
      c.fillStyle = 'rgba(255,255,255,.5)';
      c.fillRect(-hw, -hh + 0.05, p.w, 0.018);
      for (const x of [-hw * 0.5, hw * 0.5]) line(c, x, -hh + 0.05, x, hh, 0.016, rgba(OUT, 0.7));
      for (let x = -hw + 0.12; x < hw; x += 0.3) {
        rivet(c, x, -hh + 0.12, 0.016);
        rivet(c, x, hh - 0.08, 0.016);
      }
      label(c, 'LOAD MAX 5T', -hw * 0.02, 0.03, 0.1, 'rgba(255,214,60,.9)', { maxW: 1.0 });
      grime(c, r, -hw, -hh, p.w, p.h, 8, '#8a4a20', 0.25, 0.1);
      scratches(c, r, -hw, -hh, p.w, p.h, 10, '#ffffff', 0.4, 0.2);
    });
  } else if (p.variant === 'wood') {
    plate(ctx, rrect(-hw, -hh, p.w, p.h, 0.03), body(ctx, -hw, -hh, p.w, p.h, '#b07a3e', 0.35, 0.14), 0.05, (c) => {
      const half = p.h / 2;
      for (let i = 0; i < 2; i++) {
        const y = -hh + i * half;
        grain(c, r, -hw, y, p.w, half, '#4a2a10', 3, 0.4);
        line(c, -hw, y + half, hw, y + half, 0.02, rgba(OUT, 0.8));
      }
      for (const x of [-hw * 0.4, hw * 0.3]) {
        line(c, x, -hh, x, -hh + half, 0.018, rgba(OUT, 0.7));
        line(c, x + 0.7, -hh + half, x + 0.7, hh, 0.018, rgba(OUT, 0.7));
      }
      for (const sx of [-1, 1]) {
        for (const y of [-hh + 0.1, hh - 0.1]) rivet(c, sx * (hw - 0.12), y, 0.02, '#59606b');
      }
      c.fillStyle = 'rgba(255,255,255,.3)';
      c.fillRect(-hw, -hh, p.w, 0.025);
      underside(c, -hw, hh - 0.08, p.w, 0.08, 0.3);
      grime(c, r, -hw, -hh, p.w, p.h, 8, '#2a1808', 0.25, 0.1);
    });
  } else {
    plate(ctx, rrect(-hw, -hh, p.w, p.h, 0.04), body(ctx, -hw, -hh, p.w, p.h, '#cdc7ba', 0.3, 0.12), 0.05, (c) => {
      c.fillStyle = 'rgba(255,255,255,.45)';
      c.fillRect(-hw, -hh, p.w, 0.075);
      line(c, -hw, -hh + 0.075, hw, -hh + 0.075, 0.02, rgba(OUT, 0.6));
      for (let x = -hw + p.w / 3; x < hw - 0.1; x += p.w / 3) line(c, x, -hh, x, hh, 0.02, rgba(OUT, 0.55));
      hazard(c, -hw, hh - 0.11, p.w, 0.11, 0.08);
      crack(c, r, hw * 0.35, -hh + 0.08, 0.25, 0.011, 'rgba(29,19,32,.55)');
      crack(c, r, -hw * 0.55, -hh + 0.08, 0.2, 0.011, 'rgba(29,19,32,.5)', 1.3);
      grime(c, r, -hw, -hh, p.w, p.h, 12, '#4a3a2a', 0.14, 0.1);
      runs(c, r, -hw, -hh + 0.08, p.w, 5, 0.2, '#3a2c20', 0.2);
      bevel(c, -hw, -hh, p.w, p.h, 0.03, 0.2);
    });
  }
}

// -------------------------------------------------------- shipping containers
const BOXES = {
  red: { base: '#c8372d', name: 'REDHAUL', ink: '#f6f3ec' },
  blue: { base: '#2f64b8', name: 'BLUEBOAT', ink: '#f6f3ec' },
  green: { base: '#2f9460', name: 'GREENPORT', ink: '#f6f3ec' },
  orange: { base: '#ee8a1b', name: 'ORANGEX', ink: '#2a1a10' },
};

export function paintContainer(ctx, p) {
  const b = BOXES[p.variant] || BOXES.red;
  const r = rng(p.seed);
  const hw = p.w / 2;
  const hh = p.h / 2;
  const top = 0.17;
  const bot = 0.2;
  const cs = 0.34;
  const outer = rrect(-hw, -hh, p.w, p.h, 0.05);
  plate(ctx, outer, body(ctx, -hw, -hh, p.w, p.h, b.base, 0.3, 0.26), 0.06, (c) => {
    // corrugated wall
    for (let x = -hw + 0.04; x < hw; x += 0.14) {
      c.fillStyle = 'rgba(255,255,255,.15)';
      c.fillRect(x, -hh + top, 0.045, p.h - top - bot);
      c.fillStyle = 'rgba(29,19,32,.15)';
      c.fillRect(x + 0.07, -hh + top, 0.04, p.h - top - bot);
    }
    // rails
    c.fillStyle = grad(c, 0, -hh, 0, -hh + top, [0, lit(b.base, 0.25), 1, shade(b.base, 0.2)]);
    c.fillRect(-hw, -hh, p.w, top);
    c.fillStyle = grad(c, 0, hh - bot, 0, hh, [0, shade(b.base, 0.1), 1, shade(b.base, 0.5)]);
    c.fillRect(-hw, hh - bot, p.w, bot);
    line(c, -hw, -hh + top, hw, -hh + top, 0.03, OUT);
    line(c, -hw, hh - bot, hw, hh - bot, 0.03, OUT);
    // forklift pockets
    for (const x of [-1.15, 1.15]) {
      c.fillStyle = 'rgba(15,10,18,.75)';
      c.fillRect(x - 0.25, hh - bot * 0.82, 0.5, 0.11);
    }
    // markings
    label(c, b.name, -hw * 0.45, -hh * 0.38, 0.5, b.ink, { maxW: p.w * 0.4, italic: true });
    line(c, -hw * 0.82, -hh * 0.38 + 0.3, -hw * 0.2, -hh * 0.38 + 0.3, 0.05, b.ink);
    label(c, 'KEEP CLEAR OF MOTOR TRAFFIC', -hw * 0.5, -hh * 0.38 + 0.45, 0.07, b.ink, { maxW: p.w * 0.36 });
    const id = 'BXU ' + (400000 + Math.floor(r() * 99999)) + ' 7';
    label(c, id, hw * 0.55, -hh * 0.6, 0.12, b.ink, { maxW: 1.3 });
    label(c, '20G1  MAX GROSS 30480 KG', hw * 0.55, -hh * 0.6 + 0.14, 0.065, b.ink, { maxW: 1.3 });
    // wear: rust from the rails, dents, scratches
    runs(c, r, -hw, -hh + top, p.w, 14, 0.9, '#6b2a10', 0.28);
    grime(c, r, -hw, -hh, p.w, p.h, 16, '#2a1c14', 0.14, 0.2);
    for (let i = 0; i < 3; i++) {
      const x = -hw + 0.8 + r() * (p.w - 1.6);
      const y = -hh + top + 0.2 + r() * 0.9;
      c.fillStyle = 'rgba(29,19,32,.2)';
      c.beginPath();
      c.ellipse(x, y, 0.3 + r() * 0.25, 0.09, (r() - 0.5) * 0.5, 0, TAU);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,.14)';
      c.beginPath();
      c.ellipse(x - 0.03, y - 0.05, 0.28, 0.05, (r() - 0.5) * 0.3, 0, TAU);
      c.fill();
    }
    scratches(c, r, -hw, -hh, p.w, p.h, 20, '#ffffff', 0.25, 0.25);
    // corner castings
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const x = sx < 0 ? -hw : hw - cs;
        const y = sy < 0 ? -hh : hh - cs * 0.85;
        c.fillStyle = grad(c, 0, y, 0, y + cs * 0.85, [0, '#4a4452', 1, '#1f1a26']);
        c.fillRect(x, y, cs, cs * 0.85);
        c.strokeStyle = OUT;
        c.lineWidth = 0.03;
        c.strokeRect(x, y, cs, cs * 0.85);
        c.fillStyle = '#0c0910';
        c.beginPath();
        c.ellipse(x + cs / 2, y + cs * 0.42, cs * 0.28, cs * 0.14, 0, 0, TAU);
        c.fill();
      }
    }
    bevel(c, -hw, -hh, p.w, p.h, 0.04, 0.2);
  });
}

// --------------------------------------------------------------- water tower
export function paintWaterTower(ctx, p) {
  const r = rng(p.seed);
  // drawn 3 x 5 units: the tank and roof (the box) on top, the legs below it
  const sx = p.w / 3;
  const sy = p.h / 3;
  ctx.save();
  ctx.scale(sx, sy);
  ctx.translate(0, 1);
  ctx.lineJoin = 'round';
  const lwd = (v) => v / ((sx + sy) / 2);
  // legs: far pair, near pair, cross braces, ladder
  const legs = [[-1.15, 0.5, -1.4, 2.5, 0.2, '#6a4a2a'], [1.15, 0.5, 1.4, 2.5, 0.2, '#6a4a2a'], [-0.6, 0.5, -0.65, 2.5, 0.16, '#4a3420'], [0.6, 0.5, 0.65, 2.5, 0.16, '#4a3420']];
  for (const l of legs) {
    const w2 = l[4] / 2;
    plate(ctx, poly([l[0] - w2, l[1], l[0] + w2, l[1], l[2] + w2, l[3], l[2] - w2, l[3]]), grad(ctx, l[0] - w2, 0, l[0] + w2, 0, [0, lit(l[5], 0.2), 1, shade(l[5], 0.35)]), lwd(0.04));
  }
  ctx.lineCap = 'round';
  for (const y of [1.3, 2.0]) {
    const t0 = (y - 0.5) / 2;
    const xo = 1.15 + 0.25 * t0;
    for (const [a, b2] of [[-xo, xo], [xo, -xo]]) {
      line(ctx, a, y, b2, y + 0.55, lwd(0.1), OUT);
      line(ctx, a, y, b2, y + 0.55, lwd(0.05), '#8a93a2');
    }
  }
  plate(ctx, rrect(-1.65, 2.42, 0.5, 0.2, 0.04), '#b5ae9f', lwd(0.04));
  plate(ctx, rrect(1.15, 2.42, 0.5, 0.2, 0.04), '#b5ae9f', lwd(0.04));
  // ladder up the right side
  line(ctx, 1.6, 2.4, 1.52, 0.5, lwd(0.05), OUT);
  for (let y = 0.7; y < 2.4; y += 0.22) line(ctx, 1.36, y, 1.6 - (2.4 - y) * 0.04, y, lwd(0.035), '#6b7280');
  // tank body
  const tank = rrect(-1.5, -1.85, 3.0, 2.35, 0.1);
  plate(ctx, tank, grad(ctx, -1.5, 0, 1.5, 0, [0, '#b9885a', 0.3, '#9a6b42', 1, '#4e3320']), lwd(0.06), (c) => {
    for (let x = -1.5; x < 1.5; x += 0.2) {
      c.strokeStyle = 'rgba(29,19,32,.55)';
      c.lineWidth = lwd(0.018);
      c.beginPath();
      c.moveTo(x, -1.85);
      c.lineTo(x, 0.5);
      c.stroke();
    }
    grain(c, r, -1.5, -1.85, 3.0, 2.35, '#3a2210', 6, 0.18);
    for (const y of [-1.45, -0.55, 0.3]) {
      c.fillStyle = grad(c, 0, y - 0.07, 0, y + 0.07, [0, '#6a7384', 0.4, '#3a4152', 1, '#20242f']);
      c.fillRect(-1.5, y - 0.07, 3.0, 0.14);
      c.fillStyle = 'rgba(255,255,255,.35)';
      c.fillRect(-1.5, y - 0.07, 3.0, 0.025);
      for (let x = -1.3; x < 1.5; x += 0.45) rivet(c, x, y, 0.025, '#9aa3b4');
    }
    label(c, 'WATER', 0.0, -0.95, 0.5, 'rgba(246,243,236,.85)', { maxW: 2.0 });
    grime(c, r, -1.5, -1.85, 3.0, 2.35, 16, '#2a1c14', 0.18, 0.25);
    runs(c, r, -1.5, -1.3, 3.0, 10, 1.0, '#2a1c14', 0.2);
    c.fillStyle = 'rgba(255,255,255,.2)';
    c.fillRect(-1.5, -1.85, 0.35, 2.35);
    c.fillStyle = 'rgba(29,19,32,.3)';
    c.fillRect(1.0, -1.85, 0.5, 2.35);
  });
  // conical roof and finial
  const roof = poly([-1.65, -1.8, 0, -2.5, 1.65, -1.8]);
  plate(ctx, roof, grad(ctx, -1.65, 0, 1.65, 0, [0, '#c26a4a', 0.45, '#9a4a30', 1, '#4e2218']), lwd(0.06), (c) => {
    c.strokeStyle = 'rgba(29,19,32,.5)';
    c.lineWidth = lwd(0.02);
    for (let i = -6; i <= 6; i++) {
      c.beginPath();
      c.moveTo(0, -2.5);
      c.lineTo(i * 0.28, -1.8);
      c.stroke();
    }
    c.fillStyle = 'rgba(255,255,255,.2)';
    c.fillRect(-1.65, -2.5, 0.8, 0.7);
  });
  plate(ctx, circle(0, -2.5, 0.07), '#6a7384', lwd(0.03));
  ctx.restore();
}
