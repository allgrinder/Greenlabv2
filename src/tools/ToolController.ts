/**
 * Verbindet Eingaben mit Werkzeugen: Pointer → Weltkoordinaten mit Fang, Navigation
 * (Mausrad, Trackpad, Pinch, Leertaste/Mittelklick = Pan) und Tastaturkürzel.
 */
import { snapPoint, constrainAngle, type SnapResult } from '../core/geometry/snap';
import { dist } from '../core/geometry/vec';
import { newArea, newDrip, newHedge, newLamp, newPath, newPipe } from '../core/model/factory';
import { objectFromBrush } from './simpleTools';
import type { PathGeometry, PlanObject, Vec2 } from '../core/model/types';
import type { PlanRenderer } from '../render/PlanRenderer';
import { panBy, zoomAt } from '../render/Viewport';
import type { Commands } from '../state/commands';
import type { EditorStoreApi } from '../state/store';
import type { ToolId } from '../state/types';
import { PathBuilderTool } from './PathBuilderTool';
import { SelectTool } from './SelectTool';
import { DimensionTool, FreehandTool, PlaceTool, RectTool, TextTool } from './simpleTools';
import { BackgroundMoveTool, CalibrateTool, DND_MIME } from './BackgroundTools';
import type { Brush } from '../state/types';
import type { Tool, ToolContext, WorldPointerEvent } from './Tool';

const KEYS: Record<string, ToolId> = { v: 'select', r: 'rect', p: 'poly', b: 'bezier', f: 'free', w: 'path', m: 'dim', t: 'text', g: 'plant' };

export class ToolController {
  private tools: Record<string, Tool>;
  private current: Tool;
  private ctx: ToolContext;
  private pointers = new Map<number, Vec2>();
  private panning: { last: Vec2 } | null = null;
  private pinch: { d: number; mid: Vec2 } | null = null;
  private space = false;
  private lastClick: { t: number; p: Vec2 } | null = null;
  private lastSnap: SnapResult | null = null;
  private unsub: () => void;
  private cleanup: (() => void)[] = [];

  constructor(
    private el: HTMLElement,
    private store: EditorStoreApi,
    private renderer: PlanRenderer,
    private cmd: Commands,
    private onFit: () => void,
  ) {
    const ctx: ToolContext = {
      store,
      cmd,
      renderer,
      doc: () => store.getState().doc!,
      px: (n) => n / store.getState().session.viewport.pxPerMeter,
      snap: (raw, req, e) => this.snapAt(raw, req, e),
      redraw: () => renderer.invalidate(),
      selectable: (o) => this.selectable(o),
      setCursor: (c) => {
        if (!this.space && !this.panning) el.style.cursor = c;
      },
    };
    this.ctx = ctx;
    const finishClosed = (source: 'polygon' | 'bezier') => (path: PathGeometry) => {
      const def = store.getState().session.defaults;
      cmd.addObject(newArea(ctx.doc(), { outer: { ...path, source }, holes: [] }, def.areaMaterial));
    };
    this.tools = {
      select: new SelectTool(ctx),
      rect: new RectTool(ctx),
      poly: new PathBuilderTool(ctx, { id: 'poly', closed: true, curves: false, source: 'polygon', min: 3, finish: finishClosed('polygon') }),
      bezier: new PathBuilderTool(ctx, { id: 'bezier', closed: true, curves: true, source: 'bezier', min: 3, finish: finishClosed('bezier') }),
      path: new PathBuilderTool(ctx, {
        id: 'path',
        closed: false,
        curves: true,
        source: 'bezier',
        min: 2,
        finish: (path) => {
          const def = store.getState().session.defaults;
          cmd.addObject(newPath(ctx.doc(), path, def.pathWidth, def.pathMaterial));
        },
      }),
      hedge: new PathBuilderTool(ctx, { id: 'hedge', closed: false, curves: false, source: 'polygon', min: 2, finish: (path) => cmd.addObject(newHedge(ctx.doc(), path)) }),
      drip: new PathBuilderTool(ctx, { id: 'drip', closed: false, curves: true, source: 'polygon', min: 2, finish: (path) => cmd.addObject(newDrip(ctx.doc(), path, 3)) }),
      pipe: new PathBuilderTool(ctx, { id: 'pipe', closed: false, curves: false, source: 'polygon', min: 2, finish: (path) => cmd.addObject(newPipe(ctx.doc(), path)) }),
      lights: new PathBuilderTool(ctx, { id: 'lights', closed: false, curves: true, source: 'polygon', min: 2, finish: (path) => cmd.addObject(newLamp(ctx.doc(), 'stringLights', path.nodes[0].p, path)) }),
      calibrate: new CalibrateTool(ctx),
      bgmove: new BackgroundMoveTool(ctx),
      free: new FreehandTool(ctx),
      dim: new DimensionTool(ctx),
      text: new TextTool(ctx),
      plant: new PlaceTool(ctx),
    };
    this.current = this.tools[store.getState().session.tool] ?? this.tools.select;
    this.activate(this.current);

    // Werkzeugwechsel aus dem UI
    let prevTool = store.getState().session.tool;
    this.unsub = store.subscribe((s) => {
      if (s.session.tool !== prevTool) {
        prevTool = s.session.tool;
        this.switchTo(s.session.tool);
      }
    });

    const on = <K extends keyof HTMLElementEventMap>(t: HTMLElement | Window, type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, fn as EventListener, opts);
      this.cleanup.push(() => t.removeEventListener(type, fn as EventListener, opts));
    };
    on(el, 'pointerdown', (e) => this.onDown(e));
    on(el, 'pointermove', (e) => this.onMove(e));
    on(el, 'pointerup', (e) => this.onUp(e));
    on(el, 'pointercancel', (e) => this.onUp(e));
    on(el, 'pointerleave', () => {
      if (store.getState().session.hoverId) store.getState().setSession({ hoverId: null });
    });
    on(el, 'wheel', (e) => this.onWheel(e), { passive: false });
    on(el, 'contextmenu', (e) => e.preventDefault());
    // Drag & Drop aus der Bibliothek
    on(el, 'dragover', (e) => {
      if (e.dataTransfer?.types.includes(DND_MIME)) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    });
    on(el, 'drop', (e) => {
      const data = e.dataTransfer?.getData(DND_MIME);
      if (!data || !store.getState().doc) return;
      e.preventDefault();
      const brush = JSON.parse(data) as Brush;
      const raw = renderer.toWorld(this.screenOf(e));
      const p = this.snapAt(raw, {}, { shift: false, alt: e.altKey }).p;
      cmd.addObject(objectFromBrush(ctx.doc(), brush, p));
      store.getState().setSession({ brush });
    });
    on(window, 'keydown', (e) => this.onKey(e as unknown as KeyboardEvent));
    on(window, 'keyup', (e) => this.onKeyUp(e as unknown as KeyboardEvent));
    on(window, 'blur', () => {
      this.space = false;
      this.panning = null;
    });
  }

  destroy() {
    this.unsub();
    this.cleanup.forEach((f) => f());
    this.renderer.setPreview(null);
  }

  private selectable(o: PlanObject): boolean {
    const l = this.store.getState().doc?.layers[o.layerId];
    return !!l && l.visible && !l.locked && !o.hidden;
  }

  private activate(t: Tool) {
    this.el.style.cursor = t.cursor;
    this.renderer.setPreview((g, toScreen, labels) => {
      this.current.preview?.(g, toScreen, labels);
    });
  }

  switchTo(id: ToolId) {
    const next = this.tools[id] ?? this.tools.select;
    if (next === this.current) return;
    this.current.cancel?.();
    this.current = next;
    if (this.store.getState().session.tool !== id) this.store.getState().setSession({ tool: id });
    this.activate(next);
    this.renderer.invalidate();
  }

  private snapAt(raw: Vec2, req: { exclude?: Set<string>; angleFrom?: Vec2 } = {}, e?: { shift: boolean; alt: boolean }): SnapResult {
    const doc = this.store.getState().doc;
    if (!doc) return { p: raw, kind: 'none' };
    let p = raw;
    if (e?.shift && req.angleFrom) p = constrainAngle(req.angleFrom, raw);
    if (e?.alt) return { p, kind: 'none' };
    const tol = this.ctx.px(8);
    const cands = doc.settings.snapToGeometry ? this.renderer.index.snapCandidates(doc, p, tol * 2, req.exclude ?? new Set(this.store.getState().session.selection)) : { vertices: [], segments: [] };
    return snapPoint(p, cands, { tolerance: tol, grid: doc.settings.snapToGrid ? doc.settings.gridStepM : 0, geometry: doc.settings.snapToGeometry });
  }

  private screenOf(e: PointerEvent | WheelEvent | DragEvent): Vec2 {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private toEvent(e: PointerEvent, dbl = false): WorldPointerEvent {
    const screen = this.screenOf(e);
    const raw = this.renderer.toWorld(screen);
    // Werkzeuge im Zeichenmodus rasten Winkel ab dem letzten Punkt; der Ursprung kommt über angleFrom
    const angleFrom = (this.current as { lastPoint?: Vec2 }).lastPoint;
    const snap = this.current.id === 'free' ? { p: raw, kind: 'none' as const } : this.snapAt(raw, { angleFrom }, { shift: e.shiftKey, alt: e.altKey });
    this.lastSnap = snap;
    return { raw, p: snap.p, snap, screen, shift: e.shiftKey, alt: e.altKey, mod: e.ctrlKey || e.metaKey, button: e.button, pointerType: e.pointerType, dbl };
  }

  private onDown(e: PointerEvent) {
    if (!this.store.getState().doc) return;
    this.el.setPointerCapture(e.pointerId);
    const screen = this.screenOf(e);
    this.pointers.set(e.pointerId, screen);
    // Zweiter Finger: Pinch statt Werkzeug
    if (this.pointers.size === 2) {
      this.current.cancel?.();
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: dist(a, b), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      return;
    }
    if (e.button === 1 || (e.button === 0 && this.space)) {
      this.panning = { last: screen };
      this.el.style.cursor = 'grabbing';
      e.preventDefault();
      return;
    }
    const now = performance.now();
    const dbl = !!this.lastClick && now - this.lastClick.t < 320 && dist(this.lastClick.p, screen) < 6;
    this.lastClick = dbl ? null : { t: now, p: screen };
    this.current.down?.(this.toEvent(e, dbl));
    this.renderer.invalidate();
  }

  private onMove(e: PointerEvent) {
    const screen = this.screenOf(e);
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, screen);
    if (this.pinch && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = dist(a, b);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const s = this.store.getState();
      let vp = panBy(s.session.viewport, mid.x - this.pinch.mid.x, mid.y - this.pinch.mid.y);
      vp = zoomAt(vp, this.renderer.size, mid, d / (this.pinch.d || d));
      s.setSession({ viewport: vp });
      this.pinch = { d, mid };
      return;
    }
    if (this.panning) {
      const s = this.store.getState();
      s.setSession({ viewport: panBy(s.session.viewport, screen.x - this.panning.last.x, screen.y - this.panning.last.y) });
      this.panning.last = screen;
      return;
    }
    if (this.pointers.size > 1) return;
    this.current.move?.(this.toEvent(e));
  }

  private onUp(e: PointerEvent) {
    this.pointers.delete(e.pointerId);
    if (this.el.hasPointerCapture(e.pointerId)) this.el.releasePointerCapture(e.pointerId);
    if (this.pinch) {
      if (this.pointers.size < 2) this.pinch = null;
      return;
    }
    if (this.panning) {
      this.panning = null;
      this.el.style.cursor = this.space ? 'grab' : this.current.cursor;
      return;
    }
    this.current.up?.(this.toEvent(e));
  }

  /**
   * Mausrad zoomt zum Cursor. Trackpad: zwei Finger verschieben, Pinch kommt als ctrl+wheel und zoomt.
   * Heuristik Maus vs. Trackpad: Zeilenmodus oder große ganzzahlige Y-Schritte ohne X-Anteil = Maus.
   */
  private onWheel(e: WheelEvent) {
    e.preventDefault();
    const s = this.store.getState();
    const screen = this.screenOf(e);
    const isMouse = e.deltaMode !== 0 || (e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50);
    if (e.ctrlKey || e.metaKey || isMouse) {
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      const factor = Math.exp(-dy * (e.ctrlKey && !isMouse ? 0.01 : 0.0018));
      s.setSession({ viewport: zoomAt(s.session.viewport, this.renderer.size, screen, factor) });
    } else {
      s.setSession({ viewport: panBy(s.session.viewport, -e.deltaX, -e.deltaY) });
    }
  }

  private onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    const s = this.store.getState();
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === ' ') {
      if (!this.space) {
        this.space = true;
        this.el.style.cursor = 'grab';
      }
      e.preventDefault();
      return;
    }
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      this.current.cancel?.();
      if (e.shiftKey) s.redo();
      else s.undo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      s.redo();
      return;
    }
    if (mod && e.key === '0') {
      e.preventDefault();
      this.onFit();
      return;
    }
    if (mod && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      if (s.session.selection.length) this.cmd.duplicateObjects(s.session.selection);
      return;
    }
    if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      const doc = s.doc;
      if (doc) s.setSession({ selection: Object.values(doc.objects).filter((o) => this.selectable(o)).map((o) => o.id) });
      return;
    }
    // Erst das Werkzeug (Zahleneingabe, Enter, Backspace, Esc, Pfeile)
    const consumed = this.current.key?.(e);
    if (consumed) {
      e.preventDefault();
      this.renderer.invalidate();
      return;
    }
    if (mod || e.altKey) return;
    const k = e.key.toLowerCase();
    if (KEYS[k]) {
      this.switchTo(KEYS[k]);
      if (KEYS[k] === 'plant') s.setSession({ panels: { ...s.session.panels, library: true, layers: false } });
      return;
    }
    if (k === 'l') s.setSession({ panels: { ...s.session.panels, library: !s.session.panels.library, layers: false } });
    if (k === 'e') s.setSession({ panels: { ...s.session.panels, layers: !s.session.panels.layers, library: false } });
    if (e.key === 'Escape' && this.current.id !== 'select') this.switchTo('select');
  }

  private onKeyUp(e: KeyboardEvent) {
    if (e.key === ' ') {
      this.space = false;
      this.el.style.cursor = this.current.cursor;
    }
    if (e.key.startsWith('Arrow')) this.store.getState().endGesture();
  }

  get snapState() {
    return this.lastSnap;
  }
}
