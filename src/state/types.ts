import type { Id, Project, Vec2 } from '../core/model/types';
import type { Patch } from 'immer';

/**
 * Laufzeitzustand der Sitzung. Wird NICHT gespeichert und ist NICHT Teil der Undo-Historie.
 * Nur `doc` (das Projekt) läuft über Commands und den Undo-Stack.
 */
export interface EditorState {
  doc: Project | null;
  session: SessionState;
  history: HistoryState;
}

export type ToolId =
  | 'select'
  | 'rect'
  | 'poly'
  | 'bezier'
  | 'free'
  | 'path'
  | 'dim'
  | 'text'
  | 'plant'
  | 'hedge'
  | 'calibrate'
  | 'bgmove'
  | 'drip'
  | 'pipe'
  | 'lights'
  | 'plotedit'
  | 'bgalign';

export type LensTab = 'plan' | 'sun' | 'growth' | 'seasons' | 'irrigation' | 'costs';

export interface SessionState {
  tool: ToolId;
  /** Werkzeug vor gedrückter Leertaste, für temporäres Pan */
  toolBeforePan: ToolId | null;
  selection: Id[];
  /** gerade bearbeiteter Knoten (Punkte nachträglich bearbeiten) */
  activeNode: { objectId: Id; nodeIndex: number } | null;
  hoverId: Id | null;
  activeLayerId: Id | null;
  viewport: Viewport;
  lens: LensTab;
  mode: 'day' | 'night';
  panels: { layers: boolean; library: boolean; properties: boolean };
  /** Was „Pflanze setzen“ bzw. ein Klick aus der Bibliothek platziert */
  brush: Brush;
  /** Linse „Sonne“: Tag im Jahr, Uhrzeit (Ortszeit), Heatmap an/aus */
  sun: { doy: number; hour: number; heat: boolean };
  /** Linse „Wachstum“: Jahre ab heute */
  years: number;
  /** Jahreszeit für Farben (Linse „Jahreszeiten“ zeigt alle vier) */
  season: 'spring' | 'summer' | 'autumn' | 'winter';
  /** Jahreszeiten-Linse: eine Jahreszeit groß statt Vergleich 4× */
  seasonFocus: 'spring' | 'summer' | 'autumn' | 'winter' | null;
  /** Nachtmodus: Uhrzeit für Zeitpläne, aktive Lichtszene */
  night: { hour: number; scene: string | null };
  /** Vorgaben für neu gezeichnete Objekte */
  defaults: { areaMaterial: string; pathMaterial: string; pathWidth: number };
}

export type Brush =
  | { kind: 'plant'; speciesId: string }
  | { kind: 'item'; catalogId: string }
  | { kind: 'lamp'; lampType: import('../core/model/types').LampType }
  | { kind: 'irr'; what: 'sprinkler' | 'tap' | 'manifold' };

export interface Viewport {
  /** Weltpunkt in der Bildschirmmitte */
  center: Vec2;
  /** Bildschirmpixel pro Weltmeter. „100 %“ = 1:100 bei 96 dpi ≈ 37,8 px/m */
  pxPerMeter: number;
  /** Plan wird um −northDeg gedreht dargestellt? (Standard: Grundstück achsparallel) */
  rotationDeg: number;
}

export interface HistoryEntry {
  label: string; // „Kiesweg verschieben“
  patches: Patch[];
  inverse: Patch[];
  /** gleiche mergeKey in kurzer Folge werden zusammengefasst (Ziehen, Slider) */
  mergeKey: string | null;
  at: number;
}

export interface HistoryState {
  past: HistoryEntry[];
  future: HistoryEntry[];
  /** Obergrenze, älteste Einträge fallen weg */
  limit: number;
}
