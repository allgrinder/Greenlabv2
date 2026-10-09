/**
 * In Blender gerenderte Bodenbeläge (assets/blender/render_ground.py → public/assets/ground):
 * nahtlose Kacheln je Texturschlüssel und freigestellte Trittplatten.
 * Bis zum Laden (oder ohne Manifest) bleiben die prozeduralen Kacheln aus materialTextures.
 */
import { Assets, type Texture } from 'pixi.js';

export interface GroundTile {
  texture: Texture;
  /** Kachelgröße in Metern */
  w: number;
  h: number;
  ppm: number;
  url: string;
}

export interface SteppingStone {
  texture: Texture;
  /** Größe in Metern */
  w: number;
  h: number;
}

interface Manifest {
  tiles: Record<string, { file: string; w: number; h: number; ppm: number }>;
  stepping: { file: string; px: [number, number]; ppm: number }[];
  edges?: Record<string, { file: string; w: number; h: number; ppm: number }>;
}

const BASE = `${import.meta.env.BASE_URL}assets/ground/`;
const tiles = new Map<string, GroundTile>();
const edges = new Map<string, GroundTile>();
let stones: SteppingStone[] = [];

export async function loadGroundAssets(onReady: () => void): Promise<void> {
  try {
    const res = await fetch(`${BASE}manifest.json`);
    if (!res.ok) return;
    const m = (await res.json()) as Manifest;
    await Promise.all([
      ...Object.entries(m.tiles).map(async ([key, t]) => {
        const texture = await Assets.load<Texture>(BASE + t.file);
        texture.source.style.addressMode = 'repeat';
        texture.source.scaleMode = 'linear';
        texture.source.autoGenerateMipmaps = true;
        texture.source.updateMipmaps?.();
        tiles.set(key, { texture, w: t.w, h: t.h, ppm: t.ppm, url: BASE + t.file });
      }),
      ...Object.entries(m.edges ?? {}).map(async ([key, t]) => {
        const texture = await Assets.load<Texture>(BASE + t.file);
        texture.source.style.addressMode = 'repeat';
        texture.source.scaleMode = 'linear';
        texture.source.autoGenerateMipmaps = true;
        texture.source.updateMipmaps?.();
        edges.set(key, { texture, w: t.w, h: t.h, ppm: t.ppm, url: BASE + t.file });
      }),
      Promise.all(
        m.stepping.map(async (s) => {
          const texture = await Assets.load<Texture>(BASE + s.file);
          texture.source.scaleMode = 'linear';
          texture.source.autoGenerateMipmaps = true;
          texture.source.updateMipmaps?.();
          return { texture, w: s.px[0] / s.ppm, h: s.px[1] / s.ppm };
        }),
      ).then((s) => {
        stones = s;
      }),
    ]);
    onReady();
  } catch (e) {
    console.warn('Bodenbilder nicht geladen, prozedurale Kacheln bleiben', e);
  }
}

export const groundTile = (key: string): GroundTile | undefined => tiles.get(key);
export const steppingStones = (): SteppingStone[] => stones;
/** Kantenstreifen (z. B. Rasenkante): nahtlos entlang der Länge w, Tiefe h, Wurzellinie in der Mitte */
export const edgeStrip = (key: string): GroundTile | undefined => edges.get(key);
