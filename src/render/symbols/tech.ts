/**
 * Symbole für Bewässerung und Beleuchtung (nach Screen 03 und 09).
 * Weltkoordinaten in Metern.
 */
import { Graphics } from 'pixi.js';
import { kelvinHex } from '../../core/catalog/lamps';
import { sprinklerSector } from '../../core/geometry/objects';
import type { Polygon } from '../../core/geometry/polygon';
import type { DripObject, FixtureObject, LampObject, PipeObject, SprinklerObject, Vec2 } from '../../core/model/types';
import { planDirection } from '../../core/sun/sun';

export const IRR_BLUE = 0x2f76b8;

const flat = (pts: Polygon) => pts.flatMap((p) => [p.x, p.y]);

function dashedLine(g: Graphics, pts: Vec2[], on: number, off: number) {
  let draw = true;
  let left = on;
  for (let i = 1; i < pts.length; i++) {
    let a = pts[i - 1];
    const b = pts[i];
    let L = Math.hypot(b.x - a.x, b.y - a.y);
    while (L > 1e-9) {
      const s = Math.min(left, L);
      const t = s / L;
      const c = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      if (draw) g.moveTo(a.x, a.y).lineTo(c.x, c.y);
      a = c;
      L -= s;
      left -= s;
      if (left <= 1e-9) {
        draw = !draw;
        left = draw ? on : off;
      }
    }
  }
}

/** Regner: Kopf immer, Wurfsektor nur in der Bewässerungslinse */
export function drawSprinkler(g: Graphics, o: SprinklerObject, showThrow: boolean) {
  if (showThrow) {
    const sector = sprinklerSector(o);
    g.poly(flat(sector), true).fill({ color: 0x3a84c4, alpha: 0.13 });
    const full = sector.length && sector[0] !== o.position;
    const ring = full ? [...sector, sector[0]] : sector.slice(1);
    dashedLine(g, ring, 0.3, 0.2);
    g.stroke({ color: IRR_BLUE, width: 0.05 });
    let a0 = o.arcStartDeg;
    let a1 = o.arcEndDeg;
    while (a1 <= a0) a1 += 360;
    for (const k of [0.25, 0.5, 0.75]) {
      const a = ((a0 + (a1 - a0) * k) * Math.PI) / 180;
      g.moveTo(o.position.x, o.position.y).lineTo(o.position.x + Math.cos(a) * o.radius, o.position.y + Math.sin(a) * o.radius);
    }
    g.stroke({ color: IRR_BLUE, width: 0.025, alpha: 0.5 });
  }
  g.circle(o.position.x, o.position.y, 0.16).fill(0xffffff).stroke({ color: IRR_BLUE, width: 0.07 });
  g.circle(o.position.x, o.position.y, 0.05).fill(IRR_BLUE);
}

export function drawDrip(g: Graphics, o: DripObject, line: Vec2[]) {
  g.poly(flat(line), false).stroke({ color: 0x1e2e3b, width: 0.08, join: 'round' });
  // Tropfer alle 30 cm
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    for (let t = 0.3 - acc; t < L; t += 0.3) g.circle(a.x + ((b.x - a.x) * t) / L, a.y + ((b.y - a.y) * t) / L, 0.055);
    acc = (acc + L) % 0.3;
  }
  g.fill(0x7fc0ea);
  void o;
}

export function drawPipe(g: Graphics, o: PipeObject, line: Vec2[]) {
  const color = o.kind === 'water' ? IRR_BLUE : 0xb9724f;
  g.poly(flat(line), false).stroke({ color: 0xffffff, width: 0.25, alpha: 0.7, join: 'round' });
  g.poly(flat(line), false).stroke({ color, width: 0.12, join: 'round' });
}

export function drawFixture(g: Graphics, o: FixtureObject) {
  const { x, y } = o.position;
  if (o.kind === 'manifold') {
    g.roundRect(x - 0.6, y - 0.4, 1.2, 0.8, 0.15).fill(0xffffff).stroke({ color: IRR_BLUE, width: 0.08 });
    for (let i = 0; i < Math.max(1, o.valves); i++) {
      const vx = x - 0.4 + (0.8 * i) / Math.max(1, o.valves - 1);
      g.moveTo(vx, y - 0.2).lineTo(vx, y + 0.2);
    }
    g.moveTo(x - 0.45, y).lineTo(x + 0.45, y).stroke({ color: IRR_BLUE, width: 0.05 });
  } else {
    g.roundRect(x - 0.3, y - 0.3, 0.6, 0.6, 0.1).fill(IRR_BLUE);
    g.moveTo(x - 0.15, y).lineTo(x + 0.15, y).moveTo(x, y - 0.15).lineTo(x, y + 0.15).stroke({ color: 0xffffff, width: 0.07 });
  }
}

/** Leuchte bei Tag: Planzeichen; gerichtete Leuchten mit Richtungsstrich */
export function drawLampDay(g: Graphics, o: LampObject, line: Vec2[] | null, northDeg: number) {
  if (line) {
    g.poly(flat(line), false).stroke({ color: 0x323436, alpha: 0.55, width: 0.035 });
    let acc = 0;
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1];
      const b = line[i];
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      for (let t = 0.65 - acc; t < L; t += 0.65) g.circle(a.x + ((b.x - a.x) * t) / L, a.y + ((b.y - a.y) * t) / L, 0.07);
      acc = (acc + L) % 0.65;
    }
    g.fill({ color: kelvinHex(o.kelvin) });
    return;
  }
  const { x, y } = o.position;
  if (o.beamAngleDeg < 300) {
    const d = planDirection(o.directionDeg, northDeg);
    // gestrichelter Richtungsstrich, 0,8 m
    for (let i = 0; i < 4; i++) {
      const s0 = 0.25 + i * 0.18;
      g.moveTo(x + d.x * s0, y + d.y * s0).lineTo(x + d.x * (s0 + 0.1), y + d.y * (s0 + 0.1));
    }
    g.stroke({ color: 0x2f3234, width: 0.06 });
  }
  g.circle(x, y, 0.23).fill(0xfbf8f1).stroke({ color: 0x2f3234, width: 0.05 });
  g.circle(x, y, 0.08).fill(0xc9963f);
}
