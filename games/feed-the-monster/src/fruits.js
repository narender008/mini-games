// The fruits, painted with Canvas 2D paths. Each kind is drawn once per
// screen size into a sprite (see makeSprites) and the sprites are drawn
// every frame. Shapes are centred on 0,0 and fit inside a circle of radius r.
export const KINDS = ['apple', 'banana', 'strawberry', 'orange', 'grapes', 'watermelon', 'pear', 'cherries'];

// colours used for the crumbs when a fruit is eaten
export const CRUMBS = {
  apple: ['#ff3b3b', '#fff1d6', '#ff8a7a'],
  banana: ['#ffd84a', '#fff6c9', '#ffe98a'],
  strawberry: ['#ff2d55', '#ffe14a', '#ff8fa3'],
  orange: ['#ff9f1c', '#ffd08a', '#ffb347'],
  grapes: ['#9b4dff', '#d7b5ff', '#7a2fe0'],
  watermelon: ['#ff4f6d', '#3fbf4f', '#ffd1da'],
  pear: ['#b5e655', '#f3ffc4', '#8cc63a'],
  cherries: ['#e8203a', '#ff8090', '#ffd1d6'],
};

function shade(g, r, light, base, dark, outline = true) {
  const grad = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.05, -r * 0.1, -r * 0.1, r * 1.25);
  grad.addColorStop(0, light);
  grad.addColorStop(0.45, base);
  grad.addColorStop(1, dark);
  g.fillStyle = grad;
  g.fill();
  if (outline) {
    g.lineWidth = r * 0.06;
    g.strokeStyle = dark;
    g.stroke();
  }
}

function shine(g, x, y, rx, ry, a = 0.5) {
  g.save();
  g.translate(x, y);
  g.rotate(-0.6);
  g.beginPath();
  g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  g.fillStyle = `rgba(255,255,255,${a})`;
  g.fill();
  g.restore();
}

function leaf(g, x, y, len, angle, color = '#3fbf3f') {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(len * 0.5, -len * 0.45, len, 0);
  g.quadraticCurveTo(len * 0.5, len * 0.45, 0, 0);
  const grad = g.createLinearGradient(0, -len * 0.3, 0, len * 0.3);
  grad.addColorStop(0, '#7ee36a');
  grad.addColorStop(1, color);
  g.fillStyle = grad;
  g.fill();
  g.lineWidth = len * 0.07;
  g.strokeStyle = '#238a2a';
  g.stroke();
  g.beginPath();
  g.moveTo(len * 0.1, 0);
  g.lineTo(len * 0.8, 0);
  g.lineWidth = len * 0.05;
  g.stroke();
  g.restore();
}

function stem(g, r, x0, y0, cx, cy, x1, y1, w = 0.1) {
  g.beginPath();
  g.moveTo(x0, y0);
  g.quadraticCurveTo(cx, cy, x1, y1);
  g.lineCap = 'round';
  g.lineWidth = r * w;
  g.strokeStyle = '#7a4a1f';
  g.stroke();
}

const draw = {
  apple(g, r) {
    stem(g, r, 0, -r * 0.5, r * 0.04, -r * 0.82, r * 0.16, -r * 0.98);
    g.beginPath();
    g.moveTo(0, -r * 0.6);
    g.bezierCurveTo(r * 0.5, -r * 0.95, r * 1.05, -r * 0.55, r * 0.92, r * 0.1);
    g.bezierCurveTo(r * 0.82, r * 0.7, r * 0.4, r * 0.98, 0, r * 0.82);
    g.bezierCurveTo(-r * 0.4, r * 0.98, -r * 0.82, r * 0.7, -r * 0.92, r * 0.1);
    g.bezierCurveTo(-r * 1.05, -r * 0.55, -r * 0.5, -r * 0.95, 0, -r * 0.6);
    g.closePath();
    shade(g, r, '#ffa29a', '#ff3b3b', '#c4102a');
    leaf(g, r * 0.12, -r * 0.78, r * 0.48, -0.55);
    shine(g, -r * 0.45, -r * 0.22, r * 0.14, r * 0.26);
  },
  banana(g, r) {
    g.save();
    g.rotate(-0.28);
    g.beginPath();
    g.moveTo(-r * 0.95, -r * 0.45);
    g.quadraticCurveTo(0, r * 1.95, r * 0.95, -r * 0.45);
    g.quadraticCurveTo(r * 0.5, r * 0.12, 0, r * 0.16);
    g.quadraticCurveTo(-r * 0.5, r * 0.12, -r * 0.95, -r * 0.45);
    g.closePath();
    shade(g, r, '#fff6a8', '#ffd84a', '#e0a000');
    // the ridge along the banana
    g.beginPath();
    g.moveTo(-r * 0.8, -r * 0.2);
    g.quadraticCurveTo(0, r * 1.2, r * 0.8, -r * 0.2);
    g.lineWidth = r * 0.035;
    g.strokeStyle = 'rgba(200,140,0,0.45)';
    g.stroke();
    // stalk and tip
    g.beginPath();
    g.moveTo(r * 0.88, -r * 0.4);
    g.lineTo(r * 0.98, -r * 0.72);
    g.lineCap = 'round';
    g.lineWidth = r * 0.13;
    g.strokeStyle = '#8a6a2a';
    g.stroke();
    g.beginPath();
    g.arc(-r * 0.95, -r * 0.45, r * 0.06, 0, Math.PI * 2);
    g.fillStyle = '#5a3a14';
    g.fill();
    shine(g, -r * 0.35, r * 0.42, r * 0.08, r * 0.24, 0.45);
    g.restore();
  },
  strawberry(g, r) {
    g.beginPath();
    g.moveTo(0, r * 0.95);
    g.bezierCurveTo(-r * 0.6, r * 0.7, -r * 0.98, 0, -r * 0.82, -r * 0.42);
    g.bezierCurveTo(-r * 0.62, -r * 0.78, r * 0.62, -r * 0.78, r * 0.82, -r * 0.42);
    g.bezierCurveTo(r * 0.98, 0, r * 0.6, r * 0.7, 0, r * 0.95);
    g.closePath();
    shade(g, r, '#ff9fb1', '#ff2d55', '#bf0028');
    g.fillStyle = '#ffe14a';
    const seeds = [
      [-0.5, -0.25], [-0.15, -0.3], [0.2, -0.28], [0.52, -0.2], [-0.62, 0.08], [-0.3, 0.05], [0.02, 0.02],
      [0.35, 0.06], [0.62, 0.12], [-0.4, 0.35], [-0.08, 0.32], [0.25, 0.36], [-0.18, 0.62], [0.12, 0.64],
    ];
    for (const [x, y] of seeds) {
      g.beginPath();
      g.ellipse(x * r, y * r, r * 0.035, r * 0.055, 0, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 5; i++) leaf(g, 0, -r * 0.6, r * 0.42, -Math.PI / 2 + (i - 2) * 0.6 + Math.PI, '#2fae3a');
    stem(g, r, 0, -r * 0.62, 0, -r * 0.8, r * 0.08, -r * 0.95, 0.09);
    shine(g, -r * 0.45, -r * 0.3, r * 0.1, r * 0.2, 0.45);
  },
  orange(g, r) {
    g.beginPath();
    g.arc(0, r * 0.05, r * 0.88, 0, Math.PI * 2);
    shade(g, r, '#ffd9a0', '#ff9f1c', '#e06400');
    g.fillStyle = 'rgba(200,90,0,0.22)';
    for (let i = 0; i < 26; i++) {
      const a = i * 2.4;
      const d = Math.sqrt((i + 0.5) / 26) * r * 0.78;
      g.beginPath();
      g.arc(Math.cos(a) * d, r * 0.05 + Math.sin(a) * d, r * 0.025, 0, Math.PI * 2);
      g.fill();
    }
    g.beginPath();
    g.arc(0, -r * 0.78, r * 0.07, 0, Math.PI * 2);
    g.fillStyle = '#6a8a20';
    g.fill();
    leaf(g, r * 0.04, -r * 0.8, r * 0.5, -0.4);
    shine(g, -r * 0.42, -r * 0.3, r * 0.14, r * 0.25);
  },
  grapes(g, r) {
    stem(g, r, 0, -r * 0.5, 0, -r * 0.8, r * 0.12, -r * 0.95, 0.09);
    const pts = [
      [-0.45, -0.38], [0, -0.44], [0.45, -0.38], [-0.24, 0.0], [0.24, 0.0], [-0.62, 0.05], [0.62, 0.05],
      [-0.4, 0.38], [0.4, 0.38], [0, 0.38], [-0.2, 0.7], [0.2, 0.7],
    ];
    const gr = r * 0.27;
    for (const [x, y] of pts) {
      g.save();
      g.translate(x * r, y * r);
      g.beginPath();
      g.arc(0, 0, gr, 0, Math.PI * 2);
      shade(g, gr, '#e2c8ff', '#9b4dff', '#5a1fb0');
      shine(g, -gr * 0.35, -gr * 0.35, gr * 0.16, gr * 0.28, 0.55);
      g.restore();
    }
    leaf(g, r * 0.08, -r * 0.72, r * 0.5, -0.3);
  },
  watermelon(g, r) {
    g.save();
    g.rotate(-0.18);
    const cy = -r * 0.3;
    g.beginPath();
    g.arc(0, cy, r * 0.98, 0, Math.PI);
    g.closePath();
    g.fillStyle = '#2f9e3a';
    g.fill();
    g.lineWidth = r * 0.06;
    g.strokeStyle = '#1d6e26';
    g.stroke();
    g.beginPath();
    g.arc(0, cy, r * 0.86, 0, Math.PI);
    g.closePath();
    g.fillStyle = '#e6ffd8';
    g.fill();
    g.beginPath();
    g.arc(0, cy, r * 0.78, 0, Math.PI);
    g.closePath();
    const grad = g.createRadialGradient(0, cy, r * 0.1, 0, cy, r * 0.8);
    grad.addColorStop(0, '#ff8aa0');
    grad.addColorStop(1, '#ff3d5e');
    g.fillStyle = grad;
    g.fill();
    g.fillStyle = '#2b1a1a';
    const seeds = [[-0.45, 0.12], [-0.15, 0.2], [0.15, 0.2], [0.45, 0.12], [-0.3, 0.42], [0, 0.48], [0.3, 0.42]];
    for (const [x, y] of seeds) {
      g.beginPath();
      g.ellipse(x * r, cy + y * r, r * 0.04, r * 0.07, x * 0.8, 0, Math.PI * 2);
      g.fill();
    }
    g.beginPath();
    g.ellipse(-r * 0.3, cy + r * 0.08, r * 0.3, r * 0.05, 0, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fill();
    g.restore();
  },
  pear(g, r) {
    stem(g, r, 0, -r * 0.7, -r * 0.02, -r * 0.9, r * 0.1, -r * 1.0);
    g.beginPath();
    g.moveTo(0, -r * 0.76);
    g.bezierCurveTo(r * 0.36, -r * 0.76, r * 0.34, -r * 0.3, r * 0.55, 0);
    g.bezierCurveTo(r * 0.95, r * 0.45, r * 0.65, r * 0.95, 0, r * 0.92);
    g.bezierCurveTo(-r * 0.65, r * 0.95, -r * 0.95, r * 0.45, -r * 0.55, 0);
    g.bezierCurveTo(-r * 0.34, -r * 0.3, -r * 0.36, -r * 0.76, 0, -r * 0.76);
    g.closePath();
    shade(g, r, '#f3ffb0', '#b5e655', '#6aa316');
    leaf(g, r * 0.06, -r * 0.82, r * 0.42, -0.5);
    shine(g, -r * 0.35, r * 0.05, r * 0.12, r * 0.26);
  },
  cherries(g, r) {
    stem(g, r, -r * 0.38, r * 0.15, -r * 0.3, -r * 0.5, r * 0.08, -r * 0.88, 0.07);
    stem(g, r, r * 0.42, r * 0.08, r * 0.38, -r * 0.4, r * 0.08, -r * 0.88, 0.07);
    leaf(g, r * 0.08, -r * 0.88, r * 0.5, -0.1);
    for (const [x, y] of [[-0.38, 0.45], [0.42, 0.38]]) {
      g.save();
      g.translate(x * r, y * r);
      const cr = r * 0.42;
      g.beginPath();
      g.arc(0, 0, cr, 0, Math.PI * 2);
      shade(g, cr, '#ff9aa6', '#e8203a', '#9a0018');
      shine(g, -cr * 0.35, -cr * 0.35, cr * 0.14, cr * 0.26, 0.55);
      g.restore();
    }
  },
};

export function drawFruit(g, kind, r) {
  g.save();
  g.lineJoin = 'round';
  draw[kind](g, r);
  g.restore();
}

// One canvas per kind, painted at radius r * 1.25 so a lifted fruit stays sharp.
export function makeSprites(r, dpr) {
  const rs = r * 1.25;
  const size = Math.ceil(rs * 2.4 * dpr);
  const sprites = {};
  for (const kind of KINDS) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.translate(size / 2, size / 2);
    g.scale(dpr, dpr);
    drawFruit(g, kind, rs);
    sprites[kind] = c;
  }
  return { sprites, size: size / dpr, scale: 1 / 1.25 };
}
