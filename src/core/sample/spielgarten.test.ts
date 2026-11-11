import { describe, expect, it } from 'vitest';
import { getItem } from '../catalog/items';
import { getMaterial } from '../catalog/materials';
import { getSpecies } from '../catalog/plants';
import { footprint } from '../geometry/objects';
import { pointInPolygon } from '../geometry/polygon';
import { boundaryFromPlot } from '../geometry/plot';
import { createSpielgarten } from './spielgarten';
import { SAMPLES } from './samples';

describe('Mustergarten Entspannung, Spiel & Obst', () => {
  const doc = createSpielgarten();
  const objs = Object.values(doc.objects);
  const inside = (q: { x: number; y: number }) => pointInPolygon(q, doc.site.boundary);

  it('Grundstück wie aufgemessen: Kanten ergeben die Grenze', () => {
    const b = boundaryFromPlot(doc.site.plot);
    expect(b).toHaveLength(doc.site.boundary.length);
    b.forEach((q, i) => {
      expect(q.x).toBeCloseTo(doc.site.boundary[i].x, 1);
      expect(q.y).toBeCloseTo(doc.site.boundary[i].y, 1);
    });
  });

  it('alle Flächen, Beete und Objekte liegen im Grundstück', () => {
    const bad: string[] = [];
    for (const o of objs) {
      if (o.type === 'dimension' || o.type === 'text' || o.type === 'lamp' || o.type === 'sprinkler' || o.type === 'drip') continue;
      for (const r of footprint(o)) for (const q of r.outer) if (!inside(q)) bad.push(`${o.type} ${'name' in o ? o.name : ''} @ ${q.x.toFixed(2)},${q.y.toFixed(2)}`);
    }
    expect(bad).toEqual([]);
  });

  it('nutzt nur Katalogeinträge, die es gibt', () => {
    for (const o of objs) {
      if (o.type === 'item') expect(() => getItem(o.catalogId)).not.toThrow();
      if (o.type === 'plant' || o.type === 'hedge' || o.type === 'espalier') expect(() => getSpecies(o.speciesId)).not.toThrow();
      if (o.type === 'area' || o.type === 'path') expect(() => getMaterial(o.materialId)).not.toThrow();
      if (o.type === 'planting') for (const m of o.mix) expect(getSpecies(m.speciesId).kind).toMatch(/perennial|grass/);
    }
  });

  it('Wünsche: Rotbuchenhecke offen zum alten Garten, Spalier an Flurstück 38, Obstbäume unten links', () => {
    const hedge = objs.find((o) => o.type === 'hedge');
    expect(hedge?.type === 'hedge' && hedge.speciesId).toBe('fagus-hedge');
    // die Hecke läuft nicht an der Kante zum alten Garten (x ≈ 0, y 0…13)
    if (hedge?.type === 'hedge') {
      const nodes = hedge.centerline.nodes.map((n) => n.p);
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      expect(first.y).toBeLessThan(1);
      expect(last.y).toBeGreaterThan(12);
      expect(Math.abs(first.x - last.x)).toBeLessThan(1);
    }
    const esp = objs.find((o) => o.type === 'espalier');
    expect(esp).toBeDefined();
    if (esp?.type === 'espalier') for (const n of esp.centerline.nodes) expect(n.p.x).toBeLessThan(13);
    const fruit = objs.filter((o) => o.type === 'plant' && ['malus-topaz', 'pyrus-communis', 'prunus-avium'].includes(o.speciesId));
    expect(new Set(fruit.map((o) => o.type === 'plant' && o.speciesId)).size).toBe(3);
    for (const f of fruit) if (f.type === 'plant') expect(f.position.y).toBeGreaterThan(38);
  });

  it('enthält Outdoorküche überdacht, Office, Sauna, Feuerstelle, Wasserspiel, Spielgeräte, Gewächshaus und Hochbeete', () => {
    const items = new Set(objs.flatMap((o) => (o.type === 'item' ? [o.catalogId] : [])));
    for (const i of ['outdoorkueche-ueberdacht', 'office-pod', 'fasssauna-thermoholz', 'firepit-round', 'spring-stone', 'play-swing', 'trampoline-ground', 'greenhouse-4x3.5', 'raised-bed-corten-300x100', 'haengematte-gestell', 'lounge-sofa'])
      expect(items.has(i), i).toBe(true);
    const texts = objs.flatMap((o) => (o.type === 'text' ? [o.text] : []));
    for (const n of ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧']) expect(texts.some((t) => t.startsWith(n))).toBe(true);
  });

  it('steht in der Liste der Mustergärten', () => {
    expect(SAMPLES.map((s) => s.key)).toEqual(['modern', 'spielgarten']);
    expect(SAMPLES[1].create().name).toContain('Mustergarten');
  });
});
