// Bastion Beetle (charger): wide and low, a slate-teal carapace of heavy overlapping plates with
// ember-glowing seams and moss tufts, a brass shield-head (the armour that blocks frontal hits) with a
// curving ivory horn, a visor slit with two ember eyes and hooked mandibles, six clawed legs. Facing
// right. Windup crouches with the head pulled in and the seams running hotter; charge lunges head
// first with the legs thrown back and a trail of dust and sparks; stunned slumps with the seams gone
// dull and dizzy sparks circling the horn.
//
// The carapace and the head are painted once per set into cached stamps (the carapace once per seam
// heat), then every frame places them on the posed body and draws the legs, so the plates stay
// identical between frames and the set stays cheap to paint.
import type { Painter, SpriteSet } from '../sprite';
import {
  type Ctx, TAU, blobPath, css, figure, glow, layer, lin, makeCanvas, noiseTexture, polyline, rad, rng, roundPoly, scaleOf, taper, bez,
} from '../paint';

const W = 60, H = 42, FY = 38;
type Pts = number[];

/** The atlas paints the body and the emissive layer in separate passes, handing the unused one a 4x4 scratch. */
const live = (c: Ctx) => c.canvas.width > 8 || c.canvas.height > 8;

const INK = 0x080a10;
// Slate-teal shell (mid-tones lifted so they survive the light map), dark chitin legs, brass, ivory.
const SH = { deep: 0x14232a, dark: 0x22404a, mid: 0x3b6870, light: 0x5d9195, high: 0x93c4c1, spec: 0xd2f2ec };
const LEG = { deep: 0x0f161d, dark: 0x1c2a33, mid: 0x2e4450, light: 0x4f6d78 };
const BR = { deep: 0x3a260c, dark: 0x7a5a26, mid: 0xc99a45, light: 0xffd98a, spec: 0xfff4d0 };
const IV = { dark: 0x6f6a5e, mid: 0xb3ab95, light: 0xe2dac4 };
const EMBER = { deep: 0xb8441a, mid: 0xff7a2e, light: 0xffc06a, hot: 0xffe29a, white: 0xfff8e0 };
const DULL = 0x7a2a1e;

// ---- carapace (local coordinates: origin at the dome's middle) -----------------------------------

const RXL = 20, RXR = 17.5, RYT = 11.5, RYB = 7.5;
/** The dome outline: a soft superellipse, rounder at the rear, flatter where the head sits. */
function domePts(): Pts {
  const out: Pts = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * TAU, c = Math.cos(a), s = Math.sin(a);
    const rx = c < 0 ? RXL : RXR, ry = s < 0 ? RYT : RYB;
    out.push(Math.sign(c) * Math.pow(Math.abs(c), 0.82) * rx, Math.sign(s) * Math.pow(Math.abs(s), 0.9) * ry);
  }
  return out;
}
const DOME = domePts();
/** Band boundaries (rear to front): each a curve bulging forward at mid height. */
const SEAMS = [-12.5, -4.5, 3.5, 10.5];
/** How hot each seam runs, rear to front: the middle plates, nearest the furnace, glow the most. */
const SEAM_K = [0.5, 0.9, 1, 0.68];
const seamX = (b: number, y: number) => b + 2.4 * (1 - Math.pow((y + 2) / 12, 2));
function seamLine(b: number): Pts {
  const out: Pts = [];
  for (let y = -RYT - 1; y <= RYB + 1; y += 1) out.push(seamX(b, y), y);
  return out;
}

function domePath(c: Ctx) {
  c.beginPath();
  c.moveTo(DOME[0], DOME[1]);
  for (let i = 2; i < DOME.length; i += 2) c.lineTo(DOME[i], DOME[i + 1]);
  c.closePath();
}

type Heat = 0 | 1 | 2 | 'stun';

function grainOver(c: Ctx, seed: number, x: number, y: number, w: number, h: number, a = 1) {
  const r = rng(seed);
  const pat = (tex: HTMLCanvasElement, units: number) => {
    const p = c.createPattern(tex, 'repeat')!;
    const k = units / tex.width;
    p.setTransform(new DOMMatrix([k, 0, 0, k, r() * 40, r() * 40]));
    return p;
  };
  c.globalCompositeOperation = 'overlay';
  c.globalAlpha = 0.3 * a;
  c.fillStyle = pat(noiseTexture(128, 4, 91, 4, 1.1), 26);
  c.fillRect(x, y, w, h);
  c.globalAlpha = 0.22 * a;
  c.fillStyle = pat(noiseTexture(128, 16, 43, 3, 1.4), 9);
  c.fillRect(x, y, w, h);
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;
}

/** The whole carapace, rear band to front band, with seams glowing at the given heat. */
function paintCarapace(c: Ctx, heat: Heat) {
  const r = rng(77);
  const seamCol = heat === 'stun' ? DULL : heat === 2 ? EMBER.hot : heat === 1 ? EMBER.light : EMBER.mid;
  // Armour tassets: each band's lower edge hangs a little below the dome as a rounded tab.
  [-RXL + 2, ...SEAMS].forEach((b0, k) => {
    const b1 = k < SEAMS.length ? SEAMS[k] : RXR - 2;
    const x = (seamX(b0, RYB) + seamX(b1, RYB)) / 2 - 0.5;
    roundPoly(c, [x - 3.3, RYB - 3, x + 3, RYB - 3, x + 2.6, RYB + 1.9, x - 2.8, RYB + 2.1], 1.1);
    c.lineWidth = 0.9; c.strokeStyle = css(INK); c.stroke();
    c.fillStyle = lin(c, x, RYB - 2, x, RYB + 2, [[0, css(SH.dark)], [1, css(SH.deep)]]); c.fill();
    polyline(c, [x - 2.5, RYB + 1.2, x + 2.2, RYB + 1.1], 0.3, css(SH.light, 0.5));
  });
  // Belly and skirt under the dome: dark segmented chitin.
  c.beginPath(); c.ellipse(-1, 5.5, 18.5, 4.6, 0, 0, TAU);
  c.fillStyle = lin(c, 0, 2, 0, 10, [[0, css(LEG.mid)], [1, css(LEG.deep)]]); c.fill();
  c.lineWidth = 0.5; c.strokeStyle = css(INK); c.stroke();
  for (const b of SEAMS) polyline(c, [seamX(b, 4) - 1, 3.5, seamX(b, 8) - 2, 9.2], 0.4, css(INK, 0.8));

  c.save();
  domePath(c);
  c.clip();
  // Dome light: bright crown at the upper left, falling into shadow at the skirt.
  const domeFill = rad(c, -6, -9, 1, 26, [[0, css(SH.high)], [0.28, css(SH.light)], [0.62, css(SH.mid)], [0.9, css(SH.dark)], [1, css(SH.deep)]]);
  const bands = [-RXL - 1, ...SEAMS];
  bands.forEach((b0, k) => {
    const isFirst = k === 0;
    const lip = 1.1;
    // The band covers everything forward of its rear edge; later bands cover its front.
    const band = () => {
      c.beginPath();
      if (isFirst) { c.rect(-RXL - 2, -RYT - 2, RXL + RXR + 4, RYT + RYB + 4); return; }
      const L = seamLine(b0);
      c.moveTo(L[0] - lip, L[1]);
      for (let i = 2; i < L.length; i += 2) c.lineTo(L[i] - lip, L[i + 1]);
      c.lineTo(RXR + 2, RYB + 2); c.lineTo(RXR + 2, -RYT - 2); c.closePath();
    };
    if (!isFirst) {
      // The seam this band's lip overhangs: an ember crevice, and the lip's shadow beside it.
      const L = seamLine(b0);
      polyline(c, L.map((v, i) => (i % 2 ? v : v - 1.7)), 2.8, css(0x05080b, 0.55));
      polyline(c, L.map((v, i) => (i % 2 ? v : v - 1.2)), 1.3, css(0x120604));
      polyline(c, L.map((v, i) => (i % 2 ? v : v - 1.15)), 0.5, seamStyle(c, seamCol, 0.45 + 0.55 * SEAM_K[k - 1]));
      if (heat === 2) polyline(c, L.map((v, i) => (i % 2 ? v : v - 1.15)), 0.2, seamStyle(c, EMBER.white, 1));
    }
    c.save();
    band();
    c.clip();
    c.fillStyle = domeFill;
    c.fillRect(-RXL - 2, -RYT - 2, RXL + RXR + 4, RYT + RYB + 4);
    // Each band rolls away toward its front: lit at the rear lip, darker before the next seam.
    const next = k < SEAMS.length ? SEAMS[k] : RXR + 3;
    const from = isFirst ? -RXL : b0;
    c.fillStyle = lin(c, from - 1, 0, next + 2, 0, [[0, 'rgba(210,245,240,0.16)'], [0.35, 'rgba(0,0,0,0)'], [1, 'rgba(4,10,14,0.38)']]);
    c.fillRect(-RXL - 2, -RYT - 2, RXL + RXR + 4, RYT + RYB + 4);
    grainOver(c, 11 + k * 7, -RXL - 2, -RYT - 2, RXL + RXR + 4, RYT + RYB + 4, 0.65);
    // Rivet bosses in a row behind the lip, scratches, pits.
    if (!isFirst) {
      for (let y = -RYT + 3.5; y < RYB - 2; y += 4.2) {
        const x = seamX(b0, y) + 1.9;
        c.beginPath(); c.arc(x + 0.15, y + 0.2, 0.62, 0, TAU); c.fillStyle = css(SH.deep, 0.8); c.fill();
        c.beginPath(); c.arc(x - 0.05, y - 0.05, 0.5, 0, TAU); c.fillStyle = css(y < -2 ? SH.high : SH.light); c.fill();
        c.beginPath(); c.arc(x - 0.2, y - 0.22, 0.18, 0, TAU); c.fillStyle = css(SH.spec, 0.9); c.fill();
      }
    }
    for (let i = 0; i < 3; i++) {
      const x = from + 1.5 + r() * (next - from - 2), y = -RYT + 2 + r() * (RYT + RYB - 5);
      const a = r() * TAU, l = 1 + r() * 2;
      polyline(c, [x, y, x + Math.cos(a) * l, y + Math.sin(a) * l], 0.28, css(SH.deep, 0.7));
      polyline(c, [x + 0.25, y + 0.3, x + 0.25 + Math.cos(a) * l, y + 0.3 + Math.sin(a) * l], 0.2, css(SH.high, 0.5));
    }
    c.restore();
    // The lip edge itself catches the moon.
    if (!isFirst) {
      const L = seamLine(b0);
      const top = L;
      c.save();
      band();
      c.clip();
      polyline(c, top.map((v, i) => (i % 2 ? v : v - lip + 0.75)), 1.1, css(SH.light, 0.45));
      polyline(c, top.map((v, i) => (i % 2 ? v : v - lip + 0.3)), 0.5, css(SH.spec, 0.6));
      c.restore();
    }
  });
  // Spine ridge running over the crown, and the skirt's lower rim in shadow.
  const spine = bez(-17, -6, -10, -12.4, 6, -12.6, 15, -5.5, 16);
  polyline(c, spine.map((v, i) => (i % 2 ? v + 0.7 : v)), 1.4, css(SH.deep, 0.35));
  polyline(c, spine, 0.7, css(SH.spec, 0.6));
  c.restore();
  // Rim of the dome where it meets the skirt.
  c.save();
  domePath(c);
  c.clip();
  c.translate(0, -1.2);
  domePath(c);
  c.lineWidth = 1.6; c.strokeStyle = css(SH.deep, 0.75); c.stroke();
  c.restore();
  domePath(c);
  c.lineWidth = 0.5; c.strokeStyle = css(INK); c.stroke();
  // A short dark spike rising off each band's crown, swept back.
  SEAMS.forEach((b, k) => {
    const x = seamX(b, -RYT) + 1.6 + k * 0.2;
    const y = -Math.sqrt(Math.max(0, 1 - Math.pow((x < 0 ? x / RXL : x / RXR), 2))) * RYT * 0.98 + 0.6;
    const tip: [number, number] = [x - 2.6, y - 3.2 + Math.abs(k - 1.5) * 0.5];
    c.beginPath(); c.moveTo(x - 1.6, y + 0.6); c.quadraticCurveTo(x - 1.2, y - 1.4, tip[0], tip[1]); c.quadraticCurveTo(x + 0.2, y - 1.2, x + 1.4, y + 0.7); c.closePath();
    c.lineWidth = 0.8; c.strokeStyle = css(INK); c.stroke();
    c.fillStyle = lin(c, x - 1, y - 2, x + 1, y + 1, [[0, css(SH.high)], [0.4, css(SH.mid)], [1, css(SH.deep)]]); c.fill();
    polyline(c, [x - 1.1, y - 0.2, tip[0] + 0.3, tip[1] + 0.3], 0.25, css(SH.spec, 0.8));
  });
  // Moss patches hugging the crown: low clumps of small cushions with bright tips, a strand or two.
  for (const [mx, my, s, n] of [[-14.5, -6.4, 1, 3], [-8, -10.2, 1.2, 4], [1.2, -11.5, 1.1, 4], [8, -10.2, 0.9, 3], [13, -6.8, 0.8, 2]] as const) {
    const q = rng(Math.round(mx * 13 + my * 7) + 500);
    const pts: [number, number, number][] = [];
    for (let i = 0; i < n; i++) pts.push([mx + (i - (n - 1) / 2) * s * 1.3 + (q() - 0.5) * 0.6, my + Math.abs(i - (n - 1) / 2) * 0.45 + (q() - 0.5) * 0.4, s * (0.7 + q() * 0.45)]);
    if (n > 2) taper(c, [mx - s, my + 0.6, mx - s - 0.2, my + 2, mx - s + 0.2, my + 3], 0.6, 0.15, css(0x1c4537, 0.9));
    for (const [x, y, r0] of pts) { blobPath(c, x + 0.15, y + 0.35, r0 * 1.1, r0 * 0.7, q, 6, 0.25); c.fillStyle = css(0x0f251e); c.fill(); }
    for (const [x, y, r0] of pts) {
      blobPath(c, x, y, r0, r0 * 0.62, q, 6, 0.25);
      c.fillStyle = lin(c, x - r0, y - r0, x + r0, y + r0, [[0, css(0x5d9a74)], [0.5, css(0x2f6a52)], [1, css(0x1b4537)]]);
      c.fill();
      c.beginPath(); c.ellipse(x - r0 * 0.3, y - r0 * 0.28, r0 * 0.32, r0 * 0.18, -0.3, 0, TAU);
      c.fillStyle = css(0x9ad6a6, 0.85); c.fill();
    }
  }
}

/** A seam stroke that burns brightest at mid height and fades where it rolls over the crown and under the skirt. */
function seamStyle(c: Ctx, col: number, a: number) {
  return lin(c, 0, -RYT, 0, RYB, [[0, css(col, a * 0.15)], [0.3, css(col, a * 0.85)], [0.62, css(col, a)], [1, css(col, a * 0.25)]]);
}

function carapaceEmit(E: Ctx, heat: Heat) {
  E.save();
  domePath(E);
  E.clip();
  SEAMS.forEach((b, si) => {
    const L = seamLine(b).map((v, i) => (i % 2 ? v : v - 1.2));
    if (heat === 'stun') { polyline(E, L, 1.1, seamStyle(E, DULL, 0.45)); return; }
    // Calmer seams cool more than the hot ones when the beetle is idle; a windup brings them all up.
    const k = heat === 2 ? 0.75 + 0.25 * SEAM_K[si] : SEAM_K[si];
    const a = [0.6, 0.85, 1][heat] * k;
    polyline(E, L, 3 + heat * 1.6, seamStyle(E, EMBER.deep, 0.22 * a));
    polyline(E, L, 1.3 + heat * 0.3, seamStyle(E, EMBER.mid, 0.55 * a));
    // The molten core swells where the plates gape (below the crown) and pinches shut at both ends.
    const h = Math.floor(L.length / 4) * 2 + 2, w = (0.5 + heat * 0.15) * (0.6 + 0.4 * k);
    const core = seamStyle(E, [EMBER.light, EMBER.hot, EMBER.white][heat], 0.6 + 0.35 * k);
    taper(E, L.slice(0, h + 2), w * 0.35, w * 1.25, core);
    taper(E, L.slice(h), w * 1.25, w * 0.3, core);
  });
  E.restore();
}

// ---- head (local coordinates: origin at the neck joint, facing +x) -------------------------------

// The brass helm in profile: crown behind, sweeping forward and down to a thick front lip; the face
// hides under the lip with two ember eyes; hooked mandibles reach forward; the horn rises off the brow.
const SHIELD: Pts = [-5.5, -4, -2, -9.6, 3.6, -11.2, 8.8, -8.8, 12.3, -3.8, 13.2, 1.4, 11.2, 3.6, 6.6, 3.4, 1.8, 5, -3.8, 4.4, -6.4, 0.6];
const LIP = [1.6, 4.4, 6.6, 2.8, 11.2, 3, 13, 1];
const FACE: Pts = [2.5, 3, 12.6, 2.2, 13.6, 5.4, 11.4, 8, 4.2, 7.8, 1.6, 5.6];
const EYES: [number, number, number][] = [[10.6, 4.6, 1], [7.6, 5.1, 0.8]];
const HORN = bez(6.4, -9.2, 6.8, -14.5, 8.8, -18.4, 12.8, -20, 14);

function paintHead(c: Ctx) {
  // Neck: dark ribbed chitin linking the head to the carapace.
  c.beginPath(); c.ellipse(-4, 1.6, 5, 5.2, 0, 0, TAU);
  c.fillStyle = lin(c, -7, -3, -1, 6, [[0, css(LEG.light)], [1, css(LEG.deep)]]); c.fill();
  c.lineWidth = 0.45; c.strokeStyle = css(INK); c.stroke();
  for (let i = 0; i < 3; i++) polyline(c, [-7 + i * 1.6, -2.5, -7.5 + i * 1.6, 5.8], 0.35, css(INK, 0.7));
  // Far mandible, the face under the lip, then the near mandible.
  const mandible = (oy: number, k: number, col: number) => {
    const m = bez(9, 6.5 + oy, 12, 8.2 + oy, 14.6, 7.6 + oy, 15.2 * k + 0.4, 4.6 + oy, 10);
    taper(c, m, 2.8 * k, 0.5, css(INK));
    taper(c, m.map((v, i) => v - (i % 2 ? 0.25 : 0.15)), 2 * k, 0.25, lin(c, 9, 5, 15, 8, [[0, css(col)], [1, css(LEG.light)]]));
    polyline(c, m.slice(6).map((v, i) => v - (i % 2 ? 0.6 : 0.3)), 0.3, css(0xa6c3cc, 0.75));
    polyline(c, [11.5, 7.2 + oy, 12, 6.3 + oy, 12.6, 7.1 + oy, 13.1, 6.4 + oy], 0.3, css(IV.mid, 0.85));
  };
  mandible(-1.3, 0.88, LEG.dark);
  roundPoly(c, FACE, 1.2);
  c.lineWidth = 0.9; c.strokeStyle = css(INK); c.stroke();
  c.fillStyle = lin(c, 4, 3, 10, 8, [[0, css(LEG.mid)], [1, css(LEG.deep)]]); c.fill();
  polyline(c, [5, 7, 8, 7.6, 11, 7.3], 0.3, css(LEG.light, 0.6));
  mandible(0.6, 1, LEG.mid);
  // Horn off the brow: ivory, ringed, darker along its underside.
  taper(c, HORN, 5.2, 1, css(INK));
  taper(c, HORN.map((v, i) => v - (i % 2 ? 0.2 : 0.1)), 4.2, 0.4, lin(c, 6, -9, 14, -20, [[0, css(IV.mid)], [0.55, css(IV.light)], [1, css(0xf6f0e0)]]));
  taper(c, HORN.map((v, i) => v + (i % 2 ? 0.2 : 0.95)), 2, 0.1, css(IV.dark, 0.6));
  for (let i = 3; i < 12; i += 2) {
    const x = HORN[i * 2], y = HORN[i * 2 + 1], x2 = HORN[i * 2 + 2], y2 = HORN[i * 2 + 3];
    const a = Math.atan2(y2 - y, x2 - x) + Math.PI / 2, w = 2 - i * 0.13;
    polyline(c, [x - Math.cos(a) * w, y - Math.sin(a) * w, x + Math.cos(a) * w * 0.7, y + Math.sin(a) * w * 0.7], 0.22, css(IV.dark, 0.75));
  }
  polyline(c, HORN.slice(4, 22).map((v, i) => v - (i % 2 ? 0.2 : 0.95)), 0.45, css(0xffffff, 0.6));
  // The brass helm: domed, lit at the crown, a raised strap over it, rivets along the lower edge.
  roundPoly(c, SHIELD, 2.2);
  c.lineWidth = 1.2; c.strokeStyle = css(INK); c.stroke();
  c.fillStyle = rad(c, 1.5, -7.5, 0.5, 17, [[0, css(BR.light)], [0.28, css(BR.mid)], [0.7, css(BR.dark)], [1, css(BR.deep)]]);
  c.fill();
  c.save();
  roundPoly(c, SHIELD, 2.2);
  c.clip();
  // Edge bevel: bright along the crown, shadowed along the belly of the helm.
  c.translate(-0.6, -0.8);
  roundPoly(c, SHIELD, 2.2);
  c.lineWidth = 2; c.strokeStyle = css(BR.deep, 0.7); c.stroke();
  c.translate(1.1, 1.4);
  roundPoly(c, SHIELD, 2.2);
  c.lineWidth = 1; c.strokeStyle = css(BR.light, 0.65); c.stroke();
  c.translate(-0.5, -0.6);
  // A raised strap from the crown down to the lip, riveted.
  const strap = bez(2.6, -12, 5.6, -8, 7.6, -3, 8, 4, 8);
  taper(c, strap.map((v, i) => v + (i % 2 ? 0.5 : 0.4)), 3.2, 3, css(BR.deep, 0.6));
  taper(c, strap, 2.8, 2.6, lin(c, 3, -10, 9, 3, [[0, css(BR.light)], [0.5, css(BR.mid)], [1, css(BR.dark)]]));
  taper(c, strap.map((v) => v - 0.6), 0.5, 0.4, css(BR.spec, 0.7));
  for (let i = 1; i < 8; i += 2) {
    const x = strap[i * 2], y = strap[i * 2 + 1];
    c.beginPath(); c.arc(x + 0.1, y + 0.12, 0.5, 0, TAU); c.fillStyle = css(BR.deep); c.fill();
    c.beginPath(); c.arc(x, y, 0.4, 0, TAU); c.fillStyle = css(BR.mid); c.fill();
    c.beginPath(); c.arc(x - 0.12, y - 0.12, 0.15, 0, TAU); c.fillStyle = css(BR.spec); c.fill();
  }
  // Engraved flame on the side and scratches, then a long specular sweep along the crown.
  polyline(c, [-0.5, 1.6, -1.6, -1.4, 0, -4.4, 0.8, -2, 2.2, -3.6, 2.4, -0.4, 1, 1.6], 0.4, css(BR.deep, 0.85));
  polyline(c, [-0.2, 1.3, -1.1, -1.2], 0.2, css(BR.light, 0.6));
  const r = rng(31);
  for (let i = 0; i < 7; i++) {
    const x = -4 + r() * 15, y = -8 + r() * 10, a = -0.6 + r() * 1.2, l = 1 + r() * 2;
    polyline(c, [x, y, x + Math.cos(a) * l, y + Math.sin(a) * l], 0.2, css(BR.deep, 0.6));
    polyline(c, [x + 0.15, y + 0.2, x + 0.15 + Math.cos(a) * l, y + 0.2 + Math.sin(a) * l], 0.14, css(BR.spec, 0.5));
  }
  polyline(c, bez(-4.2, -3.6, -2, -9, 3.4, -10.6, 8.6, -8, 10), 0.75, css(BR.spec, 0.85));
  c.beginPath(); c.ellipse(-0.6, -8.2, 1.5, 0.55, -0.7, 0, TAU); c.fillStyle = css(0xffffff, 0.85); c.fill();
  // The lip's thickness: a lit band along the front edge with a dark underside.
  polyline(c, LIP.map((v, i) => v - (i % 2 ? 0.9 : 0)), 1.2, css(BR.light, 0.5));
  c.restore();
  polyline(c, LIP, 0.6, css(BR.deep));
  // Rivets along the lower edge.
  for (const [x, y] of [[-4.2, 1.6], [-2, 3.4], [0.8, 3.6], [3.6, 2.4], [11.2, 0.4], [12, -2.6]] as const) {
    c.beginPath(); c.arc(x + 0.12, y + 0.15, 0.55, 0, TAU); c.fillStyle = css(BR.deep); c.fill();
    c.beginPath(); c.arc(x, y, 0.45, 0, TAU); c.fillStyle = css(BR.mid); c.fill();
    c.beginPath(); c.arc(x - 0.13, y - 0.14, 0.17, 0, TAU); c.fillStyle = css(BR.spec); c.fill();
  }
  // Brass collar at the horn's root.
  const collar = [4, -11.3, 8.8, -11.1, 8.9, -9.2, 3.9, -9.4];
  roundPoly(c, collar, 0.7);
  c.lineWidth = 0.9; c.strokeStyle = css(INK); c.stroke();
  c.fillStyle = lin(c, 4, -10, 9, -10, [[0, css(BR.light)], [0.45, css(BR.mid)], [1, css(BR.dark)]]); c.fill();
  polyline(c, [4.6, -10.8, 8, -10.7], 0.3, css(BR.spec, 0.85));
  polyline(c, [4.4, -9.6, 8.4, -9.5], 0.3, css(BR.deep, 0.8));
}

// ---- legs ------------------------------------------------------------------------------------------

function legPaths(bx: number, by: number, kx: number, ky: number, fx: number, fy: number) {
  return {
    femur: bez(bx, by, bx + (kx - bx) * 0.4, by - 1.5, kx - (kx - bx) * 0.2, ky - 0.5, kx, ky, 6),
    tibia: bez(kx, ky, kx + (fx - kx) * 0.3, ky + (fy - ky) * 0.2, fx - (fx - kx) * 0.1, fy - (fy - ky) * 0.45, fx, fy, 6),
  };
}
function legMask(c: Ctx, bx: number, by: number, kx: number, ky: number, fx: number, fy: number) {
  const { femur, tibia } = legPaths(bx, by, kx, ky, fx, fy);
  taper(c, femur, 4.4, 3.8, '#000');
  taper(c, tibia, 3.8, 1.6, '#000');
}

/** One clawed leg from the body (bx, by) through a raised knee to the foot: flattened chitin segments, spined. */
function leg(c: Ctx, bx: number, by: number, kx: number, ky: number, fx: number, fy: number, far: boolean) {
  const base = far ? LEG.dark : LEG.mid;
  const top = far ? LEG.mid : LEG.light;
  const { femur, tibia } = legPaths(bx, by, kx, ky, fx, fy);
  const n = femur.length / 2, mid = Math.floor(n / 2);
  const f1 = femur.slice(0, (mid + 1) * 2), f2 = femur.slice(mid * 2);
  const wf = far ? 2.8 : 3.3, wt = far ? 2.1 : 2.5;
  const dir = fx >= kx ? 1 : -1;
  // Ink first, then the chitin, a lit upper edge and a dark underside.
  taper(c, f1, wf * 0.8 + 1.1, wf + 1.1, css(INK));
  taper(c, f2, wf + 1.1, wt + 1, css(INK));
  taper(c, tibia, wt + 1, 1.5, css(INK));
  taper(c, f1, wf * 0.8, wf, css(base));
  taper(c, f2, wf, wt, css(base));
  taper(c, tibia, wt, 0.6, css(base));
  taper(c, f1.map((v, i) => v + (i % 2 ? 0.75 : 0)), wf * 0.35, wf * 0.4, css(LEG.deep, 0.8));
  taper(c, f2.map((v, i) => v + (i % 2 ? 0.75 : 0)), wf * 0.4, wt * 0.3, css(LEG.deep, 0.8));
  taper(c, f1.map((v, i) => v - (i % 2 ? 0.75 : 0.25)), wf * 0.22, wf * 0.3, css(top));
  taper(c, f2.map((v, i) => v - (i % 2 ? 0.75 : 0.25)), wf * 0.3, wt * 0.2, css(top));
  taper(c, tibia.map((v, i) => v - (i % 2 ? 0.15 : dir * -0.45)), wt * 0.3, 0.15, css(top, 0.85));
  // Joint and spines along the shin.
  c.beginPath(); c.arc(kx, ky, wt * 0.45, 0, TAU); c.fillStyle = css(top); c.fill();
  c.lineWidth = 0.35; c.strokeStyle = css(INK); c.stroke();
  for (const t of [0.35, 0.62]) {
    const i = Math.round(t * (tibia.length / 2 - 1));
    const sx = tibia[i * 2], sy = tibia[i * 2 + 1];
    c.beginPath(); c.moveTo(sx - 0.5 * dir, sy - 0.5); c.lineTo(sx + 1.7 * dir, sy - 1.1); c.lineTo(sx + 0.3 * dir, sy + 0.5); c.closePath();
    c.fillStyle = css(IV.dark); c.fill(); c.lineWidth = 0.3; c.strokeStyle = css(INK); c.stroke();
  }
  // Hooked claws gripping the ground.
  for (const da of [-0.5, 0.5]) {
    const cx2 = fx + (dir * 1.4 + da * 1.2), cy2 = fy + 0.6;
    taper(c, [fx, fy - 0.2, (fx + cx2) / 2 + dir * 0.3, fy, cx2, cy2], 0.9, 0.15, css(INK));
    taper(c, [fx, fy - 0.3, (fx + cx2) / 2 + dir * 0.3, fy - 0.1, cx2, cy2 - 0.1], 0.5, 0.1, css(0xa9b8c8));
  }
}

// ---- frames -------------------------------------------------------------------------------------------

interface Pose {
  gait: number; low: number; head: number; nod: number; tilt: number; splay: number; reach: number;
  heat: Heat; dust: number; sparks: boolean; dizzy: boolean;
}

interface Cache { m: Map<string, HTMLCanvasElement> }
function stamp(cache: Cache, key: string, d: number, x0: number, y0: number, w: number, h: number, paint: (c: Ctx) => void) {
  const k = `${key}|${d}`;
  let c = cache.m.get(k);
  if (!c) {
    c = makeCanvas(w * d, h * d);
    const g = c.getContext('2d')!;
    g.setTransform(d, 0, 0, d, -x0 * d, -y0 * d);
    g.lineJoin = 'round'; g.lineCap = 'round';
    paint(g);
    cache.m.set(k, c);
  }
  return c;
}
const CAR = { x0: -23, y0: -17, w: 44, h: 30 };
const HEAD = { x0: -11, y0: -23, w: 28, h: 34 };

function frame(o: Pose, cache: Cache): Painter {
  const cx = 26, cy = FY - 15 + o.low;
  const hx = cx + 16 + o.head, hy = cy + 1 + o.nod * 2.5;
  // Leg roots (rear, middle, front) and where each foot lands.
  const legs = (far: boolean) => [0, 1, 2].map((i) => {
    // Tripod gait: near rear and front legs move with the far middle one, and the other three opposite.
    const walking = o.gait >= 0;
    const ph = o.gait + (i % 2) * Math.PI + (far ? Math.PI : 0);
    const swing = walking ? Math.cos(ph) * 2.6 * (o.reach ? 0.5 : 1) : 0, lift = walking ? Math.max(0, Math.sin(ph)) * 2.2 : 0;
    const dir = [-1, -0.15, 1][i];
    const bx = cx + [-11, -1, 7][i] + (far ? 1.5 : 0), by = cy + (far ? 3.2 : 6.5);
    const out = 1 + o.splay * 0.35;
    const reach = o.reach * (i === 2 ? 3 : i === 0 ? -3.5 : 0);
    const fx = bx + dir * 8.5 * out + swing + reach + (i === 1 ? (far ? 1.5 : -1.5) : 0);
    const fy = (far ? FY - 3.6 : FY - 0.6) - lift;
    const kx = bx + dir * 6.5 * out + reach * 0.5 + (i === 1 ? (far ? 2.5 : -2.5) : 0), ky = by - (far ? 4 : 4.4) - o.splay * 0.5;
    return { bx, by, kx, ky, fx, fy };
  });
  return (g, e) => {
    if (live(g)) {
      const d = scaleOf(g);
      const car = stamp(cache, `car${o.heat}`, d, CAR.x0, CAR.y0, CAR.w, CAR.h, (c) => paintCarapace(c, o.heat));
      const head = stamp(cache, 'head', d, HEAD.x0, HEAD.y0, HEAD.w, HEAD.h, paintHead);
      if (o.dust) dustBehind(g, cx, o.dust);
      figure(g, W, H, (f) => {
        for (const L of legs(true)) leg(f, L.bx, L.by, L.kx, L.ky, L.fx, L.fy, true);
        f.save();
        f.translate(cx, cy);
        f.rotate(o.tilt);
        f.drawImage(car, CAR.x0, CAR.y0, CAR.w, CAR.h);
        f.restore();
        for (const L of legs(false)) leg(f, L.bx, L.by, L.kx, L.ky, L.fx, L.fy, false);
        // Contact shadow of the head on the carapace's front, then the head.
        f.save();
        f.globalCompositeOperation = 'source-atop';
        f.fillStyle = rad(f, hx - 3, hy + 1, 0, 9, [[0, 'rgba(4,8,12,0.55)'], [1, 'rgba(4,8,12,0)']]);
        f.fillRect(hx - 13, hy - 9, 18, 18);
        f.restore();
        f.save();
        f.translate(hx, hy);
        f.rotate(o.nod * 0.28 + o.tilt);
        f.drawImage(head, HEAD.x0, HEAD.y0, HEAD.w, HEAD.h);
        // Eyes in the visor slit.
        for (const [x, y, s] of EYES) {
          const col = o.heat === 'stun' ? DULL : o.heat ? EMBER.hot : EMBER.light;
          f.beginPath(); f.ellipse(x, y, 1.15 * s, 0.6 * s, -0.25, 0, TAU); f.fillStyle = css(0x080303); f.fill();
          f.beginPath(); f.ellipse(x, y + 0.05, 0.9 * s, 0.42 * s, -0.25, 0, TAU); f.fillStyle = css(col); f.fill();
          if (o.heat !== 'stun') { f.beginPath(); f.ellipse(x + 0.15, y, 0.42 * s, 0.2 * s, -0.25, 0, TAU); f.fillStyle = css(EMBER.white); f.fill(); }
        }
        f.restore();
        // Ground shadow under the belly, cast up onto the legs' roots.
        f.save();
        f.globalCompositeOperation = 'source-atop';
        f.fillStyle = lin(f, 0, cy + 3, 0, FY + 1, [[0, 'rgba(4,8,12,0)'], [1, 'rgba(4,8,12,0.35)']]);
        f.fillRect(0, cy + 3, W, FY - cy);
        f.restore();
      }, { ink: INK, inkW: 0.55, rim: 0xb9d2ec, rimW: 0.7, rimA: 0.6, shadeW: 1.1, shadeA: 0.3 });
      if (o.dizzy) dizzy(g, hx, hy, false);
    }
    if (live(e)) {
      const de = scaleOf(e);
      const E = layer(W, H, de);
      E.g.save();
      E.g.translate(cx, cy);
      E.g.rotate(o.tilt);
      carapaceEmit(E.g, o.heat);
      E.g.restore();
      // The near legs stand in front of the seams.
      E.g.save();
      E.g.globalCompositeOperation = 'destination-out';
      for (const L of legs(false)) legMask(E.g, L.bx, L.by, L.kx, L.ky, L.fx, L.fy);
      E.g.restore();
      E.g.save();
      E.g.translate(hx, hy);
      E.g.rotate(o.nod * 0.28 + o.tilt);
      // The head hides the seams behind it; its eyes glow in the visor.
      E.g.globalCompositeOperation = 'destination-out';
      roundPoly(E.g, SHIELD, 2);
      E.g.fill();
      E.g.globalCompositeOperation = 'lighter';
      const hot = o.heat === 'stun' ? 0 : o.heat === 2 ? 1.4 : o.heat === 1 ? 1.15 : 0.9;
      for (const [x, y, s] of EYES) {
        if (o.heat === 'stun') { glow(E.g, x, y, 2.4, DULL, 0.5); continue; }
        glow(E.g, x, y, (3.4 + hot * 1.5) * s, EMBER.mid, 0.85, 0.25);
        E.g.beginPath(); E.g.ellipse(x, y + 0.05, 0.9 * s, 0.42 * s, -0.25, 0, TAU); E.g.fillStyle = css(EMBER.white); E.g.fill();
      }
      E.g.restore();
      if (o.sparks) sparksBehind(E.g, cx, cy);
      if (o.heat === 2 && !o.sparks) embersRising(E.g, cx, cy);
      if (o.dizzy) dizzy(E.g, hx, hy, true);
      e.drawImage(E.c, 0, 0, W, H);
    }
  };
}

/** Dust kicked up behind the rear legs (body layer, soft, no outline). */
function dustBehind(g: Ctx, cx: number, k: number) {
  const r = rng(5);
  for (let i = 0; i < 6; i++) {
    const x = cx - 18 - i * 2.4 - r() * 2, y = FY - 1.5 - r() * 2.5 - i * 0.4, s = 2 + r() * 1.8 + i * 0.3;
    g.fillStyle = rad(g, x, y, 0, s, [[0, `rgba(132,140,160,${(0.42 - i * 0.05) * k})`], [1, 'rgba(132,140,160,0)']]);
    g.fillRect(x - s, y - s, s * 2, s * 2);
  }
}
/** Charge: ember sparks streaming back from the seams. */
function sparksBehind(E: Ctx, cx: number, cy: number) {
  const r = rng(9);
  for (let i = 0; i < 8; i++) {
    const x = cx - 8 - r() * 16, y = cy - 8 + r() * 10, l = 2 + r() * 4;
    taper(E, [x, y, x - l, y + 0.3], 0.7, 0.1, css(i % 3 ? EMBER.light : EMBER.white, 0.9));
  }
}
/** Windup at full heat: embers lifting off the seams. */
function embersRising(E: Ctx, cx: number, cy: number) {
  const r = rng(13);
  for (let i = 0; i < 7; i++) {
    const x = cx - 12 + r() * 22, y = cy - 12 - r() * 8, s = 0.35 + r() * 0.4;
    glow(E, x, y, 1.8 + s * 2, EMBER.mid, 0.7);
    E.beginPath(); E.arc(x, y, s, 0, TAU); E.fillStyle = css(EMBER.hot); E.fill();
  }
}
/** Stunned: little four-point stars circling over the horn, with a faint orbit trail. */
function dizzy(c: Ctx, hx: number, hy: number, emissive: boolean) {
  const ox = hx + 6, oy = hy - 20;
  if (emissive) {
    c.beginPath(); c.ellipse(ox, oy, 6.5, 2.2, -0.1, 0, TAU);
    c.lineWidth = 0.5; c.strokeStyle = css(EMBER.light, 0.35); c.stroke();
  }
  for (let i = 0; i < 4; i++) {
    const a = i * (TAU / 4) + 0.5;
    const x = ox + Math.cos(a) * 6.5, y = oy + Math.sin(a) * 2.2, s = 1.1 + (Math.sin(a) + 1) * 0.35;
    if (emissive) glow(c, x, y, 3.4 * s, EMBER.light, 0.8);
    c.beginPath();
    for (let k = 0; k < 8; k++) {
      const rr = k % 2 ? s * 0.38 : s * 1.3, b = (k / 8) * TAU;
      c.lineTo(x + Math.cos(b) * rr, y + Math.sin(b) * rr);
    }
    c.closePath();
    if (!emissive) { c.lineWidth = 0.5; c.strokeStyle = css(INK, 0.8); c.stroke(); }
    c.fillStyle = css(i % 2 ? EMBER.hot : EMBER.white); c.fill();
  }
}

export function beetleSprites(): SpriteSet {
  const cache: Cache = { m: new Map() };
  const b: Pose = { gait: -1, low: 0, head: 0, nod: 0, tilt: 0, splay: 0, reach: 0, heat: 0, dust: 0, sparks: false, dizzy: false };
  const F = (p: Partial<Pose>) => frame({ ...b, ...p }, cache);
  const Q = Math.PI / 2;
  return {
    w: W, h: H, footY: FY,
    anims: {
      idle: [F({ gait: -1 }), F({ gait: -1, low: 0.6, nod: 0.08 })],
      run: [0, 1, 2, 3].map((i) => F({ gait: i * Q, low: i % 2 ? 0 : -0.7, nod: i % 2 ? 0.05 : -0.05 })),
      windup: [
        F({ gait: -1, low: 2, head: -2, nod: 0.25, splay: 1, heat: 1, dust: 0.6 }),
        F({ gait: -1, low: 2.8, head: -2.4, nod: 0.32, splay: 1.2, heat: 2, dust: 1 }),
      ],
      charge: [
        F({ gait: 0, low: 1, head: 2.2, nod: 0.18, tilt: 0.05, reach: 1, heat: 2, dust: 1, sparks: true }),
        F({ gait: Math.PI, low: 0.4, head: 2.2, nod: 0.14, tilt: 0.04, reach: 1, heat: 2, dust: 0.8, sparks: true }),
      ],
      stunned: [F({ gait: -1, low: 3, head: -0.5, nod: 0.75, splay: 1.4, heat: 'stun', dizzy: true })],
    },
  };
}
