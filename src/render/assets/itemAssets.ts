/**
 * In Blender gerenderte Sprites für Katalogobjekte (assets/blender → public/assets/items).
 *
 * `manifest.json` beschreibt je Symbol Draufsicht und Schrägansicht in vier Drehungen
 * (0/90/180/270°) mit Pixelmaß, Pixel je Meter und dem Bildpunkt des Bodenursprungs.
 * Geladen wird im Hintergrund; bis dahin (oder ohne Manifest) zeichnet die App die gemalte Version.
 */
import { Assets, Sprite, type Texture } from 'pixi.js';

export interface AssetView {
  file: string;
  rot: number;
  px: [number, number];
  /** Bodenpunkt des Objektursprungs im Bild, 0…1 von links oben */
  anchor: [number, number];
}

export interface ItemAssetEntry {
  w: number;
  d: number;
  h: number;
  /** Pixel je Meter (Bildschirm-Meter bei der Schrägansicht) */
  ppm: number;
  top: AssetView[];
  oblique: AssetView[];
}

export interface AssetManifest {
  version: number;
  items: Record<string, ItemAssetEntry>;
}

const BASE = `${import.meta.env.BASE_URL}assets/items/`;
const textures = new Map<string, Texture>();
let manifest: AssetManifest | null = null;

/** Manifest und alle Bilder laden; ruft `onReady` nach dem Laden auf. Fehlt das Manifest, bleibt alles gemalt. */
export async function loadItemAssets(onReady: () => void): Promise<void> {
  try {
    const res = await fetch(`${BASE}manifest.json`);
    if (!res.ok) return;
    const m = (await res.json()) as AssetManifest;
    const files = Object.values(m.items).flatMap((e) => [...e.top, ...e.oblique].map((v) => v.file));
    const loaded = await Promise.all(files.map((f) => Assets.load<Texture>(BASE + f).then((t) => [f, t] as const)));
    for (const [f, t] of loaded) {
      t.source.scaleMode = 'linear';
      t.source.autoGenerateMipmaps = true;
      t.source.updateMipmaps?.();
      textures.set(f, t);
    }
    manifest = m;
    onReady();
  } catch (e) {
    console.warn('Objekt-Bilder nicht geladen, gemalte Darstellung bleibt', e);
  }
}

/** alle geladenen Objektbilder (zum Vorab-Hochladen auf die Grafikkarte) */
export const allItemTextures = (): Texture[] => [...textures.values()];

export const hasItemAsset = (symbol: string) => !!manifest?.items[symbol];

/** Nächstgelegene vorgerenderte Drehung (Index 0–3) und Restwinkel in Grad */
export function nearestRotation(rotationDeg: number): { k: number; rest: number } {
  const r = ((rotationDeg % 360) + 360) % 360;
  const k = Math.round(r / 90) % 4;
  let rest = r - k * 90;
  if (rest > 180) rest -= 360;
  return { k, rest };
}

/**
 * Sprite eines Objekts in Weltmetern. Eigene Maße (ItemObject.size) strecken das Bild.
 * `tiltCos` ≠ null: Schrägansicht (Bild in Bildschirm-Metern, Welt ist in y um cos gestaucht).
 */
export function itemAssetSprite(symbol: string, at: { x: number; y: number }, w: number, d: number, rotationDeg: number, tiltCos: number | null): Sprite | null {
  const e = manifest?.items[symbol];
  if (!e) return null;
  const { k, rest } = nearestRotation(rotationDeg);
  const v = (tiltCos === null ? e.top : e.oblique)[k] ?? (tiltCos === null ? e.top : e.oblique)[0];
  const tex = v && textures.get(v.file);
  if (!v || !tex) return null;
  const s = new Sprite(tex);
  s.anchor.set(v.anchor[0], v.anchor[1]);
  s.position.set(at.x, at.y);
  // Abweichende Maße: Breite/Tiefe im gedrehten Bild vertauscht
  const fx = k % 2 ? d / e.d : w / e.w;
  const fy = k % 2 ? w / e.w : d / e.d;
  const m = 1 / e.ppm;
  if (tiltCos === null) {
    s.scale.set((m * fx * v.px[0]) / tex.width, (m * fy * v.px[1]) / tex.height);
    s.rotation = (rest * Math.PI) / 180;
  } else {
    s.scale.set((m * fx * v.px[0]) / tex.width, (m * v.px[1]) / tex.height / tiltCos);
  }
  return s;
}
