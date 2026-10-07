/**
 * Prozedurale Kacheltexturen je Material. Muster und Farben folgen den SVG-Patterns
 * aus GardenPlan.dc.html, werden aber in Metern gedacht und zufällig (deterministisch) gestreut.
 */
import { FillPattern, Matrix, Texture } from 'pixi.js';
import type { Material } from '../../core/model/types';
import { rng } from '../util/rng';

type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number, pxPerM: number) => void;

interface TileSpec {
  /** Kachelgröße in Metern (Breite × Höhe) */
  w: number;
  h: number;
  pxPerM: number;
  paint: Painter;
}

const strokes = (
  ctx: CanvasRenderingContext2D,
  r: () => number,
  n: number,
  w: number,
  h: number,
  len: number,
  color: string,
  width: number,
  angle: () => number,
) => {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = r() * w;
    const y = r() * h;
    const a = angle();
    const l = len * (0.6 + r() * 0.8);
    // Kachelränder: Striche wiederholen sich modulo Kachelgröße
    for (const ox of [0, -w, w]) for (const oy of [0, -h, h]) {
      ctx.moveTo(x + ox, y + oy);
      ctx.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l);
    }
  }
  ctx.stroke();
};


/* ---------- nahtlose Rauschfunktionen (Periode in Gitterzellen) ---------- */

function h2(x: number, y: number, s: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const wrap = (v: number, p: number) => ((v % p) + p) % p;
/** Wertrauschen mit Periode p (x, y in Gitterzellen) */
function pnoise(x: number, y: number, p: number, s: number) {
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
function tfbm(u: number, v: number, f: number, s: number, oct = 4) {
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

type RGB = [number, number, number];
const C = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mixc = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Pixelweise malen: fn(u, v) mit u, v ∈ [0,1) über die Kachel */
function pixels(ctx: CanvasRenderingContext2D, w: number, h: number, fn: (u: number, v: number) => RGB) {
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

/** Kiesel/Häcksel: viele kleine beleuchtete Ellipsen, über die Kachelränder gespiegelt */
function pebbles(ctx: CanvasRenderingContext2D, r: () => number, n: number, w: number, h: number, rMin: number, rMax: number, tones: RGB[], elong = 0.75) {
  for (let i = 0; i < n; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = rMin + r() * (rMax - rMin);
    const ry = rad * (elong + r() * (1 - elong));
    const rot = r() * Math.PI;
    const base = tones[Math.floor(r() * tones.length)];
    for (const ox of [0, -w, w])
      for (const oy of [0, -h, h]) {
        const X = x + ox;
        const Y = y + oy;
        if (X < -rad * 2 || Y < -rad * 2 || X > w + rad * 2 || Y > h + rad * 2) continue;
        // Kontaktschatten
        ctx.fillStyle = 'rgba(30,24,16,0.28)';
        ctx.beginPath();
        ctx.ellipse(X + rad * 0.22, Y + rad * 0.28, rad, ry, rot, 0, Math.PI * 2);
        ctx.fill();
        const g = ctx.createRadialGradient(X - rad * 0.35, Y - rad * 0.4, rad * 0.05, X, Y, rad * 1.05);
        g.addColorStop(0, `rgb(${Math.min(255, base[0] * 1.22) | 0},${Math.min(255, base[1] * 1.22) | 0},${Math.min(255, base[2] * 1.2) | 0})`);
        g.addColorStop(1, `rgb(${(base[0] * 0.72) | 0},${(base[1] * 0.72) | 0},${(base[2] * 0.7) | 0})`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(X, Y, rad, ry, rot, 0, Math.PI * 2);
        ctx.fill();
      }
  }
}

const SPECS: Record<Material['texture'], TileSpec> = {
  lawn: {
    w: 6,
    h: 6,
    pxPerM: 100,
    paint(ctx, w, h) {
      const A = C('#6b8443');
      const B = C('#90a660');
      const D = C('#aaa96a');
      pixels(ctx, w, h, (u, v) => {
        const big = tfbm(u, v, 2, 3, 3);
        const mid = tfbm(u, v, 9, 5, 3);
        const blade = pnoise(u * 360, v * 360, 360, 9) * 0.6 + pnoise(u * 600, v * 120, 600, 4) * 0.4;
        // Mähstreifen 1 m (6 je Kachel)
        const stripe = 1 + 0.022 * Math.sign(Math.sin(u * Math.PI * 6));
        let c = mixc(A, B, Math.min(1, Math.max(0, big * 1.3 - 0.15)));
        c = mixc(c, D, Math.max(0, mid - 0.62) * 1.5);
        const f = (0.8 + blade * 0.36) * stripe;
        return [c[0] * f, c[1] * f, c[2] * f];
      });
      // einzelne Halme mit Lichtkante
      const r = rng(11);
      const up = () => -Math.PI / 2 + (r() - 0.5) * 0.9;
      strokes(ctx, r, 2200, w, h, 9, 'rgba(36,52,20,.22)', 1.4, up);
      strokes(ctx, r, 1400, w, h, 8, 'rgba(232,240,190,.16)', 1.2, up);
    },
  },
  gravel: {
    w: 1,
    h: 1,
    pxPerM: 256,
    paint(ctx, w, h) {
      const base = C('#cdbfa4');
      pixels(ctx, w, h, (u, v) => {
        const n = tfbm(u, v, 4, 21, 3);
        const g = pnoise(u * 180, v * 180, 180, 22);
        const f = 0.82 + n * 0.2 + g * 0.1;
        return [base[0] * f, base[1] * f, base[2] * f];
      });
      const r = rng(23);
      pebbles(ctx, r, 520, w, h, 2.2, 5.2, [C('#d9ccb3'), C('#c7b79a'), C('#e6dcc8'), C('#b3a184'), C('#9e9078'), C('#e9e3d6')]);
    },
  },
  paving: {
    w: 1.6,
    h: 0.8,
    pxPerM: 160,
    paint(ctx, w, h, k) {
      const pw = 0.8 * k;
      const ph = 0.4 * k;
      const joint = Math.max(2, 0.008 * k);
      const r = rng(19);
      // Fuge
      ctx.fillStyle = '#7d7262';
      ctx.fillRect(0, 0, w, h);
      for (let row = 0; row < 2; row++) {
        const off = row ? pw / 2 : 0;
        for (let x = -pw + off; x < w; x += pw) {
          const tone = mixc(C('#cfc4b0'), C('#b9ab95'), r());
          const x0 = x + joint / 2;
          const y0 = row * ph + joint / 2;
          const sw = pw - joint;
          const sh = ph - joint;
          // Plattenfläche mit feiner Körnung
          const img = ctx.getImageData(0, 0, w, h);
          const d = img.data;
          const seed = Math.floor(r() * 1000);
          for (let j = Math.max(0, Math.floor(y0)); j < Math.min(h, Math.ceil(y0 + sh)); j++)
            for (let i = Math.max(0, Math.floor(x0)); i < Math.min(w, Math.ceil(x0 + sw)); i++) {
              const u = i / w;
              const v = j / h;
              const f = 0.88 + tfbm(u, v, 8, seed, 3) * 0.16 + pnoise(u * 300, v * 150, 300, seed + 1) * 0.07;
              const kk = (j * w + i) * 4;
              d[kk] = tone[0] * f;
              d[kk + 1] = tone[1] * f;
              d[kk + 2] = tone[2] * f;
            }
          ctx.putImageData(img, 0, 0);
          // Fase: Licht oben/links, Schatten unten/rechts
          ctx.fillStyle = 'rgba(255,250,235,0.25)';
          ctx.fillRect(x0, y0, sw, joint * 0.8);
          ctx.fillRect(x0, y0, joint * 0.8, sh);
          ctx.fillStyle = 'rgba(40,32,22,0.22)';
          ctx.fillRect(x0, y0 + sh - joint * 0.8, sw, joint * 0.8);
          ctx.fillRect(x0 + sw - joint * 0.8, y0, joint * 0.8, sh);
        }
      }
    },
  },
  wood: {
    w: 2.4,
    h: 0.58,
    pxPerM: 160,
    paint(ctx, w, h) {
      const bw = h / 4;
      const r = rng(5);
      const tones = [0, 1, 2, 3].map(() => mixc(C('#9c6e45'), C('#c08f5f'), r()));
      const ends = [0.3, 0.8, 0.55, 0.05];
      pixels(ctx, w, h, (u, v) => {
        const row = Math.min(3, Math.floor(v * 4));
        const inRow = v * 4 - row;
        const seg = u < ends[row] ? 0 : 1;
        const t = tones[(row + seg * 2) % 4];
        const grain = tfbm(u, v * 4, 3, 13 + row * 7 + seg, 4);
        const fine = pnoise(u * 40, v * 400, 40, 17 + row);
        let f = 0.82 + grain * 0.22 + fine * 0.08;
        const edge = Math.min(inRow, 1 - inRow);
        if (edge < 0.06) f *= 0.42 + edge * 6;
        if (Math.abs(u - ends[row]) * w < 1.5) f *= 0.5;
        return [t[0] * f, t[1] * f, t[2] * f];
      });
      void bw;
    },
  },
  mulch: {
    w: 0.6,
    h: 0.6,
    pxPerM: 320,
    paint(ctx, w, h) {
      const base = C('#5e4532');
      pixels(ctx, w, h, (u, v) => {
        const f = 0.8 + tfbm(u, v, 4, 31, 3) * 0.3;
        return [base[0] * f, base[1] * f, base[2] * f];
      });
      const r = rng(31);
      pebbles(ctx, r, 260, w, h, 3, 7, [C('#8a6849'), C('#6e533f'), C('#a7845f'), C('#5a412f')], 0.35);
    },
  },
  barkMulch: {
    w: 0.6,
    h: 0.6,
    pxPerM: 320,
    paint(ctx, w, h) {
      const base = C('#3e2d22');
      pixels(ctx, w, h, (u, v) => {
        const f = 0.8 + tfbm(u, v, 4, 37, 3) * 0.3;
        return [base[0] * f, base[1] * f, base[2] * f];
      });
      const r = rng(37);
      pebbles(ctx, r, 140, w, h, 5, 11, [C('#5a3f2d'), C('#6b4a33'), C('#4a3324'), C('#7a5638')], 0.45);
    },
  },
  soil: {
    w: 0.8,
    h: 0.8,
    pxPerM: 256,
    paint(ctx, w, h) {
      const A = C('#4a3626');
      const B = C('#6a4d34');
      pixels(ctx, w, h, (u, v) => {
        const c = mixc(A, B, tfbm(u, v, 3, 41, 3));
        const f = 0.78 + pnoise(u * 160, v * 160, 160, 42) * 0.3 + (pnoise(u * 40, v * 40, 40, 43) > 0.8 ? 0.12 : 0);
        return [c[0] * f, c[1] * f, c[2] * f];
      });
    },
  },
  water: {
    w: 3,
    h: 3,
    pxPerM: 100,
    paint(ctx, w, h) {
      const deep = C('#2f5d66');
      const lite = C('#6f9fa3');
      pixels(ctx, w, h, (u, v) => {
        const n = tfbm(u, v, 3, 51, 4);
        const rip = Math.sin((u * 12 + tfbm(u, v, 2, 52, 2) * 4) * Math.PI * 2) * 0.5 + 0.5;
        const c = mixc(deep, lite, n * 0.7 + rip * 0.12);
        return c;
      });
      // Glanzlichter
      const r = rng(53);
      ctx.strokeStyle = 'rgba(255,255,255,.22)';
      ctx.lineCap = 'round';
      for (let i = 0; i < 40; i++) {
        const x = r() * w;
        const y = r() * h;
        const l = 10 + r() * 30;
        ctx.lineWidth = 1 + r() * 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + l / 2, y - l * 0.15, x + l, y);
        ctx.stroke();
      }
    },
  },
};

const cache = new Map<string, { texture: Texture; spec: TileSpec }>();

function tile(key: Material['texture']) {
  let hit = cache.get(key);
  if (hit) return hit;
  const spec = SPECS[key];
  const cw = Math.round(spec.w * spec.pxPerM);
  const ch = Math.round(spec.h * spec.pxPerM);
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  spec.paint(canvas.getContext('2d')!, cw, ch, spec.pxPerM);
  const texture = Texture.from(canvas);
  texture.source.style.addressMode = 'repeat';
  texture.source.style.scaleMode = 'linear';
  texture.source.autoGenerateMipmaps = true;
  hit = { texture, spec };
  cache.set(key, hit);
  return hit;
}

/**
 * Füllmuster für ein Material. Die Matrix bildet Texturpixel auf Weltmeter ab;
 * bei `anchor: object` zusätzlich auf Lage und Drehung des Objekts.
 */
export function materialPattern(m: Material, origin?: { x: number; y: number }, rotationDeg = 0): FillPattern {
  const { texture, spec } = tile(m.texture);
  const pattern = new FillPattern({ texture, repetition: 'repeat', textureSpace: 'global' });
  const mtx = new Matrix().scale(1 / spec.pxPerM, 1 / spec.pxPerM);
  if (m.anchor === 'object' && origin) {
    mtx.rotate((rotationDeg * Math.PI) / 180);
    mtx.translate(origin.x, origin.y);
  }
  pattern.setTransform(mtx);
  return pattern;
}

const swatchCache = new Map<string, string>();

/**
 * CSS-Hintergrund für Material-Swatches im UI: dieselbe Kachel wie im Plan,
 * dargestellt mit `pxPerM` Bildschirmpixeln pro Meter.
 */
export function materialSwatchStyle(m: Material, pxPerM = 70): { backgroundImage: string; backgroundSize: string } {
  let url = swatchCache.get(m.texture);
  if (!url) {
    url = (tile(m.texture).texture.source.resource as HTMLCanvasElement).toDataURL();
    swatchCache.set(m.texture, url);
  }
  const spec = SPECS[m.texture];
  return { backgroundImage: `url(${url})`, backgroundSize: `${spec.w * pxPerM}px ${spec.h * pxPerM}px` };
}
