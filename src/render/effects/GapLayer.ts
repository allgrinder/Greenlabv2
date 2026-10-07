/**
 * Bewässerungslinse: unbewässerte Teilflächen rot schraffiert.
 */
import { Container, Graphics } from 'pixi.js';
import { bbox } from '../../core/geometry/polygon';
import type { FlatRegion } from '../../core/geometry/shape';

const RED = 0xc4553a;

export class GapLayer {
  readonly container = new Container();
  private fill = new Graphics();
  private hatch = new Graphics();
  private mask = new Graphics();

  constructor() {
    this.container.label = 'irrigation-gaps';
    this.container.addChild(this.fill, this.hatch, this.mask);
    this.hatch.mask = this.mask;
    this.container.visible = false;
  }

  set(gaps: FlatRegion[] | null) {
    this.fill.clear();
    this.hatch.clear();
    this.mask.clear();
    if (!gaps?.length) {
      this.container.visible = false;
      return;
    }
    for (const r of gaps) {
      const pts = r.outer.flatMap((p) => [p.x, p.y]);
      this.fill.poly(pts, true).fill({ color: RED, alpha: 0.14 });
      for (const h of r.holes) this.fill.poly(h.flatMap((p) => [p.x, p.y]), true).cut();
      this.fill.poly(pts, true).stroke({ color: RED, width: 0.05, alpha: 0.8 });
      this.mask.poly(pts, true).fill(0xffffff);
      for (const h of r.holes) this.mask.poly(h.flatMap((p) => [p.x, p.y]), true).cut();
    }
    const b = bbox(gaps.flatMap((r) => r.outer));
    const span = b.maxX - b.minX + (b.maxY - b.minY);
    for (let t = -span; t < span; t += 0.5) this.hatch.moveTo(b.minX + t, b.minY).lineTo(b.minX + t + (b.maxY - b.minY), b.maxY);
    this.hatch.stroke({ color: RED, width: 0.05, alpha: 0.7 });
    this.container.visible = true;
  }
}
