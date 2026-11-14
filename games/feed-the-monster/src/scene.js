// The sunny meadow behind the monsters, and the particles in front of them.
// The sky and the land (glossy rolling hills, flowers and a picnic blanket
// the monsters sit on) are painted once per screen size into two layers.
// Everything that moves is drawn every frame between them: the smiling sun
// (tap it and it spins and giggles), drifting clouds, pollen in the light,
// two butterflies (tap one and it flutters off), and the light rays and
// rainbow of a celebration.
const TAU = Math.PI * 2;
const INK = '#2a3a14';

function layer(w, h, dpr) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * dpr));
  c.height = Math.max(1, Math.round(h * dpr));
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  return [c, g];
}

function seeded(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function glossFill(g, path, light, base, dark, cx, cy, r) {
  const gr = g.createRadialGradient(cx - r * 0.35, cy - r * 0.45, r * 0.05, cx, cy, r * 1.15);
  gr.addColorStop(0, light);
  gr.addColorStop(0.55, base);
  gr.addColorStop(1, dark);
  g.fillStyle = gr;
  g.fill(path);
}

function shineMark(g, x, y, rx, ry, rot, a = 0.85) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.fillStyle = `rgba(255,255,255,${a})`;
  g.beginPath();
  g.ellipse(0, 0, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU);
  g.fill();
  g.restore();
}

function hill(g, w, h, y0, amp, freq, ph, c1, c2, rim) {
  const yAt = (x) => y0 + Math.sin(x * freq + ph) * amp + Math.sin(x * freq * 2.3 + ph * 2) * amp * 0.3;
  const p = new Path2D();
  p.moveTo(0, h);
  for (let x = 0; x <= w + 16; x += 16) p.lineTo(x, yAt(x));
  p.lineTo(w, h);
  p.closePath();
  const gr = g.createLinearGradient(0, y0 - amp, 0, h);
  gr.addColorStop(0, c1);
  gr.addColorStop(1, c2);
  g.fillStyle = gr;
  g.fill(p);
  // a glossy rim of light along the top
  g.save();
  g.clip(p);
  g.strokeStyle = `rgba(255,255,255,${rim})`;
  g.lineWidth = Math.max(4, amp * 0.25);
  g.filter = `blur(${Math.max(1, amp * 0.06)}px)`;
  g.beginPath();
  for (let x = 0; x <= w + 16; x += 16) g.lineTo(x, yAt(x) + amp * 0.18);
  g.stroke();
  g.restore();
}

function flower(g, x, y, s, col, rand) {
  g.save();
  g.translate(x, y);
  g.rotate((rand() - 0.5) * 0.4);
  g.strokeStyle = '#3c9a2a';
  g.lineWidth = s * 0.18;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(s * 0.2, s, 0, s * 1.8);
  g.stroke();
  for (let i = 0; i < 5; i++) {
    g.save();
    g.rotate((i * TAU) / 5);
    const p = new Path2D();
    p.ellipse(0, -s * 0.55, s * 0.38, s * 0.55, 0, 0, TAU);
    glossFill(g, p, '#ffffff', col, col, 0, -s * 0.6, s * 0.6);
    g.restore();
  }
  const c = new Path2D();
  c.arc(0, 0, s * 0.35, 0, TAU);
  glossFill(g, c, '#fff6a0', '#ffc81e', '#f09400', 0, 0, s * 0.35);
  shineMark(g, -s * 0.1, -s * 0.12, s * 0.12, s * 0.06, -0.6);
  g.restore();
}

function grassTuft(g, x, y, s) {
  g.fillStyle = '#4fb832';
  for (const [dx, a, l] of [[-0.3, -0.5, 1], [0, 0, 1.3], [0.3, 0.45, 0.9]]) {
    g.save();
    g.translate(x + dx * s, y);
    g.rotate(a);
    g.beginPath();
    g.moveTo(-s * 0.12, 0);
    g.quadraticCurveTo(0, -s * l * 1.2, s * 0.02, -s * l);
    g.quadraticCurveTo(s * 0.05, -s * l * 0.5, s * 0.12, 0);
    g.fill();
    g.restore();
  }
}

function cloudSprite(s, dpr) {
  const [c, g] = layer(s * 3.6, s * 2.4, dpr);
  const p = new Path2D();
  const cx = s * 1.8;
  const cy = s * 1.25;
  for (const [dx, dy, r] of [[0, 0, 1], [-0.9, 0.25, 0.7], [0.95, 0.25, 0.75], [-0.4, -0.35, 0.75], [0.45, -0.3, 0.7]]) {
    p.moveTo(cx + dx * s + r * s, cy + dy * s);
    p.arc(cx + dx * s, cy + dy * s, r * s, 0, TAU);
  }
  g.shadowColor = 'rgba(90,120,200,0.28)';
  g.shadowBlur = s * 0.35;
  g.shadowOffsetY = s * 0.15;
  const gr = g.createLinearGradient(0, cy - s, 0, cy + s);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(1, '#dce8ff');
  g.fillStyle = gr;
  g.fill(p);
  g.shadowColor = 'transparent';
  shineMark(g, cx - s * 0.5, cy - s * 0.55, s * 0.3, s * 0.1, -0.3, 0.7);
  return c;
}

export class Scene {
  constructor() {
    this.parts = [];
    this.motes = [];
    this.rainbow = 0;
    this.rays = 0;
    this.t = 0;
    this.sunJoy = 0;
    this.sunSpin = 0;
    this.flies = [
      { p: 0.3, sp: 0.11, hue: 0, flee: 0, fx: 0, fy: 0 },
      { p: 2.4, sp: 0.09, hue: 1, flee: 0, fx: 0, fy: 0 },
    ];
    this.clouds = [
      { x: 0.12, y: 0.42, s: 1, v: 0.006 },
      { x: 0.55, y: 0.3, s: 0.75, v: 0.009 },
      { x: 0.82, y: 0.62, s: 0.6, v: 0.012 },
    ];
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
    const land = w > h ? h * 0.5 : groundY - monsterR * 2.1;
    this.horizon = land;

    // ------------------------------------------------ the sky
    const [sky, g] = layer(w, h, dpr);
    const sg = g.createLinearGradient(0, 0, 0, land + u * 0.1);
    sg.addColorStop(0, '#45b8ff');
    sg.addColorStop(0.6, '#9fdcff');
    sg.addColorStop(1, '#e4f7ff');
    g.fillStyle = sg;
    g.fillRect(0, 0, w, h);
    this.sky = sky;

    // ------------------------------------------------ the land
    const [ground, lg] = layer(w, h, dpr);
    hill(lg, w, h, land - u * 0.02, u * 0.05, 4 / w, 1, '#a8ea76', '#64c23e', 0.45);
    hill(lg, w, h, land + u * 0.09, u * 0.045, 3 / w, 3, '#86dd52', '#3fa52a', 0.5);
    // a soft glow on the grass under the monster
    const gl = lg.createRadialGradient(monsterX, groundY, monsterR * 0.3, monsterX, groundY, monsterR * 3);
    gl.addColorStop(0, 'rgba(255,255,220,0.35)');
    gl.addColorStop(1, 'rgba(255,255,220,0)');
    lg.fillStyle = gl;
    lg.fillRect(0, 0, w, h);
    // the picnic blanket, gingham, seen from a little above
    const brx = Math.min(w * 0.47, monsterR * 2.7);
    const bry = Math.min(brx * 0.3, (h - groundY) * 0.9 + monsterR * 0.25);
    const by = groundY + bry * 0.25;
    lg.save();
    lg.shadowColor = 'rgba(30,80,20,0.35)';
    lg.shadowBlur = u * 0.03;
    lg.shadowOffsetY = u * 0.01;
    lg.beginPath();
    lg.ellipse(monsterX, by, brx, bry, 0, 0, TAU);
    lg.fillStyle = '#ff6f8f';
    lg.fill();
    lg.restore();
    lg.save();
    lg.beginPath();
    lg.ellipse(monsterX, by, brx, bry, 0, 0, TAU);
    lg.clip();
    const cell = Math.max(10, brx * 0.11);
    lg.fillStyle = 'rgba(255,255,255,0.5)';
    for (let x = monsterX - brx; x < monsterX + brx; x += cell * 2) lg.fillRect(x, by - bry, cell, bry * 2);
    lg.fillStyle = 'rgba(255,255,255,0.32)';
    for (let y = by - bry; y < by + bry; y += cell * 0.6) lg.fillRect(monsterX - brx, y, brx * 2, cell * 0.3);
    const bs = lg.createRadialGradient(monsterX - brx * 0.3, by - bry * 0.6, 0, monsterX, by, brx);
    bs.addColorStop(0, 'rgba(255,255,255,0.3)');
    bs.addColorStop(1, 'rgba(120,0,40,0.18)');
    lg.fillStyle = bs;
    lg.fillRect(monsterX - brx, by - bry, brx * 2, bry * 2);
    lg.restore();
    this.blanket = { x: monsterX, y: by, rx: brx, ry: bry };
    // flowers and grass tufts in the meadow, but not on the blanket
    const cols = ['#ff7eb6', '#ffffff', '#b58aff', '#ff9f5a', '#ffd23f'];
    const n = Math.round((w * (h - land)) / (u * u * 0.035));
    for (let i = 0; i < n; i++) {
      const x = rand() * w;
      const y = land + u * 0.06 + rand() * (h - land - u * 0.04);
      const dx = (x - monsterX) / (brx * 1.08);
      const dy = (y - by) / (bry * 1.3);
      if (dx * dx + dy * dy < 1) continue;
      const near = (y - land) / (h - land);
      if (rand() < 0.45) grassTuft(lg, x, y, u * (0.015 + near * 0.02));
      else flower(lg, x, y, u * (0.008 + near * 0.012), cols[i % cols.length], rand);
    }
    // a soft vignette for depth
    const vig = lg.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.hypot(w, h) * 0.62);
    vig.addColorStop(0, 'rgba(20,40,80,0)');
    vig.addColorStop(1, 'rgba(20,40,80,0.22)');
    lg.fillStyle = vig;
    lg.fillRect(0, 0, w, h);
    this.land = ground;

    this.cloudImg = cloudSprite(u * 0.075, dpr);
    this.sunR = u * 0.075;
    // the sun sits in the gap between the fruit and the monster's head
    this.sunX = w > h ? w * 0.31 : w * 0.5;
    this.sunY = w > h ? Math.max(u * 0.17, h * 0.15) : h * 0.245;
    if (!this.motes.length) {
      for (let i = 0; i < 26; i++) this.motes.push({ x: rand(), y: rand(), s: 0.5 + rand(), p: rand() * TAU });
    }
  }

  // ---------------------------------------------------------- interactive bits

  onSun(px, py) {
    return Math.hypot(px - this.sunX, py - this.sunY) < this.sunR * 1.4;
  }

  tapSun() {
    this.sunJoy = 1.6;
    this.sunSpin += 1;
  }

  flyPos(f) {
    const { w, h, u, t } = this;
    const top = u * 0.18;
    const span = Math.max(u * 0.2, (this.horizon || h * 0.5) - top);
    const k = t * f.sp + f.p;
    return {
      x: w * (0.5 + 0.42 * Math.sin(k * 2.1 + f.p)) + f.fx,
      y: top + span * (0.5 + 0.45 * Math.sin(k * 3.3)) + f.fy,
    };
  }

  butterflyAt(px, py) {
    for (let i = 0; i < this.flies.length; i++) {
      const f = this.flies[i];
      if (f.flee > 0) continue;
      const p = this.flyPos(f);
      if (Math.hypot(px - p.x, py - p.y) < this.u * 0.07) return i;
    }
    return -1;
  }

  scare(i) {
    const f = this.flies[i];
    f.flee = 2.2;
    f.dir = Math.random() < 0.5 ? -1 : 1;
  }

  update(dt) {
    this.t += dt;
    this.sunJoy = Math.max(0, this.sunJoy - dt);
    for (const c of this.clouds) {
      c.x += c.v * dt;
      if (c.x > 1.25) c.x = -0.25;
    }
    for (const f of this.flies) {
      if (f.flee > 0) {
        f.flee -= dt;
        // zoom off and up, then drift back in
        const k = f.flee > 1.1 ? 1 : -1;
        f.fx += f.dir * this.u * 0.6 * dt * k;
        f.fy -= this.u * 0.3 * dt * k;
        if (f.flee <= 0) f.fx = f.fy = 0;
      }
    }
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

  drawSun(g) {
    const { sunX: x, sunY: y, sunR: r, t } = this;
    const joy = this.sunJoy;
    g.save();
    g.translate(x, y);
    const glow = g.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 3);
    glow.addColorStop(0, 'rgba(255,240,150,0.55)');
    glow.addColorStop(1, 'rgba(255,240,150,0)');
    g.fillStyle = glow;
    g.fillRect(-r * 3, -r * 3, r * 6, r * 6);
    g.save();
    g.rotate(t * 0.25 + (joy > 0 ? (1.6 - joy) * 6 * Math.max(0, joy / 1.6) : 0));
    for (let i = 0; i < 12; i++) {
      g.rotate(TAU / 12);
      const p = new Path2D();
      const l = r * (1.45 + (i % 2) * 0.18 + Math.sin(t * 3 + i) * 0.05);
      p.moveTo(r * 1.1, -r * 0.16);
      p.quadraticCurveTo(l, 0, r * 1.1, r * 0.16);
      p.closePath();
      glossFill(g, p, '#fff8c0', '#ffd23f', '#ffa21e', r * 1.2, 0, r * 0.4);
    }
    g.restore();
    const s = 1 + (joy > 0 ? Math.sin(joy * 14) * 0.06 : Math.sin(t * 1.5) * 0.02);
    g.scale(s, 1 / s);
    const body = new Path2D();
    body.arc(0, 0, r, 0, TAU);
    glossFill(g, body, '#fffbe0', '#ffe14a', '#ffaa1e', 0, 0, r);
    g.lineWidth = r * 0.06;
    g.strokeStyle = '#d07a00';
    g.stroke(body);
    shineMark(g, -r * 0.4, -r * 0.5, r * 0.32, r * 0.14, -0.6, 0.85);
    // face: happy closed eyes when tapped, round ones that blink otherwise
    g.strokeStyle = '#8a4a00';
    g.fillStyle = '#5a2a00';
    g.lineCap = 'round';
    g.lineWidth = r * 0.08;
    const blink = (t % 4.3) < 0.14;
    for (const sx of [-1, 1]) {
      g.beginPath();
      if (joy > 0 || blink) g.arc(sx * r * 0.33, -r * 0.05, r * 0.13, Math.PI * 1.15, Math.PI * 1.85);
      else {
        g.ellipse(sx * r * 0.33, -r * 0.08, r * 0.09, r * 0.12, 0, 0, TAU);
        g.fill();
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(sx * r * 0.33 - r * 0.03, -r * 0.13, r * 0.035, 0, TAU);
        g.fill();
        g.fillStyle = '#5a2a00';
        continue;
      }
      g.stroke();
    }
    g.fillStyle = 'rgba(255,120,100,0.45)';
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.ellipse(sx * r * 0.55, r * 0.22, r * 0.14, r * 0.09, 0, 0, TAU);
      g.fill();
    }
    g.beginPath();
    if (joy > 0) {
      g.moveTo(-r * 0.28, r * 0.22);
      g.quadraticCurveTo(0, r * 0.75, r * 0.28, r * 0.22);
      g.closePath();
      g.fillStyle = '#a0301a';
      g.fill();
    } else {
      g.arc(0, r * 0.2, r * 0.25, 0.25, Math.PI - 0.25);
      g.stroke();
    }
    g.restore();
  }

  drawButterfly(g, f) {
    const { x, y } = this.flyPos(f);
    const s = this.u * 0.03;
    const flap = Math.abs(Math.sin(this.t * (f.flee > 0 ? 30 : 13) + f.p));
    const cols = [['#ffd0ec', '#ff5fb0', '#c0207a'], ['#d0f0ff', '#3fb0ff', '#1260b0']][f.hue];
    g.save();
    g.translate(x, y);
    g.rotate(Math.sin(this.t * 2 + f.p) * 0.25);
    for (const sx of [-1, 1]) {
      g.save();
      g.scale(sx * (0.25 + 0.75 * flap), 1);
      const up = new Path2D();
      up.ellipse(s * 0.75, -s * 0.45, s * 0.8, s * 0.62, -0.5, 0, TAU);
      glossFill(g, up, cols[0], cols[1], cols[2], s * 0.75, -s * 0.45, s * 0.8);
      const lo = new Path2D();
      lo.ellipse(s * 0.55, s * 0.45, s * 0.5, s * 0.42, 0.5, 0, TAU);
      glossFill(g, lo, cols[0], cols[1], cols[2], s * 0.55, s * 0.45, s * 0.5);
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.beginPath();
      g.arc(s * 0.85, -s * 0.5, s * 0.18, 0, TAU);
      g.fill();
      g.restore();
    }
    g.fillStyle = '#3a2440';
    g.beginPath();
    g.ellipse(0, 0, s * 0.14, s * 0.62, 0, 0, TAU);
    g.fill();
    g.strokeStyle = '#3a2440';
    g.lineWidth = s * 0.06;
    g.beginPath();
    g.moveTo(0, -s * 0.55);
    g.quadraticCurveTo(-s * 0.15, -s * 0.95, -s * 0.3, -s * 1.0);
    g.moveTo(0, -s * 0.55);
    g.quadraticCurveTo(s * 0.15, -s * 0.95, s * 0.3, -s * 1.0);
    g.stroke();
    g.restore();
  }

  drawBack(g, monsterX, monsterY, monsterR) {
    const { w, h, u, t } = this;
    g.drawImage(this.sky, 0, 0, w, h);

    // rays of light turning behind everything while celebrating
    const cy = monsterY - monsterR * 0.2;
    if (this.rays > 0.01) {
      g.save();
      g.translate(monsterX, cy);
      g.rotate(t * 0.35);
      const rr = Math.hypot(w, h);
      const rg = g.createRadialGradient(0, 0, monsterR * 0.5, 0, 0, rr * 0.6);
      rg.addColorStop(0, `rgba(255,255,255,${0.55 * this.rays})`);
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg;
      for (let i = 0; i < 16; i++) {
        g.beginPath();
        g.moveTo(0, 0);
        g.arc(0, 0, rr, (i / 16) * TAU, (i / 16 + 0.03) * TAU);
        g.closePath();
        g.fill();
      }
      g.restore();
    }

    this.drawSun(g);
    const cw = this.cloudImg.width / (this.cloudImg.height / (u * 0.075 * 2.4));
    for (const c of this.clouds) {
      const ch = u * 0.075 * 2.4 * c.s;
      g.drawImage(this.cloudImg, c.x * w - (cw * c.s) / 2, c.y * (this.horizon || h * 0.5) - ch / 2, cw * c.s, ch);
    }

    if (this.rainbow > 0.01) {
      const cols = ['#ff4b4b', '#ff9f1c', '#ffe14a', '#5fce4f', '#3bb3ff', '#8b5cf6'];
      const rr = Math.min(w * 0.48, monsterR * 2.9);
      const bw = rr * 0.075;
      const ry = Math.min(h, this.horizon + monsterR * 0.6);
      g.save();
      g.globalAlpha = this.rainbow * 0.85;
      cols.forEach((c, i) => {
        g.beginPath();
        g.arc(monsterX, ry, rr - i * bw, Math.PI, TAU);
        g.lineWidth = bw + 1;
        g.strokeStyle = c;
        g.stroke();
      });
      g.globalAlpha = this.rainbow * 0.35;
      g.beginPath();
      g.arc(monsterX, ry, rr - bw * 1.2, Math.PI * 1.15, Math.PI * 1.45);
      g.lineWidth = bw * 0.35;
      g.strokeStyle = '#ffffff';
      g.stroke();
      g.restore();
    }

    g.drawImage(this.land, 0, 0, w, h);

    // warm sunlight on the monster
    const lr = monsterR * (2.4 + Math.sin(t * 0.8) * 0.06);
    const light = g.createRadialGradient(monsterX, cy, monsterR * 0.2, monsterX, cy, lr);
    light.addColorStop(0, 'rgba(255,252,225,0.4)');
    light.addColorStop(1, 'rgba(255,252,225,0)');
    g.fillStyle = light;
    g.fillRect(monsterX - lr, cy - lr, lr * 2, lr * 2);

    // pollen drifting in the light
    g.fillStyle = 'rgba(255,255,230,0.8)';
    for (const m of this.motes) {
      const x = m.x * w;
      const y = m.y * h;
      g.globalAlpha = 0.25 + 0.35 * Math.sin(t * 2 + m.p);
      if (g.globalAlpha <= 0) continue;
      g.beginPath();
      g.arc(x, y, u * 0.0035 * m.s, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  drawFront(g) {
    for (const f of this.flies) this.drawButterfly(g, f);
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
