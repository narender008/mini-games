// Chapter 3's ground, the hellscape: plates of cracked black basalt (a few of them obsidian), ash drifts, scattered bones, thin glowing
// lava cracks between the plates, and wide lava rivers: one across the top behind the gate and one down each side edge.
// The middle of the field stays calm (dark plates, dim cracks, little ash) so the horde and the red blood are the brightest things
// there; the edges and the top, where the rivers are, burn.
//
// uC (linear rgb): 0 basalt dark, 1 basalt light, 2 ash, 3 bone, 4 crust / obsidian (near black), 5 lava orange (the glow colour),
// 6 lava hot (yellow, the brightest cores), 7 scorch (rock tinted by the heat).
// uP[0]: top river centre y, top river half width, top river's southernmost bank y, how far the side rivers bulge inward at most.
// uP[1]: plate size, side river width, side river's inner edge at rest (x from the field edge), crack glow gain.
// uP[2]: bone rate (0..1 of the 118 u cells), ash amount, heat reach (u), lava glow gain.
// uP[3]: calm zone half-width from the side edges, calm zone top y, plate brightness gain, ember specks gain.
// Glow is HDR: cracks 0.5 .. 3, lava 1.5 .. 4 (the bake stores glow / 4, so nothing is brighter than 4).
export const HELL = `
vec2 hlRand2(vec2 p) {
  return vec2(hash12(p), hash12(p + vec2(37.1, 91.7)));
}

// Voronoi plates. Returns the distance (in cells) from p to the nearest cell border; cid = the nearest cell, pairH = a hash that is
// the same on both sides of the border (picks which borders glow).
float hlVoro(vec2 p, out vec2 cid, out float pairH) {
  vec2 ip = floor(p);
  vec2 fp = fract(p);
  vec2 pts[9];
  float best = 9.0;
  int bi = 4;
  for (int k = 0; k < 9; k++) {
    vec2 g = vec2(float(k - (k / 3) * 3) - 1.0, float(k / 3) - 1.0);
    pts[k] = g + 0.12 + 0.76 * hlRand2(ip + g);
    vec2 d = pts[k] - fp;
    float dd = dot(d, d);
    if (dd < best) { best = dd; bi = k; }
  }
  vec2 pn = pts[bi];
  float edge = 9.0;
  int bj = bi == 0 ? 1 : 0;
  for (int k = 0; k < 9; k++) {
    if (k == bi) continue;
    vec2 dir = pts[k] - pn;
    float dist = dot(0.5 * (pn + pts[k]) - fp, dir / max(length(dir), 0.0001));
    if (dist < edge) { edge = dist; bj = k; }
  }
  cid = ip + vec2(float(bi - (bi / 3) * 3) - 1.0, float(bi / 3) - 1.0);
  vec2 nid = ip + vec2(float(bj - (bj / 3) * 3) - 1.0, float(bj / 3) - 1.0);
  pairH = hash12(cid + nid);
  return max(edge, 0.0);
}

// One bone, drawn in a frame d centred on it (units): 0..1 coverage; dark = 1 where a skull's eye holes are.
float hlBone(vec2 d, float kind, float ang, out float dark) {
  dark = 0.0;
  vec2 dir = vec2(cos(ang), sin(ang));
  vec2 nrm = vec2(-dir.y, dir.x);
  float sd = 1e3;
  if (kind < 0.5) {
    // femur: a shaft with a pair of knobs at each end
    float t = clamp(dot(d, dir), -16.0, 16.0);
    sd = length(d - dir * t) - 2.4;
    for (int i = 0; i < 4; i++) {
      float sx = i < 2 ? -1.0 : 1.0;
      float sy = (i - (i / 2) * 2) == 0 ? -1.0 : 1.0;
      sd = min(sd, length(d - dir * (16.5 * sx) - nrm * (2.6 * sy)) - 3.3);
    }
  } else if (kind < 0.78) {
    // skull: round cranium, a jaw below it, two dark eye holes
    vec2 s = vec2(dot(d, nrm), dot(d, dir));
    float cr = length(s) - 8.0;
    vec2 jq = abs(s - vec2(0.0, -8.0)) - vec2(4.8, 3.2);
    float jaw = length(max(jq, 0.0)) + min(max(jq.x, jq.y), 0.0);
    sd = min(cr, jaw);
    float eyes = min(length(s - vec2(3.3, -0.4)), length(s - vec2(-3.3, -0.4))) - 2.2;
    dark = 1.0 - smoothstep(-0.3, 0.7, eyes);
  } else if (kind < 0.9) {
    // a chain of vertebrae
    for (int i = 0; i < 5; i++) {
      sd = min(sd, length(d - dir * (float(i) - 2.0) * 7.0) - 3.3);
    }
  } else {
    // two ribs: arcs of a circle
    float r = length(d);
    float side = -dot(d, dir);
    float a1 = max(abs(r - 12.0) - 1.9, side);
    float a2 = max(abs(r - 8.5) - 1.8, side);
    sd = min(a1, a2);
  }
  return 1.0 - smoothstep(-0.4, 0.8, sd);
}

void groundHell(vec2 w, out vec3 col, out float h, out vec3 glow) {
  float seed = uSeed;
  float fw = uField.x;
  vec2 q = w / 512.0 + seed;

  // ---- noise reads, all unconditional (texture() derivatives must not sit inside branches)
  float fine = n3(w / 37.0 + seed);
  float fine2 = n3(w / 13.0 + seed * 2.0);
  float mott = n2(w / 250.0 + seed);
  float ashN = fbm(vec2(w.x / 420.0, w.y / 260.0) + seed * 1.3 + 0.35);
  float shore = (n2(w / 260.0 + seed + 0.2) - 0.5) * 24.0 + (n3(w / 41.0 + seed + 0.4) - 0.5) * 10.0;
  vec2 warp = vec2(n1(q * 1.7), n2(q * 1.7 + 0.5)) - 0.5;
  float rx = w.x / 1100.0 + seed;
  float topW = n2(vec2(rx, 0.77));
  float topN = n1(vec2(rx, 0.31));
  float hair = crack(w / 600.0 + seed, 1.0);
  float runN = n1(w / 140.0 + seed * 0.7);
  float ashRip = n2(w / 90.0 + seed + 0.6);

  // ---- the rivers: positive inside lava, in world units
  float topHalf = uP[0].y * (0.8 + 0.4 * topW);
  float topC = uP[0].x + 36.0 * sin(w.x / 250.0 + seed * 3.1) + 18.0 * sin(w.x / 97.0 + 1.7 + seed) + 40.0 * (topN - 0.5);
  topC = min(topC, uP[0].z - topHalf);
  float dTop = topHalf - abs(w.y - topC);
  // the side rivers hug the screen edges; they bulge inward in the upper field and retreat by the hero's band (y 960..1226)
  float bandFade = 1.0 - smoothstep(760.0, 940.0, w.y);
  float bulgeL = uP[0].w * (0.5 + 0.5 * sin(w.y / 210.0 + seed * 1.7)) * (0.65 + 0.35 * sin(w.y / 83.0 + 2.0)) * bandFade;
  float bulgeR = uP[0].w * (0.5 + 0.5 * sin(w.y / 190.0 + 1.9 + seed * 2.3)) * (0.65 + 0.35 * sin(w.y / 71.0 + 0.6)) * bandFade;
  float inL = uP[1].z + bulgeL - w.x;
  float inR = uP[1].z + bulgeR - (fw - w.x);
  float dL = min(inL, uP[1].y - inL);
  float dR = min(inR, uP[1].y - inR);
  float lavaD = max(dTop, max(dL, dR)) + shore;
  float outside = max(-lavaD, 0.0);
  float heat = exp(-outside / uP[2].z);
  float inLava = smoothstep(-2.0, 2.0, lavaD);
  float core = smoothstep(2.0, 60.0, lavaD);
  // coordinates along and across the river that is nearest (the flow runs along the first)
  bool topWins = dTop >= max(dL, dR);
  vec2 fl = topWins ? vec2(w.x, w.y - topC) : vec2(w.y, dL > dR ? w.x : fw - w.x);

  // ---- calm in the middle of the field, life at the edges and the top
  float dxe = min(w.x, fw - w.x);
  float calm = smoothstep(uP[3].x * 0.2, uP[3].x, dxe) * smoothstep(uP[3].y * 0.3, uP[3].y, w.y);

  // ---- basalt plates
  float ps = uP[1].x;
  vec2 cid;
  float pairH;
  float eU = hlVoro(w / ps + warp * 0.28 + seed * 7.3, cid, pairH) * ps;
  float rid = hash12(cid + seed);
  float rid2 = hash12(cid + 17.3);
  vec3 plate = mix(uC[0], uC[1], smoothstep(0.15, 0.95, rid) * 0.85 + 0.15 * mott);
  plate *= 0.86 + 0.28 * rid2;
  float obs = step(0.88, hash12(cid * 1.3 + 5.7));
  float sheen = pow(0.5 + 0.5 * sin(dot(w, vec2(0.62, 0.42)) / 45.0 + rid * 17.0), 6.0) * 0.7;
  plate = mix(plate, uC[4] * (1.0 + 1.6 * sheen), obs);
  plate *= (0.88 + 0.24 * fine + (hash12(floor(w * 0.8)) - 0.5) * 0.1) * (0.9 + 0.2 * mott) * uP[3].z;
  float gap = 1.0 - smoothstep(0.6, 2.4, eU);
  vec3 bcol = plate * (0.6 + 0.4 * smoothstep(0.0, 12.0, eU));
  bcol = mix(bcol, uC[4] * 0.45, gap);
  float hair2 = 1.0 - smoothstep(0.012, 0.03, hair);
  bcol *= 1.0 - 0.45 * hair2;
  float bh = 0.34 + 0.26 * smoothstep(0.0, 7.0, eU) + 0.05 * (rid - 0.5) + 0.02 * fine - 0.1 * gap - 0.08 * hair2;

  // thin glowing cracks along some of the borders, broken up along their length; more and hotter near lava
  float prob = clamp(mix(0.85, 0.12, calm) + heat * 0.6, 0.0, 1.0);
  float on = step(pairH, prob);
  float run = smoothstep(0.30, 0.55, runN + (pairH - 0.5) * 0.4);
  float lineW = 1.3 + 1.4 * heat;
  float line = (1.0 - smoothstep(0.0, lineW, eU)) * on * run;
  vec3 crackGlow = mix(uC[5], uC[6], line * line * (0.45 + 0.55 * heat)) * (0.5 + 1.9 * heat) * mix(1.1, 0.5, calm) * uP[1].w * line;
  float warmth = on * run * (1.0 - smoothstep(0.0, 11.0, eU));
  bcol += uC[7] * warmth * 0.35;
  bcol = mix(bcol, uC[4] * 0.6, line * 0.6);

  // ash drifts: pale, soft, rippled; they bury the cracks
  float ash = smoothstep(0.56, 0.74, ashN) * uP[2].y * mix(1.0, 0.35, calm);
  vec3 ashCol = uC[2] * (0.82 + 0.3 * fine + 0.14 * (hash12(floor(w * 0.7) + 3.0) - 0.5));
  float ripple = 0.5 + 0.5 * sin((w.x * 0.5 + w.y * 0.9) / 9.0 + ashRip * 24.0);
  bcol = mix(bcol, ashCol * (1.0 - 0.1 * ripple), ash * 0.8);
  bh = mix(bh, 0.5 + 0.03 * fine + 0.02 * ripple, ash * 0.65);
  crackGlow *= 1.0 - ash * 0.9;

  // ---- lava: a hot flowing surface with floating crust plates, glowing gaps between them
  vec2 cuv = vec2(fl.x / 95.0, fl.y / 60.0) + seed * 3.0;
  vec2 ccid;
  float cpair;
  float ce = hlVoro(cuv, ccid, cpair) * 60.0;
  float crustRnd = hash12(ccid + 31.0);
  float crustCell = step(mix(0.32, 0.8, core), crustRnd);
  float crustM = crustCell * smoothstep(1.5, 5.0, ce);
  float streak = n2(vec2(fl.x / 340.0, fl.y / 55.0) + seed + 0.7);
  float streak2 = n1(vec2(fl.x / 700.0, fl.y / 120.0) + seed * 1.9);
  float hot = clamp(0.2 + 0.5 * core + 0.55 * (streak - 0.5) + 0.3 * (streak2 - 0.5), 0.0, 1.0);
  vec3 lavaGlow = mix(uC[5], uC[6], smoothstep(0.5, 1.0, hot)) * (1.5 + 2.3 * hot) * uP[2].w;
  vec3 lcol = mix(uC[5] * 0.12, uC[4] * (0.7 + 0.7 * fine), crustM);
  vec3 lglow = mix(lavaGlow, uC[5] * (0.2 + 0.4 * core) * uP[2].w, crustM);
  float lh = 0.2 + 0.03 * (streak - 0.5) + 0.12 * crustM + 0.04 * smoothstep(0.0, 6.0, ce) * crustCell;

  // ---- put rock and lava together; the banks glow and the nearby rock is scorched
  col = mix(bcol, lcol, inLava);
  h = mix(bh, lh, inLava);
  glow = mix(crackGlow, lglow, inLava);
  float bank = exp(-outside / 20.0) * (1.0 - inLava);
  glow += uC[5] * (bank * 0.9 + 0.16 * exp(-outside / 90.0) * (1.0 - inLava)) * uP[2].w;
  col += uC[7] * 0.15 * exp(-outside / 60.0) * (1.0 - inLava);
  float sp = step(0.9935, hash12(floor(w / 3.0) + seed)) * (1.0 - inLava);
  glow += uC[5] * sp * (0.7 + 1.5 * hash12(floor(w / 3.0) + 1.7)) * heat * heat * uP[3].w;

  // ---- bones, one per 118 u cell at most, away from the lava
  vec2 bc = floor(w / 118.0);
  vec2 bf = w - (bc + 0.5) * 118.0;
  float br = hash12(bc + seed * 5.0 + 11.0);
  if (br < uP[2].x * mix(1.0, 0.5, calm) && lavaD < -26.0) {
    vec2 off = (hlRand2(bc + 3.1) - 0.5) * 36.0;
    float kind = hash12(bc + 51.3);
    float ang = hash12(bc + 7.9) * 3.14159;
    float dk;
    float dk2;
    float cov = hlBone(bf - off, kind, ang, dk);
    float shd = hlBone(bf - off - vec2(2.0, 3.0), kind, ang, dk2);
    vec3 bone = uC[3] * (0.75 + 0.25 * fine2) * (1.0 - 0.5 * dk);
    col *= 1.0 - 0.45 * shd * (1.0 - cov);
    col = mix(col, bone, cov);
    h = mix(h, 0.7, cov);
    glow *= 1.0 - cov;
  }
  col = max(col, vec3(0.0));
  h = clamp(h, 0.0, 1.0);
}
`;
