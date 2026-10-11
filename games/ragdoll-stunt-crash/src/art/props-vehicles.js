// Painters for the vehicles on the tracks: the traffic sedan (also taxi and
// police), the lorry, the city bus, the harbour forklift and the rusty junk
// car. All face right, with their wheels drawn in at the bottom of the box
// (the junk car has none). Each is designed at its default size and scaled to
// p.w x p.h, so a track that overrides the size still gets a whole vehicle.
// The windows are painted opaque and dark so blood stamps on everything.
import {
  OUT, YELLOW, WHITE, TAU, rng, lit, shade, rgba, grad, body, rrect, poly, circle, ellipse, plate, line, bevel, gloss, rivet, hazard, grime, runs,
  scratches, label, tyre,
} from './props-kit.js';

const GLASS_TOP = '#23405a';
const GLASS_BOT = '#6fa8c8';

function glassFill(ctx, y0, y1) {
  return grad(ctx, 0, y0, 0, y1, [0, GLASS_TOP, 1, GLASS_BOT]);
}
// two slanted shine bars across a clipped window
function glint(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(255,255,255,.32)';
  ctx.beginPath();
  ctx.moveTo(x + w * 0.2, y);
  ctx.lineTo(x + w * 0.45, y);
  ctx.lineTo(x + w * 0.15, y + h);
  ctx.lineTo(x - w * 0.1, y + h);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + w * 0.55, y);
  ctx.lineTo(x + w * 0.65, y);
  ctx.lineTo(x + w * 0.35, y + h);
  ctx.lineTo(x + w * 0.25, y + h);
  ctx.fill();
}
// a startled head in a window: skin, wide eyes, a gaping mouth; hat 'cap' | 'hard' | 'police' | null
function face(ctx, x, y, s, skin, hat) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  const lw = 0.05;
  plate(ctx, rrect(-0.3, 0.4, 0.6, 0.5, 0.2), hat === 'police' ? '#1c2a6a' : '#6a7a90', lw);
  plate(ctx, circle(0, 0, 0.42), skin, lw);
  for (const ex of [-0.14, 0.2]) {
    plate(ctx, circle(ex, -0.04, 0.13), '#ffffff', 0.035);
    ctx.fillStyle = OUT;
    ctx.beginPath();
    ctx.arc(ex + 0.045, -0.04, 0.055, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#6b0a14';
  ctx.beginPath();
  ctx.ellipse(0.14, 0.24, 0.1, 0.13, 0, 0, TAU);
  ctx.fill();
  line(ctx, -0.26, -0.24, -0.04, -0.2, 0.05, OUT);
  line(ctx, 0.08, -0.2, 0.32, -0.27, 0.05, OUT);
  if (hat === 'cap') {
    plate(ctx, new Path2D('M -0.42 -0.12 A 0.42 0.42 0 0 1 0.42 -0.12 Z'), '#222a3a', 0.05);
    plate(ctx, rrect(0.1, -0.2, 0.55, 0.1, 0.04), '#222a3a', 0.04);
  } else if (hat === 'hard') {
    plate(ctx, new Path2D('M -0.46 -0.1 A 0.46 0.46 0 0 1 0.46 -0.1 Z'), '#ffd21f', 0.05);
    plate(ctx, rrect(-0.5, -0.14, 1.0, 0.1, 0.04), '#e8b800', 0.04);
  } else if (hat === 'police') {
    plate(ctx, new Path2D('M -0.42 -0.14 A 0.42 0.42 0 0 1 0.42 -0.14 Z'), '#1c2a6a', 0.05);
    plate(ctx, rrect(-0.46, -0.2, 1.1, 0.1, 0.04), '#10183e', 0.04);
    plate(ctx, circle(0.1, -0.4, 0.07), YELLOW, 0.03);
  } else {
    plate(ctx, new Path2D('M -0.42 -0.14 Q -0.3 -0.5 0.1 -0.44 Q 0.4 -0.4 0.42 -0.1 Q 0.2 -0.3 -0.42 -0.14 Z'), '#4a2e1a', 0.04);
  }
  ctx.restore();
}

// -------------------------------------------------------------------- sedan
const SEDAN_COLOURS = ['#2fa56b', '#8e5bd4', '#e8e6df', '#c0392b', '#2e86de', '#e07a1a'];

export function paintSedan(ctx, p) {
  const sd = p.seed | 0;
  const r = rng(sd);
  const taxi = p.variant === 'taxi';
  const police = p.variant === 'police';
  const base = taxi ? '#ffcc1f' : police ? '#2a50c8' : SEDAN_COLOURS[((sd % SEDAN_COLOURS.length) + SEDAN_COLOURS.length) % SEDAN_COLOURS.length];
  ctx.save();
  ctx.scale(p.w / 4.4, p.h / 1.45);
  const shell = new Path2D();
  shell.moveTo(-2.17, 0.5);
  shell.lineTo(-2.2, 0.1);
  shell.quadraticCurveTo(-2.2, -0.14, -1.95, -0.15);
  shell.lineTo(-1.4, -0.17);
  shell.quadraticCurveTo(-1.2, -0.18, -1.05, -0.38);
  shell.lineTo(-0.82, -0.62);
  shell.quadraticCurveTo(-0.72, -0.72, -0.5, -0.72);
  shell.lineTo(0.3, -0.72);
  shell.quadraticCurveTo(0.5, -0.72, 0.62, -0.58);
  shell.lineTo(0.98, -0.2);
  shell.quadraticCurveTo(1.05, -0.14, 1.2, -0.14);
  shell.lineTo(2.0, -0.1);
  shell.quadraticCurveTo(2.2, -0.08, 2.2, 0.12);
  shell.lineTo(2.18, 0.5);
  shell.closePath();
  // wheels first: the body overlaps their tops
  for (const wx of [-1.4, 1.4]) {
    ctx.fillStyle = '#0d0a12';
    ctx.beginPath();
    ctx.arc(wx, 0.365, 0.44, 0, TAU);
    ctx.fill();
  }
  plate(ctx, shell, body(ctx, -2.2, -0.72, 4.4, 1.22, base, 0.2, 0.22), 0.05, (c) => {
    // darker sill, lit beltline
    c.fillStyle = 'rgba(29,19,32,.2)';
    c.fillRect(-2.3, 0.33, 4.6, 0.2);
    c.fillStyle = 'rgba(255,255,255,.4)';
    c.fillRect(-2.0, -0.12, 3.9, 0.035);
    if (taxi) {
      c.fillStyle = OUT;
      c.fillRect(-2.2, 0.12, 4.4, 0.2);
      c.fillStyle = '#f6f3ec';
      for (let i = 0, x = -2.2; x < 2.2; x += 0.1, i++) {
        c.fillRect(x, i % 2 ? 0.12 : 0.22, 0.1, 0.1);
        c.fillRect(x + 0.1, i % 2 ? 0.22 : 0.12, 0.1, 0.1);
        x += 0.1;
      }
    }
    if (police) {
      // white doors with the name
      c.fillStyle = '#f6f3ec';
      c.fillRect(-1.35, -0.16, 2.25, 0.7);
      label(c, 'POLICE', -0.28, 0.2, 0.2, '#1c2a6a', { maxW: 1.4 });
      plate(c, poly([0.65, -0.1, 0.72, 0.05, 0.85, 0.06, 0.75, 0.16, 0.78, 0.3, 0.65, 0.22, 0.52, 0.3, 0.55, 0.16, 0.45, 0.06, 0.58, 0.05]), YELLOW, 0.02);
    }
    // door seams, handles
    for (const x of [-1.35, -0.18, 0.9]) line(c, x, -0.15, x, 0.5, 0.025, rgba(OUT, 0.85));
    for (const x of [0.55, -0.5]) {
      c.fillStyle = base === '#e8e6df' ? '#8a8a8a' : lit(base, 0.5);
      c.fillRect(x - 0.1, -0.06, 0.2, 0.05);
      c.strokeStyle = rgba(OUT, 0.9);
      c.lineWidth = 0.015;
      c.strokeRect(x - 0.1, -0.06, 0.2, 0.05);
    }
    // lights and bumpers
    c.fillStyle = '#fff6b8';
    c.beginPath();
    c.ellipse(2.08, 0.0, 0.1, 0.12, 0, 0, TAU);
    c.fill();
    c.lineWidth = 0.03;
    c.strokeStyle = OUT;
    c.stroke();
    c.fillStyle = '#e02a2a';
    c.fillRect(-2.2, -0.08, 0.07, 0.2);
    c.fillStyle = '#2a2530';
    c.fillRect(1.98, 0.28, 0.3, 0.14);
    c.fillRect(-2.3, 0.28, 0.2, 0.14);
    c.fillStyle = 'rgba(255,255,255,.4)';
    c.fillRect(1.98, 0.28, 0.3, 0.03);
    for (const gy of [0.12, 0.2]) line(c, 1.9, gy, 2.2, gy, 0.02, 'rgba(15,10,18,.8)');
    // grime and scrapes
    grime(c, r, -2.2, -0.7, 4.4, 1.2, 8, '#2a1c14', 0.06, 0.16);
    scratches(c, r, -2.2, 0, 4.4, 0.5, 8, '#ffffff', 0.3, 0.2);
  });
  // glasshouse
  const gh = poly([-1.22, -0.2, -0.84, -0.58, -0.7, -0.645, 0.28, -0.645, 0.44, -0.62, 0.54, -0.52, 0.86, -0.2]);
  plate(ctx, gh, glassFill(ctx, -0.65, -0.2), 0.04, (c) => {
    glint(c, -1.05, -0.64, 0.5, 0.45);
    glint(c, 0.15, -0.64, 0.5, 0.45);
    // driver and passenger
    face(c, 0.1, -0.42, 0.2, ['#f0b98a', '#c98a5e', '#e8c4a0'][Math.abs(sd) % 3], taxi ? 'cap' : police ? 'police' : null);
    if (!police) face(c, -0.65, -0.4, 0.17, ['#8a5a3a', '#f0b98a', '#c98a5e'][Math.abs(sd + 1) % 3], null);
    c.fillStyle = base;
    c.fillRect(-0.22, -0.7, 0.09, 0.55);
    c.strokeStyle = OUT;
    c.lineWidth = 0.025;
    c.strokeRect(-0.22, -0.7, 0.09, 0.55);
  });
  // wheel arches and wheels
  for (const wx of [-1.4, 1.4]) {
    ctx.strokeStyle = rgba(OUT, 0.9);
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.arc(wx, 0.365, 0.43, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
    tyre(ctx, wx, 0.365, 0.36);
  }
  // roof furniture
  if (taxi) {
    plate(ctx, rrect(-0.3, -0.88, 0.5, 0.17, 0.04), '#fff6b8', 0.04, (c) => label(c, 'TAXI', -0.05, -0.8, 0.12, OUT, { maxW: 0.42 }));
  } else if (police) {
    plate(ctx, rrect(-0.32, -0.8, 0.58, 0.1, 0.03), '#2a2530', 0.04);
    plate(ctx, new Path2D('M -0.3 -0.8 A 0.14 0.14 0 0 1 -0.02 -0.8 Z'), '#ff3b3b', 0.035);
    plate(ctx, new Path2D('M 0.02 -0.8 A 0.14 0.14 0 0 1 0.3 -0.8 Z'), '#3b8bff', 0.035);
    ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.fillRect(-0.24, -0.9, 0.05, 0.05);
    ctx.fillRect(0.08, -0.9, 0.05, 0.05);
  } else {
    // a mirror on the door
    plate(ctx, rrect(0.82, -0.28, 0.14, 0.09, 0.03), shade(base, 0.2), 0.03);
  }
  ctx.restore();
}

// -------------------------------------------------------------------- lorry
export function paintTruck(ctx, p) {
  const r = rng(p.seed);
  ctx.save();
  ctx.scale(p.w / 9, p.h / 3.4);
  // chassis rail and fuel tank
  plate(ctx, rrect(-4.4, 0.7, 8.85, 0.28, 0.05), '#2a2530', 0.05);
  plate(ctx, rrect(2.2, 0.62, 0.95, 0.42, 0.18), grad(ctx, 0, 0.62, 0, 1.04, [0, '#e4e9ef', 1, '#6c7886']), 0.04);
  // cargo box
  const box = rrect(-4.5, -1.7, 6.45, 2.45, 0.1);
  plate(ctx, box, grad(ctx, 0, -1.7, 0, 0.75, [0, '#ffffff', 0.5, '#e9e5d9', 1, '#b9b3a4']), 0.07, (c) => {
    for (let x = -4.5 + 1.07; x < 1.95; x += 1.07) {
      c.fillStyle = 'rgba(29,19,32,.14)';
      c.fillRect(x - 0.03, -1.7, 0.06, 2.45);
      c.fillStyle = 'rgba(255,255,255,.7)';
      c.fillRect(x + 0.03, -1.7, 0.03, 2.45);
    }
    c.fillStyle = '#d9d3c4';
    c.fillRect(-4.5, -1.7, 6.45, 0.14);
    c.fillStyle = 'rgba(29,19,32,.35)';
    c.fillRect(-4.5, 0.6, 6.45, 0.15);
    c.fillStyle = '#e02a2a';
    c.fillRect(-4.5, 0.25, 6.45, 0.12);
    c.fillStyle = '#2a5fe0';
    c.fillRect(-4.5, 0.4, 6.45, 0.08);
    // the lettering
    label(c, 'BUMP & SONS', -1.25, -0.82, 0.74, '#1c3fa8', { maxW: 5.2, italic: true, stroke: '#ffffff', strokeW: 0.06 });
    label(c, 'REMOVALS', -1.25, -0.18, 0.5, '#d8232a', { maxW: 3.4, italic: true, track: 0.12 });
    label(c, '(WE DROP EVERYTHING)', -1.25, 0.05, 0.16, '#3a3a4e', { maxW: 3.4, italic: true });
    // rear doors and rivets
    line(c, -4.2, -1.55, -4.2, 0.6, 0.04, OUT);
    c.fillStyle = '#9aa3b2';
    c.fillRect(-4.38, -0.4, 0.07, 0.5);
    grime(c, r, -4.5, -1.7, 6.45, 2.45, 9, '#2a1c14', 0.07, 0.3);
    runs(c, r, -4.5, -1.55, 6.45, 12, 1.2, '#2a1c14', 0.16);
    scratches(c, r, -4.5, -1.7, 6.45, 2.45, 16, '#8a8a8a', 0.3, 0.3);
    bevel(c, -4.5, -1.7, 6.45, 2.45, 0.05, 0.3);
    c.fillStyle = '#e02a2a';
    c.fillRect(-4.5, 0.0, 0.13, 0.4);
  });
  // mudflaps and rear bar
  plate(ctx, rrect(-4.5, 0.75, 0.22, 0.2, 0.04), '#d8232a', 0.04);
  for (const fx of [-2.95, -1.8]) plate(ctx, rrect(fx, 0.75, 0.1, 0.5, 0.03), '#18141e', 0.03);
  // cab
  const cab = new Path2D();
  cab.moveTo(2.05, 0.75);
  cab.lineTo(2.05, -1.3);
  cab.quadraticCurveTo(2.05, -1.45, 2.2, -1.45);
  cab.lineTo(3.7, -1.45);
  cab.quadraticCurveTo(3.88, -1.45, 3.98, -1.3);
  cab.lineTo(4.44, -0.38);
  cab.quadraticCurveTo(4.5, -0.28, 4.5, -0.15);
  cab.lineTo(4.5, 0.75);
  cab.closePath();
  plate(ctx, cab, body(ctx, 2.05, -1.45, 2.45, 2.2, '#d8332b', 0.38, 0.25), 0.07, (c) => {
    c.fillStyle = 'rgba(29,19,32,.28)';
    c.fillRect(2.0, 0.35, 2.6, 0.45);
    c.fillStyle = 'rgba(255,255,255,.35)';
    c.fillRect(2.1, -0.2, 2.3, 0.04);
    line(c, 3.4, -0.35, 3.4, 0.7, 0.03, rgba(OUT, 0.85));
    c.fillStyle = '#e8edf4';
    c.fillRect(3.15, -0.08, 0.2, 0.05);
    label(c, 'No.7', 2.75, 0.1, 0.22, WHITE, { maxW: 0.6 });
    // headlights and grille, bumper
    c.fillStyle = '#fff6b8';
    c.beginPath();
    c.ellipse(4.4, 0.18, 0.1, 0.16, 0, 0, TAU);
    c.fill();
    c.lineWidth = 0.035;
    c.strokeStyle = OUT;
    c.stroke();
    c.fillStyle = '#2a2530';
    c.fillRect(4.28, 0.5, 0.3, 0.2);
    grime(c, r, 2, -1.45, 2.5, 2.2, 8, '#2a1c14', 0.14, 0.15);
  });
  plate(ctx, poly([2.28, -1.25, 3.7, -1.25, 4.15, -0.42, 2.28, -0.42]), glassFill(ctx, -1.25, -0.42), 0.05, (c) => {
    glint(c, 2.5, -1.25, 0.9, 0.85);
    face(c, 3.1, -0.78, 0.36, '#c98a5e', 'cap');
    line(c, 3.4, -1.25, 3.4, -0.42, 0.05, OUT);
  });
  // roof deflector and exhaust stack
  plate(ctx, poly([2.1, -1.7, 3.1, -1.7, 3.6, -1.45, 2.1, -1.45]), grad(ctx, 0, -1.7, 0, -1.45, [0, '#ffffff', 1, '#b9b3a4']), 0.05);
  plate(ctx, rrect(1.98, -1.62, 0.12, 2.1, 0.05), grad(ctx, 1.98, 0, 2.1, 0, [0, '#f2f5fa', 1, '#6a7482']), 0.04);
  // wheels
  for (const wx of [-3.4, -2.25, 3.55]) {
    ctx.fillStyle = '#0d0a12';
    ctx.beginPath();
    ctx.arc(wx, 1.15, 0.62, Math.PI, TAU);
    ctx.fill();
    tyre(ctx, wx, 1.15, 0.55, '#c9ced6');
  }
  ctx.restore();
}

// ---------------------------------------------------------------------- bus
export function paintBus(ctx, p) {
  const r = rng(p.seed);
  ctx.save();
  ctx.scale(p.w / 11, p.h / 3.2);
  const base = '#1fa38a';
  const shell = new Path2D();
  shell.moveTo(-5.5, 0.85);
  shell.lineTo(-5.5, -1.35);
  shell.quadraticCurveTo(-5.5, -1.6, -5.25, -1.6);
  shell.lineTo(5.2, -1.6);
  shell.quadraticCurveTo(5.5, -1.6, 5.5, -1.3);
  shell.lineTo(5.5, 0.85);
  shell.closePath();
  for (const wx of [-3.7, 3.4]) {
    ctx.fillStyle = '#0d0a12';
    ctx.beginPath();
    ctx.arc(wx, 1.1, 0.62, 0, TAU);
    ctx.fill();
  }
  // roof pod
  plate(ctx, rrect(-2.4, -1.78, 2.6, 0.2, 0.08), '#e9e5d9', 0.05);
  plate(ctx, shell, body(ctx, -5.5, -1.6, 11, 2.45, base, 0.4, 0.22), 0.07, (c) => {
    // cream roof band, stripes and skirt
    c.fillStyle = '#f2ecd6';
    c.fillRect(-5.5, -1.6, 11, 0.32);
    c.fillStyle = 'rgba(29,19,32,.3)';
    c.fillRect(-5.5, -1.3, 11, 0.04);
    c.fillStyle = '#f2ecd6';
    c.fillRect(-5.5, 0.25, 11, 0.2);
    c.fillStyle = '#e02a2a';
    c.fillRect(-5.5, 0.45, 11, 0.12);
    c.fillStyle = 'rgba(29,19,32,.4)';
    c.fillRect(-5.5, 0.6, 11, 0.25);
    c.fillStyle = 'rgba(255,255,255,.25)';
    c.fillRect(-5.5, -0.15, 11, 0.04);
    label(c, 'CITY BUS', -3.1, 0.12, 0.22, '#0c4a3e', { maxW: 2, italic: true });
    // destination board
    c.fillStyle = '#16121a';
    c.fillRect(3.9, -1.55, 1.5, 0.26);
    label(c, '13 CRASH ZONE', 4.65, -1.42, 0.13, '#ffb22a', { maxW: 1.35 });
    grime(c, r, -5.5, -1.6, 11, 2.45, 12, '#2a1c14', 0.07, 0.35);
    runs(c, r, -5.5, 0.25, 11, 14, 0.5, '#2a1c14', 0.2);
    scratches(c, r, -5.5, -1.6, 11, 2.45, 18, '#ffffff', 0.25, 0.3);
    // headlight
    c.fillStyle = '#fff6b8';
    c.beginPath();
    c.ellipse(5.4, 0.1, 0.1, 0.18, 0, 0, TAU);
    c.fill();
    c.lineWidth = 0.04;
    c.strokeStyle = OUT;
    c.stroke();
    c.fillStyle = '#e02a2a';
    c.fillRect(-5.5, -0.2, 0.1, 0.4);
  });
  // windows with passengers
  const wins = [[-5.0, -3.9], [-3.8, -2.7], [-2.6, -1.5], [0.05, 1.15], [1.25, 2.35], [2.45, 3.55]];
  const skins = ['#f0b98a', '#c98a5e', '#8a5a3a', '#e8c4a0', '#f0b98a', '#a8704a'];
  const hats = [null, 'cap', null, null, 'hard', null];
  for (let i = 0; i < wins.length; i++) {
    const w = wins[i];
    plate(ctx, rrect(w[0], -1.15, w[1] - w[0], 0.92, 0.12), glassFill(ctx, -1.15, -0.23), 0.05, (c) => {
      glint(c, w[0] + 0.1, -1.15, 0.6, 0.92);
      if (r() > 0.25 || i === 5) face(c, (w[0] + w[1]) / 2 + (r() - 0.5) * 0.2, -0.62, 0.3, skins[i], hats[i]);
    });
  }
  // front windscreen quarter
  plate(ctx, rrect(4.45, -1.15, 0.9, 0.92, 0.12), glassFill(ctx, -1.15, -0.23), 0.05, (c) => {
    glint(c, 4.55, -1.15, 0.6, 0.92);
    face(c, 4.95, -0.62, 0.34, '#c98a5e', 'cap');
  });
  // doors
  for (const dx of [-0.95, 3.7]) {
    const dw = dx < 0 ? 0.85 : 0.8;
    plate(ctx, rrect(dx, -1.2, dw, 1.95, 0.05), grad(ctx, 0, -1.2, 0, 0.75, [0, '#2a4a58', 1, '#0f2a36']), 0.05, (c) => {
      c.fillStyle = glassFill(c, -1.15, -0.15);
      c.fillRect(dx + 0.05, -1.15, dw / 2 - 0.07, 1.2);
      c.fillRect(dx + dw / 2 + 0.02, -1.15, dw / 2 - 0.07, 1.2);
      line(c, dx + dw / 2, -1.2, dx + dw / 2, 0.75, 0.04, OUT);
      c.fillStyle = 'rgba(255,255,255,.3)';
      c.fillRect(dx + 0.08, -1.1, 0.06, 1.1);
    });
  }
  // mirror arm and wheels
  line(ctx, 5.5, -0.9, 5.65, -0.9, 0.05, OUT);
  plate(ctx, rrect(5.5, -1.05, 0.14, 0.4, 0.05), '#2a2530', 0.035);
  for (const wx of [-3.7, 3.4]) {
    ctx.strokeStyle = rgba(OUT, 0.9);
    ctx.lineWidth = 0.06;
    ctx.beginPath();
    ctx.arc(wx, 1.1, 0.6, Math.PI, TAU);
    ctx.stroke();
    tyre(ctx, wx, 1.1, 0.5, '#c9ced6');
  }
  ctx.restore();
}

// ----------------------------------------------------------------- forklift
export function paintForklift(ctx, p) {
  const r = rng(p.seed);
  ctx.save();
  ctx.scale(p.w / 2.8, p.h / 2.4);
  const yel = '#f2a516';
  const steel = '#7a8598';
  // overhead guard and mast, behind the body
  ctx.lineCap = 'round';
  for (const [x0, y0, x1, y1] of [[-0.55, -0.1, -0.6, -1.14], [0.6, -0.1, 0.58, -1.14]]) {
    line(ctx, x0, y0, x1, y1, 0.13, OUT);
    line(ctx, x0, y0, x1, y1, 0.08, yel);
  }
  plate(ctx, rrect(-0.75, -1.2, 1.55, 0.1, 0.04), yel, 0.045, (c) => {
    c.fillStyle = OUT;
    for (let x = -0.7; x < 0.8; x += 0.2) c.fillRect(x, -1.2, 0.07, 0.1);
  });
  // driver
  plate(ctx, rrect(-0.55, -0.7, 0.18, 0.55, 0.06), '#3a3544', 0.04);
  plate(ctx, rrect(-0.45, -0.6, 0.4, 0.5, 0.12), '#ff7a1a', 0.04);
  face(ctx, -0.12, -0.72, 0.17, '#f0b98a', 'hard');
  // body
  const bodyPath = new Path2D();
  bodyPath.moveTo(-1.38, 0.68);
  bodyPath.lineTo(-1.4, -0.08);
  bodyPath.quadraticCurveTo(-1.4, -0.28, -1.2, -0.28);
  bodyPath.lineTo(-0.7, -0.28);
  bodyPath.lineTo(-0.55, -0.12);
  bodyPath.lineTo(0.15, -0.12);
  bodyPath.lineTo(0.3, 0.0);
  bodyPath.lineTo(0.95, 0.0);
  bodyPath.lineTo(0.98, 0.68);
  bodyPath.closePath();
  const wells = [[-0.85, 0.9, 0.32], [0.45, 0.78, 0.42]];
  for (const w of wells) {
    ctx.fillStyle = '#0d0a12';
    ctx.beginPath();
    ctx.arc(w[0], w[1], w[2] + 0.08, 0, TAU);
    ctx.fill();
  }
  plate(ctx, bodyPath, body(ctx, -1.4, -0.28, 2.4, 0.96, yel, 0.2, 0.22), 0.055, (c) => {
    // counterweight, hazard stripe, number
    c.fillStyle = 'rgba(29,19,32,.35)';
    c.fillRect(-1.45, -0.28, 0.75, 1.0);
    hazard(c, -1.4, 0.38, 2.4, 0.14, 0.1);
    label(c, 'HEAVY', -1.04, -0.02, 0.16, YELLOW, { maxW: 0.6 });
    label(c, 'LIFTER', -1.04, 0.16, 0.14, YELLOW, { maxW: 0.6 });
    line(c, -0.7, -0.28, -0.7, 0.7, 0.03, rgba(OUT, 0.8));
    gloss(c, -0.5, -0.1, 0.9, 0.035, 0.45);
    grime(c, r, -1.4, -0.28, 2.4, 1.0, 6, '#2a1c14', 0.1, 0.12);
    scratches(c, r, -1.4, -0.28, 2.4, 1.0, 8, '#ffffff', 0.3, 0.2);
  });
  // steering column and wheel
  line(ctx, 0.15, -0.1, 0.3, -0.45, 0.08, OUT);
  line(ctx, 0.15, -0.1, 0.3, -0.45, 0.04, steel);
  plate(ctx, ellipse(0.33, -0.48, 0.08, 0.03, -0.2), '#2a2530', 0.025);
  // mast, carriage and forks
  plate(ctx, rrect(0.93, -1.0, 0.16, 1.95, 0.03), grad(ctx, 0.93, 0, 1.09, 0, [0, '#d9dfe8', 1, '#5a6578']), 0.05);
  plate(ctx, rrect(1.05, -0.9, 0.1, 1.7, 0.03), grad(ctx, 1.05, 0, 1.15, 0, [0, '#c4cad4', 1, '#4a5366']), 0.045);
  line(ctx, 1.02, -0.9, 1.02, 0.3, 0.015, 'rgba(255,255,255,.7)');
  plate(ctx, rrect(1.0, 0.1, 0.16, 0.85, 0.03), grad(ctx, 0, 0.1, 0, 0.95, [0, '#9aa3b4', 1, '#444c60']), 0.05, (c) => rivet(c, 1.08, 0.3, 0.02));
  plate(ctx, poly([1.0, 0.82, 1.4, 0.9, 1.4, 0.97, 1.0, 0.97]), grad(ctx, 0, 0.82, 0, 0.97, [0, '#c9d0da', 1, '#4e5870']), 0.045);
  // tilt ram
  line(ctx, 0.78, 0.15, 0.98, -0.3, 0.08, OUT);
  line(ctx, 0.78, 0.15, 0.98, -0.3, 0.04, '#cfd6e0');
  // beacon on the guard
  plate(ctx, new Path2D('M 0.45 -1.2 A 0.1 0.1 0 0 1 0.65 -1.2 Z'), '#ff9a1a', 0.035);
  // wheels
  tyre(ctx, -0.85, 0.9, 0.32, '#e8e0cc');
  tyre(ctx, 0.45, 0.78, 0.42, '#e8e0cc');
  ctx.restore();
}

// ----------------------------------------------------------------- junk car
export function paintJunkCar(ctx, p) {
  const r = rng(p.seed);
  ctx.save();
  ctx.scale(p.w / 4.2, p.h / 1.3);
  const shell = new Path2D();
  shell.moveTo(-2.08, 0.65);
  shell.lineTo(-2.1, 0.1);
  shell.quadraticCurveTo(-2.1, -0.07, -1.9, -0.09);
  shell.lineTo(-1.2, -0.12);
  shell.quadraticCurveTo(-1.0, -0.17, -0.9, -0.3);
  shell.lineTo(-0.72, -0.52);
  shell.quadraticCurveTo(-0.6, -0.64, -0.4, -0.63);
  shell.lineTo(0.2, -0.6);
  shell.quadraticCurveTo(0.4, -0.62, 0.5, -0.5);
  shell.lineTo(0.85, -0.12);
  shell.lineTo(1.3, -0.04);
  shell.lineTo(1.55, -0.16);
  shell.lineTo(1.75, -0.02);
  shell.quadraticCurveTo(2.1, 0.0, 2.1, 0.22);
  shell.lineTo(2.08, 0.65);
  // wheel wells, open at the bottom
  shell.lineTo(1.68, 0.65);
  shell.arc(1.3, 0.65, 0.38, 0, Math.PI, true);
  shell.lineTo(-0.92, 0.65);
  shell.arc(-1.3, 0.65, 0.38, 0, Math.PI, true);
  shell.closePath();
  plate(ctx, shell, body(ctx, -2.1, -0.63, 4.2, 1.28, '#9a5a38', 0.45, 0.14), 0.055, (c) => {
    // what is left of the paint
    c.fillStyle = '#4f7c96';
    c.fill(poly([-0.15, -0.1, 0.9, -0.1, 0.85, 0.5, -0.2, 0.5, -0.12, 0.3]));
    c.fillStyle = '#c9b88e';
    c.fill(poly([-0.5, -0.64, 0.25, -0.62, 0.22, -0.4, -0.6, -0.42]));
    c.fillStyle = '#4f7c96';
    c.fill(poly([1.0, -0.1, 1.9, -0.05, 1.95, 0.2, 1.1, 0.2]));
    // rust blooms and flaking
    for (let i = 0; i < 30; i++) {
      c.fillStyle = r() > 0.4 ? 'rgba(120,52,20,.55)' : 'rgba(60,26,12,.4)';
      c.beginPath();
      c.ellipse(-2 + r() * 4.1, -0.5 + r() * 1.1, 0.06 + r() * 0.22, 0.05 + r() * 0.1, r() * 3, 0, TAU);
      c.fill();
    }
    c.fillStyle = 'rgba(29,19,32,.38)';
    c.fillRect(-2.2, 0.38, 4.4, 0.3);
    // door seams and a dent
    for (const x of [-1.2, -0.12, 0.85]) line(c, x, -0.1, x + (r() - 0.5) * 0.04, 0.58, 0.028, rgba(OUT, 0.85));
    c.fillStyle = 'rgba(15,10,18,.35)';
    c.beginPath();
    c.ellipse(1.5, 0.15, 0.3, 0.12, -0.2, 0, TAU);
    c.fill();
    c.fillStyle = 'rgba(255,214,150,.4)';
    c.beginPath();
    c.ellipse(1.45, 0.08, 0.22, 0.04, -0.2, 0, TAU);
    c.fill();
    runs(c, r, -2.1, -0.1, 4.2, 16, 0.6, '#3a1808', 0.35);
    scratches(c, r, -2.1, -0.6, 4.2, 1.2, 12, '#e8c89a', 0.4, 0.25);
    // a missing headlight and a flat tail light
    c.fillStyle = '#16121a';
    c.beginPath();
    c.ellipse(2.04, 0.05, 0.09, 0.11, 0, 0, TAU);
    c.fill();
    c.fillStyle = '#7a1a14';
    c.fillRect(-2.1, -0.02, 0.07, 0.16);
  });
  // wheel well liners
  for (const wx of [-1.3, 1.3]) {
    ctx.strokeStyle = '#0d0a12';
    ctx.lineWidth = 0.08;
    ctx.beginPath();
    ctx.arc(wx, 0.65, 0.4, Math.PI, TAU);
    ctx.stroke();
  }
  // smashed windows
  const gh = poly([-0.9, -0.14, -0.64, -0.47, -0.52, -0.54, 0.18, -0.52, 0.34, -0.45, 0.72, -0.14]);
  plate(ctx, gh, '#1a1722', 0.045, (c) => {
    c.strokeStyle = 'rgba(210,235,250,.8)';
    c.lineWidth = 0.012;
    for (let i = 0; i < 9; i++) {
      c.beginPath();
      c.moveTo(0.2, -0.3);
      c.lineTo(0.2 + Math.cos(i * 0.7 + 0.3) * 0.7, -0.3 + Math.sin(i * 0.7 + 0.3) * 0.5);
      c.stroke();
    }
    for (const rr of [0.1, 0.22]) {
      c.beginPath();
      c.ellipse(0.2, -0.3, rr * 1.4, rr, 0, 0, TAU);
      c.stroke();
    }
    c.fillStyle = '#c9b88e';
    c.fillRect(-0.06, -0.52, 0.07, 0.4);
    c.fillStyle = 'rgba(255,255,255,.18)';
    c.fillRect(-0.8, -0.5, 0.3, 0.37);
  });
  // a bumper hanging by one bolt
  ctx.save();
  ctx.translate(2.02, 0.5);
  ctx.rotate(0.35);
  plate(ctx, rrect(-0.05, 0, 0.12, 0.26, 0.04), '#8a93a2', 0.04);
  ctx.restore();
  ctx.restore();
}
