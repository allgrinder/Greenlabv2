/**
 * Gemeinsame Zeichenbausteine der Objekt-Draufsichten (Holz, Erde, Körnung, Pflanzenköpfe, Schatten).
 */
import { css, mix, mul, type RGB } from '../util/color';
import { L, palette, tuft } from './foliage';

export type Ctx = CanvasRenderingContext2D;
export type Pt = [number, number];

export type Painter = (g: Ctx, W: number, D: number, ppm: number, rnd: () => number) => void;

/** Helligkeit einer Fläche mit waagerechter Normalen n (Licht oben links) */
export const faceLight = (nx: number, ny: number) => 0.84 + 0.26 * (nx * L[0] + ny * L[1]);

export function poly(g: Ctx, pts: Pt[]) {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
}

/** feine Körnung (Putz, Beton, Erde) */
export function grain(g: Ctx, x: number, y: number, w: number, h: number, rnd: () => number, n: number, size: number, alpha: number) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = rnd() < 0.5 ? `rgba(255,255,255,${alpha * rnd()})` : `rgba(0,0,0,${alpha * rnd()})`;
    g.fillRect(x + rnd() * w, y + rnd() * h, size * (0.6 + rnd()), size * (0.6 + rnd()));
  }
}

/**
 * Holzbretter in einem Rechteck: `along` = Faserrichtung ('x' oder 'y'), Bretter quer dazu gestapelt.
 * Fugen, Farbschwankung je Brett, Maserung.
 */
export function boards(g: Ctx, x: number, y: number, w: number, h: number, along: 'x' | 'y', plank: number, base: RGB, rnd: () => number, gap = 0.12) {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  const across = along === 'x' ? h : w;
  const length = along === 'x' ? w : h;
  for (let s = 0; s < across; s += plank) {
    const c = mul(base, 0.86 + rnd() * 0.24);
    const bx = along === 'x' ? x : x + s;
    const by = along === 'x' ? y + s : y;
    const bw = along === 'x' ? w : plank;
    const bh = along === 'x' ? plank : h;
    const gr = along === 'x' ? g.createLinearGradient(0, by, 0, by + bh) : g.createLinearGradient(bx, 0, bx + bw, 0);
    gr.addColorStop(0, css(mix(c, [255, 240, 210], 0.12)));
    gr.addColorStop(1, css(mul(c, 0.9)));
    g.fillStyle = gr;
    g.fillRect(bx, by, bw, bh);
    // Maserung
    g.strokeStyle = css(mul(c, 0.72), 0.35);
    g.lineWidth = Math.max(0.5, plank * 0.03);
    for (let k = 0; k < 3; k++) {
      const off = plank * (0.2 + rnd() * 0.6);
      const wav = plank * 0.08;
      g.beginPath();
      for (let t = 0; t <= length; t += Math.max(2, length / 30)) {
        const o = off + Math.sin(t / (plank * 1.7) + k * 2 + rnd() * 0.2) * wav;
        if (along === 'x') (t ? g.lineTo : g.moveTo).call(g, x + t, by + o);
        else (t ? g.lineTo : g.moveTo).call(g, bx + o, y + t);
      }
      g.stroke();
    }
    // Stoßfugen
    let t = rnd() * length * 0.6;
    while (t < length) {
      g.fillStyle = 'rgba(30,20,10,0.45)';
      if (along === 'x') g.fillRect(x + t, by, Math.max(1, plank * 0.05), bh);
      else g.fillRect(bx, y + t, bw, Math.max(1, plank * 0.05));
      t += length * (0.35 + rnd() * 0.5);
    }
    // Längsfuge
    g.fillStyle = 'rgba(25,16,8,0.55)';
    if (along === 'x') g.fillRect(x, by + bh - plank * gap, w, plank * gap);
    else g.fillRect(bx + bw - plank * gap, y, plank * gap, h);
  }
  g.restore();
}

/** Erde mit Krümeln */
export function soil(g: Ctx, x: number, y: number, w: number, h: number, rnd: () => number, ppm: number) {
  g.fillStyle = '#4b3a2b';
  g.fillRect(x, y, w, h);
  grain(g, x, y, w, h, rnd, Math.min(6000, (w * h) / (ppm * ppm) * 900), Math.max(1, ppm * 0.02), 0.5);
}

/** Kugeliger Kopf (Salat, Kohl, Kübelpflanze) */
export function headPlant(g: Ctx, X: number, Y: number, R: number, color: string, rnd: () => number) {
  const pal = palette(color);
  tuft(g, X + R * 0.08, Y + R * 0.1, R * 1.05, 0, [mul(pal[0], 0.5), pal[0], pal[0]], rnd);
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * R * 0.45;
    const x = Math.cos(a) * d;
    const y = Math.sin(a) * d;
    tuft(g, X + x, Y + y, R * (0.42 + rnd() * 0.2), Math.max(0, Math.min(1, 0.5 + (x * L[0] + y * L[1]) / R)), pal, rnd);
  }
}

/** Weicher Kontaktschatten an einem Rand (Wand → Boden), innerhalb des Objekts */
export function innerShade(g: Ctx, x: number, y: number, w: number, h: number, k: number) {
  const top = g.createLinearGradient(0, y, 0, y + k);
  top.addColorStop(0, 'rgba(0,0,0,0.35)');
  top.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = top;
  g.fillRect(x, y, w, k);
  const left = g.createLinearGradient(x, 0, x + k, 0);
  left.addColorStop(0, 'rgba(0,0,0,0.3)');
  left.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = left;
  g.fillRect(x, y, k, h);
}
