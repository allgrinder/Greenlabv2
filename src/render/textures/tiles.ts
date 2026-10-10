/**
 * Kachelauswahl je Material: Blender-Kachel (organische Beläge aufgebrochen) oder gemalte Ersatzkachel.
 * Hält die Caches der fertigen Kacheltexturen.
 */
import { Texture } from 'pixi.js';
import type { Material } from '../../core/model/types';
import { groundTile } from '../assets/groundAssets';
import { bomb } from './bomb';
import { SPECS, type TileSpec } from './tileSpecs';

const cache = new Map<string, { texture: Texture; spec: TileSpec }>();

/** Organische Beläge ohne Fugenraster: dürfen versetzt und überblendet werden */
const ORGANIC = new Set<string>(['lawn', 'gravel', 'basalt', 'mulch', 'barkMulch', 'soil', 'sand', 'meadow']);

const bombed = new Map<string, { texture: Texture; spec: TileSpec }>();

export function tile(key: Material['texture']) {
  // Blender-Kachel, sobald geladen; sonst die gemalte. Organische Beläge werden aufgebrochen (s. bomb)
  const g = groundTile(key);
  if (g) {
    if (!ORGANIC.has(key)) return { texture: g.texture, spec: { w: g.w, h: g.h, pxPerM: g.ppm, paint: () => undefined } as TileSpec };
    const k = `img|${key}`;
    let hit = bombed.get(k);
    if (!hit) {
      const srcs = [g.texture, ...(g.variants ?? [])].map((t) => t.source.resource as CanvasImageSource);
      hit = bomb(`img|${key}`, srcs, g.w, g.h, g.ppm, key.length * 977 + 13);
      bombed.set(k, hit);
    }
    return hit;
  }
  let hit = cache.get(key);
  if (hit) return hit;
  const spec = SPECS[key];
  const cw = Math.round(spec.w * spec.pxPerM);
  const ch = Math.round(spec.h * spec.pxPerM);
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  spec.paint(canvas.getContext('2d')!, cw, ch, spec.pxPerM);
  if (key === 'lawn') {
    // Rasen ist immer gemalt: ebenfalls aufbrechen
    hit = bomb('proc|lawn', [canvas], spec.w, spec.h, spec.pxPerM, 4711);
    cache.set(key, hit);
    return hit;
  }
  const texture = Texture.from(canvas);
  texture.source.style.addressMode = 'repeat';
  texture.source.style.scaleMode = 'linear';
  texture.source.autoGenerateMipmaps = true;
  hit = { texture, spec };
  cache.set(key, hit);
  return hit;
}

/** Belag ohne Fugenraster? (Kanten dürfen ausfransen, Textur wird aufgebrochen) */
export const isOrganic = (texture: string) => ORGANIC.has(texture);
