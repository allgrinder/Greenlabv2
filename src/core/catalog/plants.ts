import type { PlantSpecies } from '../model/types';

type Ph = PlantSpecies['phenology'][number];
const year = (spec: string): Ph[] =>
  spec.split('').map((c) => ({ b: 'bare', l: 'leaf', f: 'bloom', r: 'fruit', a: 'autumn' })[c] as Ph);

/**
 * Pflanzenkatalog (Auszug). Endgrößen und Zuwachs sind typische Richtwerte.
 * Farben aus GardenPlan.dc.html (Jahreszeiten-Tabelle) bzw. Bibliothek.
 */
export const PLANTS: PlantSpecies[] = [
  // Bäume
  { id: 'tilia-cordata', name: 'Winterlinde', latin: 'Tilia cordata', kind: 'tree', diameterPlanted: 4, diameterMature: 15, heightMature: 20, growthPerYear: 0.4, sun: 'full-partial', deciduous: true, colors: { summer: '#6D8656', spring: '#97AE68', autumn: '#C69442', winter: '#7A6E5E' }, phenology: year('bbblfllllabb'), price: 690 },
  { id: 'amelanchier-lamarckii', name: 'Felsenbirne', latin: 'Amelanchier lamarckii', kind: 'tree', diameterPlanted: 1.5, diameterMature: 5, heightMature: 6, growthPerYear: 0.3, sun: 'full-partial', deciduous: true, colors: { summer: '#86A062', spring: '#B5C78A', autumn: '#C4553A', winter: '#7A6E5E', bloom: '#F3E9EC' }, phenology: year('bbbfllrllaab'), price: 89 },
  { id: 'malus-topaz', name: 'Apfel ›Topaz‹', latin: 'Malus domestica ›Topaz‹', kind: 'tree', diameterPlanted: 1.5, diameterMature: 7, heightMature: 5, growthPerYear: 0.35, sun: 'full', deciduous: true, colors: { summer: '#7C935F', spring: '#AEBF8B', autumn: '#B48743', winter: '#7A6E5E', bloom: '#F7EEF0' }, phenology: year('bbbflllrrabb'), price: 189 },
  { id: 'prunus-serrulata', name: 'Zierkirsche', latin: 'Prunus serrulata', kind: 'tree', diameterPlanted: 1.7, diameterMature: 8, heightMature: 7, growthPerYear: 0.4, sun: 'full', deciduous: true, colors: { summer: '#738B58', spring: '#E6C3CB', autumn: '#B5553A', winter: '#7A6E5E', bloom: '#FBF1F3' }, phenology: year('bbbflllllabb'), price: 189 },
  { id: 'acer-campestre', name: 'Feldahorn', latin: 'Acer campestre', kind: 'tree', diameterPlanted: 2, diameterMature: 10, heightMature: 12, growthPerYear: 0.4, sun: 'full-partial', deciduous: true, colors: { summer: '#6D8656', autumn: '#D0A23E', winter: '#7A6E5E' }, phenology: year('bbbllllllabb'), price: 240 },
  { id: 'acer-globosum', name: 'Kugelahorn', latin: 'Acer platanoides ›Globosum‹', kind: 'tree', diameterPlanted: 1.5, diameterMature: 5, heightMature: 5, growthPerYear: 0.2, sun: 'full', deciduous: true, colors: { summer: '#7E9A5C', autumn: '#D6A83E', winter: '#7A6E5E' }, phenology: year('bbbllllllabb'), price: 260 },
  // Sträucher
  { id: 'hydrangea', name: 'Hortensie', latin: 'Hydrangea macrophylla', kind: 'shrub', diameterPlanted: 0.6, diameterMature: 1.5, heightMature: 1.5, growthPerYear: 0.2, sun: 'partial', deciduous: true, colors: { summer: '#7E9A6A', autumn: '#A3583A', winter: '#7E806C', bloom: '#A9B7D8' }, phenology: year('bbblllffflab'), price: 34 },
  { id: 'viburnum', name: 'Schneeball', latin: 'Viburnum opulus', kind: 'shrub', diameterPlanted: 0.8, diameterMature: 2.6, heightMature: 3, growthPerYear: 0.3, sun: 'full-partial', deciduous: true, colors: { summer: '#6E8762', autumn: '#A3583A', winter: '#7E806C', bloom: '#F4F1E6' }, phenology: year('bbblfllrrabb'), price: 34 },
  { id: 'buxus', name: 'Buchs', latin: 'Buxus sempervirens', kind: 'shrub', diameterPlanted: 0.3, diameterMature: 1, heightMature: 1, growthPerYear: 0.08, sun: 'full-partial', deciduous: false, colors: { summer: '#4F6B45' }, phenology: year('llllllllllll'), price: 19 },
  { id: 'syringa', name: 'Flieder', latin: 'Syringa vulgaris', kind: 'shrub', diameterPlanted: 0.8, diameterMature: 3, heightMature: 4, growthPerYear: 0.3, sun: 'full', deciduous: true, colors: { summer: '#6E8762', bloom: '#8E8FB0', winter: '#7E806C' }, phenology: year('bbbfflllllab'), price: 39 },
  // Stauden & Gräser
  { id: 'geranium', name: 'Storchschnabel', latin: 'Geranium ›Rozanne‹', kind: 'perennial', diameterPlanted: 0.3, diameterMature: 0.6, heightMature: 0.4, growthPerYear: 0.2, sun: 'full-partial', deciduous: true, colors: { summer: '#C98AA6', spring: '#8FA56C', autumn: '#B4683F', winter: '#8E7F6E' }, phenology: year('bbblffffflbb'), price: 5.4 },
  { id: 'salvia', name: 'Salbei', latin: 'Salvia nemorosa', kind: 'perennial', diameterPlanted: 0.3, diameterMature: 0.5, heightMature: 0.5, growthPerYear: 0.15, sun: 'full', deciduous: true, colors: { summer: '#7466A6', spring: '#7E9466', autumn: '#6F6A60', winter: '#8B8172' }, phenology: year('bbbllfffllbb'), price: 5.4 },
  { id: 'stipa', name: 'Federgras', latin: 'Stipa tenuissima', kind: 'grass', diameterPlanted: 0.3, diameterMature: 0.6, heightMature: 0.6, growthPerYear: 0.2, sun: 'full', deciduous: false, colors: { summer: '#CBBE8F', spring: '#A3B37E', autumn: '#D5B97F', winter: '#CFC19E' }, phenology: year('llllffflllll'), price: 5.4 },
  { id: 'lavandula', name: 'Lavendel', latin: 'Lavandula angustifolia', kind: 'perennial', diameterPlanted: 0.3, diameterMature: 0.6, heightMature: 0.5, growthPerYear: 0.15, sun: 'full', deciduous: false, colors: { summer: '#8C7DB8', spring: '#9AA88A', winter: '#8B8172' }, phenology: year('lllllfflllll'), price: 5.9 },
  { id: 'sedum', name: 'Fetthenne', latin: 'Sedum telephium', kind: 'perennial', diameterPlanted: 0.3, diameterMature: 0.5, heightMature: 0.5, growthPerYear: 0.15, sun: 'full', deciduous: true, colors: { summer: '#AAB98F', spring: '#9BAF85', autumn: '#A4504A', winter: '#7A5A4C' }, phenology: year('bbblllllffbb'), price: 5.4 },
  { id: 'allium', name: 'Zierlauch', latin: 'Allium ›Purple Sensation‹', kind: 'perennial', diameterPlanted: 0.2, diameterMature: 0.3, heightMature: 0.8, growthPerYear: 0.1, sun: 'full', deciduous: true, colors: { summer: '#9A86C2', spring: '#A27FB8', autumn: '#8E7D62', winter: '#8C8273' }, phenology: year('bbblffllbbbb'), price: 1.9 },
  // Gemüse & Kräuter
  { id: 'tomato', name: 'Tomate', latin: 'Solanum lycopersicum', kind: 'vegetable', diameterPlanted: 0.4, diameterMature: 0.6, heightMature: 1.8, growthPerYear: 0.6, sun: 'full', deciduous: true, colors: { summer: '#6F8F4E' }, phenology: year('bbbblllrrbbb'), price: 1.2 },
  { id: 'lettuce', name: 'Salat', latin: 'Lactuca sativa', kind: 'vegetable', diameterPlanted: 0.25, diameterMature: 0.3, heightMature: 0.3, growthPerYear: 0.3, sun: 'full-partial', deciduous: true, colors: { summer: '#A9C47A' }, phenology: year('bbblllllllbb'), price: 1.2 },
  { id: 'herbs', name: 'Kräuter', latin: 'Herbae', kind: 'vegetable', diameterPlanted: 0.25, diameterMature: 0.4, heightMature: 0.4, growthPerYear: 0.2, sun: 'full', deciduous: true, colors: { summer: '#93A07E' }, phenology: year('bbblllllllbb'), price: 1.2 },
  { id: 'pumpkin', name: 'Kürbis', latin: 'Cucurbita pepo', kind: 'vegetable', diameterPlanted: 0.5, diameterMature: 2, heightMature: 0.5, growthPerYear: 1.5, sun: 'full', deciduous: true, colors: { summer: '#8BA25E' }, phenology: year('bbbblllrrbbb'), price: 1.2 },
  // Hecken
  { id: 'carpinus-hedge', name: 'Hainbuchenhecke', latin: 'Carpinus betulus', kind: 'hedge', diameterPlanted: 0.8, diameterMature: 1.5, heightMature: 1.8, growthPerYear: 0.15, sun: 'full-partial', deciduous: true, colors: { summer: '#5B7350', spring: '#86A35F', autumn: '#A4813F', winter: '#957C59' }, phenology: year('aaalllllllaa'), price: 6.9 },
];

const BY_ID = new Map(PLANTS.map((p) => [p.id, p]));

export function getSpecies(id: string): PlantSpecies {
  const p = BY_ID.get(id);
  if (!p) throw new Error(`Unbekannte Pflanzenart: ${id}`);
  return p;
}

/**
 * Wachstumskurve Ø(t) = Ø₀ + (Ø_end − Ø₀) · (1 − e^(−t/k)), k = (Ø_end − Ø₀) / Zuwachs.
 * Anfangssteigung = Zuwachs pro Jahr, Grenzwert = Endgröße.
 */
export function diameterAfter(years: number, d0: number, dMax: number, growthPerYear: number): number {
  if (years <= 0 || dMax <= d0) return d0;
  const k = (dMax - d0) / growthPerYear;
  return d0 + (dMax - d0) * (1 - Math.exp(-years / k));
}
