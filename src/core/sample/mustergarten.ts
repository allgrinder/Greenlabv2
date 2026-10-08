/**
 * Beispielgarten „Modern & Naturnah“ (30 × 50 m) nach dem Gartenkonzept mit sieben Zonen:
 * ① Eingang & Zufahrt, ② Spiel & Bewegung, ③ Rasen, ④ Hochbeete & Selbstversorgung,
 * ⑤ Sitzplatz & Schattenplatz (Pavillon), ⑥ Naturwiese & Baumbestand mit Homeoffice-Pod, ⑦ Feuerstelle.
 * Norden ist oben; Eingang unten links, Trittplattenweg an der Ostseite bis zum Holzdeck am Pod.
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

/** Trittplattenweg: vom Südrand an der Ostseite hinauf, um den Feldahorn herum, bis zum Deck am Pod */
export const STEPPING_CENTERLINE: PathGeometry = {
  kind: 'path',
  closed: false,
  source: 'bezier',
  nodes: [
    { p: P(25.6, 46.4), out: P(0, -4) },
    { p: P(25.1, 36), in: P(0.3, 3.5), out: P(-0.3, -3.5), smooth: true },
    { p: P(21.3, 22.5), in: P(0.4, 4), out: P(-0.3, -3), smooth: true },
    { p: P(24.2, 12.9), in: P(-2.2, 3) },
  ],
};

/** Kiesweg vom Tor nach Norden bis zu den Hochbeeten */
const ENTRY_CENTERLINE: PathGeometry = line([
  [4.05, 49.9],
  [4.05, 28.3],
]);

/** Naturwiese oben links: weiche Kante zum Rasen */
const MEADOW: PathGeometry = {
  kind: 'path',
  closed: true,
  source: 'bezier',
  nodes: [
    { p: P(3, 2.7) },
    { p: P(18.6, 2.7), out: P(0.9, 4) },
    { p: P(17, 12.8), in: P(1.8, -3), out: P(-2, 3.2), smooth: true },
    { p: P(10.5, 17.6), in: P(3.2, 0), out: P(-3.5, 0), smooth: true },
    { p: P(3, 17.2), in: P(1.5, 0.3) },
  ],
};

export function createMustergarten(): Project {
  const p = createProject({
    name: 'Mustergarten Modern & Naturnah',
    plot: { kind: 'rect', width: 30, depth: 50 },
    northDeg: 0,
    location: { lat: 50.1488, lon: 8.6247, label: 'Mustergarten, Frankfurt', place: 'Frankfurt am Main', timeZone: 'Europe/Berlin' },
  });
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
  const planting = (name: string, region: PlantingObject['region'], mix: [string, number][], perSquareMeter = 8): PlantingObject => ({
    ...objectBase(L('plants')),
    type: 'planting',
    name,
    region,
    mix: mix.map(([speciesId, share]) => ({ speciesId, share })),
    perSquareMeter,
    mulchMaterialId: 'barkMulch',
  });

  // ---------- Flächen, Wege, Beete (zuerst bauen: der Rasen wird darum herum ausgeschnitten)
  // grün dominiert, Gräser als helle Akzente (wie im Konzept)
  const BORDER: [string, number][] = [
    ['salvia', 0.2],
    ['nepeta', 0.18],
    ['geranium', 0.16],
    ['echinacea', 0.12],
    ['pennisetum', 0.12],
    ['sedum', 0.1],
    ['lavandula', 0.07],
    ['stipa', 0.05],
  ];
  const borders = [
    planting('Rabatte Nord', simpleRegion(rect(15, 1.75, 28.2, 1.7)), [['geranium', 0.25], ['nepeta', 0.2], ['salvia', 0.2], ['pennisetum', 0.15], ['echinacea', 0.1], ['stipa', 0.1]]),
    planting('Rabatte West', simpleRegion(rect(1.95, 25.6, 2.1, 45.8)), BORDER),
    planting('Rabatte Ost', simpleRegion(rect(28.15, 25.6, 1.9, 45.8)), BORDER),
    // Pflanzband westlich der Trittplatten: der Weg läuft im unteren Teil zwischen Stauden
    planting('Beet am Trittweg', simpleRegion(rect(23.55, 41.5, 1.5, 9.4, 0.6)), BORDER),
    planting('Beet Pavillon Ost', simpleRegion(rect(23.3, 34.4, 1, 5.6)), BORDER, 7),
    planting('Beet Pavillon Süd', simpleRegion(rect(20.5, 37.5, 6.6, 1.1)), BORDER, 7),
    planting('Rabatte Süd', simpleRegion(rect(16.35, 48.05, 21.7, 2.1)), [['lavandula', 0.2], ['geranium', 0.2], ['sedum', 0.2], ['salvia', 0.2], ['pennisetum', 0.1], ['stipa', 0.1]]),
    planting('Beet Pavillon Nord', simpleRegion(rect(20.5, 31.3, 6.6, 1.1)), [['salvia', 0.35], ['nepeta', 0.35], ['stipa', 0.3]], 5),
    planting('Beet Pavillon West', simpleRegion(rect(17.7, 34.4, 1, 5.6)), [['pennisetum', 0.4], ['echinacea', 0.3], ['sedum', 0.3]], 5),
  ];
  const meadow = area('Naturwiese', simpleRegion(MEADOW), 'meadow');
  const deck = area('Holzdeck Lärche', simpleRegion(rect(22.9, 8, 6.6, 9)), 'wood');
  const sand = area('Spielsand', simpleRegion(rect(6.4, 22.6, 6.6, 7, 0.6)), 'sand');
  const kiesBeete = area('Kiesfläche Hochbeete', simpleRegion(rect(8.05, 33.5, 6.9, 10, 0.3)), 'gravel', { catalogId: 'edge.kantenstein-8x20', sides: 'outline' });
  const entry = path('Kiesweg Eingang', ENTRY_CENTERLINE, 1.4, 'gravel', { catalogId: 'edge.kantenstein-8x20', sides: 'both' });

  const lawnCut = [...borders, meadow, deck, sand, kiesBeete, entry].flatMap((o) => footprint(o));
  const lawn = difference([flattenRegion(simpleRegion(rect(15, 25, 28.2, 48.2)))], lawnCut);
  lawn.forEach((r, i) => add(area(i === 0 ? 'Rasen' : `Rasen ${i + 1}`, flatToRegion(r), 'lawn')));
  add(meadow);
  add(deck);
  add(sand);
  add(kiesBeete);
  add(entry);
  add(path('Trittplatten', STEPPING_CENTERLINE, 0.9, 'stepping'));
  borders.forEach((b) => add(b));

  // ---------- Hecke ringsum (Lücke für das Tor unten links)
  const hedge: HedgeObject = {
    ...objectBase(L('plants')),
    type: 'hedge',
    name: 'Hainbuchenhecke',
    centerline: line([
      [5.25, 49.6],
      [29.6, 49.6],
      [29.6, 0.4],
      [0.4, 0.4],
      [0.4, 49.6],
      [2.85, 49.6],
    ]),
    speciesId: 'carpinus-hedge',
    plantedYear: 2022,
    height: 1.8,
    plantsPerMeter: 3,
  };
  add(hedge);

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
  add(plant('acer-campestre', 7.5, 8, 6.5, 'Feldahorn', 2012));
  add(plant('carpinus-betulus', 14.2, 11.8, 5, 'Hainbuche', 2014));
  add(plant('liquidambar', 26.6, 2.6, 5.2, 'Amberbaum', 2014));
  add(plant('acer-campestre', 24.6, 22.4, 4.6, 'Feldahorn', 2016));
  add(plant('prunus-serrulata', 10.6, 18.4, 3.6, 'Zierkirsche', 2018));
  add(plant('prunus-serrulata', 12.6, 39.8, 3.2, 'Zierkirsche', 2018));
  add(plant('liquidambar', 8.6, 43.2, 4.2, 'Amberbaum', 2016));
  // Sträucher in den Rabatten: Hortensie, Spiere, Hartriegel im Wechsel
  const SHRUBS: [number, number, number][] = [
    [2, 4.5, 1.8], [1.9, 14, 1.6], [2, 21, 1.7], [1.9, 27.5, 1.6], [2, 41, 1.8],
    [28.2, 15.5, 1.8], [28.1, 21, 1.6], [28.2, 27, 1.8], [28.1, 32.5, 1.6], [28.2, 38.5, 1.8], [28.1, 44.5, 1.6],
    [9.5, 1.8, 1.6], [16, 1.8, 1.7], [21, 1.8, 1.6],
    [10, 48, 1.6], [19.5, 48, 1.8], [24.5, 48, 1.6],
    [2, 8.5, 1.6], [1.9, 33, 1.6], [2, 37, 1.8], [2, 45.5, 1.6], [28.2, 4.5, 1.6], [28.1, 9.5, 1.8],
    [5.5, 1.8, 1.6], [13, 1.8, 1.4], [14.5, 48, 1.6], [7.5, 48.1, 1.4], [23.5, 39.5, 1.3], [23.5, 43.6, 1.4],
  ];
  const kinds = ['hydrangea', 'spiraea', 'cornus'];
  SHRUBS.forEach(([x, y, d], i) => add(plant(kinds[i % 3], x, y, d)));

  // ---------- Bauten und Möbel
  const item = (catalogId: string, x: number, y: number, rot = 0, size: ItemObject['size'] = null, name: string | null = null): ItemObject => ({
    ...objectBase(L('build')),
    type: 'item',
    name,
    catalogId,
    position: P(x, y),
    rotationDeg: rot,
    size,
  });
  add(item('office-pod', 24.6, 7.2, 90, null, 'Homeoffice-Pod'));
  add(item('table-6', 21.4, 10.4, 90, { width: 1.8, depth: 2.6, height: 0.75 }));
  add(item('planter', 20.1, 4.4));
  add(item('planter', 20.1, 5.3));
  add(item('pavilion-4x4', 20.5, 34, 0, null, 'Pavillon'));
  add(item('firepit-round', 15, 44.2, 0, null, 'Feuerstelle'));
  add(item('play-swing', 6.4, 22.1, 0, null, 'Spielturm'));
  add(item('trampoline-ground', 13.2, 24.6));
  add(item('gate-double', 4.05, 49.6, 0, null, 'Gartentor'));
  const BEDS: [number, number][] = [[6.6, 31], [8.8, 31], [6.6, 35.6], [8.8, 35.6]];
  BEDS.forEach(([x, y]) => add(item('raised-bed-corten-300x100', x, y, 90)));
  add(item('greenhouse-4x3.5', 10.6, 33.3, 0, { width: 1.8, depth: 3, height: 2.2 }, 'Gewächshaus'));
  for (let x = 5.6; x < 11.2; x += 1) add(item('stone-wall-1m', x, 28.3));
  add(item('rain-barrel', 11.2, 37.6));

  // ---------- Beschriftung: die sieben Zonen
  const text = (t: string, x: number, y: number, size = 0.65): TextObject => ({
    ...objectBase(L('annotation')),
    type: 'text',
    position: P(x, y),
    text: t,
    style: 'label',
    sizeM: size,
    rotationDeg: 0,
  });
  add(text('① Eingang', 5.6, 46.5));
  add(text('② Spiel & Bewegung', 7, 27.2));
  add(text('③ Rasen', 15, 30, 0.8));
  add(text('④ Hochbeete', 8.2, 39.4));
  add(text('⑤ Pavillon', 20.5, 39.2));
  add(text('⑥ Naturwiese & Pod', 10.5, 15.2));
  add(text('⑦ Feuerstelle', 15, 40.9));

  const dim = (a: Vec2, b: Vec2, offset: number): DimensionObject => ({
    ...objectBase(L('annotation')),
    type: 'dimension',
    a: { kind: 'free', p: a },
    b: { kind: 'free', p: b },
    offset,
  });
  add(dim(P(0, 0), P(30, 0), -1.2));
  add(dim(P(30, 0), P(30, 50), -1.2));

  addLighting(p, add);
  addIrrigation(p, add, BEDS);
  // Nachbarhäuser im Osten: Blick auf Pavillon und Feuerstelle prüfen (Sichtschutz-Reiter)
  p.observers.push({ id: 'nachbar-ost', name: 'Nachbarhaus, 1. OG', position: P(37, 32), eyeHeight: 4.5 });
  return p;
}

/** Dezente Wegeleuchten an Trittplatten und Kiesweg, Strahler auf die Bäume, Licht an Pavillon und Feuerstelle */
function addLighting(p: Project, add: (o: PlanObject) => PlanObject) {
  const lamp = (t: LampType, x: number, y: number, extra: Partial<LampObject> = {}) => add({ ...newLamp(p, t, P(x, y)), ...extra });
  const segs = pathSegments(STEPPING_CENTERLINE);
  segs.forEach((seg, si) =>
    [0.2, 0.55, 0.9].forEach((t, k) => {
      const c = cubicAt(seg, t);
      const d = cubicDerivative(seg, t);
      const l = Math.hypot(d.x, d.y);
      const side = (si + k) % 2 ? 1 : -1;
      lamp('pathLight', c.x - (d.y / l) * side * 0.7, c.y + (d.x / l) * side * 0.7, { name: 'Wegeleuchte' });
    }),
  );
  for (const y of [47.5, 42, 36.5, 31]) lamp('pathLight', 4.05 + 0.95, y, { name: 'Wegeleuchte' });
  lamp('bollard', 2.4, 48.9, { name: 'Poller Tor' });
  lamp('bollard', 5.7, 48.9, { name: 'Poller Tor' });
  lamp('treeUplight', 9.2, 10.4, { name: 'Baumstrahler Feldahorn', directionDeg: 315, beamAngleDeg: 36, lumen: 480 });
  lamp('treeUplight', 22.6, 23.6, { name: 'Baumstrahler Feldahorn', directionDeg: 60, beamAngleDeg: 36, lumen: 400 });
  lamp('treeUplight', 10.4, 44.6, { name: 'Baumstrahler Amberbaum', directionDeg: 300, beamAngleDeg: 36, lumen: 400 });
  lamp('spot', 23.4, 36.6, { name: 'Spot Pavillon', directionDeg: 315, beamAngleDeg: 50, lumen: 400 });
  lamp('wall', 25.9, 10.6, { name: 'Wandleuchte Pod', directionDeg: 180 });
  for (const a of [200, 250, 290, 340]) {
    const r = (a * Math.PI) / 180;
    lamp('pathLight', 15 + Math.cos(r) * 2.75, 44.2 - Math.sin(r) * 2.75, { name: 'Leuchte Feuerstelle' });
  }
}

/** Versenkregner für den Rasen, Tropfschlauch in jedem Hochbeet */
function addIrrigation(p: Project, add: (o: PlanObject) => PlanObject, beds: [number, number][]) {
  for (const o of Object.values(p.objects)) {
    if (o.type !== 'area' || o.materialId !== 'lawn') continue;
    for (const r of footprint(o)) for (const sp of sprinklersFor(p, r, 1)) add({ ...sp, zone: sp.position.y < 25 ? 1 : 2 });
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
