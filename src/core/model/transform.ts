/**
 * Geometrische Änderungen an Objekten. Arbeiten mutierend und sind damit direkt in
 * Immer-Rezepten nutzbar (Draft) – außerhalb von Immer nur auf Kopien anwenden.
 */
import { rectNodes } from '../geometry/shape';
import type { PathGeometry, PlanObject, Region, ShapeGeometry, Vec2 } from './types';

const move = (p: Vec2, d: Vec2) => {
  p.x += d.x;
  p.y += d.y;
};

const movePath = (g: PathGeometry, d: Vec2) => g.nodes.forEach((n) => move(n.p, d));

function moveShape(s: ShapeGeometry, d: Vec2) {
  if (s.kind === 'rect') move(s.center, d);
  else movePath(s, d);
}

function moveRegion(r: Region, d: Vec2) {
  moveShape(r.outer, d);
  r.holes.forEach((h) => movePath(h, d));
}

export function translateObject(o: PlanObject, d: Vec2): void {
  switch (o.type) {
    case 'area':
    case 'planting':
      moveRegion(o.region, d);
      break;
    case 'path':
    case 'hedge':
    case 'espalier':
      movePath(o.centerline, d);
      break;
    case 'scatter':
      o.plants.forEach((q) => move(q.p, d));
      break;
    case 'plant':
    case 'item':
    case 'text':
    case 'sprinkler':
    case 'fixture':
      move(o.position, d);
      break;
    case 'drip':
    case 'pipe':
      movePath(o.path, d);
      break;
    case 'lamp':
      move(o.position, d);
      if (o.path) movePath(o.path, d);
      break;
    case 'dimension':
      if (o.a.kind === 'free') move(o.a.p, d);
      if (o.b.kind === 'free') move(o.b.p, d);
      break;
  }
}

/** Rechteck in einen bearbeitbaren Pfad umwandeln (vor dem Ziehen einzelner Ecken) */
export function rectToPath(r: Region): void {
  if (r.outer.kind === 'rect') r.outer = { kind: 'path', nodes: rectNodes(r.outer), closed: true, source: 'polygon' };
}

/** Pfad, dessen Knoten das Objekt bearbeitbar macht – oder null */
function nodePath(o: PlanObject): PathGeometry | null {
  switch (o.type) {
    case 'area':
    case 'planting':
      rectToPath(o.region);
      return o.region.outer as PathGeometry;
    case 'path':
    case 'hedge':
    case 'espalier':
      return o.centerline;
    case 'drip':
    case 'pipe':
      return o.path;
    case 'lamp':
      return o.path;
    default:
      return null;
  }
}

/** Knoten an neue Position setzen. Griffe wandern relativ mit (sie sind relativ gespeichert). */
export function setNode(o: PlanObject, index: number, p: Vec2): void {
  if (o.type === 'lamp' && o.path) {
    const n = o.path.nodes[index];
    if (n) n.p = { ...p };
    if (index === 0) o.position = { ...p };
    return;
  }
  if (o.type === 'plant' || o.type === 'item' || o.type === 'text' || o.type === 'lamp' || o.type === 'sprinkler' || o.type === 'fixture') {
    if (index === 0) o.position = { ...p };
    return;
  }
  if (o.type === 'dimension') {
    const free = [o.a, o.b].filter((a) => a.kind === 'free');
    const a = free[index];
    if (a && a.kind === 'free') a.p = { ...p };
    return;
  }
  const path = nodePath(o);
  const n = path?.nodes[index];
  if (n) n.p = { ...p };
}

export function insertNode(o: PlanObject, afterIndex: number, p: Vec2): void {
  const path = nodePath(o);
  if (path) path.nodes.splice(afterIndex + 1, 0, { p: { ...p } });
}

/** Knoten löschen; Mindestanzahl bleibt erhalten (Polygon 3, Linie 2) */
export function deleteNode(o: PlanObject, index: number): boolean {
  const path = nodePath(o);
  if (!path) return false;
  const min = path.closed ? 3 : 2;
  if (path.nodes.length <= min) return false;
  path.nodes.splice(index, 1);
  return true;
}

/** Griffe eines Knotens setzen (relativ). `smooth` koppelt den Gegengriff gespiegelt. */
export function setHandle(o: PlanObject, index: number, which: 'in' | 'out', h: Vec2 | null): void {
  const path = nodePath(o);
  const n = path?.nodes[index];
  if (!n) return;
  if (h === null) {
    delete n[which];
    return;
  }
  n[which] = { ...h };
  if (n.smooth) {
    const other = which === 'in' ? 'out' : 'in';
    const ol = n[other] ? Math.hypot(n[other]!.x, n[other]!.y) : Math.hypot(h.x, h.y);
    const hl = Math.hypot(h.x, h.y) || 1;
    n[other] = { x: (-h.x / hl) * ol, y: (-h.y / hl) * ol };
  }
}
