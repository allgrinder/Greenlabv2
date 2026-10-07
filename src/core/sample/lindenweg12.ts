/**
 * Beispielgarten aus dem Design: Hausgarten Lindenweg 12, Frankfurt, 50 × 30 m.
 * Koordinaten übernommen aus GardenPlan.dc.html (dort 20 Einheiten = 1 m).
 */
import { difference } from '../geometry/clip';
import { footprint } from '../geometry/objects';
import { flatToRegion, polygonPath, simpleRegion } from '../geometry/regions';
import { flattenRegion } from '../geometry/shape';
import { createProject, layerOfKind, objectBase } from '../model/defaults';
import { newDrip, newFixture, newLamp, newPipe } from '../model/factory';
import { autoDripPath } from '../irrigation';
import { sprinklersFor } from '../irrigationLayout';
import { cubicAt, cubicDerivative } from '../geometry/bezier';
import { pathSegments } from '../geometry/shape';
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

export const KIESWEG_CENTERLINE: PathGeometry = {
  kind: 'path',
  closed: false,
  source: 'bezier',
  nodes: [
    { p: P(16, 14), out: P(5, 0) },
    { p: P(27, 20), in: P(-5.5, 0), out: P(5.5, 0), smooth: true },
    { p: P(36, 8.5), in: P(-4, 1.5), out: P(3, -1.1), smooth: true },
    { p: P(44, 6.5), in: P(-2, 1) },
  ],
};

const POND: PathGeometry = {
  kind: 'path',
  closed: true,
  source: 'bezier',
  nodes: [
    { p: P(30.5, 22), in: P(-0.75, 0.9), out: P(1, -1.1) },
    { p: P(36.25, 21.4), in: P(-1.75, -0.8), out: P(1.35, 0.6) },
    { p: P(36.75, 25), in: P(0.85, -1), out: P(-1.15, 1.25) },
    { p: P(31.1, 25.5), in: P(1.4, 0.75), out: P(-1.1, -0.7) },
  ],
};

const PERENNIAL_BED: PathGeometry = {
  kind: 'path',
  closed: true,
  source: 'bezier',
  nodes: [
    { p: P(11.4, 22) },
    { p: P(16.5, 22), out: P(3.5, 0) },
    { p: P(23.5, 26), in: P(-1.5, -2.5), out: P(0.5, 1.25) },
    { p: P(22, 28.6), in: P(1.5, 0) },
    { p: P(12, 28.6), out: P(-0.4, 0) },
    { p: P(11.4, 27.9), in: P(0, 0.4) },
  ],
};

export function createLindenweg12(): Project {
  const p = createProject({
    name: 'Garten Lindenweg 12',
    plot: { kind: 'rect', width: 50, depth: 30 },
    northDeg: -12,
    location: { lat: 50.1488, lon: 8.6247, label: 'Lindenweg 12, Frankfurt', place: 'Frankfurt am Main', timeZone: 'Europe/Berlin' },
  });
  const L = (k: LayerKind) => layerOfKind(p, k).id;
  const add = (o: PlanObject) => {
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

  // Wege & Teich zuerst bauen: der Rasen wird um sie herum ausgeschnitten
  const kiesweg: PathObject = {
    ...objectBase(L('paths')),
    type: 'path',
    name: 'Kiesweg',
    centerline: KIESWEG_CENTERLINE,
    width: 1.2,
    join: 'round',
    materialId: 'gravel',
    edging: { catalogId: 'edge.kantenstein-8x20', sides: 'both' },
    notes: [{ id: 'n1', author: 'MS', text: 'Kante zum Rasen in Cortenstahl? Angebot bei GaLaBau Weber anfragen.', createdAt: '2026-10-06T09:00:00.000Z' }],
  };
  const teich = area('Teich', simpleRegion(POND), 'water');
  const deck = area('Holzdeck', simpleRegion(rect(29.85, 24.15, 3.1, 3.5)), 'wood');
  const beet: PlantingObject = {
    ...objectBase(L('plants')),
    type: 'planting',
    name: 'Staudenbeet',
    region: simpleRegion(PERENNIAL_BED),
    mix: [
      { speciesId: 'salvia', share: 0.3 },
      { speciesId: 'geranium', share: 0.25 },
      { speciesId: 'stipa', share: 0.2 },
      { speciesId: 'sedum', share: 0.15 },
      { speciesId: 'allium', share: 0.1 },
    ],
    perSquareMeter: 7,
    mulchMaterialId: 'mulch',
  };

  // Rasen Nord: L-förmig um die Hochbeetfläche, abzüglich Weg, Teich, Deck
  const lawnShape = polygonPath([P(16, 1.1), P(49.25, 1.1), P(49.25, 12.4), P(39.25, 12.4), P(39.25, 28.9), P(16, 28.9)]);
  const cut = [kiesweg, teich, deck].flatMap((o) => footprint(o));
  const lawnRegions = difference([flattenRegion(simpleRegion(lawnShape))], cut);

  add(area('Zugang', simpleRegion(rect(7.95, 3.3, 15.9, 6.6)), 'gravel'));
  lawnRegions.forEach((r, i) => add(area(i === 0 ? 'Rasen' : `Rasen ${i + 1}`, flatToRegion(r), 'lawn')));
  add(area('Rasen Süd', simpleRegion(rect(5.75, 25.7, 10.7, 7.8, 0.5)), 'lawn'));
  add(area('Kiesfläche Hochbeete', simpleRegion(rect(44.425, 20.85, 9.65, 16.1, 0.4)), 'gravel', { catalogId: 'edge.kantenstein-8x20', sides: 'outline' }));
  add(area('Terrasse', simpleRegion(rect(13.5, 14, 5, 14)), 'paving'));
  add(teich);
  add(deck);
  add(kiesweg);
  add(beet);

  const hedge: HedgeObject = {
    ...objectBase(L('plants')),
    type: 'hedge',
    name: 'Hainbuchenhecke',
    centerline: { kind: 'path', closed: false, source: 'polygon', nodes: [P(16.5, 0.4), P(49.6, 0.4), P(49.6, 29.6), P(0.3, 29.6)].map((q) => ({ p: q })) },
    speciesId: 'carpinus-hedge',
    plantedYear: 2026,
    height: 1.8,
    plantsPerMeter: 3,
  };
  add(hedge);

  const plant = (speciesId: string, x: number, y: number, d: number | null, name: string | null = null, year = 2026): PlantObject => ({
    ...objectBase(L('plants')),
    type: 'plant',
    name,
    speciesId,
    position: P(x, y),
    plantedYear: year,
    plantedDiameter: d,
  });
  add(plant('tilia-cordata', 27, 7, 10.4, 'Winterlinde', 1996));
  add(plant('malus-topaz', 38.5, 4.75, 3.0, 'Apfel'));
  add(plant('prunus-serrulata', 36, 16.5, 3.4, 'Zierkirsche'));
  const SHRUBS: [number, number, number][] = [
    [17.5, 2.6, 2.6], [48.25, 8.5, 2.2], [25.25, 27.8, 2.4], [30.6, 28.3, 2.0], [13.1, 25.9, 2.6],
    [22.6, 27.6, 2.0], [39.4, 10.7, 1.8], [2, 23.5, 2.4], [6, 28, 2.2], [9.5, 23.5, 2.0],
  ];
  SHRUBS.forEach(([x, y, d], i) => add(plant(i % 2 ? 'viburnum' : 'hydrangea', x, y, d)));

  const item = (catalogId: string, x: number, y: number, rot = 0, size: ItemObject['size'] = null, name: string | null = null): ItemObject => ({
    ...objectBase(L('build')),
    type: 'item',
    name,
    catalogId,
    position: P(x, y),
    rotationDeg: rot,
    size,
  });
  add(item('house', 6, 14));
  add(item('shed-4x4', 45, 4, 0, null, 'Gartenhaus'));
  add(item('compost-2', 48.375, 3.25, 0, null, 'Kompost'));
  add(item('rain-barrel', 47.4, 5.6));
  add(item('greenhouse-4x3.5', 46, 26.25, 0, null, 'Gewächshaus'));
  [[42.5, 15.1], [46.5, 15.1], [42.5, 17.6], [46.5, 17.6], [42.5, 20.1], [46.5, 20.1]].forEach(([x, y]) => add(item('raised-bed-300x120', x, y)));
  add(item('table-6', 13.45, 10.85, 0, { width: 1.7, depth: 3.1, height: 0.75 }));
  add(item('lounger', 12.95, 16.875));
  add(item('lounger', 12.95, 17.975));
  add(item('planter', 15.45, 7.65));
  add(item('planter', 15.45, 20.45));

  const text = (t: string, x: number, y: number, size = 0.65): TextObject => ({
    ...objectBase(L('annotation')),
    type: 'text',
    position: P(x, y),
    text: t,
    style: 'label',
    sizeM: size,
    rotationDeg: 0,
  });
  add(text('Terrasse', 13.5, 15));
  add(text('Rasen', 19.75, 11.1, 0.75));
  add(text('Winterlinde', 27, 13.6));
  add(text('Kiesweg', 23.5, 21.6, 0.6));
  add(text('Teich', 34.1, 23.7));
  add(text('Hochbeete', 44.5, 22.4, 0.6));
  add(text('Staudenbeet', 17.25, 24.6, 0.6));
  add(text('Zugang', 6, 1.5, 0.6));

  const dim = (a: Vec2, b: Vec2, offset: number): DimensionObject => ({
    ...objectBase(L('annotation')),
    type: 'dimension',
    a: { kind: 'free', p: a },
    b: { kind: 'free', p: b },
    offset,
  });
  add(dim(P(0, 0), P(50, 0), -1.2));
  add(dim(P(50, 0), P(50, 30), -1.2));

  addLighting(p, add);
  addIrrigation(p, add);
  return p;
}

/** Beleuchtung aus Screen 03: Poller am Kiesweg, Wand- und Wegeleuchten, Lichterkette, Strahler */
function addLighting(p: Project, add: (o: PlanObject) => PlanObject) {
  const lamp = (t: LampType, x: number, y: number, extra: Partial<LampObject> = {}) => add({ ...newLamp(p, t, P(x, y)), ...extra });
  // Poller links und rechts entlang des Kieswegs, 1,3 m neben der Mittellinie
  const segs = pathSegments(KIESWEG_CENTERLINE);
  ([[0, 0.3, 1], [0, 0.78, -1], [1, 0.22, 1], [1, 0.58, -1], [1, 0.93, 1], [2, 0.55, -1]] as const).forEach(([si, t, side]) => {
    const c = cubicAt(segs[si], t);
    const d = cubicDerivative(segs[si], t);
    const l = Math.hypot(d.x, d.y);
    lamp('bollard', c.x - (d.y / l) * side * 1.3, c.y + (d.x / l) * side * 1.3, { name: 'Poller' });
  });
  lamp('wall', 11.15, 8.8, { name: 'Wandleuchte', directionDeg: 102 });
  lamp('wall', 11.15, 19.2, { name: 'Wandleuchte', directionDeg: 102 });
  lamp('pathLight', 28.5, 22.6);
  lamp('pathLight', 28.5, 25.7);
  lamp('underwater', 33.4, 23.5, { name: 'Unterwasserlicht' });
  // Strahler: Richtung als Kompasswinkel (Plan um −12° gedreht)
  lamp('treeUplight', 22.75, 11.25, { name: 'Baumstrahler', directionDeg: 57, beamAngleDeg: 36, lumen: 480 });
  lamp('spot', 41.9, 10.3, { name: 'Spot Gartenhaus', directionDeg: 38, beamAngleDeg: 34, lumen: 600 });
  lamp('spot', 34.5, 18.6, { name: 'Spot Zierkirsche', directionDeg: 49, beamAngleDeg: 56, lumen: 400 });
  const zig: [number, number][] = [[11.1, 8], [15.9, 9.75], [11.1, 11.5], [15.9, 13.25], [11.1, 15], [15.9, 16.75], [11.1, 18.5], [15.9, 20.25]];
  add({ ...newLamp(p, 'stringLights', P(11.1, 8), { kind: 'path', closed: false, source: 'polygon', nodes: zig.map(([x, y]) => ({ p: P(x, y) })) }), name: 'Lichterkette Terrasse' });
}

/** Bewässerung aus Screen 09: Versenkregner (Zonen 1/2), Tropfschläuche (3/4), Hauptleitung, Verteiler */
function addIrrigation(p: Project, add: (o: PlanObject) => PlanObject) {
  const line = (pts: [number, number][]): PathGeometry => ({ kind: 'path', closed: false, source: 'polygon', nodes: pts.map(([x, y]) => ({ p: P(x, y) })) });
  // Regner Kopf an Kopf über alle Rasenflächen; Zone 1 = nördlicher Rasen, Zone 2 = südlicher
  for (const o of Object.values(p.objects)) {
    if (o.type !== 'area' || o.materialId !== 'lawn') continue;
    for (const r of footprint(o)) for (const sp of sprinklersFor(p, r, 1)) add({ ...sp, zone: sp.position.y < 14 ? 1 : 2 });
  }
  // Tropfschläuche: Ring in jedem Hochbeet, Mäander im Staudenbeet
  [[42.5, 15.1], [46.5, 15.1], [42.5, 17.6], [46.5, 17.6], [42.5, 20.1], [46.5, 20.1]].forEach(([x, y]) =>
    add({ ...newDrip(p, line([[x - 1.2, y - 0.3], [x + 1.2, y - 0.3], [x + 1.2, y + 0.3], [x - 1.2, y + 0.3], [x - 1.2, y - 0.25]]), 3), name: 'Tropfschlauch Hochbeet' }),
  );
  const beet = Object.values(p.objects).find((o) => o.type === 'planting');
  if (beet) {
    const meander = autoDripPath(footprint(beet)[0], 0.55);
    if (meander.length >= 2) add({ ...newDrip(p, { kind: 'path', closed: false, source: 'polygon', nodes: meander.map((q) => ({ p: q })) }, 4), name: 'Tropfschlauch Staudenbeet' });
  }
  add(newPipe(p, line([[11.4, 7.6], [16.5, 7.6], [16.5, 13.1], [39, 13.1]])));
  add(newPipe(p, line([[16.5, 13.1], [16.5, 22.3]])));
  add(newPipe(p, line([[40.05, 13.1], [40.6, 13.1], [40.6, 20.5]])));
  add(newFixture(p, 'tap', P(11.4, 7.6)));
  add(newFixture(p, 'manifold', P(39.5, 13.1)));
}
