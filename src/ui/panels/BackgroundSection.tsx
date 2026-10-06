import { useEffect, useRef, useState } from 'react';
import { applyCalibration } from '../../core/calibration';
import { bbox } from '../../core/geometry/polygon';
import { num, parseNumber } from '../../core/format';
import { newId } from '../../core/model/ids';
import type { Project } from '../../core/model/types';
import { putBlob } from '../../persistence/db';
import { CALIB_EVENT, type CalibPoints } from '../../tools/BackgroundTools';
import { cmd, editor, useEditor } from '../../state';
import { Toggle } from '../components/controls';
import u from '../components/ui.module.css';
import s from './props.module.css';

/** Hintergrundbild im laufenden Projekt: Deckkraft, Sichtbarkeit, Sperre, Kalibrieren, Verschieben, Ersetzen */
export function BackgroundSection({ doc }: { doc: Project }) {
  const bg = doc.background;
  const tool = useEditor((st) => st.session.tool);
  const setSession = useEditor((st) => st.setSession);
  const [points, setPoints] = useState<CalibPoints | null>(null);
  const [dist, setDist] = useState('');
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<CalibPoints | null>).detail;
      setPoints(d);
      if (d) setDist(num(d.currentM, 2));
    };
    window.addEventListener(CALIB_EVENT, on);
    return () => window.removeEventListener(CALIB_EVENT, on);
  }, []);

  const upload = (f: File) => {
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = async () => {
      URL.revokeObjectURL(url);
      const blobId = newId();
      await putBlob(blobId, f);
      const b = bbox(doc.site.boundary);
      const mpp = (b.maxX - b.minX) / img.naturalWidth;
      cmd.setBackground({
        blobId,
        fileName: f.name,
        mime: f.type || 'image/png',
        pixelWidth: img.naturalWidth,
        pixelHeight: img.naturalHeight,
        origin: { x: b.minX, y: (b.minY + b.maxY) / 2 - (img.naturalHeight * mpp) / 2 },
        metersPerPixel: mpp,
        rotationDeg: 0,
        opacity: 0.6,
        visible: true,
        locked: false,
        calibration: null,
      });
      setSession({ tool: 'calibrate' });
    };
    img.onerror = () => alert('Das Bild konnte nicht gelesen werden (PNG, JPEG, WebP).');
    img.src = url;
  };

  const fileInput = (
    <input
      ref={file}
      type="file"
      accept="image/png,image/jpeg,image/webp"
      hidden
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) upload(f);
        e.target.value = '';
      }}
      data-testid="bg-upload"
    />
  );

  if (!bg)
    return (
      <div className={s.section} style={{ gap: 8 }}>
        <div className={u.eyebrow}>Hintergrund</div>
        <button type="button" className={s.action} onClick={() => file.current?.click()}>
          Lageplan oder Luftbild hinzufügen
        </button>
        {fileInput}
      </div>
    );

  return (
    <div className={s.section} style={{ gap: 10 }} data-testid="bg-section">
      <div className={s.row}>
        <span className={u.eyebrow}>Hintergrund</span>
        <span className={s.muted} style={{ fontSize: 12, maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {bg.fileName}
        </span>
      </div>
      <label className={s.row}>
        <span>Deckkraft</span>
        <input
          type="range"
          min={0.05}
          max={1}
          step={0.05}
          value={bg.opacity}
          style={{ flex: 1, accentColor: 'var(--acc)' }}
          onChange={(e) => cmd.updateBackground({ opacity: +e.target.value }, 'bg-opacity')}
          onPointerUp={() => editor.getState().endGesture()}
          data-testid="bg-opacity"
        />
        <span className={u.mono} style={{ width: 38, textAlign: 'right' }}>
          {num(bg.opacity * 100, 0)} %
        </span>
      </label>
      <div className={s.row}>
        <span>Sichtbar</span>
        <Toggle label="Hintergrund sichtbar" on={bg.visible} onChange={(v) => cmd.updateBackground({ visible: v })} />
      </div>
      <div className={s.row}>
        <span>Gesperrt</span>
        <Toggle label="Hintergrund gesperrt" on={bg.locked} onChange={(v) => cmd.updateBackground({ locked: v })} />
      </div>
      <div className={s.row}>
        <span className={s.muted}>Maßstab</span>
        <span className={u.mono}>{bg.calibration ? `1 px = ${num(bg.metersPerPixel * 100, 2)} cm` : 'nicht kalibriert'}</span>
      </div>
      <div className={s.actions}>
        <button type="button" className={s.action} onClick={() => setSession({ tool: tool === 'calibrate' ? 'select' : 'calibrate', selection: [] })} style={tool === 'calibrate' ? { color: 'var(--acc)', background: 'var(--accs)' } : undefined} data-testid="bg-calibrate">
          Kalibrieren
        </button>
        <button type="button" className={s.action} disabled={bg.locked} title={bg.locked ? 'Zum Verschieben entsperren' : undefined} onClick={() => setSession({ tool: tool === 'bgmove' ? 'select' : 'bgmove', selection: [] })} style={tool === 'bgmove' ? { color: 'var(--acc)', background: 'var(--accs)' } : bg.locked ? { opacity: 0.5 } : undefined}>
          Verschieben
        </button>
        <button type="button" className={s.action} onClick={() => file.current?.click()}>
          Ersetzen
        </button>
        <button type="button" className={`${s.action} ${s.danger}`} onClick={() => cmd.setBackground(null)}>
          Entfernen
        </button>
      </div>
      {tool === 'calibrate' && (
        <div className={s.note} style={{ background: 'var(--accs)', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12.5, lineHeight: 1.45 }}>
            <b style={{ fontWeight: 600 }}>Maßstab kalibrieren.</b> {points ? 'Bekannte Distanz eingeben:' : 'Klicke zwei Punkte mit bekanntem Abstand im Plan.'}
          </div>
          {points && (
            <div style={{ display: 'flex', gap: 8 }}>
              <label className={u.fieldFocus} style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                <input
                  className={u.fieldInput}
                  value={dist}
                  autoFocus
                  onChange={(e) => setDist(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  data-testid="bg-calib-distance"
                />
                <span className={s.muted}>m</span>
              </label>
              <button
                type="button"
                className={u.primary}
                onClick={() => {
                  const d = parseNumber(dist);
                  if (!d || d <= 0) return;
                  cmd.updateBackground(applyCalibration(bg, { a: points.a, b: points.b, distanceM: d }));
                  setPoints(null);
                  setSession({ tool: 'select' });
                }}
                data-testid="bg-calib-apply"
              >
                Übernehmen
              </button>
            </div>
          )}
        </div>
      )}
      {fileInput}
    </div>
  );
}
