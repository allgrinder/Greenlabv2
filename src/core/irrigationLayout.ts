/**
 * Automatische Bewässerungsplanung für ausgewählte Flächen (Bewässerungs-Linse, Aktionen
 * „Regner verteilen“ und „Tropfschlauch verlegen“). Liefert neue Objekte und die Regner/Schläuche,
 * die in der Fläche ersetzt werden.
 */
import { footprint } from './geometry/objects';
import { distanceToPolyline, pointInPolygon } from './geometry/polygon';
import { flattenPath, type FlatRegion } from './geometry/shape';
import { autoDripPath, autoSprinklerPositions, inwardArc } from './irrigation';
import { newDrip, newSprinkler } from './model/factory';
import type { DripObject, Id, PlanObject, Project, SprinklerObject } from './model/types';

/** Durchfluss je Vollkreis-Regner, l/min (Sektoren anteilig → gleicher Niederschlag) */
export const FULL_CIRCLE_LPM = 1.5;

export function sprinklersFor(doc: Project, region: FlatRegion, zone: number, radius = 6): SprinklerObject[] {
  return autoSprinklerPositions(region, radius).map((q) => {
    const arc = inwardArc(q, region, radius);
    let sweep = arc[1] - arc[0];
    if (sweep <= 0) sweep += 360;
    return {
      ...newSprinkler(doc, q, zone, radius, arc),
      flowLpm: Math.round(FULL_CIRCLE_LPM * (Math.min(360, sweep) / 360) * 10) / 10 || 0.4,
    };
  });
}

export function dripFor(doc: Project, region: FlatRegion, zone: number, spacing = 0.55): DripObject | null {
  const pts = autoDripPath(region, spacing);
  if (pts.length < 2) return null;
  return {
    ...newDrip(
      doc,
      {
        kind: 'path',
        closed: false,
        source: 'polygon',
        nodes: pts.map((p) => ({ p })),
      },
      zone,
    ),
    wetWidth: Math.max(0.3, spacing * 1.1),
  };
}

/** Fläche, die ein Objekt für die Bewässerung darstellt (Rasen, Beet, Pflanzung, Hochbeet) */
export function irrigableRegions(o: PlanObject): FlatRegion[] {
  if (o.type === 'area' || o.type === 'planting' || o.type === 'item') return footprint(o);
  return [];
}

/** in der Fläche oder auf ihrem Rand (Randregner sitzen genau auf der Kante) */
const inside = (p: { x: number; y: number }, regions: FlatRegion[]) => regions.some((r) => pointInPolygon(p, r.outer) || distanceToPolyline(p, r.outer, true) < 0.3);

export interface IrrigationPlan {
  add: PlanObject[];
  remove: Id[];
}

/**
 * Regner bzw. Tropfschlauch für die gegebenen Flächen neu planen. Bestehende Regner (bzw. Schläuche,
 * deren Mittelpunkt in der Fläche liegt) werden ersetzt.
 */
export function planIrrigation(doc: Project, ids: Id[], what: 'sprinkler' | 'drip', zone: number): IrrigationPlan {
  const regions = ids.flatMap((id) => (doc.objects[id] ? irrigableRegions(doc.objects[id]) : []));
  const remove = Object.values(doc.objects)
    .filter((o) => {
      if (what === 'sprinkler' && o.type === 'sprinkler') return inside(o.position, regions);
      if (what === 'drip' && o.type === 'drip') {
        const pts = flattenPath(o.path);
        const c = pts[Math.floor(pts.length / 2)];
        return !!c && inside(c, regions);
      }
      return false;
    })
    .map((o) => o.id);
  const add: PlanObject[] = [];
  for (const r of regions) {
    if (what === 'sprinkler') add.push(...sprinklersFor(doc, r, zone));
    else {
      const d = dripFor(doc, r, zone);
      if (d) add.push(d);
    }
  }
  return { add, remove };
}
