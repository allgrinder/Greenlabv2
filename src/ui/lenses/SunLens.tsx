/**
 * Linse „Sonne & Schatten“ (Screen 06): Uhrzeit über der Höhenkurve ziehen, Datum wählen,
 * Heatmap „Sonnenstunden pro Tag“ mit Empfehlungen.
 */
import { useMemo, useRef } from 'react';
import { num } from '../../core/format';
import { HEAT_STOPS, sunHours } from '../../core/sun/shadows';
import { rankSpots } from '../../core/sun/recommend';
import { DEFAULT_LOCATION, dayInfo, formatHour, sunAt } from '../../core/sun/sun';
import { editor, useEditor } from '../../state';
import { Toggle } from '../components/controls';
import u from '../components/ui.module.css';
import s from './lenses.module.css';

const DATES: [string, number][] = [
  ['21. März', 80],
  ['21. Juni', 172],
  ['23. Sept.', 266],
  ['21. Dez.', 355],
];
const H0 = 5;
const H1 = 21;
const YEAR = new Date().getFullYear();

const dateLabel = (doy: number) => {
  const preset = DATES.find((d) => d[1] === doy);
  if (preset) return preset[0];
  return new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' }).format(new Date(YEAR, 0, doy));
};

export function SunBar() {
  const sun = useEditor((st) => st.session.sun);
  const loc = useEditor((st) => st.doc?.site.location) ?? DEFAULT_LOCATION;
  const northDeg = useEditor((st) => st.doc?.site.northDeg ?? 0);
  const set = (patch: Partial<typeof sun>) => editor.getState().setSession({ sun: { ...editor.getState().session.sun, ...patch } });
  const curveRef = useRef<HTMLDivElement>(null);

  const info = useMemo(() => dayInfo(loc, YEAR, sun.doy), [loc, sun.doy]);
  const now = useMemo(() => sunAt(loc, YEAR, sun.doy, sun.hour), [loc, sun.doy, sun.hour]);
  const curve = useMemo(() => {
    const pts: [number, number][] = [];
    for (let h = H0; h <= H1 + 1e-6; h += 0.25) {
      const a = Math.max(0, sunAt(loc, YEAR, sun.doy, h).altitudeDeg);
      pts.push([((h - H0) / (H1 - H0)) * 1000, 55 - (a / 66) * 50]);
    }
    const d = 'M' + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L');
    return { line: d, area: `${d}L1000 56L0 56Z` };
  }, [loc, sun.doy]);
  // Sonnenbahn im Kompass (Planorientierung: Nord gedreht)
  const dial = useMemo(() => {
    const R = 36;
    const pos = (az: number, alt: number) => {
      const r = R * (1 - (Math.max(0, alt) / 90) * 0.6);
      const t = ((az + northDeg) * Math.PI) / 180;
      return [46 + Math.sin(t) * r, 46 - Math.cos(t) * r];
    };
    const arc: string[] = [];
    if (info.sunrise !== null && info.sunset !== null)
      for (let h = info.sunrise; h <= info.sunset; h += 0.5) {
        const q = sunAt(loc, YEAR, sun.doy, h);
        const [x, y] = pos(q.azimuthDeg, q.altitudeDeg);
        arc.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
      }
    const [sx, sy] = pos(now.azimuthDeg, now.altitudeDeg);
    return { arc: arc.length ? 'M' + arc.join('L') : '', sx, sy };
  }, [info, loc, sun.doy, now, northDeg]);

  const pct = ((sun.hour - H0) / (H1 - H0)) * 100;
  const dragTo = (clientX: number) => {
    const r = curveRef.current!.getBoundingClientRect();
    const h = H0 + Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * (H1 - H0);
    set({ hour: Math.round(h * 4) / 4 });
  };

  return (
    <div className={s.bottomPanel} data-testid="sun-bar">
      <div style={{ width: 150, flex: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ position: 'relative', width: 92, height: 92 }}>
          <svg width="92" height="92" viewBox="0 0 92 92" aria-label="Sonnenbahn">
            <circle cx="46" cy="46" r="36" fill="none" stroke="var(--line)" />
            <circle cx="46" cy="46" r="22" fill="none" stroke="var(--line)" strokeDasharray="2 3" />
            <path d={dial.arc} fill="none" stroke="#E2A33B" strokeWidth="1.4" strokeDasharray="3 3" />
            {now.altitudeDeg > 0 && <line x1="46" y1="46" x2={dial.sx} y2={dial.sy} stroke="#E2A33B" strokeWidth="1.2" />}
            <circle cx={dial.sx} cy={dial.sy} r="6.5" fill={now.altitudeDeg > 0 ? '#F1B648' : '#8C8E88'} stroke="#fff" strokeWidth="2" />
            <circle cx="46" cy="46" r="2.5" fill="var(--ink)" />
          </svg>
          <span style={{ position: 'absolute', left: 0, right: 0, top: -4, textAlign: 'center', fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 11, color: 'var(--ink2)', transform: `rotate(${northDeg}deg)` }}>N</span>
        </div>
        <div className={s.mono} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: 'var(--ink2)' }}>
          <span>Azimut {num(now.azimuthDeg, 0)}°</span>
          <span>Höhe {num(Math.max(0, now.altitudeDeg), 0)}°</span>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
        <div className={s.row} style={{ flexWrap: 'wrap' }}>
          <span className={s.big} data-testid="sun-time">
            {formatHour(sun.hour)}
          </span>
          <span className={s.sub}>
            {dateLabel(sun.doy)} · Aufgang {info.sunrise !== null ? formatHour(info.sunrise) : '–'} · Untergang {info.sunset !== null ? formatHour(info.sunset) : '–'}
          </span>
          <div className={u.segmented} style={{ marginLeft: 'auto' }}>
            {DATES.map(([n, d]) => (
              <button key={d} type="button" className={sun.doy === d ? u.segmentOn : u.segment} onClick={() => set({ doy: d })} data-testid={`sun-date-${d}`}>
                {n}
              </button>
            ))}
            <input
              type="date"
              aria-label="Datum"
              className={u.segment}
              style={{ border: 0, background: 'transparent', width: 34, padding: '4px 6px', color: 'transparent' }}
              title="Anderes Datum"
              onChange={(e) => {
                const d = new Date(e.target.value);
                if (!isNaN(+d)) set({ doy: Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 1)) / 86400000) + 1 });
              }}
            />
          </div>
        </div>
        <div
          ref={curveRef}
          className={s.curve}
          role="slider"
          aria-label="Uhrzeit"
          aria-valuemin={H0}
          aria-valuemax={H1}
          aria-valuenow={sun.hour}
          tabIndex={0}
          onPointerDown={(e) => {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            dragTo(e.clientX);
          }}
          onPointerMove={(e) => e.buttons && dragTo(e.clientX)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') set({ hour: Math.min(H1, sun.hour + 0.25) });
            if (e.key === 'ArrowLeft') set({ hour: Math.max(H0, sun.hour - 0.25) });
            e.stopPropagation();
          }}
          data-testid="sun-curve"
        >
          <svg viewBox="0 0 1000 56" preserveAspectRatio="none">
            <path d={curve.area} fill="rgba(226,163,59,.14)" />
            <path d={curve.line} fill="none" stroke="#E2A33B" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            <path d="M0 55.5H1000" stroke="var(--line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          </svg>
          <div className={s.needle} style={{ left: `${pct}%` }} />
          <div className={s.handle} style={{ left: `${pct}%` }} />
          <div className={s.curveTicks}>
            {[5, 8, 11, 14, 17, 20].map((h) => (
              <span key={h}>{String(h).padStart(2, '0')}</span>
            ))}
            <span>21</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SunPanel() {
  const doc = useEditor((st) => st.doc);
  const sun = useEditor((st) => st.session.sun);
  const loc = doc?.site.location ?? DEFAULT_LOCATION;
  const grid = useMemo(() => (doc ? sunHours(doc, loc, YEAR, sun.doy, { cell: 1, stepMin: 30 }) : null), [doc, loc, sun.doy]);
  const spots = useMemo(() => (doc && grid ? rankSpots(doc, grid) : []), [doc, grid]);
  const gradient = `linear-gradient(90deg, ${HEAT_STOPS.map(([h, c]) => `rgb(${c.join(',')}) ${((h / 13) * 100).toFixed(0)}%`).join(', ')})`;
  if (!doc) return null;
  return (
    <aside className={s.rightPanel} aria-label="Sonnenstunden" data-testid="sun-panel">
      <div className={s.head}>
        <span className={s.title}>Sonnenstunden</span>
        <Toggle label="Heatmap" on={sun.heat} onChange={(v) => editor.getState().setSession({ sun: { ...sun, heat: v } })} />
      </div>
      <div className={s.col} style={{ gap: 6 }}>
        <div className={s.legendBar} style={{ background: gradient }} />
        <div className={s.ticks}>
          <span>0 h</span>
          <span>4</span>
          <span>7</span>
          <span>10</span>
          <span>13+ h</span>
        </div>
        <div className={s.muted}>Direkte Sonne pro Tag am {dateLabel(sun.doy)}{grid ? ` · Tageslänge ${num(grid.dayLength, 1)} h` : ''}</div>
      </div>
      <div className={s.col}>
        <div className={u.eyebrow}>Empfehlungen</div>
        {spots.map((r) => (
          <div key={r.name} className={s.reco}>
            <span className={s.recoDot} style={{ background: r.color }} />
            <div>
              <div className={s.recoTitle}>
                {r.name} · {num(r.hours, 0)} h
              </div>
              <div className={s.recoText}>{r.text}</div>
            </div>
          </div>
        ))}
        {!spots.length && <div className={s.muted}>Lege Beete oder Pflanzungen an, um Empfehlungen zu erhalten.</div>}
      </div>
    </aside>
  );
}
