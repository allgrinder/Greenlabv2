/** Rechteck, Freihand, Bemaßung, Text und Platzieren (Pflanze/Objekt) */
import type { Graphics } from 'pixi.js';
import { getItem } from '../core/catalog/items';
import { getSpecies } from '../core/catalog/plants';
import { num } from '../core/format';
import { smoothFreehand } from '../core/geometry/smooth';
import type { SnapResult } from '../core/geometry/snap';
import { add, dist, normalize, perp, scale, sub, dot } from '../core/geometry/vec';
import { newArea, newDimension, newFromCatalog, newPath, newPlant, newText } from '../core/model/factory';
import type { Vec2 } from '../core/model/types';
import { ACCENT, dashed, type LabelPool, type ToScreen } from '../render/overlays/overlay';
import { drawSnap, edgeLabel } from './preview';
import type { Tool, ToolContext, WorldPointerEvent } from './Tool';

export class RectTool implements Tool {
  readonly id = 'rect';
  readonly cursor = 'crosshair';
  private a: Vec2 | null = null;
  private b: Vec2 | null = null;
  private snap: SnapResult | null = null;

  constructor(private ctx: ToolContext) {}

  private corners(shift: boolean): [Vec2, Vec2] | null {
    if (!this.a || !this.b) return null;
    let b = this.b;
    if (shift) {
      const s = Math.max(Math.abs(b.x - this.a.x), Math.abs(b.y - this.a.y));
      b = { x: this.a.x + Math.sign(b.x - this.a.x || 1) * s, y: this.a.y + Math.sign(b.y - this.a.y || 1) * s };
    }
    return [this.a, b];
  }

  private shift = false;

  down(e: WorldPointerEvent) {
    if (e.button !== 0) return;
    this.a = e.p;
    this.b = e.p;
  }
  move(e: WorldPointerEvent) {
    this.snap = e.snap;
    this.shift = e.shift;
    if (this.a) this.b = e.p;
    this.ctx.redraw();
  }
  up(e: WorldPointerEvent) {
    const c = this.corners(e.shift);
    this.a = this.b = null;
    if (!c) return;
    const [a, b] = c;
    const w = Math.abs(b.x - a.x);
    const d = Math.abs(b.y - a.y);
    if (w < 0.05 || d < 0.05) return this.ctx.redraw();
    const doc = this.ctx.doc();
    const def = this.ctx.store.getState().session.defaults;
    this.ctx.cmd.addObject(
      newArea(doc, { outer: { kind: 'rect', center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, width: w, depth: d, rotationDeg: 0, cornerRadius: 0 }, holes: [] }, def.areaMaterial),
    );
    this.ctx.redraw();
  }
  cancel() {
    this.a = this.b = null;
  }
  preview(g: Graphics, toScreen: ToScreen, labels: LabelPool) {
    drawSnap(g, toScreen, this.snap);
    const c = this.corners(this.shift);
    if (!c) return;
    const [a, b] = c;
    const A = toScreen(a);
    const B = toScreen(b);
    g.rect(Math.min(A.x, B.x), Math.min(A.y, B.y), Math.abs(B.x - A.x), Math.abs(B.y - A.y)).fill({ color: ACCENT, alpha: 0.08 }).stroke({ color: ACCENT, width: 2 });
    const top = Math.min(a.y, b.y);
    const right = Math.max(a.x, b.x);
    edgeLabel(labels, toScreen, { x: Math.max(a.x, b.x), y: top }, { x: Math.min(a.x, b.x), y: top });
    edgeLabel(labels, toScreen, { x: right, y: Math.max(a.y, b.y) }, { x: right, y: top });
  }
}

/** Freihand: geglättet beim Loslassen. Geschlossen → Fläche, offen → Weg. */
export class FreehandTool implements Tool {
  readonly id = 'free';
  readonly cursor = 'crosshair';
  private pts: Vec2[] = [];

  constructor(private ctx: ToolContext) {}

  down(e: WorldPointerEvent) {
    if (e.button !== 0) return;
    this.pts = [e.raw];
  }
  move(e: WorldPointerEvent) {
    if (!this.pts.length) return;
    const last = this.pts[this.pts.length - 1];
    if (dist(last, e.raw) > this.ctx.px(1.5)) this.pts.push(e.raw);
    this.ctx.redraw();
  }
  up() {
    const pts = this.pts;
    this.pts = [];
    if (pts.length < 3) return this.ctx.redraw();
    const closed = dist(pts[0], pts[pts.length - 1]) < this.ctx.px(16) && pts.length > 8;
    const nodes = smoothFreehand(pts, closed, this.ctx.px(3));
    const doc = this.ctx.doc();
    const def = this.ctx.store.getState().session.defaults;
    const geom = { kind: 'path' as const, nodes, closed, source: 'freehand' as const };
    if (closed && nodes.length >= 3) this.ctx.cmd.addObject(newArea(doc, { outer: geom, holes: [] }, def.areaMaterial));
    else if (nodes.length >= 2) this.ctx.cmd.addObject(newPath(doc, geom, def.pathWidth, def.pathMaterial));
    this.ctx.redraw();
  }
  cancel() {
    this.pts = [];
  }
  preview(g: Graphics, toScreen: ToScreen) {
    if (this.pts.length < 2) return;
    g.poly(this.pts.map(toScreen).flatMap((p) => [p.x, p.y]), false).stroke({ color: ACCENT, width: 2, join: 'round', cap: 'round' });
  }
}

/** Bemaßung: Punkt A, Punkt B, dann Abstand der Maßlinie per Mausbewegung, Klick übernimmt */
export class DimensionTool implements Tool {
  readonly id = 'dim';
  readonly cursor = 'crosshair';
  private a: Vec2 | null = null;
  private b: Vec2 | null = null;
  private hover: Vec2 | null = null;
  private offset = 0;
  private snap: SnapResult | null = null;

  constructor(private ctx: ToolContext) {}

  get lastPoint(): Vec2 | undefined {
    return this.b ? undefined : (this.a ?? undefined);
  }

  down(e: WorldPointerEvent) {
    if (e.button !== 0) return;
    if (!this.a) this.a = e.p;
    else if (!this.b) {
      if (dist(this.a, e.p) < 0.01) return;
      this.b = e.p;
    } else {
      this.ctx.cmd.addObject(newDimension(this.ctx.doc(), this.a, this.b, this.offset), false);
      this.cancel();
    }
    this.ctx.redraw();
  }
  move(e: WorldPointerEvent) {
    this.hover = e.p;
    this.snap = e.snap;
    if (this.a && this.b) {
      const n = perp(normalize(sub(this.b, this.a)));
      this.offset = dot(sub(e.raw, this.a), n);
    }
    this.ctx.redraw();
  }
  key(e: KeyboardEvent) {
    if (e.key === 'Escape' && this.a) {
      this.cancel();
      return true;
    }
    return false;
  }
  cancel() {
    this.a = this.b = null;
    this.offset = 0;
    this.ctx.redraw();
  }
  preview(g: Graphics, toScreen: ToScreen, labels: LabelPool) {
    drawSnap(g, toScreen, this.snap);
    if (!this.a) return;
    const b = this.b ?? this.hover;
    if (!b) return;
    const n = perp(normalize(sub(b, this.a)));
    const off = scale(n, this.b ? this.offset : 0);
    const A = toScreen(add(this.a, off));
    const B = toScreen(add(b, off));
    if (this.b) {
      dashed(g, [toScreen(this.a), A], false, [3, 3]);
      dashed(g, [toScreen(b), B], false, [3, 3]);
    }
    g.moveTo(A.x, A.y).lineTo(B.x, B.y);
    g.stroke({ color: ACCENT, width: 1.5 });
    edgeLabel(labels, toScreen, add(this.a, off), add(b, off), num(dist(this.a, b), 2));
  }
}

/** Text: Klick setzt eine Beschriftung und öffnet sie zur Bearbeitung */
export class TextTool implements Tool {
  readonly id = 'text';
  readonly cursor = 'text';
  constructor(private ctx: ToolContext) {}
  down(e: WorldPointerEvent) {
    if (e.button !== 0) return;
    this.ctx.cmd.addObject(newText(this.ctx.doc(), e.p));
    this.ctx.store.getState().setSession({ tool: 'select' });
    // Eigenschaften-Leiste fokussiert das Textfeld
    requestAnimationFrame(() => (document.querySelector('[data-testid="prop-text"]') as HTMLInputElement | null)?.select());
  }
}

/** Pflanze bzw. Objekt aus der Bibliothek an den Cursor setzen; bleibt aktiv für Serien */
export class PlaceTool implements Tool {
  readonly id = 'plant';
  readonly cursor = 'copy';
  private hover: Vec2 | null = null;
  private snap: SnapResult | null = null;
  constructor(private ctx: ToolContext) {}

  down(e: WorldPointerEvent) {
    if (e.button !== 0) return;
    const doc = this.ctx.doc();
    const brush = this.ctx.store.getState().session.brush;
    const o = brush.kind === 'plant' ? newPlant(doc, brush.speciesId, e.p) : newFromCatalog(doc, brush.catalogId, e.p);
    this.ctx.cmd.addObject(o);
  }
  move(e: WorldPointerEvent) {
    this.hover = e.p;
    this.snap = e.snap;
    this.ctx.redraw();
  }
  preview(g: Graphics, toScreen: ToScreen, labels: LabelPool) {
    drawSnap(g, toScreen, this.snap);
    if (!this.hover) return;
    const brush = this.ctx.store.getState().session.brush;
    const P = toScreen(this.hover);
    const ppm = this.ctx.store.getState().session.viewport.pxPerMeter;
    if (brush.kind === 'plant') {
      const sp = getSpecies(brush.speciesId);
      const r = (sp.diameterPlanted / 2) * ppm;
      const rm = (sp.diameterMature / 2) * ppm;
      g.circle(P.x, P.y, r).fill({ color: parseInt(sp.colors.summer.slice(1), 16), alpha: 0.55 }).stroke({ color: ACCENT, width: 1.5 });
      g.circle(P.x, P.y, rm).stroke({ color: ACCENT, width: 1, alpha: 0.6 });
      labels.mono(`${sp.name} · Ø ${num(sp.diameterPlanted, 1)} → ${num(sp.diameterMature, 1)} m`, P.x, P.y + rm + 14, 0, ACCENT);
    } else {
      const it = getItem(brush.catalogId);
      const w = it.width * ppm;
      const d = it.depth * ppm;
      g.rect(P.x - w / 2, P.y - d / 2, w, d).fill({ color: ACCENT, alpha: 0.08 }).stroke({ color: ACCENT, width: 1.5 });
      labels.mono(`${it.name} · ${num(it.width, 2)} × ${num(it.depth, 2)} m`, P.x, P.y + d / 2 + 14, 0, ACCENT);
    }
  }
}
