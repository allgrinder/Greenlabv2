/**
 * Schattenwurf und Sonnenstunden-Heatmap.
 *
 * Schattenwerfer sind Gehölze (Krone als Scheibe in Kronenhöhe), Hecken und Objekte mit Höhe
 * (extrudierter Grundriss). Schatten werden als Polygone geliefert; die Heatmap rastert sie
 * per Scanline in ein Gitter und summiert die besonnte Zeit über den Tag.
 */
import { espalierDensity, espalierFootprint } from '../espalier';
import { getItem } from '../catalog/items';
import { getSpecies } from '../catalog/plants';
import { diameterAt, heightAt, hedgeWidthAt, shadeDensity, type Season } from '../growth';
import { circlePolygon, footprint, itemSize } from '../geometry/objects';
import { offsetPolyline } from '../geometry/clip';
import { bbox, type Polygon } from '../geometry/polygon';
import { flattenPath } from '../geometry/shape';
import type { GeoLocation, Project, Vec2 } from '../model/types';
import { dayInfo, shadowVector, sunAt } from './sun';

export type Caster =
  /** Krone als Zylinder von Kronenansatz h0 bis Kronenspitze h1 */
  | { kind: 'disc'; c: Vec2; r: number; h0: number; h1: number; density: number }
  /** Extrudierter Grundriss; `selfLit`: Oberseite wird bepflanzt (Hochbeet) und liegt selbst in der Sonne */
  | { kind: 'prism'; outlines: Polygon[]; h: number; density: number; selfLit?: boolean }
  /** Angehobener Körper von h0 bis h1 (Spalierschirm): Schatten beginnt erst in Stammhöhe */
  | { kind: 'raised'; outlines: Polygon[]; h0: number; h1: number; density: number };

export function collectCasters(doc: Project, years: number, season: Season): Caster[] {
  const out: Caster[] = [];
  for (const lid of doc.layerOrder) {
    const layer = doc.layers[lid];
    if (!layer.visible) continue;
    for (const id of layer.objectOrder) {
      const o = doc.objects[id];
      if (!o || o.hidden) continue;
      if (o.type === 'plant') {
        const sp = getSpecies(o.speciesId);
        if (sp.kind !== 'tree' && sp.kind !== 'shrub') continue;
        const d = diameterAt(o, years);
        const h = heightAt(o, years);
        // Kronenansatz: Bäume bei etwa 25 % der Höhe, Sträucher am Boden; Spitze etwas unter der Gesamthöhe
        out.push({ kind: 'disc', c: o.position, r: d / 2, h0: sp.kind === 'tree' ? h * 0.25 : 0, h1: h * 0.85, density: shadeDensity(sp, season) });
      } else if (o.type === 'hedge') {
        const sp = getSpecies(o.speciesId);
        const outline = offsetPolyline(flattenPath(o.centerline, 0.05), hedgeWidthAt(o, years), 'round').map((r) => r.outer);
        out.push({ kind: 'prism', outlines: outline, h: o.height, density: season === 'winter' ? 0.8 : shadeDensity(sp, season) });
      } else if (o.type === 'espalier') {
        out.push({ kind: 'raised', outlines: espalierFootprint(o).map((r) => r.outer), h0: o.stemHeight, h1: o.height, density: espalierDensity(o.speciesId, season) });
      } else if (o.type === 'item') {
        const h = itemSize(o).height;
        if (h <= 0.05) continue;
        const it = getItem(o.catalogId);
        out.push({ kind: 'prism', outlines: footprint(o).map((r) => r.outer), h, density: it.category === 'greenhouse' ? 0.35 : 1, selfLit: it.category === 'raisedBed' });
      }
    }
  }
  return out;
}

const shift = (pts: Polygon, d: Vec2) => pts.map((p) => ({ x: p.x + d.x, y: p.y + d.y }));

/** Schattenpolygone eines Werfers; ihre Vereinigung ist der Schatten */
export function shadowPolygons(c: Caster, sv: Vec2): Polygon[] {
  if (c.kind === 'disc') {
    // Vereinigung der Kronenscheiben zwischen h0 und h1: zwei Kreise und die verbindende Hülle
    const a = { x: c.c.x + sv.x * c.h0, y: c.c.y + sv.y * c.h0 };
    const b = { x: c.c.x + sv.x * c.h1, y: c.c.y + sv.y * c.h1 };
    const r0 = c.r * 0.95;
    const r1 = c.r * 0.8;
    const polys = [circlePolygon(a, r0, 32), circlePolygon(b, r1, 32)];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L > 1e-6) {
      const n = { x: -(b.y - a.y) / L, y: (b.x - a.x) / L };
      polys.push([
        { x: a.x + n.x * r0, y: a.y + n.y * r0 },
        { x: b.x + n.x * r1, y: b.y + n.y * r1 },
        { x: b.x - n.x * r1, y: b.y - n.y * r1 },
        { x: a.x - n.x * r0, y: a.y - n.y * r0 },
      ]);
    }
    return polys;
  }
  if (c.kind === 'raised') {
    const lo = { x: sv.x * c.h0, y: sv.y * c.h0 };
    const hi = { x: sv.x * c.h1, y: sv.y * c.h1 };
    const out: Polygon[] = [];
    for (const o of c.outlines) {
      const a = shift(o, lo);
      const b = shift(o, hi);
      out.push(a, b);
      for (let i = 0; i < o.length; i++) out.push([a[i], a[(i + 1) % o.length], b[(i + 1) % o.length], b[i]]);
    }
    return out;
  }
  const d = { x: sv.x * c.h, y: sv.y * c.h };
  const polys: Polygon[] = [];
  for (const o of c.outlines) {
    const top = shift(o, d);
    polys.push(o, top);
    // Seitenflächen: je Kante ein Viereck – funktioniert auch für konkave Grundrisse
    for (let i = 0; i < o.length; i++) {
      const a = o[i];
      const b = o[(i + 1) % o.length];
      polys.push([a, b, top[(i + 1) % o.length], top[i]]);
    }
  }
  return polys;
}

export interface SunGrid {
  /** Sonnenstunden je Zelle */
  hours: Float32Array;
  cols: number;
  rows: number;
  origin: Vec2;
  cell: number;
  dayLength: number;
}

/**
 * Polygon per Scanline in ein Gitter rastern: ruft fill(index) für jede Zelle,
 * deren Mittelpunkt im Polygon liegt (Even-Odd-Regel).
 */
export function rasterize(poly: Polygon, cols: number, rows: number, origin: Vec2, cell: number, fill: (i: number) => void) {
  const b = bbox(poly);
  const r0 = Math.max(0, Math.floor((b.minY - origin.y) / cell));
  const r1 = Math.min(rows - 1, Math.ceil((b.maxY - origin.y) / cell));
  const xs: number[] = [];
  for (let r = r0; r <= r1; r++) {
    const y = origin.y + (r + 0.5) * cell;
    xs.length = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const c = poly[j];
      if (a.y > y !== c.y > y) xs.push(a.x + ((y - a.y) / (c.y - a.y)) * (c.x - a.x));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil((xs[k] - origin.x) / cell - 0.5));
      const c1 = Math.min(cols - 1, Math.floor((xs[k + 1] - origin.x) / cell - 0.5));
      for (let c = c0; c <= c1; c++) fill(r * cols + c);
    }
  }
}

/**
 * Sonnenstunden pro Tag auf einem Gitter über dem Grundstück.
 * @param stepMin Zeitschritt in Minuten
 */
export function sunHours(doc: Project, loc: GeoLocation, year: number, doy: number, opts: { cell?: number; stepMin?: number; years?: number; season?: Season } = {}): SunGrid {
  const cell = opts.cell ?? 0.5;
  const step = (opts.stepMin ?? 20) / 60;
  const b = bbox(doc.site.boundary);
  const origin = { x: b.minX, y: b.minY };
  const cols = Math.max(1, Math.ceil((b.maxX - b.minX) / cell));
  const rows = Math.max(1, Math.ceil((b.maxY - b.minY) / cell));
  const hours = new Float32Array(cols * rows);
  const shade = new Float32Array(cols * rows);
  const casters = collectCasters(doc, opts.years ?? 0, opts.season ?? 'summer');
  const info = dayInfo(loc, year, doy);
  if (info.sunrise === null || info.sunset === null) return { hours, cols, rows, origin, cell, dayLength: info.maxAltitudeDeg > 0 ? 24 : 0 };
  for (let h = info.sunrise + step / 2; h < info.sunset; h += step) {
    const sun = sunAt(loc, year, doy, h);
    const sv = shadowVector(sun, doc.site.northDeg);
    if (!sv) continue;
    shade.fill(0);
    for (const c of casters) {
      const dens = c.density;
      if (c.kind === 'prism' && c.selfLit) {
        // eigene Oberseite ausnehmen
        const own = new Set<number>();
        for (const o of c.outlines) rasterize(o, cols, rows, origin, cell, (i) => own.add(i));
        for (const poly of shadowPolygons(c, sv)) rasterize(poly, cols, rows, origin, cell, (i) => !own.has(i) && (shade[i] = Math.max(shade[i], dens)));
      } else for (const poly of shadowPolygons(c, sv)) rasterize(poly, cols, rows, origin, cell, (i) => (shade[i] = Math.max(shade[i], dens)));
    }
    for (let i = 0; i < hours.length; i++) hours[i] += step * (1 - shade[i]);
  }
  return { hours, cols, rows, origin, cell, dayLength: info.sunset - info.sunrise };
}

/** Farbskala der Heatmap (0 h → 13+ h), aus dem Design */
export const HEAT_STOPS: [number, [number, number, number]][] = [
  [0, [0x4d, 0x6a, 0x8f]],
  [4.7, [0x8f, 0xb2, 0xb0]],
  [7.2, [0xe7, 0xd9, 0x8e]],
  [9.5, [0xee, 0xb0, 0x62]],
  [13, [0xdd, 0x6a, 0x3e]],
];

export function heatColor(h: number): [number, number, number] {
  if (h <= HEAT_STOPS[0][0]) return HEAT_STOPS[0][1];
  for (let i = 0; i < HEAT_STOPS.length - 1; i++) {
    const [a, ca] = HEAT_STOPS[i];
    const [b, cb] = HEAT_STOPS[i + 1];
    if (h <= b) {
      const t = (h - a) / (b - a);
      return ca.map((v, j) => Math.round(v + (cb[j] - v) * t)) as [number, number, number];
    }
  }
  return HEAT_STOPS[HEAT_STOPS.length - 1][1];
}

/** Mittlere Sonnenstunden innerhalb einer Fläche (für Empfehlungen) */
export function meanHoursIn(grid: SunGrid, poly: Polygon): number {
  let sum = 0;
  let n = 0;
  rasterize(poly, grid.cols, grid.rows, grid.origin, grid.cell, (i) => {
    sum += grid.hours[i];
    n++;
  });
  return n ? sum / n : 0;
}
