// Aurum, the Gilded Colossus. A giant (~4x Iri) in molten-gold plate, a
// smith to the bone: a scorched leather apron, a broken shackle on his belt,
// a furnace built into his back that breathes embers, a forge grate for a
// heart, a great helm whose visor glows like a forge mouth and whose beard is
// poured gold, and an anvil-headed hammer. Seams of molten metal glow brighter
// as the forge heats (phase 2+); the whole figure cools to dull bronze as he dies.
import { TAU, clamp, lerp, hexA, srng, glow, shadow, spr, put, body, density, present, adt, ease, eOut, eIn, k01, damp, poseOf, unravelFx, drawFx, light, ik, limb, poly } from './kit.js';

const C = {
  gold: '#c8923a', goldHi: '#ffe2a0', goldMid: '#8f5f1f', goldDark: '#43260b', bronze: '#2a1a0c', ink: '#100805',
  molten: '#ff7a1c', moltenHi: '#fff1b0', ember: '#ffb347', leather: '#2c1a10', leather2: '#4e301c', iron: '#221d1b', iron2: '#3e3632',
};
const W = 720, H = 780, AX = 360, AY = 700;

// A plate: banded gold (lit top, deep shadow below), a bevel highlight along
// its upper edges and a dark inner edge along its lower ones, soot dripping.
function plate(g, pts, light0 = C.goldHi, mid = C.gold, dark = C.goldDark, o = {}) {
  let minY = 1e9, maxY = -1e9; for (let i = 1; i < pts.length; i += 2) { minY = Math.min(minY, pts[i]); maxY = Math.max(maxY, pts[i]); }
  const gr = g.createLinearGradient(0, minY, 0, maxY);
  gr.addColorStop(0, light0); gr.addColorStop(0.16, mid); gr.addColorStop(0.5, C.goldMid); gr.addColorStop(1, dark);
  g.save();
  g.fillStyle = gr; poly(g, pts); g.fill();
  g.clip();
  // bevels
  g.lineJoin = 'round';
  g.translate(0, 3); g.strokeStyle = hexA(light0, 0.75); g.lineWidth = 3; poly(g, pts); g.stroke();
  g.translate(0, -7); g.strokeStyle = hexA(C.ink, 0.55); g.lineWidth = 6; poly(g, pts); g.stroke();
  g.translate(0, 4);
  // a broad specular streak
  if (o.spec !== false) {
    const sx = o.specX ?? -0.3;
    let minX = 1e9, maxX = -1e9; for (let i = 0; i < pts.length; i += 2) { minX = Math.min(minX, pts[i]); maxX = Math.max(maxX, pts[i]); }
    const cx = lerp(minX, maxX, 0.5 + sx * 0.5);
    const sg = g.createLinearGradient(cx - 14, 0, cx + 14, 0);
    sg.addColorStop(0, 'rgba(255,240,200,0)'); sg.addColorStop(0.5, 'rgba(255,240,200,0.22)'); sg.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = sg; g.fillRect(cx - 14, minY, 28, (maxY - minY) * 0.7);
  }
  // soot running down from the seams
  if (o.soot) {
    const R = srng(o.soot);
    for (let i = 0; i < 4; i++) {
      const x = lerp(-60, 60, R()), y = minY + R() * (maxY - minY) * 0.5, L = 20 + R() * 50;
      const sg = g.createLinearGradient(0, y, 0, y + L); sg.addColorStop(0, 'rgba(10,5,2,0.16)'); sg.addColorStop(1, 'rgba(10,5,2,0)');
      g.fillStyle = sg; g.fillRect(x - 2 - R() * 3, y, 4 + R() * 5, L);
    }
  }
  g.restore();
  g.strokeStyle = C.ink; g.lineWidth = 2.4; g.lineJoin = 'round'; poly(g, pts); g.stroke();
}
function seam(g, pts, w = 2) {
  g.strokeStyle = C.molten; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.stroke();
  g.strokeStyle = C.moltenHi; g.lineWidth = w * 0.4; g.stroke();
}
function rivets(g, list, r = 2.8) { for (const [x, y] of list) { g.fillStyle = C.goldDark; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.fillStyle = C.goldHi; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.4, 0, TAU); g.fill(); } }

// Static layers come in pairs: the painted part and its molten seams alone
// (drawn again additively, brighter as the forge heats).
const LAY = {
  torso: (seams) => spr('aurum.torso.' + seams, 260, 200, 130, 266, 2, (g) => {
    if (!seams) {
      // hunched barrel chest: broad at the shoulders, narrowing to the waist
      plate(g, [-96, -246, -40, -262, 40, -262, 96, -246, 92, -200, 70, -150, -70, -150, -92, -200], C.goldHi, C.gold, C.goldDark, { soot: 5, specX: -0.4 });
      plate(g, [-66, -150, 66, -150, 58, -114, -58, -114], C.gold, C.goldMid, C.goldDark, { soot: 6 });
      plate(g, [-56, -114, 56, -114, 50, -86, -50, -86], C.goldMid, C.goldMid, C.bronze, { spec: false });
      // the forge heart: a round grate in the breastplate
      g.fillStyle = C.ink; g.beginPath(); g.arc(0, -206, 26, 0, TAU); g.fill();
      g.strokeStyle = C.goldDark; g.lineWidth = 7; g.beginPath(); g.arc(0, -206, 28, 0, TAU); g.stroke();
      g.strokeStyle = C.gold; g.lineWidth = 2; g.beginPath(); g.arc(0, -206, 31, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
      g.strokeStyle = C.goldMid; g.lineWidth = 4;
      for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * 9, -230); g.lineTo(i * 9, -182); g.stroke(); }
      // the anvil sigil hammered into the belly plate
      g.fillStyle = hexA(C.goldDark, 0.9); poly(g, [-20, -142, 20, -142, 14, -136, 7, -136, 10, -122, -10, -122, -7, -136, -14, -136]); g.fill();
      rivets(g, [[-84, -240], [84, -240], [-86, -204], [86, -204], [-62, -158], [62, -158], [-52, -120], [52, -120], [-30, -254], [30, -254]]);
      // hammer dents
      const R = srng(5);
      for (let i = 0; i < 10; i++) { const x = (R() - 0.5) * 150, y = -250 + R() * 150; g.fillStyle = hexA('#000000', 0.18); g.beginPath(); g.ellipse(x, y, 3 + R() * 6, 2 + R() * 4, R() * 3, 0, TAU); g.fill(); g.fillStyle = hexA(C.goldHi, 0.25); g.beginPath(); g.ellipse(x - 1, y + 2, 3, 1.2, 0, 0, TAU); g.fill(); }
      // the gorget: a high collar the helm sinks into
      plate(g, [-50, -262, -36, -282, 36, -282, 50, -262, 30, -252, -30, -252], C.gold, C.goldMid, C.goldDark, { spec: false });
    } else {
      seam(g, [-70, -150, -30, -156, 0, -150, 34, -158, 70, -150], 2.8);
      seam(g, [-62, -244, -70, -214, -58, -186, -66, -160], 2.2);
      seam(g, [66, -246, 60, -220, 72, -196, 64, -164], 2.2);
      seam(g, [-56, -114, 56, -114], 2.2);
      seam(g, [8, -150, 2, -130, 10, -114], 1.6);
      // the heart glows through its grate
      const gr = g.createRadialGradient(0, -206, 2, 0, -206, 26);
      gr.addColorStop(0, C.moltenHi); gr.addColorStop(0.5, C.molten); gr.addColorStop(1, 'rgba(255,90,20,0.2)');
      g.fillStyle = gr;
      for (let i = -2; i < 2; i++) { g.beginPath(); g.rect(i * 9 + 2, -228, 5, 44); g.fill(); }
    }
  }),
  apron: () => spr('aurum.apron', 170, 124, 85, 118, 2, (g) => {
    // a scorched smith's apron over the plate
    const gr = g.createLinearGradient(0, -112, 0, -4);
    gr.addColorStop(0, C.leather2); gr.addColorStop(1, C.leather);
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(-52, -110); g.lineTo(52, -110); g.quadraticCurveTo(62, -60, 58, -8); g.lineTo(34, -2); g.lineTo(20, -14); g.lineTo(2, -2); g.lineTo(-20, -14); g.lineTo(-38, -2); g.lineTo(-58, -8); g.quadraticCurveTo(-62, -60, -52, -110); g.closePath(); g.fill();
    g.strokeStyle = C.ink; g.lineWidth = 2.2; g.stroke();
    // folds
    g.strokeStyle = hexA('#000', 0.35); g.lineWidth = 5;
    for (const x of [-26, 4, 30]) { g.beginPath(); g.moveTo(x, -100); g.quadraticCurveTo(x + 4, -50, x - 2, -10); g.stroke(); }
    // scorch marks, burn holes glowing at the edges
    const R = srng(8);
    for (let i = 0; i < 6; i++) { const x = (R() - 0.5) * 80, y = -90 + R() * 70; g.fillStyle = hexA('#120804', 0.6); g.beginPath(); g.ellipse(x, y, 6 + R() * 8, 4 + R() * 5, R(), 0, TAU); g.fill(); }
    for (let i = 0; i < 3; i++) { const x = (R() - 0.5) * 70, y = -70 + R() * 50; g.fillStyle = '#080402'; g.beginPath(); g.arc(x, y, 3 + R() * 3, 0, TAU); g.fill(); g.strokeStyle = hexA(C.molten, 0.8); g.lineWidth = 1; g.stroke(); }
    g.strokeStyle = hexA('#d0a070', 0.3); g.lineWidth = 1; g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(-48, -104); g.quadraticCurveTo(-56, -60, -52, -12); g.moveTo(48, -104); g.quadraticCurveTo(56, -60, 52, -12); g.stroke(); g.setLineDash([]);
    // belt with a broken shackle
    g.fillStyle = C.iron; g.fillRect(-68, -120, 136, 14);
    g.fillStyle = C.iron2; g.fillRect(-68, -120, 136, 3);
    g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(-68, -120, 136, 14);
    g.fillStyle = C.gold; g.fillRect(-13, -123, 26, 19); g.fillStyle = C.goldDark; g.fillRect(-7, -118, 14, 9); g.strokeRect(-13, -123, 26, 19);
    g.strokeStyle = C.iron2; g.lineWidth = 4.5;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(38 + i * 3, -100 + i * 11, 4, 6, 0.3, 0, TAU); g.stroke(); }
    g.beginPath(); g.arc(46, -50, 10, -0.6, Math.PI * 1.3); g.stroke();
  }),
  pauldron: (seams) => spr('aurum.pauldron.' + seams, 140, 110, 70, 76, 2, (g) => {
    if (!seams) {
      // a great domed pauldron: two lames hanging below a high shell
      for (let i = 2; i >= 1; i--) {
        const y = -26 + i * 15, w = 54 - i * 4;
        const pts = [];
        for (let j = 0; j <= 14; j++) { const a = Math.PI + (j / 14) * Math.PI; pts.push(Math.cos(a) * w, y + Math.sin(a) * 14 + 10 * Math.sin((j / 14) * Math.PI)); }
        for (let j = 14; j >= 0; j--) { const a = Math.PI + (j / 14) * Math.PI; pts.push(Math.cos(a) * w * 0.98, y + 14 + 12 * Math.sin((j / 14) * Math.PI)); }
        plate(g, pts, C.gold, C.goldMid, C.goldDark, { spec: false });
      }
      const shell = [];
      for (let j = 0; j <= 20; j++) { const a = Math.PI + (j / 20) * Math.PI; shell.push(Math.cos(a) * 62, -22 + Math.sin(a) * 50); }
      for (let j = 20; j >= 0; j--) { const a = Math.PI + (j / 20) * Math.PI; shell.push(Math.cos(a) * 62, -22 + 12 * Math.sin((j / 20) * Math.PI)); }
      plate(g, shell, C.goldHi, C.gold, C.goldDark, { specX: -0.35 });
      // a raised ridge over the dome and a flange spike
      g.strokeStyle = C.goldHi; g.lineWidth = 3; g.beginPath(); g.ellipse(0, -22, 40, 34, 0, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
      g.strokeStyle = C.ink; g.lineWidth = 1.6; g.beginPath(); g.ellipse(0, -22, 43, 37, 0, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
      rivets(g, [[-48, -32], [-22, -60], [22, -60], [48, -32]], 3.2);
      g.fillStyle = C.goldHi; poly(g, [18, -66, 40, -96, 34, -58]); g.fill(); g.strokeStyle = C.ink; g.lineWidth = 2; g.stroke();
      g.fillStyle = C.goldMid; poly(g, [30, -74, 40, -96, 34, -58]); g.fill();
    } else {
      seam(g, [-58, -24, -30, -16, 0, -12, 30, -16, 58, -24], 2.4);
      seam(g, [-20, -66, -12, -46, -18, -30], 1.8);
    }
  }),
  helm: (seams) => spr('aurum.helm.' + seams, 110, 130, 55, 108, 3, (g) => {
    if (!seams) {
      // a great bucket helm with a domed top, a crest fin and a T visor
      plate(g, [-36, -70, -30, -90, -14, -100, 14, -100, 30, -90, 36, -70, 38, -36, 30, -8, -30, -8, -38, -36], C.goldHi, C.gold, C.goldDark, { specX: -0.45 });
      // the crest fin
      g.fillStyle = C.goldMid; poly(g, [-4, -98, 0, -118, 6, -112, 5, -96]); g.fill(); g.strokeStyle = C.ink; g.lineWidth = 2; g.stroke();
      // the visor: a horizontal slit and a vertical breath slot, deep and dark
      g.fillStyle = C.ink;
      g.beginPath(); g.moveTo(-30, -64); g.lineTo(30, -64); g.lineTo(26, -55); g.lineTo(-26, -55); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(-5, -56); g.lineTo(5, -56); g.lineTo(4, -18); g.lineTo(-4, -18); g.closePath(); g.fill();
      // brow ridge
      g.strokeStyle = C.goldHi; g.lineWidth = 2; g.beginPath(); g.moveTo(-30, -67); g.quadraticCurveTo(0, -74, 30, -67); g.stroke();
      // breathing holes
      g.fillStyle = C.ink; for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(s * (14 + i * 6), -34 + i * 4, 2, 0, TAU); g.fill(); }
      rivets(g, [[-32, -80], [32, -80], [-34, -26], [34, -26]]);
    } else {
      // the visor glows like a forge mouth
      g.fillStyle = C.molten; g.beginPath(); g.moveTo(-28, -63); g.lineTo(28, -63); g.lineTo(24, -56); g.lineTo(-24, -56); g.closePath(); g.fill();
      g.fillStyle = C.moltenHi; g.fillRect(-20, -61.5, 40, 2.6);
      g.fillStyle = C.molten; g.fillRect(-3, -56, 6, 36);
      g.fillStyle = C.moltenHi; g.fillRect(-1, -54, 2, 26);
      g.fillStyle = hexA(C.molten, 0.7); for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(s * (14 + i * 6), -34 + i * 4, 1.5, 0, TAU); g.fill(); }
    }
  }),
  beard: () => spr('aurum.beard', 100, 100, 50, 20, 2, (g) => {
    // poured-gold beard: drips frozen mid-fall, darker at the roots
    const R = srng(3);
    for (let i = 0; i < 9; i++) {
      const x = -28 + i * 7, L = 30 + R() * 36 - Math.abs(i - 4) * 5;
      const gr = g.createLinearGradient(0, -10, 0, L);
      gr.addColorStop(0, C.goldDark); gr.addColorStop(0.45, C.gold); gr.addColorStop(0.85, C.goldHi); gr.addColorStop(1, C.molten);
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(x - 5, -12); g.quadraticCurveTo(x - 5, L * 0.6, x, L); g.quadraticCurveTo(x + 5, L * 0.6, x + 5, -12); g.closePath(); g.fill();
      g.strokeStyle = hexA(C.ink, 0.6); g.lineWidth = 1.2; g.stroke();
      g.fillStyle = C.moltenHi; g.beginPath(); g.arc(x, L - 2.5, 2.6, 0, TAU); g.fill();
    }
  }),
  furnace: (seams) => spr('aurum.furnace.' + seams, 190, 170, 95, 160, 2, (g) => {
    if (!seams) {
      // the furnace on his back, two splayed chimneys rising behind the helm
      g.fillStyle = C.iron; poly(g, [-62, -60, 62, -60, 56, 0, -56, 0]); g.fill();
      g.fillStyle = C.iron2; poly(g, [-66, -66, 66, -66, 62, -56, -62, -56]); g.fill();
      for (const s of [-1, 1]) {
        g.save(); g.translate(s * 40, -62); g.rotate(s * 0.2);
        const gr = g.createLinearGradient(-14, 0, 14, 0); gr.addColorStop(0, C.iron2); gr.addColorStop(0.5, C.iron); gr.addColorStop(1, '#0c0908');
        g.fillStyle = gr; poly(g, [-15, 0, 15, 0, 12, -78, -12, -78]); g.fill();
        g.strokeStyle = C.ink; g.lineWidth = 2; g.stroke();
        // a flared, crowned cap
        g.fillStyle = C.goldMid; poly(g, [-20, -78, 20, -78, 15, -90, -15, -90]); g.fill(); g.stroke();
        g.fillStyle = C.gold; for (let i = -1; i <= 1; i++) { poly(g, [i * 11 - 4, -90, i * 11 + 4, -90, i * 11, -98]); g.fill(); }
        g.strokeStyle = hexA('#000', 0.55); g.lineWidth = 1.5; for (let y = -16; y > -76; y -= 16) { g.beginPath(); g.moveTo(-14, y); g.lineTo(14, y); g.stroke(); }
        g.restore();
      }
      g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(-56, -56, 112, 54);
    } else {
      // the grate and chimney mouths
      for (let i = -3; i <= 3; i++) { g.fillStyle = C.molten; g.fillRect(i * 13 - 3, -48, 6, 30); g.fillStyle = C.moltenHi; g.fillRect(i * 13 - 1, -44, 2, 22); }
      for (const s of [-1, 1]) { g.save(); g.translate(s * 40, -62); g.rotate(s * 0.2); g.fillStyle = C.molten; g.beginPath(); g.ellipse(0, -90, 13, 3.5, 0, 0, TAU); g.fill(); g.restore(); }
    }
  }),
  hammerHead: (seams) => spr('aurum.hammer.' + seams, 190, 110, 95, 55, 2, (g) => {
    // an anvil for a hammer head (drawn horizontal: the haft enters at x=0, striking faces at both ends)
    if (!seams) {
      plate(g, [-64, -32, 64, -32, 74, -20, 74, 26, 64, 34, -64, 34, -74, 26, -74, -20], C.gold, C.goldMid, C.goldDark, { soot: 12 });
      plate(g, [-74, -22, -90, -16, -90, 18, -74, 26], C.goldHi, C.gold, C.goldDark, { spec: false });
      plate(g, [74, -22, 90, -16, 90, 18, 74, 26], C.goldHi, C.gold, C.goldDark, { spec: false });
      g.fillStyle = C.iron; g.fillRect(-15, -36, 30, 74);
      g.fillStyle = C.iron2; g.fillRect(-15, -36, 30, 5);
      g.strokeStyle = C.ink; g.lineWidth = 2; g.strokeRect(-15, -36, 30, 74);
      rivets(g, [[-8, -26], [8, -26], [-8, 28], [8, 28]]);
      // runes of the smith
      g.strokeStyle = hexA(C.goldDark, 0.95); g.lineWidth = 2.4;
      for (const x of [-50, -32, 32, 50]) { g.beginPath(); g.moveTo(x, -14); g.lineTo(x + 6, 0); g.lineTo(x, 14); g.stroke(); }
    } else {
      seam(g, [-62, 4, -42, 0, -26, 6], 2);
      seam(g, [26, -4, 44, 2, 64, -2], 2);
      for (const x of [-50, -32, 32, 50]) { g.strokeStyle = hexA(C.molten, 0.9); g.lineWidth = 1.8; g.beginPath(); g.moveTo(x, -14); g.lineTo(x + 6, 0); g.lineTo(x, 14); g.stroke(); }
    }
  }),
  fist: () => spr('aurum.fist', 70, 70, 35, 35, 2, (g) => {
    // a gauntleted fist seen from the side: knuckle plates over a heavy palm
    plate(g, [-22, -20, 10, -24, 26, -12, 28, 10, 16, 24, -16, 24, -26, 8], C.gold, C.goldMid, C.goldDark, { spec: false });
    for (let i = 0; i < 4; i++) {
      const y = -16 + i * 10;
      g.fillStyle = i ? C.gold : C.goldHi; g.beginPath(); g.ellipse(18, y, 10, 5.5, 0.2, 0, TAU); g.fill();
      g.strokeStyle = C.ink; g.lineWidth = 1.8; g.stroke();
    }
    g.fillStyle = C.goldMid; g.beginPath(); g.ellipse(-10, 8, 10, 8, 0.6, 0, TAU); g.fill(); g.stroke();
  }),
  anvil: () => spr('aurum.anvil', 110, 80, 55, 60, 2, (g) => {
    const pts = [-48, -52, 34, -52, 50, -44, 34, -36, 20, -36, 16, -16, 30, -4, -30, -4, -16, -16, -20, -36, -40, -36];
    g.save(); const gr = g.createLinearGradient(0, -52, 0, -4); gr.addColorStop(0, '#d8d0c8'); gr.addColorStop(0.3, '#8a8078'); gr.addColorStop(1, '#2a2420');
    g.fillStyle = gr; poly(g, pts); g.fill(); g.restore();
    g.strokeStyle = C.ink; g.lineWidth = 2.2; poly(g, pts); g.stroke();
    g.fillStyle = hexA(C.molten, 0.9); g.fillRect(-30, -50, 50, 3);
  }),
};

export default function draw(ctx, e, G, P) {
  if (!e || !G) return;
  const A = e.anim, t = G.t;
  const dt = adt(e, G);
  const pz = poseOf(e);
  const heat = clamp(e.heat || 0, 0, 1);
  e.lights = [];
  const aim = e.aim ?? e.facing ?? Math.PI / 2;
  const side = damp(e, 'side', Math.cos(aim) >= 0 ? 1 : -1, 6, dt) >= 0 ? 1 : -1;
  const ca = Math.cos(aim), sa = Math.sin(aim);

  const dying = e.state === 'dying' ? k01(e.st / 3.2) : 0;
  const phaseK = e.state === 'phase' ? k01(e.st / 2.8) : 0;
  const stag = e.state === 'stagger';
  const intro = e.state === 'intro' ? k01(e.st / 3.0) : 1;

  // crouch: how far the hips sink (kneeling intro, stagger, the heat stance, death)
  let crouch = 0;
  if (e.state === 'intro') crouch = (1 - ease(k01((e.st - 0.6) / 1.8))) * 70;
  if (stag) crouch = 46 + Math.sin(t * 3) * 2;
  if (pz.m === 'heat') crouch = 22 * pz.wind;
  if (pz.m === 'slam' || pz.m === 'chain' || pz.m === 'pour') crouch = pz.act * 26 - pz.wind * 6;
  if (dying) crouch = 70 * ease(k01(dying / 0.4));
  const breathe = Math.sin(t * 1.2) * 0.5 + 0.5;
  // footfalls when he walks
  const speed = Math.hypot(e.vx || 0, e.vy || 0);
  A.walk = (A.walk || 0) + dt * speed * 0.025;
  const step = speed > 10 ? Math.sin(A.walk) : 0;
  const bob = Math.abs(step) * 5;
  const lean = (pz.m === 'breath' ? pz.wind * 0.08 : 0) + (pz.m === 'slam' || pz.m === 'chain' ? (pz.act * 0.1 - pz.wind * 0.05) * (sa >= 0 ? 1 : -1) * 0 : 0);

  // ---------- shadow ----------
  shadow(ctx, 190, 54, 0.6);
  shadow(ctx, 120, 34, 0.5);
  // the floor glows under him as the forge heats
  if (heat > 0.05) glow(ctx, 0, 0, 220, C.molten, heat * 0.35);

  const k = density(ctx, 2);
  const B = body(e, 'aurum', W, H, AX, AY, k);
  const g = B.g;
  g.save();

  const hipY = -112 + crouch + bob * 0.5;
  // ---------- hammer pose (grip point + angle; head at the far end) ----------
  const hm = hammerPose(e, pz, aim, side, t, phaseK, stag, dying, hipY);
  // ---------- legs ----------
  const footL = [-44 + (step > 0 ? step * 10 : 0), 0], footR = [44 - (step < 0 ? step * 10 : 0), 0];
  const hipL = [-34, hipY], hipR = [34, hipY];
  const kneeL = ik(hipL[0], hipL[1], footL[0], footL[1] - 14, 60, 62, 1), kneeR = ik(hipR[0], hipR[1], footR[0], footR[1] - 14, 60, 62, -1);
  const leg = (h, kn, f) => {
    g.fillStyle = C.bronze; limb(g, h[0], h[1], kn[0], kn[1], 20, 16); g.fill();
    const gr = g.createLinearGradient(kn[0] - 16, 0, kn[0] + 16, 0); gr.addColorStop(0, C.goldDark); gr.addColorStop(0.4, C.gold); gr.addColorStop(1, C.goldDark);
    g.fillStyle = gr; limb(g, kn[0], kn[1], f[0], f[1] - 14, 17, 15); g.fill();
    g.strokeStyle = hexA(C.ink, 0.8); g.lineWidth = 1.5; g.stroke();
    // knee cop and sabaton
    g.fillStyle = C.goldHi; g.beginPath(); g.ellipse(kn[0], kn[1], 15, 12, 0, 0, TAU); g.fill(); g.strokeStyle = C.ink; g.stroke();
    g.fillStyle = C.gold; g.beginPath(); g.ellipse(f[0] + (f[0] > 0 ? 6 : -6), f[1] - 8, 26, 12, 0, Math.PI, 0); g.lineTo(f[0] + 32, f[1]); g.lineTo(f[0] - 32, f[1]); g.closePath(); g.fill(); g.stroke();
  };
  leg(hipL, kneeL, footL); leg(hipR, kneeR, footR);

  // body above the hips
  g.translate(0, crouch + bob);
  g.transform(1, 0, lean, 1, 0, 0);
  // furnace behind
  put(g, LAY.furnace(0), 0, -236, 0, 1, 1 + breathe * 0.01);
  // the hammer behind him when raised back over the shoulder
  const hammerBehind = Math.sin(hm.ang) < -0.35 && hm.gy < -200;
  if (hammerBehind) drawHammer(g, hm, crouch + bob, heat, t);
  // far arm
  const sh = { L: [-90, -226], R: [90, -226] };
  const hands = handsFor(e, pz, hm, side, t, crouch + bob, aim, stag, dying);
  const armL = ik(sh.L[0], sh.L[1], hands.L[0], hands.L[1], 74, 70, -1);
  const armR = ik(sh.R[0], sh.R[1], hands.R[0], hands.R[1], 74, 70, 1);
  const arm = (s, a, holdAnvil) => {
    const [ex, ey, hx, hy] = a;
    // upper arm: dark iron mail banded with gold
    g.fillStyle = C.iron; limb(g, s[0], s[1], ex, ey, 26, 21); g.fill();
    g.strokeStyle = C.ink; g.lineWidth = 2.4; g.stroke();
    g.strokeStyle = hexA(C.iron2, 0.9); g.lineWidth = 2;
    { const ua = Math.atan2(ey - s[1], ex - s[0]), nx = -Math.sin(ua), ny = Math.cos(ua); for (let q = 0.3; q < 0.95; q += 0.2) { const x = lerp(s[0], ex, q), y = lerp(s[1], ey, q), w = lerp(25, 20, q); g.beginPath(); g.moveTo(x + nx * w, y + ny * w); g.quadraticCurveTo(x + Math.cos(ua) * 5, y + Math.sin(ua) * 5, x - nx * w, y - ny * w); g.stroke(); } }
    // forearm: a flared gauntlet bracer
    const fa = Math.atan2(hy - ey, hx - ex);
    const gr = g.createLinearGradient(ex + Math.sin(fa) * 26, ey - Math.cos(fa) * 26, ex - Math.sin(fa) * 26, ey + Math.cos(fa) * 26);
    gr.addColorStop(0, C.goldHi); gr.addColorStop(0.25, C.gold); gr.addColorStop(0.6, C.goldMid); gr.addColorStop(1, C.goldDark);
    g.fillStyle = gr; limb(g, ex, ey, hx - Math.cos(fa) * 8, hy - Math.sin(fa) * 8, 21, 29); g.fill();
    g.strokeStyle = C.ink; g.lineWidth = 2.4; g.stroke();
    // cuff ring and a molten seam down the bracer
    const cx = lerp(ex, hx, 0.72), cy = lerp(ey, hy, 0.72);
    g.strokeStyle = C.goldDark; g.lineWidth = 6; g.beginPath(); g.moveTo(cx + Math.sin(fa) * 27, cy - Math.cos(fa) * 27); g.lineTo(cx - Math.sin(fa) * 27, cy + Math.cos(fa) * 27); g.stroke();
    g.strokeStyle = C.goldHi; g.lineWidth = 1.6; g.stroke();
    // couter: a round elbow cop with a spike
    g.fillStyle = C.gold; g.beginPath(); g.arc(ex, ey, 19, 0, TAU); g.fill(); g.strokeStyle = C.ink; g.lineWidth = 2.2; g.stroke();
    g.fillStyle = C.goldHi; g.beginPath(); g.arc(ex - 5, ey - 6, 7, 0, TAU); g.fill();
    // the fist, turned along the forearm
    put(g, LAY.fist(), hx, hy, fa, 1.25, 1.25 * (Math.cos(fa) < 0 ? -1 : 1));
    if (holdAnvil) put(g, LAY.anvil(), hx, hy - 6, Math.sin(t * 3) * 0.05, 1.2, 1.2);
  };
  const farSide = side > 0 ? 'L' : 'R';
  arm(sh[farSide], farSide === 'L' ? armL : armR, hands.anvil === farSide);
  // torso, apron, beard, helm, pauldrons
  put(g, LAY.torso(0), 0, 0, 0, 1 + breathe * 0.012, 1 + breathe * 0.01);
  g.save(); g.translate(0, -crouch - bob); put(g, LAY.apron(), 0, crouch + bob * 0 + 4, 0, 1, 1); g.restore();
  // the head sits low between the shoulders
  const hdx = clamp(Math.cos(e.facing ?? aim), -1, 1) * 4;
  const hdy = -262 + (stag ? 16 : 0) + dying * 20;
  put(g, LAY.helm(0), hdx, hdy, stag ? 0.12 : 0);
  put(g, LAY.beard(), hdx, hdy - 12 + (pz.m === 'breath' ? -2 : 0), Math.sin(t * 1.4) * 0.02);
  put(g, LAY.pauldron(0), -92, -228, -0.25 + breathe * 0.02, -1, 1);
  put(g, LAY.pauldron(0), 92, -228, 0.25 - breathe * 0.02, 1, 1);
  // the near arm and the hammer in front
  if (!hammerBehind) drawHammer(g, hm, crouch + bob, heat, t);
  arm(sh[farSide === 'L' ? 'R' : 'L'], farSide === 'L' ? armR : armL, hands.anvil === (farSide === 'L' ? 'R' : 'L'));
  g.restore();

  // ---------- composite with flash, heat tint, cooling, unravel ----------
  const flash = Math.max((e.flash || 0) / 0.1 * 0.8, stag ? 0.1 + Math.max(0, Math.sin(t * 12)) * 0.12 : 0);
  present(ctx, e, G, B, {
    flash, white: stag ? '#fff4d8' : '#ffffff',
    tint: dying ? ['#2a2420', dying * 0.65] : phaseK ? [C.molten, Math.sin(phaseK * Math.PI) * 0.35] : heat > 0.05 ? [C.molten, heat * 0.12] : intro < 1 ? ['#1a120c', (1 - ease(k01((e.st - 0.3) / 1.4))) * 0.5] : null,
    unravel: dying > 0.45 ? (dying - 0.45) / 0.55 : 0,
    rim: '#ffd9a0', rimA: 0.45,
  });

  // ---------- molten seams (additive, brighter as the forge heats) ----------
  const hot = (0.55 + heat * 0.45 + phaseK * 0.5) * (1 - dying) * (0.85 + 0.15 * Math.sin(t * 5)) * (e.state === 'intro' ? ease(k01((e.st - 1.2) / 1.2)) : 1);
  const oy = crouch + bob;
  if (hot > 0.02) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = hot;
    ctx.transform(1, 0, lean, 1, 0, 0);
    ctx.translate(0, oy);
    put(ctx, LAY.torso(1), 0, 0, 0, 1 + breathe * 0.012, 1 + breathe * 0.01);
    put(ctx, LAY.furnace(1), 0, -236, 0, 1, 1 + breathe * 0.01);
    put(ctx, LAY.helm(1), hdx, hdy, stag ? 0.12 : 0);
    put(ctx, LAY.pauldron(1), -92, -228, -0.25 + breathe * 0.02, -1, 1);
    put(ctx, LAY.pauldron(1), 92, -228, 0.25 - breathe * 0.02, 1, 1);
    ctx.restore();
    // forge-mouth glow at the helm, the furnace, the hammer
    const breath = pz.m === 'breath' ? pz.wind + pz.act : 0;
    glow(ctx, hdx, hdy - 50 + oy, 30 + breath * 50 + heat * 14, C.molten, hot * 0.6);
    glow(ctx, hdx, hdy - 59 + oy, 14, C.moltenHi, hot * 0.8);
    glow(ctx, 0, -206 + oy, 46 + heat * 50, C.molten, hot * 0.7);
    glow(ctx, 0, -206 + oy, 16, C.moltenHi, hot * 0.7);
    for (const s of [-1, 1]) glow(ctx, s * 58, -386 + oy, 40 + heat * 30, C.ember, hot * 0.6);
    glow(ctx, hm.hx, hm.hy + oy, 70 + heat * 30, C.molten, hot * 0.45 + (pz.wind > 0.5 && pz.m !== 'breath' && pz.m !== 'anvil' ? (pz.wind - 0.5) * 1.2 : 0));
    light(e, hdx, hdy - 40 + oy, 260 + heat * 120, C.molten, 0.55 * hot + breath * 0.3);
    light(e, hm.hx, hm.hy + oy, 200, C.ember, 0.5 * hot);
    light(e, 0, -206 + oy, 240 + heat * 200, C.ember, 0.4 * hot + heat * 0.3);
  }
  // chimney embers and smoke (render-only particles on the entity)
  embers(ctx, e, dt, t, heat, oy, dying);
  drawFx(ctx, e);
  if (dying) unravelFx(e, G, { rate: dying < 0.9 ? 90 : 0, w: 240, h: 300, color: '#140a04', color2: C.ember, mix: 0.4 }, dt);
  else if (A.fx && A.fx.length) unravelFx(e, G, { rate: 0 }, dt);
  e.light = e.lights[0] || null;
}

function hammerPose(e, pz, aim, side, t, phaseK, stag, dying, hipY) {
  // grip (gx, gy) is the lower hand on the haft; ang points from grip to head; L haft length
  const ca = Math.cos(aim), sa = Math.sin(aim);
  const L = 170;
  // idle: head resting on the ground at his side, haft leaning to his hand
  let gx = side * 104, gy = -150, ang = Math.PI / 2 + side * -0.18;
  const w = pz.wind, act = pz.act, st = pz.strike;
  const mix = (a, b, k) => lerp(a, b, k);
  const fwd = Math.atan2(sa * 0.55 + 0.45, ca); // toward the strike, tipped toward the floor
  switch (pz.m) {
    case 'slam': case 'chain': case 'pour': {
      const upAng = -Math.PI / 2 - side * 0.5;
      gx = mix(gx, side * 46, w); gy = mix(gy, -350, w); ang = mix(ang, upAng, w);
      if (pz.stage === 'act' || pz.stage === 'rec') {
        const k = pz.stage === 'act' ? eIn(st) : 1;
        const tgt = pz.m === 'pour' ? Math.PI / 2 : fwd;
        gx = mix(side * 46, pz.m === 'pour' ? 0 : ca * 70, k); gy = mix(-350, pz.m === 'pour' ? -170 : -150 + sa * 30, k);
        let d = tgt - upAng; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
        // swing over the top, the long way
        if (Math.sign(d) !== -side && pz.m !== 'pour') d -= Math.sign(d) * TAU;
        ang = upAng + d * k;
        if (pz.stage === 'rec') { const r = ease(pz.rec); gx = mix(gx, side * 104, r * 0.6); gy = mix(gy, -150, r * 0.6); }
      }
      break;
    }
    case 'sweep': {
      const back = Math.atan2(0.2, -side), front = Math.atan2(0.3, side);
      gx = mix(gx, -side * 70, w); gy = mix(gy, -170, w); ang = mix(ang, back, w);
      if (pz.stage === 'act' || pz.stage === 'rec') { const k = pz.stage === 'act' ? eOut(st) : 1; gx = mix(-side * 70, side * 80, k); gy = -170; ang = back + (side > 0 ? -1 : 1) * Math.PI * k * 0.95 * -1; }
      break;
    }
    case 'heat': {
      gx = mix(gx, 0, w); gy = mix(gy, -150, w); ang = mix(ang, Math.PI / 2, w);
      break;
    }
  }
  if (e.state === 'phase') { const k = Math.sin(k01(e.st / 2.8) * Math.PI); gx = mix(gx, side * 20, k); gy = mix(gy, -330, k); ang = mix(ang, -Math.PI / 2, k); }
  if (stag) { gx = side * 120; gy = -100; ang = Math.PI / 2 + side * -0.5; }
  if (dying) { const k = ease(k01(dying / 0.4)); gx = mix(gx, side * 140, k); gy = mix(gy, -40, k); ang = mix(ang, side > 0 ? 0.05 : Math.PI - 0.05, k); }
  const hx = gx + Math.cos(ang) * L, hy = gy + Math.sin(ang) * L;
  return { gx, gy, ang, L, hx, hy, smear: (pz.m === 'slam' || pz.m === 'chain' || pz.m === 'sweep' || pz.m === 'pour') && pz.stage === 'act' };
}
function handsFor(e, pz, hm, side, t, oy, aim, stag, dying) {
  // hands on the haft: the grip, and a second hand further up for two-handed strikes
  const up = [hm.gx + Math.cos(hm.ang) * 46, hm.gy + Math.sin(hm.ang) * 46];
  const g0 = [hm.gx, hm.gy];
  const near = side > 0 ? 'R' : 'L', far = side > 0 ? 'L' : 'R';
  const out = { anvil: null };
  const two = pz.m === 'slam' || pz.m === 'chain' || pz.m === 'pour' || pz.m === 'heat' || pz.m === 'sweep' || e.state === 'phase';
  out[near] = g0;
  if (two) out[far] = up;
  else if (pz.m === 'anvil') {
    const w = pz.wind, s = pz.strike;
    const raised = [-side * 40, -360], thrown = [Math.cos(aim) * 120, -260];
    out[far] = pz.stage === 'wind' ? [lerp(-side * 70, raised[0], w), lerp(-150, raised[1], w)] : [lerp(raised[0], thrown[0], eOut(s)), lerp(raised[1], thrown[1], eOut(s))];
    out.anvil = pz.stage === 'wind' ? far : null;
  } else if (pz.m === 'breath') out[far] = [-side * 60, -200 + Math.sin(t * 8) * 4];
  else out[far] = [-side * 82 + Math.sin(t * 1.1) * 3, -130 + Math.sin(t * 1.4) * 3];
  if (stag) out[far] = [-side * 70, -40];
  return out;
}
function drawHammer(g, hm, oy, heat, t) {
  const { gx, gy, ang, L, hx, hy } = hm;
  const bx = gx - Math.cos(ang) * 30, by = gy - Math.sin(ang) * 30;
  // haft
  const gr = g.createLinearGradient(bx, by, hx, hy); gr.addColorStop(0, '#2a1a10'); gr.addColorStop(1, '#5a3a24');
  g.strokeStyle = gr; g.lineWidth = 11; g.lineCap = 'round';
  g.beginPath(); g.moveTo(bx, by); g.lineTo(hx - Math.cos(ang) * 10, hy - Math.sin(ang) * 10); g.stroke();
  g.strokeStyle = C.gold; g.lineWidth = 12; for (const q of [0.2, 0.55]) { const x = lerp(bx, hx, q), y = lerp(by, hy, q); g.beginPath(); g.moveTo(x - Math.cos(ang) * 4, y - Math.sin(ang) * 4); g.lineTo(x + Math.cos(ang) * 4, y + Math.sin(ang) * 4); g.stroke(); }
  g.fillStyle = C.gold; g.beginPath(); g.arc(bx, by, 9, 0, TAU); g.fill();
  // smear of the swing
  if (hm.smear) {
    g.save(); g.globalAlpha = 0.35; g.strokeStyle = C.ember; g.lineWidth = 60; g.lineCap = 'round';
    g.beginPath(); g.moveTo(hx - Math.cos(ang + 0.6) * 30, hy - Math.sin(ang + 0.6) * 30); g.lineTo(hx, hy); g.stroke(); g.restore();
  }
  // the head lies across the haft
  put(g, LAY.hammerHead(0), hx, hy, ang + Math.PI / 2, 1, 1);
  g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5 + heat * 0.5; put(g, LAY.hammerHead(1), hx, hy, ang + Math.PI / 2, 1, 1); g.restore();
}

function embers(ctx, e, dt, t, heat, oy, dying) {
  const A = e.anim;
  const P = (A.emb = A.emb || []);
  A.embT = (A.embT || 0) - dt;
  const rate = dying ? 0 : 0.06 / (1 + heat * 3);
  while (A.embT <= 0 && rate > 0) {
    A.embT += rate;
    const s = Math.random() < 0.5 ? -1 : 1;
    P.push({ x: s * 58 + (Math.random() - 0.5) * 16, y: -388 + oy, vx: (Math.random() - 0.5) * 40 + 15, vy: -60 - Math.random() * 80 - heat * 80, life: 1.2 + Math.random(), max: 2, smoke: Math.random() < 0.35 });
  }
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx += Math.sin(t * 2 + i) * 20 * dt;
    if (p.life <= 0) { P.splice(i, 1); continue; }
    const k = p.life / p.max;
    if (p.smoke) { ctx.fillStyle = hexA('#1a1410', 0.25 * k); ctx.beginPath(); ctx.arc(p.x, p.y, 10 + (1 - k) * 24, 0, TAU); ctx.fill(); }
    else { ctx.fillStyle = hexA(C.ember, k); ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); }
  }
  if (P.length > 120) P.splice(0, P.length - 120);
}

// ---------- set pieces ----------
export function drawZone(ctx, z, G) {
  if (z.kind === 'boss:heat') { drawHeat(ctx, z, G); return true; }
  if (z.kind === 'boss:impact' && z.item === 'anvil') { drawAnvilFall(ctx, z, G); return true; }
  return false;
}
function drawHeat(ctx, z, G) {
  const A = (G.chamber && G.chamber._bossArena) || { cx: 0, cy: 0, rx: 900, ry: 560 };
  const warn = z.age < z.warn, k = warn ? z.age / z.warn : 1;
  const out = clamp(z.life / 0.4, 0, 1);
  ctx.save();
  // the floor outside the safe circles: cracks fill with molten light
  ctx.beginPath();
  ctx.ellipse(A.cx, A.cy, A.rx * 1.25, A.ry * 1.25, 0, 0, TAU);
  for (const s of z.safe) { ctx.moveTo(s.x + s.r, s.y); ctx.arc(s.x, s.y, s.r, 0, TAU, true); }
  ctx.fillStyle = warn ? `rgba(255,70,30,${(0.08 + k * 0.22) * out})` : `rgba(255,110,30,${0.42 * out})`;
  ctx.fill('evenodd');
  ctx.clip('evenodd');
  ctx.globalCompositeOperation = 'lighter';
  // branching cracks: a trunk and a fork or two, each tapering; drawn twice
  // from the same seed, a wide molten glow and then a thin white-hot core
  const pass = (color, wk) => {
    const R = srng(9);
    const crack = (x, y, ang, len, w, depth) => {
      ctx.lineWidth = w * wk; ctx.beginPath(); ctx.moveTo(x, y);
      for (let j = 0; j < 5; j++) {
        ang += (R() - 0.5) * 0.9; x += Math.cos(ang) * len / 5; y += Math.sin(ang) * len / 5 * 0.62; ctx.lineTo(x, y);
        if (depth > 0 && R() < 0.3) { ctx.stroke(); crack(x, y, ang + (R() < 0.5 ? -1 : 1) * (0.6 + R() * 0.5), len * 0.5, w * 0.6, depth - 1); ctx.lineWidth = w * wk; ctx.beginPath(); ctx.moveTo(x, y); }
      }
      ctx.stroke();
    };
    ctx.strokeStyle = color;
    for (let i = 0; i < 46; i++) crack(A.cx + (R() - 0.5) * A.rx * 2.4, A.cy + (R() - 0.5) * A.ry * 2.4, R() * TAU, 140 + R() * 160, warn ? 4 : 7, 2);
  };
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  pass(hexA(C.molten, (warn ? k * 0.35 : 0.55) * out), 1);
  pass(hexA(C.moltenHi, (warn ? k * 0.4 : 0.85) * out), 0.3);
  ctx.restore();
  // safe circles: rings of cool gold that read as "stand here"
  for (const s of z.safe) {
    ctx.strokeStyle = hexA('#fff1c4', (0.5 + 0.4 * Math.sin(G.t * 6)) * out); ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.stroke();
    ctx.fillStyle = hexA('#2a1a10', 0.25 * out); ctx.beginPath(); ctx.arc(s.x, s.y, s.r - 2, 0, TAU); ctx.fill();
    glow(ctx, s.x, s.y, s.r * 0.6, '#fff1c4', 0.12 * out);
  }
}
function drawAnvilFall(ctx, z, G) {
  const k = clamp(z.age / z.fall, 0, 1);
  if (z.landed) {
    const f = 1 - clamp(z.life / 0.7, 0, 1);
    put(ctx, LAY.anvil(), z.x, z.y + 8, 0, 1.5, 1.5 * (1 - f * 0.2), 1 - f);
    glow(ctx, z.x, z.y, z.r * 1.4, C.molten, (1 - f) * 0.9);
    return;
  }
  shadow(ctx, z.r * (0.3 + k * 0.6), z.r * 0.3 * (0.3 + k * 0.6), 0.6 * k, z.x, z.y);
  // a high arc from his hand to the target
  const sx = z.sx ?? z.x, sy = (z.sy ?? z.y) - 300;
  const x = lerp(sx, z.x, k), y = lerp(sy, z.y, k) - Math.sin(k * Math.PI) * 420;
  put(ctx, LAY.anvil(), x, y, k * 6, 1.5, 1.5);
  glow(ctx, x, y - 30, 50, C.molten, 0.6);
}
export function drawProjectile(ctx, p, G) {
  if (p.kind !== 'boss:spark') return false;
  const z = p.z ?? 100, x = p.x, y = p.y - z * clamp(p.life / 1.2, 0.2, 1);
  const vx = p.vx * 0.04, vy = p.vy * 0.04;
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = hexA(C.ember, 0.9); ctx.lineWidth = p.r * 0.9; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - vx, y - vy); ctx.lineTo(x, y); ctx.stroke();
  ctx.strokeStyle = hexA(C.moltenHi, 1); ctx.lineWidth = p.r * 0.35; ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  glow(ctx, x, y, p.r * 3, C.molten, 0.6);
  shadow(ctx, p.r * 0.8, p.r * 0.3, 0.3, p.x, p.y);
  return true;
}
// The forge's heat on the whole arena: a shimmering orange wash that grows with e.heat.
export function drawOverlay(ctx, G, P, b) {
  if (!b || !(b.heat > 0.02)) return;
  const A = (G.chamber && G.chamber._bossArena) || { cx: 0, cy: 0, rx: 900, ry: 560 };
  ctx.globalCompositeOperation = 'lighter';
  const a = b.heat * 0.08 * (0.85 + 0.15 * Math.sin(G.t * 2));
  glow(ctx, A.cx, A.cy, Math.max(A.rx, A.ry) * 1.3, C.molten, a * 3);
  ctx.globalCompositeOperation = 'source-over';
  // heat motes rising everywhere
  const n = Math.floor(30 * b.heat);
  for (let i = 0; i < n; i++) {
    const R = srng(i * 7 + 1);
    const x = A.cx + (R() - 0.5) * A.rx * 2, y0 = A.cy + (R() - 0.5) * A.ry * 2;
    const ph = (G.t * (0.2 + R() * 0.3) + R()) % 1;
    ctx.fillStyle = hexA(C.ember, (1 - ph) * 0.7);
    ctx.fillRect(x + Math.sin(G.t + i) * 10, y0 - ph * 160, 2.5, 2.5);
  }
}
