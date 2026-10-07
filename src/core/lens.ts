/**
 * Welche Ebenen eine Linse zeigt (wie in GardenPlan.dc.html): Bewässerung und Leitungen nur in
 * der Bewässerungs-Linse, Leuchten in der Planansicht und bei Nacht. Die Sichtbarkeit der Ebene
 * selbst (Auge im Ebenen-Panel) gilt zusätzlich.
 */
import { defaultLayerKind } from './model/defaults';
import type { LayerKind, PlanObject } from './model/types';

export type Lens = 'plan' | 'sun' | 'growth' | 'seasons' | 'privacy' | 'irrigation' | 'costs';

export function lensShowsLayer(kind: LayerKind, lens: Lens, night: boolean): boolean {
  if (kind === 'water' || kind === 'pipes') return lens === 'irrigation';
  if (kind === 'light') return night || lens === 'plan' || lens === 'costs';
  return true;
}

/** Wie lensShowsLayer; in eigenen Ebenen entscheidet die Objektart */
export function lensShowsObject(layerKind: LayerKind, o: Pick<PlanObject, 'type'>, lens: Lens, night: boolean): boolean {
  return lensShowsLayer(layerKind === 'custom' ? defaultLayerKind(o) : layerKind, lens, night);
}
