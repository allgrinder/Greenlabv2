/**
 * Blattaufteilung für den Architektenplan (Screen 11): Papierformate, passende Maßstäbe,
 * Legende und Pflanzenliste. Reine Rechenlogik in Millimetern – das Zeichnen übernimmt ui/export/pdf.
 */
import { getItem } from '../catalog/items';
import { getLamp } from '../catalog/lamps';
import { getMaterial } from '../catalog/materials';
import { getSpecies } from '../catalog/plants';
import { projectSummary } from '../quantities/quantities';
import type { BBox } from '../geometry/polygon';
import type { PlanObject, Project } from '../model/types';

export type PaperId = 'A4' | 'A3' | 'A2' | 'A1';

/** Querformat, mm */
export const PAPERS: Record<PaperId, { w: number; h: number }> = {
  A4: { w: 297, h: 210 },
  A3: { w: 420, h: 297 },
  A2: { w: 594, h: 420 },
  A1: { w: 841, h: 594 },
};

export const SCALES = [50, 100, 200, 250, 500, 1000];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SheetLayout {
  page: { w: number; h: number };
  frame: Rect;
  /** Planfeld links */
  plan: Rect;
  /** Spalte rechts: Nordpfeil, Legende, Titelblock */
  side: Rect;
}

export function sheetLayout(paper: PaperId): SheetLayout {
  const page = PAPERS[paper];
  const k = page.w / 420; // Maße skalieren mit dem Format, A3 = 1
  const m = Math.max(8, 10 * k);
  const sideW = Math.max(62, 78 * k);
  const frame = { x: m, y: m, w: page.w - 2 * m, h: page.h - 2 * m };
  const pad = 6 * Math.max(0.8, k);
  return {
    page,
    frame,
    plan: {
      x: frame.x + pad,
      y: frame.y + pad + 8 * Math.max(0.8, k),
      w: frame.w - sideW - 2 * pad,
      h: frame.h - 2 * pad - 8 * Math.max(0.8, k),
    },
    side: { x: frame.x + frame.w - sideW, y: frame.y, w: sideW, h: frame.h },
  };
}

/** Planausschnitt (m) passt im Maßstab 1:scale ins Planfeld? */
export const fits = (b: BBox, plan: Rect, scale: number) => ((b.maxX - b.minX) * 1000) / scale <= plan.w && ((b.maxY - b.minY) * 1000) / scale <= plan.h;

/** Kleinster Normmaßstab, bei dem der Plan aufs Blatt passt */
export function bestScale(b: BBox, paper: PaperId): number {
  const { plan } = sheetLayout(paper);
  return SCALES.find((s) => fits(b, plan, s)) ?? SCALES[SCALES.length - 1];
}

/** Maßstabsleiste: runde Länge in m, etwa ein Fünftel des Planfelds */
export function scaleBarMeters(scale: number, planW: number): number {
  const target = ((planW / 5) * scale) / 1000;
  return [1, 2, 5, 10, 20, 50, 100].reduce((best, v) => (v <= target ? v : best), 1);
}

export interface LegendEntry {
  label: string;
  kind: 'fill' | 'circle' | 'line' | 'dash' | 'glow';
  color: string;
}

const type = (o: PlanObject) => o.type;

/** Legende aus dem, was im Plan wirklich vorkommt (Reihenfolge wie im Design) */
export function legendEntries(doc: Project, night: boolean): LegendEntry[] {
  const objs = Object.values(doc.objects).filter((o) => !o.hidden && doc.layers[o.layerId]?.visible !== false);
  const out: LegendEntry[] = [];
  const mats = new Map<string, number>();
  for (const o of objs) if (o.type === 'area' || o.type === 'path') mats.set(o.materialId, (mats.get(o.materialId) ?? 0) + 1);
  for (const id of mats.keys()) {
    const m = getMaterial(id);
    out.push({ label: m.name.split(',')[0], kind: 'fill', color: m.baseColor });
  }
  const plantings = objs.filter((o) => o.type === 'planting');
  if (plantings.length) out.push({ label: 'Stauden & Gräser', kind: 'fill', color: '#9A86C2' });
  const trees = objs.filter((o) => o.type === 'plant' && getSpecies(o.speciesId).kind === 'tree');
  if (trees.length) out.push({ label: 'Baum', kind: 'circle', color: '#7E9A5C' });
  const shrubs = objs.filter((o) => o.type === 'plant' && getSpecies(o.speciesId).kind !== 'tree');
  if (shrubs.length) out.push({ label: 'Strauch, Gemüse', kind: 'circle', color: '#6B8460' });
  const hedges = objs.filter((o) => o.type === 'hedge');
  if (hedges.length)
    out.push({
      label: `Hecke, ${getSpecies((hedges[0] as Extract<PlanObject, { type: 'hedge' }>).speciesId).name}`,
      kind: 'line',
      color: '#5B7350',
    });
  const items = new Set(objs.filter((o) => o.type === 'item').map((o) => getItem((o as Extract<PlanObject, { type: 'item' }>).catalogId).category));
  if (items.has('raisedBed')) out.push({ label: 'Hochbeet', kind: 'fill', color: '#A27C56' });
  if (items.has('building') || items.has('shed') || items.has('greenhouse')) out.push({ label: 'Gebäude', kind: 'fill', color: '#D9D3C7' });
  if (night && objs.some((o) => type(o) === 'lamp')) out.push({ label: 'Leuchte', kind: 'glow', color: '#F2C77E' });
  out.push({ label: 'Grundstücksgrenze', kind: 'dash', color: '#2D3033' });
  return out;
}

export interface PlantListRow {
  name: string;
  latin: string;
  count: number;
  note: string;
}

const KIND_NOTE: Record<string, string> = {
  tree: 'Baum',
  shrub: 'Strauch',
  perennial: 'Staude',
  grass: 'Gras',
  vegetable: 'Gemüse',
  hedge: 'Heckenpflanze',
};

/** Pflanzenliste für Blatt 2: Stückzahlen wie in der Kostenübersicht */
export function plantList(doc: Project): PlantListRow[] {
  return projectSummary(doc)
    .lines.filter((l) => l.key.startsWith('plant:'))
    .map((l) => {
      const sp = getSpecies(l.key.slice(6));
      return {
        name: sp.name,
        latin: sp.latin,
        count: Math.ceil(l.quantity - 1e-6),
        note: KIND_NOTE[sp.kind] ?? '',
      };
    })
    .sort((a, b) => a.note.localeCompare(b.note, 'de') || a.name.localeCompare(b.name, 'de'));
}

export const lampName = (t: Parameters<typeof getLamp>[0]) => getLamp(t).name;
