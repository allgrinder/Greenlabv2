import { useCallback, useEffect, useRef, useState } from 'react';
import { bbox } from '../core/geometry/polygon';
import type { Project } from '../core/model/types';
import { createBenchmark } from '../core/sample/benchmark';
import { createLindenweg12 } from '../core/sample/lindenweg12';
import { startAutosave, type SaveState } from '../persistence/autosave';
import { getBlob, lastProjectId, listProjects, loadProject, putBlob, rememberLast, saveProject } from '../persistence/db';
import { exportProject, importProject } from '../persistence/jsonIO';
import type { PlanRenderer } from '../render/PlanRenderer';
import { fitBBox } from '../render/Viewport';
import { editor, useEditor } from '../state';
import { PlanCanvas } from './canvas/PlanCanvas';
import { ToolLayer } from './canvas/ToolLayer';
import { BottomBar } from './chrome/BottomBar';
import { LayersPanel } from './chrome/LayersPanel';
import { ToolRail } from './chrome/ToolRail';
import { TopBar } from './chrome/TopBar';
import { downloadBlob, ExportDialog, fileSafe } from './export/ExportDialog';
import { LibraryPanel } from './library/LibraryPanel';
import { NewProjectWizard } from './onboarding/NewProjectWizard';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { ProjectMenu } from './projects/ProjectMenu';
import ps from './projects/projects.module.css';

/** Von Panels verdeckte Ränder, damit „Einpassen“ den Plan in die freie Mitte legt */
export const PLAN_INSETS = { left: 316, right: 330, top: 84, bottom: 80 };

type Screen = 'boot' | 'wizard' | 'editor';

export function App() {
  const mode = useEditor((s) => s.session.mode);
  const panels = useEditor((s) => s.session.panels);
  const docId = useEditor((s) => s.doc?.id);
  const bgBlobId = useEditor((s) => s.doc?.background?.blobId ?? null);
  const [screen, setScreen] = useState<Screen>('boot');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [menu, setMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [renderer, setRenderer] = useState<PlanRenderer | null>(null);
  const benchmark = useRef(Number(new URLSearchParams(location.search).get('bench')) || 0);

  const notify = useCallback((text: string, error = false) => {
    setToast({ text, error });
    setTimeout(() => setToast((t) => (t?.text === text ? null : t)), error ? 6000 : 3000);
  }, []);

  const open = useCallback((p: Project) => {
    editor.getState().loadProject(p);
    rememberLast(p.id);
    setScreen('editor');
    setMenu(false);
  }, []);

  // Start: letztes Projekt, sonst neuestes, sonst Onboarding
  useEffect(() => {
    (async () => {
      if (benchmark.current) return open(createBenchmark(benchmark.current));
      try {
        const id = lastProjectId() ?? (await listProjects())[0]?.id;
        const p = id ? await loadProject(id) : null;
        if (p) return open(p);
      } catch (e) {
        console.error(e);
        notify('Lokaler Speicher nicht verfügbar – Änderungen werden nicht gesichert.', true);
      }
      setScreen('wizard');
    })();
  }, [open, notify]);

  useEffect(() => {
    if (screen !== 'editor' || benchmark.current) return;
    return startAutosave(editor, setSaveState);
  }, [screen]);

  useEffect(() => {
    document.documentElement.dataset.mode = mode;
  }, [mode]);

  const fit = useCallback(() => {
    const doc = editor.getState().doc;
    if (!renderer || !doc) return;
    editor.getState().setSession({ viewport: fitBBox(bbox(doc.site.boundary), renderer.size, PLAN_INSETS) });
  }, [renderer]);

  // Neues Projekt → einpassen
  useEffect(() => {
    if (docId && renderer) fit();
  }, [docId, renderer, fit]);

  // Hintergrundbild aus IndexedDB laden
  useEffect(() => {
    if (!renderer) return;
    if (!bgBlobId) return renderer.setBackgroundUrl(null);
    let url: string | null = null;
    let alive = true;
    getBlob(bgBlobId).then((b) => {
      if (!alive || !b) return;
      url = URL.createObjectURL(b);
      renderer.setBackgroundUrl(url);
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [renderer, bgBlobId]);

  const createAndOpen = async (p: Project, blobs: Record<string, Blob> = {}) => {
    try {
      for (const [id, b] of Object.entries(blobs)) await putBlob(id, b);
      await saveProject(p);
    } catch (e) {
      console.error(e);
      notify('Projekt konnte nicht gespeichert werden.', true);
    }
    open(p);
  };

  const importFile = async (f: File) => {
    try {
      const { project, blobs } = await importProject(await f.text());
      await createAndOpen(project, blobs);
      notify(`„${project.name}“ importiert`);
    } catch (e) {
      notify((e as Error).message, true);
    }
  };

  const exportJson = async () => {
    const doc = editor.getState().doc;
    if (!doc) return;
    const text = await exportProject(doc, getBlob);
    downloadBlob(new Blob([text], { type: 'application/json' }), `${fileSafe(doc.name)}.gartenwerk.json`);
    setMenu(false);
  };

  return (
    <PlanCanvas
      onReady={(r) => {
        setRenderer(r);
        if (import.meta.env.DEV) Object.assign(window, { __gw: { renderer: r, editor } });
      }}
    >
      {screen === 'editor' && docId && (
        <>
          <ToolLayer onFit={fit} />
          <TopBar saveState={saveState} onExport={() => setExporting(true)} onProjects={() => setMenu((m) => !m)} />
          <ToolRail />
          {panels.library ? <LibraryPanel /> : panels.layers && <LayersPanel />}
          {panels.properties && <PropertiesPanel />}
          <BottomBar onFit={fit} />
          {menu && (
            <ProjectMenu
              onClose={() => setMenu(false)}
              onOpen={async (id) => {
                const p = await loadProject(id);
                if (p) open(p);
              }}
              onNew={() => {
                setMenu(false);
                setScreen('wizard');
              }}
              onSample={() => createAndOpen(createLindenweg12())}
              onImport={importFile}
              onExportJson={exportJson}
            />
          )}
          {exporting && <ExportDialog onClose={() => setExporting(false)} />}
        </>
      )}
      {screen === 'wizard' && (
        <NewProjectWizard
          canCancel={!!docId}
          onCancel={() => setScreen('editor')}
          onSample={() => createAndOpen(createLindenweg12())}
          onCreate={({ project, backgroundBlob }) => createAndOpen(project, backgroundBlob && project.background ? { [project.background.blobId]: backgroundBlob } : {})}
        />
      )}
      {toast && (
        <div className={toast.error ? ps.toastErr : ps.toast} role="status" data-testid="toast">
          {toast.text}
        </div>
      )}
    </PlanCanvas>
  );
}
