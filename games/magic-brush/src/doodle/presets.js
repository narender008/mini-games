// Test doodles for ?debug (window.__mb.doodle(name)) and the node checks:
// each is a list of strokes in canvas uv (v up), with a colour and a brush
// size, drawn the way a child would (scribbled fills, wobbly lines).
const TAU = Math.PI * 2;

// a scribbled-in disc: back-and-forth rows inside a circle
function scribbleDisc(cx, cy, r, colors, rows = 14, aspect = 4 / 3) {
  const out = [];
  for (let i = 0; i < rows; i++) {
    const y = cy - r + (2 * r * (i + 0.5)) / rows;
    const half = Math.sqrt(Math.max(0, r * r - (y - cy) ** 2)) / aspect;
    if (half < 0.005) continue;
    const pts = [];
    for (let k = 0; k <= 10; k++) {
      const u = k / 10;
      pts.push([cx - half + 2 * half * u, y + Math.sin(u * 9 + i) * 0.004]);
    }
    if (i % 2) pts.reverse();
    out.push({ pts, color: colors[Math.floor((i / rows) * colors.length)], size: 'large' });
  }
  return out;
}

function starFill(cx, cy, R, r, colors) {
  const out = [];
  const corner = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i / 10) * TAU;
    const rr = i % 2 ? r : R;
    corner.push([cx + (Math.cos(a) * rr) / (4 / 3), cy + Math.sin(a) * rr]);
  }
  // spokes from the middle out to every point, and the outline
  for (let i = 0; i < 10; i += 2) {
    const [x, y] = corner[i];
    out.push({ pts: [[cx, cy], [(cx + x) / 2, (cy + y) / 2], [x, y]], color: colors[(i / 2) % colors.length], size: 'large' });
  }
  out.push({ pts: [...corner, corner[0]], color: colors[0], size: 'large' });
  out.push(...scribbleDisc(cx, cy, r * 1.05, colors, 6));
  return out;
}

export const PRESETS = {
  blob: () => [...scribbleDisc(0.5, 0.52, 0.27, ['pink', 'purple'], 16), { pts: circle(0.5, 0.52, 0.27, 40), color: 'purple', size: 'medium' }],
  star: () => starFill(0.5, 0.5, 0.36, 0.16, ['yellow', 'orange']),
  // a wavy line, left to right, like a snake
  snake: () => {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const u = i / 40;
      pts.push([0.15 + 0.7 * u, 0.45 + Math.sin(u * TAU * 1.3) * 0.08]);
    }
    return [{ pts, color: 'green', size: 'medium' }];
  },
  'two-blobs': () => [...scribbleDisc(0.3, 0.5, 0.15, ['blue', 'sky'], 9), ...scribbleDisc(0.72, 0.56, 0.12, ['red', 'orange'], 8)],
  tiny: () => [{ pts: [[0.5, 0.5], [0.505, 0.502]], color: 'red', size: 'small' }],
  // a face drawn as lines: a ring with eyes and a smile inside
  face: () => [
    { pts: circle(0.5, 0.5, 0.3, 48), color: 'blue', size: 'medium' },
    { pts: [[0.43, 0.58], [0.435, 0.6]], color: 'black', size: 'medium' },
    { pts: [[0.57, 0.58], [0.575, 0.6]], color: 'black', size: 'medium' },
    { pts: arc(0.5, 0.47, 0.1, Math.PI * 1.15, Math.PI * 1.85, 12), color: 'red', size: 'medium' },
  ],
  // a tall stick figure-ish line
  stick: () => [{ pts: [[0.5, 0.12], [0.505, 0.5], [0.5, 0.88]], color: 'teal', size: 'medium' }],
};

function circle(cx, cy, r, n) {
  return arc(cx, cy, r, 0, TAU, n);
}

function arc(cx, cy, r, a0, a1, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + (Math.cos(a) * r) / (4 / 3), cy + Math.sin(a) * r]);
  }
  return pts;
}

// brush radius in grid px at 256 across, by size (big kid brush 16 at 1024)
const SIZE_PX = { small: 16 * 0.45 * 0.25, medium: 16 * 0.25, large: 16 * 1.8 * 0.25 };

// strokes rasterised into a W x H bit mask (row 0 = v 0), for node checks
export function rasterise(strokes, W = 256, H = 192) {
  const m = new Uint8Array(W * H);
  for (const s of strokes) {
    const r = (SIZE_PX[s.size] ?? 4) * (W / 256);
    for (let i = 0; i < s.pts.length; i++) {
      const a = s.pts[Math.max(0, i - 1)];
      const b = s.pts[i];
      const ax = a[0] * W, ay = a[1] * H, bx = b[0] * W, by = b[1] * H;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r - 1));
      const x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r + 1));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r - 1));
      const y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + r + 1));
      const dx = bx - ax, dy = by - ay;
      const l2 = Math.max(1e-6, dx * dx + dy * dy);
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const t = Math.max(0, Math.min(1, ((x + 0.5 - ax) * dx + (y + 0.5 - ay) * dy) / l2));
          const ex = ax + dx * t - x - 0.5, ey = ay + dy * t - y - 0.5;
          if (ex * ex + ey * ey <= r * r) m[y * W + x] = 1;
        }
    }
  }
  return m;
}
