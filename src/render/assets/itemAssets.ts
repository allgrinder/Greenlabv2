/**
 * In Blender gerenderte Sprites für Katalogobjekte (assets/blender → public/assets/items).
 *
 * `manifest.json` beschreibt je Symbol Draufsicht und Schrägansicht in vier Drehungen
 * (0/90/180/270°) mit Pixelmaß, Pixel je Meter und dem Bildpunkt des Bodenursprungs.
 * Geladen wird im Hintergrund; bis dahin (oder ohne Manifest) zeichnet die App die gemalte Version.
 */
import { Sprite, type Texture } from 'pixi.js';
import { lazyTextures } from './lazyTextures';

interface AssetView {
  file: string;
  rot: number;
  px: [number, number];
  /** Bodenpunkt des Objektursprungs im Bild, 0…1 von links oben */
  anchor: [number, number];
}

interface ItemAssetEntry {
  w: number;
  d: number;
  h: number;
  /** Pixel je Meter (Bildschirm-Meter bei der Schrägansicht) */
  ppm: number;
  top: AssetView[];
  oblique: AssetView[];
}

interface AssetManifest {
  version: number;
  items: Record<string, ItemAssetEntry>;
}

const BASE = `${import.meta.env.BASE_URL}assets/items/`;
const lazy = lazyTextures(BASE);
let manifest: AssetManifest | null = null;

/**
 * Manifest laden; die Bilder kommen erst, wenn ein Objekt sie braucht (oder `preloadItems` vor dem Öffnen
 * eines Gartens). Alle 184 Bilder auf einmal wären entpackt über 400 MB – zu viel für Tablets und Handys.
 * Fehlt das Manifest, bleibt alles gemalt. `onLoaded` meldet nachgeladene Bilder (gebündelt).
 */
export async function loadItemAssets(onLoaded: () => void): Promise<void> {
  lazy.onLoaded(onLoaded);
  try {
    const res = await fetch(`${BASE}manifest.json`);
    if (!res.ok) return;
    manifest = (await res.json()) as AssetManifest;
  } catch (e) {
    console.warn('Objekt-Bilder nicht geladen, gemalte Darstellung bleibt', e);
  }
}

/** Bilder für diese Objekte (Symbol + Drehung) laden, Draufsicht und auf Wunsch Schrägansicht; liefert die Texturen */
export async function preloadItems(list: { symbol: string; rotationDeg: number }[], oblique: boolean): Promise<Texture[]> {
  if (!manifest) return [];
  const files = new Set<string>();
  for (const { symbol, rotationDeg } of list) {
    const e = manifest.items[symbol];
    if (!e) continue;
    const { k } = nearestRotation(rotationDeg);
    for (const views of oblique ? [e.top, e.oblique] : [e.top]) {
      const v = views[k] ?? views[0];
      if (v) files.add(v.file);
    }
  }
  return lazy.preload(files);
}

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
  if (!v) return null;
  const tex = lazy.get(v.file);
  if (!tex) {
    void lazy.request(v.file);
    return null;
  }
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
