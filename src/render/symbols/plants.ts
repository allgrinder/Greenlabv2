/**
 * Pflanzensymbole in Draufsicht, nachgebaut nach GardenPlan.dc.html.
 * Alle Maße in Metern, Ursprung = Weltursprung (Graphics liegt im Welt-Container).
 */
import { Graphics } from 'pixi.js';
import type { PlantSpecies, Vec2 } from '../../core/model/types';
import type { Polygon } from '../../core/geometry/polygon';
import { pointInRegion, bbox } from '../../core/geometry/polygon';
import type { FlatRegion } from '../../core/geometry/shape';
import { hex, rng } from '../util/rng';
import { canopyGradient, clumpGradient } from './gradients';

const LOBE_STROKE = { color: 0x1a2414, alpha: 0.32 };

/** Baumkrone: Lappenkranz, Innenfläche, Büschel, Lichtverlauf, Stammpunkt mit Achsenkreuz */
export function drawTree(g: Graphics, c: Vec2, diameter: number, sp: PlantSpecies, seed: number, lod: number): void {
  const r = diameter / 2;
  const color = hex(sp.colors.summer);
  const rnd = rng(seed);
  const big = diameter > 8;
  const n = lod >= 2 ? (big ? 17 : 11) : 8;
  const lobes: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.25;
    const rr = r * (0.78 + rnd() * 0.06);
    lobes.push({ x: c.x + Math.cos(a) * rr, y: c.y + Math.sin(a) * rr, r: r * (0.25 + rnd() * 0.06) });
  }
  const sw = Math.max(0.02, diameter * 0.004);
  for (const l of lobes) g.circle(l.x, l.y, l.r).fill(color).stroke({ ...LOBE_STROKE, width: sw });
  if (lod >= 2) for (const l of lobes) g.circle(l.x, l.y, l.r).fill(clumpGradient());
  g.circle(c.x, c.y, r * 0.86).fill(color);
  if (lod >= 2) {
    const m = big ? 10 : 5;
    for (let i = 0; i < m; i++) {
      const a = rnd() * Math.PI * 2;
      const d = r * (0.12 + rnd() * 0.48);
      g.circle(c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, r * (0.2 + rnd() * 0.12)).fill(clumpGradient());
    }
  }
  g.circle(c.x, c.y, r).fill(canopyGradient());
  // Stamm und Achsenkreuz (Planzeichen)
  const k = 0.18;
  g.circle(c.x, c.y, 0.13).fill(0x3b3226);
  g.moveTo(c.x - k - 0.15, c.y).lineTo(c.x - k, c.y).moveTo(c.x + k, c.y).lineTo(c.x + k + 0.15, c.y);
  g.moveTo(c.x, c.y - k - 0.15).lineTo(c.x, c.y - k).moveTo(c.x, c.y + k).lineTo(c.x, c.y + k + 0.15);
  g.stroke({ color: 0x28201a, alpha: 0.6, width: 0.035 });
}

/** Strauch: sechs Büschel im Kreis plus Mitte */
export function drawShrub(g: Graphics, c: Vec2, diameter: number, sp: PlantSpecies, seed: number): void {
  const r = diameter / 2;
  const color = hex(sp.colors.summer);
  const rnd = rng(seed);
  const parts: [number, number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rnd() * 0.5;
    parts.push([c.x + Math.cos(a) * r * 0.5, c.y + Math.sin(a) * r * 0.5, r * (0.46 + rnd() * 0.08)]);
  }
  parts.push([c.x, c.y, r * 0.55]);
  for (const [x, y, pr] of parts) g.circle(x, y, pr).fill(color).stroke({ color: 0x1c2616, alpha: 0.3, width: 0.03 });
  for (const [x, y, pr] of parts) g.circle(x, y, pr).fill(clumpGradient());
}

/** Kleine Einzelpflanze (Staude, Gemüse): Punkt mit Mittelfleck */
export function drawSmallPlant(g: Graphics, c: Vec2, diameter: number, sp: PlantSpecies): void {
  const r = diameter / 2;
  g.circle(c.x, c.y, r).fill(hex(sp.colors.summer)).stroke({ color: 0x1e1e14, alpha: 0.28, width: 0.02 });
  g.circle(c.x, c.y, r * 0.32).fill({ color: 0x1e1914, alpha: 0.3 });
}

/**
 * Staudenpflanzung: Gruppen (Drifts) je Art, deterministisch über die Fläche gestreut.
 * Dichte wie geplant, Gräser mit gestricheltem Rand.
 */
export function drawPlanting(
  g: Graphics,
  region: FlatRegion,
  mix: { sp: PlantSpecies; share: number }[],
  perSquareMeter: number,
  seed: number,
): void {
  const rnd = rng(seed);
  const b = bbox(region.outer);
  const inside = (p: Vec2) => pointInRegion(p, region.outer, region.holes);
  // Driftzentren in einem groben Raster, Art je Zentrum nach Anteil
  const cell = 1.6;
  const centers: { p: Vec2; sp: PlantSpecies }[] = [];
  for (let y = b.minY + cell / 2; y < b.maxY; y += cell)
    for (let x = b.minX + cell / 2; x < b.maxX; x += cell) {
      const p = { x: x + (rnd() - 0.5) * cell * 0.8, y: y + (rnd() - 0.5) * cell * 0.8 };
      if (!inside(p)) continue;
      let t = rnd();
      const pick = mix.find((m) => (t -= m.share) <= 0) ?? mix[mix.length - 1];
      centers.push({ p, sp: pick.sp });
    }
  const perDrift = Math.max(1, Math.round(perSquareMeter * cell * cell));
  const dotsList: { x: number; y: number; r: number; sp: PlantSpecies }[] = [];
  for (const c of centers) {
    for (let i = 0; i < perDrift; i++) {
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * cell * 0.6;
      const p = { x: c.p.x + Math.cos(a) * d, y: c.p.y + Math.sin(a) * d };
      if (!inside(p)) continue;
      const grass = c.sp.kind === 'grass';
      dotsList.push({ ...p, r: grass ? 0.32 : 0.22 + rnd() * 0.07, sp: c.sp });
    }
  }
  for (const d of dotsList) {
    const grass = d.sp.kind === 'grass';
    g.circle(d.x, d.y, d.r).fill(hex(d.sp.colors.summer)).stroke(
      grass ? { color: hex(d.sp.colors.summer), width: 0.065 } : { color: 0x1e1e14, alpha: 0.28, width: 0.065 },
    );
  }
  for (const d of dotsList) {
    const grass = d.sp.kind === 'grass';
    g.circle(d.x, d.y, d.r * 0.32).fill(grass ? { color: 0xfffae6, alpha: 0.35 } : { color: 0x1e1914, alpha: 0.32 });
  }
}

/** Hecke: Band entlang der Kontur mit runden „Buckeln“ und Lichtkante */
export function drawHedge(g: Graphics, outline: FlatRegion[], centerline: Polygon, width: number, sp: PlantSpecies): void {
  const color = hex(sp.colors.summer);
  for (const r of outline) {
    g.poly(r.outer.flatMap((p) => [p.x, p.y]), true).fill(color);
    for (const h of r.holes) g.poly(h.flatMap((p) => [p.x, p.y]), true).cut();
  }
  // Buckel entlang der Mittellinie
  const step = width * 0.62;
  const bump = width * 0.58;
  const pts: Vec2[] = [];
  for (let i = 1; i < centerline.length; i++) {
    const a = centerline[i - 1];
    const b = centerline[i];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    for (let t = 0; t < L; t += step) pts.push({ x: a.x + ((b.x - a.x) * t) / L, y: a.y + ((b.y - a.y) * t) / L });
  }
  for (const p of pts) g.circle(p.x, p.y, bump).fill(color);
  for (const p of pts) g.circle(p.x + bump * 0.12, p.y + bump * 0.12, bump).fill({ color: 0x121e0c, alpha: 0.08 });
  for (const p of pts) g.circle(p.x - bump * 0.2, p.y - bump * 0.2, bump * 0.36).fill({ color: 0xfffce1, alpha: 0.2 });
}
