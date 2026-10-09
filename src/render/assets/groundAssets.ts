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
  /** weitere Kacheln gleicher Maße mit anderer Zufallsverteilung (für die Anti-Kachel-Mischung) */
  variants?: Texture[];
}

export interface SteppingStone {
  texture: Texture;
  /** Größe in Metern */
  w: number;
  h: number;
}

interface Manifest {
  tiles: Record<string, { file: string; w: number; h: number; ppm: number; variants?: string[] }>;
  scatter?: Record<string, { file: string; w: number; h: number }[]>;
  stepping: { file: string; px: [number, number]; ppm: number }[];
  edges?: Record<string, { file: string; w: number; h: number; ppm: number }>;
}

const BASE = `${import.meta.env.BASE_URL}assets/ground/`;
const tiles = new Map<string, GroundTile>();
const edges = new Map<string, GroundTile>();
const scatterParts = new Map<string, SteppingStone[]>();
let stones: SteppingStone[] = [];
let manifestVersion = 'none';

/** Fingerabdruck des Manifests: ändert sich, sobald neue Bodenbilder gerendert wurden */
export const groundManifestVersion = () => manifestVersion;

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

export async function loadGroundAssets(onReady: () => void): Promise<void> {
  try {
    const res = await fetch(`${BASE}manifest.json`);
    if (!res.ok) return;
    const text = await res.text();
    manifestVersion = hash(text);
    const m = JSON.parse(text) as Manifest;
    await Promise.all([
      ...Object.entries(m.tiles).map(async ([key, t]) => {
        const texture = await Assets.load<Texture>(BASE + t.file);
        texture.source.style.addressMode = 'repeat';
        texture.source.scaleMode = 'linear';
        texture.source.autoGenerateMipmaps = true;
        texture.source.updateMipmaps?.();
        const variants = await Promise.all((t.variants ?? []).map((f) => Assets.load<Texture>(BASE + f)));
        tiles.set(key, { texture, w: t.w, h: t.h, ppm: t.ppm, url: BASE + t.file, variants });
      }),
      ...Object.entries(m.scatter ?? {}).map(async ([kind, list]) => {
        const items = await Promise.all(
          list.map(async (x) => {
            const texture = await Assets.load<Texture>(BASE + x.file);
            texture.source.scaleMode = 'linear';
            texture.source.autoGenerateMipmaps = true;
            texture.source.updateMipmaps?.();
            return { texture, w: x.w, h: x.h };
          }),
        );
        scatterParts.set(kind, items);
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

/** alle geladenen Bodenbilder (zum Vorab-Hochladen auf die Grafikkarte) */
export function allGroundTextures(): Texture[] {
  return [
    ...[...tiles.values()].flatMap((t) => [t.texture, ...(t.variants ?? [])]),
    ...[...edges.values()].map((t) => t.texture),
    ...[...scatterParts.values()].flatMap((l) => l.map((x) => x.texture)),
    ...stones.map((x) => x.texture),
  ];
}

export const groundTile = (key: string): GroundTile | undefined => tiles.get(key);
export const steppingStones = (): SteppingStone[] => stones;
/** Streuteile einer Art (Kiesel, Basalt, Rinde, Laub): freigestellte Einzelbilder mit Größe in Metern */
export const scatterSprites = (kind: string): SteppingStone[] => scatterParts.get(kind) ?? [];
/** Kantenstreifen (z. B. Rasenkante): nahtlos entlang der Länge w, Tiefe h, Wurzellinie in der Mitte */
export const edgeStrip = (key: string): GroundTile | undefined => edges.get(key);
