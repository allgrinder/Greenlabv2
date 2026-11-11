/**
 * Mustergärten, die die App mitbringt: Startseite und Projektmenü bieten sie an,
 * beim ersten Öffnen wird eine Kopie gespeichert (danach öffnet sich diese Kopie).
 */
import type { Project } from '../model/types';
import { createMustergarten } from './mustergarten';
import { createSpielgarten } from './spielgarten';

export interface SampleGarden {
  key: string;
  /** kurzer Name für Knöpfe und Karten */
  title: string;
  /** ein Satz zum Inhalt */
  text: string;
  create: () => Project;
}

export const SAMPLES: SampleGarden[] = [
  {
    key: 'modern',
    title: 'Modern & Naturnah',
    text: '30 × 50 m · Pavillon, Feuerstelle, Hochbeete, Naturwiese und Homeoffice-Pod',
    create: createMustergarten,
  },
  {
    key: 'spielgarten',
    title: 'Entspannung, Spiel & Obst',
    text: 'rund 1.500 m² · Outdoorküche, Office & Sauna, Spielgarten, Obstwiese und Gemüsegarten',
    create: createSpielgarten,
  },
];

export const getSample = (key: string): SampleGarden => SAMPLES.find((s) => s.key === key) ?? SAMPLES[0];
