/**
 * Natürlichere Beläge im Plan: ausgefranste Ränder, einmalige Details (Klee, trockene Stellen, Gänseblümchen,
 * Laub, größere Steine). Alles deterministisch je Objekt (seed), damit das Bild beim Neuzeichnen nicht springt.
 */
import type { FillPattern, Graphics } from 'pixi.js';
import type { Season } from '../../core/growth';
import { pointInRegion } from '../../core/geometry/polygon';
import type { FlatRegion } from '../../core/geometry/shape';
import { rng } from '../util/rng';

/**
 * Ausgefranste Kante: entlang der Kontur kleine, unterschiedlich große Kreise mit derselben (weltfesten) Textur,
 * zufällig nach innen oder außen versetzt – die gerade Vektorkante verschwindet.
 */
export function fringe(g: Graphics, regions: FlatRegion[], pattern: FillPattern, seed: number, reach = 0.06) {
  const r = rng(seed ^ 0x5bd1);
  let any = false;
  for (const reg of regions)
    for (const ring of [reg.outer, ...reg.holes]) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < 1e-6) continue;
        const nx = -(b.y - a.y) / len;
        const ny = (b.x - a.x) / len;
        for (let t = r() * 0.05; t < len; t += 0.035 + r() * 0.04) {
          const off = (r() - 0.35) * reach;
          const rad = reach * (0.25 + r() * 0.75);
          g.circle(a.x + ((b.x - a.x) * t) / len + nx * off, a.y + ((b.y - a.y) * t) / len + ny * off, rad);
          any = true;
        }
      }
    }
  if (any) g.fill(pattern);
}

function scatter(regions: FlatRegion[], perM2: number, seed: number, cb: (x: number, y: number, r: () => number) => void) {
  const r = rng(seed);
  for (const reg of regions) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of reg.outer) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const n = Math.round((maxX - minX) * (maxY - minY) * perM2);
    for (let i = 0; i < n; i++) {
      const x = minX + r() * (maxX - minX);
      const y = minY + r() * (maxY - minY);
      if (pointInRegion({ x, y }, reg.outer, reg.holes)) cb(x, y, r);
    }
  }
}

/**
 * Weicher, unregelmäßiger Fleck (Klee, trockene Stelle): Kontur mit mehreren Wellen und Streckung,
 * in vier nach innen kleiner werdenden Schichten – der Rand läuft aus statt als Kreiskante zu enden.
 * Dazu ein, zwei Ausläufer, damit keine Form rund wirkt.
 */
function softBlot(g: Graphics, x: number, y: number, size: number, r: () => number, color: number, alpha: number) {
  const parts: [number, number, number][] = [[x, y, size]];
  const extra = 1 + Math.floor(r() * 2);
  for (let k = 0; k < extra; k++) {
    const a = r() * Math.PI * 2;
    const d = size * (0.35 + r() * 0.3);
    parts.push([x + Math.cos(a) * d, y + Math.sin(a) * d, size * (0.35 + r() * 0.3)]);
  }
  for (const [cx, cy, sz] of parts) {
    const harm = [2, 3, 4, 6].map((i) => ({ i, amp: (0.06 + r() * 0.16) / Math.sqrt(i / 2), ph: r() * Math.PI * 2 }));
    const stretch = 0.6 + r() * 0.5;
    const rot = r() * Math.PI;
    const c = Math.cos(rot);
    const sn = Math.sin(rot);
    for (const k of [1, 0.8, 0.6, 0.4]) {
      const pts: number[] = [];
      for (let j = 0; j < 28; j++) {
        const t = (j / 28) * Math.PI * 2;
        let rad = (sz / 2) * k;
        for (const h of harm) rad *= 1 + h.amp * Math.sin(h.i * t + h.ph);
        const u = Math.cos(t) * rad;
        const v = Math.sin(t) * rad * stretch;
        pts.push(cx + u * c - v * sn, cy + u * sn + v * c);
      }
      g.poly(pts, true).fill({ color, alpha: alpha / 3 });
    }
  }
}

/** gedrehte Ellipse als Polygon (Laub, Steine) */
function ellipse(g: Graphics, x: number, y: number, rx: number, ry: number, rot: number) {
  const pts: number[] = [];
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const u = Math.cos(a) * rx;
    const v = Math.sin(a) * ry;
    pts.push(x + u * c - v * s, y + u * s + v * c);
  }
  g.poly(pts, true);
}

/** Einmalige Details je Belag – wiederholen sich nie, weil sie zufällig über die Fläche gestreut sind */
export function surfaceDetails(g: Graphics, regions: FlatRegion[], texture: string, seed: number, season: Season) {
  if (texture === 'lawn') {
    // Kleefelder und dichte Stellen (dunkler), trockene Stellen (heller, gelblich)
    scatter(regions, 0.05, seed + 1, (x, y, r) => softBlot(g, x, y, 0.5 + r() * 1.0, r, 0x334114, 0.11));
    const dry = season === 'summer' ? 0xb9ab62 : 0xa79f78;
    scatter(regions, 0.018, seed + 2, (x, y, r) => softBlot(g, x, y, 0.4 + r() * 0.8, r, dry, 0.12));
    if (season === 'spring' || season === 'summer') {
      // Gänseblümchen in kleinen Gruppen
      scatter(regions, 0.03, seed + 3, (x, y, r) => {
        const n = 5 + Math.floor(r() * 12);
        for (let k = 0; k < n; k++) g.circle(x + (r() - 0.5) * 0.45, y + (r() - 0.5) * 0.45, 0.009 + r() * 0.005);
      });
      g.fill({ color: 0xf4f1e6, alpha: 0.85 });
    }
    return;
  }
  if (texture === 'paving' || texture === 'slabs' || texture === 'wood') {
    // einzelnes Laub, im Herbst deutlich mehr
    const d = season === 'autumn' ? 0.6 : 0.12;
    const cols = [0x8a6a3a, 0xa8823e, 0x6e5a34, 0xb98d45];
    for (let c = 0; c < cols.length; c++) {
      scatter(regions, d / cols.length, seed + 10 + c, (x, y, r) => ellipse(g, x, y, 0.03 + r() * 0.02, 0.015 + r() * 0.01, r() * Math.PI));
      g.fill({ color: cols[c], alpha: 0.85 });
    }
    return;
  }
  if (texture === 'gravel' || texture === 'basalt') {
    // ein paar größere Steine zwischen dem Splitt
    const light = texture === 'gravel' ? [0xd6ccb8, 0xbfb39c, 0xe4ddcf] : [0x4c4f53, 0x3e4144, 0x5a5d61];
    for (let c = 0; c < light.length; c++) {
      scatter(regions, 0.25, seed + 20 + c, (x, y, r) => ellipse(g, x, y, 0.025 + r() * 0.03, 0.02 + r() * 0.02, r() * Math.PI));
      g.fill({ color: light[c], alpha: 0.95 });
    }
  }
}
