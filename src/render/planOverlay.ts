/** Hilfslinien der Planansicht im Bildschirmraum: Raster, Grenze, Bemaßungen, Hover, Auswahl und Werkzeugvorschau */
import type { Graphics } from 'pixi.js';
import { expandBBox } from '../core/geometry/polygon';
import type { EditorStore } from '../state/store';
import type { Viewport } from '../state/types';
import { drawBoundary, drawDimension, drawGrid, drawSelection, type LabelPool, type ToScreen } from './overlays/overlay';
import { visibleWorldBBox, type ScreenSize } from './Viewport';

/** Vorschau eines Werkzeugs, im Bildschirmraum gezeichnet */
export type PreviewDrawer = (g: Graphics, toScreen: ToScreen, labels: LabelPool) => void;

/** Werkzeuge ohne Raster (Auswahl, Hintergrund ausrichten); alle Zeichenwerkzeuge zeigen es */
const NO_GRID_TOOLS = new Set(['select', 'calibrate', 'bgmove', 'bgalign']);

export interface OverlayTargets {
  overlay: Graphics;
  hoverG: Graphics;
  previewG: Graphics;
  labels: LabelPool;
  vp: Viewport;
  viewSize: ScreenSize;
  toScreen: ToScreen;
  preview: PreviewDrawer | null;
  /** Deckkraft des Zeichenrasters vor diesem Bild */
  gridA: number;
  invalidate: () => void;
}

/** Hilfslinien zeichnen; liefert die neue Deckkraft des Zeichenrasters */
export function drawOverlay(t: OverlayTargets, s: EditorStore, exporting = false): number {
  let gridA = t.gridA;
  const g = t.overlay;
  g.clear();
  t.hoverG.clear();
  t.previewG.clear();
  t.labels.begin();
  const doc = s.doc;
  const vp = t.vp;
  const toScreen = t.toScreen;
  if (doc) {
    const plotLayer = doc.layerOrder.map((id) => doc.layers[id]).find((l) => l.kind === 'plot');
    if (doc.settings.snapToGrid && !exporting) {
      const want = !NO_GRID_TOOLS.has(s.session.tool) || s.mergeOpen ? 1 : 0;
      gridA += (want - gridA) * 0.3;
      if (Math.abs(want - gridA) < 0.02) gridA = want;
      else t.invalidate();
      drawGrid(g, toScreen, vp.pxPerMeter, doc.site.boundary, doc.settings.gridStepM, gridA, expandBBox(visibleWorldBBox(vp, t.viewSize), 1));
    }
    if (!plotLayer || plotLayer.visible) drawBoundary(g, toScreen, doc.site.boundary, vp.pxPerMeter, s.session.mode === 'night');
    // Bemaßungen
    for (const lid of doc.layerOrder) {
      const layer = doc.layers[lid];
      if (!layer.visible) continue;
      for (const id of layer.objectOrder) {
        const o = doc.objects[id];
        if (o?.type === 'dimension' && !o.hidden) drawDimension(g, t.labels, toScreen, o, doc);
      }
    }
    if (exporting) {
      t.labels.end();
      return gridA;
    }
    // Hover
    const hover = s.session.hoverId && !s.session.selection.includes(s.session.hoverId) ? doc.objects[s.session.hoverId] : null;
    t.hoverG.clear();
    t.hoverG.alpha = 0.55;
    if (hover) drawSelection(t.hoverG, toScreen, hover, doc, false, null);
    // Auswahl
    const single = s.session.selection.length === 1;
    for (const id of s.session.selection) {
      const o = doc.objects[id];
      if (!o) continue;
      const active = s.session.activeNode?.objectId === id ? s.session.activeNode.nodeIndex : null;
      drawSelection(g, toScreen, o, doc, single, active);
    }
  }
  const pg = t.previewG;
  pg.clear();
  if (t.preview) t.preview(pg, toScreen, t.labels);
  t.labels.end();
  return gridA;
}
