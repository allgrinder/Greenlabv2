import type { Vec2 } from '../model/types';
import { closestOnSegment, dist } from './vec';

export type Polygon = Vec2[];
export type Polyline = Vec2[];

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Vorzeichenbehaftete Fläche (Gaußsche Trapezformel).
 * Im Bildschirmsystem (y nach unten) ist sie positiv für Umlauf im Uhrzeigersinn.
 */
export function signedArea(poly: Polygon): number {
  let a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export const area = (poly: Polygon): number => Math.abs(signedArea(poly));

/** Fläche mit Löchern */
export const areaWithHoles = (outer: Polygon, holes: Polygon[]): number =>
  area(outer) - holes.reduce((s, h) => s + area(h), 0);

export function polylineLength(pts: Polyline): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
  return l;
}

export const perimeter = (poly: Polygon): number =>
  poly.length < 2 ? 0 : polylineLength(poly) + dist(poly[poly.length - 1], poly[0]);

export function centroid(poly: Polygon): Vec2 {
  const a = signedArea(poly);
  if (Math.abs(a) < 1e-12) {
    const n = poly.length || 1;
    return { x: poly.reduce((s, p) => s + p.x, 0) / n, y: poly.reduce((s, p) => s + p.y, 0) / n };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % n];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

export function bbox(pts: Vec2[]): BBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export const unionBBox = (a: BBox, b: BBox): BBox => ({
  minX: Math.min(a.minX, b.minX),
  minY: Math.min(a.minY, b.minY),
  maxX: Math.max(a.maxX, b.maxX),
  maxY: Math.max(a.maxY, b.maxY),
});

export const expandBBox = (b: BBox, m: number): BBox => ({
  minX: b.minX - m,
  minY: b.minY - m,
  maxX: b.maxX + m,
  maxY: b.maxY + m,
});

/** Ray-Casting, Rand zählt nicht zuverlässig */
export function pointInPolygon(p: Vec2, poly: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export const pointInRegion = (p: Vec2, outer: Polygon, holes: Polygon[]): boolean =>
  pointInPolygon(p, outer) && !holes.some((h) => pointInPolygon(p, h));

/** Abstand eines Punkts zu einer Polylinie (offen oder geschlossen) */
export function distanceToPolyline(p: Vec2, pts: Polyline, closed: boolean): number {
  let best = Infinity;
  const n = pts.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const d = closestOnSegment(p, pts[i], pts[(i + 1) % n]).d;
    if (d < best) best = d;
  }
  return n === 1 ? dist(p, pts[0]) : best;
}

/** Entfernt aufeinanderfolgende Duplikate (und das Schlussduplikat bei Polygonen) */
export function dedupe(pts: Vec2[], closed: boolean, eps = 1e-9): Vec2[] {
  const out: Vec2[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last.x - p.x) > eps || Math.abs(last.y - p.y) > eps) out.push(p);
  }
  if (closed && out.length > 1) {
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps) out.pop();
  }
  return out;
}

/** Nächster Punkt auf dem Rand eines Polygons */
export function closestPointOn(p: Vec2, poly: Polygon): Vec2 {
  let best = poly[0];
  let bestD = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const q = closestOnSegment(p, poly[i], poly[(i + 1) % poly.length]);
    if (q.d < bestD) {
      bestD = q.d;
      best = q.p;
    }
  }
  return best;
}
