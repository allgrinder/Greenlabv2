/**
 * Dächer in der Draufsicht: Walm- und Satteldachflächen, Ziegel, Solarmodule, First- und Gratlinien.
 */
import { css, mul, type RGB } from '../util/color';
import { faceLight, grain, poly, type Ctx, type Pt } from './itemPrimitives';

export interface RoofFace {
  pts: Pt[];
  /** waagerechte Normalenrichtung der Dachfläche */
  n: Pt;
}

/** Walmdach über w × d (Pixel): First entlang der längeren Seite */
export function hipFaces(w: number, d: number): RoofFace[] {
  if (d >= w) {
    const r = w / 2;
    return [
      { pts: [[0, 0], [w, 0], [r, r]], n: [0, -1] },
      { pts: [[w, 0], [w, d], [r, d - r], [r, r]], n: [1, 0] },
      { pts: [[w, d], [0, d], [r, d - r]], n: [0, 1] },
      { pts: [[0, d], [0, 0], [r, r], [r, d - r]], n: [-1, 0] },
    ];
  }
  const r = d / 2;
  return [
    { pts: [[0, 0], [w, 0], [w - r, r], [r, r]], n: [0, -1] },
    { pts: [[w, 0], [w, d], [w - r, r]], n: [1, 0] },
    { pts: [[w, d], [0, d], [r, r], [w - r, r]], n: [0, 1] },
    { pts: [[0, d], [0, 0], [r, r]], n: [-1, 0] },
  ];
}

/** Satteldach: First entlang der längeren Seite */
export function gableFaces(w: number, d: number): RoofFace[] {
  if (d >= w)
    return [
      { pts: [[0, 0], [w / 2, 0], [w / 2, d], [0, d]], n: [-1, 0] },
      { pts: [[w / 2, 0], [w, 0], [w, d], [w / 2, d]], n: [1, 0] },
    ];
  return [
    { pts: [[0, 0], [w, 0], [w, d / 2], [0, d / 2]], n: [0, -1] },
    { pts: [[0, d / 2], [w, d / 2], [w, d], [0, d]], n: [0, 1] },
  ];
}

/** Dachziegel in Reihen parallel zur Traufe einer Fläche */
export function tiles(g: Ctx, f: RoofFace, base: RGB, ppm: number, rnd: () => number) {
  const k = faceLight(f.n[0], f.n[1]);
  g.save();
  poly(g, f.pts);
  g.clip();
  const xs = f.pts.map((p) => p[0]);
  const ys = f.pts.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  g.fillStyle = css(mul(base, k));
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
  const row = 0.33 * ppm;
  const tw = 0.3 * ppm;
  const vertical = f.n[0] !== 0; // Traufe senkrecht → Reihen senkrecht
  const span0 = vertical ? x0 : y0;
  const span1 = vertical ? x1 : y1;
  const len0 = vertical ? y0 : x0;
  const len1 = vertical ? y1 : x1;
  for (let s = span0, i = 0; s < span1; s += row, i++) {
    for (let t = len0 - (i % 2) * tw * 0.5; t < len1; t += tw) {
      const c = mul(base, k * (0.88 + rnd() * 0.2));
      g.fillStyle = css(c);
      if (vertical) g.fillRect(s, t, row, tw - 1);
      else g.fillRect(t, s, tw - 1, row);
    }
    // Schattenkante der überlappenden Reihe (zur Traufe hin)
    const towards = vertical ? f.n[0] : f.n[1];
    const edge = towards > 0 ? s + row - row * 0.16 : s;
    g.fillStyle = 'rgba(0,0,0,0.28)';
    if (vertical) g.fillRect(edge, len0, row * 0.16, len1 - len0);
    else g.fillRect(len0, edge, len1 - len0, row * 0.16);
  }
  grain(g, x0, y0, x1 - x0, y1 - y0, rnd, ((x1 - x0) * (y1 - y0)) / (ppm * ppm) * 30, Math.max(1, ppm * 0.03), 0.12);
  g.restore();
}

/** Solarmodule auf einer Dachfläche, nur wo sie vollständig mit Rand hineinpassen */
export function solar(g: Ctx, f: RoofFace, ppm: number) {
  const pw = 1.7 * ppm;
  const ph = 1.0 * ppm;
  const m = 0.45 * ppm;
  const xs = f.pts.map((p) => p[0]);
  const ys = f.pts.map((p) => p[1]);
  const inside = (x: number, y: number) => {
    // konvexe Fläche: alle Kanten auf derselben Seite
    let sgn = 0;
    for (let i = 0; i < f.pts.length; i++) {
      const [ax, ay] = f.pts[i];
      const [bx, by] = f.pts[(i + 1) % f.pts.length];
      const c = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
      if (Math.abs(c) < 1e-6) continue;
      if (!sgn) sgn = Math.sign(c);
      else if (Math.sign(c) !== sgn) return false;
    }
    return true;
  };
  const vertical = f.n[0] !== 0;
  const cw = vertical ? ph : pw;
  const ch = vertical ? pw : ph;
  const panels: Pt[] = [];
  for (let y = Math.min(...ys); y + ch <= Math.max(...ys); y += ch + 0.03 * ppm)
    for (let x = Math.min(...xs); x + cw <= Math.max(...xs); x += cw + 0.03 * ppm)
      if ([[x - m, y - m], [x + cw + m, y - m], [x - m, y + ch + m], [x + cw + m, y + ch + m]].every(([a, b]) => inside(a, b))) panels.push([x, y]);
  // mittig ausrichten: Feld zusammenschieben ist hier unnötig, das Raster beginnt an der Flächenkante
  for (const [x, y] of panels) {
    const gr = g.createLinearGradient(x, y, x + cw, y + ch);
    gr.addColorStop(0, '#2c3c57');
    gr.addColorStop(0.45, '#40577b');
    gr.addColorStop(1, '#1b2436');
    g.fillStyle = gr;
    g.fillRect(x, y, cw, ch);
    g.strokeStyle = 'rgba(190,205,230,0.28)';
    g.lineWidth = 1;
    const cells = 6;
    g.beginPath();
    for (let k = 1; k < cells; k++) {
      if (vertical) {
        g.moveTo(x, y + (ch * k) / cells);
        g.lineTo(x + cw, y + (ch * k) / cells);
      } else {
        g.moveTo(x + (cw * k) / cells, y);
        g.lineTo(x + (cw * k) / cells, y + ch);
      }
    }
    g.stroke();
    g.strokeStyle = 'rgba(215,220,228,0.85)';
    g.lineWidth = Math.max(1, 0.03 * ppm);
    g.strokeRect(x, y, cw, ch);
  }
}

/** First- und Gratlinien mit Lichtkante */
export function ridges(g: Ctx, faces: RoofFace[], ppm: number) {
  const seen = new Set<string>();
  g.lineCap = 'round';
  for (const f of faces)
    for (let i = 0; i < f.pts.length; i++) {
      const a = f.pts[i];
      const b = f.pts[(i + 1) % f.pts.length];
      const key = [a, b].map((p) => p.map((v) => Math.round(v)).join(',')).sort().join('|');
      if (seen.has(key)) {
        g.strokeStyle = 'rgba(25,27,30,0.85)';
        g.lineWidth = Math.max(1.5, 0.14 * ppm);
        g.beginPath();
        g.moveTo(a[0], a[1]);
        g.lineTo(b[0], b[1]);
        g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.16)';
        g.lineWidth = Math.max(1, 0.04 * ppm);
        g.stroke();
      }
      seen.add(key);
    }
}
