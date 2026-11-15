// Generates every texture at boot: character atlases painted from the vector drawers at the screen's
// density (src/view/density.ts), each with an emissive twin atlas `<key>_e` (glows drawn additively after
// the light map), and the soft effect textures (lights, glows, sparks, slash arcs) drawn with gradients.
import Phaser from 'phaser';
import { makeCanvas } from '../art/paint';
import { EMISSIVE_SCALE, type Painter, type SpriteSet } from '../art/sprite';
import { drawKeeper, KEEPER_ANIMS, KEEPER_FOOT_Y, KEEPER_H, KEEPER_W, type Dir, type KeeperAnim } from '../art/keeper';
import { bossSprites, bossThornSprites, bossWallSprites } from '../art/boss';
import { beetleSprites, colossusSprites, dummySprites, sentinelSprites, stalkerSprites, wardenSprites } from '../art/enemies';
import { chooseDensity, DENSITY } from './density';

export interface AtlasInfo {
  key: string; w: number; h: number; footY: number; anims: Record<string, number>;
  /** Texels per world unit of the body atlas and of the emissive atlas `${key}_e`. */
  d: number; de: number;
}

/** Lantern offsets per keeper frame (relative to the feet), for placing its light. */
export const keeperLantern = new Map<string, { x: number; y: number }>();
export const ATLAS: Record<string, AtlasInfo> = {};

let maxTex = 4096;

/**
 * Paint frames into one texture (several source pages if they do not fit one) at density d, plus the
 * emissive twin at density de. Every cell is clipped so a stray stroke never bleeds into its neighbour.
 */
function buildAtlas(scene: Phaser.Scene, key: string, w: number, h: number, frames: { name: string; paint: Painter }[], d: number, de: number) {
  const page = Math.min(4096, maxTex);
  const make = (dens: number, emissive: boolean) => {
    const cw = Math.ceil(w * dens) + 2, ch = Math.ceil(h * dens) + 2;
    const cols = Math.max(1, Math.floor(page / cw)), rowsPer = Math.max(1, Math.floor(page / ch));
    const perPage = cols * rowsPer;
    const pages: HTMLCanvasElement[] = [];
    const ctxs: CanvasRenderingContext2D[] = [];
    for (let p = 0; p * perPage < frames.length; p++) {
      const n = Math.min(perPage, frames.length - p * perPage);
      const c = makeCanvas(Math.min(n, cols) * cw, Math.ceil(n / cols) * ch);
      pages.push(c);
      ctxs.push(c.getContext('2d')!);
    }
    return { cw, ch, cols, perPage, pages, ctxs, dens, emissive };
  };
  const A = make(d, false), E = make(de, true);
  // A scratch context for the layer a frame does not use (the emissive pass ignores body strokes).
  const scratch = makeCanvas(4, 4).getContext('2d')!;
  frames.forEach((f, i) => {
    for (const L of [A, E]) {
      const pg = Math.floor(i / L.perPage), k = i % L.perPage;
      const x = (k % L.cols) * L.cw + 1, y = Math.floor(k / L.cols) * L.ch + 1;
      const g = L.ctxs[pg];
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.beginPath(); g.rect(x - 1, y - 1, L.cw, L.ch); g.clip();
      g.setTransform(L.dens, 0, 0, L.dens, x, y);
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.lineJoin = 'round'; g.lineCap = 'round';
      scratch.setTransform(L.dens, 0, 0, L.dens, 0, 0);
      try {
        if (L.emissive) f.paint(scratch, g); else f.paint(g, scratch);
      } finally { g.restore(); }
    }
  });
  for (const [L, k] of [[A, key], [E, `${key}_e`]] as const) {
    if (scene.textures.exists(k)) scene.textures.remove(k);
    const tex = scene.textures.create(k, L.pages as unknown as HTMLImageElement[], undefined as unknown as number, undefined as unknown as number)!;
    frames.forEach((f, i) => {
      const pg = Math.floor(i / L.perPage), j = i % L.perPage;
      tex.add(f.name, pg, (j % L.cols) * L.cw + 1, Math.floor(j / L.cols) * L.ch + 1, Math.ceil(w * L.dens), Math.ceil(h * L.dens));
    });
  }
}

function addSet(scene: Phaser.Scene, key: string, set: SpriteSet, maxD = 6) {
  const frames: { name: string; paint: Painter }[] = [];
  const anims: Record<string, number> = {};
  for (const [a, list] of Object.entries(set.anims)) {
    anims[a] = list.length;
    list.forEach((paint, i) => frames.push({ name: `${a}_${i}`, paint }));
  }
  const d = Math.min(maxD, DENSITY.sprite), de = Math.max(1.5, d * EMISSIVE_SCALE);
  buildAtlas(scene, key, set.w, set.h, frames, d, de);
  ATLAS[key] = { key, w: set.w, h: set.h, footY: set.footY, anims, d, de };
}

export function makeTextures(scene: Phaser.Scene, quality: string | null = null) {
  const r = scene.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  if (typeof r.getMaxTextureSize === 'function') maxTex = r.getMaxTextureSize() || 4096;
  chooseDensity(scene.scale.width, scene.scale.height, quality);
  // Keeper.
  const frames: { name: string; paint: Painter }[] = [];
  for (const dir of ['down', 'side', 'up'] as Dir[]) {
    for (const anim of Object.keys(KEEPER_ANIMS) as KeeperAnim[]) {
      for (let f = 0; f < KEEPER_ANIMS[anim]; f++) {
        const fr = drawKeeper(dir, anim, f);
        const name = `${dir}_${anim}_${f}`;
        frames.push({ name, paint: fr.paint });
        keeperLantern.set(name, { x: fr.lx, y: fr.ly });
      }
    }
  }
  const kd = DENSITY.sprite, kde = Math.max(1.5, kd * EMISSIVE_SCALE);
  buildAtlas(scene, 'keeper', KEEPER_W, KEEPER_H, frames, kd, kde);
  ATLAS.keeper = { key: 'keeper', w: KEEPER_W, h: KEEPER_H, footY: KEEPER_FOOT_Y, anims: KEEPER_ANIMS, d: kd, de: kde };

  addSet(scene, 'stalker', stalkerSprites());
  addSet(scene, 'stalkerElite', stalkerSprites(true));
  addSet(scene, 'sentinel', sentinelSprites());
  addSet(scene, 'charger', beetleSprites());
  addSet(scene, 'warden', wardenSprites());
  addSet(scene, 'colossus', colossusSprites());
  addSet(scene, 'colossusElite', colossusSprites(true));
  addSet(scene, 'dummy', dummySprites());
  // The Choked Star (final boss) and its arena pieces.
  addSet(scene, 'boss', bossSprites(), 5);
  addSet(scene, 'bossWall', bossWallSprites());
  addSet(scene, 'bossThorn', bossThornSprites());

  softTextures(scene);
}

function canvasTex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = makeCanvas(w, h);
  draw(c.getContext('2d')!);
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, c);
}

function softTextures(scene: Phaser.Scene) {
  // Light falloff (used in the light map and for additive glows).
  canvasTex(scene, 'light', 256, 256, (g) => {
    const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const a = Math.pow(1 - t, 2.2);
      r.addColorStop(t, `rgba(255,255,255,${a.toFixed(3)})`);
    }
    g.fillStyle = r;
    g.fillRect(0, 0, 256, 256);
  });
  canvasTex(scene, 'glow', 64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
  });
  // Particles: a soft-edged round dot (32 px = 1 world unit at scale 1/32) and a 3:1 spark with
  // rounded ends and a hot core, both smooth so they stay crisp when the camera zooms in.
  canvasTex(scene, 'px', 32, 32, (g) => {
    const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.6, 'rgba(255,255,255,0.95)'); r.addColorStop(0.85, 'rgba(255,255,255,0.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 32, 32);
  });
  canvasTex(scene, 'spark', 96, 32, (g) => {
    const lg = g.createLinearGradient(0, 0, 96, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.45, 'rgba(255,255,255,0.75)'); lg.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = lg;
    g.beginPath(); g.ellipse(48, 16, 47, 11, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath(); g.ellipse(70, 16, 22, 5, 0, 0, Math.PI * 2); g.fill();
  });
  // Contact shadow (ellipse, soft).
  canvasTex(scene, 'shadow', 64, 32, (g) => {
    const r = g.createRadialGradient(32, 16, 0, 32, 16, 32);
    r.addColorStop(0, 'rgba(0,0,0,0.75)');
    r.addColorStop(0.55, 'rgba(0,0,0,0.45)');
    r.addColorStop(1, 'rgba(0,0,0,0)');
    g.setTransform(1, 0, 0, 0.5, 0, 8);
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
  });
  // The Lantern Arc slash: a crescent, brightest at the leading edge, drawn facing right.
  for (const [key, R, thick] of [['slash', 128, 30], ['slashHeavy', 150, 40]] as const) {
    canvasTex(scene, key, R * 2, R * 2, (g) => {
      const cx = R, cy = R;
      const steps = 120;
      const span = 2.7;
      // Body: deep amber tail swelling into a gold head; outer edge sharp, inner edge soft.
      for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1); // 0 = tail, 1 = head
        const a0 = -span / 2 + t * span;
        const w = Math.pow(Math.sin(Math.min(1, t * 1.08) * Math.PI * 0.5 + 0.05), 1.6) * thick * (t > 0.92 ? (1 - t) / 0.08 : 1);
        for (let k = 0; k < 4; k++) {
          const f = k / 3; // 0 = outer layer, 1 = inner
          const ww = w * (1 - f * 0.55);
          g.beginPath();
          g.arc(cx, cy, R - 6 - ww / 2 - f * 3, a0, a0 + span / steps + 0.012);
          g.lineWidth = Math.max(0.5, ww);
          const alpha = (0.08 + 0.92 * Math.pow(t, 1.5)) * (0.22 + 0.2 * k);
          const gch = Math.round(120 + 110 * t + 20 * f), bch = Math.round(30 + 90 * t * t + 60 * f * t);
          g.strokeStyle = `rgba(255,${Math.min(255, gch)},${Math.min(255, bch)},${Math.min(1, alpha).toFixed(3)})`;
          g.stroke();
        }
      }
      // White-hot cutting edge along the outer rim of the head.
      for (let i = 0; i < 50; i++) {
        const t = 0.35 + (i / 49) * 0.6;
        const a0 = -span / 2 + t * span;
        g.beginPath();
        g.arc(cx, cy, R - 7, a0, a0 + span / 80);
        g.lineWidth = 2 + 4 * Math.sin((t - 0.35) / 0.6 * Math.PI);
        g.strokeStyle = `rgba(255,252,235,${(0.25 + 0.75 * Math.sin((t - 0.35) / 0.6 * Math.PI)).toFixed(3)})`;
        g.stroke();
      }
    });
  }
  // Ring (shockwaves, telegraph edges) and filled disc.
  canvasTex(scene, 'ring', 256, 256, (g) => {
    g.beginPath(); g.arc(128, 128, 120, 0, Math.PI * 2); g.lineWidth = 10; g.strokeStyle = '#fff'; g.stroke();
  });
  canvasTex(scene, 'ringSoft', 256, 256, (g) => {
    const r = g.createRadialGradient(128, 128, 90, 128, 128, 128);
    r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.7, 'rgba(255,255,255,0.9)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 256, 256);
  });
  canvasTex(scene, 'disc', 128, 128, (g) => { g.beginPath(); g.arc(64, 64, 63, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); });
  canvasTex(scene, 'white', 4, 4, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 4, 4); });
  // Diagonal hazard stripes (telegraph lanes do not rely on colour alone).
  canvasTex(scene, 'stripes', 64, 64, (g) => {
    g.fillStyle = 'rgba(255,255,255,0.0)'; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 9;
    for (let i = -64; i < 128; i += 22) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke(); }
  });
  // Rune sigil for spawns and circular telegraphs.
  canvasTex(scene, 'sigil', 256, 256, (g) => {
    g.translate(128, 128);
    g.strokeStyle = '#fff';
    g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 118, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 98, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.save(); g.rotate(a); g.translate(108, 0); g.rotate(Math.PI / 4);
      g.lineWidth = 3; g.strokeRect(-7, -7, 14, 14); g.restore();
    }
    g.lineWidth = 2;
    g.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
      const b = a + (2 / 3) * Math.PI;
      g.moveTo(Math.cos(a) * 92, Math.sin(a) * 92); g.lineTo(Math.cos(b) * 92, Math.sin(b) * 92);
    }
    g.stroke();
  });
  // Mote of light: a four-point star.
  canvasTex(scene, 'mote', 24, 24, (g) => {
    const r = g.createRadialGradient(12, 12, 0, 12, 12, 12);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,230,170,0.7)'); r.addColorStop(1, 'rgba(255,180,80,0)');
    g.fillStyle = r; g.fillRect(0, 0, 24, 24);
    g.fillStyle = '#fff';
    g.fillRect(11, 2, 2, 20); g.fillRect(2, 11, 20, 2);
  });
  // Orb projectile core.
  canvasTex(scene, 'orb', 32, 32, (g) => {
    const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.95)'); r.addColorStop(0.5, 'rgba(255,255,255,0.4)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 32, 32);
  });
  // Bolt streak.
  canvasTex(scene, 'streak', 64, 16, (g) => {
    const r = g.createLinearGradient(0, 0, 64, 0);
    r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.8, 'rgba(255,255,255,0.9)'); r.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = r;
    g.beginPath(); g.ellipse(32, 8, 32, 5, 0, 0, Math.PI * 2); g.fill();
  });
}
