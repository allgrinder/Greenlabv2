/**
 * Orte für den Sonnenstand. Für Schatten und Sonnenstunden zählen nur Breitengrad und Zeitzone –
 * eine Stadt in der Nähe genügt, eine genaue Adresse ändert das Ergebnis praktisch nicht.
 * Bewusst ohne externen Dienst.
 */
export interface Place {
  name: string;
  lat: number;
  lon: number;
  timeZone: string;
}

const DE = 'Europe/Berlin';
const AT = 'Europe/Vienna';
const CH = 'Europe/Zurich';

export const PLACES: Place[] = [
  { name: 'Aachen', lat: 50.78, lon: 6.08, timeZone: DE },
  { name: 'Augsburg', lat: 48.37, lon: 10.9, timeZone: DE },
  { name: 'Berlin', lat: 52.52, lon: 13.4, timeZone: DE },
  { name: 'Bielefeld', lat: 52.02, lon: 8.53, timeZone: DE },
  { name: 'Bochum', lat: 51.48, lon: 7.22, timeZone: DE },
  { name: 'Bonn', lat: 50.74, lon: 7.1, timeZone: DE },
  { name: 'Braunschweig', lat: 52.27, lon: 10.52, timeZone: DE },
  { name: 'Bremen', lat: 53.08, lon: 8.8, timeZone: DE },
  { name: 'Chemnitz', lat: 50.83, lon: 12.92, timeZone: DE },
  { name: 'Cottbus', lat: 51.76, lon: 14.33, timeZone: DE },
  { name: 'Darmstadt', lat: 49.87, lon: 8.65, timeZone: DE },
  { name: 'Dortmund', lat: 51.51, lon: 7.47, timeZone: DE },
  { name: 'Dresden', lat: 51.05, lon: 13.74, timeZone: DE },
  { name: 'Duisburg', lat: 51.43, lon: 6.76, timeZone: DE },
  { name: 'Düsseldorf', lat: 51.23, lon: 6.78, timeZone: DE },
  { name: 'Erfurt', lat: 50.98, lon: 11.03, timeZone: DE },
  { name: 'Essen', lat: 51.46, lon: 7.01, timeZone: DE },
  { name: 'Flensburg', lat: 54.79, lon: 9.44, timeZone: DE },
  { name: 'Frankfurt am Main', lat: 50.11, lon: 8.68, timeZone: DE },
  { name: 'Freiburg im Breisgau', lat: 47.99, lon: 7.85, timeZone: DE },
  { name: 'Garmisch-Partenkirchen', lat: 47.49, lon: 11.1, timeZone: DE },
  { name: 'Göttingen', lat: 51.54, lon: 9.93, timeZone: DE },
  { name: 'Hamburg', lat: 53.55, lon: 9.99, timeZone: DE },
  { name: 'Hannover', lat: 52.37, lon: 9.74, timeZone: DE },
  { name: 'Heidelberg', lat: 49.4, lon: 8.67, timeZone: DE },
  { name: 'Ingolstadt', lat: 48.77, lon: 11.42, timeZone: DE },
  { name: 'Jena', lat: 50.93, lon: 11.59, timeZone: DE },
  { name: 'Karlsruhe', lat: 49.01, lon: 8.4, timeZone: DE },
  { name: 'Kassel', lat: 51.31, lon: 9.48, timeZone: DE },
  { name: 'Kiel', lat: 54.32, lon: 10.12, timeZone: DE },
  { name: 'Koblenz', lat: 50.36, lon: 7.59, timeZone: DE },
  { name: 'Köln', lat: 50.94, lon: 6.96, timeZone: DE },
  { name: 'Konstanz', lat: 47.66, lon: 9.18, timeZone: DE },
  { name: 'Leipzig', lat: 51.34, lon: 12.37, timeZone: DE },
  { name: 'Lübeck', lat: 53.87, lon: 10.69, timeZone: DE },
  { name: 'Magdeburg', lat: 52.13, lon: 11.62, timeZone: DE },
  { name: 'Mainz', lat: 50.0, lon: 8.27, timeZone: DE },
  { name: 'Mannheim', lat: 49.49, lon: 8.47, timeZone: DE },
  { name: 'München', lat: 48.14, lon: 11.58, timeZone: DE },
  { name: 'Münster', lat: 51.96, lon: 7.63, timeZone: DE },
  { name: 'Nürnberg', lat: 49.45, lon: 11.08, timeZone: DE },
  { name: 'Oldenburg', lat: 53.14, lon: 8.21, timeZone: DE },
  { name: 'Osnabrück', lat: 52.28, lon: 8.05, timeZone: DE },
  { name: 'Passau', lat: 48.57, lon: 13.43, timeZone: DE },
  { name: 'Potsdam', lat: 52.4, lon: 13.06, timeZone: DE },
  { name: 'Regensburg', lat: 49.01, lon: 12.1, timeZone: DE },
  { name: 'Rostock', lat: 54.09, lon: 12.14, timeZone: DE },
  { name: 'Saarbrücken', lat: 49.23, lon: 7.0, timeZone: DE },
  { name: 'Schwerin', lat: 53.63, lon: 11.41, timeZone: DE },
  { name: 'Stuttgart', lat: 48.78, lon: 9.18, timeZone: DE },
  { name: 'Trier', lat: 49.75, lon: 6.64, timeZone: DE },
  { name: 'Ulm', lat: 48.4, lon: 9.99, timeZone: DE },
  { name: 'Wiesbaden', lat: 50.08, lon: 8.24, timeZone: DE },
  { name: 'Würzburg', lat: 49.79, lon: 9.95, timeZone: DE },
  { name: 'Wuppertal', lat: 51.26, lon: 7.15, timeZone: DE },
  { name: 'Graz', lat: 47.07, lon: 15.44, timeZone: AT },
  { name: 'Innsbruck', lat: 47.27, lon: 11.39, timeZone: AT },
  { name: 'Linz', lat: 48.31, lon: 14.29, timeZone: AT },
  { name: 'Salzburg', lat: 47.81, lon: 13.06, timeZone: AT },
  { name: 'Wien', lat: 48.21, lon: 16.37, timeZone: AT },
  { name: 'Basel', lat: 47.56, lon: 7.59, timeZone: CH },
  { name: 'Bern', lat: 46.95, lon: 7.45, timeZone: CH },
  { name: 'Genf', lat: 46.2, lon: 6.14, timeZone: CH },
  { name: 'Zürich', lat: 47.38, lon: 8.54, timeZone: CH },
];

const key = (s: string) => s.trim().toLocaleLowerCase('de').replace(/\s+/g, ' ');

/** Ort per Name finden (Groß-/Kleinschreibung egal, Präfix reicht, wenn eindeutig) */
export function findPlace(name: string): Place | null {
  const k = key(name);
  if (!k) return null;
  const exact = PLACES.find((p) => key(p.name) === k);
  if (exact) return exact;
  const pre = PLACES.filter((p) => key(p.name).startsWith(k));
  return pre.length === 1 ? pre[0] : null;
}

/** Nächstgelegener Ort zu Koordinaten (für die Anzeige nach der Ortung) */
export function nearestPlace(lat: number, lon: number): { place: Place; km: number } {
  let best = PLACES[0];
  let bd = Infinity;
  for (const p of PLACES) {
    const dLat = ((p.lat - lat) * Math.PI) / 180;
    const dLon = ((p.lon - lon) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat * Math.PI) / 180) * Math.cos((p.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    const d = 2 * 6371 * Math.asin(Math.sqrt(a));
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return { place: best, km: bd };
}
