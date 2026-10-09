/**
 * Mittlere Sonnenstunden einer Fläche am Sommertag (21. Juni), mit Schatten von Gebäuden,
 * Bäumen und Hecken nach 5 Jahren Wachstum. Grundlage für die Mischungsempfehlung bei Rabatten.
 * Das Raster wird je Projektstand einmal berechnet.
 */
import type { Polygon } from './geometry/polygon';
import type { Project } from './model/types';
import { meanHoursIn, sunHours, type SunGrid } from './sun/shadows';
import { DEFAULT_LOCATION } from './sun/sun';

const cache = new WeakMap<Project['site'], { objects: Project['objects']; grid: SunGrid }>();

export function meanSunHours(doc: Project, poly: Polygon): number | null {
  if (poly.length < 3) return null;
  try {
    let hit = cache.get(doc.site);
    if (!hit || hit.objects !== doc.objects) {
      const grid = sunHours(doc, doc.site.location ?? DEFAULT_LOCATION, new Date().getFullYear(), 172, { cell: 1, stepMin: 30, years: 5, season: 'summer' });
      hit = { objects: doc.objects, grid };
      cache.set(doc.site, hit);
    }
    return meanHoursIn(hit.grid, poly);
  } catch {
    return null;
  }
}
