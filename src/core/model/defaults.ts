import { boundaryFromPlot } from '../geometry/plot';
import { newId } from './ids';
import {
  SCHEMA_VERSION,
  type GeoLocation,
  type IrrigationZone,
  type Layer,
  type LayerKind,
  type PlanObject,
  type PlotSpec,
  type Project,
  type ProjectSettings,
} from './types';

/** Ebenen gemäß Design (Chrome.dc.html), Reihenfolge = Zeichenreihenfolge unten → oben */
export const DEFAULT_LAYERS: { kind: LayerKind; name: string; color: string }[] = [
  { kind: 'plot', name: 'Grundstück', color: '#2D3033' },
  { kind: 'areas', name: 'Flächen', color: '#9BAE74' },
  { kind: 'paths', name: 'Wege', color: '#D3CAB8' },
  { kind: 'plants', name: 'Pflanzen', color: '#6D8656' },
  { kind: 'build', name: 'Gebäude & Möbel', color: '#8A745E' },
  { kind: 'light', name: 'Beleuchtung', color: '#E9B45E' },
  { kind: 'water', name: 'Bewässerung', color: '#2F76B8' },
  { kind: 'pipes', name: 'Leitungen', color: '#B9724F' },
  { kind: 'annotation', name: 'Beschriftung', color: '#5D615D' },
];

export const DEFAULT_SETTINGS: ProjectSettings = {
  gridStepM: 0.5,
  snapToGrid: true,
  snapToGeometry: true,
  scaleDenominator: 100,
  currency: 'EUR',
};

/** Vier Bewässerungszonen wie im Design (Screen 09) */
export function defaultZones(): IrrigationZone[] {
  return [
    { id: newId(), name: 'Rasen Nord', start: '06:00', minutes: 18 },
    { id: newId(), name: 'Rasen Süd', start: '06:20', minutes: 18 },
    { id: newId(), name: 'Hochbeete', start: '07:00', minutes: 30 },
    { id: newId(), name: 'Staudenbeet', start: '07:30', minutes: 25 },
  ];
}

export interface NewProjectInput {
  name: string;
  plot: PlotSpec;
  northDeg?: number;
  location?: GeoLocation | null;
}

export function createProject(input: NewProjectInput, now = new Date()): Project {
  const layers: Record<string, Layer> = {};
  const layerOrder: string[] = [];
  for (const l of DEFAULT_LAYERS) {
    const id = newId();
    layers[id] = { id, kind: l.kind, name: l.name, color: l.color, visible: true, locked: false, objectOrder: [] };
    layerOrder.push(id);
  }
  const ts = now.toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId(),
    name: input.name,
    createdAt: ts,
    updatedAt: ts,
    site: {
      plot: input.plot,
      boundary: boundaryFromPlot(input.plot),
      northDeg: input.northDeg ?? 0,
      location: input.location ?? null,
    },
    background: null,
    layerOrder,
    layers,
    objects: {},
    priceOverrides: {},
    settings: { ...DEFAULT_SETTINGS },
    zones: defaultZones(),
    observers: [],
  };
}

export function layerOfKind(p: Project, kind: LayerKind): Layer {
  const l = p.layerOrder.map((id) => p.layers[id]).find((x) => x.kind === kind);
  if (!l) throw new Error(`Ebene ${kind} fehlt`);
  return l;
}

/** Standard-Ebene je Objekttyp */
export function defaultLayerKind(o: Pick<PlanObject, 'type'>): LayerKind {
  switch (o.type) {
    case 'area':
      return 'areas';
    case 'path':
      return 'paths';
    case 'plant':
    case 'planting':
    case 'hedge':
    case 'espalier':
    case 'scatter':
      return 'plants';
    case 'item':
      return 'build';
    case 'lamp':
      return 'light';
    case 'sprinkler':
    case 'drip':
    case 'fixture':
      return 'water';
    case 'pipe':
      return 'pipes';
    case 'dimension':
    case 'text':
      return 'annotation';
  }
}

export const objectBase = (layerId: string) => ({
  id: newId(),
  layerId,
  name: null,
  locked: false,
  hidden: false,
  elevation: 0,
  notes: [],
});
