import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { PlanRenderer } from '../../render/PlanRenderer';
import { editor } from '../../state';
import styles from './PlanCanvas.module.css';

const RendererContext = createContext<PlanRenderer | null>(null);
export const useRenderer = () => useContext(RendererContext);

/** Vollflächige Planfläche; stellt den Renderer für Werkzeuge und UI bereit */
export function PlanCanvas({ children, onReady }: { children?: React.ReactNode; onReady?: (r: PlanRenderer) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [renderer, setRenderer] = useState<PlanRenderer | null>(null);

  useEffect(() => {
    const r = new PlanRenderer(editor);
    let alive = true;
    r.init(host.current!).then(() => {
      if (!alive) return r.destroy();
      setRenderer(r);
      onReady?.(r);
    });
    return () => {
      alive = false;
      if (r.app.renderer) r.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <RendererContext.Provider value={renderer}>
      <div ref={host} className={styles.host} data-testid="plan-canvas" />
      {renderer && children}
    </RendererContext.Provider>
  );
}
