/**
 * Material-Swatches für das UI: dieselbe Kachel wie im Plan als CSS-Hintergrund.
 */
import type { Material } from '../../core/model/types';
import { groundTile } from '../assets/groundAssets';
import { tile } from './tiles';

const swatchCache = new Map<string, string>();

/**
 * CSS-Hintergrund für Material-Swatches im UI: dieselbe Kachel wie im Plan,
 * dargestellt mit `pxPerM` Bildschirmpixeln pro Meter.
 */
export function materialSwatchStyle(m: Material, pxPerM = 70): { backgroundImage: string; backgroundSize: string } {
  const g = groundTile(m.texture);
  if (g) return { backgroundImage: `url(${g.url})`, backgroundSize: `${g.w * pxPerM}px ${g.h * pxPerM}px` };
  let url = swatchCache.get(m.texture);
  const t = tile(m.texture);
  if (!url) {
    url = (t.texture.source.resource as HTMLCanvasElement).toDataURL();
    swatchCache.set(m.texture, url);
  }
  const spec = t.spec;
  return { backgroundImage: `url(${url})`, backgroundSize: `${spec.w * pxPerM}px ${spec.h * pxPerM}px` };
}
