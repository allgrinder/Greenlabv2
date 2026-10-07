/**
 * Abgeleitete Geometrie je Planobjekt: Grundfläche, Bounding-Box, Fangpunkte.
 * Ergebnisse werden pro Objekt-Referenz gecacht – Immer erzeugt bei Änderung eine neue Referenz.
 */
import { getItem } from '../catalog/items';
import { getSpecies } from '../catalog/plants';
import type { DimensionAnchor, PlanObject, Vec2 } from '../model/types';
import { offsetPolyline } from './clip';
import { bbox, type BBox, type Polygon } from './polygon';
import { type FlatRegion, flattenPath, flattenRegion, toPath } from './shape';
import { rotate } from './vec';

export function circlePolygon(c: Vec2, r: number, segments = 48): Polygon {
  const pts: Polygon = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
  }
  return pts;
}

export function rotatedRect(center: Vec2, w: number, d: number, rotationDeg: number): Polygon {
  const hw = w / 2;
  const hd = d / 2;
  return [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ].map((p) => rotate({ x: center.x + p.x, y: center.y + p.y }, rotationDeg, center));
}

export const plantDiameter = (o: Extract<PlanObject, { type: 'plant' }>): number =>
  o.plantedDiameter ?? getSpecies(o.speciesId).diameterPlanted;

export const hedgeWidth = (o: Extract<PlanObject, { type: 'hedge' }>): number => getSpecies(o.speciesId).diameterPlanted;

export function itemSize(o: Extract<PlanObject, { type: 'item' }>): { width: number; depth: number; height: number } {
  if (o.size) return o.size;
  const it = getItem(o.catalogId);
  return { width: it.width, depth: it.depth, height: it.height };
}

const footprintCache = new WeakMap<PlanObject, FlatRegion[]>();

/** Gefüllte Grundfläche(n) eines Objekts in Metern. Linienobjekte (Maß, Text) liefern []. */
export function footprint(o: PlanObject): FlatRegion[] {
  const hit = footprintCache.get(o);
  if (hit) return hit;
  let r: FlatRegion[];
  switch (o.type) {
    case 'area':
    case 'planting':
      r = [flattenRegion(o.region)];
      break;
    case 'path':
      r = offsetPolyline(flattenPath(o.centerline), o.width, o.join);
      break;
    case 'hedge':
      r = offsetPolyline(flattenPath(o.centerline), hedgeWidth(o), 'round');
      break;
    case 'plant':
      r = [{ outer: circlePolygon(o.position, plantDiameter(o) / 2), holes: [] }];
      break;
    case 'item': {
      const s = itemSize(o);
      r = [{ outer: rotatedRect(o.position, s.width, s.depth, o.rotationDeg), holes: [] }];
      break;
    }
    case 'lamp':
      r = o.path
        ? [...offsetPolyline(flattenPath(o.path), 0.2, 'round'), { outer: circlePolygon(o.position, 0.15, 16), holes: [] }]
        : [{ outer: circlePolygon(o.position, 0.15, 16), holes: [] }];
      break;
    case 'sprinkler':
      r = [{ outer: circlePolygon(o.position, 0.18, 16), holes: [] }];
      break;
    case 'fixture':
      r = [{ outer: rotatedRect(o.position, o.kind === 'manifold' ? 1.2 : 0.6, 0.8, 0), holes: [] }];
      break;
    case 'drip':
    case 'pipe':
      r = offsetPolyline(flattenPath(o.path), o.type === 'pipe' ? 0.12 : 0.1, 'round');
      break;
    case 'dimension':
    case 'text':
      r = [];
  }
  footprintCache.set(o, r);
  return r;
}

/** Bindungspunkt einer Bemaßung auflösen */
export function resolveAnchor(a: DimensionAnchor, objects: Record<string, PlanObject>): Vec2 | null {
  if (a.kind === 'free') return a.p;
  const o = objects[a.objectId];
  if (!o) return null;
  const nodes = editableNodes(o);
  return nodes[a.nodeIndex] ?? null;
}

/** Knoten, die das Auswahlwerkzeug als Griffe zeigt (Reihenfolge = nodeIndex) */
export function editableNodes(o: PlanObject): Vec2[] {
  switch (o.type) {
    case 'area':
    case 'planting':
      return toPath(o.region.outer).nodes.map((n) => n.p);
    case 'path':
    case 'hedge':
      return o.centerline.nodes.map((n) => n.p);
    case 'plant':
    case 'text':
    case 'sprinkler':
    case 'fixture':
      return [o.position];
    case 'lamp':
      return o.path ? o.path.nodes.map((n) => n.p) : [o.position];
    case 'drip':
    case 'pipe':
      return o.path.nodes.map((n) => n.p);
    case 'item': {
      const s = itemSize(o);
      return rotatedRect(o.position, s.width, s.depth, o.rotationDeg);
    }
    case 'dimension':
      return [o.a, o.b].flatMap((a) => (a.kind === 'free' ? [a.p] : []));
  }
}

/** Grobe Text-Box: Breite ≈ 0,55 × Schriftgröße je Zeichen */
function textBox(o: Extract<PlanObject, { type: 'text' }>): BBox {
  const w = o.text.length * o.sizeM * 0.55;
  return { minX: o.position.x - w / 2, maxX: o.position.x + w / 2, minY: o.position.y - o.sizeM, maxY: o.position.y + o.sizeM * 0.3 };
}

export function objectBBox(o: PlanObject, objects: Record<string, PlanObject> = {}): BBox {
  if (o.type === 'text') return textBox(o);
  if (o.type === 'dimension') {
    const pts = [resolveAnchor(o.a, objects), resolveAnchor(o.b, objects)].filter((p): p is Vec2 => !!p);
    if (!pts.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    const b = bbox(pts);
    const m = Math.abs(o.offset) + 0.5;
    return { minX: b.minX - m, minY: b.minY - m, maxX: b.maxX + m, maxY: b.maxY + m };
  }
  const fp = footprint(o);
  const pts = fp.flatMap((r) => r.outer);
  if (o.type === 'sprinkler') {
    const r = o.radius;
    return { minX: o.position.x - r, minY: o.position.y - r, maxX: o.position.x + r, maxY: o.position.y + r };
  }
  if (o.type === 'lamp') {
    // Lichtkegel reicht weit über die Leuchte hinaus
    const r = 25;
    const b = bbox(pts);
    return { minX: b.minX - r, minY: b.minY - r, maxX: b.maxX + r, maxY: b.maxY + r };
  }
  if (o.type === 'plant') {
    // Krone kann im Wachstumsmodus größer werden – Endgröße einrechnen, damit Culling nicht abschneidet
    const r = Math.max(plantDiameter(o), getSpecies(o.speciesId).diameterMature) / 2;
    return { minX: o.position.x - r, minY: o.position.y - r, maxX: o.position.x + r, maxY: o.position.y + r };
  }
  return pts.length ? bbox(pts) : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}

/** Fangkandidaten eines Objekts: Knoten und Kanten der Grundfläche */
export function snapGeometry(o: PlanObject): { vertices: Vec2[]; segments: [Vec2, Vec2][] } {
  const vertices = editableNodes(o);
  const segments: [Vec2, Vec2][] = [];
  if (o.type === 'area' || o.type === 'planting' || o.type === 'item') {
    const ring = o.type === 'item' ? vertices : flattenRegion(o.region).outer;
    // Bei Kurven nur jeden Teilpunkt der flachgelegten Kontur – reicht für Kantenfang
    for (let i = 0; i < ring.length; i++) segments.push([ring[i], ring[(i + 1) % ring.length]]);
  } else if (o.type === 'path' || o.type === 'hedge') {
    for (const r of footprint(o)) for (let i = 0; i < r.outer.length; i++) segments.push([r.outer[i], r.outer[(i + 1) % r.outer.length]]);
  }
  return { vertices, segments };
}

/** Regnersektor als Polygon (Bildschirmwinkel, im Uhrzeigersinn von arcStart nach arcEnd) */
export function sprinklerSector(o: Extract<PlanObject, { type: 'sprinkler' }>, segments = 48): Polygon {
  let a0 = o.arcStartDeg;
  let a1 = o.arcEndDeg;
  while (a1 <= a0) a1 += 360;
  const full = a1 - a0 >= 359.9;
  const pts: Polygon = full ? [] : [o.position];
  const n = Math.max(6, Math.ceil(((a1 - a0) / 360) * segments));
  for (let i = 0; i <= n; i++) {
    if (full && i === n) break;
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    pts.push({ x: o.position.x + Math.cos(a) * o.radius, y: o.position.y + Math.sin(a) * o.radius });
  }
  return pts;
}
