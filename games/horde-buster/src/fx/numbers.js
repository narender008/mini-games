// Floating damage numbers: white for hits, big gold for crits, red for damage
// to the hero, green for healing. A pool of typed arrays; drawn as glyphs.
import { GLYPHS } from '../gl/renderer.js';
import { rand } from '../config.js';

const DIGIT = [];
for (let d = 0; d < 10; d++) DIGIT[d] = GLYPHS.indexOf(String(d));
const PLUS = GLYPHS.indexOf('+');
const MINUS = GLYPHS.indexOf('-');

export class Numbers {
  constructor(cap) {
    this.cap = cap;
    const F = () => new Float32Array(cap);
    this.x = F();
    this.y = F();
    this.vx = F();
    this.vy = F();
    this.life = F();
    this.value = F();
    this.size = F();
    this.style = new Uint8Array(cap);
    this.n = 0;
    this.enabled = true;
  }

  reset() {
    this.n = 0;
  }

  // style: 0 hit, 1 crit, 2 hurt, 3 heal, 4 xp
  add(x, y, value, style = 0) {
    if (!this.enabled && style < 2) return;
    let i = this.n < this.cap ? this.n++ : Math.floor(Math.random() * this.cap);
    this.x[i] = x + rand(-8, 8);
    this.y[i] = y;
    this.vx[i] = rand(-40, 40);
    this.vy[i] = style === 1 ? -260 : -190;
    this.life[i] = 0;
    this.value[i] = Math.max(1, Math.round(value));
    this.size[i] = style === 1 ? 30 : style === 2 ? 30 : 19;
    this.style[i] = style;
  }

  update(dt) {
    let n = this.n;
    for (let i = 0; i < n; i++) {
      this.life[i] += dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.vy[i] += 520 * dt;
      if (this.life[i] > 0.75) {
        n--;
        if (i !== n) {
          this.x[i] = this.x[n];
          this.y[i] = this.y[n];
          this.vx[i] = this.vx[n];
          this.vy[i] = this.vy[n];
          this.life[i] = this.life[n];
          this.value[i] = this.value[n];
          this.size[i] = this.size[n];
          this.style[i] = this.style[n];
        }
        i--;
      }
    }
    this.n = n;
  }

  draw(list) {
    for (let i = 0; i < this.n; i++) {
      const t = this.life[i] / 0.75;
      // pop in big, settle, fade out at the end
      const pop = t < 0.12 ? 1 + (0.12 - t) * 5 : 1;
      const s = this.size[i] * pop;
      const a = t > 0.7 ? (1 - t) / 0.3 : 1;
      const st = this.style[i];
      const r = st === 1 ? 1.0 : st === 2 ? 1.0 : st === 3 ? 0.4 : 1.0;
      const g = st === 1 ? 0.82 : st === 2 ? 0.2 : st === 3 ? 1.0 : 1.0;
      const b = st === 1 ? 0.15 : st === 2 ? 0.15 : st === 3 ? 0.4 : 1.0;
      let v = this.value[i];
      let digits = 0;
      for (let q = v; q > 0; q = Math.floor(q / 10)) digits++;
      const prefix = st === 2 ? MINUS : st === 3 ? PLUS : -1;
      const count = digits + (prefix >= 0 ? 1 : 0);
      const adv = s * 0.52;
      let x = this.x[i] + ((count - 1) * adv) / 2;
      const y = this.y[i];
      for (let d = 0; d < digits; d++) {
        list.p(x, y, s, 0, r, g, b, a, DIGIT[v % 10], 0, 0, 0.8);
        v = Math.floor(v / 10);
        x -= adv;
      }
      if (prefix >= 0) list.p(x, y, s, 0, r, g, b, a, prefix, 0, 0, 0.8);
    }
  }
}
