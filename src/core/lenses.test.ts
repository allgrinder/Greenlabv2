import { describe, expect, it } from 'vitest';
import { bestScale, fits, legendEntries, plantList, scaleBarMeters, sheetLayout } from './export/sheet';
import { expandBBox, bbox } from './geometry/polygon';
import { conflictText, growthConflicts, growthRows, seasonNote } from './growthReport';
import { coverage } from './irrigation';
import { planIrrigation } from './irrigationLayout';
import { lensShowsLayer } from './lens';
import { nightStats } from './lighting';
import { newLamp } from './model/factory';
import type { LampObject } from './model/types';
import { createLindenweg12 } from './sample/lindenweg12';
import { sunHours } from './sun/shadows';
import { rankSpots } from './sun/recommend';

const FRANKFURT = { lat: 50.11, lon: 8.68, label: 'Frankfurt', timeZone: 'Europe/Berlin' };

describe('Sonnen-Empfehlungen', () => {
  it('Hochbeete liegen selbst in der Sonne, unter der Linde ist es schattiger', () => {
    const doc = createLindenweg12();
    const grid = sunHours(doc, FRANKFURT, 2026, 172, { cell: 1, stepMin: 30 });
    const spots = rankSpots(doc, grid, 10);
    const beds = spots.find((s) => s.name === 'Hochbeete')!;
    const linde = spots.find((s) => s.name.startsWith('Unter der'))!;
    expect(beds.hours).toBeGreaterThan(9);
    expect(linde.hours).toBeLessThan(beds.hours - 2);
    expect(beds.text).toMatch(/Tomaten|Stauden/);
  });
});

describe('Wachstum', () => {
  it('Entwicklung wächst mit den Jahren und überschreitet die Endgröße nicht', () => {
    const doc = createLindenweg12();
    const now = growthRows(doc, 0);
    const later = growthRows(doc, 20);
    expect(now.length).toBeGreaterThan(2);
    now.forEach((r, i) => {
      expect(later[i].value).toBeGreaterThanOrEqual(r.value - 1e-9);
      expect(later[i].value).toBeLessThanOrEqual(r.max + 1e-9);
    });
  });

  it('meldet, wann eine Krone an den Weg heranwächst', () => {
    const doc = createLindenweg12();
    const c = growthConflicts(doc);
    expect(c.length).toBeGreaterThan(0);
    expect(c[0].years).toBeGreaterThan(0);
    expect(c[0].years).toBeLessThanOrEqual(20);
    expect(conflictText(c[0])).toMatch(/^Ab etwa \d+ Jahr/);
  });

  it('Jahreszeiten-Text nennt blühende und kahle Gehölze', () => {
    const doc = createLindenweg12();
    expect(seasonNote(doc, 'spring')).toMatch(/blüh/);
    expect(seasonNote(doc, 'winter')).toMatch(/kahl/);
  });
});

describe('Bewässerung automatisch planen', () => {
  it('ersetzt die Regner einer Rasenfläche vollständig, Überdeckung bleibt hoch', () => {
    const doc = createLindenweg12();
    const lawn = Object.values(doc.objects).filter((o) => o.type === 'area' && o.materialId === 'lawn');
    const before = Object.values(doc.objects).filter((o) => o.type === 'sprinkler').length;
    const plan = planIrrigation(doc, lawn.map((o) => o.id), 'sprinkler', 2);
    expect(plan.remove.length).toBe(before);
    expect(plan.add.every((o) => o.type === 'sprinkler' && o.zone === 2)).toBe(true);
    // anwenden und prüfen
    for (const id of plan.remove) delete doc.objects[id];
    for (const o of plan.add) doc.objects[o.id] = o;
    expect(coverage(doc).ratio).toBeGreaterThan(0.95);
  });

  it('verlegt Tropfschlauch in einer Pflanzung', () => {
    const doc = createLindenweg12();
    const beet = Object.values(doc.objects).find((o) => o.type === 'planting')!;
    const plan = planIrrigation(doc, [beet.id], 'drip', 4);
    expect(plan.add).toHaveLength(1);
    expect(plan.remove).toHaveLength(1);
  });
});

describe('Nacht', () => {
  it('Leistung und Kosten pro Abend folgen Szene und Zeitplan', () => {
    const doc = createLindenweg12();
    const lamps = Object.values(doc.objects).filter((o): o is LampObject => o.type === 'lamp');
    const all = nightStats(lamps, 'all', 22, 0, 21.6, 5.3);
    const late = nightStats(lamps, 'late', 22, 0, 21.6, 5.3);
    expect(all.wattsNow).toBeGreaterThan(late.wattsNow);
    expect(all.costEvening).toBeCloseTo(all.kwhEvening * 0.35, 6);
    // Zeitplan: tagsüber aus
    expect(nightStats(lamps, null, 14, 0, 21.6, 5.3).wattsNow).toBe(0);
  });

  it('ausgeschaltete Leuchte zählt nicht', () => {
    const doc = createLindenweg12();
    const l = { ...newLamp(doc, 'bollard', { x: 1, y: 1 }), on: false };
    expect(nightStats([l], 'all', 22, 0, 21.6, 5.3).wattsNow).toBe(0);
  });
});

describe('Linsen zeigen passende Ebenen', () => {
  it('Bewässerung nur in der Bewässerungs-Linse, Licht im Plan und bei Nacht', () => {
    expect(lensShowsLayer('water', 'plan', false)).toBe(false);
    expect(lensShowsLayer('water', 'irrigation', false)).toBe(true);
    expect(lensShowsLayer('light', 'sun', false)).toBe(false);
    expect(lensShowsLayer('light', 'sun', true)).toBe(true);
    expect(lensShowsLayer('areas', 'seasons', false)).toBe(true);
  });
});

describe('Architektenplan', () => {
  it('wählt den kleinsten passenden Normmaßstab', () => {
    const doc = createLindenweg12();
    const b = expandBBox(bbox(doc.site.boundary), 1);
    // 52 × 32 m: auf A3 (Planfeld ≈ 31 cm) passt 1:200, auf A1 1:100
    expect(bestScale(b, 'A3')).toBe(200);
    expect(bestScale(b, 'A1')).toBe(100);
    expect(fits(b, sheetLayout('A3').plan, 100)).toBe(false);
  });

  it('Maßstabsleiste mit runder Länge', () => {
    expect(scaleBarMeters(100, 300)).toBe(5);
    expect(scaleBarMeters(200, 300)).toBe(10);
  });

  it('Legende und Pflanzenliste aus dem Plan', () => {
    const doc = createLindenweg12();
    const legend = legendEntries(doc, false).map((e) => e.label);
    expect(legend).toContain('Rollrasen');
    expect(legend[legend.length - 1]).toBe('Grundstücksgrenze');
    expect(legend).not.toContain('Leuchte');
    expect(legendEntries(doc, true).map((e) => e.label)).toContain('Leuchte');
    const plants = plantList(doc);
    expect(plants.find((p) => p.name === 'Winterlinde')?.count).toBe(1);
    expect(plants.every((p) => p.count > 0 && p.latin)).toBe(true);
  });
});
