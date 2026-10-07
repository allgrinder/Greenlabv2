/**
 * Einsehbarkeit: Von welchen Stellen des Gartens kann man von den Blickpunkten (Nachbarfenster,
 * Straße …) aus eine Person sehen? Sichtlinien in 2,5D gegen Hindernisse mit Höhenbereich:
 * Gebäude, Hecken, Spalierschirme (erst ab Stammhöhe) und Baumkronen. Laub lässt je nach
 * Jahreszeit Sicht durch (Blickdichte).
 */
import { getItem } from './catalog/items';
import { getSpecies } from './catalog/plants';
import { espalierDensity, espalierFootprint } from './espalier';
import { diameterAt, heightAt, isBare, type Season } from './growth';
import { offsetPolyline } from './geometry/clip';
import { footprint, itemSize } from './geometry/objects';
import { areaWithHoles, bbox, pointInPolygon, type Polygon } from './geometry/polygon';
import { flattenPath } from './geometry/shape';
import { rasterize } from './sun/shadows';
import type { Observer, Project, Vec2 } from './model/types';

/** Hindernis: Höhenbereich und Blickdichte (1 = undurchsichtig) */
interface Interval {
  h0: number;
  h1: number;
  density: number;
}

export interface ObstacleGrid {
  cols: number;
  rows: number;
  origin: Vec2;
  cell: number;
  /** je Zelle eine Liste von Höhenbereichen (meist leer) */
  cells: (Interval[] | undefined)[];
}

/** Augenhöhe der beobachteten Person */
export const TARGET_HEIGHTS = { sitting: 1.2, standing: 1.7, lying: 0.5 } as const;
export type TargetPose = keyof typeof TARGET_HEIGHTS;

export function obstacleGrid(doc: Project, season: Season, years = 0, cell = 0.5, margin = 0): ObstacleGrid {
  const b = bbox([...doc.site.boundary, ...doc.observers.map((o) => o.position)]);
  const origin = { x: b.minX - margin, y: b.minY - margin };
  const cols = Math.max(1, Math.ceil((b.maxX - b.minX + 2 * margin) / cell));
  const rows = Math.max(1, Math.ceil((b.maxY - b.minY + 2 * margin) / cell));
  const cells: (Interval[] | undefined)[] = new Array(cols * rows);
  const add = (polys: Polygon[], iv: Interval) => {
    for (const poly of polys)
      rasterize(poly, cols, rows, origin, cell, (i) => {
        (cells[i] ??= []).push(iv);
      });
  };
  for (const lid of doc.layerOrder) {
    const layer = doc.layers[lid];
    if (!layer.visible) continue;
    for (const id of layer.objectOrder) {
      const o = doc.objects[id];
      if (!o || o.hidden) continue;
      if (o.type === 'item') {
        const h = itemSize(o).height;
        if (h < 0.3) continue;
        const it = getItem(o.catalogId);
        const density = it.category === 'greenhouse' ? 0.3 : it.category === 'fence' ? 0.7 : it.category === 'furniture' || it.category === 'play' ? 0.4 : 1;
        add(footprint(o).map((r) => r.outer), { h0: 0, h1: h, density });
      } else if (o.type === 'hedge') {
        const sp = getSpecies(o.speciesId);
        const w = Math.max(sp.diameterPlanted, cell * 1.2);
        add(offsetPolyline(flattenPath(o.centerline, 0.05), w, 'round').map((r) => r.outer), { h0: 0, h1: o.height, density: season === 'winter' && sp.deciduous ? 0.65 : 0.92 });
      } else if (o.type === 'espalier') {
        // dünne Schirme mindestens eine Rasterzelle breit, sonst fallen sie durchs Raster
        const band = o.depth < cell * 1.2 ? offsetPolyline(flattenPath(o.centerline, 0.05), cell * 1.2, 'miter') : espalierFootprint(o);
        add(band.map((r) => r.outer), { h0: o.stemHeight, h1: o.height, density: espalierDensity(o.speciesId, season) });
      } else if (o.type === 'plant') {
        const sp = getSpecies(o.speciesId);
        if (sp.kind !== 'tree' && sp.kind !== 'shrub') continue;
        const d = diameterAt(o, years);
        const h = heightAt(o, years);
        const bare = isBare(sp, season);
        const poly = Array.from({ length: 24 }, (_, i) => ({ x: o.position.x + Math.cos((i / 24) * Math.PI * 2) * d / 2, y: o.position.y + Math.sin((i / 24) * Math.PI * 2) * d / 2 }));
        add([poly], sp.kind === 'tree' ? { h0: h * 0.3, h1: h, density: bare ? 0.25 : 0.85 } : { h0: 0, h1: h, density: bare ? 0.3 : 0.85 });
      }
    }
  }
  return { cols, rows, origin, cell, cells };
}

/**
 * Durchlässigkeit der Sichtlinie (1 = frei, 0 = verdeckt) vom Auge `a` (Höhe ha)
 * zum Punkt `b` (Höhe hb). Die Zellen von Start und Ziel zählen nicht (eigene Wand).
 */
export function lineTransmittance(g: ObstacleGrid, a: Vec2, ha: number, b: Vec2, hb: number, step = 0.25): number {
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (L < 1e-6) return 1;
  const n = Math.max(1, Math.ceil(L / step));
  const cellOf = (p: Vec2) => {
    const c = Math.floor((p.x - g.origin.x) / g.cell);
    const r = Math.floor((p.y - g.origin.y) / g.cell);
    return c < 0 || r < 0 || c >= g.cols || r >= g.rows ? -1 : r * g.cols + c;
  };
  const start = cellOf(a);
  const end = cellOf(b);
  let T = 1;
  let last = -2;
  for (let k = 1; k < n; k++) {
    const t = k / n;
    const i = cellOf({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    if (i < 0 || i === last || i === start || i === end) continue;
    last = i;
    const ivs = g.cells[i];
    if (!ivs) continue;
    const z = ha + (hb - ha) * t;
    for (const iv of ivs) if (z >= iv.h0 && z <= iv.h1) T *= 1 - iv.density;
    if (T < 0.02) return 0;
  }
  return T;
}

export interface PrivacyGrid {
  cols: number;
  rows: number;
  origin: Vec2;
  cell: number;
  /** Sichtbarkeit 0–1 je Zelle (max. über alle Blickpunkte), NaN = außerhalb des Grundstücks */
  seen: Float32Array;
  /** Anteil der Grundstücksfläche, die einsehbar ist (Sichtbarkeit > 0,5) */
  ratio: number;
}

export function privacyGrid(doc: Project, opts: { season: Season; pose: TargetPose; years?: number; cell?: number; observers?: Observer[] }): PrivacyGrid {
  const cell = opts.cell ?? 0.5;
  const obs = opts.observers ?? doc.observers;
  const grid = obstacleGrid(doc, opts.season, opts.years ?? 0, cell);
  const b = bbox(doc.site.boundary);
  const origin = { x: b.minX, y: b.minY };
  const cols = Math.max(1, Math.ceil((b.maxX - b.minX) / cell));
  const rows = Math.max(1, Math.ceil((b.maxY - b.minY) / cell));
  const seen = new Float32Array(cols * rows).fill(NaN);
  const hT = TARGET_HEIGHTS[opts.pose];
  let inside = 0;
  let visible = 0;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const p = { x: origin.x + (c + 0.5) * cell, y: origin.y + (r + 0.5) * cell };
      if (!pointInPolygon(p, doc.site.boundary)) continue;
      inside++;
      let v = 0;
      for (const o of obs) v = Math.max(v, lineTransmittance(grid, o.position, o.eyeHeight, p, hT));
      seen[r * cols + c] = v;
      if (v > 0.5) visible++;
    }
  return { cols, rows, origin, cell, seen, ratio: inside ? visible / inside : 0 };
}

/** Anteil einsehbarer Fläche innerhalb eines Polygons (z. B. Terrasse) */
export function seenRatioIn(g: PrivacyGrid, poly: Polygon): number {
  let n = 0;
  let v = 0;
  rasterize(poly, g.cols, g.rows, g.origin, g.cell, (i) => {
    if (Number.isNaN(g.seen[i])) return;
    n++;
    if (g.seen[i] > 0.5) v++;
  });
  return n ? v / n : 0;
}

/** Aufenthaltsbereiche, die besonders geschützt sein sollen: Terrassen, Decks, Sitzplätze */
export function privateSpots(doc: Project): { name: string; poly: Polygon; area: number }[] {
  const out: { name: string; poly: Polygon; area: number }[] = [];
  for (const o of Object.values(doc.objects)) {
    if (o.hidden) continue;
    if (o.type === 'area' && (o.materialId === 'wood' || o.materialId === 'paving')) {
      for (const r of footprint(o)) out.push({ name: o.name ?? (o.materialId === 'wood' ? 'Holzdeck' : 'Terrasse'), poly: r.outer, area: areaWithHoles(r.outer, r.holes) });
    } else if (o.type === 'item') {
      const it = getItem(o.catalogId);
      if (it.category === 'terrace' || it.category === 'furniture') for (const r of footprint(o)) out.push({ name: o.name ?? it.name, poly: r.outer, area: areaWithHoles(r.outer, r.holes) });
    }
  }
  return out.filter((s) => s.area >= 1).sort((a, b) => b.area - a.area).slice(0, 5);
}
