import { describe, expect, it } from 'vitest';
import { kelvinRgb, lampRange } from './catalog/lamps';
import { diameterAt, diameterToday, hedgeWidthAt, isBare } from './growth';
import { getSpecies } from './catalog/plants';
import { coverage, zoneSummaries, dailyDemandLiters, inwardArc, precipitationMmH } from './irrigation';
import { objectBase } from './model/defaults';
import { newSprinkler } from './model/factory';
import type { AreaObject, PlantObject, Project } from './model/types';
import { costCsv, costReport, groupOf } from './quantities/costReport';
import { createLindenweg12 } from './sample/lindenweg12';
import { collectCasters, rasterize, shadowPolygons, sunHours } from './sun/shadows';
import { dayInfo, planDirection, shadowVector, sunAt, zonedDate } from './sun/sun';
import { migrate } from '../persistence/migrations';

const FRANKFURT = { lat: 50.11, lon: 8.68, label: 'Frankfurt', timeZone: 'Europe/Berlin' };

describe('Sonnenstand', () => {
  it('Ortszeit mit Sommerzeit: 21. Juni 12:00 in Berlin = 10:00 UTC', () => {
    expect(zonedDate(2026, 172, 12, 'Europe/Berlin').toISOString()).toBe('2026-06-21T10:00:00.000Z');
    expect(zonedDate(2026, 355, 12, 'Europe/Berlin').toISOString()).toBe('2026-12-21T11:00:00.000Z');
  });

  it('Frankfurt, Sommersonnenwende: Mittagshöhe ≈ 63°, Sonne mittags im Süden', () => {
    const info = dayInfo(FRANKFURT, 2026, 172);
    expect(info.maxAltitudeDeg).toBeGreaterThan(62);
    expect(info.maxAltitudeDeg).toBeLessThan(64);
    // Aufgang ~5:15, Untergang ~21:38 (MESZ)
    expect(info.sunrise!).toBeGreaterThan(5);
    expect(info.sunrise!).toBeLessThan(5.5);
    expect(info.sunset!).toBeGreaterThan(21.4);
    expect(info.sunset!).toBeLessThan(21.8);
    const noon = sunAt(FRANKFURT, 2026, 172, 13.5);
    expect(noon.azimuthDeg).toBeGreaterThan(170);
    expect(noon.azimuthDeg).toBeLessThan(200);
  });

  it('Wintersonnenwende: Mittagshöhe ≈ 16,5°', () => {
    expect(dayInfo(FRANKFURT, 2026, 355).maxAltitudeDeg).toBeCloseTo(16.4, 0);
  });

  it('Schatten zeigt von der Sonne weg und berücksichtigt die Nordrichtung', () => {
    // Sonne im Süden, 45° hoch → Schatten 1 m pro Meter nach Norden (= Plan oben bei northDeg 0)
    const sv = shadowVector({ azimuthDeg: 180, altitudeDeg: 45 }, 0)!;
    expect(sv.x).toBeCloseTo(0, 9);
    expect(sv.y).toBeCloseTo(-1, 9);
    // Plan um −12° gedreht: Norden zeigt leicht nach links oben
    const n = planDirection(0, -12);
    expect(n.x).toBeLessThan(0);
    expect(n.y).toBeLessThan(0);
    expect(shadowVector({ azimuthDeg: 180, altitudeDeg: -2 }, 0)).toBeNull();
  });
});

describe('Schatten und Heatmap', () => {
  it('Scanline-Raster füllt ein Quadrat exakt', () => {
    let n = 0;
    rasterize([{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 3 }, { x: 1, y: 3 }], 10, 10, { x: 0, y: 0 }, 0.5, () => n++);
    expect(n).toBe(16); // 2 × 2 m bei 0,5-m-Zellen
  });

  it('Prismenschatten deckt Grundriss und versetzte Oberseite ab', () => {
    const polys = shadowPolygons({ kind: 'prism', outlines: [[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]], h: 2, density: 1 }, { x: 0, y: -1 });
    expect(polys).toHaveLength(2 + 4);
    expect(polys[1][0]).toEqual({ x: 0, y: -2 });
  });

  it('Beispielgarten: unter der Linde deutlich weniger Sonne als auf dem offenen Rasen', () => {
    const doc = createLindenweg12();
    const g = sunHours(doc, FRANKFURT, 2026, 172, { cell: 1, stepMin: 30 });
    const at = (x: number, y: number) => g.hours[Math.floor((y - g.origin.y) / g.cell) * g.cols + Math.floor((x - g.origin.x) / g.cell)];
    expect(g.dayLength).toBeGreaterThan(16);
    expect(at(44, 22)).toBeGreaterThan(12); // offene Kiesfläche bei den Hochbeeten
    expect(at(25.5, 1.5)).toBeLessThan(at(44, 22) - 4); // nördlich der Linde, im Kronenschatten
  });

  it('Winter: kahle Laubbäume werfen nur noch schwachen Schatten', () => {
    const doc = createLindenweg12();
    const linde = collectCasters(doc, 0, 'winter').find((c) => c.kind === 'disc' && c.r > 4)!;
    expect(linde.density).toBeCloseTo(0.3);
    expect(isBare(getSpecies('tilia-cordata'), 'winter')).toBe(true);
    expect(isBare(getSpecies('buxus'), 'winter')).toBe(false);
  });
});

describe('Wachstum', () => {
  const base = objectBase('l');
  const apfel: PlantObject = { ...base, type: 'plant', speciesId: 'malus-topaz', position: { x: 0, y: 0 }, plantedYear: 2026, plantedDiameter: 3 };

  it('wächst monoton und erreicht die Endgröße asymptotisch', () => {
    const d = [0, 5, 10, 20, 80].map((y) => diameterAt(apfel, y, 2026));
    expect(d[0]).toBe(3);
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeGreaterThan(d[i - 1]);
    expect(d[4]).toBeLessThanOrEqual(7);
    expect(d[4]).toBeGreaterThan(6.9);
  });

  it('ohne Bestandsangabe wird ab dem Pflanzjahr hochgerechnet', () => {
    const jung = { ...apfel, plantedDiameter: null, plantedYear: 2020 };
    expect(diameterToday(jung, 2026)).toBeGreaterThan(getSpecies('malus-topaz').diameterPlanted);
  });

  it('Hecke wird breiter, aber nicht über die Endbreite', () => {
    const h = { ...base, type: 'hedge' as const, centerline: { kind: 'path' as const, nodes: [], closed: false, source: 'polygon' as const }, speciesId: 'carpinus-hedge', plantedYear: 2026, height: 1.8, plantsPerMeter: 3 };
    expect(hedgeWidthAt(h, 20, 2026)).toBeGreaterThan(hedgeWidthAt(h, 0, 2026));
    expect(hedgeWidthAt(h, 100, 2026)).toBeLessThanOrEqual(1.5);
  });
});

describe('Bewässerung', () => {
  const lawn = (doc: Project): AreaObject => ({
    ...objectBase(doc.layerOrder[1]),
    type: 'area',
    materialId: 'lawn',
    edging: null,
    region: { outer: { kind: 'rect', center: { x: 5, y: 5 }, width: 10, depth: 10, rotationDeg: 0, cornerRadius: 0 }, holes: [] },
  });

  function bare(): Project {
    const p = createLindenweg12();
    p.objects = {};
    for (const l of Object.values(p.layers)) l.objectOrder = [];
    return p;
  }

  it('ohne Regner ist die ganze Rasenfläche eine Lücke', () => {
    const p = bare();
    const l = lawn(p);
    p.objects[l.id] = l;
    const c = coverage(p);
    expect(c.targetArea).toBeCloseTo(100, 6);
    expect(c.gapArea).toBeCloseTo(100, 6);
    expect(c.ratio).toBeCloseTo(0, 6);
  });

  it('Vollkreisregner in der Mitte lässt nur die Ecken trocken', () => {
    const p = bare();
    const l = lawn(p);
    const s = newSprinkler(p, { x: 5, y: 5 }, 1, 5);
    p.objects[l.id] = l;
    p.objects[s.id] = s;
    const c = coverage(p);
    // 100 − π·25 ≈ 21,46 m² in vier Ecken
    expect(c.gapArea).toBeCloseTo(100 - Math.PI * 25, 0);
    expect(c.gaps).toHaveLength(4);
  });

  it('Beispielgarten: automatisch verteilte Regner und Tropfschläuche bewässern fast alles', () => {
    const c = coverage(createLindenweg12());
    expect(c.ratio).toBeGreaterThan(0.97);
  });

  it('Zonen: Durchfluss und Liter pro Lauf', () => {
    const p = createLindenweg12();
    const z = zoneSummaries(p);
    expect(z).toHaveLength(4);
    expect(z[0].sprinklers).toBeGreaterThan(3);
    expect(z[0].liters).toBeGreaterThan(0);
    expect(z[0].flowLpm).toBeLessThan(30);
    expect(z[2].dripMeters).toBeGreaterThan(30);
    expect(dailyDemandLiters(p)).toBeGreaterThan(0);
  });

  it('Randregner bekommen einen nach innen gerichteten Sektor', () => {
    const sq = { outer: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }], holes: [] };
    expect(inwardArc({ x: 10, y: 10 }, sq, 5)).toEqual([0, 360]);
    // Ecke oben links: Fläche liegt zwischen Osten (0°) und Süden (90°)
    expect(inwardArc({ x: 0, y: 0 }, sq, 5)).toEqual([0, 90]);
    // Mitte der Oberkante: Halbkreis nach Süden
    expect(inwardArc({ x: 10, y: 0 }, sq, 5)).toEqual([0, 180]);
  });

  it('Niederschlag eines Viertelkreisregners', () => {
    const p = bare();
    const s = newSprinkler(p, { x: 0, y: 0 }, 1, 7, [0, 90]);
    expect(precipitationMmH(s)).toBeCloseTo((6 * 60) / ((Math.PI * 49) / 4), 6);
  });
});

describe('Licht', () => {
  it('Farbtemperatur 2200 K ist wärmer (weniger Blau) als 4000 K', () => {
    expect(kelvinRgb(2200)[2]).toBeLessThan(kelvinRgb(4000)[2]);
    expect(kelvinRgb(3000)).toEqual([255, 208, 156]);
  });

  it('gebündeltes Licht reicht weiter als Rundumlicht gleicher Lichtmenge', () => {
    expect(lampRange(480, 36)).toBeGreaterThan(lampRange(480, 360));
  });
});

describe('Kostenübersicht', () => {
  it('Gruppenzuordnung', () => {
    expect(groupOf('mat:lawn')).toBe('areas');
    expect(groupOf('mat:water')).toBe('build');
    expect(groupOf('item:edge.kantenstein-8x20')).toBe('areas');
    expect(groupOf('item:shed-4x4')).toBe('build');
    expect(groupOf('plant:salvia')).toBe('plants');
    expect(groupOf('lamp:bollard')).toBe('tech');
    expect(groupOf('irr:drip')).toBe('tech');
  });

  it('Summe der Gruppen = netto, brutto mit 19 %', () => {
    const r = costReport(createLindenweg12());
    expect(r.groups.map((g) => g.key)).toEqual(['areas', 'plants', 'build', 'tech']);
    expect(r.groups.reduce((s, g) => s + g.total, 0)).toBeCloseTo(r.net, 6);
    expect(r.gross).toBeCloseTo(r.net * 1.19, 6);
  });

  it('CSV: BOM, Semikolon, Dezimalkomma, Anführungszeichen bei Sonderzeichen', () => {
    const p = createLindenweg12();
    p.priceOverrides['mat:lawn'] = 8.5;
    const csv = costCsv(p);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe('Bereich;Position;Menge;Einheit;Einzelpreis netto (EUR);Summe netto (EUR)');
    const lawn = lines.find((l) => l.includes('Rollrasen'))!;
    expect(lawn).toMatch(/;8,50;/);
    expect(lines.some((l) => l.startsWith('Flächen & Wege;Kies 8/16, Jurakalk;'))).toBe(true);
    expect(lines.at(-2)).toMatch(/^;Summe brutto;;;;\d+,\d\d$/);
  });
});

describe('Migration', () => {
  it('Schema 1 → 3 ergänzt Bewässerungszonen und Blickpunkte', () => {
    const v1 = { ...createLindenweg12(), schemaVersion: 1 } as Record<string, unknown>;
    delete v1.zones;
    delete v1.observers;
    const p = migrate(v1);
    expect(p.schemaVersion).toBe(3);
    expect(p.zones).toHaveLength(4);
    expect(p.observers).toEqual([]);
  });
});
