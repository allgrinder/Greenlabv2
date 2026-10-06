/**
 * PlanRenderer: Pixi-Application, Abgleich Store → Szenengraph, Viewport, Culling, Overlays.
 *
 * - Retained Mode: jedes Objekt hat einen eigenen Knoten, der nur bei Referenzänderung neu entsteht.
 * - Zoom/Pan ändern nur die Transformation des Welt-Containers.
 * - Gerendert wird auf Anforderung (dirty-Flag + requestAnimationFrame), nicht im Dauerlauf.
 */
import { Application, BlurFilter, Container, Graphics, RenderTexture, Sprite, Texture } from 'pixi.js';
import { getSpecies } from '../core/catalog/plants';
import { bbox, expandBBox } from '../core/geometry/polygon';
import type { Id, PlanObject, Project, Vec2 } from '../core/model/types';
import type { EditorStoreApi, EditorStore } from '../state/store';
import type { Viewport } from '../state/types';
import { LabelPool, drawBoundary, drawDimension, drawGrid, drawSelection, type ToScreen } from './overlays/overlay';
import { SpatialIndex } from './SpatialIndex';
import { buildObjectView, type ObjectView } from './views/objectView';
import { screenToWorld, visibleWorldBBox, worldToScreen, type ScreenSize } from './Viewport';
import { materialPattern } from './textures/materialTextures';
import { getMaterial } from '../core/catalog/materials';

interface Mounted {
  ref: PlanObject;
  view: ObjectView;
  lod: number;
}

/** Vorschau eines Werkzeugs, im Bildschirmraum gezeichnet */
export type PreviewDrawer = (g: Graphics, toScreen: ToScreen, labels: LabelPool) => void;

const lodFor = (ppm: number) => (ppm < 6 ? 0 : ppm < 14 ? 1 : 2);
/** Objekte, deren Darstellung von der Detailstufe abhängt */
const lodSensitive = (o: PlanObject) => o.type === 'planting' || (o.type === 'plant' && getSpecies(o.speciesId).kind === 'tree');

export class PlanRenderer {
  readonly app = new Application();
  readonly index = new SpatialIndex();
  private world = new Container();
  private ground = new Graphics();
  private groundTex = new Graphics();
  private background = new Sprite(Texture.EMPTY);
  private layers = new Map<Id, Container>();
  private shadows = new Container();
  private shadowBlur = new BlurFilter({ strength: 4, quality: 3 });
  private overlay = new Graphics();
  private hoverG = new Graphics();
  private previewG = new Graphics();
  private labels = new LabelPool();
  private mounted = new Map<Id, Mounted>();
  private preview: PreviewDrawer | null = null;
  private unsub: (() => void) | null = null;
  private resizeObs: ResizeObserver | null = null;
  private frame = 0;
  private lastDoc: Project | null = null;
  private lastLod = -1;
  private bgUrl: string | null = null;
  size: ScreenSize = { width: 1, height: 1 };

  constructor(private store: EditorStoreApi) {}

  async init(host: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: host,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      autoStart: false,
      preference: 'webgl',
    });
    host.appendChild(this.app.canvas);
    this.app.canvas.style.display = 'block';
    this.app.canvas.style.touchAction = 'none';

    this.shadows.filters = [this.shadowBlur];
    this.shadows.alpha = 0.3;
    this.groundTex.alpha = 0.35;
    // Reihenfolge: Erdton → Mulchstruktur → Hintergrundbild (mit Deckkraft) → Ebenen
    this.world.addChild(this.ground, this.groundTex, this.background);
    this.app.stage.addChild(this.world, this.hoverG, this.overlay, this.previewG, this.labels.container);

    this.resizeObs = new ResizeObserver(() => {
      this.app.resize();
      this.size = { width: host.clientWidth, height: host.clientHeight };
      this.invalidate();
    });
    this.resizeObs.observe(host);
    this.size = { width: host.clientWidth, height: host.clientHeight };

    this.unsub = this.store.subscribe(() => this.invalidate());
    // Schriften können nach dem ersten Frame nachladen
    document.fonts?.ready.then(() => this.rebuildAll());
    this.invalidate();
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.unsub?.();
    this.resizeObs?.disconnect();
    this.app.destroy(true, { children: true });
  }

  invalidate(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.renderNow();
    });
  }

  setPreview(p: PreviewDrawer | null): void {
    this.preview = p;
    this.invalidate();
  }

  /** Hintergrundbild (Object-URL) setzen; Lage kommt aus doc.background */
  setBackgroundUrl(url: string | null): void {
    if (url === this.bgUrl) return;
    this.bgUrl = url;
    if (!url) {
      this.background.texture = Texture.EMPTY;
      this.invalidate();
      return;
    }
    const img = new Image();
    img.onload = () => {
      if (this.bgUrl !== url) return;
      this.background.texture = Texture.from(img);
      this.invalidate();
    };
    img.src = url;
  }

  /** Während des Exports: feste Ansicht statt der Sitzungs-Ansicht */
  private exportView: { vp: Viewport; size: ScreenSize } | null = null;

  private get vp(): Viewport {
    return this.exportView?.vp ?? this.store.getState().session.viewport;
  }

  private get viewSize(): ScreenSize {
    return this.exportView?.size ?? this.size;
  }

  toScreen = (p: Vec2): Vec2 => worldToScreen(this.vp, this.viewSize, p);
  toWorld = (p: Vec2): Vec2 => screenToWorld(this.vp, this.viewSize, p);

  /**
   * Plan als PNG: rendert offscreen in eine RenderTexture im gewünschten Maßstab
   * (ohne Auswahl, Hover, Raster und Werkzeugvorschau).
   */
  async exportPng(opts: { pxPerMeter: number; marginM: number; background: string | null; uiScale?: number }): Promise<{ blob: Blob; width: number; height: number }> {
    const doc = this.store.getState().doc;
    if (!doc) throw new Error('Kein Projekt geladen');
    const b = expandBBox(bbox(doc.site.boundary), opts.marginM);
    const maxTex = 8192;
    const ppm = Math.min(opts.pxPerMeter, maxTex / (b.maxX - b.minX), maxTex / (b.maxY - b.minY));
    const size = { width: Math.round((b.maxX - b.minX) * ppm), height: Math.round((b.maxY - b.minY) * ppm) };
    const vp: Viewport = { center: { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }, pxPerMeter: ppm, rotationDeg: 0 };
    const rt = RenderTexture.create({ width: size.width, height: size.height, resolution: 1, antialias: true });
    const bg = new Graphics();
    if (opts.background) bg.rect(0, 0, size.width, size.height).fill(opts.background);
    this.exportView = { vp, size };
    try {
      const s = this.store.getState();
      const lod = 2;
      this.reconcile(doc, lod);
      this.lastLod = lod;
      this.lastDoc = doc;
      this.applyBackground(doc);
      this.applyViewport(vp);
      this.cull(doc, vp);
      // Linien und Maßzahlen in Druckgröße: Overlay in reduzierter Auflösung zeichnen und hochskalieren
      const k = opts.uiScale ?? 1;
      this.exportView = { vp: { ...vp, pxPerMeter: ppm / k }, size: { width: size.width / k, height: size.height / k } };
      this.overlay.scale.set(k);
      this.labels.container.scale.set(k);
      this.drawOverlay(s, true);
      this.app.stage.addChildAt(bg, 0);
      this.app.renderer.render({ container: this.app.stage, target: rt, clear: true });
      const canvas = this.app.renderer.extract.canvas(rt) as HTMLCanvasElement;
      const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((x) => (x ? res(x) : rej(new Error('PNG-Erzeugung fehlgeschlagen'))), 'image/png'));
      return { blob, ...size };
    } finally {
      this.app.stage.removeChild(bg);
      bg.destroy();
      this.overlay.scale.set(1);
      this.labels.container.scale.set(1);
      rt.destroy(true);
      this.exportView = null;
      this.invalidate();
    }
  }

  private rebuildAll() {
    for (const m of this.mounted.values()) this.unmount(m);
    this.mounted.clear();
    this.lastDoc = null;
    this.invalidate();
  }

  /** Letzte Frame-Dauern in ms (Abgleich + Zeichnen), für Benchmarks */
  readonly frameTimes: number[] = [];

  private renderNow(): void {
    const t0 = performance.now();
    const s = this.store.getState();
    const doc = s.doc;
    const vp = this.vp;
    if (doc) {
      const lod = lodFor(vp.pxPerMeter);
      if (doc !== this.lastDoc || lod !== this.lastLod) this.reconcile(doc, lod);
      this.lastDoc = doc;
      this.lastLod = lod;
      this.applyBackground(doc);
    }
    this.applyViewport(vp);
    if (doc) this.cull(doc, vp);
    this.drawOverlay(s);
    this.app.render();
    this.frameTimes.push(performance.now() - t0);
    if (this.frameTimes.length > 240) this.frameTimes.shift();
  }

  /** Szenengraph an das Dokument angleichen */
  private reconcile(doc: Project, lod: number) {
    this.index.sync(doc);
    this.syncLayers(doc);
    // Entfernte Objekte
    for (const [id, m] of this.mounted) {
      if (!doc.objects[id]) {
        this.unmount(m);
        this.mounted.delete(id);
      }
    }
    // Neue/geänderte Objekte
    for (const o of Object.values(doc.objects)) {
      const m = this.mounted.get(o.id);
      const needs = !m || m.ref !== o || (lodSensitive(o) && m.lod !== lod);
      if (!needs) continue;
      if (m) this.unmount(m);
      const view = buildObjectView(o, { lod });
      this.mounted.set(o.id, { ref: o, view, lod });
    }
    // Reihenfolge je Ebene herstellen
    for (const lid of doc.layerOrder) {
      const layer = doc.layers[lid];
      const c = this.layers.get(lid)!;
      layer.objectOrder.forEach((id, i) => {
        const m = this.mounted.get(id);
        if (!m) return;
        if (m.view.node.parent !== c) c.addChild(m.view.node);
        if (c.getChildIndex(m.view.node) !== i) c.setChildIndex(m.view.node, Math.min(i, c.children.length - 1));
        if (m.view.shadow && m.view.shadow.parent !== this.shadows) this.shadows.addChild(m.view.shadow);
      });
    }
    this.drawGround(doc);
  }

  private syncLayers(doc: Project) {
    for (const [id, c] of this.layers) {
      if (!doc.layers[id]) {
        c.destroy({ children: true });
        this.layers.delete(id);
      }
    }
    const order: Container[] = [];
    for (const id of doc.layerOrder) {
      let c = this.layers.get(id);
      if (!c) {
        c = new Container();
        c.label = `layer:${doc.layers[id].kind}`;
        this.layers.set(id, c);
      }
      // Schatten liegen direkt unter den Pflanzen (über Flächen und Wegen)
      if (doc.layers[id].kind === 'plants') order.push(this.shadows);
      order.push(c);
    }
    const base = 3; // ground, groundTex, background
    order.forEach((c, i) => {
      if (c.parent !== this.world) this.world.addChild(c);
      this.world.setChildIndex(c, base + i);
    });
  }

  private unmount(m: Mounted) {
    m.view.node.destroy({ children: true });
    m.view.shadow?.destroy();
  }

  /** Grundstücksfläche: Erdton mit angedeuteter Mulchstruktur (35 %), wie im Design */
  private drawGround(doc: Project) {
    const b = doc.site.boundary;
    this.ground.clear();
    this.groundTex.clear();
    if (b.length < 3) return;
    const pts = b.flatMap((p) => [p.x, p.y]);
    this.ground.poly(pts, true).fill(0xd3c9b3);
    this.groundTex.poly(pts, true).fill(materialPattern(getMaterial('mulch')));
  }

  private applyBackground(doc: Project) {
    const bg = doc.background;
    const sp = this.background;
    if (!bg || !bg.visible || !this.bgUrl) {
      sp.visible = false;
      return;
    }
    sp.visible = true;
    sp.position.set(bg.origin.x, bg.origin.y);
    sp.scale.set(bg.metersPerPixel);
    sp.rotation = (bg.rotationDeg * Math.PI) / 180;
    sp.alpha = bg.opacity;
  }

  private applyViewport(vp: Viewport) {
    const { width, height } = this.viewSize;
    this.world.scale.set(vp.pxPerMeter);
    this.world.position.set(width / 2 - vp.center.x * vp.pxPerMeter, height / 2 - vp.center.y * vp.pxPerMeter);
    // Weichzeichnung in Weltmetern konstant halten
    this.shadowBlur.strength = Math.max(1, Math.min(40, 0.16 * vp.pxPerMeter));
  }

  /** Nur Objekte im sichtbaren Bereich zeichnen */
  private cull(doc: Project, vp: Viewport) {
    const visible = new Set(this.index.query(expandBBox(visibleWorldBBox(vp, this.viewSize), 2)));
    for (const [id, m] of this.mounted) {
      const o = doc.objects[id];
      const layer = o && doc.layers[o.layerId];
      const on = !!o && !!layer && layer.visible && !o.hidden && visible.has(id);
      m.view.node.visible = on;
      if (m.view.shadow) m.view.shadow.visible = on;
    }
  }

  private drawOverlay(s: EditorStore, exporting = false) {
    const g = this.overlay;
    g.clear();
    this.hoverG.clear();
    this.previewG.clear();
    this.labels.begin();
    const doc = s.doc;
    const vp = this.vp;
    const toScreen = this.toScreen;
    if (doc) {
      const plotLayer = doc.layerOrder.map((id) => doc.layers[id]).find((l) => l.kind === 'plot');
      if (doc.settings.snapToGrid && !exporting) drawGrid(g, toScreen, vp.pxPerMeter, doc.site.boundary, doc.settings.gridStepM);
      if (!plotLayer || plotLayer.visible) drawBoundary(g, toScreen, doc.site.boundary, vp.pxPerMeter, s.session.mode === 'night');
      // Bemaßungen
      for (const lid of doc.layerOrder) {
        const layer = doc.layers[lid];
        if (!layer.visible) continue;
        for (const id of layer.objectOrder) {
          const o = doc.objects[id];
          if (o?.type === 'dimension' && !o.hidden) drawDimension(g, this.labels, toScreen, o, doc);
        }
      }
      if (exporting) {
        this.labels.end();
        return;
      }
      // Hover
      const hover = s.session.hoverId && !s.session.selection.includes(s.session.hoverId) ? doc.objects[s.session.hoverId] : null;
      this.hoverG.clear();
      this.hoverG.alpha = 0.55;
      if (hover) drawSelection(this.hoverG, toScreen, hover, doc, false, null);
      // Auswahl
      const single = s.session.selection.length === 1;
      for (const id of s.session.selection) {
        const o = doc.objects[id];
        if (!o) continue;
        const active = s.session.activeNode?.objectId === id ? s.session.activeNode.nodeIndex : null;
        drawSelection(g, toScreen, o, doc, single, active);
      }
    }
    const pg = this.previewG;
    pg.clear();
    if (this.preview) this.preview(pg, toScreen, this.labels);
    this.labels.end();
  }
}
