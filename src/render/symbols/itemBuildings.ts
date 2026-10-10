/**
 * Gebäude in der Draufsicht: Wohnhaus, Gartenhaus, Gewächshaus.
 */
import { mul, rgbOf } from '../util/color';
import { L } from './foliage';
import { boards, faceLight, headPlant, poly, soil, type Painter } from './itemPrimitives';
import { gableFaces, hipFaces, ridges, solar, tiles } from './itemRoofs';

export const house: Painter = (g, W, D, ppm, rnd) => {
  const faces = hipFaces(W, D);
  const base = rgbOf('#4c5054');
  for (const f of faces) tiles(g, f, base, ppm, rnd);
  // Solarmodule auf der Fläche mit Südneigung im Plan (+y), sonst der größten
  const south = faces.find((f) => f.n[1] > 0)!;
  solar(g, south, ppm);
  // Dachfenster auf der Westfläche, Schornstein auf der Ostfläche
  const west = faces.find((f) => f.n[0] < 0)!;
  const wx = Math.min(...west.pts.map((p) => p[0])) + 0.25 * Math.min(W, D);
  const cy = D / 2;
  for (const dy of [-1.6, 1.0]) {
    const x = wx;
    const y = cy + dy * ppm;
    g.fillStyle = '#2f3437';
    g.fillRect(x - 0.05 * ppm, y - 0.05 * ppm, 0.8 * ppm, 1.2 * ppm);
    const gr = g.createLinearGradient(x, y, x + 0.7 * ppm, y + 1.1 * ppm);
    gr.addColorStop(0, '#c9dbe6');
    gr.addColorStop(0.5, '#7f9aac');
    gr.addColorStop(1, '#4f6676');
    g.fillStyle = gr;
    g.fillRect(x, y, 0.7 * ppm, 1.1 * ppm);
  }
  const east = faces.find((f) => f.n[0] > 0)!;
  const ex = Math.max(...east.pts.map((p) => p[0])) - 0.3 * Math.min(W, D);
  const ey = D * 0.22;
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(ex + 0.25 * ppm, ey + 0.25 * ppm, 0.8 * ppm, 0.7 * ppm);
  g.fillStyle = '#8b6c5c';
  g.fillRect(ex, ey, 0.8 * ppm, 0.7 * ppm);
  g.fillStyle = '#a5877a';
  g.fillRect(ex, ey, 0.8 * ppm, 0.12 * ppm);
  g.fillStyle = '#2a2523';
  g.fillRect(ex + 0.2 * ppm, ey + 0.2 * ppm, 0.4 * ppm, 0.3 * ppm);
  ridges(g, faces, ppm);
  // Traufe mit Regenrinne
  g.strokeStyle = 'rgba(30,32,34,0.9)';
  g.lineWidth = Math.max(1.5, 0.1 * ppm);
  g.strokeRect(0.05 * ppm, 0.05 * ppm, W - 0.1 * ppm, D - 0.1 * ppm);
  g.strokeStyle = 'rgba(200,205,210,0.5)';
  g.lineWidth = Math.max(1, 0.03 * ppm);
  g.strokeRect(0.02 * ppm, 0.02 * ppm, W - 0.04 * ppm, D - 0.04 * ppm);
};

export const shed: Painter = (g, W, D, ppm, rnd) => {
  const faces = gableFaces(W, D);
  const base = rgbOf('#7a5a42');
  for (const f of faces) {
    const k = faceLight(f.n[0], f.n[1]);
    const xs = f.pts.map((p) => p[0]);
    const ys = f.pts.map((p) => p[1]);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    // Bretter laufen von der Traufe zum First
    boards(g, x0, y0, Math.max(...xs) - x0, Math.max(...ys) - y0, f.n[0] !== 0 ? 'x' : 'y', 0.16 * ppm, mul(base, k), rnd);
  }
  ridges(g, faces, ppm);
  g.strokeStyle = 'rgba(45,32,22,0.9)';
  g.lineWidth = Math.max(1.5, 0.08 * ppm);
  g.strokeRect(0.04 * ppm, 0.04 * ppm, W - 0.08 * ppm, D - 0.08 * ppm);
};

export const greenhouse: Painter = (g, W, D, ppm, rnd) => {
  // Pflanzen unter Glas
  soil(g, 0, 0, W, D, rnd, ppm);
  g.fillStyle = '#9b8f7d';
  g.fillRect(W * 0.42, 0, W * 0.16, D);
  for (let i = 0; i < (W * D) / (ppm * ppm) * 2.2; i++) {
    const x = rnd() < 0.5 ? rnd() * W * 0.38 + W * 0.02 : W * 0.6 + rnd() * W * 0.38;
    headPlant(g, x, 0.3 * ppm + rnd() * (D - 0.6 * ppm), (0.18 + rnd() * 0.12) * ppm, rnd() < 0.3 ? '#7b8f3a' : '#4f7a35', rnd);
  }
  // Glas: Himmelsspiegelung, je Dachseite unterschiedlich hell
  for (const f of gableFaces(W, D)) {
    poly(g, f.pts);
    const k = f.n[0] * L[0] + f.n[1] * L[1];
    g.fillStyle = `rgba(222,235,240,${0.42 + k * 0.12})`;
    g.fill();
  }
  const sky = g.createLinearGradient(0, 0, W, D);
  sky.addColorStop(0, 'rgba(255,255,255,0.35)');
  sky.addColorStop(0.35, 'rgba(255,255,255,0.05)');
  sky.addColorStop(0.6, 'rgba(255,255,255,0.22)');
  sky.addColorStop(1, 'rgba(255,255,255,0.02)');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, D);
  // Aluprofile
  g.strokeStyle = 'rgba(205,212,214,0.95)';
  g.lineWidth = Math.max(1, 0.05 * ppm);
  const along = D >= W;
  const n = Math.max(3, Math.round((along ? D : W) / (0.75 * ppm)));
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    const t = ((along ? D : W) * i) / n;
    if (along) {
      g.moveTo(0, t);
      g.lineTo(W, t);
    } else {
      g.moveTo(t, 0);
      g.lineTo(t, D);
    }
  }
  g.stroke();
  g.lineWidth = Math.max(1.5, 0.09 * ppm);
  g.strokeStyle = 'rgba(160,170,172,1)';
  g.strokeRect(0, 0, W, D);
  g.beginPath();
  if (along) {
    g.moveTo(W / 2, 0);
    g.lineTo(W / 2, D);
  } else {
    g.moveTo(0, D / 2);
    g.lineTo(W, D / 2);
  }
  g.stroke();
};
