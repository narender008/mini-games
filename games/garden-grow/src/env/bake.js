// Bakes tileable ground maps on the GPU once at start-up: a fragment shader
// is drawn over a square render target (with mipmaps), which is then used as
// an ordinary repeating texture. Far faster than painting big canvases on
// the CPU, so the maps can be detailed without slowing the first load.
import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

let quad = null;
let camera = null;

// `frag` must define `vec4 bake(vec2 uv, float texel)`; srgb targets store
// colour (write linear values, the GPU encodes them).
export function bakeTexture(renderer, size, frag, { srgb = false, uniforms = {} } = {}) {
  const rt = new THREE.WebGLRenderTarget(size, size, {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    colorSpace: srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping,
    depthBuffer: false,
    anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()),
  });
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: `varying vec2 vUv;\nuniform float uTexel;\n${frag}\nvoid main() { gl_FragColor = bake(vUv, uTexel); }`,
    uniforms: { uTexel: { value: 1 / size }, ...uniforms },
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  if (!quad) {
    quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    quad.frustumCulled = false;
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  quad.material = material;
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.render(quad, camera);
  renderer.setRenderTarget(prev);
  material.dispose();
  rt.texture.userData.target = rt;
  return rt.texture;
}

export function disposeBaked(tex) {
  tex?.userData.target?.dispose();
}
