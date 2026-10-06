/**
 * Bewässerung: Überdeckungsprüfung und Wasserbedarf.
 *
 * Zu bewässern sind Rasenflächen (Regner) sowie Pflanzungen und Hochbeete (Tropfschlauch).
 * Nicht erreichte Teilflächen = Zielflächen minus Vereinigung aus Regnersektoren
 * und Tropfschlauch-Streifen.
 */
import { getItem } from './catalog/items';
import { difference, offsetPolyline } from './geometry/clip';
import { footprint, sprinklerSector } from './geometry/objects';
import { areaWithHoles } from './geometry/polygon';
import { type FlatRegion, flattenPath, pathLength } from './geometry/shape';
import type { DripObject, PlanObject, Project, SprinklerObject } from './model/types';

const visible = (doc: Project, o: PlanObject) => !o.hidden && doc.layers[o.layerId]?.visible !== false;

/** Flächen, die Wasser brauchen */
export function irrigationTargets(doc: Project): { lawn: FlatRegion[]; beds: FlatRegion[] } {
  const lawn: FlatRegion[] = [];
  const beds: FlatRegion[] = [];
  for (const o of Object.values(doc.objects)) {
    if (!visible(doc, o)) continue;
    if (o.type === 'area' && o.materialId === 'lawn') lawn.push(...footprint(o));
    else if (o.type === 'area' && o.materialId === 'soil') beds.push(...footprint(o));
    else if (o.type === 'planting') beds.push(...footprint(o));
    else if (o.type === 'item' && getItem(o.catalogId).category === 'raisedBed') beds.push(...footprint(o));
  }
  return { lawn, beds };
}

export function wateredRegions(doc: Project): FlatRegion[] {
  const out: FlatRegion[] = [];
  for (const o of Object.values(doc.objects)) {
    if (!visible(doc, o)) continue;
    if (o.type === 'sprinkler') out.push({ outer: sprinklerSector(o), holes: [] });
    if (o.type === 'drip') out.push(...offsetPolyline(flattenPath(o.path), o.wetWidth, 'round'));
  }
  return out;
}

export interface Coverage {
  /** unbewässerte Teilflächen */
  gaps: FlatRegion[];
  gapArea: number;
  targetArea: number;
  /** Anteil bewässert 0–1 */
  ratio: number;
}

/** Teilflächen unter dieser Größe zählen nicht als Lücke (Rundungsränder) */
const MIN_GAP_M2 = 0.05;

export function coverage(doc: Project): Coverage {
  const t = irrigationTargets(doc);
  const targets = [...t.lawn, ...t.beds];
  const targetArea = targets.reduce((s, r) => s + areaWithHoles(r.outer, r.holes), 0);
  if (!targets.length) return { gaps: [], gapArea: 0, targetArea: 0, ratio: 1 };
  const watered = wateredRegions(doc);
  const gaps = (watered.length ? difference(targets, watered) : targets).filter((r) => areaWithHoles(r.outer, r.holes) >= MIN_GAP_M2);
  const gapArea = gaps.reduce((s, r) => s + areaWithHoles(r.outer, r.holes), 0);
  return { gaps, gapArea, targetArea, ratio: targetArea ? Math.max(0, 1 - gapArea / targetArea) : 1 };
}

export interface ZoneSummary {
  index: number;
  name: string;
  start: string;
  minutes: number;
  sprinklers: number;
  dripMeters: number;
  /** Liter pro Lauf */
  liters: number;
  /** Spitzendurchfluss in l/min (muss zum Anschluss passen) */
  flowLpm: number;
}

export function zoneSummaries(doc: Project): ZoneSummary[] {
  const objs = Object.values(doc.objects);
  return doc.zones.map((z, i) => {
    const n = i + 1;
    const sp = objs.filter((o): o is SprinklerObject => o.type === 'sprinkler' && o.zone === n);
    const dr = objs.filter((o): o is DripObject => o.type === 'drip' && o.zone === n);
    const dripMeters = dr.reduce((s, o) => s + pathLength(o.path), 0);
    const dripLph = dr.reduce((s, o) => s + pathLength(o.path) * o.lphPerMeter, 0);
    const flowLpm = sp.reduce((s, o) => s + o.flowLpm, 0) + dripLph / 60;
    return { index: n, name: z.name, start: z.start, minutes: z.minutes, sprinklers: sp.length, dripMeters, liters: flowLpm * z.minutes, flowLpm };
  });
}

export const dailyDemandLiters = (doc: Project) => zoneSummaries(doc).reduce((s, z) => s + z.liters, 0);

/** Fläche eines Regnersektors (für die Niederschlagsrate) */
export function sprinklerArea(o: SprinklerObject): number {
  let sweep = o.arcEndDeg - o.arcStartDeg;
  while (sweep <= 0) sweep += 360;
  return Math.PI * o.radius * o.radius * (Math.min(360, sweep) / 360);
}

/** Niederschlag in mm/h (l/m²/h) */
export const precipitationMmH = (o: SprinklerObject) => (o.flowLpm * 60) / Math.max(0.01, sprinklerArea(o));
