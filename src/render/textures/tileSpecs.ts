/**
 * Prozedurale Kachelmaler je Material (Ersatz, bis die Blender-Kacheln geladen sind).
 * Muster und Farben folgen den SVG-Patterns aus GardenPlan.dc.html, in Metern gedacht.
 */
import type { Material } from '../../core/model/types';
import { rng } from '../util/rng';
import { mix, rgbOf, type RGB } from '../util/color';
import { pixels, pnoise, tfbm } from './noise';

export type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number, pxPerM: number) => void;

export interface TileSpec {
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

export const SPECS: Record<Material['texture'], TileSpec> = {
  slabs: null as unknown as TileSpec,
  basalt: null as unknown as TileSpec,
  lawn: {
    // Nur Feinstruktur (Halme, Körnung, 1-m-Flecken); große Wolken liefert lawnMacroPattern
    w: 4,
    h: 4,
    pxPerM: 100,
    paint(ctx, w, h) {
      // satt und olivgrün wie im Gartenkonzept (Mittel etwa #75843a)
      const A = rgbOf('#66752c');
      const B = rgbOf('#7f8e3c');
      const D = rgbOf('#99a552');
      pixels(ctx, w, h, (u, v) => {
        const mid = tfbm(u, v, 4, 5, 3);
        const fine = tfbm(u, v, 24, 7, 2);
        const grain = pnoise(u * 400, v * 400, 400, 9) * 0.55 + pnoise(u * 160, v * 160, 160, 4) * 0.45;
        let c = mix(A, B, Math.min(1, Math.max(0, mid * 1.5 - 0.25)));
        c = mix(c, D, Math.max(0, fine - 0.6) * 1.6);
        const f = 0.87 + grain * 0.22;
        return [c[0] * f, c[1] * f, c[2] * f];
      });
      // kurze Halme: dunkle Schattenseite, helle Spitzen
      const r = rng(11);
      const any = () => r() * Math.PI * 2;
      strokes(ctx, r, 6400, w, h, 4, 'rgba(40,50,16,.2)', 1.1, any);
      strokes(ctx, r, 4200, w, h, 3.5, 'rgba(178,188,100,.13)', 1, any);
    },
  },
  gravel: {
    w: 1,
    h: 1,
    pxPerM: 256,
    paint(ctx, w, h) {
      const base = rgbOf('#cdbfa4');
      pixels(ctx, w, h, (u, v) => {
        const n = tfbm(u, v, 4, 21, 3);
        const g = pnoise(u * 180, v * 180, 180, 22);
        const f = 0.82 + n * 0.2 + g * 0.1;
        return [base[0] * f, base[1] * f, base[2] * f];
      });
      const r = rng(23);
      pebbles(ctx, r, 520, w, h, 2.2, 5.2, [rgbOf('#d9ccb3'), rgbOf('#c7b79a'), rgbOf('#e6dcc8'), rgbOf('#b3a184'), rgbOf('#9e9078'), rgbOf('#e9e3d6')]);
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
          const tone = mix(rgbOf('#cfc4b0'), rgbOf('#b9ab95'), r());
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
      const tones = [0, 1, 2, 3].map(() => mix(rgbOf('#9c6e45'), rgbOf('#c08f5f'), r()));
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
      const base = rgbOf('#5e4532');
      pixels(ctx, w, h, (u, v) => {
        const f = 0.8 + tfbm(u, v, 4, 31, 3) * 0.3;
        return [base[0] * f, base[1] * f, base[2] * f];
      });
      const r = rng(31);
      pebbles(ctx, r, 260, w, h, 3, 7, [rgbOf('#8a6849'), rgbOf('#6e533f'), rgbOf('#a7845f'), rgbOf('#5a412f')], 0.35);
    },
  },
  barkMulch: {
    w: 0.6,
    h: 0.6,
    pxPerM: 320,
    paint(ctx, w, h) {
      const base = rgbOf('#3e2d22');
      pixels(ctx, w, h, (u, v) => {
        const f = 0.8 + tfbm(u, v, 4, 37, 3) * 0.3;
        return [base[0] * f, base[1] * f, base[2] * f];
      });
      const r = rng(37);
      pebbles(ctx, r, 140, w, h, 5, 11, [rgbOf('#5a3f2d'), rgbOf('#6b4a33'), rgbOf('#4a3324'), rgbOf('#7a5638')], 0.45);
    },
  },
  soil: {
    w: 0.8,
    h: 0.8,
    pxPerM: 256,
    paint(ctx, w, h) {
      const A = rgbOf('#4a3626');
      const B = rgbOf('#6a4d34');
      pixels(ctx, w, h, (u, v) => {
        const c = mix(A, B, tfbm(u, v, 3, 41, 3));
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
      const A = rgbOf('#6f7a36');
      const B = rgbOf('#a4ac5c');
      pixels(ctx, w, h, (u, v) => {
        const c = mix(A, B, tfbm(u, v, 4, 61, 3));
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
      const A = rgbOf('#c2ab80');
      const B = rgbOf('#e2d2ad');
      pixels(ctx, w, h, (u, v) => {
        const c = mix(A, B, tfbm(u, v, 3, 71, 3));
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
      const deep = rgbOf('#2f5d66');
      const lite = rgbOf('#6f9fa3');
      pixels(ctx, w, h, (u, v) => {
        const n = tfbm(u, v, 3, 51, 4);
        const rip = Math.sin((u * 12 + tfbm(u, v, 2, 52, 2) * 4) * Math.PI * 2) * 0.5 + 0.5;
        const c = mix(deep, lite, n * 0.7 + rip * 0.12);
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
// Basalt: gemalt wie Kies, nur dunkel – bis die Blender-Kachel geladen ist
SPECS.basalt = {
  w: 0.8,
  h: 0.8,
  pxPerM: 256,
  paint(ctx, w, h) {
    ctx.fillStyle = '#26282a';
    ctx.fillRect(0, 0, w, h);
    pebbles(ctx, rng(91), 900, w, h, 3, 7, [rgbOf('#3c3f42'), rgbOf('#4a4d50'), rgbOf('#2f3234'), rgbOf('#55585b')], 0.6);
  },
};
