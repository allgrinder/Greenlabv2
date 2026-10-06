import type { PathNode, Vec2 } from '../model/types';
import { closestOnSegment, dist, scale, sub } from './vec';

/** Ramer-Douglas-Peucker-Vereinfachung, `eps` in Metern */
export function simplify(pts: Vec2[], eps: number): Vec2[] {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = closestOnSegment(pts[i], pts[a], pts[b]).d;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx >= 0 && maxD > eps) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * Catmull-Rom (zentripetal angenähert über die Sehnenlänge) → kubische Bézier-Knoten.
 * Die Kurve läuft exakt durch alle Punkte.
 */
export function catmullRomNodes(pts: Vec2[], closed: boolean, tension = 1 / 6): PathNode[] {
  const n = pts.length;
  if (n < 3) return pts.map((p) => ({ p }));
  const at = (i: number): Vec2 => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  return pts.map((p, i) => {
    const tangent = sub(at(i + 1), at(i - 1));
    const isEnd = !closed && (i === 0 || i === n - 1);
    if (isEnd) {
      // Endknoten: Griff nur nach innen, Länge ⅓ der Nachbarstrecke
      const nb = i === 0 ? at(1) : at(n - 2);
      const h = scale(sub(nb, p), 1 / 3);
      return i === 0 ? { p, out: h } : { p, in: h };
    }
    const lIn = dist(p, at(i - 1));
    const lOut = dist(p, at(i + 1));
    const tl = Math.hypot(tangent.x, tangent.y) || 1;
    const dir = { x: tangent.x / tl, y: tangent.y / tl };
    const k = tension * 2;
    return { p, in: scale(dir, -lIn * k), out: scale(dir, lOut * k), smooth: true };
  });
}

/**
 * Freihandlinie glätten: erst vereinfachen, dann als Bézier durch die Restpunkte legen.
 * @param eps Vereinfachungstoleranz in Metern (z. B. 4 px / pxPerMeter)
 */
export function smoothFreehand(raw: Vec2[], closed: boolean, eps: number): PathNode[] {
  const dense = raw.filter((p, i) => i === 0 || dist(p, raw[i - 1]) > eps * 0.25);
  let simple = simplify(dense, eps);
  if (closed && simple.length > 3 && dist(simple[0], simple[simple.length - 1]) < eps * 2) simple = simple.slice(0, -1);
  return catmullRomNodes(simple, closed);
}
