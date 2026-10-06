import { useEffect } from 'react';
import { ToolController } from '../../tools/ToolController';
import { cmd, editor } from '../../state';
import { useRenderer } from './PlanCanvas';

/** Bindet den ToolController an die Planfläche (ohne eigenes Markup) */
export function ToolLayer({ onFit }: { onFit: () => void }) {
  const renderer = useRenderer();
  useEffect(() => {
    if (!renderer) return;
    const tc = new ToolController(renderer.app.canvas as HTMLCanvasElement, editor, renderer, cmd, onFit);
    if (import.meta.env.DEV) Object.assign(window, { __gwTools: tc });
    return () => tc.destroy();
  }, [renderer, onFit]);
  return null;
}
