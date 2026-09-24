// Weather: gentle rain and a rainbow. Never a storm: no lightning, no dark.
//
// Rain is thin, mostly clear streaks falling at a light slant with the
// breeze, catching the light (and glowing when the low sun is behind them),
// tiny crowns of droplets and soft rings where drops land around the garden,
// and a faint veil of rain far off. It wets the ground a little at a time. The
// rainbow is a real one (see rainbow.js), standing in the rain past the fence.
import * as THREE from 'three';
import { REDUCED_MOTION, clamp } from '../config.js';
import { wind } from '../shared.js';
import { RainField, Rings, Veil } from './rain.js';
import { Rainbow } from './rainbow.js';
import { Drops } from './drops.js';
import { lightFor } from './light.js';

const tmpD = new THREE.Vector3();

export class Weather {
  constructor({ scene, quality, ground }) {
    this.scene = scene;
    this.ground = ground;
    const k = clamp(quality.particles ?? 1, 0.25, 1);
    this.k = k;
    this.rainTarget = 0;
    this.rain = 0;
    this.bowTarget = 0;
    this.bow = 0;
    this.time = 0;
    this.splashAcc = 0;
    this.lastRain = -10;
    this.field = new RainField(scene, Math.round(2000 + 3500 * k));
    this.rings = new Rings(scene, Math.round(120 + 200 * k));
    const groundAt = (x, z) => (this.ground ? this.ground.heightAt(x, z) : 0);
    this.drops = new Drops(scene, { capacity: Math.round(500 + 900 * k), groundAt });
    this.drops.crownScale = REDUCED_MOTION.matches ? 0.6 : 1;
    this.rainbow = new Rainbow(scene);
    // a faint veil of rain far off
    this.veil = new Veil(scene);
    this.center = new THREE.Vector3();
  }

  // 0..1 soft rain
  setRain(v) {
    this.rainTarget = clamp(v, 0, 1);
  }

  // 0..1 rainbow
  setRainbow(v) {
    this.bowTarget = clamp(v, 0, 1);
  }

  update(dt, t, { camera, sunDir, night = 0 } = {}) {
    if (dt <= 0) return;
    this.time += dt;
    // rain eases in and out over a couple of seconds; the bow shows within
    // about two (while the camera looks up at it) and fades slowly
    this.rain += (this.rainTarget - this.rain) * (1 - Math.exp(-dt * 0.9));
    this.bow += (this.bowTarget - this.bow) * (1 - Math.exp(-dt * (this.bowTarget > this.bow ? 1.2 : 0.5)));
    if (this.rain < 0.002) this.rain = this.rainTarget > 0 ? this.rain : 0;
    const L = lightFor(this.scene);
    if (sunDir) L.override = sunDir;
    const rain = this.rain;

    // ---- the streaks
    const u = this.field.uniforms;
    this.field.mesh.visible = rain > 0.003;
    if (this.field.mesh.visible && camera) {
      // a box of rain from just behind the camera to some way past the garden
      camera.getWorldDirection(tmpD);
      tmpD.y = 0;
      tmpD.normalize();
      const box = u.uBox.value;
      this.center.copy(camera.position).addScaledVector(tmpD, box.z * 0.45);
      this.center.y = box.y * 0.5;
      u.uCenter.value.copy(this.center);
      const wd = wind.uWindDir.value;
      const ws = 0.45 + 0.35 * wind.uWindStrength.value;
      u.uWind.value.set(wd.x * ws, wd.y * ws);
      u.uAmount.value = rain;
    }
    u.uTime.value = this.time;
    u.uSunDir.value.copy(L.sunDir);
    u.uSunCol.value.copy(L.sunColor);
    u.uEnv.value.copy(L.env);

    // ---- drops landing round the garden: crowns and rings
    if (rain > 0.02 && camera) {
      this.splashAcc += dt * rain * (140 + 260 * this.k);
      // centred where the middle of the view meets the ground
      camera.getWorldDirection(tmpD);
      const reach = Math.min(8, camera.position.y / Math.max(0.12, -tmpD.y));
      const cx = camera.position.x + tmpD.x * reach;
      const cz = camera.position.z + tmpD.z * reach;
      while (this.splashAcc >= 1) {
        this.splashAcc -= 1;
        const x = cx + (Math.random() - 0.5) * 5.6;
        const z = cz + (Math.random() - 0.5) * 4.2;
        const y = this.ground ? this.ground.heightAt(x, z) : 0;
        if (Math.random() < 0.55) this.drops.crown(x, y, z, 4, 0.0012, 1 + ((Math.random() * 2.4) | 0));
        if (Math.random() < 0.6) this.rings.add(x, y, z, this.time, 0.012 + Math.random() * 0.014);
      }
      if (this.ground) this.ground.wetAll(dt * 0.03 * rain);
    }
    this.drops.update(dt);
    this.rings.update(this.time, L);
    this.rings.mesh.visible = rain > 0.003 || this.time - this.lastRain < 1;
    if (rain > 0.003) this.lastRain = this.time;

    // ---- mist far off
    this.veil.update(this.time, rain * (1 - 0.5 * night), camera, L);

    // ---- the rainbow
    this.rainbow.update(this.bow, camera, L.sunDir, L.sunColor, night);
  }
}
