/**
 * Begrenzungen in der Draufsicht: Zaun, Beeteinfassung.
 */
import { rgbOf } from '../util/color';
import { boards, grain, type Painter } from './itemPrimitives';

export const fence: Painter = (g, W, D, ppm, rnd) => {
  boards(g, 0, 0, W, D, 'x', D, rgbOf('#9a7a5a'), rnd, 0);
  for (let x = 0; x <= W + 1e-6; x += ppm) {
    g.fillStyle = '#4e3d2c';
    g.fillRect(Math.min(W - 0.08 * ppm, Math.max(0, x - 0.04 * ppm)), 0, 0.08 * ppm, D);
  }
};

export const edge: Painter = (g, W, D, ppm, rnd) => {
  g.fillStyle = '#aaa395';
  g.fillRect(0, 0, W, D);
  grain(g, 0, 0, W, D, rnd, (W * D) / (ppm * ppm) * 4000, 1, 0.3);
  g.fillStyle = 'rgba(60,55,48,0.6)';
  for (let x = ppm; x < W; x += ppm) g.fillRect(x - 0.5, 0, 1, D);
};
