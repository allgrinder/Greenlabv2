import type { CatalogItem } from '../model/types';

/** Objektkatalog mit realen Maßen (m). Preise netto, Beispielwerte. */
export const ITEMS: CatalogItem[] = [
  { id: 'house', name: 'Wohnhaus', category: 'building', defaultLayer: 'build', width: 10, depth: 14, height: 7, symbol: 'house', creates: 'item', unit: 'pcs', price: 0 },
  { id: 'raised-bed-300x120', name: 'Hochbeet Lärche 300 × 120', category: 'raisedBed', defaultLayer: 'build', width: 3, depth: 1.2, height: 0.8, symbol: 'raisedBed', creates: 'item', unit: 'pcs', price: 289 },
  { id: 'shed-4x4', name: 'Gartenhaus 4 × 4 m', category: 'shed', defaultLayer: 'build', width: 4, depth: 4, height: 2.6, symbol: 'shed', creates: 'item', unit: 'pcs', price: 3900 },
  { id: 'terrace-wood', name: 'Terrasse, Holz', category: 'terrace', defaultLayer: 'areas', width: 4, depth: 3, height: 0, symbol: 'deck', creates: { area: 'wood' }, unit: 'm2', price: 0 },
  { id: 'pond', name: 'Teich', category: 'pond', defaultLayer: 'areas', width: 4, depth: 3, height: 0, symbol: 'pond', creates: { area: 'water' }, unit: 'm2', price: 0 },
  { id: 'pool-8x4', name: 'Pool 8 × 4 m', category: 'pool', defaultLayer: 'build', width: 8, depth: 4, height: 0, symbol: 'pool', creates: 'item', unit: 'pcs', price: 18500 },
  { id: 'play-swing', name: 'Spielturm Lärche mit Schaukel', category: 'play', defaultLayer: 'build', width: 4.5, depth: 3, height: 3, symbol: 'play', creates: 'item', unit: 'pcs', price: 1290 },
  { id: 'table-6', name: 'Tisch mit 6 Stühlen', category: 'furniture', defaultLayer: 'build', width: 2.6, depth: 3.6, height: 0.75, symbol: 'table', creates: 'item', unit: 'pcs', price: 1450 },
  { id: 'lounger', name: 'Liege', category: 'furniture', defaultLayer: 'build', width: 2.3, depth: 0.75, height: 0.4, symbol: 'lounger', creates: 'item', unit: 'pcs', price: 390 },
  { id: 'planter', name: 'Pflanzkübel Terrakotta', category: 'furniture', defaultLayer: 'build', width: 0.7, depth: 0.7, height: 0.6, symbol: 'planter', creates: 'item', unit: 'pcs', price: 120 },
  { id: 'fence-1m', name: 'Zaun, Lärche', category: 'fence', defaultLayer: 'build', width: 1, depth: 0.05, height: 1.2, symbol: 'fence', creates: 'item', unit: 'm', price: 64 },
  { id: 'greenhouse-4x3.5', name: 'Gewächshaus 4,0 × 3,5 m', category: 'greenhouse', defaultLayer: 'build', width: 4, depth: 3.5, height: 2.4, symbol: 'greenhouse', creates: 'item', unit: 'pcs', price: 2490 },
  { id: 'compost-2', name: 'Komposter, 2 Kammern', category: 'compost', defaultLayer: 'build', width: 1.75, depth: 2.5, height: 1, symbol: 'compost', creates: 'item', unit: 'pcs', price: 180 },
  { id: 'rain-barrel', name: 'Regentonne 300 l', category: 'compost', defaultLayer: 'build', width: 0.9, depth: 0.9, height: 1.1, symbol: 'barrel', creates: 'item', unit: 'pcs', price: 140 },
  { id: 'raised-bed-corten-300x100', name: 'Hochbeet Cortenstahl 300 × 100', category: 'raisedBed', defaultLayer: 'build', width: 3, depth: 1, height: 0.7, symbol: 'cortenBed', creates: 'item', unit: 'pcs', price: 640 },
  { id: 'office-pod', name: 'Homeoffice-Pod (Container 20 ft)', category: 'building', defaultLayer: 'build', width: 6.06, depth: 2.44, height: 2.6, symbol: 'container', creates: 'item', unit: 'pcs', price: 24900 },
  { id: 'pavilion-4x4', name: 'Pavillon mit Lamellendach 4 × 4 m', category: 'shed', defaultLayer: 'build', width: 4, depth: 4, height: 2.7, symbol: 'pergola', creates: 'item', unit: 'pcs', price: 8900 },
  { id: 'lounge-sofa', name: 'Loungesofa L-Form mit Tisch', category: 'furniture', defaultLayer: 'build', width: 2.8, depth: 2.2, height: 0.75, symbol: 'lounge', creates: 'item', unit: 'pcs', price: 2390 },
  { id: 'firepit-round', name: 'Feuerstelle rund mit Sesseln', category: 'furniture', defaultLayer: 'build', width: 5, depth: 5, height: 0.75, symbol: 'firepit', creates: 'item', unit: 'pcs', price: 3600 },
  { id: 'trampoline-ground', name: 'Bodentrampolin Ø 3 m', category: 'play', defaultLayer: 'build', width: 3, depth: 3, height: 0.06, symbol: 'trampoline', creates: 'item', unit: 'pcs', price: 990 },
  { id: 'gate-double', name: 'Gartentor zweiflüglig 2,2 m', category: 'fence', defaultLayer: 'build', width: 2.2, depth: 0.12, height: 1.4, symbol: 'gate', creates: 'item', unit: 'pcs', price: 1450 },
  { id: 'stone-wall-1m', name: 'Natursteinmauer, trocken', category: 'fence', defaultLayer: 'build', width: 1, depth: 0.45, height: 0.8, symbol: 'stoneWall', creates: 'item', unit: 'm', price: 260 },
  { id: 'basalt-boulders', name: 'Basalt-Findlinge, 3er-Gruppe', category: 'furniture', defaultLayer: 'build', width: 1.6, depth: 1.2, height: 0.7, symbol: 'basaltBoulders', creates: 'item', unit: 'pcs', price: 680 },
  { id: 'basalt-columns', name: 'Basaltstelen, 5er-Gruppe', category: 'furniture', defaultLayer: 'build', width: 1.0, depth: 0.8, height: 1.4, symbol: 'basaltColumns', creates: 'item', unit: 'pcs', price: 890 },
  { id: 'deck-bench', name: 'Einbaubank Lärche mit Pflanzkasten', category: 'furniture', defaultLayer: 'build', width: 3.2, depth: 0.55, height: 0.45, symbol: 'deckBench', creates: 'item', unit: 'pcs', price: 1680 },
  { id: 'edge.kantenstein-8x20', name: 'Kantenstein 8 × 20 × 100', category: 'edging', defaultLayer: 'paths', width: 1, depth: 0.08, height: 0.2, symbol: 'edge', creates: 'item', unit: 'm', price: 6.4 },
];

const BY_ID = new Map(ITEMS.map((i) => [i.id, i]));

export function getItem(id: string): CatalogItem {
  const it = BY_ID.get(id);
  if (!it) throw new Error(`Unbekanntes Katalogobjekt: ${id}`);
  return it;
}
