import { describe, expect, it } from 'vitest';
import { createLindenweg12 } from '../core/sample/lindenweg12';
import { exportProject, importProject } from './jsonIO';
import { migrate } from './migrations';

describe('JSON-Import/-Export', () => {
  it('Rundreise: Export → Import ergibt dasselbe Projekt mit neuer ID', async () => {
    const p = createLindenweg12();
    const text = await exportProject(p, async () => undefined);
    const { project } = await importProject(text);
    expect(project.id).not.toBe(p.id);
    expect({ ...project, id: '', updatedAt: '' }).toEqual({ ...p, id: '', updatedAt: '' });
  });

  it('lehnt fremde Dateien mit verständlicher Meldung ab', async () => {
    await expect(importProject('nicht json')).rejects.toThrow('kein gültiges JSON');
    await expect(importProject(JSON.stringify({ format: 'anderes' }))).rejects.toThrow('Keine gültige Gartenwerk-Datei');
  });

  it('repariert verwaiste Verweise zwischen Ebenen und Objekten', async () => {
    const p = createLindenweg12();
    const [someId] = Object.keys(p.objects);
    const layer = p.layers[p.objects[someId].layerId];
    layer.objectOrder = layer.objectOrder.filter((x) => x !== someId); // Objekt fehlt in der Reihenfolge
    layer.objectOrder.push('gibt-es-nicht'); // Verweis ins Leere
    const text = JSON.stringify({ format: 'gartenwerk', schemaVersion: 1, project: p });
    const { project } = await importProject(text);
    const l = project.layers[layer.id];
    expect(l.objectOrder).toContain(someId);
    expect(l.objectOrder).not.toContain('gibt-es-nicht');
  });

  it('neuere Schema-Version wird abgelehnt', () => {
    expect(() => migrate({ schemaVersion: 99 })).toThrow('neueren');
  });
});
