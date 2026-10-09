import { useCallback, useEffect, useRef, useState } from 'react';
import { bbox } from '../core/geometry/polygon';
import type { Project } from '../core/model/types';
import { createBenchmark } from '../core/sample/benchmark';
import { createMustergarten } from '../core/sample/mustergarten';
import { startAutosave, type SaveState } from '../persistence/autosave';
import { getBlob, getThumbnail, lastProjectId, listProjects, loadProject, putBlob, putThumbnail, rememberLast, rememberSample, sampleProjectId, saveProject } from '../persistence/db';
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
import { CostsView } from './lenses/CostsView';
import { GrowthBar, GrowthPanel } from './lenses/GrowthLens';
import { IrrigationPanel } from './lenses/IrrigationPanel';
import { NightPanel, NightPill } from './lenses/NightPanel';
import { SeasonsView } from './lenses/SeasonsView';
import { SunBar, SunPanel } from './lenses/SunLens';
import { NewProjectWizard } from './onboarding/NewProjectWizard';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { PrivacyDock } from './panels/PrivacyPanel';
import { ProjectMenu } from './projects/ProjectMenu';
import ps from './projects/projects.module.css';
import { StartScreen } from './start/StartScreen';

/** Von Panels verdeckte Ränder, damit „Einpassen“ den Plan in die freie Mitte legt */
export const PLAN_INSETS = { left: 316, right: 330, top: 84, bottom: 80 };

type Screen = 'start' | 'wizard' | 'editor';

/** Renderer, sobald die Planfläche ihn erzeugt hat (Startseite und Assistent warten nicht darauf) */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

export function App() {
  const mode = useEditor((s) => s.session.mode);
  const panels = useEditor((s) => s.session.panels);
  const docId = useEditor((s) => s.doc?.id);
  const lens = useEditor((s) => s.session.lens);
  const night = useEditor((s) => s.session.mode === 'night');
  const hasSelection = useEditor((s) => s.session.selection.length > 0);
  const techSelected = useEditor((s) => s.session.selection.some((id) => ['sprinkler', 'drip', 'pipe', 'fixture'].includes(s.doc?.objects[id]?.type ?? '')));
  const leftPanels = lens === 'plan' || lens === 'irrigation' || lens === 'privacy';
  const bgBlobId = useEditor((s) => s.doc?.background?.blobId ?? null);
  const benchmark = useRef(Number(new URLSearchParams(location.search).get('bench')) || 0);
  const [screen, setScreen] = useState<Screen>(benchmark.current ? 'editor' : 'start');
  /** Startseite blendet nach dem Öffnen noch aus */
  const [fading, setFading] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const rendererReady = useRef(deferred<PlanRenderer>());
  const prefetched = useRef(new Set<string>());
  const prevScreen = useRef<Screen>('start');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [menu, setMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [renderer, setRenderer] = useState<PlanRenderer | null>(null);

  const notify = useCallback((text: string, error = false) => {
    setToast({ text, error });
    setTimeout(() => setToast((t) => (t?.text === text ? null : t)), error ? 6000 : 3000);
  }, []);

  /** Vorschaubild des offenen Gartens für die Startseite ablegen */
  const saveThumb = useCallback(async () => {
    const doc = editor.getState().doc;
    if (!renderer || !doc || benchmark.current) return;
    try {
      const blob = await renderer.thumbnail();
      if (blob) await putThumbnail(doc.id, blob);
    } catch (e) {
      console.warn('Vorschaubild nicht gespeichert', e);
    }
  }, [renderer]);

  const switchTo = useCallback((next: Screen) => {
    setScreen((cur) => {
      prevScreen.current = cur;
      if (cur === 'start' && next === 'editor') {
        setFading(true);
        setTimeout(() => setFading(false), 420);
      }
      return next;
    });
  }, []);

  /**
   * Garten öffnen: erst wenn Grundbilder und seine Pflanzenbilder bereit sind, laden und einmal zeichnen,
   * dann die Startseite ausblenden – kein schrittweises Aufploppen.
   */
  const open = useCallback(
    async (p: Project) => {
      setOpening(p.id);
      try {
        const r = await rendererReady.current.promise;
        if (screen === 'editor' && editor.getState().doc?.id !== p.id) await saveThumb();
        if (!benchmark.current) await r.prepare(p);
        editor.getState().loadProject(p);
        rememberLast(p.id);
        editor.getState().setSession({ viewport: fitBBox(bbox(p.site.boundary), r.size, PLAN_INSETS, 40, editor.getState().session.viewport.tiltDeg ?? 0) });
        await r.nextFrame();
        await r.nextFrame();
        switchTo('editor');
        setMenu(false);
        // Mustergarten oder ältere Gärten haben noch kein Vorschaubild
        if (!benchmark.current && !(await getThumbnail(p.id).catch(() => null))) setTimeout(() => void saveThumbFor(r, p.id), 600);
      } finally {
        setOpening(null);
      }
    },
    [screen, saveThumb, switchTo],
  );

  const openId = useCallback(
    async (id: string) => {
      try {
        const p = await loadProject(id);
        if (p) return open(p);
        notify('Garten nicht gefunden.', true);
      } catch (e) {
        console.error(e);
        notify('Lokaler Speicher nicht verfügbar – Änderungen werden nicht gesichert.', true);
      }
    },
    [open, notify],
  );

  /** Pflanzenbilder eines Gartens laden, während der Mauszeiger über seiner Karte ist */
  const prefetch = useCallback((id: string) => {
    if (prefetched.current.has(id)) return;
    prefetched.current.add(id);
    void Promise.all([loadProject(id), rendererReady.current.promise])
      .then(async ([p, r]) => {
        if (!p) return;
        await r.ready;
        await r.prefetch(p);
      })
      .catch(() => prefetched.current.delete(id));
  }, []);

  const goStart = useCallback(async () => {
    setMenu(false);
    await saveThumb();
    switchTo('start');
  }, [saveThumb, switchTo]);

  // Start: Benchmark direkt, sonst Startseite; den zuletzt bearbeiteten Garten schon im Hintergrund vorladen
  useEffect(() => {
    if (benchmark.current) {
      void open(createBenchmark(benchmark.current));
      return;
    }
    (async () => {
      try {
        const id = lastProjectId() ?? (await listProjects())[0]?.id;
        if (id) prefetch(id);
      } catch (e) {
        console.error(e);
        notify('Lokaler Speicher nicht verfügbar – Änderungen werden nicht gesichert.', true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Vorschaubild auch beim Verlassen der Seite (Tab schließen, App wechseln)
  useEffect(() => {
    if (screen !== 'editor') return;
    const onHide = () => document.visibilityState === 'hidden' && void saveThumb();
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [screen, saveThumb]);

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
    editor.getState().setSession({ viewport: fitBBox(bbox(doc.site.boundary), renderer.size, PLAN_INSETS, 40, editor.getState().session.viewport.tiltDeg ?? 0) });
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
    await open(p);
  };

  /** Mustergarten: die gespeicherte Kopie öffnen, nur beim ersten Mal anlegen */
  const openSample = async () => {
    const id = sampleProjectId();
    const existing = id ? await loadProject(id).catch(() => null) : null;
    if (existing) return open(existing);
    const p = createMustergarten();
    rememberSample(p.id);
    await createAndOpen(p);
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

  const costPdf = async () => {
    const doc = editor.getState().doc;
    if (!doc) return;
    try {
      const { costPdfBlob } = await import('./export/pdf');
      downloadBlob(await costPdfBlob(doc), `${fileSafe(doc.name)}_Kosten.pdf`);
    } catch (e) {
      notify((e as Error).message, true);
    }
  };

  return (
    <>
      <PlanCanvas
        onReady={(r) => {
          setRenderer(r);
          rendererReady.current.resolve(r);
          setProgress(r.progress);
          r.onProgress = setProgress;
          if (import.meta.env.DEV) Object.assign(window, { __gw: { renderer: r, editor } });
        }}
      >
        {screen === 'editor' && docId && (
          <>
            <ToolLayer onFit={fit} />
            <TopBar saveState={saveState} onExport={() => setExporting(true)} onProjects={() => setMenu((m) => !m)} onHome={goStart} />
            <ToolRail />
            {leftPanels && (panels.library ? <LibraryPanel /> : panels.layers && <LayersPanel />)}
            {lens === 'sun' && (
              <>
                <SunBar />
                <SunPanel />
              </>
            )}
            {lens === 'growth' && (
              <>
                <GrowthBar />
                <GrowthPanel />
              </>
            )}
            {lens === 'seasons' && <SeasonsView />}
            {lens === 'privacy' && (hasSelection ? panels.properties && <PropertiesPanel /> : <PrivacyDock />)}
            {lens === 'irrigation' && (techSelected ? panels.properties && <PropertiesPanel /> : <IrrigationPanel />)}
            {(lens === 'plan' || lens === 'costs') && (night && !hasSelection ? <NightPanel /> : panels.properties && <PropertiesPanel />)}
            {night && lens !== 'seasons' && lens !== 'privacy' && <NightPill />}
            {lens === 'costs' && <CostsView onClose={() => editor.getState().setSession({ lens: 'plan' })} onPdf={costPdf} />}
            <BottomBar onFit={fit} />
            {menu && (
              <ProjectMenu
                onClose={() => setMenu(false)}
                onOpen={openId}
                onHome={goStart}
                onNew={() => {
                  setMenu(false);
                  switchTo('wizard');
                }}
                onSample={openSample}
                onImport={importFile}
                onExportJson={exportJson}
              />
            )}
            {exporting && <ExportDialog onClose={() => setExporting(false)} />}
          </>
        )}
      </PlanCanvas>
      {(screen === 'start' || fading) && (
        <StartScreen
          progress={progress}
          opening={opening}
          leaving={screen !== 'start'}
          onOpen={openId}
          onHover={prefetch}
          onNew={() => switchTo('wizard')}
          onSample={openSample}
          onImport={importFile}
        />
      )}
      {screen === 'wizard' && (
        <NewProjectWizard
          canCancel
          onCancel={() => switchTo(prevScreen.current === 'editor' && docId ? 'editor' : 'start')}
          onSample={openSample}
          onCreate={({ project, backgroundBlob }) => createAndOpen(project, backgroundBlob && project.background ? { [project.background.blobId]: backgroundBlob } : {})}
        />
      )}
      {toast && (
        <div className={toast.error ? ps.toastErr : ps.toast} role="status" data-testid="toast">
          {toast.text}
        </div>
      )}
    </>
  );
}

async function saveThumbFor(r: PlanRenderer, id: string) {
  if (editor.getState().doc?.id !== id) return;
  try {
    const blob = await r.thumbnail();
    if (blob) await putThumbnail(id, blob);
  } catch (e) {
    console.warn('Vorschaubild nicht gespeichert', e);
  }
}
