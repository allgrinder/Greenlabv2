/**
 * Sonnenstand über SunCalc, umgerechnet ins Plansystem.
 * Planwinkel: Nord liegt `northDeg` im Uhrzeigersinn von „Plan oben“.
 */
import * as SunCalc from 'suncalc';
import type { GeoLocation, Vec2 } from '../model/types';

export interface SunPosition {
  /** Kompass-Azimut in Grad (0 = Nord, 90 = Ost, im Uhrzeigersinn) */
  azimuthDeg: number;
  /** Höhe über dem Horizont in Grad */
  altitudeDeg: number;
}

/** Zeitzonenversatz (ms) einer IANA-Zone zu einem Zeitpunkt */
function tzOffsetMs(utcMs: number, timeZone: string): number {
  const f = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
  const parts = Object.fromEntries(f.formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Ortszeit (Tag im Jahr, Stunde als Dezimalzahl) in einen Zeitpunkt umrechnen */
export function zonedDate(year: number, dayOfYear: number, hour: number, timeZone: string): Date {
  const wall = Date.UTC(year, 0, 1) + (dayOfYear - 1) * 86_400_000 + hour * 3_600_000;
  let utc = wall - tzOffsetMs(wall, timeZone);
  utc = wall - tzOffsetMs(utc, timeZone); // zweiter Durchgang für Sommerzeitwechsel
  return new Date(utc);
}

export function dayOfYear(d: Date): number {
  return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 1)) / 86_400_000) + 1;
}

export function sunAt(loc: GeoLocation, year: number, doy: number, hour: number): SunPosition {
  const date = zonedDate(year, doy, hour, loc.timeZone);
  const p = SunCalc.getPosition(date, loc.lat, loc.lon);
  // SunCalc 2.x liefert Grad und Kompass-Azimut (die Typen von @types/suncalc beschreiben noch 1.x mit Radiant)
  return { azimuthDeg: ((p.azimuth % 360) + 360) % 360, altitudeDeg: p.altitude };
}

/** Planrichtung (Einheitsvektor) zu einem Kompass-Azimut */
export function planDirection(azimuthDeg: number, northDeg: number): Vec2 {
  const t = ((northDeg + azimuthDeg) * Math.PI) / 180;
  return { x: Math.sin(t), y: -Math.cos(t) };
}

/**
 * Schattenversatz pro Meter Objekthöhe (in Planmetern), weg von der Sonne.
 * null, wenn die Sonne (fast) unter dem Horizont steht. Länge auf 15 begrenzt.
 */
export function shadowVector(sun: SunPosition, northDeg: number): Vec2 | null {
  if (sun.altitudeDeg <= 0.5) return null;
  const len = Math.min(15, 1 / Math.tan((sun.altitudeDeg * Math.PI) / 180));
  const d = planDirection(sun.azimuthDeg + 180, northDeg);
  return { x: d.x * len, y: d.y * len };
}

/** Auf- und Untergang in Ortszeit (Dezimalstunden) und Höchststand */
export function dayInfo(loc: GeoLocation, year: number, doy: number): { sunrise: number | null; sunset: number | null; maxAltitudeDeg: number } {
  let sunrise: number | null = null;
  let sunset: number | null = null;
  let maxAlt = -90;
  let prev = sunAt(loc, year, doy, 0).altitudeDeg;
  for (let h = 0.05; h <= 24; h += 0.05) {
    const a = sunAt(loc, year, doy, h).altitudeDeg;
    if (prev <= 0 && a > 0 && sunrise === null) sunrise = h;
    if (prev > 0 && a <= 0) sunset = h;
    if (a > maxAlt) maxAlt = a;
    prev = a;
  }
  return { sunrise, sunset, maxAltitudeDeg: maxAlt };
}

export const formatHour = (h: number) => {
  let H = Math.floor(h);
  let M = Math.round((h - H) * 60);
  if (M === 60) {
    H++;
    M = 0;
  }
  return `${String(H).padStart(2, '0')}:${String(M).padStart(2, '0')}`;
};

/** Ersatzstandort, wenn das Projekt keinen hat (Mitte Deutschlands) */
export const DEFAULT_LOCATION: GeoLocation = { lat: 51.0, lon: 10.0, label: 'Deutschland (Mitte)', timeZone: 'Europe/Berlin' };
