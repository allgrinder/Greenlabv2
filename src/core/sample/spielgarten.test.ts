import { describe, expect, it } from 'vitest';
import { getItem } from '../catalog/items';
import { getMaterial } from '../catalog/materials';
import { getSpecies } from '../catalog/plants';
import { footprint } from '../geometry/objects';
import { pointInPolygon, signedArea } from '../geometry/polygon';
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

  it('Ensemble: Homeoffice mit Outdoorküche direkt an der Ostgrenze, Feuerstelle ≥ 5 m davor', () => {
    const ens = objs.find((o) => o.type === 'item' && o.catalogId === 'gartenhaus-office-kueche');
    const fire = objs.find((o) => o.type === 'item' && o.catalogId === 'firepit-round');
    expect(ens && fire).toBeTruthy();
    const corners = footprint(ens!)[0].outer;
    // Abstand jeder Ecke zur Ostgrenze B–C
    const [b, c] = [doc.site.boundary[1], doc.site.boundary[2]];
    const len = Math.hypot(c.x - b.x, c.y - b.y);
    const dist = corners.map((q) => Math.abs((c.x - b.x) * (b.y - q.y) - (b.x - q.x) * (c.y - b.y)) / len);
    // Rückwand direkt vor der Hecke an der Grenze
    expect(Math.min(...dist)).toBeGreaterThan(1);
    expect(Math.min(...dist)).toBeLessThan(1.3);
    if (fire?.type === 'item') for (const q of corners) expect(Math.hypot(q.x - fire.position.x, q.y - fire.position.y)).toBeGreaterThan(5);
    const amel = objs.filter((o) => o.type === 'plant' && o.speciesId === 'amelanchier-lamarckii');
    expect(amel.length).toBeGreaterThanOrEqual(4);
  });

  it('Gerätehaus mit Holzunterstand an der Westgrenze, keine Sauna und keine Lounge', () => {
    const items = objs.flatMap((o) => (o.type === 'item' ? [o] : []));
    const shed = items.find((o) => o.catalogId === 'geraetehaus-holzunterstand');
    expect(shed?.position.x).toBeLessThan(13);
    for (const gone of ['fasssauna-thermoholz', 'lounge-sofa', 'office-pod'])
      expect(
        items.some((o) => o.catalogId === gone),
        gone,
      ).toBe(false);
  });

  it('Rasen durchgehend: eine Fläche ohne Ausschnitte, Terrasse und Teich liegen darauf', () => {
    const lawns = objs.filter((o) => o.type === 'area' && o.materialId === 'lawn');
    expect(lawns).toHaveLength(1);
    const fp = footprint(lawns[0]);
    expect(fp).toHaveLength(1);
    expect(fp[0].holes).toHaveLength(0);
  });

  it('Naturteich 25–35 m², Wege nur aus Trittplatten', () => {
    const pond = objs.find((o) => o.type === 'area' && o.materialId === 'water');
    expect(pond).toBeDefined();
    const a = footprint(pond!).reduce((s, r) => s + Math.abs(signedArea(r.outer)), 0);
    expect(a).toBeGreaterThan(25);
    expect(a).toBeLessThan(35);
    const paths = objs.filter((o) => o.type === 'path');
    expect(paths.length).toBeGreaterThan(0);
    for (const o of paths) if (o.type === 'path') expect(o.materialId).toBe('stepping');
  });

  it('enthält Spielgeräte, Gewächshaus, Hochbeete, Wasserspiel und alle Zonen', () => {
    const items = new Set(objs.flatMap((o) => (o.type === 'item' ? [o.catalogId] : [])));
    for (const i of [
      'gartenhaus-office-kueche',
      'geraetehaus-holzunterstand',
      'firepit-round',
      'spring-stone',
      'play-swing',
      'trampoline-ground',
      'greenhouse-4x3.5',
      'raised-bed-corten-300x100',
      'haengematte-gestell',
    ])
      expect(items.has(i), i).toBe(true);
    const texts = objs.flatMap((o) => (o.type === 'text' ? [o.text] : []));
    for (const n of ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨']) expect(texts.some((t) => t.startsWith(n))).toBe(true);
  });

  it('steht in der Liste der Mustergärten', () => {
    expect(SAMPLES.map((s) => s.key)).toEqual(['modern', 'spielgarten']);
    expect(SAMPLES[1].create().name).toContain('Mustergarten');
  });
});
