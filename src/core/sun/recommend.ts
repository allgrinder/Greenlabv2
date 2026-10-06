/**
 * Pflanzempfehlungen aus den Sonnenstunden (Screen 06, „Empfehlungen“).
 */
import { getItem } from '../catalog/items';
import { getSpecies } from '../catalog/plants';
import { diameterToday } from '../growth';
import { circlePolygon, footprint } from '../geometry/objects';
import type { Polygon } from '../geometry/polygon';
import type { Project } from '../model/types';
import { heatColor, meanHoursIn, type SunGrid } from './shadows';

export interface SunSpot {
  name: string;
  polys: Polygon[];
}

/** Bereiche, für die eine Empfehlung sinnvoll ist */
export function sunSpots(doc: Project): SunSpot[] {
  const spots: SunSpot[] = [];
  const beds: Polygon[] = [];
  for (const o of Object.values(doc.objects)) {
    if (o.hidden) continue;
    if (o.type === 'planting') spots.push({ name: o.name ?? 'Pflanzung', polys: footprint(o).map((r) => r.outer) });
    else if (o.type === 'area' && (o.materialId === 'soil' || o.materialId === 'lawn')) spots.push({ name: o.name ?? (o.materialId === 'soil' ? 'Beet' : 'Rasen'), polys: footprint(o).map((r) => r.outer) });
    else if (o.type === 'item' && getItem(o.catalogId).category === 'raisedBed') beds.push(...footprint(o).map((r) => r.outer));
    else if (o.type === 'plant') {
      const sp = getSpecies(o.speciesId);
      const d = diameterToday(o);
      if (sp.kind === 'tree' && d >= 6) spots.push({ name: `Unter der ${o.name ?? sp.name}`, polys: [circlePolygon(o.position, d * 0.4, 32)] });
    }
  }
  if (beds.length) spots.unshift({ name: 'Hochbeete', polys: beds });
  return spots;
}

export function recommendation(hours: number): string {
  if (hours >= 10) return 'Ideal für Tomaten, Paprika, Basilikum';
  if (hours >= 7) return 'Präriestauden, Salbei, Lavendel, Gräser';
  if (hours >= 4) return 'Halbschatten: Hortensie, Storchschnabel, Salat';
  return 'Schatten: Farne, Funkien, Elfenblume';
}

export interface SpotResult {
  name: string;
  hours: number;
  color: string;
  text: string;
}

export function rankSpots(doc: Project, grid: SunGrid, max = 4): SpotResult[] {
  const res = sunSpots(doc).map((s) => {
    const vals = s.polys.map((p) => meanHoursIn(grid, p)).filter((v) => v > 0 || s.polys.length === 1);
    const hours = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    const [r, g, b] = heatColor(hours);
    return { name: s.name, hours, color: `rgb(${r},${g},${b})`, text: recommendation(hours) };
  });
  // Unterschiedliche Bedingungen zeigen: sonnigster, schattigster und Beete
  res.sort((a, b) => b.hours - a.hours);
  const pick = new Map<string, SpotResult>();
  for (const r of [res[0], ...res.filter((x) => x.name === 'Hochbeete' || /beet/i.test(x.name)), res[res.length - 1], ...res]) {
    if (r && !pick.has(r.name)) pick.set(r.name, r);
    if (pick.size >= max) break;
  }
  return [...pick.values()].sort((a, b) => b.hours - a.hours);
}
