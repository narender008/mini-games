// Queen Veyl, the Thorn Regent. A towering queen of glass thorns (~3x Iri):
// a gown of layered crystal shards, a mantle of thorns, an antler crown of
// glass branches with glowing buds, a rose-heart that glows magenta, long
// arms ending in thorn talons. Painted once into cached layers; animated by
// sway, breathing, IK arms, hair and black-thread ropes.
import { spikeSprite, thorn } from './shared.js';
import { TAU, clamp, lerp, hexA, mk, srng, glow, shadow, spr, put, body, density, present, adt, rope, local, ribbon, strand, ease, eOut, k01, damp, poseOf, unravelFx, drawFx, light, ik, limb, poly } from './kit.js';

const C = {
  ink: '#0b0920', deep: '#1a1442', violet: '#4b2f9a', vio2: '#7a55d8', teal: '#7ff0e0', tealHi: '#e2fffa', tealMid: '#3fb8c0', sea: '#1c5f86',
  heart: '#ff4f9e', rose: '#ff86c0', roseDeep: '#a01858', skin: '#dff6f4', skinShade: '#9fc6d6', lip: '#5a1440', thread: '#07060f',
};
const W = 460, H = 440, AX = 230, AY = 400;

// ---------- cached layers ----------
function shardFan(g, R, o) {
  // o: { y0 (waist), x0 (waist half width), y1 (hem), x1 (hem half width), n, len, c0, c1, edge, a }
  for (let i = 0; i < o.n; i++) {
    const u = (i + R() * 0.6) / o.n * 2 - 1; // -1..1 across
    const topX = u * o.x0, topY = o.y0 + Math.abs(u) * 6;
    const botX = u * o.x1 * (1 + (R() - 0.5) * 0.08), botY = o.y1 - R() * o.len * 0.25 + Math.abs(u) * 10;
    const wTop = o.x0 / o.n * (1.6 + R()), wBot = o.x1 / o.n * (1.4 + R() * 1.2);
    const tip = botY + 10 + R() * o.len * 0.35;
    const gr = g.createLinearGradient(topX, topY, botX, tip);
    gr.addColorStop(0, o.c0); gr.addColorStop(0.55, o.c1); gr.addColorStop(1, o.c2 || o.c1);
    g.globalAlpha = o.a * (0.75 + R() * 0.25);
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(topX - wTop, topY); g.lineTo(topX + wTop, topY);
    g.lineTo(botX + wBot, botY); g.lineTo(botX + (R() - 0.5) * wBot, tip); g.lineTo(botX - wBot, botY);
    g.closePath(); g.fill();
    // a bright refracting edge on the side facing the light (upper left)
    g.globalAlpha = 0.55 + R() * 0.35;
    g.strokeStyle = o.edge; g.lineWidth = 1 + R() * 0.8;
    g.beginPath(); g.moveTo(topX - wTop, topY); g.lineTo(botX - wBot, botY); g.lineTo(botX + (R() - 0.5) * wBot, tip); g.stroke();
    // inner facet line
    if (R() < 0.6) { g.globalAlpha = 0.25; g.strokeStyle = '#ffffff'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(topX, topY + 4); g.lineTo(botX + (R() - 0.5) * wBot * 0.6, botY - 4); g.stroke(); }
  }
  g.globalAlpha = 1;
}
function roseAt(g, x, y, r, c1, c2) {
  for (let k = 0; k < 3; k++) {
    const rr = r * (1 - k * 0.28);
    g.fillStyle = k % 2 ? c2 : c1;
    g.beginPath();
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + k * 0.6; g.ellipse(x + Math.cos(a) * rr * 0.35, y + Math.sin(a) * rr * 0.25, rr * 0.55, rr * 0.4, a, 0, TAU); }
    g.fill();
  }
  g.fillStyle = '#ffd6ea'; g.beginPath(); g.arc(x, y - r * 0.05, r * 0.18, 0, TAU); g.fill();
}
const LAY = {
  mantle: (ph) => spr('veyl.mantle.' + ph, 440, 470, 220, 440, 2, (g) => {
    // a dark briar cape falling from the shoulders, and great curved thorns
    // rising behind them like a high gothic collar
    const R = srng(11 + ph);
    const cape = g.createLinearGradient(-120, -240, 120, 0);
    cape.addColorStop(0, '#2a1d66'); cape.addColorStop(0.35, '#130e36'); cape.addColorStop(1, '#06051a');
    g.fillStyle = cape;
    g.beginPath(); g.moveTo(-30, -236);
    g.bezierCurveTo(-70, -214, -92, -150, -112, -70);
    // tattered shard hem, longer at the sides
    const pts = [];
    for (let i = 0; i <= 16; i++) { const u = i / 16, x = lerp(-128, 128, u); const long = 1 - Math.abs(u - 0.5) * 2; pts.push([x, -4 + (i % 2 ? 18 + R() * 10 : -8 - long * 14)]); }
    g.lineTo(-128, -10);
    for (const [x, y] of pts) g.lineTo(x, y);
    g.lineTo(112, -70);
    g.bezierCurveTo(92, -150, 70, -214, 30, -236); g.closePath(); g.fill();
    g.strokeStyle = hexA(C.vio2, 0.7); g.lineWidth = 1.6; g.stroke();
    // folds catching violet light
    for (const [x, w] of [[-70, 10], [-28, 7], [30, 7], [74, 10]]) {
      const fg = g.createLinearGradient(x * 0.4, -220, x * 1.3, -10);
      fg.addColorStop(0, hexA(C.vio2, 0)); fg.addColorStop(0.5, hexA(C.vio2, 0.22)); fg.addColorStop(1, hexA(C.vio2, 0));
      g.strokeStyle = fg; g.lineWidth = w; g.beginPath(); g.moveTo(x * 0.35, -222); g.quadraticCurveTo(x * 0.95, -120, x * 1.3, -14); g.stroke();
    }
    // thorny vines climbing the cape
    g.lineCap = 'round';
    for (const sd of [-1, 1]) {
      g.strokeStyle = '#173445'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(sd * 118, -8); g.bezierCurveTo(sd * 70, -60, sd * 120, -120, sd * 60, -200); g.stroke();
      for (let k = 0; k < 7; k++) { const q = k / 7; const x = sd * lerp(118, 60, q) + Math.sin(q * 9) * 10 * sd, y = lerp(-8, -200, q); thorn(g, x, y, (sd > 0 ? 0 : Math.PI) + (R() - 0.5) * 1.2, 9, 2, C.sea, hexA(C.tealHi, 0.5)); }
    }
    // the collar thorns: big, curved, few
    const n = ph > 1 ? 7 : 5;
    for (const s of [-1, 1]) for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const bx = s * (22 + u * 26), by = -230 + u * 30;
      const ang = -Math.PI / 2 + s * (0.22 + u * 0.62);
      const L = 104 - u * 40 + (ph > 1 ? 26 : 0) + R() * 10;
      const ex = bx + Math.cos(ang) * L, ey = by + Math.sin(ang) * L;
      const cx = bx + Math.cos(ang - s * 0.5) * L * 0.6, cy = by + Math.sin(ang - s * 0.5) * L * 0.6;
      const w = 9 - u * 3;
      const gr = g.createLinearGradient(bx, by, ex, ey);
      gr.addColorStop(0, '#0d0a26'); gr.addColorStop(0.55, '#2c1d6e'); gr.addColorStop(0.9, C.vio2); gr.addColorStop(1, C.tealHi);
      g.fillStyle = gr;
      const nx = Math.cos(ang + Math.PI / 2) * w, ny = Math.sin(ang + Math.PI / 2) * w;
      g.beginPath(); g.moveTo(bx + nx, by + ny); g.quadraticCurveTo(cx + nx * 0.5, cy + ny * 0.5, ex, ey); g.quadraticCurveTo(cx - nx * 0.5, cy - ny * 0.5, bx - nx, by - ny); g.closePath(); g.fill();
      g.strokeStyle = hexA(C.tealHi, 0.75); g.lineWidth = 1.1;
      g.beginPath(); g.moveTo(bx - nx * 0.6, by - ny * 0.6); g.quadraticCurveTo(cx - nx * 0.4, cy - ny * 0.4, ex, ey); g.stroke();
      // a barb or two
      for (let k = 0; k < 2; k++) { const q = 0.35 + k * 0.25 + R() * 0.08; const px = lerp(bx, ex, q) + (cx - (bx + ex) / 2) * 0.8 * Math.sin(q * Math.PI), py = lerp(by, ey, q) + (cy - (by + ey) / 2) * 0.8 * Math.sin(q * Math.PI); thorn(g, px, py, ang + s * 0.9, 13 + R() * 6, 2.2, '#2c1d6e', hexA(C.tealHi, 0.6)); }
    }
    // roses caught in the cape
    for (let i = 0; i < (ph > 1 ? 7 : 4); i++) roseAt(g, (R() - 0.5) * 200, -40 - R() * 120, 5 + R() * 3, C.rose, C.roseDeep);
  }),
  gownBack: (ph) => spr('veyl.gownB.' + ph, 300, 160, 150, 140, 2, (g) => {
    const R = srng(21);
    // shadowed underlayer
    g.fillStyle = C.ink;
    g.beginPath(); g.moveTo(-34, -132); g.bezierCurveTo(-70, -90, -112, -30, -124, 2); g.lineTo(124, 2); g.bezierCurveTo(112, -30, 70, -90, 34, -132); g.closePath(); g.fill();
    shardFan(g, R, { y0: -128, x0: 34, y1: -6, x1: 122, n: 26, len: 34, c0: C.deep, c1: C.violet, c2: C.vio2, edge: hexA(C.teal, 0.8), a: 0.95 });
    // rose briars curling at the hem
    g.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const x = -110 + i * 27 + (R() - 0.5) * 8, y = -6 + (R() - 0.5) * 6;
      g.strokeStyle = '#1b3a3a'; g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 10, y - 22, x - 14, y - 30, x + 4, y - 40 - R() * 16); g.stroke();
      for (let k = 0; k < 3; k++) thorn(g, x + (R() - 0.5) * 10, y - 10 - k * 10, -Math.PI / 2 + (R() - 0.5) * 2, 7, 1.4, C.tealMid);
      if (R() < 0.6) roseAt(g, x + 4, y - 38 - R() * 10, 6 + R() * 3, C.rose, C.roseDeep);
    }
  }),
  gownMid: (ph) => spr('veyl.gownM.' + ph, 240, 130, 120, 132, 2, (g) => {
    const R = srng(31);
    shardFan(g, R, { y0: -128, x0: 28, y1: -36, x1: 96, n: 22, len: 30, c0: C.sea, c1: C.tealMid, c2: C.teal, edge: hexA(C.tealHi, 0.95), a: 0.82 });
  }),
  gownTop: (ph) => spr('veyl.gownT.' + ph, 180, 70, 90, 138, 2, (g) => {
    const R = srng(41);
    shardFan(g, R, { y0: -134, x0: 26, y1: -88, x1: 66, n: 16, len: 20, c0: C.deep, c1: C.vio2, c2: C.teal, edge: hexA(C.tealHi, 0.9), a: 0.92 });
  }),
  bodice: () => spr('veyl.bodice', 90, 70, 45, 178, 2, (g) => {
    // a corset of dark faceted glass, a rose-shaped socket for the heart
    const gr = g.createLinearGradient(-30, -176, 30, -128);
    gr.addColorStop(0, '#2c2470'); gr.addColorStop(0.5, C.deep); gr.addColorStop(1, C.ink);
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(-34, -170); g.quadraticCurveTo(-26, -150, -22, -130); g.lineTo(22, -130); g.quadraticCurveTo(26, -150, 34, -170); g.quadraticCurveTo(0, -164, -34, -170); g.fill();
    g.strokeStyle = hexA(C.teal, 0.7); g.lineWidth = 1.2;
    for (const [a, b, c, d] of [[-30, -168, -8, -132], [30, -168, 8, -132], [-14, -166, 0, -136], [14, -166, 0, -136]]) { g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); }
    g.fillStyle = hexA(C.tealHi, 0.18); g.beginPath(); g.moveTo(-30, -168); g.lineTo(-20, -166); g.lineTo(-18, -134); g.lineTo(-23, -133); g.closePath(); g.fill();
    // collar of small thorns at the neckline
    for (let i = -4; i <= 4; i++) thorn(g, i * 7.5, -168 + Math.abs(i) * 0.8, -Math.PI / 2 + i * 0.16, 10 + (4 - Math.abs(i)) * 2.2, 2, C.vio2, hexA(C.tealHi, 0.6));
  }),
  crown: (ph) => spr('veyl.crown.' + ph, 260, 140, 130, 120, 2, (g) => {
    // antler-like branches of glass, recursive
    const R = srng(51 + ph * 3);
    const buds = [];
    const branch = (x, y, ang, L, w, depth) => {
      const ex = x + Math.cos(ang) * L, ey = y + Math.sin(ang) * L;
      const gr = g.createLinearGradient(x, y, ex, ey);
      gr.addColorStop(0, C.sea); gr.addColorStop(1, depth > 2 ? C.tealHi : C.teal);
      g.fillStyle = gr;
      const nx = -Math.sin(ang) * w * 0.5, ny = Math.cos(ang) * w * 0.5;
      const qx = x + Math.cos(ang - 0.2) * L * 0.5, qy = y + Math.sin(ang - 0.2) * L * 0.5;
      g.beginPath(); g.moveTo(x + nx, y + ny); g.quadraticCurveTo(qx + nx * 0.6, qy + ny * 0.6, ex, ey); g.quadraticCurveTo(qx - nx * 0.6, qy - ny * 0.6, x - nx, y - ny); g.closePath(); g.fill();
      g.strokeStyle = hexA('#ffffff', 0.5); g.lineWidth = Math.max(0.6, w * 0.3);
      g.beginPath(); g.moveTo(x, y); g.lineTo(ex, ey); g.stroke();
      if (depth >= 3) { if (R() < (ph > 1 ? 0.8 : 0.5)) buds.push([ex, ey, 2 + R() * 2]); return; }
      const n = depth === 0 ? 3 : 2;
      for (let i = 0; i < n; i++) branch(ex, ey, ang + (i - (n - 1) / 2) * (0.55 + R() * 0.3) + (R() - 0.5) * 0.2, L * (0.62 + R() * 0.15), w * 0.68, depth + 1);
    };
    for (const s of [-1, 1]) { branch(s * 8, -4, -Math.PI / 2 + s * 0.62, 30 + (ph > 1 ? 10 : 0), 6, 0); branch(s * 4, -6, -Math.PI / 2 + s * 0.14, 22 + (ph > 1 ? 6 : 0), 4, 1); }
    // circlet
    g.strokeStyle = C.teal; g.lineWidth = 3; g.beginPath(); g.ellipse(0, 0, 20, 6, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
    for (const [x, y, r] of buds) { g.fillStyle = C.rose; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.4, 0, TAU); g.fill(); }
    LAY._buds = LAY._buds || {}; LAY._buds[ph] = buds;
  }),
  hair: () => spr('veyl.hair', 120, 170, 60, 214, 2, (g) => {
    // long hair of fine glass filaments falling behind the shoulders
    const R = srng(61);
    for (let i = 0; i < 36; i++) {
      const u = (i / 35) * 2 - 1;
      const x0 = u * 18, y0 = -210 + Math.abs(u) * 6;
      const x1 = u * 52 + (R() - 0.5) * 10, y1 = -92 - R() * 30;
      g.strokeStyle = i % 3 ? hexA(C.violet, 0.9) : hexA(C.teal, 0.6); g.lineWidth = 1.6 + R() * 1.5;
      g.beginPath(); g.moveTo(x0, y0); g.bezierCurveTo(x0 + u * 26, y0 + 40, x1 - u * 6, y1 - 50, x1, y1); g.stroke();
    }
  }),
  face: () => spr('veyl.face', 60, 70, 30, 222, 3, (g) => {
    // porcelain glass face, narrow and severe, faceted cheek planes
    const gr = g.createLinearGradient(-14, -214, 14, -176);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, C.skin); gr.addColorStop(1, C.skinShade);
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(0, -216); g.bezierCurveTo(15, -216, 16, -196, 11, -186); g.quadraticCurveTo(6, -177, 0, -175); g.quadraticCurveTo(-6, -177, -11, -186); g.bezierCurveTo(-16, -196, -15, -216, 0, -216); g.fill();
    g.fillStyle = hexA('#6f9fbf', 0.35); g.beginPath(); g.moveTo(11, -200); g.lineTo(11, -186); g.lineTo(3, -178); g.lineTo(6, -192); g.closePath(); g.fill();
    g.strokeStyle = hexA('#ffffff', 0.7); g.lineWidth = 0.7; g.beginPath(); g.moveTo(-10, -205); g.lineTo(-6, -186); g.stroke();
    // brows and eye sockets
    g.fillStyle = '#18153a';
    g.beginPath(); g.moveTo(-11, -201); g.quadraticCurveTo(-6, -205, -2, -201); g.lineTo(-3, -199); g.quadraticCurveTo(-7, -201, -10, -199); g.fill();
    g.beginPath(); g.moveTo(11, -201); g.quadraticCurveTo(6, -205, 2, -201); g.lineTo(3, -199); g.quadraticCurveTo(7, -201, 10, -199); g.fill();
    g.fillStyle = C.lip; g.beginPath(); g.moveTo(-4, -183.5); g.quadraticCurveTo(0, -185.5, 4, -183.5); g.quadraticCurveTo(0, -181.5, -4, -183.5); g.fill();
    // a crack across one cheek (she is glass)
    g.strokeStyle = hexA('#3a3a7a', 0.6); g.lineWidth = 0.6; g.beginPath(); g.moveTo(8, -208); g.lineTo(5, -199); g.lineTo(8, -193); g.lineTo(6, -188); g.stroke();
  }),
};

// ---------- the painter ----------
export default function draw(ctx, e, G, P) {
  if (!e || !G) return;
  const A = e.anim, t = G.t;
  const dt = adt(e, G);
  const pz = poseOf(e);
  const ph = e.phase || 1;
  e.lights = [];

  // intro rise, burrow sinking, death collapse
  let sunk = e.sunk || 0, rise = 1;
  if (e.state === 'intro') { const k = k01(e.st / 2.0); rise = ease(k); sunk = 1 - rise; }
  const dying = e.state === 'dying' ? k01(e.st / 3.0) : 0;
  const phaseK = e.state === 'phase' ? k01(e.st / 2.8) : 0;
  const stag = e.state === 'stagger' ? 1 : 0;
  const choice = 0;

  // body motion
  const breathe = Math.sin(t * 1.6) * 0.5 + 0.5;
  const sway = Math.sin(t * 0.9) * 0.02 + damp(e, 'vxs', clamp((e.vx || 0) / 300, -1, 1), 4, dt) * -0.06;
  const aim = e.aim ?? e.facing ?? Math.PI / 2;
  const side = Math.cos(aim) >= 0 ? 1 : -1;
  const look = damp(e, 'look', clamp(Math.cos(e.facing ?? aim), -1, 1), 5, dt);
  let lift = -Math.sin(t * 1.1) * 2.5; // she hovers a breath above the briars
  let lean = 0, crownScale = ph > 1 ? 1.12 : 1;
  if (pz.m === 'lanes' || pz.m === 'lanes2' || pz.m === 'verdict') { lift -= pz.wind * 10; lean = -pz.wind * 0.05 + pz.act * 0.08; }
  if (pz.m === 'claw') lean = side * (pz.wind * -0.05 + pz.act * 0.1);
  if (stag) lean = Math.sin(t * 3) * 0.03 + 0.06;
  if (phaseK) { lift -= Math.sin(phaseK * Math.PI) * 26; crownScale = lerp(ph > 1 ? 1 : 1, ph > 1 ? 1.12 : 1, ease(k01((phaseK - 0.2) / 0.5))); }
  const kneel = ease(k01(dying / 0.45));

  // ---------- shadow (huge, soft, two layers) ----------
  const shK = 1 - sunk * 0.6;
  shadow(ctx, 150 * shK, 46 * shK, 0.55);
  shadow(ctx, 96 * shK, 28 * shK, 0.55);

  // briar mound she sinks into / rises from
  if (sunk > 0.02) drawMound(ctx, sunk, t);

  const k = density(ctx, 2);
  const B = body(e, 'veyl', W, H, AX, AY, k);
  const g = B.g;
  g.save();
  const down = sunk * 270 + kneel * 70;
  g.translate(0, down + lift);
  g.transform(1, 0, sway + lean, 1, 0, 0);
  if (sunk > 0) { g.beginPath(); g.rect(-W, -H, W * 2, H - down - lift + 4); g.clip(); }

  // threads dragging from the hem (world-space ropes: they trail when she glides)
  const R = srng(e.id);
  if (!A.thr) A.thr = Array.from({ length: 4 }, (_, i) => ({ x: -84 + i * 56 + (R() - 0.5) * 10, n: 9 + (i % 3) }));
  for (const th of A.thr) {
    const pts = local(e, rope(e, 'th' + th.x, th.n, 14, e.x + th.x, e.y - 4 - (e.z || 0), { grav: 40, damp: 0.86, floor: e.y + 26, dx: 0, dy: 0.4, wind: (i, tt) => [Math.sin(tt * 1.3 + i + th.x) * 40, 0] }, dt, t));
    strand(g, pts.map(([x, y]) => [x, y - down - lift]), 1.3, C.thread, 0.55);
  }

  // mantle of thorns, breathing
  put(g, LAY.mantle(ph > 1 ? 2 : 1), 0, 6 + breathe * -1.5, 0, 1 + breathe * 0.01 + phaseK * 0.08, 1 + breathe * 0.012 + phaseK * 0.06);
  // hair behind
  put(g, LAY.hair(), 0, 0, Math.sin(t * 0.8) * 0.02);
  // gown tiers with layered sway; the ring spins them apart
  const spin = pz.m === 'ring' ? pz.wind : 0;
  const gs = 1 - kneel * 0.35;
  g.save(); g.translate(0, 0); g.scale(1 + kneel * 0.15, gs);
  put(g, LAY.gownBack(1), 0, 0, 0, 1 + Math.sin(t * 1.2) * 0.01 + spin * 0.08, 1);
  g.save(); g.transform(1, 0, Math.sin(t * 1.3 + 1) * 0.04 + spin * Math.sin(t * 9) * 0.12, 1, 0, 0); put(g, LAY.gownMid(1), 0, 0); g.restore();
  g.save(); g.transform(1, 0, Math.sin(t * 1.5 + 2) * 0.05 - spin * Math.sin(t * 9) * 0.12, 1, 0, 0); put(g, LAY.gownTop(1), 0, 0); g.restore();
  g.restore();

  const by = -kneel * 0; // body offset for kneel is in the translate above
  // ---------- arms (IK) ----------
  const sh = { L: [-34, -164 + by], R: [34, -164 + by] };
  const hands = handTargets(e, pz, aim, side, t, phaseK, stag, dying);
  const armL = ik(sh.L[0], sh.L[1], hands.L[0], hands.L[1], 54, 56, -1);
  const armR = ik(sh.R[0], sh.R[1], hands.R[0], hands.R[1], 54, 56, 1);
  const drawArm = (s, a, open) => {
    const [ex, ey, hx, hy] = a;
    const gr = g.createLinearGradient(s[0], s[1], hx, hy);
    gr.addColorStop(0, C.deep); gr.addColorStop(1, C.ink);
    g.fillStyle = gr;
    limb(g, s[0], s[1], ex, ey, 10, 7); g.fill();
    limb(g, ex, ey, hx, hy, 7, 4.5); g.fill();
    // a long bell sleeve of thin glass hanging from the forearm
    const fa = Math.atan2(hy - ey, hx - ex);
    const mx = lerp(ex, hx, 0.7), my = lerp(ey, hy, 0.7);
    const sl = g.createLinearGradient(ex, ey, mx, my + 60);
    sl.addColorStop(0, hexA(C.vio2, 0.75)); sl.addColorStop(1, hexA(C.teal, 0.25));
    g.fillStyle = sl;
    g.beginPath(); g.moveTo(ex, ey); g.lineTo(mx, my);
    g.quadraticCurveTo(mx + Math.cos(fa) * 8, my + 58, mx - Math.cos(fa) * 26, my + 66 + Math.sin(t * 2 + ex) * 3);
    g.quadraticCurveTo(lerp(ex, mx, 0.4), lerp(ey, my, 0.4) + 40, ex, ey); g.fill();
    g.strokeStyle = hexA(C.tealHi, 0.5); g.lineWidth = 1; g.stroke();
    g.strokeStyle = hexA(C.teal, 0.55); g.lineWidth = 1; g.beginPath(); g.moveTo(s[0], s[1] - 6); g.lineTo(ex, ey - 4); g.lineTo(hx, hy - 3); g.stroke();
    // shard cuffs at elbow and wrist
    for (const [cx, cy, n] of [[ex, ey, 4], [lerp(ex, hx, 0.8), lerp(ey, hy, 0.8), 5]]) for (let i = 0; i < n; i++) { const an = Math.atan2(hy - ey, hx - ex) + Math.PI + (i - (n - 1) / 2) * 0.5; thorn(g, cx, cy, an, 12, 2.6, C.vio2, hexA(C.tealHi, 0.7)); }
    // the hand: a narrow glass palm and four long curved thorn talons
    const ha = Math.atan2(hy - ey, hx - ex);
    g.fillStyle = C.skinShade;
    g.beginPath(); g.ellipse(hx + Math.cos(ha) * 4, hy + Math.sin(ha) * 4, 8, 5, ha, 0, TAU); g.fill();
    for (let i = 0; i < 4; i++) {
      const fa = ha + (i - 1.5) * (0.2 + open * 0.3);
      const L = 30 + open * 12 + (i === 1 || i === 2 ? 8 : 0);
      const curl = 0.5 * (1 - open) + 0.15;
      const bx = hx + Math.cos(fa) * 8, by = hy + Math.sin(fa) * 8;
      const mx = bx + Math.cos(fa) * L * 0.55, my = by + Math.sin(fa) * L * 0.55;
      const tx = bx + Math.cos(fa + curl) * L, ty = by + Math.sin(fa + curl) * L;
      const nx = -Math.sin(fa) * 2.8, ny = Math.cos(fa) * 2.8;
      const tg = g.createLinearGradient(bx, by, tx, ty);
      tg.addColorStop(0, C.deep); tg.addColorStop(0.6, C.tealMid); tg.addColorStop(1, C.tealHi);
      g.fillStyle = tg;
      g.beginPath(); g.moveTo(bx + nx, by + ny); g.quadraticCurveTo(mx + nx * 0.6, my + ny * 0.6, tx, ty); g.quadraticCurveTo(mx - nx * 0.6, my - ny * 0.6, bx - nx, by - ny); g.closePath(); g.fill();
      g.strokeStyle = hexA('#ffffff', 0.6); g.lineWidth = 0.8; g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(mx, my, tx, ty); g.stroke();
    }
  };
  // the far arm (away from the aim side) goes behind the bodice
  const far = side > 0 ? 'L' : 'R';
  drawArm(far === 'L' ? sh.L : sh.R, far === 'L' ? armL : armR, hands.open);
  // bodice and heart
  put(g, LAY.bodice(), 0, by, 0, 1, 1 + breathe * 0.015);
  // head: neck, hair, face (turns slightly toward the aim), crown
  const hx = look * 3, hy = by + (stag ? 6 : 0) + kneel * 10 + Math.sin(t * 1.6) * 0.8;
  g.fillStyle = C.skinShade; g.fillRect(-4.5 + hx * 0.5, -180 + hy, 9, 12);
  g.save(); g.translate(hx, hy); if (stag || kneel) g.rotate((stag ? 0.12 : 0) + kneel * 0.25);
  g.translate(0, -196); g.scale(1.38, 1.38); g.translate(0, 196);
  put(g, LAY.face(), 0, 0);
  // the crown (grows in phase 2, cracks while staggered)
  const cs = crownScale * (1 + Math.sin(phaseK * Math.PI) * 0.15);
  put(g, LAY.crown(ph > 1 ? 2 : 1), 0, -213, Math.sin(t * 0.7) * 0.015 + (stag ? 0.08 : 0), cs, cs);
  g.restore();
  // the near arm in front
  drawArm(far === 'L' ? sh.R : sh.L, far === 'L' ? armR : armL, hands.open);
  g.restore();

  // flash / stagger glaze / phase glow / unravel
  const flash = Math.max((e.flash || 0) / 0.1 * 0.85, stag ? 0.12 + Math.max(0, Math.sin(t * 14)) * 0.12 : 0);
  present(ctx, e, G, B, {
    flash,
    white: stag ? '#d9f4ff' : '#ffffff',
    tint: phaseK ? [C.heart, Math.sin(phaseK * Math.PI) * 0.35] : dying ? ['#120c2a', dying * 0.5] : null,
    unravel: dying > 0.3 ? (dying - 0.3) / 0.7 : 0,
  });

  // ---------- glows (additive, on the main canvas) ----------
  const oy = down + lift;
  const live = 1 - k01((dying - 0.5) * 2);
  const heartY = -150 + oy, heartX = (sway + lean) * -150;
  const pulse = 0.6 + 0.4 * Math.sin(t * 3.2) + pz.wind * 0.5 + phaseK;
  if (sunk < 0.9) {
    glow(ctx, heartX, heartY, 46 + pulse * 18, C.heart, 0.7 * live);
    glow(ctx, heartX, heartY, 14 + pulse * 4, '#ffd6ea', 0.9 * live);
    roseGlyph(ctx, heartX, heartY, 7.5 + pulse, live);
    // eyes
    const ex = hx + (sway + lean) * -205, ey = -200 + hy + oy;
    const eyeA = (stag ? 0.4 : 1) * live;
    for (const sx of [-8.3, 8.3]) { glow(ctx, ex + sx, ey - 1.5, 12, C.teal, eyeA); ctx.fillStyle = hexA("#ffffff", eyeA); ctx.fillRect(ex + sx - 3.4, ey - 2.4, 6.8, 2); }
    // crown buds shimmer
    const buds = (LAY._buds && LAY._buds[ph > 1 ? 2 : 1]) || [];
    for (let i = 0; i < buds.length; i += 2) { const [bx, bY] = buds[i]; glow(ctx, hx + bx * crownScale + (sway + lean) * -(214 - bY), -214 + hy + oy + bY * crownScale, 9 + Math.sin(t * 2 + i) * 2, C.rose, 0.5 * live); }
    // talon glow while winding up
    if (pz.wind > 0.05) for (const s of ['L', 'R']) { const hd = hands[s]; glow(ctx, hd[0] + (sway + lean) * -(-hd[1]), hd[1] + oy, 30 + pz.wind * 30, pz.m === 'claw' ? '#ff6a9a' : C.teal, pz.wind * 0.7); }
    // the verdict / phase change: the whole crown blazes
    if (pz.m === 'verdict' || phaseK) glow(ctx, hx, -230 + oy, 130, C.heart, 0.35 * (pz.wind + phaseK));
  }
  drawFx(ctx, e);
  if (dying) {
    unravelFx(e, G, { rate: dying < 0.9 ? 90 : 0, w: 220, h: 230, color: C.thread, color2: C.teal, mix: 0.35 }, dt);
    // glass falls from the crown as she kneels
    if (dying > 0.15 && dying < 0.7) glow(ctx, 0, -120 + oy, 160, C.teal, (0.7 - dying) * 0.5);
  } else if (A.fx && A.fx.length) unravelFx(e, G, { rate: 0 }, dt);

  // lights for the darkness layer
  if (live > 0.05) {
    light(e, 0, heartY, 220 + pulse * 30, C.heart, 0.6 * live);
    light(e, 0, -210 + oy, 260, C.teal, 0.55 * live);
    if (pz.wind > 0.1) light(e, hands.R[0], hands.R[1] + oy, 160, C.teal, pz.wind * 0.6);
  }
  e.light = e.lights[0] || null;
}

function roseGlyph(ctx, x, y, r, a) {
  ctx.globalAlpha = a;
  ctx.fillStyle = C.heart; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#ffd6ea'; ctx.lineWidth = 1.2;
  ctx.beginPath(); for (let i = 0; i < 26; i++) { const an = i * 0.5, rr = r * (i / 26); const px = x + Math.cos(an) * rr, py = y + Math.sin(an) * rr * 0.9; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.stroke();
  ctx.globalAlpha = 1;
}

function handTargets(e, pz, aim, side, t, phaseK, stag, dying) {
  const ca = Math.cos(aim), sa = Math.sin(aim);
  const idleL = [-60 + Math.sin(t * 1.3) * 3, -104 + Math.sin(t * 1.6) * 3], idleR = [60 + Math.sin(t * 1.2 + 1) * 3, -104 + Math.sin(t * 1.6 + 1) * 3];
  let L = idleL, Rh = idleR, open = 0.25;
  const mix = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
  const w = pz.wind, act = pz.act;
  switch (pz.m) {
    case 'lanes': case 'lanes2': case 'verdict': {
      const up = [[-92, -238], [92, -238]];
      const dn = [[ca * 60 - 40, -70 + sa * 30], [ca * 60 + 40, -70 + sa * 30]];
      L = mix(mix(idleL, up[0], w), dn[0], act); Rh = mix(mix(idleR, up[1], w), dn[1], act); open = 0.3 + w * 0.7;
      break;
    }
    case 'volley': {
      const up = side > 0 ? 'R' : 'L';
      const raised = [side * 26, -292], swing = [ca * 120, -150 + sa * 40];
      const v = mix(mix(side > 0 ? idleR : idleL, raised, w), swing, act * 0.6);
      if (up === 'R') Rh = v; else L = v;
      open = 0.2 + w * 0.8;
      break;
    }
    case 'claw': {
      const back = [-side * 40 + side * 20, -236], fwd = [ca * 140, -96 + sa * 50];
      const v = mix(mix(side > 0 ? idleR : idleL, back, w), fwd, eOut(pz.strike));
      if (side > 0) Rh = v; else L = v;
      const other = side > 0 ? 'L' : 'R';
      if (other === 'L') L = mix(idleL, [-70, -150], w); else Rh = mix(idleR, [70, -150], w);
      open = 0.5 + w * 0.5;
      break;
    }
    case 'burrow': {
      L = mix(idleL, [14, -158], w); Rh = mix(idleR, [-14, -158], w); open = 0;
      break;
    }
    case 'ring': {
      const sp = Math.sin(t * 9) * 8 * w;
      L = mix(idleL, [-118, -154 + sp], w); Rh = mix(idleR, [118, -154 - sp], w); open = 0.8;
      break;
    }
    case 'summon': {
      L = mix(idleL, [-104, -128], w); Rh = mix(idleR, [104, -128], w); open = 1;
      if (act) { L = mix(L, [-96, -210], act); Rh = mix(Rh, [96, -210], act); }
      break;
    }
  }
  if (e.state === 'phase') { const k = Math.sin(k01(e.st / 2.8) * Math.PI); L = mix(L, [-126, -232], k); Rh = mix(Rh, [126, -232], k); open = 1; }
  if (e.state === 'intro') { const k = ease(k01((e.st - 1.6) / 1.2)); L = mix([10, -150], [-100, -140], k); Rh = mix([-10, -150], [100, -140], k); open = k; }
  if (stag) { L = [-50, -84 + Math.sin(t * 4) * 3]; Rh = [56, -80]; open = 0.1; }
  if (dying) { const k = ease(k01(dying / 0.5)); L = mix(L, [-70, -40], k); Rh = mix(Rh, [74, -36], k); open = 0.6; }
  return { L, R: Rh, open };
}

// The briar mound she sinks into and rises out of (drawn on the main canvas).
function drawMound(ctx, sunk, t) {
  const a = Math.min(1, sunk * 2.2);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = '#0d0a22';
  ctx.beginPath(); ctx.ellipse(0, 0, 120, 34, 0, 0, TAU); ctx.fill();
  for (let i = 0; i < 26; i++) {
    const u = (i / 25) * 2 - 1, x = u * 110;
    const ang = -Math.PI / 2 + u * 0.9 + Math.sin(t * 3 + i) * 0.05;
    const L = (40 + Math.cos(u * 1.4) * 50) * (0.5 + sunk * 0.5);
    thorn(ctx, x, 6 - Math.cos(u * 1.5) * 18, ang, L, 4, i % 2 ? C.violet : C.sea, hexA(C.tealHi, 0.7));
  }
  ctx.restore();
  glow(ctx, 0, -10, 120, C.heart, 0.25 * a);
}

// ---------- arena set pieces, projectiles, overlay (called through index.js) ----------
export function drawZone(ctx, z, G, P) {
  const k = z.kind;
  if (k === 'boss:impact') { drawGlassFall(ctx, z, G); return true; }
  if (k === 'boss:patch') { drawPatch(ctx, z, G); return true; }
  if (k === 'boss:edge') { drawThornEdge(ctx, z, G); return true; }
  return false;
}

function drawGlassFall(ctx, z, G) {
  const k = clamp(z.age / z.fall, 0, 1);
  if (!z.landed) {
    // a falling shard, its shadow growing beneath it
    const hgt = (1 - k) * (1 - k) * 700;
    shadow(ctx, z.r * (0.3 + k * 0.6), z.r * 0.25 * (0.3 + k * 0.6), 0.5 * k, z.x, z.y);
    if (z.item === 'glass') {
      ctx.save(); ctx.translate(z.x, z.y - hgt - 40); ctx.rotate(Math.sin((z.seed || 0) + z.age * 6) * 0.3);
      const gr = ctx.createLinearGradient(0, -40, 0, 40); gr.addColorStop(0, C.tealHi); gr.addColorStop(1, C.violet);
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(0, -42); ctx.lineTo(12, -4); ctx.lineTo(0, 40); ctx.lineTo(-10, 0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
      glow(ctx, z.x, z.y - hgt - 40, 40, C.teal, 0.6);
    }
  } else {
    // shatter: a burst of glints that fade
    const f = 1 - clamp(z.life / 0.7, 0, 1);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + (z.seed || 0), d = 10 + f * (60 + (i % 3) * 20);
      ctx.globalAlpha = 1 - f;
      ctx.fillStyle = i % 2 ? C.tealHi : C.vio2;
      ctx.beginPath(); ctx.moveTo(z.x + Math.cos(a) * d, z.y + Math.sin(a) * d * 0.5 - 10 * (1 - f)); ctx.lineTo(z.x + Math.cos(a + 0.12) * (d + 10), z.y + Math.sin(a + 0.12) * (d + 10) * 0.5); ctx.lineTo(z.x + Math.cos(a - 0.1) * (d + 6), z.y + Math.sin(a - 0.1) * (d + 6) * 0.5); ctx.fill();
    }
    ctx.globalAlpha = 1;
    glow(ctx, z.x, z.y, z.r * 1.4, C.teal, (1 - f) * 0.7);
  }
}

function drawPatch(ctx, z, G) {
  const w = z.hw;
  if (z.age < z.warn) {
    const k = z.age / z.warn;
    ctx.fillStyle = `rgba(255,61,94,${0.1 + k * 0.22})`; ctx.fillRect(z.x - w, z.y - w * 0.62, w * 2, w * 1.24);
    ctx.strokeStyle = `rgba(255,180,190,${0.3 + k * 0.6})`; ctx.lineWidth = 2; ctx.strokeRect(z.x - w, z.y - w * 0.62, w * 2, w * 1.24);
    // briar shoots peeking up
    for (let i = 0; i < 3; i++) thorn(ctx, z.x + (i - 1) * w * 0.5, z.y + 4, -Math.PI / 2 + (i - 1) * 0.3, 8 + k * 14, 2, C.violet, null);
    return;
  }
  const up = z.age - z.warn;
  const rise = clamp(up / 0.08, 0, 1) * clamp((z.warn + z.up + 0.1 - z.age) / 0.2, 0, 1);
  for (let i = 0; i < 4; i++) {
    const x = z.x + ((i % 2) - 0.5) * w, y = z.y + (Math.floor(i / 2) - 0.5) * w * 0.6;
    put(ctx, spikeSprite('thorn', (i + (z.seed | 0)) % 6), x, y + 4, 0, 1, rise);
  }
  if (up < 0.15) glow(ctx, z.x, z.y - 20, w * 1.3, C.teal, (1 - up / 0.15) * 0.6);
}

function drawThornEdge(ctx, z, G) {
  // a wall of thorn spines along the shrinking ellipse
  const A = G.chamber && G.chamber._bossArena || { cx: 0, cy: 0, rx: 900, ry: 560 };
  const n = 90;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const x = A.cx + Math.cos(a) * A.rx * z.s, y = A.cy + Math.sin(a) * A.ry * z.s;
    const s2 = srng(i * 17)();
    // outside the line: dense briar; spikes lean inward
    const inA = Math.atan2(A.cy - y, A.cx - x);
    ctx.fillStyle = 'rgba(8,6,22,0.6)'; ctx.beginPath(); ctx.ellipse(x - Math.cos(inA) * 26, y - Math.sin(inA) * 16, 46, 18, 0, 0, TAU); ctx.fill();
    put(ctx, spikeSprite('thorn', i % 6), x, y, (Math.cos(inA) * 0.35), 0.8 + s2 * 0.5, 0.7 + s2 * 0.6);
  }
  if (z.s > z.target + 0.005) for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + G.t; glow(ctx, A.cx + Math.cos(a) * A.rx * z.s, A.cy + Math.sin(a) * A.ry * z.s, 60, C.heart, 0.3); }
}

export function drawProjectile(ctx, p, G) {
  if (p.kind !== 'boss:thorn') return false;
  const a = Math.atan2(p.vy, p.vx);
  ctx.save(); ctx.translate(p.x, p.y - (p.z || 40));
  ctx.rotate(a);
  shadow(ctx, 10, 4, 0.4, 0, p.z || 40);
  const gr = ctx.createLinearGradient(-16, 0, 18, 0); gr.addColorStop(0, C.violet); gr.addColorStop(1, C.tealHi);
  ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(-10, -6); ctx.lineTo(-16, 0); ctx.lineTo(-10, 6); ctx.closePath(); ctx.fill();
  ctx.restore();
  glow(ctx, p.x, p.y - (p.z || 40), 26, C.teal, 0.55);
  return true;
}
