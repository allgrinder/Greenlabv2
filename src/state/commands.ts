/**
 * Benannte Commands. Jede Funktion ist eine dünne Hülle um `apply` und erzeugt genau
 * einen Undo-Schritt (bzw. fasst eine Geste über `mergeKey` zusammen).
 */
import type { Draft } from 'immer';
import { difference, union } from '../core/geometry/clip';
import { footprint } from '../core/geometry/objects';
import { flatToRegion } from '../core/geometry/regions';
import { boundaryFromPlot } from '../core/geometry/plot';
import { newId } from '../core/model/ids';
import { deleteNode, insertNode, setHandle, setNode, translateObject } from '../core/model/transform';
import type {
  AreaObject,
  BackgroundImage,
  Id,
  PlanObject,
  PlotSpec,
  Project,
  ProjectSettings,
  Site,
  Vec2,
} from '../core/model/types';
import type { EditorStoreApi } from './store';

/** Rückgabewerte werden verworfen, damit Kurzschreibweisen (`a && f()`) kein Immer-Ergebnis liefern */
type Recipe = (d: Draft<Project>) => unknown;

export function createCommands(store: EditorStoreApi) {
  const apply = (label: string, r: Recipe, mergeKey?: string) =>
    store.getState().apply(
      label,
      (d) => {
        r(d);
      },
      { mergeKey },
    );
  const name = (o: PlanObject) => o.name ?? 'Objekt';

  function detach(d: Draft<Project>, id: Id) {
    const o = d.objects[id];
    if (!o) return;
    const l = d.layers[o.layerId];
    if (l) l.objectOrder = l.objectOrder.filter((x) => x !== id);
    delete d.objects[id];
  }

  return {
    addObject(o: PlanObject, select = true) {
      apply(`${name(o)} hinzufügen`, (d) => {
        d.objects[o.id] = o as Draft<PlanObject>;
        d.layers[o.layerId].objectOrder.push(o.id);
      });
      if (select) store.getState().setSession({ selection: [o.id] });
    },

    deleteObjects(ids: Id[]) {
      if (!ids.length) return;
      apply(ids.length === 1 ? 'Objekt löschen' : `${ids.length} Objekte löschen`, (d) => ids.forEach((id) => detach(d, id)));
    },

    duplicateObjects(ids: Id[], offset: Vec2 = { x: 1, y: 1 }) {
      const doc = store.getState().doc;
      if (!doc || !ids.length) return;
      const copies = ids
        .map((id) => doc.objects[id])
        .filter(Boolean)
        .map((o) => {
          const c = structuredClone(o) as PlanObject;
          c.id = newId();
          translateObject(c, offset);
          return c;
        });
      apply('Duplizieren', (d) => {
        for (const c of copies) {
          d.objects[c.id] = c as Draft<PlanObject>;
          d.layers[c.layerId].objectOrder.push(c.id);
        }
      });
      store.getState().setSession({ selection: copies.map((c) => c.id) });
    },

    moveObjects(ids: Id[], delta: Vec2, mergeKey?: string) {
      apply('Verschieben', (d) => ids.forEach((id) => d.objects[id] && !d.objects[id].locked && translateObject(d.objects[id] as PlanObject, delta)), mergeKey);
    },

    setNode(id: Id, index: number, p: Vec2, mergeKey?: string) {
      apply('Punkt bearbeiten', (d) => d.objects[id] && setNode(d.objects[id] as PlanObject, index, p), mergeKey);
    },

    setHandle(id: Id, index: number, which: 'in' | 'out', h: Vec2 | null, mergeKey?: string) {
      apply('Kurvengriff bearbeiten', (d) => d.objects[id] && setHandle(d.objects[id] as PlanObject, index, which, h), mergeKey);
    },

    insertNode(id: Id, afterIndex: number, p: Vec2) {
      apply('Punkt einfügen', (d) => d.objects[id] && insertNode(d.objects[id] as PlanObject, afterIndex, p));
    },

    deleteNode(id: Id, index: number) {
      apply('Punkt löschen', (d) => d.objects[id] && deleteNode(d.objects[id] as PlanObject, index));
    },

    /** Generische Eigenschaftsänderung, z. B. Material, Breite, Höhe */
    updateObject<T extends PlanObject>(id: Id, label: string, fn: (o: Draft<T>) => unknown, mergeKey?: string) {
      apply(label, (d) => d.objects[id] && fn(d.objects[id] as Draft<T>), mergeKey);
    },

    moveToLayer(ids: Id[], layerId: Id) {
      apply('Ebene ändern', (d) => {
        for (const id of ids) {
          const o = d.objects[id];
          if (!o || o.layerId === layerId) continue;
          const from = d.layers[o.layerId];
          from.objectOrder = from.objectOrder.filter((x) => x !== id);
          d.layers[layerId].objectOrder.push(id);
          o.layerId = layerId;
        }
      });
    },

    /** Zeichenreihenfolge innerhalb der Ebene: nach vorne (+1) / hinten (−1) / ganz nach vorne/hinten */
    reorderObject(id: Id, where: 'forward' | 'backward' | 'front' | 'back') {
      apply('Reihenfolge ändern', (d) => {
        const o = d.objects[id];
        if (!o) return;
        const order = d.layers[o.layerId].objectOrder;
        const i = order.indexOf(id);
        order.splice(i, 1);
        const j = where === 'front' ? order.length : where === 'back' ? 0 : Math.max(0, Math.min(order.length, i + (where === 'forward' ? 1 : -1)));
        order.splice(j, 0, id);
      });
    },

    setLayerVisible(layerId: Id, visible: boolean) {
      apply(visible ? 'Ebene einblenden' : 'Ebene ausblenden', (d) => {
        d.layers[layerId].visible = visible;
      });
    },

    setLayerLocked(layerId: Id, locked: boolean) {
      apply(locked ? 'Ebene sperren' : 'Ebene entsperren', (d) => {
        d.layers[layerId].locked = locked;
      });
    },

    moveLayer(layerId: Id, toIndex: number) {
      apply('Ebenen-Reihenfolge', (d) => {
        const i = d.layerOrder.indexOf(layerId);
        if (i < 0) return;
        d.layerOrder.splice(i, 1);
        d.layerOrder.splice(Math.max(0, Math.min(d.layerOrder.length, toIndex)), 0, layerId);
      });
    },

    /**
     * Flächen vereinigen bzw. abziehen. Das erste Objekt der Auswahl bleibt (Material, Ebene),
     * die übrigen werden beim Vereinigen entfernt und beim Abziehen ausgeschnitten.
     * Zerfällt das Ergebnis in mehrere Teile, entstehen zusätzliche Flächen.
     */
    booleanOp(ids: Id[], op: 'union' | 'subtract') {
      const doc = store.getState().doc;
      if (!doc || ids.length < 2) return;
      const objs = ids.map((id) => doc.objects[id]).filter((o): o is AreaObject => o?.type === 'area');
      if (objs.length < 2) return;
      const [target, ...others] = objs;
      const result =
        op === 'union'
          ? union(objs.flatMap((o) => footprint(o)))
          : difference(footprint(target), others.flatMap((o) => footprint(o)));
      const extraIds = result.slice(1).map(() => newId());
      apply(op === 'union' ? 'Flächen vereinigen' : 'Fläche abziehen', (d) => {
        if (!result.length) {
          detach(d, target.id);
        } else {
          (d.objects[target.id] as Draft<AreaObject>).region = flatToRegion(result[0]);
          result.slice(1).forEach((r, i) => {
            const copy = { ...structuredClone(target), id: extraIds[i], region: flatToRegion(r) };
            d.objects[copy.id] = copy;
            const order = d.layers[target.layerId].objectOrder;
            order.splice(order.indexOf(target.id) + 1 + i, 0, copy.id);
          });
        }
        if (op === 'union') others.forEach((o) => detach(d, o.id));
      });
      store.getState().setSession({ selection: result.length ? [target.id, ...extraIds] : [] });
    },

    setPlot(plot: PlotSpec) {
      apply('Grundstück ändern', (d) => {
        d.site.plot = plot;
        d.site.boundary = boundaryFromPlot(plot);
      });
    },

    updateSite(patch: Partial<Omit<Site, 'plot' | 'boundary'>>, mergeKey?: string) {
      apply('Standort ändern', (d) => Object.assign(d.site, patch), mergeKey);
    },

    setBackground(bg: BackgroundImage | null) {
      apply(bg ? 'Hintergrund setzen' : 'Hintergrund entfernen', (d) => {
        d.background = bg;
      });
    },

    updateBackground(patch: Partial<BackgroundImage>, mergeKey?: string) {
      apply('Hintergrund anpassen', (d) => d.background && Object.assign(d.background, patch), mergeKey);
    },

    updateSettings(patch: Partial<ProjectSettings>) {
      apply('Einstellungen', (d) => Object.assign(d.settings, patch));
    },

    setPrice(key: string, price: number | null) {
      apply('Preis ändern', (d) => {
        if (price === null) delete d.priceOverrides[key];
        else d.priceOverrides[key] = price;
      });
    },

    renameProject(nameStr: string) {
      apply('Projekt umbenennen', (d) => {
        d.name = nameStr;
      });
    },
  };
}

export type Commands = ReturnType<typeof createCommands>;
