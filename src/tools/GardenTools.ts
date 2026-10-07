/**
 * Pflanzpinsel (eine Pflanzgruppe je Strich, Alt = Radierer) und Blickpunkte für die
 * Einsehbarkeits-Prüfung (setzen und verschieben).
 */
import type { Graphics } from 'pixi.js';
import { getSpecies } from '../core/catalog/plants';
import { brushDab } from '../core/espalier';
import { footprint } from '../core/geometry/objects';
import { pointInRegion } from '../core/geometry/polygon';
import { newId } from '../core/model/ids';
import { newScatter } from '../core/model/factory';
import type { ScatterPlant, Vec2 } from '../core/model/types';
import { ACCENT, type LabelPool, type ToScreen } from '../render/overlays/overlay';
import { hint, PINK } from './preview';
import type { Tool, ToolContext, WorldPointerEvent } from './Tool';

/** Arten, die der Pinsel setzen darf: Stauden, Gräser, Blumen */
export const brushable = (speciesId: string) => {
  const k = getSpecies(speciesId).kind;
  return k === 'perennial' || k === 'grass';
};

export class BrushTool implements Tool {
  readonly id = 'brush';
  readonly cursor = 'none';
  private stroke: ScatterPlant[] | null = null;
  private erasing = false;
  private last: Vec2 | null = null;
  private hover: Vec2 | null = null;
  private seq = 0;
  private rnd = Math.random;
  constructor(private ctx: ToolContext) {}

  private get opts() {
    return this.ctx.store.getState().session.paint;
  }

  /** Pflanzen in der Nähe (für den Mindestabstand) */
  private nearby(c: Vec2, r: number): ScatterPlant[] {
    const out: ScatterPlant[] = [];
    const R = r + 1.5;
    for (const o of Object.values(this.ctx.doc().objects)) {
      if (o.type === 'scatter') for (const q of o.plants) if (Math.abs(q.p.x - c.x) < R && Math.abs(q.p.y - c.y) < R) out.push(q);
      if (o.type === 'plant' && Math.abs(o.position.x - c.x) < R && Math.abs(o.position.y - c.y) < R) out.push({ speciesId: o.speciesId, p: o.position });
    }
    return out;
  }

  /** „nur in Beeten“: Erde, Mulch, Rindenmulch und Staudenpflanzungen */
  private insideBeds(): (p: Vec2) => boolean {
    if (!this.opts.bedsOnly) return () => true;
    const regions = Object.values(this.ctx.doc().objects)
      .filter((o) => (o.type === 'area' && ['soil', 'mulch', 'barkMulch'].includes(o.materialId)) || o.type === 'planting')
      .flatMap((o) => footprint(o));
    return (p) => regions.some((r) => pointInRegion(p, r.outer, r.holes));
  }

  private dab(c: Vec2) {
    const o = this.opts;
    const mix = o.mix.filter(brushable).map((speciesId) => ({ speciesId, weight: 1 }));
    if (!mix.length || !this.stroke) return;
    const fresh = brushDab(c, { radius: o.radius, density: o.density, mix }, [...this.nearby(c, o.radius), ...this.stroke], this.rnd, this.insideBeds());
    this.stroke.push(...fresh);
  }

  down(e: WorldPointerEvent) {
    if (e.button !== 0) return;
    this.erasing = e.alt;
    this.last = e.raw;
    if (this.erasing) this.ctx.cmd.eraseScatter(e.raw, this.opts.radius, `erase:${this.seq}`);
    else {
      this.stroke = [];
      this.dab(e.raw);
    }
    this.ctx.redraw();
  }

  move(e: WorldPointerEvent) {
    this.hover = e.raw;
    if (this.last) {
      const step = Math.max(0.15, this.opts.radius * 0.45);
      const d = Math.hypot(e.raw.x - this.last.x, e.raw.y - this.last.y);
      if (d >= step) {
        const n = Math.floor(d / step);
        for (let i = 1; i <= n; i++) {
          const p = { x: this.last.x + ((e.raw.x - this.last.x) * i) / n, y: this.last.y + ((e.raw.y - this.last.y) * i) / n };
          if (this.erasing) this.ctx.cmd.eraseScatter(p, this.opts.radius, `erase:${this.seq}`);
          else this.dab(p);
        }
        this.last = e.raw;
      }
    }
    this.ctx.redraw();
  }

  up() {
    if (this.stroke && this.stroke.length) this.ctx.cmd.addObject(newScatter(this.ctx.doc(), this.stroke), false);
    if (this.erasing) this.ctx.store.getState().endGesture();
    this.stroke = null;
    this.last = null;
    this.erasing = false;
    this.seq++;
    this.ctx.redraw();
  }

  key(e: KeyboardEvent) {
    const p = this.ctx.store.getState().session.paint;
    if (e.key === '[' || e.key === ']') {
      const r = Math.max(0.2, Math.min(4, p.radius * (e.key === ']' ? 1.2 : 1 / 1.2)));
      this.ctx.store.getState().setSession({ paint: { ...p, radius: Math.round(r * 10) / 10 } });
      return true;
    }
    if (e.key === 'Escape') {
      this.ctx.store.getState().setSession({ tool: 'select' });
      return true;
    }
    return false;
  }

  cancel() {
    this.stroke = null;
    this.last = null;
  }

  preview(g: Graphics, toScreen: ToScreen, labels: LabelPool) {
    const ppm = this.ctx.store.getState().session.viewport.pxPerMeter;
    if (this.stroke)
      for (const q of this.stroke) {
        const P = toScreen(q.p);
        const sp = getSpecies(q.speciesId);
        g.circle(P.x, P.y, Math.max(2, (sp.diameterMature / 2) * 0.85 * ppm)).fill({ color: parseInt((sp.colors.bloom ?? sp.colors.summer).slice(1), 16), alpha: 0.75 });
      }
    if (!this.hover) return;
    const H = toScreen(this.hover);
    const r = this.opts.radius * ppm;
    const alt = this.erasing;
    g.circle(H.x, H.y, r).stroke({ color: alt ? PINK : ACCENT, width: 1.5 });
    g.circle(H.x, H.y, 2).fill(alt ? PINK : ACCENT);
    if (!this.last) hint(labels, { x: H.x + r * 0.7, y: H.y + r * 0.7 }, this.opts.mix.length ? 'Malen · Alt radiert · [ ] Größe' : 'Erst Stauden in der Bibliothek wählen');
  }
}

/** Blickpunkt setzen (Klick ins Freie) oder vorhandenen verschieben */
export class ObserverTool implements Tool {
  readonly id = 'observer';
  readonly cursor = 'crosshair';
  private drag: string | null = null;
  private hover: Vec2 | null = null;
  private seq = 0;
  constructor(private ctx: ToolContext) {}

  private hit(p: Vec2) {
    const tol = this.ctx.px(12);
    return this.ctx.doc().observers.find((o) => Math.hypot(o.position.x - p.x, o.position.y - p.y) <= tol) ?? null;
  }

  down(e: WorldPointerEvent) {
    if (e.button !== 0) return;
    const h = this.hit(e.raw);
    if (h) {
      this.drag = h.id;
      return;
    }
    const n = this.ctx.doc().observers.length + 1;
    this.ctx.cmd.addObserver({ id: newId(), name: `Blickpunkt ${n}`, position: e.p, eyeHeight: 4.5 });
  }

  move(e: WorldPointerEvent) {
    this.hover = e.raw;
    if (this.drag) this.ctx.cmd.updateObserver(this.drag, { position: e.p }, `obs:${this.seq}`);
    else this.ctx.setCursor(this.hit(e.raw) ? 'move' : 'crosshair');
    this.ctx.redraw();
  }

  up() {
    if (this.drag) {
      this.drag = null;
      this.seq++;
      this.ctx.store.getState().endGesture();
    }
  }

  key(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      this.ctx.store.getState().setSession({ tool: 'select' });
      return true;
    }
    return false;
  }

  preview(_g: Graphics, toScreen: ToScreen, labels: LabelPool) {
    if (this.hover && !this.drag) hint(labels, toScreen(this.hover), 'Klick setzt einen Blickpunkt (Fenster, Straße) · Ziehen verschiebt');
  }
}
