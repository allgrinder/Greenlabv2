/**
 * Material- und Kostenübersicht (Design-Screen 10): Positionen nach Bereich gruppiert,
 * Kennzahlen (m² Rasen, m³ Kies, Pflastersteine, Kantenstein, Pflanzen) und CSV-Export.
 */
import { getItem } from '../catalog/items';
import { getMaterial } from '../catalog/materials';
import { num, unitLabel } from '../format';
import type { Project } from '../model/types';
import { projectSummary, type CostLine } from './quantities';

export type CostGroupKey = 'areas' | 'plants' | 'build' | 'tech';

export const GROUP_NAMES: Record<CostGroupKey, string> = {
  areas: 'Flächen & Wege',
  plants: 'Pflanzen',
  build: 'Bauten & Wasser',
  tech: 'Licht & Bewässerung',
};

export const GROUP_COLORS: Record<CostGroupKey, string> = { areas: '#C9BBA3', plants: '#7E9A5C', build: '#B9724F', tech: '#3F4A5A' };

export function groupOf(key: string): CostGroupKey {
  const [kind, id] = key.split(':');
  if (kind === 'plant') return 'plants';
  if (kind === 'lamp' || kind === 'irr') return 'tech';
  if (kind === 'mat') return getMaterial(id).texture === 'water' ? 'build' : 'areas';
  if (kind === 'item') return getItem(id).category === 'edging' ? 'areas' : 'build';
  return 'build';
}

export interface CostGroup {
  key: CostGroupKey;
  name: string;
  lines: CostLine[];
  total: number;
}

export interface CostReport {
  groups: CostGroup[];
  net: number;
  vatRate: number;
  gross: number;
  figures: { label: string; value: string }[];
}

export const VAT_RATE = 0.19;

export function costReport(doc: Project): CostReport {
  const { lines, total } = projectSummary(doc);
  const groups = (Object.keys(GROUP_NAMES) as CostGroupKey[])
    .map((key) => {
      const ls = lines.filter((l) => groupOf(l.key) === key).sort((a, b) => b.total - a.total);
      return { key, name: GROUP_NAMES[key], lines: ls, total: ls.reduce((s, l) => s + l.total, 0) };
    })
    .filter((g) => g.lines.length);
  const q = (key: string) => lines.find((l) => l.key === key)?.quantity ?? 0;
  const plantCount = lines.filter((l) => l.key.startsWith('plant:')).reduce((s, l) => s + l.quantity, 0);
  const edging = lines.filter((l) => l.key.startsWith('item:edge')).reduce((s, l) => s + l.quantity, 0);
  const figures = [
    { label: 'Rasen', value: `${num(q('mat:lawn'), 0)} m²` },
    { label: 'Kies', value: `${num(q('mat:gravel'), 1)} m³` },
    { label: 'Pflastersteine', value: `${num(q('mat:paving'), 0)} Stk` },
    { label: 'Kantenstein', value: `${num(edging, 0)} m` },
    { label: 'Pflanzen', value: `${num(plantCount, 0)} Stk` },
  ];
  return { groups, net: total, vatRate: VAT_RATE, gross: total * (1 + VAT_RATE), figures };
}

const csvCell = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const de = (v: number, d = 2) => v.toFixed(d).replace('.', ',');

/**
 * CSV für Tabellenkalkulationen (deutsches Format: Semikolon, Dezimalkomma, UTF-8 mit BOM).
 */
export function costCsv(doc: Project, report = costReport(doc)): string {
  const rows: string[][] = [['Bereich', 'Position', 'Menge', 'Einheit', 'Einzelpreis netto (EUR)', 'Summe netto (EUR)']];
  for (const g of report.groups)
    for (const l of g.lines) rows.push([g.name, l.label, de(l.quantity, l.unit === 'pcs' ? 0 : 2), unitLabel(l.unit), de(l.unitPrice), de(l.total)]);
  rows.push(['', 'Summe netto', '', '', '', de(report.net)]);
  rows.push(['', `MwSt. ${Math.round(report.vatRate * 100)} %`, '', '', '', de(report.gross - report.net)]);
  rows.push(['', 'Summe brutto', '', '', '', de(report.gross)]);
  return '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
}
