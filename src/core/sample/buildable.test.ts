/**
 * Jeder Garten soll sich wie der Mustergarten bauen lassen: jedes Teil des Mustergartens muss über
 * Bibliothek, Werkzeuge und Eigenschaften erreichbar sein. Zufällige Details (Laub, Steine, Klee,
 * Gänseblümchen, Halme an Kanten) entstehen ohnehin je Fläche und brauchen keine eigenen Objekte.
 */
import { describe, expect, it } from 'vitest';
import { EDGINGS, getItem, LIBRARY_ITEMS } from '../catalog/items';
import { AREA_MATERIALS, MULCH_MATERIALS, PATH_MATERIALS } from '../catalog/materials';
import { getSpecies } from '../catalog/plants';
import { createMustergarten } from './mustergarten';

/** Pflanzenarten, die die Bibliothek zeigt (Abschnitte in ui/library/LibraryPanel.tsx); Hecken über das Heckenwerkzeug */
const LIBRARY_PLANT_KINDS = ['tree', 'shrub', 'espalier', 'perennial', 'grass', 'vegetable'];
const BED_KINDS = ['perennial', 'grass'];
const TOOL_TYPES = ['area', 'path', 'planting', 'plant', 'hedge', 'espalier', 'item', 'lamp', 'sprinkler', 'drip', 'pipe', 'text', 'dimension'];

describe('Mustergarten mit den Werkzeugen nachbaubar', () => {
  const doc = createMustergarten();
  const objects = Object.values(doc.objects);
  const library = new Set(LIBRARY_ITEMS.map((i) => i.id));
  const edgings = new Set(EDGINGS.map(([id]) => id));

  it('nur Objektarten, die ein Werkzeug anlegt', () => {
    for (const o of objects) expect(TOOL_TYPES, o.type).toContain(o.type);
  });

  it('Ausstattung und Bauten stehen in der Bibliothek', () => {
    for (const o of objects) if (o.type === 'item') expect(library.has(o.catalogId), `${o.catalogId} (${getItem(o.catalogId).name})`).toBe(true);
  });

  it('Gebäude sind in der Bibliothek', () => {
    expect(library.has('house')).toBe(true);
    expect(library.has('office-pod')).toBe(true);
  });

  it('Beläge, Abdeckungen und Einfassungen sind wählbar', () => {
    for (const o of objects) {
      if (o.type === 'area') expect(AREA_MATERIALS, o.name ?? o.id).toContain(o.materialId);
      if (o.type === 'path') expect(PATH_MATERIALS, o.name ?? o.id).toContain(o.materialId);
      if (o.type === 'planting' && o.mulchMaterialId) expect(MULCH_MATERIALS, o.name ?? o.id).toContain(o.mulchMaterialId);
      if ((o.type === 'area' || o.type === 'path' || o.type === 'planting') && o.edging) expect(edgings.has(o.edging.catalogId), o.edging.catalogId).toBe(true);
    }
  });

  it('Pflanzen und Rabatten-Mischungen kommen aus der Bibliothek', () => {
    for (const o of objects) {
      if (o.type === 'plant') expect(LIBRARY_PLANT_KINDS, o.speciesId).toContain(getSpecies(o.speciesId).kind);
      if (o.type === 'hedge') expect(o.speciesId).toBe('carpinus-hedge');
      if (o.type === 'planting') {
        for (const m of o.mix) expect(BED_KINDS, m.speciesId).toContain(getSpecies(m.speciesId).kind);
        // Regler „Pflanzdichte“ in der Rabatte: 3–14 je m²
        expect(o.perSquareMeter).toBeGreaterThanOrEqual(3);
        expect(o.perSquareMeter).toBeLessThanOrEqual(14);
      }
    }
  });
});
