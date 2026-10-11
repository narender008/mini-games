// World 3, Circus: inside a big top at night. The "sky" is the canvas roof, red
// and cream stripes fanning from the apex under a string of bulbs and bunting,
// with coloured spotlight beams crossing it. Three strips of stands rise
// behind the ring, a silhouetted crowd with raised arms, balloons and popcorn,
// all lit from above, and a red and white ring barrier at the front. The
// ground is a sawdust floor with a red and white ring kerb on its edge.
import { seeded, mix, settle, alpha, grad, radial, glow, wrap, mist, edge, band, stripes, strata, scatter, depthFill, inSolid, TAU } from './kit.js';

const FOG = '#4a1830';
const RED = '#d02a3c';
const CREAM = '#f0e2c2';

function sky(ctx, w, h) {
  const r = seeded(41);
  const ax = w * 0.5;
  const ay = -h * 0.55;
  const n = 26;
  const R = h * 4;
  for (let i = 0; i < n; i++) {
    const a0 = -1.25 + (i / n) * 2.5;
    const a1 = -1.25 + ((i + 1) / n) * 2.5;
    const x0 = ax + Math.sin(a0) * R;
    const y0 = ay + Math.cos(a0) * R;
    const x1 = ax + Math.sin(a1) * R;
    const y1 = ay + Math.cos(a1) * R;
    const base = i % 2 ? CREAM : RED;
    // each stripe is a billowing panel: darker on its right edge, brighter in the middle
    const mxa = ax + Math.sin(a0) * h * 0.9;
    const mxb = ax + Math.sin(a1) * h * 0.9;
    ctx.fillStyle = grad(ctx, mxa, 0, mxb, 0, [[0, mix(base, '#000000', 0.12)], [0.35, base], [0.7, mix(base, '#ffffff', 0.04)], [1, mix(base, '#000000', 0.38)]]);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.closePath();
    ctx.fill();
  }
  // the canvas darkens away from the rig lights toward the walls and the floor
  ctx.fillStyle = radial(ctx, w * 0.5, h * 0.22, w * 0.85, [[0, 'rgba(255,200,120,0.18)'], [0.4, 'rgba(60,10,40,0.2)'], [1, 'rgba(14,2,24,0.82)']]);
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = grad(ctx, 0, h * 0.35, 0, h * 0.66, [[0, 'rgba(20,4,30,0)'], [1, 'rgba(24,4,32,0.85)']]);
  ctx.fillRect(0, h * 0.35, w, h * 0.65);
  // spotlight beams from the rig
  const beams = [[0.14, '#fff0c0', 0.42, 0.9], [0.34, '#ff8cc8', 0.62, 0.8], [0.5, '#ffe29a', 0.46, 1], [0.7, '#8fd8ff', 0.4, 0.8], [0.88, '#fff0c0', 0.6, 0.9]];
  for (const [sx, col, tx, k] of beams) {
    for (let p = 0; p < 3; p++) {
      const spread = 0.02 + p * 0.016;
      const x0 = w * sx;
      const x1 = w * tx;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = grad(ctx, x0, h * 0.02, x1, h * 0.7, [[0, alpha(col, 0.2 * k)], [0.6, alpha(col, 0.08 * k)], [1, alpha(col, 0)]]);
      ctx.beginPath();
      ctx.moveTo(x0 - w * 0.008 * (p + 1), h * 0.02);
      ctx.lineTo(x0 + w * 0.008 * (p + 1), h * 0.02);
      ctx.lineTo(x1 + w * (spread + 0.07), h * 0.7);
      ctx.lineTo(x1 - w * (spread + 0.07), h * 0.7);
      ctx.fill();
      ctx.restore();
    }
    glow(ctx, w * sx, h * 0.02, h * 0.12, col, 0.8);
  }
  // bulb strings and bunting across the roof
  for (const [yy, sag, flags] of [[0.07, 0.07, 26], [0.13, 0.05, 20]]) {
    ctx.strokeStyle = 'rgba(20,6,16,0.8)';
    ctx.lineWidth = h * 0.003;
    ctx.beginPath();
    ctx.moveTo(-5, h * yy);
    ctx.quadraticCurveTo(w * 0.5, h * (yy + sag * 2), w + 5, h * yy);
    ctx.stroke();
    for (let i = 0; i < flags; i++) {
      const t = (i + 0.5) / flags;
      const bx = w * t;
      const by = h * (yy + sag * 2 * t * (1 - t) * 2);
      const c = ['#e83a4a', '#ffd23a', '#2fa8e8', '#f4eed8', '#3ac878'][i % 5];
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(bx - h * 0.014, by);
      ctx.lineTo(bx + h * 0.014, by);
      ctx.lineTo(bx, by + h * 0.034);
      ctx.fill();
      if (i % 2 === 0) glow(ctx, bx, by - h * 0.006, h * 0.02, '#ffe8a0', 0.7);
    }
  }
  // sparkle in the air
  for (let i = 0; i < 70; i++) {
    const x = r() * w;
    const y = h * (0.1 + r() * 0.5);
    ctx.fillStyle = alpha(['#ffe8a0', '#ff9ad0', '#9adfff'][(r() * 3) | 0], 0.15 + r() * 0.5);
    ctx.beginPath();
    ctx.arc(x, y, h * (0.0015 + r() * 0.002), 0, TAU);
    ctx.fill();
  }
}

// ---------------------------------------------------------------- the crowd
// tiers of stands from y0 up, each a bench front and a row of people
function stands(ctx, r, w, h, o) {
  const u = h / 100;
  const tiers = o.tiers;
  const th = o.th * u;
  ctx.fillStyle = grad(ctx, 0, o.y0 - tiers * th, 0, o.y0, [[0, o.top], [1, o.bot]]);
  ctx.fillRect(0, o.y0 - tiers * th, w, tiers * th + 1);
  for (let t = tiers - 1; t >= 0; t--) {
    const yt = o.y0 - t * th;
    // the bench face
    ctx.fillStyle = grad(ctx, 0, yt - th, 0, yt, [[0, mix(o.benchBot, o.benchTop, t / Math.max(1, tiers - 1))], [1, mix(o.benchBot, o.bot, 0.5)]]);
    ctx.fillRect(0, yt - th, w, th + 1);
    ctx.fillStyle = alpha(o.rim, 0.55);
    ctx.fillRect(0, yt - th * 0.35, w, Math.max(1, u * 0.3));
    // people, on a fixed periodic grid so the crowd wraps cleanly
    const hs = o.head * u;
    const n = Math.max(4, Math.round(w / (hs * 1.95)));
    for (let i = 0; i < n; i++) {
      const pr = seeded(t * 977 + i * 31 + o.salt);
      wrap(w, (i + 0.5 + (pr() - 0.5) * 0.5) * (w / n), hs * 3.2, (x, r) => {
        const arm = r() < o.arms;
        const by = yt - th * 0.35;
        const col = mix(o.body, ['#4a2a5a', '#5a2a3a', '#2a2a5a', '#5a4a2a'][(r() * 4) | 0], 0.5 * r());
        ctx.fillStyle = col;
        // shoulders and head
        ctx.beginPath();
        ctx.ellipse(x, by + hs * 0.2, hs * 1.15, hs * 1.3, 0, Math.PI, 0);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, by - hs * 1.15, hs * 0.62, 0, TAU);
        ctx.fill();
        // lit side of the head
        ctx.strokeStyle = alpha(o.rim, 0.55 + r() * 0.3);
        ctx.lineWidth = Math.max(1, hs * 0.16);
        ctx.beginPath();
        ctx.arc(x, by - hs * 1.15, hs * 0.62, Math.PI * 1.05, Math.PI * 1.85);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(x, by + hs * 0.2, hs * 1.15, hs * 1.3, 0, Math.PI * 1.15, Math.PI * 1.75);
        ctx.stroke();
        ctx.fillStyle = alpha(o.skin, o.lit * (0.4 + r() * 0.8));
        ctx.beginPath();
        ctx.arc(x - hs * 0.12, by - hs * 1.22, hs * 0.5, Math.PI * 0.9, Math.PI * 1.9);
        ctx.fill();
        if (arm) {
          ctx.strokeStyle = col;
          ctx.lineWidth = hs * 0.42;
          ctx.lineCap = 'round';
          const dx = (r() - 0.5) * hs * 1.6;
          ctx.beginPath();
          ctx.moveTo(x + hs * 0.7, by - hs * 0.2);
          ctx.lineTo(x + hs * 0.9 + dx, by - hs * 2.7);
          ctx.stroke();
          if (r() < 0.3) {
            const sc = ['#ffd23a', '#ff6aa8', '#5ad0ff', '#7aff8a'][(r() * 4) | 0];
            ctx.fillStyle = sc;
            ctx.fillRect(x + hs * 0.8 + dx, by - hs * 3.9, hs * 0.3, hs * 1.4);
            glow(ctx, x + hs * 0.95 + dx, by - hs * 3.2, hs * 2.2, sc, 0.5);
          }
        }
      });
    }
  }
}
function garland(ctx, w, y, sag, count, size, step) {
  ctx.strokeStyle = 'rgba(12,2,14,0.85)';
  ctx.lineWidth = Math.max(1, size * 0.12);
  const segs = Math.round(w / step);
  for (let s = 0; s < segs; s++) {
    const x0 = (s * w) / segs;
    const x1 = ((s + 1) * w) / segs;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.quadraticCurveTo((x0 + x1) / 2, y + sag * 2, x1, y);
    ctx.stroke();
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const bx = x0 + (x1 - x0) * t;
      const by = y + sag * 2 * t * (1 - t) * 2;
      ctx.fillStyle = ['#e83a4a', '#ffd23a', '#2fa8e8', '#f4eed8', '#3ac878'][(s * count + i) % 5];
      ctx.beginPath();
      ctx.moveTo(bx - size * 0.5, by);
      ctx.lineTo(bx + size * 0.5, by);
      ctx.lineTo(bx, by + size * 1.2);
      ctx.fill();
    }
  }
}

// ----------------------------------------------------------------- layer 0
const BASE0 = mix('#2c1030', FOG, 0.4);
function farStands(ctx, w, h) {
  const r = seeded(42);
  const u = h / 100;
  stands(ctx, r, w, h, { salt: 1, y0: h - 2 * u, tiers: 9, th: 6.2, head: 1.5, top: '#3a1a40', bot: '#2c1030', benchTop: '#7a3a60', benchBot: '#3e1a48', body: '#190a22', skin: '#ff9a7a', lit: 0.18, arms: 0.05, rim: '#c08aa8' });
  // the performers' entrance: a lit archway with a curtain
  wrap(w, w * 0.4, u * 14, (x, r) => {
    ctx.fillStyle = '#12061a';
    ctx.beginPath();
    ctx.moveTo(x - u * 7, h - 2 * u);
    ctx.lineTo(x - u * 7, h - 22 * u);
    ctx.quadraticCurveTo(x, h - 32 * u, x + u * 7, h - 22 * u);
    ctx.lineTo(x + u * 7, h - 2 * u);
    ctx.fill();
    ctx.fillStyle = grad(ctx, 0, h - 28 * u, 0, h - 2 * u, [[0, '#ffb84a'], [1, '#b02a50']]);
    ctx.beginPath();
    ctx.moveTo(x - u * 5, h - 2 * u);
    ctx.lineTo(x - u * 5, h - 21 * u);
    ctx.quadraticCurveTo(x, h - 29 * u, x + u * 5, h - 21 * u);
    ctx.lineTo(x + u * 5, h - 2 * u);
    ctx.fill();
    glow(ctx, x, h - 14 * u, u * 18, '#ffb060', 0.35);
  });
  garland(ctx, w, h * 0.46, u * 2.4, 6, u * 1.7, w / 8);
  mist(ctx, w, h, FOG, 0.4, 0.4);
  settle(ctx, w, h, BASE0);
}

// ----------------------------------------------------------------- layer 1
const BASE1 = mix('#321338', FOG, 0.25);
function midStands(ctx, w, h) {
  const r = seeded(43);
  const u = h / 100;
  stands(ctx, r, w, h, { salt: 2, y0: h - 2 * u, tiers: 7, th: 7.4, head: 2.1, top: '#4a1c48', bot: '#321338', benchTop: '#a04a70', benchBot: '#4a1c4a', body: '#1c0a24', skin: '#ffa888', lit: 0.3, arms: 0.1, rim: '#ffc0a0' });
  garland(ctx, w, h * 0.3, u * 3, 7, u * 2.2, w / 6);
  // balloons drifting over the crowd
  for (let i = 0; i < 16; i++) {
    const x = r() * w;
    const y = h * (0.28 + r() * 0.3);
    const col = ['#ff4a5a', '#ffd23a', '#3ab0f0', '#7adf6a', '#ff8ad0'][(r() * 5) | 0];
    wrap(w, x, u * 4, (xx, r) => {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = Math.max(1, u * 0.12);
      ctx.beginPath();
      ctx.moveTo(xx, y + u * 3);
      ctx.quadraticCurveTo(xx + u, y + u * 6, xx - u * 0.5, y + u * 10);
      ctx.stroke();
      ctx.fillStyle = grad(ctx, xx - u * 2, y - u * 3, xx + u * 2, y + u * 3, [[0, '#ffffff'], [0.25, col], [1, mix(col, '#000000', 0.5)]]);
      ctx.beginPath();
      ctx.ellipse(xx, y, u * 2.3, u * 3, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(xx - u * 0.5, y + u * 3);
      ctx.lineTo(xx + u * 0.5, y + u * 3);
      ctx.lineTo(xx, y + u * 3.7);
      ctx.fill();
    });
  }
  mist(ctx, w, h, FOG, 0.5, 0.25);
  settle(ctx, w, h, BASE1);
}

// ----------------------------------------------------------------- layer 2
const BASE2 = '#2a0e26';
function frontStands(ctx, w, h) {
  const r = seeded(44);
  const u = h / 100;
  stands(ctx, r, w, h, { salt: 3, y0: h - 2 * u, tiers: 5, th: 9, head: 3, top: '#3c1440', bot: '#2a0e26', benchTop: '#b85a78', benchBot: '#58244e', body: '#180820', skin: '#ffb090', lit: 0.4, arms: 0.16, rim: '#ffd0b0' });
  // pennant strings across the front of the stands
  garland(ctx, w, h * 0.34, u * 3.4, 5, u * 2.6, w / 5);
  // popcorn sellers' stripes and a few flags on poles
  for (let i = 0; i < 5; i++) {
    const x = (i + 0.5) * (w / 5);
    ctx.fillStyle = '#12061a';
    ctx.fillRect(x - u * 0.3, h * 0.2, u * 0.6, h * 0.45);
    ctx.fillStyle = [RED, CREAM, '#ffc21a', '#2a8ae0', RED][i];
    ctx.beginPath();
    ctx.moveTo(x + u * 0.3, h * 0.2);
    ctx.lineTo(x + u * 6, h * 0.2 + u * 1.6);
    ctx.lineTo(x + u * 0.3, h * 0.2 + u * 4);
    ctx.fill();
  }
  settle(ctx, w, h, BASE2);
}

// ----------------------------------------------------------------- layer 3
const BASE3 = '#1e0a1c';
function ringBarrier(ctx, w, h) {
  const r = seeded(45);
  const u = h / 100;
  const y0 = h - 8 * u;
  // the apron behind the boards
  ctx.fillStyle = BASE3;
  ctx.fillRect(0, y0, w, h - y0);
  // red and white scalloped boards with gold trim
  const bw = w / Math.round(w / (u * 24));
  for (let x = 0; x < w - 1; x += bw) {
    const k = Math.round(x / bw);
    ctx.fillStyle = grad(ctx, 0, y0 - u * 16, 0, y0 + u * 3, [[0, k % 2 ? '#fff0d0' : '#f03a4c'], [1, k % 2 ? '#c8b090' : '#a01a30']]);
    ctx.fillRect(x, y0 - u * 14, bw + 0.6, u * 17);
    ctx.fillStyle = k % 2 ? 'rgba(208,42,60,0.9)' : 'rgba(250,236,200,0.9)';
    // a star on every board
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 ? u * 1.4 : u * 3.2;
      const an = (i / 10) * TAU - Math.PI / 2;
      ctx.lineTo(x + bw / 2 + Math.cos(an) * rad, y0 - u * 6 + Math.sin(an) * rad);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#12061a';
    ctx.fillRect(x, y0 - u * 14, Math.max(1, u * 0.35), u * 17);
  }
  ctx.fillStyle = grad(ctx, 0, y0 - u * 17, 0, y0 - u * 14, [[0, '#ffe08a'], [1, '#c8861e']]);
  ctx.fillRect(0, y0 - u * 16, w, u * 2.4);
  ctx.fillStyle = '#c8861e';
  ctx.fillRect(0, y0 + u * 1.4, w, u * 1.6);
  // bulbs along the top rail
  for (let x = bw / 4; x < w; x += bw / 2) {
    ctx.fillStyle = '#fff2b0';
    ctx.beginPath();
    ctx.arc(x, y0 - u * 17.6, u * 0.8, 0, TAU);
    ctx.fill();
    glow(ctx, x, y0 - u * 17.6, u * 4, '#ffd070', 0.6);
  }
  // a prop or two in front: striped drums
  for (const fx of [0.3, 0.78]) {
    wrap(w, fx * w, u * 10, (x, r) => {
      for (let k = 0; k < 3; k++) {
        const dx = x + (k - 1) * u * 9;
        const ht = u * (9 + (k === 1 ? 4 : 0));
        ctx.fillStyle = grad(ctx, dx - u * 4, 0, dx + u * 4, 0, [[0, '#ff5a6a'], [0.5, RED], [1, '#7a1424']]);
        ctx.fillRect(dx - u * 4, y0 - ht + u * 3, u * 8, ht);
        ctx.fillStyle = CREAM;
        ctx.fillRect(dx - u * 4, y0 - ht + u * 3 + ht * 0.3, u * 8, ht * 0.18);
        ctx.fillStyle = '#ffe08a';
        ctx.beginPath();
        ctx.ellipse(dx, y0 - ht + u * 3, u * 4, u * 1.2, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#c8861e';
        ctx.fillRect(dx - u * 4, y0 + u * 2.4, u * 8, u * 0.6);
      }
    });
  }
  ctx.fillStyle = BASE3;
  ctx.fillRect(0, y0 + u * 3, w, h - y0);
  settle(ctx, w, h, BASE3);
}

// ------------------------------------------------------------------ ground
const SAWDUST = [[0, '#f2cc90'], [0.3, '#e6b878'], [0.9, '#cc9a60'], [1.8, '#a87a48'], [3.4, '#6e4a2c'], [9, '#2a1710']];
function paintGround(ctx, solid, surface, b) {
  inSolid(ctx, solid, () => {
    depthFill(ctx, surface, SAWDUST, 9);
    band(ctx, surface, 0.3, 0.5, 'rgba(255,240,200,0.2)');
    // shavings, flecks and curls
    scatter(ctx, surface, b, 21, 30, 0.34, 3, (x, y, r) => {
      ctx.fillStyle = r() < 0.6 ? 'rgba(255,240,200,0.4)' : 'rgba(80,40,20,0.35)';
      ctx.fillRect(x, y, 0.03 + r() * 0.05, 0.02 + r() * 0.025);
    });
    scatter(ctx, surface, b, 22, 3, 0.4, 2.4, (x, y, r) => {
      ctx.strokeStyle = r() < 0.5 ? 'rgba(255,236,190,0.5)' : 'rgba(90,50,24,0.4)';
      ctx.lineWidth = 0.02;
      ctx.beginPath();
      ctx.arc(x, y, 0.05 + r() * 0.07, r() * 3, r() * 3 + 2.6);
      ctx.stroke();
    });
    // the ring kerb: red and cream boards
    stripes(ctx, surface, b, 0, 0.34, 0.9, RED, CREAM, 0);
    band(ctx, surface, 0, 0.1, 'rgba(255,255,255,0.28)');
    band(ctx, surface, 0.26, 0.34, 'rgba(60,10,20,0.35)');
    strata(ctx, surface, { cols: ['#f2cc90', '#8a6038', '#c9975c', '#4a2c1a'], reach: 1.0, thick: [0.15, 0.4], alpha: 0.28, lines: '#2a1710' });
  });
  edge(ctx, surface, 0.07, '#1d1320', 0);
  edge(ctx, surface, 0.04, '#e8a824', 0.03);
  edge(ctx, surface, 0.025, '#1d1320', 0.34);
}

export const circus = {
  name: 'Circus',
  sky,
  layers: [
    { depth: 0.1, height: 0.46, paint: farStands, base: BASE0 },
    { depth: 0.24, height: 0.44, paint: midStands, base: BASE1 },
    { depth: 0.44, height: 0.38, paint: frontStands, base: BASE2 },
    { depth: 0.66, height: 0.3, paint: ringBarrier, base: BASE3 },
  ],
  ground: { paint: paintGround, deep: '#2a1710' },
  fog: FOG,
  ambient: 'confetti',
  water: null,
  lava: null,
};
