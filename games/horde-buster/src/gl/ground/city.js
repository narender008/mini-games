// Chapter 1's ground: a city road edge to edge, a kerb and sidewalk at each
// screen edge, grass verges and plazas beyond for very wide screens.
// uC: asphalt, asphalt2, kerb, walk, grass, dirt, plaza, line.
// uP[0]: road x0, x1, kerb width, sidewalk width; uP[1]: verge width, plaza
// start, seed, lane dash length; uP[2].x: lanes; uP[3]: crosswalk y0, y1,
// stripe period, on.
export const CITY = `
void groundCity(vec2 w, out vec3 col, out float h, out vec3 glow) {
  float seed = uP[1].z;
  vec2 q = w / 512.0 + seed;
  float x0 = uP[0].x, x1 = uP[0].y, kerb = uP[0].z, walk = uP[0].w;
  float dl = x0 - w.x;            // distance outside the left road edge
  float dr = w.x - x1;            // ... right
  float side = max(dl, dr);       // > 0 off the road
  float sx = dl > dr ? -1.0 : 1.0;
  h = 0.5;
  glow = vec3(0.0);
  float big = fbm(q * 0.6);
  float fine = n3(w / 37.0 + seed);
  if (side <= 0.0) {
    // ---- asphalt: two tones of patching, grain, cracks, lane paint, manholes, oil
    col = mix(uC[0], uC[1], smoothstep(0.42, 0.62, big));
    col *= 0.88 + 0.24 * fine;
    float grain = hash12(floor(w * 0.9));
    col *= 0.92 + 0.12 * grain;
    h = 0.45 + 0.1 * fine + 0.06 * grain;
    // patched rectangles of newer, darker asphalt
    vec2 pc = floor(w / vec2(170.0, 230.0));
    float pr = hash12(pc + seed * 3.0);
    vec2 pf = fract(w / vec2(170.0, 230.0));
    if (pr > 0.78 && pf.x > 0.12 && pf.x < 0.88 && pf.y > 0.1 && pf.y < 0.75) { col *= 0.78; h += 0.03; }
    // lane lines: worn dashed dividers; on a wide boulevard a solid double yellow down the middle
    float lanes = max(uP[2].x, 2.0);
    for (int i = 1; i < 16; i++) {
      if (float(i) >= lanes) break;
      float lx = x0 + (x1 - x0) * float(i) / lanes;
      float d = abs(w.x - lx);
      float wear = smoothstep(0.25, 0.6, n2(w / 90.0 + float(i)));
      if (lanes >= 4.0 && abs(float(i) * 2.0 - lanes) < 0.5) {
        float m = (1.0 - smoothstep(3.0, 4.5, abs(d - 7.0))) * (0.55 + 0.45 * wear);
        col = mix(col, vec3(0.85, 0.62, 0.12), m * 0.85);
        h += m * 0.05;
      } else {
        float dash = step(0.42, fract(w.y / uP[1].w));
        float m = (1.0 - smoothstep(5.0, 7.0, d)) * dash * wear;
        col = mix(col, uC[7], m * 0.8);
        h += m * 0.05;
      }
    }
    // a zebra crossing and stop line where the horde comes in
    if (uP[3].w > 0.5 && w.y > uP[3].x && w.y < uP[3].y) {
      float sx2 = fract((w.x - x0) / uP[3].z);
      float m = step(0.45, sx2) * smoothstep(0.2, 0.5, n2(w / 70.0 + 3.0)) * step(x0 + 30.0, w.x) * step(w.x, x1 - 30.0);
      col = mix(col, uC[7], m * 0.75);
      h += m * 0.04;
    }
    if (uP[3].w > 0.5 && abs(w.y - (uP[3].y + 26.0)) < 6.0 && w.x > x0 + 30.0 && w.x < x1 - 30.0) col = mix(col, uC[7], 0.6 * smoothstep(0.2, 0.5, n1(w / 60.0)));
    // edge lines
    float de = min(abs(w.x - (x0 + 22.0)), abs(w.x - (x1 - 22.0)));
    float em = (1.0 - smoothstep(3.5, 5.5, de)) * smoothstep(0.3, 0.55, n2(w / 120.0 + 7.0));
    col = mix(col, uC[7] * vec3(1.0, 0.92, 0.6), em * 0.7);
    // cracks
    float cr = crack(w / 900.0 + seed, 1.0);
    float cm = 1.0 - smoothstep(0.012, 0.03, cr);
    cm *= smoothstep(0.35, 0.6, n3(w / 260.0 + 3.0));
    col *= 1.0 - cm * 0.6;
    h -= cm * 0.25;
    // potholes from the cells channel
    float ph = cells(w / 700.0 + seed * 0.5);
    float pm = smoothstep(0.82, 0.9, ph) * step(0.5, n1(w / 300.0 + 9.0));
    col = mix(col, uC[0] * 0.45, pm);
    h -= pm * 0.3;
    // oil stains
    float oil = smoothstep(0.66, 0.8, n2(w / 160.0 + 13.0)) * 0.35;
    col *= 1.0 - oil;
    // manholes
    vec2 mc = vec2(x0 + (x1 - x0) * 0.68, 0.0);
    for (int i = 0; i < 3; i++) {
      vec2 c = vec2(mc.x + float(i - 1) * 190.0 * (i == 1 ? 0.0 : 1.0), 260.0 + float(i) * 410.0);
      float d = length(w - c);
      if (d < 30.0) {
        float rim = smoothstep(26.0, 28.0, d);
        float grid = step(0.5, fract((w.x - c.x) / 7.0)) * step(0.5, fract((w.y - c.y) / 7.0));
        col = mix(vec3(0.17, 0.17, 0.19) * (0.8 + 0.4 * grid), uC[2] * 0.55, rim);
        h = 0.5 + 0.1 * grid - rim * 0.05;
      }
    }
  } else if (side < kerb) {
    // ---- kerb stone: raised, pale, chipped; red-white paint near crossings
    col = uC[2] * (0.85 + 0.25 * fine);
    float seg = floor(w.y / 64.0);
    col *= 0.92 + 0.12 * hash12(vec2(seg, sx));
    if (fract(w.y / 64.0) < 0.04) col *= 0.7;
    float paint = step(0.5, fract(w.y / 128.0)) * step(0.55, n1(w / 700.0 + 4.0));
    col = mix(col, vec3(0.75, 0.12, 0.1), paint * 0.75);
    h = 0.75 + 0.05 * fine - (side / kerb) * 0.05;
    if (side < 4.0) { col *= 0.65; h = 0.55; }
  } else if (side < kerb + walk) {
    // ---- sidewalk slabs with dark joints, a few cracked or missing
    vec2 tw = vec2(side - kerb, w.y);
    vec2 cell = floor(tw / 48.0);
    vec2 f = fract(tw / 48.0);
    float r = hash12(cell + sx * 17.0 + seed);
    col = uC[3] * (0.86 + 0.18 * r) * (0.9 + 0.2 * fine);
    float joint = 1.0 - smoothstep(0.0, 0.05, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    col *= 1.0 - joint * 0.45;
    h = 0.66 - joint * 0.1 + 0.03 * fine;
    if (r > 0.93) { col *= 0.7; h -= 0.05; }
    float cm = 1.0 - smoothstep(0.01, 0.03, crack(w / 400.0 + 2.0, 1.0));
    col *= 1.0 - cm * 0.5 * step(0.6, r);
    // weeds in the joints
    col = mix(col, uC[4] * 0.7, joint * smoothstep(0.62, 0.75, n2(w / 80.0)) * 0.8);
  } else if (side < kerb + walk + uP[1].x) {
    // ---- grass verge with dirt patches and tyre ruts
    float g = fbm(w / 220.0 + seed);
    col = mix(uC[4] * 0.82, uC[4] * 1.12, smoothstep(0.3, 0.7, g));
    col *= 0.85 + 0.3 * n3(w / 23.0);
    float dirt = smoothstep(0.58, 0.72, n1(w / 330.0 + 5.0));
    col = mix(col, uC[5], dirt);
    float blades = hash12(floor(w / 3.0));
    col *= 0.9 + 0.2 * blades;
    h = 0.55 + 0.15 * blades + 0.1 * g - dirt * 0.05;
  } else {
    // ---- plaza / parking: big concrete squares, painted bays, drains
    vec2 tw = vec2(side, w.y);
    vec2 cell = floor(tw / 96.0);
    vec2 f = fract(tw / 96.0);
    float r = hash12(cell + seed * 7.0 + sx);
    col = uC[6] * (0.88 + 0.14 * r) * (0.9 + 0.2 * fine);
    float joint = 1.0 - smoothstep(0.0, 0.02, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    col *= 1.0 - joint * 0.35;
    float bay = (1.0 - smoothstep(2.0, 4.0, abs(fract(w.y / 110.0) - 0.5) * 110.0)) * step(uP[1].y, side) * step(side, uP[1].y + 220.0);
    col = mix(col, vec3(0.9, 0.88, 0.8), bay * 0.6);
    h = 0.5 - joint * 0.08 + 0.04 * fine;
    col *= 1.0 - smoothstep(0.6, 0.8, n2(w / 200.0 + 8.0)) * 0.25;
  }
  // a little grime everywhere so nothing is perfectly clean
  col *= 0.9 + 0.1 * smoothstep(0.2, 0.8, big);
}
`;
