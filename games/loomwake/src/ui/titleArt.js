// The title screen's painted, animated backdrop: the Weaver asleep behind her
// great loom in the Reverie sky, the tapestry half-woven and unravelling into
// loose threads (some already turned black), floating crystal islands, and Iri
// small on the Loomhall ledge with their golden scarf in the wind.
// Static layers are painted once per resize into CPU canvases; the frame only
// composites them and animates threads, scarf, motes and stars.

const TAU = Math.PI * 2;
function mk(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); c.getContext('2d', { willReadFrequently: true }); return c; }
function rng(seed) { let s = seed >>> 0; const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; r.range = (a, b) => a + (b - a) * r(); r.pick = (a) => a[Math.floor(r() * a.length)]; return r; }
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
const glowCache = new Map();
function glow(color) {
  let c = glowCache.get(color); if (c) return c;
  c = mk(128, 128); const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, hexA(color, 1)); gr.addColorStop(0.2, hexA(color, 0.5)); gr.addColorStop(0.55, hexA(color, 0.12)); gr.addColorStop(1, hexA(color, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); glowCache.set(color, c); return c;
}

export function createTitleArt(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  let L = null; // cached layers + geometry
  let raf = 0, running = false, t0 = performance.now(), last = t0;
  const motes = [];
  const R = rng(99);

  function layout() {
    // loom geometry in CSS px; keeps clear of the left menu column
    const narrow = W < 760;
    const cx = narrow ? W * 0.62 : W * 0.64;
    const lw = Math.min(W * (narrow ? 0.62 : 0.42), H * 0.95);
    const top = H * 0.08;
    // the ledge sits above the profile row, so Iri stands in plain view
    const bot = H * 0.71;
    return { cx, lw, top, bot, x0: cx - lw / 2, x1: cx + lw / 2, ledgeY: H * 0.74 };
  }

  function build() {
    const r = rng(7);
    const geo = layout();
    // --- sky ---
    const sky = mk(W, H); const g = sky.getContext('2d');
    let gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#03041a'); gr.addColorStop(0.45, '#0e0c34'); gr.addColorStop(0.8, '#251242'); gr.addColorStop(1, '#120a26');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 12; i++) {
      const x = r() * W, y = r() * H * 0.8, rr = r.range(160, 480) * (W / 1280 + 0.4);
      const col = r.pick(['#3a2a8a', '#1a4a7a', '#5a2a6a', '#174a5a', '#4a2a7a']);
      const cg = g.createRadialGradient(x, y, 0, x, y, rr);
      cg.addColorStop(0, hexA(col, 0.42)); cg.addColorStop(1, hexA(col, 0));
      g.fillStyle = cg; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    // warm light behind the loom
    gr = g.createRadialGradient(geo.cx, H * 0.38, 0, geo.cx, H * 0.38, geo.lw * 1.1);
    gr.addColorStop(0, 'rgba(255,205,130,0.30)'); gr.addColorStop(0.4, 'rgba(200,120,160,0.12)'); gr.addColorStop(1, 'rgba(60,30,90,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 900; i++) {
      const a = r() * 0.7; g.fillStyle = `rgba(255,255,255,${a})`;
      const s = r() < 0.96 ? 1 : 2; g.fillRect(r() * W, r() * H * 0.85, s, s);
    }
    // --- far islands ---
    const far = mk(W, H); const f = far.getContext('2d');
    for (let i = 0; i < 14; i++) {
      const x = r() * W, y = r.range(H * 0.3, H * 0.75), s = r.range(0.35, 1.1) * (H / 720);
      if (Math.abs(x - geo.cx) < geo.lw * 0.45 && y < H * 0.7) continue;
      island(f, x, y, s, r, 0.75);
    }
    // --- the Weaver: veiled, asleep, head resting against the beam ---
    const wv = mk(W, H); const w = wv.getContext('2d');
    paintWeaver(w, geo);
    // --- loom frame ---
    const loom = mk(W, H); const l = loom.getContext('2d');
    paintLoom(l, geo, r);
    // --- woven tapestry band (top part of the warp) ---
    const cloth = mk(W, H); const c = cloth.getContext('2d');
    paintCloth(c, geo, r);
    // --- ledge with the Loomhall arch remains ---
    const ledge = mk(W, H); const d = ledge.getContext('2d');
    paintLedge(d, geo, r);
    // warp thread rest positions
    const n = Math.round(Math.min(46, Math.max(24, geo.lw / 11)));
    const warps = [];
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const x = geo.x0 + geo.lw * 0.08 + u * geo.lw * 0.84;
      const loose = r() < 0.55;
      const black = u < 0.35 && r() < 0.6 - u;
      warps.push({ x, loose, black, len: r.range(0.55, 0.95), ph: r() * TAU, sp: r.range(0.5, 1.2) });
    }
    const stars = []; for (let i = 0; i < 70; i++) stars.push({ x: r() * W, y: r() * H * 0.7, ph: r() * TAU, s: r.range(0.8, 2.2), sp: r.range(0.6, 2) });
    L = { sky, far, wv, loom, cloth, ledge, geo, warps, stars, scarf: makeScarf(geo) };
    motes.length = 0;
    for (let i = 0; i < 70; i++) motes.push(newMote(true));
  }

  function island(g, x, y, s, r, alpha) {
    g.globalAlpha = alpha;
    g.fillStyle = '#0d0a26';
    g.beginPath(); g.moveTo(x - 70 * s, y); g.quadraticCurveTo(x - 30 * s, y + 40 * s, x - 6 * s, y + 120 * s); g.quadraticCurveTo(x + 20 * s, y + 50 * s, x + 70 * s, y); g.closePath(); g.fill();
    g.fillStyle = '#272257'; g.beginPath(); g.ellipse(x, y, 72 * s, 10 * s, 0, 0, TAU); g.fill();
    for (let k = 0; k < 5; k++) {
      const col = r.pick(['#4fd8cc', '#9a7cff', '#ff8ad0', '#7fb0ff']);
      const cx = x + r.range(-48, 48) * s, hh = r.range(20, 64) * s;
      const lg = g.createLinearGradient(cx, y - hh, cx, y);
      lg.addColorStop(0, hexA(col, 0.95)); lg.addColorStop(1, hexA(col, 0.2));
      g.fillStyle = lg; g.beginPath(); g.moveTo(cx - 6 * s, y - 2 * s); g.lineTo(cx + r.range(-3, 3) * s, y - hh); g.lineTo(cx + 6 * s, y - 2 * s); g.fill();
    }
    g.globalAlpha = 1;
  }

  function paintWeaver(g, geo) {
    const { cx, lw, top } = geo;
    const s = lw / 600;
    g.save();
    g.translate(cx + lw * 0.05, top + lw * 0.1);
    g.scale(s, s);
    g.rotate(-0.12);
    // veil and shoulders: one luminous drape
    let gr = g.createLinearGradient(0, -40, 0, 560);
    gr.addColorStop(0, 'rgba(230,214,255,0.34)'); gr.addColorStop(0.45, 'rgba(160,140,230,0.16)'); gr.addColorStop(1, 'rgba(80,60,160,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(-10, -30);
    g.bezierCurveTo(90, -40, 150, 40, 140, 140);
    g.bezierCurveTo(240, 190, 330, 300, 360, 560);
    g.lineTo(-330, 560);
    g.bezierCurveTo(-300, 330, -220, 200, -130, 150);
    g.bezierCurveTo(-150, 40, -100, -25, -10, -30);
    g.fill();
    // face: soft oval under the veil, tilted in sleep
    g.save(); g.translate(10, 80); g.rotate(0.28);
    gr = g.createRadialGradient(0, 0, 4, 0, 10, 92);
    gr.addColorStop(0, 'rgba(255,240,220,0.42)'); gr.addColorStop(0.7, 'rgba(230,200,255,0.2)'); gr.addColorStop(1, 'rgba(200,170,255,0)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(0, 6, 62, 84, 0, 0, TAU); g.fill();
    // closed eyes and the faint line of a mouth
    g.strokeStyle = 'rgba(70,40,110,0.55)'; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.arc(-22, 4, 14, 0.25, Math.PI - 0.25); g.stroke();
    g.beginPath(); g.arc(24, 4, 14, 0.25, Math.PI - 0.25); g.stroke();
    g.lineWidth = 2; g.strokeStyle = 'rgba(70,40,110,0.4)';
    g.beginPath(); g.moveTo(-9, 50); g.quadraticCurveTo(0, 54, 9, 50); g.stroke();
    g.restore();
    // veil edge highlights
    g.strokeStyle = 'rgba(255,236,200,0.35)'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(-10, -30); g.bezierCurveTo(90, -40, 150, 40, 140, 140); g.bezierCurveTo(240, 190, 330, 300, 360, 560); g.stroke();
    g.beginPath(); g.moveTo(-10, -30); g.bezierCurveTo(-100, -25, -150, 40, -130, 150); g.bezierCurveTo(-220, 200, -300, 330, -330, 560); g.stroke();
    g.restore();
  }

  function wood(g, x, y, w, h, horiz) {
    const gr = horiz ? g.createLinearGradient(0, y, 0, y + h) : g.createLinearGradient(x, 0, x + w, 0);
    gr.addColorStop(0, '#2a1a28'); gr.addColorStop(0.35, '#5a3a3a'); gr.addColorStop(0.55, '#3a2430'); gr.addColorStop(1, '#140c18');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(242,196,107,0.55)'; g.lineWidth = 1.2; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  function paintLoom(g, geo, r) {
    const { x0, x1, top, bot, lw } = geo;
    const pw = Math.max(14, lw * 0.045);
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 20;
    // posts
    wood(g, x0, top - pw * 0.6, pw, bot - top + pw * 1.6, false);
    wood(g, x1 - pw, top - pw * 0.6, pw, bot - top + pw * 1.6, false);
    // top beam
    wood(g, x0 - pw * 0.8, top, lw + pw * 1.6, pw * 1.2, true);
    // breast beam (lower), broken in the middle
    wood(g, x0, bot - pw * 0.4, lw * 0.42, pw * 0.9, true);
    g.save(); g.translate(x0 + lw * 0.58, bot - pw * 0.1); g.rotate(0.12); wood(g, 0, -pw * 0.45, lw * 0.42, pw * 0.9, true); g.restore();
    g.shadowBlur = 0;
    // gilt finials and knots
    for (const x of [x0 + pw / 2, x1 - pw / 2]) {
      g.drawImage(glow('#ffcf7a'), x - pw * 1.6, top - pw * 2.6, pw * 3.2, pw * 3.2);
      g.fillStyle = '#ffe2a0'; g.beginPath(); g.arc(x, top - pw * 1, pw * 0.42, 0, TAU); g.fill();
      g.fillStyle = '#7a5020'; g.beginPath(); g.arc(x, top - pw * 1, pw * 0.2, 0, TAU); g.fill();
    }
    // carved runes on the beam
    g.strokeStyle = 'rgba(255,220,150,0.55)'; g.lineWidth = 1.2;
    for (let i = 0; i < 9; i++) {
      const x = x0 + lw * (0.12 + i * 0.095), y = top + pw * 0.6;
      g.beginPath(); g.moveTo(x - 5, y); g.quadraticCurveTo(x, y - 6, x + 5, y); g.quadraticCurveTo(x, y + 6, x - 5, y); g.stroke();
    }
    g.restore();
  }

  function paintCloth(g, geo, r) {
    const { x0, lw, top } = geo;
    const pw = Math.max(14, lw * 0.045);
    const cx0 = x0 + lw * 0.08, cw = lw * 0.84;
    const y0 = top + pw * 1.2;
    const h = lw * 0.36;
    g.save();
    // ragged bottom edge
    const edge = [];
    for (let i = 0; i <= 40; i++) edge.push(y0 + h * (0.72 + 0.28 * Math.sin(i * 0.9) * Math.sin(i * 0.37 + 1)) - (i / 40 < 0.35 ? h * 0.25 * (1 - i / 14) : 0));
    g.beginPath(); g.moveTo(cx0, y0);
    g.lineTo(cx0 + cw, y0);
    for (let i = 40; i >= 0; i--) g.lineTo(cx0 + (cw * i) / 40, Math.max(y0 + 8, edge[i]));
    g.closePath(); g.clip();
    let gr = g.createLinearGradient(0, y0, 0, y0 + h);
    gr.addColorStop(0, '#4a1e40'); gr.addColorStop(0.5, '#6a2a48'); gr.addColorStop(1, '#2a1030');
    g.fillStyle = gr; g.fillRect(cx0, y0, cw, h);
    // woven diamonds: the pattern of fates
    const cell = Math.max(10, cw / 22);
    for (let row = 0; row * cell < h; row++) {
      for (let col = 0; col * cell < cw; col++) {
        const x = cx0 + col * cell + (row % 2 ? cell / 2 : 0), y = y0 + row * cell * 0.8;
        const hue = r.pick(['#f2c46b', '#ff9a6a', '#d18cff', '#6fc3ff', '#f2c46b']);
        g.fillStyle = hexA(hue, 0.18 + r() * 0.3);
        g.beginPath(); g.moveTo(x, y - cell * 0.35); g.lineTo(x + cell * 0.35, y); g.lineTo(x, y + cell * 0.35); g.lineTo(x - cell * 0.35, y); g.fill();
      }
    }
    // weft lines
    g.strokeStyle = 'rgba(255,230,180,0.12)'; g.lineWidth = 1;
    for (let y = y0; y < y0 + h; y += 3) { g.beginPath(); g.moveTo(cx0, y); g.lineTo(cx0 + cw, y); g.stroke(); }
    // a golden figure woven in: a little hooded child with a long scarf (Iri, foretold)
    g.strokeStyle = 'rgba(255,215,140,0.7)'; g.lineWidth = 2;
    const fx = cx0 + cw * 0.62, fy = y0 + h * 0.36, fs = h * 0.22;
    g.beginPath(); g.moveTo(fx, fy - fs); g.lineTo(fx + fs * 0.45, fy + fs * 0.6); g.lineTo(fx - fs * 0.45, fy + fs * 0.6); g.closePath(); g.stroke();
    g.beginPath(); g.moveTo(fx, fy - fs * 0.4); g.bezierCurveTo(fx + fs, fy - fs * 0.7, fx + fs * 1.4, fy, fx + fs * 2.4, fy - fs * 0.5); g.stroke();
    g.restore();
    // frayed edge highlight
    g.strokeStyle = 'rgba(255,220,150,0.35)'; g.lineWidth = 1;
    g.beginPath(); for (let i = 0; i <= 40; i++) { const x = cx0 + (cw * i) / 40, y = Math.max(y0 + 8, edge[i]); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    L_edge = { cx0, cw, edge, y0 };
  }
  let L_edge = null;

  function paintLedge(g, geo, r) {
    const y = geo.ledgeY;
    // stone ledge spanning the lower right, broken edge
    g.save();
    const gr = g.createLinearGradient(0, y - 20, 0, H);
    gr.addColorStop(0, '#2a2350'); gr.addColorStop(0.15, '#161232'); gr.addColorStop(1, '#07061a');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(W * 0.36, H);
    g.lineTo(W * 0.4, y + 18);
    for (let i = 0; i <= 20; i++) { const x = W * 0.4 + (W * 0.62 * i) / 20; g.lineTo(x, y + Math.sin(i * 1.7) * 3 + (i === 0 ? 10 : 0)); }
    g.lineTo(W + 10, H); g.closePath(); g.fill();
    // floor tiles: a hint of the Loomhall mosaic
    g.strokeStyle = 'rgba(242,196,107,0.16)'; g.lineWidth = 1;
    for (let i = 0; i < 18; i++) { const x = W * 0.42 + i * W * 0.035; g.beginPath(); g.moveTo(x, y + 6); g.lineTo(x - 30 + i * 2, H); g.stroke(); }
    for (let k = 1; k < 5; k++) { const yy = y + k * k * 6 + 6; g.beginPath(); g.moveTo(W * 0.4, yy); g.lineTo(W, yy); g.stroke(); }
    g.strokeStyle = 'rgba(160,140,255,0.5)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(W * 0.4, y + 18); for (let i = 0; i <= 20; i++) { const x = W * 0.4 + (W * 0.62 * i) / 20; g.lineTo(x, y + Math.sin(i * 1.7) * 3 + (i === 0 ? 10 : 0)); } g.stroke();
    // broken pillar stumps and a lantern
    for (const [px, ph] of [[W * 0.92, 120], [W * 0.46, 60]]) {
      const pw = 34 * (H / 720), hh = ph * (H / 720);
      const pg = g.createLinearGradient(px - pw / 2, 0, px + pw / 2, 0);
      pg.addColorStop(0, '#1a1638'); pg.addColorStop(0.5, '#3a3270'); pg.addColorStop(1, '#100c26');
      g.fillStyle = pg; g.fillRect(px - pw / 2, y - hh, pw, hh + 8);
      g.fillStyle = '#4a4290'; g.fillRect(px - pw * 0.65, y - hh - 6, pw * 1.3, 8);
    }
    g.restore();
  }

  function makeScarf(geo) {
    const n = 14, pts = [];
    for (let i = 0; i < n; i++) pts.push({ x: 0, y: 0, px: 0, py: 0 });
    return { n, pts, x: geo.cx - geo.lw * 0.1, y: geo.ledgeY + 2, init: false };
  }

  function newMote(anywhere) {
    return {
      x: R() * W, y: anywhere ? R() * H : H + 10, vy: -R.range(6, 22), vx: R.range(-6, 6),
      s: R.range(0.8, 2.6), life: 0, max: R.range(6, 14), col: R() < 0.7 ? '#ffd27a' : R.pick(['#9a7cff', '#5fe0d0', '#ff9ad0']), ph: R() * TAU,
    };
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    const nw = Math.max(320, Math.round(r.width || innerWidth)), nh = Math.max(240, Math.round(r.height || innerHeight));
    dpr = Math.min(1.5, window.devicePixelRatio || 1);
    if (nw === W && nh === H && L) return;
    W = nw; H = nh;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    build();
  }

  function draw(now) {
    const t = (now - t0) / 1000;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const geo = L.geo;
    // slow parallax drift
    const px = Math.sin(t * 0.07) * 8, py = Math.cos(t * 0.05) * 4;
    ctx.drawImage(L.sky, 0, 0, W, H);
    // aurora ribbons
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 3; k++) {
      const col = ['#3fe0c5', '#8a6cff', '#3fb0ff'][k];
      ctx.strokeStyle = hexA(col, 0.05);
      for (let j = 0; j < 8; j++) {
        ctx.lineWidth = 18 - j * 2;
        ctx.beginPath();
        for (let i = 0; i <= 24; i++) {
          const x = (i / 24) * W, y = H * (0.12 + k * 0.08) + Math.sin(i * 0.45 + t * 0.25 + k * 2) * 26 + Math.sin(i * 0.17 - t * 0.1) * 30 - j * 5;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
    }
    // twinkles
    for (const s of L.stars) {
      const a = 0.35 + 0.65 * Math.max(0, Math.sin(t * s.sp + s.ph));
      ctx.globalAlpha = a * 0.8; ctx.drawImage(glow('#cfe0ff'), s.x - s.s * 4, s.y - s.s * 4, s.s * 8, s.s * 8);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(L.far, px * 0.4, py * 0.4, W, H);
    // the Weaver breathes
    const br = 0.82 + 0.18 * Math.sin(t * 0.55);
    ctx.globalAlpha = br; ctx.drawImage(L.wv, 0, Math.sin(t * 0.55) * 2, W, H); ctx.globalAlpha = 1;
    ctx.drawImage(L.loom, 0, 0, W, H);
    // warp threads: woven above, loose and swaying below
    const pw = Math.max(14, geo.lw * 0.045);
    const yTop = geo.top + pw * 1.2;
    ctx.lineCap = 'round';
    for (const wp of L.warps) {
      const sway = Math.sin(t * wp.sp + wp.ph);
      const yEnd = wp.loose ? yTop + (geo.bot - yTop) * wp.len : geo.bot;
      const col = wp.black ? '#160a24' : '#ffd27a';
      ctx.strokeStyle = wp.black ? 'rgba(20,8,34,0.95)' : 'rgba(255,214,130,0.75)';
      ctx.lineWidth = wp.black ? 2.2 : 1.3;
      ctx.beginPath(); ctx.moveTo(wp.x, yTop);
      const bend = wp.loose ? sway * 18 + Math.sin(t * 0.8 + wp.x * 0.02) * 10 : sway * 1.5;
      ctx.bezierCurveTo(wp.x, yTop + (yEnd - yTop) * 0.5, wp.x + bend * 0.5, yEnd - (yEnd - yTop) * 0.2, wp.x + bend, yEnd);
      ctx.stroke();
      if (!wp.black) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.18 + 0.12 * Math.sin(t * 2 + wp.ph);
        ctx.lineWidth = 4; ctx.stroke();
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        if (wp.loose) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.7; ctx.drawImage(glow(col), wp.x + bend - 7, yEnd - 7, 14, 14); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
      } else {
        // black thread smoke at the frayed tip
        ctx.globalAlpha = 0.35; ctx.drawImage(glow('#5a2a7a'), wp.x + bend - 12, yEnd - 12, 24, 24); ctx.globalAlpha = 1;
      }
    }
    ctx.drawImage(L.cloth, 0, 0, W, H);
    ctx.drawImage(L.ledge, 0, 0, W, H);
    drawIri(t, dt);
    // motes
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < motes.length; i++) {
      const m = motes[i];
      m.life += dt; m.y += m.vy * dt; m.x += (m.vx + Math.sin(t + m.ph) * 8) * dt;
      if (m.y < -10 || m.life > m.max) { motes[i] = newMote(false); continue; }
      const a = Math.min(1, m.life / 1.5, (m.max - m.life) / 1.5);
      ctx.globalAlpha = a * 0.9; ctx.drawImage(glow(m.col), m.x - m.s * 5, m.y - m.s * 5, m.s * 10, m.s * 10);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  function drawIri(t, dt) {
    const geo = L.geo;
    const S = Math.max(0.6, H / 720);
    const x = geo.cx - geo.lw * 0.16, y = geo.ledgeY + 2;
    // soft rim of loom light on the ground
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5;
    ctx.drawImage(glow('#ffcf7a'), x - 60 * S, y - 30 * S, 120 * S, 60 * S);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(x, y, 16 * S, 4 * S, 0, 0, TAU); ctx.fill();
    // cloak (from behind, looking up at the loom)
    const breath = Math.sin(t * 1.6) * 0.6 * S;
    ctx.fillStyle = '#7a1424';
    ctx.beginPath();
    ctx.moveTo(x - 4 * S, y - 40 * S + breath);
    ctx.bezierCurveTo(x - 14 * S, y - 26 * S, x - 15 * S + Math.sin(t * 1.3) * 1.5 * S, y - 8 * S, x - 13 * S + Math.sin(t * 1.3) * 2 * S, y);
    ctx.lineTo(x + 13 * S + Math.sin(t * 1.3 + 1) * 2 * S, y);
    ctx.bezierCurveTo(x + 15 * S, y - 10 * S, x + 13 * S, y - 26 * S, x + 4 * S, y - 40 * S + breath);
    ctx.closePath(); ctx.fill();
    const cg = ctx.createLinearGradient(x - 14 * S, 0, x + 14 * S, 0);
    cg.addColorStop(0, 'rgba(0,0,0,0.35)'); cg.addColorStop(0.6, 'rgba(255,160,120,0.12)'); cg.addColorStop(1, 'rgba(255,200,140,0.35)');
    ctx.fillStyle = cg; ctx.fill();
    // hood, tilted up
    ctx.fillStyle = '#8e1a2c';
    ctx.beginPath(); ctx.ellipse(x, y - 44 * S + breath, 9.5 * S, 10.5 * S, -0.15, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 4 * S, y - 52 * S + breath); ctx.quadraticCurveTo(x - 6 * S, y - 60 * S, x - 1 * S, y - 61 * S + Math.sin(t * 2) * S); ctx.quadraticCurveTo(x + 2 * S, y - 55 * S, x + 4 * S, y - 52 * S + breath); ctx.fill();
    ctx.strokeStyle = 'rgba(255,200,150,0.6)'; ctx.lineWidth = 1.2 * S;
    ctx.beginPath(); ctx.arc(x, y - 44 * S + breath, 10 * S, -1.2, 0.4); ctx.stroke();
    // golden scarf: a verlet chain blowing to the left
    const sc = L.scarf;
    const ax = x + 3 * S, ay = y - 36 * S + breath;
    const seg = 7 * S;
    if (!sc.init) { for (let i = 0; i < sc.n; i++) { sc.pts[i].x = sc.pts[i].px = ax - i * seg; sc.pts[i].y = sc.pts[i].py = ay; } sc.init = true; }
    const wind = -38 - 24 * Math.sin(t * 0.9) - 12 * Math.sin(t * 2.3);
    for (let i = 1; i < sc.n; i++) {
      const p = sc.pts[i];
      const vx = (p.x - p.px) * 0.96, vy = (p.y - p.py) * 0.96;
      p.px = p.x; p.py = p.y;
      p.x += vx + wind * dt * dt * 60 * S; p.y += vy + (14 + Math.sin(t * 3 + i * 0.7) * 22) * dt * dt * 60 * S;
    }
    sc.pts[0].x = ax; sc.pts[0].y = ay;
    for (let k = 0; k < 4; k++) for (let i = 1; i < sc.n; i++) {
      const a = sc.pts[i - 1], b = sc.pts[i];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, f = (d - seg) / d;
      b.x -= dx * f; b.y -= dy * f;
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass ? '#ffe6a6' : 'rgba(255,190,90,0.35)';
      ctx.lineWidth = pass ? 3.2 * S : 9 * S;
      ctx.beginPath(); ctx.moveTo(sc.pts[0].x, sc.pts[0].y);
      for (let i = 1; i < sc.n - 1; i++) { const a = sc.pts[i], b = sc.pts[i + 1]; ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2); }
      ctx.stroke();
    }
    const tip = sc.pts[sc.n - 1];
    ctx.drawImage(glow('#ffd27a'), tip.x - 10 * S, tip.y - 10 * S, 20 * S, 20 * S);
    ctx.globalCompositeOperation = 'source-over';
  }

  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    resize();
    if (L) draw(now);
  }

  return {
    start() { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); },
    resize() { W = 0; resize(); },
    // one frame at a time, for deterministic captures
    renderAt(ms) { resize(); if (L) draw(t0 + ms); },
  };
}
