import type { PathGeometry, Region, ShapeGeometry, Vec2 } from '../model/types';
import type { FlatRegion } from './shape';

export const polygonPath = (pts: Vec2[], source: PathGeometry['source'] = 'polygon'): PathGeometry => ({
  kind: 'path',
  nodes: pts.map((p) => ({ p })),
  closed: true,
  source,
});

export const simpleRegion = (outer: ShapeGeometry): Region => ({ outer, holes: [] });

/** Ergebnis einer booleschen Operation zurück ins Modell */
export const flatToRegion = (r: FlatRegion): Region => ({
  outer: polygonPath(r.outer, 'boolean'),
  holes: r.holes.map((h) => polygonPath(h, 'boolean')),
});
