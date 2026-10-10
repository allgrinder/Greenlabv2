/**
 * Anti-Kachel: Texture-Bombing, einmal beim Laden gebacken (bzw. aus dem Canvas-Cache geholt).
 */
import { Texture } from 'pixi.js';
import { cachedCanvas } from './texCache';
import { rng } from '../util/rng';
import type { TileSpec } from './tileSpecs';

/**
 * Größte Seitenlänge aufgebrochener Kacheln. Handys/Tablets (grober Zeiger, kein Mauszeiger) bekommen 1024 px:
 * ein Viertel des Speichers, auf dem kleinen Bildschirm ohne sichtbaren Unterschied; der Desktop bleibt bei 2048.
 */
const MAX_PX = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches ? 1024 : 2048;

/**
 * Große, nahtlose Kachel aus einer kleinen: erst normal gekachelt, dann viele weich maskierte Ausschnitte
 * der Vorlage an zufälligen Stellen mit zufälligem Versatz darübergelegt (nur verschoben, nicht gedreht –
 * das Licht in den Blender-Bildern kommt immer von links oben). Das Raster der Vorlage verschwindet,
 * die Wiederholung erst nach k Kachelbreiten (≥ 8 m) – mit Makro-Variation darüber praktisch unsichtbar.
 */
export function bomb(cacheKey: string, srcs: CanvasImageSource[], tileW: number, tileH: number, ppm: number, seed: number) {
  const k = Math.min(8, Math.max(3, Math.ceil(8 / Math.max(tileW, tileH))));
  const ppmT = Math.min(ppm, MAX_PX / (k * Math.max(tileW, tileH)));
  const tw = Math.round(tileW * ppmT);
  const th = Math.round(tileH * ppmT);
  // gespeichertes Ergebnis (2. Start) oder neu malen
  const img = cachedCanvas(`bomb|${cacheKey}|${seed}`, tw * k, th * k, (out) => paintBomb(out, srcs, tw, th, seed));
  const texture = Texture.from(img);
  texture.source.style.addressMode = 'repeat';
  texture.source.style.scaleMode = 'linear';
  texture.source.autoGenerateMipmaps = true;
  return { texture, spec: { w: tileW * k, h: tileH * k, pxPerM: ppmT, paint: () => undefined } as TileSpec };
}

function paintBomb(out: HTMLCanvasElement, srcs: CanvasImageSource[], tw: number, th: number, seed: number) {
  const W = out.width;
  const H = out.height;
  // Vorlagen (Grundkachel + Varianten) auf Zielauflösung
  const bases = srcs.map((src) => {
    const c = document.createElement('canvas');
    c.width = tw;
    c.height = th;
    c.getContext('2d')!.drawImage(src, 0, 0, tw, th);
    return c;
  });
  const base = bases[0];
  const ctx = out.getContext('2d')!;
  const pat = ctx.createPattern(base, 'repeat')!;
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, W, H);
  const r = rng(seed);
  const R = Math.round(Math.min(tw, th) * 0.55);
  const patch = document.createElement('canvas');
  patch.width = patch.height = R * 2;
  const pc = patch.getContext('2d')!;
  const ppats = bases.map((b) => pc.createPattern(b, 'repeat')!);
  const step = R * 1.05;
  for (let y = 0; y < H; y += step)
    for (let x = 0; x < W; x += step) {
      const cx = x + (r() - 0.5) * step;
      const cy = y + (r() - 0.5) * step;
      const rr = R * (0.7 + r() * 0.3);
      pc.globalCompositeOperation = 'source-over';
      pc.clearRect(0, 0, R * 2, R * 2);
      const ppat = ppats[Math.floor(r() * ppats.length)];
      ppat.setTransform(new DOMMatrix().translateSelf(r() * tw, r() * th));
      pc.fillStyle = ppat;
      pc.fillRect(0, 0, R * 2, R * 2);
      // weiche, leicht unrunde Maske
      pc.globalCompositeOperation = 'destination-in';
      const g = pc.createRadialGradient(R, R, rr * 0.35, R, R, rr);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      pc.fillStyle = g;
      pc.save();
      pc.translate(R, R);
      pc.scale(1 + (r() - 0.5) * 0.5, 1 + (r() - 0.5) * 0.5);
      pc.translate(-R, -R);
      pc.fillRect(0, 0, R * 2, R * 2);
      pc.restore();
      for (const ox of [0, -W, W])
        for (const oy of [0, -H, H]) {
          const px = cx - R + ox;
          const py = cy - R + oy;
          if (px > W || py > H || px + 2 * R < 0 || py + 2 * R < 0) continue;
          ctx.drawImage(patch, px, py);
        }
    }
}
