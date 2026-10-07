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
  IrrigationZone,
  Observer,
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
  const TYPE: Record<PlanObject['type'], string> = { sprinkler: 'Regner', drip: 'Tropfschlauch', pipe: 'Leitung', fixture: 'Anschluss', area: 'Fläche', path: 'Weg', plant: 'Pflanze', planting: 'Pflanzung', hedge: 'Hecke', espalier: 'Spalier', scatter: 'Pflanzgruppe', item: 'Objekt', dimension: 'Bemaßung', text: 'Text', lamp: 'Leuchte' };
  const name = (o: PlanObject) => o.name ?? TYPE[o.type];

  function detach(d: Draft<Project>, id: Id) {
    const o = d.objects[id];
    if (!o) return;
    const l = d.layers[o.layerId];
    if (l) l.objectOrder = l.objectOrder.filter((x) => x !== id);
    delete d.objects[id];
  }

  return {
    addObject(o: PlanObject, select = true) {
      // Wie in Photoshop: Ist eine eigene Ebene aktiv (und nicht gesperrt), landen neue Objekte dort.
      // Grundebenen behalten ihre Art (sonst verschwände z. B. ein Weg in der Bewässerungsebene).
      const doc = store.getState().doc;
      const active = store.getState().session.activeLayerId;
      const al = active ? doc?.layers[active] : undefined;
      if (al && al.kind === 'custom' && !al.locked && al.id !== o.layerId) o = { ...o, layerId: al.id };
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

    /** Objekt an eine Stelle einer Ebene ziehen (Index in Zeichenreihenfolge, 0 = ganz unten) */
    moveObject(id: Id, layerId: Id, toIndex: number) {
      apply('Reihenfolge ändern', (d) => {
        const o = d.objects[id];
        const target = d.layers[layerId];
        if (!o || !target) return;
        const from = d.layers[o.layerId];
        const i = from.objectOrder.indexOf(id);
        if (i >= 0) from.objectOrder.splice(i, 1);
        // Beim Verschieben innerhalb derselben Ebene rückt das Ziel nach dem Entfernen nach
        const j = from === target && i >= 0 && i < toIndex ? toIndex - 1 : toIndex;
        target.objectOrder.splice(Math.max(0, Math.min(target.objectOrder.length, j)), 0, id);
        o.layerId = layerId;
      });
    },

    /** Neue eigene Ebene über `aboveId` (oder ganz oben); liefert die Id */
    addLayer(name = 'Neue Ebene', aboveId?: Id | null): Id {
      const id = newId();
      const doc = store.getState().doc;
      const n = doc ? Object.values(doc.layers).filter((l) => l.name.startsWith(name)).length : 0;
      apply('Ebene anlegen', (d) => {
        d.layers[id] = { id, kind: 'custom', name: n ? `${name} ${n + 1}` : name, color: '#7A8CA8', visible: true, locked: false, opacity: 1, objectOrder: [] };
        const at = aboveId ? d.layerOrder.indexOf(aboveId) + 1 : d.layerOrder.length;
        d.layerOrder.splice(at > 0 ? at : d.layerOrder.length, 0, id);
      });
      store.getState().setSession({ activeLayerId: id });
      return id;
    },

    renameLayer(layerId: Id, name: string) {
      apply('Ebene umbenennen', (d) => {
        if (d.layers[layerId] && name.trim()) d.layers[layerId].name = name.trim();
      });
    },

    setLayerOpacity(layerId: Id, opacity: number, mergeKey?: string) {
      apply('Deckkraft ändern', (d) => {
        if (d.layers[layerId]) d.layers[layerId].opacity = Math.max(0, Math.min(1, opacity));
      }, mergeKey);
    },

    /** Eigene Ebene samt Inhalt löschen (Grundebenen bleiben, weil Werkzeuge sie als Ziel brauchen) */
    deleteLayer(layerId: Id) {
      const doc = store.getState().doc;
      const l = doc?.layers[layerId];
      if (!l || l.kind !== 'custom') return;
      apply('Ebene löschen', (d) => {
        for (const id of [...d.layers[layerId].objectOrder]) delete d.objects[id];
        delete d.layers[layerId];
        d.layerOrder = d.layerOrder.filter((x) => x !== layerId);
      });
      const s = store.getState().session;
      store.getState().setSession({ activeLayerId: s.activeLayerId === layerId ? null : s.activeLayerId, selection: s.selection.filter((id) => store.getState().doc?.objects[id]) });
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

    setPlot(plot: PlotSpec, mergeKey?: string) {
      apply('Grundstück ändern', (d) => {
        d.site.plot = plot;
        d.site.boundary = boundaryFromPlot(plot);
      }, mergeKey);
    },

    updateSite(patch: Partial<Omit<Site, 'plot' | 'boundary'>>, mergeKey?: string) {
      apply('Standort ändern', (d) => Object.assign(d.site, patch), mergeKey);
    },

    setBackground(bg: BackgroundImage | null) {
      apply(bg ? 'Hintergrund setzen' : 'Hintergrund entfernen', (d) => {
        d.background = bg;
      });
    },

    /** Hintergrund ausrichten und – bei genordetem Bild – die Nordrichtung setzen, ein Undo-Schritt */
    alignBackground(patch: Partial<BackgroundImage>, northDeg: number | null) {
      apply('Hintergrund ausrichten', (d) => {
        if (d.background) Object.assign(d.background, patch);
        if (northDeg !== null) d.site.northDeg = northDeg;
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

    /** Objekte in einem Schritt ersetzen (z. B. Regner automatisch verteilen) */
    replaceObjects(label: string, remove: Id[], add: PlanObject[]) {
      if (!remove.length && !add.length) return;
      apply(label, (d) => {
        remove.forEach((id) => detach(d, id));
        for (const o of add) {
          d.objects[o.id] = o as Draft<PlanObject>;
          d.layers[o.layerId].objectOrder.push(o.id);
        }
      });
      // Auswahl (z. B. die Rasenfläche) bleibt, damit die Aktion wiederholt werden kann
      const sel = store.getState().session.selection;
      store.getState().setSession({ selection: sel.filter((id) => !remove.includes(id)) });
    },

    /** Radierer des Pflanzpinsels: Pflanzen im Kreis entfernen, leere Gruppen löschen */
    eraseScatter(c: Vec2, r: number, mergeKey: string) {
      const doc = store.getState().doc;
      if (!doc) return;
      const hit = Object.values(doc.objects).filter((o) => o.type === 'scatter' && !o.locked && o.plants.some((q) => Math.hypot(q.p.x - c.x, q.p.y - c.y) <= r));
      if (!hit.length) return;
      apply('Pflanzen radieren', (d) => {
        for (const o of hit) {
          const x = d.objects[o.id];
          if (!x || x.type !== 'scatter') continue;
          x.plants = x.plants.filter((q) => Math.hypot(q.p.x - c.x, q.p.y - c.y) > r);
          if (!x.plants.length) detach(d, o.id);
        }
      }, mergeKey);
    },

    addObserver(o: Observer) {
      apply('Blickpunkt setzen', (d) => {
        d.observers.push(o);
      });
    },

    updateObserver(id: Id, patch: Partial<Omit<Observer, 'id'>>, mergeKey?: string) {
      apply('Blickpunkt ändern', (d) => {
        const o = d.observers.find((x) => x.id === id);
        if (o) Object.assign(o, patch);
      }, mergeKey);
    },

    removeObserver(id: Id) {
      apply('Blickpunkt entfernen', (d) => {
        d.observers = d.observers.filter((x) => x.id !== id);
      });
    },

    addZone(zone: IrrigationZone) {
      apply('Zone hinzufügen', (d) => {
        d.zones.push(zone);
      });
    },

    updateZone(index: number, patch: Partial<Omit<IrrigationZone, 'id'>>, mergeKey?: string) {
      apply('Zone ändern', (d) => d.zones[index] && Object.assign(d.zones[index], patch), mergeKey);
    },

    /** Zone löschen; Regner und Schläuche der Zone wandern in die vorherige, höhere Nummern rücken nach */
    removeZone(index: number) {
      apply('Zone löschen', (d) => {
        if (d.zones.length <= 1) return;
        d.zones.splice(index, 1);
        const n = index + 1;
        for (const o of Object.values(d.objects))
          if ((o.type === 'sprinkler' || o.type === 'drip') && o.zone >= n) o.zone = Math.max(1, o.zone === n ? n - 1 : o.zone - 1);
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
