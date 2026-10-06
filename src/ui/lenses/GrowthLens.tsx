/**
 * Linse „Wachstum“ (Screen 07): Zeitreise von heute bis in 20 Jahren,
 * Entwicklung je Gehölz und Hinweise auf künftige Konflikte.
 */
import { useMemo, useRef } from 'react';
import { num } from '../../core/format';
import { conflictText, growthConflicts, growthRows } from '../../core/growthReport';
import { editor, useEditor } from '../../state';
import s from './lenses.module.css';

const STOPS: [number, string][] = [
  [0, 'Heute'],
  [5, '5 Jahre'],
  [10, '10 Jahre'],
  [20, '20 Jahre'],
];
const MAX = 20;
const NOW = new Date();
const MONTH = new Intl.DateTimeFormat('de-DE', { month: 'long' }).format(NOW);

const setYears = (y: number) => editor.getState().setSession({ years: Math.round(Math.min(MAX, Math.max(0, y))) });

export function GrowthBar() {
  const years = useEditor((st) => st.session.years);
  const ref = useRef<HTMLDivElement>(null);
  const pct = (v: number) => `${(v / MAX) * 100}%`;
  const drag = (x: number) => {
    const r = ref.current!.getBoundingClientRect();
    setYears(((x - r.left) / r.width) * MAX);
  };
  return (
    <div className={s.bottomPanel} style={{ flexDirection: 'column', gap: 14, padding: '18px 22px 20px' }} data-testid="growth-bar">
      <div className={s.row} style={{ alignItems: 'baseline' }}>
        <span className={s.big} data-testid="growth-label">
          {years === 0 ? 'Heute' : `in ${years} ${years === 1 ? 'Jahr' : 'Jahren'}`}
        </span>
        <span className={s.sub}>{years === 0 ? `${MONTH} ${NOW.getFullYear()}, Pflanzgrößen` : `${NOW.getFullYear() + years}, geschätzte Kronen und Heckenbreite`}</span>
        <span className={s.muted} style={{ marginLeft: 'auto', fontSize: 12.5 }}>
          Wuchs nach Standort und Sorte
        </span>
      </div>
      <div
        ref={ref}
        className={s.yearTrack}
        role="slider"
        aria-label="Jahre ab heute"
        aria-valuemin={0}
        aria-valuemax={MAX}
        aria-valuenow={years}
        tabIndex={0}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag(e.clientX);
        }}
        onPointerMove={(e) => e.buttons && drag(e.clientX)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') setYears(years + 1);
          if (e.key === 'ArrowLeft') setYears(years - 1);
          e.stopPropagation();
        }}
        data-testid="growth-slider"
      >
        <div className={s.yearRail} />
        <div className={s.yearFill} style={{ width: pct(years) }} />
        {STOPS.map(([v, n]) => (
          <button key={v} type="button" className={s.yearStop} style={{ left: pct(v) }} onPointerDown={(e) => e.stopPropagation()} onClick={() => setYears(v)} tabIndex={-1}>
            <span className={s.yearDot} />
            <span className={s.yearLabel}>{n}</span>
          </button>
        ))}
        <div className={s.yearKnob} style={{ left: pct(years) }} />
      </div>
    </div>
  );
}

export function GrowthPanel() {
  const doc = useEditor((st) => st.doc);
  const years = useEditor((st) => st.session.years);
  const rows = useMemo(() => (doc ? growthRows(doc, years) : []), [doc, years]);
  const conflicts = useMemo(() => (doc ? growthConflicts(doc) : []), [doc]);
  if (!doc) return null;
  const visible = conflicts.filter((c) => c.years <= Math.max(years, 20)).slice(0, 2);
  return (
    <aside className={s.rightPanel} aria-label="Entwicklung" data-testid="growth-panel">
      <div className={s.head}>
        <span className={s.title}>Entwicklung</span>
        <span className={s.mono} style={{ fontSize: 11, color: 'var(--ink3)' }}>
          {NOW.getFullYear() + years}
        </span>
      </div>
      {rows.map((r) => (
        <div key={r.name} className={s.growthItem}>
          <div className={s.row} style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontWeight: 500 }}>{r.name}</span>
            <span className={s.mono} style={{ fontSize: 12 }}>
              {r.prefix} {num(r.value, 1)} m
            </span>
          </div>
          <div className={s.bar}>
            <div
              className={s.barFill}
              style={{
                width: `${Math.min(100, (r.value / Math.max(0.01, r.max)) * 100)}%`,
              }}
            />
          </div>
          <div
            className={s.row}
            style={{
              justifyContent: 'space-between',
              fontSize: 11,
              color: 'var(--ink3)',
            }}
          >
            <span>{r.note}</span>
            <span>Endgröße {num(r.max, r.max % 1 ? 1 : 0)} m</span>
          </div>
        </div>
      ))}
      {!rows.length && <div className={s.muted}>Noch keine Gehölze im Plan.</div>}
      {visible.map((c) => (
        <div key={c.plantId} className={s.warn} data-testid="growth-warning" style={c.years <= years ? undefined : { opacity: 0.85 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" style={{ flex: 'none', marginTop: 1 }} aria-hidden>
            <path d="M12 4l9 16H3Z M12 10v4M12 17h.01" stroke="#B9724F" strokeWidth="1.7" fill="none" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          <span>{conflictText(c)}</span>
        </div>
      ))}
      {rows.length > 0 && !conflicts.length && <div className={s.ok}>In den nächsten 20 Jahren wächst keine Krone an Wege, Bauten oder die Grenze heran.</div>}
    </aside>
  );
}
