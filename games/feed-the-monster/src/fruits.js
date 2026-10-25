// The fruits and treats, painted with Canvas 2D paths. Each kind is drawn
// once per screen size into a sprite with a thick cartoon outline, plus a
// soft shadow sprite (see makeSprites), and the sprites are drawn every
// frame. Shapes are centred on 0,0 and fit inside a circle of radius r.
export const KINDS = [
  'apple', 'banana', 'strawberry', 'orange', 'grapes', 'watermelon', 'pear', 'cherries',
  'peach', 'pineapple', 'kiwi', 'lemon', 'blueberries',
];
// treats only ever come floating up in bubbles
export const TREATS = ['lollipop', 'donut'];

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
  peach: ['#ffab73', '#ffd9b0', '#ff7a5c'],
  pineapple: ['#ffd23f', '#fff1a0', '#ffb020'],
  kiwi: ['#7fcf3a', '#e9ffd0', '#3a2a14'],
  lemon: ['#ffe94a', '#fffbd0', '#ffd400'],
  blueberries: ['#4a6bff', '#a8b8ff', '#2c3fb0'],
  lollipop: ['#ff5fa8', '#ffe14a', '#5fd0ff', '#ffffff'],
  donut: ['#ff8cc6', '#ffe14a', '#5fd0ff', '#c98a4a'],
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

Object.assign(draw, {
  peach(g, r) {
    stem(g, r, 0, -r * 0.62, 0, -r * 0.8, r * 0.06, -r * 0.9, 0.09);
    g.beginPath();
    g.moveTo(0, -r * 0.62);
    g.bezierCurveTo(r * 0.6, -r * 0.92, r * 1.0, -r * 0.3, r * 0.9, r * 0.2);
    g.bezierCurveTo(r * 0.8, r * 0.75, r * 0.35, r * 0.95, 0, r * 0.92);
    g.bezierCurveTo(-r * 0.35, r * 0.95, -r * 0.8, r * 0.75, -r * 0.9, r * 0.2);
    g.bezierCurveTo(-r * 1.0, -r * 0.3, -r * 0.6, -r * 0.92, 0, -r * 0.62);
    g.closePath();
    shade(g, r, '#ffe4b8', '#ffa66e', '#e0573e');
    // the soft crease
    g.beginPath();
    g.moveTo(r * 0.02, -r * 0.55);
    g.bezierCurveTo(r * 0.3, -r * 0.2, r * 0.3, r * 0.4, r * 0.1, r * 0.82);
    g.lineWidth = r * 0.05;
    g.strokeStyle = 'rgba(200,70,50,0.45)';
    g.stroke();
    g.beginPath();
    g.ellipse(r * 0.45, r * 0.25, r * 0.3, r * 0.35, 0, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255,70,90,0.22)';
    g.fill();
    leaf(g, r * 0.05, -r * 0.78, r * 0.5, -0.35);
    shine(g, -r * 0.45, -r * 0.2, r * 0.13, r * 0.25);
  },
  pineapple(g, r) {
    // crown of spiky leaves
    for (const [a, l] of [[-0.75, 0.48], [0.75, 0.48], [-0.35, 0.6], [0.35, 0.6], [0, 0.68]]) {
      g.save();
      g.translate(0, -r * 0.38);
      g.rotate(a);
      g.beginPath();
      g.moveTo(-r * 0.09, 0);
      g.quadraticCurveTo(-r * 0.05, -r * l * 0.6, 0, -r * l);
      g.quadraticCurveTo(r * 0.05, -r * l * 0.6, r * 0.09, 0);
      g.closePath();
      const lg = g.createLinearGradient(0, 0, 0, -r * l);
      lg.addColorStop(0, '#2f9e3a');
      lg.addColorStop(1, '#8ee04f');
      g.fillStyle = lg;
      g.fill();
      g.lineWidth = r * 0.04;
      g.strokeStyle = '#1e6e26';
      g.stroke();
      g.restore();
    }
    g.beginPath();
    g.ellipse(0, r * 0.25, r * 0.56, r * 0.7, 0, 0, Math.PI * 2);
    shade(g, r, '#fff09a', '#ffc83a', '#d98a10');
    g.save();
    g.clip();
    g.strokeStyle = 'rgba(160,90,10,0.55)';
    g.lineWidth = r * 0.04;
    for (let i = -4; i <= 4; i++) {
      g.beginPath();
      g.moveTo(i * r * 0.22 - r * 0.8, -r * 0.5);
      g.lineTo(i * r * 0.22 + r * 0.8, r * 1.0);
      g.moveTo(i * r * 0.22 + r * 0.8, -r * 0.5);
      g.lineTo(i * r * 0.22 - r * 0.8, r * 1.0);
      g.stroke();
    }
    g.fillStyle = '#9a5a10';
    for (let i = -4; i <= 4; i++) for (let j = 0; j < 8; j++) {
      g.beginPath();
      g.arc(i * r * 0.22 + (j % 2) * r * 0.11, -r * 0.42 + j * r * 0.2, r * 0.025, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    shine(g, -r * 0.28, r * 0.0, r * 0.08, r * 0.22, 0.45);
  },
  kiwi(g, r) {
    g.beginPath();
    g.ellipse(0, 0, r * 0.92, r * 0.86, 0, 0, Math.PI * 2);
    g.fillStyle = '#8a5a2b';
    g.fill();
    g.lineWidth = r * 0.06;
    g.strokeStyle = '#5a3612';
    g.stroke();
    g.beginPath();
    g.ellipse(0, 0, r * 0.8, r * 0.74, 0, 0, Math.PI * 2);
    const kg = g.createRadialGradient(0, 0, r * 0.1, 0, 0, r * 0.8);
    kg.addColorStop(0, '#f2ffd8');
    kg.addColorStop(0.3, '#b6e85a');
    kg.addColorStop(1, '#63b42a');
    g.fillStyle = kg;
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = r * 0.02;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      g.beginPath();
      g.moveTo(Math.cos(a) * r * 0.22, Math.sin(a) * r * 0.2);
      g.lineTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.64);
      g.stroke();
    }
    g.fillStyle = '#2a1a0a';
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      g.beginPath();
      g.ellipse(Math.cos(a) * r * 0.36, Math.sin(a) * r * 0.33, r * 0.035, r * 0.06, a + Math.PI / 2, 0, Math.PI * 2);
      g.fill();
    }
    g.beginPath();
    g.ellipse(0, 0, r * 0.2, r * 0.17, 0, 0, Math.PI * 2);
    g.fillStyle = '#fbfff0';
    g.fill();
    shine(g, -r * 0.45, -r * 0.4, r * 0.1, r * 0.2, 0.4);
  },
  lemon(g, r) {
    g.save();
    g.rotate(-0.35);
    g.beginPath();
    g.moveTo(-r * 0.98, 0);
    g.bezierCurveTo(-r * 0.8, -r * 0.1, -r * 0.7, -r * 0.7, 0, -r * 0.7);
    g.bezierCurveTo(r * 0.7, -r * 0.7, r * 0.8, -r * 0.1, r * 0.98, 0);
    g.bezierCurveTo(r * 0.8, r * 0.1, r * 0.7, r * 0.7, 0, r * 0.7);
    g.bezierCurveTo(-r * 0.7, r * 0.7, -r * 0.8, r * 0.1, -r * 0.98, 0);
    g.closePath();
    shade(g, r, '#fffbc0', '#ffe83a', '#e0b000');
    g.fillStyle = 'rgba(200,150,0,0.2)';
    for (let i = 0; i < 20; i++) {
      const a = i * 2.4;
      const d = Math.sqrt((i + 0.5) / 20);
      g.beginPath();
      g.arc(Math.cos(a) * d * r * 0.6, Math.sin(a) * d * r * 0.5, r * 0.022, 0, Math.PI * 2);
      g.fill();
    }
    shine(g, -r * 0.35, -r * 0.3, r * 0.12, r * 0.28);
    g.restore();
    leaf(g, -r * 0.2, -r * 0.62, r * 0.45, -0.9);
  },
  blueberries(g, r) {
    for (const [x, y, k] of [[-0.42, -0.25, 0.42], [0.38, -0.3, 0.4], [0.0, 0.38, 0.46]]) {
      g.save();
      g.translate(x * r, y * r);
      const br = r * k;
      g.beginPath();
      g.arc(0, 0, br, 0, Math.PI * 2);
      shade(g, br, '#b4c6ff', '#4a6bff', '#22308f');
      // the little crown on top
      g.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
        g.lineTo(Math.cos(a) * br * 0.26, -br * 0.35 + Math.sin(a) * br * 0.26);
        g.lineTo(Math.cos(a + 0.63) * br * 0.1, -br * 0.35 + Math.sin(a + 0.63) * br * 0.1);
      }
      g.closePath();
      g.fillStyle = '#1e2770';
      g.fill();
      shine(g, -br * 0.4, -br * 0.05, br * 0.12, br * 0.24, 0.5);
      g.restore();
    }
    leaf(g, r * 0.05, -r * 0.62, r * 0.42, -0.6);
  },
  lollipop(g, r) {
    g.beginPath();
    g.moveTo(r * 0.0, r * 0.3);
    g.lineTo(r * 0.0, r * 1.0);
    g.lineCap = 'round';
    g.lineWidth = r * 0.16;
    g.strokeStyle = '#d8c8b0';
    g.stroke();
    g.lineWidth = r * 0.08;
    g.strokeStyle = '#ffffff';
    g.stroke();
    const cy = -r * 0.15;
    g.beginPath();
    g.arc(0, cy, r * 0.75, 0, Math.PI * 2);
    g.fillStyle = '#ffffff';
    g.fill();
    g.save();
    g.clip();
    const cols = ['#ff4f9a', '#ffd23f', '#3fc8ff', '#7cd23f'];
    for (let i = 0; i < 8; i++) {
      g.beginPath();
      for (let k = 0; k <= 40; k++) {
        const a = (i / 8) * Math.PI * 2 + k * 0.12;
        const d = (k / 40) * r * 0.8;
        if (k === 0) g.moveTo(Math.cos(a) * d, cy + Math.sin(a) * d);
        else g.lineTo(Math.cos(a) * d, cy + Math.sin(a) * d);
      }
      g.lineWidth = r * 0.16;
      g.strokeStyle = cols[i % 4];
      g.stroke();
    }
    g.restore();
    g.beginPath();
    g.arc(0, cy, r * 0.75, 0, Math.PI * 2);
    g.lineWidth = r * 0.06;
    g.strokeStyle = '#c03a7a';
    g.stroke();
    shine(g, -r * 0.35, cy - r * 0.35, r * 0.12, r * 0.24, 0.65);
  },
  donut(g, r) {
    const ring = new Path2D();
    ring.ellipse(0, 0, r * 0.92, r * 0.8, 0, 0, Math.PI * 2);
    ring.ellipse(0, 0, r * 0.3, r * 0.24, 0, 0, Math.PI * 2);
    g.fillStyle = '#d99a52';
    g.fill(ring, 'evenodd');
    // pink icing with drips
    const ice = new Path2D();
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const d = 0.78 + Math.max(0, Math.sin(a * 5)) * 0.08 * (Math.sin(a) > 0 ? 1 : 0.3);
      const x = Math.cos(a) * r * d;
      const y = Math.sin(a) * r * d * 0.87 - r * 0.05;
      if (i === 0) ice.moveTo(x, y);
      else ice.lineTo(x, y);
    }
    ice.closePath();
    ice.ellipse(0, -r * 0.03, r * 0.38, r * 0.3, 0, 0, Math.PI * 2);
    g.fillStyle = '#ff8cc6';
    g.fill(ice, 'evenodd');
    g.lineWidth = r * 0.04;
    g.strokeStyle = '#d04a90';
    g.stroke(ice);
    const cols = ['#ffe14a', '#5fd0ff', '#ffffff', '#7cd23f', '#ff5a5a'];
    for (let i = 0; i < 22; i++) {
      const a = i * 2.39;
      const d = 0.45 + ((i * 7) % 5) * 0.07;
      g.save();
      g.translate(Math.cos(a) * r * d, Math.sin(a) * r * d * 0.85 - r * 0.04);
      g.rotate(a * 3);
      g.fillStyle = cols[i % cols.length];
      g.fillRect(-r * 0.06, -r * 0.018, r * 0.12, r * 0.036);
      g.restore();
    }
    g.lineWidth = r * 0.05;
    g.strokeStyle = '#8a5222';
    g.stroke(ring);
    shine(g, -r * 0.5, -r * 0.35, r * 0.1, r * 0.22, 0.5);
  },
});

export function drawFruit(g, kind, r) {
  g.save();
  g.lineJoin = 'round';
  draw[kind](g, r);
  g.restore();
}

const OUTLINE = '#4a2410';

// One canvas per kind, painted at radius r * 1.25 so a lifted fruit stays
// sharp, with a thick dark outline traced round its silhouette; and a soft
// blurred silhouette per kind for its shadow on the wall.
export function makeSprites(r, dpr) {
  const rs = r * 1.25;
  const size = Math.ceil(rs * 2.5 * dpr);
  const sprites = {};
  const shadows = {};
  const ow = rs * 0.07 * dpr;
  for (const kind of [...KINDS, ...TREATS]) {
    const art = document.createElement('canvas');
    art.width = art.height = size;
    const ag = art.getContext('2d');
    ag.translate(size / 2, size / 2);
    ag.scale(dpr, dpr);
    drawFruit(ag, kind, rs);
    const sil = document.createElement('canvas');
    sil.width = sil.height = size;
    const sg = sil.getContext('2d');
    sg.drawImage(art, 0, 0);
    sg.globalCompositeOperation = 'source-in';
    sg.fillStyle = OUTLINE;
    sg.fillRect(0, 0, size, size);

    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      g.drawImage(sil, Math.cos(a) * ow, Math.sin(a) * ow);
    }
    g.drawImage(art, 0, 0);
    sprites[kind] = c;

    const s = document.createElement('canvas');
    s.width = s.height = size;
    const shg = s.getContext('2d');
    shg.shadowColor = 'rgba(70,32,8,0.42)';
    shg.shadowBlur = rs * 0.16 * dpr;
    shg.shadowOffsetX = size;
    shg.drawImage(sil, -size, 0);
    shadows[kind] = s;
  }
  return { sprites, shadows, size: size / dpr, scale: 1 / 1.25 };
}
