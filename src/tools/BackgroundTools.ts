/** Hintergrundbild im Plan: neu kalibrieren (zwei Punkte) und verschieben */
import type { Graphics } from 'pixi.js';
import { worldToImage } from '../core/calibration';
import { dist, sub } from '../core/geometry/vec';
import type { Vec2 } from '../core/model/types';
import { type LabelPool, type ToScreen } from '../render/overlays/overlay';
import { PINK } from './preview';
import type { Tool, ToolContext, WorldPointerEvent } from './Tool';
import { num } from '../core/format';

export const DND_MIME = 'application/x-gartenwerk';

/** Ereignis an die UI: zwei Kalibrierpunkte (in Bildpixeln) sind gesetzt */
export const CALIB_EVENT = 'gw:calibration-points';
export interface CalibPoints {
  a: Vec2;
  b: Vec2;
  /** aktuelle Länge im Plan, Vorschlag für das Eingabefeld */
  currentM: number;
}

export class CalibrateTool implements Tool {
  readonly id = 'calibrate';
  readonly cursor = 'crosshair';
  private a: Vec2 | null = null;
  private b: Vec2 | null = null;
  private hover: Vec2 | null = null;
  constructor(private ctx: ToolContext) {}

  down(e: WorldPointerEvent) {
    const bg = this.ctx.doc().background;
    if (!bg || e.button !== 0) return;
    if (!this.a || this.b) {
      this.a = e.raw;
      this.b = null;
    } else {
      this.b = e.raw;
      const detail: CalibPoints = { a: worldToImage(bg, this.a), b: worldToImage(bg, this.b), currentM: dist(this.a, this.b) };
      window.dispatchEvent(new CustomEvent(CALIB_EVENT, { detail }));
    }
    this.ctx.redraw();
  }
  move(e: WorldPointerEvent) {
    this.hover = e.raw;
    this.ctx.redraw();
  }
  cancel() {
    this.a = this.b = null;
    window.dispatchEvent(new CustomEvent(CALIB_EVENT, { detail: null }));
  }
  preview(g: Graphics, toScreen: ToScreen, labels: LabelPool) {
    if (!this.a) {
      if (this.hover) {
        const P = toScreen(this.hover);
        labels.mono('Ersten Punkt mit bekanntem Abstand anklicken', P.x + 20, P.y + 24, 0, 0x1f2224);
      }
      return;
    }
    const b = this.b ?? this.hover;
    const A = toScreen(this.a);
    if (b) {
      const B = toScreen(b);
      g.moveTo(A.x, A.y).lineTo(B.x, B.y).stroke({ color: PINK, width: 2 });
      g.circle(B.x, B.y, 7).fill(0xffffff).stroke({ color: PINK, width: 2 });
      g.circle(B.x, B.y, 2).fill(PINK);
      labels.mono(`${num(dist(this.a, b), 2)} m`, (A.x + B.x) / 2, (A.y + B.y) / 2 - 14, 0, PINK);
    }
    g.circle(A.x, A.y, 7).fill(0xffffff).stroke({ color: PINK, width: 2 });
    g.circle(A.x, A.y, 2).fill(PINK);
  }
}

export class BackgroundMoveTool implements Tool {
  readonly id = 'bgmove';
  readonly cursor = 'move';
  private last: Vec2 | null = null;
  private seq = 0;
  constructor(private ctx: ToolContext) {}
  down(e: WorldPointerEvent) {
    if (e.button === 0 && this.ctx.doc().background) this.last = e.raw;
  }
  move(e: WorldPointerEvent) {
    const bg = this.ctx.doc().background;
    if (!this.last || !bg) return;
    const d = sub(e.raw, this.last);
    this.last = e.raw;
    this.ctx.cmd.updateBackground({ origin: { x: bg.origin.x + d.x, y: bg.origin.y + d.y } }, `bgmove:${this.seq}`);
  }
  up() {
    this.last = null;
    this.seq++;
    this.ctx.store.getState().endGesture();
  }
  /** Pfeiltasten: 10 cm, mit ⇧ 1 m; Esc beendet */
  key(e: KeyboardEvent): boolean {
    const bg = this.ctx.doc().background;
    if (e.key === 'Escape') {
      this.ctx.store.getState().setSession({ tool: 'select' });
      return true;
    }
    const dir: Record<string, Vec2> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
    const d = dir[e.key];
    if (!d || !bg || bg.locked) return false;
    const step = e.shiftKey ? 1 : 0.1;
    this.ctx.cmd.updateBackground({ origin: { x: bg.origin.x + d.x * step, y: bg.origin.y + d.y * step } }, 'bg-nudge');
    return true;
  }
}
