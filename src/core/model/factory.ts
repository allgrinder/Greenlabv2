/**
 * Erzeugt neue Planobjekte mit sinnvollen Vorgaben. Rein und testbar; die Werkzeuge
 * und die Bibliothek rufen nur diese Funktionen auf und reichen das Ergebnis an cmd.addObject.
 */
import { getItem } from '../catalog/items';
import { getSpecies } from '../catalog/plants';
import { getLamp } from '../catalog/lamps';
import { defaultLayerKind, layerOfKind, objectBase } from './defaults';
import type {
  AreaObject,
  DimensionObject,
  DripObject,
  FixtureObject,
  LampObject,
  LampType,
  PipeObject,
  SprinklerObject,
  HedgeObject,
  EspalierObject,
  ScatterObject,
  ScatterPlant,
  ItemObject,
  LayerKind,
  PathGeometry,
  PathObject,
  PlanObject,
  PlantObject,
  Project,
  Region,
  TextObject,
  Vec2,
} from './types';

const layerFor = (doc: Project, kind: LayerKind) => layerOfKind(doc, kind).id;

export function newArea(doc: Project, region: Region, materialId: string): AreaObject {
  return { ...objectBase(layerFor(doc, 'areas')), type: 'area', region, materialId, edging: null };
}

export function newPath(doc: Project, centerline: PathGeometry, width: number, materialId: string): PathObject {
  return { ...objectBase(layerFor(doc, 'paths')), type: 'path', centerline: { ...centerline, closed: false }, width, join: 'round', materialId, edging: null };
}

/** Spalierreihe; Dachspalier (Platane) mit breitem, niedrigem Schirm */
export function newEspalier(doc: Project, centerline: PathGeometry, speciesId = 'photinia-espalier'): EspalierObject {
  const roof = speciesId === 'platanus-roof';
  const sp = getSpecies(speciesId);
  return {
    ...objectBase(layerFor(doc, 'plants')),
    type: 'espalier',
    centerline: { ...centerline, closed: false },
    speciesId,
    plantedYear: new Date().getFullYear(),
    spacing: roof ? 2.5 : 1.5,
    stemHeight: roof ? 2.2 : 1.8,
    height: roof ? 2.6 : sp.heightMature,
    depth: roof ? 2.2 : 0.45,
    form: roof ? 'roof' : 'flat',
  };
}

export function newScatter(doc: Project, plants: ScatterPlant[]): ScatterObject {
  return { ...objectBase(layerFor(doc, 'plants')), type: 'scatter', plants };
}

export function newHedge(doc: Project, centerline: PathGeometry, speciesId = 'carpinus-hedge'): HedgeObject {
  return { ...objectBase(layerFor(doc, 'plants')), type: 'hedge', centerline: { ...centerline, closed: false }, speciesId, plantedYear: new Date().getFullYear(), height: 1.8, plantsPerMeter: 3 };
}

export function newPlant(doc: Project, speciesId: string, position: Vec2): PlantObject {
  getSpecies(speciesId); // wirft bei unbekannter Art
  return { ...objectBase(layerFor(doc, 'plants')), type: 'plant', speciesId, position: { ...position }, plantedYear: new Date().getFullYear(), plantedDiameter: null };
}

/**
 * Katalogobjekt platzieren. Manche Einträge (Terrasse, Teich) werden als Fläche angelegt,
 * Hecken als Heckenlinie über die Katalogbreite.
 */
export function newFromCatalog(doc: Project, catalogId: string, position: Vec2): PlanObject {
  const it = getItem(catalogId);
  if (it.creates !== 'item') {
    const region: Region = {
      outer:
        it.category === 'pond'
          ? {
              kind: 'path',
              closed: true,
              source: 'bezier',
              nodes: ellipseNodes(position, it.width / 2, it.depth / 2),
            }
          : { kind: 'rect', center: { ...position }, width: it.width, depth: it.depth, rotationDeg: 0, cornerRadius: 0 },
      holes: [],
    };
    return { ...newArea(doc, region, it.creates.area), name: it.name.split(',')[0] };
  }
  const o: ItemObject = { ...objectBase(layerFor(doc, it.defaultLayer)), type: 'item', catalogId, position: { ...position }, rotationDeg: 0, size: null };
  return o;
}

/** Ellipse aus vier Bézier-Knoten */
export function ellipseNodes(c: Vec2, rx: number, ry: number) {
  const k = 0.5522847498;
  return [
    { p: { x: c.x + rx, y: c.y }, in: { x: 0, y: -k * ry }, out: { x: 0, y: k * ry }, smooth: true },
    { p: { x: c.x, y: c.y + ry }, in: { x: k * rx, y: 0 }, out: { x: -k * rx, y: 0 }, smooth: true },
    { p: { x: c.x - rx, y: c.y }, in: { x: 0, y: k * ry }, out: { x: 0, y: -k * ry }, smooth: true },
    { p: { x: c.x, y: c.y - ry }, in: { x: -k * rx, y: 0 }, out: { x: k * rx, y: 0 }, smooth: true },
  ];
}

export function newDimension(doc: Project, a: Vec2, b: Vec2, offset: number): DimensionObject {
  return { ...objectBase(layerFor(doc, 'annotation')), type: 'dimension', a: { kind: 'free', p: { ...a } }, b: { kind: 'free', p: { ...b } }, offset };
}

export function newText(doc: Project, position: Vec2, text = 'Beschriftung', sizeM = 0.6): TextObject {
  return { ...objectBase(layerFor(doc, 'annotation')), type: 'text', position: { ...position }, text, style: 'label', sizeM, rotationDeg: 0 };
}

/** Standard-Ebene für einen Objekttyp im Projekt */
export const layerIdFor = (doc: Project, o: Pick<PlanObject, 'type'>) => layerFor(doc, defaultLayerKind(o));

/** Leuchte mit den Vorgaben ihres Typs; Lichterketten bekommen einen Verlauf */
export function newLamp(doc: Project, lampType: LampType, position: Vec2, path: PathGeometry | null = null): LampObject {
  const spec = getLamp(lampType);
  return {
    ...objectBase(layerFor(doc, 'light')),
    type: 'lamp',
    lampType,
    position: path ? { ...path.nodes[0].p } : { ...position },
    lumen: spec.lumen,
    kelvin: spec.kelvin,
    beamAngleDeg: spec.beamDeg,
    directionDeg: 0,
    path: path ? { ...path, closed: false } : null,
    schedule: { from: 'dusk', to: '23:30', weekdays: [true, true, true, true, true, true, true] },
    on: true,
  };
}

export function newSprinkler(doc: Project, position: Vec2, zone = 1, radius = 6.5, arc: [number, number] = [0, 360]): SprinklerObject {
  return { ...objectBase(layerFor(doc, 'water')), type: 'sprinkler', position: { ...position }, radius, arcStartDeg: arc[0], arcEndDeg: arc[1], flowLpm: 6, zone };
}

export function newDrip(doc: Project, path: PathGeometry, zone = 3): DripObject {
  return { ...objectBase(layerFor(doc, 'water')), type: 'drip', path: { ...path, closed: false }, lphPerMeter: 6.7, wetWidth: 0.6, zone };
}

export function newPipe(doc: Project, path: PathGeometry, kind: PipeObject['kind'] = 'water'): PipeObject {
  return { ...objectBase(layerFor(doc, 'pipes')), type: 'pipe', path: { ...path, closed: false }, kind, diameterMm: kind === 'water' ? 32 : 0 };
}

export function newFixture(doc: Project, kind: FixtureObject['kind'], position: Vec2): FixtureObject {
  return { ...objectBase(layerFor(doc, 'water')), type: 'fixture', kind, position: { ...position }, valves: kind === 'manifold' ? 4 : 0 };
}
