/**
 * Gebäude und Möbel im fotorealistischen Stil (B), Draufsicht.
 *
 * Jedes Objekt wird einmal je Symbol/Maß/Variante mit Canvas 2D gemalt (w × d Meter, ohne Rand)
 * und als Textur zwischengespeichert. Licht von oben links wie bei den Pflanzen.
 * Für die Schrägansicht liefert `itemSolid` den Körper (Wandhöhe, Dachform, Wandmaterial).
 */
import { prng } from './foliage';
import { edge, fence } from './itemBorders';
import { greenhouse, house, shed } from './itemBuildings';
import { lounger, table } from './itemFurniture';
import { barrel, compost, planter, raisedBed } from './itemGarden';
import { play, pool } from './itemLeisure';
import type { Painter } from './itemPrimitives';

export { gableFaces, hipFaces } from './itemRoofs';

const PAINTERS: Record<string, Painter> = {
  house, shed, greenhouse, compost, barrel, raisedBed, table, lounger, planter, pool, play, fence, edge,
  // Mustergarten-Objekte: gemalt nur als Platzhalter, bis die Blender-Bilder geladen sind
  cortenBed: raisedBed, container: shed, pergola: shed, lounge: lounger, firepit: table, trampoline: pool, gate: fence, stoneWall: fence, basaltBoulders: barrel, basaltColumns: barrel, deckBench: lounger,
};

/** Auflösung je Objektgröße: kleine Möbel fein, Häuser gröber (Textur ≤ 1024 px) */
function itemPpm(w: number, d: number): number {
  return Math.max(16, Math.min(160, 1024 / Math.max(w, d)));
}

/** Draufsicht eines Katalogobjekts, w × d Meter */
export function paintItem(symbol: string, w: number, d: number, seed: number): HTMLCanvasElement {
  const ppm = itemPpm(w, d);
  const c = document.createElement('canvas');
  c.width = Math.max(4, Math.round(w * ppm));
  c.height = Math.max(4, Math.round(d * ppm));
  const g = c.getContext('2d')!;
  (PAINTERS[symbol] ?? edge)(g, c.width, c.height, ppm, prng(seed));
  return c;
}

/* ---------------- Körper für die Schrägansicht ---------------- */

type RoofKind = 'flat' | 'hip' | 'gable';

export interface ItemSolid {
  /** Körperform: Quader mit Dach, Zylinder (Tonne, Kübel), Platte auf Beinen (Tisch, Liege), flach */
  kind: 'box' | 'cylinder' | 'slab' | 'flat';
  /** Traufhöhe (Wände) */
  eave: number;
  roof: RoofKind;
  /** Wandfarbe; `glass` = durchscheinend */
  wall: string;
  glass?: boolean;
  /** Fenster in den Wänden (Wohnhaus, Gartenhaus) */
  windows?: 'house' | 'shed';
  /** Wandverkleidung aus Brettern */
  wood?: boolean;
}

export function itemSolid(symbol: string, h: number): ItemSolid {
  switch (symbol) {
    case 'house':
      return { kind: 'box', eave: h * 0.6, roof: 'hip', wall: '#e8e1d2', windows: 'house' };
    case 'shed':
      return { kind: 'box', eave: h * 0.78, roof: 'gable', wall: '#8a6748', windows: 'shed', wood: true };
    case 'greenhouse':
      return { kind: 'box', eave: h * 0.68, roof: 'gable', wall: '#d9e6ea', glass: true };
    case 'compost':
    case 'raisedBed':
      return { kind: 'box', eave: h, roof: 'flat', wall: symbol === 'compost' ? '#7d5f40' : '#a27c56', wood: true };
    case 'fence':
      return { kind: 'box', eave: h, roof: 'flat', wall: '#9a7a5a', wood: true };
    case 'cortenBed':
      return { kind: 'box', eave: h, roof: 'flat', wall: '#7a3e22' };
    case 'container':
    case 'pergola':
      return { kind: 'box', eave: h, roof: 'flat', wall: '#26272a' };
    case 'gate':
      return { kind: 'box', eave: h, roof: 'flat', wall: '#2e2f31' };
    case 'stoneWall':
      return { kind: 'box', eave: h, roof: 'flat', wall: '#8d877c' };
    case 'basaltBoulders':
    case 'basaltColumns':
      return { kind: 'cylinder', eave: h, roof: 'flat', wall: '#35383b' };
    case 'lounge':
      return { kind: 'slab', eave: h, roof: 'flat', wall: '#6b6660' };
    case 'barrel':
      return { kind: 'cylinder', eave: h, roof: 'flat', wall: '#45524a' };
    case 'planter':
      return { kind: 'cylinder', eave: h, roof: 'flat', wall: '#b06a45' };
    case 'table':
    case 'lounger':
      return { kind: 'slab', eave: h, roof: 'flat', wall: '#6b6660' };
    case 'play':
      return { kind: 'slab', eave: 0.35, roof: 'flat', wall: '#8a6a48' };
    default:
      return { kind: 'flat', eave: 0, roof: 'flat', wall: '#999' };
  }
}
