import type { Project } from '../core/model/types';
import type { EditorStoreApi } from '../state/store';
import { rememberLast, saveProject } from './db';

export type SaveState = 'saved' | 'saving' | 'unsaved';

/**
 * Speichert das Projekt 800 ms nach der letzten Änderung sowie beim Verlassen der Seite.
 * Meldet den Status für die Anzeige „Gespeichert“ in der Topbar.
 */
export function startAutosave(store: EditorStoreApi, onState: (s: SaveState) => void, delay = 800): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let saved: Project | null = store.getState().doc;
  let pending: Project | null = null;

  const flush = async () => {
    timer = null;
    const doc = pending;
    pending = null;
    if (!doc || doc === saved) return;
    onState('saving');
    try {
      await saveProject(doc);
      saved = doc;
      rememberLast(doc.id);
      onState(pending ? 'saving' : 'saved');
    } catch (e) {
      console.error('Speichern fehlgeschlagen', e);
      onState('unsaved');
    }
  };

  const unsub = store.subscribe((s, prev) => {
    if (s.doc === prev.doc || !s.doc) return;
    // Projektwechsel: neues Projekt gilt als gespeichert, sobald es einmal geschrieben wurde
    if (prev.doc && s.doc.id !== prev.doc.id) saved = null;
    pending = s.doc;
    onState('saving');
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, delay);
  });

  const onHide = () => {
    if (document.visibilityState === 'hidden' && timer) {
      clearTimeout(timer);
      void flush();
    }
  };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onHide);

  return () => {
    unsub();
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', onHide);
    if (timer) {
      clearTimeout(timer);
      void flush();
    }
  };
}
