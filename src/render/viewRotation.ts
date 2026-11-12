/**
 * Gedrehte Ansicht (90°-Schritte): Der Renderer zeichnet eine gedrehte Kopie des Gartens („Ansichtsraum“).
 * So stimmen Schrägansicht, Tiefensortierung, Sonnenstand und die vorgerenderten Blender-Ansichten von selbst –
 * ein Objekt, das um 90° gedreht erscheint, bekommt einfach sein 90°-Bild. Werkzeuge, Auswahl und Trefferprüfung
 * arbeiten weiter im echten Plan; nur die Umrechnung Bildschirm ↔ Plan (Viewport) berücksichtigt die Drehung.
 */
import { bbox } from '../core/geometry/polygon';
import { rotate } from '../core/geometry/vec';
import type { PathGeometry, PlanObject, Project, Region, ShapeGeometry, Vec2 } from '../core/model/types';
import type { Viewport } from '../state/types';

/** Ansichtsdrehung auf 0, 90, 180 oder 270 Grad gerundet */
export const viewRotation = (v: Pick<Viewport, 'rotationDeg'>): number => ((Math.round((v.rotationDeg ?? 0) / 90) * 90) % 360 + 360) % 360;

/** Drehpunkt: Mitte des Grundstücks (fest je Grundstück, damit gedrehte Objekte beim Bearbeiten stabil bleiben) */
export function viewPivot(doc: Project): Vec2 {
  const b = bbox(doc.site.boundary);
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

/** Ansicht für den Renderer: Mitte im Ansichtsraum, ohne Drehung */
export function sceneViewport(v: Viewport, pivot: Vec2): Viewport {
  const r = viewRotation(v);
  return r ? { ...v, rotationDeg: 0, center: rotate(v.center, r, pivot) } : v;
}

/** Erzeugt und merkt gedrehte Kopien: unveränderte Objekte behalten ihre Kopie (der Renderer baut sie nicht neu) */
export class RotatedDocs {
  private key = '';
  private objects = new WeakMap<PlanObject, PlanObject>();
  private last: { doc: Project; out: Project } | null = null;
  private site: { src: Project['site']; out: Project['site'] } | null = null;

  get(doc: Project, deg: number): Project {
    const r = viewRotation({ rotationDeg: deg });
    if (!r) return doc;
    const pivot = viewPivot(doc);
    const key = `${r}|${pivot.x}|${pivot.y}`;
    if (key !== this.key) {
      this.key = key;
      this.objects = new WeakMap();
      this.last = null;
      this.site = null;
    }
    if (this.last?.doc === doc) return this.last.out;
    const P = (p: Vec2) => rotate(p, r, pivot);
    const V = (v: Vec2) => rotate(v, r);
    const objects: Project['objects'] = {};
    for (const [id, o] of Object.entries(doc.objects)) {
      let c = this.objects.get(o);
      if (!c) {
        c = rotateObject(o, r, P, V);
        this.objects.set(o, c);
      }
      objects[id] = c;
    }
    if (this.site?.src !== doc.site) this.site = { src: doc.site, out: { ...doc.site, boundary: doc.site.boundary.map(P), northDeg: doc.site.northDeg + r } };
    const bg = doc.background;
    const out: Project = {
      ...doc,
      site: this.site.out,
      background: bg ? { ...bg, origin: P(bg.origin), rotationDeg: bg.rotationDeg + r } : bg,
      objects,
      observers: doc.observers.map((ob) => ({ ...ob, position: P(ob.position) })),
    };
    this.last = { doc, out };
    return out;
  }
}

function rotatePath(g: PathGeometry, P: (p: Vec2) => Vec2, V: (v: Vec2) => Vec2): PathGeometry {
  return {
    ...g,
    nodes: g.nodes.map((n) => ({ ...n, p: P(n.p), ...(n.in ? { in: V(n.in) } : {}), ...(n.out ? { out: V(n.out) } : {}) })),
  };
}

function rotateShape(s: ShapeGeometry, r: number, P: (p: Vec2) => Vec2, V: (v: Vec2) => Vec2): ShapeGeometry {
  return s.kind === 'rect' ? { ...s, center: P(s.center), rotationDeg: s.rotationDeg + r } : rotatePath(s, P, V);
}

function rotateRegion(g: Region, r: number, P: (p: Vec2) => Vec2, V: (v: Vec2) => Vec2): Region {
  return { ...g, outer: rotateShape(g.outer, r, P, V), holes: g.holes.map((h) => rotatePath(h, P, V)) };
}

/** Ein Objekt in den Ansichtsraum drehen; Beschriftungen bleiben lesbar aufrecht, Leuchten zeigen weiter nach Kompass */
function rotateObject(o: PlanObject, r: number, P: (p: Vec2) => Vec2, V: (v: Vec2) => Vec2): PlanObject {
  switch (o.type) {
    case 'area':
    case 'planting':
      return { ...o, region: rotateRegion(o.region, r, P, V) };
    case 'path':
    case 'hedge':
    case 'espalier':
      return { ...o, centerline: rotatePath(o.centerline, P, V) };
    case 'scatter':
      return { ...o, plants: o.plants.map((q) => ({ ...q, p: P(q.p) })) };
    case 'item':
      return { ...o, position: P(o.position), rotationDeg: o.rotationDeg + r };
    case 'plant':
    case 'text':
    case 'fixture':
      return { ...o, position: P(o.position) };
    case 'sprinkler':
      return { ...o, position: P(o.position), arcStartDeg: o.arcStartDeg + r, arcEndDeg: o.arcEndDeg + r };
    case 'drip':
    case 'pipe':
      return { ...o, path: rotatePath(o.path, P, V) };
    case 'lamp':
      return { ...o, position: P(o.position), path: o.path ? rotatePath(o.path, P, V) : null };
    case 'dimension':
      return { ...o, a: o.a.kind === 'free' ? { ...o.a, p: P(o.a.p) } : o.a, b: o.b.kind === 'free' ? { ...o.b, p: P(o.b.p) } : o.b };
  }
}
