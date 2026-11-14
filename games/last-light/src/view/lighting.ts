// Real-time lighting: every frame a low-resolution light map is filled with the ambient blue-hour
// colour, lights are added into it, and it is multiplied over the world. Emissive things (flames,
// projectiles, slashes) draw after it with additive blending so they stay bright.
import Phaser from 'phaser';
import { DEPTH } from './roomView';

export interface Light { x: number; y: number; r: number; color: number; i: number }

const RES = 0.5; // light-map texels per art pixel

export class Lighting {
  rt: Phaser.GameObjects.RenderTexture;
  ambient = 0x5d6a98;
  private w = 0;
  private h = 0;

  constructor(private scene: Phaser.Scene) {
    this.rt = scene.add.renderTexture(0, 0, 8, 8).setOrigin(0).setDepth(DEPTH.light).setBlendMode(Phaser.BlendModes.MULTIPLY);
  }

  /** Draw the light map for the camera's current view. */
  render(cam: Phaser.Cameras.Scene2D.Camera, lights: Iterable<Light>) {
    const v = cam.worldView;
    const w = Math.ceil(v.width * RES) + 4, h = Math.ceil(v.height * RES) + 4;
    if (w !== this.w || h !== this.h) {
      // Recreate rather than resize: a resized DynamicTexture in Phaser 3.90 keeps filling only its old area.
      this.w = w; this.h = h;
      this.rt.destroy();
      this.rt = this.scene.add.renderTexture(0, 0, w, h).setOrigin(0).setDepth(DEPTH.light).setBlendMode(Phaser.BlendModes.MULTIPLY);
    }
    // Snap the map to whole texels of the world so lights do not swim as the camera moves.
    const ox = Math.floor(v.x * RES) / RES - 2 / RES, oy = Math.floor(v.y * RES) / RES - 2 / RES;
    this.rt.setPosition(ox, oy).setScale(1 / RES);
    this.rt.clear();
    this.rt.fill(this.ambient);
    for (const l of lights) {
      if (l.i <= 0.002) continue;
      const lx = (l.x - ox) * RES, ly = (l.y - oy) * RES, lr = l.r * RES;
      if (lx < -lr || ly < -lr || lx > w + lr || ly > h + lr) continue;
      const k = Math.min(1, l.i);
      const c = Phaser.Display.Color.IntegerToColor(l.color);
      const tint = Phaser.Display.Color.GetColor(c.red * k, c.green * k, c.blue * k);
      this.rt.stamp('light', undefined, lx, ly, { scale: (lr * 2) / 256, tint, blendMode: Phaser.BlendModes.ADD });
      // Very strong lights get a second pass for a hotter core.
      if (l.i > 1) {
        const k2 = Math.min(1, l.i - 1);
        this.rt.stamp('light', undefined, lx, ly, { scale: lr / 256, tint: Phaser.Display.Color.GetColor(c.red * k2, c.green * k2, c.blue * k2), blendMode: Phaser.BlendModes.ADD });
      }
    }
  }

  destroy() { this.rt.destroy(); }
}
