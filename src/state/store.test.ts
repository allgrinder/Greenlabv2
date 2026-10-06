import { describe, expect, it } from 'vitest';
import { objectBase } from '../core/model/defaults';
import type { AreaObject, PathObject, Project } from '../core/model/types';
import { createLindenweg12 } from '../core/sample/lindenweg12';
import { createCommands } from './commands';
import { createEditorStore } from './store';

/** Vergleich ohne Zeitstempel */
const strip = (p: Project | null) => (p ? { ...p, updatedAt: '' } : null);

function setup() {
  const store = createEditorStore(() => 0);
  const doc = createLindenweg12();
  store.getState().loadProject(doc);
  return { store, cmd: createCommands(store), doc };
}

const byName = (p: Project, n: string) => Object.values(p.objects).find((o) => o.name === n)!;

describe('Undo/Redo über Immer-Patches', () => {
  it('jeder Command: apply → undo = Ausgangszustand, redo = Ergebnis', () => {
    const { store, cmd } = setup();
    const terr = byName(store.getState().doc!, 'Terrasse');
    const weg = byName(store.getState().doc!, 'Kiesweg');
    const layerId = store.getState().doc!.layerOrder[1];
    const runs: (() => void)[] = [
      () => cmd.moveObjects([terr.id], { x: 1, y: 2 }),
      () => cmd.setNode(weg.id, 1, { x: 28, y: 19 }),
      () => cmd.setNode(terr.id, 2, { x: 17, y: 22 }), // Rechteck → Pfad
      () => cmd.insertNode(weg.id, 0, { x: 20, y: 16 }),
      () => cmd.deleteNode(weg.id, 1),
      () => cmd.deleteObjects([terr.id, weg.id]),
      () => cmd.duplicateObjects([terr.id]),
      () => cmd.updateObject<PathObject>(weg.id, 'Breite', (o) => void (o.width = 2)),
      () => cmd.setLayerVisible(layerId, false),
      () => cmd.setLayerLocked(layerId, true),
      () => cmd.moveLayer(layerId, 5),
      () => cmd.reorderObject(terr.id, 'back'),
      () => cmd.setPlot({ kind: 'rect', width: 40, depth: 25 }),
      () => cmd.setPrice('mat:lawn', 9.5),
      () => cmd.updateSettings({ gridStepM: 0.1 }),
    ];
    for (const run of runs) {
      const before = strip(store.getState().doc);
      run();
      const after = strip(store.getState().doc);
      expect(after).not.toEqual(before);
      store.getState().undo();
      expect(strip(store.getState().doc)).toEqual(before);
      store.getState().redo();
      expect(strip(store.getState().doc)).toEqual(after);
      store.getState().undo();
    }
  });

  it('Ziehen mit mergeKey ergibt einen einzigen Undo-Schritt', () => {
    const { store, cmd } = setup();
    const terr = byName(store.getState().doc!, 'Terrasse') as AreaObject;
    const start = strip(store.getState().doc);
    for (let i = 0; i < 20; i++) cmd.moveObjects([terr.id], { x: 0.1, y: 0 }, 'gesture:1');
    store.getState().endGesture();
    cmd.moveObjects([terr.id], { x: 0.1, y: 0 }, 'gesture:1'); // neue Geste, gleicher Schlüssel
    expect(store.getState().history.past).toHaveLength(2);
    store.getState().undo();
    store.getState().undo();
    expect(strip(store.getState().doc)).toEqual(start);
  });

  it('neue Änderung verwirft Redo', () => {
    const { store, cmd } = setup();
    const terr = byName(store.getState().doc!, 'Terrasse');
    cmd.moveObjects([terr.id], { x: 1, y: 0 });
    store.getState().undo();
    expect(store.getState().history.future).toHaveLength(1);
    cmd.moveObjects([terr.id], { x: 0, y: 1 });
    expect(store.getState().history.future).toHaveLength(0);
  });

  it('Undo bereinigt die Auswahl', () => {
    const { store, cmd } = setup();
    const layerId = store.getState().doc!.layerOrder[1];
    const o: AreaObject = {
      ...objectBase(layerId),
      type: 'area',
      region: { outer: { kind: 'rect', center: { x: 5, y: 5 }, width: 2, depth: 2, rotationDeg: 0, cornerRadius: 0 }, holes: [] },
      materialId: 'lawn',
      edging: null,
    };
    cmd.addObject(o);
    expect(store.getState().session.selection).toEqual([o.id]);
    store.getState().undo();
    expect(store.getState().session.selection).toEqual([]);
  });

  it('unveränderte Objekte behalten ihre Referenz (Grundlage für inkrementelles Rendern)', () => {
    const { store, cmd } = setup();
    const before = store.getState().doc!.objects;
    const terr = byName(store.getState().doc!, 'Terrasse');
    cmd.moveObjects([terr.id], { x: 1, y: 0 });
    const after = store.getState().doc!.objects;
    const changed = Object.keys(after).filter((id) => after[id] !== before[id]);
    expect(changed).toEqual([terr.id]);
  });
});

describe('Boolesche Operationen', () => {
  const sq = (layerId: string, x: number, size: number): AreaObject => ({
    ...objectBase(layerId),
    type: 'area',
    region: { outer: { kind: 'rect', center: { x, y: 0 }, width: size, depth: size, rotationDeg: 0, cornerRadius: 0 }, holes: [] },
    materialId: 'lawn',
    edging: null,
  });

  it('Vereinigen entfernt die zweite Fläche; Abziehen erzeugt ein Loch; beides rückgängig machbar', () => {
    const { store, cmd } = setup();
    const layerId = store.getState().doc!.layerOrder[1];
    const a = sq(layerId, 100, 4);
    const b = sq(layerId, 102, 4);
    const c = sq(layerId, 100, 1);
    cmd.addObject(a);
    cmd.addObject(b);
    cmd.addObject(c);
    const before = strip(store.getState().doc);

    cmd.booleanOp([a.id, b.id], 'union');
    let d = store.getState().doc!;
    expect(d.objects[b.id]).toBeUndefined();
    expect(d.objects[a.id].type === 'area' && d.objects[a.id]).toBeTruthy();

    cmd.booleanOp([a.id, c.id], 'subtract');
    d = store.getState().doc!;
    const ra = (d.objects[a.id] as AreaObject).region;
    expect(ra.holes).toHaveLength(1);
    expect(d.objects[c.id]).toBeDefined(); // Abziehen behält das Werkzeug-Objekt

    store.getState().undo();
    store.getState().undo();
    expect(strip(store.getState().doc)).toEqual(before);
  });
});
