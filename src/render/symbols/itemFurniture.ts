/**
 * Gartenmöbel in der Draufsicht: Tisch mit Stühlen, Liege.
 */
import { rgbOf } from '../util/color';
import { boards, grain, type Ctx, type Painter, type Pt } from './itemPrimitives';

/** Stuhl in Draufsicht: Sitz und Lehne (Lehne zeigt nach `back`) */
export function chair(g: Ctx, x: number, y: number, s: number, back: Pt, ppm: number) {
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath();
  g.roundRect(x + 0.04 * ppm, y + 0.05 * ppm, s, s, 0.08 * ppm);
  g.fill();
  const gr = g.createLinearGradient(x, y, x + s, y + s);
  gr.addColorStop(0, '#5b5d5e');
  gr.addColorStop(1, '#3a3c3d');
  g.fillStyle = gr;
  g.beginPath();
  g.roundRect(x, y, s, s, 0.08 * ppm);
  g.fill();
  // Geflecht
  g.strokeStyle = 'rgba(255,255,255,0.08)';
  g.lineWidth = 1;
  for (let k = 0.08; k < 1; k += 0.12) {
    g.beginPath();
    g.moveTo(x + s * k, y + 2);
    g.lineTo(x + s * k, y + s - 2);
    g.stroke();
  }
  const t = 0.09 * ppm;
  g.fillStyle = '#2d2f30';
  if (back[0] < 0) g.fillRect(x - t * 0.3, y, t, s);
  else if (back[0] > 0) g.fillRect(x + s - t * 0.7, y, t, s);
  else if (back[1] < 0) g.fillRect(x, y - t * 0.3, s, t);
  else g.fillRect(x, y + s - t * 0.7, s, t);
}

export const table: Painter = (g, W, D, ppm, rnd) => {
  const tw = W * 0.62;
  const td = D * 0.74;
  const cs = 0.5 * ppm;
  const n = 3;
  for (let i = 0; i < n; i++) {
    const y = (D - td) / 2 + (td / n) * (i + 0.5) - cs / 2;
    chair(g, 0.02 * ppm, y, cs, [-1, 0], ppm);
    chair(g, W - cs - 0.02 * ppm, y, cs, [1, 0], ppm);
  }
  chair(g, W / 2 - cs / 2, 0.02 * ppm, cs, [0, -1], ppm);
  chair(g, W / 2 - cs / 2, D - cs - 0.02 * ppm, cs, [0, 1], ppm);
  const x0 = (W - tw) / 2;
  const y0 = (D - td) / 2;
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(x0 + 0.06 * ppm, y0 + 0.08 * ppm, tw, td);
  boards(g, x0, y0, tw, td, 'y', 0.12 * ppm, rgbOf('#b48a62'), rnd, 0.06);
  g.strokeStyle = 'rgba(70,48,30,0.8)';
  g.lineWidth = Math.max(1, 0.03 * ppm);
  g.strokeRect(x0, y0, tw, td);
  const hl = g.createLinearGradient(x0, y0, x0 + tw, y0 + td);
  hl.addColorStop(0, 'rgba(255,245,220,0.18)');
  hl.addColorStop(1, 'rgba(0,0,0,0.08)');
  g.fillStyle = hl;
  g.fillRect(x0, y0, tw, td);
};

export const lounger: Painter = (g, W, D, ppm, rnd) => {
  // Gestell
  g.fillStyle = '#8f8a82';
  g.beginPath();
  g.roundRect(0, 0, W, D, 0.08 * ppm);
  g.fill();
  // Polster
  const p = 0.05 * ppm;
  const gr = g.createLinearGradient(0, p, 0, D - p);
  gr.addColorStop(0, '#f2ede3');
  gr.addColorStop(0.6, '#e3dccd');
  gr.addColorStop(1, '#cfc6b4');
  g.fillStyle = gr;
  g.beginPath();
  g.roundRect(p, p, W - 2 * p, D - 2 * p, 0.12 * ppm);
  g.fill();
  grain(g, p, p, W - 2 * p, D - 2 * p, rnd, 600, 1, 0.08);
  // Steppnähte
  g.strokeStyle = 'rgba(120,108,90,0.45)';
  g.lineWidth = Math.max(1, 0.015 * ppm);
  for (const t of [0.3, 0.55, 0.78]) {
    g.beginPath();
    g.moveTo(W * t, p * 2);
    g.lineTo(W * t, D - p * 2);
    g.stroke();
  }
  // Kissen am Kopfende (aufgestellte Lehne)
  const kw = 0.45 * ppm;
  const kg = g.createLinearGradient(p, 0, p + kw, 0);
  kg.addColorStop(0, '#fbf8f2');
  kg.addColorStop(1, '#d6cdbb');
  g.fillStyle = kg;
  g.beginPath();
  g.roundRect(p * 1.5, p * 1.5, kw, D - 3 * p, 0.1 * ppm);
  g.fill();
};
