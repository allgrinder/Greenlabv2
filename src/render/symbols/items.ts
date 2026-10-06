/**
 * Objektsymbole in Draufsicht (lokale Koordinaten, Mittelpunkt = 0,0, Maße in m).
 * Farben und Aufbau nach GardenPlan.dc.html.
 */
import { Graphics } from 'pixi.js';
import { rng } from '../util/rng';

type Draw = (g: Graphics, w: number, d: number, seed: number) => void;

const rect = (g: Graphics, x: number, y: number, w: number, h: number, r = 0) => (r ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h));

const house: Draw = (g, w, d) => {
  const x0 = -w / 2;
  const y0 = -d / 2;
  const x1 = w / 2;
  const y1 = d / 2;
  const ridge = Math.min(w, d) / 2;
  // Walmdach: vier Dachflächen mit unterschiedlicher Helligkeit
  const top = [x0, y0, x1, y0, 0, y0 + ridge];
  const right = [x1, y0, x1, y1, 0, y1 - ridge, 0, y0 + ridge];
  const left = [x0, y0, 0, y0 + ridge, 0, y1 - ridge, x0, y1];
  const bottom = [x0, y1, x1, y1, 0, y1 - ridge];
  g.rect(x0, y0, w, d).fill(0x55585b);
  g.poly(top).fill(0x46494c);
  g.poly(right).fill(0x4f5255);
  g.poly(left).fill(0x62656a);
  g.poly(bottom).fill(0x6a6d70);
  // Solarmodule auf der Südfläche
  const pv = 0.8;
  for (let i = 0; i < 7; i++) g.rect(-2 + i * pv - 0.8, y1 - 1.3, pv, pv);
  for (let i = 0; i < 5; i++) g.rect(-1 + i * pv - 0.8, y1 - 2.2, pv, pv);
  g.fill(0x2e3a4b).stroke({ color: 0x8c98a8, width: 0.025 });
  g.moveTo(x0, y0).lineTo(0, y0 + ridge).lineTo(x1, y0);
  g.moveTo(x0, y1).lineTo(0, y1 - ridge).lineTo(x1, y1);
  g.moveTo(0, y0 + ridge).lineTo(0, y1 - ridge);
  g.stroke({ color: 0x2d3033, width: 0.06 });
  // Dachfenster, Schornstein
  g.rect(x0 + 1.6, -2.4, 0.7, 1.1).rect(x0 + 1.6, 1.3, 0.7, 1.1).fill(0x9bb3c3).stroke({ color: 0x3a3d40, width: 0.03 });
  g.rect(x1 - 2.6, y0 + 2.1, 0.8, 0.7).fill(0x6e5f55).stroke({ color: 0x2d3033, width: 0.04 });
  g.rect(x0 - 0.1, y0 - 0.1, w + 0.2, d + 0.2).stroke({ color: 0x25282a, width: 0.08 });
};

const shed: Draw = (g, w, d) => {
  g.rect(-w / 2, -d / 2, w / 2, d).fill(0x8a745e);
  g.rect(0, -d / 2, w / 2, d).fill(0x6f5c49);
  // Dachdeckung quer zum First
  for (let y = -d / 2 + 0.2; y < d / 2; y += 0.2) g.moveTo(-w / 2, y).lineTo(w / 2, y);
  g.stroke({ color: 0x322314, alpha: 0.45, width: 0.025 });
  g.rect(-w / 2 - 0.1, -d / 2 - 0.1, w + 0.2, d + 0.2).stroke({ color: 0x4e3f31, width: 0.05 });
  g.moveTo(0, -d / 2 - 0.1).lineTo(0, d / 2 + 0.1).stroke({ color: 0x4a3b2d, width: 0.08 });
};

const greenhouse: Draw = (g, w, d, seed) => {
  g.rect(-w / 2, -d / 2, w, d).fill({ color: 0xe3ece9, alpha: 0.85 }).stroke({ color: 0x8e9b99, width: 0.06 });
  for (let i = 1; i < 8; i++) g.moveTo(-w / 2 + (w * i) / 8, -d / 2).lineTo(-w / 2 + (w * i) / 8, d / 2);
  g.moveTo(-w / 2, 0).lineTo(w / 2, 0);
  g.stroke({ color: 0x6e7d7b, alpha: 0.55, width: 0.03 });
  g.moveTo(-w / 2, 0).lineTo(w / 2, 0).stroke({ color: 0x7f8c8a, width: 0.07 });
  const r = rng(seed);
  for (let i = 0; i < 6; i++) g.circle(-w / 2 + 0.4 + r() * (w - 0.8), -d / 2 + 0.4 + r() * (d - 0.8), 0.15 + r() * 0.06).fill({ color: 0x7e9a60, alpha: 0.7 });
};

const compost: Draw = (g, w, d) => {
  g.rect(-w / 2, -d / 2, w, d).fill(0x7e6448).stroke({ color: 0x57432f, width: 0.045 });
  const iw = (w - 0.45) / 2;
  g.rect(-w / 2 + 0.15, -d / 2 + 0.15, iw, d - 0.3).fill(0x4d3c2d);
  g.rect(0.075, -d / 2 + 0.15, iw, d - 0.3).fill(0x5a4636);
};

const barrel: Draw = (g, w) => {
  g.circle(0, 0, w / 2).fill(0x55605a).stroke({ color: 0x3c4440, width: 0.05 });
  g.circle(0, 0, w / 3).fill(0x425049);
};

const raisedBed: Draw = (g, w, d, seed) => {
  rect(g, -w / 2, -d / 2, w, d, 0.075).fill(0xa27c56).stroke({ color: 0x6f5238, width: 0.04 });
  g.rect(-w / 2 + 0.125, -d / 2 + 0.125, w - 0.25, d - 0.25).fill(0x5b4535);
  const r = rng(seed);
  const cols = ['#A9C47A', '#6E8C7A', '#6F8F4E', '#93B166', '#93A07E', '#7C9A58'];
  const c = parseInt(cols[Math.floor(r() * cols.length)].slice(1), 16);
  const rad = 0.15 + r() * 0.06;
  for (let row = 0; row < 2; row++)
    for (let i = 0; i < 6; i++) {
      const x = -w / 2 + 0.375 + i * ((w - 0.6) / 5.5) + (row ? 0.22 : 0);
      g.circle(x, -d / 2 + 0.4 + row * 0.4, rad);
    }
  g.fill(c).stroke({ color: 0x1e2814, alpha: 0.35, width: 0.025 });
};

const FURN = { fill: 0xd9cfbe, stroke: 0x837a6b };

const table: Draw = (g, w, d) => {
  // Tisch in der Mitte, Stühle an den Längsseiten und Stirnseiten
  const tw = w * 0.65;
  const td = d * 0.76;
  const cs = 0.55;
  const n = 3;
  for (let i = 0; i < n; i++) {
    const y = -td / 2 + (td / n) * (i + 0.5) - cs / 2;
    rect(g, -w / 2, y, cs, cs, 0.12);
    rect(g, w / 2 - cs, y, cs, cs, 0.12);
  }
  rect(g, -cs / 2, -d / 2, cs, cs, 0.12);
  rect(g, -cs / 2, d / 2 - cs, cs, cs, 0.12);
  g.fill(FURN.fill).stroke({ color: FURN.stroke, width: 0.035 });
  rect(g, -tw / 2, -td / 2, tw, td, 0.1).fill(0xece6d9).stroke({ color: FURN.stroke, width: 0.035 });
};

const lounger: Draw = (g, w, d) => {
  rect(g, -w / 2, -d / 2, w, d, 0.15).fill(0xf1ede5).stroke({ color: FURN.stroke, width: 0.035 });
  rect(g, -w / 2 + 0.05, -d / 2 + 0.1, 0.45, d - 0.2, 0.1).fill(0xdcd2c1).stroke({ color: 0x9c9384, width: 0.025 });
};

const planter: Draw = (g, w) => {
  g.circle(0, 0, w / 2).fill(0xb9724f).stroke({ color: 0x7e4a31, width: 0.04 });
  g.circle(0, 0, w / 2 - 0.08).fill(0x7d9561);
};

const pool: Draw = (g, w, d) => {
  rect(g, -w / 2, -d / 2, w, d, 0.3).fill(0xdcd4c4).stroke({ color: 0xa69c8c, width: 0.05 });
  rect(g, -w / 2 + 0.3, -d / 2 + 0.3, w - 0.6, d - 0.6, 0.15).fill(0x8cc6d6);
  g.moveTo(-w / 4, -d / 6).quadraticCurveTo(0, -d / 3.5, w / 4, -d / 6).stroke({ color: 0xffffff, alpha: 0.6, width: 0.06 });
};

const play: Draw = (g, w, d) => {
  rect(g, -w / 2, 0, w * 0.4, d / 2).fill(0xe3d3a8).stroke({ color: 0xb5a57a, width: 0.04 });
  g.moveTo(-w / 6, -d / 2).lineTo(w / 2, -d / 2).moveTo(-w / 6, -d / 2).lineTo(-w / 6, d / 6).moveTo(w / 2, -d / 2).lineTo(w / 2, d / 6);
  g.stroke({ color: 0x6b5a47, width: 0.08 });
  g.moveTo(w / 12, -d / 2 + 0.2).lineTo(w / 12, 0).moveTo(w / 3, -d / 2 + 0.2).lineTo(w / 3, 0).stroke({ color: 0x6b5a47, width: 0.04 });
  g.rect(w / 12 - 0.2, 0, 0.4, 0.1).rect(w / 3 - 0.2, 0, 0.4, 0.1).fill(0xb9724f);
};

const fence: Draw = (g, w, d) => {
  g.rect(-w / 2, -d / 2, w, d).fill(0x8a745e);
  for (let x = -w / 2; x <= w / 2 + 1e-6; x += 1) g.rect(x - 0.05, -0.05, 0.1, 0.1);
  g.fill(0x4a3b2d);
};

const edge: Draw = (g, w, d) => {
  g.rect(-w / 2, -d / 2, w, d).fill(0xa3998a);
};

const SYMBOLS: Record<string, Draw> = { house, shed, greenhouse, compost, barrel, raisedBed, table, lounger, planter, pool, play, fence, edge };

export function drawItem(g: Graphics, symbol: string, w: number, d: number, seed: number): void {
  (SYMBOLS[symbol] ?? edge)(g, w, d, seed);
}

/** Dunkle Gebäude-/Objekte, deren Beschriftung hell sein muss */
export const DARK_SYMBOLS = new Set(['house', 'shed']);
