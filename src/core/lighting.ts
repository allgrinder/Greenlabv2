/**
 * Lichtszenen und Zeitpläne (Screen 03/05): welche Leuchten wann wie hell brennen.
 */
import type { LampObject, LampType } from './model/types';

export interface LightScene {
  id: string;
  name: string;
  when: string;
  note: string;
  /** Helligkeit je Leuchtentyp (0 = aus); fehlende Typen sind aus */
  levels: Partial<Record<LampType, number>>;
}

export const SCENES: LightScene[] = [
  { id: 'arrive', name: 'Ankommen', when: 'Dämmerung – 23:30', note: 'Poller, Wandleuchten, Wege', levels: { bollard: 1, wall: 1, pathLight: 1, underwater: 0.6 } },
  { id: 'dinner', name: 'Abendessen', when: 'manuell', note: 'Terrasse, Lichterkette 60 %, Baum', levels: { stringLights: 0.6, wall: 0.8, treeUplight: 1, spot: 1, underwater: 1, pathLight: 0.6, bollard: 0.5 } },
  { id: 'late', name: 'Spätabend', when: '23:30 – 01:00', note: 'nur Wege, 20 %', levels: { pathLight: 0.2, bollard: 0.2 } },
  { id: 'all', name: 'Alle an', when: 'manuell', note: 'jede Leuchte mit voller Leistung', levels: { bollard: 1, spot: 1, pathLight: 1, stringLights: 1, wall: 1, underwater: 1, treeUplight: 1 } },
];

const parseHM = (s: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  return m ? +m[1] + +m[2] / 60 : null;
};

/** Brennt die Leuchte laut Zeitplan zur Uhrzeit (Dezimalstunden, Wochentag 0 = Montag)? */
export function scheduledOn(l: LampObject, hour: number, weekday: number, sunset: number, sunrise: number): boolean {
  if (!l.on) return false;
  if (!l.schedule.weekdays[weekday]) return false;
  const from = l.schedule.from === 'dusk' ? sunset : (parseHM(l.schedule.from) ?? sunset);
  const to = l.schedule.to === 'dawn' ? sunrise : (parseHM(l.schedule.to) ?? sunrise);
  // Zeitfenster über Mitternacht
  return from <= to ? hour >= from && hour < to : hour >= from || hour < to;
}

/** Helligkeit 0–1: Szene hat Vorrang vor dem Zeitplan */
export function lampLevel(l: LampObject, scene: string | null, schedule: () => boolean): number {
  if (!l.on) return 0;
  if (scene) return SCENES.find((s) => s.id === scene)?.levels[l.lampType] ?? 0;
  return schedule() ? 1 : 0;
}
