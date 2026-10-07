import type { LampType } from '../model/types';

export interface LampSpec {
  type: LampType;
  name: string;
  short: string;
  lumen: number;
  kelvin: number;
  /** Abstrahlwinkel in Grad, 360 = rundum */
  beamDeg: number;
  /** Lichtpunkthöhe in m (für Reichweite und Verdeckung) */
  heightM: number;
  /** gerichtet (Spot, Baumstrahler, Wand) */
  directional: boolean;
  price: number;
}

/** Leuchtentypen aus dem Design (Screen 03/05), Werte als Vorgaben */
export const LAMPS: LampSpec[] = [
  { type: 'bollard', name: 'Pollerleuchte', short: 'Poller', lumen: 300, kelvin: 2700, beamDeg: 360, heightM: 0.6, directional: false, price: 129 },
  { type: 'spot', name: 'Spot / Strahler', short: 'Spot', lumen: 600, kelvin: 3000, beamDeg: 36, heightM: 0.3, directional: true, price: 89 },
  { type: 'pathLight', name: 'Wegeleuchte', short: 'Weg', lumen: 120, kelvin: 2200, beamDeg: 360, heightM: 0.15, directional: false, price: 59 },
  { type: 'stringLights', name: 'Lichterkette', short: 'Lichterkette', lumen: 480, kelvin: 2200, beamDeg: 360, heightM: 2.4, directional: false, price: 79 },
  { type: 'wall', name: 'Wandleuchte', short: 'Wand', lumen: 400, kelvin: 2700, beamDeg: 120, heightM: 2, directional: true, price: 119 },
  { type: 'underwater', name: 'Unterwasserlicht', short: 'Unterwasser', lumen: 250, kelvin: 4000, beamDeg: 60, heightM: -0.3, directional: false, price: 99 },
  { type: 'treeUplight', name: 'Baumstrahler', short: 'Baum', lumen: 480, kelvin: 3000, beamDeg: 36, heightM: 0.2, directional: true, price: 109 },
];

const BY_TYPE = new Map(LAMPS.map((l) => [l.type, l]));
export const getLamp = (t: LampType): LampSpec => BY_TYPE.get(t)!;

/** Leistung grob aus der Lichtausbeute (≈ 74 lm/W bei LED, wie im Design) */
export const lampWatts = (lumen: number) => lumen / 74;

/**
 * Farbe einer Lichtfarbe 2200–4000 K, interpoliert über die Stützwerte aus dem Design.
 * Liefert [r, g, b] 0–255.
 */
export function kelvinRgb(k: number): [number, number, number] {
  const s: [number, [number, number, number]][] = [
    [2200, [255, 165, 79]],
    [2700, [255, 192, 126]],
    [3000, [255, 208, 156]],
    [4000, [255, 236, 214]],
  ];
  if (k <= s[0][0]) return s[0][1];
  for (let i = 0; i < s.length - 1; i++) {
    if (k <= s[i + 1][0]) {
      const t = (k - s[i][0]) / (s[i + 1][0] - s[i][0]);
      return s[i][1].map((v, j) => Math.round(v + (s[i + 1][1][j] - v) * t)) as [number, number, number];
    }
  }
  return s[s.length - 1][1];
}

export const kelvinHex = (k: number) => {
  const [r, g, b] = kelvinRgb(k);
  return (r << 16) | (g << 8) | b;
};

/**
 * Lichtreichweite in m: Radius, an dem die Beleuchtungsstärke auf ~1 lx fällt,
 * vereinfacht über E = Φ / (Ω·r²) mit Ω aus dem Abstrahlwinkel.
 */
export function lampRange(lumen: number, beamDeg: number): number {
  const half = (Math.min(beamDeg, 360) * Math.PI) / 360;
  const omega = beamDeg >= 359 ? 2 * Math.PI : 2 * Math.PI * (1 - Math.cos(half));
  return Math.min(25, Math.sqrt(lumen / omega / 1.5));
}

/** Kosten-Katalog Bewässerung (netto, Beispielwerte) */
export const IRRIGATION_PRICES = {
  sprinkler: { name: 'Versenkregner', unit: 'pcs' as const, price: 24 },
  drip: { name: 'Tropfschlauch', unit: 'm' as const, price: 1.2 },
  pipeWater: { name: 'Hauptleitung PE 32', unit: 'm' as const, price: 2.4 },
  pipePower: { name: 'Erdkabel NYY 3×1,5', unit: 'm' as const, price: 1.9 },
  tap: { name: 'Wasseranschluss', unit: 'pcs' as const, price: 85 },
  manifold: { name: 'Verteiler mit Magnetventilen', unit: 'pcs' as const, price: 240 },
};
