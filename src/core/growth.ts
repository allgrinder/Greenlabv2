/**
 * Wachstum und Jahreszeiten: Größe und Farbe von Pflanzen für die Linsen
 * „Wachstum“, „Jahreszeiten“ und für den Schattenwurf.
 */
import { diameterAfter, getSpecies } from './catalog/plants';
import type { PlanObject, PlantSpecies } from './model/types';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export const SEASONS: { k: Season; name: string; month: string; doy: number }[] = [
  { k: 'spring', name: 'Frühling', month: 'April', doy: 105 },
  { k: 'summer', name: 'Sommer', month: 'Juli', doy: 196 },
  { k: 'autumn', name: 'Herbst', month: 'Oktober', doy: 288 },
  { k: 'winter', name: 'Winter', month: 'Januar', doy: 15 },
];

export interface ViewParams {
  /** Jahre ab heute (Wachstums-Zeitreise) */
  years: number;
  season: Season;
}

export const DEFAULT_VIEW: ViewParams = { years: 0, season: 'summer' };

/** Kronen-Ø heute: Bestandsgröße oder aus dem Pflanzjahr hochgerechnet */
export function diameterToday(o: Extract<PlanObject, { type: 'plant' }>, nowYear = new Date().getFullYear()): number {
  const sp = getSpecies(o.speciesId);
  if (o.plantedDiameter !== null) return o.plantedDiameter;
  return diameterAfter(Math.max(0, nowYear - o.plantedYear), sp.diameterPlanted, sp.diameterMature, sp.growthPerYear);
}

/** Kronen-Ø in `years` Jahren */
export function diameterAt(o: Extract<PlanObject, { type: 'plant' }>, years: number, nowYear?: number): number {
  const sp = getSpecies(o.speciesId);
  const d0 = diameterToday(o, nowYear);
  return diameterAfter(years, d0, Math.max(d0, sp.diameterMature), sp.growthPerYear);
}

/** Höhe einer Pflanze proportional zum Wachstumsfortschritt */
export function heightAt(o: Extract<PlanObject, { type: 'plant' }>, years: number): number {
  const sp = getSpecies(o.speciesId);
  const d = diameterAt(o, years);
  const f = Math.min(1, d / sp.diameterMature);
  const h = sp.kind === 'tree' ? sp.heightMature * (0.35 + 0.65 * f) : sp.heightMature * (0.5 + 0.5 * f);
  return Math.max(0.2, h);
}

/** Heckenbreite wächst von der Pflanzbreite auf die Schnittbreite */
export function hedgeWidthAt(o: Extract<PlanObject, { type: 'hedge' }>, years: number, nowYear = new Date().getFullYear()): number {
  const sp = getSpecies(o.speciesId);
  return diameterAfter(Math.max(0, nowYear - o.plantedYear) + years, sp.diameterPlanted, sp.diameterMature, sp.growthPerYear * 0.6);
}

export function seasonColor(sp: PlantSpecies, season: Season): string {
  return sp.colors[season] ?? sp.colors.summer;
}

/** Laubabwerfende Gehölze im Winter: kahl (Hainbuche hält trockenes Laub, hat aber eine Winterfarbe) */
export const isBare = (sp: PlantSpecies, season: Season) => season === 'winter' && sp.deciduous && sp.kind !== 'hedge' && sp.kind !== 'perennial' && sp.kind !== 'grass';

/** Blüte sichtbar? Aus dem Jahreslauf (Monat der Jahreszeit) */
export function inBloom(sp: PlantSpecies, season: Season): boolean {
  const m = { spring: 3, summer: 6, autumn: 9, winter: 0 }[season];
  return sp.phenology[m] === 'bloom';
}

/** Rasenfarbe je Jahreszeit (aus GardenPlan.dc.html) */
export const LAWN_COLOR: Record<Season, string> = { spring: '#A7BB7B', summer: '#9BAE74', autumn: '#A3A672', winter: '#B6B8A8' };

/** Wie stark ein Gehölz Schatten wirft (Winter: kahle Krone lässt Licht durch) */
export const shadeDensity = (sp: PlantSpecies, season: Season) => (isBare(sp, season) ? 0.3 : 1);
