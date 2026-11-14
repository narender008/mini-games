// Dev-only: environment art samples at large scale (served at /env.html, never built).
import { drawLeaf, leafClump, groundCover, LOOKS } from '../art/env';
import { Pix, makeCanvas } from '../art/pix';

const S = 6;
const L = LOOKS.causeway;
const p = new Pix(160, 90);
p.rect(0, 0, 160, 90, [20, 30, 34, 255]);
for (let i = 0; i < 8; i++) drawLeaf(p, 6 + i * 12, 10, -Math.PI / 2 + (i - 4) * 0.4, 6 + (i % 4), (i - 4) / 4, L);
for (let i = 0; i < 4; i++) leafClump(p, 20 + i * 36, 45, 10 + i * 2, L, 0.2 + i * 0.25);
for (let i = 0; i < 6; i++) groundCover(p, 4 + i * 18, 70, L, 100 + i, i / 5);
const c = makeCanvas(p.w * S, p.h * S);
p.drawTo(c.getContext('2d')!, 0, 0, S);
document.body.appendChild(c);
(window as unknown as { __ready: boolean }).__ready = true;
