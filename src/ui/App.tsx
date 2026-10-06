import { useCallback, useEffect, useRef } from 'react';
import { bbox } from '../core/geometry/polygon';
import { createBenchmark } from '../core/sample/benchmark';
import { createLindenweg12 } from '../core/sample/lindenweg12';
import type { PlanRenderer } from '../render/PlanRenderer';
import { fitBBox } from '../render/Viewport';
import { editor, useEditor } from '../state';
import { PlanCanvas } from './canvas/PlanCanvas';
import { ToolLayer } from './canvas/ToolLayer';
import { BottomBar } from './chrome/BottomBar';
import { LayersPanel } from './chrome/LayersPanel';
import { ToolRail } from './chrome/ToolRail';
import { TopBar } from './chrome/TopBar';
import { PropertiesPanel } from './panels/PropertiesPanel';

/** Von Panels verdeckte Ränder, damit „Einpassen“ den Plan in die freie Mitte legt */
export const PLAN_INSETS = { left: 72, right: 330, top: 84, bottom: 80 };

export function App() {
  const mode = useEditor((s) => s.session.mode);
  const panels = useEditor((s) => s.session.panels);
  const hasDoc = useEditor((s) => !!s.doc);
  const rendererRef = useRef<PlanRenderer | null>(null);

  useEffect(() => {
    if (editor.getState().doc) return;
    const bench = Number(new URLSearchParams(location.search).get('bench'));
    editor.getState().loadProject(bench > 0 ? createBenchmark(bench) : createLindenweg12());
  }, []);

  useEffect(() => {
    document.documentElement.dataset.mode = mode;
  }, [mode]);

  const fit = useCallback(() => {
    const r = rendererRef.current;
    const doc = editor.getState().doc;
    if (!r || !doc) return;
    editor.getState().setSession({ viewport: fitBBox(bbox(doc.site.boundary), r.size, PLAN_INSETS) });
  }, []);

  return (
    <PlanCanvas
      onReady={(r) => {
        rendererRef.current = r;
        if (import.meta.env.DEV) Object.assign(window, { __gw: { renderer: r, editor } });
        fit();
      }}
    >
      {hasDoc && (
        <>
          <ToolLayer onFit={fit} />
          <TopBar saveState="saved" onExport={() => {}} onProjects={() => {}} />
          <ToolRail />
          {panels.layers && <LayersPanel />}
          {panels.properties && <PropertiesPanel />}
          <BottomBar onFit={fit} />
        </>
      )}
    </PlanCanvas>
  );
}
