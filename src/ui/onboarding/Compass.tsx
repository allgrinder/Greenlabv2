/** Ziehbarer Kompass für die Nordrichtung im Projekt-Assistenten */
import { useRef } from 'react';
import s from './onboarding.module.css';

/** Kompass: Ziehen dreht die Nordrichtung (1°-Schritte) */
export function Compass({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const set = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const a = (Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180) / Math.PI;
    onChange(Math.round(a));
  };
  return (
    <div
      ref={ref}
      className={s.compass}
      role="slider"
      aria-label="Nordrichtung"
      aria-valuenow={value}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') onChange(Math.max(-180, value - 1));
        if (e.key === 'ArrowRight') onChange(Math.min(180, value + 1));
      }}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        set(e);
      }}
      onPointerMove={(e) => e.buttons && set(e)}
    >
      <svg width="84" height="84" viewBox="0 0 84 84">
        <g stroke="rgba(31,34,36,.25)" strokeWidth="1">
          <path d="M42 6v5M42 73v5M6 42h5M73 42h5" />
        </g>
        <g transform={`rotate(${value} 42 42)`} style={{ transition: 'transform .12s var(--ease)' }}>
          <path d="M42 16l6 26h-12Z" fill="#C4553A" />
          <path d="M42 68l-6-26h12Z" fill="#B9BBB5" />
          <circle cx="42" cy="42" r="3" fill="#fff" stroke="#1F2224" strokeWidth="1.2" />
        </g>
      </svg>
      <span className={s.compassN}>N</span>
    </div>
  );
}
