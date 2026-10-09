import { describe, expect, it } from 'vitest';
import { BED_MIXES, rankBedMixes, sunClass } from './catalog/bedMixes';
import { getSpecies } from './catalog/plants';
import { newPlanting } from './model/factory';
import { createProject } from './model/defaults';
import { assignSpecies, bedDepth, normalizeMix } from './planting';
import { objectQuantities } from './quantities/quantities';
import { rng } from '../render/util/rng';

const site = [
  { x: 0, y: 0 },
  { x: 20, y: 0 },
  { x: 20, y: 30 },
  { x: 0, y: 30 },
];

describe('Rabatten', () => {
  it('Vorlagen: nur Katalogarten, Anteile summieren sich zu 1', () => {
    for (const v of BED_MIXES) {
      expect(Math.abs(v.mix.reduce((s, m) => s + m.share, 0) - 1)).toBeLessThan(1e-9);
      for (const m of v.mix) expect(getSpecies(m.speciesId).kind).toMatch(/perennial|grass/);
    }
  });

  it('Empfehlung nach Sonnenstunden', () => {
    expect(sunClass(8)).toBe('full');
    expect(sunClass(4)).toBe('partial');
    expect(sunClass(1.5)).toBe('shade');
    expect(rankBedMixes(1.5)[0].sun).toBe('shade');
    expect(rankBedMixes(8)[0].sun).toBe('full');
    expect(rankBedMixes(null)).toEqual(BED_MIXES);
  });

  it('Tiefe: Rabatte an der Grenze ist hinten tief, vorn flach', () => {
    // 2 m tiefes Beet entlang der Nordgrenze (y = 0)
    const bed = [
      { x: 2, y: 0 },
      { x: 18, y: 0 },
      { x: 18, y: 2 },
      { x: 2, y: 2 },
    ];
    const d = bedDepth(bed, site);
    expect(d({ x: 10, y: 1.95 })).toBeLessThan(0.1); // Vorderkante zum Garten
    expect(d({ x: 10, y: 0.1 })).toBeGreaterThan(0.85); // an der Grenze
    // Inselbeet: Mitte am tiefsten
    const island = [
      { x: 8, y: 12 },
      { x: 12, y: 12 },
      { x: 12, y: 16 },
      { x: 8, y: 16 },
    ];
    const di = bedDepth(island, site);
    expect(di({ x: 10, y: 14 })).toBeGreaterThan(0.9);
    expect(di({ x: 8.1, y: 14 })).toBeLessThan(0.1);
  });

  it('Staffelung: hohe Arten hinten, Anteile bleiben erhalten', () => {
    const depths = Array.from({ length: 400 }, (_, i) => i / 399);
    const mix = [
      { height: 1.5, share: 0.25 },
      { height: 0.4, share: 0.5 },
      { height: 0.8, share: 0.25 },
    ];
    const picks = assignSpecies(depths, mix, rng(7), true);
    const count = [0, 1, 2].map((i) => picks.filter((p) => p === i).length);
    expect(count[0]).toBe(100);
    expect(count[1]).toBe(200);
    expect(count[2]).toBe(100);
    const meanDepth = (i: number) => depths.filter((_, k) => picks[k] === i).reduce((s, d) => s + d, 0) / count[i];
    expect(meanDepth(1)).toBeLessThan(meanDepth(2));
    expect(meanDepth(2)).toBeLessThan(meanDepth(0));
  });

  it('Anteile normieren', () => {
    const n = normalizeMix([{ share: 2 }, { share: 1 }, { share: 1 }]);
    expect(n.map((x) => x.share)).toEqual([0.5, 0.25, 0.25]);
    expect(normalizeMix([{ share: 0 }, { share: 0 }]).map((x) => x.share)).toEqual([0.5, 0.5]);
  });

  it('Neue Rabatte: gestaffelt, gemulcht, Kosten mit Pflanzen, Mulch und Einfassung', () => {
    const doc = createProject({ name: 'T', plot: { kind: 'rect', width: 20, depth: 30 } });
    const b = newPlanting(doc, { outer: { kind: 'rect', center: { x: 10, y: 1 }, width: 10, depth: 2, rotationDeg: 0, cornerRadius: 0 }, holes: [] }, 'mediterran');
    expect(b.tiers).toBe(true);
    expect(b.mulchMaterialId).toBe('gravel');
    expect(doc.layers[b.layerId].kind).toBe('plants');
    const q = objectQuantities({ ...b, edging: { catalogId: 'edge.stahl-anthrazit', sides: 'outline' } });
    const plants = q.lines.filter((l) => l.key.startsWith('plant:')).reduce((s, l) => s + l.quantity, 0);
    expect(plants).toBe(Math.round(20 * 10));
    expect(q.edgingLength).toBeCloseTo(24, 6);
    expect(q.lines.some((l) => l.key.startsWith('mat:gravel'))).toBe(true);
  });
});
