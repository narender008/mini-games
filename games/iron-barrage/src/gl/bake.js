// The backdrop layer painter: draws one parallax layer of a battlefield
// (mountains, tree lines, ruined skylines, dunes...) into a texture once per
// battlefield. Layer space: u across in metres of layer, v up 0..1.
export const BACKDROP_BAKE = {
  vs: `#version 300 es
const vec2 P[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
out vec2 vUV;
void main() { vec2 p = P[gl_VertexID]; vUV = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`,
  fs: `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uNoise;
uniform vec2 uSize;      // layer width, height in metres
uniform int uKind;       // 0 mountains, 1 hills+trees, 2 ruined city, 3 dunes, 4 forest
uniform float uSeed;
uniform float uBase;     // ground line height (fraction)
uniform float uAmp;      // relief height (fraction)
uniform vec3 uCol;       // body colour
uniform vec3 uCol2;      // detail / highlight colour
uniform vec3 uLit;       // lit windows / fires (city)
out vec4 o;
// Noise along the layer that wraps exactly at its ends: the noise texture
// repeats every 1.0 in texture space, so integer multiples of t tile.
float n1(float t) { return texture(uNoise, vec2(t, uSeed)).r; }
float fbm1(float u) {
  float t = u / uSize.x;
  float m = max(1.0, floor(uSize.x / 600.0 + 0.5));
  float a = 0.0, w = 0.5, s = 0.0;
  for (int i = 0; i < 6; i++) { a += w * n1(t * m + float(i) * 0.37); s += w; m *= 2.0; w *= 0.5; }
  return (a / s - 0.5) * 1.6 + 0.5;
}
float fbmF(float u, float f) {
  // f: rough features per 100 m, snapped so the layer wraps
  float t = u / uSize.x;
  float m = max(1.0, floor(uSize.x * f / 400.0 + 0.5));
  float a = 0.0, w = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { a += w * n1(t * m + float(i) * 0.37); s += w; m *= 2.0; w *= 0.5; }
  return clamp((a / s - 0.5) * 1.8 + 0.5, 0.0, 1.0);
}
float n2(vec2 p) { return texture(uNoise, p / 256.0).g; }
float hash(float x) { return fract(sin(x * 127.1 + uSeed * 311.7) * 43758.5453); }
void main() {
  float u = vUV.x * uSize.x;
  float v = vUV.y;
  float top;
  vec3 col = uCol;
  float a = 0.0;
  float vm = v * uSize.y;
  if (uKind == 0) {
    float r = fbmF(u, 0.45);
    float ridge = 1.0 - abs(fbmF(u + 40.0, 1.2) * 2.0 - 1.0);
    top = uBase + uAmp * (r * 0.8 + ridge * 0.35);
    a = smoothstep(top + 0.0025, top - 0.0025, v);
    float snow = smoothstep(top - 0.05 - 0.04 * n2(vec2(u * 2.0, 3.0)), top - 0.005, v) * smoothstep(uBase + uAmp * 0.62, uBase + uAmp * 0.9, top) * 0.7;
    float rock = n2(vec2(u * 1.3, vm * 1.3));
    col = mix(uCol * (0.85 + 0.3 * rock), uCol2, snow * 0.8);
    col *= mix(0.8, 1.05, smoothstep(uBase, top, v));
  } else if (uKind == 1 || uKind == 4) {
    float hill = uBase + uAmp * fbmF(u, 0.8);
    float dens = uKind == 4 ? 1.0 : smoothstep(0.4, 0.6, fbmF(u + 90.0, 0.35));
    float treeH = 0.0;
    // tree crowns: bumps in clusters
    float cell = floor(u / 3.2);
    float fx = fract(u / 3.2) - 0.5;
    float th = (0.035 + 0.07 * hash(cell)) * dens * step(0.3, hash(cell + 7.0));
    float crown = th * pow(max(0.0, 1.0 - fx * fx * 4.0), 0.6);
    // ragged leafy edge
    float rag = texture(uNoise, vec2(u * 0.09, vm * 0.07)).b * 0.6 + texture(uNoise, vec2(u * 0.27, vm * 0.21)).b * 0.4;
    treeH = crown * (0.6 + 0.55 * rag);
    // and a trunk under it
    treeH = max(treeH, step(abs(fx), 0.03) * th * 0.45);
    if (uKind == 4) treeH += 0.05 * (1.0 - abs(fract(u / 1.6) - 0.5) * 2.0) * step(0.3, hash(floor(u / 1.6) + 3.0));
    // telegraph poles every so often
    float pole = 0.0;
    if (uKind == 1) {
      float pc = fract(u / 46.0);
      pole = step(abs(pc - 0.5) * 46.0, 0.12) * step(v, hill + 0.11);
      pole += step(abs(pc - 0.5) * 46.0, 0.9) * step(abs(v - (hill + 0.1)), 0.003);
    }
    top = hill + treeH;
    a = max(smoothstep(top + 0.003, top - 0.003, v), pole);
    col = mix(uCol, uCol2, smoothstep(hill, hill + 0.02, v) * step(0.001, treeH)) * (0.85 + 0.25 * n2(vec2(u * 2.0, vm * 2.0)));
  } else if (uKind == 2) {
    float cellW = 9.0 + 7.0 * hash(floor(u / 14.0));
    float id = floor(u / cellW);
    float fx = fract(u / cellW);
    float bh = uBase + uAmp * (0.25 + 0.75 * hash(id)) * step(0.15, hash(id + 3.0));
    // broken, jagged tops
    float jag = (n2(vec2(u * 2.2, id)) - 0.5) * 0.06 + (fx > 0.5 + 0.4 * hash(id + 5.0) ? -0.08 * hash(id + 9.0) : 0.0);
    top = bh + jag;
    float rubble = uBase + 0.03 * fbmF(u, 12.0);
    top = max(top, rubble);
    a = smoothstep(top + 0.002, top - 0.002, v);
    // windows: rows and columns, some lit, many blown out
    vec2 w = vec2(fract(u / 2.4), fract(vm / 3.2));
    float win = step(0.3, w.x) * step(w.x, 0.7) * step(0.3, w.y) * step(w.y, 0.75) * step(v, bh - 0.02) * step(rubble + 0.02, v);
    float wid = hash(floor(u / 2.4) * 17.0 + floor(vm / 3.2));
    col = uCol * (0.8 + 0.3 * n2(vec2(u * 1.5, vm * 1.5)));
    col = mix(col, uCol * 0.35, win * step(0.35, wid));
    col = mix(col, uLit, win * step(0.94, wid));
  } else {
    float d = uBase + uAmp * (0.6 * fbmF(u, 0.4) + 0.4 * pow(1.0 - abs(fract(u * 0.011 + fbmF(u, 0.16) * 2.0) - 0.5) * 2.0, 2.0));
    top = d;
    a = smoothstep(top + 0.002, top - 0.002, v);
    float sideLit = fract(u * 0.011 + fbmF(u, 0.16) * 2.0) < 0.5 ? 1.0 : 0.82;
    col = uCol * sideLit * (0.92 + 0.12 * n2(vec2(u * 4.0, vm * 0.8)));
  }
  o = vec4(col, a);
}`,
};

