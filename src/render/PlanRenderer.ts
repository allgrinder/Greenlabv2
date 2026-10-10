/**
 * PlanRenderer: Pixi-Application, Abgleich Store → Szenengraph, Viewport, Culling, Overlays.
 *
 * - Retained Mode: jedes Objekt hat einen eigenen Knoten, der nur bei Referenzänderung neu entsteht.
 * - Zoom/Pan ändern nur die Transformation des Welt-Containers.
 * - Gerendert wird auf Anforderung (dirty-Flag + requestAnimationFrame), nicht im Dauerlauf.
 */
import { Application, Container, Graphics, RenderTexture, Sprite, Texture } from 'pixi.js';
import { coverage } from '../core/irrigation';
import { lensShowsObject } from '../core/lens';
import { privacyGrid } from '../core/privacy';
import { PrivacyLayer } from './effects/PrivacyLayer';
import { lampLevel, scheduledOn } from '../core/lighting';
import { bbox, expandBBox } from '../core/geometry/polygon';
import type { FlatRegion } from '../core/geometry/shape';
import type { Id, LampObject, PlanObject, Project, Vec2 } from '../core/model/types';
import { sunHours } from '../core/sun/shadows';
import { DEFAULT_LOCATION, shadowVector, sunAt } from '../core/sun/sun';
import type { EditorStoreApi, EditorStore } from '../state/store';
import type { SessionState, Viewport } from '../state/types';
import { GapLayer } from './effects/GapLayer';
import { HeatLayer } from './effects/HeatLayer';
import { NightLayer } from './effects/NightLayer';
import { ShadowLayer } from './effects/ShadowLayer';
import { EdgeLayer } from './effects/EdgeLayer';
import { LabelPool } from './overlays/overlay';
import { SpatialIndex } from './SpatialIndex';
import { buildObjectView, viewKey, type ViewContext } from './views/objectView';
import { screenToWorld, tiltCos, tiltTan, visibleWorldBBox, worldToScreen, type ScreenSize } from './Viewport';
import { isOrganic, warmMaterialTextures } from './textures/materialTextures';
import { idle } from './util/idle';
import { allGroundTextures, groundManifestVersion, loadGroundAssets } from './assets/groundAssets';
import { persistTextureCache, restoreTextureCache } from './textures/texCache';
import { loadItemAssets, preloadItems } from './assets/itemAssets';
import { loadPlantAssets, preloadPlants } from './assets/plantAssets';
import { MATERIALS } from '../core/catalog/materials';
import { DESIGN_SHADOW, lodFor, seasonOfDoy, sunTimes, viewParamsFrom, type ViewParams } from './viewParams';
import { itemsOf, speciesOf } from './planContents';
import { orderNodes, PLANT_TYPES, syncLayers, type Mounted } from './sceneOrder';
import { applyBackground, drawGroundShape } from './planGround';
import { drawOverlay, type PreviewDrawer } from './planOverlay';
import { exportFrame } from './exportFrame';

export type { ViewParams } from './viewParams';
export type { PreviewDrawer } from './planOverlay';

export class PlanRenderer {
  readonly app = new Application();
  readonly index = new SpatialIndex();
  private world = new Container();
  private ground = new Graphics();
  private groundTex = new Graphics();
  private background = new Sprite(Texture.EMPTY);
  private layers = new Map<Id, Container>();
  /** Schrägansicht: Körper aller Ebenen, nach Tiefe sortiert */
  private solids = new Container();
  private shadowLayer = new ShadowLayer();
  private edgeLayer = new EdgeLayer();
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
  private gapShown: FlatRegion[] | null = null;
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
  /** Bis alle Bildsätze geladen und vorbereitet sind, wird nicht bei jedem Teil neu aufgebaut */
  private booting = true;
  private readyResolve!: () => void;
  /** erfüllt, sobald Objekt-, Boden- und Pflanzenmanifest geladen, Texturen vorberechnet und hochgeladen sind */
  readonly ready = new Promise<void>((res) => (this.readyResolve = res));
  /** Ladefortschritt 0…1 für die Startseite */
  progress = 0;
  onProgress: ((p: number) => void) | null = null;
  private frameWaiters: (() => void)[] = [];
  private uploaded = new WeakSet<object>();
  private destroyed = false;
  /** Deckkraft des Zeichenrasters: nur beim Zeichnen und Verschieben sichtbar, weich ein- und ausgeblendet */
  private gridA = 0;

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
    this.solids.label = 'solids';
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
    void this.boot();
    this.invalidate();
  }

  /**
   * Alle Bildsätze im Hintergrund laden, Bodentexturen vorberechnen und auf die Grafikkarte legen –
   * erst danach einmal aufbauen (statt nach jedem Teil). Läuft, während die Startseite offen ist.
   */
  private async boot() {
    const steps = 6;
    let done = 0;
    const step = () => {
      this.progress = Math.min(1, ++done / steps);
      this.onProgress?.(this.progress);
    };
    const rebuild = () => !this.booting && this.rebuildAll();
    await Promise.all([
      loadItemAssets(() => (this.booting ? undefined : this.rebuildType('item'))).then(step),
      loadGroundAssets(rebuild).then(step),
      loadPlantAssets(() => (this.booting ? undefined : this.rebuildPlants())).then(step),
      (document.fonts?.ready ?? Promise.resolve()).then(step),
    ]);
    try {
      // ab dem 2. Start: fertig berechnete Bodentexturen aus dem Browser statt neu malen
      await restoreTextureCache(groundManifestVersion());
      const warm = await warmMaterialTextures(MATERIALS.map((m) => m.texture));
      await this.upload(warm);
      step();
      await this.upload(allGroundTextures((k) => !isOrganic(k)));
    } catch (e) {
      console.warn('Vorbereitung der Texturen unvollständig', e);
    }
    if (this.destroyed) return;
    step();
    this.booting = false;
    this.rebuildAll();
    this.readyResolve();
    void persistTextureCache(idle);
  }

  /** Texturen in kleinen Paketen auf die Grafikkarte legen, damit das erste Bild nicht stockt */
  private async upload(list: Texture[]) {
    // in der Entwicklung baut React StrictMode den ersten Renderer gleich wieder ab
    if (this.destroyed) return;
    const sys = (this.app.renderer as unknown as { texture?: { initSource?: (s: unknown) => void } }).texture;
    if (!sys?.initSource) return;
    let n = 0;
    for (const t of list) {
      const src = t.source;
      if (!src || this.uploaded.has(src)) continue;
      this.uploaded.add(src);
      sys.initSource(src);
      if (++n % 6 === 0) await idle();
    }
  }

  /** Pflanzen- und Objektbilder eines Gartens schon laden (z. B. beim Überfahren seiner Karte) */
  async prefetch(doc: Project): Promise<Texture[]> {
    const tilt = !!this.store.getState().session.viewport.tiltDeg;
    const [plants, items] = await Promise.all([
      preloadPlants(speciesOf(doc), [this.store.getState().session.season], tilt ? ['top', 'oblique'] : ['top']),
      preloadItems(itemsOf(doc), tilt),
    ]);
    return [...plants, ...items];
  }

  /** Vor dem Öffnen: Grundbilder bereit, Pflanzenbilder des Gartens geladen und hochgeladen */
  async prepare(doc: Project): Promise<void> {
    await this.ready;
    await this.upload(await this.prefetch(doc));
  }

  /** erfüllt nach dem nächsten gezeichneten Bild */
  nextFrame(): Promise<void> {
    return new Promise((res) => {
      this.frameWaiters.push(res);
      this.invalidate();
    });
  }

  /** Vorschaubild für die Startseite: ganzer Garten von oben, Sommer, ohne Hilfslinien */
  async thumbnail(maxPx = 1100): Promise<Blob | null> {
    const doc = this.store.getState().doc;
    if (!doc || this.booting) return null;
    const b = bbox(doc.site.boundary);
    const ext = Math.max(b.maxX - b.minX, b.maxY - b.minY) + 2;
    const { blob } = await this.exportPng({ pxPerMeter: maxPx / ext, marginM: 1, background: null, overlays: false, quick: true, view: { lens: 'plan', season: 'summer', night: false } });
    return blob;
  }

  destroy(): void {
    this.destroyed = true;
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
  async exportPng(opts: {
    pxPerMeter: number;
    marginM: number;
    background: string | null;
    uiScale?: number;
    view?: Partial<ViewParams>;
    overlays?: boolean;
    /** Vorschaubild: vorhandene Bilder nehmen, nichts nachladen und nicht neu aufbauen */
    quick?: boolean;
  }): Promise<{ blob: Blob; width: number; height: number }> {
    const doc = this.store.getState().doc;
    if (!doc) throw new Error('Kein Projekt geladen');
    if (!opts.quick) {
      // Pflanzenbilder der Export-Jahreszeit vorher laden (sonst gemalte Ersatzdarstellung)
      await Promise.all([preloadPlants(speciesOf(doc), [opts.view?.season ?? 'summer']), preloadItems(itemsOf(doc), false)]);
      this.rebuildAll();
    }
    const { ppm, size, vp } = exportFrame(doc, opts.pxPerMeter, opts.marginM);
    const rt = RenderTexture.create({ width: size.width, height: size.height, resolution: 1, antialias: true });
    const bg = new Graphics();
    if (opts.background) bg.rect(0, 0, size.width, size.height).fill(opts.background);
    this.exportView = { vp, size };
    // Exporte zeigen Planlinse (ohne Heatmap/Wachstum), außer die Ansicht wird ausdrücklich vorgegeben
    const base = viewParamsFrom(this.store.getState().session);
    this.viewOverride = { ...base, lens: 'plan', years: 0, season: 'summer', ...opts.view };
    let canvas: HTMLCanvasElement;
    const hidden: Container[] = [];
    try {
      const s = this.store.getState();
      const lod = opts.quick ? lodFor(ppm) : 2;
      this.reconcile(doc, lod);
      this.lastLod = lod;
      this.lastDoc = doc;
      this.applyBackground(doc);
      this.applyViewport(vp);
      this.cull(doc, vp);
      this.applyEffects(doc, true);
      // ohne Hilfslinien auch ohne Beschriftung und Maßketten (Vorschaubild)
      if (opts.overlays === false)
        for (const m of this.mounted.values())
          if (m.ref.type === 'text' || m.ref.type === 'dimension') {
            hidden.push(m.view.node);
            m.view.node.visible = false;
          }
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
      for (const n of hidden) n.visible = true;
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
    this.groundFor = null;
    for (const m of this.mounted.values()) this.unmount(m);
    this.mounted.clear();
    this.lastDoc = null;
    this.invalidate();
  }

  /** Nur Objekte neu aufbauen (neue Objektbilder sind da) */
  private rebuildType(type: PlanObject['type']) {
    for (const [id, m] of this.mounted)
      if (m.ref.type === type) {
        this.unmount(m);
        this.mounted.delete(id);
      }
    this.lastDoc = null;
    this.invalidate();
  }

  /** Nur Pflanzen neu aufbauen (neue Pflanzenbilder sind da) – Flächen, Wege und Objekte bleiben */
  private rebuildPlants() {
    for (const [id, m] of this.mounted)
      if (PLANT_TYPES.has(m.ref.type)) {
        this.unmount(m);
        this.mounted.delete(id);
      }
    this.lastDoc = null;
    this.invalidate();
  }

  /** Letzte Frame-Dauern in ms (Abgleich + Zeichnen), für Benchmarks; nur in der Entwicklung gefüllt */
  readonly frameTimes: number[] = [];

  private renderNow(): void {
    const t0 = import.meta.env.DEV ? performance.now() : 0;
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
    if (import.meta.env.DEV) {
      this.frameTimes.push(performance.now() - t0);
      if (this.frameTimes.length > 240) this.frameTimes.shift();
    }
    const w = this.frameWaiters.splice(0);
    w.forEach((f) => f());
  }

  /** Szenengraph an das Dokument angleichen */
  private get params(): ViewParams {
    if (this.viewOverride) return this.viewOverride;
    // je Sitzungsstand einmal berechnen (wird pro Bild an mehreren Stellen gebraucht)
    const ss = this.store.getState().session;
    if (ss !== this.paramsFor) {
      this.paramsFor = ss;
      this.paramsCache = viewParamsFrom(ss);
    }
    return this.paramsCache!;
  }

  private paramsFor: SessionState | null = null;
  private paramsCache: ViewParams | null = null;

  private viewCtx(doc: Project, lod: number): ViewContext {
    const p = this.params;
    const vp = this.vp;
    const tilt = vp.tiltDeg ? { tan: tiltTan(vp), cos: tiltCos(vp) } : null;
    return { lod, years: p.years, season: p.season, lens: p.lens, night: p.night, northDeg: doc.site.northDeg, tilt, site: doc.site.boundary };
  }

  private ctxKey(doc: Project): string {
    const p = this.params;
    return `${p.years}|${p.season}|${p.lens}|${p.night}|${doc.site.northDeg}|${this.vp.tiltDeg ?? 0}`;
  }

  private reconcile(doc: Project, lod: number) {
    this.reconciled++;
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
    orderNodes(doc, this.mounted, this.layers, this.edgeLayer.bedContainer, this.solids);
    this.drawGround(doc);
    this.shadowLayer.setClip(doc.site.boundary);
  }

  private syncLayers(doc: Project) {
    syncLayers(doc, this.layers, this.world, {
      edge: this.edgeLayer.container,
      heat: this.heatLayer.container,
      shadow: this.shadowLayer.container,
      gap: this.gapLayer.container,
      solids: this.solids,
      privacy: this.privacyLayer.container,
    });
  }

  private unmount(m: Mounted) {
    m.view.node.destroy({ children: true });
  }

  /** Grundstücksfläche: Erdton mit angedeuteter Mulchstruktur (35 %), wie im Design */
  private drawGround(doc: Project) {
    const b = doc.site.boundary;
    // Grundstück unverändert: nichts neu zeichnen
    if (b === this.groundFor) return;
    this.groundFor = b;
    drawGroundShape(this.ground, this.groundTex, b);
  }

  private applyBackground(doc: Project) {
    applyBackground(this.background, doc, this.bgUrl);
  }

  private applyViewport(vp: Viewport) {
    const { width, height } = this.viewSize;
    const ky = tiltCos(vp);
    this.world.scale.set(vp.pxPerMeter, vp.pxPerMeter * ky);
    this.world.position.set(width / 2 - vp.center.x * vp.pxPerMeter, height / 2 - vp.center.y * vp.pxPerMeter * ky);
    // Weichzeichnung in Weltmetern konstant halten
    this.shadowLayer.setScale(vp.pxPerMeter);
    this.heatLayer.setScale(vp.pxPerMeter);
    this.privacyLayer.setScale(vp.pxPerMeter);
  }

  /** Nur Objekte im sichtbaren Bereich zeichnen */
  private cull(doc: Project, vp: Viewport) {
    // nur neu prüfen, wenn sich Ausschnitt, Dokument, Linse oder die Menge der Ansichten geändert hat
    const p0 = this.params;
    const key = `${vp.center.x}|${vp.center.y}|${vp.pxPerMeter}|${vp.tiltDeg ?? 0}|${vp.rotationDeg}|${this.viewSize.width}x${this.viewSize.height}|${p0.lens}|${p0.night}|${this.reconciled}`;
    if (doc === this.culledDoc && key === this.cullKey) return;
    this.culledDoc = doc;
    this.cullKey = key;
    const vb = expandBBox(visibleWorldBBox(vp, this.viewSize), 2);
    // Schrägansicht: hohe Körper unterhalb des Bildrands ragen ins Bild
    if (vp.tiltDeg) vb.maxY += 25 * tiltTan(vp);
    const visible = new Set(this.index.query(vb));
    const p = this.params;
    for (const [id, m] of this.mounted) {
      const o = doc.objects[id];
      const layer = o && doc.layers[o.layerId];
      const on = !!o && !!layer && layer.visible && lensShowsObject(layer.kind, o, p.lens, p.night) && !o.hidden && visible.has(id);
      m.view.node.visible = on;
    }
  }

  private groundFor: Vec2[] | null = null;
  private culledDoc: Project | null = null;
  private cullKey = '';
  /** zählt Abgleiche: neue Ansichten müssen in die Sichtbarkeitsprüfung */
  private reconciled = 0;

  private dayCache = new Map<string, { sunrise: number; sunset: number }>();

  private sunTimes(doc: Project, doy: number) {
    return sunTimes(this.dayCache, doc, doy);
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
    this.shadowLayer.update(doc, sv, p.years, p.season, p.lens === 'sun' ? 0.34 : 0.36);
    this.edgeLayer.update(doc, p.season);
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
    // nur neu zeichnen, wenn sich die Lücken (oder die Linse) geändert haben
    const gaps = irr ? this.gaps : null;
    if (gaps !== this.gapShown) {
      this.gapShown = gaps;
      this.gapLayer.set(gaps);
    }
    // Einsehbarkeit (nur im Editor, nicht im Export)
    const pv = this.store.getState().session.privacy;
    if (exporting || p.lens !== 'privacy') this.privacyLayer.hide();
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
      if (c) c.alpha = (doc.layers[lid].opacity ?? 1) * (irr && kind !== 'water' && kind !== 'pipes' && kind !== 'plot' ? 0.55 : 1);
    }
    // Nacht
    this.night.setVisible(p.night);
    if (p.night) {
      const t = this.sunTimes(doc, p.sun.doy);
      const wd = (new Date().getDay() + 6) % 7;
      const level = (l: LampObject) => lampLevel(l, p.scene, () => scheduledOn(l, p.nightHour % 24, wd, t.sunset, t.sunrise));
      this.night.update(this.app.renderer, { doc, level, world: { scale: this.world.scale.x, scaleY: this.world.scale.y, x: this.world.position.x, y: this.world.position.y }, size: this.viewSize });
    }
  }

  private heatDoc: Project | null = null;

  /** Einmalige Ansicht als Bild, z. B. für die Jahreszeiten-Vorschau */
  async snapshot(view: Partial<ViewParams>, pxPerMeter: number): Promise<string> {
    const r = await this.exportPng({ pxPerMeter, marginM: 0.6, background: null, view, overlays: false });
    return URL.createObjectURL(r.blob);
  }

  private drawOverlay(s: EditorStore, exporting = false) {
    this.gridA = drawOverlay(
      {
        overlay: this.overlay,
        hoverG: this.hoverG,
        previewG: this.previewG,
        labels: this.labels,
        vp: this.vp,
        viewSize: this.viewSize,
        toScreen: this.toScreen,
        preview: this.preview,
        gridA: this.gridA,
        invalidate: () => this.invalidate(),
      },
      s,
      exporting,
    );
  }
}
