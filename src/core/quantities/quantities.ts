/**
 * Mengen und Kosten, abgeleitet aus der Geometrie. Nichts davon wird gespeichert.
 */
import { getItem } from '../catalog/items';
import { getMaterial } from '../catalog/materials';
import { getSpecies } from '../catalog/plants';
import { footprint, itemSize } from '../geometry/objects';
import { areaWithHoles, perimeter } from '../geometry/polygon';
import { pathLength } from '../geometry/shape';
import type { Edging, MaterialId, PlanObject, Project, QuantityUnit } from '../model/types';

export interface CostLine {
  /** Katalog-Schlüssel: `mat:<id>`, `plant:<id>`, `item:<id>` – auch Schlüssel für priceOverrides */
  key: string;
  label: string;
  quantity: number;
  unit: QuantityUnit;
  unitPrice: number;
  total: number;
}

export interface ObjectQuantities {
  /** m² */
  area: number | null;
  /** m, Umfang der Grundfläche inkl. Löcher */
  perimeter: number | null;
  /** m, Länge der Mittellinie (Wege, Hecken) */
  length: number | null;
  /** m, Kantenstein */
  edgingLength: number | null;
  lines: CostLine[];
  total: number;
}

type Prices = Record<string, number>;

const price = (prices: Prices, key: string, fallback: number): number => prices[key] ?? fallback;

function line(prices: Prices, key: string, label: string, quantity: number, unit: QuantityUnit, catalogPrice: number): CostLine {
  const unitPrice = price(prices, key, catalogPrice);
  return { key, label, quantity, unit, unitPrice, total: quantity * unitPrice };
}

/** Materialmenge in der Abrechnungseinheit des Materials */
export function materialQuantity(materialId: MaterialId, areaM2: number): { quantity: number; unit: QuantityUnit } {
  const m = getMaterial(materialId);
  switch (m.unit) {
    case 'm3':
      return { quantity: areaM2 * (m.depthM ?? 0), unit: 'm3' };
    case 'pcs': {
      const s = m.unitSizeM;
      // Auf ganze Steine aufrunden; Toleranz gegen Fließkomma-Rauschen (70 m² / 0,32 m² = 218,75 → 219)
      return { quantity: s ? Math.ceil(areaM2 / (s.w * s.d) - 1e-9) : 0, unit: 'pcs' };
    }
    default:
      return { quantity: areaM2, unit: m.unit };
  }
}

function materialLine(prices: Prices, materialId: MaterialId, areaM2: number): CostLine {
  const m = getMaterial(materialId);
  const q = materialQuantity(materialId, areaM2);
  return line(prices, `mat:${m.id}`, m.name, q.quantity, q.unit, m.price);
}

function edgingLine(prices: Prices, e: Edging, length: number): CostLine {
  const it = getItem(e.catalogId);
  return line(prices, `item:${it.id}`, it.name, length, 'm', it.price);
}

/** Kantenlänge für einen Weg mit Mittellinie L */
export function pathEdgingLength(sides: Edging['sides'], centerlineLength: number, outlinePerimeter: number): number {
  switch (sides) {
    case 'both':
      return 2 * centerlineLength;
    case 'left':
    case 'right':
      return centerlineLength;
    case 'outline':
      return outlinePerimeter;
  }
}

const EMPTY: ObjectQuantities = { area: null, perimeter: null, length: null, edgingLength: null, lines: [], total: 0 };

export function objectQuantities(o: PlanObject, prices: Prices = {}): ObjectQuantities {
  const fp = footprint(o);
  const A = fp.reduce((s, r) => s + areaWithHoles(r.outer, r.holes), 0);
  const P = fp.reduce((s, r) => s + perimeter(r.outer) + r.holes.reduce((h, x) => h + perimeter(x), 0), 0);
  const lines: CostLine[] = [];
  let length: number | null = null;
  let edgingLength: number | null = null;

  switch (o.type) {
    case 'area':
      lines.push(materialLine(prices, o.materialId, A));
      if (o.edging) {
        edgingLength = P;
        lines.push(edgingLine(prices, o.edging, P));
      }
      break;
    case 'path':
      length = pathLength(o.centerline);
      lines.push(materialLine(prices, o.materialId, A));
      if (o.edging) {
        edgingLength = pathEdgingLength(o.edging.sides, length, P);
        lines.push(edgingLine(prices, o.edging, edgingLength));
      }
      break;
    case 'planting': {
      const total = Math.round(A * o.perSquareMeter);
      let rest = total;
      o.mix.forEach((m, i) => {
        const sp = getSpecies(m.speciesId);
        const n = i === o.mix.length - 1 ? rest : Math.round(total * m.share);
        rest -= n;
        lines.push(line(prices, `plant:${sp.id}`, sp.name, n, 'pcs', sp.price));
      });
      if (o.mulchMaterialId) lines.push(materialLine(prices, o.mulchMaterialId, A));
      break;
    }
    case 'hedge': {
      length = pathLength(o.centerline);
      const sp = getSpecies(o.speciesId);
      lines.push(line(prices, `plant:${sp.id}`, sp.name, Math.ceil(length * o.plantsPerMeter - 1e-9), 'pcs', sp.price));
      break;
    }
    case 'plant': {
      const sp = getSpecies(o.speciesId);
      lines.push(line(prices, `plant:${sp.id}`, sp.name, 1, 'pcs', sp.price));
      return { ...EMPTY, lines, total: lines[0].total };
    }
    case 'item': {
      const it = getItem(o.catalogId);
      const q = it.unit === 'm' ? itemSize(o).width : 1;
      lines.push(line(prices, `item:${it.id}`, it.name, q, it.unit, it.price));
      break;
    }
    case 'lamp':
    case 'dimension':
    case 'text':
      return EMPTY;
  }
  return {
    area: fp.length ? A : null,
    perimeter: fp.length ? P : null,
    length,
    edgingLength,
    lines,
    total: lines.reduce((s, l) => s + l.total, 0),
  };
}

/** Projektweite Zusammenfassung: gleiche Positionen werden addiert */
export function projectSummary(p: Project): { lines: CostLine[]; total: number } {
  const byKey = new Map<string, CostLine>();
  for (const id of p.layerOrder.flatMap((l) => p.layers[l].objectOrder)) {
    const o = p.objects[id];
    if (!o) continue;
    for (const l of objectQuantities(o, p.priceOverrides).lines) {
      const prev = byKey.get(l.key);
      if (prev) {
        prev.quantity += l.quantity;
        prev.total += l.total;
      } else byKey.set(l.key, { ...l });
    }
  }
  const lines = [...byKey.values()];
  return { lines, total: lines.reduce((s, l) => s + l.total, 0) };
}
