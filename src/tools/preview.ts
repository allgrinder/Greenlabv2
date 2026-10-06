/** Gemeinsame Zeichenhilfen für Werkzeug-Vorschauen (Bildschirmraum) */
import type { Graphics } from 'pixi.js';
import { num } from '../core/format';
import type { PathNode, Vec2 } from '../core/model/types';
import { flattenPath } from '../core/geometry/shape';
import { add, dist, mid } from '../core/geometry/vec';
import type { SnapResult } from '../core/geometry/snap';
import { ACCENT, dashed, type LabelPool, type ToScreen } from '../render/overlays/overlay';

export const PINK = 0xe0567a;

/** Pfad mit Füllung (geschlossen) oder als Linie, plus Knoten und Griffe */
export function drawPathPreview(g: Graphics, toScreen: ToScreen, nodes: PathNode[], closed: boolean, fill: boolean) {
  if (nodes.length === 0) return;
  const pts = flattenPath({ nodes, closed }, 0.01).map(toScreen);
  if (pts.length >= 2) {
    const flat = pts.flatMap((p) => [p.x, p.y]);
    if (closed && fill && pts.length >= 3) g.poly(flat, true).fill({ color: ACCENT, alpha: 0.08 });
    g.poly(flat, closed).stroke({ color: ACCENT, width: 2, join: 'round' });
  }
  for (const n of nodes) {
    const P = toScreen(n.p);
    for (const h of [n.in, n.out]) {
      if (!h) continue;
      const H = toScreen(add(n.p, h));
      g.moveTo(P.x, P.y).lineTo(H.x, H.y).stroke({ color: ACCENT, width: 1 });
      g.circle(H.x, H.y, 3.5).fill(0xffffff).stroke({ color: ACCENT, width: 1.4 });
    }
  }
  nodes.forEach((n, i) => {
    const P = toScreen(n.p);
    g.roundRect(P.x - 5, P.y - 5, 10, 10, 2).fill(i === 0 && closed ? 0xeef1fd : 0xffffff).stroke({ color: ACCENT, width: 1.6 });
  });
}

/** Gummiband vom letzten Punkt zum Cursor, gestrichelt */
export function drawRubber(g: Graphics, toScreen: ToScreen, a: Vec2, b: Vec2) {
  dashed(g, [toScreen(a), toScreen(b)], false, [4, 4]);
  g.stroke({ color: ACCENT, width: 1 });
}

/** Kantenlänge als Mono-Beschriftung neben der Strecke */
export function edgeLabel(labels: LabelPool, toScreen: ToScreen, a: Vec2, b: Vec2, text?: string) {
  const L = dist(a, b);
  if (L < 1e-3) return;
  const A = toScreen(a);
  const B = toScreen(b);
  const M = mid(A, B);
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const l = Math.hypot(dx, dy) || 1;
  labels.mono(text ?? `${num(L, 2)} m`, M.x + (-dy / l) * 12, M.y + (dx / l) * 12, 0, ACCENT);
}

/** Fangmarke: Quadrat (Ecke), Dreieck (Mitte), Kreuz (Kante) */
export function drawSnap(g: Graphics, toScreen: ToScreen, s: SnapResult | null) {
  if (!s || s.kind === 'none' || s.kind === 'grid') return;
  const P = toScreen(s.p);
  if (s.kind === 'vertex') g.rect(P.x - 6, P.y - 6, 12, 12).stroke({ color: PINK, width: 1.6 });
  else if (s.kind === 'midpoint') g.poly([P.x, P.y - 7, P.x + 6, P.y + 4, P.x - 6, P.y + 4], true).stroke({ color: PINK, width: 1.6 });
  else g.moveTo(P.x - 5, P.y - 5).lineTo(P.x + 5, P.y + 5).moveTo(P.x + 5, P.y - 5).lineTo(P.x - 5, P.y + 5).stroke({ color: PINK, width: 1.6 });
  if (s.segment) {
    const A = toScreen(s.segment[0]);
    const B = toScreen(s.segment[1]);
    dashed(g, [A, B], false, [3, 4]);
    g.stroke({ color: PINK, width: 1, alpha: 0.7 });
  }
}

/** Eingabehinweis (z. B. „Punkt setzen oder ↵ schließt die Kontur“) unten am Cursor */
export function hint(labels: LabelPool, at: Vec2, text: string) {
  labels.mono(text, at.x + 18, at.y + 26, 0, 0x1f2224);
}
