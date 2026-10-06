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

const dots = (ctx: CanvasRenderingContext2D, r: () => number, n: number, w: number, h: number, rMin: number, rMax: number, colors: string[]) => {
  for (let i = 0; i < n; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = rMin + r() * (rMax - rMin);
    ctx.fillStyle = colors[Math.floor(r() * colors.length)];
    for (const ox of [0, -w, w]) for (const oy of [0, -h, h]) {
      ctx.beginPath();
      ctx.ellipse(x + ox, y + oy, rad, rad * (0.7 + r() * 0.3), r() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  }
};

const SPECS: Record<Material['texture'], TileSpec> = {
  lawn: {
    w: 4,
    h: 4,
    pxPerM: 96,
    paint(ctx, w, h, k) {
      const r = rng(11);
      ctx.fillStyle = '#9BAE74';
      ctx.fillRect(0, 0, w, h);
      // Mähstreifen 2 m breit
      ctx.fillStyle = 'rgba(255,255,236,.06)';
      ctx.fillRect(0, 0, w / 2, h);
      const up = () => -Math.PI / 2 + (r() - 0.5) * 0.9;
      strokes(ctx, r, 2600, w, h, 0.12 * k, 'rgba(46,64,28,.30)', 0.035 * k, up);
      strokes(ctx, r, 1600, w, h, 0.1 * k, 'rgba(250,248,222,.30)', 0.035 * k, up);
    },
  },
  gravel: {
    w: 1,
    h: 1,
    pxPerM: 256,
    paint(ctx, w, h, k) {
      const r = rng(23);
      ctx.fillStyle = '#D6CDBB';
      ctx.fillRect(0, 0, w, h);
      dots(ctx, r, 900, w, h, 0.012 * k, 0.026 * k, ['rgba(80,70,55,.30)', 'rgba(255,252,240,.6)', 'rgba(60,52,40,.3)', 'rgba(140,125,105,.28)']);
    },
  },
  paving: {
    w: 1.6,
    h: 0.8,
    pxPerM: 160,
    paint(ctx, w, h, k) {
      ctx.fillStyle = '#CFC3AE';
      ctx.fillRect(0, 0, w, h);
      const pw = 0.8 * k;
      const ph = 0.4 * k;
      // Halbversatz, leichte Tonvariation je Platte
      const tones = ['rgba(0,0,0,.035)', 'rgba(255,255,255,.05)', 'rgba(0,0,0,0)', 'rgba(120,100,80,.04)'];
      let t = 0;
      for (let row = 0; row < 2; row++) {
        const off = row ? pw / 2 : 0;
        for (let x = -pw + off; x < w; x += pw) {
          ctx.fillStyle = tones[t++ % tones.length];
          ctx.fillRect(x, row * ph, pw, ph);
        }
      }
      ctx.strokeStyle = 'rgba(85,72,58,.42)';
      ctx.lineWidth = Math.max(1, 0.012 * k);
      ctx.beginPath();
      for (let row = 0; row <= 2; row++) {
        ctx.moveTo(0, row * ph);
        ctx.lineTo(w, row * ph);
      }
      for (let row = 0; row < 2; row++) {
        const off = row ? pw / 2 : 0;
        for (let x = off; x <= w; x += pw) {
          ctx.moveTo(x, row * ph);
          ctx.lineTo(x, row * ph + ph);
        }
      }
      ctx.stroke();
    },
  },
  wood: {
    w: 2.4,
    h: 0.58,
    pxPerM: 160,
    paint(ctx, w, h, k) {
      const r = rng(5);
      ctx.fillStyle = '#B78C61';
      ctx.fillRect(0, 0, w, h);
      const bw = h / 4;
      for (let i = 0; i < 4; i++) {
        const y = i * bw;
        ctx.fillStyle = `rgba(${r() > 0.5 ? '255,240,220' : '70,45,25'},${0.04 + r() * 0.05})`;
        ctx.fillRect(0, y, w, bw);
        // Maserung
        ctx.strokeStyle = 'rgba(70,45,25,.16)';
        ctx.lineWidth = 0.006 * k;
        for (let j = 0; j < 3; j++) {
          const gy = y + bw * (0.25 + r() * 0.5);
          ctx.beginPath();
          ctx.moveTo(r() * w * 0.5, gy);
          ctx.lineTo(w * (0.5 + r() * 0.5), gy + (r() - 0.5) * 0.01 * k);
          ctx.stroke();
        }
      }
      ctx.strokeStyle = 'rgba(70,45,25,.5)';
      ctx.lineWidth = Math.max(1, 0.01 * k);
      ctx.beginPath();
      for (let i = 0; i <= 4; i++) {
        ctx.moveTo(0, i * bw);
        ctx.lineTo(w, i * bw);
      }
      // Stoßfugen versetzt
      [0.3, 0.8, 0.55, 0.05].forEach((f, i) => {
        ctx.moveTo(f * w, i * bw);
        ctx.lineTo(f * w, (i + 1) * bw);
      });
      ctx.stroke();
    },
  },
  mulch: {
    w: 0.6,
    h: 0.6,
    pxPerM: 320,
    paint(ctx, w, h, k) {
      const r = rng(31);
      ctx.fillStyle = '#6E533F';
      ctx.fillRect(0, 0, w, h);
      const any = () => r() * Math.PI * 2;
      strokes(ctx, r, 260, w, h, 0.03 * k, 'rgba(55,36,22,.45)', 0.012 * k, any);
      strokes(ctx, r, 160, w, h, 0.022 * k, 'rgba(235,215,185,.22)', 0.01 * k, any);
    },
  },
  barkMulch: {
    w: 0.6,
    h: 0.6,
    pxPerM: 320,
    paint(ctx, w, h, k) {
      const r = rng(37);
      ctx.fillStyle = '#4E3A2C';
      ctx.fillRect(0, 0, w, h);
      dots(ctx, r, 120, w, h, 0.012 * k, 0.03 * k, ['rgba(30,20,12,.5)', 'rgba(120,90,65,.4)', 'rgba(90,64,44,.5)']);
      strokes(ctx, r, 80, w, h, 0.03 * k, 'rgba(200,170,130,.18)', 0.008 * k, () => r() * Math.PI * 2);
    },
  },
  soil: {
    w: 0.8,
    h: 0.8,
    pxPerM: 256,
    paint(ctx, w, h, k) {
      const r = rng(41);
      ctx.fillStyle = '#5B4535';
      ctx.fillRect(0, 0, w, h);
      dots(ctx, r, 500, w, h, 0.004 * k, 0.012 * k, ['rgba(30,20,12,.35)', 'rgba(150,120,90,.25)']);
    },
  },
  water: {
    w: 1.7,
    h: 0.8,
    pxPerM: 160,
    paint(ctx, w, h, k) {
      ctx.fillStyle = '#5F8F95';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,.28)';
      ctx.lineWidth = 0.03 * k;
      ctx.lineCap = 'round';
      const ripple = (x: number, y: number, l: number) => {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + l / 2, y - l * 0.24, x + l, y);
        ctx.stroke();
      };
      ripple(0.1 * k, 0.4 * k, 0.45 * k);
      ripple(0.95 * k, 0.18 * k, 0.35 * k);
      ripple(0.75 * k, 0.68 * k, 0.3 * k);
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

/** Vorschaubild (CSS-Hintergrund) für Swatches im UI */
export function materialSwatchUrl(m: Material): string {
  const { texture } = tile(m.texture);
  return (texture.source.resource as HTMLCanvasElement).toDataURL();
}
