// The meadow behind the monster, and the particles in front of it.
// Sky and hills are painted once per screen size into two layers; the sun,
// clouds and rainbow move, so they are drawn every frame between them.
const TAU = Math.PI * 2;

function layer(w, h, dpr) {
  const c = document.createElement('canvas');
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  return [c, g];
}

function flower(g, x, y, r, color) {
  g.fillStyle = color;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    g.beginPath();
    g.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.75, 0, TAU);
    g.fill();
  }
  g.beginPath();
  g.arc(x, y, r * 0.6, 0, TAU);
  g.fillStyle = '#ffd23f';
  g.fill();
}

export class Scene {
  constructor() {
    this.clouds = [];
    this.parts = [];
    this.rainbow = 0;
    this.t = 0;
  }

  layout(w, h, dpr, groundY, monsterX, monsterR) {
    this.w = w;
    this.h = h;
    this.groundY = groundY;
    const u = Math.min(w, h);
    let rnd = 7;
    const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);

    const [sky, sg] = layer(w, h, dpr);
    const grad = sg.createLinearGradient(0, 0, 0, groundY);
    grad.addColorStop(0, '#4fc0ff');
    grad.addColorStop(0.7, '#a9e8ff');
    grad.addColorStop(1, '#d9f6ff');
    sg.fillStyle = grad;
    sg.fillRect(0, 0, w, h);
    this.sky = sky;

    const [hills, hg] = layer(w, h, dpr);
    // far hills
    hg.beginPath();
    hg.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) hg.lineTo(x, groundY - u * 0.13 + Math.sin(x / (u * 0.5) + 1) * u * 0.05);
    hg.lineTo(w, h);
    hg.closePath();
    hg.fillStyle = '#9be872';
    hg.fill();
    // a few round trees on the far hills
    for (let i = 0; i < 5; i++) {
      const x = w * (0.08 + i * 0.22 + rand() * 0.06);
      if (Math.abs(x - monsterX) < monsterR * 1.6) continue;
      const y = groundY - u * 0.13 + Math.sin(x / (u * 0.5) + 1) * u * 0.05;
      const tr = u * (0.035 + rand() * 0.02);
      hg.fillStyle = '#8a5a2b';
      hg.fillRect(x - tr * 0.15, y - tr * 1.2, tr * 0.3, tr * 1.3);
      hg.beginPath();
      hg.arc(x, y - tr * 1.6, tr, 0, TAU);
      hg.fillStyle = '#3fae4a';
      hg.fill();
      hg.beginPath();
      hg.arc(x - tr * 0.3, y - tr * 1.9, tr * 0.4, 0, TAU);
      hg.fillStyle = 'rgba(255,255,255,0.18)';
      hg.fill();
    }
    // near meadow
    hg.beginPath();
    hg.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) hg.lineTo(x, groundY - u * 0.04 + Math.sin(x / (u * 0.7)) * u * 0.025);
    hg.lineTo(w, h);
    hg.closePath();
    const mg = hg.createLinearGradient(0, groundY - u * 0.06, 0, h);
    mg.addColorStop(0, '#6bd84f');
    mg.addColorStop(1, '#3fb43c');
    hg.fillStyle = mg;
    hg.fill();
    // grass tufts and flowers, kept clear of the monster's feet
    const colors = ['#ff5fa8', '#ffffff', '#ff8a1f', '#a974ff', '#ff4b4b', '#3bb3ff'];
    for (let i = 0; i < Math.round(w / 22); i++) {
      const x = rand() * w;
      const y = groundY + rand() * (h - groundY) * 0.9;
      if (Math.abs(x - monsterX) < monsterR * 1.1 && y < groundY + monsterR * 0.25) continue;
      hg.strokeStyle = '#2f9a34';
      hg.lineWidth = 2;
      hg.lineCap = 'round';
      for (let k = -1; k <= 1; k++) {
        hg.beginPath();
        hg.moveTo(x + k * 3, y);
        hg.lineTo(x + k * 5, y - u * 0.02);
        hg.stroke();
      }
    }
    for (let i = 0; i < Math.round(w / 45); i++) {
      const x = rand() * w;
      const y = groundY + u * 0.02 + rand() * (h - groundY - u * 0.02) * 0.9;
      if (Math.abs(x - monsterX) < monsterR * 1.15 && y < groundY + monsterR * 0.3) continue;
      flower(hg, x, y, u * (0.008 + rand() * 0.006), colors[i % colors.length]);
    }
    this.hills = hills;

    if (!this.clouds.length) {
      for (let i = 0; i < 4; i++) this.clouds.push({ x: rand(), y: 0.08 + rand() * 0.3, s: 0.7 + rand() * 0.6, v: 0.004 + rand() * 0.006 });
    }
    this.u = u;
  }

  update(dt) {
    this.t += dt;
    for (const c of this.clouds) {
      c.x += c.v * dt;
      if (c.x > 1.25) c.x = -0.25;
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.parts.splice(i, 1);
        continue;
      }
      p.vy += p.grav * dt;
      p.vx *= 1 - p.drag * dt;
      p.vy *= 1 - p.drag * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  }

  drawBack(g, rainbowX, rainbowY, rainbowR) {
    const { w, h, u } = this;
    g.drawImage(this.sky, 0, 0, w, h);
    // the sun peeking in from the top left corner
    const sx = w * 0.02;
    const sy = h * 0.01;
    const sr = u * 0.17;
    g.save();
    g.translate(sx, sy);
    g.rotate(this.t * 0.15);
    g.fillStyle = '#ffe873';
    for (let i = 0; i < 12; i++) {
      g.rotate(TAU / 12);
      g.beginPath();
      g.moveTo(sr * 1.1, -sr * 0.12);
      g.lineTo(sr * 1.6, 0);
      g.lineTo(sr * 1.1, sr * 0.12);
      g.closePath();
      g.fill();
    }
    g.restore();
    g.beginPath();
    g.arc(sx, sy, sr, 0, TAU);
    const sg = g.createRadialGradient(sx, sy, sr * 0.2, sx, sy, sr);
    sg.addColorStop(0, '#fff6b0');
    sg.addColorStop(1, '#ffd23f');
    g.fillStyle = sg;
    g.fill();

    if (this.rainbow > 0.01) {
      const cols = ['#ff4b4b', '#ff9f1c', '#ffe14a', '#5fce4f', '#3bb3ff', '#8b5cf6'];
      const bw = rainbowR * 0.09;
      g.save();
      g.globalAlpha = this.rainbow * 0.85;
      cols.forEach((c, i) => {
        g.beginPath();
        g.arc(rainbowX, rainbowY, rainbowR - i * bw, Math.PI, TAU);
        g.lineWidth = bw + 1;
        g.strokeStyle = c;
        g.stroke();
      });
      g.restore();
    }

    for (const c of this.clouds) this.cloud(g, c.x * w, c.y * h, u * 0.09 * c.s);
    g.drawImage(this.hills, 0, 0, w, h);
  }

  cloud(g, x, y, r) {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.moveTo(x + r * 1.7, y + r * 0.2);
    g.arc(x + r * 0.95, y + r * 0.2, r * 0.75, 0, TAU);
    g.moveTo(x - r * 0.25, y + r * 0.25);
    g.arc(x - r * 0.95, y + r * 0.25, r * 0.7, 0, TAU);
    g.moveTo(x + r * 1.05, y - r * 0.45);
    g.arc(x + r * 0.35, y - r * 0.45, r * 0.7, 0, TAU);
    g.rect(x - r * 0.95, y + r * 0.1, r * 1.9, r * 0.85);
    g.fill('nonzero');
  }

  emit(kind, x, y, n, opts = {}) {
    const u = this.u;
    for (let i = 0; i < n; i++) {
      const a = opts.angle ?? Math.random() * TAU;
      const spread = opts.spread ?? TAU;
      const ang = opts.angle !== undefined ? a + (Math.random() - 0.5) * spread : a;
      const sp = u * (opts.speed ?? 0.6) * (0.4 + Math.random() * 0.8);
      const colors = opts.colors || ['#ffffff'];
      const life = (opts.life ?? 1) * (0.7 + Math.random() * 0.6);
      this.parts.push({
        kind,
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        grav: (opts.grav ?? 1.4) * u,
        drag: opts.drag ?? 1,
        life,
        max: life,
        size: u * (opts.size ?? 0.02) * (0.6 + Math.random() * 0.8),
        color: colors[i % colors.length],
        rot: Math.random() * TAU,
        vr: (Math.random() - 0.5) * 10,
      });
    }
  }

  drawParts(g) {
    for (const p of this.parts) {
      const k = p.life / p.max;
      g.save();
      g.globalAlpha = Math.min(1, k * 2.5);
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      g.fillStyle = p.color;
      const s = p.size * (p.kind === 'heart' || p.kind === 'star' ? 0.6 + 0.4 * Math.min(1, (1 - k) * 6) : 1);
      if (p.kind === 'crumb') {
        g.beginPath();
        g.arc(0, 0, s, 0, TAU);
        g.fill();
      } else if (p.kind === 'confetti') {
        g.fillRect(-s, -s * 0.45, s * 2, s * 0.9);
      } else if (p.kind === 'heart') {
        g.rotate(-p.rot + Math.sin(p.life * 6) * 0.2);
        heart(g, s);
      } else if (p.kind === 'star') {
        star(g, s, s * 0.45);
        g.fill();
      } else if (p.kind === 'puff') {
        g.globalAlpha = k * 0.8;
        g.beginPath();
        g.arc(0, 0, s * (1.6 - k * 0.6), 0, TAU);
        g.fill();
      }
      g.restore();
    }
  }
}

export function heart(g, s) {
  g.beginPath();
  g.moveTo(0, s * 0.9);
  g.bezierCurveTo(-s * 1.3, 0, -s * 0.7, -s * 1.1, 0, -s * 0.45);
  g.bezierCurveTo(s * 0.7, -s * 1.1, s * 1.3, 0, 0, s * 0.9);
  g.fill();
}

export function star(g, ro, ri) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? ri : ro;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
}
