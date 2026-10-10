/** Ansichtsparameter des Renderers: Linse, Jahreszeit, Nacht, Detailstufe und Sonnenzeiten */
import type { Season } from '../core/growth';
import type { Project, Vec2 } from '../core/model/types';
import { DEFAULT_LOCATION, dayInfo } from '../core/sun/sun';
import type { LensTab, SessionState } from '../state/types';

/** Was die Darstellung beeinflusst; für Exporte und Jahreszeiten-Vorschau überschreibbar */
export interface ViewParams {
  lens: LensTab;
  night: boolean;
  years: number;
  season: Season;
  /** Sonnenstand-Linse: Tag im Jahr und Uhrzeit */
  sun: { doy: number; hour: number; heat: boolean };
  nightHour: number;
  scene: string | null;
}

/** Schatten der Planansicht ohne Sonnenlinse: Sonne aus Südost, wie im Design */
// Abendsonne von links oben wie im Gartenkonzept: lange, weiche Schatten nach rechts unten
export const DESIGN_SHADOW: Vec2 = { x: 0.34, y: 0.44 };

export const seasonOfDoy = (doy: number): Season => (doy < 80 || doy >= 355 ? 'winter' : doy < 172 ? 'spring' : doy < 266 ? 'summer' : 'autumn');

export function viewParamsFrom(s: SessionState): ViewParams {
  return {
    lens: s.lens,
    night: s.mode === 'night',
    years: s.lens === 'growth' ? s.years : 0,
    season: s.lens === 'seasons' ? s.season : s.lens === 'sun' ? seasonOfDoy(s.sun.doy) : s.lens === 'privacy' ? s.privacy.season : 'summer',
    sun: s.sun,
    nightHour: s.night.hour,
    scene: s.night.scene,
  };
}

export const lodFor = (ppm: number) => (ppm < 6 ? 0 : ppm < 14 ? 1 : 2);

/** Sonnenauf- und -untergang eines Tages am Gartenstandort (je Ort und Tag zwischengespeichert) */
export function sunTimes(cache: Map<string, { sunrise: number; sunset: number }>, doc: Project, doy: number) {
  const loc = doc.site.location ?? DEFAULT_LOCATION;
  const key = `${loc.lat},${loc.lon},${doy}`;
  let v = cache.get(key);
  if (!v) {
    const d = dayInfo(loc, new Date().getFullYear(), doy);
    v = { sunrise: d.sunrise ?? 6, sunset: d.sunset ?? 20 };
    cache.set(key, v);
  }
  return v;
}
