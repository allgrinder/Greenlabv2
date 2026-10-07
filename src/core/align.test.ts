import { describe, expect, it } from 'vitest';
import { alignTwoPoints, imageToWorld, northFromImageRotation } from './calibration';
import { findPlace, nearestPlace } from './geo/places';
import { clockwise, plotEdgesFromPoints, pointsFromEdges } from './geometry/plot';

const close = (a: { x: number; y: number }, b: { x: number; y: number }, eps = 1e-9) => {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.y).toBeCloseTo(b.y, 9);
  return eps;
};

describe('Bild an zwei Punkten ausrichten', () => {
  it('bildet die Bildpunkte exakt auf die Ecken ab (Maßstab, Drehung, Lage)', () => {
    const a = { x: 100, y: 200 };
    const b = { x: 600, y: 200 };
    const A = { x: 3, y: 4 };
    // B liegt 25 m entfernt, 30° im Uhrzeigersinn gedreht
    const t = (30 * Math.PI) / 180;
    const B = { x: A.x + 25 * Math.cos(t), y: A.y + 25 * Math.sin(t) };
    const r = alignTwoPoints(a, b, A, B);
    expect(r.metersPerPixel).toBeCloseTo(0.05, 12);
    expect(r.rotationDeg).toBeCloseTo(30, 9);
    close(imageToWorld(r, a), A);
    close(imageToWorld(r, b), B);
    expect(r.calibration.distanceM).toBeCloseTo(25, 9);
  });

  it('genordetes Bild: Drehung ergibt die Nordrichtung, normiert auf ±180°', () => {
    expect(northFromImageRotation(-12)).toBe(-12);
    expect(northFromImageRotation(350)).toBe(-10);
    expect(northFromImageRotation(190)).toBe(-170);
  });

  it('weist identische Punkte zurück', () => {
    expect(() => alignTwoPoints({ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 0 }, { x: 5, y: 0 })).toThrow();
  });
});

describe('Kontur aus Punkten', () => {
  it('Kanten aus Punkten stellen die Punkte wieder her (Anker = A)', () => {
    const pts = [
      { x: 2, y: 3 },
      { x: 30, y: 1 },
      { x: 33, y: 22 },
      { x: 14, y: 28 },
      { x: 1, y: 20 },
    ];
    const edges = plotEdgesFromPoints(pts);
    expect(edges).toHaveLength(4);
    pointsFromEdges(edges, pts[0]).forEach((p, i) => close(p, pts[i]));
  });

  it('dreht gegen den Uhrzeigersinn gezeichnete Konturen um, A bleibt erster Punkt', () => {
    const ccw = [
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
    ];
    const cw = clockwise(ccw);
    expect(cw[0]).toEqual(ccw[0]);
    expect(cw[1]).toEqual({ x: 10, y: 0 });
  });
});

describe('Orte', () => {
  it('findet Orte ohne Rücksicht auf Groß-/Kleinschreibung und per eindeutigem Präfix', () => {
    expect(findPlace('münchen')?.lat).toBeCloseTo(48.14, 2);
    expect(findPlace('Frankf')?.name).toBe('Frankfurt am Main');
    expect(findPlace('B')).toBeNull();
    expect(findPlace('Atlantis')).toBeNull();
  });

  it('nächster Ort zu Koordinaten', () => {
    const n = nearestPlace(50.15, 8.62);
    expect(n.place.name).toBe('Frankfurt am Main');
    expect(n.km).toBeLessThan(10);
  });
});
