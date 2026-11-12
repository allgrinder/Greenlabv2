import { describe, expect, it } from 'vitest';
import { rotate } from '../core/geometry/vec';
import { createSpielgarten } from '../core/sample/spielgarten';
import type { Viewport } from '../state/types';
import { fitPoints, panBy, screenToWorld, visibleWorldBBox, worldToScreen, zoomAt } from './Viewport';
import { RotatedDocs, sceneViewport, viewPivot } from './viewRotation';

const size = { width: 1200, height: 800 };
const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
};

describe('Ansicht in 90°-Schritten drehen', () => {
  for (const r of [0, 90, 180, 270])
    for (const tiltDeg of [0, 35])
      it(`Bildschirm ↔ Plan passt zur gezeichneten Szene (${r}°, Kippung ${tiltDeg}°)`, () => {
        const vp: Viewport = { center: { x: 20, y: 25 }, pxPerMeter: 18, rotationDeg: r, tiltDeg };
        const pivot = { x: 19.5, y: 26 };
        for (const p of [
          { x: 3, y: 4 },
          { x: 38, y: 47 },
          { x: 20, y: 25 },
        ]) {
          // Rundreise
          close(screenToWorld(vp, size, worldToScreen(vp, size, p)), p);
          // gleicher Bildschirmpunkt wie die gedrehte Szene ohne Drehung
          close(worldToScreen(vp, size, p), worldToScreen(sceneViewport(vp, pivot), size, rotate(p, r, pivot)));
        }
      });

  it('Verschieben und Zoomen folgen dem Bildschirm, auch gedreht', () => {
    const vp: Viewport = { center: { x: 20, y: 25 }, pxPerMeter: 18, rotationDeg: 90, tiltDeg: 35 };
    const p = { x: 12, y: 30 };
    const a = worldToScreen(vp, size, p);
    const b = worldToScreen(panBy(vp, 40, -25), size, p);
    expect(b.x - a.x).toBeCloseTo(40, 6);
    expect(b.y - a.y).toBeCloseTo(-25, 6);
    const anchor = { x: 300, y: 200 };
    const w = screenToWorld(vp, size, anchor);
    close(worldToScreen(zoomAt(vp, size, anchor, 1.7), size, w), anchor);
  });

  it('Einpassen und sichtbarer Bereich berücksichtigen die Drehung', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 50 },
      { x: 0, y: 50 },
    ];
    const vp = fitPoints(pts, size, undefined, 40, 0, 90);
    expect(vp.rotationDeg).toBe(90);
    for (const q of pts) {
      const s = worldToScreen(vp, size, q);
      expect(s.x).toBeGreaterThanOrEqual(39);
      expect(s.x).toBeLessThanOrEqual(size.width - 39);
      expect(s.y).toBeGreaterThanOrEqual(39);
      expect(s.y).toBeLessThanOrEqual(size.height - 39);
    }
    const vb = visibleWorldBBox(vp, size);
    for (const q of pts) {
      expect(q.x).toBeGreaterThanOrEqual(vb.minX);
      expect(q.y).toBeLessThanOrEqual(vb.maxY);
    }
  });

  it('gedrehte Kopie: unveränderte Objekte bleiben dieselben, Objekte drehen mit, Beschriftung bleibt aufrecht', () => {
    const doc = createSpielgarten();
    const rd = new RotatedDocs();
    expect(rd.get(doc, 0)).toBe(doc);
    const a = rd.get(doc, 90);
    expect(a.site.northDeg).toBeCloseTo(doc.site.northDeg + 90);
    const id = Object.keys(doc.objects).find((k) => doc.objects[k].type === 'item')!;
    const item = doc.objects[id];
    const ri = a.objects[id];
    if (item.type === 'item' && ri.type === 'item') {
      expect(ri.rotationDeg).toBe(item.rotationDeg + 90);
      close(ri.position, rotate(item.position, 90, viewPivot(doc)));
    }
    const tid = Object.keys(doc.objects).find((k) => doc.objects[k].type === 'text')!;
    const t0 = doc.objects[tid];
    const t1 = a.objects[tid];
    if (t0.type === 'text' && t1.type === 'text') expect(t1.rotationDeg).toBe(t0.rotationDeg);
    // ein Objekt ändern: nur dessen Kopie ist neu
    const changed = { ...doc, objects: { ...doc.objects, [id]: { ...item } } };
    const b = rd.get(changed, 90);
    expect(b.objects[id]).not.toBe(a.objects[id]);
    expect(b.objects[tid]).toBe(a.objects[tid]);
  });
});
