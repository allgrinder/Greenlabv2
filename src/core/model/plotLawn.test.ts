import { describe, expect, it } from 'vitest';
import { bbox } from '../geometry/polygon';
import { flattenRegion } from '../geometry/shape';
import { createProject } from './defaults';
import { withPlotLawn } from './factory';

const loc = { label: '', place: 'Frankfurt', lat: 50.1, lon: 8.7, timeZone: 'Europe/Berlin' };

describe('withPlotLawn', () => {
  it('legt Rasen 30 cm vom Grundstücksrand an, auf der Flächen-Ebene', () => {
    const doc = withPlotLawn(createProject({ name: 'T', plot: { kind: 'rect', width: 30, depth: 50 }, northDeg: 0, location: loc }));
    const lawns = Object.values(doc.objects).filter((o) => o.type === 'area' && o.materialId === 'lawn');
    expect(lawns).toHaveLength(1);
    const o = lawns[0];
    if (o.type !== 'area') throw new Error();
    const b = bbox(flattenRegion(o.region).outer);
    expect(b.minX).toBeCloseTo(0.3, 6);
    expect(b.minY).toBeCloseTo(0.3, 6);
    expect(b.maxX).toBeCloseTo(29.7, 6);
    expect(b.maxY).toBeCloseTo(49.7, 6);
    expect(doc.layers[o.layerId].kind).toBe('areas');
    expect(doc.layers[o.layerId].objectOrder).toContain(o.id);
  });

  it('folgt auch schiefen Grundstücken', () => {
    const doc = withPlotLawn(createProject({ name: 'T', plot: { kind: 'edges', edges: [{ length: 20, angleDeg: 0 }, { length: 15, angleDeg: 100 }, { length: 22, angleDeg: 180 }] }, northDeg: 0, location: loc }));
    expect(Object.values(doc.objects).filter((o) => o.type === 'area')).toHaveLength(1);
  });
});
