/**
 * Einsehbarkeit: rot = von einem Blickpunkt aus sichtbar, grün = geschützt.
 * Darüber die Blickpunkte mit Sichtlinien zu den Grundstücksecken.
 */
import { BlurFilter, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Polygon } from '../../core/geometry/polygon';
import type { Observer } from '../../core/model/types';
import type { PrivacyGrid } from '../../core/privacy';

export class PrivacyLayer {
  readonly container = new Container();
  private sprite = new Sprite(Texture.EMPTY);
  private mask = new Graphics();
  private marks = new Graphics();
  private blur = new BlurFilter({ strength: 4, quality: 3 });
  private tex: Texture | null = null;

  constructor() {
    this.container.label = 'privacy';
    this.sprite.filters = [this.blur];
    this.container.addChild(this.sprite, this.mask, this.marks);
    this.sprite.mask = this.mask;
    this.container.visible = false;
  }

  hide() {
    this.container.visible = false;
  }

  set(grid: PrivacyGrid, boundary: Polygon, observers: Observer[]) {
    this.tex?.destroy(true);
    const canvas = document.createElement('canvas');
    canvas.width = grid.cols;
    canvas.height = grid.rows;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(grid.cols, grid.rows);
    for (let i = 0; i < grid.seen.length; i++) {
      const v = grid.seen[i];
      if (Number.isNaN(v)) continue;
      const seen = v > 0.5;
      img.data[i * 4] = seen ? 214 : 64;
      img.data[i * 4 + 1] = seen ? 72 : 150;
      img.data[i * 4 + 2] = seen ? 58 : 92;
      img.data[i * 4 + 3] = seen ? 70 + v * 80 : 70;
    }
    ctx.putImageData(img, 0, 0);
    this.tex = Texture.from(canvas);
    this.tex.source.scaleMode = 'linear';
    this.sprite.texture = this.tex;
    this.sprite.position.set(grid.origin.x, grid.origin.y);
    this.sprite.scale.set(grid.cell);
    this.mask.clear().poly(boundary.flatMap((p) => [p.x, p.y]), true).fill(0xffffff);
    this.drawObservers(observers, boundary);
    this.container.visible = true;
  }

  drawObservers(observers: Observer[], boundary: Polygon) {
    const g = this.marks.clear();
    for (const o of observers) {
      // Sichtkegel: Linien zu den Grundstücksecken
      for (const c of boundary) g.moveTo(o.position.x, o.position.y).lineTo(c.x, c.y);
      g.stroke({ color: 0xc4553a, width: 0.04, alpha: 0.35 });
      g.circle(o.position.x, o.position.y, 0.55).fill({ color: 0xffffff }).stroke({ color: 0xc4553a, width: 0.09 });
      // Auge
      g.ellipse(o.position.x, o.position.y, 0.32, 0.18).stroke({ color: 0x2d3033, width: 0.06 });
      g.circle(o.position.x, o.position.y, 0.09).fill(0x2d3033);
    }
  }

  setScale(pxPerMeter: number) {
    this.blur.strength = Math.max(1, Math.min(20, 0.35 * pxPerMeter));
  }
}
