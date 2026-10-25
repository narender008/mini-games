// The monster: a squishy, big-eyed jelly blob with a curly sprout on its
// head, little ear fins, stubby arms and feet, and a mouth that opens wider
// than its face. Everything is drawn in local units of its radius R, centred
// on the body, with thick dark outlines like a cartoon.
//
// The body is soft: its outline is a ring of springs (this.off) that dents
// where it is poked and wobbles after a chomp, on top of an overall
// squash-and-stretch spring anchored at the feet. The sprout bobs on its own
// spring a moment behind the body. Moods are timers that main.js sets:
//   excite  0..1   how close a fruit is (eyes widen, mouth opens, arms reach)
//   chew    s      chewing after a chomp (cheeks bulge, wavy mouth)
//   joy     s      happy ^^ eyes
//   love    s      heart eyes, after a treat
//   dance   s      the celebration after five fruits (hops and waves)
//   wiggle  s      a giggly shake with squeezed >< eyes when tickled
//   gape    s      "aaah": mouth wide open asking for food
//   yawn    s      a big yawn before a nap
//   asleep  bool   napping (main.js wakes it on any touch)
//   bloom   s      the bud on the sprout opens into a flower
export const PALETTES = [
  { base: '#7cd23f', light: '#cdf58a', dark: '#3e9a1c', ink: '#21470c', belly: '#e2fba6', bud: '#ff6fa8' },
  { base: '#34c8c0', light: '#a3f3ec', dark: '#148a85', ink: '#0a4442', belly: '#d2fcf7', bud: '#ffd23f' },
  { base: '#ff9a2e', light: '#ffd590', dark: '#d0601a', ink: '#5e2706', belly: '#ffeac0', bud: '#ff5f7e' },
  { base: '#ff72b0', light: '#ffc4de', dark: '#d23a7e', ink: '#5e1232', belly: '#ffe3f0', bud: '#5fd0ff' },
  { base: '#9b6dff', light: '#d6c2ff', dark: '#6035d6', ink: '#29116a', belly: '#ece2ff', bud: '#ffd23f' },
];

const TAU = Math.PI * 2;
const N = 40; // springs around the outline
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Monster {
  constructor() {
    this.pal = 0;
    this.t = 0;
    this.fed = 0; // fruits this round (0..5), makes it rounder and rosier
    this.mouth = 0;
    this.excite = 0;
    this.exciteTarget = 0;
    for (const k of ['chew', 'joy', 'love', 'dance', 'wiggle', 'gape', 'yawn', 'bloom']) this[k] = 0;
    this.asleep = false;
    this.sleep = 0; // 0 awake .. 1 asleep, eased
    this.squash = 0;
    this.squashV = 0;
    this.off = new Float32Array(N);
    this.vel = new Float32Array(N);
    this.sprout = { x: 0, v: 0 }; // sideways sway of the sprout tip
    this.ears = { a: 0, v: 0 };
    this.blink = 0;
    this.nextBlink = 2.5;
    this.look = { x: 0, y: 0 };
    this.lookAt = null; // point in screen space, or null to look around
    this.lean = 0;
    this.x = 0;
    this.y = 0;
    this.R = 100;
  }

  get size() {
    return this.R * (1 + this.fed * 0.025);
  }

  get mouthX() {
    return this.x + this.lean * this.R * 0.9;
  }

  get mouthY() {
    return this.y + this.hopY() + this.R * 0.36;
  }

  // the bud at the tip of the sprout, in screen space
  get budX() {
    return this.x + this.sprout.x * this.R * 0.3 + this.lean * this.R * 2.2;
  }

  get budY() {
    return this.y + this.hopY() - this.size * 1.48 * (1 - this.squash * 0.12);
  }

  hopY() {
    if (this.dance <= 0) return 0;
    return -Math.abs(Math.sin(this.dance * 7)) * this.R * 0.28;
  }

  contains(px, py) {
    const dx = (px - this.x) / (this.R * 1.05);
    const dy = (py - (this.y + this.hopY())) / this.R;
    return dx * dx + dy * dy < 1.1;
  }

  onBud(px, py) {
    return Math.hypot(px - this.budX, py - this.budY) < this.R * 0.32;
  }

  chomp() {
    this.chew = 0.95;
    this.mouth = 0;
    this.squashV += 10;
    this.gape = 0;
    this.yawn = 0;
    // a jelly wobble all the way round
    for (let i = 0; i < N; i++) this.vel[i] += Math.sin((i / N) * TAU * 3) * 0.6;
    this.sprout.v += 6;
  }

  tickle() {
    this.wiggle = 0.9;
    this.joy = 0;
    this.squashV -= 5;
    this.sprout.v += (Math.random() - 0.5) * 14;
    this.ears.v += 14;
  }

  // dent the jelly where a finger pressed it (screen space)
  poke(px, py, strength = 1) {
    const a = Math.atan2(py - (this.y + this.hopY()), (px - this.x) / 1.05);
    for (let i = 0; i < N; i++) {
      const d = wrap((i / N) * TAU - a);
      this.vel[i] -= Math.exp(-d * d * 6) * 2.4 * strength;
    }
    this.squashV -= 2 * strength;
  }

  // a push outward from inside, on both sides (swallowing a big bite)
  gulp() {
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      this.vel[i] += Math.max(0, Math.sin(a)) * 1.6;
    }
  }

  wake() {
    if (!this.asleep) return;
    this.asleep = false;
    this.joy = 0.8;
    this.squashV -= 9;
    this.sprout.v += 10;
    this.ears.v += 16;
  }

  update(dt) {
    this.t += dt;
    for (const k of ['chew', 'joy', 'love', 'dance', 'wiggle', 'gape', 'yawn', 'bloom']) this[k] = Math.max(0, this[k] - dt);
    this.sleep += ((this.asleep ? 1 : 0) - this.sleep) * Math.min(1, dt * 2.5);

    const steps = Math.ceil(dt / (1 / 120));
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      // springy squash and stretch, anchored at the feet
      this.squashV += (-140 * this.squash - 8 * this.squashV) * h;
      this.squash += this.squashV * h;
      // jelly outline
      const o = this.off;
      const v = this.vel;
      for (let i = 0; i < N; i++) {
        const lap = o[(i + N - 1) % N] + o[(i + 1) % N] - 2 * o[i];
        v[i] += (-170 * o[i] - 7 * v[i] + 260 * lap) * h;
      }
      for (let i = 0; i < N; i++) o[i] += v[i] * h;
      // the sprout lags behind the body and swings back
      const sp = this.sprout;
      sp.v += (-60 * sp.x - 3.2 * sp.v - this.squashV * 0.02) * h;
      sp.x += sp.v * h;
      const ea = this.ears;
      ea.v += (-90 * ea.a - 5 * ea.v) * h;
      ea.a += ea.v * h;
    }
    if (this.dance > 0) this.squash = Math.sin(this.dance * 14) * 0.25;
    this.excite += (this.exciteTarget - this.excite) * Math.min(1, dt * 10);

    let target = 0;
    if (this.gape > 0) target = 0.85;
    target = Math.max(target, this.excite);
    if (this.yawn > 0) target = Math.sin(clamp(this.yawn / 1.4, 0, 1) * Math.PI) * 0.9;
    if (this.dance > 0) target = 0.55 + Math.sin(this.dance * 7) * 0.3;
    if (this.chew > 0) target = 0.16 * Math.abs(Math.sin(this.chew * 10));
    if (this.asleep && this.yawn <= 0) target = 0.1 + Math.sin(this.t * 1.6) * 0.04;
    this.mouth += (target - this.mouth) * Math.min(1, dt * (this.chew > 0 ? 30 : 14));

    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blink = 0.16;
      this.nextBlink = 1.8 + Math.random() * 3.5;
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
      // glance around now and then
      const k = Math.floor(this.t / 2.3);
      lx = Math.sin(k * 12.9898) * 0.6;
      ly = Math.sin(k * 78.233) * 0.3;
    }
    this.look.x += (lx - this.look.x) * Math.min(1, dt * 14);
    this.look.y += (ly - this.look.y) * Math.min(1, dt * 14);
    const leanT = this.lookAt ? clamp(lx, -1, 1) * 0.07 * Math.max(this.excite, 0.3) : 0;
    this.lean += (leanT - this.lean) * Math.min(1, dt * 6);
  }

  // ------------------------------------------------------------- drawing

  bodyPath(R) {
    const p = new Path2D();
    const t = this.t;
    const chew = this.chew > 0 ? Math.abs(Math.sin(this.chew * 10)) * 0.5 + 0.5 : 0;
    const pts = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      const c = Math.cos(a);
      const s = Math.sin(a);
      let w = 1 + this.off[i] * 0.12 + 0.012 * Math.sin(3 * a + t * 2);
      // chubby cheeks while chewing
      if (chew) w += chew * 0.07 * Math.exp(-Math.pow(wrap(a - 0.35), 2) * 8) + chew * 0.07 * Math.exp(-Math.pow(wrap(a - Math.PI + 0.35), 2) * 8);
      // a gumdrop: wider and flatter at the bottom, rounder on top
      const x = c * R * w * (1.04 + 0.07 * s);
      const y = s * R * w * (s > 0 ? 0.9 : 1.02);
      pts.push([x, y]);
    }
    // a smooth closed curve through the spring points
    const mid = (i) => {
      const a = pts[i % N];
      const b = pts[(i + 1) % N];
      return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    };
    const m0 = mid(N - 1);
    p.moveTo(m0[0], m0[1]);
    for (let i = 0; i < N; i++) {
      const m = mid(i);
      p.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
    }
    p.closePath();
    return p;
  }

  draw(g) {
    const R = this.size;
    const p = PALETTES[this.pal];
    const hop = this.hopY();

    // soft shadow on the box, shrinking as the monster hops
    g.save();
    const sh = 1 + hop / (this.R * 0.6);
    const sg = g.createRadialGradient(this.x, this.y + this.R * 0.95, 0, this.x, this.y + this.R * 0.95, R * 0.95 * sh);
    sg.addColorStop(0, 'rgba(60,25,5,0.4)');
    sg.addColorStop(1, 'rgba(60,25,5,0)');
    g.fillStyle = sg;
    g.beginPath();
    g.ellipse(this.x, this.y + this.R * 0.95, R * 0.95 * sh, R * 0.2 * sh, 0, 0, TAU);
    g.fill();
    g.restore();

    g.save();
    g.translate(this.x, this.y + hop);
    const breathe = Math.sin(this.t * (this.asleep ? 1.3 : 2.2)) * (this.asleep ? 0.03 : 0.015);
    const open = this.mouth * 0.08;
    const sx = 1 + this.squash * 0.12 - breathe - open * 0.4;
    const sy = 1 - this.squash * 0.12 + breathe + open - this.sleep * 0.03;
    g.translate(0, R * 0.9);
    if (this.wiggle > 0) g.rotate(Math.sin(this.wiggle * 40) * 0.07 * this.wiggle);
    g.rotate(this.lean + (this.dance > 0 ? Math.sin(this.dance * 7) * 0.08 : 0));
    g.scale(sx, sy);
    g.translate(0, -R * 0.9);
    g.lineJoin = 'round';
    g.lineCap = 'round';

    const body = this.bodyPath(R);
    this.drawFeet(g, R, p);
    this.drawArms(g, R, p);
    this.drawSprout(g, R, p);
    this.drawEars(g, R, p);
    this.drawBody(g, R, p, body);
    this.drawEyes(g, R, p);
    this.drawCheeks(g, R);
    this.drawMouth(g, R, p);
    g.restore();
  }

  outline(g, R, p, path, k = 1) {
    g.lineWidth = R * 0.055 * k;
    g.strokeStyle = p.ink;
    if (path) g.stroke(path);
    else g.stroke();
  }

  drawFeet(g, R, p) {
    for (const s of [-1, 1]) {
      const lift = this.dance > 0 ? Math.max(0, Math.sin(this.dance * 7 + (s > 0 ? Math.PI : 0))) * R * 0.1 : 0;
      g.save();
      g.translate(s * R * 0.42, R * 0.86 - lift);
      g.beginPath();
      g.ellipse(0, 0, R * 0.24, R * 0.14, s * 0.12, 0, TAU);
      g.fillStyle = p.dark;
      g.fill();
      this.outline(g, R, p, null, 0.85);
      // little toes
      g.beginPath();
      for (const k of [-0.08, 0.08]) {
        g.moveTo(k * R + s * R * 0.03, R * 0.06);
        g.lineTo(k * R + s * R * 0.03, R * 0.13);
      }
      g.lineWidth = R * 0.03;
      g.stroke();
      g.restore();
    }
  }

  // stubby arms, tucked behind the body so only the ends peek out
  drawArms(g, R, p) {
    for (const s of [-1, 1]) {
      let a = 0.75 + Math.sin(this.t * 1.8 + s) * 0.06;
      if (this.excite > 0.2) a -= this.excite * 1.5;
      if (this.gape > 0) a = -0.2 + Math.sin(this.t * 9 + s) * 0.15;
      if (this.dance > 0) a = -0.8 + Math.sin(this.dance * 14 + s) * 0.5;
      if (this.wiggle > 0) a = -0.4 + Math.sin(this.wiggle * 30) * 0.6; // flapping with the giggles
      if (this.sleep > 0.5) a = 1.1;
      g.save();
      g.translate(s * R * 0.92, R * 0.18);
      g.scale(s, 1);
      g.rotate(a);
      g.beginPath();
      g.ellipse(R * 0.2, 0, R * 0.26, R * 0.13, 0, 0, TAU);
      g.fillStyle = p.base;
      g.fill();
      this.outline(g, R, p, null, 0.85);
      g.restore();
    }
  }

  drawEars(g, R, p) {
    for (const s of [-1, 1]) {
      g.save();
      g.translate(s * R * 0.78, -R * 0.62);
      g.scale(s, 1);
      g.rotate(-0.5 + this.ears.a * 0.08 + this.excite * -0.3 + this.sleep * 0.6 + Math.sin(this.t * 2.6) * 0.04);
      g.beginPath();
      g.moveTo(-R * 0.05, R * 0.12);
      g.quadraticCurveTo(R * 0.12, -R * 0.12, R * 0.34, -R * 0.05);
      g.quadraticCurveTo(R * 0.28, R * 0.18, R * 0.02, R * 0.24);
      g.closePath();
      g.fillStyle = p.base;
      g.fill();
      this.outline(g, R, p, null, 0.85);
      g.beginPath();
      g.moveTo(R * 0.05, R * 0.12);
      g.quadraticCurveTo(R * 0.15, R * 0.02, R * 0.26, -R * 0.01);
      g.lineWidth = R * 0.05;
      g.strokeStyle = p.belly;
      g.stroke();
      g.restore();
    }
  }

  drawSprout(g, R, p) {
    const sw = this.sprout.x * 0.3 + Math.sin(this.t * 1.7) * 0.04;
    const baseY = -R * 0.98;
    const tipX = sw * R;
    const tipY = -R * 1.48 + Math.abs(sw) * R * 0.1 + this.sleep * R * 0.12;
    const droop = this.sleep * R * 0.25;
    const curl = new Path2D();
    curl.moveTo(0, baseY + R * 0.06);
    curl.bezierCurveTo(R * 0.12, baseY - R * 0.12, tipX - R * 0.14 + droop, tipY + R * 0.22, tipX + droop * 0.6, tipY + droop * 0.5);
    g.lineWidth = R * 0.15;
    g.strokeStyle = p.ink;
    g.stroke(curl);
    g.lineWidth = R * 0.07;
    g.strokeStyle = '#6cc23a';
    g.stroke(curl);
    // two leaves halfway up
    const lx = tipX * 0.45 + R * 0.04;
    const ly = (baseY + tipY) / 2 + R * 0.06;
    for (const s of [-1, 1]) {
      g.save();
      g.translate(lx, ly);
      g.rotate(s > 0 ? -0.5 + sw * 0.6 : Math.PI + 0.5 + sw * 0.6);
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(R * 0.13, -R * 0.13, R * 0.27, 0);
      g.quadraticCurveTo(R * 0.13, R * 0.1, 0, 0);
      g.fillStyle = '#8ee04f';
      g.fill();
      this.outline(g, R, p, null, 0.7);
      g.restore();
    }
    // the bud, or a flower when it has bloomed
    g.save();
    g.translate(tipX + droop * 0.6, tipY + droop * 0.5);
    const bl = this.bloom > 0 ? Math.min(1, (2.6 - this.bloom) * 5, this.bloom * 2) : 0;
    if (bl > 0) {
      g.rotate(this.t * 1.5);
      for (let i = 0; i < 6; i++) {
        g.rotate(TAU / 6);
        g.beginPath();
        g.ellipse(R * 0.15 * bl, 0, R * 0.12 * bl, R * 0.08 * bl, 0, 0, TAU);
        g.fillStyle = i % 2 ? p.bud : '#ffffff';
        g.fill();
        this.outline(g, R, p, null, 0.6);
      }
      g.beginPath();
      g.arc(0, 0, R * 0.08, 0, TAU);
      g.fillStyle = '#ffd23f';
      g.fill();
      this.outline(g, R, p, null, 0.6);
    } else {
      const pulse = 1 + Math.sin(this.t * 3) * 0.05;
      const glow = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.3);
      glow.addColorStop(0, 'rgba(255,255,220,0.55)');
      glow.addColorStop(1, 'rgba(255,255,220,0)');
      g.fillStyle = glow;
      g.beginPath();
      g.arc(0, 0, R * 0.3, 0, TAU);
      g.fill();
      g.beginPath();
      g.ellipse(0, 0, R * 0.1 * pulse, R * 0.12 * pulse, 0, 0, TAU);
      g.fillStyle = p.bud;
      g.fill();
      this.outline(g, R, p, null, 0.7);
      g.beginPath();
      g.arc(-R * 0.03, -R * 0.04, R * 0.03, 0, TAU);
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.fill();
    }
    g.restore();
  }

  drawBody(g, R, p, body) {
    const grad = g.createRadialGradient(-R * 0.3, -R * 0.55, R * 0.1, 0, -R * 0.1, R * 1.25);
    grad.addColorStop(0, p.light);
    grad.addColorStop(0.5, p.base);
    grad.addColorStop(1, p.dark);
    g.fillStyle = grad;
    g.fill(body);

    g.save();
    g.clip(body);
    // tummy
    g.beginPath();
    g.ellipse(0, R * 0.62, R * (0.6 + this.fed * 0.02), R * 0.42, 0, 0, TAU);
    g.fillStyle = p.belly;
    g.globalAlpha = 0.55;
    g.fill();
    g.globalAlpha = 1;
    // freckles on the head
    g.fillStyle = p.dark;
    g.globalAlpha = 0.45;
    for (const [x, y, r] of [[-0.62, -0.5, 0.07], [-0.5, -0.66, 0.045], [-0.74, -0.32, 0.04], [0.6, -0.56, 0.06], [0.72, -0.36, 0.045], [0.5, -0.72, 0.035]]) {
      g.beginPath();
      g.arc(x * R, y * R, r * R, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
    // soft shade along the bottom and a rim light along the top
    const sh = g.createLinearGradient(0, R * 0.2, 0, R);
    sh.addColorStop(0, 'rgba(0,0,0,0)');
    sh.addColorStop(1, 'rgba(20,10,40,0.22)');
    g.fillStyle = sh;
    g.fillRect(-R * 1.4, R * 0.2, R * 2.8, R);
    g.lineWidth = R * 0.12;
    g.strokeStyle = 'rgba(255,255,255,0.28)';
    g.beginPath();
    g.ellipse(0, R * 0.06, R * 0.98, R * 0.98, 0, Math.PI * 1.12, Math.PI * 1.55);
    g.stroke();
    g.restore();
    // glossy highlight
    g.save();
    g.translate(-R * 0.55, -R * 0.62);
    g.rotate(-0.75);
    g.beginPath();
    g.ellipse(0, 0, R * 0.17, R * 0.07, 0, 0, TAU);
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fill();
    g.beginPath();
    g.arc(R * 0.22, R * 0.02, R * 0.035, 0, TAU);
    g.fill();
    g.restore();

    this.outline(g, R, p, body, 1.1);
  }

  eyeMode() {
    if (this.sleep > 0.5 && this.yawn <= 0) return 'sleep';
    if (this.wiggle > 0 || this.yawn > 0.25) return 'squeeze';
    if (this.love > 0) return 'love';
    if (this.joy > 0 || (this.dance > 0 && Math.sin(this.dance * 3) > -0.3) || this.chew > 0.25) return 'happy';
    return 'open';
  }

  drawEyes(g, R, p) {
    const mode = this.eyeMode();
    const er = R * (0.27 + this.excite * 0.035 + (this.gape > 0 ? 0.02 : 0));
    const ink = p.ink;
    for (const s of [-1, 1]) {
      const ex = s * R * 0.3 + this.look.x * R * 0.03;
      const ey = -R * 0.34 + this.look.y * R * 0.02;
      g.save();
      g.translate(ex, ey);
      // brows: up when excited, pleading when hungry
      const by = -er * (1.25 + this.excite * 0.25 + (this.gape > 0 ? 0.15 : 0));
      const tilt = (this.gape > 0 ? 0.35 : this.excite * -0.1) * s;
      if (mode === 'open' || mode === 'love') {
        g.save();
        g.translate(0, by);
        g.rotate(tilt);
        g.beginPath();
        g.moveTo(-er * 0.45, er * 0.05);
        g.quadraticCurveTo(0, -er * 0.18, er * 0.45, er * 0.05);
        g.lineWidth = R * 0.06;
        g.strokeStyle = ink;
        g.stroke();
        g.restore();
      }
      g.lineWidth = R * 0.065;
      g.strokeStyle = ink;
      if (mode === 'happy') {
        g.beginPath();
        g.arc(0, er * 0.35, er * 0.62, Math.PI * 1.15, Math.PI * 1.85);
        g.stroke();
        g.restore();
        continue;
      }
      if (mode === 'squeeze') {
        g.beginPath();
        g.moveTo(-s * er * 0.5, -er * 0.4);
        g.lineTo(s * er * 0.35, 0);
        g.lineTo(-s * er * 0.5, er * 0.4);
        g.stroke();
        g.restore();
        continue;
      }
      if (mode === 'sleep') {
        g.beginPath();
        g.arc(0, -er * 0.1, er * 0.55, Math.PI * 0.15, Math.PI * 0.85);
        g.stroke();
        g.restore();
        continue;
      }
      // the eye white, bulging slightly when excited
      g.beginPath();
      g.ellipse(0, 0, er, er * 1.06, 0, 0, TAU);
      const wg = g.createRadialGradient(-er * 0.3, -er * 0.4, er * 0.1, 0, 0, er * 1.1);
      wg.addColorStop(0, '#ffffff');
      wg.addColorStop(0.75, '#f4f6fb');
      wg.addColorStop(1, '#d6dbe8');
      g.fillStyle = wg;
      g.fill();
      g.save();
      g.clip();
      const px = this.look.x * er * 0.34;
      const py = this.look.y * er * 0.32;
      if (mode === 'love') {
        const hs = er * (0.62 + Math.sin(this.t * 10) * 0.06);
        g.translate(px, py);
        g.fillStyle = '#ff3b6e';
        heartPath(g, hs);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.8)';
        g.beginPath();
        g.arc(-hs * 0.35, -hs * 0.3, hs * 0.16, 0, TAU);
        g.fill();
      } else {
        const pr = er * (0.6 + this.excite * 0.1 + (this.gape > 0 ? 0.06 : 0));
        const ig = g.createRadialGradient(px, py + pr * 0.3, pr * 0.2, px, py, pr);
        ig.addColorStop(0, '#5a3a2a');
        ig.addColorStop(0.6, '#2a1712');
        ig.addColorStop(1, '#140a08');
        g.fillStyle = ig;
        g.beginPath();
        g.arc(px, py, pr, 0, TAU);
        g.fill();
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.ellipse(px - pr * 0.32, py - pr * 0.36, pr * 0.32, pr * 0.26, -0.5, 0, TAU);
        g.fill();
        g.beginPath();
        g.arc(px + pr * 0.38, py + pr * 0.32, pr * 0.13, 0, TAU);
        g.fill();
      }
      // eyelid: blinking, drowsy or content
      let lid = 0;
      if (this.blink > 0) lid = 1 - Math.abs(this.blink / 0.08 - 1);
      lid = Math.max(lid, this.sleep * 0.9, this.yawn > 0 ? 0.5 : 0);
      if (lid > 0.02) {
        const ly = -er * 1.1 + lid * er * 2.2;
        g.beginPath();
        g.rect(-er * 1.2, -er * 1.3, er * 2.4, ly + er * 1.3);
        g.fillStyle = p.base;
        g.fill();
        g.beginPath();
        g.moveTo(-er * 1.2, ly);
        g.lineTo(er * 1.2, ly);
        g.lineWidth = R * 0.05;
        g.strokeStyle = ink;
        g.stroke();
      }
      g.restore();
      g.beginPath();
      g.ellipse(0, 0, er, er * 1.06, 0, 0, TAU);
      g.lineWidth = R * 0.05;
      g.strokeStyle = ink;
      g.stroke();
      g.restore();
    }
  }

  drawCheeks(g, R) {
    const puff = this.chew > 0 ? 1 : 0;
    const a = 0.45 + this.fed * 0.06 + puff * 0.15 + (this.joy > 0 || this.love > 0 ? 0.15 : 0);
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(s * R * (0.66 + puff * 0.06), R * 0.08, R * (0.13 + puff * 0.04), R * (0.075 + puff * 0.03), 0, 0, TAU);
      g.globalAlpha = clamp(a + 0.25, 0, 1);
      g.fillStyle = '#ff8fb4';
      g.fill();
      g.globalAlpha = 1;
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.beginPath();
      g.arc(s * R * 0.62, R * 0.05, R * 0.022, 0, TAU);
      g.fill();
    }
  }

  fang(g, x, y, w, h, ink, R) {
    g.beginPath();
    g.moveTo(x - w, y);
    g.quadraticCurveTo(x - w * 0.3, y + h, x, y + h);
    g.quadraticCurveTo(x + w * 0.3, y + h, x + w, y);
    g.closePath();
    g.fillStyle = '#ffffff';
    g.fill();
    g.lineWidth = R * 0.03;
    g.strokeStyle = ink;
    g.stroke();
  }

  drawMouth(g, R, p) {
    const o = this.mouth;
    const ink = p.ink;
    g.save();
    if (o < 0.06) {
      g.translate(0, R * 0.3);
      // a closed grin that grows with every fruit, two fangs peeking out
      const w = R * (0.3 + this.fed * 0.03);
      const d = R * (0.1 + this.fed * 0.02 + (this.joy > 0 ? 0.05 : 0));
      g.beginPath();
      if (this.chew > 0) {
        const k = Math.sin(this.chew * 20) * R * 0.03;
        g.moveTo(-w * 0.7, 0);
        g.quadraticCurveTo(-w * 0.35, d + k, 0, 0);
        g.quadraticCurveTo(w * 0.35, d - k, w * 0.7, 0);
      } else {
        g.moveTo(-w, -d * 0.2);
        g.quadraticCurveTo(0, d * 2.2, w, -d * 0.2);
      }
      if (this.chew <= 0 && !this.asleep) {
        this.fang(g, -w * 0.38, d * 0.75, R * 0.055, R * 0.09, ink, R);
        this.fang(g, w * 0.38, d * 0.75, R * 0.055, R * 0.09, ink, R);
        g.beginPath();
        g.moveTo(-w, -d * 0.2);
        g.quadraticCurveTo(0, d * 2.2, w, -d * 0.2);
      }
      g.lineWidth = R * 0.065;
      g.strokeStyle = ink;
      g.stroke();
      g.restore();
      return;
    }
    g.translate(0, R * (0.3 - 0.16 * o));
    const w = R * (0.26 + 0.36 * o);
    const h = R * (0.06 + 0.6 * o);
    const mouth = new Path2D();
    mouth.moveTo(-w, 0);
    mouth.quadraticCurveTo(0, h * 0.12, w, 0);
    mouth.bezierCurveTo(w * 1.02, h * 0.75, w * 0.6, h * 1.08, 0, h * 1.08);
    mouth.bezierCurveTo(-w * 0.6, h * 1.08, -w * 1.02, h * 0.75, -w, 0);
    mouth.closePath();
    const mg = g.createLinearGradient(0, 0, 0, h);
    mg.addColorStop(0, '#3a0618');
    mg.addColorStop(1, '#7a1638');
    g.fillStyle = mg;
    g.fill(mouth);
    g.save();
    g.clip(mouth);
    // tongue, wagging a little when the mouth is wide
    const tw = Math.sin(this.t * 8) * w * 0.06 * o;
    g.beginPath();
    g.ellipse(tw, h * 1.02, w * 0.62, h * 0.42, 0, 0, TAU);
    g.fillStyle = '#ff6f9a';
    g.fill();
    g.beginPath();
    g.moveTo(tw, h * 0.72);
    g.lineTo(tw, h * 0.95);
    g.lineWidth = R * 0.025;
    g.strokeStyle = '#d4407a';
    g.stroke();
    g.beginPath();
    g.ellipse(tw - w * 0.22, h * 0.78, w * 0.12, h * 0.06, -0.3, 0, TAU);
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.fill();
    g.restore();
    // fangs at the top corners
    if (!this.asleep) {
      const fh = R * (0.07 + 0.07 * o);
      this.fang(g, -w * 0.52, h * 0.02, R * 0.06, fh, ink, R);
      this.fang(g, w * 0.52, h * 0.02, R * 0.06, fh, ink, R);
    }
    g.lineWidth = R * 0.06;
    g.strokeStyle = ink;
    g.stroke(mouth);
    // a drop of drool when a fruit is very close
    if (this.excite > 0.8 && this.chew <= 0) {
      const dy = h * 1.05 + ((this.t * 0.6) % 1) * R * 0.12;
      g.beginPath();
      g.ellipse(w * 0.45, dy, R * 0.035, R * 0.05, 0, 0, TAU);
      g.fillStyle = 'rgba(190,235,255,0.9)';
      g.fill();
      g.lineWidth = R * 0.02;
      g.stroke();
    }
    g.restore();
  }
}

export function heartPath(g, s) {
  g.beginPath();
  g.moveTo(0, s * 0.9);
  g.bezierCurveTo(-s * 1.3, 0, -s * 0.7, -s * 1.1, 0, -s * 0.45);
  g.bezierCurveTo(s * 0.7, -s * 1.1, s * 1.3, 0, 0, s * 0.9);
  g.closePath();
}
