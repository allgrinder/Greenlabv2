/**
 * Spalierbäume und Pflanzgruppen: Geometrie, Stückzahlen und Darstellungshilfen.
 */
import { getSpecies } from './catalog/plants';
import { offsetPolyline } from './geometry/clip';
import type { Polygon } from './geometry/polygon';
import { flattenPath, type FlatRegion } from './geometry/shape';
import type { EspalierObject, ScatterObject, Vec2 } from './model/types';

type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export const espalierLine = (o: EspalierObject): Vec2[] => flattenPath(o.centerline, 0.02);

/** Länge der Pflanzlinie, m */
export function lineLength(line: Vec2[]): number {
  let L = 0;
  for (let i = 1; i < line.length; i++) L += Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y);
  return L;
}

/** Punkt und Richtung bei Bogenlänge s */
export function along(line: Vec2[], s: number): { p: Vec2; dir: Vec2 } {
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (acc + l >= s || i === line.length - 1) {
      const t = l > 0 ? Math.min(1, Math.max(0, (s - acc) / l)) : 0;
      return { p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, dir: l > 0 ? { x: (b.x - a.x) / l, y: (b.y - a.y) / l } : { x: 1, y: 0 } };
    }
    acc += l;
  }
  return { p: line[0] ?? { x: 0, y: 0 }, dir: { x: 1, y: 0 } };
}

/** Stammpositionen: so viele Bäume, dass der Schirm die Linie füllt, mittig verteilt */
export function espalierTrees(o: EspalierObject): { p: Vec2; dir: Vec2 }[] {
  const line = espalierLine(o);
  const L = lineLength(line);
  if (L < 0.01) return [];
  const n = Math.max(1, Math.round(L / Math.max(0.3, o.spacing)));
  const step = L / n;
  return Array.from({ length: n }, (_, i) => along(line, step * (i + 0.5)));
}

export const espalierCount = (o: EspalierObject) => espalierTrees(o).length;

/** Grundriss des Schirms (Band entlang der Linie) */
export function espalierFootprint(o: EspalierObject): FlatRegion[] {
  return offsetPolyline(espalierLine(o), Math.max(0.1, o.depth), 'miter');
}

/** Blickdichte des Schirms je Jahreszeit (0–1): immergrün dicht, Laub im Winter kahl */
export function espalierDensity(speciesId: string, season: Season): number {
  const sp = getSpecies(speciesId);
  if (!sp.deciduous) return 0.95;
  if (season === 'winter') return sp.marcescent ? 0.6 : 0.2;
  if (season === 'spring') return 0.8;
  return 0.92;
}

/* ---------------- Pflanzgruppen (Pinsel) ---------------- */

/** Pflanzendurchmesser für die Verteilung (ausgewachsen, leicht überlappend) */
export const scatterDiameter = (speciesId: string) => getSpecies(speciesId).diameterMature * 0.85;

/** Konvexe Hülle (Andrew) */
export function convexHull(pts: Vec2[]): Polygon {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Vec2[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Vec2[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/** Grundriss einer Pflanzgruppe: Hülle um alle Pflanzen (für Auswahl und Fang) */
export function scatterFootprint(o: ScatterObject): FlatRegion[] {
  if (!o.plants.length) return [];
  const ring: Vec2[] = [];
  for (const q of o.plants) {
    const r = scatterDiameter(q.speciesId) / 2;
    for (let i = 0; i < 8; i++) ring.push({ x: q.p.x + Math.cos((i / 8) * Math.PI * 2) * r, y: q.p.y + Math.sin((i / 8) * Math.PI * 2) * r });
  }
  return [{ outer: convexHull(ring), holes: [] }];
}

/** Stückzahl je Art */
export function scatterCounts(o: ScatterObject): Map<string, number> {
  const m = new Map<string, number>();
  for (const q of o.plants) m.set(q.speciesId, (m.get(q.speciesId) ?? 0) + 1);
  return m;
}

export interface BrushOptions {
  /** Pinselradius, m */
  radius: number;
  /** Dichte 0,2–1 (1 = Pflanzen berühren sich) */
  density: number;
  /** Arten mit Gewicht */
  mix: { speciesId: string; weight: number }[];
}

/**
 * Pinseltupfer: neue Pflanzen im Kreis um `c`, mit Mindestabstand zu allen vorhandenen
 * (Poisson-Scheiben-Verteilung). `existing` enthält die schon gesetzten Pflanzen in der Nähe.
 * `inside` kann Positionen ausschließen (z. B. außerhalb von Beeten).
 */
export function brushDab(c: Vec2, opts: BrushOptions, existing: ScatterPlantLike[], rnd: () => number, inside: (p: Vec2) => boolean = () => true): ScatterPlantLike[] {
  const out: ScatterPlantLike[] = [];
  if (!opts.mix.length) return out;
  const total = opts.mix.reduce((s, m) => s + m.weight, 0) || 1;
  const pick = () => {
    let t = rnd() * total;
    for (const m of opts.mix) if ((t -= m.weight) <= 0) return m.speciesId;
    return opts.mix[opts.mix.length - 1].speciesId;
  };
  const spacing = (a: string, b: string) => ((scatterDiameter(a) + scatterDiameter(b)) / 2) / Math.max(0.2, Math.min(1, opts.density));
  const attempts = Math.ceil(opts.radius * opts.radius * 40);
  const all = existing.slice();
  for (let k = 0; k < attempts; k++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * opts.radius;
    const p = { x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d };
    if (!inside(p)) continue;
    const sp = pick();
    let ok = true;
    for (const q of all) {
      const s = spacing(sp, q.speciesId);
      if (Math.abs(q.p.x - p.x) < s && Math.abs(q.p.y - p.y) < s && Math.hypot(q.p.x - p.x, q.p.y - p.y) < s) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const plant = { speciesId: sp, p };
    out.push(plant);
    all.push(plant);
  }
  return out;
}

type ScatterPlantLike = { speciesId: string; p: Vec2 };

/** Radierer: Pflanzen im Kreis entfernen */
export const eraseIn = <T extends ScatterPlantLike>(plants: T[], c: Vec2, r: number) => plants.filter((q) => Math.hypot(q.p.x - c.x, q.p.y - c.y) > r);
