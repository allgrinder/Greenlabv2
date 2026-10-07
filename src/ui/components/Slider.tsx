import { useRef } from 'react';
import { editor } from '../../state';
import s from './slider.module.css';

/**
 * Regler im Stil des Designs (Screen 03/06/07): Spur, Füllung, runder Knopf.
 * Ziehen erzeugt Zwischenwerte; beim Loslassen schließt `onEnd` die Geste ab (ein Undo-Schritt).
 */
export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  onEnd,
  fill = 'var(--acc)',
  track,
  knobColor,
  label,
  testId,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  onEnd?: () => void;
  fill?: string | null;
  track?: string;
  knobColor?: string;
  label: string;
  testId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pct = ((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100;
  const set = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    let v = min + ((clientX - r.left) / r.width) * (max - min);
    v = Math.round(v / step) * step;
    v = Math.min(max, Math.max(min, +v.toFixed(6)));
    if (v !== value) onChange(v);
  };
  return (
    <div
      ref={ref}
      className={s.slider}
      role="slider"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      data-testid={testId}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        set(e.clientX);
      }}
      onPointerMove={(e) => e.buttons && set(e.clientX)}
      onPointerUp={() => (onEnd ? onEnd() : editor.getState().endGesture())}
      onKeyDown={(e) => {
        const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? step : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -step : 0;
        if (!d) return;
        e.preventDefault();
        e.stopPropagation();
        onChange(Math.min(max, Math.max(min, +(value + d).toFixed(6))));
      }}
      onKeyUp={() => (onEnd ? onEnd() : editor.getState().endGesture())}
    >
      <div className={s.track} style={track ? { background: track, height: 6, top: 6 } : undefined} />
      {fill && <div className={s.fill} style={{ width: `${pct}%`, background: fill }} />}
      <div className={s.knob} style={{ left: `${pct}%`, ...(knobColor ? { background: knobColor, boxShadow: '0 0 0 2px #fff, 0 1px 4px rgba(0,0,0,.4)' } : {}) }} />
    </div>
  );
}
