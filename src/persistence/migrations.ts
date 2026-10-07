import { defaultZones } from '../core/model/defaults';
import { SCHEMA_VERSION, type Project } from '../core/model/types';

/**
 * Migrationskette: jede Funktion hebt ein Projekt von Version n auf n+1.
 * Läuft beim Laden aus der DB und beim JSON-Import.
 */
const STEPS: Record<number, (p: Record<string, unknown>) => Record<string, unknown>> = {
  // 1 → 2: Bewässerungszonen; neue Objekttypen brauchen keine Umwandlung
  1: (p) => ({ ...p, zones: Array.isArray(p.zones) ? p.zones : defaultZones() }),
  // 2 → 3: Blickpunkte für die Einsehbarkeit; Spalier und Pflanzgruppen sind neue Objekttypen
  2: (p) => ({ ...p, observers: Array.isArray(p.observers) ? p.observers : [] }),
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
