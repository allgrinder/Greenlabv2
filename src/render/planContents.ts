/** Inhalte eines Gartens für das Vorladen: Pflanzenarten und Katalogobjekte */
import { getSpecies } from '../core/catalog/plants';
import { getItem } from '../core/catalog/items';
import type { Project } from '../core/model/types';

/** alle Pflanzenarten eines Gartens */
export function speciesOf(doc: Project) {
  const ids = new Set(Object.values(doc.objects).flatMap((o) => ('speciesId' in o ? [o.speciesId] : o.type === 'planting' ? o.mix.map((m) => m.speciesId) : o.type === 'scatter' ? o.plants.map((p) => p.speciesId) : [])));
  return [...ids].map((id) => getSpecies(id));
}

/** Katalogobjekte eines Gartens mit Drehung (für das Vorladen ihrer Bilder) */
export function itemsOf(doc: Project) {
  return Object.values(doc.objects).flatMap((o) => {
    if (o.type !== 'item') return [];
    try {
      return [{ symbol: getItem(o.catalogId).symbol, rotationDeg: o.rotationDeg }];
    } catch {
      return [];
    }
  });
}
