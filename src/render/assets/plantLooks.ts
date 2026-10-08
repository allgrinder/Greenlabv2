/**
 * Aussehen einer Pflanze je Jahreszeit – gemeinsam für die App und die Blender-Renderings.
 * `scripts/plant-looks.ts` exportiert diese Werte nach `assets/blender/plants.json`; die App findet
 * über denselben Schlüssel das passende Bild im Manifest.
 */
import { inBloom, isBare, seasonColor, SEASONS, type Season } from '../../core/growth';
import type { PlantSpecies } from '../../core/model/types';

export interface PlantLook {
  /** Laubfarbe (bei Stauden: Blattpolster) */
  color: string;
  /** kahl (Winter, laubabwerfend) */
  bare: boolean;
  bloom: string | null;
  fruit: string | null;
}

const MONTH: Record<Season, number> = { spring: 3, summer: 6, autumn: 9, winter: 0 };

export function plantLook(sp: PlantSpecies, season: Season): PlantLook {
  if (sp.kind === 'perennial' || sp.kind === 'grass' || sp.kind === 'vegetable') {
    const grass = sp.kind === 'grass';
    const bloom = inBloom(sp, season) ? (sp.colors.bloom ?? sp.colors.summer) : grass && (season === 'summer' || season === 'autumn') ? '#E8DDB8' : null;
    // Stauden: Im Katalog steht als Sommerfarbe die Blüte – das Laub ist grün; Gemüse: Blattfarbe aus dem Katalog
    const leaf = sp.kind === 'vegetable' ? sp.colors.summer : '#6d8a4b';
    const color = grass ? seasonColor(sp, season) : season === 'winter' ? '#7d7464' : season === 'autumn' ? '#80855a' : leaf;
    const fruit = sp.phenology[MONTH[season]] === 'fruit' ? (sp.colors.bloom ?? '#B9472F') : null;
    return { color, bare: false, bloom, fruit };
  }
  const bare = isBare(sp, season);
  const bloom = inBloom(sp, season) ? (sp.colors.bloom ?? null) : null;
  const fruit = sp.phenology[MONTH[season]] === 'fruit' ? '#B9472F' : null;
  return { color: seasonColor(sp, season), bare, bloom, fruit };
}

export const lookKey = (l: PlantLook) => `${l.color}|${l.bare ? 1 : 0}|${l.bloom ?? ''}|${l.fruit ?? ''}`;

/** Alle verschiedenen Looks einer Art mit den Jahreszeiten, in denen sie gelten */
export function distinctLooks(sp: PlantSpecies): { key: string; look: PlantLook; seasons: Season[] }[] {
  const out: { key: string; look: PlantLook; seasons: Season[] }[] = [];
  for (const { k } of SEASONS) {
    const look = plantLook(sp, k);
    const key = lookKey(look);
    const hit = out.find((x) => x.key === key);
    if (hit) hit.seasons.push(k);
    else out.push({ key, look, seasons: [k] });
  }
  return out;
}
