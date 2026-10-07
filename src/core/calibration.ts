import type { BackgroundImage, Calibration, Vec2 } from './model/types';
import { add, dist, rotate, scale, sub } from './geometry/vec';

/** Meter pro Bildpixel aus zwei Punkten mit bekanntem Abstand */
export function metersPerPixel(c: Calibration): number {
  const px = dist(c.a, c.b);
  if (px <= 0 || !(c.distanceM > 0)) throw new Error('Kalibrierung braucht zwei verschiedene Punkte und eine Distanz > 0');
  return c.distanceM / px;
}

type BgPlacement = Pick<BackgroundImage, 'origin' | 'metersPerPixel' | 'rotationDeg'>;

export const imageToWorld = (bg: BgPlacement, p: Vec2): Vec2 =>
  add(bg.origin, rotate(scale(p, bg.metersPerPixel), bg.rotationDeg));

export const worldToImage = (bg: BgPlacement, w: Vec2): Vec2 =>
  scale(rotate(sub(w, bg.origin), -bg.rotationDeg), 1 / bg.metersPerPixel);

/**
 * Neue Kalibrierung anwenden. Der Bildpunkt `a` bleibt dabei an seiner Weltposition,
 * damit das Bild beim Kalibrieren nicht springt.
 */
export function applyCalibration<T extends BgPlacement & { calibration: Calibration | null }>(bg: T, c: Calibration): T {
  const anchorWorld = imageToWorld(bg, c.a);
  const mpp = metersPerPixel(c);
  const next = { ...bg, metersPerPixel: mpp, calibration: c };
  const drift = sub(anchorWorld, imageToWorld(next, c.a));
  return { ...next, origin: add(next.origin, drift) };
}

/** Winkel auf (−180, 180] normieren */
export function normDeg(a: number): number {
  let x = ((((a + 180) % 360) + 360) % 360) - 180;
  if (x === -180) x = 180;
  return Math.round(x * 1000) / 1000;
}

/**
 * Bild an zwei bekannten Punkten einpassen: Bildpixel a/b sollen auf die Weltpunkte A/B fallen.
 * Liefert Maßstab, Drehung (im Uhrzeigersinn, Grad) und Lage (Weltposition von Pixel 0,0).
 */
export function alignTwoPoints(a: Vec2, b: Vec2, A: Vec2, B: Vec2): BgPlacement & { calibration: Calibration } {
  const px = dist(a, b);
  const m = dist(A, B);
  if (px <= 1e-9 || m <= 1e-9) throw new Error('Ausrichten braucht zwei verschiedene Punkte im Bild und zwei verschiedene Ecken');
  const angle = (p: Vec2) => (Math.atan2(p.y, p.x) * 180) / Math.PI;
  const rotationDeg = normDeg(angle(sub(B, A)) - angle(sub(b, a)));
  const metersPerPixel = m / px;
  const origin = sub(A, rotate(scale(a, metersPerPixel), rotationDeg));
  return { origin, metersPerPixel, rotationDeg, calibration: { a, b, distanceM: m } };
}

/**
 * Nordrichtung aus der Drehung eines genordeten Bildes: Wird ein Bild, dessen Oberkante nach Norden
 * zeigt, um r Grad im Uhrzeigersinn gedreht, zeigt Nord im Plan r Grad rechts von „oben“.
 */
export const northFromImageRotation = (rotationDeg: number) => normDeg(rotationDeg);
