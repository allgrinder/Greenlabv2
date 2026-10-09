/**
 * Overlays im Bildschirmraum: Raster, Grundstücksgrenze, Bemaßungen, Auswahl, Griffe.
 * Linien bleiben dadurch bei jedem Zoom haarfein. Wird bei Viewport- oder Auswahländerung neu gezeichnet.
 */
import { Container, Graphics, Text } from 'pixi.js';
import { footprint, editableNodes, resolveAnchor } from '../../core/geometry/objects';
import type { Polygon } from '../../core/geometry/polygon';
import { flattenPath, toPath } from '../../core/geometry/shape';
import { num } from '../../core/format';
import type { DimensionObject, PlanObject, Project, Vec2 } from '../../core/model/types';
import { add, dist, normalize, perp, scale, sub } from '../../core/geometry/vec';

export const ACCENT = 0x3d5bd9;
const INK = 0x2d3033;

export type ToScreen = (p: Vec2) => Vec2;

/** Polylinie in Striche nach Muster (Längen in px) zerlegen */
export function dashed(g: Graphics, pts: Vec2[], closed: boolean, pattern: number[]) {
  const all = closed ? [...pts, pts[0]] : pts;
  let pi = 0;
  let left = pattern[0];
  let on = true;
  for (let i = 1; i < all.length; i++) {
    let a = all[i - 1];
    const b = all[i];
    let segLen = dist(a, b);
    while (segLen > 0) {
      const step = Math.min(left, segLen);
      const t = step / segLen;
      const c = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      if (on) g.moveTo(a.x, a.y).lineTo(c.x, c.y);
      a = c;
      segLen -= step;
      left -= step;
      if (left <= 1e-6) {
        pi = (pi + 1) % pattern.length;
        left = pattern[pi];
        on = !on;
      }
    }
  }
}

/** Rasterpunkte und 5-m-Linien; `strength` 0…1 zum Ein- und Ausblenden */
export function drawGrid(g: Graphics, toScreen: ToScreen, ppm: number, boundary: Polygon, step: number, strength = 1) {
  if (boundary.length < 3 || strength <= 0.01) return;
  const xs = boundary.map((p) => p.x);
  const ys = boundary.map((p) => p.y);
  const minX = Math.floor(Math.min(...xs));
  const maxX = Math.ceil(Math.max(...xs));
  const minY = Math.floor(Math.min(...ys));
  const maxY = Math.ceil(Math.max(...ys));
  // Punkte im Rasterabstand, sobald sie mind. 8 px auseinander liegen
  const s = [step, 0.5, 1, 5].find((v) => v >= step && v * ppm >= 8) ?? 5;
  const r = Math.max(0.6, Math.min(1.1, ppm / 30));
  for (let x = Math.ceil(minX / s) * s; x <= maxX + 1e-9; x += s)
    for (let y = Math.ceil(minY / s) * s; y <= maxY + 1e-9; y += s) {
      const p = toScreen({ x, y });
      g.rect(p.x - r / 2, p.y - r / 2, r, r);
    }
  g.fill({ color: 0x1e2828, alpha: 0.28 * strength });
  // 5-m-Linien
  for (let x = Math.ceil(minX / 5) * 5; x <= maxX; x += 5) {
    const a = toScreen({ x, y: minY });
    const b = toScreen({ x, y: maxY });
    g.moveTo(a.x, a.y).lineTo(b.x, b.y);
  }
  for (let y = Math.ceil(minY / 5) * 5; y <= maxY; y += 5) {
    const a = toScreen({ x: minX, y });
    const b = toScreen({ x: maxX, y });
    g.moveTo(a.x, a.y).lineTo(b.x, b.y);
  }
  g.stroke({ color: 0x1e2828, alpha: 0.14 * strength, width: 1, pixelLine: true });
}

/** Grenzlinie strichpunktiert (Architektur-Konvention), Grenzsteine an den Ecken */
export function drawBoundary(g: Graphics, toScreen: ToScreen, boundary: Polygon, ppm: number, night: boolean) {
  if (boundary.length < 2) return;
  const pts = boundary.map(toScreen);
  const k = Math.max(0.6, Math.min(1.6, ppm / 20));
  dashed(g, pts, true, [16 * k, 4 * k, 2 * k, 4 * k]);
  const c = night ? 0xc9d0da : INK;
  g.stroke({ color: c, width: 1.5 });
  for (const p of pts) g.circle(p.x, p.y, 3.2).fill(night ? 0x0e1724 : 0xf3efe6).stroke({ color: c, width: 1.2 });
}

/** Bemaßung mit Schrägstrichen und Mono-Zahl, wie im Design */
export function drawDimension(g: Graphics, labels: LabelPool, toScreen: ToScreen, d: DimensionObject, doc: Project, color = INK) {
  const a = resolveAnchor(d.a, doc.objects);
  const b = resolveAnchor(d.b, doc.objects);
  if (!a || !b || dist(a, b) < 1e-6) return;
  const n = perp(normalize(sub(b, a)));
  const off = scale(n, d.offset);
  const A = toScreen(add(a, off));
  const B = toScreen(add(b, off));
  const a0 = toScreen(a);
  const b0 = toScreen(b);
  const ns = normalize(sub(A, a0));
  const ext = 6;
  // Hilfslinien
  const hasOff = dist(A, a0) > 1;
  if (hasOff) {
    g.moveTo(a0.x + ns.x * 4, a0.y + ns.y * 4).lineTo(A.x + ns.x * ext, A.y + ns.y * ext);
    g.moveTo(b0.x + ns.x * 4, b0.y + ns.y * 4).lineTo(B.x + ns.x * ext, B.y + ns.y * ext);
  }
  g.moveTo(A.x, A.y).lineTo(B.x, B.y);
  // Schrägstriche 45°
  const dir = normalize(sub(B, A));
  const sl = add(scale(dir, 5), scale(perp(dir), -5));
  for (const P of [A, B]) g.moveTo(P.x - sl.x, P.y - sl.y).lineTo(P.x + sl.x, P.y + sl.y);
  g.stroke({ color, width: 1 });
  const L = dist(a, b);
  let ang = Math.atan2(B.y - A.y, B.x - A.x);
  if (ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI;
  const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  const up = { x: Math.sin(ang), y: -Math.cos(ang) };
  labels.mono(num(L, 2), mid.x + up.x * 7, mid.y + up.y * 7, ang, color);
}

/** Auswahl: Kontur in Akzentfarbe, Knoten als weiße Quadrate, Bézier-Griffe */
export function drawSelection(g: Graphics, toScreen: ToScreen, o: PlanObject, doc: Project, showNodes: boolean, activeNode: number | null) {
  if (o.type === 'dimension') {
    const a = resolveAnchor(o.a, doc.objects);
    const b = resolveAnchor(o.b, doc.objects);
    if (a && b) {
      const A = toScreen(a);
      const B = toScreen(b);
      g.moveTo(A.x, A.y).lineTo(B.x, B.y).stroke({ color: ACCENT, width: 1.5 });
    }
  } else if (o.type === 'text') {
    // Text: Rahmen
  } else {
    for (const r of footprint(o)) {
      g.poly(r.outer.map(toScreen).flatMap((p) => [p.x, p.y]), true);
      for (const h of r.holes) g.poly(h.map(toScreen).flatMap((p) => [p.x, p.y]), true);
    }
    g.stroke({ color: ACCENT, width: 1.5 });
  }
  // Mittellinie bei Wegen/Hecken
  if (o.type === 'path' || o.type === 'hedge') {
    dashed(g, flattenPath(o.centerline, 0.05).map(toScreen), false, [4, 4]);
    g.stroke({ color: ACCENT, width: 1 });
  }
  if (!showNodes) return;
  // Bézier-Griffe
  const path =
    o.type === 'area' || o.type === 'planting'
      ? toPath(o.region.outer)
      : o.type === 'path' || o.type === 'hedge'
        ? o.centerline
        : null;
  if (path && path.source !== 'rect') {
    for (const n of path.nodes) {
      const P = toScreen(n.p);
      for (const h of [n.in, n.out]) {
        if (!h) continue;
        const H = toScreen(add(n.p, h));
        g.moveTo(P.x, P.y).lineTo(H.x, H.y).stroke({ color: ACCENT, width: 1, alpha: 0.8 });
        g.circle(H.x, H.y, 3.5).fill(0xffffff).stroke({ color: ACCENT, width: 1.4 });
      }
    }
  }
  const nodes = o.type === 'item' ? [] : editableNodes(o);
  nodes.forEach((p, i) => {
    const P = toScreen(p);
    const s = i === activeNode ? 6 : 5;
    g.roundRect(P.x - s, P.y - s, s * 2, s * 2, 2).fill(i === activeNode ? ACCENT : 0xffffff).stroke({ color: ACCENT, width: 1.6 });
  });
}

/**
 * Wiederverwendbare Text-Objekte für Maßzahlen und Kantenlängen.
 * Pro Frame `begin()`, dann `mono(...)`, am Ende `end()` blendet Unbenutzte aus.
 */
export class LabelPool {
  readonly container = new Container();
  private pool: Text[] = [];
  private used = 0;

  begin() {
    this.used = 0;
  }

  mono(text: string, x: number, y: number, rotation: number, color: number, pill = false) {
    let t = this.pool[this.used];
    if (!t) {
      t = new Text({
        text,
        style: { fontFamily: 'Geist Mono, ui-monospace, monospace', fontSize: 11, fill: color, stroke: { color: 0xf3efe6, width: 4, join: 'round' } },
        resolution: Math.max(2, window.devicePixelRatio),
      });
      t.anchor.set(0.5);
      this.pool.push(t);
      this.container.addChild(t);
    }
    if (t.text !== text) t.text = text;
    t.style.fill = color;
    t.style.stroke = pill ? { color: 0xffffff, width: 0 } : { color: 0xf3efe6, width: 4, join: 'round' };
    t.position.set(x, y);
    t.rotation = rotation;
    t.visible = true;
    this.used++;
  }

  end() {
    for (let i = this.used; i < this.pool.length; i++) this.pool[i].visible = false;
  }
}
