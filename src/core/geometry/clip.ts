/**
 * Flächenoperationen und Offset. Kapselt Clipper2 vollständig:
 * nach außen gibt es nur Vec2-Polygone in Metern.
 */
import { Clipper, ClipperOffset, EndType, FillRule, JoinType, Path64, Paths64, Point64 } from 'clipper2-js';
import type { Vec2 } from '../model/types';
import { area, pointInPolygon, signedArea, type Polygon, type Polyline } from './polygon';
import type { FlatRegion } from './shape';

/** 1 m = 10.000 Einheiten → Auflösung 0,1 mm */
const SCALE = 10_000;
/** Kreisbogen-Toleranz beim Offset: 2 mm */
const ARC_TOL = 0.002 * SCALE;

function toPath64(pts: Vec2[]): Path64 {
  const p = new Path64();
  for (const q of pts) p.push(new Point64(Math.round(q.x * SCALE), Math.round(q.y * SCALE)));
  return p;
}

function toPaths64(polys: Polygon[]): Paths64 {
  const ps = new Paths64();
  for (const poly of polys) if (poly.length >= 2) ps.push(toPath64(poly));
  return ps;
}

const fromPath64 = (p: Path64): Polygon => p.map((q) => ({ x: q.x / SCALE, y: q.y / SCALE }));

const regionPaths = (r: FlatRegion): Polygon[] => [r.outer, ...r.holes];

/**
 * Clipper liefert eine flache Liste aus Außenringen und Löchern.
 * Wir ordnen jedes Loch dem kleinsten Außenring zu, der es enthält.
 * Außenringe haben dasselbe Umlaufvorzeichen wie der größte Ring.
 */
export function groupRegions(paths: Polygon[]): FlatRegion[] {
  const rings = paths.filter((p) => p.length >= 3 && area(p) > 1e-10);
  if (!rings.length) return [];
  const largest = rings.reduce((a, b) => (area(a) >= area(b) ? a : b));
  const outerSign = Math.sign(signedArea(largest));
  const outers = rings.filter((r) => Math.sign(signedArea(r)) === outerSign).sort((a, b) => area(a) - area(b));
  const holes = rings.filter((r) => Math.sign(signedArea(r)) !== outerSign);
  const result: FlatRegion[] = outers.map((o) => ({ outer: o, holes: [] }));
  for (const h of holes) {
    const probe = interiorProbe(h);
    const owner = result.find((r) => pointInPolygon(probe, r.outer));
    if (owner) owner.holes.push(h);
  }
  return result;
}

/** Ein Punkt, der sicher im Ring liegt (Mitte einer kurzen Diagonale nahe einer Ecke) */
function interiorProbe(ring: Polygon): Vec2 {
  for (let i = 0; i < ring.length; i++) {
    const a = ring[(i + ring.length - 1) % ring.length];
    const b = ring[i];
    const c = ring[(i + 1) % ring.length];
    const m = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
    const probe = { x: b.x + (m.x - b.x) * 0.01, y: b.y + (m.y - b.y) * 0.01 };
    if (pointInPolygon(probe, ring)) return probe;
  }
  return ring[0];
}

export function union(regions: FlatRegion[]): FlatRegion[] {
  const out = Clipper.Union(toPaths64(regions.flatMap(regionPaths)), undefined, FillRule.NonZero);
  return groupRegions(out.map(fromPath64));
}

export function difference(subject: FlatRegion[], clip: FlatRegion[]): FlatRegion[] {
  const out = Clipper.Difference(
    toPaths64(subject.flatMap(regionPaths)),
    toPaths64(clip.flatMap(regionPaths)),
    FillRule.NonZero,
  );
  return groupRegions(out.map(fromPath64));
}

export function intersect(a: FlatRegion[], b: FlatRegion[]): FlatRegion[] {
  const out = Clipper.Intersect(toPaths64(a.flatMap(regionPaths)), toPaths64(b.flatMap(regionPaths)), FillRule.NonZero);
  return groupRegions(out.map(fromPath64));
}

/**
 * Weg mit Breite: Offset einer offenen Mittellinie um ±width/2.
 * Enden sind gerade abgeschnitten (Butt), Knicke rund oder spitz.
 */
export function offsetPolyline(line: Polyline, width: number, join: 'round' | 'miter' = 'round'): FlatRegion[] {
  if (line.length < 2 || width <= 0) return [];
  const co = new ClipperOffset(join === 'miter' ? 4 : 2, ARC_TOL);
  co.addPaths(toPaths64([line]), join === 'miter' ? JoinType.Miter : JoinType.Round, EndType.Butt);
  const sol = new Paths64();
  // Clipper2 halbiert delta bei offenen Pfaden intern: delta = Gesamtbreite
  co.execute(width * SCALE, sol);
  return groupRegions(sol.map(fromPath64));
}

/** Polygon nach außen (+) oder innen (−) versetzen */
export function offsetPolygon(poly: Polygon, delta: number, join: 'round' | 'miter' = 'miter'): FlatRegion[] {
  const co = new ClipperOffset(4, ARC_TOL);
  co.addPaths(toPaths64([poly]), join === 'miter' ? JoinType.Miter : JoinType.Round, EndType.Polygon);
  const sol = new Paths64();
  co.execute(delta * SCALE, sol);
  return groupRegions(sol.map(fromPath64));
}
