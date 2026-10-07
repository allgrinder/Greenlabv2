import { describe, expect, it } from 'vitest';
import { lensShowsObject } from '../core/lens';
import { layerOfKind } from '../core/model/defaults';
import { newPath, newPlant } from '../core/model/factory';
import { createLindenweg12 } from '../core/sample/lindenweg12';
import { createCommands } from './commands';
import { createEditorStore } from './store';

function setup() {
  const store = createEditorStore(() => 0);
  store.getState().loadProject(createLindenweg12());
  return { store, cmd: createCommands(store), doc: () => store.getState().doc! };
}

const line = (x: number) => ({ nodes: [{ p: { x, y: 2 } }, { p: { x, y: 8 } }], closed: false }) as never;

describe('Ebenen wie in Photoshop', () => {
  it('neue Ebene wird aktiv, neue Objekte landen darin; automatisch wieder nach Art', () => {
    const { store, cmd, doc } = setup();
    const paths = layerOfKind(doc(), 'paths').id;
    const id = cmd.addLayer('Neue Wege', paths);
    expect(store.getState().session.activeLayerId).toBe(id);
    expect(doc().layerOrder.indexOf(id)).toBe(doc().layerOrder.indexOf(paths) + 1);
    expect(doc().layers[id]).toMatchObject({ name: 'Neue Wege', kind: 'custom', opacity: 1 });
    const p = newPath(doc(), line(5), 1, 'gravel');
    cmd.addObject(p);
    expect(doc().objects[p.id].layerId).toBe(id);
    expect(doc().layers[id].objectOrder).toEqual([p.id]);
    // Grundebene aktiv → weiter automatisch nach Art
    store.getState().setSession({ activeLayerId: layerOfKind(doc(), 'water').id });
    const q = newPath(doc(), line(6), 1, 'gravel');
    cmd.addObject(q);
    expect(doc().objects[q.id].layerId).toBe(paths);
    // gesperrte eigene Ebene nimmt nichts an
    cmd.setLayerLocked(id, true);
    store.getState().setSession({ activeLayerId: id });
    const r = newPath(doc(), line(7), 1, 'gravel');
    cmd.addObject(r);
    expect(doc().objects[r.id].layerId).toBe(paths);
  });

  it('Objekte innerhalb und zwischen Ebenen verschieben, ein Undo-Schritt', () => {
    const { store, cmd, doc } = setup();
    const paths = layerOfKind(doc(), 'areas');
    const [a, b] = paths.objectOrder;
    expect(paths.objectOrder.length).toBeGreaterThan(2);
    const before = [...paths.objectOrder];
    // a nach ganz oben (vorne)
    cmd.moveObject(a, paths.id, before.length);
    expect(doc().layers[paths.id].objectOrder).toEqual([...before.slice(1), a]);
    // wieder ganz nach unten
    cmd.moveObject(a, paths.id, 0);
    expect(doc().layers[paths.id].objectOrder).toEqual(before);
    // in eigene Ebene
    const own = cmd.addLayer('Bestand');
    cmd.moveObject(b, own, 0);
    expect(doc().objects[b].layerId).toBe(own);
    expect(doc().layers[own].objectOrder).toEqual([b]);
    expect(doc().layers[paths.id].objectOrder).not.toContain(b);
    store.getState().undo();
    expect(doc().objects[b].layerId).toBe(paths.id);
    expect(doc().layers[paths.id].objectOrder).toEqual(before);
  });

  it('umbenennen, Deckkraft (Geste = ein Schritt), löschen nur eigener Ebenen samt Inhalt', () => {
    const { store, cmd, doc } = setup();
    const own = cmd.addLayer('Entwurf');
    cmd.renameLayer(own, '  Variante A ');
    expect(doc().layers[own].name).toBe('Variante A');
    const steps = store.getState().history.past.length;
    cmd.setLayerOpacity(own, 0.8, 'op');
    cmd.setLayerOpacity(own, 0.4, 'op');
    cmd.setLayerOpacity(own, -1, 'op');
    expect(doc().layers[own].opacity).toBe(0);
    expect(store.getState().history.past.length).toBe(steps + 1);
    const t = newPlant(doc(), 'salvia', { x: 3, y: 3 });
    cmd.addObject(t);
    cmd.deleteLayer(own);
    expect(doc().layers[own]).toBeUndefined();
    expect(doc().objects[t.id]).toBeUndefined();
    expect(store.getState().session.activeLayerId).toBeNull();
    // Grundebenen bleiben
    const plants = layerOfKind(doc(), 'plants').id;
    cmd.deleteLayer(plants);
    expect(doc().layers[plants]).toBeDefined();
    store.getState().undo();
    expect(doc().objects[t.id]).toBeDefined();
  });

  it('eigene Ebenen folgen bei Linsen der Objektart', () => {
    expect(lensShowsObject('custom', { type: 'path' }, 'plan', false)).toBe(true);
    expect(lensShowsObject('custom', { type: 'sprinkler' }, 'plan', false)).toBe(false);
    expect(lensShowsObject('custom', { type: 'sprinkler' }, 'irrigation', false)).toBe(true);
    expect(lensShowsObject('water', { type: 'path' }, 'plan', false)).toBe(false);
  });
});
