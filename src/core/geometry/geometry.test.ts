import { describe, expect, it } from 'vitest';
import type { PathGeometry, RectGeometry } from '../model/types';
import { metersPerPixel, applyCalibration, imageToWorld } from '../calibration';
import { cubicLength } from './bezier';
import { difference, offsetPolyline, union } from './clip';
import { area, areaWithHoles, centroid, perimeter, pointInRegion, signedArea } from './polygon';
import { edgesFromPolygon, polygonFromEdges } from './plot';
import { flattenPath, flattenShape, pathLength } from './shape';
import { smoothFreehand, simplify } from './smooth';
import { constrainAngle, snapPoint } from './snap';
import { distanceToPolyline } from './polygon';
import { KIESWEG_CENTERLINE } from '../sample/lindenweg12';

const sq = (x: number, y: number, s: number) => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
];

describe('Polygon', () => {
  it('Rechteck 30 × 50 m hat 1.500 m² und 160 m Umfang', () => {
    const r = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 30 }, { x: 0, y: 30 }];
    expect(area(r)).toBeCloseTo(1500, 9);
    expect(perimeter(r)).toBeCloseTo(160, 9);
    expect(signedArea(r)).toBeGreaterThan(0); // Uhrzeigersinn im Bildschirmsystem
    expect(centroid(r)).toEqual({ x: 25, y: 15 });
  });

  it('konkaves L-Polygon', () => {
    const L = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 3 }, { x: 0, y: 3 }];
    expect(area(L)).toBeCloseTo(6, 9);
    expect(perimeter(L)).toBeCloseTo(14, 9);
  });

  it('Fläche mit Loch', () => {
    expect(areaWithHoles(sq(0, 0, 10), [sq(2, 2, 3)])).toBeCloseTo(91, 9);
    expect(pointInRegion({ x: 3, y: 3 }, sq(0, 0, 10), [sq(2, 2, 3)])).toBe(false);
    expect(pointInRegion({ x: 8, y: 8 }, sq(0, 0, 10), [sq(2, 2, 3)])).toBe(true);
  });
});

describe('Bézier & Formen', () => {
  it('Kreis aus 4 Béziers: Umfang und Fläche auf < 0,05 % genau', () => {
    const k = 0.5522847498;
    const r = 2;
    const circle: PathGeometry = {
      kind: 'path',
      closed: true,
      source: 'bezier',
      nodes: [
        { p: { x: r, y: 0 }, in: { x: 0, y: -k * r }, out: { x: 0, y: k * r } },
        { p: { x: 0, y: r }, in: { x: k * r, y: 0 }, out: { x: -k * r, y: 0 } },
        { p: { x: -r, y: 0 }, in: { x: 0, y: k * r }, out: { x: 0, y: -k * r } },
        { p: { x: 0, y: -r }, in: { x: -k * r, y: 0 }, out: { x: k * r, y: 0 } },
      ],
    };
    expect(Math.abs(pathLength(circle) / (2 * Math.PI * r) - 1)).toBeLessThan(5e-4);
    expect(Math.abs(area(flattenPath(circle, 0.0005)) / (Math.PI * r * r) - 1)).toBeLessThan(5e-4);
  });

  it('gerade Kubik: Länge = Sehne', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 3, y: 4 };
    expect(cubicLength([a, a, b, b])).toBeCloseTo(5, 9);
  });

  it('gedrehtes Rechteck behält Fläche, gerundetes verliert (4 − π)·r²', () => {
    const r: RectGeometry = { kind: 'rect', center: { x: 5, y: 5 }, width: 4, depth: 2, rotationDeg: 33, cornerRadius: 0 };
    expect(area(flattenShape(r))).toBeCloseTo(8, 9);
    const rr = { ...r, cornerRadius: 0.5 };
    expect(area(flattenShape(rr, 0.0005))).toBeCloseTo(8 - (4 - Math.PI) * 0.25, 3);
  });
});

describe('Offset und Boolesche Operationen', () => {
  it('gerader Weg L × B hat Fläche L·B', () => {
    const fr = offsetPolyline([{ x: 0, y: 0 }, { x: 10, y: 0 }], 1.2);
    expect(fr).toHaveLength(1);
    expect(area(fr[0].outer)).toBeCloseTo(12, 3);
    expect(perimeter(fr[0].outer)).toBeCloseTo(22.4, 3);
  });

  it('rechtwinkliger Knick mit runder Ecke: L·B + Viertelkreis-Korrekturen', () => {
    // Mittellinie 10 + 10, Breite 2: zwei Streifen à 20 m², Innenecke (1 × 1) doppelt gezählt,
    // Außenecke als Viertelkreis mit r = 1
    const fr = offsetPolyline([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 2, 'round');
    expect(area(fr[0].outer)).toBeCloseTo(40 - 1 + Math.PI / 4, 2);
  });

  it('Weg-Offset entlang einer Kurve bleibt eine zusammenhängende Fläche ≈ L·B (Regression clipper2-js)', () => {
    const line = flattenPath(KIESWEG_CENTERLINE);
    const L = pathLength(KIESWEG_CENTERLINE);
    for (const join of ['round', 'miter'] as const) {
      const fr = offsetPolyline(line, 1.2, join);
      expect(fr).toHaveLength(1);
      expect(fr[0].holes).toHaveLength(0);
      expect(area(fr[0].outer) / (L * 1.2)).toBeGreaterThan(0.99);
      expect(area(fr[0].outer) / (L * 1.2)).toBeLessThan(1.01);
    }
  });

  it('enge Kehre (Radius < halbe Breite): Band ohne Selbstüberschneidung', () => {
    const fr = offsetPolyline([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0.5 }, { x: 0, y: 0.5 }], 2, 'round');
    const ring = fr[0].outer;
    const n = ring.length;
    let crossings = 0;
    const cross = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, d: { x: number; y: number }) => {
      const o = (p: typeof a, q: typeof a, r: typeof a) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
      return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
    };
    for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (cross(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n])) crossings++;
    }
    expect(crossings).toBe(0);
    // Abgedeckt: 10 × 2,5 m Rechteck plus runde Außenkehre
    expect(area(ring)).toBeGreaterThan(25);
    expect(area(ring)).toBeLessThan(28);
  });

  it('Differenz erzeugt Loch, Vereinigung verschmilzt', () => {
    const d = difference([{ outer: sq(0, 0, 10), holes: [] }], [{ outer: sq(3, 3, 2), holes: [] }]);
    expect(d).toHaveLength(1);
    expect(d[0].holes).toHaveLength(1);
    expect(areaWithHoles(d[0].outer, d[0].holes)).toBeCloseTo(96, 6);

    const u = union([{ outer: sq(0, 0, 2), holes: [] }, { outer: sq(1, 0, 2), holes: [] }]);
    expect(u).toHaveLength(1);
    expect(area(u[0].outer)).toBeCloseTo(6, 6);
  });

  it('Differenz, die eine Fläche teilt, liefert zwei Regionen', () => {
    const strip = [{ x: 4, y: -1 }, { x: 6, y: -1 }, { x: 6, y: 11 }, { x: 4, y: 11 }];
    const d = difference([{ outer: sq(0, 0, 10), holes: [] }], [{ outer: strip, holes: [] }]);
    expect(d).toHaveLength(2);
    expect(d.reduce((s, r) => s + area(r.outer), 0)).toBeCloseTo(80, 6);
  });
});

describe('Grundstück aus Kanten und Winkeln', () => {
  it('Rechteck aus drei Kanten: Schlusskante wird berechnet', () => {
    const { points, closing } = polygonFromEdges([
      { length: 50, angleDeg: 0 },
      { length: 30, angleDeg: 90 },
      { length: 50, angleDeg: 90 },
    ]);
    expect(points).toHaveLength(4);
    expect(points[2].x).toBeCloseTo(50, 9);
    expect(points[2].y).toBeCloseTo(30, 9);
    expect(closing.length).toBeCloseTo(30, 9);
    expect(closing.angleDeg).toBeCloseTo(90, 9);
    expect(closing.angleAtStartDeg).toBeCloseTo(90, 9);
    expect(area(points)).toBeCloseTo(1500, 6);
  });

  it('Fünfeck: Kanten und Winkel lassen sich verlustfrei zurückrechnen', () => {
    const pts = [{ x: 0, y: 0 }, { x: 48, y: -2.8 }, { x: 50, y: 27 }, { x: 26, y: 33.6 }, { x: 0.5, y: 28.6 }];
    const e = edgesFromPolygon(pts);
    // Innenwinkelsumme eines Fünfecks = 540°
    expect(e.reduce((s, x) => s + x.angleDeg, 0)).toBeCloseTo(540, 6);
    const firstDir = (Math.atan2(pts[1].y, pts[1].x) * 180) / Math.PI;
    const rebuilt = polygonFromEdges([
      { length: e[0].length, angleDeg: firstDir },
      ...e.slice(1, 4).map((x) => ({ length: x.length, angleDeg: x.angleDeg })),
    ]);
    rebuilt.points.forEach((p, i) => {
      expect(p.x).toBeCloseTo(pts[i].x, 6);
      expect(p.y).toBeCloseTo(pts[i].y, 6);
    });
    expect(rebuilt.closing.length).toBeCloseTo(e[4].length, 6);
    expect(rebuilt.closing.angleDeg).toBeCloseTo(e[4].angleDeg, 6);
    expect(rebuilt.closing.angleAtStartDeg).toBeCloseTo(e[0].angleDeg, 6);
  });
});

describe('Kalibrierung', () => {
  it('zwei Punkte im Abstand 124 px = 12,40 m → 0,1 m/px', () => {
    expect(metersPerPixel({ a: { x: 10, y: 10 }, b: { x: 134, y: 10 }, distanceM: 12.4 })).toBeCloseTo(0.1, 12);
  });

  it('Anwenden hält Punkt a an seiner Weltposition', () => {
    const bg = { origin: { x: 5, y: 5 }, metersPerPixel: 0.05, rotationDeg: 10, calibration: null };
    const c = { a: { x: 100, y: 40 }, b: { x: 300, y: 40 }, distanceM: 30 };
    const before = imageToWorld(bg, c.a);
    const next = applyCalibration(bg, c);
    expect(next.metersPerPixel).toBeCloseTo(0.15, 12);
    const after = imageToWorld(next, c.a);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it('ungültige Eingabe wirft', () => {
    expect(() => metersPerPixel({ a: { x: 1, y: 1 }, b: { x: 1, y: 1 }, distanceM: 3 })).toThrow();
  });
});

describe('Fang', () => {
  const cands = { vertices: [{ x: 10, y: 10 }], segments: [[{ x: 0, y: 0 }, { x: 10, y: 0 }]] as [{ x: number; y: number }, { x: number; y: number }][] };
  const opts = { tolerance: 0.3, grid: 0.5, geometry: true };

  it('Ecke vor Kante vor Raster', () => {
    expect(snapPoint({ x: 10.1, y: 9.9 }, cands, opts)).toMatchObject({ kind: 'vertex', p: { x: 10, y: 10 } });
    expect(snapPoint({ x: 5.1, y: 0.2 }, cands, opts)).toMatchObject({ kind: 'midpoint', p: { x: 5, y: 0 } });
    expect(snapPoint({ x: 7.3, y: 0.2 }, cands, opts)).toMatchObject({ kind: 'edge', p: { x: 7.3, y: 0 } });
    expect(snapPoint({ x: 3.26, y: 4.74 }, cands, opts)).toMatchObject({ kind: 'grid', p: { x: 3.5, y: 4.5 } });
  });

  it('Raster 10 cm', () => {
    const r = snapPoint({ x: 1.234, y: 5.678 }, { vertices: [], segments: [] }, { tolerance: 0, grid: 0.1, geometry: false });
    expect(r.p.x).toBeCloseTo(1.2, 9);
    expect(r.p.y).toBeCloseTo(5.7, 9);
  });

  it('Winkel rastet auf 15°', () => {
    const p = constrainAngle({ x: 0, y: 0 }, { x: 10, y: 1 });
    expect(p.y).toBeCloseTo(0, 9);
    expect(p.x).toBeCloseTo(Math.hypot(10, 1), 9);
  });
});

describe('Freihand', () => {
  it('RDP entfernt kollineare Punkte', () => {
    const pts = Array.from({ length: 11 }, (_, i) => ({ x: i, y: 0 }));
    expect(simplify(pts, 0.01)).toHaveLength(2);
  });

  it('geglättete Kurve bleibt nah an der Eingabe', () => {
    const raw = Array.from({ length: 200 }, (_, i) => {
      const t = (i / 199) * Math.PI;
      return { x: t * 3, y: Math.sin(t) * 2 + (i % 2 ? 0.01 : -0.01) };
    });
    const nodes = smoothFreehand(raw, false, 0.05);
    expect(nodes.length).toBeLessThan(30);
    const curve = flattenPath({ nodes, closed: false });
    const maxDev = Math.max(...raw.map((p) => distanceToPolyline(p, curve, false)));
    expect(maxDev).toBeLessThan(0.1);
  });
});
