/**
 * Benchmark-Projekt: großes Grundstück mit N gemischten Objekten (Bäume, Sträucher,
 * Flächen, Objekte, Wege) für Performance-Messungen (`?bench=1000`).
 */
import { createProject, layerOfKind, objectBase } from '../model/defaults';
import type { PlanObject, Project } from '../model/types';

export function createBenchmark(n: number): Project {
  const side = Math.ceil(Math.sqrt(n)) * 4;
  const p = createProject({ name: `Benchmark ${n}`, plot: { kind: 'rect', width: side, depth: side } });
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const add = (o: PlanObject) => {
    p.objects[o.id] = o;
    p.layers[o.layerId].objectOrder.push(o.id);
  };
  const L = (k: Parameters<typeof layerOfKind>[1]) => layerOfKind(p, k).id;
  const cols = Math.ceil(Math.sqrt(n));
  for (let i = 0; i < n; i++) {
    const x = (i % cols) * 4 + 2;
    const y = Math.floor(i / cols) * 4 + 2;
    const kind = i % 5;
    if (kind === 0) add({ ...objectBase(L('plants')), type: 'plant', speciesId: 'acer-campestre', position: { x, y }, plantedYear: 2026, plantedDiameter: 2 + r() * 2 });
    else if (kind === 1) add({ ...objectBase(L('plants')), type: 'plant', speciesId: 'viburnum', position: { x, y }, plantedYear: 2026, plantedDiameter: 1.5 });
    else if (kind === 2)
      add({
        ...objectBase(L('areas')),
        type: 'area',
        materialId: ['lawn', 'gravel', 'paving', 'wood'][Math.floor(r() * 4)],
        edging: null,
        region: { outer: { kind: 'rect', center: { x, y }, width: 3.4, depth: 3.4, rotationDeg: r() * 40, cornerRadius: 0.2 }, holes: [] },
      });
    else if (kind === 3) add({ ...objectBase(L('build')), type: 'item', catalogId: 'raised-bed-300x120', position: { x, y }, rotationDeg: r() * 90, size: null });
    else
      add({
        ...objectBase(L('paths')),
        type: 'path',
        materialId: 'gravel',
        width: 0.8,
        join: 'round',
        edging: null,
        centerline: { kind: 'path', closed: false, source: 'bezier', nodes: [{ p: { x: x - 1.5, y }, out: { x: 1, y: -1.5 } }, { p: { x: x + 1.5, y }, in: { x: -1, y: 1.5 } }] },
      });
  }
  return p;
}
