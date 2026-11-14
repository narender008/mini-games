// Draws one frame of the garden from the rules' state (sim) and the view's
// own animation state (view): plants with squash and stretch, faces that
// blink and sing, every visitor, the sun and clouds, the watering cans, the
// buttons, the hint hand and the title.
import { TAU, clamp, glow, sparkle } from './draw.js';
import * as Art from './art.js';
import * as FX from './fx.js';
import { EMPTY, SEED, SPROUT, BUD, BLOOM, STEM } from './sim.js';

const easeBack = k => { k = clamp(k, 0, 1); const c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
const jelly = k => k >= 1 ? 1 : 1 + Math.sin(k * Math.PI * 3) * Math.exp(-k * 4) * 0.3;
const BPS = 104 / 60;

export function createView() {
  return { t: 0, cans: [], sunRot: 0, rbA: 0, rainA: 0, press: { seed: 0, can: 0 }, titleK: 0, partyK: 0 };
}

// draws a sprite in the current (unit) space
function put(g, s, x, y, k = 1, rot = 0) { g.save(); g.translate(x, y); if (rot) g.rotate(rot); g.scale(k, k); g.drawImage(s.c, s.x0, s.y0, s.w, s.h); g.restore(); }
function blinkMood(t, seed) { return ((t + seed * 1.37) % 3.9) < 0.13 ? 'blink' : null; }

// ---------- plants ----------
function stem(g, h, bend, w) {
  g.lineCap = 'round';
  g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(bend, -h * 0.5, 0, -h);
  g.strokeStyle = '#1f7a2a'; g.lineWidth = w + 5; g.stroke();
  g.strokeStyle = '#4bd458'; g.lineWidth = w; g.stroke();
  g.beginPath(); g.moveTo(-w * 0.22, -4); g.quadraticCurveTo(bend - w * 0.22, -h * 0.5, -w * 0.22, -h + 8);
  g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = w * 0.3; g.stroke();
}

function plant(g, sim, view, i) {
  const p = sim.patches[i], L = sim.L, ps = L.ps, t = view.t, at = L.patches[i];
  if (p.stage === EMPTY) return;
  const party = sim.phase === 'party' || sim.phase === 'title';
  let a = Math.sin(t * 1.4 + i * 1.7) * 0.035 + p.wiggle * Math.sin(t * 26) * 0.24;
  if (party && p.stage === BLOOM) a += Math.sin(t * Math.PI * BPS + i) * 0.16;
  const sy = jelly(p.t / 0.7) * (party ? 1 + Math.max(0, Math.sin(t * Math.PI * 2 * BPS + i)) * 0.06 : 1);
  const sx = 1 / Math.sqrt(sy);
  g.save();
  g.translate(at.x, at.y - 8 * ps);
  g.rotate(a); g.scale(ps * sx, ps * sy);
  let mood = p.mood !== 'happy' ? p.mood : (blinkMood(t, i) || 'happy');
  if (p.stage === BLOOM && mood === 'happy' && (party || sim.patches.filter(q => q.stage === BLOOM).length >= 2) && ((t * BPS + i * 0.5) % 2) < 0.55) mood = 'sing';
  if (p.stage === SEED) {
    g.restore();
    Art.blit(g, Art.hole(), at.x, at.y, 0.9);
    Art.blit(g, Art.seed(), at.x + Math.sin(t * 20) * p.wiggle * 6 * ps, at.y - 6 * ps, 0.9, 0.4 + p.wiggle * Math.sin(t * 24) * 0.4);
    return;
  }
  if (p.kind === 'carrot' && p.stage >= BUD) { g.restore(); carrot(g, sim, view, i, a, mood); return; }
  if (p.stage === SPROUT) {
    const k = easeBack(p.t / 0.45), h = 75 * k;
    stem(g, h, Math.sin(t * 1.1 + i) * 4, 12);
    put(g, Art.sproutHead(), 0, -h, k, Math.sin(t * 2 + i) * 0.08);
    put(g, Art.faceSprite(p.mood === 'happy' ? (blinkMood(t, i) || 'happy') : p.mood), 0, -h + 2, k * 24 / 40);
    g.restore();
    return;
  }
  const full = STEM[p.kind];
  let h;
  if (p.stage === BUD) h = 75 + (full * 0.82 - 75) * easeBack(p.t / 0.5);
  else h = full * (0.82 + 0.18 * easeBack(p.t / 0.45));
  const bend = Math.sin(t * 1.1 + i) * 7;
  stem(g, h, bend, 13);
  const lf = Art.leaf();
  g.save(); g.translate(1, -h * 0.32); g.rotate(-0.5 + Math.sin(t * 2.1 + i) * 0.08); g.drawImage(lf.c, lf.x0, lf.y0, lf.w, lf.h); g.restore();
  g.save(); g.translate(-1, -h * 0.52); g.rotate(Math.PI + 0.5 - Math.sin(t * 2.3 + i) * 0.08); g.drawImage(lf.c, lf.x0, lf.y0, lf.w, lf.h); g.restore();
  if (p.stage === BUD) {
    const k = easeBack(p.t / 0.5);
    const b = Art.bud(p.color); g.save(); g.translate(0, -h + 10); g.scale(k, k); g.rotate(Math.sin(t * 3 + i) * 0.05); g.drawImage(b.c, b.x0, b.y0, b.w, b.h); g.restore();
    // the bud peeks out with sleepy eyes
    const fs = Art.faceSprite(blinkMood(t, i) ? 'blink' : (p.mood === 'happy' ? 'sleep' : p.mood));
    g.save(); g.translate(0, -h - 16); const fk = 0.5 * k; g.scale(fk, fk); g.drawImage(fs.c, fs.x0, fs.y0, fs.w, fs.h); g.restore();
  } else {
    const k = easeBack(p.t / 0.5), hs = (0.25 + 0.75 * k);
    const hd = Art.head(p.kind, p.color), fa = Art.FACE_AT[p.kind];
    g.save(); g.translate(0, -h); g.rotate(Math.sin(t * 1.7 + i) * 0.06 + p.wiggle * Math.sin(t * 30) * 0.2); g.scale(hs, hs);
    if (p.stage === BLOOM && p.t < 0.6) glow(0, 0, 120 * (1 - p.t / 0.6) + 40, '#fff6a0', 0.9 * (1 - p.t / 0.6), g);
    if (p.kind === 'sunflower') g.rotate(t * 0.1);
    g.drawImage(hd.c, hd.x0, hd.y0, hd.w, hd.h);
    if (p.kind === 'sunflower') g.rotate(-t * 0.1);
    const fs = Art.faceSprite(mood), fk = fa[2] / 40;
    g.save(); g.translate(fa[0], fa[1]); g.scale(fk, fk); g.drawImage(fs.c, fs.x0, fs.y0, fs.w, fs.h); g.restore();
    if (sim.phase === 'party' && p.stage === BLOOM) { const hat = Art.partyHat(['#ff5fa8', '#3fa9ff', '#a55bff', '#ff8a1f', '#4bd458'][i % 5]); g.save(); g.translate(14, -(p.kind === 'sunflower' ? 62 : p.kind === 'tulip' ? 50 : 46)); g.rotate(0.25); g.scale(0.62, 0.62); g.drawImage(hat.c, hat.x0, hat.y0, hat.w, hat.h); g.restore(); }
    g.restore();
  }
  g.restore();
}

function carrot(g, sim, view, i, a, mood) {
  const p = sim.patches[i], L = sim.L, ps = L.ps, t = view.t, at = L.patches[i];
  const bloom = p.stage === BLOOM, k = easeBack(p.t / 0.5);
  const lift = p.hop > 0 ? Math.sin((1 - p.hop) * Math.PI) * 150 : 0;
  const spin = p.hop > 0 ? (1 - p.hop) * TAU : 0;
  const topY = at.y - (bloom ? 24 : 10) * ps - lift * ps;
  g.save();
  g.beginPath(); g.rect(0, 0, L.W, at.y + 6 * ps); g.clip();
  g.translate(at.x, topY); g.rotate(a + spin); g.scale(ps, ps);
  if (bloom) {
    const cs = Art.carrot(); g.drawImage(cs.c, cs.x0, cs.y0, cs.w, cs.h);
    const fs = Art.faceSprite(mood), fk = 26 / 40; g.save(); g.translate(0, 26); g.scale(fk, fk); g.drawImage(fs.c, fs.x0, fs.y0, fs.w, fs.h); g.restore();
    if (sim.phase === 'party') { const hat = Art.partyHat('#4bd458'); g.save(); g.translate(30, -14); g.rotate(0.4); g.scale(0.5, 0.5); g.drawImage(hat.c, hat.x0, hat.y0, hat.w, hat.h); g.restore(); }
  }
  const top = Art.carrotTop(), tk = bloom ? 1 : 0.65 * k;
  g.save(); g.scale(tk, tk * (1 + Math.sin(t * 3 + i) * 0.04)); g.drawImage(top.c, top.x0, top.y0, top.w, top.h); g.restore();
  g.restore();
}

// ---------- visitors ----------
function butterfly(g, c, t, ps) {
  const fly = c.s !== 'rest', flap = fly ? Math.abs(Math.sin(t * 13 + c.id)) : 0.55 + Math.sin(t * 3 + c.id) * 0.35;
  const cols = [['#a55bff', '#ff5fa8'], ['#ffd21f', '#ff8a1f'], ['#3fa9ff', '#a55bff'], ['#ff5fa8', '#ffd21f'], ['#4bd458', '#3fa9ff']][c.id % 5];
  const w = Art.wing(cols[0], cols[1]), b = Art.bflyBody(), s = 0.68 * ps;
  g.save(); g.translate(c.x, c.y); g.rotate(fly ? Math.sin(t * 3 + c.id) * 0.15 + c.dir * 0.1 : 0); g.scale(s, s);
  for (const side of [-1, 1]) { g.save(); g.scale(side * (0.2 + 0.8 * flap), 1); g.drawImage(w.c, w.x0, w.y0, w.w, w.h); g.restore(); }
  g.drawImage(b.c, b.x0, b.y0, b.w, b.h);
  g.restore();
}
function bee(g, c, t, ps) {
  const s = 0.5 * ps, wing = Art.beeWing(), body = Art.beeBody();
  g.save(); g.translate(c.x, c.y + Math.sin(t * 14 + c.id) * 2 * ps); g.scale(s * (c.dir > 0 ? -1 : 1), s); g.rotate(c.s === 'loop' ? Math.sin(t * 9) * 0.4 : 0);
  const f = Math.abs(Math.sin(t * 40 + c.id));
  for (const dx of [-10, 12]) { g.save(); g.translate(dx, -26); g.scale(1, 0.4 + 0.6 * f); g.drawImage(wing.c, wing.x0, wing.y0, wing.w, wing.h); g.restore(); }
  g.drawImage(body.c, body.x0, body.y0, body.w, body.h);
  g.restore();
}
function bird(g, c, t, ps) {
  const col = ['#3fa9ff', '#ff6f5f', '#ffb21f'][c.id % 3];
  const s = 0.55 * ps, b = Art.birdBody(col), w = Art.birdWing(col);
  const flying = c.s === 'flyin' || c.s === 'flyoff';
  const hop = c.hop > 0 ? Math.sin((c.hop / 0.35) * Math.PI) * 14 * ps : 0;
  g.save(); g.translate(c.x, c.y - 32 * s / 0.55 * 0.55 - hop); g.scale(s * (c.dir < 0 ? -1 : 1), s * (c.sing > 0 ? 1 + Math.sin(t * 30) * 0.05 : 1));
  if (!flying && c.s === 'perch') g.rotate(Math.sin(t * 2 + c.id) * 0.06);
  g.drawImage(b.c, b.x0, b.y0, b.w, b.h);
  const fl = flying ? Math.sin(t * 22 + c.id) : 0.15;
  g.save(); g.translate(-4, -2); g.rotate(fl * 0.9 - 0.2); g.drawImage(w.c, w.x0, w.y0, w.w, w.h); g.restore();
  g.restore();
}
function ladybug(g, c, t, ps) {
  const flying = c.s === 'flyup', sp = Art.ladybug(flying);
  const rot = flying ? Math.sin(t * 10) * 0.2 : (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2) + Math.sin(t * 12 + c.id) * 0.05;
  Art.blit(g, sp, c.x, c.y - 16 * ps, 0.55, rot);
}
function snail(g, c, t, ps) {
  const hide = c.s === 'hide', k = hide ? clamp(c.t / 0.25, 0, 1) * (c.t > 2.3 ? clamp((2.6 - c.t) / 0.3, 0, 1) : 1) : 0;
  const s = 0.5 * ps, flip = c.dir > 0 ? -1 : 1, body = Art.snailBody(), shell = Art.snailShell();
  g.save(); g.translate(c.x, c.y); g.scale(s * flip, s);
  g.save(); g.translate(10, 0); g.scale(1 - k * 0.75, 1 - k * 0.6 + Math.sin(t * 3) * 0.02); g.translate(-10, 0); g.drawImage(body.c, body.x0, body.y0, body.w, body.h); g.restore();
  g.save(); g.translate(5, -50 + k * 10); g.rotate(hide ? Math.sin(t * 18) * 0.12 * k : Math.sin(t * 2) * 0.03); g.drawImage(shell.c, shell.x0, shell.y0, shell.w, shell.h); g.restore();
  g.restore();
}
function bunny(g, c, t, ps, L) {
  if (c.s === 'hidden') return;
  const s = 0.6 * ps, sp = Art.bunny();
  let y = c.y, sy = 1;
  if (c.s === 'peek') { const k = c.t < 0.4 ? c.t / 0.4 : c.t > 1.9 ? 1 : 1; y = c.y + (1 - easeBack(k)) * 110 * ps; }
  if (c.s === 'hop' || c.s === 'home') { const dur = c.hops * 0.45, hk = ((c.t / dur) * c.hops) % 1; sy = hk < 0.15 ? 0.85 : hk > 0.85 ? 0.88 : 1.08; }
  if (c.s === 'jump') { const k = c.t / 0.8; sy = k < 0.1 ? 0.8 : 1.15 - k * 0.15; }
  g.save(); g.translate(c.x, y); g.scale(s / Math.sqrt(sy), s * sy); g.rotate(Math.sin(t * 2 + 1) * 0.03);
  g.drawImage(sp.c, sp.x0, sp.y0, sp.w, sp.h);
  g.restore();
}
function frog(g, c, t, ps) {
  const s = 0.55 * ps, sp = Art.frog();
  const jumping = c.s === 'jump', sy = jumping ? 1.15 : 1 + Math.sin(t * 2.4) * 0.02;
  g.save(); g.translate(c.x, c.y); g.scale(s / Math.sqrt(sy) * (c.dir < 0 ? -1 : 1), s * sy);
  g.drawImage(sp.c, sp.x0, sp.y0, sp.w, sp.h);
  if (c.croak > 0) { const k = Math.sin((c.croak / 0.5) * Math.PI); g.fillStyle = 'rgba(255,240,200,0.95)'; g.strokeStyle = '#8aa060'; g.lineWidth = 2; g.beginPath(); g.ellipse(0, -14, 16 * k + 2, 12 * k + 1, 0, 0, TAU); g.fill(); g.stroke(); g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.ellipse(-5 * k, -18 * k, 5 * k, 3 * k, -0.4, 0, TAU); g.fill(); }
  g.restore();
}
function worm(g, c, t, ps, L) {
  const at = L.patches[c.patch]; if (!at) return;
  let h = c.s === 'up' ? easeBack(c.t / 0.4) : 1 - clamp(c.t / 0.45, 0, 1);
  h *= 62 * ps;
  g.save(); g.beginPath(); g.rect(0, 0, L.W, at.y + 2 * ps); g.clip();
  const seg = Art.wormSeg(), hd = Art.wormHead();
  for (let k = 0; k < 4; k++) { const y = at.y + 10 * ps - h * (k / 4); const x = at.x + Math.sin(t * 6 - k * 0.9) * 7 * ps * (k / 4); Art.blit(g, seg, x, y, 0.8); }
  Art.blit(g, hd, at.x + Math.sin(t * 6 - 3.6) * 8 * ps, at.y + 6 * ps - h, 0.95, Math.sin(t * 5) * 0.2);
  g.restore();
}

// ---------- the frame ----------
export function draw(g, sim, view, fx, layers) {
  const L = sim.L, ps = L.ps, t = view.t;
  g.drawImage(layers.bg, 0, 0, L.W, L.H);
  // rainbow
  if (view.rbA > 0.01) { g.globalAlpha = view.rbA; g.drawImage(layers.rainbow, 0, 0, L.W, L.H); g.globalAlpha = 1; }
  // sun
  const sun = L.sun, sk = sun.r / 70 / ps, spin = sim.sunSpin;
  Art.blit(g, Art.sunRays(), sun.x, sun.y, sk * (1 + Math.sin(t * 2) * 0.03), view.sunRot);
  const sb = 1 + spin * 0.15 * Math.sin(t * 22);
  Art.blit(g, Art.sunBody(), sun.x, sun.y, sk * sb, 0, 1 / Math.sqrt(sb), 1);
  const sunMood = sim.sunMood !== 'happy' ? sim.sunMood : sim.phase === 'party' ? 'giggle' : sim.rainT > 0 ? 'wow' : (blinkMood(t, 9) || 'happy');
  Art.drawFace(g, sun.x, sun.y + 4 * sk * ps, 58 * sk, sunMood, Math.sin(t * 22) * spin * 0.15);
  if (sim.phase === 'party') Art.blit(g, Art.partyHat('#ff5fa8'), sun.x + 20 * sk * ps, sun.y - 62 * sk * ps, sk * 0.8, 0.3);
  // clouds
  sim.clouds.forEach((c, j) => {
    const raining = sim.rainT > 0;
    const sp = raining ? Art.rainCloud() : Art.cloud(c.face), k = c.s / ps / 50 * (raining ? 1.12 : 1);
    const y = c.y + Math.sin(t * 0.8 + c.bob) * 5 * ps;
    Art.blit(g, sp, c.x, y, k);
    if (c.face || raining) Art.drawFace(g, c.x, y + 6 * k * ps, 26 * k, raining ? (j === 0 ? 'wow' : 'happy') : (blinkMood(t, 4 + j) || 'happy'));
  });
  // apples on the trees
  sim.apples.forEach((a, j) => { if (!a.has) return; const s = L.appleSpots[j]; Art.blit(g, Art.apple(), s.x, s.y + Math.sin(t * 1.5 + j) * 1.5 * ps, (L.trees[s.tree].s / ps) * (1 - (a.grow || 0)) * 0.95 + 0.0001); });
  // things far away: balloon and birds
  for (const c of sim.creatures) if (c.kind === 'balloon') Art.blit(g, Art.balloon(), c.x, c.y, 0.62, Math.sin(t * 0.9) * 0.05);
  for (const c of sim.creatures) if (c.kind === 'bird') bird(g, c, t, ps);
  // wildflowers in the grass
  for (const w of sim.wild) Art.blit(g, Art.wildflower(w.col), w.x, w.y, w.s * jelly(w.t / 0.6) * Math.min(1, w.t * 6), Math.sin(t * 2 + w.x) * 0.15);
  // mushrooms
  L.mushrooms.forEach((m, j) => { const q = sim.mushroomSquash[j], sy = 1 + Math.sin((1 - q) * Math.PI * 4) * 0.28 * q; Art.blit(g, Art.mushroom(), m.x, m.y, m.s / ps * 0.75, 0, 1 / Math.sqrt(sy), sy); });
  // worms come up out of the soil before the plants are drawn
  for (const c of sim.creatures) if (c.kind === 'worm') worm(g, c, t, ps, L);
  // plants, back row first
  const order = sim.patches.map((_, i) => i).sort((a, b) => L.patches[a].y - L.patches[b].y);
  for (const i of order) plant(g, sim, view, i);
  // ground visitors
  for (const c of sim.creatures) {
    if (c.kind === 'ladybug') ladybug(g, c, t, ps);
    else if (c.kind === 'snail') snail(g, c, t, ps);
    else if (c.kind === 'frog') frog(g, c, t, ps);
    else if (c.kind === 'bunny') bunny(g, c, t, ps, L);
  }
  Art.blit(g, Art.bush(), L.bush.x, L.bush.y + 6 * ps, L.bush.r / ps / 62 * 0.9, Math.sin(t * 1.3) * 0.015);
  // flying things on top
  for (const c of sim.creatures) {
    if (c.kind === 'apple') Art.blit(g, Art.apple(), c.x, c.y - 10 * ps, L.trees[0].s / ps, c.spin || 0);
    else if (c.kind === 'butterfly') butterfly(g, c, t, ps);
    else if (c.kind === 'bee') bee(g, c, t, ps);
    else if (c.kind === 'bubble') { const k = Math.min(1, c.t * 3); Art.blit(g, Art.bubble(), c.x, c.y, c.r / ps / 48 * k, 0, 1 + Math.sin(t * 5 + c.id) * 0.05, 1 - Math.sin(t * 5 + c.id) * 0.05); }
  }
  // watering cans
  for (const cn of view.cans) drawCan(g, cn, ps);
  fx.ps = ps;
  // effects
  FX.draw(g, fx);
  // buttons
  if (view.titleK < 0.99 && !view.cover) for (const [name, b] of Object.entries(L.buttons)) {
    const active = name === 'seed' ? sim.patches.some(p => p.stage === EMPTY) : sim.patches.some(p => p.stage === SPROUT || p.stage === BUD);
    const pr = view.press[name], k = b.r / 54 / ps * (1 - pr * 0.15 + (active ? Math.sin(t * 4) * 0.03 : 0));
    if (active) glow(b.x, b.y, b.r * 1.9, '#fff38a', 0.55 + Math.sin(t * 4) * 0.2, g);
    Art.blit(g, Art.button(name, active), b.x, b.y, k, Math.sin(pr * 20) * pr * 0.2);
  }
  // hint hand
  if (sim.hint && sim.phase === 'play') {
    const h = sim.hint, bob = Math.abs(Math.sin(t * 4)) * 14 * ps;
    g.save(); g.globalAlpha = 0.6 + Math.sin(t * 4) * 0.3; g.strokeStyle = '#ffffff'; g.lineWidth = 6 * ps; g.beginPath(); g.arc(h.x, h.y, (40 + Math.sin(t * 4) * 8) * ps, 0, TAU); g.stroke(); g.restore();
    Art.blit(g, Art.hand(), h.x + 18 * ps, h.y + 14 * ps + bob, 0.9, -0.35);
  }
  // title: a big glossy play button with a sprout
  if (view.titleK > 0.01) {
    const k = view.titleK, px = L.W / 2, py = L.portrait ? L.H * 0.5 : L.H * 0.6, s = (L.portrait ? 1.35 : 1) * k, pulse = 1 + Math.sin(t * 3) * 0.04;
    glow(px, py, 260 * ps * s, '#fff6a0', 0.9 * k, g);
    g.save(); g.globalAlpha = 0.7 * k; g.strokeStyle = '#ffffff'; g.lineWidth = 7 * ps; g.beginPath(); g.arc(px, py, 128 * ps * s * pulse, 0, TAU); g.stroke();
    g.globalAlpha = 0.35 * k; g.lineWidth = 5 * ps; g.beginPath(); g.arc(px, py, (150 + (t * 40) % 40) * ps * s, 0, TAU); g.stroke(); g.restore();
    Art.blit(g, Art.playButton(), px, py, s * pulse);
    const sh = 92 * ps * s;
    g.save(); g.translate(px, py - sh); g.scale(ps * s, ps * s); stem(g, 40, 0, 12); g.restore();
    Art.blit(g, Art.sproutHead(), px, py - sh - 40 * ps * s, s * 0.95, Math.sin(t * 2) * 0.1);
    Art.drawFace(g, px, py - sh - 38 * ps * s, 23 * s, blinkMood(t, 2) || 'happy');
    for (let j = 0; j < 8; j++) { const a = j / 8 * TAU + t * 0.4; sparkle(px + Math.cos(a) * 190 * ps * s, py + Math.sin(a) * 170 * ps * s, (10 + 6 * Math.sin(t * 3 + j)) * ps, k, j % 2 ? '#ffffff' : '#fff38a', g); }
  }
}

function drawCan(g, cn, ps) {
  if (cn.t < 0) return;
  const k = cn.t / cn.dur, f = cn.flip || 1;
  const tx = cn.x - 150 * ps * f, ty = cn.y - 300 * ps;
  let x, y, rot;
  if (k < 0.22) { const e = easeBack(k / 0.22); x = tx - 260 * ps * f * (1 - e); y = ty - 220 * ps * (1 - e); rot = -0.2; }
  else if (k < 0.8) { x = tx; y = ty + Math.sin((k - 0.22) * 20) * 3 * ps; rot = Math.min(0.62, (k - 0.22) / 0.12 * 0.62); }
  else { const e = (k - 0.8) / 0.2; x = tx + 320 * ps * f * e * e; y = ty - 260 * ps * e; rot = 0.62 - e * 0.8; }
  cn.pos = { x, y, rot: rot * f, pouring: k > 0.32 && k < 0.8, f };
  Art.blit(g, Art.can(cn.col), x, y, 0.75, rot * f, f, 1);
}
// the spout tip of a can in screen space
export function spoutOf(cn, ps) {
  if (!cn.pos) return null;
  const { x, y, rot, f } = cn.pos, s = 0.75 * ps, sx = Art.SPOUT[0] * f, sy = Art.SPOUT[1];
  return { x: x + (Math.cos(rot) * sx - Math.sin(rot) * sy) * s, y: y + (Math.sin(rot) * sx + Math.cos(rot) * sy) * s };
}
