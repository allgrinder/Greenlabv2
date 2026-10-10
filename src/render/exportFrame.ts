/** Bildausschnitt für Exporte: Maßstab (begrenzt auf die Texturgröße), Bildgröße und Ansicht */
import { bbox, expandBBox } from '../core/geometry/polygon';
import type { Project } from '../core/model/types';
import type { Viewport } from '../state/types';

/** ganzes Grundstück mit Rand, in Pixel je Meter; nie größer als die maximale Texturgröße */
export function exportFrame(doc: Project, pxPerMeter: number, marginM: number) {
  const b = expandBBox(bbox(doc.site.boundary), marginM);
  const maxTex = 8192;
  const ppm = Math.min(pxPerMeter, maxTex / (b.maxX - b.minX), maxTex / (b.maxY - b.minY));
  const size = { width: Math.round((b.maxX - b.minX) * ppm), height: Math.round((b.maxY - b.minY) * ppm) };
  const vp: Viewport = { center: { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }, pxPerMeter: ppm, rotationDeg: 0 };
  return { ppm, size, vp };
}
