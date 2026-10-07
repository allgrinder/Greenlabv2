import type { PlotEdge, PlotSpec, Vec2 } from '../model/types';
import { add, angleDeg, dist, fromAngle, sub } from './vec';

export interface ClosingEdge {
  length: number;
  /** Innenwinkel am Startpunkt der Schlusskante (letzter Punkt) */
  angleDeg: number;
  /** Innenwinkel an Punkt A, der sich durch die Schlusskante ergibt */
  angleAtStartDeg: number;
}

export interface EdgePolygon {
  points: Vec2[];
  closing: ClosingEdge;
}

/** Winkel auf (−180, 180] normieren */
const norm180 = (a: number): number => {
  let x = ((a + 180) % 360 + 360) % 360 - 180;
  if (x === -180) x = 180;
  return x;
};

/**
 * Grundstück aus Kantenlängen und Innenwinkeln.
 *
 * Konvention: Umlauf im Uhrzeigersinn (im Bildschirmsystem, y nach unten). Die erste Kante
 * hat einen Richtungswinkel (0 = Osten, 90 = Süden), jede weitere einen Innenwinkel an ihrem
 * Startpunkt. Rechte Ecke = 90°. Die Schlusskante zurück zu A wird berechnet.
 */
export function polygonFromEdges(edges: PlotEdge[]): EdgePolygon {
  const pts: Vec2[] = [{ x: 0, y: 0 }];
  let heading = 0;
  edges.forEach((e, i) => {
    heading = i === 0 ? e.angleDeg : heading + (180 - e.angleDeg);
    pts.push(add(pts[pts.length - 1], fromAngle(heading, e.length)));
  });
  const last = pts[pts.length - 1];
  const closeVec = sub(pts[0], last);
  const closeHeading = angleDeg(closeVec);
  const firstHeading = edges.length ? edges[0].angleDeg : 0;
  const closing: ClosingEdge = {
    length: dist(last, pts[0]),
    angleDeg: 180 - norm180(closeHeading - heading),
    angleAtStartDeg: 180 - norm180(firstHeading - closeHeading),
  };
  // Ist die Kontur bereits geschlossen, entfällt der doppelte Endpunkt
  if (closing.length < 1e-9) pts.pop();
  return { points: pts, closing };
}

/** Grenzpolygon aus der gespeicherten Eingabe */
export function boundaryFromPlot(spec: PlotSpec): Vec2[] {
  switch (spec.kind) {
    case 'rect':
      return [
        { x: 0, y: 0 },
        { x: spec.width, y: 0 },
        { x: spec.width, y: spec.depth },
        { x: 0, y: spec.depth },
      ];
    case 'edges':
      return polygonFromEdges(spec.edges).points;
    case 'drawn':
      return spec.points.slice();
  }
}

/** Umkehrung: Kantenlängen und Innenwinkel eines gezeichneten Polygons (für die Kantenliste) */
export function edgesFromPolygon(points: Vec2[]): { length: number; angleDeg: number }[] {
  const n = points.length;
  return points.map((p, i) => {
    const prev = points[(i + n - 1) % n];
    const next = points[(i + 1) % n];
    const hin = angleDeg(sub(p, prev));
    const hout = angleDeg(sub(next, p));
    return { length: dist(p, next), angleDeg: 180 - norm180(hout - hin) };
  });
}

/**
 * Kanteneingabe (Richtung der ersten Kante, Innenwinkel der übrigen) aus Punkten.
 * Die letzte Kante zurück zu A bleibt die berechnete Schlusskante. Volle Genauigkeit,
 * damit `polygonFromEdges` die Punkte (relativ zu A) exakt wiederherstellt.
 */
export function plotEdgesFromPoints(points: Vec2[]): PlotEdge[] {
  const n = points.length;
  const out: PlotEdge[] = [];
  for (let i = 0; i < n - 1; i++) {
    const p = points[i];
    const q = points[i + 1];
    if (i === 0) out.push({ length: dist(p, q), angleDeg: angleDeg(sub(q, p)) });
    else {
      const hin = angleDeg(sub(p, points[i - 1]));
      const hout = angleDeg(sub(q, p));
      out.push({ length: dist(p, q), angleDeg: 180 - norm180(hout - hin) });
    }
  }
  return out;
}

/** Punkte aus der Kanteneingabe, verschoben so, dass A auf `anchor` liegt */
export function pointsFromEdges(edges: PlotEdge[], anchor: Vec2): Vec2[] {
  return polygonFromEdges(edges).points.map((p) => add(p, anchor));
}

/** Kontur im Uhrzeigersinn (Bildschirmsystem, y nach unten) – wie die Kanteneingabe es erwartet */
export function clockwise(points: Vec2[]): Vec2[] {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s >= 0 ? points : [points[0], ...points.slice(1).reverse()];
}
