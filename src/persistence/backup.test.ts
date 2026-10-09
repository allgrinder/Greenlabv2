import { describe, expect, it } from 'vitest';
import { createProject } from '../core/model/defaults';
import { backupDue, exportBackup, isBackup, restoreBackup } from './backup';

const mk = (name: string) => createProject({ name, plot: { kind: 'rect', width: 10, depth: 20 } });
const noBlob = async () => undefined;

describe('Sicherung aller Gärten', () => {
  it('bündelt alle Projekte in einer Datei', async () => {
    const a = mk('A');
    const b = mk('B');
    const json = JSON.parse(await exportBackup([a, b], noBlob, new Date('2026-10-09T10:00:00Z')));
    expect(isBackup(json)).toBe(true);
    expect(json.projects).toHaveLength(2);
    expect(json.createdAt).toBe('2026-10-09T10:00:00.000Z');
    expect(isBackup({ format: 'gartenwerk', project: a })).toBe(false);
  });

  it('Wiederherstellen: neue Gärten mit gleicher ID, gleicher Stand übersprungen, geänderter als Kopie', async () => {
    const a = mk('A');
    const b = mk('B');
    const c = mk('C');
    const file = JSON.parse(await exportBackup([a, b, c], noBlob));
    const existing = [
      { id: a.id, updatedAt: a.updatedAt }, // gleicher Stand
      { id: b.id, updatedAt: '2030-01-01T00:00:00.000Z' }, // hier anders weiterbearbeitet
    ];
    const r = await restoreBackup(file, existing);
    expect(r.skipped).toBe(1);
    expect(r.restored).toHaveLength(2);
    const byName = Object.fromEntries(r.restored.map((x) => [x.project.name, x.project]));
    expect(byName.C.id).toBe(c.id); // echte Wiederherstellung
    expect(byName.C.updatedAt).toBe(c.updatedAt);
    expect(byName.B.id).not.toBe(b.id); // Kopie, nichts wird überschrieben
  });

  it('Erinnerung: nie gesichert, oder Änderungen und Sicherung älter als 14 Tage', () => {
    const now = new Date('2026-10-09T12:00:00Z');
    expect(backupDue(null, null, now)).toBe(false);
    expect(backupDue('2026-10-09T10:00:00Z', null, now)).toBe(true);
    expect(backupDue('2026-10-01T10:00:00Z', '2026-10-02T10:00:00Z', now)).toBe(false); // nichts geändert seitdem
    expect(backupDue('2026-10-08T10:00:00Z', '2026-10-01T10:00:00Z', now)).toBe(false); // erst 8 Tage
    expect(backupDue('2026-10-08T10:00:00Z', '2026-09-20T10:00:00Z', now)).toBe(true);
  });
});
