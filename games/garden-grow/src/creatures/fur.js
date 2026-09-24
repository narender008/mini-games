// Shell fur for fuzzy insect bodies (bees, moth and butterfly thoraxes).
// The body is drawn as a stack of shells pushed out along the normal; a
// small hair texture decides where each shell keeps a strand, so strands
// taper towards their tips and the silhouette goes soft. All shells live in
// one geometry, so a furry body is a single draw call.
import * as THREE from 'three';
import { mulberry32 } from '../config.js';

let hairTex = null;
const HAIR_TEX = 128;

// Heights of randomly scattered round hairs (0 = bare skin).
export function hairTexture() {
  if (hairTex) return hairTex;
  const S = HAIR_TEX;
  const h = new Float32Array(S * S);
  const rnd = mulberry32(911);
  const count = Math.floor(S * S * 0.3);
  for (let k = 0; k < count; k++) {
    const cx = rnd() * S;
    const cy = rnd() * S;
    const r = 1.1 + rnd() * 1.1;
    const len = 0.3 + 0.7 * Math.sqrt(rnd());
    const r0 = Math.ceil(r);
    for (let y = -r0; y <= r0; y++) {
      for (let x = -r0; x <= r0; x++) {
        const px = Math.floor(cx) + x;
        const py = Math.floor(cy) + y;
        const d = Math.hypot(px + 0.5 - cx, py + 0.5 - cy) / r;
        if (d >= 1) continue;
        const i = ((py + S) % S) * S + ((px + S) % S);
        h[i] = Math.max(h[i], len * (1 - d * d * 0.85));
      }
    }
  }
  const data = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    const v = Math.round(h[i] * 255);
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  hairTex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  hairTex.wrapS = hairTex.wrapT = THREE.RepeatWrapping;
  hairTex.magFilter = THREE.LinearFilter;
  hairTex.minFilter = THREE.LinearMipmapLinearFilter;
  hairTex.generateMipmaps = true;
  hairTex.needsUpdate = true;
  return hairTex;
}

// Builds the stacked shells. `parts` are geo.js pieces with vertex colours
// (`c`) and { hair: strand length in metres, spacing: metres between
// strands, circ, len: the piece's girth and length in metres, droop }.
// Pieces with hair 0 only get the skin layer.
export function furGeometry(parts, shells) {
  const out = [];
  for (const q of parts) {
    const layers = q.hair > 0 ? shells : 0;
    const su = (q.circ || 0.01) / (q.spacing || 0.0003) / HAIR_TEX;
    const sv = (q.len || 0.01) / (q.spacing || 0.0003) / HAIR_TEX;
    for (let L = 0; L <= layers; L++) {
      const f = layers ? L / layers : 0;
      const p = new Array(q.p.length);
      for (let k = 0; k < q.p.length; k += 3) {
        const off = q.hair * f;
        // strands lie back along the body and sag a little
        const lie = q.hair * (q.droop ?? 0.5) * f * f;
        p[k] = q.p[k] + q.n[k] * off;
        p[k + 1] = q.p[k + 1] + q.n[k + 1] * off - lie * 0.3;
        p[k + 2] = q.p[k + 2] + q.n[k + 2] * off - lie;
      }
      const uv = new Array(q.uv.length);
      for (let k = 0; k < q.uv.length; k += 2) {
        uv[k] = q.uv[k] * su;
        uv[k + 1] = q.uv[k + 1] * sv;
      }
      out.push({ p, n: q.n, uv, i: q.i, c: q.c, layer: new Array(q.p.length / 3).fill(f) });
    }
  }
  return out;
}

// A standard material whose shells above the skin keep only the strands.
// rootDark darkens the fur near the skin (self-shadowing), tipLight
// brightens the tips where light catches them.
export function furMaterial({ roughness = 0.8, rootDark = 0.45, tipLight = 0.25, sheen = 0.0 } = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0, alphaTest: 0.5, alphaToCoverage: true });
  const uniforms = {
    uHair: { value: hairTexture() },
    uRoot: { value: rootDark },
    uTip: { value: tipLight },
    uSheen: { value: sheen },
  };
  m.userData.fur = uniforms;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aLayer;\nvarying float vLayer;\nvarying vec2 vHair;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvLayer = aLayer;\nvHair = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uHair;\nuniform float uRoot, uTip, uSheen;\nvarying float vLayer;\nvarying vec2 vHair;\nfloat vFar = 0.0;')
      .replace(
        '#include <alphatest_fragment>',
        `// strands smaller than a pixel only sparkle: then the fur becomes a
        // soft velvet skin just above the body instead
        vec2 dh = fwidth(vHair) * ${HAIR_TEX}.0;
        float far = smoothstep(0.7, 1.7, max(dh.x, dh.y));
        vFar = far;
        if (vLayer > 0.001) {
          float hh = texture2D(uHair, vHair).r;
          float fw = fwidth(hh) + 0.03;
          float strands = smoothstep(vLayer - fw, vLayer + fw, hh);
          diffuseColor.a = mix(strands, 1.0 - smoothstep(0.1, 0.3, vLayer), far);
        }
        // seen from further away: soft clumps of hair instead of strands
        float clump = texture2D(uHair, vHair * 0.21).r;
        diffuseColor.rgb *= mix(mix(uRoot, 1.0 + uTip, vLayer), 0.82 + 0.4 * clump, far);
        #include <alphatest_fragment>`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        // a soft rim of light through the outer strands
        {
          float rim = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.0);
          totalEmissiveRadiance += diffuseColor.rgb * rim * uSheen * mix(vLayer, 0.6, vFar) * (reflectedLight.indirectDiffuse * 2.0 + directLight.color * 0.15 + 0.02);
        }`,
      );
  };
  m.customProgramCacheKey = () => 'gg-fur';
  return m;
}
