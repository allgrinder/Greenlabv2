import type { Vec2 } from '../core/model/types';
import { bbox, type BBox } from '../core/geometry/polygon';
import { rotate } from '../core/geometry/vec';
import type { Viewport } from '../state/types';

const MIN_PX_PER_M = 2;
const MAX_PX_PER_M = 600;
/** 1:100 bei 96 dpi: 1 m = 1 cm auf dem Bildschirm = 37,8 px */
export const PX_PER_M_AT_1_100 = 96 / 2.54;

export interface ScreenSize {
  width: number;
  height: number;
}

/** Fester Kippwinkel der Schrägansicht (Grad aus der Senkrechten) */
export const OBLIQUE_TILT_DEG = 35;

/**
 * Verkürzung der Bodenebene in der Schrägansicht (cos des Kippwinkels; 1 = Draufsicht).
 * Parallelprojektion: ein Punkt in Höhe z erscheint um z · tan(Kippwinkel) Meter weiter „oben“.
 */
export const tiltCos = (v: Viewport) => Math.cos(((v.tiltDeg ?? 0) * Math.PI) / 180);
export const tiltTan = (v: Viewport) => Math.tan(((v.tiltDeg ?? 0) * Math.PI) / 180);

/** Ansichtsdrehung in Grad (90°-Schritte; positiv = Plan dreht im Uhrzeigersinn) */
const rot = (v: Viewport) => ((Math.round((v.rotationDeg ?? 0) / 90) * 90) % 360 + 360) % 360;

/** Bodenpunkt (z = 0) → Bildschirm */
export function worldToScreen(v: Viewport, s: ScreenSize, p: Vec2): Vec2 {
  const d = rotate({ x: p.x - v.center.x, y: p.y - v.center.y }, rot(v));
  return { x: d.x * v.pxPerMeter + s.width / 2, y: d.y * v.pxPerMeter * tiltCos(v) + s.height / 2 };
}

/** Bildschirm → Bodenpunkt (z = 0) */
export function screenToWorld(v: Viewport, s: ScreenSize, p: Vec2): Vec2 {
  const d = rotate({ x: (p.x - s.width / 2) / v.pxPerMeter, y: (p.y - s.height / 2) / (v.pxPerMeter * tiltCos(v)) }, -rot(v));
  return { x: d.x + v.center.x, y: d.y + v.center.y };
}

export const clampZoom = (ppm: number) => Math.min(MAX_PX_PER_M, Math.max(MIN_PX_PER_M, ppm));

/** Zoomen um einen Bildschirmpunkt: der Weltpunkt unter dem Cursor bleibt stehen */
export function zoomAt(v: Viewport, s: ScreenSize, screen: Vec2, factor: number): Viewport {
  const ppm = clampZoom(v.pxPerMeter * factor);
  const anchor = screenToWorld(v, s, screen);
  const d = rotate({ x: (screen.x - s.width / 2) / ppm, y: (screen.y - s.height / 2) / (ppm * tiltCos(v)) }, -rot(v));
  return { ...v, pxPerMeter: ppm, center: { x: anchor.x - d.x, y: anchor.y - d.y } };
}

export function panBy(v: Viewport, dxScreen: number, dyScreen: number): Viewport {
  const d = rotate({ x: dxScreen / v.pxPerMeter, y: dyScreen / (v.pxPerMeter * tiltCos(v)) }, -rot(v));
  return { ...v, center: { x: v.center.x - d.x, y: v.center.y - d.y } };
}

/** Bereich einpassen; `insets` = von Panels verdeckte Ränder in px */
export function fitBBox(b: BBox, s: ScreenSize, insets = { left: 0, right: 0, top: 0, bottom: 0 }, margin = 40, tiltDeg = 0): Viewport {
  const ky = Math.cos((tiltDeg * Math.PI) / 180);
  const w = Math.max(1, s.width - insets.left - insets.right - margin * 2);
  const h = Math.max(1, s.height - insets.top - insets.bottom - margin * 2);
  const ppm = clampZoom(Math.min(w / Math.max(0.1, b.maxX - b.minX), h / Math.max(0.1, (b.maxY - b.minY) * ky)));
  // Mitte des sichtbaren Bereichs auf die Mitte der Box legen
  const visCx = insets.left + margin + w / 2;
  const visCy = insets.top + margin + h / 2;
  const cx = (b.minX + b.maxX) / 2 - (visCx - s.width / 2) / ppm;
  const cy = (b.minY + b.maxY) / 2 - (visCy - s.height / 2) / (ppm * ky);
  return { center: { x: cx, y: cy }, pxPerMeter: ppm, rotationDeg: 0, ...(tiltDeg ? { tiltDeg } : {}) };
}

/** Punkte (z. B. Grundstück) einpassen, bei gedrehter Ansicht in Blickrichtung */
export function fitPoints(pts: Vec2[], s: ScreenSize, insets = { left: 0, right: 0, top: 0, bottom: 0 }, margin = 40, tiltDeg = 0, rotationDeg = 0): Viewport {
  const r = rot({ center: { x: 0, y: 0 }, pxPerMeter: 1, rotationDeg });
  const v = fitBBox(bbox(pts.map((p) => rotate(p, r))), s, insets, margin, tiltDeg);
  return { ...v, center: rotate(v.center, -r), rotationDeg: r };
}

/** Sichtbarer Bereich im Plan (bei gedrehter Ansicht die Hülle der vier Bildschirmecken) */
export function visibleWorldBBox(v: Viewport, s: ScreenSize): BBox {
  return bbox(
    [
      { x: 0, y: 0 },
      { x: s.width, y: 0 },
      { x: 0, y: s.height },
      { x: s.width, y: s.height },
    ].map((p) => screenToWorld(v, s, p)),
  );
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
