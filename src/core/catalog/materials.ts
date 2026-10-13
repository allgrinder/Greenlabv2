import type { Material, MaterialId } from '../model/types';

/**
 * Materialkatalog. Farben aus dem Design (Gartenwerk.dc.html, Legende/Kostenübersicht).
 * Preise sind plausible Beispielwerte (netto), keine Marktpreise.
 */
export const MATERIALS: Material[] = [
  { id: 'lawn', name: 'Rollrasen', texture: 'lawn', baseColor: '#76863A', tileSizeM: 1, anchor: 'world', unit: 'm2', depthM: null, unitSizeM: null, price: 7.9 },
  { id: 'gravel', name: 'Kies 8/16, Jurakalk', texture: 'gravel', baseColor: '#D6CDBB', tileSizeM: 0.5, anchor: 'world', unit: 'm3', depthM: 0.08, unitSizeM: null, price: 68 },
  { id: 'paving', name: 'Terrassenplatten 80 × 40', texture: 'paving', baseColor: '#CFC3AE', tileSizeM: 1.6, anchor: 'object', unit: 'pcs', depthM: null, unitSizeM: { w: 0.8, d: 0.4 }, price: 20.48 },
  { id: 'wood', name: 'Holzdeck Lärche', texture: 'wood', baseColor: '#B78C61', tileSizeM: 1.2, anchor: 'object', unit: 'm2', depthM: null, unitSizeM: null, price: 119 },
  { id: 'mulch', name: 'Mulch, Holzhäcksel', texture: 'mulch', baseColor: '#6E533F', tileSizeM: 0.6, anchor: 'world', unit: 'm3', depthM: 0.07, unitSizeM: null, price: 49 },
  { id: 'barkMulch', name: 'Rindenmulch', texture: 'barkMulch', baseColor: '#4E3A2C', tileSizeM: 0.6, anchor: 'world', unit: 'm3', depthM: 0.07, unitSizeM: null, price: 55 },
  { id: 'soil', name: 'Erde / Beet', texture: 'soil', baseColor: '#7A604A', tileSizeM: 0.8, anchor: 'world', unit: 'm3', depthM: 0.3, unitSizeM: null, price: 38 },
  { id: 'basalt', name: 'Basaltsplitt 16/32, anthrazit', texture: 'basalt', baseColor: '#3A3C3E', tileSizeM: 0.8, anchor: 'world', unit: 'm3', depthM: 0.06, unitSizeM: null, price: 145 },
  { id: 'slabs', name: 'Betonplatten 120 × 60, hellgrau', texture: 'slabs', baseColor: '#C6C2BA', tileSizeM: 2.4, anchor: 'object', unit: 'pcs', depthM: null, unitSizeM: { w: 1.2, d: 0.6 }, price: 46 },
  { id: 'meadow', name: 'Blumenwiese, heimische Wildblumen', texture: 'meadow', baseColor: '#8E9A4E', tileSizeM: 2, anchor: 'world', unit: 'm2', depthM: null, unitSizeM: null, price: 4.6 },
  { id: 'sand', name: 'Spielsand 0/2', texture: 'sand', baseColor: '#D8C7A0', tileSizeM: 1, anchor: 'world', unit: 'm3', depthM: 0.3, unitSizeM: null, price: 52 },
  // Trittplatten 85 × 40 im Schrittmaß 58 cm auf einem 90 cm breiten Weg: eine Platte je 0,52 m² Wegfläche
  { id: 'stepping', name: 'Trittplatten Beton 85 × 40', texture: 'stepping', baseColor: '#ABA59B', tileSizeM: 0.6, anchor: 'world', unit: 'pcs', depthM: null, unitSizeM: { w: 0.58, d: 0.9 }, price: 29 },
  { id: 'herringbone', name: 'Betonpflaster 20 × 10, Fischgrät, grau meliert', texture: 'herringbone', baseColor: '#A19E97', tileSizeM: 1.4142, anchor: 'object', unit: 'm2', depthM: null, unitSizeM: { w: 0.2, d: 0.1 }, price: 34 },
  { id: 'granite', name: 'Granit-Kleinpflaster 9/11, Segmentbogen, grau-bunt', texture: 'granite', baseColor: '#8E8A85', tileSizeM: 3, anchor: 'object', unit: 'm2', depthM: null, unitSizeM: { w: 0.1, d: 0.1 }, price: 72 },
  { id: 'flagstone', name: 'Polygonalplatten Quarzit, beige-grau', texture: 'flagstone', baseColor: '#B0A693', tileSizeM: 2, anchor: 'object', unit: 'm2', depthM: null, unitSizeM: null, price: 89 },
  { id: 'grassPaver', name: 'Rasengitterstein 60 × 40, Beton grau', texture: 'grassPaver', baseColor: '#7F8A5A', tileSizeM: 2.4, anchor: 'object', unit: 'm2', depthM: null, unitSizeM: { w: 0.6, d: 0.4 }, price: 26 },
  { id: 'water', name: 'Wasserfläche', texture: 'water', baseColor: '#6E9AA0', tileSizeM: 2, anchor: 'world', unit: 'm2', depthM: null, unitSizeM: null, price: 196.8 },
];

const BY_ID = new Map(MATERIALS.map((m) => [m.id, m]));

/** Auswahl je Objektart in den Eigenschaften (Wasser bei Wegen: Bachläufe) */
export const PATH_MATERIALS = ['gravel', 'basalt', 'paving', 'slabs', 'herringbone', 'granite', 'flagstone', 'grassPaver', 'stepping', 'wood', 'mulch', 'barkMulch', 'soil', 'water'];
export const AREA_MATERIALS = ['lawn', 'meadow', 'gravel', 'basalt', 'paving', 'slabs', 'herringbone', 'granite', 'flagstone', 'grassPaver', 'wood', 'sand', 'mulch', 'barkMulch', 'soil', 'water'];
/** Abdeckung zwischen den Pflanzen einer Rabatte */
export const MULCH_MATERIALS = ['barkMulch', 'mulch', 'gravel', 'basalt', 'soil'];

export function getMaterial(id: MaterialId): Material {
  const m = BY_ID.get(id);
  if (!m) throw new Error(`Unbekanntes Material: ${id}`);
  return m;
}
