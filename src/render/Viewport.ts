import type { Vec2 } from '../core/model/types';
import type { BBox } from '../core/geometry/polygon';
import type { Viewport } from '../state/types';

export const MIN_PX_PER_M = 2;
export const MAX_PX_PER_M = 600;
/** 1:100 bei 96 dpi: 1 m = 1 cm auf dem Bildschirm = 37,8 px */
export const PX_PER_M_AT_1_100 = 96 / 2.54;

export interface ScreenSize {
  width: number;
  height: number;
}

export const worldToScreen = (v: Viewport, s: ScreenSize, p: Vec2): Vec2 => ({
  x: (p.x - v.center.x) * v.pxPerMeter + s.width / 2,
  y: (p.y - v.center.y) * v.pxPerMeter + s.height / 2,
});

export const screenToWorld = (v: Viewport, s: ScreenSize, p: Vec2): Vec2 => ({
  x: (p.x - s.width / 2) / v.pxPerMeter + v.center.x,
  y: (p.y - s.height / 2) / v.pxPerMeter + v.center.y,
});

export const clampZoom = (ppm: number) => Math.min(MAX_PX_PER_M, Math.max(MIN_PX_PER_M, ppm));

/** Zoomen um einen Bildschirmpunkt: der Weltpunkt unter dem Cursor bleibt stehen */
export function zoomAt(v: Viewport, s: ScreenSize, screen: Vec2, factor: number): Viewport {
  const ppm = clampZoom(v.pxPerMeter * factor);
  const anchor = screenToWorld(v, s, screen);
  const center = {
    x: anchor.x - (screen.x - s.width / 2) / ppm,
    y: anchor.y - (screen.y - s.height / 2) / ppm,
  };
  return { ...v, pxPerMeter: ppm, center };
}

export const panBy = (v: Viewport, dxScreen: number, dyScreen: number): Viewport => ({
  ...v,
  center: { x: v.center.x - dxScreen / v.pxPerMeter, y: v.center.y - dyScreen / v.pxPerMeter },
});

/** Bereich einpassen; `insets` = von Panels verdeckte Ränder in px */
export function fitBBox(b: BBox, s: ScreenSize, insets = { left: 0, right: 0, top: 0, bottom: 0 }, margin = 40): Viewport {
  const w = Math.max(1, s.width - insets.left - insets.right - margin * 2);
  const h = Math.max(1, s.height - insets.top - insets.bottom - margin * 2);
  const ppm = clampZoom(Math.min(w / Math.max(0.1, b.maxX - b.minX), h / Math.max(0.1, b.maxY - b.minY)));
  // Mitte des sichtbaren Bereichs auf die Mitte der Box legen
  const visCx = insets.left + margin + w / 2;
  const visCy = insets.top + margin + h / 2;
  const cx = (b.minX + b.maxX) / 2 - (visCx - s.width / 2) / ppm;
  const cy = (b.minY + b.maxY) / 2 - (visCy - s.height / 2) / ppm;
  return { center: { x: cx, y: cy }, pxPerMeter: ppm, rotationDeg: 0 };
}

export function visibleWorldBBox(v: Viewport, s: ScreenSize): BBox {
  const a = screenToWorld(v, s, { x: 0, y: 0 });
  const b = screenToWorld(v, s, { x: s.width, y: s.height });
  return { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y };
}

/** Anzeige-Zoom in Prozent relativ zu 1:100 */
export const zoomPercent = (v: Viewport) => Math.round((v.pxPerMeter / PX_PER_M_AT_1_100) * 100);

/** Gerundeter Maßstab für die Unterleiste (1 : 50, 1 : 100, 1 : 200 …) */
export function scaleLabel(v: Viewport): string {
  const den = (PX_PER_M_AT_1_100 / v.pxPerMeter) * 100;
  const nice = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  const n = nice.reduce((a, b) => (Math.abs(Math.log(b / den)) < Math.abs(Math.log(a / den)) ? b : a));
  return `1 : ${n}`;
}
