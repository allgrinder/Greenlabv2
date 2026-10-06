import { describe, expect, it } from 'vitest';
import { objectBase } from '../model/defaults';
import type { AreaObject, HedgeObject, PathObject, PlantingObject } from '../model/types';
import { createLindenweg12, KIESWEG_CENTERLINE } from '../sample/lindenweg12';
import { materialQuantity, objectQuantities, projectSummary } from './quantities';
import { pathLength } from '../geometry/shape';

const base = () => objectBase('layer');

const areaObj = (materialId: string, w: number, d: number, edging: AreaObject['edging'] = null): AreaObject => ({
  ...base(),
  type: 'area',
  region: { outer: { kind: 'rect', center: { x: 0, y: 0 }, width: w, depth: d, rotationDeg: 0, cornerRadius: 0 }, holes: [] },
  materialId,
  edging,
});

describe('Materialmengen', () => {
  it('Kies: m³ = Fläche × Schichtdicke (8 cm)', () => {
    expect(materialQuantity('gravel', 50).quantity).toBeCloseTo(4, 9);
  });

  it('Terrassenplatten 80 × 40: 70 m² → 219 Stück (aufgerundet)', () => {
    expect(materialQuantity('paving', 70)).toEqual({ quantity: 219, unit: 'pcs' });
    // exakt teilbar bleibt exakt
    expect(materialQuantity('paving', 0.32 * 100).quantity).toBe(100);
  });

  it('Rasen in m²', () => {
    expect(materialQuantity('lawn', 247)).toEqual({ quantity: 247, unit: 'm2' });
  });
});

describe('Objektmengen', () => {
  it('Fläche mit umlaufender Kante: Kantenlänge = Umfang', () => {
    const q = objectQuantities(areaObj('lawn', 10, 5, { catalogId: 'edge.kantenstein-8x20', sides: 'outline' }));
    expect(q.area).toBeCloseTo(50, 9);
    expect(q.perimeter).toBeCloseTo(30, 9);
    expect(q.edgingLength).toBeCloseTo(30, 9);
    expect(q.lines.map((l) => l.key)).toEqual(['mat:lawn', 'item:edge.kantenstein-8x20']);
    expect(q.total).toBeCloseTo(50 * 7.9 + 30 * 6.4, 6);
  });

  it('Projektpreis überschreibt Katalogpreis', () => {
    const q = objectQuantities(areaObj('lawn', 10, 5), { 'mat:lawn': 10 });
    expect(q.total).toBeCloseTo(500, 9);
  });

  it('Weg: Fläche ≈ Länge × Breite, Kantenstein beidseitig = 2 × Länge', () => {
    const path: PathObject = {
      ...base(),
      type: 'path',
      centerline: { kind: 'path', closed: false, source: 'polygon', nodes: [{ p: { x: 0, y: 0 } }, { p: { x: 20, y: 0 } }] },
      width: 1.2,
      join: 'round',
      materialId: 'gravel',
      edging: { catalogId: 'edge.kantenstein-8x20', sides: 'both' },
    };
    const q = objectQuantities(path);
    expect(q.length).toBeCloseTo(20, 9);
    expect(q.area).toBeCloseTo(24, 3);
    expect(q.edgingLength).toBeCloseTo(40, 9);
    expect(q.lines[0].quantity).toBeCloseTo(24 * 0.08, 3);
  });

  it('Hecke: Pflanzen = Länge × Stück/m, aufgerundet (146 m × 3 = 438)', () => {
    const h: HedgeObject = {
      ...base(),
      type: 'hedge',
      centerline: { kind: 'path', closed: false, source: 'polygon', nodes: [{ p: { x: 0, y: 0 } }, { p: { x: 146, y: 0 } }] },
      speciesId: 'carpinus-hedge',
      plantedYear: 2026,
      height: 1.8,
      plantsPerMeter: 3,
    };
    const q = objectQuantities(h);
    expect(q.lines[0].quantity).toBe(438);
    expect(q.total).toBeCloseTo(438 * 6.9, 6);
  });

  it('Staudenpflanzung: Stückzahl nach Dichte, Mix summiert sich exakt', () => {
    const pl: PlantingObject = {
      ...base(),
      type: 'planting',
      region: areaObj('mulch', 4, 3).region,
      mix: [
        { speciesId: 'salvia', share: 0.33 },
        { speciesId: 'geranium', share: 0.33 },
        { speciesId: 'stipa', share: 0.34 },
      ],
      perSquareMeter: 7,
      mulchMaterialId: 'mulch',
    };
    const q = objectQuantities(pl);
    const plants = q.lines.filter((l) => l.key.startsWith('plant:'));
    expect(plants.reduce((s, l) => s + l.quantity, 0)).toBe(84);
    expect(q.lines.find((l) => l.key === 'mat:mulch')!.quantity).toBeCloseTo(12 * 0.07, 9);
  });
});

describe('Beispielgarten Lindenweg 12 (Referenzwerte aus dem Design)', () => {
  const p = createLindenweg12();
  const find = (name: string) => Object.values(p.objects).find((o) => o.name === name)!;

  it('Kiesweg: Länge ≈ 35 m (Design-Annahme 34,60 m), Fläche = Länge × 1,20 m, Kantenstein = 2 × Länge', () => {
    // Die Design-Zahlen waren geschätzt; die echte Bogenlänge der Design-Kurve beträgt ≈ 36,6 m
    expect(pathLength(KIESWEG_CENTERLINE)).toBeGreaterThan(33);
    expect(pathLength(KIESWEG_CENTERLINE)).toBeLessThan(38);
    const q = objectQuantities(find('Kiesweg'));
    // In engen Kurven überlappt die Innenseite, daher etwas weniger als L × B
    expect(q.area!).toBeLessThanOrEqual(q.length! * 1.2 + 1e-6);
    expect(q.area!).toBeGreaterThan(q.length! * 1.2 * 0.9);
    expect(q.edgingLength).toBeCloseTo(2 * q.length!, 9);
  });

  it('Terrasse 5 × 14 m = 70 m² → 219 Platten', () => {
    const q = objectQuantities(find('Terrasse'));
    expect(q.area).toBeCloseTo(70, 9);
    expect(q.lines[0].quantity).toBe(219);
  });

  it('Rasen ist um Weg, Teich und Deck ausgeschnitten', () => {
    const lawn = objectQuantities(find('Rasen'));
    // L-Form brutto 759 m², netto deutlich kleiner
    expect(lawn.area!).toBeLessThan(720);
    expect(lawn.area!).toBeGreaterThan(650);
  });

  it('Projektsumme ist die Summe der Positionen', () => {
    const s = projectSummary(p);
    expect(s.total).toBeCloseTo(s.lines.reduce((a, l) => a + l.total, 0), 6);
    expect(s.lines.find((l) => l.key === 'item:raised-bed-300x120')!.quantity).toBe(6);
  });
});
