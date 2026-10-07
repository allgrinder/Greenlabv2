/**
 * PlanRenderer: Pixi-Application, Abgleich Store → Szenengraph, Viewport, Culling, Overlays.
 *
 * - Retained Mode: jedes Objekt hat einen eigenen Knoten, der nur bei Referenzänderung neu entsteht.
 * - Zoom/Pan ändern nur die Transformation des Welt-Containers.
 * - Gerendert wird auf Anforderung (dirty-Flag + requestAnimationFrame), nicht im Dauerlauf.
 */
import { Application, Container, Graphics, RenderTexture, Sprite, Texture } from 'pixi.js';
import type { Season } from '../core/growth';
import { getSpecies } from '../core/catalog/plants';
import { coverage } from '../core/irrigation';
import { lensShowsLayer } from '../core/lens';
import { privacyGrid } from '../core/privacy';
import { PrivacyLayer } from './effects/PrivacyLayer';
import { lampLevel, scheduledOn } from '../core/lighting';
import { bbox, expandBBox } from '../core/geometry/polygon';
import type { FlatRegion } from '../core/geometry/shape';
import type { Id, LampObject, PlanObject, Project, Vec2 } from '../core/model/types';
import { sunHours } from '../core/sun/shadows';
import { DEFAULT_LOCATION, dayInfo, shadowVector, sunAt } from '../core/sun/sun';
import type { EditorStoreApi, EditorStore } from '../state/store';
import type { LensTab, SessionState, Viewport } from '../state/types';
import { GapLayer } from './effects/GapLayer';
import { HeatLayer } from './effects/HeatLayer';
import { NightLayer } from './effects/NightLayer';
import { ShadowLayer } from './effects/ShadowLayer';
import { LabelPool, drawBoundary, drawDimension, drawGrid, drawSelection, type ToScreen } from './overlays/overlay';
import { SpatialIndex } from './SpatialIndex';
import { buildObjectView, viewKey, type ObjectView, type ViewContext } from './views/objectView';
import { screenToWorld, visibleWorldBBox, worldToScreen, type ScreenSize } from './Viewport';
import { materialPattern } from './textures/materialTextures';
import { getMaterial } from '../core/catalog/materials';

interface Mounted {
  ref: PlanObject;
  view: ObjectView;
  key: string;
}

/** Was die Darstellung beeinflusst; für Exporte und Jahreszeiten-Vorschau überschreibbar */
export interface ViewParams {
  lens: LensTab;
  night: boolean;
  years: number;
  season: Season;
  /** Sonnenstand-Linse: Tag im Jahr und Uhrzeit */
  sun: { doy: number; hour: number; heat: boolean };
  nightHour: number;
  scene: string | null;
}

/** Schatten der Planansicht ohne Sonnenlinse: Sonne aus Südost, wie im Design */
const DESIGN_SHADOW: Vec2 = { x: 0.12, y: 0.15 };

export const seasonOfDoy = (doy: number): Season => (doy < 80 || doy >= 355 ? 'winter' : doy < 172 ? 'spring' : doy < 266 ? 'summer' : 'autumn');

/** Zeichenreihenfolge in der Pflanzenebene: niedrig vor hoch (stabil innerhalb einer Stufe) */
function heightRank(o: PlanObject | undefined): number {
  if (!o) return 0;
  if (o.type === 'planting' || o.type === 'scatter') return 0;
  if (o.type === 'hedge') return 2;
  if (o.type === 'espalier') return 3;
  if (o.type === 'plant') {
    const k = getSpecies(o.speciesId).kind;
    return k === 'tree' ? 5 : k === 'shrub' || k === 'espalier' || k === 'hedge' ? 4 : 1;
  }
  return 1;
}

export function viewParamsFrom(s: SessionState): ViewParams {
  return {
    lens: s.lens,
    night: s.mode === 'night',
    years: s.lens === 'growth' ? s.years : 0,
    season: s.lens === 'seasons' ? s.season : s.lens === 'sun' ? seasonOfDoy(s.sun.doy) : 'summer',
    sun: s.sun,
    nightHour: s.night.hour,
    scene: s.night.scene,
  };
}

/** Vorschau eines Werkzeugs, im Bildschirmraum gezeichnet */
export type PreviewDrawer = (g: Graphics, toScreen: ToScreen, labels: LabelPool) => void;

const lodFor = (ppm: number) => (ppm < 6 ? 0 : ppm < 14 ? 1 : 2);

export class PlanRenderer {
  readonly app = new Application();
  readonly index = new SpatialIndex();
  private world = new Container();
  private ground = new Graphics();
  private groundTex = new Graphics();
  private background = new Sprite(Texture.EMPTY);
  private layers = new Map<Id, Container>();
  private shadowLayer = new ShadowLayer();
  private heatLayer = new HeatLayer();
  private gapLayer = new GapLayer();
  private privacyLayer = new PrivacyLayer();
  private privacyKey = '';
  private privacyDoc: Project | null = null;
  private privacyTimer: ReturnType<typeof setTimeout> | null = null;
  private night = new NightLayer();
  private nightGlowWrap = new Container();
  private heatKey = '';
  private heatTimer: ReturnType<typeof setTimeout> | null = null;
  private gapDoc: Project | null = null;
  private gaps: FlatRegion[] = [];
  /** Ansicht für Export/Vorschau statt der Sitzung */
  private viewOverride: ViewParams | null = null;
  private lastCtxKey = '';
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

    this.groundTex.alpha = 0.35;
    // Reihenfolge: Erdton → Mulchstruktur → Hintergrundbild (mit Deckkraft) → Ebenen
    this.world.addChild(this.ground, this.groundTex, this.background);
    this.nightGlowWrap.addChild(this.night.glow);
    this.app.stage.addChild(this.world, this.night.overlay, this.nightGlowWrap, this.hoverG, this.overlay, this.previewG, this.labels.container);

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
  async exportPng(opts: { pxPerMeter: number; marginM: number; background: string | null; uiScale?: number; view?: Partial<ViewParams>; overlays?: boolean }): Promise<{ blob: Blob; width: number; height: number }> {
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
    // Exporte zeigen Planlinse (ohne Heatmap/Wachstum), außer die Ansicht wird ausdrücklich vorgegeben
    const base = viewParamsFrom(this.store.getState().session);
    this.viewOverride = { ...base, lens: 'plan', years: 0, season: 'summer', ...opts.view };
    let canvas: HTMLCanvasElement;
    try {
      const s = this.store.getState();
      const lod = 2;
      this.reconcile(doc, lod);
      this.lastLod = lod;
      this.lastDoc = doc;
      this.applyBackground(doc);
      this.applyViewport(vp);
      this.cull(doc, vp);
      this.applyEffects(doc, true);
      // Linien und Maßzahlen in Druckgröße: Overlay in reduzierter Auflösung zeichnen und hochskalieren
      const k = opts.uiScale ?? 1;
      this.exportView = { vp: { ...vp, pxPerMeter: ppm / k }, size: { width: size.width / k, height: size.height / k } };
      this.overlay.scale.set(k);
      this.labels.container.scale.set(k);
      if (opts.overlays === false) {
        this.overlay.clear();
        this.labels.begin();
        this.labels.end();
      } else this.drawOverlay(s, true);
      this.app.stage.addChildAt(bg, 0);
      this.app.renderer.render({ container: this.app.stage, target: rt, clear: true });
      canvas = this.app.renderer.extract.canvas(rt) as HTMLCanvasElement;
    } finally {
      this.app.stage.removeChild(bg);
      bg.destroy();
      this.overlay.scale.set(1);
      this.labels.container.scale.set(1);
      rt.destroy(true);
      this.exportView = null;
      this.viewOverride = null;
      this.lastCtxKey = '';
      this.invalidate();
    }
    // Erst nach dem Zurücksetzen warten, damit der Bildschirm nie den Exportzustand zeigt
    const c = canvas;
    const blob = await new Promise<Blob>((res, rej) => c.toBlob((x) => (x ? res(x) : rej(new Error('PNG-Erzeugung fehlgeschlagen'))), 'image/png'));
    return { blob, ...size };
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
      const ck = this.ctxKey(doc);
      if (doc !== this.lastDoc || lod !== this.lastLod || ck !== this.lastCtxKey) this.reconcile(doc, lod);
      this.lastDoc = doc;
      this.lastLod = lod;
      this.applyBackground(doc);
    }
    this.applyViewport(vp);
    if (doc) {
      this.cull(doc, vp);
      this.applyEffects(doc, false);
    }
    this.drawOverlay(s);
    this.app.render();
    this.frameTimes.push(performance.now() - t0);
    if (this.frameTimes.length > 240) this.frameTimes.shift();
  }

  /** Szenengraph an das Dokument angleichen */
  private get params(): ViewParams {
    return this.viewOverride ?? viewParamsFrom(this.store.getState().session);
  }

  private viewCtx(doc: Project, lod: number): ViewContext {
    const p = this.params;
    return { lod, years: p.years, season: p.season, lens: p.lens, night: p.night, northDeg: doc.site.northDeg };
  }

  private ctxKey(doc: Project): string {
    const p = this.params;
    return `${p.years}|${p.season}|${p.lens}|${p.night}|${doc.site.northDeg}`;
  }

  private reconcile(doc: Project, lod: number) {
    const ctx = this.viewCtx(doc, lod);
    this.lastCtxKey = this.ctxKey(doc);
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
      const key = viewKey(o, ctx);
      const needs = !m || m.ref !== o || m.key !== key;
      if (!needs) continue;
      if (m) this.unmount(m);
      const view = buildObjectView(o, ctx);
      this.mounted.set(o.id, { ref: o, view, key });
    }
    // Reihenfolge je Ebene herstellen
    for (const lid of doc.layerOrder) {
      const layer = doc.layers[lid];
      const c = this.layers.get(lid)!;
      // Pflanzen: Bodendecker und Stauden unter Hecken, Spalieren, Sträuchern und Kronen
      const order = layer.kind === 'plants' ? [...layer.objectOrder].sort((a, b) => heightRank(doc.objects[a]) - heightRank(doc.objects[b])) : layer.objectOrder;
      order.forEach((id, i) => {
        const m = this.mounted.get(id);
        if (!m) return;
        if (m.view.node.parent !== c) c.addChild(m.view.node);
        if (c.getChildIndex(m.view.node) !== i) c.setChildIndex(m.view.node, Math.min(i, c.children.length - 1));
      });
    }
    this.drawGround(doc);
    this.shadowLayer.setClip(doc.site.boundary);
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
      // Heatmap und Schatten liegen direkt unter den Pflanzen (über Flächen und Wegen)
      if (doc.layers[id].kind === 'plants') order.push(this.heatLayer.container, this.shadowLayer.container);
      order.push(c);
      // Bewässerungslücken über der Bewässerungsebene
      if (doc.layers[id].kind === 'water') order.push(this.gapLayer.container);
    }
    order.push(this.privacyLayer.container);
    const base = 3; // ground, groundTex, background
    order.forEach((c, i) => {
      if (c.parent !== this.world) this.world.addChild(c);
      this.world.setChildIndex(c, base + i);
    });
  }

  private unmount(m: Mounted) {
    m.view.node.destroy({ children: true });
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
    this.shadowLayer.setScale(vp.pxPerMeter);
    this.heatLayer.setScale(vp.pxPerMeter);
    this.privacyLayer.setScale(vp.pxPerMeter);
  }

  /** Nur Objekte im sichtbaren Bereich zeichnen */
  private cull(doc: Project, vp: Viewport) {
    const visible = new Set(this.index.query(expandBBox(visibleWorldBBox(vp, this.viewSize), 2)));
    const p = this.params;
    for (const [id, m] of this.mounted) {
      const o = doc.objects[id];
      const layer = o && doc.layers[o.layerId];
      const on = !!o && !!layer && layer.visible && lensShowsLayer(layer.kind, p.lens, p.night) && !o.hidden && visible.has(id);
      m.view.node.visible = on;
    }
  }

  private dayCache = new Map<string, { sunrise: number; sunset: number }>();

  private sunTimes(doc: Project, doy: number) {
    const loc = doc.site.location ?? DEFAULT_LOCATION;
    const key = `${loc.lat},${loc.lon},${doy}`;
    let v = this.dayCache.get(key);
    if (!v) {
      const d = dayInfo(loc, new Date().getFullYear(), doy);
      v = { sunrise: d.sunrise ?? 6, sunset: d.sunset ?? 20 };
      this.dayCache.set(key, v);
    }
    return v;
  }

  /** Sonnenschatten, Heatmap, Bewässerungslücken, Nachtlicht und Ebenen-Abblendung */
  private applyEffects(doc: Project, exporting: boolean) {
    const p = this.params;
    const loc = doc.site.location ?? DEFAULT_LOCATION;
    const year = new Date().getFullYear();
    // Schatten
    let sv: Vec2 | null = DESIGN_SHADOW;
    if (p.night) sv = null;
    else if (p.lens === 'sun') sv = shadowVector(sunAt(loc, year, p.sun.doy, p.sun.hour), doc.site.northDeg);
    this.shadowLayer.update(doc, sv, p.years, p.season, p.lens === 'sun' ? 0.34 : 0.3);
    // Heatmap (Sonnenstunden hängen nur vom Tag ab, nicht von der Uhrzeit)
    const heatOn = p.lens === 'sun' && p.sun.heat && !p.night;
    if (!heatOn) {
      this.heatLayer.container.visible = false;
    } else {
      const key = `${p.sun.doy}|${loc.lat}|${loc.lon}|${doc.site.northDeg}`;
      if (key !== this.heatKey || this.heatDoc !== doc) {
        this.heatKey = key;
        this.heatDoc = doc;
        if (this.heatTimer) clearTimeout(this.heatTimer);
        const run = () => {
          this.heatLayer.set(sunHours(doc, loc, year, p.sun.doy, { cell: 0.5, stepMin: 20, season: seasonOfDoy(p.sun.doy) }), doc.site.boundary);
          this.invalidate();
        };
        if (exporting) run();
        else this.heatTimer = setTimeout(run, 120);
      } else this.heatLayer.container.visible = true;
    }
    // Bewässerung: Lücken und Abblendung der übrigen Ebenen
    const irr = p.lens === 'irrigation';
    if (irr && this.gapDoc !== doc) {
      this.gapDoc = doc;
      try {
        this.gaps = coverage(doc).gaps;
      } catch (e) {
        console.error(e);
        this.gaps = [];
      }
    }
    this.gapLayer.set(irr ? this.gaps : null);
    // Einsehbarkeit (nur im Editor, nicht im Export)
    const pv = this.store.getState().session.privacy;
    if (!pv.on || exporting || p.lens !== 'plan') this.privacyLayer.hide();
    else {
      const key = `${pv.pose}|${pv.season}`;
      if (key !== this.privacyKey || this.privacyDoc !== doc) {
        this.privacyKey = key;
        this.privacyDoc = doc;
        if (this.privacyTimer) clearTimeout(this.privacyTimer);
        this.privacyTimer = setTimeout(() => {
          const d = this.store.getState().doc;
          if (!d) return;
          if (d.observers.length) this.privacyLayer.set(privacyGrid(d, { season: pv.season, pose: pv.pose }), d.site.boundary, d.observers);
          else this.privacyLayer.hide();
          this.invalidate();
        }, 150);
      } else if (doc.observers.length) this.privacyLayer.container.visible = true;
    }
    for (const lid of doc.layerOrder) {
      const kind = doc.layers[lid].kind;
      const c = this.layers.get(lid);
      if (c) c.alpha = irr && kind !== 'water' && kind !== 'pipes' && kind !== 'plot' ? 0.55 : 1;
    }
    // Nacht
    this.night.setVisible(p.night);
    if (p.night) {
      const t = this.sunTimes(doc, p.sun.doy);
      const wd = (new Date().getDay() + 6) % 7;
      const level = (l: LampObject) => lampLevel(l, p.scene, () => scheduledOn(l, p.nightHour % 24, wd, t.sunset, t.sunrise));
      this.night.update(this.app.renderer, { doc, level, world: { scale: this.world.scale.x, x: this.world.position.x, y: this.world.position.y }, size: this.viewSize });
    }
  }

  private heatDoc: Project | null = null;

  /** Einmalige Ansicht als Bild, z. B. für die Jahreszeiten-Vorschau */
  async snapshot(view: Partial<ViewParams>, pxPerMeter: number): Promise<string> {
    const r = await this.exportPng({ pxPerMeter, marginM: 0.6, background: null, view, overlays: false });
    return URL.createObjectURL(r.blob);
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
