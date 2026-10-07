/**
 * Grundstück im laufenden Projekt: Kontur bearbeiten (Punkte ziehen, einfügen, löschen)
 * und Hintergrundbild an zwei Grundstücksecken ausrichten.
 */
import type { Graphics } from 'pixi.js';
import { alignTwoPoints, imageToWorld, northFromImageRotation, worldToImage } from '../core/calibration';
import { closestOnSegment, dist } from '../core/geometry/vec';
import type { Vec2 } from '../core/model/types';
import { ACCENT, type LabelPool, type ToScreen } from '../render/overlays/overlay';
import { edgeLabel, hint, PINK } from './preview';
import type { Tool, ToolContext, WorldPointerEvent } from './Tool';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Ereignis an die UI: Stand des Ausrichtens (für Hinweise im Panel) */
export const ALIGN_EVENT = 'gw:bg-align';
export type AlignStep = 'image1' | 'image2' | 'corner1' | 'corner2';

export class PlotEditTool implements Tool {
  readonly id = 'plotedit';
  readonly cursor = 'default';
  private drag: number | null = null;
  private active: number | null = null;
  private hover: Vec2 | null = null;
  private seq = 0;
  constructor(private ctx: ToolContext) {}

  private get pts() {
    return this.ctx.doc().site.boundary;
  }

  private vertexAt(p: Vec2): number | null {
    const tol = this.ctx.px(9);
    let best: number | null = null;
    let bd = tol;
    this.pts.forEach((q, i) => {
      const d = dist(p, q);
      if (d <= bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  private edgeAt(p: Vec2): { i: number; p: Vec2 } | null {
    const tol = this.ctx.px(7);
    const pts = this.pts;
    let best: { i: number; p: Vec2 } | null = null;
    let bd = tol;
    pts.forEach((a, i) => {
      const c = closestOnSegment(p, a, pts[(i + 1) % pts.length]);
      if (c.d <= bd) {
        bd = c.d;
        best = { i, p: c.p };
      }
    });
    return best;
  }

  private commit(points: Vec2[], merge?: string) {
    this.ctx.cmd.setPlot({ kind: 'drawn', points }, merge);
  }

  down(e: WorldPointerEvent) {
    if (e.button !== 0) return;
    const v = this.vertexAt(e.raw);
    if (v !== null) {
      if (e.dbl) {
        this.remove(v);
        return;
      }
      this.drag = v;
      this.active = v;
    } else {
      const ed = this.edgeAt(e.raw);
      if (ed && e.dbl) {
        const pts = this.pts.slice();
        pts.splice(ed.i + 1, 0, ed.p);
        this.commit(pts);
        this.active = ed.i + 1;
      } else this.active = null;
    }
    this.ctx.redraw();
  }

  move(e: WorldPointerEvent) {
    this.hover = e.raw;
    if (this.drag !== null) {
      const pts = this.pts.slice();
      pts[this.drag] = e.p;
      this.commit(pts, `plot:${this.seq}`);
    } else this.ctx.setCursor(this.vertexAt(e.raw) !== null ? 'move' : this.edgeAt(e.raw) ? 'copy' : 'default');
    this.ctx.redraw();
  }

  up() {
    if (this.drag !== null) {
      this.drag = null;
      this.seq++;
      this.ctx.store.getState().endGesture();
    }
  }

  private remove(i: number) {
    const pts = this.pts;
    if (pts.length <= 3) return;
    this.commit(pts.filter((_, j) => j !== i));
    this.active = null;
  }

  key(e: KeyboardEvent): boolean {
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.active !== null) {
      this.remove(this.active);
      return true;
    }
    if (e.key === 'Escape') {
      this.ctx.store.getState().setSession({ tool: 'select' });
      return true;
    }
    return false;
  }

  cancel() {
    this.drag = this.active = null;
  }

  preview(g: Graphics, toScreen: ToScreen, labels: LabelPool) {
    const pts = this.pts;
    const S = pts.map(toScreen);
    S.forEach((P, i) => {
      const Q = S[(i + 1) % S.length];
      g.moveTo(P.x, P.y).lineTo(Q.x, Q.y);
    });
    g.stroke({ color: ACCENT, width: 2 });
    pts.forEach((p, i) => edgeLabel(labels, toScreen, p, pts[(i + 1) % pts.length]));
    S.forEach((P, i) => {
      const on = i === this.active;
      g.rect(P.x - 6, P.y - 6, 12, 12).fill(on ? ACCENT : 0xffffff).stroke({ color: ACCENT, width: 1.6 });
      labels.mono(LETTERS[i] ?? String(i + 1), P.x + 12, P.y - 12, 0, ACCENT);
    });
    if (this.hover && this.drag === null) hint(labels, toScreen(this.hover), 'Punkt ziehen · Doppelklick auf Kante fügt ein · Entf löscht · Esc fertig');
  }
}

/**
 * Bild ausrichten: erst zwei Punkte im Bild, dann die zwei passenden Grundstücksecken.
 * Maßstab, Drehung und Lage ergeben sich daraus; bei genordetem Bild auch die Nordrichtung.
 */
export class BackgroundAlignTool implements Tool {
  readonly id = 'bgalign';
  readonly cursor = 'crosshair';
  private img: Vec2[] = [];
  private world: Vec2[] = [];
  private hover: Vec2 | null = null;
  /** Wird vom Panel gesetzt („Bild ist genordet“) */
  static northUp = true;
  constructor(private ctx: ToolContext) {}

  private emit() {
    const step: AlignStep = this.img.length < 2 ? (this.img.length === 0 ? 'image1' : 'image2') : this.world.length === 0 ? 'corner1' : 'corner2';
    window.dispatchEvent(new CustomEvent(ALIGN_EVENT, { detail: step }));
  }

  /** Grundstücksecke in der Nähe, sonst gefangener Punkt */
  private corner(e: WorldPointerEvent): Vec2 {
    const tol = this.ctx.px(14);
    let best = e.p;
    let bd = tol;
    for (const q of this.ctx.doc().site.boundary) {
      const d = dist(e.raw, q);
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
    return best;
  }

  down(e: WorldPointerEvent) {
    const bg = this.ctx.doc().background;
    if (!bg || e.button !== 0) return;
    if (this.img.length < 2) this.img.push(worldToImage(bg, e.raw));
    else {
      this.world.push(this.corner(e));
      if (this.world.length === 2) {
        try {
          const r = alignTwoPoints(this.img[0], this.img[1], this.world[0], this.world[1]);
          this.ctx.cmd.alignBackground(r, BackgroundAlignTool.northUp ? northFromImageRotation(r.rotationDeg) : null);
          this.reset();
          this.ctx.store.getState().setSession({ tool: 'select' });
          return;
        } catch {
          this.world = [];
        }
      }
    }
    this.emit();
    this.ctx.redraw();
  }

  move(e: WorldPointerEvent) {
    this.hover = this.img.length < 2 ? e.raw : this.corner(e);
    this.ctx.redraw();
  }

  key(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      this.reset();
      this.ctx.store.getState().setSession({ tool: 'select' });
      return true;
    }
    if (e.key === 'Backspace') {
      if (this.world.length) this.world.pop();
      else this.img.pop();
      this.emit();
      return true;
    }
    return false;
  }

  private reset() {
    this.img = [];
    this.world = [];
    this.emit();
  }

  cancel() {
    this.reset();
  }

  preview(g: Graphics, toScreen: ToScreen, labels: LabelPool) {
    const bg = this.ctx.doc().background;
    if (!bg) return;
    const imgW = this.img.map((p) => imageToWorld(bg, p));
    imgW.forEach((p, i) => {
      const P = toScreen(p);
      g.circle(P.x, P.y, 9).fill(0xffffff).stroke({ color: PINK, width: 2 });
      labels.mono(String(i + 1), P.x, P.y, 0, PINK);
    });
    this.world.forEach((p, i) => {
      const P = toScreen(p);
      const Q = toScreen(imgW[i]);
      g.moveTo(Q.x, Q.y).lineTo(P.x, P.y).stroke({ color: PINK, width: 1.5, alpha: 0.7 });
      g.rect(P.x - 7, P.y - 7, 14, 14).fill(PINK);
    });
    if (this.hover) {
      const H = toScreen(this.hover);
      if (this.img.length === 2) {
        const Q = toScreen(imgW[this.world.length]);
        g.moveTo(Q.x, Q.y).lineTo(H.x, H.y).stroke({ color: PINK, width: 1, alpha: 0.5 });
        g.rect(H.x - 7, H.y - 7, 14, 14).stroke({ color: PINK, width: 2 });
      }
      const text = ['Punkt 1 im Bild anklicken (z. B. eine Grundstücksecke)', 'Punkt 2 im Bild anklicken, möglichst weit entfernt', 'Passende Grundstücksecke für Punkt 1 anklicken', 'Passende Grundstücksecke für Punkt 2 anklicken'][this.img.length + this.world.length];
      hint(labels, H, text);
    }
  }
}
