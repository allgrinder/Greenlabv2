import { useState } from 'react';
import { num } from '../../core/format';
import { PX_PER_M_AT_1_100, clampZoom, scaleLabel, zoomAt, zoomPercent } from '../../render/Viewport';
import { cmd, editor, useEditor } from '../../state';
import { useRenderer } from '../canvas/PlanCanvas';
import { Icon, Sun } from '../icons';
import u from '../components/ui.module.css';
import s from './chrome.module.css';

const SCALES = [50, 100, 200, 500];
const GRID_STEPS: { v: 0.1 | 0.5 | 1; label: string }[] = [
  { v: 0.1, label: '10 cm' },
  { v: 0.5, label: '50 cm' },
  { v: 1, label: '1 m' },
];

/** Maßstabsleiste mit „runder“ Teilung: 0 – u – 2u – 5u */
function scaleUnit(ppm: number): number {
  const units = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20];
  return units.find((x) => x * 5 * ppm >= 70) ?? 20;
}

export function BottomBar({ onFit }: { onFit: () => void }) {
  const renderer = useRenderer();
  const vp = useEditor((st) => st.session.viewport);
  const mode = useEditor((st) => st.session.mode);
  const settings = useEditor((st) => st.doc?.settings);
  const northDeg = useEditor((st) => st.doc?.site.northDeg ?? 0);
  const canUndo = useEditor((st) => st.history.past.length > 0);
  const canRedo = useEditor((st) => st.history.future.length > 0);
  const undoLabel = useEditor((st) => st.history.past[st.history.past.length - 1]?.label);
  const redoLabel = useEditor((st) => st.history.future[0]?.label);
  const { setSession, undo, redo } = editor.getState();
  const [menu, setMenu] = useState<'scale' | 'grid' | null>(null);

  const zoom = (f: number) => {
    if (!renderer) return;
    const sz = renderer.size;
    setSession({ viewport: zoomAt(vp, sz, { x: sz.width / 2, y: sz.height / 2 }, f) });
  };
  const unit = scaleUnit(vp.pxPerMeter);
  const barW = unit * 5 * vp.pxPerMeter;
  const fmt = (v: number) => (v < 1 ? num(v * 100, 0) + ' cm' : num(v, v % 1 ? 1 : 0));

  return (
    <footer className={s.bottom} data-testid="bottom-bar">
      <div className={s.group}>
        <button type="button" className={u.iconBtn} onClick={() => zoom(1 / 1.25)} aria-label="Verkleinern">
          <Icon name="minus" />
        </button>
        <button type="button" className={s.zoomLabel} onClick={onFit} title="Einpassen (Strg+0)" data-testid="zoom-label">
          {zoomPercent(vp)} %
        </button>
        <button type="button" className={u.iconBtn} onClick={() => zoom(1.25)} aria-label="Vergrößern">
          <Icon name="plus" />
        </button>
      </div>
      <div className={u.divider} />
      <div className={s.scale} style={{ position: 'relative' }}>
        <button type="button" className={s.scaleChip} onClick={() => setMenu(menu === 'scale' ? null : 'scale')} data-testid="scale-chip">
          {scaleLabel(vp)}
          <Icon name="chevron" size={10} color="var(--ink3)" width={2.4} />
        </button>
        {menu === 'scale' && (
          <div className={s.gridMenu} style={{ left: 0 }}>
            {SCALES.map((d) => (
              <button
                key={d}
                type="button"
                className={s.menuItem}
                onClick={() => {
                  setSession({ viewport: { ...vp, pxPerMeter: clampZoom((PX_PER_M_AT_1_100 * 100) / d) } });
                  setMenu(null);
                }}
              >
                1 : {d}
              </button>
            ))}
          </div>
        )}
        <div className={s.scaleBar} aria-label={`Maßstabsleiste ${fmt(unit * 5)}`}>
          <div className={s.scaleTrack} style={{ width: barW }}>
            <div style={{ flex: 1, background: 'var(--ink2)' }} />
            <div style={{ flex: 1 }} />
            <div style={{ flex: 3, background: 'var(--ink2)' }} />
          </div>
          <div className={s.scaleTicks} style={{ width: barW + 4, position: 'relative' }}>
            <span>0</span>
            <span style={{ position: 'absolute', left: barW / 5 - 2 }}>{fmt(unit)}</span>
            <span style={{ marginLeft: 'auto' }}>{fmt(unit * 5)}{unit * 5 >= 1 ? ' m' : ''}</span>
          </div>
        </div>
      </div>
      <div className={u.divider} />
      <div className={s.group} style={{ position: 'relative' }}>
        <button
          type="button"
          className={settings?.snapToGrid ? u.iconBtnOn : u.iconBtn}
          onClick={() => setMenu(menu === 'grid' ? null : 'grid')}
          aria-label="Raster"
          data-testid="grid-btn"
        >
          <Icon name="grid" width={1.5} />
        </button>
        {menu === 'grid' && settings && (
          <div className={s.gridMenu} style={{ left: -60 }} data-testid="grid-menu">
            <button type="button" className={s.menuItem} onClick={() => cmd.updateSettings({ snapToGrid: !settings.snapToGrid })}>
              Raster & Rasterfang <span className={settings.snapToGrid ? u.toggleOn : u.toggle} />
            </button>
            {GRID_STEPS.map((g) => (
              <button
                key={g.v}
                type="button"
                className={settings.gridStepM === g.v ? s.menuItemOn : s.menuItem}
                onClick={() => {
                  cmd.updateSettings({ gridStepM: g.v, snapToGrid: true });
                  setMenu(null);
                }}
                data-testid={`grid-${g.v}`}
              >
                {g.label} {settings.gridStepM === g.v && <Icon name="check" size={14} width={2} />}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          className={`${settings?.snapToGeometry ? u.iconBtnOn : u.iconBtn} ${u.tipUp}`}
          data-tip={settings?.snapToGeometry ? 'Fang an Ecken und Kanten: an' : 'Fang an Ecken und Kanten: aus'}
          onClick={() => settings && cmd.updateSettings({ snapToGeometry: !settings.snapToGeometry })}
          aria-label="Objektfang"
          aria-pressed={settings?.snapToGeometry}
          data-testid="snap-btn"
        >
          <Icon name="magnet" width={1.5} />
        </button>
      </div>
      <div className={u.divider} />
      <div className={s.group}>
        <button type="button" className={`${u.iconBtn} ${u.tipUp}`} data-tip={canUndo ? `Rückgängig: ${undoLabel}` : 'Rückgängig'} disabled={!canUndo} onClick={undo} aria-label="Rückgängig" data-testid="undo">
          <Icon name="undo" />
        </button>
        <button type="button" className={`${u.iconBtn} ${u.tipUp}`} data-tip={canRedo ? `Wiederholen: ${redoLabel}` : 'Wiederholen'} disabled={!canRedo} onClick={redo} aria-label="Wiederholen" data-testid="redo">
          <Icon name="redo" />
        </button>
      </div>
      <div className={u.divider} />
      <div className={s.daynight}>
        <button type="button" className={mode === 'day' ? s.dnBtnOn : s.dnBtn} onClick={() => setSession({ mode: 'day' })} data-testid="day-btn">
          <Sun />
          Tag
        </button>
        <button type="button" className={mode === 'night' ? s.dnBtnOn : s.dnBtn} onClick={() => setSession({ mode: 'night' })} data-testid="night-btn">
          <Icon name="moon" size={13} color={mode === 'night' ? '#C9D4FF' : 'var(--ink2)'} />
          Nacht
        </button>
      </div>
      <div className={s.north} title={`Nord ${num(northDeg, 0)}°`} style={{ transform: `rotate(${northDeg}deg)` }}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
          <path d="M12 3l3 9h-6Z" fill="#C4553A" />
          <path d="M12 21l-3-9h6Z" fill="var(--ink3)" />
        </svg>
      </div>
    </footer>
  );
}
