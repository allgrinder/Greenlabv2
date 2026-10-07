/**
 * Fotorealistische Pflanzen in Draufsicht (Stil B): Kronen aus beleuchteten Laubballen,
 * kahle Astgerüste, Stauden-Polster, Grashorste, Spalierschirme.
 *
 * Gemalt wird einmal je Art/Jahreszeit/Größenstufe/Variante mit Canvas 2D und als Textur
 * zwischengespeichert; im Plan sind es dann nur Sprites – schnell auch bei vielen Pflanzen.
 * Licht kommt von oben links (wie im Schattenlayer).
 */
import { Texture } from 'pixi.js';

type RGB = [number, number, number];
const L = [-0.62, -0.78] as const;

function prng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rgbOf = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
const css = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const SUN: RGB = [255, 244, 200];

/** Dunkel-, Mittel- und Lichtton aus einer Laubfarbe */
export function palette(color: string): [RGB, RGB, RGB] {
  const m = rgbOf(color);
  return [mul(m, 0.5), m, mix(m, SUN, 0.38)];
}

function softBlob(g: CanvasRenderingContext2D, X: number, Y: number, R: number, rnd: () => number) {
  g.beginPath();
  const k = 18;
  const ph = rnd() * 6;
  for (let j = 0; j <= k; j++) {
    const a = (j / k) * Math.PI * 2;
    const rr = R * (0.9 + 0.1 * Math.sin(a * 3 + ph) + 0.05 * Math.sin(a * 7 + ph * 2));
    if (j) g.lineTo(X + Math.cos(a) * rr, Y + Math.sin(a) * rr);
    else g.moveTo(X + Math.cos(a) * rr, Y + Math.sin(a) * rr);
  }
  g.closePath();
}

/** ein Büschel: Kugelverlauf mit Lichtseite oben links */
function tuft(g: CanvasRenderingContext2D, X: number, Y: number, R: number, l: number, [dark, mid, light]: [RGB, RGB, RGB], rnd: () => number) {
  const gr = g.createRadialGradient(X + L[0] * R * 0.35, Y + L[1] * R * 0.35, R * 0.05, X, Y, R);
  gr.addColorStop(0, css(mix(mid, light, l)));
  gr.addColorStop(0.65, css(mix(dark, mid, 0.35 + l * 0.6)));
  gr.addColorStop(1, css(mul(dark, 0.75 + l * 0.2)));
  g.fillStyle = gr;
  softBlob(g, X, Y, R, rnd);
  g.fill();
}

export interface CrownOpts {
  /** Durchmesser in Metern (bestimmt die Feinheit der Blattstruktur) */
  diameter: number;
  bloom?: string | null;
  fruit?: string | null;
  /** Anteil kleiner, dichter Ballen (Sträucher/Hecken) */
  compact?: boolean;
}

/**
 * Laubkrone auf ein quadratisches Canvas: Mitte = Stamm, Krone füllt 80 % der Breite.
 * Liefert das Canvas; die Kronengrenze liegt bei Radius size*0.4.
 */
export function paintCrown(size: number, color: string, seed: number, o: CrownOpts): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const rnd = prng(seed);
  const pal = palette(color);
  const [dark, , light] = pal;
  const o0 = size / 2;
  const r = size * 0.4; // Kronenradius in Pixeln
  const ppm = (2 * r) / o.diameter; // Pixel pro Meter
  const lit = (x: number, y: number) => Math.max(0, Math.min(1, 0.5 + (x * L[0] + y * L[1]) / (r * 1.7)));

  // Kernschatten unter den Ballen
  g.save();
  g.filter = `blur(${r * 0.08}px)`;
  g.fillStyle = css(mul(dark, 0.6));
  g.beginPath();
  g.arc(o0, o0, r * 0.8, 0, Math.PI * 2);
  g.fill();
  g.restore();

  const dm = o.diameter;
  const nClumps = dm < 0.8 ? 1 : Math.round((o.compact ? 5 : 4) + dm * dm * (o.compact ? 1.4 : 0.55));
  const clumps: [number, number, number][] = [];
  for (let i = 0; i < Math.min(nClumps, 90); i++) {
    const a = rnd() * Math.PI * 2;
    const d = nClumps === 1 ? 0 : Math.sqrt(rnd()) * r * 0.62;
    const cr = nClumps === 1 ? r * 0.92 : r * ((o.compact ? 0.26 : 0.3) + rnd() * 0.14);
    clumps.push([Math.cos(a) * d, Math.sin(a) * d, cr]);
  }
  clumps.sort((a, b) => a[0] * L[0] + a[1] * L[1] - (b[0] * L[0] + b[1] * L[1]));
  for (const [qx, qy, qr] of clumps) {
    const sub = Math.round(10 + Math.min(70, ((qr / ppm) * (qr / ppm)) * 60));
    const tufts: [number, number, number][] = [];
    for (let k = 0; k < sub; k++) {
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * qr * 0.8;
      tufts.push([qx + Math.cos(a) * d, qy + Math.sin(a) * d, qr * (0.2 + rnd() * 0.16)]);
    }
    tufts.sort((a, b) => (a[0] - qx) * L[0] + (a[1] - qy) * L[1] - ((b[0] - qx) * L[0] + (b[1] - qy) * L[1]));
    for (const [x, y, tr] of tufts) {
      const local = Math.max(0, Math.min(1, 0.5 + ((x - qx) * L[0] + (y - qy) * L[1]) / (qr * 1.2)));
      tuft(g, o0 + x, o0 + y, tr, local * 0.6 + lit(x, y) * 0.4, pal, rnd);
    }
  }

  // Blattstruktur, Blüten, Früchte (nur auf der Krone)
  g.globalCompositeOperation = 'source-atop';
  const leaf = Math.max(1, 0.03 * ppm);
  const leaves = Math.min(26000, Math.round((r * r) / (leaf * leaf) * 0.9));
  for (let i = 0; i < leaves; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * r * 0.97;
    const x = Math.cos(a) * d;
    const y = Math.sin(a) * d;
    g.fillStyle = rnd() < lit(x, y) ? css(light, 0.16 + rnd() * 0.2) : css(mul(dark, 0.6), 0.14 + rnd() * 0.18);
    g.beginPath();
    g.ellipse(o0 + x, o0 + y, leaf * (0.8 + rnd()), leaf * (0.4 + rnd() * 0.5), rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
  for (const [spots, col, sz] of [
    [o.bloom, o.bloom, 0.028],
    [o.fruit, o.fruit, 0.05],
  ] as const) {
    if (!spots || !col) continue;
    const n = Math.round(dm * dm * (o.bloom === spots ? 90 : 10));
    const base = rgbOf(col);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * r * 0.9;
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      const l = lit(x, y);
      const R = Math.max(1, sz * ppm * (0.7 + rnd() * 0.6));
      const gr = g.createRadialGradient(o0 + x - R * 0.3, o0 + y - R * 0.3, 0, o0 + x, o0 + y, R);
      gr.addColorStop(0, css(mix(base, [255, 255, 255], 0.35 * l)));
      gr.addColorStop(1, css(mul(base, 0.7 + l * 0.2)));
      g.fillStyle = gr;
      g.beginPath();
      g.arc(o0 + x, o0 + y, R, 0, Math.PI * 2);
      g.fill();
    }
  }
  // Gesamtform: Licht oben links, Kernschatten unten rechts
  const sh = g.createLinearGradient(o0 + L[0] * r, o0 + L[1] * r, o0 - L[0] * r, o0 - L[1] * r);
  sh.addColorStop(0, 'rgba(255,248,205,0.16)');
  sh.addColorStop(0.5, 'rgba(0,0,0,0)');
  sh.addColorStop(1, 'rgba(8,20,4,0.34)');
  g.fillStyle = sh;
  g.fillRect(0, 0, size, size);
  return c;
}

/** Kahle Krone (Winter): feines Astgerüst mit Lichtkante */
export function paintBareTree(size: number, seed: number, diameter: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const rnd = prng(seed);
  const o = size / 2;
  const r = size * 0.4;
  const ppm = (2 * r) / diameter;
  g.lineCap = 'round';
  const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
    if (depth > 5 || len < 2) return;
    const ex = x + Math.cos(a) * len;
    const ey = y + Math.sin(a) * len;
    g.strokeStyle = `rgba(${78 + depth * 8},${66 + depth * 8},${54 + depth * 6},${0.85 - depth * 0.08})`;
    g.lineWidth = Math.max(0.6, w);
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a + 0.3) * len * 0.5, y + Math.sin(a + 0.3) * len * 0.5, ex, ey);
    g.stroke();
    const n = 2 + (rnd() < 0.4 ? 1 : 0);
    for (let i = 0; i < n; i++) branch(ex, ey, a + (rnd() - 0.5) * 1.3, len * (0.55 + rnd() * 0.2), w * 0.62, depth + 1);
  };
  const main = 6 + Math.round(rnd() * 3);
  for (let i = 0; i < main; i++) branch(o, o, (i / main) * Math.PI * 2 + rnd() * 0.4, r * 0.42, Math.max(1.5, 0.12 * ppm), 0);
  g.fillStyle = '#3b3226';
  g.beginPath();
  g.arc(o, o, Math.max(2, 0.16 * ppm), 0, Math.PI * 2);
  g.fill();
  return c;
}

/** Stauden-Polster mit Blüten, Grashorst als feine Halme */
export function paintPerennial(size: number, leafColor: string, bloom: string | null, grass: boolean, seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const rnd = prng(seed);
  const o = size / 2;
  const r = size * 0.42;
  const pal = palette(leafColor);
  if (grass) {
    const [dark, mid, light] = pal;
    for (let k = 0; k < 140; k++) {
      const a = rnd() * Math.PI * 2;
      const l = r * (0.35 + rnd() * 0.65);
      const t = rnd();
      g.strokeStyle = css(mix(mix(dark, mid, t), light, Math.max(0, -Math.cos(a - 4.04)) * 0.6), 0.75);
      g.lineWidth = Math.max(0.8, size / 140);
      g.beginPath();
      g.moveTo(o, o);
      g.quadraticCurveTo(o + Math.cos(a + 0.4) * l * 0.5, o + Math.sin(a + 0.4) * l * 0.5, o + Math.cos(a) * l, o + Math.sin(a) * l);
      g.stroke();
    }
    if (bloom) {
      const b = rgbOf(bloom);
      for (let k = 0; k < 60; k++) {
        const a = rnd() * Math.PI * 2;
        const d = r * (0.5 + rnd() * 0.45);
        g.fillStyle = css(mix(b, [255, 250, 230], rnd() * 0.4), 0.7);
        g.beginPath();
        g.ellipse(o + Math.cos(a) * d, o + Math.sin(a) * d, size / 60, size / 140, a, 0, Math.PI * 2);
        g.fill();
      }
    }
    return c;
  }
  // Blattpolster aus kleinen Büscheln
  g.save();
  g.filter = `blur(${r * 0.1}px)`;
  g.fillStyle = css(mul(pal[0], 0.7), 0.8);
  g.beginPath();
  g.arc(o, o, r * 0.85, 0, Math.PI * 2);
  g.fill();
  g.restore();
  const n = 26;
  const ts: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * r * 0.7;
    ts.push([Math.cos(a) * d, Math.sin(a) * d, r * (0.22 + rnd() * 0.16)]);
  }
  ts.sort((a, b) => a[0] * L[0] + a[1] * L[1] - (b[0] * L[0] + b[1] * L[1]));
  for (const [x, y, tr] of ts) tuft(g, o + x, o + y, tr, Math.max(0, Math.min(1, 0.5 + (x * L[0] + y * L[1]) / (r * 1.6))), pal, rnd);
  if (bloom) {
    const b = rgbOf(bloom);
    for (let k = 0; k < 34; k++) {
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * r * 0.85;
      const x = o + Math.cos(a) * d;
      const y = o + Math.sin(a) * d;
      const R = size * (0.035 + rnd() * 0.03);
      const gr = g.createRadialGradient(x - R * 0.3, y - R * 0.3, 0, x, y, R);
      gr.addColorStop(0, css(mix(b, [255, 255, 255], 0.3)));
      gr.addColorStop(1, css(mul(b, 0.75)));
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, R, 0, Math.PI * 2);
      g.fill();
    }
  }
  return c;
}

/**
 * Spalierschirm in Draufsicht (Breite × Tiefe in Metern): geschnittener, dichter Laubkörper.
 * `accent` färbt Neuaustrieb am Rand (z. B. rot bei ›Red Robin‹).
 */
export function paintEspalier(widthM: number, depthM: number, ppm: number, color: string, accent: string | null, bare: boolean, seed: number): HTMLCanvasElement {
  const pad = 0.12;
  const c = document.createElement('canvas');
  c.width = Math.max(8, Math.ceil((widthM + pad * 2) * ppm));
  c.height = Math.max(8, Math.ceil((depthM + pad * 2) * ppm));
  const g = c.getContext('2d')!;
  const rnd = prng(seed);
  const X = (m: number) => (pad + m) * ppm;
  if (bare) {
    // Astgerüst: waagerechte Leitäste am Spalier
    g.strokeStyle = 'rgba(92,78,62,0.9)';
    g.lineCap = 'round';
    for (let y = 0.15; y < depthM; y += Math.max(0.12, depthM / 3)) {
      g.lineWidth = Math.max(1, 0.04 * ppm);
      g.beginPath();
      g.moveTo(X(0.02), X(y));
      g.lineTo(X(widthM - 0.02), X(y + (rnd() - 0.5) * 0.04));
      g.stroke();
    }
    return c;
  }
  const pal = palette(color);
  g.fillStyle = css(mul(pal[0], 0.55));
  g.beginPath();
  g.roundRect(X(0), X(0), widthM * ppm, depthM * ppm, 0.1 * ppm);
  g.fill();
  const acc = accent ? palette(accent) : null;
  const n = Math.round(widthM * depthM * 420);
  const ts: [number, number, number][] = [];
  for (let i = 0; i < n; i++) ts.push([rnd() * widthM, rnd() * depthM, 0.055 + rnd() * 0.06]);
  ts.sort((a, b) => a[0] * L[0] + a[1] * L[1] - (b[0] * L[0] + b[1] * L[1]));
  for (const [x, y, tr] of ts) {
    const l = Math.max(0, Math.min(1, 0.55 - (y / depthM - 0.5) * 0.7 - (x / widthM - 0.5) * 0.2));
    const edge = Math.min(y, depthM - y, x, widthM - x) < 0.1;
    const useAcc = acc && rnd() < (edge ? 0.32 : 0.07);
    tuft(g, X(x), X(y), tr * ppm, l, useAcc ? acc : pal, rnd);
  }
  g.globalCompositeOperation = 'source-atop';
  const sh = g.createLinearGradient(0, X(0), 0, X(depthM));
  sh.addColorStop(0, 'rgba(255,245,200,0.15)');
  sh.addColorStop(1, 'rgba(10,15,5,0.35)');
  g.fillStyle = sh;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

/* ---------------- Cache ---------------- */

const cache = new Map<string, Texture>();
/** Messwerte für Entwicklung und Tests */
export const stats = { count: 0, ms: 0 };
if (import.meta.env.DEV) (globalThis as Record<string, unknown>).__gwFoliage = stats;

/** Textur aus Cache oder neu malen */
export function foliageTexture(key: string, paint: () => HTMLCanvasElement): Texture {
  let t = cache.get(key);
  if (!t) {
    const t0 = performance.now();
    const canvas = paint();
    stats.count++;
    stats.ms += performance.now() - t0;
    t = Texture.from(canvas);
    t.source.scaleMode = 'linear';
    t.source.autoGenerateMipmaps = canvas.width >= 256;
    cache.set(key, t);
  }
  return t;
}

/** Größenstufe für die Blattfeinheit (Durchmesser in m) */
export const sizeBucket = (d: number) => (d < 0.9 ? 0.6 : d < 1.8 ? 1.4 : d < 3.5 ? 2.6 : d < 7 ? 5 : d < 11 ? 9 : 14);
/** Texturgröße je Stufe */
export const textureSize = (bucket: number) => (bucket <= 0.6 ? 96 : bucket <= 1.4 ? 160 : bucket <= 2.6 ? 256 : bucket <= 5 ? 384 : 512);
