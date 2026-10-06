/**
 * Flächenoperationen (Vereinigen, Abziehen, Schneiden) und Weg-Offset.
 * Kapselt polygon-clipping vollständig: nach außen gibt es nur Vec2-Polygone in Metern.
 *
 * Hinweis: clipper2-js wurde verworfen – seine Vereinigung zerfiel bei vielen
 * aneinanderstoßenden Teilen in Bruchstücke (siehe Test „Weg-Offset bleibt eine Fläche“).
 */
import pc, { type MultiPolygon as PcMulti, type Polygon as PcPolygon, type Ring } from 'polygon-clipping';
import type { Vec2 } from '../model/types';
import { area, distanceToPolyline, signedArea, type Polygon, type Polyline } from './polygon';
import type { FlatRegion } from './shape';

/** Aktuelles Fangraster für Koordinaten; 0 = unverändert (siehe robust()) */
let snap = 0;
const sn = (v: number) => (snap ? Math.round(v / snap) * snap : v);
const toRing = (pts: Polygon): Ring => pts.map((p) => [sn(p.x), sn(p.y)] as [number, number]);
const toPc = (r: FlatRegion): PcPolygon => [toRing(r.outer), ...r.holes.map(toRing)];

export class GeometryError extends Error {}

/**
 * polygon-clipping scheitert gelegentlich an fast-kollinearen Kanten („Unable to complete
 * output ring“). Dann erneut mit auf 1 µm bzw. 0,1 mm gerasterten Koordinaten versuchen.
 */
function robust(op: () => PcMulti): PcMulti {
  for (const g of [0, 1e-6, 1e-4]) {
    snap = g;
    try {
      return op();
    } catch (e) {
      if (g === 1e-4) throw new GeometryError(`Flächenoperation fehlgeschlagen: ${(e as Error).message}`);
    } finally {
      snap = 0;
    }
  }
  throw new GeometryError('Flächenoperation fehlgeschlagen');
}

function fromRing(r: Ring): Polygon {
  const pts = r.map(([x, y]) => ({ x, y }));
  const a = pts[0];
  const b = pts[pts.length - 1];
  if (pts.length > 1 && a.x === b.x && a.y === b.y) pts.pop();
  return pts;
}

/** Ergebnis zurückwandeln; Außenring im Uhrzeigersinn (Bildschirm), größte Region zuerst */
function fromPc(m: PcMulti): FlatRegion[] {
  return m
    .map((poly) => {
      const [outer, ...holes] = poly.map(fromRing);
      return {
        outer: signedArea(outer) < 0 ? outer.reverse() : outer,
        holes: holes.filter((h) => h.length >= 3 && area(h) > 1e-8),
      };
    })
    .filter((r) => r.outer.length >= 3 && area(r.outer) > 1e-8)
    .sort((a, b) => area(b.outer) - area(a.outer));
}

const valid = (rs: FlatRegion[]) => rs.filter((r) => r.outer.length >= 3);

export function union(regions: FlatRegion[]): FlatRegion[] {
  const v = valid(regions);
  if (!v.length) return [];
  return fromPc(robust(() => pc.union(toPc(v[0]), ...v.slice(1).map(toPc))));
}

export function difference(subject: FlatRegion[], clip: FlatRegion[]): FlatRegion[] {
  const s = valid(subject);
  if (!s.length) return [];
  const c = valid(clip);
  return fromPc(robust(() => pc.difference(s.map(toPc), ...c.map(toPc))));
}

export function intersect(a: FlatRegion[], b: FlatRegion[]): FlatRegion[] {
  const va = valid(a);
  const vb = valid(b);
  if (!va.length || !vb.length) return [];
  return fromPc(robust(() => pc.intersection(va.map(toPc), vb.map(toPc))));
}

/**
 * Weg mit Breite: Fläche aller Punkte im Abstand ≤ width/2 von der Mittellinie.
 * Enden gerade abgeschnitten (Butt), Knicke rund oder als Gehrung.
 *
 * Direkt als Band gebaut (linke Offsetlinie + rechte Offsetlinie rückwärts), ohne
 * Boolesche Operationen: Außenseiten eines Knicks bekommen einen Bogen bzw. eine Gehrung,
 * Innenseiten werden am Schnittpunkt gekürzt (Schleifen entfernt).
 */
export function offsetPolyline(line: Polyline, width: number, join: 'round' | 'miter' = 'round'): FlatRegion[] {
  const pts = line.filter((p, i) => i === 0 || Math.hypot(p.x - line[i - 1].x, p.y - line[i - 1].y) > 1e-6);
  if (pts.length < 2 || width <= 0) return [];
  const h = width / 2;
  const left = removeLoops(offsetSide(pts, -h, join));
  const right = removeLoops(offsetSide(pts, h, join));
  // Gültig nur, wenn keine Bandkante näher als h an der Mittellinie liegt (sonst Kehre enger als die Wegbreite)
  const ok = [...left, ...right].every((q) => distanceToPolyline(q, pts, false) >= h * (1 - 1e-3));
  if (!ok) return offsetByUnion(pts, h, join);
  let ring = [...right, ...left.reverse()];
  if (signedArea(ring) < 0) ring = ring.reverse();
  return [{ outer: ring, holes: [] }];
}

/** Rückfallweg für enge Kehren: Vereinigung aus Segment-Rechtecken und Gelenkkeilen */
function offsetByUnion(pts: Vec2[], h: number, join: 'round' | 'miter'): FlatRegion[] {
  const pieces: Polygon[] = [];
  const dirs = pts.slice(1).map((b, i) => {
    const a = pts[i];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  });
  const nrm = (u: Vec2) => ({ x: -u.y * h, y: u.x * h });
  dirs.forEach((u, i) => {
    const a = pts[i];
    const b = pts[i + 1];
    const n = nrm(u);
    pieces.push([
      { x: a.x + n.x, y: a.y + n.y },
      { x: b.x + n.x, y: b.y + n.y },
      { x: b.x - n.x, y: b.y - n.y },
      { x: a.x - n.x, y: a.y - n.y },
    ]);
  });
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const side = dirs[i - 1].x * dirs[i].y - dirs[i - 1].y * dirs[i].x > 0 ? -1 : 1;
    const n0 = nrm(dirs[i - 1]);
    const n1 = nrm(dirs[i]);
    const wedge: Polygon = [p];
    if (join === 'round') {
      const a0 = Math.atan2(n0.y * side, n0.x * side);
      let sweep = Math.atan2(n1.y * side, n1.x * side) - a0;
      while (sweep > Math.PI) sweep -= 2 * Math.PI;
      while (sweep < -Math.PI) sweep += 2 * Math.PI;
      const k = Math.max(1, Math.ceil(Math.abs(sweep) / 0.1));
      for (let j = 0; j <= k; j++) wedge.push({ x: p.x + Math.cos(a0 + (sweep * j) / k) * h, y: p.y + Math.sin(a0 + (sweep * j) / k) * h });
    } else {
      wedge.push({ x: p.x + n0.x * side, y: p.y + n0.y * side }, { x: p.x + n1.x * side, y: p.y + n1.y * side });
    }
    if (wedge.length >= 3) pieces.push(wedge);
  }
  const oriented = pieces.map((q) => (signedArea(q) < 0 ? [...q].reverse() : q));
  return fromPc(
    robust(() => {
      // Ringe erst hier bauen, damit robust() beim Wiederholen rastern kann
      const polys = oriented.map((q) => [toRing(q)] as PcPolygon);
      return pc.union(polys[0], ...polys.slice(1));
    }),
  ).map((r) => ({ ...r, holes: r.holes.filter((x) => area(x) > 1e-4) }));
}

/**
 * Eine Seite des Bands. `d` > 0 = rechts (Bildschirmsystem), < 0 = links.
 */
function offsetSide(pts: Vec2[], d: number, join: 'round' | 'miter'): Vec2[] {
  const h = Math.abs(d);
  const dirs = pts.slice(1).map((b, i) => {
    const a = pts[i];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  });
  const n = (u: Vec2) => ({ x: -u.y * d, y: u.x * d });
  const out: Vec2[] = [];
  const first = n(dirs[0]);
  out.push({ x: pts[0].x + first.x, y: pts[0].y + first.y });
  const step = 2 * Math.acos(Math.max(-1, 1 - 0.002 / h)) || 0.2; // Bogentoleranz 2 mm
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const u0 = dirs[i - 1];
    const u1 = dirs[i];
    const n0 = n(u0);
    const n1 = n(u1);
    const turn = u0.x * u1.y - u0.y * u1.x;
    // Außenseite: die Seite, von der weg gebogen wird
    const outer = turn * d < 0;
    if (Math.abs(turn) < 1e-9 && u0.x * u1.x + u0.y * u1.y > 0) {
      out.push({ x: p.x + n1.x, y: p.y + n1.y });
    } else if (!outer) {
      // Innenseite: Gehrungspunkt (Schleifen entfernt removeLoops)
      const mx = n0.x + n1.x;
      const my = n0.y + n1.y;
      const ml = Math.hypot(mx, my);
      const cos = ml / (2 * h);
      if (cos > 0.05) out.push({ x: p.x + (mx / ml) * (h / cos), y: p.y + (my / ml) * (h / cos) });
      else out.push({ x: p.x + n0.x, y: p.y + n0.y }, { x: p.x + n1.x, y: p.y + n1.y });
    } else if (join === 'round') {
      const a0 = Math.atan2(n0.y, n0.x);
      let sweep = Math.atan2(n1.y, n1.x) - a0;
      while (sweep > Math.PI) sweep -= 2 * Math.PI;
      while (sweep < -Math.PI) sweep += 2 * Math.PI;
      const k = Math.max(1, Math.ceil(Math.abs(sweep) / step));
      for (let j = 0; j <= k; j++) {
        const t = a0 + (sweep * j) / k;
        out.push({ x: p.x + Math.cos(t) * h, y: p.y + Math.sin(t) * h });
      }
    } else {
      const mx = n0.x + n1.x;
      const my = n0.y + n1.y;
      const ml = Math.hypot(mx, my);
      const cos = ml / (2 * h);
      if (cos > 0.25) out.push({ x: p.x + (mx / ml) * (h / cos), y: p.y + (my / ml) * (h / cos) });
      else out.push({ x: p.x + n0.x, y: p.y + n0.y }, { x: p.x + n1.x, y: p.y + n1.y });
    }
  }
  const last = n(dirs[dirs.length - 1]);
  const pe = pts[pts.length - 1];
  out.push({ x: pe.x + last.x, y: pe.y + last.y });
  return out;
}

function segIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): Vec2 | null {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-14) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
  if (t <= 1e-9 || t >= 1 - 1e-9 || u <= 1e-9 || u >= 1 - 1e-9) return null;
  return { x: a.x + r.x * t, y: a.y + r.y * t };
}

/**
 * Lokale Schleifen einer Offsetlinie entfernen (Innenseite enger Bögen):
 * schneidet Segment i ein späteres Segment j, wird alles dazwischen durch den Schnittpunkt ersetzt.
 */
export function removeLoops(pts: Vec2[], window = 400): Vec2[] {
  const out = pts.slice();
  for (let i = 0; i < out.length - 3; i++) {
    const lim = Math.min(out.length - 1, i + window);
    for (let j = lim - 1; j >= i + 2; j--) {
      const x = segIntersect(out[i], out[i + 1], out[j], out[j + 1]);
      if (x) {
        out.splice(i + 1, j - i, x);
        break;
      }
    }
  }
  return out;
}
