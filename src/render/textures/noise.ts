/**
 * Nahtlose Rauschfunktionen (Periode in Gitterzellen) und pixelweises Malen
 * für die prozeduralen Materialkacheln.
 */
import type { RGB } from '../util/color';

function h2(x: number, y: number, s: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const wrap = (v: number, p: number) => ((v % p) + p) % p;
/** Wertrauschen mit Periode p (x, y in Gitterzellen) */
export function pnoise(x: number, y: number, p: number, s: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = h2(wrap(xi, p), wrap(yi, p), s);
  const b = h2(wrap(xi + 1, p), wrap(yi, p), s);
  const c = h2(wrap(xi, p), wrap(yi + 1, p), s);
  const d = h2(wrap(xi + 1, p), wrap(yi + 1, p), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** fBm über die Kachel: u, v in [0, 1), Grundfrequenz f (ganzzahlig → nahtlos) */
export function tfbm(u: number, v: number, f: number, s: number, oct = 4) {
  let sum = 0;
  let amp = 0.5;
  let n = 0;
  for (let i = 0; i < oct; i++) {
    const fr = f << i;
    sum += amp * pnoise(u * fr, v * fr, fr, s + i * 101);
    n += amp;
    amp *= 0.5;
  }
  return sum / n;
}

/** Pixelweise malen: fn(u, v) mit u, v ∈ [0,1) über die Kachel */
export function pixels(ctx: CanvasRenderingContext2D, w: number, h: number, fn: (u: number, v: number) => RGB) {
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const c = fn(i / w, j / h);
      const k = (j * w + i) * 4;
      d[k] = c[0];
      d[k + 1] = c[1];
      d[k + 2] = c[2];
      d[k + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
}
