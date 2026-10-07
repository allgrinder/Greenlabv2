/**
 * Auswertung für die Linse „Wachstum“ (Screen 07): Entwicklung je Gehölz und
 * Hinweise, wann Kronen an Wege, Bauten oder die Grundstücksgrenze heranwachsen.
 */
import { getItem } from './catalog/items';
import { getSpecies } from './catalog/plants';
import { diameterAt, diameterToday, hedgeWidthAt, inBloom, isBare, type Season } from './growth';
import { footprint } from './geometry/objects';
import { distanceToPolyline, pointInPolygon, type Polygon } from './geometry/polygon';
import type { PlanObject, PlantSpecies, Project } from './model/types';

type Plant = Extract<PlanObject, { type: 'plant' }>;
type Hedge = Extract<PlanObject, { type: 'hedge' }>;

export interface GrowthRow {
  name: string;
  /** „Ø“ für Kronen, „b“ für Heckenbreite */
  prefix: 'Ø' | 'b';
  value: number;
  max: number;
  note: string;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function growthRows(doc: Project, years: number, nowYear = new Date().getFullYear()): GrowthRow[] {
  const objs = Object.values(doc.objects).filter((o) => !o.hidden);
  const plants = objs.filter((o): o is Plant => o.type === 'plant');
  const trees = plants.filter((p) => getSpecies(p.speciesId).kind === 'tree').sort((a, b) => getSpecies(b.speciesId).diameterMature - getSpecies(a.speciesId).diameterMature);
  const rows: GrowthRow[] = trees.slice(0, 4).map((p) => {
    const sp = getSpecies(p.speciesId);
    const d0 = diameterToday(p, nowYear);
    const existing = p.plantedDiameter !== null || p.plantedYear < nowYear;
    return {
      name: p.name ?? sp.name,
      prefix: 'Ø',
      value: diameterAt(p, years, nowYear),
      max: Math.max(d0, sp.diameterMature),
      note: `${existing ? 'heute' : 'Pflanzung'} Ø ${fmt(d0)}`,
    };
  });
  const hedges = objs.filter((o): o is Hedge => o.type === 'hedge');
  if (hedges.length) {
    const sp = getSpecies(hedges[0].speciesId);
    rows.push({
      name: hedges.length === 1 ? (hedges[0].name ?? `${sp.name}hecke`) : `Hecken (${hedges.length})`,
      prefix: 'b',
      value: avg(hedges.map((h) => hedgeWidthAt(h, years, nowYear))),
      max: avg(hedges.map((h) => getSpecies(h.speciesId).diameterMature)),
      note: `Schnitt auf ${fmt(avg(hedges.map((h) => h.height)))} Höhe`,
    });
  }
  const shrubs = plants.filter((p) => getSpecies(p.speciesId).kind === 'shrub');
  if (shrubs.length) {
    const names = [...new Set(shrubs.map((p) => getSpecies(p.speciesId).name))];
    rows.push({
      name: `Sträucher (${shrubs.length})`,
      prefix: 'Ø',
      value: avg(shrubs.map((p) => diameterAt(p, years, nowYear))),
      max: avg(shrubs.map((p) => Math.max(diameterToday(p, nowYear), getSpecies(p.speciesId).diameterMature))),
      note: names.slice(0, 2).join(', ') + (names.length > 2 ? ' …' : ''),
    });
  }
  return rows;
}

const fmt = (v: number) => v.toFixed(1).replace('.', ',') + ' m';

export interface GrowthConflict {
  plantId: string;
  plantName: string;
  targetName: string;
  /** Jahre ab heute, ab denen der Abstand unterschritten wird */
  years: number;
  /** Mindestabstand Kronenrand → Ziel, m */
  clearance: number;
  advice: string;
}

interface Target {
  name: string;
  outlines: Polygon[];
  clearance: number;
  advice: string;
}

function targetsOf(doc: Project, self: Plant): Target[] {
  const out: Target[] = [];
  for (const o of Object.values(doc.objects)) {
    if (o.hidden || o.id === self.id) continue;
    if (o.type === 'path')
      out.push({
        name: o.name ?? 'Weg',
        outlines: footprint(o).map((r) => r.outer),
        clearance: 1.5,
        advice: 'Einen Kronenschnitt einplanen.',
      });
    else if (o.type === 'item') {
      const it = getItem(o.catalogId);
      if (it.category === 'building' || it.category === 'greenhouse' || it.category === 'shed')
        out.push({
          name: o.name ?? it.name,
          outlines: footprint(o).map((r) => r.outer),
          clearance: 1,
          advice: 'Abstand zum Bau prüfen oder Krone zurücknehmen.',
        });
    }
  }
  return out;
}

const insideAny = (p: { x: number; y: number }, polys: Polygon[]) => polys.some((q) => pointInPolygon(p, q));

/**
 * Erstes Jahr (0–maxYears), in dem eine Baumkrone einem Weg, Bau oder der Grenze zu nahe kommt.
 * Bestehende Konflikte im Jahr 0 werden nicht gemeldet – sie sind schon heute sichtbar.
 */
export function growthConflicts(doc: Project, maxYears = 20, nowYear = new Date().getFullYear()): GrowthConflict[] {
  const res: GrowthConflict[] = [];
  const boundary = doc.site.boundary;
  for (const o of Object.values(doc.objects)) {
    if (o.type !== 'plant' || o.hidden) continue;
    const sp = getSpecies(o.speciesId);
    if (sp.kind !== 'tree') continue;
    const name = o.name ?? sp.name;
    const targets = targetsOf(doc, o);
    const gap = (y: number) => diameterAt(o, y, nowYear) / 2;
    const dist = (t: Target) => (insideAny(o.position, t.outlines) ? 0 : Math.min(...t.outlines.map((q) => distanceToPolyline(o.position, q, true))));
    let best: GrowthConflict | null = null;
    for (const t of targets) {
      const d = dist(t);
      if (d - gap(0) < t.clearance) continue;
      for (let y = 1; y <= maxYears; y++)
        if (d - gap(y) < t.clearance) {
          if (!best || y < best.years)
            best = {
              plantId: o.id,
              plantName: name,
              targetName: t.name,
              years: y,
              clearance: t.clearance,
              advice: t.advice,
            };
          break;
        }
    }
    const db = distanceToPolyline(o.position, boundary, true);
    if (db - gap(0) >= 0)
      for (let y = 1; y <= maxYears; y++)
        if (db - gap(y) < 0) {
          if (!best || y < best.years)
            best = {
              plantId: o.id,
              plantName: name,
              targetName: 'die Grundstücksgrenze',
              years: y,
              clearance: 0,
              advice: 'Überhang zum Nachbarn: Schnitt oder Abstand nach Nachbarrecht prüfen.',
            };
          break;
        }
    if (best) res.push(best);
  }
  return res.sort((a, b) => a.years - b.years);
}

export function conflictText(c: GrowthConflict): string {
  const reach = c.clearance > 0 ? `bis ${c.clearance.toFixed(1).replace('.', ',')} m an ${dativ(c.targetName)}` : `über ${c.targetName}`;
  return `Ab etwa ${c.years} ${c.years === 1 ? 'Jahr' : 'Jahren'} reicht die Krone ${genitiv(c.plantName)} ${reach}. ${c.advice}`;
}

const dativ = (n: string) => (/weg$/i.test(n) ? `den ${n}` : `„${n}“`);
const genitiv = (n: string) => `von ${n}`;

/** Kurzbeschreibung einer Jahreszeit aus den Pflanzen im Plan (Screen 08) */
export function seasonNote(doc: Project, season: Season): string {
  const species = new Map<string, PlantSpecies>();
  for (const o of Object.values(doc.objects)) {
    if (o.hidden) continue;
    if (o.type === 'plant' || o.type === 'hedge') species.set(o.speciesId, getSpecies(o.speciesId));
    if (o.type === 'planting') o.mix.forEach((m) => species.set(m.speciesId, getSpecies(m.speciesId)));
  }
  const all = [...species.values()];
  if (!all.length) return 'Noch keine Pflanzen im Plan.';
  const list = (xs: PlantSpecies[], n = 3) => {
    const names = xs.slice(0, n).map((x) => x.name);
    return names.length > 1 ? `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}` : (names[0] ?? '');
  };
  const bloom = all.filter((sp) => inBloom(sp, season));
  const woody = all.filter((sp) => sp.kind === 'tree' || sp.kind === 'shrub');
  switch (season) {
    case 'spring':
      return bloom.length ? `${list(bloom)} ${bloom.length > 1 ? 'blühen' : 'blüht'}. Junges Laub ist hellgrün.` : 'Austrieb: junges Laub ist hellgrün, der Rasen kommt in Schwung.';
    case 'summer':
      return bloom.length ? `Volles Laub, ${list(bloom)} ${bloom.length > 1 ? 'blühen' : 'blüht'}.` : 'Volles Laub, die Gehölze werfen den meisten Schatten.';
    case 'autumn': {
      const colour = woody.filter((sp) => sp.deciduous && sp.colors.autumn);
      return colour.length ? `Herbstfärbung: ${list(colour)}. Laub liegt auf dem Rasen.` : 'Gräser stehen in Ähren, die Stauden ziehen ein.';
    }
    case 'winter': {
      const bare = woody.filter((sp) => isBare(sp, 'winter'));
      const keep = all.filter((sp) => !sp.deciduous && (sp.kind === 'tree' || sp.kind === 'shrub' || sp.kind === 'hedge'));
      const hedges = all.filter((sp) => sp.kind === 'hedge' && sp.deciduous);
      const parts = [bare.length ? `${list(bare, 2)} ${bare.length > 1 ? 'sind' : 'ist'} kahl.` : ''];
      if (hedges.length) parts.push(`Die ${hedges[0].name} hält ihr trockenes Laub.`);
      if (keep.length) parts.push(`Immergrün: ${list(keep, 2)}.`);
      return parts.filter(Boolean).join(' ') || 'Winterruhe: die Struktur zeigen Gehölze und Gräser.';
    }
  }
}
