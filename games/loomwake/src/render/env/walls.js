// Back walls extruded upward from the outline edges that face away from the camera.
// Walls are painted into the floor canvas: nothing can stand behind them, so every actor
// is always drawn in front. Front-facing edges get no wall (they would hide the fight).
//
//   wallSegments(shape, { minUp }) -> [{ x1, y1, x2, y2, nx, ny, len, side }]
//   paintWalls(g, ge, shape, style, r) -> segments painted
//     style: { H (back wall height), sideH (side wall height), base, top, trim, detail(g, ge, seg, H, r) }

import { hexA, mix } from './common.js';

export function wallSegments(shape, minUp = -0.18) {
  const out = [];
  for (let i = 0; i < shape.length; i++) {
    const [x1, y1] = shape[i], [x2, y2] = shape[(i + 1) % shape.length];
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 1) continue;
    const nx = (y2 - y1) / len, ny = -(x2 - x1) / len;
    if (ny > minUp) continue;
    out.push({ x1, y1, x2, y2, nx, ny, len, side: Math.abs(nx) > 0.75 });
  }
  return out;
}

// height along a segment eases from back-wall height to side-wall height
export function wallH(seg, style) { const k = Math.min(1, Math.abs(seg.nx) * 1.1); return style.H * (1 - k) + (style.sideH ?? style.H * 0.55) * k; }

export function paintWalls(g, ge, shape, style, r) {
  const segs = wallSegments(shape, style.minUp ?? -0.18);
  // far walls first (smaller y), so nearer side walls overlap them
  segs.sort((a, b) => Math.min(a.y1, a.y2) - Math.min(b.y1, b.y2));
  // floor shadow cast by the walls (soft band along their feet)
  g.save(); g.beginPath(); shape.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.clip();
  for (let k = 0; k < 5; k++) {
    g.strokeStyle = `rgba(0,0,10,${0.12})`; g.lineWidth = 20 + k * 22;
    g.beginPath();
    for (const s of segs) { g.moveTo(s.x1, s.y1 + 10); g.lineTo(s.x2, s.y2 + 10); }
    g.stroke();
  }
  g.restore();
  for (const s of segs) {
    const h1 = wallH(s, style), h2 = h1;
    // face
    g.beginPath(); g.moveTo(s.x1, s.y1 + 2); g.lineTo(s.x2, s.y2 + 2); g.lineTo(s.x2, s.y2 - h2); g.lineTo(s.x1, s.y1 - h1); g.closePath();
    const facing = -s.ny; // 1 = faces the camera fully
    const lg = g.createLinearGradient(0, Math.min(s.y1, s.y2) - h1, 0, Math.max(s.y1, s.y2));
    lg.addColorStop(0, mix(style.top, '#000000', 0.15 * (1 - facing)));
    lg.addColorStop(1, mix(style.base, '#000000', 0.3 * (1 - facing)));
    g.fillStyle = lg; g.fill();
    if (style.detail) { g.save(); g.clip(); style.detail(g, ge, s, h1, r); g.restore(); }
    // contact shadow at the foot and a cap line on top
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 6; g.beginPath(); g.moveTo(s.x1, s.y1 + 2); g.lineTo(s.x2, s.y2 + 2); g.stroke();
    g.strokeStyle = hexA(style.trim, 0.7); g.lineWidth = 3; g.beginPath(); g.moveTo(s.x1, s.y1 - h1); g.lineTo(s.x2, s.y2 - h2); g.stroke();
  }
  return segs;
}
