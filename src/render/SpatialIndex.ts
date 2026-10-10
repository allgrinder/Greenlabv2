import RBush from 'rbush';
import { footprint, objectBBox, resolveAnchor, snapGeometry } from '../core/geometry/objects';
import { distanceToPolyline, pointInRegion, type BBox } from '../core/geometry/polygon';
import type { SnapCandidates } from '../core/geometry/snap';
import type { Id, PlanObject, Project, Vec2 } from '../core/model/types';

interface Entry extends BBox {
  id: Id;
}

/**
 * R-Baum über die Bounding-Boxes aller Objekte. Dient dem Culling, dem Hit-Test und
 * der Vorauswahl von Fangkandidaten. Wird inkrementell nach Referenzänderung aktualisiert.
 */
export class SpatialIndex {
  private tree = new RBush<Entry>();
  private entries = new Map<Id, Entry>();
  private refs = new Map<Id, PlanObject>();

  sync(doc: Project): Set<Id> {
    const changed = new Set<Id>();
    for (const [id, e] of this.entries) {
      if (!doc.objects[id]) {
        this.tree.remove(e);
        this.entries.delete(id);
        this.refs.delete(id);
        changed.add(id);
      }
    }
    for (const [id, o] of Object.entries(doc.objects)) {
      if (this.refs.get(id) === o) continue;
      this.put(id, o, doc);
      changed.add(id);
    }
    // Maßketten, die an einem Objekt hängen, wandern mit: deren Rahmen ebenfalls erneuern
    if (changed.size)
      for (const o of Object.values(doc.objects))
        if (o.type === 'dimension' && !changed.has(o.id) && [o.a, o.b].some((a) => a.kind === 'vertex' && changed.has(a.objectId))) {
          this.put(o.id, o, doc);
          changed.add(o.id);
        }
    return changed;
  }

  private put(id: Id, o: PlanObject, doc: Project) {
    const old = this.entries.get(id);
    if (old) this.tree.remove(old);
    const e: Entry = { ...objectBBox(o, doc.objects), id };
    this.tree.insert(e);
    this.entries.set(id, e);
    this.refs.set(id, o);
  }

  query(b: BBox): Id[] {
    return this.tree.search(b).map((e) => e.id);
  }

  bbox(id: Id): BBox | undefined {
    return this.entries.get(id);
  }

  /**
   * Oberstes Objekt am Punkt. `order` = Zeichenreihenfolge aller sichtbaren, entsperrten Objekte
   * (unten → oben); `tol` = Treffertoleranz in Metern für Linien und Punkte.
   */
  hit(doc: Project, p: Vec2, tol: number, selectable: (o: PlanObject) => boolean): Id | null {
    const cands = new Set(this.query({ minX: p.x - tol, minY: p.y - tol, maxX: p.x + tol, maxY: p.y + tol }));
    if (!cands.size) return null;
    const order = doc.layerOrder.flatMap((l) => doc.layers[l].objectOrder);
    for (let i = order.length - 1; i >= 0; i--) {
      const id = order[i];
      if (!cands.has(id)) continue;
      const o = doc.objects[id];
      if (!o || !selectable(o)) continue;
      if (hitObject(o, p, tol, doc)) return id;
    }
    return null;
  }

  /** Fangkandidaten aus Objekten in der Nähe */
  snapCandidates(doc: Project, p: Vec2, radius: number, exclude: Set<Id>): SnapCandidates {
    const vertices: Vec2[] = [];
    const segments: [Vec2, Vec2][] = [];
    for (const id of this.query({ minX: p.x - radius, minY: p.y - radius, maxX: p.x + radius, maxY: p.y + radius })) {
      if (exclude.has(id)) continue;
      const o = doc.objects[id];
      if (!o || o.type === 'text' || o.type === 'dimension') continue;
      const s = snapGeometry(o);
      vertices.push(...s.vertices);
      segments.push(...s.segments);
    }
    // Grundstücksgrenze fängt immer
    const b = doc.site.boundary;
    vertices.push(...b);
    for (let i = 0; i < b.length; i++) segments.push([b[i], b[(i + 1) % b.length]]);
    return { vertices, segments };
  }
}

export function hitObject(o: PlanObject, p: Vec2, tol: number, doc: Project): boolean {
  if (o.type === 'dimension') {
    const a = resolveAnchor(o.a, doc.objects);
    const b = resolveAnchor(o.b, doc.objects);
    return !!a && !!b && distanceToPolyline(p, [a, b], false) <= tol + Math.abs(o.offset);
  }
  if (o.type === 'text') {
    const bb = objectBBox(o);
    return p.x >= bb.minX - tol && p.x <= bb.maxX + tol && p.y >= bb.minY - tol && p.y <= bb.maxY + tol;
  }
  for (const r of footprint(o)) {
    if (pointInRegion(p, r.outer, r.holes)) return true;
    if (distanceToPolyline(p, r.outer, true) <= tol) return true;
  }
  return false;
}
