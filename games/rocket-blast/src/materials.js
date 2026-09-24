// Toy materials: glossy vinyl with a soft subsurface glow, painted metal,
// clear glass and chrome. All are physically based and lit by the world's
// sky (scene.environment) plus its sun.
import * as THREE from 'three';

// Soft vinyl or jelly plastic. `sss` adds light that seems to bleed through
// the toy at glancing angles, tinted by its colour (instance colour too).
export function vinylMaterial({ color = 0xffffff, roughness = 0.32, clearcoat = 0.9, clearcoatRoughness = 0.12, sss = 0.3, sheen = 0.25, ...rest } = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness: 0,
    clearcoat,
    clearcoatRoughness,
    sheen,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color(1, 1, 1),
    ...rest,
  });
  addGlow(m, sss);
  return m;
}

// Adds the subsurface-style glow to any lit material.
export function addGlow(m, sss) {
  m.userData.sss = { value: sss };
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => {
    if (prev) prev(shader, r);
    shader.uniforms.uSss = m.userData.sss;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSss;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
  {
    float ndv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
    totalEmissiveRadiance += diffuseColor.rgb * uSss * (0.3 + 0.7 * pow(1.0 - ndv, 2.0));
  }`,
      );
  };
  m.customProgramCacheKey = () => `glow-${m.type}`;
  return m;
}

export function paintMaterial(color, { roughness = 0.28, metalness = 0.15, clearcoat = 1, ...rest } = {}) {
  return new THREE.MeshPhysicalMaterial({ color, roughness, metalness, clearcoat, clearcoatRoughness: 0.06, ...rest });
}

export function chromeMaterial(color = 0xdfe4ea, roughness = 0.18) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 1 });
}

// Clear glass for portholes and domes: mostly reflection, faint tint.
export function glassMaterial({ color = 0xcfe8ff, opacity = 0.22 } = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.02,
    metalness: 0,
    transparent: true,
    opacity,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: 1.6,
    depthWrite: false,
    specularIntensity: 1,
  });
}
