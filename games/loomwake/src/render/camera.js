// Camera: smooth follow with a lead toward the aim, kick (directional
// impulse), trauma shake (squared falloff), zoom per scene, soft clamp to the
// chamber. All render-side; listens to bus 'shake' and big events.
//
// Exports:
//   createCamera(G) -> cam
//     cam.x, cam.y (world centre), cam.zoom, cam.zoomTarget, cam.shake (0..1 trauma), cam.sx, cam.sy (shake offset, world px)
//     cam.update(G, dt), cam.addShake(a), cam.kick(dx, dy, power), cam.snap(x, y), cam.punch(z) (brief zoom-in)
import { clamp, lerp } from '../core/math.js';
import { BOSSES } from '../content/bosses.js';

// painted extent above the feet (measured from the boss painters: crowns, staffs, helms), used for framing;
// content/bosses.js may give frameHeight to override
const HUB_ZOOM = 0.85, HUB_LOOK = 150;   // hub camera (world helper's measurement): zoom, and the target sits this far above Iri
const FRAME_H = { veyl: 345, morrow: 400, aurum: 500, sable: 240 };
function bossHeight(B) { const d = BOSSES[B.kind] || BOSSES[B.id]; return d?.frameHeight || FRAME_H[B.kind] || (B.height || d?.height || (B.r || 40) * 3.5) * 1.12 + 16; }

export function createCamera(G) {
  const cam = { x: 0, y: 0, zoom: 1, zoomTarget: 1, shake: 0, sx: 0, sy: 0, kx: 0, ky: 0, punchZ: 0, t: 0, shakeMul: 1 };
  cam.addShake = (a) => { cam.shake = Math.min(1, cam.shake + a); };
  cam.kick = (dx, dy, p) => { const l = Math.hypot(dx, dy) || 1; cam.kx += (dx / l) * p; cam.ky += (dy / l) * p; };
  cam.snap = (x, y) => { cam.x = x; cam.y = y; cam.kx = cam.ky = 0; };
  cam.punch = (z) => { cam.punchZ = Math.max(cam.punchZ, z); };
  G.bus.on('shake', ({ a, x, y }) => { cam.addShake(a); const h = G.hero; if (h && x != null) cam.kick(x - h.x, y - h.y, a * 14); });
  G.bus.on('heroHurt', ({ x, y }) => cam.punch(0.02));
  G.bus.on('call', () => { cam.addShake(0.5); cam.punch(0.06); });
  G.bus.on('armorBreak', () => { cam.addShake(0.35); cam.punch(0.03); });
  G.bus.on('bossIntro', () => cam.punch(0.05));
  G.bus.on('kill', ({ e }) => { if (e.boss) { cam.addShake(0.8); cam.punch(0.08); } });
  // Boss framing: the box around Iri (with a little room) and the whole boss, feet to crown (content height),
  // must fit in the band between the boss bar (top) and the HUD (bottom). Zoom out as far as needed (to 0.6),
  // never in past 1.04. Returns the world point to centre on and the zoom.
  cam.viewW = 1280; cam.viewH = 720; cam.base = 1;   // css px, css px per world unit at zoom 1 (set by the renderer)
  const TOP = 120, BOT = 128, SIDE = 70;
  function frameBoss(G, B, h) {
    const H = bossHeight(B);
    const x0 = Math.min(h.x - 60, B.x - (B.r || 40) - 30), x1 = Math.max(h.x + 60, B.x + (B.r || 40) + 30);
    const y0 = Math.min(h.y - 110, B.y - (B.z || 0) - H - 24), y1 = Math.max(h.y + 34, B.y + (B.r || 40) * 0.5 + 20);
    const availW = Math.max(200, cam.viewW - SIDE * 2), availH = Math.max(200, cam.viewH - TOP - BOT);
    const zy = availH / ((y1 - y0) * cam.base);
    const zoom = clamp(Math.min(1.04, availW / ((x1 - x0) * cam.base), zy), 0.6, 1.04);
    const k = cam.base * zoom;
    // too tall to fit even at the widest zoom: the boss's crown stays just under the boss bar, the rest
    // of the band runs down toward Iri
    const y = zy < 0.6 ? y0 + (cam.viewH / 2 - TOP) / k : (y0 + y1) / 2 - ((TOP - BOT) / 2) / k;
    return { zoom, x: (x0 + x1) / 2, y };
  }
  // Conversations: Iri and every speaker of the conversation who stands in the scene (hub NPCs) fit in the
  // band above the dialogue box (about 260 css px tall), so nobody is hidden behind it.
  const TT = 90, TB = 290, TS = 110;
  const low = (s) => String(s || '').toLowerCase();
  function frameTalk(G, h, zMax) {
    const d = G.dialogue;
    if (!d) return null;
    const who = new Set([low(d.speaker)]);
    if (d.queue) for (const l of d.queue) who.add(low(l.speaker));
    let x0 = h.x - 50, x1 = h.x + 50, y0 = h.y - 130, y1 = h.y + 24;
    for (const n of G.npcs || []) {
      if (n.present === false || !(who.has(low(n.id)) || who.has(low(n.name)))) continue;
      if (Math.hypot(n.x - h.x, n.y - h.y) > 900) continue;   // a far speaker is a voice, not a framing target
      x0 = Math.min(x0, n.x - 60); x1 = Math.max(x1, n.x + 60); y0 = Math.min(y0, n.y - 170); y1 = Math.max(y1, n.y + 24);
    }
    const availW = Math.max(200, cam.viewW - TS * 2), availH = Math.max(160, cam.viewH - TT - TB);
    const zoom = clamp(Math.min(zMax, availW / ((x1 - x0) * cam.base), availH / ((y1 - y0) * cam.base)), 0.6, zMax);
    const k = cam.base * zoom;
    return { zoom, x: (x0 + x1) / 2, y: (y0 + y1) / 2 - (TT + availH / 2 - cam.viewH / 2) / k };
  }
  cam.update = (G, dt) => {
    const c = G.cfg.camera, h = G.hero;
    cam.t += dt;
    const B = G.boss && !G.boss.gone ? G.boss : null;
    let fit = null;
    if (B && h && !G.ui?.camZoom && !G.ui?.camFocus) fit = frameBoss(G, B, h);
    // the hub: wider (0.85) with the view looking ahead of Iri (she walks up toward the Dreamdoor)
    const hubish = G.scene === 'hub' || (G.scene === 'dialogue' && G.dialogue?.back === 'hub');
    const baseZoom = hubish ? HUB_ZOOM : c.zoom;
    if (!fit && h && G.scene === 'dialogue' && !G.ui?.camZoom && !G.ui?.camFocus) fit = frameTalk(G, h, baseZoom);
    const sceneZoom = G.ui?.camZoom ?? (fit ? fit.zoom : baseZoom);
    cam.zoomTarget = sceneZoom;
    cam.zoom = lerp(cam.zoom, cam.zoomTarget + cam.punchZ, 1 - Math.exp(-dt * 6));
    cam.punchZ = Math.max(0, cam.punchZ - dt * 0.4);
    if (h) {
      let lead = c.lead;
      const ad = G.input?.aimDir;
      const lx = ad ? ad.x * lead : 0, ly = ad ? ad.y * lead * 0.6 : 0;
      let tx = h.x + lx, ty = h.y - (hubish ? HUB_LOOK : 30) + ly;
      if (G.ui?.camFocus) { tx = lerp(tx, G.ui.camFocus.x, 0.5); ty = lerp(ty, G.ui.camFocus.y, 0.5); }
      else if (fit) { tx = lerp(tx, fit.x, 0.85); ty = lerp(ty, fit.y, 0.85); }
      const k = 1 - Math.exp(-dt * c.follow);
      cam.x = lerp(cam.x, tx, k); cam.y = lerp(cam.y, ty, k);
      // soft clamp: keep the chamber from sliding fully off screen
      const ch = G.chamber;
      if (ch && ch.shape && ch.shape.length > 2 && !fit) {
        if (!ch._cb || ch._cbS !== ch.shape) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of ch.shape) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } Object.defineProperty(ch, '_cb', { value: [x0, y0, x1, y1], enumerable: false, writable: true, configurable: true }); Object.defineProperty(ch, '_cbS', { value: ch.shape, enumerable: false, writable: true, configurable: true }); }
        const b = ch._cb, pad = c.leadPad;
        cam.x = clamp(cam.x, b[0] - pad, b[2] + pad); cam.y = clamp(cam.y, b[1] - pad - 40, b[3] + pad);
      }
    }
    // kick spring
    const kf = Math.exp(-dt * c.kickDecay);
    cam.kx *= kf; cam.ky *= kf;
    cam.shake = Math.max(0, cam.shake - dt * 1.6);
    const sk = cam.shake * cam.shake * c.maxShake * cam.shakeMul;
    const t = cam.t;
    cam.sx = (Math.sin(t * 71) + Math.sin(t * 37)) * 0.5 * sk + cam.kx;
    cam.sy = (Math.cos(t * 63) + Math.sin(t * 29)) * 0.5 * sk + cam.ky;
  };
  return cam;
}
