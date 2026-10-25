// The cardboard world behind the monster, and the particles in front of it.
// The wall (cardboard with marker doodles and tape) and the box the monster
// stands on are painted once per screen size into two layers. The warm
// spotlight, floating dust, celebration light rays and rainbow move, so they
// are drawn every frame between them.
const TAU = Math.PI * 2;
const INK = '#5a3214';

function layer(w, h, dpr) {
  const c = document.createElement('canvas');
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  return [c, g];
}

function seeded(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

// a strip of sticky tape with zigzag torn ends
function tape(g, x, y, len, wid, ang, rand) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.beginPath();
  const z = wid / 6;
  g.moveTo(-len / 2, -wid / 2);
  g.lineTo(len / 2, -wid / 2);
  for (let i = 1; i <= 6; i++) g.lineTo(len / 2 + (i % 2 ? z : -z * 0.2) * (0.6 + rand() * 0.6), -wid / 2 + i * z);
  g.lineTo(-len / 2, wid / 2);
  for (let i = 5; i >= 0; i--) g.lineTo(-len / 2 + (i % 2 ? -z : z * 0.2) * (0.6 + rand() * 0.6), -wid / 2 + i * z);
  g.closePath();
  g.fillStyle = 'rgba(246,232,196,0.78)';
  g.shadowColor = 'rgba(70,35,10,0.25)';
  g.shadowBlur = wid * 0.2;
  g.shadowOffsetY = wid * 0.06;
  g.fill();
  g.shadowColor = 'transparent';
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(-len / 2, -wid * 0.32, len, wid * 0.14);
  g.restore();
}

// marker doodles: every line is drawn with a little wobble, like by hand
function doodles(g, w, h, u, avoid, rand) {
  const wob = (pts, close) => {
    g.beginPath();
    pts.forEach(([x, y], i) => {
      const jx = x + (rand() - 0.5) * u * 0.004;
      const jy = y + (rand() - 0.5) * u * 0.004;
      if (i === 0) g.moveTo(jx, jy);
      else g.lineTo(jx, jy);
    });
    if (close) g.closePath();
    g.stroke();
  };
  const shapes = {
    star(x, y, r) {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r * 0.45 : r;
        pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
      }
      wob(pts, true);
    },
    heart(x, y, r) {
      const pts = [];
      for (let i = 0; i <= 40; i++) {
        const t = (i / 40) * TAU;
        pts.push([x + r * 0.06 * 16 * Math.pow(Math.sin(t), 3), y - r * 0.06 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]);
      }
      wob(pts);
    },
    spiral(x, y, r) {
      const pts = [];
      for (let i = 0; i <= 60; i++) {
        const a = i * 0.32;
        const rr = (i / 60) * r;
        pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
      }
      wob(pts);
    },
    sun(x, y, r) {
      const pts = [];
      for (let i = 0; i <= 30; i++) pts.push([x + Math.cos((i / 30) * TAU) * r * 0.5, y + Math.sin((i / 30) * TAU) * r * 0.5]);
      wob(pts);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        wob([[x + Math.cos(a) * r * 0.68, y + Math.sin(a) * r * 0.68], [x + Math.cos(a) * r, y + Math.sin(a) * r]]);
      }
    },
    cloud(x, y, r) {
      const pts = [];
      const bumps = [[-0.6, 0, 0.35], [-0.2, -0.25, 0.4], [0.3, -0.2, 0.38], [0.65, 0.05, 0.3]];
      for (const [bx, by, br] of bumps) for (let i = 0; i <= 10; i++) {
        const a = Math.PI + (i / 10) * Math.PI;
        pts.push([x + bx * r + Math.cos(a) * br * r, y + by * r + Math.sin(a) * br * r]);
      }
      pts.push([x + 0.95 * r, y + 0.25 * r], [x - 0.95 * r, y + 0.25 * r]);
      wob(pts, true);
    },
    smile(x, y, r) {
      const pts = [];
      for (let i = 0; i <= 30; i++) pts.push([x + Math.cos((i / 30) * TAU) * r, y + Math.sin((i / 30) * TAU) * r]);
      wob(pts);
      g.beginPath();
      g.arc(x - r * 0.35, y - r * 0.2, r * 0.08, 0, TAU);
      g.arc(x + r * 0.35, y - r * 0.2, r * 0.08, 0, TAU);
      g.fill();
      const m = [];
      for (let i = 0; i <= 10; i++) m.push([x + Math.cos(0.5 + (i / 10) * 2.1) * r * 0.55, y + Math.sin(0.5 + (i / 10) * 2.1) * r * 0.55]);
      wob(m);
    },
    apple(x, y, r) {
      const pts = [];
      for (let i = 0; i <= 36; i++) {
        const a = (i / 36) * TAU;
        const k = 1 - 0.18 * Math.pow(Math.max(0, -Math.sin(a)), 8) * 4;
        pts.push([x + Math.cos(a) * r * 0.8 * k, y + Math.sin(a) * r * 0.75]);
      }
      wob(pts);
      wob([[x, y - r * 0.7], [x + r * 0.15, y - r * 1.05]]);
      wob([[x + r * 0.1, y - r * 0.8], [x + r * 0.5, y - r * 1.0], [x + r * 0.2, y - r * 0.75]]);
    },
    swirl(x, y, r) {
      const pts = [];
      for (let i = 0; i <= 40; i++) pts.push([x - r + (i / 40) * r * 2, y + Math.sin((i / 40) * TAU * 1.5) * r * 0.25]);
      wob(pts);
    },
    dots(x, y, r) {
      for (let i = 0; i < 5; i++) {
        g.beginPath();
        g.arc(x + (rand() - 0.5) * r * 2, y + (rand() - 0.5) * r * 2, u * 0.004, 0, TAU);
        g.fill();
      }
    },
  };
  const names = Object.keys(shapes);
  g.save();
  g.strokeStyle = INK;
  g.fillStyle = INK;
  g.globalAlpha = 0.28;
  g.lineWidth = Math.max(1.5, u * 0.0055);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const placed = [];
  let tries = 0;
  const want = Math.round((w * h) / (u * u * 0.09));
  while (placed.length < want && tries++ < 400) {
    const x = rand() * w;
    const y = rand() * h * 0.92;
    const r = u * (0.03 + rand() * 0.03);
    if (avoid(x, y, r)) continue;
    if (placed.some((p) => Math.hypot(p.x - x, p.y - y) < (p.r + r) * 1.8)) continue;
    placed.push({ x, y, r });
    g.save();
    g.translate(x, y);
    g.rotate((rand() - 0.5) * 0.6);
    shapes[names[placed.length % names.length]](0, 0, r);
    g.restore();
  }
  g.restore();
}

export class Scene {
  constructor() {
    this.parts = [];
    this.motes = [];
    this.rainbow = 0;
    this.rays = 0;
    this.t = 0;
  }

  layout(w, h, dpr, groundY, monsterX, monsterR) {
    this.w = w;
    this.h = h;
    this.groundY = groundY;
    this.mx = monsterX;
    this.mr = monsterR;
    const u = Math.min(w, h);
    this.u = u;
    const rand = seeded(11);

    // ------------------------------------------------ the cardboard wall
    const [wall, g] = layer(w, h, dpr);
    const base = g.createRadialGradient(monsterX, groundY - monsterR, u * 0.1, monsterX, groundY - monsterR, Math.hypot(w, h) * 0.75);
    base.addColorStop(0, '#f0c98e');
    base.addColorStop(0.55, '#d9a463');
    base.addColorStop(1, '#a56a35');
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    // corrugation showing through the paper
    const step = Math.max(6, u * 0.016);
    for (let x = 0, i = 0; x < w; x += step, i++) {
      g.fillStyle = i % 2 ? 'rgba(255,240,210,0.07)' : 'rgba(110,60,20,0.05)';
      g.fillRect(x, 0, step / 2, h);
    }
    // paper fibres
    for (let i = 0; i < (w * h) / 500; i++) {
      g.fillStyle = rand() < 0.5 ? 'rgba(90,45,10,0.07)' : 'rgba(255,245,220,0.09)';
      g.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1);
    }
    // a fold line across the top, like the inside of a box
    const fy = h * 0.035 + u * 0.02;
    g.fillStyle = 'rgba(90,45,10,0.18)';
    g.fillRect(0, fy, w, 2);
    g.fillStyle = 'rgba(255,240,210,0.25)';
    g.fillRect(0, fy + 2, w, 2);
    const avoid = (x, y, r) =>
      Math.hypot(x - monsterX, y - (groundY - monsterR)) < monsterR * 1.9 + r || y < u * 0.13 + r;
    doodles(g, w, h, u, avoid, rand);
    // a scribbled grass line near the floor, and some tape
    g.save();
    g.strokeStyle = INK;
    g.globalAlpha = 0.22;
    g.lineWidth = Math.max(1.5, u * 0.005);
    g.lineCap = 'round';
    for (let x = rand() * 10; x < w; x += u * 0.025) {
      if (Math.abs(x - monsterX) < monsterR * 1.6) continue;
      g.beginPath();
      g.moveTo(x, h - u * 0.02);
      g.lineTo(x + u * 0.008, h - u * (0.045 + rand() * 0.02));
      g.stroke();
    }
    g.restore();
    tape(g, u * 0.03, u * 0.14, u * 0.2, u * 0.05, -0.75, rand);
    tape(g, w - u * 0.03, u * 0.15, u * 0.2, u * 0.05, 0.75, rand);
    tape(g, w * 0.5 + u * 0.35, h - u * 0.02, u * 0.16, u * 0.045, -0.12, rand);
    // darker corners
    const vig = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.62);
    vig.addColorStop(0, 'rgba(60,25,5,0)');
    vig.addColorStop(1, 'rgba(60,25,5,0.35)');
    g.fillStyle = vig;
    g.fillRect(0, 0, w, h);
    this.wall = wall;

    // ------------------------------------------------ the box it stands on
    const [box, bg] = layer(w, h, dpr);
    const bw = monsterR * 2.5;
    const top = u * 0.045;
    const x0 = monsterX - bw / 2;
    const y0 = groundY - top * 0.3;
    bg.lineJoin = 'round';
    bg.lineWidth = Math.max(2, u * 0.006);
    bg.strokeStyle = INK;
    // the lid, seen a little from above
    bg.beginPath();
    bg.moveTo(x0 + top * 0.6, y0 - top);
    bg.lineTo(x0 + bw - top * 0.6, y0 - top);
    bg.lineTo(x0 + bw, y0);
    bg.lineTo(x0, y0);
    bg.closePath();
    bg.fillStyle = '#eab774';
    bg.fill();
    bg.stroke();
    // the front
    const fg = bg.createLinearGradient(0, y0, 0, h);
    fg.addColorStop(0, '#d79a52');
    fg.addColorStop(1, '#b37538');
    bg.beginPath();
    bg.rect(x0, y0, bw, h - y0 + 10);
    bg.fillStyle = fg;
    bg.fill();
    bg.stroke();
    for (let x = x0 + step, i = 0; x < x0 + bw; x += step, i++) {
      bg.fillStyle = i % 2 ? 'rgba(255,240,210,0.06)' : 'rgba(110,60,20,0.05)';
      bg.fillRect(x, y0 + 2, step / 2, h - y0);
    }
    // the flap edge, a stripe of tape and a printed "this way up" pair of arrows
    bg.fillStyle = 'rgba(90,45,10,0.25)';
    bg.fillRect(x0 + 2, y0 + top * 0.6, bw - 4, 2);
    bg.fillStyle = 'rgba(246,232,196,0.7)';
    bg.fillRect(monsterX - bw * 0.07, y0 - top, bw * 0.14, h - y0 + top);
    bg.fillStyle = 'rgba(255,255,255,0.3)';
    bg.fillRect(monsterX - bw * 0.07, y0 - top, bw * 0.03, h - y0 + top);
    const ay = y0 + Math.min(h - y0, monsterR) * 0.55;
    bg.fillStyle = 'rgba(90,45,10,0.45)';
    for (const ax of [x0 + bw * 0.2, x0 + bw * 0.8]) {
      const s = monsterR * 0.12;
      bg.beginPath();
      bg.moveTo(ax, ay - s);
      bg.lineTo(ax + s * 0.8, ay);
      bg.lineTo(ax + s * 0.3, ay);
      bg.lineTo(ax + s * 0.3, ay + s);
      bg.lineTo(ax - s * 0.3, ay + s);
      bg.lineTo(ax - s * 0.3, ay);
      bg.lineTo(ax - s * 0.8, ay);
      bg.closePath();
      bg.fill();
    }
    this.box = box;

    if (!this.motes.length) {
      for (let i = 0; i < 26; i++) this.motes.push({ x: rand(), y: rand(), s: 0.5 + rand(), p: rand() * TAU });
    }
  }

  update(dt) {
    this.t += dt;
    for (const m of this.motes) {
      m.y -= dt * 0.01 * m.s;
      m.x += Math.sin(this.t * 0.4 + m.p) * dt * 0.004;
      if (m.y < -0.05) m.y = 1.05;
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

  drawBack(g, monsterX, monsterY, monsterR) {
    const { w, h, u, t } = this;
    g.drawImage(this.wall, 0, 0, w, h);

    // the warm spotlight on the monster
    const cy = monsterY - monsterR * 0.2;
    const lr = monsterR * (2.4 + Math.sin(t * 0.8) * 0.06);
    const light = g.createRadialGradient(monsterX, cy, monsterR * 0.2, monsterX, cy, lr);
    light.addColorStop(0, 'rgba(255,248,215,0.55)');
    light.addColorStop(1, 'rgba(255,248,215,0)');
    g.fillStyle = light;
    g.fillRect(monsterX - lr, cy - lr, lr * 2, lr * 2);

    // rays of light turning behind it while it celebrates
    if (this.rays > 0.01) {
      g.save();
      g.translate(monsterX, cy);
      g.rotate(t * 0.35);
      const rr = Math.hypot(w, h);
      const rg = g.createRadialGradient(0, 0, monsterR * 0.5, 0, 0, rr * 0.6);
      rg.addColorStop(0, `rgba(255,236,150,${0.5 * this.rays})`);
      rg.addColorStop(1, 'rgba(255,236,150,0)');
      g.fillStyle = rg;
      for (let i = 0; i < 14; i++) {
        g.beginPath();
        g.moveTo(0, 0);
        g.arc(0, 0, rr, (i / 14) * TAU, (i / 14 + 0.035) * TAU);
        g.closePath();
        g.fill();
      }
      g.restore();
    }

    if (this.rainbow > 0.01) {
      const cols = ['#ff4b4b', '#ff9f1c', '#ffe14a', '#5fce4f', '#3bb3ff', '#8b5cf6'];
      const rr = Math.min(w * 0.48, monsterR * 2.7);
      const bw = rr * 0.085;
      const ry = monsterY + monsterR * 0.95;
      g.save();
      g.globalAlpha = this.rainbow * 0.9;
      g.beginPath();
      g.arc(monsterX, ry, rr + bw * 0.5, Math.PI, TAU);
      g.arc(monsterX, ry, rr - bw * 5.5, TAU, Math.PI, true);
      g.closePath();
      g.lineWidth = Math.max(2, u * 0.006);
      g.strokeStyle = INK;
      g.stroke();
      cols.forEach((c, i) => {
        g.beginPath();
        g.arc(monsterX, ry, rr - i * bw, Math.PI, TAU);
        g.lineWidth = bw + 1;
        g.strokeStyle = c;
        g.stroke();
      });
      g.restore();
    }

    // dust drifting in the light
    g.fillStyle = 'rgba(255,250,225,0.6)';
    for (const m of this.motes) {
      const x = m.x * w;
      const y = m.y * h;
      const near = Math.max(0, 1 - Math.hypot(x - monsterX, y - cy) / (lr * 1.4));
      if (near <= 0) continue;
      g.globalAlpha = near * (0.4 + 0.4 * Math.sin(t * 2 + m.p));
      g.beginPath();
      g.arc(x, y, u * 0.003 * m.s, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
    g.drawImage(this.box, 0, 0, w, h);
  }

  emit(kind, x, y, n, opts = {}) {
    const u = this.u;
    for (let i = 0; i < n; i++) {
      const a = opts.angle ?? Math.random() * TAU;
      const spread = opts.spread ?? TAU;
      const ang = opts.angle !== undefined ? a + (Math.random() - 0.5) * spread : opts.even ? (i / n) * TAU : a;
      const sp = u * (opts.speed ?? 0.6) * (opts.even ? 1 : 0.4 + Math.random() * 0.8);
      const colors = opts.colors || ['#ffffff'];
      const life = (opts.life ?? 1) * (opts.even ? 1 : 0.7 + Math.random() * 0.6);
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
        size: u * (opts.size ?? 0.02) * (opts.even ? 1 : 0.6 + Math.random() * 0.8),
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
      g.fillStyle = p.color;
      const pop = 0.6 + 0.4 * Math.min(1, (1 - k) * 6);
      const s = p.size;
      if (p.kind === 'crumb') {
        g.rotate(p.rot);
        g.beginPath();
        g.arc(0, 0, s, 0, TAU);
        g.fill();
      } else if (p.kind === 'confetti') {
        g.rotate(p.rot);
        g.scale(1, Math.sin(p.life * 9 + p.rot));
        g.fillRect(-s, -s * 0.45, s * 2, s * 0.9);
      } else if (p.kind === 'heart') {
        g.rotate(Math.sin(p.life * 6) * 0.2);
        const hs = s * pop;
        heart(g, hs);
        g.lineWidth = hs * 0.22;
        g.strokeStyle = INK;
        g.stroke();
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.6)';
        g.beginPath();
        g.arc(-hs * 0.35, -hs * 0.25, hs * 0.18, 0, TAU);
        g.fill();
      } else if (p.kind === 'star') {
        g.rotate(p.rot);
        const ss = s * pop;
        star(g, ss, ss * 0.48);
        g.lineJoin = 'round';
        g.lineWidth = ss * 0.25;
        g.strokeStyle = '#c86a00';
        g.stroke();
        g.fill();
      } else if (p.kind === 'twinkle') {
        const ts = s * Math.sin((1 - k) * Math.PI);
        g.rotate(p.rot * 0.2);
        const gl = g.createRadialGradient(0, 0, 0, 0, 0, ts * 1.6);
        gl.addColorStop(0, 'rgba(255,255,230,0.7)');
        gl.addColorStop(1, 'rgba(255,255,230,0)');
        g.fillStyle = gl;
        g.fillRect(-ts * 1.6, -ts * 1.6, ts * 3.2, ts * 3.2);
        g.fillStyle = p.color;
        twinkle(g, ts);
        g.fill();
      } else if (p.kind === 'drop') {
        g.rotate(Math.atan2(p.vy, p.vx));
        g.beginPath();
        g.moveTo(s * 1.8, 0);
        g.quadraticCurveTo(s * 0.2, -s, -s, 0);
        g.arc(0, 0, s, Math.PI, 0, true);
        g.closePath();
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.55)';
        g.beginPath();
        g.arc(-s * 0.2, -s * 0.35, s * 0.3, 0, TAU);
        g.fill();
      } else if (p.kind === 'ring') {
        g.globalAlpha = k;
        g.beginPath();
        g.arc(0, 0, s * (1.15 - k), 0, TAU);
        g.lineWidth = s * 0.12 * k + 1;
        g.strokeStyle = p.color;
        g.stroke();
      } else if (p.kind === 'puff') {
        g.globalAlpha = k * 0.85;
        g.beginPath();
        g.arc(0, 0, s * (1.6 - k * 0.6), 0, TAU);
        g.fill();
        g.lineWidth = s * 0.08;
        g.strokeStyle = 'rgba(90,50,20,0.25)';
        g.stroke();
      } else if (p.kind === 'zzz') {
        // a sleepy Z drawn as a zigzag, drifting up and growing
        const zs = s * (1.4 - k * 0.6);
        g.rotate(-0.2 + Math.sin(p.life * 3) * 0.15);
        g.beginPath();
        g.moveTo(-zs, -zs);
        g.lineTo(zs, -zs);
        g.lineTo(-zs, zs);
        g.lineTo(zs, zs);
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.lineWidth = zs * 0.6;
        g.strokeStyle = INK;
        g.stroke();
        g.lineWidth = zs * 0.32;
        g.strokeStyle = p.color;
        g.stroke();
      } else if (p.kind === 'bubble') {
        g.globalAlpha = Math.min(1, k * 2);
        g.beginPath();
        g.arc(0, 0, s, 0, TAU);
        g.lineWidth = s * 0.18;
        g.strokeStyle = 'rgba(255,255,255,0.85)';
        g.stroke();
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
  g.closePath();
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

// a four-pointed sparkle
export function twinkle(g, s) {
  g.beginPath();
  g.moveTo(0, -s);
  g.quadraticCurveTo(s * 0.12, -s * 0.12, s, 0);
  g.quadraticCurveTo(s * 0.12, s * 0.12, 0, s);
  g.quadraticCurveTo(-s * 0.12, s * 0.12, -s, 0);
  g.quadraticCurveTo(-s * 0.12, -s * 0.12, 0, -s);
  g.closePath();
}
