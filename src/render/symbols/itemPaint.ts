/**
 * Gebäude und Möbel im fotorealistischen Stil (B), Draufsicht.
 *
 * Jedes Objekt wird einmal je Symbol/Maß/Variante mit Canvas 2D gemalt (w × d Meter, ohne Rand)
 * und als Textur zwischengespeichert. Licht von oben links wie bei den Pflanzen.
 * Für die Schrägansicht liefert `itemSolid` den Körper (Wandhöhe, Dachform, Wandmaterial).
 */
import { L, css, mix, mul, palette, prng, rgbOf, tuft, type RGB } from './foliage';

type Ctx = CanvasRenderingContext2D;
type Pt = [number, number];

/** Helligkeit einer Fläche mit waagerechter Normalen n (Licht oben links) */
const faceLight = (nx: number, ny: number) => 0.84 + 0.26 * (nx * L[0] + ny * L[1]);

function poly(g: Ctx, pts: Pt[]) {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
}

/** feine Körnung (Putz, Beton, Erde) */
function grain(g: Ctx, x: number, y: number, w: number, h: number, rnd: () => number, n: number, size: number, alpha: number) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = rnd() < 0.5 ? `rgba(255,255,255,${alpha * rnd()})` : `rgba(0,0,0,${alpha * rnd()})`;
    g.fillRect(x + rnd() * w, y + rnd() * h, size * (0.6 + rnd()), size * (0.6 + rnd()));
  }
}

/**
 * Holzbretter in einem Rechteck: `along` = Faserrichtung ('x' oder 'y'), Bretter quer dazu gestapelt.
 * Fugen, Farbschwankung je Brett, Maserung.
 */
function boards(g: Ctx, x: number, y: number, w: number, h: number, along: 'x' | 'y', plank: number, base: RGB, rnd: () => number, gap = 0.12) {
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
function soil(g: Ctx, x: number, y: number, w: number, h: number, rnd: () => number, ppm: number) {
  g.fillStyle = '#4b3a2b';
  g.fillRect(x, y, w, h);
  grain(g, x, y, w, h, rnd, Math.min(6000, (w * h) / (ppm * ppm) * 900), Math.max(1, ppm * 0.02), 0.5);
}

/** Kugeliger Kopf (Salat, Kohl, Kübelpflanze) */
function headPlant(g: Ctx, X: number, Y: number, R: number, color: string, rnd: () => number) {
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
function innerShade(g: Ctx, x: number, y: number, w: number, h: number, k: number) {
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

/* ---------------- Dächer ---------------- */

interface RoofFace {
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
function tiles(g: Ctx, f: RoofFace, base: RGB, ppm: number, rnd: () => number) {
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
function solar(g: Ctx, f: RoofFace, ppm: number) {
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
function ridges(g: Ctx, faces: RoofFace[], ppm: number) {
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

/* ---------------- Objekte ---------------- */

type Painter = (g: Ctx, W: number, D: number, ppm: number, rnd: () => number) => void;

const house: Painter = (g, W, D, ppm, rnd) => {
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

const shed: Painter = (g, W, D, ppm, rnd) => {
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

const greenhouse: Painter = (g, W, D, ppm, rnd) => {
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

const compost: Painter = (g, W, D, ppm, rnd) => {
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

const barrel: Painter = (g, W, _D, ppm, rnd) => {
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

const raisedBed: Painter = (g, W, D, ppm, rnd) => {
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

/** Stuhl in Draufsicht: Sitz und Lehne (Lehne zeigt nach `back`) */
function chair(g: Ctx, x: number, y: number, s: number, back: Pt, ppm: number) {
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

const table: Painter = (g, W, D, ppm, rnd) => {
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

const lounger: Painter = (g, W, D, ppm, rnd) => {
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

const planter: Painter = (g, W, _D, ppm, rnd) => {
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

const pool: Painter = (g, W, D, ppm, rnd) => {
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

const play: Painter = (g, W, D, ppm, rnd) => {
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

const fence: Painter = (g, W, D, ppm, rnd) => {
  boards(g, 0, 0, W, D, 'x', D, rgbOf('#9a7a5a'), rnd, 0);
  for (let x = 0; x <= W + 1e-6; x += ppm) {
    g.fillStyle = '#4e3d2c';
    g.fillRect(Math.min(W - 0.08 * ppm, Math.max(0, x - 0.04 * ppm)), 0, 0.08 * ppm, D);
  }
};

const edge: Painter = (g, W, D, ppm, rnd) => {
  g.fillStyle = '#aaa395';
  g.fillRect(0, 0, W, D);
  grain(g, 0, 0, W, D, rnd, (W * D) / (ppm * ppm) * 4000, 1, 0.3);
  g.fillStyle = 'rgba(60,55,48,0.6)';
  for (let x = ppm; x < W; x += ppm) g.fillRect(x - 0.5, 0, 1, D);
};

const PAINTERS: Record<string, Painter> = {
  house, shed, greenhouse, compost, barrel, raisedBed, table, lounger, planter, pool, play, fence, edge,
  // Mustergarten-Objekte: gemalt nur als Platzhalter, bis die Blender-Bilder geladen sind
  cortenBed: raisedBed, container: shed, pergola: shed, lounge: lounger, firepit: table, trampoline: pool, gate: fence, stoneWall: fence, basaltBoulders: barrel, basaltColumns: barrel, deckBench: lounger,
};

/** Auflösung je Objektgröße: kleine Möbel fein, Häuser gröber (Textur ≤ 1024 px) */
export function itemPpm(w: number, d: number): number {
  return Math.max(16, Math.min(160, 1024 / Math.max(w, d)));
}

/** Draufsicht eines Katalogobjekts, w × d Meter */
export function paintItem(symbol: string, w: number, d: number, seed: number): HTMLCanvasElement {
  const ppm = itemPpm(w, d);
  const c = document.createElement('canvas');
  c.width = Math.max(4, Math.round(w * ppm));
  c.height = Math.max(4, Math.round(d * ppm));
  const g = c.getContext('2d')!;
  (PAINTERS[symbol] ?? edge)(g, c.width, c.height, ppm, prng(seed));
  return c;
}

/* ---------------- Körper für die Schrägansicht ---------------- */

export type RoofKind = 'flat' | 'hip' | 'gable';

export interface ItemSolid {
  /** Körperform: Quader mit Dach, Zylinder (Tonne, Kübel), Platte auf Beinen (Tisch, Liege), flach */
  kind: 'box' | 'cylinder' | 'slab' | 'flat';
  /** Traufhöhe (Wände) */
  eave: number;
  roof: RoofKind;
  /** Wandfarbe; `glass` = durchscheinend */
  wall: string;
  glass?: boolean;
  /** Fenster in den Wänden (Wohnhaus, Gartenhaus) */
  windows?: 'house' | 'shed';
  /** Wandverkleidung aus Brettern */
  wood?: boolean;
}

export function itemSolid(symbol: string, h: number): ItemSolid {
  switch (symbol) {
    case 'house':
      return { kind: 'box', eave: h * 0.6, roof: 'hip', wall: '#e8e1d2', windows: 'house' };
    case 'shed':
      return { kind: 'box', eave: h * 0.78, roof: 'gable', wall: '#8a6748', windows: 'shed', wood: true };
    case 'greenhouse':
      return { kind: 'box', eave: h * 0.68, roof: 'gable', wall: '#d9e6ea', glass: true };
    case 'compost':
    case 'raisedBed':
      return { kind: 'box', eave: h, roof: 'flat', wall: symbol === 'compost' ? '#7d5f40' : '#a27c56', wood: true };
    case 'fence':
      return { kind: 'box', eave: h, roof: 'flat', wall: '#9a7a5a', wood: true };
    case 'cortenBed':
      return { kind: 'box', eave: h, roof: 'flat', wall: '#7a3e22' };
    case 'container':
    case 'pergola':
      return { kind: 'box', eave: h, roof: 'flat', wall: '#26272a' };
    case 'gate':
      return { kind: 'box', eave: h, roof: 'flat', wall: '#2e2f31' };
    case 'stoneWall':
      return { kind: 'box', eave: h, roof: 'flat', wall: '#8d877c' };
    case 'basaltBoulders':
    case 'basaltColumns':
      return { kind: 'cylinder', eave: h, roof: 'flat', wall: '#35383b' };
    case 'lounge':
      return { kind: 'slab', eave: h, roof: 'flat', wall: '#6b6660' };
    case 'barrel':
      return { kind: 'cylinder', eave: h, roof: 'flat', wall: '#45524a' };
    case 'planter':
      return { kind: 'cylinder', eave: h, roof: 'flat', wall: '#b06a45' };
    case 'table':
    case 'lounger':
      return { kind: 'slab', eave: h, roof: 'flat', wall: '#6b6660' };
    case 'play':
      return { kind: 'slab', eave: 0.35, roof: 'flat', wall: '#8a6a48' };
    default:
      return { kind: 'flat', eave: 0, roof: 'flat', wall: '#999' };
  }
}
