/**
 * Beispielgarten „Entspannungs-, Spiel- & Obstgarten“ auf einem Grundstück von rund 40 × 52 m mit
 * schmalem Zugang oben links (zum alten Garten, ohne Hecke). Rotbuchenhecke ringsum, neun Zonen:
 * ① Zugang vom alten Garten, ② Spielgarten, ③ Gartenhaus als Homeoffice mit überdachter Outdoorküche und
 * ④ Feuerstelle als Linie an der langen Ostgrenze, gefasst von Kupferfelsenbirnen und Beeten, ⑤ Naturteich
 * vor der Terrasse, ⑥ Spalierlinden an der Grenze zu Flurstück 38, ⑦ Obstwiese (Apfel, Birne, Kirsche),
 * ⑧ Gemüsegarten, ⑨ Gerätehaus mit Kaminholz. Plan-y zeigt nach unten (Süden, um 16° gedreht); Wege nur aus Trittplatten.
 */
import { difference } from '../geometry/clip';
import { footprint } from '../geometry/objects';
import { simpleRegion } from '../geometry/regions';
import { flattenRegion, pathSegments, type FlatRegion } from '../geometry/shape';
import { cubicAt, cubicDerivative } from '../geometry/bezier';
import { createProject, layerOfKind, objectBase } from '../model/defaults';
import { newDrip, newLamp } from '../model/factory';
import { sprinklersFor } from '../irrigationLayout';
import type {
  AreaObject,
  DimensionObject,
  EspalierObject,
  HedgeObject,
  ItemObject,
  LampObject,
  LampType,
  LayerKind,
  PathGeometry,
  PathObject,
  PlanObject,
  PlantObject,
  PlantingObject,
  Project,
  RectGeometry,
  TextObject,
  Vec2,
} from '../model/types';

const P = (x: number, y: number): Vec2 => ({ x, y });
const rect = (cx: number, cy: number, w: number, d: number, r = 0, rot = 0): RectGeometry => ({
  kind: 'rect',
  center: P(cx, cy),
  width: w,
  depth: d,
  rotationDeg: rot,
  cornerRadius: r,
});
const line = (pts: [number, number][]): PathGeometry => ({ kind: 'path', closed: false, source: 'polygon', nodes: pts.map(([x, y]) => ({ p: P(x, y) })) });
const poly = (pts: [number, number][]): PathGeometry => ({ ...line(pts), closed: true });

/** Grundstück wie aufgemessen (Lageplan): Zugang oben links ist die Kante zum alten Garten */
const BOUNDARY: [number, number][] = [
  [0, 0],
  [39.75, 0.21],
  [34.51, 49.78],
  [17.44, 50.05],
  [9.07, 51.96],
  [9.73, 26.51],
  [8.3, 13.65],
  [-0.59, 13.43],
];

/** Hecke 0,5 m innerhalb der Grenze, offen zum alten Garten (Kante unten links des Zugangs → oben links) */
const HEDGE_LINE: [number, number][] = [
  [0.48, 0.5],
  [39.19, 0.71],
  [34.06, 49.29],
  [17.38, 49.55],
  [9.59, 51.33],
  [10.23, 26.49],
  [8.75, 13.16],
  [-0.07, 12.94],
];

/** Rasen bis vor die Hecke; zum alten Garten hin fast bis an die Grenze */
const LAWN_OUTLINE: [number, number][] = [
  [0.16, 0.95],
  [38.69, 1.15],
  [33.65, 48.84],
  [17.33, 49.1],
  [10.05, 50.76],
  [10.68, 26.47],
  [9.15, 12.72],
  [-0.35, 12.49],
];

/** Innenkante der Hecke an der Ostseite (x bei gegebenem y) */
const eastX = (y: number) => 38.69 - (5.04 * (y - 1.15)) / 47.69;

/** Trittplattenweg vom alten Garten am Spielgarten vorbei, nördlich um den Teich bis zur Terrasse am Homeoffice */
const CROSS_PATH: PathGeometry = {
  kind: 'path',
  closed: false,
  source: 'bezier',
  nodes: [
    { p: P(0.2, 7.4), out: P(2.6, 0.6) },
    { p: P(6.2, 10.4), in: P(-2, -1.2), out: P(2, 1.2), smooth: true },
    { p: P(12.6, 12.9), in: P(-2.2, -0.6), out: P(2.4, 0.5), smooth: true },
    { p: P(19.6, 13.4), in: P(-2, 0.2), out: P(2, -0.2), smooth: true },
    { p: P(26.6, 13.5), in: P(-1.8, -0.3), out: P(1.5, 0.3), smooth: true },
    { p: P(30.0, 15.5), in: P(-1.1, -1) },
  ],
};

/** Trittplattenweg von der Kreuzung westlich am Teich entlang hinab zum Gemüsegarten */
const SOUTH_PATH: PathGeometry = {
  kind: 'path',
  closed: false,
  source: 'bezier',
  nodes: [
    { p: P(19.4, 14.1), out: P(0, 3) },
    { p: P(19.9, 22.5), in: P(-0.3, -3), out: P(0.3, 3), smooth: true },
    { p: P(21.8, 31.5), in: P(-0.6, -3), out: P(0.7, 3.4), smooth: true },
    { p: P(25.8, 41.9), in: P(-1.4, -3) },
  ],
};

/** Naturteich (≈ 30 m²) vor der Terrasse: Nierenform mit Bucht, weiche Uferlinie */
const POND: PathGeometry = {
  kind: 'path',
  closed: true,
  source: 'bezier',
  nodes: [
    { p: P(25.54, 16.84), in: P(-0.82, 0.25), out: P(0.82, -0.25), smooth: true },
    { p: P(28.14, 17.49), in: P(-0.6, -0.46), out: P(0.6, 0.46), smooth: true },
    { p: P(29.17, 19.63), in: P(0.05, -0.62), out: P(-0.05, 0.62), smooth: true },
    { p: P(27.86, 21.21), in: P(0.09, -0.54), out: P(-0.09, 0.54), smooth: true },
    { p: P(28.61, 22.88), in: P(0.19, -0.46), out: P(-0.19, 0.46), smooth: true },
    { p: P(26.75, 24.0), in: P(0.7, -0.08), out: P(-0.7, 0.08), smooth: true },
    { p: P(24.42, 23.35), in: P(0.48, 0.5), out: P(-0.48, -0.5), smooth: true },
    { p: P(23.86, 21.02), in: P(0.2, 0.73), out: P(-0.2, -0.73), smooth: true },
    { p: P(23.21, 18.97), in: P(-0.28, 0.7), out: P(0.28, -0.7), smooth: true },
  ],
};

/** Ensemble als Linie direkt an der Ostgrenze (Rückwand vor der Hecke): Mitte, Drehung (Gartenseite nach Westen) */
const ENSEMBLE = { x: 34.47, y: 20.17, rot: 96.03 };
/** Feuerstelle in derselben Linie südlich der Küche (Brandschutz: Abstand zum Dach ≥ 5 m) */
const FIRE = P(31.76, 31.11);

/** Ringsegment um die Feuerstelle (Winkel in Grad, y nach unten): Beet mit Kupferfelsenbirnen */
function arcBed(a0: number, a1: number, r0: number, r1: number): PathGeometry {
  const pts: [number, number][] = [];
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    pts.push([FIRE.x + Math.cos(a) * r1, FIRE.y + Math.sin(a) * r1]);
  }
  for (let i = n; i >= 0; i--) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    pts.push([FIRE.x + Math.cos(a) * r0, FIRE.y + Math.sin(a) * r0]);
  }
  return poly(pts);
}
const onArc = (aDeg: number, r: number): [number, number] => [FIRE.x + Math.cos((aDeg * Math.PI) / 180) * r, FIRE.y + Math.sin((aDeg * Math.PI) / 180) * r];

/** Hecke an der Westseite (Flurstück 97): x der Heckenlinie bei y */
const westHedgeX = (y: number) => 8.75 + 0.11125 * (y - 13.16);

export function createSpielgarten(): Project {
  const p = createProject({
    name: 'Mustergarten Entspannung, Spiel & Obst',
    plot: { kind: 'rect', width: 40, depth: 52 },
    northDeg: 16.37,
    location: { lat: 50.11, lon: 8.68, label: 'Mustergarten, Frankfurt', place: 'Frankfurt am Main', timeZone: 'Europe/Berlin' },
  });
  // aufgemessenes Grundstück statt Rechteck
  p.site.boundary = BOUNDARY.map(([x, y]) => P(x, y));
  p.site.plot = {
    kind: 'edges',
    // Kanten wie aufgemessen (die Schlusskante berechnet die App)
    edges: [
      { length: 39.751, angleDeg: 0.303 },
      { length: 49.846, angleDeg: 84.268 },
      { length: 17.072, angleDeg: 96.940 },
      { length: 8.585, angleDeg: 191.948 },
      { length: 25.459, angleDeg: 75.660 },
      { length: 12.939, angleDeg: 187.831 },
      { length: 8.893, angleDeg: 262.237 },
    ],
  };
  const L = (k: LayerKind) => layerOfKind(p, k).id;
  const add = <T extends PlanObject>(o: T): T => {
    p.objects[o.id] = o;
    p.layers[o.layerId].objectOrder.push(o.id);
    return o;
  };
  const area = (name: string, region: AreaObject['region'], materialId: string, edging: AreaObject['edging'] = null): AreaObject => ({
    ...objectBase(L('areas')),
    type: 'area',
    name,
    region,
    materialId,
    edging,
  });
  const path = (name: string, centerline: PathGeometry, width: number, materialId: string, edging: PathObject['edging'] = null): PathObject => ({
    ...objectBase(L('paths')),
    type: 'path',
    name,
    centerline,
    width,
    join: 'round',
    materialId,
    edging,
  });
  const planting = (name: string, region: PlantingObject['region'], mix: [string, number][], perSquareMeter = 9, mulch = 'barkMulch'): PlantingObject => ({
    ...objectBase(L('plants')),
    type: 'planting',
    name,
    region,
    mix: mix.map(([speciesId, share]) => ({ speciesId, share })),
    perSquareMeter,
    mulchMaterialId: mulch,
  });

  // ---------- Beete
  const SUNNY: [string, number][] = [
    ['nepeta', 0.18],
    ['salvia', 0.16],
    ['geranium', 0.16],
    ['perovskia', 0.12],
    ['echinacea', 0.1],
    ['pennisetum', 0.1],
    ['stipa', 0.08],
    ['sedum', 0.06],
    ['lavandula', 0.04],
  ];
  // unter den Spalierbäumen: halbschattig, ruhig, mit Frühjahrsblühern
  const UNDER_ESPALIER: [string, number][] = [
    ['geranium', 0.22],
    ['alchemilla', 0.18],
    ['hakonechloa', 0.14],
    ['hosta', 0.12],
    ['astilbe', 0.1],
    ['carex', 0.1],
    ['anemone', 0.08],
    ['narcissus', 0.06],
  ];
  // vor den Felsenbirnen: locker, natürlich, Gräser als Übergang zum Rasen
  const FIRE_BED: [string, number][] = [
    ['geranium', 0.18],
    ['nepeta', 0.14],
    ['calamagrostis', 0.12],
    ['pennisetum', 0.12],
    ['echinacea', 0.1],
    ['salvia', 0.1],
    ['hakonechloa', 0.1],
    ['sedum', 0.08],
    ['tulipa', 0.06],
  ];
  const POND_EDGE: [string, number][] = [['iris', 0.3], ['carex', 0.2], ['miscanthus', 0.15], ['astilbe', 0.15], ['hakonechloa', 0.2]];
  // Ostrand: Band aus Sträuchern und Stauden vor der Hecke, folgt der schrägen Grenze
  const eastBand = (y0: number, y1: number, w: number): PathGeometry =>
    poly([
      [eastX(y0) - 0.1, y0],
      [eastX(y1) - 0.1, y1],
      [eastX(y1) - 0.1 - w, y1],
      [eastX(y0) - 0.1 - w, y0],
    ]);
  const westBand = (y0: number, y1: number): PathGeometry =>
    poly([
      [westHedgeX(y0) + 0.6, y0],
      [westHedgeX(y0) + 2.0, y0],
      [westHedgeX(y1) + 2.0, y1],
      [westHedgeX(y1) + 0.6, y1],
    ]);
  const beds = [
    planting('Rabatte Nord', simpleRegion(rect(15.65, 1.75, 12.7, 1.1)), SUNNY),
    // Kupferfelsenbirnen mit Beeten fassen die Linie natürlich ein: nördlich vor dem Homeoffice, im Bogen westlich der Feuerstelle
    planting(
      'Felsenbirnen-Beet am Homeoffice',
      simpleRegion(
        poly([
          [30.00, 14.2],
          [30.80, 12.6],
          [32.90, 11.9],
          [35.40, 12.3],
          [37.00, 13.4],
          [36.70, 14.9],
          [32.60, 14.5],
        ]),
      ),
      FIRE_BED,
    ),
    planting('Felsenbirnen-Beet an der Feuerstelle', simpleRegion(arcBed(95, 235, 4.4, 6.4)), FIRE_BED),
    planting('Rabatte Ost Nord', simpleRegion(eastBand(2.2, 11.6, 1.9)), SUNNY),
    planting('Rabatte Ost Süd', simpleRegion(eastBand(35.4, 40.5, 1.1)), SUNNY),
    planting('Rabatte West Nord', simpleRegion(westBand(14.2, 16.4)), [
      ['geranium', 0.3],
      ['alchemilla', 0.25],
      ['hakonechloa', 0.2],
      ['astilbe', 0.15],
      ['carex', 0.1],
    ]),
    planting('Rabatte West Süd', simpleRegion(westBand(22.3, 26.7)), [
      ['geranium', 0.3],
      ['alchemilla', 0.25],
      ['hakonechloa', 0.2],
      ['astilbe', 0.15],
      ['carex', 0.1],
    ]),
    planting(
      'Spalierbeet an Flurstück 38',
      simpleRegion(
        poly([
          [10.8, 27.1],
          [13.5, 27.1],
          [12.95, 48.9],
          [10.25, 48.9],
        ]),
      ),
      UNDER_ESPALIER,
      8,
    ),
    planting(
      'Uferbeet Nord',
      simpleRegion(
        poly([
          [22.82, 18.53], [22.77, 17.24], [23.35, 16.15], [24.27, 15.25], [25.49, 14.77], [26.80, 14.75], [28.01, 15.21], [29.01, 15.97], [29.64, 17.03], [29.53, 18.41],
          [29.32, 18.55], [28.94, 17.8], [28.33, 17.19], [27.55, 16.76], [26.68, 16.48], [25.76, 16.49], [24.87, 16.76], [24.14, 17.3], [23.54, 17.95], [23.03, 18.66],
        ]),
      ),
      POND_EDGE,
      7,
    ),
    planting(
      'Uferbeet Süd',
      simpleRegion(
        poly([
          [29.26, 23.0], [29.27, 24.31], [28.62, 25.24], [27.65, 25.88], [26.51, 26.15], [25.33, 26.04], [24.25, 25.6], [23.38, 24.83], [22.94, 23.74], [23.42, 22.32],
          [23.63, 22.2], [23.75, 23.0], [24.24, 23.63], [24.93, 24.02], [25.68, 24.24], [26.47, 24.32], [27.26, 24.21], [27.98, 23.91], [28.60, 23.44], [29.07, 22.84],
        ]),
      ),
      POND_EDGE,
      7,
    ),
  ];

  // ---------- Flächen und Wege (Wege nur aus Trittplatten)
  const ensembleTerrace = area('Terrasse Gartenhaus & Küche', simpleRegion(rect(31.29, 19.83, 2.4, 9.6, 0, ENSEMBLE.rot - 90)), 'slabs');
  const sand = area('Spielsand', simpleRegion(rect(14.5, 6.0, 8, 6, 0.9)), 'sand');
  const firePlace = area('Platz Feuerstelle', simpleRegion(rect(FIRE.x, FIRE.y, 6.6, 6.6, 3.3)), 'flagstone');
  const pond = area('Naturteich', simpleRegion(POND), 'water');
  const orchard = area(
    'Obstwiese',
    simpleRegion(
      poly([
        [13.7, 38.9],
        [25.2, 38.9],
        [25.2, 48.9],
        [13.4, 49.0],
      ]),
    ),
    'meadow',
  );
  const vegGravel = area('Kiesfläche Gemüsegarten', simpleRegion(rect(29.6, 45.2, 7.6, 6.4, 0.2)), 'gravel', { catalogId: 'edge.stahl-anthrazit', sides: 'outline' });
  const cross = path('Trittplatten Zugang – Homeoffice', CROSS_PATH, 0.9, 'stepping');
  const toFire = path('Trittplatten Küche – Feuerstelle', line([[30.4, 24.9], [30.9, 27.7]]), 0.9, 'stepping');
  const south = path('Trittplatten Teich – Gemüsegarten', SOUTH_PATH, 0.9, 'stepping');

  // Rasen durchgehend unter allen Flächen und Beeten: wer Terrasse, Teich oder Beete verschiebt, hinterlässt keine Lücke
  add(area('Rasen', simpleRegion(poly(LAWN_OUTLINE)), 'lawn'));
  // Regner nur dort, wo der Rasen frei liegt
  const lawnCut = [...beds, ensembleTerrace, sand, firePlace, pond, orchard, vegGravel].flatMap((o) => footprint(o));
  const openLawn = difference([flattenRegion(simpleRegion(poly(LAWN_OUTLINE)))], lawnCut);
  [ensembleTerrace, sand, firePlace, pond, orchard, vegGravel, cross, south, toFire].forEach((o) => add(o));
  beds.forEach((b) => add(b));

  // ---------- Rotbuchenhecke ringsum, offen zum alten Garten
  const hedge: HedgeObject = {
    ...objectBase(L('plants')),
    type: 'hedge',
    name: 'Rotbuchenhecke',
    centerline: line(HEDGE_LINE),
    speciesId: 'fagus-hedge',
    plantedYear: 2022,
    height: 1.8,
    plantsPerMeter: 3,
  };
  add(hedge);

  // ---------- Spalierlinden an der Grenze zu Flurstück 38: Sichtschutz über der Hecke
  const espalier: EspalierObject = {
    ...objectBase(L('plants')),
    type: 'espalier',
    name: 'Spalierlinden',
    centerline: line([
      [11.55, 27.9],
      [11.05, 48.1],
    ]),
    speciesId: 'tilia-espalier',
    plantedYear: 2024,
    spacing: 2.25,
    stemHeight: 1.8,
    height: 3.6,
    depth: 0.45,
    form: 'flat',
  };
  add(espalier);

  // ---------- Bäume und Sträucher
  const plant = (speciesId: string, x: number, y: number, d: number | null, name: string | null = null, year = 2026): PlantObject => ({
    ...objectBase(L('plants')),
    type: 'plant',
    name,
    speciesId,
    position: P(x, y),
    plantedYear: year,
    plantedDiameter: d,
  });
  // Kupferfelsenbirnen (mehrstämmig) umfassen Feuerstelle und Terrasse: Sichtschutz mit Lücken zum Garten
  for (const [x, y] of [[31.7, 13.3], [35.0, 13.3]] as [number, number][]) add(plant('amelanchier-lamarckii', x, y, 3.2, 'Kupferfelsenbirne', 2020));
  for (const a of [118, 165, 212]) add(plant('amelanchier-lamarckii', ...onArc(a, 5.4), 3.2, 'Kupferfelsenbirne', 2020));
  // Hausbäume: Walnuss über der Hängematte in der Ruheecke oben rechts, Esskastanie am Gemüsegarten, Roteiche am Gerätehaus, Judasbaum am Spielgarten
  add(plant('juglans-regia', 33.4, 7.2, 5.6, 'Walnuss', 2012));
  add(plant('castanea-sativa', 32.6, 38.9, 4.6, 'Esskastanie', 2012));
  add(plant('quercus-rubra', 13.6, 14.8, 4.6, 'Amerikanische Roteiche', 2014));
  add(plant('cercis-siliquastrum', 24.6, 3.4, 3.2, 'Judasbaum', 2016));
  // Füllung: mehrstämmige Birke am Teich, Magnolie zwischen Teich und Gemüsegarten
  add(plant('betula-pendula', 24.2, 27.8, 3.4, 'Birke', 2016));
  add(plant('magnolia', 26.3, 38.0, 3.2, 'Tulpen-Magnolie', 2016));
  // Obstwiese: Apfel, Birne, Süßkirsche (Halbstämme)
  add(plant('prunus-avium', 16.4, 41.4, 4.4, 'Süßkirsche', 2018));
  add(plant('malus-topaz', 21.6, 41.4, 3.8, 'Apfel', 2018));
  add(plant('pyrus-communis', 15.8, 46.4, 3.4, 'Birne', 2018));
  add(plant('malus-topaz', 20.8, 46.3, 3.6, 'Apfel', 2018));
  // Sträucher im Ostband und an der Westseite, Beeren an der Obstwiese
  const kinds = ['viburnum', 'hydrangea', 'syringa', 'rosa-shrub', 'cornus', 'spiraea'];
  let k = 0;
  const shrub = (x: number, y: number, d: number, id?: string) => add(plant(id ?? kinds[k++ % kinds.length], x, y, d));
  for (let y = 3.4; y < 11; y += 3.1) shrub(eastX(y) - 0.85 - (k % 2) * 0.35, y, 1.8 + (k % 3) * 0.25);
  for (const y of [36.4, 38.8]) shrub(eastX(y) - 0.7, y, 1.3);
  for (const y of [15.3, 23.4, 25.8]) shrub(westHedgeX(y) + 1.3, y, 1.5, k++ % 2 ? 'hydrangea' : 'viburnum');
  for (let x = 10.6; x < 21.5; x += 3.3) shrub(x, 1.65, 1.5, k++ % 2 ? 'spiraea' : 'rosa-shrub');
  shrub(24.0, 47.9, 1.3, 'ribes');
  shrub(22.6, 48.2, 1.3, 'rubus-idaeus');

  // ---------- Bauten, Möbel, Spiel
  const item = (catalogId: string, x: number, y: number, rot = 0, size: ItemObject['size'] = null, name: string | null = null): ItemObject => ({
    ...objectBase(L('build')),
    type: 'item',
    name,
    catalogId,
    position: P(x, y),
    rotationDeg: rot,
    size,
  });
  // ① Rosenbogen als Durchgang vom alten Garten
  add(item('rose-arch', 2.2, 7.4, 90, null, 'Rosenbogen'));
  // ② Spielgarten oben: Spielturm im Sand, Trampolin, Stelzenhaus, Sandkasten; Fußballtor auf der Rasenfläche
  add(item('play-swing', 14.5, 5.8, 0, null, 'Spielturm'));
  add(item('trampoline-ground', 21.0, 4.3));
  add(item('stilt-house', 17.8, 10.6, 0, null, 'Stelzenhaus'));
  add(item('sandbox-bench-200', 11.4, 10.4));
  add(item('soccer-goal-300', 16.4, 34.8, 180, null, 'Fußballtor'));
  // ③ Gartenhaus als Homeoffice mit überdachter Outdoorküche unter einer Dachlinie, ④ Feuerstelle in derselben Linie südlich davon
  add(item('gartenhaus-office-kueche', ENSEMBLE.x, ENSEMBLE.y, ENSEMBLE.rot, null, 'Homeoffice & Outdoorküche'));
  add(item('firepit-round', FIRE.x, FIRE.y, 0, null, 'Feuerstelle'));
  // ⑤ Naturteich vor der Terrasse: Quellstein als Zulauf, Findlinge am Ufer; Hängematte unter der Walnuss
  add(item('spring-stone', 24.1, 16.4, 0, null, 'Quellstein'));
  add(item('boulder-granite', 28.8, 21.4, 20));
  add(item('boulder-granite', 23.4, 21.9, 140));
  add(item('haengematte-gestell', 30.6, 8.6, 60, null, 'Hängematte'));
  // ⑦ Obstwiese: Vogeltränke und Insektenhotel
  add(item('insect-hotel', 24.8, 40.4, 270));
  add(item('bird-bath', 18.4, 43.9));
  // ⑧ Gemüsegarten kompakt: Gewächshaus, drei Hochbeete, Kompost, Regentonne, Zapfsäule
  add(item('greenhouse-4x3.5', 31.45, 44.3, 90, null, 'Gewächshaus'));
  const BEDS: [number, number][] = [
    [26.6, 44.0],
    [28.2, 44.0],
  ];
  BEDS.forEach(([x, y]) => add(item('raised-bed-corten-300x100', x, y, 90)));
  add(item('compost-2', 27.4, 47.3, 90));
  add(item('rain-barrel', 30.6, 47.4));
  add(item('tap-post', 29.4, 47.9));
  // ⑨ Gerätehaus mit Kaminholzunterstand an der Westgrenze, Tür zum Garten
  add(item('geraetehaus-holzunterstand', 11.35, 19.33, -96.35, null, 'Gerätehaus & Kaminholz'));
  add(item('power-post', 30.0, 25.3));

  // ---------- Beschriftung: die acht Zonen
  const text = (t: string, x: number, y: number, size = 0.65): TextObject => ({
    ...objectBase(L('annotation')),
    type: 'text',
    position: P(x, y),
    text: t,
    style: 'label',
    sizeM: size,
    rotationDeg: 0,
  });
  add(text('① Zugang alter Garten', 3.6, 3.4));
  add(text('② Spielgarten', 14.5, 9.7));
  add(text('③ Homeoffice & Küche', 32.6, 26.4));
  add(text('④ Feuerstelle', FIRE.x, 35.2));
  add(text('⑤ Naturteich', 26.0, 26.9));
  add(text('⑥ Spalier', 12, 37.5));
  add(text('⑦ Obstwiese', 18.2, 48.2));
  add(text('⑧ Gemüsegarten', 29.6, 41.2));
  add(text('⑨ Geräte & Holz', 14.2, 22.6));

  const dim = (a: Vec2, b: Vec2, offset: number): DimensionObject => ({
    ...objectBase(L('annotation')),
    type: 'dimension',
    a: { kind: 'free', p: a },
    b: { kind: 'free', p: b },
    offset,
  });
  add(dim(P(0, 0), P(39.75, 0.21), -1.2));
  add(dim(P(39.75, 0.21), P(34.51, 49.78), -1.2));

  addLighting(p, add);
  addIrrigation(p, add, openLawn, BEDS);
  // Nachbarhaus auf Flurstück 38: Blick auf Feuerstelle und Lounge prüfen (Sichtschutz-Reiter)
  p.observers.push({ id: 'nachbar-38', name: 'Nachbarhaus Flurstück 38, 1. OG', position: P(3, 36), eyeHeight: 4.5 });
  return p;
}

/** Wegeleuchten an den Trittplattenwegen, Strahler auf Hausbäume und Felsenbirnen, Licht an Ensemble, Feuerstelle und Teich */
function addLighting(p: Project, add: (o: PlanObject) => PlanObject) {
  const lamp = (t: LampType, x: number, y: number, extra: Partial<LampObject> = {}) => add({ ...newLamp(p, t, P(x, y)), ...extra });
  for (const g of [CROSS_PATH, SOUTH_PATH])
    pathSegments(g).forEach((seg, si) => {
      const c = cubicAt(seg, 0.5);
      const d = cubicDerivative(seg, 0.5);
      const l = Math.hypot(d.x, d.y);
      const side = si % 2 ? 1 : -1;
      lamp('pathLight', c.x - (d.y / l) * side * 0.8, c.y + (d.x / l) * side * 0.8, { name: 'Wegeleuchte' });
    });
  lamp('bollard', 1.2, 6.2, { name: 'Poller Zugang' });
  lamp('bollard', 1.2, 8.6, { name: 'Poller Zugang' });
  lamp('treeUplight', 32.0, 8.6, {
    name: 'Baumstrahler Walnuss',
    directionDeg: 45,
    beamAngleDeg: 36,
    lumen: 480,
  });
  lamp('treeUplight', 31.3, 40.0, {
    name: 'Baumstrahler Esskastanie',
    directionDeg: 45,
    beamAngleDeg: 36,
    lumen: 480,
  });
  lamp('treeUplight', 23.4, 4.6, {
    name: 'Baumstrahler Judasbaum',
    directionDeg: 60,
    beamAngleDeg: 40,
    lumen: 320,
  });
  for (const a of [118, 212]) {
    const [x, y] = onArc(a, 4.7);
    lamp('treeUplight', x, y, {
      name: 'Strahler Felsenbirne',
      directionDeg: a + 180,
      beamAngleDeg: 40,
      lumen: 260,
    });
  }
  lamp('wall', 32.7, 17.4, {
    name: 'Wandleuchte Homeoffice',
    directionDeg: 270,
  });
  lamp('spot', 29.4, 20.6, {
    name: 'Spot Naturteich',
    directionDeg: 180,
    beamAngleDeg: 50,
    lumen: 300,
  });
  for (const a of [20, 110, 200, 290]) {
    const [x, y] = onArc(a, 3.0);
    lamp('pathLight', x, y, { name: 'Leuchte Feuerstelle' });
  }
}

/** Versenkregner für den Rasen, Tropfschlauch in jedem Hochbeet */
function addIrrigation(p: Project, add: (o: PlanObject) => PlanObject, openLawn: FlatRegion[], beds: [number, number][]) {
  for (const r of openLawn) for (const sp of sprinklersFor(p, r, 1)) add({ ...sp, zone: sp.position.y < 26 ? 1 : 2 });
  beds.forEach(([x, y]) =>
    add({
      ...newDrip(
        p,
        line([
          [x - 0.25, y - 1.3],
          [x - 0.25, y + 1.3],
          [x + 0.25, y + 1.3],
          [x + 0.25, y - 1.3],
          [x - 0.2, y - 1.3],
        ]),
        3,
      ),
      name: 'Tropfschlauch Hochbeet',
    }),
  );
}
