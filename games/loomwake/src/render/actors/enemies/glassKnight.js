// Glass Knight: Veyl's honour guard. The Thread-Knight's body in grown
// crystal plate with a crown of glass instead of horns. When its armour
// breaks the plate shatters into a burst of shards (render-side), leaving the
// lashed thread-body underneath.
import { begin, end, glow, clamp, TAU } from './kit.js';
import { drawKnightBody } from './knight.js';

const COLS = ['#bff8ff', '#6fe6f0', '#c9a6ff', '#ffffff'];
function shatter(ctx, S) {
  const e = S.e, A = S.A;
  const broken = e.maxArmor > 0 && e.armor <= 0;
  if (broken && !A.broken) { A.broken = true; A.shatterT = S.t; }
  if (!broken) A.broken = false;
  if (A.shatterT === undefined) return;
  const k = (S.t - A.shatterT) / 0.9;
  if (k < 0 || k > 1) return;
  if (k < 0.25) glow(ctx, 0, -70, 120 * (1 - k * 2), '#bff8ff', 1 - k * 4);
  for (let i = 0; i < 26; i++) {
    const s = (e.seed % 977) + i * 7.7;
    const a = (i / 26) * TAU + Math.sin(s) * 0.3, v = 120 + (s % 90);
    const x = Math.cos(a) * v * k, y0 = -50 - (i % 5) * 10 + Math.sin(a) * v * k * 0.5;
    const z = 160 * k - 320 * k * k;
    const y = y0 - z;
    const sz = 4 + (i % 4) * 2;
    ctx.save(); ctx.translate(x, y); ctx.rotate(s + k * 12);
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = COLS[i % 4];
    ctx.beginPath(); ctx.moveTo(0, -sz); ctx.lineTo(sz * 0.45, 0); ctx.lineTo(0, sz * 0.6); ctx.lineTo(-sz * 0.45, 0); ctx.fill();
    ctx.restore();
  }
}

export default function draw(ctx, e, G, P) {
  const S = begin(ctx, e, G, P);
  if (!S) return;
  drawKnightBody(ctx, S, 'glass');
  end(ctx, S);
  shatter(ctx, S);
}
