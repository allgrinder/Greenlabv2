/**
 * In Blender gerenderte Pflanzen (assets/blender/render_plants.py → public/assets/plants).
 *
 * Das Manifest kommt beim Start; die Bilder erst, wenn eine Art in einer Jahreszeit gebraucht wird.
 * Bis dahin zeichnet die App die gemalte Version, danach baut der Renderer neu auf.
 */
import { Sprite, type Texture } from 'pixi.js';
import { lazyTextures } from './lazyTextures';
import type { Season } from '../../core/growth';
import type { PlantSpecies } from '../../core/model/types';
import { lookKey, plantLook } from './plantLooks';

interface PlantView {
  file: string;
  px: [number, number];
  anchor: [number, number];
}

interface PlantEntry {
  kind: string;
  /** Bezugsmaße des Bildes: Breite/Tiefe (Durchmesser bzw. Spalierschirm) und Höhe in m */
  w: number;
  d: number;
  h: number;
  ppm: number;
  looks: Record<string, { seasons: Season[]; top: PlantView[]; oblique: PlantView[] }>;
}

const BASE = `${import.meta.env.BASE_URL}assets/plants/`;
let manifest: { plants: Record<string, PlantEntry> } | null = null;
const lazy = lazyTextures(BASE);

export async function loadPlantAssets(cb: () => void): Promise<void> {
  lazy.onLoaded(cb);
  try {
    const res = await fetch(`${BASE}manifest.json`);
    if (!res.ok) return;
    manifest = await res.json();
    cb();
  } catch (e) {
    console.warn('Pflanzenbilder nicht verfügbar, gemalte Darstellung bleibt', e);
  }
}

function views(sp: PlantSpecies, season: Season, view: 'top' | 'oblique') {
  const e = manifest?.plants[sp.id];
  const l = e?.looks[lookKey(plantLook(sp, season))];
  const list = l?.[view];
  return e && list?.length ? { e, list } : null;
}

/** Alle Bilder für diese Arten und Jahreszeiten laden (vor Exporten, beim Öffnen eines Gartens); liefert die Texturen */
export async function preloadPlants(species: PlantSpecies[], seasons: Season[], which: ('top' | 'oblique')[] = ['top', 'oblique']): Promise<Texture[]> {
  if (!manifest) return [];
  const files = new Set<string>();
  for (const sp of species)
    for (const s of seasons)
      for (const v of which) views(sp, s, v)?.list.forEach((x) => files.add(x.file));
  return lazy.preload(files);
}

export interface PlantSpriteOpts {
  view: 'top' | 'oblique';
  /** Größe in m: Durchmesser bzw. Breite × Tiefe (Spalier); Höhe für die Schrägansicht */
  width: number;
  depth?: number;
  height?: number;
  /** Schrägansicht: cos(Kippwinkel) */
  tiltCos?: number;
  rotation?: number;
}

/** Sprite einer Pflanze in Weltmetern oder null (Bild fehlt oder lädt noch) */
export function plantAssetSprite(sp: PlantSpecies, season: Season, seed: number, at: { x: number; y: number }, o: PlantSpriteOpts): Sprite | null {
  const hit = views(sp, season, o.view);
  if (!hit) return null;
  const { e, list } = hit;
  const v = list[Math.abs(seed) % list.length];
  const tex = lazy.get(v.file);
  if (!tex) {
    void lazy.request(v.file);
    return null;
  }
  const s = new Sprite(tex);
  s.anchor.set(v.anchor[0], v.anchor[1]);
  s.position.set(at.x, at.y);
  const kx = o.width / e.w;
  const ky = (o.depth ?? o.width) / e.d;
  const m = 1 / e.ppm;
  if (o.view === 'top') {
    s.scale.set((m * kx * v.px[0]) / tex.width, (m * ky * v.px[1]) / tex.height);
    s.rotation = o.rotation ?? 0;
  } else {
    const kh = o.height ? o.height / e.h : kx;
    s.scale.set((m * kx * v.px[0]) / tex.width, (m * kh * v.px[1]) / tex.height / (o.tiltCos ?? 1));
  }
  return s;
}
