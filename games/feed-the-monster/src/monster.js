// The monster: a round, wobbly, two-horned blob with big eyes and a big
// mouth. All of it is drawn in local units of its radius R, centred on the
// body. Its moods are a handful of timers that main.js sets:
//   excite  0..1   how close a fruit is (eyes widen, mouth opens)
//   chew    s      chewing after a chomp (puffed cheeks)
//   joy     s      eyes shut in a happy ^^ smile
//   dance   s      the celebration after five fruits (hops and waves)
//   wiggle  s      a giggly shake when tickled
//   gape    s      "aaah": mouth wide open asking for food
export const PALETTES = [
  { base: '#8b5cf6', light: '#cdb6ff', dark: '#5326c4', horn: '#fff4cc' },
  { base: '#16c6b0', light: '#8ff6e6', dark: '#0a7f72', horn: '#fff4cc' },
  { base: '#ff8a1f', light: '#ffc98a', dark: '#cc5500', horn: '#fff8e0' },
  { base: '#ff5fa8', light: '#ffb6d8', dark: '#cc2a76', horn: '#fff4cc' },
  { base: '#3b82f6', light: '#a6c9ff', dark: '#1a4bbf', horn: '#fff4cc' },
];

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Monster {
  constructor() {
    this.pal = 0;
    this.t = 0;
    this.fed = 0; // fruits this round (0..5), makes it rounder and rosier
    this.mouth = 0;
    this.excite = 0;
    this.exciteTarget = 0;
    this.chew = 0;
    this.joy = 0;
    this.dance = 0;
    this.wiggle = 0;
    this.gape = 0;
    this.squash = 0;
    this.squashV = 0;
    this.blink = 0;
    this.nextBlink = 2.5;
    this.look = { x: 0, y: 0 };
    this.lookAt = null; // point in screen space, or null to look ahead
    this.x = 0;
    this.y = 0;
    this.R = 100;
  }

  get mouthX() {
    return this.x;
  }

  get mouthY() {
    return this.y + this.hopY() + this.R * 0.3;
  }

  hopY() {
    if (this.dance <= 0) return 0;
    return -Math.abs(Math.sin(this.dance * 7)) * this.R * 0.28;
  }

  contains(px, py) {
    const dx = px - this.x;
    const dy = py - (this.y + this.hopY());
    return dx * dx + dy * dy < this.R * this.R * 1.15;
  }

  chomp() {
    this.chew = 0.95;
    this.mouth = 0;
    this.squashV += 9;
    this.gape = 0;
  }

  tickle() {
    this.wiggle = 0.9;
    this.joy = Math.max(this.joy, 0.9);
    this.squashV -= 5;
  }

  update(dt) {
    this.t += dt;
    for (const k of ['chew', 'joy', 'dance', 'wiggle', 'gape']) this[k] = Math.max(0, this[k] - dt);
    // springy squash and stretch
    this.squashV += (-120 * this.squash - 9 * this.squashV) * dt;
    this.squash += this.squashV * dt;
    if (this.dance > 0) this.squash = Math.sin(this.dance * 14) * 0.25;
    this.excite += (this.exciteTarget - this.excite) * Math.min(1, dt * 10);

    let target = 0;
    if (this.gape > 0) target = 0.85;
    target = Math.max(target, this.excite);
    if (this.dance > 0) target = 0.55 + Math.sin(this.dance * 7) * 0.25;
    if (this.chew > 0) target = 0.22 * Math.abs(Math.sin(this.chew * 10));
    this.mouth += (target - this.mouth) * Math.min(1, dt * (this.chew > 0 ? 30 : 14));

    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blink = 0.16;
      this.nextBlink = 2 + Math.random() * 3.5;
    }
    this.blink = Math.max(0, this.blink - dt);

    let lx = 0;
    let ly = 0;
    if (this.lookAt) {
      const dx = this.lookAt.x - this.x;
      const dy = this.lookAt.y - (this.y - this.R * 0.3);
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, d / (this.R * 1.2));
      lx = (dx / d) * k;
      ly = (dy / d) * k;
    } else {
      lx = Math.sin(this.t * 0.5) * 0.3;
      ly = Math.sin(this.t * 0.37) * 0.15;
    }
    this.look.x += (lx - this.look.x) * Math.min(1, dt * 12);
    this.look.y += (ly - this.look.y) * Math.min(1, dt * 12);
  }

  draw(g) {
    const R = this.R * (1 + this.fed * 0.025);
    const p = PALETTES[this.pal];
    const t = this.t;
    const hop = this.hopY();

    // shadow on the grass, shrinking as the monster hops
    g.save();
    const sh = 1 + hop / (this.R * 0.6);
    g.beginPath();
    g.ellipse(this.x, this.y + this.R * 1.02, R * 0.85 * sh, R * 0.16 * sh, 0, 0, TAU);
    g.fillStyle = 'rgba(30,90,40,0.25)';
    g.fill();
    g.restore();

    g.save();
    g.translate(this.x, this.y + hop);
    const breathe = Math.sin(t * 2.2) * 0.015;
    const sx = 1 + this.squash * 0.12 - breathe;
    const sy = 1 - this.squash * 0.12 + breathe;
    if (this.wiggle > 0) g.rotate(Math.sin(this.wiggle * 40) * 0.08 * this.wiggle);
    g.translate(0, R * 0.95);
    g.scale(sx, sy);
    g.translate(0, -R * 0.95);
    g.lineJoin = 'round';
    g.lineCap = 'round';

    this.drawFeet(g, R, p);
    this.drawArms(g, R, p);
    this.drawHorns(g, R, p);
    this.drawBody(g, R, p);
    this.drawEyes(g, R, p);
    this.drawCheeks(g, R);
    this.drawMouth(g, R, p);
    g.restore();
  }

  drawFeet(g, R, p) {
    for (const s of [-1, 1]) {
      const lift = this.dance > 0 ? Math.max(0, Math.sin(this.dance * 7 + (s > 0 ? Math.PI : 0))) * R * 0.08 : 0;
      g.beginPath();
      g.ellipse(s * R * 0.42, R * 0.9 - lift, R * 0.26, R * 0.16, 0, 0, TAU);
      g.fillStyle = p.dark;
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.18)';
      for (let i = -1; i <= 1; i++) {
        g.beginPath();
        g.arc(s * R * 0.42 + i * R * 0.1, R * 0.98 - lift, R * 0.045, 0, TAU);
        g.fill();
      }
    }
  }

  drawArms(g, R, p) {
    for (const s of [-1, 1]) {
      let a = 0.5 + Math.sin(this.t * 1.8 + s) * 0.06;
      if (this.excite > 0.3) a -= this.excite * 0.9;
      if (this.dance > 0) a = -1.4 + Math.sin(this.dance * 14 + s) * 0.5;
      if (this.wiggle > 0) a = -0.3 + Math.sin(this.wiggle * 30) * 0.4;
      g.save();
      g.translate(s * R * 0.82, R * 0.15);
      g.scale(s, 1);
      g.rotate(a);
      g.beginPath();
      g.ellipse(R * 0.28, 0, R * 0.3, R * 0.15, 0, 0, TAU);
      g.fillStyle = p.base;
      g.fill();
      g.lineWidth = R * 0.04;
      g.strokeStyle = p.dark;
      g.stroke();
      g.restore();
    }
  }

  drawHorns(g, R, p) {
    for (const s of [-1, 1]) {
      g.save();
      g.translate(s * R * 0.44, -R * 0.78);
      g.scale(s, 1);
      g.beginPath();
      g.moveTo(-R * 0.14, R * 0.08);
      g.quadraticCurveTo(-R * 0.08, -R * 0.3, R * 0.2, -R * 0.42);
      g.quadraticCurveTo(R * 0.1, -R * 0.2, R * 0.16, R * 0.06);
      g.closePath();
      g.fillStyle = p.horn;
      g.fill();
      g.lineWidth = R * 0.035;
      g.strokeStyle = '#d9b860';
      g.stroke();
      g.restore();
    }
    // a little tuft between the horns
    for (let i = -1; i <= 1; i++) {
      g.save();
      g.translate(i * R * 0.12, -R * 0.94);
      g.rotate(i * 0.5 + Math.sin(this.t * 3 + i) * 0.08);
      g.beginPath();
      g.ellipse(0, -R * 0.08, R * 0.07, R * 0.16, 0, 0, TAU);
      g.fillStyle = p.dark;
      g.fill();
      g.restore();
    }
  }

  drawBody(g, R, p) {
    const t = this.t;
    g.beginPath();
    const n = 48;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU;
      const w = 1 + 0.025 * Math.sin(3 * a + t * 2) + 0.015 * Math.sin(5 * a - t * 3);
      // a flatter bottom so it sits on the grass
      const yk = Math.sin(a) > 0 ? 0.94 : 1;
      const x = Math.cos(a) * R * w;
      const y = Math.sin(a) * R * w * yk;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    const grad = g.createRadialGradient(-R * 0.35, -R * 0.45, R * 0.1, 0, 0, R * 1.15);
    grad.addColorStop(0, p.light);
    grad.addColorStop(0.55, p.base);
    grad.addColorStop(1, p.dark);
    g.fillStyle = grad;
    g.fill();
    g.lineWidth = R * 0.04;
    g.strokeStyle = p.dark;
    g.stroke();

    // tummy and spots
    g.beginPath();
    g.ellipse(0, R * 0.58, R * (0.48 + this.fed * 0.02), R * 0.3, 0, 0, TAU);
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.2)';
    for (const [x, y, r] of [[0.6, -0.55, 0.09], [0.74, -0.32, 0.05], [0.72, 0.42, 0.07], [-0.68, 0.48, 0.08], [-0.55, -0.68, 0.06], [-0.76, -0.2, 0.05]]) {
      g.beginPath();
      g.arc(x * R, y * R, r * R, 0, TAU);
      g.fill();
    }
    // shine
    g.save();
    g.translate(-R * 0.48, -R * 0.55);
    g.rotate(-0.7);
    g.beginPath();
    g.ellipse(0, 0, R * 0.2, R * 0.09, 0, 0, TAU);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fill();
    g.restore();
  }

  drawEyes(g, R) {
    const happy = this.joy > 0 || (this.dance > 0 && Math.sin(this.dance * 3) > -0.3);
    const er = R * (0.24 + this.excite * 0.04);
    const open = this.blink > 0 ? Math.abs(this.blink / 0.08 - 1) : 1;
    for (const s of [-1, 1]) {
      const ex = s * R * 0.34;
      const ey = -R * 0.3;
      if (happy) {
        g.beginPath();
        g.arc(ex, ey + er * 0.35, er * 0.62, Math.PI * 1.12, Math.PI * 1.88);
        g.lineWidth = R * 0.075;
        g.strokeStyle = '#2b1840';
        g.stroke();
        continue;
      }
      g.save();
      g.translate(ex, ey);
      g.scale(1, Math.max(0.08, open));
      g.beginPath();
      g.arc(0, 0, er, 0, TAU);
      g.fillStyle = '#ffffff';
      g.fill();
      g.lineWidth = R * 0.03;
      g.strokeStyle = '#2b1840';
      g.stroke();
      if (open > 0.2) {
        const px = this.look.x * er * 0.38;
        const py = this.look.y * er * 0.38;
        const pr = er * (0.55 + this.excite * 0.08);
        g.beginPath();
        g.arc(px, py, pr, 0, TAU);
        g.fillStyle = '#2b1840';
        g.fill();
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(px - pr * 0.35, py - pr * 0.4, pr * 0.34, 0, TAU);
        g.fill();
        g.beginPath();
        g.arc(px + pr * 0.35, py + pr * 0.3, pr * 0.15, 0, TAU);
        g.fill();
      }
      g.restore();
    }
  }

  drawCheeks(g, R) {
    const puff = this.chew > 0 ? 1 : 0;
    const a = 0.7 + this.fed * 0.05 + puff * 0.15 + (this.joy > 0 ? 0.15 : 0);
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(s * R * (0.6 + puff * 0.04), R * 0.08, R * (0.13 + puff * 0.05), R * (0.08 + puff * 0.04), 0, 0, TAU);
      g.fillStyle = `rgba(255,90,150,${clamp(a, 0, 0.95)})`;
      g.fill();
    }
  }

  drawMouth(g, R) {
    const o = this.mouth;
    g.save();
    g.translate(0, R * 0.3);
    if (o < 0.06) {
      // a closed smile that grows with every fruit
      const w = R * (0.3 + this.fed * 0.03);
      const d = R * (0.14 + this.fed * 0.025 + (this.joy > 0 ? 0.06 : 0));
      g.beginPath();
      if (this.chew > 0) {
        g.moveTo(-w * 0.7, 0);
        g.quadraticCurveTo(-w * 0.35, d * 0.6, 0, 0);
        g.quadraticCurveTo(w * 0.35, d * 0.6, w * 0.7, 0);
      } else {
        g.moveTo(-w, 0);
        g.quadraticCurveTo(0, d * 2, w, 0);
      }
      g.lineWidth = R * 0.065;
      g.strokeStyle = '#3a1030';
      g.stroke();
      g.restore();
      return;
    }
    const w = R * (0.28 + 0.24 * o);
    const h = R * (0.05 + 0.4 * o);
    const mouth = new Path2D();
    mouth.moveTo(-w, 0);
    mouth.quadraticCurveTo(0, -h * 0.35, w, 0);
    mouth.quadraticCurveTo(w * 0.9, h * 1.15, 0, h * 1.1);
    mouth.quadraticCurveTo(-w * 0.9, h * 1.15, -w, 0);
    mouth.closePath();
    g.fillStyle = '#5b0f2e';
    g.fill(mouth);
    g.save();
    g.clip(mouth);
    g.beginPath();
    g.ellipse(0, h * 0.35, w * 0.45, h * 0.35, 0, 0, TAU);
    g.fillStyle = '#3a0820';
    g.fill();
    g.beginPath();
    g.ellipse(0, h * 1.05, w * 0.62, h * 0.5, 0, 0, TAU);
    g.fillStyle = '#ff6f9f';
    g.fill();
    g.beginPath();
    g.moveTo(0, h * 0.7);
    g.lineTo(0, h * 1.0);
    g.lineWidth = R * 0.02;
    g.strokeStyle = '#d94a7c';
    g.stroke();
    g.fillStyle = '#ffffff';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * w * 0.18, -h * 0.25);
      g.lineTo(s * w * 0.5, -h * 0.2);
      g.lineTo(s * w * 0.34, R * 0.11);
      g.closePath();
      g.fill();
    }
    g.restore();
    g.lineWidth = R * 0.045;
    g.strokeStyle = '#3a1030';
    g.stroke(mouth);
    g.restore();
  }
}
