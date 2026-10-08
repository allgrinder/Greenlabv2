/**
 * Prozedurale Kacheltexturen je Material. Muster und Farben folgen den SVG-Patterns
 * aus GardenPlan.dc.html, werden aber in Metern gedacht und zufällig (deterministisch) gestreut.
 */
import { FillPattern, Matrix, Texture } from 'pixi.js';
import type { Material } from '../../core/model/types';
import { groundTile } from '../assets/groundAssets';
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
  slabs: null as unknown as TileSpec,
  lawn: {
    // Nur Feinstruktur (Halme, Körnung, 1-m-Flecken); große Wolken liefert lawnMacroPattern
    w: 4,
    h: 4,
    pxPerM: 100,
    paint(ctx, w, h) {
      const A = C('#939e4f');
      const B = C('#afb868');
      const D = C('#c0c67c');
      pixels(ctx, w, h, (u, v) => {
        const mid = tfbm(u, v, 4, 5, 3);
        const fine = tfbm(u, v, 24, 7, 2);
        const grain = pnoise(u * 400, v * 400, 400, 9) * 0.55 + pnoise(u * 160, v * 160, 160, 4) * 0.45;
        let c = mixc(A, B, Math.min(1, Math.max(0, mid * 1.5 - 0.25)));
        c = mixc(c, D, Math.max(0, fine - 0.6) * 1.6);
        const f = 0.87 + grain * 0.22;
        return [c[0] * f, c[1] * f, c[2] * f];
      });
      // kurze Halme: dunkle Schattenseite, helle Spitzen
      const r = rng(11);
      const any = () => r() * Math.PI * 2;
      strokes(ctx, r, 5200, w, h, 4, 'rgba(78,90,36,.16)', 1.1, any);
      strokes(ctx, r, 3600, w, h, 3.5, 'rgba(214,220,150,.13)', 1, any);
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
  meadow: {
    // Ersatz bis das Blender-Bild geladen ist: dunkleres, struppiges Grün mit Blütentupfen
    w: 2,
    h: 2,
    pxPerM: 120,
    paint(ctx, w, h) {
      const A = C('#6f7a36');
      const B = C('#a4ac5c');
      pixels(ctx, w, h, (u, v) => {
        const c = mixc(A, B, tfbm(u, v, 4, 61, 3));
        const f = 0.8 + pnoise(u * 220, v * 220, 220, 62) * 0.35;
        return [c[0] * f, c[1] * f, c[2] * f];
      });
      const r = rng(63);
      for (const col of ['#f2efe4', '#c4342a', '#4f6fc4', '#e3bf3e', '#9c6aae']) {
        ctx.fillStyle = col;
        for (let i = 0; i < 40; i++) {
          ctx.beginPath();
          ctx.arc(r() * w, r() * h, 1 + r() * 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
  },
  sand: {
    w: 1,
    h: 1,
    pxPerM: 200,
    paint(ctx, w, h) {
      const A = C('#c2ab80');
      const B = C('#e2d2ad');
      pixels(ctx, w, h, (u, v) => {
        const c = mixc(A, B, tfbm(u, v, 3, 71, 3));
        const f = 0.9 + pnoise(u * 180, v * 180, 180, 72) * 0.16;
        return [c[0] * f, c[1] * f, c[2] * f];
      });
    },
  },
  stepping: {
    // Trittplattenweg: Fläche bleibt Rasen; die Platten zeichnet objectView einzeln
    w: 1,
    h: 1,
    pxPerM: 60,
    paint(ctx, w, h) {
      ctx.fillStyle = '#b1aca2';
      ctx.fillRect(0, 0, w, h);
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

// Großformat: gleiche Malweise wie Terrassenplatten, bis die Blender-Kachel da ist
SPECS.slabs = { ...SPECS.paving, w: 2.4, h: 1.2 };

const cache = new Map<string, { texture: Texture; spec: TileSpec }>();

function tile(key: Material['texture']) {
  // Blender-Kachel, sobald geladen; sonst die gemalte
  const g = groundTile(key);
  if (g) return { texture: g.texture, spec: { w: g.w, h: g.h, pxPerM: g.ppm, paint: () => undefined } as TileSpec };
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

/* ---------- große Helligkeitswolken für Rasen (nicht kachelnd wahrnehmbar) ---------- */

const MACRO = { size: 44, pxPerM: 6 };
let macroTex: Texture | null = null;

/** Weiche helle/dunkle Wolken über 44 × 44 m (Halbtransparenz), über den Rasen gelegt */
export function lawnMacroPattern(): FillPattern {
  if (!macroTex) {
    const n = MACRO.size * MACRO.pxPerM;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = n;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(n, n);
    const dark: RGB = [64, 76, 26];
    const light: RGB = [206, 210, 140];
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const t = tfbm(i / n, j / n, 5, 31, 4);
        const k = (j * n + i) * 4;
        const c = t < 0.5 ? dark : light;
        const a = Math.min(1, Math.abs(t - 0.5) * 2.4);
        img.data[k] = c[0];
        img.data[k + 1] = c[1];
        img.data[k + 2] = c[2];
        img.data[k + 3] = Math.round(a * a * (t < 0.5 ? 120 : 90));
      }
    ctx.putImageData(img, 0, 0);
    macroTex = Texture.from(canvas);
    macroTex.source.style.addressMode = 'repeat';
    macroTex.source.scaleMode = 'linear';
  }
  const pattern = new FillPattern({ texture: macroTex, repetition: 'repeat', textureSpace: 'global' });
  pattern.setTransform(new Matrix().scale(1 / MACRO.pxPerM, 1 / MACRO.pxPerM).translate(7.3, 3.1));
  return pattern;
}

/* ---------- Wildwiese: hohe/niedrige Partien und Blütennester über viele Meter ---------- */

const MEADOW_MACRO = { size: 36, pxPerM: 10 };
let meadowTex: Texture | null = null;

/** Halbtransparente Überlagerung der Wiesenkachel: helle Grasbüschel, dunkle Senken, Blütennester */
export function meadowMacroPattern(): FillPattern {
  if (!meadowTex) {
    const n = MEADOW_MACRO.size * MEADOW_MACRO.pxPerM;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = n;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(n, n);
    const dark: RGB = [52, 62, 22];
    const light: RGB = [214, 206, 126];
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const t = tfbm(i / n, j / n, 9, 77, 4);
        const k = (j * n + i) * 4;
        const c = t < 0.5 ? dark : light;
        const a = Math.min(1, Math.abs(t - 0.5) * 2.6);
        img.data[k] = c[0];
        img.data[k + 1] = c[1];
        img.data[k + 2] = c[2];
        img.data[k + 3] = Math.round(a * a * (t < 0.5 ? 110 : 120));
      }
    ctx.putImageData(img, 0, 0);
    // Blütennester: Margerite, Mohn, Kornblume, Wiesensalbei, Hahnenfuß – je Nest eine Farbe dominiert
    const r = rng(78);
    const colors = ['#f4f1e6', '#f4f1e6', '#c4342a', '#5a78cc', '#9c6aae', '#e3bf3e', '#efe7c8'];
    for (let c = 0; c < 70; c++) {
      const cx = r() * n;
      const cy = r() * n;
      const col = colors[Math.floor(r() * colors.length)];
      const rad = 6 + r() * 16;
      const dots = 12 + Math.floor(r() * 30);
      for (let d = 0; d < dots; d++) {
        const a = r() * Math.PI * 2;
        const q = Math.sqrt(r()) * rad;
        for (const ox of [0, -n, n])
          for (const oy of [0, -n, n]) {
            ctx.globalAlpha = 0.45 + r() * 0.4;
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.arc(cx + Math.cos(a) * q + ox, cy + Math.sin(a) * q + oy, 0.6 + r() * 0.9, 0, Math.PI * 2);
            ctx.fill();
          }
      }
    }
    ctx.globalAlpha = 1;
    meadowTex = Texture.from(canvas);
    meadowTex.source.style.addressMode = 'repeat';
    meadowTex.source.scaleMode = 'linear';
  }
  const pattern = new FillPattern({ texture: meadowTex, repetition: 'repeat', textureSpace: 'global' });
  pattern.setTransform(new Matrix().scale(1 / MEADOW_MACRO.pxPerM, 1 / MEADOW_MACRO.pxPerM).translate(2.3, 5.1));
  return pattern;
}

const swatchCache = new Map<string, string>();

/**
 * CSS-Hintergrund für Material-Swatches im UI: dieselbe Kachel wie im Plan,
 * dargestellt mit `pxPerM` Bildschirmpixeln pro Meter.
 */
export function materialSwatchStyle(m: Material, pxPerM = 70): { backgroundImage: string; backgroundSize: string } {
  const g = groundTile(m.texture);
  if (g) return { backgroundImage: `url(${g.url})`, backgroundSize: `${g.w * pxPerM}px ${g.h * pxPerM}px` };
  let url = swatchCache.get(m.texture);
  if (!url) {
    url = (tile(m.texture).texture.source.resource as HTMLCanvasElement).toDataURL();
    swatchCache.set(m.texture, url);
  }
  const spec = SPECS[m.texture];
  return { backgroundImage: `url(${url})`, backgroundSize: `${spec.w * pxPerM}px ${spec.h * pxPerM}px` };
}
