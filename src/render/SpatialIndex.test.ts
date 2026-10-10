import { describe, expect, it } from 'vitest';
import { createProject } from '../core/model/defaults';
import { newArea, newDimension } from '../core/model/factory';
import type { DimensionObject, Project } from '../core/model/types';
import { SpatialIndex } from './SpatialIndex';

describe('SpatialIndex', () => {
  it('Maßkette an einem Objekt: Rahmen wandert mit, wenn das Objekt verschoben wird', () => {
    const doc0 = createProject({ name: 'T', plot: { kind: 'rect', width: 30, depth: 30 } });
    const area = newArea(doc0, { outer: { kind: 'path', closed: true, source: 'polygon', nodes: [{ p: { x: 2, y: 2 } }, { p: { x: 6, y: 2 } }, { p: { x: 6, y: 5 } }].map((n) => ({ ...n, smooth: false })) }, holes: [] }, 'lawn');
    const dim: DimensionObject = { ...newDimension(doc0, { x: 2, y: 2 }, { x: 6, y: 2 }, 0.5), a: { kind: 'vertex', objectId: area.id, nodeIndex: 0 }, b: { kind: 'vertex', objectId: area.id, nodeIndex: 1 } };
    const doc: Project = { ...doc0, objects: { [area.id]: area, [dim.id]: dim } };
    const idx = new SpatialIndex();
    idx.sync(doc);
    expect(idx.bbox(dim.id)!.maxX).toBeLessThan(8);
    // Fläche um 10 m nach rechts verschieben, die Maßkette selbst bleibt dasselbe Objekt
    const moved = { ...area, region: { ...area.region, outer: { ...area.region.outer, nodes: (area.region.outer as { nodes: { p: { x: number; y: number } }[] }).nodes.map((n) => ({ ...n, p: { x: n.p.x + 10, y: n.p.y } })) } } } as typeof area;
    const doc2: Project = { ...doc, objects: { ...doc.objects, [area.id]: moved } };
    const changed = idx.sync(doc2);
    expect(changed.has(dim.id)).toBe(true);
    expect(idx.bbox(dim.id)!.minX).toBeGreaterThan(10);
    expect(idx.query({ minX: 13, minY: 1, maxX: 15, maxY: 3 })).toContain(dim.id);
  });
});
