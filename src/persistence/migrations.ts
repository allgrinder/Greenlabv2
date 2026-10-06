import { SCHEMA_VERSION, type Project } from '../core/model/types';

/**
 * Migrationskette: jede Funktion hebt ein Projekt von Version n auf n+1.
 * Läuft beim Laden aus der DB und beim JSON-Import.
 */
const STEPS: Record<number, (p: Record<string, unknown>) => Record<string, unknown>> = {
  // 1 → 2: kommt mit der Bewässerungsebene (Phase 2)
};

export function migrate(raw: unknown): Project {
  let p = raw as Record<string, unknown>;
  let v = typeof p.schemaVersion === 'number' ? p.schemaVersion : 1;
  if (v > SCHEMA_VERSION) throw new Error(`Projekt stammt aus einer neueren Gartenwerk-Version (Schema ${v}).`);
  while (v < SCHEMA_VERSION) {
    const step = STEPS[v];
    if (!step) throw new Error(`Keine Migration von Schema ${v}`);
    p = step(p);
    v++;
    p.schemaVersion = v;
  }
  return p as unknown as Project;
}
