/** Zahlenformate wie im Design: „41,5 m²“, „1.246 €“, „30,00 m“, „±0,00 m“ */

const nf = (min: number, max = min) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: min, maximumFractionDigits: max });
const NF = [nf(0), nf(1), nf(2)];

export const num = (v: number, digits: 0 | 1 | 2 = 1): string => NF[digits].format(v).replace('-', '−');

export const meters = (v: number, digits: 0 | 1 | 2 = 2): string => `${num(v, digits)} m`;
export const squareMeters = (v: number, digits: 0 | 1 | 2 = 1): string => `${num(v, digits)} m²`;
export const cubicMeters = (v: number): string => `${num(v, 1)} m³`;
export const euros = (v: number, digits: 0 | 2 = 0): string => `${num(v, digits)} €`;
export const degrees = (v: number): string => `${num(v, 0)}°`;

export function elevation(v: number): string {
  if (Math.abs(v) < 0.005) return '±0,00 m';
  return `${v > 0 ? '+' : ''}${meters(v)}`;
}

/** Eingabe „1,20“ / „1.20“ / „1 200“ → Zahl, sonst null */
export function parseNumber(s: string): number | null {
  const t = s.trim().replace(/\s/g, '').replace(/m$/, '');
  if (!t) return null;
  // „1.234,5“ → 1234.5; „1,5“ → 1.5; „1.5“ → 1.5
  const norm = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const v = Number(norm.replace('−', '-'));
  return Number.isFinite(v) ? v : null;
}

export function unitLabel(u: 'm2' | 'm3' | 'm' | 'pcs'): string {
  return { m2: 'm²', m3: 'm³', m: 'm', pcs: 'Stk' }[u];
}
