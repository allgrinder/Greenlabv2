import { describe, expect, it } from 'vitest';
import { brushDab, eraseIn, espalierCount, espalierDensity, espalierTrees, scatterCounts, scatterDiameter } from './espalier';
import { objectQuantities } from './quantities/quantities';
import { newEspalier, newScatter } from './model/factory';
import { createProject } from './model/defaults';
import type { Observer, PathGeometry, Project } from './model/types';
import { lineTransmittance, obstacleGrid, privacyGrid } from './privacy';
import { collectCasters, shadowPolygons } from './sun/shadows';

/** deterministischer Zufall für reproduzierbare Tests */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const line = (pts: [number, number][]): PathGeometry => ({ kind: 'path', closed: false, source: 'polygon', nodes: pts.map(([x, y]) => ({ p: { x, y } })) });
const plot = (): Project => createProject({ name: 'Test', plot: { kind: 'rect', width: 20, depth: 20 }, northDeg: 0, location: null });

describe('Spalierbäume', () => {
  it('verteilt die Bäume gleichmäßig und zählt sie für die Kosten', () => {
    const p = plot();
    const e = newEspalier(p, line([[0, 1], [12, 1]]));
    expect(e.spacing).toBe(1.5);
    expect(espalierCount(e)).toBe(8);
    const xs = espalierTrees(e).map((t) => t.p.x);
    expect(xs[0]).toBeCloseTo(0.75, 9);
    expect(xs[7]).toBeCloseTo(11.25, 9);
    const q = objectQuantities(e, {});
    expect(q.lines[0].quantity).toBe(8);
    expect(q.total).toBeCloseTo(8 * 389, 6);
  });

  it('immergrün bleibt im Winter dicht, Linde nicht, Hainbuche hält Laub', () => {
    expect(espalierDensity('photinia-espalier', 'winter')).toBeGreaterThan(0.9);
    expect(espalierDensity('tilia-espalier', 'winter')).toBeLessThan(0.3);
    expect(espalierDensity('carpinus-espalier', 'winter')).toBeGreaterThan(0.5);
  });

  it('Schatten beginnt erst in Stammhöhe (Schirm schwebt)', () => {
    const p = plot();
    const e = newEspalier(p, line([[2, 5], [10, 5]]));
    p.objects[e.id] = e;
    p.layers[e.layerId].objectOrder.push(e.id);
    const c = collectCasters(p, 0, 'summer').find((x) => x.kind === 'raised')!;
    expect(c).toBeTruthy();
    // Sonne von Süden: Schatten nach Norden (−y), 1 m Versatz je m Höhe
    const polys = shadowPolygons(c, { x: 0, y: -1 });
    const ys = polys.flat().map((q) => q.y);
    // Schirm 1,8–3,8 m: Schatten zwischen y ≈ 5 − 3,8 und 5 − 1,8 (plus halbe Tiefe)
    expect(Math.min(...ys)).toBeCloseTo(5 - 3.8 - e.depth / 2, 1);
    expect(Math.max(...ys)).toBeCloseTo(5 - 1.8 + e.depth / 2, 1);
  });
});

describe('Pflanzpinsel', () => {
  it('setzt Pflanzen im Radius mit Mindestabstand und respektiert vorhandene', () => {
    const r = rng(7);
    const mix = [{ speciesId: 'salvia', weight: 1 }, { speciesId: 'stipa', weight: 1 }];
    const first = brushDab({ x: 0, y: 0 }, { radius: 1.5, density: 1, mix }, [], r);
    expect(first.length).toBeGreaterThan(8);
    for (const a of first) {
      expect(Math.hypot(a.p.x, a.p.y)).toBeLessThanOrEqual(1.5 + 1e-9);
      for (const b of first) {
        if (a === b) continue;
        const min = (scatterDiameter(a.speciesId) + scatterDiameter(b.speciesId)) / 2;
        expect(Math.hypot(a.p.x - b.p.x, a.p.y - b.p.y)).toBeGreaterThanOrEqual(min - 1e-9);
      }
    }
    // zweiter Tupfer an derselben Stelle füllt kaum noch etwas auf
    const second = brushDab({ x: 0, y: 0 }, { radius: 1.5, density: 1, mix }, first, r);
    expect(second.length).toBeLessThan(first.length / 3);
  });

  it('geringere Dichte setzt weniger Pflanzen', () => {
    const mix = [{ speciesId: 'geranium', weight: 1 }];
    const dense = brushDab({ x: 0, y: 0 }, { radius: 2, density: 1, mix }, [], rng(3)).length;
    const sparse = brushDab({ x: 0, y: 0 }, { radius: 2, density: 0.5, mix }, [], rng(3)).length;
    expect(sparse).toBeLessThan(dense * 0.6);
  });

  it('Radierer und Stückzahlen je Art', () => {
    const p = plot();
    const s = newScatter(p, [
      { speciesId: 'salvia', p: { x: 0, y: 0 } },
      { speciesId: 'salvia', p: { x: 3, y: 0 } },
      { speciesId: 'stipa', p: { x: 0.2, y: 0.1 } },
    ]);
    expect(scatterCounts(s).get('salvia')).toBe(2);
    expect(eraseIn(s.plants, { x: 0, y: 0 }, 0.5)).toHaveLength(1);
    const q = objectQuantities(s, {});
    expect(q.lines.reduce((a, l) => a + l.quantity, 0)).toBe(3);
  });
});

describe('Einsehbarkeit', () => {
  const withObserver = (p: Project, o: Partial<Observer> = {}) => {
    p.observers = [{ id: 'n', name: 'Nachbar', position: { x: 10, y: -6 }, eyeHeight: 4.5, ...o }];
    return p;
  };

  it('ohne Hindernisse ist alles einsehbar', () => {
    const g = privacyGrid(withObserver(plot()), { season: 'summer', pose: 'sitting' });
    expect(g.ratio).toBeGreaterThan(0.99);
  });

  it('ein immergrünes Spalier schützt vor Blicken aus dem Obergeschoss, eine Linde im Winter nicht', () => {
    const p = withObserver(plot(), { eyeHeight: 4.5 });
    const e = newEspalier(p, line([[0, 1], [20, 1]]));
    p.objects[e.id] = e;
    p.layers[e.layerId].objectOrder.push(e.id);
    const grid = obstacleGrid(p, 'summer');
    // Blick knapp hinter das Spalier (sitzend): verdeckt
    expect(lineTransmittance(grid, { x: 10, y: -6 }, 4.5, { x: 10, y: 3 }, 1.2)).toBeLessThan(0.1);
    // von der Straße (1,7 m) sieht man unter dem Schirm hindurch
    expect(lineTransmittance(grid, { x: 10, y: -6 }, 1.7, { x: 10, y: 3 }, 1.2)).toBeGreaterThan(0.9);
    const sheltered = privacyGrid(p, { season: 'summer', pose: 'sitting' }).ratio;
    expect(sheltered).toBeLessThan(0.2);
    const lime = { ...e, speciesId: 'tilia-espalier' };
    p.objects[e.id] = lime;
    expect(privacyGrid(p, { season: 'winter', pose: 'sitting' }).ratio).toBeGreaterThan(0.8);
  });

  it('unter dem Schirm hindurch bleibt sichtbar (Stammhöhe)', () => {
    const p = withObserver(plot(), { eyeHeight: 1.0, position: { x: 10, y: -1 } });
    const e = newEspalier(p, line([[0, 1], [20, 1]]));
    p.objects[e.id] = e;
    p.layers[e.layerId].objectOrder.push(e.id);
    const grid = obstacleGrid(p, 'summer');
    // liegende Person direkt dahinter: Sichtlinie bleibt unter 1,8 m
    expect(lineTransmittance(grid, { x: 10, y: -1 }, 1.0, { x: 10, y: 4 }, 0.5)).toBeGreaterThan(0.9);
  });
});
