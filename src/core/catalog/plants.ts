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
  { id: 'liquidambar', name: 'Amberbaum', latin: 'Liquidambar styraciflua', kind: 'tree', diameterPlanted: 1.5, diameterMature: 7, heightMature: 14, growthPerYear: 0.35, sun: 'full', deciduous: true, colors: { summer: '#5F7E4A', autumn: '#B2402E', winter: '#7A6E5E' }, phenology: year('bbbllllllaab'), price: 290 },
  { id: 'carpinus-betulus', name: 'Hainbuche', latin: 'Carpinus betulus', kind: 'tree', diameterPlanted: 1.5, diameterMature: 8, heightMature: 12, growthPerYear: 0.35, sun: 'full-partial', deciduous: true, colors: { summer: '#6B8A4A', spring: '#8DAA62', autumn: '#C49A45', winter: '#7A6E5E' }, phenology: year('bbbllllllabb'), price: 220 },
  // Sträucher
  { id: 'spiraea', name: 'Prachtspiere', latin: 'Spiraea × vanhouttei', kind: 'shrub', diameterPlanted: 0.6, diameterMature: 2, heightMature: 2, growthPerYear: 0.3, sun: 'full-partial', deciduous: true, colors: { summer: '#7A9467', autumn: '#B68A4A', winter: '#7E7466', bloom: '#F6F3EA' }, phenology: year('bbblfllllabb'), price: 19 },
  { id: 'cornus', name: 'Hartriegel', latin: 'Cornus alba ›Sibirica‹', kind: 'shrub', diameterPlanted: 0.6, diameterMature: 2, heightMature: 2.5, growthPerYear: 0.3, sun: 'full-partial', deciduous: true, colors: { summer: '#6E8A58', autumn: '#A2443A', winter: '#A8402E', bloom: '#EFEADB' }, phenology: year('bbbllfllaabb'), price: 22 },
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
  { id: 'echinacea', name: 'Sonnenhut', latin: 'Echinacea purpurea', kind: 'perennial', diameterPlanted: 0.3, diameterMature: 0.5, heightMature: 0.9, growthPerYear: 0.15, sun: 'full', deciduous: true, colors: { summer: '#C8678F', spring: '#7E9466', autumn: '#7A5A44', winter: '#6E5A48', bloom: '#C8678F' }, phenology: year('bbblllfffabb'), price: 5.9 },
  { id: 'rudbeckia', name: 'Gelber Sonnenhut', latin: 'Rudbeckia fulgida ›Goldsturm‹', kind: 'perennial', diameterPlanted: 0.3, diameterMature: 0.5, heightMature: 0.7, growthPerYear: 0.15, sun: 'full', deciduous: true, colors: { summer: '#E2B23A', spring: '#7E9466', autumn: '#8C6A3A', winter: '#5E4A38', bloom: '#E2B23A' }, phenology: year('bbbllllfffbb'), price: 5.4 },
  { id: 'nepeta', name: 'Katzenminze', latin: 'Nepeta × faassenii', kind: 'perennial', diameterPlanted: 0.3, diameterMature: 0.6, heightMature: 0.4, growthPerYear: 0.2, sun: 'full', deciduous: true, colors: { summer: '#8E8CC4', spring: '#93A48A', autumn: '#8A8E80', winter: '#8B8172', bloom: '#8E8CC4' }, phenology: year('bbblffffflbb'), price: 4.9 },
  { id: 'achillea', name: 'Schafgarbe', latin: 'Achillea millefolium', kind: 'perennial', diameterPlanted: 0.3, diameterMature: 0.5, heightMature: 0.7, growthPerYear: 0.15, sun: 'full', deciduous: true, colors: { summer: '#EAD9A6', spring: '#8FA56C', autumn: '#9C8B62', winter: '#8B8172', bloom: '#F1E3B8' }, phenology: year('bbbllffflbbb'), price: 4.9 },
  { id: 'anemone', name: 'Herbst-Anemone', latin: 'Anemone hupehensis', kind: 'perennial', diameterPlanted: 0.3, diameterMature: 0.6, heightMature: 0.9, growthPerYear: 0.15, sun: 'partial', deciduous: true, colors: { summer: '#6E8A55', spring: '#7E9466', autumn: '#E6B7CB', winter: '#7A6A58', bloom: '#E6B7CB' }, phenology: year('bbblllllffbb'), price: 6.4 },
  { id: 'perovskia', name: 'Blauraute', latin: 'Perovskia atriplicifolia', kind: 'perennial', diameterPlanted: 0.4, diameterMature: 0.8, heightMature: 1.0, growthPerYear: 0.25, sun: 'full', deciduous: true, colors: { summer: '#8E9AB8', spring: '#98A592', autumn: '#A4A6A0', winter: '#B4AFA2', bloom: '#8E9AC8' }, phenology: year('bbbllllfffbb'), price: 6.9 },
  { id: 'hakonechloa', name: 'Japanisches Berggras', latin: 'Hakonechloa macra', kind: 'grass', diameterPlanted: 0.3, diameterMature: 0.6, heightMature: 0.4, growthPerYear: 0.15, sun: 'partial', deciduous: true, colors: { summer: '#7FA046', spring: '#93B356', autumn: '#C08A3E', winter: '#B9A27A' }, phenology: year('bbbllllllabb'), price: 7.9 },
  { id: 'pennisetum', name: 'Lampenputzergras', latin: 'Pennisetum alopecuroides', kind: 'grass', diameterPlanted: 0.4, diameterMature: 0.8, heightMature: 0.8, growthPerYear: 0.2, sun: 'full', deciduous: true, colors: { summer: '#8EA066', spring: '#9CAE78', autumn: '#C9A86A', winter: '#CDB98E' }, phenology: year('bbbllllffaab'), price: 6.9 },
  { id: 'calamagrostis', name: 'Reitgras', latin: 'Calamagrostis × acutiflora ›Karl Foerster‹', kind: 'grass', diameterPlanted: 0.3, diameterMature: 0.6, heightMature: 1.5, growthPerYear: 0.2, sun: 'full', deciduous: true, colors: { summer: '#A3A46A', spring: '#8FA56C', autumn: '#CDB27A', winter: '#D2C095' }, phenology: year('bbbllffllaaa'), price: 6.9 },
  // Spalierbäume (Sichtschutz, Fertigspaliere mit Stamm und Schirm)
  { id: 'photinia-espalier', name: 'Glanzmispel-Spalier ›Red Robin‹', latin: 'Photinia × fraseri ›Red Robin‹', kind: 'espalier', diameterPlanted: 1.2, diameterMature: 1.6, heightMature: 3.8, growthPerYear: 0.1, sun: 'full-partial', deciduous: false, colors: { summer: '#5E7438', spring: '#B4553A', autumn: '#5A6E36', winter: '#566A36' }, phenology: year('llllflllllll'), price: 389 },
  { id: 'laurocerasus-espalier', name: 'Kirschlorbeer-Spalier', latin: 'Prunus laurocerasus', kind: 'espalier', diameterPlanted: 1.2, diameterMature: 1.6, heightMature: 3.6, growthPerYear: 0.12, sun: 'full-partial', deciduous: false, colors: { summer: '#3F5F2E', spring: '#5B7A3A' }, phenology: year('llllflllllll'), price: 349 },
  { id: 'quercus-ilex-espalier', name: 'Steineichen-Spalier', latin: 'Quercus ilex', kind: 'espalier', diameterPlanted: 1.2, diameterMature: 1.5, heightMature: 4, growthPerYear: 0.08, sun: 'full', deciduous: false, colors: { summer: '#4D5D3E', spring: '#7A8A55' }, phenology: year('llllllllllll'), price: 590 },
  { id: 'ligustrum-espalier', name: 'Liguster-Spalier', latin: 'Ligustrum ovalifolium', kind: 'espalier', diameterPlanted: 1.2, diameterMature: 1.5, heightMature: 3.5, growthPerYear: 0.12, sun: 'full-partial', deciduous: false, colors: { summer: '#5C7A3C', winter: '#5E7240' }, phenology: year('llllllfllllll'), price: 289 },
  { id: 'carpinus-espalier', name: 'Hainbuchen-Spalier', latin: 'Carpinus betulus', kind: 'espalier', diameterPlanted: 1.2, diameterMature: 1.6, heightMature: 4, growthPerYear: 0.12, sun: 'full-partial', deciduous: true, marcescent: true, colors: { summer: '#6B8A4A', spring: '#8DAA62', autumn: '#B88D45', winter: '#A8835A' }, phenology: year('aaalllllllaa'), price: 329 },
  { id: 'tilia-espalier', name: 'Linden-Spalier', latin: 'Tilia × europaea ›Pallida‹', kind: 'espalier', diameterPlanted: 1.4, diameterMature: 1.8, heightMature: 4.2, growthPerYear: 0.12, sun: 'full-partial', deciduous: true, colors: { summer: '#6D8A4A', spring: '#97AE68', autumn: '#C99A3E', winter: '#7A6E5E' }, phenology: year('bbblfllllabb'), price: 469 },
  { id: 'platanus-roof', name: 'Platanen-Dachspalier', latin: 'Platanus × hispanica', kind: 'espalier', diameterPlanted: 2, diameterMature: 2.5, heightMature: 2.6, growthPerYear: 0.15, sun: 'full', deciduous: true, colors: { summer: '#6B8A4C', spring: '#91AD66', autumn: '#B48A45', winter: '#8A7B66' }, phenology: year('bbblllllllab'), price: 690 },
  { id: 'malus-espalier', name: 'Apfel-Spalier', latin: 'Malus domestica', kind: 'espalier', diameterPlanted: 1.2, diameterMature: 1.6, heightMature: 2.2, growthPerYear: 0.1, sun: 'full', deciduous: true, colors: { summer: '#7C935F', spring: '#AEBF8B', autumn: '#B48743', winter: '#7A6E5E', bloom: '#F7EEF0' }, phenology: year('bbbflllrrabb'), price: 159 },
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
