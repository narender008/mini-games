// The balls themselves: glossy toy balls a few centimetres across, each with
// its own look (sprinkled candy orange, blue with stars, pink, a sparkly
// snowball, a rainbow swirl, a striped bouncy ball, a three-part ball), drawn
// on a small canvas once. In flight a ball spins with its travel and
// stretches a little along its path; a bouncy ball squashes as it lands.
import * as THREE from 'three';
import { BALLS, BALL_RADIUS, BALL_IDS, rng } from './config.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const RAINBOW = ['#ff4a5a', '#ff9a2a', '#ffd83a', '#5ad14a', '#2aa8ff', '#7a5cff', '#e45cff'];

function paint(kind) {
  const c = canvas(256, 128);
  const g = c.getContext('2d');
  const R = rng(kind.length * 97 + 3);
  const base = '#' + BALLS[kind].color.toString(16).padStart(6, '0');
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 128);
  if (kind === 'confetti') {
    // candy sprinkles
    const cols = ['#ffffff', '#ff3d8b', '#3dc8ff', '#ffe23d', '#7cf05a', '#b45cff'];
    for (let i = 0; i < 140; i++) {
      g.save();
      g.translate(R() * 256, 10 + R() * 108);
      g.rotate(R() * Math.PI);
      g.fillStyle = cols[i % cols.length];
      g.beginPath();
      g.roundRect(-5, -1.6, 10, 3.2, 1.6);
      g.fill();
      g.restore();
    }
  } else if (kind === 'star') {
    for (let i = 0; i < 26; i++) {
      const x = R() * 256;
      const y = 14 + R() * 100;
      const r = 5 + R() * 5;
      g.fillStyle = i % 3 ? '#ffffff' : '#ffe04a';
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
        const rr = k % 2 ? r * 0.45 : r;
        g.lineTo(x + Math.cos(a) * rr * 0.5, y + Math.sin(a) * rr);
      }
      g.fill();
    }
  } else if (kind === 'mud') {
    const grd = g.createLinearGradient(0, 0, 0, 128);
    grd.addColorStop(0, '#ff7ac8');
    grd.addColorStop(1, '#e8349a');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 128);
  } else if (kind === 'snow') {
    for (let i = 0; i < 900; i++) {
      const v = 225 + R() * 30;
      g.fillStyle = `rgb(${v - 8},${v - 3},${v})`;
      g.fillRect(R() * 256, R() * 128, 2, 2);
    }
  } else if (kind === 'jelly') {
    // a swirl of rainbow bands
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 256; x += 2) {
        const t = (x / 256 + y / 128 * 0.6 + Math.sin(y / 128 * Math.PI * 2 + x / 40) * 0.08) * RAINBOW.length * 1.5;
        g.fillStyle = RAINBOW[Math.floor(((t % RAINBOW.length) + RAINBOW.length) % RAINBOW.length)];
        g.fillRect(x, y, 2, 1);
      }
    }
  } else if (kind === 'bouncy') {
    g.fillStyle = '#ffd23d';
    g.fillRect(0, 54, 256, 20);
    g.fillStyle = '#3dc8ff';
    g.fillRect(0, 24, 256, 8);
    g.fillRect(0, 96, 256, 8);
  } else if (kind === 'triple') {
    g.fillStyle = '#ffd23d';
    for (let i = 0; i < 3; i++) g.fillRect(i * 85, 0, 12, 128);
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(i * 85 + 48, 64, 12, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const LOOK = {
  confetti: { roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.12 },
  star: { roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08 },
  mud: { roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.1 },
  snow: { roughness: 0.85, clearcoat: 0, sheen: 1, sheenColor: 0xdfe8ff, sheenRoughness: 0.5 },
  jelly: { roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05, sheen: 0.4, sheenColor: 0xffffff },
  bouncy: { roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2 },
  triple: { roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.1 },
};

const materials = {};
export function ballMaterial(kind) {
  if (!materials[kind]) {
    const m = new THREE.MeshPhysicalMaterial({ map: paint(kind), ...LOOK[kind] });
    if (m.sheenColor && typeof LOOK[kind].sheenColor === 'number') m.sheenColor.setHex(LOOK[kind].sheenColor);
    materials[kind] = m;
  }
  return materials[kind];
}

export class BallViews {
  constructor(scene) {
    const geo = new THREE.SphereGeometry(BALL_RADIUS, 40, 28);
    // each ball is a group stretched along its path holding a sphere that
    // spins about the lane's axis, so the stretch never turns with the spin
    this.meshes = [];
    this.balls = [];
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      const m = new THREE.Mesh(geo, ballMaterial('confetti'));
      m.castShadow = true;
      g.add(m);
      g.visible = false;
      g.userData.squash = 0;
      scene.add(g);
      this.meshes.push(g);
      this.balls.push(m);
    }
    this._q = new THREE.Quaternion();
    this._qs = new THREE.Quaternion();
    this._z = new THREE.Vector3(0, 0, 1);
    this._v = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
  }

  // every ball material compiled up front
  warm(scene) {
    const g = new THREE.Group();
    for (const id of BALL_IDS) {
      const m = new THREE.Mesh(this.balls[0].geometry, ballMaterial(id));
      m.position.set(0, -50, 0);
      g.add(m);
    }
    scene.add(g);
    return () => scene.remove(g);
  }

  squash(i, s) {
    this.meshes[i].userData.squash = Math.max(this.meshes[i].userData.squash, s);
  }

  // balls: the flight's balls; alpha: interpolation between steps
  update(balls, alpha, dt) {
    for (let i = 0; i < this.meshes.length; i++) {
      const m = this.meshes[i];
      const b = balls[i];
      if (!b || !b.live) {
        m.visible = false;
        continue;
      }
      m.visible = true;
      const ball = this.balls[i];
      if (ball.material !== materials[b.kind]) ball.material = ballMaterial(b.kind);
      m.position.lerpVectors(b.prev, b.pos, alpha);
      const k = b.radius / BALL_RADIUS;
      // a gentle stretch along the path, and a squash after a bounce
      const speed = b.vel.length();
      const sq = m.userData.squash;
      m.userData.squash = Math.max(0, sq - dt * 5);
      const stretch = 1 + Math.min(0.12, speed * 0.03) - sq * 0.35;
      const across = 1 / Math.sqrt(Math.max(0.3, stretch));
      this._v.copy(b.vel).normalize();
      this._q.setFromUnitVectors(this._up, this._v);
      m.quaternion.copy(this._q);
      m.scale.set(across * k, stretch * k, across * k);
      // the sphere's own turn, rolling forward through the air
      this._qs.setFromAxisAngle(this._z, -b.spin * 0.6);
      ball.quaternion.copy(this._q).invert().multiply(this._qs);
    }
  }

  hide() {
    for (const m of this.meshes) m.visible = false;
  }
}
