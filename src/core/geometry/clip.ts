/**
 * Flächenoperationen (Vereinigen, Abziehen, Schneiden) und Weg-Offset.
 * Kapselt polygon-clipping vollständig: nach außen gibt es nur Vec2-Polygone in Metern.
 *
 * Hinweis: clipper2-js wurde verworfen – seine Vereinigung zerfiel bei vielen
 * aneinanderstoßenden Teilen in Bruchstücke (siehe Test „Weg-Offset bleibt eine Fläche“).
 */
import pc, { type MultiPolygon as PcMulti, type Polygon as PcPolygon, type Ring } from 'polygon-clipping';
import type { Vec2 } from '../model/types';
import { area, signedArea, type Polygon, type Polyline } from './polygon';
import type { FlatRegion } from './shape';

// Bewusst ohne Rundung: gerundete Koordinaten lassen aneinanderstoßende Teile auseinanderfallen
const toRing = (pts: Polygon): Ring => pts.map((p) => [p.x, p.y] as [number, number]);
const toPc = (r: FlatRegion): PcPolygon => [toRing(r.outer), ...r.holes.map(toRing)];

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
  return fromPc(pc.union(toPc(v[0]), ...v.slice(1).map(toPc)));
}

export function difference(subject: FlatRegion[], clip: FlatRegion[]): FlatRegion[] {
  const s = valid(subject);
  if (!s.length) return [];
  const c = valid(clip);
  return fromPc(pc.difference(s.map(toPc), ...c.map(toPc)));
}

export function intersect(a: FlatRegion[], b: FlatRegion[]): FlatRegion[] {
  const va = valid(a);
  const vb = valid(b);
  if (!va.length || !vb.length) return [];
  return fromPc(pc.intersection(va.map(toPc), vb.map(toPc)));
}

/**
 * Weg mit Breite: Fläche aller Punkte im Abstand ≤ width/2 von der Mittellinie.
 * Enden gerade abgeschnitten (Butt), Knicke rund oder als Gehrung.
 * Gebaut als Vereinigung aus Segment-Rechtecken und Gelenkkeilen auf der Außenseite.
 */
export function offsetPolyline(line: Polyline, width: number, join: 'round' | 'miter' = 'round'): FlatRegion[] {
  const pieces = offsetPieces(line, width, join);
  if (!pieces.length) return [];
  const polys = pieces.map((p) => [toRing(p)] as PcPolygon);
  const regions = fromPc(pc.union(polys[0], ...polys.slice(1)));
  // Mikro-Löcher an Innenknicken (Rundungsartefakte) verwerfen
  return regions.map((r) => ({ ...r, holes: r.holes.filter((h) => area(h) > 1e-4) }));
}

/** Einzelteile des Weg-Offsets (Segment-Rechtecke und Gelenkkeile), einheitlich orientiert */
export function offsetPieces(line: Polyline, width: number, join: 'round' | 'miter'): Polygon[] {
  const pts = line.filter((p, i) => i === 0 || Math.hypot(p.x - line[i - 1].x, p.y - line[i - 1].y) > 1e-6);
  if (pts.length < 2 || width <= 0) return [];
  const h = width / 2;
  const pieces: Polygon[] = [];
  const dirs = pts.slice(1).map((b, i) => {
    const a = pts[i];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  });
  const nrm = (d: Vec2) => ({ x: -d.y * h, y: d.x * h });
  dirs.forEach((d, i) => {
    const a = pts[i];
    const b = pts[i + 1];
    const n = nrm(d);
    pieces.push([
      { x: a.x + n.x, y: a.y + n.y },
      { x: b.x + n.x, y: b.y + n.y },
      { x: b.x - n.x, y: b.y - n.y },
      { x: a.x - n.x, y: a.y - n.y },
    ]);
  });
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const d0 = dirs[i - 1];
    const d1 = dirs[i];
    const turn = d0.x * d1.y - d0.y * d1.x;
    if (Math.abs(turn) < 1e-9 && d0.x * d1.x + d0.y * d1.y > 0) continue;
    // Gelenk nur auf der Außenseite des Knicks: Keil zwischen den beiden Segmentnormalen
    const side = turn > 0 ? -1 : 1;
    const n0 = nrm(d0);
    const n1 = nrm(d1);
    const a = { x: p.x + n0.x * side, y: p.y + n0.y * side };
    const b = { x: p.x + n1.x * side, y: p.y + n1.y * side };
    if (join === 'round') {
      const a0 = Math.atan2(a.y - p.y, a.x - p.x);
      let sweep = Math.atan2(b.y - p.y, b.x - p.x) - a0;
      while (sweep > Math.PI) sweep -= 2 * Math.PI;
      while (sweep < -Math.PI) sweep += 2 * Math.PI;
      const step = Math.acos(Math.max(-1, 1 - 0.002 / h)) * 2 || 0.1;
      const k = Math.max(1, Math.ceil(Math.abs(sweep) / step));
      const wedge: Polygon = [p];
      for (let j = 0; j <= k; j++) {
        const t = a0 + (sweep * j) / k;
        wedge.push({ x: p.x + Math.cos(t) * h, y: p.y + Math.sin(t) * h });
      }
      if (wedge.length >= 3) pieces.push(wedge);
    } else {
      // Gehrung bis 4 × h, sonst Fase
      const mx = n0.x + n1.x;
      const my = n0.y + n1.y;
      const ml = Math.hypot(mx, my);
      const cos = ml / (2 * h);
      const len = cos > 0.25 ? h / cos : 0;
      pieces.push(len ? [p, a, { x: p.x + (mx / ml) * len * side, y: p.y + (my / ml) * len * side }, b] : [p, a, b]);
    }
  }
  // Einheitlicher Umlaufsinn, sonst heben sich überlappende Stücke bei NonZero auf
  return pieces.map((q) => (signedArea(q) < 0 ? [...q].reverse() : q));
}

