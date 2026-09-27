// The brush in your hand: a real paintbrush (a lacquered wooden handle, a
// crimped metal ferrule and a tuft of bristles loaded with the colour) that
// follows the pointer over the canvas, pressing onto it while you paint and
// hovering just off it otherwise. The tuft bends against the stroke and
// springs back, and the glitter brush's tip twinkles. The sponge is a soft
// yellow sponge instead. Held like a right hand holds a brush.
import * as THREE from 'three';
import { Spring } from '../creatures/anim.js';

const UP = new THREE.Vector3(0, 1, 0);
const HELD = new THREE.Vector3(0.42, -0.38, 0.82).normalize();

export class Brush3D {
  constructor() {
    this.group = new THREE.Group();
    this.group.visible = false;
    this.brush = new THREE.Group();
    this.group.add(this.brush);
    const lacquer = new THREE.MeshPhysicalMaterial({ color: 0xc0392b, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 });
    this.handleMat = lacquer;
    const metal = new THREE.MeshStandardMaterial({ color: 0xd9d4c8, roughness: 0.22, metalness: 1 });
    // handle: a long taper, thickest near the ferrule
    const handle = new THREE.Mesh(new THREE.LatheGeometry([
      new THREE.Vector2(0.0001, 0.29),
      new THREE.Vector2(0.0035, 0.285),
      new THREE.Vector2(0.004, 0.2),
      new THREE.Vector2(0.0055, 0.09),
      new THREE.Vector2(0.006, 0.06),
      new THREE.Vector2(0.0055, 0.045),
    ], 16), lacquer);
    const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0052, 0.03, 16), metal);
    ferrule.position.y = 0.03;
    this.tuftMat = new THREE.MeshPhysicalMaterial({ color: 0x3a2a1c, roughness: 0.55, clearcoat: 0.6, clearcoatRoughness: 0.2 });
    // tuft: a rounded point of bristles, bent by a vertex shader
    const tuft = new THREE.LatheGeometry([
      new THREE.Vector2(0.0001, -0.022),
      new THREE.Vector2(0.002, -0.02),
      new THREE.Vector2(0.0048, -0.012),
      new THREE.Vector2(0.0056, -0.002),
      new THREE.Vector2(0.0052, 0.016),
    ], 16);
    this.bend = { value: new THREE.Vector2() };
    this.tuftMat.onBeforeCompile = (s) => {
      s.uniforms.uBend = this.bend;
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform vec2 uBend;').replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float k = clamp((0.016 - position.y) / 0.038, 0.0, 1.0);
        transformed.xz += uBend * k * k * 0.012;
        // streaky bristles
        transformed.xz *= 1.0 + 0.08 * sin(atan(position.z, position.x) * 11.0) * k;`,
      );
    };
    this.tuftMesh = new THREE.Mesh(tuft, this.tuftMat);
    this.tuftMesh.position.y = 0.0;
    this.brush.add(handle, ferrule, this.tuftMesh);
    handle.castShadow = ferrule.castShadow = this.tuftMesh.castShadow = true;
    // the sponge
    const sp = new THREE.BoxGeometry(0.07, 0.035, 0.05, 6, 3, 4);
    const p = sp.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 1 + (Math.sin(x * 190) * Math.sin(z * 170) + Math.sin(y * 230)) * 0.04;
      p.setXYZ(i, x * k, y * k, z * k);
    }
    sp.computeVertexNormals();
    this.sponge = new THREE.Mesh(sp, new THREE.MeshStandardMaterial({ color: 0xf4c542, roughness: 0.95 }));
    this.sponge.castShadow = true;
    this.group.add(this.sponge);
    this.press = new Spring(0, 5, 0.8);
    this.bx = new Spring(0, 6, 0.35);
    this.by = new Spring(0, 6, 0.35);
    this.last = null;
    this.tool = 'brush';
  }

  setTool(tool, color) {
    this.tool = tool;
    const sponge = tool === 'sponge';
    this.brush.visible = !sponge;
    this.sponge.visible = sponge;
    const c = new THREE.Color(color ?? 0x3a2a1c);
    this.tuftMat.color.copy(c);
    this.tuftMat.emissive.setRGB(0, 0, 0);
    if (tool === 'glitter') this.tuftMat.emissive.copy(c).multiplyScalar(0.25);
    this.handleMat.color.set(tool === 'water' ? 0x2f6fb8 : tool === 'glitter' ? 0x8e44d0 : 0xc0392b);
    this.tuftMesh.scale.set(tool === 'water' ? 0.9 : 1, tool === 'water' ? 1.25 : 1, tool === 'water' ? 0.9 : 1);
  }

  // plane: the canvas plane's world matrix; uv: where on it (or null);
  // down: pressing; dt
  update(dt, plane, uv, down, cw, ch) {
    if (!uv) {
      this.group.visible = false;
      this.last = null;
      return;
    }
    this.group.visible = true;
    const x = (uv.x - 0.5) * cw;
    const y = (uv.y - 0.5) * ch;
    const pr = this.press.update(down ? 1 : 0, dt);
    // stroke velocity bends the tuft back
    if (this.last) {
      const vx = (x - this.last.x) / Math.max(dt, 1e-3);
      const vy = (y - this.last.y) / Math.max(dt, 1e-3);
      this.bx.update(-vx * 1.2 * (down ? 1 : 0.2), dt);
      this.by.update(-vy * 1.2 * (down ? 1 : 0.2), dt);
    }
    this.last = { x, y };
    this.bend.value.set(Math.max(-1, Math.min(1, this.bx.x)), Math.max(-1, Math.min(1, this.by.x)));
    const lift = 0.025 * (1 - pr) + 0.001;
    // held like a pen: leaning to the lower right, towards the painter
    this.group.matrix.copy(plane);
    this.group.matrix.multiply(new THREE.Matrix4().makeTranslation(x, y, lift));
    this.group.matrixAutoUpdate = false;
    this.brush.quaternion.setFromUnitVectors(UP, HELD);
    this.brush.position.copy(HELD).multiplyScalar(0.022);
    // pressing squashes the tuft a little
    this.tuftMesh.scale.y = (this.tool === 'water' ? 1.25 : 1) * (1 - pr * 0.12);
    this.sponge.position.set(0, 0, 0.018);
    this.sponge.rotation.set(Math.PI / 2, 0, 0.3);
    this.group.updateMatrixWorld(true);
  }
}
