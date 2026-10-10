/**
 * Freizeit und Spiel in der Draufsicht: Pool, Spielturm mit Schaukel und Rutsche.
 */
import { css, mul, rgbOf } from '../util/color';
import { boards, faceLight, grain, innerShade, type Painter, type Pt } from './itemPrimitives';
import { gableFaces } from './itemRoofs';

export const pool: Painter = (g, W, D, ppm, rnd) => {
  // Randsteine
  const rim = 0.3 * ppm;
  g.fillStyle = '#ddd5c5';
  g.fillRect(0, 0, W, D);
  const st = 0.5 * ppm;
  for (let x = 0; x < W; x += st)
    for (let y = 0; y < D; y += st) {
      if (x > rim && x < W - rim - st * 0.5 && y > rim && y < D - rim - st * 0.5) continue;
      g.fillStyle = css(mul(rgbOf('#ddd5c5'), 0.92 + rnd() * 0.12));
      g.fillRect(x + 1, y + 1, st - 2, st - 2);
    }
  grain(g, 0, 0, W, D, rnd, 2000, 1, 0.12);
  // Wasser: tiefer zur Mitte, Lichtnetz
  const x0 = rim;
  const y0 = rim;
  const w = W - 2 * rim;
  const d = D - 2 * rim;
  const wg = g.createLinearGradient(x0, y0, x0 + w, y0 + d);
  wg.addColorStop(0, '#8fd3df');
  wg.addColorStop(0.5, '#4fb0c4');
  wg.addColorStop(1, '#2d8aa3');
  g.fillStyle = wg;
  g.beginPath();
  g.roundRect(x0, y0, w, d, 0.1 * ppm);
  g.fill();
  g.save();
  g.beginPath();
  g.rect(x0, y0, w, d);
  g.clip();
  g.strokeStyle = 'rgba(255,255,255,0.22)';
  g.lineWidth = Math.max(1, 0.02 * ppm);
  for (let i = 0; i < (w * d) / (ppm * ppm) * 3; i++) {
    const cx = x0 + rnd() * w;
    const cy = y0 + rnd() * d;
    const r = (0.15 + rnd() * 0.2) * ppm;
    // geschlossene, weiche Kurve durch unregelmäßige Punkte (Lichtnetz)
    const pts: Pt[] = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const rr = r * (0.7 + rnd() * 0.5);
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8]);
    }
    const mid = (i: number): Pt => [(pts[i % 6][0] + pts[(i + 1) % 6][0]) / 2, (pts[i % 6][1] + pts[(i + 1) % 6][1]) / 2];
    g.beginPath();
    g.moveTo(...mid(0));
    for (let k = 1; k <= 6; k++) g.quadraticCurveTo(pts[k % 6][0], pts[k % 6][1], ...mid(k));
    g.stroke();
  }
  // Treppe in der Ecke
  for (let k = 0; k < 3; k++) {
    g.fillStyle = `rgba(235,248,250,${0.5 - k * 0.12})`;
    g.fillRect(x0, y0 + k * 0.3 * ppm, 1.2 * ppm - k * 0.3 * ppm, 0.3 * ppm);
  }
  innerShade(g, x0, y0, w, d, 0.2 * ppm);
  g.restore();
};

export const play: Painter = (g, W, D, ppm, rnd) => {
  // Sandfläche unter dem Turm
  const sx = 0;
  const sy = D * 0.35;
  const sw = W * 0.45;
  const sd = D * 0.65;
  g.fillStyle = '#e4d3a6';
  g.fillRect(sx, sy, sw, sd);
  grain(g, sx, sy, sw, sd, rnd, 3000, 1, 0.25);
  boards(g, sx, sy, sw, 0.08 * ppm, 'x', 0.08 * ppm, rgbOf('#9c7a55'), rnd, 0);
  // Schaukelbalken mit Sitzen
  const by = 0.25 * ppm;
  const bx0 = W * 0.38;
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(bx0, by + 0.1 * ppm, W - bx0, 0.12 * ppm);
  boards(g, bx0, by - 0.06 * ppm, W - bx0, 0.12 * ppm, 'x', 0.12 * ppm, rgbOf('#9a7550'), rnd, 0);
  for (const x of [W * 0.6, W * 0.83]) {
    g.fillStyle = '#c0442e';
    g.fillRect(x - 0.22 * ppm, by + 0.35 * ppm, 0.44 * ppm, 0.16 * ppm);
    g.strokeStyle = 'rgba(60,50,40,0.7)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x - 0.2 * ppm, by);
    g.lineTo(x - 0.2 * ppm, by + 0.35 * ppm);
    g.moveTo(x + 0.2 * ppm, by);
    g.lineTo(x + 0.2 * ppm, by + 0.35 * ppm);
    g.stroke();
  }
  // Turm mit Satteldach
  const t = Math.min(1.5 * ppm, W * 0.38, D * 0.55);
  const tx = 0.1 * ppm;
  const ty = 0.1 * ppm;
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(tx + 0.15 * ppm, ty + 0.2 * ppm, t, t);
  g.save();
  g.translate(tx, ty);
  for (const f of gableFaces(t, t * 1.01)) {
    const xs = f.pts.map((p) => p[0]);
    const ys = f.pts.map((p) => p[1]);
    boards(g, Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 'x', 0.12 * ppm, mul(rgbOf('#2f6b4a'), faceLight(f.n[0], f.n[1])), rnd, 0.05);
  }
  g.restore();
  // Rutsche
  const rx = tx + t * 0.3;
  const ry = ty + t;
  const rg = g.createLinearGradient(rx, 0, rx + 0.5 * ppm, 0);
  rg.addColorStop(0, '#3d8a4a');
  rg.addColorStop(0.5, '#6cbf6c');
  rg.addColorStop(1, '#2f6e3a');
  g.fillStyle = rg;
  g.beginPath();
  g.roundRect(rx, ry, 0.5 * ppm, Math.min(D - ry - 0.05 * ppm, 2.2 * ppm), 0.2 * ppm);
  g.fill();
};
