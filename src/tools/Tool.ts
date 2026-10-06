import type { Graphics } from 'pixi.js';
import type { SnapResult } from '../core/geometry/snap';
import type { Id, PlanObject, Project, Vec2 } from '../core/model/types';
import type { LabelPool, ToScreen } from '../render/overlays/overlay';
import type { PlanRenderer } from '../render/PlanRenderer';
import type { Commands } from '../state/commands';
import type { EditorStoreApi } from '../state/store';

export interface WorldPointerEvent {
  /** Weltpunkt ohne Fang */
  raw: Vec2;
  /** Weltpunkt mit Fang (Raster, Ecken, Kanten; ⇧ = Winkel) */
  p: Vec2;
  snap: SnapResult;
  screen: Vec2;
  shift: boolean;
  alt: boolean;
  mod: boolean;
  button: number;
  pointerType: string;
  /** Doppelklick (zweiter Klick innerhalb 300 ms an gleicher Stelle) */
  dbl: boolean;
}

export interface SnapRequest {
  /** Objekte, die nicht als Fangziel dienen (das gerade bewegte) */
  exclude?: Set<Id>;
  /** Ursprung für Winkelfang mit ⇧ */
  angleFrom?: Vec2;
}

export interface ToolContext {
  store: EditorStoreApi;
  cmd: Commands;
  renderer: PlanRenderer;
  doc(): Project;
  /** Bildschirmpixel → Weltmeter */
  px(n: number): number;
  snap(raw: Vec2, req?: SnapRequest, e?: { shift: boolean; alt: boolean }): SnapResult;
  /** Vorschau neu zeichnen */
  redraw(): void;
  /** Objekt darf ausgewählt/bearbeitet werden (Ebene sichtbar und entsperrt) */
  selectable(o: PlanObject): boolean;
  setCursor(c: string): void;
}

export interface Tool {
  readonly id: string;
  readonly cursor: string;
  down?(e: WorldPointerEvent): void;
  move?(e: WorldPointerEvent): void;
  up?(e: WorldPointerEvent): void;
  /** true = Taste verbraucht */
  key?(e: KeyboardEvent): boolean;
  /** Vorschau im Bildschirmraum */
  preview?(g: Graphics, toScreen: ToScreen, labels: LabelPool): void;
  /** Abbrechen (Esc, Werkzeugwechsel) */
  cancel?(): void;
}
