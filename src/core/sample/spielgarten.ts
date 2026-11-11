/**
 * Beispielgarten „Entspannungs-, Spiel- & Obstgarten“ auf einem Grundstück von rund 40 × 52 m mit
 * schmalem Zugang oben links (zum alten Garten, ohne Hecke). Rotbuchenhecke ringsum, acht Zonen:
 * ① Zugang vom alten Garten, ② überdachte Outdoorküche mit Terrasse, ③ Office-Pod & Fasssauna,
 * ④ Spielgarten, ⑤ Feuerstelle, Lounge & Wasserspiel, ⑥ Spalierbäume an der Grenze zu Flurstück 38,
 * ⑦ Obstwiese (Apfel, Birne, Kirsche), ⑧ Gewächshaus & Hochbeete.
 * Plan-y zeigt nach unten (Süden, um 16° gedreht); der Hauptweg führt von der Terrasse bis zum Gemüsegarten.
 */
import { difference } from '../geometry/clip';
import { footprint } from '../geometry/objects';
import { flatToRegion, simpleRegion } from '../geometry/regions';
import { flattenRegion, pathSegments } from '../geometry/shape';
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

/** Hauptweg: von der Terrasse in weitem Bogen zwischen Spiel- und Ruhebereich hinab zum Gemüsegarten */
const MAIN_PATH: PathGeometry = {
  kind: 'path',
  closed: false,
  source: 'bezier',
  nodes: [
    { p: P(19.6, 10.4), out: P(1.6, 2.4) },
    { p: P(23.3, 19.5), in: P(-0.6, -3), out: P(0.5, 3.2), smooth: true },
    { p: P(23.4, 31), in: P(-0.3, -3.5), out: P(0.3, 3.5), smooth: true },
    { p: P(25.2, 40.9), in: P(-1, -3) },
  ],
};

/** Trittplatten vom alten Garten durch den Zugang zur Terrasse */
const ACCESS_PATH: PathGeometry = {
  kind: 'path',
  closed: false,
  source: 'bezier',
  nodes: [
    { p: P(0.2, 7.4), out: P(3, 0) },
    { p: P(6.5, 6.4), in: P(-2, 0.4), out: P(2, -0.4), smooth: true },
    { p: P(11.1, 6.9), in: P(-1.6, -0.2) },
  ],
};

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
  // Ostrand: Band aus Sträuchern und Stauden vor der Hecke, folgt der schrägen Grenze
  const eastBand = (y0: number, y1: number, w: number): PathGeometry =>
    poly([
      [eastX(y0) - 0.1, y0],
      [eastX(y1) - 0.1, y1],
      [eastX(y1) - 0.1 - w, y1],
      [eastX(y0) - 0.1 - w, y0],
    ]);
  const beds = [
    planting('Rabatte Nord', simpleRegion(rect(16.6, 1.75, 14.6, 1.1)), SUNNY),
    planting('Beet Judasbaum', simpleRegion(rect(23.3, 4.6, 3.4, 4.6, 0.4)), [['geranium', 0.3], ['nepeta', 0.25], ['hakonechloa', 0.25], ['tulipa', 0.2]]),
    planting('Rabatte Ost', simpleRegion(eastBand(10.4, 38.6, 1.9)), SUNNY),
    planting(
      'Rabatte West',
      simpleRegion(
        poly([
          [9.95, 14.2],
          [11.3, 14.2],
          [12.55, 26.7],
          [11.15, 26.7],
        ]),
      ),
      [['geranium', 0.3], ['alchemilla', 0.25], ['hakonechloa', 0.2], ['astilbe', 0.15], ['carex', 0.1]],
    ),
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
    { ...planting('Kiesbeet Quellstein', simpleRegion(rect(25.9, 26.9, 2.2, 3.2, 0.9)), [['pennisetum', 0.35], ['stipa', 0.35], ['sedum', 0.3]], 7), mulchMaterialId: 'basalt' },
  ];

  // ---------- Flächen und Wege
  const terrace = area('Terrasse Outdoorküche', simpleRegion(rect(16.2, 6.4, 10.4, 8.4)), 'slabs');
  const deck = area('Holzdeck Pod & Sauna', simpleRegion(rect(31.05, 5.75, 11.7, 7.5)), 'wood');
  const sand = area('Spielsand', simpleRegion(rect(16.1, 18.6, 8, 6, 0.9)), 'sand');
  const firePlace = area('Platz Feuerstelle', simpleRegion(rect(28.6, 19.6, 6.6, 6.6, 3.3)), 'flagstone');
  const loungeDeck = area('Lounge-Deck', simpleRegion(rect(28.7, 30.6, 6.2, 4.4)), 'wood');
  const orchard = area(
    'Obstwiese',
    simpleRegion(
      poly([
        [13.7, 38.9],
        [22.6, 38.9],
        [22.6, 48.9],
        [13.4, 49.0],
      ]),
    ),
    'meadow',
  );
  const vegGravel = area('Kiesfläche Gemüsegarten', simpleRegion(rect(28.4, 44.7, 10.2, 8, 0.2)), 'gravel', { catalogId: 'edge.stahl-anthrazit', sides: 'outline' });
  const main = path('Hauptweg', MAIN_PATH, 1.2, 'flagstone', { catalogId: 'edge.stahl-anthrazit', sides: 'both' });
  const access = path('Trittplatten Zugang', ACCESS_PATH, 0.9, 'stepping');
  const toDeck = path('Trittplatten Deck', line([[21.6, 8.9], [25.1, 8.6]]), 0.9, 'stepping');

  const lawnCut = [...beds, terrace, deck, sand, firePlace, loungeDeck, orchard, vegGravel, main].flatMap((o) => footprint(o));
  const lawn = difference([flattenRegion(simpleRegion(poly(LAWN_OUTLINE)))], lawnCut);
  lawn.forEach((r, i) => add(area(i === 0 ? 'Rasen' : `Rasen ${i + 1}`, flatToRegion(r), 'lawn')));
  [terrace, deck, sand, firePlace, loungeDeck, orchard, vegGravel, main, access, toDeck].forEach((o) => add(o));
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

  // ---------- Spalierbäume an der Grenze zu Flurstück 38: Sichtschutz über der Hecke
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
  // Hausbäume: Walnuss beschattet Feuerstelle, Esskastanie die Lounge, Roteiche den Sandkasten, Judasbaum als Blüte an der Terrasse
  add(plant('juglans-regia', 34.1, 16.6, 5.6, 'Walnuss', 2012));
  add(plant('castanea-sativa', 33.3, 31.8, 5, 'Esskastanie', 2012));
  add(plant('quercus-rubra', 11.9, 13.4, 4.8, 'Amerikanische Roteiche', 2014));
  add(plant('cercis-siliquastrum', 23.3, 4.4, 3.2, 'Judasbaum', 2016));
  // Obstwiese: Apfel, Birne, Süßkirsche (Halbstämme)
  add(plant('prunus-avium', 16.3, 41.4, 4.4, 'Süßkirsche', 2018));
  add(plant('malus-topaz', 20.9, 41.2, 3.8, 'Apfel', 2018));
  add(plant('pyrus-communis', 15.6, 46.4, 3.4, 'Birne', 2018));
  add(plant('malus-topaz', 20.4, 46.3, 3.6, 'Apfel', 2018));
  // Sträucher im Ostband und an der Westseite, Beerensträucher am Gemüsegarten
  const kinds = ['viburnum', 'hydrangea', 'syringa', 'rosa-shrub', 'cornus', 'spiraea'];
  let k = 0;
  const shrub = (x: number, y: number, d: number, id?: string) => add(plant(id ?? kinds[k++ % kinds.length], x, y, d));
  for (let y = 12; y < 38.5; y += 3.1) shrub(eastX(y) - 0.85 - (k % 2) * 0.35, y, 1.8 + (k % 3) * 0.25);
  for (let y = 15.2; y < 26; y += 3.2) shrub(10.35 + (y - 14.2) * 0.1, y, 1.6, k++ % 2 ? 'hydrangea' : 'viburnum');
  for (let x = 10.6; x < 23.5; x += 3.3) shrub(x, 1.65, 1.5, k++ % 2 ? 'spiraea' : 'rosa-shrub');
  shrub(22.9, 48.2, 1.3, 'ribes');
  shrub(13.4, 1.7, 1.3, 'buddleja');

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
  add(item('rose-arch', 2.2, 7.2, 90, null, 'Rosenbogen'));
  // ② überdachte Outdoorküche mit Essplatz, daneben Lounge auf der Terrasse
  add(item('outdoorkueche-ueberdacht', 14.6, 5.0, 0, null, 'Outdoorküche überdacht'));
  add(item('lounge-sofa', 19.6, 5.4, 0));
  add(item('planter-fibrecement-100', 20.6, 9.8));
  // ③ Office-Pod und Fasssauna auf dem Holzdeck, Liegen davor
  add(item('office-pod', 33.4, 3.5, 0, null, 'Office-Hub'));
  add(item('fasssauna-thermoholz', 27.4, 4.0, 0, null, 'Fasssauna'));
  add(item('lounger', 33.2, 7.9, 90));
  add(item('lounger', 35.1, 7.9, 90));
  // ④ Spielgarten: Spielturm im Sand, Stelzenhaus, Sandkasten, Trampolin, Fußballtor
  add(item('play-swing', 16.1, 18.3, 0, null, 'Spielturm'));
  add(item('stilt-house', 15.6, 29.6, 0, null, 'Stelzenhaus'));
  add(item('sandbox-bench-200', 14.6, 24.6));
  add(item('trampoline-ground', 19.7, 25.4));
  add(item('soccer-goal-300', 18.2, 37.0, 180, null, 'Fußballtor'));
  // ⑤ Feuerstelle, Hängematte, Lounge-Deck, Quellstein
  add(item('firepit-round', 28.6, 19.6, 0, null, 'Feuerstelle'));
  add(item('haengematte-gestell', 33.9, 23.6, 90, null, 'Hängematte'));
  add(item('lounge-sofa', 28.7, 30.5, 180));
  add(item('spring-stone', 25.9, 26.7, 0, null, 'Quellstein'));
  // ⑦ Obstwiese: Vogeltränke und Insektenhotel
  add(item('insect-hotel', 22.2, 44.0, 270));
  add(item('bird-bath', 18.2, 43.9));
  // ⑧ Gewächshaus, Hochbeete, Kompost, Regentonne, Zapfsäule
  add(item('greenhouse-4x3.5', 31.2, 42.6, 0, null, 'Gewächshaus'));
  const BEDS: [number, number][] = [
    [24.6, 42.6],
    [26.6, 42.6],
    [24.6, 46.6],
    [26.6, 46.6],
  ];
  BEDS.forEach(([x, y]) => add(item('raised-bed-corten-300x100', x, y, 90)));
  add(item('compost-2', 31.4, 47.2, 90));
  add(item('rain-barrel', 33.0, 45.0));
  add(item('tap-post', 28.7, 41.4));
  add(item('power-post', 21.4, 10.3));

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
  add(text('① Zugang alter Garten', 4.2, 10.2));
  add(text('② Outdoorküche', 14.6, 9.6));
  add(text('③ Office & Sauna', 31, 10.6));
  add(text('④ Spielgarten', 16.1, 22.4));
  add(text('⑤ Feuer & Lounge', 28.6, 24.2));
  add(text('⑥ Spalier', 12, 37.5));
  add(text('⑦ Obstwiese', 18.2, 48.2));
  add(text('⑧ Gemüsegarten', 28.4, 39.4));

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
  addIrrigation(p, add, BEDS);
  // Nachbarhaus auf Flurstück 38: Blick auf Feuerstelle und Lounge prüfen (Sichtschutz-Reiter)
  p.observers.push({ id: 'nachbar-38', name: 'Nachbarhaus Flurstück 38, 1. OG', position: P(3, 36), eyeHeight: 4.5 });
  return p;
}

/** Wegeleuchten am Hauptweg und am Zugang, Strahler auf die Hausbäume, Licht an Pod und Feuerstelle */
function addLighting(p: Project, add: (o: PlanObject) => PlanObject) {
  const lamp = (t: LampType, x: number, y: number, extra: Partial<LampObject> = {}) => add({ ...newLamp(p, t, P(x, y)), ...extra });
  pathSegments(MAIN_PATH).forEach((seg, si) =>
    [0.25, 0.75].forEach((t, k) => {
      const c = cubicAt(seg, t);
      const d = cubicDerivative(seg, t);
      const l = Math.hypot(d.x, d.y);
      const side = (si + k) % 2 ? 1 : -1;
      lamp('pathLight', c.x - (d.y / l) * side * 0.85, c.y + (d.x / l) * side * 0.85, { name: 'Wegeleuchte' });
    }),
  );
  lamp('bollard', 1.2, 6.2, { name: 'Poller Zugang' });
  lamp('bollard', 1.2, 8.6, { name: 'Poller Zugang' });
  lamp('treeUplight', 32.6, 18.2, { name: 'Baumstrahler Walnuss', directionDeg: 45, beamAngleDeg: 36, lumen: 480 });
  lamp('treeUplight', 32.4, 33.0, { name: 'Baumstrahler Esskastanie', directionDeg: 45, beamAngleDeg: 36, lumen: 480 });
  lamp('treeUplight', 22.2, 5.8, { name: 'Baumstrahler Judasbaum', directionDeg: 60, beamAngleDeg: 40, lumen: 320 });
  lamp('wall', 33.4, 4.8, { name: 'Wandleuchte Pod', directionDeg: 180 });
  lamp('wall', 27.4, 6.1, { name: 'Wandleuchte Sauna', directionDeg: 180 });
  for (const a of [20, 120, 220, 320]) {
    const r = (a * Math.PI) / 180;
    lamp('pathLight', 28.6 + Math.cos(r) * 3.0, 19.6 - Math.sin(r) * 3.0, { name: 'Leuchte Feuerstelle' });
  }
}

/** Versenkregner für den Rasen, Tropfschlauch in jedem Hochbeet */
function addIrrigation(p: Project, add: (o: PlanObject) => PlanObject, beds: [number, number][]) {
  for (const o of Object.values(p.objects)) {
    if (o.type !== 'area' || o.materialId !== 'lawn') continue;
    for (const r of footprint(o)) for (const sp of sprinklersFor(p, r, 1)) add({ ...sp, zone: sp.position.y < 26 ? 1 : 2 });
  }
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
