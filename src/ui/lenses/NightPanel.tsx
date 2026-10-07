/**
 * Nachtmodus (Screen 03/05): Uhrzeit-Pille oben, Lichtszenen rechts mit Gesamtleistung
 * und Stromkosten pro Abend. Ohne Szene gelten die Zeitpläne der Leuchten.
 */
import { useMemo } from 'react';
import { euros, num } from '../../core/format';
import { nightStats, SCENES } from '../../core/lighting';
import type { LampObject } from '../../core/model/types';
import { DEFAULT_LOCATION, dayInfo, formatHour } from '../../core/sun/sun';
import { editor, useEditor } from '../../state';
import { Slider } from '../components/Slider';
import u from '../components/ui.module.css';
import s from './lenses.module.css';

const YEAR = new Date().getFullYear();
const WEEKDAY = (new Date().getDay() + 6) % 7;

function useSunTimes() {
  const loc = useEditor((st) => st.doc?.site.location) ?? DEFAULT_LOCATION;
  const doy = useEditor((st) => st.session.sun.doy);
  return useMemo(() => {
    const d = dayInfo(loc, YEAR, doy);
    return { sunset: d.sunset ?? 20, sunrise: d.sunrise ?? 6 };
  }, [loc, doy]);
}

const setNight = (patch: Partial<{ hour: number; scene: string | null }>) => editor.getState().setSession({ night: { ...editor.getState().session.night, ...patch } });

export function NightPill() {
  const night = useEditor((st) => st.session.night);
  const t = useSunTimes();
  const scene = SCENES.find((x) => x.id === night.scene);
  return (
    <div className={s.nightPill} data-testid="night-pill">
      <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden>
        <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" fill="#C9D4FF" />
      </svg>
      <span className={s.mono} style={{ color: 'var(--ink)' }}>
        {formatHour(night.hour % 24)}
      </span>
      <span>Sonnenuntergang {formatHour(t.sunset)}</span>
      <span
        style={{
          width: 3,
          height: 3,
          borderRadius: 2,
          background: 'var(--ink3)',
        }}
      />
      <span>{scene ? `Szene „${scene.name}“` : 'Zeitplan'}</span>
    </div>
  );
}

export function NightPanel() {
  const doc = useEditor((st) => st.doc);
  const night = useEditor((st) => st.session.night);
  const t = useSunTimes();
  const lamps = useMemo(() => (doc ? Object.values(doc.objects).filter((o): o is LampObject => o.type === 'lamp' && !o.hidden) : []), [doc]);
  const stats = useMemo(() => nightStats(lamps, night.scene, night.hour, WEEKDAY, t.sunset, t.sunrise), [lamps, night, t]);
  return (
    <aside className={s.rightPanel} style={{ width: 290 }} aria-label="Lichtszenen" data-testid="night-panel">
      <div className={s.head}>
        <span className={s.title}>Lichtszenen</span>
        <span className={s.muted}>{lamps.length} Leuchten</span>
      </div>
      <div className={s.col} style={{ gap: 6 }}>
        <button type="button" className={night.scene === null ? s.sceneOn : s.scene} onClick={() => setNight({ scene: null })} data-testid="scene-schedule">
          <div className={s.row} style={{ justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 500 }}>Zeitplan</span>
            <span
              className={s.mono}
              style={{
                fontSize: 11.5,
                color: night.scene === null ? '#F2C77E' : 'var(--ink3)',
              }}
            >
              automatisch
            </span>
          </div>
          <div
            style={{
              fontSize: 12,
              color: night.scene === null ? 'var(--ink2)' : 'var(--ink3)',
            }}
          >
            jede Leuchte nach eigenem Zeitplan
          </div>
        </button>
        {SCENES.map((sc) => {
          const on = night.scene === sc.id;
          return (
            <button key={sc.id} type="button" className={on ? s.sceneOn : s.scene} onClick={() => setNight({ scene: sc.id })} data-testid={`scene-${sc.id}`}>
              <div className={s.row} style={{ justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 500 }}>{sc.name}</span>
                <span
                  className={s.mono}
                  style={{
                    fontSize: 11.5,
                    color: on ? '#F2C77E' : 'var(--ink3)',
                  }}
                >
                  {sc.when}
                </span>
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: on ? 'var(--ink2)' : 'var(--ink3)',
                }}
              >
                {sc.note}
              </div>
            </button>
          );
        })}
      </div>
      <div className={s.col} style={{ gap: 8 }}>
        <div className={s.row} style={{ justifyContent: 'space-between' }}>
          <span className={u.eyebrow}>Uhrzeit</span>
          <span className={s.mono} style={{ fontSize: 12 }}>
            {formatHour(night.hour % 24)}
          </span>
        </div>
        <Slider label="Uhrzeit" value={night.hour} min={17} max={30} step={0.25} fill="#E9B45E" onChange={(v) => setNight({ hour: v })} testId="night-hour" />
        <div className={s.ticks}>
          <span>17</span>
          <span>20</span>
          <span>23</span>
          <span>02</span>
          <span>06</span>
        </div>
      </div>
      <div className={s.grid2}>
        <div className={s.stat}>
          <div className={s.statLabel}>Gesamtleistung</div>
          <div className={s.statValue} data-testid="night-watts">
            {num(stats.wattsNow, 0)} W
          </div>
        </div>
        <div className={s.stat}>
          <div className={s.statLabel}>Pro Abend</div>
          <div className={s.statValue}>≈ {euros(stats.costEvening, 2)}</div>
        </div>
      </div>
      <div className={s.muted} style={{ lineHeight: 1.45 }}>
        Leuchte anklicken, um Typ, Lichtstrom, Farbe und Zeitplan zu ändern. {num(stats.kwhEvening, 2)} kWh pro Abend bei 0,35 €/kWh.
      </div>
    </aside>
  );
}
