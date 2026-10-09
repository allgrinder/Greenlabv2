import { describe, expect, it } from 'vitest';
import { getItem } from '../catalog/items';
import { getMaterial } from '../catalog/materials';
import { getSpecies } from '../catalog/plants';
import { footprint } from '../geometry/objects';
import { projectSummary } from '../quantities/quantities';
import { createMustergarten } from './mustergarten';

describe('Mustergarten Modern & Naturnah', () => {
  const doc = createMustergarten();
  const objs = Object.values(doc.objects);

  it('liegt vollständig im Grundstück 30 × 50 m', () => {
    for (const o of objs) {
      if (o.type === 'dimension' || o.type === 'text' || o.type === 'lamp' || o.type === 'sprinkler') continue;
      for (const r of footprint(o))
        for (const q of r.outer) {
          expect(q.x).toBeGreaterThanOrEqual(-0.6);
          expect(q.x).toBeLessThanOrEqual(30.6);
          expect(q.y).toBeGreaterThanOrEqual(-0.6);
          expect(q.y).toBeLessThanOrEqual(50.6);
        }
    }
  });

  it('nutzt nur Katalogeinträge, die es gibt', () => {
    for (const o of objs) {
      if (o.type === 'item') expect(() => getItem(o.catalogId)).not.toThrow();
      if (o.type === 'plant' || o.type === 'hedge') expect(() => getSpecies(o.speciesId)).not.toThrow();
      if (o.type === 'area' || o.type === 'path') expect(() => getMaterial(o.materialId)).not.toThrow();
      if (o.type === 'planting') for (const m of o.mix) expect(getSpecies(m.speciesId).kind).toMatch(/perennial|grass/);
    }
  });

  it('enthält alle sieben Zonen und die Leitmaterialien des Konzepts', () => {
    const texts = objs.flatMap((o) => (o.type === 'text' ? [o.text] : []));
    for (const n of ['①', '②', '③', '④', '⑤', '⑥', '⑦']) expect(texts.some((t) => t.startsWith(n))).toBe(true);
    const mats = new Set(objs.flatMap((o) => (o.type === 'area' || o.type === 'path' ? [o.materialId] : [])));
    for (const m of ['lawn', 'meadow', 'wood', 'gravel', 'sand', 'stepping']) expect(mats.has(m)).toBe(true);
    const items = new Set(objs.flatMap((o) => (o.type === 'item' ? [o.catalogId] : [])));
    for (const i of ['office-pod', 'pavilion-4x4', 'firepit-round', 'trampoline-ground', 'gate-double', 'raised-bed-corten-300x100', 'stone-wall-1m']) expect(items.has(i)).toBe(true);
  });

  it('Basalt: Beete am Pavillon mit Basaltsplitt abgedeckt, Findlinge und Stelen gesetzt', () => {
    expect(objs.filter((o) => o.type === 'planting' && o.mulchMaterialId === 'basalt').length).toBeGreaterThanOrEqual(4);
    const ids = objs.flatMap((o) => (o.type === 'item' ? [o.catalogId] : []));
    expect(ids).toContain('basalt-boulders');
    expect(ids).toContain('basalt-columns');
    expect(getMaterial('basalt').unit).toBe('m3');
  });

  it('Einfassungen: Stahl an den Kiesbeeten, Corten am Eingangsweg, alle im Katalog', () => {
    const edgings = objs.flatMap((o) => ((o.type === 'area' || o.type === 'path') && o.edging ? [o.edging.catalogId] : []));
    expect(edgings).toContain('edge.stahl-anthrazit');
    expect(edgings).toContain('edge.corten');
    for (const e of edgings) expect(getItem(e).unit).toBe('m');
  });

  it('Kosten: Trittplatten werden als Stückzahl gerechnet', () => {
    const rep = projectSummary(doc);
    const st = rep.lines.find((l) => l.key === 'mat:stepping');
    expect(st?.unit).toBe('pcs');
    expect(st!.quantity).toBeGreaterThan(40);
    expect(st!.quantity).toBeLessThan(80);
  });
});
