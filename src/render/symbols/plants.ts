/**
 * Vereinfachte Staudenpflanzung für die kleinste Zoomstufe (Kreise statt Sprites).
 * Die fotorealistischen Pflanzen liegen in plantSprites.ts / foliage.ts.
 */
import type { Graphics } from 'pixi.js';
import type { PlantSpecies, Vec2 } from '../../core/model/types';
import { pointInRegion, bbox } from '../../core/geometry/polygon';
import type { FlatRegion } from '../../core/geometry/shape';
import { hex, rng } from '../util/rng';

/**
 * Staudenpflanzung: Gruppen (Drifts) je Art, deterministisch über die Fläche gestreut.
 * Dichte wie geplant, Gräser mit gestricheltem Rand.
 */
export function drawPlanting(
  g: Graphics,
  region: FlatRegion,
  mix: { sp: PlantSpecies; share: number; color?: string }[],
  perSquareMeter: number,
  seed: number,
  scale = 1,
): void {
  const rnd = rng(seed);
  const b = bbox(region.outer);
  const inside = (p: Vec2) => pointInRegion(p, region.outer, region.holes);
  // Driftzentren in einem groben Raster, Art je Zentrum nach Anteil
  const cell = 1.6;
  const centers: { p: Vec2; sp: PlantSpecies; color: string }[] = [];
  for (let y = b.minY + cell / 2; y < b.maxY; y += cell)
    for (let x = b.minX + cell / 2; x < b.maxX; x += cell) {
      const p = { x: x + (rnd() - 0.5) * cell * 0.8, y: y + (rnd() - 0.5) * cell * 0.8 };
      if (!inside(p)) continue;
      let t = rnd();
      const pick = mix.find((m) => (t -= m.share) <= 0) ?? mix[mix.length - 1];
      centers.push({ p, sp: pick.sp, color: pick.color ?? pick.sp.colors.summer });
    }
  const perDrift = Math.max(1, Math.round(perSquareMeter * cell * cell));
  const dotsList: { x: number; y: number; r: number; sp: PlantSpecies; color: string }[] = [];
  for (const c of centers) {
    for (let i = 0; i < perDrift; i++) {
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * cell * 0.6;
      const p = { x: c.p.x + Math.cos(a) * d, y: c.p.y + Math.sin(a) * d };
      if (!inside(p)) continue;
      const grass = c.sp.kind === 'grass';
      dotsList.push({ ...p, r: (grass ? 0.32 : 0.22 + rnd() * 0.07) * scale, sp: c.sp, color: c.color });
    }
  }
  for (const d of dotsList) {
    const grass = d.sp.kind === 'grass';
    g.circle(d.x, d.y, d.r).fill(hex(d.color)).stroke(
      grass ? { color: hex(d.color), width: 0.065 } : { color: 0x1e1e14, alpha: 0.28, width: 0.065 },
    );
  }
  for (const d of dotsList) {
    const grass = d.sp.kind === 'grass';
    g.circle(d.x, d.y, d.r * 0.32).fill(grass ? { color: 0xfffae6, alpha: 0.35 } : { color: 0x1e1914, alpha: 0.32 });
  }
}
