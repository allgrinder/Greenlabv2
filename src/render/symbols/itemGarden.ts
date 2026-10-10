/**
 * Gartenobjekte in der Draufsicht: Komposter, Regentonne, Hochbeet, Pflanzkübel.
 */
import { rgbOf } from '../util/color';
import { L } from './foliage';
import { boards, headPlant, innerShade, soil, type Painter } from './itemPrimitives';

export const compost: Painter = (g, W, D, ppm, rnd) => {
  const wall = 0.1 * ppm;
  boards(g, 0, 0, W, D, 'x', 0.12 * ppm, rgbOf('#8a6a48'), rnd);
  const iw = (W - wall * 3) / 2;
  for (const [x, fresh] of [[wall, true], [wall * 2 + iw, false]] as const) {
    soil(g, x, wall, iw, D - wall * 2, rnd, ppm);
    // frisches Material: Grünschnitt, Laub, Schalen
    const bits = (iw * (D - wall * 2)) / (ppm * ppm) * (fresh ? 160 : 40);
    for (let i = 0; i < bits; i++) {
      const c = fresh ? ['#6f8a3c', '#9a7a3a', '#b9853f', '#5d7a32', '#c7b27a'][Math.floor(rnd() * 5)] : '#5e4a36';
      g.fillStyle = c;
      g.beginPath();
      g.ellipse(x + rnd() * iw, wall + rnd() * (D - wall * 2), 0.04 * ppm * (0.5 + rnd()), 0.02 * ppm * (0.5 + rnd()), rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
    innerShade(g, x, wall, iw, D - wall * 2, 0.15 * ppm);
  }
};

export const barrel: Painter = (g, W, _D, ppm, rnd) => {
  const R = W / 2;
  const gr = g.createRadialGradient(R + L[0] * R * 0.4, R + L[1] * R * 0.4, R * 0.1, R, R, R);
  gr.addColorStop(0, '#6f7f74');
  gr.addColorStop(0.8, '#45524a');
  gr.addColorStop(1, '#2d3631');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(R, R, R * 0.98, 0, Math.PI * 2);
  g.fill();
  // Deckel mit Rippen
  g.strokeStyle = 'rgba(20,26,22,0.5)';
  g.lineWidth = Math.max(1, 0.015 * ppm);
  for (let r = R * 0.3; r < R * 0.85; r += R * 0.12) {
    g.beginPath();
    g.arc(R, R, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = '#3a453f';
  g.beginPath();
  g.arc(R, R, R * 0.18, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.25)';
  g.lineWidth = Math.max(1, 0.03 * ppm);
  g.beginPath();
  g.arc(R, R, R * 0.9, Math.PI * 1.05, Math.PI * 1.6);
  g.stroke();
  void rnd;
};

export const raisedBed: Painter = (g, W, D, ppm, rnd) => {
  const b = 0.1 * ppm;
  boards(g, 0, 0, W, b, 'x', b, rgbOf('#b48a5e'), rnd, 0);
  boards(g, 0, D - b, W, b, 'x', b, rgbOf('#a17a52'), rnd, 0);
  boards(g, 0, b, b, D - 2 * b, 'y', b, rgbOf('#b8916a'), rnd, 0);
  boards(g, W - b, b, b, D - 2 * b, 'y', b, rgbOf('#9a7550'), rnd, 0);
  soil(g, b, b, W - 2 * b, D - 2 * b, rnd, ppm);
  innerShade(g, b, b, W - 2 * b, D - 2 * b, 0.12 * ppm);
  // Gemüsereihen: Salat, Mangold, Kohlrabi …
  const crops = ['#7da14a', '#5c8a3a', '#9cbc5e', '#6e8f7f', '#8a3b45', '#4f7b2f'];
  const rows = Math.max(1, Math.floor((D - 2 * b) / (0.35 * ppm)));
  for (let r = 0; r < rows; r++) {
    const color = crops[Math.floor(rnd() * crops.length)];
    const y = b + ((D - 2 * b) * (r + 0.5)) / rows;
    const step = 0.3 * ppm;
    for (let x = b + step * 0.6; x < W - b - step * 0.3; x += step * (0.9 + rnd() * 0.2)) headPlant(g, x, y + (rnd() - 0.5) * 0.05 * ppm, (0.11 + rnd() * 0.04) * ppm, color, rnd);
  }
};

export const planter: Painter = (g, W, _D, ppm, rnd) => {
  const R = W / 2;
  const gr = g.createRadialGradient(R + L[0] * R * 0.5, R + L[1] * R * 0.5, R * 0.2, R, R, R);
  gr.addColorStop(0, '#d48e66');
  gr.addColorStop(0.85, '#b06a45');
  gr.addColorStop(1, '#7d4730');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(R, R, R * 0.98, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#4a3a2b';
  g.beginPath();
  g.arc(R, R, R * 0.8, 0, Math.PI * 2);
  g.fill();
  headPlant(g, R, R, R * 0.72, '#5f8a3f', rnd);
  void ppm;
};
