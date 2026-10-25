// Cantor Morrow, the Drowned Choirmaster. A gaunt drowned priest (~2.8x Iri)
// floating over his own ripples: a sodden cassock fraying into dripping
// tatters, a tarnished gold stole, a battered mitre trailing weed, eyes like
// pale coins, a halo of drifting hymnal pages, and a driftwood staff hung with
// a caged lantern, the only warm light in the drowned nave.
import { TAU, clamp, lerp, hexA, srng, glow, shadow, spr, put, body, density, present, adt, rope, local, ribbon, strand, ease, eOut, k01, damp, poseOf, unravelFx, drawFx, light, ik, limb } from './kit.js';
import { drawWave } from './shared.js';

const C = {
  ink: '#050914', navy: '#0e1a3a', navy2: '#1c2f5e', sea: '#2f5d8f', foam: '#cfefff', water: '#5ec8ff',
  surplice: '#b9c9c6', surplice2: '#7f948f', gold: '#c9a24a', goldHi: '#ffe6a0', skin: '#9fb4b8', skinDark: '#5d7377', lip: '#20141c',
  coin: '#f6f0d2', lantern: '#ffd890', lanternHot: '#fff4d0', wood: '#3a2a20', wood2: '#5b4330', iron: '#22262e', weed: '#2f5a44', page: '#e8e0c8',
};
const W = 520, H = 560, AX = 260, AY = 520;
const S = 1.24; // overall scale: he towers (~3x Iri)

const LAY = {
  cassock: () => spr('morrow.cassock', 200, 200, 100, 172, 2, (g) => {
    // the cassock, shoulders to the knees, falling in heavy wet folds
    const gr = g.createLinearGradient(0, -168, 0, 0);
    gr.addColorStop(0, C.navy2); gr.addColorStop(0.5, C.navy); gr.addColorStop(1, C.ink);
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(-30, -166); g.bezierCurveTo(-44, -140, -50, -90, -64, -22); g.lineTo(64, -22); g.bezierCurveTo(50, -90, 44, -140, 30, -166); g.quadraticCurveTo(0, -174, -30, -166); g.fill();
    const R = srng(7);
    g.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const x = -54 + i * 13.5 + (R() - 0.5) * 4;
      const fg = g.createLinearGradient(x, -150, x, -20);
      fg.addColorStop(0, hexA(C.sea, 0)); fg.addColorStop(0.5, hexA(i % 2 ? C.sea : '#000000', 0.35)); fg.addColorStop(1, hexA(C.sea, 0));
      g.strokeStyle = fg; g.lineWidth = 3 + R() * 3;
      g.beginPath(); g.moveTo(x * 0.6, -150); g.quadraticCurveTo(x * 0.9 + (R() - 0.5) * 8, -90, x * 1.15, -24); g.stroke();
    }
    // barnacles and pale crusts
    for (let i = 0; i < 24; i++) { const x = (R() - 0.5) * 100, y = -160 + R() * 70; g.fillStyle = R() < 0.5 ? '#6f8f9f' : '#9fb8c0'; g.beginPath(); g.arc(x, y, 1 + R() * 2.2, 0, TAU); g.fill(); }
  }),
  surplice: () => spr('morrow.surplice', 160, 110, 80, 172, 2, (g) => {
    // a sodden lace surplice over the shoulders, a jagged hem, greyed by the deep
    const gr = g.createLinearGradient(0, -170, 0, -100);
    gr.addColorStop(0, '#9fb0ad'); gr.addColorStop(1, '#4f6460');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(-30, -168); g.bezierCurveTo(-46, -154, -50, -130, -50, -112);
    const R = srng(9);
    for (let i = 0; i <= 10; i++) { const x = -50 + i * 10; g.lineTo(x, -110 + (i % 2 ? 9 + R() * 8 : -2) + Math.abs(i - 5) * -1.5); }
    g.bezierCurveTo(50, -130, 46, -154, 30, -168); g.quadraticCurveTo(0, -176, -30, -168); g.fill();
    // lace holes and water stains
    g.fillStyle = hexA('#203040', 0.45);
    for (let i = 0; i < 20; i++) { const x = -42 + (i % 10) * 9, y = -116 + Math.floor(i / 10) * 7; g.beginPath(); g.arc(x, y, 1.6, 0, TAU); g.fill(); }
    g.fillStyle = hexA('#3a5a5a', 0.25); g.beginPath(); g.ellipse(-20, -128, 18, 26, 0.3, 0, TAU); g.fill();
    g.strokeStyle = hexA('#ffffff', 0.25); g.lineWidth = 1; g.beginPath(); g.moveTo(-28, -164); g.quadraticCurveTo(-44, -140, -48, -114); g.stroke();
  }),
  stole: () => spr('morrow.stole', 90, 140, 45, 172, 2, (g) => {
    // tarnished gold stole embroidered with notes
    for (const s of [-1, 1]) {
      const gr = g.createLinearGradient(s * 10, -170, s * 18, -40);
      gr.addColorStop(0, C.gold); gr.addColorStop(1, '#6b5320');
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(s * 8, -170); g.lineTo(s * 20, -170); g.lineTo(s * 24, -44); g.lineTo(s * 22, -36); g.lineTo(s * 14, -44); g.lineTo(s * 10, -44); g.closePath(); g.fill();
      g.strokeStyle = hexA(C.goldHi, 0.7); g.lineWidth = 0.8;
      for (let i = 0; i < 6; i++) { const y = -150 + i * 18, x = s * (16 + i * 0.4); g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 3, y); g.lineTo(x, y + 5); g.lineTo(x - 3, y); g.closePath(); g.stroke(); g.beginPath(); g.moveTo(x, y + 6); g.lineTo(x, y + 12); g.stroke(); }
      g.fillStyle = C.gold; for (let i = 0; i < 4; i++) g.fillRect(s * 16 - 1 + (i - 1.5) * 2.4, -40, 1.2, 12);
    }
  }),
  head: () => spr('morrow.head', 80, 160, 40, 286, 3, (g) => {
    // drowned face, gaunt and grey, hollow cheeks, coin eyes are glows added live
    const gr = g.createLinearGradient(-12, -200, 12, -168);
    gr.addColorStop(0, C.skin); gr.addColorStop(1, C.skinDark);
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(0, -204); g.bezierCurveTo(14, -204, 15, -186, 11, -176); g.quadraticCurveTo(6, -164, 0, -162); g.quadraticCurveTo(-6, -164, -11, -176); g.bezierCurveTo(-15, -186, -14, -204, 0, -204); g.fill();
    g.fillStyle = hexA('#203038', 0.5);
    g.beginPath(); g.ellipse(-7, -176, 3.5, 6, 0.2, 0, TAU); g.ellipse(7, -176, 3.5, 6, -0.2, 0, TAU); g.fill();
    // deep sockets
    g.fillStyle = '#0a1018'; g.beginPath(); g.ellipse(-6, -187, 4.6, 4, 0, 0, TAU); g.ellipse(6, -187, 4.6, 4, 0, 0, TAU); g.fill();
    // long nose, thin mouth
    g.strokeStyle = hexA('#2a3a40', 0.8); g.lineWidth = 1; g.beginPath(); g.moveTo(0, -186); g.lineTo(1.5, -176); g.lineTo(-1, -175); g.stroke();
    // lank wet hair framing the face
    g.strokeStyle = '#1a2a2a'; g.lineWidth = 2; g.lineCap = 'round';
    for (const s of [-1, 1]) for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(s * (8 + i), -200); g.bezierCurveTo(s * (15 + i * 1.5), -186, s * (13 + i), -170, s * (11 + i * 2), -150 + i * 4); g.stroke(); }
    // the mitre: tall, peaked and cleft, battered, tilted, gold-banded, trailing weed
    g.save(); g.translate(0, -202); g.rotate(-0.08);
    const mg = g.createLinearGradient(0, -62, 0, 0);
    mg.addColorStop(0, C.navy2); mg.addColorStop(1, C.navy);
    g.fillStyle = mg;
    // back horn, then front horn (the cleft between them)
    g.beginPath(); g.moveTo(-14, 0); g.quadraticCurveTo(-18, -30, -2, -60); g.quadraticCurveTo(10, -40, 15, 0); g.closePath(); g.fill();
    g.fillStyle = '#16264c';
    g.beginPath(); g.moveTo(-16, 2); g.quadraticCurveTo(-14, -26, 4, -50); g.quadraticCurveTo(18, -24, 16, 2); g.closePath(); g.fill();
    g.strokeStyle = C.gold; g.lineWidth = 2.4; g.beginPath(); g.moveTo(-16, -1); g.lineTo(16, -1); g.moveTo(1, -2); g.lineTo(3, -46); g.stroke();
    g.strokeStyle = hexA(C.goldHi, 0.6); g.lineWidth = 1; g.beginPath(); g.moveTo(-14, -6); g.quadraticCurveTo(-12, -28, 3, -48); g.stroke();
    // a gold cross-stitch at the front
    g.strokeStyle = C.gold; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-3, -24); g.lineTo(9, -24); g.stroke();
    g.restore();
    // a notch torn from the brim
    g.fillStyle = C.ink; g.beginPath(); g.moveTo(9, -200); g.lineTo(12, -208); g.lineTo(15, -200); g.fill();
    g.strokeStyle = C.weed; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(-14, -204); g.bezierCurveTo(-22, -196, -16, -182, -24, -168); g.stroke();
    g.beginPath(); g.moveTo(13, -205); g.bezierCurveTo(20, -194, 26, -186, 22, -170); g.stroke();
  }),
  page: (i) => spr('morrow.page' + i, 30, 36, 15, 18, 2, (g) => {
    const R = srng(70 + i);
    g.fillStyle = C.page; g.beginPath(); g.moveTo(-10, -14); g.lineTo(10, -13); g.lineTo(11, 14); g.lineTo(-9, 15); g.closePath(); g.fill();
    g.fillStyle = hexA('#8a7a50', 0.35); g.beginPath(); g.moveTo(-10, -14); g.lineTo(-4, -14); g.lineTo(-9, 15); g.closePath(); g.fill();
    g.strokeStyle = hexA('#2a2a3a', 0.65); g.lineWidth = 0.6;
    for (let k = 0; k < 4; k++) { const y = -9 + k * 6; g.beginPath(); g.moveTo(-7, y); g.lineTo(8, y); g.stroke(); for (let n = 0; n < 3; n++) { g.fillStyle = '#2a2a3a'; g.beginPath(); g.arc(-4 + n * 5 + R() * 2, y - 1 + R() * 2, 1, 0, TAU); g.fill(); } }
  }),
  lantern: () => spr('morrow.lantern', 40, 56, 20, 6, 3, (g) => {
    // an iron cage lantern, hung by its ring (anchor at the ring)
    g.strokeStyle = C.iron; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 4, 0, TAU); g.stroke();
    g.fillStyle = C.iron; g.beginPath(); g.moveTo(-10, 8); g.lineTo(10, 8); g.lineTo(7, 4); g.lineTo(-7, 4); g.closePath(); g.fill();
    g.fillStyle = hexA(C.lantern, 0.85); g.beginPath(); g.moveTo(-9, 9); g.lineTo(9, 9); g.lineTo(11, 30); g.lineTo(6, 40); g.lineTo(-6, 40); g.lineTo(-11, 30); g.closePath(); g.fill();
    g.fillStyle = C.lanternHot; g.beginPath(); g.ellipse(0, 26, 4, 8, 0, 0, TAU); g.fill();
    g.strokeStyle = C.iron; g.lineWidth = 1.8;
    for (const x of [-10, -3.5, 3.5, 10]) { g.beginPath(); g.moveTo(x * 0.9, 8); g.lineTo(x * 1.08, 30); g.lineTo(x * 0.6, 40); g.stroke(); }
    g.beginPath(); g.moveTo(-11, 30); g.lineTo(11, 30); g.stroke();
    g.fillStyle = C.iron; g.beginPath(); g.moveTo(-7, 40); g.lineTo(7, 40); g.lineTo(0, 47); g.closePath(); g.fill();
  }),
};

export default function draw(ctx, e, G, P) {
  if (!e || !G) return;
  const A = e.anim, t = G.t;
  const dt = adt(e, G);
  const pz = poseOf(e);
  const ph = e.phase || 1;
  e.lights = [];
  const aim = e.aim ?? e.facing ?? Math.PI / 2;
  const side = Math.cos(aim) >= 0 ? 1 : -1;

  let sunk = e.sunk || 0;
  if (e.state === 'intro') sunk = 1 - ease(k01(e.st / 2.2));
  const dying = e.state === 'dying' ? k01(e.st / 3.0) : 0;
  if (dying) sunk = Math.max(sunk, ease(k01((dying - 0.35) / 0.65)) * 0.8);
  const phaseK = e.state === 'phase' ? k01(e.st / 2.8) : 0;
  const stag = e.state === 'stagger';

  // hover: he never quite touches the water
  let hover = 26 + Math.sin(t * 1.3) * 6;
  if (pz.m === 'requiem' || pz.m === 'choir') hover += pz.wind * (pz.m === 'requiem' ? 60 : 24);
  if (phaseK) hover += Math.sin(phaseK * Math.PI) * 50;
  if (stag) hover = 12 + Math.sin(t * 2) * 2;
  const singing = (pz.m === 'ring' || pz.m === 'choir' || pz.m === 'requiem' || pz.m === 'summon') ? Math.max(pz.wind, pz.act) : phaseK ? Math.sin(phaseK * Math.PI) : 0;

  // ---------- the water under him: shadow and ripples ----------
  const live = 1 - k01((dying - 0.6) / 0.4);
  shadow(ctx, 90, 26, 0.45 * (1 - sunk * 0.5));
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    const k = ((t * 0.5 + i / 4) % 1);
    ctx.strokeStyle = hexA(C.foam, (1 - k) * 0.35 * live);
    ctx.beginPath(); ctx.ellipse(0, 0, 40 + k * 120, (40 + k * 120) * 0.36, 0, 0, TAU); ctx.stroke();
  }
  // drips falling from the hem into the water
  if (!A.drips) A.drips = [];
  A.dripT = (A.dripT || 0) - dt;
  if (A.dripT <= 0 && sunk < 0.9) { A.dripT = 0.12; const R = Math.random; A.drips.push({ x: (R() - 0.5) * 120, y: -hover - 10, vy: 0, life: 1 }); }
  for (let i = A.drips.length - 1; i >= 0; i--) {
    const d = A.drips[i]; d.vy += 600 * dt; d.y += d.vy * dt;
    if (d.y >= 0) { A.drips.splice(i, 1); A.splash = A.splash || []; A.splash.push({ x: d.x, t: 0 }); continue; }
    ctx.fillStyle = hexA(C.foam, 0.6); ctx.fillRect(d.x - 1, d.y - 4, 2, 6);
  }
  if (A.splash) for (let i = A.splash.length - 1; i >= 0; i--) { const s = A.splash[i]; s.t += dt; if (s.t > 0.5) { A.splash.splice(i, 1); continue; } ctx.strokeStyle = hexA(C.foam, (1 - s.t / 0.5) * 0.6); ctx.beginPath(); ctx.ellipse(s.x, 0, 4 + s.t * 30, (4 + s.t * 30) * 0.35, 0, 0, TAU); ctx.stroke(); }

  const k = density(ctx, 2);
  const B = body(e, 'morrow', W, H, AX, AY, k);
  const g = B.g;
  const down = sunk * 320;
  g.save();
  g.scale(S, S);
  g.translate(0, -hover + down);
  const sway = Math.sin(t * 0.8) * 0.03 + damp(e, 'vxs', clamp((e.vx || 0) / 260, -1, 1), 3, dt) * -0.08;
  g.transform(1, 0, sway, 1, 0, 0);
  if (sunk > 0) { g.beginPath(); g.rect(-W, -H, W * 2, H + hover - down - 2 / S); g.clip(); }

  // hymnal pages orbit: back half first
  const pages = 7 + (ph - 1) * 3;
  const pSpeed = 0.5 + (pz.m === 'requiem' ? 1.4 * pz.wind : 0) + phaseK * 2;
  A.pageA = (A.pageA || 0) + dt * pSpeed;
  const pagePos = [];
  for (let i = 0; i < pages; i++) {
    const a = A.pageA + (i / pages) * TAU;
    const rr = 74 + Math.sin(t * 1.3 + i) * 6 + phaseK * 40 + (pz.m === 'requiem' ? pz.wind * 30 : 0);
    pagePos.push({ i, x: Math.cos(a) * rr, y: -200 + Math.sin(a) * rr * 0.32 + Math.sin(t * 2 + i) * 5, back: Math.sin(a) < 0, rot: Math.sin(t * 1.7 + i * 2) * 0.5, s: 0.8 + 0.25 * Math.sin(a) });
  }
  for (const p of pagePos) if (p.back) put(g, LAY.page(p.i % 4), p.x, p.y, p.rot, p.s * 0.75, p.s * 0.75, 0.5);

  // tatters below the cassock: ropes that drag behind as he drifts
  const R = srng(e.id + 3);
  if (!A.tat) A.tat = Array.from({ length: 8 }, (_, i) => ({ x: -56 + i * 16, n: 3 + ((i * 5) % 4), w: 8 + ((i * 7) % 3) * 2 }));
  for (const th of A.tat) {
    const pts = rope(e, 'tat' + th.x, th.n, 10, e.x + th.x * S, e.y - (e.z || 0) + (-hover - 26 + down) * S, { grav: 160, damp: 0.9, wind: (i, tt) => [Math.sin(tt * 1.6 + th.x * 0.1 + i) * 60, 0] }, dt, t);
    const L = local(e, pts).map(([x, y]) => [x / S, y / S + hover - down]);
    ribbon(g, L, th.w, th.w * 0.35, (i) => 1 + Math.sin(i * 2.3 + th.x) * 0.25);
    const tg = g.createLinearGradient(0, L[0][1], 0, L[L.length - 1][1] + 6);
    tg.addColorStop(0, C.navy); tg.addColorStop(1, hexA(C.navy, 0.15));
    g.fillStyle = tg; g.fill();
  }
  // staff (behind the body on the far side when idle)
  const staffSide = -1; // he holds the staff in his right hand (screen left)
  const hold = staffPose(e, pz, aim, side, t, phaseK, stag);
  const drawStaff = () => {
    const { hx, hy, ang, len } = hold;
    const tx = hx + Math.cos(ang) * len * 0.72, ty = hy + Math.sin(ang) * len * 0.72;
    const bx = hx - Math.cos(ang) * len * 0.28, by = hy - Math.sin(ang) * len * 0.28;
    const sg = g.createLinearGradient(bx, by, tx, ty); sg.addColorStop(0, C.wood); sg.addColorStop(1, C.wood2);
    g.strokeStyle = sg; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo((bx + tx) / 2 + 4, (by + ty) / 2, tx, ty); g.stroke();
    g.strokeStyle = hexA('#c8a080', 0.35); g.lineWidth = 1.5; g.stroke();
    // the crook
    const ca = ang + 0.9;
    const cx = tx + Math.cos(ang) * 14 + Math.cos(ca) * 10, cy = ty + Math.sin(ang) * 14 + Math.sin(ca) * 10;
    g.strokeStyle = C.wood2; g.lineWidth = 5;
    g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo(tx + Math.cos(ang) * 22, ty + Math.sin(ang) * 22, cx + Math.cos(ca) * 12, cy + Math.sin(ca) * 12); g.stroke();
    // weed trailing from the crook
    g.strokeStyle = C.weed; g.lineWidth = 1.6; g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo(tx - 10, ty + 20, tx - 4 + Math.sin(t * 2) * 4, ty + 40); g.stroke();
    // the lantern on its chain
    const lx = cx + Math.cos(ca) * 12, ly = cy + Math.sin(ca) * 12;
    const swing = damp(e, 'lsw', (e.vx || 0) * -0.002 + Math.sin(t * 1.8) * 0.12, 3, dt);
    g.strokeStyle = C.iron; g.lineWidth = 1.2; g.beginPath(); g.moveTo(lx, ly); g.lineTo(lx + Math.sin(swing) * 10, ly + 10); g.stroke();
    put(g, LAY.lantern(), lx + Math.sin(swing) * 10, ly + 10, swing, 1.1, 1.1);
    hold.lantern = [lx + Math.sin(swing) * 10 - Math.sin(swing) * 26, ly + 10 + 28];
  };
  if (hold.behind) drawStaff();

  // the cassock, surplice and stole, breathing
  const br = Math.sin(t * 1.5) * 0.5 + 0.5;
  put(g, LAY.cassock(), 0, 0, 0, 1 + br * 0.01, 1 + br * 0.008);
  put(g, LAY.stole(), 0, 0, Math.sin(t * 1.1) * 0.01);
  put(g, LAY.surplice(), 0, 0, 0, 1 + br * 0.015, 1 + br * 0.01);

  // arms: the staff arm and the conducting arm
  const shR = [-30, -160], shL = [30, -160];
  const cond = conductHand(e, pz, aim, side, t, phaseK, stag);
  const staffArm = ik(shR[0], shR[1], hold.hx, hold.hy, 46, 46, -1);
  const condArm = ik(shL[0], shL[1], cond[0], cond[1], 46, 46, 1);
  const arm = (s, a, hand) => {
    const [ex, ey, hx, hy] = a;
    g.fillStyle = C.navy2; limb(g, s[0], s[1], ex, ey, 9, 7); g.fill();
    // wide dripping sleeve
    g.fillStyle = C.navy; g.beginPath(); g.moveTo(ex - 6, ey); g.lineTo(lerp(ex, hx, 0.75) + 10, lerp(ey, hy, 0.75)); g.lineTo(lerp(ex, hx, 0.7) - 8, lerp(ey, hy, 0.7) + 30 + Math.sin(t * 2 + ex) * 3); g.closePath(); g.fill();
    g.fillStyle = C.navy2; limb(g, ex, ey, hx, hy, 7, 4); g.fill();
    g.strokeStyle = hexA(C.sea, 0.8); g.lineWidth = 1; g.beginPath(); g.moveTo(s[0], s[1] - 7); g.lineTo(ex, ey - 6); g.lineTo(hx, hy - 3); g.stroke();
    // long grey fingers
    const ha = Math.atan2(hy - ey, hx - ex);
    g.strokeStyle = C.skin; g.lineWidth = 2; g.lineCap = 'round';
    for (let i = 0; i < 4; i++) { const fa = ha + (i - 1.5) * (hand ? 0.35 : 0.18); g.beginPath(); g.moveTo(hx, hy); g.quadraticCurveTo(hx + Math.cos(fa) * 9, hy + Math.sin(fa) * 9, hx + Math.cos(fa + (hand ? 0.2 : 0.6)) * 16, hy + Math.sin(fa + (hand ? 0.2 : 0.6)) * 16); g.stroke(); }
    g.fillStyle = C.skinDark; g.beginPath(); g.arc(hx, hy, 4.5, 0, TAU); g.fill();
  };
  arm(shR, staffArm, false);
  // the head, tipping back to sing
  const tilt = singing * -0.12 + (stag ? 0.25 : 0) + dying * 0.4;
  g.save(); g.translate(0, -164); g.rotate(tilt + Math.sin(t * 0.9) * 0.03); g.translate(0, 164);
  g.translate(0, -170); g.scale(1.25, 1.25); g.translate(0, 170);
  put(g, LAY.head(), 0, 0);
  // the mouth opens to sing
  const mo = 1.5 + singing * 5;
  g.fillStyle = C.lip; g.beginPath(); g.ellipse(0, -169.5, 3 + singing * 1.5, mo * 0.6, 0, 0, TAU); g.fill();
  g.restore();
  arm(shL, condArm, true);
  if (!hold.behind) drawStaff();
  // front pages
  for (const p of pagePos) if (!p.back) put(g, LAY.page(p.i % 4), p.x, p.y, p.rot, p.s * 0.8, p.s * 0.8, 0.85);
  g.restore();

  const flash = Math.max((e.flash || 0) / 0.1 * 0.85, stag ? 0.1 + Math.max(0, Math.sin(t * 12)) * 0.1 : 0);
  present(ctx, e, G, B, {
    flash, white: stag ? '#cfefff' : '#ffffff',
    tint: phaseK ? ['#8fd6ff', Math.sin(phaseK * Math.PI) * 0.3] : dying ? ['#050914', dying * 0.45] : null,
    unravel: dying > 0.4 ? (dying - 0.4) / 0.6 : 0,
    rim: '#bfe8ff',
  });

  // ---------- glows (in the body's scaled space) ----------
  ctx.save(); ctx.scale(S, S);
  const lightS = (x, y, r, c, i) => light(e, x * S, y * S, r, c, i);
  const oy = -hover + down;
  const sx = (y) => sway * y; // skew offset at height y
  const headY = -191 + oy;
  if (sunk < 0.95) {
    // coin eyes: pale, flat, unblinking; they flare when he sings
    const ca = (stag ? 0.35 + Math.random() * 0.3 : 1) * live;
    const tiltOff = Math.sin(tilt) * 10;
    for (const ex of [-7.5, 7.5]) {
      const x = ex + sx(-191) + tiltOff * 0.2, y = headY;
      glow(ctx, x, y, 14 + singing * 10, C.coin, 0.7 * ca);
      ctx.fillStyle = hexA(C.coin, ca); ctx.beginPath(); ctx.arc(x, y, 3.2, 0, TAU); ctx.fill();
      ctx.strokeStyle = hexA('#9a8a50', ca * 0.8); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(x, y, 2.2, 0, TAU); ctx.stroke();
    }
    if (singing > 0.05) { glow(ctx, sx(-169), -169 + oy, 30 + singing * 30, C.water, singing * 0.7); }
    // the lantern
    if (hold.lantern) {
      const [lx, ly] = hold.lantern;
      const lA = (pz.m === 'sweep' ? 0.9 + pz.wind * 0.6 : 0.75) * (dying ? 1 - k01((dying - 0.75) / 0.25) : 1);
      const flick = 0.9 + Math.sin(t * 13) * 0.05 + Math.sin(t * 7.3) * 0.05;
      glow(ctx, lx + sx(ly), ly + oy, 70 * flick, C.lantern, 0.55 * lA);
      glow(ctx, lx + sx(ly), ly + oy, 22, C.lanternHot, 0.9 * lA);
      lightS(lx + sx(ly), ly + oy, 300 * flick, C.lantern, 0.85 * lA);
    }
    // hand glow while conducting a spell
    if (pz.wind > 0.05 && pz.m !== 'sweep') glow(ctx, cond[0] + sx(cond[1]), cond[1] + oy, 28 + pz.wind * 22, C.water, pz.wind * 0.6);
    if (phaseK) glow(ctx, 0, -180 + oy, 160, C.water, Math.sin(phaseK * Math.PI) * 0.5);
  }
  drawFx(ctx, e);
  if (dying) unravelFx(e, G, { rate: dying < 0.85 ? 80 : 0, w: 140, h: 220, color: '#06070f', color2: C.water, mix: 0.3, vx: 0 }, dt);
  else if (A.fx && A.fx.length) unravelFx(e, G, { rate: 0 }, dt);
  if (live > 0.05) lightS(0, -180 + oy, 200, '#7fb0ff', 0.35 * live + singing * 0.3);
  ctx.restore();
  e.light = e.lights[0] || null;
}

function staffPose(e, pz, aim, side, t, phaseK, stag) {
  // returns the staff hand position, angle and length
  let hx = -56, hy = -84, ang = -Math.PI / 2 - 0.06 + Math.sin(t * 0.9) * 0.02, len = 260, behind = false;
  const ca = Math.cos(aim), sa = Math.sin(aim);
  const w = pz.wind, act = pz.act;
  if (pz.m === 'sweep') {
    // the lantern is thrust out over the water toward Iri
    const fa = Math.atan2(sa * 0.5 - 0.9, ca);
    hx = lerp(hx, ca * 60, w); hy = lerp(hy, -120, w); ang = lerp(ang, fa, w);
  } else if (pz.m === 'flood') {
    hx = lerp(hx, -20, w); hy = lerp(hy, -230, w); ang = -Math.PI / 2 - 0.3 * (1 - act);
    if (act) { hy = lerp(hy, -120, act); ang = -Math.PI / 2; }
  } else if (pz.m === 'summon' || pz.m === 'choir' || pz.m === 'requiem') {
    hx = lerp(hx, -66, w); hy = lerp(hy, -190, w); ang = lerp(ang, -Math.PI / 2 - 0.12, w);
  } else if (pz.m === 'sink') {
    hy = lerp(hy, -130, w); ang = lerp(ang, -Math.PI / 2 + 0.2, w);
  }
  if (phaseK) { const k = Math.sin(phaseK * Math.PI); hx = lerp(hx, -70, k); hy = lerp(hy, -200, k); ang = lerp(ang, -Math.PI / 2 - 0.14, k); }
  if (stag) { hx = -60; hy = -84; ang = -Math.PI / 2 - 0.5 + Math.sin(t * 3) * 0.05; }
  if (e.state === 'dying') { const k = ease(k01(e.st / 1.2)); ang = lerp(ang, -Math.PI / 2 - 1.1, k); hy = lerp(hy, -60, k); }
  return { hx, hy, ang, len, behind };
}
function conductHand(e, pz, aim, side, t, phaseK, stag) {
  let p = [56 + Math.sin(t * 1.4) * 4, -98 + Math.sin(t * 1.9) * 4];
  const w = pz.wind, act = pz.act;
  const ca = Math.cos(aim), sa = Math.sin(aim);
  const mix = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
  switch (pz.m) {
    case 'ring': p = mix(mix(p, [40, -262], w), [70, -110], eOut(pz.strike)); break;
    case 'notes': p = mix(p, [56 + Math.sin(t * 14) * 18, -190 + Math.cos(t * 14) * 18], Math.max(w, act)); break;
    case 'summon': case 'choir': p = mix(p, [96, -224], w); break;
    case 'requiem': p = mix(p, [92, -250 + Math.sin(t * 6) * 10], w); break;
    case 'sweep': p = mix(p, [70, -150], w); break;
    case 'flood': p = mix(p, [20, -236], w); if (act) p = mix(p, [30, -130], act); break;
    case 'sink': p = mix(p, [20, -150], w); break;
  }
  if (e.state === 'phase') p = mix(p, [96, -240], Math.sin(k01(e.st / 2.8) * Math.PI));
  if (e.state === 'intro') p = mix([30, -110], [86, -210], ease(k01((e.st - 1.6) / 1.2)));
  if (stag) p = [40, -90 + Math.sin(t * 3) * 3];
  return p;
}

// ---------- set pieces ----------
export function drawZone(ctx, z, G) {
  if (z.kind === 'boss:flood') { drawFlood(ctx, z, G); return true; }
  if (z.kind === 'boss:beam') { drawBeam(ctx, z, G); return true; }
  return false;
}
function drawFlood(ctx, z, G) {
  const warn = z.age < z.warn;
  const k = warn ? z.age / z.warn : 1;
  const out = clamp(z.life / 0.5, 0, 1);
  const x0 = z.x0, y0 = z.y0, w = z.x1 - z.x0, h = z.y1 - z.y0;
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
  // the water rises: a dark sheen during the warning, then deep water
  ctx.fillStyle = hexA('#0b2a5a', (warn ? 0.18 + k * 0.25 : 0.55) * out); ctx.fillRect(x0, y0, w, h);
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = hexA(C.water, (warn ? 0.15 + k * 0.3 : 0.35) * out); ctx.lineWidth = 2;
  const t = G.t;
  for (let yy = y0 + 20; yy < y0 + h; yy += 46) {
    ctx.beginPath();
    for (let xx = x0; xx <= x0 + w; xx += 24) { const y = yy + Math.sin(xx * 0.02 + t * 2 + yy) * 5; xx === x0 ? ctx.moveTo(xx, y) : ctx.lineTo(xx, y); }
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
  // the rim of the flood glows red while it is still a warning
  ctx.strokeStyle = warn ? `rgba(255,90,110,${0.35 + k * 0.6})` : hexA(C.foam, 0.5 * out);
  ctx.lineWidth = warn ? 3 : 2; ctx.setLineDash(warn ? [18, 10] : []); ctx.strokeRect(x0 + 2, y0 + 2, w - 4, h - 4); ctx.setLineDash([]);
}
function drawBeam(ctx, z, G) {
  if (!z.on) return;
  const ca = Math.cos(z.ang), sa = Math.sin(z.ang);
  const nx = -sa, ny = ca;
  const x0 = z.x + ca * 40, y0 = z.y + sa * 40, x1 = z.x + ca * z.len, y1 = z.y + sa * z.len;
  ctx.globalCompositeOperation = 'lighter';
  const gr = ctx.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, hexA(C.lanternHot, 0.85)); gr.addColorStop(0.6, hexA(C.lantern, 0.4)); gr.addColorStop(1, hexA(C.lantern, 0));
  ctx.fillStyle = gr;
  ctx.beginPath(); ctx.moveTo(x0 + nx * 10, y0 + ny * 10); ctx.lineTo(x1 + nx * z.w * 0.8, y1 + ny * z.w * 0.8); ctx.lineTo(x1 - nx * z.w * 0.8, y1 - ny * z.w * 0.8); ctx.lineTo(x0 - nx * 10, y0 - ny * 10); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = hexA('#ffffff', 0.7); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(lerp(x0, x1, 0.8), lerp(y0, y1, 0.8)); ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 1; i <= 4; i++) glow(ctx, lerp(x0, x1, i / 5), lerp(y0, y1, i / 5), 50, C.lantern, 0.35);
}

export function drawProjectile(ctx, p, G) {
  if (p.kind !== 'boss:note') return false;
  const z = p.z ?? 90, x = p.x, y = p.y - z + Math.sin(G.t * 6 + (p.seed || 0)) * 4;
  shadow(ctx, 10, 4, 0.35, p.x, p.y);
  glow(ctx, x, y, 34, C.water, 0.7);
  ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(G.t * 3 + (p.seed || 0)) * 0.3);
  ctx.fillStyle = C.coin; ctx.beginPath(); ctx.ellipse(-3, 5, 6, 4.5, -0.4, 0, TAU); ctx.fill();
  ctx.strokeStyle = C.coin; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(2.5, 4); ctx.lineTo(2.5, -12); ctx.quadraticCurveTo(8, -8, 10, -4); ctx.stroke();
  ctx.restore();
  glow(ctx, x, y, 12, '#ffffff', 0.6);
  return true;
}

// The drowned choir at the edges of the nave (phase 2+): ghostly singers who
// light up as they sing their ring.
export function drawOverlay(ctx, G, P, b) {
  if (!b || !b.choir || !b.choir.length || b.dying) return;
  const t = G.t;
  const appear = b.phase >= 2 ? (b.state === 'phase' ? k01((b.st - 0.8) / 1.5) : 1) : 0;
  if (appear <= 0) return;
  for (const p of b.choir) {
    const sing = b.singing && b.singing.includes(p.i) ? 1 : 0;
    const bob = Math.sin(t * 1.2 + p.i) * 6;
    ctx.save(); ctx.translate(p.x, p.y - 30 + bob);
    ctx.globalAlpha = appear * (0.45 + sing * 0.4);
    const gr = ctx.createLinearGradient(0, -120, 0, 20); gr.addColorStop(0, hexA('#cfe8ff', 0.9)); gr.addColorStop(1, hexA('#3f6fd8', 0));
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.moveTo(-10, -96); ctx.bezierCurveTo(-30, -70, -34, -20, -26, 20); ctx.lineTo(26, 20); ctx.bezierCurveTo(34, -20, 30, -70, 10, -96); ctx.closePath(); ctx.fill();
    ctx.fillStyle = hexA('#e8f4ff', 0.9); ctx.beginPath(); ctx.arc(0, -104, 11, 0, TAU); ctx.fill();
    ctx.fillStyle = '#0a1830'; ctx.beginPath(); ctx.ellipse(0, -100, 3, 3 + sing * 3, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = hexA(C.lantern, 0.8); ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, -122, 14, 4, 0, 0, TAU); ctx.stroke();
    ctx.restore();
    glow(ctx, p.x, p.y - 130 + bob, 50 + sing * 60, '#9fd0ff', appear * (0.35 + sing * 0.5));
  }
}
