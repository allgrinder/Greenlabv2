/**
 * Heatmap „Sonnenstunden pro Tag“: Gitter als Textur, bilinear gefiltert und weichgezeichnet,
 * auf das Grundstück zugeschnitten.
 */
import { BlurFilter, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Polygon } from '../../core/geometry/polygon';
import { heatColor, type SunGrid } from '../../core/sun/shadows';

export class HeatLayer {
  readonly container = new Container();
  private sprite = new Sprite(Texture.EMPTY);
  private mask = new Graphics();
  private blur = new BlurFilter({ strength: 6, quality: 4 });
  private tex: Texture | null = null;

  constructor() {
    this.container.label = 'heatmap';
    this.sprite.alpha = 0.62;
    this.sprite.filters = [this.blur];
    this.container.addChild(this.sprite, this.mask);
    this.sprite.mask = this.mask;
    this.container.visible = false;
  }

  set(grid: SunGrid | null, boundary: Polygon) {
    this.tex?.destroy(true);
    this.tex = null;
    if (!grid) {
      this.container.visible = false;
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = grid.cols;
    canvas.height = grid.rows;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(grid.cols, grid.rows);
    for (let i = 0; i < grid.hours.length; i++) {
      const [r, g, b] = heatColor(grid.hours[i]);
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    this.tex = Texture.from(canvas);
    this.tex.source.scaleMode = 'linear';
    this.sprite.texture = this.tex;
    this.sprite.position.set(grid.origin.x, grid.origin.y);
    this.sprite.scale.set(grid.cell);
    this.mask.clear().poly(boundary.flatMap((p) => [p.x, p.y]), true).fill(0xffffff);
    this.container.visible = true;
  }

  setScale(pxPerMeter: number) {
    this.blur.strength = Math.max(2, Math.min(40, 0.7 * pxPerMeter));
  }
}
