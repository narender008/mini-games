// Small pictures the toys draw on canvases once: a soft round blob (shadows
// and glows), a bubbly star for treats.
import * as THREE from 'three';

function canvasTexture(size, draw, { srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// a soft round blob, opaque in the middle and clear at the rim (white on clear)
export function blobTexture() {
  return canvasTexture(64, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.45, 'rgba(255,255,255,0.7)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
  });
}

// a rounded five-pointed star, drawn as a THREE.Shape (for an extruded, puffy treat)
export function starShape(outer = 0.045, inner = 0.024) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? inner : outer;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  // corners rounded: each point is the control of a curve between the midpoints of its sides
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const s = new THREE.Shape();
  const m0 = mid(pts[9], pts[0]);
  s.moveTo(m0[0], m0[1]);
  for (let i = 0; i < 10; i++) {
    const m = mid(pts[i], pts[(i + 1) % 10]);
    s.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
  }
  return s;
}
