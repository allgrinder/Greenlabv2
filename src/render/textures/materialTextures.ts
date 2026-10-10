/**
 * Prozedurale Kacheltexturen je Material. Muster und Farben folgen den SVG-Patterns
 * aus GardenPlan.dc.html, werden aber in Metern gedacht und zufällig (deterministisch) gestreut.
 */
import { FillPattern, Matrix, Texture } from 'pixi.js';
import type { Material } from '../../core/model/types';
import { idle } from '../util/idle';
import { tile } from './tiles';
import { lawnMacroPattern, macroPattern, meadowMacroPattern } from './macroPatterns';

export { isOrganic } from './tiles';
export { lawnMacroPattern, meadowMacroPattern, macroPattern } from './macroPatterns';
export { materialSwatchStyle } from './swatch';

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

/**
 * Kacheln und Großflächen-Variation im Voraus berechnen (z. B. während die Startseite offen ist),
 * eine Textur je Leerlaufphase, damit die Oberfläche bedienbar bleibt. Ergebnis wie beim ersten Zeichnen.
 */
export async function warmMaterialTextures(keys: Material['texture'][]): Promise<Texture[]> {
  const out: Texture[] = [];
  for (const k of new Set(keys)) {
    await idle();
    out.push(tile(k).texture);
    const macro = k === 'lawn' ? lawnMacroPattern() : k === 'meadow' ? meadowMacroPattern() : macroPattern(k);
    if (macro?.texture) out.push(macro.texture);
  }
  return out;
}
