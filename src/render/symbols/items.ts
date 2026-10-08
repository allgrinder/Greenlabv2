/**
 * Katalogobjekte (Gebäude, Möbel, Ausstattung) als Sprites im fotorealistischen Stil.
 * Vorrang haben die in Blender gerenderten Bilder (render/assets/itemAssets.ts);
 * ohne sie wird in itemPaint.ts gemalt. Hier nur Cache und Platzierung in Weltmetern.
 */
import { Sprite } from 'pixi.js';
import type { Vec2 } from '../../core/model/types';
import { itemAssetSprite } from '../assets/itemAssets';
import { foliageTexture } from './foliage';
import { paintItem } from './itemPaint';

const VARIANTS = 3;

/** Textur eines Objekts (je Symbol, Maß und Variante einmal gemalt) */
export function itemTexture(symbol: string, w: number, d: number, seed: number) {
  const v = seed % VARIANTS;
  const wr = Math.round(w * 100) / 100;
  const dr = Math.round(d * 100) / 100;
  return foliageTexture(`item|${symbol}|${wr}|${dr}|${v}`, () => paintItem(symbol, wr, dr, 9000 + v * 7717 + symbol.length));
}

export function itemSprite(symbol: string, at: Vec2, w: number, d: number, rotationDeg: number, seed: number): Sprite {
  // In Blender gerendertes Bild, sonst gemalt
  const asset = itemAssetSprite(symbol, at, w, d, rotationDeg, null);
  if (asset) return asset;
  const tex = itemTexture(symbol, w, d, seed);
  const s = new Sprite(tex);
  s.anchor.set(0.5);
  s.position.set(at.x, at.y);
  s.scale.set(w / tex.width, d / tex.height);
  s.rotation = (rotationDeg * Math.PI) / 180;
  return s;
}

/** Dunkle Gebäude/Objekte, deren Beschriftung hell sein muss */
export const DARK_SYMBOLS = new Set(['house', 'shed']);
