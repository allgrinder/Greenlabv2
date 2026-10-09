/**
 * Zentraler Schattenlayer: alle Schattenpolygone in einer Graphics, opak gezeichnet,
 * dann weichgezeichnet und als Ganzes abgeschwächt – Überlappungen werden so nicht dunkler.
 * Kahle Laubbäume (Winter) liegen in einem eigenen, schwächeren Durchgang.
 */
import { AlphaFilter, BlurFilter, Container, Graphics } from 'pixi.js';
import type { Season } from '../../core/growth';
import type { Project, Vec2 } from '../../core/model/types';
import { collectCasters, shadowPolygons } from '../../core/sun/shadows';

const COLOR = 0x1e2a1b;

export class ShadowLayer {
  readonly container = new Container();
  private dense = new Graphics();
  private light = new Graphics();
  private denseWrap = new Container();
  private lightWrap = new Container();
  private blurA = new BlurFilter({ strength: 6, quality: 3 });
  private blurB = new BlurFilter({ strength: 4, quality: 3 });
  private alphaA = new AlphaFilter({ alpha: 0.3 });
  private alphaB = new AlphaFilter({ alpha: 0.1 });
  private key = '';
  private clip = new Graphics();

  constructor() {
    this.container.label = 'shadows';
    this.denseWrap.addChild(this.dense);
    this.lightWrap.addChild(this.light);
    this.denseWrap.filters = [this.blurA, this.alphaA];
    this.lightWrap.filters = [this.blurB, this.alphaB];
    this.container.addChild(this.lightWrap, this.denseWrap, this.clip);
    this.container.mask = this.clip;
  }

  /** Schatten nur auf dem Grundstück zeigen */
  setClip(boundary: { x: number; y: number }[]) {
    this.clip.clear().poly(boundary.flatMap((p) => [p.x, p.y]), true).fill(0xffffff);
  }

  /** Schatten neu berechnen, wenn sich Dokument, Sonne oder Ansicht geändert haben */
  update(doc: Project, sv: Vec2 | null, years: number, season: Season, strength: number) {
    const key = `${sv ? sv.x.toFixed(4) + ',' + sv.y.toFixed(4) : 'none'}|${years}|${season}`;
    this.alphaA.alpha = strength;
    this.alphaB.alpha = strength * 0.33;
    if (key === this.key && this.doc === doc) return;
    this.key = key;
    this.doc = doc;
    this.dense.clear();
    this.light.clear();
    if (!sv) return;
    for (const c of collectCasters(doc, years, season)) {
      const g = c.density >= 0.7 ? this.dense : this.light;
      for (const poly of shadowPolygons(c, sv)) g.poly(poly.flatMap((p) => [p.x, p.y]), true).fill(COLOR);
      // Stammschatten als Linie vom Stammfuß zum Kronenschatten
      if (c.kind === 'disc' && c.r > 1 && c.h0 > 0) {
        const s = { x: c.c.x + sv.x * c.h0, y: c.c.y + sv.y * c.h0 };
        g.moveTo(c.c.x, c.c.y).lineTo(s.x, s.y).stroke({ color: COLOR, width: Math.max(0.12, c.r * 0.05) });
      }
    }
  }

  private doc: Project | null = null;

  /** Weichzeichnung in Weltmetern konstant halten */
  setScale(pxPerMeter: number) {
    const s = Math.max(1, Math.min(40, 0.16 * pxPerMeter));
    this.blurA.strength = s;
    this.blurB.strength = s;
  }
}
