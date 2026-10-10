/**
 * Großflächige, halbtransparente Überlagerungen gegen sichtbare Kachelung:
 * Helligkeitswolken für Rasen, Partien und Blütennester für die Wildwiese, Makro-Variation für alle Beläge.
 */
import { FillPattern, Matrix, Texture } from 'pixi.js';
import { cachedCanvas } from './texCache';
import { rng } from '../util/rng';
import type { RGB } from '../util/color';
import { tfbm } from './noise';

/* ---------- große Helligkeitswolken für Rasen (nicht kachelnd wahrnehmbar) ---------- */

const MACRO = { size: 44, pxPerM: 6 };
let macroTex: Texture | null = null;

/** Weiche helle/dunkle Wolken über 44 × 44 m (Halbtransparenz), über den Rasen gelegt */
export function lawnMacroPattern(): FillPattern {
  if (!macroTex) {
    const n = MACRO.size * MACRO.pxPerM;
    const canvas = cachedCanvas('macro|lawn', n, n, (canvas) => {
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
    });
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
    const canvas = cachedCanvas('macro|meadow', n, n, (canvas) => {
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
      for (let c = 0; c < 260; c++) {
        const cx = r() * n;
        const cy = r() * n;
        const col = colors[Math.floor(r() * colors.length)];
        const rad = 4 + r() * 10;
        const dots = 5 + Math.floor(r() * 12);
        for (let d = 0; d < dots; d++) {
          const a = r() * Math.PI * 2;
          const q = Math.sqrt(r()) * rad;
          for (const ox of [0, -n, n])
            for (const oy of [0, -n, n]) {
              ctx.globalAlpha = 0.3 + r() * 0.35;
              ctx.fillStyle = col;
              ctx.beginPath();
              ctx.arc(cx + Math.cos(a) * q + ox, cy + Math.sin(a) * q + oy, 0.5 + r() * 0.6, 0, Math.PI * 2);
              ctx.fill();
            }
        }
      }
      ctx.globalAlpha = 1;
    });
    meadowTex = Texture.from(canvas);
    meadowTex.source.style.addressMode = 'repeat';
    meadowTex.source.scaleMode = 'linear';
  }
  const pattern = new FillPattern({ texture: meadowTex, repetition: 'repeat', textureSpace: 'global' });
  pattern.setTransform(new Matrix().scale(1 / MEADOW_MACRO.pxPerM, 1 / MEADOW_MACRO.pxPerM).translate(2.3, 5.1));
  return pattern;
}

/* ---------- Makro-Variation für alle Beläge: Verschmutzung, Abnutzung, Moos, Silbern ---------- */

interface MacroSpec {
  dark: RGB;
  light: RGB;
  aDark: number;
  aLight: number;
  /** Grundfrequenz der Wolken je Kachel (36 m) */
  f: number;
  seed: number;
  /** Moos/Grünstich in feinen Flecken (Platten, Holz) */
  moss?: number;
}

const MACROS: Record<string, MacroSpec> = {
  gravel: { dark: [88, 80, 66], light: [238, 232, 218], aDark: 80, aLight: 60, f: 7, seed: 101 },
  basalt: { dark: [8, 8, 10], light: [120, 122, 128], aDark: 70, aLight: 45, f: 7, seed: 102 },
  paving: { dark: [64, 66, 58], light: [236, 233, 226], aDark: 70, aLight: 45, f: 6, seed: 103, moss: 40 },
  slabs: { dark: [64, 66, 58], light: [236, 233, 226], aDark: 65, aLight: 45, f: 5, seed: 104, moss: 35 },
  wood: { dark: [56, 44, 32], light: [205, 198, 186], aDark: 55, aLight: 70, f: 6, seed: 105, moss: 20 },
  mulch: { dark: [24, 16, 10], light: [160, 128, 92], aDark: 80, aLight: 45, f: 8, seed: 106 },
  barkMulch: { dark: [16, 11, 8], light: [130, 100, 74], aDark: 80, aLight: 40, f: 8, seed: 107 },
  soil: { dark: [22, 16, 10], light: [140, 112, 84], aDark: 80, aLight: 40, f: 8, seed: 108 },
  sand: { dark: [150, 126, 92], light: [252, 244, 226], aDark: 60, aLight: 60, f: 6, seed: 109 },
};
const MACRO2 = { size: 36, pxPerM: 6 };
const macroTexs = new Map<string, Texture>();

/** Halbtransparente Überlagerung gegen Gleichförmigkeit; null für Beläge ohne (Wasser, Rasen/Wiese haben eigene) */
export function macroPattern(texture: string): FillPattern | null {
  const ms = MACROS[texture];
  if (!ms) return null;
  let tex = macroTexs.get(texture);
  if (!tex) {
    const n = MACRO2.size * MACRO2.pxPerM;
    const canvas = cachedCanvas(`macro2|${texture}`, n, n, (canvas) => {
      const ctx = canvas.getContext('2d')!;
      const img = ctx.createImageData(n, n);
      const mossC: RGB = [74, 92, 40];
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const t = tfbm(i / n, j / n, ms.f, ms.seed, 4);
          const k = (j * n + i) * 4;
          let c = t < 0.5 ? ms.dark : ms.light;
          let a = Math.min(1, Math.abs(t - 0.5) * 2.6);
          a = a * a * (t < 0.5 ? ms.aDark : ms.aLight);
          if (ms.moss) {
            const m2 = tfbm(i / n, j / n, ms.f * 4, ms.seed + 7, 3);
            if (m2 > 0.62) {
              c = mossC;
              a = Math.max(a, (m2 - 0.62) * 3 * ms.moss);
            }
          }
          img.data[k] = c[0];
          img.data[k + 1] = c[1];
          img.data[k + 2] = c[2];
          img.data[k + 3] = Math.round(a);
        }
      ctx.putImageData(img, 0, 0);
    });
    tex = Texture.from(canvas);
    tex.source.style.addressMode = 'repeat';
    tex.source.scaleMode = 'linear';
    macroTexs.set(texture, tex);
  }
  const pattern = new FillPattern({ texture: tex, repetition: 'repeat', textureSpace: 'global' });
  pattern.setTransform(new Matrix().scale(1 / MACRO2.pxPerM, 1 / MACRO2.pxPerM).translate(ms.seed % 17, (ms.seed * 3) % 13));
  return pattern;
}
