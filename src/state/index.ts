import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { createCommands } from './commands';
import { editor, type EditorStore } from './store';

export { editor } from './store';

/** App-weite Commands auf der globalen Store-Instanz */
export const cmd = createCommands(editor);

export function useEditor<T>(selector: (s: EditorStore) => T): T {
  return useStore(editor, selector);
}

/** Für Selektoren, die neue Arrays/Objekte bauen */
export function useEditorShallow<T>(selector: (s: EditorStore) => T): T {
  return useStore(editor, useShallow(selector));
}
