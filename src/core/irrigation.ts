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
import { areaWithHoles, bbox, closestPointOn, pointInPolygon } from './geometry/polygon';
import { type FlatRegion, flattenPath, pathLength } from './geometry/shape';
import type { DripObject, PlanObject, Project, SprinklerObject, Vec2 } from './model/types';

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

/**
 * Regner automatisch verteilen (Kopf an Kopf, Abstand ≈ Wurfradius):
 * 1. Randregner an jeder ausgeprägten Ecke und dazwischen im Abstand s entlang des Außenrands,
 * 2. Innenraster mit Abstand s, mindestens s/2 vom Rand und von anderen Köpfen entfernt.
 */
export function autoSprinklerPositions(region: FlatRegion, radius: number): Vec2[] {
  const s = radius * 0.95;
  const ring = region.outer;
  const n = ring.length;
  const out: Vec2[] = [];
  const far = (p: Vec2, d: number) => out.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= d);
  // Ecken: Richtungsänderung > 30°
  const corner = ring.map((p, i) => {
    const a = ring[(i + n - 1) % n];
    const b = ring[(i + 1) % n];
    const t1 = Math.atan2(p.y - a.y, p.x - a.x);
    const t2 = Math.atan2(b.y - p.y, b.x - p.x);
    let d = Math.abs(t2 - t1);
    if (d > Math.PI) d = 2 * Math.PI - d;
    return d > Math.PI / 6;
  });
  ring.forEach((p, i) => corner[i] && far(p, s * 0.45) && out.push(p));
  // Rand zwischen den Ecken gleichmäßig teilen
  let start = corner.indexOf(true);
  if (start < 0) start = 0;
  let run: Vec2[] = [ring[start]];
  const flush = () => {
    let L = 0;
    for (let k = 1; k < run.length; k++) L += Math.hypot(run[k].x - run[k - 1].x, run[k].y - run[k - 1].y);
    const parts = Math.max(1, Math.ceil(L / s));
    const step = L / parts;
    let acc = 0;
    let next = step;
    for (let k = 1; k < run.length; k++) {
      const a = run[k - 1];
      const b = run[k];
      const l = Math.hypot(b.x - a.x, b.y - a.y);
      while (next < acc + l - 1e-6 && next < L - step * 0.3) {
        const t = (next - acc) / l;
        const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        if (far(q, s * 0.45)) out.push(q);
        next += step;
      }
      acc += l;
    }
  };
  for (let k = 1; k <= n; k++) {
    const i = (start + k) % n;
    run.push(ring[i]);
    if (corner[i] || k === n) {
      flush();
      run = [ring[i]];
    }
  }
  // Innenraster
  const b = bbox(ring);
  const nx = Math.max(1, Math.round((b.maxX - b.minX) / s));
  const ny = Math.max(1, Math.round((b.maxY - b.minY) / s));
  const sx = (b.maxX - b.minX) / nx;
  const sy = (b.maxY - b.minY) / ny;
  for (let j = 1; j < ny; j++)
    for (let i = 1; i < nx; i++) {
      const p = { x: b.minX + i * sx, y: b.minY + j * sy };
      if (!pointInPolygon(p, ring)) continue;
      const q = closestPointOn(p, ring);
      if (Math.hypot(q.x - p.x, q.y - p.y) < s * 0.5) continue;
      if (far(p, s * 0.6)) out.push(p);
    }
  return out;
}

/**
 * Tropfschlauch automatisch verlegen: Mäander mit Strangabstand = benetzte Breite,
 * pro Zeile die Schnittstrecke mit der Fläche (längste Strecke).
 */
export function autoDripPath(region: FlatRegion, spacing: number): Vec2[] {
  const b = bbox(region.outer);
  const pts: Vec2[] = [];
  let flip = false;
  const rings = [region.outer, ...region.holes];
  for (let y = b.minY + spacing / 2; y < b.maxY; y += spacing) {
    const xs: number[] = [];
    for (const ring of rings)
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i];
        const c = ring[j];
        if (a.y > y !== c.y > y) xs.push(a.x + ((y - a.y) / (c.y - a.y)) * (c.x - a.x));
      }
    xs.sort((p, q) => p - q);
    let best: [number, number] | null = null;
    for (let k = 0; k + 1 < xs.length; k += 2) if (!best || xs[k + 1] - xs[k] > best[1] - best[0]) best = [xs[k], xs[k + 1]];
    if (!best || best[1] - best[0] < spacing) continue;
    const inset = Math.min(spacing / 2, (best[1] - best[0]) / 4);
    const seg = [{ x: best[0] + inset, y }, { x: best[1] - inset, y }];
    pts.push(...(flip ? seg.reverse() : seg));
    flip = !flip;
  }
  return pts;
}

/**
 * Wurfsektor für einen Regner am Rand: größter zusammenhängender Winkelbereich,
 * in dem die Fläche bei 35 % und 70 % des Radius liegt. Innen → Vollkreis.
 * Nur der Außenrand begrenzt: Wege und Teiche in der Rasenfläche werden überregnet.
 */
export function inwardArc(p: Vec2, region: FlatRegion, radius: number): [number, number] {
  const n = 72;
  const inside = (a: number) =>
    [0.35, 0.7].every((k) => pointInPolygon({ x: p.x + Math.cos(a) * radius * k, y: p.y + Math.sin(a) * radius * k }, region.outer));
  const ok = Array.from({ length: n }, (_, i) => inside((i / n) * Math.PI * 2));
  if (ok.every(Boolean)) return [0, 360];
  if (!ok.some(Boolean)) return [0, 90];
  // längster Lauf, zyklisch
  let best = { start: 0, len: 0 };
  for (let s = 0; s < n; s++) {
    if (!ok[s] || ok[(s + n - 1) % n]) continue;
    let len = 0;
    while (len < n && ok[(s + len) % n]) len++;
    if (len > best.len) best = { start: s, len };
  }
  const step = 360 / n;
  // Rasterauflösung ausgleichen und auf 15° runden (übliche Düsen)
  const a0 = Math.round(((best.start - 0.5) * step) / 15) * 15;
  const a1 = Math.round(((best.start + best.len - 0.5) * step) / 15) * 15;
  return [((a0 % 360) + 360) % 360, ((a1 % 360) + 360) % 360 === ((a0 % 360) + 360) % 360 ? a0 + 360 : ((a1 % 360) + 360) % 360];
}
