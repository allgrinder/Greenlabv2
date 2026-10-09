/**
 * Anordnung in Pflanzflächen (Rabatten): welche Art in welcher Pflanzgruppe („Drift“) steht.
 *
 * Mit Staffelung stehen niedrige Arten vorn, hohe hinten. „Vorn“ ist die Seite zum Garten (Rasen, Weg);
 * Kanten an der Grundstücksgrenze gelten als hinten. Ein freistehendes Inselbeet hat die hohen Arten
 * in der Mitte. Ein Zufallsanteil lässt die Höhenbänder ineinanderlaufen, damit es nicht wie
 * Reihen wirkt; die Anteile der Mischung bleiben dabei erhalten.
 */
import { distanceToPolyline, type Polygon } from './geometry/polygon';
import type { Vec2 } from './model/types';

/** Kantenmitte näher als das an der Grundstücksgrenze → Rückseite */
const BACK_TOLERANCE = 0.8;

/**
 * Tiefe eines Punkts in der Fläche: 0 an der Vorderkante, 1 an der entferntesten Stelle.
 * `boundary`: Grundstückskontur (Kanten daran gelten als Rückseite).
 */
export function bedDepth(outer: Polygon, boundary: Polygon | null): (p: Vec2) => number {
  const segs = outer.map((a, i) => [a, outer[(i + 1) % outer.length]] as const);
  const front = segs.filter(([a, b]) => {
    if (!boundary || boundary.length < 3) return true;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    return distanceToPolyline(mid, boundary, true) > BACK_TOLERANCE;
  });
  // Inselbeet (keine Rückseite) oder ganz an der Grenze (keine Vorderseite): Abstand zur ganzen Kontur
  const use = front.length === 0 || front.length === segs.length ? segs : front;
  const d = (p: Vec2) => Math.min(...use.map(([a, b]) => distanceToPolyline(p, [a, b], false)));
  // größte Tiefe über ein grobes Raster schätzen
  const xs = outer.map((p) => p.x);
  const ys = outer.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let max = 1e-6;
  const n = 14;
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= n; j++) {
      const p = { x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * j) / n };
      max = Math.max(max, d(p));
    }
  return (p) => Math.min(1, d(p) / max);
}

/**
 * Arten auf Pflanzgruppen verteilen. Gibt je Gruppe den Index in `mix` zurück.
 * Ohne Staffelung: zufällig nach Anteil. Mit Staffelung: nach Tiefe (+ Zufall) sortiert,
 * dann der Reihe nach nach Höhe aufsteigend, jeweils so viele Gruppen wie der Anteil vorgibt.
 */
export function assignSpecies(depths: number[], mix: { height: number; share: number }[], rnd: () => number, tiers: boolean): number[] {
  const n = depths.length;
  if (!tiers || mix.length < 2) {
    return depths.map(() => {
      let t = rnd();
      const i = mix.findIndex((m) => (t -= m.share) <= 0);
      return i < 0 ? mix.length - 1 : i;
    });
  }
  const byHeight = mix.map((m, i) => ({ ...m, i })).sort((a, b) => a.height - b.height);
  const order = depths.map((d, k) => ({ k, key: d + (rnd() - 0.5) * 0.35 })).sort((a, b) => a.key - b.key);
  const total = mix.reduce((s, m) => s + m.share, 0) || 1;
  const out = new Array<number>(n);
  let acc = 0;
  let s = 0;
  order.forEach(({ k }, rank) => {
    const q = (rank + 0.5) / n;
    while (s < byHeight.length - 1 && q > (acc + byHeight[s].share) / total) acc += byHeight[s++].share;
    out[k] = byHeight[s].i;
  });
  return out;
}

/** Anteile auf 1 normieren (beim Bearbeiten der Mischung) */
export function normalizeMix<T extends { share: number }>(mix: T[]): T[] {
  const sum = mix.reduce((s, m) => s + Math.max(0, m.share), 0);
  if (sum <= 0) return mix.map((m) => ({ ...m, share: 1 / mix.length }));
  return mix.map((m) => ({ ...m, share: Math.max(0, m.share) / sum }));
}
