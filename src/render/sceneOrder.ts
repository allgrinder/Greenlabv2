/** Szenengraph-Reihenfolge: Ebenen-Container, Effektebenen und Zeichenreihenfolge der Objekte */
import { Container } from 'pixi.js';
import { getSpecies } from '../core/catalog/plants';
import type { Id, PlanObject, Project } from '../core/model/types';
import type { ObjectView } from './views/objectView';

/** eingehängte Ansicht eines Objekts */
export interface Mounted {
  ref: PlanObject;
  view: ObjectView;
  key: string;
}

export const PLANT_TYPES = new Set<PlanObject['type']>(['plant', 'hedge', 'planting', 'scatter', 'espalier']);

/** Zeichenreihenfolge in der Pflanzenebene: niedrig vor hoch (stabil innerhalb einer Stufe) */
export function heightRank(o: PlanObject | undefined): number {
  if (!o) return 0;
  if (o.type === 'planting' || o.type === 'scatter') return 0;
  if (o.type === 'hedge') return 2;
  if (o.type === 'espalier') return 3;
  if (o.type === 'plant') {
    const k = getSpecies(o.speciesId).kind;
    return k === 'tree' ? 5 : k === 'shrub' || k === 'espalier' || k === 'hedge' ? 4 : 1;
  }
  return 1;
}

/** Container der Effektebenen, die zwischen den Planebenen liegen */
export interface EffectContainers {
  edge: Container;
  heat: Container;
  shadow: Container;
  gap: Container;
  solids: Container;
  privacy: Container;
}

/** Ebenen-Container anlegen/entfernen und mit den Effektebenen in die Welt einsortieren */
export function syncLayers(doc: Project, layers: Map<Id, Container>, world: Container, fx: EffectContainers) {
  for (const [id, c] of layers) {
    if (!doc.layers[id]) {
      c.destroy({ children: true });
      layers.delete(id);
    }
  }
  const order: Container[] = [];
  for (const id of doc.layerOrder) {
    let c = layers.get(id);
    if (!c) {
      c = new Container();
      c.label = `layer:${doc.layers[id].kind}`;
      layers.set(id, c);
    }
    // Heatmap und Schatten liegen direkt unter den Pflanzen (über Flächen und Wegen)
    // Rasenkanten über Flächen und Wegen; Heatmap und Schatten direkt unter den Pflanzen
    if (doc.layers[id].kind === 'plants') order.push(fx.edge, fx.heat, fx.shadow);
    order.push(c);
    // Bewässerungslücken über der Bewässerungsebene
    if (doc.layers[id].kind === 'water') order.push(fx.gap);
  }
  order.push(fx.solids, fx.privacy);
  const base = 3; // ground, groundTex, background
  order.forEach((c, i) => {
    if (c.parent !== world) world.addChild(c);
    world.setChildIndex(c, base + i);
  });
}

/** Objektknoten je Ebene in Zeichenreihenfolge bringen; Körper der Schrägansicht nach Tiefe sortieren */
export function orderNodes(doc: Project, mounted: Map<Id, Mounted>, layers: Map<Id, Container>, bed: Container, solidsC: Container) {
  // Reihenfolge je Ebene herstellen
  const bedLayer = doc.layerOrder.find((id) => doc.layers[id].kind === 'plants');
  for (const lid of doc.layerOrder) {
    const layer = doc.layers[lid];
    const c = layers.get(lid)!;
    // Pflanzen: Bodendecker und Stauden unter Hecken, Spalieren, Sträuchern und Kronen
    const sorted = layer.kind === 'plants' ? [...layer.objectOrder].sort((a, b) => heightRank(doc.objects[a]) - heightRank(doc.objects[b])) : layer.objectOrder;
    // Körper der Schrägansicht liegen im gemeinsamen Tiefen-Container
    const order = sorted.filter((id) => mounted.get(id)?.view.depth === undefined);
    // Rasenhalme über den Beeträndern: nach Pflanzflächen und Streupflanzungen, vor Sträuchern und Kronen
    const bedAt = lid === bedLayer ? order.filter((id) => mounted.has(id) && heightRank(doc.objects[id]) === 0).length : -1;
    order.filter((id) => mounted.has(id)).forEach((id, j) => {
      const i = bedAt >= 0 && j >= bedAt ? j + 1 : j;
      const m = mounted.get(id)!;
      if (m.view.node.parent !== c) c.addChild(m.view.node);
      if (c.getChildIndex(m.view.node) !== i) c.setChildIndex(m.view.node, Math.min(i, c.children.length - 1));
    });
    if (bedAt >= 0) {
      if (bed.parent !== c) c.addChild(bed);
      if (c.getChildIndex(bed) !== bedAt) c.setChildIndex(bed, Math.min(bedAt, c.children.length - 1));
    }
  }
  const solids = [...mounted.values()].filter((m) => m.view.depth !== undefined).sort((a, b) => a.view.depth! - b.view.depth!);
  solids.forEach((m, i) => {
    if (m.view.node.parent !== solidsC) solidsC.addChild(m.view.node);
    if (solidsC.getChildIndex(m.view.node) !== i) solidsC.setChildIndex(m.view.node, Math.min(i, solidsC.children.length - 1));
  });
}
