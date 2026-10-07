import { applyPatches, enablePatches, produceWithPatches, type Draft } from 'immer';
import { createStore } from 'zustand/vanilla';
import type { Project } from '../core/model/types';
import type { EditorState, HistoryEntry, SessionState } from './types';

enablePatches();

export interface ApplyOptions {
  /** Gleiche mergeKey hintereinander → ein Undo-Schritt (Ziehen, Slider) */
  mergeKey?: string;
}

export interface EditorActions {
  /** Einzige Schreibstelle für das Projekt */
  apply(label: string, recipe: (doc: Draft<Project>) => void, opts?: ApplyOptions): void;
  undo(): void;
  redo(): void;
  /** schließt die laufende Zusammenfassung (Pointer-Up) */
  endGesture(): void;
  loadProject(p: Project | null): void;
  setSession(patch: Partial<SessionState> | ((s: SessionState) => Partial<SessionState>)): void;
}

export type EditorStore = EditorState & EditorActions & { mergeOpen: boolean };

export const initialSession = (): SessionState => ({
  tool: 'select',
  toolBeforePan: null,
  selection: [],
  activeNode: null,
  hoverId: null,
  activeLayerId: null,
  viewport: { center: { x: 25, y: 15 }, pxPerMeter: 16, rotationDeg: 0 },
  lens: 'plan',
  mode: 'day',
  panels: { layers: true, library: false, properties: true },
  brush: { kind: 'plant', speciesId: 'amelanchier-lamarckii' },
  sun: { doy: 172, hour: 16.5, heat: true },
  years: 10,
  season: 'summer',
  seasonFocus: null,
  night: { hour: 21.67, scene: null },
  paint: { radius: 0.8, density: 0.8, mix: ['salvia', 'geranium', 'stipa'], bedsOnly: false },
  privacy: { on: false, pose: 'sitting', season: 'summer' },
  defaults: { areaMaterial: 'soil', pathMaterial: 'gravel', pathWidth: 1.2 },
});

const HISTORY_LIMIT = 200;

/** Auswahl auf noch existierende Objekte beschränken */
function pruneSession(s: SessionState, doc: Project | null): SessionState {
  if (!doc) return { ...s, selection: [], activeNode: null, hoverId: null };
  const selection = s.selection.filter((id) => doc.objects[id]);
  const activeNode = s.activeNode && doc.objects[s.activeNode.objectId] ? s.activeNode : null;
  const hoverId = s.hoverId && doc.objects[s.hoverId] ? s.hoverId : null;
  if (selection.length === s.selection.length && activeNode === s.activeNode && hoverId === s.hoverId) return s;
  return { ...s, selection, activeNode, hoverId };
}

export function createEditorStore(clock: () => number = Date.now) {
  return createStore<EditorStore>()((set, get) => ({
    doc: null,
    session: initialSession(),
    history: { past: [], future: [], limit: HISTORY_LIMIT },
    mergeOpen: false,

    apply(label, recipe, opts = {}) {
      const { doc, history, mergeOpen } = get();
      if (!doc) return;
      const [next, patches, inverse] = produceWithPatches(doc, recipe);
      if (!patches.length) return;
      const now = clock();
      const stamped = { ...next, updatedAt: new Date(now).toISOString() };
      const last = history.past[history.past.length - 1];
      const key = opts.mergeKey ?? null;
      let past: HistoryEntry[];
      if (key && mergeOpen && last && last.mergeKey === key) {
        past = [...history.past.slice(0, -1), { ...last, patches: [...last.patches, ...patches], inverse: [...inverse, ...last.inverse], at: now }];
      } else {
        past = [...history.past, { label, patches, inverse, mergeKey: key, at: now }];
        if (past.length > history.limit) past = past.slice(past.length - history.limit);
      }
      set({ doc: stamped, history: { ...history, past, future: [] }, mergeOpen: !!key, session: pruneSession(get().session, stamped) });
    },

    undo() {
      const { doc, history } = get();
      const e = history.past[history.past.length - 1];
      if (!doc || !e) return;
      const next = applyPatches(doc, e.inverse);
      set({
        doc: next,
        history: { ...history, past: history.past.slice(0, -1), future: [e, ...history.future] },
        mergeOpen: false,
        session: pruneSession(get().session, next),
      });
    },

    redo() {
      const { doc, history } = get();
      const e = history.future[0];
      if (!doc || !e) return;
      const next = applyPatches(doc, e.patches);
      set({
        doc: next,
        history: { ...history, past: [...history.past, e], future: history.future.slice(1) },
        mergeOpen: false,
        session: pruneSession(get().session, next),
      });
    },

    endGesture() {
      if (get().mergeOpen) set({ mergeOpen: false });
    },

    loadProject(p) {
      const session = initialSession();
      set({ doc: p, history: { past: [], future: [], limit: HISTORY_LIMIT }, mergeOpen: false, session });
    },

    setSession(patch) {
      const s = get().session;
      set({ session: { ...s, ...(typeof patch === 'function' ? patch(s) : patch) } });
    },
  }));
}

export type EditorStoreApi = ReturnType<typeof createEditorStore>;

/** App-weite Instanz */
export const editor = createEditorStore();
