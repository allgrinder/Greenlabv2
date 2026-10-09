/**
 * Rabatte zeichnen: Rechteck, Polygon, Kurve oder Freihand (Form aus session.defaults.bedShape).
 * Ergebnis ist eine bepflanzte, gemulchte und gestaffelte Pflanzfläche aus einer Mischungsvorlage;
 * bei „passend zum Standort“ wählt die Sonnenanalyse der gezeichneten Fläche die Vorlage.
 */
import type { Graphics } from 'pixi.js';
import { rankBedMixes } from '../core/catalog/bedMixes';
import { meanSunHours } from '../core/bedSun';
import { flattenRegion } from '../core/geometry/shape';
import { newPlanting } from '../core/model/factory';
import type { Project, Region } from '../core/model/types';
import type { LabelPool, ToScreen } from '../render/overlays/overlay';
import { PathBuilderTool } from './PathBuilderTool';
import { FreehandTool, RectTool } from './simpleTools';
import type { Tool, ToolContext, WorldPointerEvent } from './Tool';

export function makeBed(doc: Project, region: Region, mixId: string) {
  const id = mixId === 'auto' ? rankBedMixes(meanSunHours(doc, flattenRegion(region).outer))[0].id : mixId;
  return newPlanting(doc, region, id);
}

export class BedTool implements Tool {
  readonly id = 'bed';
  readonly cursor = 'crosshair';
  private shapes: Record<'rect' | 'poly' | 'bezier' | 'free', Tool>;

  constructor(private ctx: ToolContext) {
    const make = (doc: Project, region: Region) => makeBed(doc, region, ctx.store.getState().session.defaults.bedMix);
    this.shapes = {
      rect: new RectTool(ctx, make),
      poly: new PathBuilderTool(ctx, { id: 'poly', closed: true, curves: false, source: 'polygon', min: 3, finish: (path) => ctx.cmd.addObject(make(ctx.doc(), { outer: { ...path, source: 'polygon' }, holes: [] })) }),
      bezier: new PathBuilderTool(ctx, { id: 'bezier', closed: true, curves: true, source: 'bezier', min: 3, finish: (path) => ctx.cmd.addObject(make(ctx.doc(), { outer: { ...path, source: 'bezier' }, holes: [] })) }),
      free: new FreehandTool(ctx, make),
    };
  }

  private get inner(): Tool {
    return this.shapes[this.ctx.store.getState().session.defaults.bedShape] ?? this.shapes.rect;
  }

  down(e: WorldPointerEvent) {
    this.inner.down?.(e);
  }
  move(e: WorldPointerEvent) {
    this.inner.move?.(e);
  }
  up(e: WorldPointerEvent) {
    this.inner.up?.(e);
  }
  key(e: KeyboardEvent) {
    return this.inner.key?.(e) ?? false;
  }
  preview(g: Graphics, toScreen: ToScreen, labels: LabelPool) {
    this.inner.preview?.(g, toScreen, labels);
  }
  cancel() {
    for (const t of Object.values(this.shapes)) t.cancel?.();
  }
}
