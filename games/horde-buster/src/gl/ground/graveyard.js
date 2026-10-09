// Chapter 2's ground, a graveyard at night: dark soil with patches of blue-green grass, a worn cobbled path down the middle, rows of
// grave plots (a low kerb of stones around a mound) toward the sides, roots, puddles, scattered dead leaves, and near the top edge a
// faint cold-blue summoning sigil with rune cracks, where the horde comes through.
// The middle stays calm: cobbles are a mid grey-blue, plots and roots sit off to the sides, so creatures and blood stay the
// brightest things there. All noise is read up front (no texture lookups inside branches).
//
// uC (linear rgb): 0 soil (dark), 1 mud / fresh earth, 2 grass dark, 3 grass light, 4 cobble, 5 kerb stone, 6 dead leaves,
//   7 cold glow (puddle sheen and rune light).
// uP[0]: path half width at a 720 u field (it grows with sqrt(width / 720)), how far the path meanders sideways, how much it flares
//   out at the gate (top), gap between the path edge and the first column of plots.
// uP[1]: plot column pitch (x), plot row pitch (y), plot width, plot length. Plots mirror about the field centre: column c (0 is the
//   one nearest the path) of a side is centred at W/2 +- (pathHalf + gap + pitchX * (c + 0.5)); odd columns drop half a row, a row r
//   is centred at (r + 0.5) * pitchY - (c odd ? pitchY / 2 : 0); the head (stone end) is the top (small y) end. See chapters/graveyard.js.
// uP[2]: puddles 0..1, dead leaves 0..1, roots 0..1, kerb stone width.
// uP[3]: sigil centre y, sigil radius, glow strength, how far beyond the field edges the plots stop (the wild ground begins).
// Glow (HDR, the bake stores glow / 4): puddle sheen 0.05..0.3, rune lines up to 0.5 * strength.
export const GRAVEYARD = `
float gyLine(float d, float w) {
  return 1.0 - smoothstep(w * 0.5, w * 0.5 + 1.2, abs(d));
}

// Irregular cobbles: x = gap between the two nearest cell centres' borders (0 on a joint, in cells), y = a hash of the stone.
vec2 gyCobble(vec2 p) {
  vec2 ip = floor(p);
  vec2 fp = fract(p);
  float d1 = 9.0;
  float d2 = 9.0;
  float id = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = vec2(hash12(ip + g + 3.7), hash12(ip + g + 41.3));
      vec2 r = g + 0.18 + 0.64 * o - fp;
      float d = dot(r, r);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = hash12(ip + g + 7.9);
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  return vec2(sqrt(d2) - sqrt(d1), id);
}

// One dead leaf per 17 u cell at most: a pointed ellipse at a random angle, its colour in lc. Returns its coverage.
float gyLeaf(vec2 w, float dens, out vec3 lc) {
  vec2 cell = floor(w / 17.0);
  vec2 f = w / 17.0 - cell;
  lc = vec3(0.0);
  float r = hash12(cell + uSeed * 3.0 + 41.0);
  if (r > dens) return 0.0;
  vec2 c = vec2(0.3 + 0.4 * hash12(cell + 7.7), 0.3 + 0.4 * hash12(cell + 13.1));
  float a = hash12(cell + 29.0) * 6.2832;
  vec2 d = (f - c) * 17.0;
  float ca = cos(a);
  float sa = sin(a);
  d = vec2(ca * d.x + sa * d.y, -sa * d.x + ca * d.y);
  float len = 4.0 + 3.0 * hash12(cell + 3.3);
  float e = (d.x * d.x) / (len * len) + (d.y * d.y) / (len * len * 0.22);
  float m = 1.0 - smoothstep(0.75, 1.0, e);
  float vein = 1.0 - smoothstep(0.0, 0.8, abs(d.y));
  lc = uC[6] * (0.55 + 0.7 * hash12(cell + 55.5)) * vec3(1.0, 0.8 + 0.25 * hash12(cell + 9.1), 0.6 + 0.45 * hash12(cell + 19.9));
  lc *= 1.0 - 0.3 * vein * step(abs(d.x), len * 0.8);
  return m;
}

void groundGraveyard(vec2 w, out vec3 col, out float h, out vec3 glow) {
  float W = uField.x;
  float cx0 = W * 0.5;
  float seed = uSeed;
  // ---- all the noise, up front
  float patchN = fbm(w / 240.0 + seed * 1.9 + 9.3);
  float mid = n1(w / 170.0 + seed * 0.7);
  float mid2 = n2(w / 120.0 + 3.1);
  float fine = n3(w / 29.0 + seed);
  float fine2 = n3(w / 10.5 + 5.0);
  float edgeN = n2(w / 75.0 + seed * 2.3);
  float rootA = n2(w / 230.0 + seed * 1.3 + 0.37);
  float rootB = n1(w / 150.0 + seed * 0.6 + 6.1);
  float rootMask = n3(w / 420.0 + 2.2);
  float pudN = fbm(w / 400.0 + seed * 0.7 + 4.4);
  float leafN = n3(w / 280.0 + seed + 1.3);
  float wornN = n1(w / 110.0 + seed + 8.8);
  float sparkN = n3(w / 17.0 + 3.0);
  float crk = crack(w / 640.0 + seed, 1.0);
  float crk2 = crack(w / 260.0 + seed * 0.4 + 5.0, 1.0);
  float runeN = n1(w / 300.0 + 6.3);
  float topN = n3(w / 350.0 + 7.0);

  // ---- the yard: dark soil, patches of night grass
  float gm = smoothstep(0.42, 0.6, patchN + (fine - 0.5) * 0.3);
  vec3 soil = mix(uC[0], uC[1], smoothstep(0.35, 0.7, mid2)) * (0.82 + 0.36 * fine);
  float blades = hash12(floor(w / 3.0));
  vec3 grass = mix(uC[2], uC[3], smoothstep(0.3, 0.75, mid) * 0.75 + 0.25 * fine2) * (0.8 + 0.34 * blades);
  col = mix(soil, grass, gm);
  h = 0.5 + 0.08 * fine + 0.05 * gm * blades - 0.03 * (1.0 - gm);
  glow = vec3(0.0);
  float outside = max(-w.x, w.x - W);
  float wild = smoothstep(uP[3].w, uP[3].w + 240.0, outside);
  col = mix(col, grass * vec3(0.55, 0.65, 0.6), wild * 0.8);

  // ---- grave plots in rows toward the sides: a kerb of stones around a mound of grass, fresh earth, a sunken patch or a slab
  float halfBase = uP[0].x * sqrt(W / 720.0);
  float lane = abs(w.x - cx0) - (halfBase + uP[0].w);
  float laneP = max(lane, 0.0);
  float pitchX = uP[1].x;
  float pitchY = uP[1].y;
  float pw = uP[1].z * 0.5;
  float pl = uP[1].w * 0.5;
  float kw = uP[2].w;
  float colI = floor(laneP / pitchX);
  float yy = w.y + mod(colI, 2.0) * pitchY * 0.5;
  float rowI = floor(yy / pitchY);
  vec2 pc = vec2(laneP - colI * pitchX - pitchX * 0.5, yy - rowI * pitchY - pitchY * 0.5);
  vec2 sq = abs(pc) - vec2(pw, pl) + vec2(12.0);
  float sd = length(max(sq, 0.0)) + min(max(sq.x, sq.y), 0.0) - 12.0 + (fine2 - 0.5) * 4.0;
  float pid = hash12(vec2(colI + step(cx0, w.x) * 37.0, rowI) + seed * 5.0);
  float plotOn = step(0.0, lane) * (1.0 - wild);
  float ins = (1.0 - smoothstep(-0.8, 0.8, sd)) * plotOn;
  float kerbM = ins * smoothstep(-kw - 0.8, -kw + 0.8, sd) * step(0.28, pid);
  float mound = ins * (1.0 - kerbM);
  float dome = 1.0 - clamp(length(pc / vec2(pw, pl)), 0.0, 1.0);
  float ptype = fract(pid * 11.3);
  vec3 mcol;
  float mh;
  if (ptype < 0.34) {
    mcol = grass * 1.08;
    mh = 0.58 + 0.16 * dome;
  } else if (ptype < 0.62) {
    mcol = mix(uC[1], uC[0], fine2) * (0.9 + 0.3 * fine2);
    mh = 0.6 + 0.15 * dome + 0.07 * fine2;
  } else if (ptype < 0.84) {
    mcol = soil * 0.78;
    mh = 0.43 + 0.04 * fine;
  } else {
    float seam = 1.0 - smoothstep(0.0, 1.6, abs(pc.x));
    mcol = uC[5] * 0.5 * (0.85 + 0.3 * fine) * (1.0 - 0.4 * seam);
    mh = 0.68 - 0.05 * seam;
  }
  float along = (abs(pc.x) - pw) > (abs(pc.y) - pl) ? pc.y : pc.x;
  float jt = along / 34.0 + pid * 3.0;
  float jf = fract(jt);
  float joint = 1.0 - smoothstep(0.0, 0.07, min(jf, 1.0 - jf));
  float stoneH = hash12(vec2(floor(jt), pid * 7.0));
  float kdome = 1.0 - clamp(abs(sd + kw * 0.5) / (kw * 0.5), 0.0, 1.0);
  vec3 kcol = uC[5] * (0.62 + 0.3 * fine + 0.3 * stoneH) * (1.0 - 0.45 * joint);
  kcol = mix(kcol, uC[3] * 0.9, 0.45 * smoothstep(0.45, 0.75, mid2));
  col = mix(col, mcol, mound);
  h = mix(h, mh, mound);
  col = mix(col, kcol, kerbM);
  h = mix(h, 0.7 + 0.14 * kdome - 0.06 * joint, kerbM);

  // ---- roots snaking over the yard
  float rr = 1.0 - smoothstep(0.01, 0.028, abs(rootA - 0.5));
  float rr2 = 1.0 - smoothstep(0.01, 0.024, abs(rootB - 0.5));
  float rootM = max(rr, rr2 * 0.8) * smoothstep(0.35, 0.62, rootMask) * uP[2].z * (1.0 - ins);
  col = mix(col, uC[0] * 0.5, rootM * 0.85);
  h += rootM * 0.1;

  // ---- the worn cobbled path
  float cx = cx0 + uP[0].y * (0.6 * sin(w.y * 0.0052 + seed * 2.0) + 0.4 * sin(w.y * 0.0131 + seed * 5.0));
  float hw = halfBase + uP[0].z * (1.0 - smoothstep(40.0, 380.0, w.y)) + (edgeN - 0.5) * 40.0 + (fine - 0.5) * 8.0;
  float pd = abs(w.x - cx) - hw;
  float onPath = 1.0 - smoothstep(-4.0, 3.0, pd);
  vec2 cb = gyCobble(w / 27.0);
  float cdome = smoothstep(0.0, 0.34, cb.x);
  float gone = smoothstep(0.62, 0.74, wornN + (fine2 - 0.5) * 0.12) * smoothstep(-95.0, -12.0, pd);
  vec3 stone = uC[4] * (0.8 + 0.34 * cb.y) * (0.92 + 0.16 * cdome) * (0.9 + 0.2 * fine2);
  vec3 mortar = mix(uC[0] * 0.85, uC[2] * 0.8, smoothstep(0.4, 0.7, mid));
  vec3 pcol = mix(mortar, stone, cdome);
  pcol = mix(pcol, mix(uC[1] * 0.8, uC[0], fine), gone * 0.9);
  col *= 1.0 - 0.25 * (1.0 - smoothstep(0.0, 10.0, pd)) * step(0.0, pd);
  col = mix(col, pcol, onPath);
  h = mix(h, mix(0.3 + 0.36 * cdome, 0.45, gone), onPath);

  // ---- dead leaves, thicker off the path
  float dens = uP[2].y * 0.45 * (0.25 + 0.95 * smoothstep(0.3, 0.7, leafN)) * (1.0 - 0.55 * onPath);
  vec3 lc;
  float lm = gyLeaf(w, dens, lc);
  col = mix(col, lc, lm * (1.0 - wild * 0.6));
  h += lm * 0.05;

  // ---- puddles: dark water with a cold sheen and a few sparkles
  float pthr = mix(0.72, 0.52, uP[2].x);
  float pf = pudN + (fine - 0.5) * 0.03;
  float pm = smoothstep(pthr, pthr + 0.018, pf) * (1.0 - kerbM);
  float pring = smoothstep(pthr - 0.04, pthr, pf) * (1.0 - pm) * (1.0 - kerbM);
  col = mix(col, col * 0.55, pring * 0.8);
  vec3 water = (uC[0] * 0.22 + uC[7] * 0.025) * (0.8 + 0.5 * mid2);
  col = mix(col, water, pm * 0.92);
  h = mix(h, 0.36, pm);
  vec2 spc = fract(w / 5.0 + 11.0) - 0.5;
  float spark = step(0.965, hash12(floor(w / 5.0 + 11.0))) * smoothstep(0.4, 0.7, sparkN) * (1.0 - smoothstep(0.1, 0.35, length(spc)));
  glow += uC[7] * pm * (0.03 + 0.07 * smoothstep(0.45, 0.8, sparkN) + 0.4 * spark);

  // ---- the summoning sigil under the gate, and rune cracks along the top edge
  vec2 sv = w - vec2(cx0, uP[3].x);
  float sr = length(sv);
  float R = uP[3].y;
  float u16 = (atan(sv.y, sv.x) + 3.14159265) / 6.2831853 * 16.0;
  float sec = floor(u16);
  float gh = hash12(vec2(sec, 3.0 + seed));
  vec2 gl2 = vec2((fract(u16) - 0.5) * 6.2831853 * R * 0.91 / 16.0, sr - R * 0.91);
  float band = step(R * 0.84, sr) * step(sr, R * 0.99);
  float yb = (gh - 0.5) * 0.08 * R;
  float glyph = gyLine(gl2.x, 2.6) * step(abs(gl2.y), 0.065 * R);
  glyph = max(glyph, gyLine(gl2.y - yb, 2.6) * step(abs(gl2.x), 13.0));
  glyph = max(glyph, gyLine((gl2.x - gl2.y * 0.7) * 0.82, 2.6) * step(abs(gl2.y), 0.065 * R) * step(0.5, fract(gh * 7.0)));
  glyph = max(glyph, gyLine(length(gl2) - 7.0, 2.2) * step(0.72, fract(gh * 13.0)));
  float sigil = glyph * band;
  sigil = max(sigil, gyLine(sr - R, 3.0));
  sigil = max(sigil, gyLine(sr - R * 0.82, 2.2));
  sigil = max(sigil, gyLine(sr - R * 1.07, 1.4) * step(0.3, hash12(vec2(sec, 9.0))));
  sigil = max(sigil, gyLine(sr - R * 0.12, 2.0));
  for (int k = 0; k < 6; k++) {
    float a = 0.5236 + float(k) * 1.0472;
    float d = dot(sv, vec2(cos(a), sin(a))) - R * 0.41;
    sigil = max(sigil, gyLine(d, 2.0) * step(sr, R * 0.82));
  }
  sigil *= smoothstep(0.2, 0.5, runeN + 0.35 * fine) * step(sr, R * 1.1);
  float radial = (1.0 - smoothstep(0.012, 0.03, crk)) * (1.0 - smoothstep(R * 0.35, R * 1.25, sr)) * smoothstep(0.3, 0.6, runeN);
  float topCrack = (1.0 - smoothstep(0.012, 0.03, crk2)) * (1.0 - smoothstep(60.0, 320.0, w.y)) * smoothstep(0.45, 0.65, topN);
  float runes = max(sigil, max(radial * 0.7, topCrack * 0.5));
  col *= 1.0 - 0.45 * runes;
  h -= 0.05 * runes;
  glow += uC[7] * (sigil * 0.9 + radial * 0.6 + topCrack * 0.45 + 0.05 * (1.0 - smoothstep(R * 0.5, R * 1.05, sr))) * uP[3].z;
}
`;
