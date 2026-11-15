// How many texels per world unit the art is painted at. The camera shows at least VIEW_MIN_W x VIEW_MIN_H
// world units, so its zoom (device px per unit) follows from the canvas size; painting at about that
// density keeps every edge crisp without wasting memory. Chosen once at boot from the screen.
import { VIEW_MIN_H, VIEW_MIN_W } from '../config';

export const DENSITY = {
  /** Characters, props and effects. */
  sprite: 4,
  /** Room floors, walls and foliage. */
  env: 4,
};

/** The camera zoom for a canvas of w x h device pixels (same rule as GameScene.applyZoom). */
export const zoomFor = (w: number, h: number) => Math.max(0.5, Math.min(w / VIEW_MIN_W, h / VIEW_MIN_H));

export function chooseDensity(w: number, h: number, quality: string | null) {
  const z = zoomFor(w, h);
  const want = Math.ceil(z - 0.12);
  if (quality === 'low') {
    DENSITY.sprite = Math.max(2, Math.min(3, want));
    DENSITY.env = 2;
  } else {
    DENSITY.sprite = Math.max(3, Math.min(6, want));
    DENSITY.env = Math.max(2, Math.min(5, want));
  }
  return DENSITY;
}
