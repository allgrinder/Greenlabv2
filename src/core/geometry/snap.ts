import type { Vec2 } from '../model/types';
import { angleDeg, closestOnSegment, dist, fromAngle, mid, sub } from './vec';

export type SnapKind = 'vertex' | 'midpoint' | 'edge' | 'grid' | 'none';

export interface SnapCandidates {
  vertices: Vec2[];
  segments: [Vec2, Vec2][];
}

export interface SnapOptions {
  /** Fangradius in Metern (= Bildschirmtoleranz / pxPerMeter) */
  tolerance: number;
  /** Rasterweite in Metern, 0 = aus */
  grid: number;
  geometry: boolean;
}

export interface SnapResult {
  p: Vec2;
  kind: SnapKind;
  /** bei Kanten: die getroffene Strecke (für Fangführungen) */
  segment?: [Vec2, Vec2];
}

export const snapToGrid = (p: Vec2, step: number): Vec2 =>
  step > 0 ? { x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step } : p;

/**
 * Fang nach Priorität: Ecke > Kantenmitte > Kante > Raster.
 * Innerhalb einer Priorität gewinnt der nächstgelegene Kandidat.
 */
export function snapPoint(p: Vec2, c: SnapCandidates, o: SnapOptions): SnapResult {
  if (o.geometry) {
    let best: SnapResult | null = null;
    let bestD = o.tolerance;
    for (const v of c.vertices) {
      const d = dist(p, v);
      if (d <= bestD) {
        bestD = d;
        best = { p: v, kind: 'vertex' };
      }
    }
    if (best) return best;

    bestD = o.tolerance;
    for (const s of c.segments) {
      const m = mid(s[0], s[1]);
      const d = dist(p, m);
      if (d <= bestD) {
        bestD = d;
        best = { p: m, kind: 'midpoint', segment: s };
      }
    }
    if (best) return best;

    bestD = o.tolerance;
    for (const s of c.segments) {
      const q = closestOnSegment(p, s[0], s[1]);
      if (q.d <= bestD) {
        bestD = q.d;
        best = { p: q.p, kind: 'edge', segment: s };
      }
    }
    if (best) return best;
  }
  if (o.grid > 0) return { p: snapToGrid(p, o.grid), kind: 'grid' };
  return { p, kind: 'none' };
}

/** Winkel einrasten (⇧): Richtung von `origin` auf Vielfache von `stepDeg`, Länge bleibt */
export function constrainAngle(origin: Vec2, p: Vec2, stepDeg = 15): Vec2 {
  const d = sub(p, origin);
  const l = Math.hypot(d.x, d.y);
  if (l === 0) return p;
  const a = Math.round(angleDeg(d) / stepDeg) * stepDeg;
  const r = fromAngle(a, l);
  return { x: origin.x + r.x, y: origin.y + r.y };
}

/** Punkt in exakter Entfernung entlang der aktuellen Richtung (Zahleneingabe beim Zeichnen) */
export function atDistance(origin: Vec2, toward: Vec2, length: number): Vec2 {
  const d = sub(toward, origin);
  const a = Math.atan2(d.y, d.x);
  return { x: origin.x + Math.cos(a) * length, y: origin.y + Math.sin(a) * length };
}
