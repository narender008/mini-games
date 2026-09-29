// A little toy pennant on a wooden stick, pushed into the ground beside the
// lane, that shows the wind: it swings round to point downwind and streams
// out and flutters harder the stronger the wind blows (a soft cloth wave in
// the vertex shader; nothing to simulate).
import * as THREE from 'three';

export class WindFlag {
  constructor({ x = 0.1, z = -0.28, y = 0, height = 0.2, color = 0xff4d4d }) {
    const g = (this.object = new THREE.Group());
    g.position.set(x, y, z);
    const wood = new THREE.MeshStandardMaterial({ color: 0xc89b62, roughness: 0.6 });
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0026, height, 10), wood);
    stick.position.y = height / 2;
    stick.castShadow = true;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 16, 10), new THREE.MeshPhysicalMaterial({ color: 0xffd23d, roughness: 0.3, clearcoat: 1 }));
    knob.position.y = height + 0.003;
    knob.castShadow = true;
    g.add(stick, knob);
    // the pennant: a triangle tapering from the stick, many columns to bend
    const len = 0.075;
    const tall = 0.042;
    const geo = new THREE.PlaneGeometry(len, tall, 24, 4);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = (p.getX(i) + len / 2) / len;
      p.setX(i, u * len);
      p.setY(i, p.getY(i) * (1 - u * 0.92));
    }
    geo.computeVertexNormals();
    this.uniforms = { uTime: { value: 0 }, uWind: { value: 0.3 } };
    const cloth = new THREE.MeshPhysicalMaterial({ color, roughness: 0.75, sheen: 1, sheenColor: new THREE.Color(0xffb0b0), sheenRoughness: 0.6, side: THREE.DoubleSide });
    cloth.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
        .replace(
          '#include <begin_vertex>',
          `vec3 transformed = position;
float u = position.x / ${len.toFixed(4)};
float k = clamp(uWind, 0.0, 1.0);
// droops when calm, streams out and ripples in a breeze
float wave = sin(u * 9.0 - uTime * (5.0 + 9.0 * k)) * u * (0.004 + 0.007 * k);
float droop = (1.0 - k) * u * u * 0.05;
transformed.z += wave;
transformed.y -= droop;
transformed.x *= 0.55 + 0.45 * k;`,
        );
    };
    const pennant = new THREE.Mesh(geo, cloth);
    pennant.position.y = height - tall / 2 - 0.004;
    pennant.castShadow = true;
    this.pivot = new THREE.Group();
    this.pivot.add(pennant);
    g.add(this.pivot);
    this.angle = 0;
  }

  update(dt, time, wind) {
    const U = this.uniforms;
    U.uTime.value = time;
    const k = Math.min(1, Math.abs(wind) / 0.5);
    U.uWind.value += (k - U.uWind.value) * Math.min(1, dt * 1.5);
    // swing round to point downwind (a little towards the camera, so it reads)
    const want = wind >= 0 ? -0.35 : Math.PI + 0.35;
    this.angle += (want - this.angle) * Math.min(1, dt * 2);
    this.pivot.rotation.y = this.angle;
  }
}
