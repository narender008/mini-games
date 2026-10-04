// The backdrop layer painter: draws one parallax layer of a battlefield
// (mountains, tree lines, ruined skylines, dunes...) into a texture once per
// battlefield. Layer space: u across in metres of layer, v up 0..1.
//
// Kinds (L.kind in world/battlefields.js):
//   0 mountains / ridges   uP = snow 0..1, jaggedness 0..1, tree line (fraction of relief), rim light
//                          uQ.x = vertical striation (basalt, cliffs)
//   1 farmland hills       uP = tree density, tree height m, pole spacing m, field patchwork 0..1
//                          uQ = dead-tree share, hedge, barn chance, fire chance
//   2 ruined city          uP.x = lot size m;  uQ = lit window share, burning window share, -, damaged share
//   3 dunes                uP = dunes across (big), dunes across (small), ripple, scrub density
//   4 pine forest          uP = tree spacing m, tree height m, half width / height, snow on boughs
//                          uQ.x = share of trees present, uQ.y = second row spacing m
//   5 mesas                uP.x = mesa cell m, uP.y = share of empty cells
//   6 burnt woodland       uP = tree spacing m, tree height m, fence 0..1, haystacks 0..1
// Colours: uCol body/shade, uCol2 lit/second tone, uCol3 snow / sky glass / field B, uCol4 forest / rock / hedge,
// uLit lit windows and fires. Smoke columns and distant fires are painted into any kind.
// Layers wrap exactly: every noise is snapped to a whole number of repeats across the layer.
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
uniform int uKind;
uniform float uSeed;
uniform float uBase;     // ground line height (fraction)
uniform float uAmp;      // relief height (fraction)
uniform vec3 uCol;
uniform vec3 uCol2;
uniform vec3 uCol3;
uniform vec3 uCol4;
uniform vec3 uLit;       // lit windows / fires
uniform vec4 uP;
uniform vec4 uQ;
uniform vec3 uLight;     // towards the sun along the layer: x -1 left .. 1 right, y height, z how much it models the form
uniform vec4 uSmoke[4];  // base u (m), height (m), width (m), lean (m per m)
uniform vec4 uSmokeA;    // count, opacity, base height (fraction), unused
uniform vec3 uSmokeCol;
uniform vec4 uFire;      // fire cell size m, share of cells, flare share, glow size m
out vec4 o;

float TW; // metres per texel across
float TH; // metres per texel up

float hash(float x) { return fract(sin(x * 127.1 + uSeed * 311.7) * 43758.5453); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed * 17.3) * 43758.5453); }
float cov(float d, float w) { return clamp(0.5 + d / w, 0.0, 1.0); }

// Noise along the layer that wraps exactly at its ends: the noise texture
// repeats every 1.0 in texture space, so integer multiples of t tile.
float n1(float t) { return textureLod(uNoise, vec2(t, uSeed), 0.0).r; }
float fbmF(float u, float f) {
  // f: rough features per 100 m, snapped so the layer wraps
  float t = u / uSize.x;
  float m = max(1.0, floor(uSize.x * f / 400.0 + 0.5));
  float a = 0.0, w = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { a += w * n1(t * m + float(i) * 0.37); s += w; m *= 2.0; w *= 0.5; }
  return clamp((a / s - 0.5) * 1.8 + 0.5, 0.0, 1.0);
}
// 2D noise (r: 4 cells per tile, g: 8, b: 16, a: stones) with tiles about sx metres across
// and sy metres tall; wraps across the layer.
vec4 NZ(float u, float vm, float sx, float sy) {
  float M = max(1.0, floor(uSize.x / sx + 0.5));
  return textureLod(uNoise, vec2(u / uSize.x * M, vm / sy + uSeed * 5.0), 0.0);
}
float cellsN(float size) { return max(1.0, floor(uSize.x / size + 0.5)); }
float wrapD(float d) { return d - uSize.x * floor(d / uSize.x + 0.5); }
// lighting of a slope (rise per metre) for a light from the left or right
float slopeLit(float slope) {
  return mix(0.5, clamp(0.5 - slope * uLight.x * 1.8, 0.0, 1.0), uLight.z);
}

// ---------------------------------------------------------------- mountains
float mtnTop(float u) {
  float r = fbmF(u, 0.45);
  float ridge = 1.0 - abs(fbmF(u + 40.0, 1.2) * 2.0 - 1.0);
  float t = mix(r * 0.95 + ridge * 0.1, r * 0.78 + ridge * 0.42, uP.y);
  t += 0.05 * uP.y * (fbmF(u + 13.0, 6.0) - 0.5);
  return uBase + uAmp * t;
}
vec4 paintMountains(float u, float v, float vm) {
  float top = mtnTop(u);
  float dd = max((top - v) * uSize.y, 0.0);
  float a = cov(top * uSize.y - vm, TH);
  // ridges running down from the crests: light the slope found where the crest would be
  float sk = (fbmF(u * 0.37 + 77.0, 0.5) - 0.5) * 1.4;
  float us = u + dd * sk;
  float e = 1.6;
  float slope = (mtnTop(us + e) - mtnTop(us - e)) * uSize.y / (2.0 * e);
  float lit = slopeLit(slope);
  vec4 g1 = NZ(us, vm, 34.0, 34.0);
  vec4 g2 = NZ(u, vm, 14.0, 600.0);
  float grain = 0.78 + 0.36 * g1.b;
  vec3 col = mix(uCol, uCol2, clamp(lit * (0.45 + 0.7 * g1.g), 0.0, 1.0));
  col *= grain * (1.0 + uQ.x * (g2.g - 0.5) * 1.1);
  float rel = (v - uBase) / max(uAmp, 1e-3);
  float snow = 0.0;
  if (uP.x > 0.0) {
    float sl = 1.0 - uP.x * 0.8 + 0.12 * (g1.r - 0.5);
    float elev = smoothstep(sl - 0.05, sl + 0.07, rel + 0.22 * (g2.g - 0.5));
    float steep = smoothstep(0.9, 2.4, abs(slope));
    snow = elev * (1.0 - 0.75 * steep * (0.35 + g1.g));
    col = mix(col, mix(uCol3 * 0.62, uCol3, lit), snow);
  }
  if (uP.z > 0.0) {
    float fleck = NZ(u, vm, 7.0, 7.0).b;
    float tl = uP.z + 0.05 * (g1.r - 0.5) + 0.025 * (fleck - 0.5);
    float tree = smoothstep(tl, tl - 0.05, rel) * (1.0 - snow);
    col = mix(col, uCol4 * (0.65 + 0.7 * fleck) * mix(0.8, 1.1, lit), tree * 0.92);
  }
  col *= mix(1.0, 0.62, smoothstep(0.0, 70.0, dd) * uP.w);
  float rim = (1.0 - smoothstep(0.0, 2.4, dd)) * smoothstep(0.35, 0.9, lit) * uP.w;
  col += uLit * rim * 0.3;
  return vec4(col, a);
}

// ---------------------------------------------------------------- distant ground (farmland)
float hillTop(float u) { return uBase + uAmp * fbmF(u, 0.8); }

float poleTopM(float pu) { return hillTop(pu) * uSize.y + 9.0; }

// Patchwork of fields on a slope: rows get thinner towards the crest, with hedges,
// furrows and charred patches.
vec3 fieldBody(float u, float vm, float hm, vec3 cA, vec3 cB, float hedgeAmt, float charred) {
  float dh = max(hm - vm, 0.0);
  float lr = log(dh + 2.0) * 3.0;
  float row = floor(lr);
  float fr = fract(lr);
  float ro = hash(row * 1.3);
  float colW = 16.0 + dh * 1.8;
  float xx = (u + ro * colW * 6.0) / colW;
  float cx = floor(xx);
  float fid = hash2(vec2(cx, row));
  float fid2 = hash2(vec2(cx + 9.0, row + 4.0));
  vec3 fcol = mix(cA, cB, step(0.5, fid)) * (0.78 + 0.44 * fid2);
  fcol *= 0.9 + 0.2 * step(0.5, fract(lr * 7.0 + fid2));
  float ch = smoothstep(0.5, 0.68, NZ(u, dh * 2.0, 70.0, 70.0).r);
  fcol = mix(fcol, fcol * 0.4, ch * charred);
  float hedgeH = (1.0 - smoothstep(0.0, 0.1, min(fr, 1.0 - fr))) * step(0.55, hash(row + 31.0));
  float fcx = fract(xx);
  float hedgeV = (1.0 - smoothstep(0.0, 0.05, min(fcx, 1.0 - fcx))) * step(0.7, hash(cx + row * 3.0));
  return mix(fcol, uCol4, clamp(max(hedgeH, hedgeV) * hedgeAmt, 0.0, 0.85));
}

// a farm building in cells of cellM metres: gabled barn, roof half gone when burnt
float barnCu(float u, float cellM) {
  float N = cellsN(cellM);
  float bid = floor(u / uSize.x * N);
  float bw = mod(bid, N);
  return (bid + 0.3 + 0.4 * hash(bw * 2.3 + 1.0)) * (uSize.x / N);
}
float barnShape(float u, float vm, float cellM, float chance, float bgy, float k) {
  float N = cellsN(cellM);
  float bid = floor(u / uSize.x * N);
  float bw = mod(bid, N);
  float bcu = barnCu(u, cellM);
  float bhas = step(1.0 - chance, hash(bw * 5.1 + 2.0));
  float bdx = abs(u - bcu);
  float bwid = (4.5 + 3.0 * hash(bw + 3.0)) * k;
  float wallH = (4.2 + 1.2 * hash(bw + 4.0)) * k;
  float roofH = wallH + (bwid - bdx) * 0.5;
  float burnt = step(0.3, hash(bw + 5.0));
  float bsd = hash(bw + 6.0) < 0.5 ? 1.0 : -1.0;
  float gone = burnt * step(0.5, (u - bcu) * bsd);
  float ragged = abs(fract((u - bcu) * 0.33 / k + hash(bw + 9.0)) - 0.5) * 2.0;
  float roofTop = mix(roofH, min(roofH, wallH * 0.75 + ragged * 3.6 * k), gone);
  float bTop = bgy + roofTop * step(bdx, bwid);
  float chim = step(abs(u - bcu - bsd * bwid * 0.45), 0.5 * k) * step(0.5, hash(bw + 8.0)) * (1.0 - gone) * 2.5 * k;
  return cov(bTop + chim - vm, TH) * step(bdx, bwid + 0.01) * step(bgy - 0.5, vm) * bhas;
}

// the barn painted: weathered boards, a trimmed gable, a loft hatch and a door, charred and open where the roof fell
vec3 barnPaint(float u, float vm, float cellM, float bgy, float k, vec3 wood) {
  float N = cellsN(cellM);
  float bid = floor(u / uSize.x * N);
  float bw = mod(bid, N);
  float bcu = barnCu(u, cellM);
  float bx = u - bcu;
  float by = vm - bgy;
  float bwid = (4.5 + 3.0 * hash(bw + 3.0)) * k;
  float wallH = (4.2 + 1.2 * hash(bw + 4.0)) * k;
  float roofH = wallH + (bwid - abs(bx)) * 0.5;
  float burnt = step(0.3, hash(bw + 5.0));
  float bsd = hash(bw + 6.0) < 0.5 ? 1.0 : -1.0;
  float gone = burnt * step(0.5, bx * bsd);
  // boards, each its own shade, with a dark seam and weathering streaks
  float bd = bx / (0.7 * k);
  float bf = fract(bd);
  float bi = floor(bd);
  float seam = smoothstep(0.0, 0.1, bf) * smoothstep(0.0, 0.1, 1.0 - bf);
  float shade = 0.7 + 0.5 * hash(bi * 1.7 + bw);
  float streak = NZ(u, vm, 0.8, 9.0).g;
  vec3 c = wood * shade * (0.55 + 0.45 * seam) * (0.75 + 0.5 * streak);
  // the sun side of the building is warmer and brighter
  float side = clamp(0.5 - bx / bwid * uLight.x * 0.5, 0.0, 1.0);
  c *= mix(0.65, 1.45, side);
  c += uLit * 0.05 * smoothstep(0.55, 1.0, side) * smoothstep(0.0, wallH, by);
  // trim along the gable edge
  float edge = roofH - by;
  float trim = (1.0 - smoothstep(0.25 * k, 0.45 * k, edge)) * step(wallH, by);
  c = mix(c, wood * 1.9 * (0.7 + 0.5 * side), trim * (1.0 - gone));
  // loft hatch, a door with a lit lintel
  float hatch = step(abs(bx), 0.55 * k) * step(abs(by - (wallH + 1.1 * k)), 0.55 * k);
  float dX = (hash(bw + 12.0) - 0.5) * bwid * 0.5;
  float door = step(abs(bx - dX), 1.15 * k) * step(by, 3.0 * k) * step(0.0, by);
  float lintel = step(abs(bx - dX), 1.3 * k) * step(abs(by - 3.1 * k), 0.14 * k);
  c = mix(c, c * 0.18, max(hatch, door));
  c = mix(c, wood * 1.6, lintel);
  // charred and sooty toward the ragged edge where the roof is gone
  float soot = gone * smoothstep(wallH * 0.2, wallH * 1.1, by);
  c = mix(c, c * 0.35 + uCol * 0.5, soot * 0.8);
  return c;
}

vec4 paintHills(float u, float v, float vm) {
  float hill = hillTop(u);
  float hm = hill * uSize.y;
  float he = 2.0;
  float hslope = (hillTop(u + he) - hillTop(u - he)) * uSize.y / (2.0 * he);
  float hlit = slopeLit(hslope);
  vec3 flat_ = mix(uCol2, uCol3, 0.4);
  vec3 col = mix(flat_, fieldBody(u, vm, hm, uCol2, uCol3, uQ.y, 0.6), uP.w);
  col *= 0.85 + 0.3 * NZ(u, vm, 40.0, 40.0).g;
  // the sun side of the hills glows, the lee side sinks into blue shade
  col *= mix(0.6, 1.35, hlit);
  col += uLit * 0.035 * smoothstep(0.55, 1.0, hlit);
  float a = cov(hm - vm, TH);
  // trees: lumpy crowns in clumps
  float N = cellsN(3.4);
  float x = u / uSize.x * N;
  float id = floor(x);
  float fx = (fract(x) - 0.5) / (0.6 + 0.4 * hash(id + 11.0));
  float dens = uP.x * (0.3 + 0.7 * smoothstep(0.35, 0.6, fbmF(u + 90.0, 0.35)));
  float th = uP.y * (0.45 + 0.9 * hash(id + 1.0)) * dens * step(0.3, hash(id + 7.0));
  float crown = th * pow(max(0.0, 1.0 - fx * fx * 4.0), 0.55);
  float rag = NZ(u, vm, 12.0, 12.0).b * 0.55 + NZ(u, vm, 4.0, 4.0).b * 0.45;
  float tM = crown * (0.6 + 0.55 * rag);
  tM = max(tM, step(abs(fx), 0.04) * th * 0.5);
  float treeA = cov(hm + tM - vm, TH);
  float inTree = step(0.001, tM) * smoothstep(hm - 0.2, hm + 0.8, vm);
  vec3 tcol = mix(uCol, uCol4, 0.25 + 0.5 * rag) * (0.7 + 0.5 * smoothstep(hm, hm + th, vm));
  tcol *= mix(0.85, 1.12, clamp(0.5 - fx * uLight.x * 0.9, 0.0, 1.0));
  col = mix(col, tcol, inTree * treeA);
  a = max(a, treeA * inTree);
  // a farm building: gabled barn, roof half gone when burnt
  float bcu = barnCu(u, 78.0);
  float bA = barnShape(u, vm, 78.0, uQ.z, hillTop(bcu) * uSize.y, 1.5);
  vec3 bcol = barnPaint(u, vm, 78.0, hillTop(bcu) * uSize.y, 1.5, mix(uCol, uCol3, 0.2) * 1.4);
  col = mix(col, bcol, bA);
  a = max(a, bA);
  // telegraph poles with their wires
  if (uP.z > 0.0) {
    float pN = cellsN(uP.z);
    float pcw = uSize.x / pN;
    float pid = floor(u / pcw);
    float pf = u / pcw - pid;
    float back = step(pf, 0.5);
    float seg = pid - back;
    float sg = pf + back - 0.5;
    float pa = (seg + 0.5) * pcw;
    float pb = (seg + 1.5) * pcw;
    float ta = poleTopM(pa);
    float tb = poleTopM(pb);
    float wired = step(0.2, hash(mod(seg + pN, pN) * 3.7 + 1.0));
    float wy = mix(ta, tb, sg) - 1.7 * 4.0 * sg * (1.0 - sg) - 1.0;
    float wireA = cov(0.13 - abs(vm - wy), TH) * wired;
    float pdx = abs(wrapD(u - (pid + 0.5) * pcw));
    float pu0 = (pid + 0.5) * pcw;
    float t0 = poleTopM(pu0);
    float poleA = cov(0.13 - pdx, TW) * cov(t0 - vm, TH) * step(hillTop(pu0) * uSize.y - 0.5, vm);
    float arm = cov(0.12 - abs(vm - (t0 - 1.0)), TH) * cov(1.3 - pdx, TW);
    float pA = max(max(wireA, poleA), arm);
    col = mix(col, uCol * 0.8, pA);
    a = max(a, pA);
  }
  return vec4(col, a);
}

// ---------------------------------------------------------------- ruined city
float craneA(float u, float vm) {
  float Nc = cellsN(170.0);
  float cs = uSize.x / Nc;
  float id = floor(u / cs);
  float w = mod(id, Nc);
  float has = step(0.72, hash(w * 3.1 + 40.0));
  float cx = (id + 0.25 + 0.5 * hash(w + 41.0)) * cs;
  float dx = u - cx;
  float Hc = (uBase + uAmp * (0.7 + 0.3 * hash(w + 42.0))) * uSize.y;
  float hw = 0.85;
  float chord = step(hw - 0.24, abs(dx));
  float brace = max(step(0.62, fract((vm + dx * 2.4) / 2.6)), step(0.62, fract((vm - dx * 2.4) / 2.6)));
  float mast = cov(hw - abs(dx), TW) * step(0.0, vm) * cov(Hc - vm, TH) * max(chord, brace);
  float dir = hash(w + 43.0) < 0.5 ? -1.0 : 1.0;
  float jx = dx * dir;
  float jv = vm - Hc;
  float jibBand = step(-7.0, jx) * step(jx, 26.0) * step(-0.15, jv) * step(jv, 1.9);
  float jchord = max(cov(0.15 - abs(jv), TH), cov(0.15 - abs(jv - 1.75), TH));
  float jbr = step(0.55, fract((jx + jv * 0.9) / 2.2));
  float jib = jibBand * max(jchord, jbr * 0.85);
  float ballast = step(-7.0, jx) * step(jx, -3.5) * step(-2.8, jv) * step(jv, 0.0);
  float hook = cov(0.07 - abs(jx - 19.0), TW) * step(Hc - 14.0, vm) * step(vm, Hc);
  return max(max(mast, jib), max(ballast, hook)) * has;
}

vec4 paintCity(float u, float v, float vm) {
  float N = cellsN(uP.x);
  float cw = uSize.x / N;
  float x = u / cw;
  float id = floor(x);
  float fx = fract(x);
  float w = mod(id, N);
  float h1 = hash(w * 1.7);
  float h2 = hash(w * 2.9 + 1.0);
  float a1 = 0.16 + 0.34 * h1;
  float b1 = mix(a1 + 0.18, 0.98, h2);
  float slot = step(a1, fx) + step(b1, fx);
  float lo = slot < 0.5 ? 0.0 : (slot < 1.5 ? a1 : b1);
  float hi = slot < 0.5 ? a1 : (slot < 1.5 ? b1 : 1.0);
  float bid = w * 3.0 + slot;
  float bw = (hi - lo) * cw;
  float bx = (fx - lo) / (hi - lo);
  float xm = bx * bw;
  float exists = step(0.08, hash(bid + 0.5));
  float ground = uBase * uSize.y;
  float Hn = pow(hash(bid + 7.0), 1.3);
  float H = ground + uAmp * uSize.y * (0.16 + 0.84 * Hn);
  float ruin = step(1.0 - uQ.w, hash(bid + 2.0));
  float side = hash(bid + 6.0) < 0.5 ? -1.0 : 1.0;
  float diag = (bx - 0.5) * side;
  float cutM = ruin * smoothstep(-0.2, 0.5, diag) * (3.0 + 0.35 * (H - ground) * hash(bid + 5.0));
  float saw = abs(fract(bx * (2.0 + 5.0 * hash(bid + 8.0)) + hash(bid + 9.0)) - 0.5) * 2.0;
  float jag = ruin * saw * (0.8 + 3.0 * hash(bid + 10.0));
  float chimX = bw * (0.15 + 0.7 * hash(bid + 11.0));
  float chim = step(abs(xm - chimX), 0.6) * step(0.55, hash(bid + 12.0)) * 4.5 * (1.0 - ruin);
  float top = H - cutM - jag + chim;
  float inside = cov(min(xm, bw - xm), TW) * cov(top - vm, TH) * exists;

  // windows
  float pitch = 3.1;
  float rowH = 3.4;
  float wcol = floor((xm - 1.2) / pitch);
  float wf = fract((xm - 1.2) / pitch);
  float wrow = floor(vm / rowH);
  float wy = fract(vm / rowH);
  float wxIn = min(wf - 0.26, 0.74 - wf) * pitch;
  float wyIn = min(wy - 0.28, 0.8 - wy) * rowH;
  float win = cov(wxIn, TW) * cov(wyIn, TH) * step(0.0, xm - 1.2) * step(xm, bw - 1.2) * step(ground + 3.0, vm);
  float wid = hash(wcol * 13.1 + wrow * 7.7 + bid * 31.7);

  // a gutted stretch of facade, sometimes open to the sky
  float hx = (0.2 + 0.6 * hash(bid + 21.0)) * bw;
  float hy = ground + (H - ground) * (0.3 + 0.5 * hash(bid + 22.0));
  float hr = 3.0 + 7.0 * hash(bid + 23.0);
  vec2 hd = vec2((xm - hx) / (hr * (0.8 + 0.5 * hash(bid + 24.0))), (vm - hy) / (hr * 1.2));
  float hn = NZ(u, vm, 14.0, 14.0).g;
  float gut = ruin * step(0.35, hash(bid + 25.0)) * step(dot(hd, hd) + (hn - 0.5) * 0.7, 1.0);
  float skel = step(0.45, hash(bid + 26.0));
  float colm = step(abs(fract(xm / 6.5) - 0.5) * 6.5, 0.3);
  float frame = max(step(wy, 0.12), colm);
  float seeThru = gut * skel * (1.0 - frame);

  vec3 base = mix(uCol, uCol2, hash(bid + 3.0));
  base = mix(base, uCol4, step(0.68, hash(bid + 13.0)));
  base *= 0.78 + 0.4 * NZ(u, vm, 18.0, 18.0).g + 0.2 * (NZ(u, vm, 3.0, 40.0).b - 0.5);
  base *= mix(0.8, 1.0, smoothstep(0.0, 0.07, wy));
  base *= mix(0.88, 1.0, smoothstep(0.0, 2.0, min(xm, bw - xm)));
  // the low sun catches the edge that faces it
  float edgeD = uLight.x > 0.0 ? bw - xm : xm;
  base += uLit * 0.07 * smoothstep(3.0, 0.0, edgeD) * uLight.z * smoothstep(ground, ground + 30.0, vm);
  vec3 col = base;
  float fireT = 1.0 - uQ.y;
  float litT = fireT - uQ.x;
  vec3 glass = base * 0.3 + uCol3 * 0.22;
  vec3 wc = glass;
  wc = mix(wc, base * 0.08, step(0.5 - 0.22 * ruin, wid));
  wc = mix(wc, uLit, step(litT, wid));
  wc = mix(wc, vec3(1.0, 0.36, 0.07), step(fireT, wid));
  col = mix(col, wc, win * (1.0 - gut));
  float burning = step(1.0 - uQ.y * 8.0, hash(bid + 27.0));
  vec3 inner = base * 0.2 + vec3(1.0, 0.34, 0.07) * burning * (0.5 + 0.5 * NZ(u, vm, 5.0, 5.0).r) * 0.95;
  inner = mix(inner, base * 0.75, frame * step(0.1, 1.0 - burning * 0.7));
  col = mix(col, inner, gut);
  float aB = inside * (1.0 - seeThru);

  // rubble skirt and piled slabs
  float rubble = ground + 1.5 + 4.0 * fbmF(u, 10.0) + 2.0 * NZ(u, 0.0, 6.0, 6.0).g;
  float rubA = cov(rubble - vm, TH);
  vec3 rubC = uCol * 0.85 * (0.65 + 0.7 * NZ(u, vm, 5.0, 5.0).b);
  rubC *= 0.8 + 0.4 * step(0.5, fract((u * 0.8 + vm * 1.3) / 3.1 + hash(floor(u / 7.0))));
  float aTot = max(aB, rubA);
  col = mix(col, rubC, rubA * (1.0 - aB));

  float cr = craneA(u, vm);
  col = mix(col, uCol * 0.7, cr * (1.0 - aTot));
  aTot = max(aTot, cr);
  return vec4(col, aTot);
}

// ---------------------------------------------------------------- dunes
float duneProf(float u, float N, float off, float warpAmt) {
  float warp = (fbmF(u + off, 0.5) - 0.5) * warpAmt;
  float p = fract(u / uSize.x * N + warp + hash(off));
  float k = 0.7;
  return p < k ? pow(p / k, 1.25) : pow(1.0 - (p - k) / (1.0 - k), 1.7);
}
float duneTop(float u) {
  float d1 = duneProf(u, uP.x, 3.0, 0.9) * (0.45 + 0.75 * fbmF(u + 11.0, 0.3));
  float d2 = duneProf(u, uP.y, 17.0, 0.7) * (0.4 + 0.8 * fbmF(u + 51.0, 0.6));
  return uBase + uAmp * (0.55 * d1 + 0.28 * d2 + 0.22 * fbmF(u + 7.0, 0.6));
}
vec4 paintDunes(float u, float v, float vm) {
  float top = duneTop(u);
  float topM = top * uSize.y;
  float dd = max(topM - vm, 0.0);
  float e = 0.9;
  float slope = (duneTop(u + e) - duneTop(u - e)) * uSize.y / (2.0 * e);
  // scrub and low rocks on the crests
  float N = cellsN(4.0);
  float x = u / uSize.x * N;
  float sid = floor(x);
  float sf = fract(x) - 0.5;
  float sh = hash(sid + 1.0);
  float bushH = step(1.0 - uP.w * 0.8, hash(sid + 5.0)) * (0.25 + 0.7 * sh * sh) * pow(max(0.0, 1.0 - sf * sf * 4.0), 0.7) * (0.65 + 0.5 * NZ(u, vm, 3.0, 3.0).b);
  float rockH = step(1.0 - uP.w * 0.35, hash(sid + 9.0)) * (0.9 + 2.0 * hash(sid + 3.0)) * pow(max(0.0, 1.0 - sf * sf * 4.0), 0.35);
  float a = cov(topM + bushH + rockH - vm, TH);
  float lit = mix(0.5, slopeLit(slope), exp(-dd / 4.0));
  float grain = NZ(u, vm, 18.0, 5.0).g;
  vec3 col = mix(uCol, uCol2, smoothstep(0.3, 0.7, lit));
  col *= mix(1.0, 0.82, smoothstep(0.0, 45.0, dd));
  // wind-rippled flanks
  float rip = sin((dd * 1.9 + grain * 3.0) * 1.4) * 0.5 + 0.5;
  col *= 0.9 + 0.22 * grain + (0.04 + uP.z * 0.1) * (rip - 0.5);
  // the crest line catches the sun
  col += uCol2 * 0.22 * smoothstep(1.2, 0.0, dd) * smoothstep(0.4, 1.0, lit);
  float inBush = step(0.001, bushH) * step(topM - 0.1, vm);
  col = mix(col, uCol4 * (0.7 + 0.6 * NZ(u, vm, 2.0, 2.0).b), inBush * 0.9);
  float inRock = step(0.001, rockH) * (1.0 - inBush) * step(topM - 0.1, vm);
  col = mix(col, uCol4 * 1.2 * (0.7 + 0.7 * NZ(u, vm, 2.5, 2.5).g), inRock * 0.95);
  return vec4(col, a);
}

// ---------------------------------------------------------------- pine forest
float forestGround(float u) {
  return (uBase + uAmp * (0.15 + 0.7 * fbmF(u, 0.8))) * uSize.y;
}
void pines(float u, float vm, float cs, float Hm, float asp, float so, inout vec3 col, inout float a) {
  float N = cellsN(cs);
  float cw = uSize.x / N;
  float id = floor(u / cw);
  for (int k = -3; k <= 3; k++) {
    float cid = id + float(k);
    float w = mod(cid + N * 4.0, N);
    float h1 = hash(w * 1.31 + so);
    float h2 = hash(w * 3.7 + 1.0 + so);
    float h3 = hash(w * 5.3 + 2.0 + so);
    float present = step(1.0 - uQ.x, h1);
    float cxm = (cid + 0.5 + (h2 - 0.5) * 0.85) * cw;
    float Hh = Hm * (0.6 + 0.8 * h3 * h3);
    float wm = Hh * asp * (0.8 + 0.4 * hash(w + 9.0 + so));
    float gM = forestGround(cxm);
    float t = (vm - gM + 0.4) / Hh;
    float dx = u - cxm;
    float T = 6.0 + floor(h2 * 3.0);
    float tt = fract(t * T + h2);
    float sc = pow(1.0 - tt, 0.8);
    float hw = wm * (1.0 - t) * (0.55 + 0.45 * sc) * (1.0 + 0.1 * sin(t * 40.0 + h1 * 30.0));
    float body = cov(hw - abs(dx), TW) * step(0.0, t) * step(t, 1.0);
    float trunk = cov(0.22 - abs(dx), TW) * step(0.0, t) * step(t, 0.2);
    float c = max(body, trunk) * present;
    float edgeK = abs(dx) / max(hw, 1e-3);
    float side = clamp(-dx / max(hw, 1e-3) * sign(uLight.x + 1e-4), -1.0, 1.0);
    vec3 tc = uCol * (0.55 + 0.6 * smoothstep(0.0, 0.8, t)) * (1.0 + 0.35 * max(side, 0.0) * uLight.z);
    tc *= 0.85 + 0.3 * NZ(u, vm, 4.0, 4.0).b;
    float band = smoothstep(0.3, 0.55, tt) * (1.0 - smoothstep(0.9, 1.0, tt));
    float snowAmt = uP.w * band * smoothstep(0.55, 0.9, edgeK) * step(0.35, NZ(u, vm, 4.0, 4.0).g + 0.3 * side);
    tc = mix(tc, uCol3 * (0.7 + 0.3 * max(side, 0.0)), clamp(snowAmt, 0.0, 0.9) * body);
    col = mix(col, tc, c);
    a = max(a, c);
  }
}
vec4 paintForest(float u, float v, float vm) {
  float gM = forestGround(u);
  float a = cov(gM - vm, TH);
  vec3 col = mix(uCol2, uCol2 * 0.8, smoothstep(0.0, 18.0, gM - vm)) * (0.9 + 0.2 * NZ(u, vm, 30.0, 30.0).g);
  // far row behind, near row in front
  pines(u, vm, uP.x * 1.45, uP.y * 0.85, uP.z, 17.0, col, a);
  pines(u, vm, uP.x, uP.y, uP.z, 0.0, col, a);
  return vec4(col, a);
}

// ---------------------------------------------------------------- mesas
vec2 mesaTop(float u) {
  float N = cellsN(uP.x);
  float cs = uSize.x / N;
  float id = floor(u / cs);
  float ground = uBase * uSize.y + 2.0 * (fbmF(u, 1.6) - 0.5) * uAmp * uSize.y * 0.18;
  float mt = ground;
  float tz = 0.0;
  for (int k = -1; k <= 1; k++) {
    float cid = id + float(k);
    float w = mod(cid + N, N);
    float present = step(uP.y, hash(w * 1.7));
    float cx = (cid + 0.25 + 0.5 * hash(w * 2.9 + 1.0)) * cs;
    float Hm = uAmp * uSize.y * (0.42 + 0.58 * hash(w * 4.1 + 2.0));
    float hw = cs * (0.07 + 0.14 * hash(w * 5.3 + 3.0));
    float dx = abs(u - cx);
    float Tz = Hm * 0.56;
    float cw = Hm * 0.2;
    float tw = Hm * 2.2;
    float s = clamp((dx - hw) / cw, 0.0, 1.0);
    float ledges = 0.045 * floor(s * 5.0 + hash(w + floor(dx / 3.0)) * 0.8);
    float cliff = mix(Hm, Tz, clamp(pow(s, 0.85) + ledges, 0.0, 1.0));
    float s2 = clamp((dx - hw - cw) / tw, 0.0, 1.0);
    float talus = Tz * pow(1.0 - s2, 1.8);
    float p = dx < hw + cw ? cliff : talus;
    p += step(dx, hw) * 0.5 * (fbmF(u + 3.0 * w, 8.0) - 0.5);
    p = ground + (p - 0.0) * present;
    if (p > mt) { mt = p; tz = ground + Tz; }
  }
  return vec2(mt, tz);
}
vec4 paintMesas(float u, float v, float vm) {
  vec2 mt = mesaTop(u);
  float a = cov(mt.x - vm, TH);
  float sy = vm / 5.0 + 1.6 * NZ(u, vm, 260.0, 260.0).r;
  float bid = floor(sy);
  float fr = fract(sy);
  vec3 band = mix(uCol, uCol2, hash(bid * 3.3 + 1.0));
  band *= 0.86 + 0.28 * hash(bid * 9.1);
  band *= 0.8 + 0.2 * smoothstep(0.0, 0.3, fr) * (0.75 + 0.25 * smoothstep(1.0, 0.7, fr)) + 0.1;
  vec4 stk = NZ(u, vm, 20.0, 420.0);
  band *= 0.84 + 0.3 * stk.g + 0.12 * NZ(u, vm, 6.0, 6.0).b;
  // sunlit left-facing walls, shaded right-facing ones
  float e = 1.2;
  float slope = (mesaTop(u + e).x - mesaTop(u - e).x) / (2.0 * e);
  band *= mix(0.78, 1.12, slopeLit(slope));
  vec3 tal = uCol3 * (0.85 + 0.3 * stk.b) * (0.85 + 0.3 * NZ(u, vm, 12.0, 12.0).g);
  float onTalus = 1.0 - smoothstep(mt.y - 0.6, mt.y + 0.6, vm);
  vec3 col = mix(band, tal, onTalus);
  // the cliff top catches the sun
  float topLip = smoothstep(2.0, 0.0, mt.x - vm) * 0.18;
  col += uCol2 * topLip;
  return vec4(col, a);
}

// ---------------------------------------------------------------- burnt woodland
float burntTop(float u) { return uBase + uAmp * (0.6 * fbmF(u, 1.0) + 0.1); }
float deadTree(vec2 p, float Hm, float h) {
  float t = p.y / Hm;
  float lean = (h - 0.5) * 0.14 * p.y;
  float tw = (0.2 * (1.0 - 0.8 * clamp(t, 0.0, 1.0)) + 0.05) * (0.6 + Hm / 12.0);
  float c = cov(tw - abs(p.x - lean), TW) * step(0.0, p.y) * cov(Hm - p.y, TH);
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float hb = hash(h * 91.0 + fi * 7.3);
    float by = Hm * (0.3 + 0.62 * (fi + hb) / 6.0);
    float dir = hash(h * 53.0 + fi * 3.1) < 0.5 ? -1.0 : 1.0;
    float len = Hm * (0.14 + 0.2 * hb) * (1.15 - 0.6 * by / Hm);
    float ang = 0.35 + 0.8 * hash(h * 17.0 + fi * 5.9);
    vec2 p0 = vec2((h - 0.5) * 0.14 * by, by);
    vec2 d = vec2(dir * cos(ang), sin(ang)) * len;
    vec2 q = p - p0;
    float tt = clamp(dot(q, d) / dot(d, d), 0.0, 1.0);
    float dist = length(q - d * tt);
    float wd = (0.1 * (1.0 - 0.7 * tt) + 0.04) * (0.6 + Hm / 12.0);
    c = max(c, cov(wd - dist, TW));
    // a fork at the tip
    vec2 p1 = p0 + d;
    vec2 d2 = vec2(dir * cos(ang + 0.9 * dir * -1.0), sin(ang + 0.9)) * len * 0.5;
    vec2 q2 = p - p1;
    float t2 = clamp(dot(q2, d2) / dot(d2, d2), 0.0, 1.0);
    c = max(c, cov(0.06 * (1.0 - 0.6 * t2) + 0.03 - length(q2 - d2 * t2), TW));
  }
  return c;
}
vec4 paintBurnt(float u, float v, float vm) {
  float gM = burntTop(u) * uSize.y;
  float a = cov(gM - vm, TH);
  float bsl = (burntTop(u + 1.5) - burntTop(u - 1.5)) * uSize.y / 3.0;
  float blit = slopeLit(bsl);
  vec3 col = fieldBody(u, vm, gM, uCol2, uCol3, 0.9, 0.8);
  col *= 0.8 + 0.4 * NZ(u, vm, 25.0, 25.0).g;
  col *= 0.9 + 0.2 * NZ(u, vm, 3.0, 3.0).b;
  col *= mix(0.65, 1.3, blit);
  float N = cellsN(uP.x);
  float cw = uSize.x / N;
  float id = floor(u / cw);
  float tA = 0.0;
  for (int k = -1; k <= 1; k++) {
    float cid = id + float(k);
    float w = mod(cid + N, N);
    float has = step(0.35, hash(w * 1.9 + 1.0));
    float cxm = (cid + 0.2 + 0.6 * hash(w * 2.3 + 2.0)) * cw;
    float Hh = uP.y * (0.5 + 0.8 * hash(w * 3.9 + 4.0));
    float gy = burntTop(cxm) * uSize.y - 0.3;
    float tr = deadTree(vec2(u - cxm, vm - gy), Hh, hash(w * 7.7 + 5.0)) * has;
    // a blackened stump when there is no tree
    float stump = cov(0.5 - abs(u - cxm), TW) * cov(0.9 * hash(w + 11.0) - (vm - gy), TH) * step(0.0, vm - gy) * (1.0 - has) * step(0.5, hash(w + 12.0));
    tA = max(tA, max(tr, stump));
  }
  // fence posts and sagging wire
  float fen = 0.0;
  if (uP.z > 0.0) {
    float pN = cellsN(3.2);
    float pc = uSize.x / pN;
    float pid = floor(u / pc);
    float pf = u / pc - pid;
    float w = mod(pid, pN);
    float live = step(0.25, hash(w * 4.1 + 20.0));
    float lean = (hash(w + 21.0) - 0.5) * 0.5;
    float pu = (pid + 0.5) * pc;
    float gp = burntTop(pu) * uSize.y;
    float gw = burntTop(u) * uSize.y;
    float ph = 1.3 * (0.8 + 0.4 * hash(w + 22.0)) * live + 0.4 * (1.0 - live);
    float post = cov(0.07 - abs(u - pu - lean * (vm - gp)), TW) * step(gp - 0.2, vm) * cov(gp + ph - vm, TH);
    float sag = 0.09 * (1.0 - cos(6.2831853 * (pf - 0.5)));
    float wire = max(cov(0.04 - abs(vm - (gw + 1.05 - sag)), TH), cov(0.04 - abs(vm - (gw + 0.55 - sag)), TH));
    float run = step(hash(floor(u / 50.0) + 77.0), uP.z);
    fen = max(post, wire * live * step(0.3, hash(w + 23.0))) * run;
  }
  tA = max(tA, fen);
  // hedgerow shrubs along the field edges and a ruined barn
  float hN = cellsN(5.5);
  float hx = u / uSize.x * hN;
  float hid = floor(hx);
  float hf = fract(hx) - 0.5;
  float hh = hash(hid + 31.0);
  float hedgeOn = step(0.45, fbmF(u + 60.0, 1.4)) * step(0.15, hh);
  float shrubM = (1.4 + 2.2 * hh) * hedgeOn * pow(max(0.0, 1.0 - hf * hf * 4.0), 0.5) * (0.65 + 0.55 * NZ(u, vm, 4.0, 4.0).b);
  // a band of shrubs standing on the field line, not a wall down to the strip's foot
  float shrubA = cov(gM + shrubM - vm, TH) * cov(vm - gM + 0.5, TH) * step(0.01, shrubM);
  float bcu = barnCu(u, 130.0);
  float bgyN = burntTop(bcu) * uSize.y;
  float barnA = barnShape(u, vm, 130.0, 0.6, bgyN, 1.15);
  // trees, stumps and fence: dark, warmer towards the tops where the low sun reaches
  float hgt = clamp((vm - gM) / 12.0, 0.0, 1.0);
  vec3 tc = uCol * (0.8 + 0.4 * NZ(u, vm, 2.0, 2.0).b) * mix(0.9, 1.9, hgt) + uLit * 0.03 * hgt;
  col = mix(col, tc, tA);
  // hedges: leafy clumps, lit crowns
  float shT = clamp((vm - gM) / max(shrubM, 0.1), 0.0, 1.0);
  vec4 leaf = NZ(u, vm, 3.0, 3.0);
  vec3 sc = uCol4 * (0.6 + 1.0 * leaf.b) * mix(0.8, 1.9, smoothstep(0.3, 1.0, shT) * (0.5 + leaf.g)) + uLit * 0.045 * smoothstep(0.65, 1.0, shT);
  col = mix(col, sc, shrubA);
  // the barn: planks, a lit gable, a dark hollow where the roof fell
  vec3 bc = barnPaint(u, vm, 130.0, bgyN, 1.15, mix(uCol2, uCol3, 0.3) * 1.1);
  col = mix(col, bc, barnA);
  a = max(a, max(max(tA, shrubA), barnA));
  return vec4(col, a);
}

// ---------------------------------------------------------------- smoke, fires, flares
// Smoke columns drift up from behind the horizon and lean with the wind.
vec4 smokeAt(float u, float vm) {
  float res = 0.0;
  float tone = 0.0;
  float baseY = uSmokeA.z * uSize.y;
  for (int i = 0; i < 4; i++) {
    if (float(i) >= uSmokeA.x) break;
    vec4 s = uSmoke[i];
    float t = (vm - baseY) / s.y;
    float sway = (textureLod(uNoise, vec2(s.x * 0.013 + 0.5, t * 0.7), 0.0).r - 0.5) * s.z * 2.6;
    float cx = s.x + s.w * (t * s.y) + sway;
    float dx = wrapD(u - cx);
    float w = s.z * (0.22 + 1.9 * pow(clamp(t, 0.0, 1.0), 0.62));
    float d = exp(-dx * dx / (w * w)) * smoothstep(0.0, 0.04, t) * (1.0 - smoothstep(0.5, 1.0, t));
    vec4 nb = NZ(u + s.x, vm, 40.0, 40.0);
    vec4 nb2 = NZ(u * 1.7, vm, 14.0, 14.0);
    d *= 0.5 + 0.75 * nb.g + 0.35 * (nb2.b - 0.5);
    float sa = smoothstep(0.2, 0.62, d);
    if (sa > res) { tone = t; }
    res = max(res, sa);
  }
  vec3 c = mix(uSmokeCol * 0.75, uSmokeCol * 1.35, smoothstep(0.0, 0.9, tone));
  c += uLit * 0.14 * (1.0 - smoothstep(0.0, 0.3, tone));
  return vec4(c, res * uSmokeA.y);
}
float groundM(float u) {
  if (uKind == 0) return mtnTop(u) * uSize.y;
  if (uKind == 1) return hillTop(u) * uSize.y;
  if (uKind == 3) return duneTop(u) * uSize.y;
  if (uKind == 6) return burntTop(u) * uSize.y;
  return uBase * uSize.y;
}
// distant fires on the ground: flame, glow, and the odd flare hanging in the sky
vec4 fireAt(float u, float vm, out vec4 flare) {
  flare = vec4(0.0);
  vec4 res = vec4(0.0);
  if (uFire.y <= 0.0 && uFire.z <= 0.0) return res;
  float N = cellsN(uFire.x);
  float cw = uSize.x / N;
  float id = floor(u / cw);
  for (int k = -1; k <= 1; k++) {
    float cid = id + float(k);
    float w = mod(cid + N, N);
    float cx = (cid + 0.15 + 0.7 * hash(w * 1.3 + 61.0)) * cw;
    float on = step(1.0 - uFire.y, hash(w * 2.1 + 62.0));
    float gy = groundM(cx);
    vec2 p = vec2(u - cx, vm - gy);
    float sz = uFire.w * (0.6 + 0.8 * hash(w + 63.0));
    float fl = NZ(u, vm, 3.0, 3.0).g;
    // flame: a leaning tongue
    float t = p.y / (sz * 0.45);
    float fw = sz * 0.1 * (1.0 - clamp(t, 0.0, 1.0)) * (0.7 + 0.6 * fl);
    float flame = cov(fw - abs(p.x - 0.1 * p.y), TW) * step(-0.2, p.y) * step(p.y, sz * 0.45) * on;
    float glow = exp(-dot(p, p * vec2(1.0, 1.6)) / (sz * sz * 0.3)) * on * 0.4;
    vec3 gc = mix(vec3(1.0, 0.45, 0.12), uLit, 0.4);
    if (flame > res.a) res = vec4(mix(vec3(1.0, 0.62, 0.2), vec3(1.0, 0.95, 0.7), clamp(1.0 - t, 0.0, 1.0) * 0.6), flame);
    float ga = glow * (1.0 - res.a);
    res = vec4((res.rgb * res.a + gc * ga) / max(res.a + ga, 1e-3), res.a + ga);
    // flare: parachute flare drifting well above the ground
    float fOn = step(1.0 - uFire.z, hash(w * 3.3 + 64.0));
    vec2 fp = vec2(u - cx - 8.0 * (hash(w + 65.0) - 0.5), vm - gy - 22.0 - 40.0 * hash(w + 66.0));
    float fr = length(fp);
    float core = exp(-fr * fr / 1.2) * fOn;
    float halo = exp(-fr * fr / (sz * sz * 1.6)) * fOn * 0.4;
    float trail = exp(-pow(fp.x * 3.0 + fp.y * 0.05, 2.0)) * step(0.0, -fp.y) * step(-fp.y, 28.0) * exp(fp.y * 0.08) * fOn * 0.1;
    float fa = max(core, max(halo, trail));
    vec3 fc = mix(vec3(1.0, 0.85, 0.6), vec3(1.0, 1.0, 0.95), core);
    float f2 = fa * (1.0 - flare.a);
    flare = vec4((flare.rgb * flare.a + fc * f2) / max(flare.a + f2, 1e-3), flare.a + f2);
  }
  return res;
}

void main() {
  TW = max(fwidth(vUV.x) * uSize.x, 1e-4);
  TH = max(fwidth(vUV.y) * uSize.y, 1e-4);
  float u = vUV.x * uSize.x;
  float v = vUV.y;
  float vm = v * uSize.y;
  vec4 r;
  if (uKind == 0) r = paintMountains(u, v, vm);
  else if (uKind == 1) r = paintHills(u, v, vm);
  else if (uKind == 2) r = paintCity(u, v, vm);
  else if (uKind == 3) r = paintDunes(u, v, vm);
  else if (uKind == 4) r = paintForest(u, v, vm);
  else if (uKind == 5) r = paintMesas(u, v, vm);
  else r = paintBurnt(u, v, vm);
  // smoke rises from behind the ground: the silhouette goes over it
  if (uSmokeA.x > 0.0) {
    vec4 sm = smokeAt(u, vm);
    float oa = r.a + sm.a * (1.0 - r.a);
    r.rgb = (r.rgb * r.a + sm.rgb * sm.a * (1.0 - r.a)) / max(oa, 1e-3);
    r.a = oa;
  }
  // fires and flares glow in front
  vec4 fl;
  vec4 fi = fireAt(u, vm, fl);
  float oa = fi.a + r.a * (1.0 - fi.a);
  vec3 over = fi.rgb * fi.a + r.rgb * r.a * (1.0 - fi.a);
  r = vec4(over / max(oa, 1e-3), oa);
  oa = fl.a + r.a * (1.0 - fl.a);
  over = fl.rgb * fl.a + r.rgb * r.a * (1.0 - fl.a);
  r = vec4(over / max(oa, 1e-3), oa);
  o = r;
}`,
};
