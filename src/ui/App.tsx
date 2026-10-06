import { useEffect } from 'react';
import { bbox } from '../core/geometry/polygon';
import { createBenchmark } from '../core/sample/benchmark';
import { createLindenweg12 } from '../core/sample/lindenweg12';
import { fitBBox } from '../render/Viewport';
import { editor, useEditor } from '../state';
import { PlanCanvas } from './canvas/PlanCanvas';

export function App() {
  const mode = useEditor((s) => s.session.mode);

  useEffect(() => {
    if (editor.getState().doc) return;
    const bench = Number(new URLSearchParams(location.search).get('bench'));
    editor.getState().loadProject(bench > 0 ? createBenchmark(bench) : createLindenweg12());
  }, []);

  useEffect(() => {
    document.documentElement.dataset.mode = mode;
  }, [mode]);

  return (
    <PlanCanvas
      onReady={(r) => {
        if (import.meta.env.DEV) Object.assign(window, { __gw: { renderer: r, editor } });
        const doc = editor.getState().doc;
        if (!doc) return;
        const vp = fitBBox(bbox(doc.site.boundary), r.size, { left: 72, right: 330, top: 84, bottom: 80 });
        editor.getState().setSession({ viewport: vp });
      }}
    />
  );
}
