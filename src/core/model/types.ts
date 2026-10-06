/**
 * Gartenwerk – Datenmodell (Quelle der Wahrheit).
 *
 * Konventionen
 * - Weltkoordinaten in Metern, Fließkomma. x zeigt nach Osten (rechts), y nach Süden (unten),
 *   wenn nordAbweichung = 0 ist. Der Ursprung ist die erste Ecke des Grundstücks.
 * - Winkel werden in Grad gespeichert (UI-nah), intern in Radiant gerechnet.
 * - Abgeleitete Werte (Fläche, Umfang, Mengen, Kosten) werden NIE gespeichert, sondern
 *   in core/quantities aus der Geometrie berechnet.
 * - Das Projektdokument ist ein reiner, serialisierbarer Baum (JSON-fähig, keine Klassen),
 *   damit Immer-Patches, IndexedDB und JSON-Export ohne Mapping funktionieren.
 */

export type Id = string; // nanoid, 12 Zeichen
export type ISODate = string;

export interface Vec2 {
  x: number;
  y: number;
}

/* ------------------------------------------------------------------ */
/* Geometrie                                                           */
/* ------------------------------------------------------------------ */

/**
 * Knoten eines Pfads. `in`/`out` sind Bézier-Griffe RELATIV zum Knoten.
 * Fehlen beide, ist der Knoten eine Ecke (gerade Segmente).
 */
export interface PathNode {
  p: Vec2;
  in?: Vec2;
  out?: Vec2;
  /** gekoppelte Griffe (glatter Knoten) */
  smooth?: boolean;
}

/** Woher die Geometrie stammt. Steuert, welches Werkzeug sie bearbeitet. */
export type GeometrySource = 'rect' | 'polygon' | 'bezier' | 'freehand' | 'boolean';

/** Parametrisches Rechteck: Maße bleiben exakt editierbar. */
export interface RectGeometry {
  kind: 'rect';
  /** Mittelpunkt */
  center: Vec2;
  width: number;
  depth: number;
  rotationDeg: number;
  /** Eckradius, 0 = scharf */
  cornerRadius: number;
}

/** Allgemeiner Pfad (Polygon, Bézier, geglättete Freihandlinie). */
export interface PathGeometry {
  kind: 'path';
  nodes: PathNode[];
  closed: boolean;
  source: GeometrySource;
}

export type ShapeGeometry = RectGeometry | PathGeometry;

/** Geschlossene Form mit optionalen Löchern (Ergebnis von „Abziehen“). */
export interface Region {
  outer: ShapeGeometry;
  holes: PathGeometry[];
}

/* ------------------------------------------------------------------ */
/* Projekt                                                             */
/* ------------------------------------------------------------------ */

export const SCHEMA_VERSION = 1 as const;

export interface Project {
  schemaVersion: typeof SCHEMA_VERSION;
  id: Id;
  name: string; // „Garten Lindenweg 12“
  createdAt: ISODate;
  updatedAt: ISODate;

  site: Site;
  background: BackgroundImage | null;

  /** Reihenfolge = Zeichenreihenfolge (unten → oben) */
  layerOrder: Id[];
  layers: Record<Id, Layer>;
  objects: Record<Id, PlanObject>;

  /** projektbezogene Preise, überschreiben den Katalog (Phase 2: Kostenübersicht) */
  priceOverrides: Record<string, number>;
  settings: ProjectSettings;
}

export interface Site {
  plot: PlotSpec;
  /** aus `plot` berechnetes Polygon, gecacht für Snapping und Rendering */
  boundary: Vec2[];
  /** Abweichung von Plan-oben zu Nord, im Uhrzeigersinn. Design-Beispiel: −12° */
  northDeg: number;
  location: GeoLocation | null;
}

/** Wie das Grundstück angelegt wurde. Bleibt erhalten, damit Maße später editierbar sind. */
export type PlotSpec =
  | { kind: 'rect'; width: number; depth: number }
  | {
      kind: 'edges';
      /**
       * Kanten im Uhrzeigersinn ab Punkt A. Die letzte Kante wird berechnet (Schluss),
       * ihre Länge und ihr Winkel werden nur angezeigt.
       */
      edges: PlotEdge[];
    }
  | { kind: 'drawn'; points: Vec2[] };

export interface PlotEdge {
  length: number; // m
  /** Innenwinkel am Startpunkt dieser Kante, in Grad. Bei der ersten Kante: Richtung (0 = Osten). */
  angleDeg: number;
}

export interface GeoLocation {
  lat: number;
  lon: number;
  label: string; // „Lindenweg 12, Frankfurt“
  /** IANA-Zeitzone für SunCalc, z. B. Europe/Berlin */
  timeZone: string;
}

export interface BackgroundImage {
  /** Schlüssel im IndexedDB-Store `blobs` */
  blobId: Id;
  fileName: string;
  mime: string;
  pixelWidth: number;
  pixelHeight: number;
  /** Lage im Weltsystem: Bildpixel (0,0) liegt hier */
  origin: Vec2;
  metersPerPixel: number;
  rotationDeg: number;
  opacity: number; // 0..1, Design: 0,6
  visible: boolean;
  locked: boolean;
  calibration: Calibration | null;
}

export interface Calibration {
  /** zwei Punkte in BILDPIXELN */
  a: Vec2;
  b: Vec2;
  distanceM: number;
}

export interface ProjectSettings {
  gridStepM: 0.1 | 0.5 | 1;
  snapToGrid: boolean;
  snapToGeometry: boolean;
  /** Anzeige-Maßstab für Bemaßungen und Export, z. B. 100 für 1:100 */
  scaleDenominator: number;
  currency: 'EUR';
}

/* ------------------------------------------------------------------ */
/* Ebenen                                                              */
/* ------------------------------------------------------------------ */

/** Fachliche Ebenenart gemäß Design. Steuert Render-Layer und Standard-Zuordnung. */
export type LayerKind =
  | 'plot' // Grundstück
  | 'areas' // Flächen
  | 'paths' // Wege
  | 'plants' // Pflanzen
  | 'build' // Gebäude & Möbel
  | 'light' // Beleuchtung (Phase 2)
  | 'water' // Bewässerung (Phase 2)
  | 'pipes' // Leitungen
  | 'annotation'; // Bemaßung, Text

export interface Layer {
  id: Id;
  kind: LayerKind;
  name: string;
  color: string; // Swatch im Ebenen-Panel
  visible: boolean;
  locked: boolean;
  /** Zeichenreihenfolge der Objekte innerhalb der Ebene (unten → oben) */
  objectOrder: Id[];
}

/* ------------------------------------------------------------------ */
/* Objekte                                                             */
/* ------------------------------------------------------------------ */

interface ObjectBase {
  id: Id;
  layerId: Id;
  name: string | null; // null → Name aus Material/Katalog
  locked: boolean;
  hidden: boolean;
  /** Höhe der Oberkante über ±0,00, in m (Design: „Höhe ±0,00 m“) */
  elevation: number;
  notes: Note[];
}

export interface Note {
  id: Id;
  author: string; // Initialen, z. B. „MS“
  text: string;
  createdAt: ISODate;
}

/** Fläche mit Material: Rasen, Kies, Pflaster, Beet, Wasser … */
export interface AreaObject extends ObjectBase {
  type: 'area';
  region: Region;
  materialId: MaterialId;
  edging: Edging | null;
}

/** Weg-Werkzeug: Mittellinie + Breite. Die Fläche entsteht durch Offset. */
export interface PathObject extends ObjectBase {
  type: 'path';
  centerline: PathGeometry; // closed = false
  width: number; // m, Design: 1,20
  join: 'round' | 'miter';
  materialId: MaterialId;
  edging: Edging | null;
}

export interface Edging {
  catalogId: string; // z. B. „edge.kantenstein-8x20“
  sides: 'both' | 'left' | 'right' | 'outline';
}

/** Einzelpflanze (Baum, Strauch, Gemüse) */
export interface PlantObject extends ObjectBase {
  type: 'plant';
  speciesId: string;
  position: Vec2;
  /** Pflanzjahr; Wachstum wird relativ dazu berechnet */
  plantedYear: number;
  /** Ø bei Pflanzung, überschreibt Katalog (z. B. Bestandsbaum Linde Ø 10,4 m) */
  plantedDiameter: number | null;
}

/** Staudenpflanzung als Fläche mit Dichte („Stauden in Gruppen“) */
export interface PlantingObject extends ObjectBase {
  type: 'planting';
  region: Region;
  mix: { speciesId: string; share: number }[]; // share summiert sich zu 1
  perSquareMeter: number;
  mulchMaterialId: MaterialId | null;
}

/** Hecke entlang einer Linie */
export interface HedgeObject extends ObjectBase {
  type: 'hedge';
  centerline: PathGeometry;
  speciesId: string;
  plantedYear: number;
  /** Schnitthöhe, m */
  height: number;
  plantsPerMeter: number;
}

/** Katalogobjekt mit realen Maßen: Gartenhaus, Hochbeet, Möbel, Gewächshaus, Kompost … */
export interface ItemObject extends ObjectBase {
  type: 'item';
  catalogId: string;
  position: Vec2; // Mittelpunkt
  rotationDeg: number;
  /** überschreibt Katalogmaße, wenn gesetzt */
  size: { width: number; depth: number; height: number } | null;
}

export interface DimensionObject extends ObjectBase {
  type: 'dimension';
  a: DimensionAnchor;
  b: DimensionAnchor;
  /** Abstand der Maßlinie von der Messstrecke, m (Vorzeichen = Seite) */
  offset: number;
}

/** Freie Punkte oder Bindung an einen Objektknoten (Maß wandert mit) */
export type DimensionAnchor =
  | { kind: 'free'; p: Vec2 }
  | { kind: 'vertex'; objectId: Id; nodeIndex: number };

export interface TextObject extends ObjectBase {
  type: 'text';
  position: Vec2;
  text: string;
  style: 'label' | 'title' | 'note'; // label = kursive Serife wie im Plan
  sizeM: number; // Schriftgröße in Weltmetern, skaliert mit dem Zoom
  rotationDeg: number;
}

/** Phase 2, schon jetzt im Modell, damit keine Migration nötig wird */
export interface LampObject extends ObjectBase {
  type: 'lamp';
  lampType: LampType;
  position: Vec2;
  lumen: number;
  kelvin: number; // 2200–4000
  beamAngleDeg: number; // 360 bei Rundumleuchten
  directionDeg: number; // 0 = Nord, im Uhrzeigersinn
  /** Lichterkette: Verlauf */
  path: PathGeometry | null;
  schedule: LampSchedule;
  on: boolean;
}

export type LampType = 'bollard' | 'spot' | 'pathLight' | 'stringLights' | 'wall' | 'underwater' | 'treeUplight';

export interface LampSchedule {
  from: 'dusk' | string; // „HH:MM“ oder Dämmerung
  to: 'dawn' | string;
  weekdays: boolean[]; // Mo..So, Länge 7
}

export type PlanObject =
  | AreaObject
  | PathObject
  | PlantObject
  | PlantingObject
  | HedgeObject
  | ItemObject
  | DimensionObject
  | TextObject
  | LampObject;

export type PlanObjectType = PlanObject['type'];

/* ------------------------------------------------------------------ */
/* Katalog (statisch, versioniert mit der App, nicht im Projekt)       */
/* ------------------------------------------------------------------ */

export type MaterialId =
  | 'lawn'
  | 'gravel'
  | 'paving'
  | 'wood'
  | 'mulch'
  | 'barkMulch'
  | 'soil'
  | 'water'
  | (string & {});

export type QuantityUnit = 'm2' | 'm3' | 'm' | 'pcs';

export interface Material {
  id: MaterialId;
  name: string; // „Kies 8/16, Jurakalk“
  /** Schlüssel des prozeduralen Texturgenerators in render/textures */
  texture: 'lawn' | 'gravel' | 'paving' | 'wood' | 'mulch' | 'barkMulch' | 'soil' | 'water';
  baseColor: string;
  /** Kachelgröße der Textur in Weltmetern */
  tileSizeM: number;
  /**
   * world: Textur liegt fest im Weltraster (Rasen, Kies, Mulch: Objekt verschieben → Muster bleibt).
   * object: Textur folgt Lage und Drehung des Objekts (Pflaster, Holzdielen: Fugen bleiben kantenparallel).
   */
  anchor: 'world' | 'object';
  /** Abrechnungseinheit; bei m3 wird mit `depthM` multipliziert */
  unit: QuantityUnit;
  depthM: number | null;
  /** Pflaster: Steinformat für Stückzahl */
  unitSizeM: { w: number; d: number } | null;
  price: number; // pro Einheit, netto
}

export type PlantKind = 'tree' | 'shrub' | 'perennial' | 'grass' | 'vegetable' | 'hedge';

export interface PlantSpecies {
  id: string;
  name: string; // „Felsenbirne“
  latin: string; // „Amelanchier lamarckii“
  kind: PlantKind;
  diameterPlanted: number; // m
  diameterMature: number; // m
  heightMature: number; // m
  /** Zuwachs Ø pro Jahr in m. Daraus wird die Zeitkonstante der Wachstumskurve abgeleitet. */
  growthPerYear: number;
  sun: 'full' | 'partial' | 'shade' | 'full-partial';
  deciduous: boolean;
  /** Farben je Jahreszeit für Phase 2; summer ist Pflicht */
  colors: { summer: string; spring?: string; autumn?: string; winter?: string; bloom?: string };
  /** Jahreslauf, 12 Monate, für die Bibliotheksdetailansicht */
  phenology: ('bare' | 'leaf' | 'bloom' | 'fruit' | 'autumn')[];
  price: number;
}

export interface CatalogItem {
  id: string;
  name: string;
  category: 'raisedBed' | 'shed' | 'terrace' | 'pond' | 'pool' | 'play' | 'furniture' | 'fence' | 'greenhouse' | 'compost' | 'edging';
  defaultLayer: LayerKind;
  width: number;
  depth: number;
  height: number;
  /** Symbol im Plan (render/symbols) */
  symbol: string;
  /**
   * Manche Bibliothekseinträge erzeugen kein Item, sondern eine Fläche
   * (Terrasse → AreaObject mit Holz, Teich → AreaObject mit Wasser).
   */
  creates: 'item' | { area: MaterialId };
  unit: QuantityUnit;
  price: number;
}
