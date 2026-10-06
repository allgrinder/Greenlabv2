import type { Vec2 } from '../model/types';
import { dist } from './vec';

export type Cubic = [Vec2, Vec2, Vec2, Vec2];

export function cubicAt([p0, p1, p2, p3]: Cubic, t: number): Vec2 {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

export function cubicDerivative([p0, p1, p2, p3]: Cubic, t: number): Vec2 {
  const u = 1 - t;
  return {
    x: 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
  };
}

/** Ist die Kurve eine Gerade (Griffe auf den Endpunkten)? */
export const isStraight = (c: Cubic): boolean =>
  c[0].x === c[1].x && c[0].y === c[1].y && c[2].x === c[3].x && c[2].y === c[3].y;

/** Abstand der Kontrollpunkte zur Sehne – Maß für die Flachheit */
function flatness([p0, p1, p2, p3]: Cubic): number {
  const ux = 3 * p1.x - 2 * p0.x - p3.x;
  const uy = 3 * p1.y - 2 * p0.y - p3.y;
  const vx = 3 * p2.x - p0.x - 2 * p3.x;
  const vy = 3 * p2.y - p0.y - 2 * p3.y;
  return Math.sqrt((Math.max(ux * ux, vx * vx) + Math.max(uy * uy, vy * vy)) / 16);
}

function split(c: Cubic): [Cubic, Cubic] {
  const [p0, p1, p2, p3] = c;
  const m = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const a = m(p0, p1);
  const b = m(p1, p2);
  const cc = m(p2, p3);
  const d = m(a, b);
  const e = m(b, cc);
  const f = m(d, e);
  return [
    [p0, a, d, f],
    [f, e, cc, p3],
  ];
}

/**
 * Adaptive Flachlegung. Liefert Punkte OHNE den Startpunkt, damit Segmente
 * ohne Duplikate aneinandergehängt werden können.
 * @param tol maximale Abweichung in Metern
 */
export function flattenCubic(c: Cubic, tol = 0.005, out: Vec2[] = [], depth = 0): Vec2[] {
  if (isStraight(c) || depth > 16 || flatness(c) <= tol) {
    out.push(c[3]);
    return out;
  }
  const [l, r] = split(c);
  flattenCubic(l, tol, out, depth + 1);
  flattenCubic(r, tol, out, depth + 1);
  return out;
}

export function cubicLength(c: Cubic, tol = 0.0005): number {
  const pts = flattenCubic(c, tol);
  let l = 0;
  let prev = c[0];
  for (const p of pts) {
    l += dist(prev, p);
    prev = p;
  }
  return l;
}
