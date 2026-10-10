/** Datenmodell und Hilfsfunktionen des Projekt-Assistenten: Entwurf des Hintergrundbilds, Bildlage, Beispielkontur, Eckbuchstaben */
import { findPlace } from '../../core/geo/places';
import type { Vec2 } from '../../core/model/types';

/** Beispielkontur aus dem Design (Punkte A–E, in Metern) */
export const DESIGN_POLY: Vec2[] = [
  { x: 0, y: 2.766 },
  { x: 48.085, y: 0 },
  { x: 50.213, y: 29.787 },
  { x: 26.17, y: 36.383 },
  { x: 0.532, y: 28.511 },
];

export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export interface BgDraft {
  blob: Blob;
  url: string;
  name: string;
  w: number;
  h: number;
  opacity: number;
  /** zwei Punkte im Bild (Pixel) */
  a: Vec2 | null;
  b: Vec2 | null;
  distance: number | null;
  /** Lage nach dem Ausrichten; null = noch nicht ausgerichtet */
  place: Placement | null;
  mode: 'corners' | 'distance';
  /** zugeordnete Ecken (Index in der Kontur) */
  ca: number;
  cb: number;
  /** Bild ist genordet → Nordrichtung aus der Drehung */
  northUp: boolean;
}

export const DEFAULT_PLACE = findPlace('Frankfurt am Main')!;

/** Lage des Bildes im Assistenten (Weltkoordinaten des Assistenten) */
export interface Placement {
  origin: Vec2;
  metersPerPixel: number;
  rotationDeg: number;
}

export const rectPoints = (w: number, d: number): Vec2[] => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: d },
  { x: 0, y: d },
];

/** Gezogene Punkte auf 1 cm runden */
export const cm = (p: Vec2): Vec2 => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 });
