import type { PathGeometry, PathNode, RectGeometry, Region, ShapeGeometry, Vec2 } from '../model/types';
import { type Cubic, cubicLength, flattenCubic } from './bezier';
import { add, rotate } from './vec';
import { dedupe, type Polygon, type Polyline } from './polygon';

/** Standard-Toleranz der Flachlegung in Metern (5 mm) */
export const FLATTEN_TOL = 0.005;

/** Kreisnäherung mit Bézier: Griff-Länge = r · KAPPA */
const KAPPA = 0.5522847498;

/** Segmente eines Pfads als Kubiken (gerade Segmente: Griffe = Endpunkte) */
export function pathSegments(path: { nodes: PathNode[]; closed: boolean }): Cubic[] {
  const { nodes, closed } = path;
  const n = nodes.length;
  const segs: Cubic[] = [];
  const count = closed ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const a = nodes[i];
    const b = nodes[(i + 1) % n];
    segs.push([a.p, a.out ? add(a.p, a.out) : a.p, b.in ? add(b.p, b.in) : b.p, b.p]);
  }
  return segs;
}

/** Rechteck als Knotenliste (Uhrzeigersinn im Bildschirmsystem), Ecken ggf. gerundet */
export function rectNodes(r: RectGeometry): PathNode[] {
  const hw = r.width / 2;
  const hd = r.depth / 2;
  const cr = Math.max(0, Math.min(r.cornerRadius, hw, hd));
  const T = (x: number, y: number): Vec2 => rotate({ x: r.center.x + x, y: r.center.y + y }, r.rotationDeg, r.center);
  const R = (x: number, y: number): Vec2 => rotate({ x, y }, r.rotationDeg);
  if (cr === 0) return [T(-hw, -hd), T(hw, -hd), T(hw, hd), T(-hw, hd)].map((p) => ({ p }));
  const k = cr * KAPPA;
  // Je Ecke zwei Knoten: Ende der Kante (mit Griff in die Rundung) und Anfang der nächsten
  return [
    { p: T(-hw + cr, -hd), in: R(-k, 0) },
    { p: T(hw - cr, -hd), out: R(k, 0) },
    { p: T(hw, -hd + cr), in: R(0, -k) },
    { p: T(hw, hd - cr), out: R(0, k) },
    { p: T(hw - cr, hd), in: R(k, 0) },
    { p: T(-hw + cr, hd), out: R(-k, 0) },
    { p: T(-hw, hd - cr), in: R(0, k) },
    { p: T(-hw, -hd + cr), out: R(0, -k) },
  ];
}

export function toPath(shape: ShapeGeometry): PathGeometry {
  if (shape.kind === 'path') return shape;
  return { kind: 'path', nodes: rectNodes(shape), closed: true, source: 'rect' };
}

/** Pfad → Polylinie (offen) bzw. Polygon (geschlossen, ohne Schlussduplikat) */
export function flattenPath(path: { nodes: PathNode[]; closed: boolean }, tol = FLATTEN_TOL): Polyline {
  if (path.nodes.length === 0) return [];
  const out: Vec2[] = [path.nodes[0].p];
  for (const seg of pathSegments(path)) flattenCubic(seg, tol, out);
  return dedupe(out, path.closed);
}

export const flattenShape = (shape: ShapeGeometry, tol = FLATTEN_TOL): Polygon => flattenPath(toPath(shape), tol);

export interface FlatRegion {
  outer: Polygon;
  holes: Polygon[];
}

export const flattenRegion = (r: Region, tol = FLATTEN_TOL): FlatRegion => ({
  outer: flattenShape(r.outer, tol),
  holes: r.holes.map((h) => flattenPath(h, tol)),
});

/** Exakte Länge eines Pfads (Bogenlänge der Béziers) */
export function pathLength(path: { nodes: PathNode[]; closed: boolean }): number {
  return pathSegments(path).reduce((s, c) => s + cubicLength(c), 0);
}

/** Alle Knotenpunkte einer Form (für Fang und Griffe) */
export const shapeVertices = (shape: ShapeGeometry): Vec2[] => toPath(shape).nodes.map((n) => n.p);
