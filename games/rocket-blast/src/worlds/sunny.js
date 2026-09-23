// Sunny Day: a deep blue sky with a bright sun, fair-weather cumulus at
// several depths drifting on the breeze, and a soft carpet of cloud tops
// along the bottom of the view.
import * as THREE from 'three';
import { SkyDome, CloudField, visibleAt } from './common.js';
import { mulberry32 } from '../textures.js';

export function create(ctx) {
  const group = new THREE.Group();
  const sunDir = new THREE.Vector3(0.5, 0.42, -0.75).normalize();
  const sky = new SkyDome({
    zenith: '#1a62d6',
    horizon: '#a9dcff',
    ground: '#b7d3ee',
    sunDir,
    sunColor: '#fff1cf',
    sunDisc: 40,
    sunSize: 0.9993,
    glow: 1.1,
    horizonEl: -0.32,
    topEl: 0.42,
    band: '#e6f6ff',
    bandAmt: 0.5,
  });
  group.add(sky.mesh);
  const cloudSun = new THREE.Vector3(0.45, 0.75, 0.45);
  const clouds = new CloudField({ noise: ctx.noise, lit: '#ffffff', shadow: '#9fb4d4', haze: '#bfe2ff', sun: cloudSun, rim: 0.3, fogNear: 60, fogFar: 320, capacity: 1200 });
  const lit = clouds.uniforms.uLit.value;
  lit.multiplyScalar(0.98);
  group.add(clouds.mesh);

  const amount = ctx.quality.clouds;
  const layout = (view) => {
    clouds.clouds.length = 0;
    const rand = mulberry32(21);
    const cam = view.camera;
    const at = (z) => visibleAt(cam, view.dist, z);
    const r = (a, b) => a + rand() * (b - a);
    // far, hazy clouds low near the horizon
    for (let i = 0; i < Math.round(9 * amount + 3); i++) {
      const z = r(-300, -190);
      const v = at(z);
      clouds.addCloud({ x: r(-v.halfW, v.halfW), y: r(-0.6, -0.25) * v.halfH, z, w: r(45, 80), h: r(8, 13), vx: 0.35, alpha: 0.9, rand });
    }
    // big mid-distance cumulus
    for (let i = 0; i < Math.round(4 * amount + 2); i++) {
      const z = r(-120, -70);
      const v = at(z);
      const side = i % 2 ? 1 : -1;
      clouds.addCloud({ x: side * r(0.35, 1) * v.halfW, y: r(-0.45, 0.4) * v.halfH, z, w: r(20, 32), h: r(7, 11), vx: 0.7, rand });
    }
    // a few near puffs high up, drifting faster
    for (let i = 0; i < 3; i++) {
      const z = r(-38, -24);
      const v = at(z);
      clouds.addCloud({ x: r(-v.halfW, v.halfW), y: r(0.35, 0.8) * v.halfH, z, w: r(10, 16), h: r(3.5, 5), vx: 1.1, alpha: 0.85, rand });
    }
    // cloud-top carpet along the bottom
    for (const [zA, zB, n] of [
      [-30, -22, 7],
      [-14, -8, 8],
    ]) {
      for (let i = 0; i < n; i++) {
        const z = r(zA, zB);
        const v = at(z);
        const w = (v.halfW * 2.4) / n + r(2, 6);
        clouds.addCloud({ x: -v.halfW * 1.2 + (i + 0.5) * ((v.halfW * 2.4) / n) + r(-1, 1), y: -v.halfH - r(1.5, 3.5) * (v.halfH / 12), z, w, h: r(4, 6.5) * (v.halfH / 12), vx: 0.25, flat: 0.3, puffs: 14, rand });
      }
    }
    clouds.finish();
  };

  const env = new THREE.Scene();
  env.add(sky.clone());

  let view = null;
  return {
    id: 'sunny',
    group,
    envScene: env,
    light: {
      sunDir: new THREE.Vector3(0.35, 0.8, 0.55),
      sunColor: new THREE.Color('#fff4e0'),
      sunIntensity: 2.1,
      skyColor: new THREE.Color('#bfe0ff'),
      groundColor: new THREE.Color('#f4efe6'),
      hemiIntensity: 0.55,
      envIntensity: 0.85,
      exposure: 1.0,
      rimColor: new THREE.Color('#fff0d0'),
      rimIntensity: 1.2,
    },
    layout(v) {
      view = v;
      layout(v);
    },
    update(dt, t, v) {
      sky.update(t, v.camera);
      clouds.update(dt, t, { halfW: (z) => visibleAt(v.camera, v.dist, z).halfW });
      view = v;
    },
    dispose() {
      group.removeFromParent();
      clouds.mesh.geometry.dispose();
      clouds.material.dispose();
      sky.material.dispose();
      void view;
    },
  };
}
