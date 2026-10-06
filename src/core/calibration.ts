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
