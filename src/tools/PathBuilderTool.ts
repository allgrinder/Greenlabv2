/**
 * Gemeinsame Basis für Polygon, Bézier und Weg: Punkte setzen (Klick = Ecke,
 * Ziehen = glatter Knoten mit Griffen), Zahleneingabe für exakte Kantenlängen,
 * ⇧ rastet Winkel, Rücktaste entfernt den letzten Punkt, ↵ / Doppelklick beendet, Esc bricht ab.
 */
import type { Graphics } from 'pixi.js';
import { parseNumber } from '../core/format';
import { dist, scale, sub } from '../core/geometry/vec';
import type { PathGeometry, PathNode, Vec2 } from '../core/model/types';
import type { LabelPool, ToScreen } from '../render/overlays/overlay';
import { drawPathPreview, drawRubber, drawSnap, edgeLabel } from './preview';
import type { Tool, ToolContext, WorldPointerEvent } from './Tool';
import type { SnapResult } from '../core/geometry/snap';

export interface PathBuilderOptions {
  id: string;
  closed: boolean;
  curves: boolean;
  source: PathGeometry['source'];
  /** mindestens benötigte Punkte */
  min: number;
  finish(path: PathGeometry): void;
}

export class PathBuilderTool implements Tool {
  readonly cursor = 'crosshair';
  readonly id: string;
  private nodes: PathNode[] = [];
  private drag: { index: number; start: Vec2 } | null = null;
  private hover: Vec2 | null = null;
  /** ungefangene Mausposition: Richtung für die Zahleneingabe */
  private hoverRaw: Vec2 | null = null;
  private snap: SnapResult | null = null;
  private typed = '';

  constructor(
    private ctx: ToolContext,
    private o: PathBuilderOptions,
  ) {
    this.id = o.id;
  }

  /** Ursprung für den Winkelfang (⇧) */
  get lastPoint(): Vec2 | undefined {
    return this.last ?? undefined;
  }

  private get last(): Vec2 | null {
    return this.nodes.length ? this.nodes[this.nodes.length - 1].p : null;
  }

  private nearFirst(p: Vec2) {
    return this.o.closed && this.nodes.length >= this.o.min && dist(p, this.nodes[0].p) <= this.ctx.px(9);
  }

  down(e: WorldPointerEvent) {
    if (e.button !== 0) return;
    if (this.nearFirst(e.p)) {
      this.finish();
      return;
    }
    // Doppelklick: zweiter Klick setzt keinen neuen Punkt, sondern beendet
    if (e.dbl && this.nodes.length >= this.o.min) {
      this.finish();
      return;
    }
    const p = this.typedPoint() ?? e.p;
    this.typed = '';
    this.nodes.push({ p });
    this.drag = { index: this.nodes.length - 1, start: e.screen };
    this.ctx.redraw();
  }

  move(e: WorldPointerEvent) {
    this.hover = e.p;
    this.hoverRaw = e.shift ? e.p : e.raw;
    this.snap = e.snap;
    if (this.drag && this.o.curves && dist(e.screen, this.drag.start) > 4) {
      const n = this.nodes[this.drag.index];
      const out = sub(e.raw, n.p);
      n.out = out;
      n.in = scale(out, -1);
      n.smooth = true;
    }
    this.ctx.redraw();
  }

  up() {
    this.drag = null;
  }

  private typedPoint(): Vec2 | null {
    const L = parseNumber(this.typed);
    const last = this.last;
    if (L === null || L <= 0 || !last || !this.hoverRaw) return null;
    // Richtung nahe an 15°-Vielfachen (±3°) rastet ein: exakte rechte Winkel ohne ⇧
    const raw = Math.atan2(this.hoverRaw.y - last.y, this.hoverRaw.x - last.x) * (180 / Math.PI);
    const snapped = Math.round(raw / 15) * 15;
    const deg = Math.abs(raw - snapped) <= 3 ? snapped : raw;
    const r = (deg * Math.PI) / 180;
    // Rundung auf 0,1 mm gegen Fließkomma-Rest (cos 90° ≠ 0)
    const q = (v: number) => Math.round(v * 1e4) / 1e4;
    return { x: q(last.x + Math.cos(r) * L), y: q(last.y + Math.sin(r) * L) };
  }

  key(e: KeyboardEvent): boolean {
    if (/^[0-9.,]$/.test(e.key)) {
      if (!this.nodes.length) return false;
      this.typed += e.key;
      this.ctx.redraw();
      return true;
    }
    if (e.key === 'Backspace') {
      if (this.typed) this.typed = this.typed.slice(0, -1);
      else this.nodes.pop();
      this.ctx.redraw();
      return true;
    }
    if (e.key === 'Enter') {
      const p = this.typedPoint();
      if (p) {
        this.nodes.push({ p });
        this.typed = '';
        this.ctx.redraw();
      } else this.finish();
      return true;
    }
    if (e.key === 'Escape') {
      if (!this.nodes.length) return false;
      this.cancel();
      return true;
    }
    return false;
  }

  private finish() {
    const nodes = this.nodes.filter((n, i) => i === 0 || dist(n.p, this.nodes[i - 1].p) > 1e-6);
    if (nodes.length >= this.o.min) {
      // Offene Enden: Griffe nach außen sind bedeutungslos
      if (!this.o.closed) {
        delete nodes[0].in;
        delete nodes[nodes.length - 1].out;
      }
      this.o.finish({ kind: 'path', nodes, closed: this.o.closed, source: this.o.source });
    }
    this.cancel();
  }

  cancel() {
    this.nodes = [];
    this.drag = null;
    this.typed = '';
    this.ctx.redraw();
  }

  preview(g: Graphics, toScreen: ToScreen, labels: LabelPool) {
    drawSnap(g, toScreen, this.snap);
    if (!this.nodes.length) return;
    drawPathPreview(g, toScreen, this.nodes, false, false);
    const last = this.last!;
    const target = this.typedPoint() ?? this.hover;
    if (target && !this.drag) {
      drawRubber(g, toScreen, last, target);
      edgeLabel(labels, toScreen, last, target, this.typed ? `${this.typed} m ↵` : undefined);
      if (this.o.closed && this.nodes.length >= 2) drawRubber(g, toScreen, target, this.nodes[0].p);
    }
    // Kantenlängen der gesetzten Segmente (gerade Strecken)
    for (let i = 1; i < this.nodes.length; i++) {
      const a = this.nodes[i - 1];
      const b = this.nodes[i];
      if (!a.out && !b.in) edgeLabel(labels, toScreen, a.p, b.p);
    }
    if (this.nodes.length >= this.o.min && this.hover) {
      const P = toScreen(this.hover);
      labels.mono(this.o.closed ? 'Klick auf Startpunkt oder ↵ schließt' : 'Doppelklick oder ↵ beendet', P.x + 20, P.y + 26, 0, 0x5d615d);
    }
  }
}
