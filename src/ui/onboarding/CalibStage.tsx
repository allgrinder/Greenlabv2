/** Bühne zum Ausrichten im Projekt-Assistenten: zwei Punkte im Hintergrundbild setzen */
import { useEffect, useRef, useState } from 'react';
import { num } from '../../core/format';
import { dist } from '../../core/geometry/vec';
import type { Vec2 } from '../../core/model/types';
import type { BgDraft } from './wizardModel';
import s from './onboarding.module.css';

/** Ausrichten: Bild einpassen, zwei Punkte setzen (Bildpixel) */
export function CalibStage({ bg, onPoint }: { bg: BgDraft; onPoint: (a: Vec2 | null, b: Vec2 | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 700 });
  const [hover, setHover] = useState<Vec2 | null>(null);
  useEffect(() => {
    const ro = new ResizeObserver(() => ref.current && setSize({ w: ref.current.clientWidth, h: ref.current.clientHeight }));
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const pad = 40;
  const k = Math.min((size.w - pad * 2) / bg.w, (size.h - pad * 2) / bg.h);
  const ox = (size.w - bg.w * k) / 2;
  const oy = (size.h - bg.h * k) / 2;
  const toScreen = (p: Vec2) => ({ x: ox + p.x * k, y: oy + p.y * k });
  const toImage = (e: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left - ox) / k, y: (e.clientY - r.top - oy) / k };
  };
  const A = bg.a && toScreen(bg.a);
  const B = (bg.b && toScreen(bg.b)) ?? (bg.a && hover ? toScreen(hover) : null);
  const pxLen = bg.a && (bg.b ?? hover) ? dist(bg.a, (bg.b ?? hover)!) : 0;
  return (
    <div
      ref={ref}
      style={{ position: 'absolute', inset: 0, cursor: 'crosshair' }}
      onMouseMove={(e) => setHover(toImage(e))}
      onClick={(e) => {
        const p = toImage(e);
        if (p.x < 0 || p.y < 0 || p.x > bg.w || p.y > bg.h) return;
        if (!bg.a || bg.b) onPoint(p, null);
        else onPoint(bg.a, p);
      }}
      data-testid="calib-stage"
    >
      <img src={bg.url} alt="" style={{ position: 'absolute', left: ox, top: oy, width: bg.w * k, height: bg.h * k, opacity: bg.opacity, pointerEvents: 'none' }} />
      <svg width={size.w} height={size.h} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {A && B && <path d={`M${A.x} ${A.y}L${B.x} ${B.y}`} stroke="#E0567A" strokeWidth="2" />}
        {[A, bg.b && B].map((P, i) =>
          P ? (
            <g key={i}>
              <circle cx={P.x} cy={P.y} r="9" fill="#fff" stroke="#E0567A" strokeWidth="2" />
              <text x={P.x} y={P.y + 3.5} textAnchor="middle" fontFamily="Geist Mono, monospace" fontSize="10" fontWeight="700" fill="#E0567A">
                {i + 1}
              </text>
            </g>
          ) : null,
        )}
      </svg>
      {A && B && (
        <div className={s.pillPink} style={{ left: (A.x + B.x) / 2, top: (A.y + B.y) / 2 - 18 }}>
          {num(pxLen, 0)} px
        </div>
      )}
      <div className={s.tipDark} style={{ left: 20, bottom: 20 }}>
        {!bg.a ? 'Punkt 1 anklicken, z. B. eine Grundstücksecke' : !bg.b ? 'Punkt 2 anklicken, möglichst weit entfernt' : 'Links die Ecken zuordnen und „Ausrichten“ – erneut klicken setzt neu'}
      </div>
    </div>
  );
}
