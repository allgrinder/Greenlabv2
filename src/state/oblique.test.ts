import { describe, expect, it } from 'vitest';
import { OBLIQUE_TILT_DEG, fitBBox, panBy, screenToWorld, worldToScreen, zoomAt } from '../render/Viewport';
import { createEditorStore } from './store';
import type { Viewport } from './types';

const size = { width: 1200, height: 800 };
const vp: Viewport = { center: { x: 20, y: 10 }, pxPerMeter: 30, rotationDeg: 0, tiltDeg: OBLIQUE_TILT_DEG };

describe('Schrägansicht', () => {
  it('Boden ↔ Bildschirm sind zueinander invers, y ist um cos(Kippwinkel) gestaucht', () => {
    const p = { x: 27.5, y: 3.2 };
    const s = worldToScreen(vp, size, p);
    const back = screenToWorld(vp, size, s);
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
    const top = worldToScreen({ ...vp, tiltDeg: 0 }, size, p);
    expect(s.x).toBeCloseTo(top.x, 9);
    expect((s.y - size.height / 2) / (top.y - size.height / 2)).toBeCloseTo(Math.cos((OBLIQUE_TILT_DEG * Math.PI) / 180), 9);
  });

  it('Zoomen hält den Bodenpunkt unter dem Cursor, Verschieben folgt der Maus', () => {
    const cursor = { x: 900, y: 650 };
    const before = screenToWorld(vp, size, cursor);
    const z = zoomAt(vp, size, cursor, 1.7);
    const after = screenToWorld(z, size, cursor);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
    const moved = panBy(vp, 40, -25);
    const a = worldToScreen(vp, size, { x: 10, y: 10 });
    const b = worldToScreen(moved, size, { x: 10, y: 10 });
    expect(b.x - a.x).toBeCloseTo(40, 9);
    expect(b.y - a.y).toBeCloseTo(-25, 9);
  });

  it('Einpassen berücksichtigt die Stauchung und behält den Kippwinkel', () => {
    const f = fitBBox({ minX: 0, minY: 0, maxX: 10, maxY: 40 }, size, undefined, 40, OBLIQUE_TILT_DEG);
    expect(f.tiltDeg).toBe(OBLIQUE_TILT_DEG);
    const a = worldToScreen(f, size, { x: 5, y: 0 });
    const b = worldToScreen(f, size, { x: 5, y: 40 });
    expect(b.y - a.y).toBeLessThanOrEqual(size.height - 80 + 1e-6);
    expect(b.y - a.y).toBeGreaterThan(size.height - 81);
  });

  it('ist eine reine Anzeige: Zeichenwerkzeug → Draufsicht, Schrägansicht → Auswahl', () => {
    const store = createEditorStore(() => 0);
    const { setSession } = store.getState();
    setSession({ tool: 'rect' });
    setSession({ viewport: { ...store.getState().session.viewport, tiltDeg: OBLIQUE_TILT_DEG } });
    expect(store.getState().session.tool).toBe('select');
    expect(store.getState().session.viewport.tiltDeg).toBe(OBLIQUE_TILT_DEG);
    // Zoomen/Verschieben bleibt schräg
    setSession({ viewport: { ...store.getState().session.viewport, pxPerMeter: 50 } });
    expect(store.getState().session.viewport.tiltDeg).toBe(OBLIQUE_TILT_DEG);
    setSession({ tool: 'hedge' });
    expect(store.getState().session.tool).toBe('hedge');
    expect(store.getState().session.viewport.tiltDeg).toBe(0);
  });
});
