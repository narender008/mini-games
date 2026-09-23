// A distant flock drifting across the dusk sky, wings flapping with the odd
// glide, drawn as one instanced mesh.
import * as THREE from 'three';

function birdGeometry() {
  // body along +x (flight direction), wings spread along z
  const v = [
    // body
    0.5, 0, 0, -0.45, 0.02, 0.05, -0.45, 0.02, -0.05,
    // left wing (inner, outer)
    0.12, 0, 0, -0.12, 0, 0, -0.02, 0.02, 0.55,
    -0.02, 0.02, 0.55, -0.12, 0, 0, -0.22, 0.0, 1.0,
    // right wing
    0.12, 0, 0, -0.02, 0.02, -0.55, -0.12, 0, 0,
    -0.02, 0.02, -0.55, -0.22, 0.0, -1.0, -0.12, 0, 0,
  ];
  const wing = [0, 0, 0, 0, 0, 0.55, 0.55, 0, 1, 0, 0.55, 0, 0.55, 1, 0];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  geo.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));
  geo.computeVertexNormals();
  return geo;
}

export class Birds {
  constructor(count = 9) {
    this.count = count;
    const geo = birdGeometry();
    this.phase = new Float32Array(count);
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(this.phase, 1));
    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color('#161320'), side: THREE.DoubleSide, fog: true });
    this.uniforms = { uTime: { value: 0 } };
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.uniforms.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aWing;\nattribute float aPhase;\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          /* glsl */ `
#include <begin_vertex>
float cyc = uTime * 7.5 + aPhase * 6.2831;
float glide = smoothstep(0.2, 0.8, sin(uTime * 0.6 + aPhase * 9.0));
float flap = mix(sin(cyc), 0.15, glide);
transformed.y += flap * aWing * 0.55;
transformed.x -= abs(flap) * aWing * 0.08;`,
        );
    };
    this.mesh = new THREE.InstancedMesh(geo, material, count);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'birds';
    this.offsets = [];
    for (let i = 0; i < count; i++) {
      this.phase[i] = Math.random();
      // loose V with some scatter
      const row = Math.ceil(i / 2);
      const side = i % 2 ? 1 : -1;
      this.offsets.push(new THREE.Vector3(row * 3.2 + Math.random() * 1.5, (Math.random() - 0.5) * 2.5 + row * 0.4, side * row * 2.2 + (Math.random() - 0.5) * 2));
    }
    this.center = new THREE.Vector3();
    this.reset(true);
    this.dummy = new THREE.Object3D();
  }

  reset(first = false) {
    // enter from the right, fly left, far out over the water
    const z = -130 - Math.random() * 60;
    this.center.set(first ? 20 + Math.random() * 25 : 150 + Math.random() * 40, 34 + Math.random() * 22, z);
    this.speed = 5.5 + Math.random() * 2;
  }

  update(dt, t) {
    this.uniforms.uTime.value = t;
    this.center.x -= this.speed * dt;
    this.center.y += Math.sin(t * 0.13) * dt * 0.4;
    if (this.center.x < -190) this.reset();
    for (let i = 0; i < this.count; i++) {
      const o = this.offsets[i];
      this.dummy.position.set(
        this.center.x + o.x + Math.sin(t * 0.5 + i) * 0.8,
        this.center.y + o.y + Math.sin(t * 0.8 + i * 1.7) * 0.5,
        this.center.z + o.z,
      );
      this.dummy.rotation.set(0, Math.PI, Math.sin(t * 0.7 + i) * 0.08);
      this.dummy.scale.setScalar(2.6);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
