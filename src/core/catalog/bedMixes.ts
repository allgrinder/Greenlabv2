/**
 * Fertige Staudenmischungen für Rabatten. Nur Arten aus dem Katalog (alle mit Blender-Bildern);
 * Anteile summieren sich zu 1. `sun` dient der Empfehlung nach Sonnenstunden am Standort.
 */
import type { MaterialId } from '../model/types';

export type BedSun = 'full' | 'partial' | 'shade';

export interface BedMix {
  id: string;
  name: string;
  /** ein Satz für die Auswahl */
  note: string;
  sun: BedSun;
  mix: { speciesId: string; share: number }[];
  perSquareMeter: number;
  mulchMaterialId: MaterialId;
}

const m = (pairs: [string, number][]) => pairs.map(([speciesId, share]) => ({ speciesId, share }));

export const BED_MIXES: BedMix[] = [
  {
    id: 'praerie',
    name: 'Präriegarten sonnig',
    note: 'Sonnenhut, Schafgarbe und Gräser – blüht bis in den Herbst, Samenstände im Winter',
    sun: 'full',
    mix: m([
      ['echinacea', 0.2],
      ['rudbeckia', 0.15],
      ['achillea', 0.15],
      ['pennisetum', 0.15],
      ['stipa', 0.15],
      ['salvia', 0.1],
      ['calamagrostis', 0.1],
    ]),
    perSquareMeter: 10,
    mulchMaterialId: 'gravel',
  },
  {
    id: 'mediterran',
    name: 'Mediterran trocken',
    note: 'Lavendel, Blauraute und Katzenminze – duftend, kommt mit Hitze und wenig Wasser aus',
    sun: 'full',
    mix: m([
      ['lavandula', 0.25],
      ['perovskia', 0.2],
      ['nepeta', 0.15],
      ['salvia', 0.15],
      ['sedum', 0.15],
      ['stipa', 0.1],
    ]),
    perSquareMeter: 10,
    mulchMaterialId: 'gravel',
  },
  {
    id: 'graeser',
    name: 'Moderne Gräserrabatte',
    note: 'Chinaschilf, Reitgras und Federgras mit Zierlauch und Salbei – ruhig, grafisch, ganzjährig präsent',
    sun: 'full',
    mix: m([
      ['miscanthus', 0.15],
      ['calamagrostis', 0.15],
      ['pennisetum', 0.15],
      ['stipa', 0.15],
      ['salvia', 0.15],
      ['sedum', 0.15],
      ['allium', 0.1],
    ]),
    perSquareMeter: 9,
    mulchMaterialId: 'basalt',
  },
  {
    id: 'klassisch',
    name: 'Klassische Staudenrabatte',
    note: 'Salbei, Storchschnabel, Katzenminze und Berggras – die Mischung aus dem Mustergarten',
    sun: 'full',
    mix: m([
      ['salvia', 0.17],
      ['nepeta', 0.14],
      ['geranium', 0.14],
      ['perovskia', 0.12],
      ['hakonechloa', 0.12],
      ['echinacea', 0.1],
      ['pennisetum', 0.08],
      ['sedum', 0.08],
      ['lavandula', 0.05],
    ]),
    perSquareMeter: 10,
    mulchMaterialId: 'barkMulch',
  },
  {
    id: 'pflegeleicht',
    name: 'Pflegeleicht',
    note: 'Taglilie, Frauenmantel, Bergenie und Segge – deckt schnell, kaum Unkraut, wenig Rückschnitt',
    sun: 'partial',
    mix: m([
      ['geranium', 0.2],
      ['hemerocallis', 0.2],
      ['alchemilla', 0.15],
      ['bergenia', 0.15],
      ['carex', 0.15],
      ['sedum', 0.15],
    ]),
    perSquareMeter: 9,
    mulchMaterialId: 'barkMulch',
  },
  {
    id: 'cottage',
    name: 'Romantischer Cottage-Garten',
    note: 'Flammenblume, Storchschnabel, Frauenmantel und Katzenminze – üppig, duftend, lange Blüte',
    sun: 'partial',
    mix: m([
      ['phlox', 0.2],
      ['geranium', 0.2],
      ['alchemilla', 0.2],
      ['nepeta', 0.15],
      ['astilbe', 0.1],
      ['allium', 0.15],
    ]),
    perSquareMeter: 10,
    mulchMaterialId: 'barkMulch',
  },
  {
    id: 'schatten',
    name: 'Schattenbeet',
    note: 'Funkien, Farn, Berggras und Purpurglöckchen – für Plätze unter Bäumen und an der Nordseite',
    sun: 'shade',
    mix: m([
      ['hosta', 0.25],
      ['dryopteris', 0.2],
      ['hakonechloa', 0.2],
      ['heuchera', 0.15],
      ['astilbe', 0.1],
      ['anemone', 0.1],
    ]),
    perSquareMeter: 8,
    mulchMaterialId: 'barkMulch',
  },
];

export const getBedMix = (id: string): BedMix => BED_MIXES.find((x) => x.id === id) ?? BED_MIXES[0];

/** Lichtverhältnis aus mittleren Sonnenstunden am Sommertag */
export function sunClass(hours: number): BedSun {
  return hours >= 6 ? 'full' : hours >= 3 ? 'partial' : 'shade';
}

export const SUN_LABEL: Record<BedSun, string> = { full: 'sonnig', partial: 'halbschattig', shade: 'schattig' };

/** Mischungen nach Eignung: passende zuerst (halbschattige Mischungen passen auch sonnig und schattig) */
export function rankBedMixes(hours: number | null): BedMix[] {
  if (hours === null) return BED_MIXES;
  const c = sunClass(hours);
  const fit = (x: BedMix) => (x.sun === c ? 0 : x.sun === 'partial' || c === 'partial' ? 1 : 2);
  return [...BED_MIXES].sort((a, b) => fit(a) - fit(b));
}
