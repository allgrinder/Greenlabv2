/** Hintergrund im Projekt-Assistenten: Bildauswahl (FilePick) und Ausrichten an Grundstücksecken bzw. Maßstab (AlignBox) */
import { useRef } from 'react';
import { num } from '../../core/format';
import { LETTERS, type BgDraft } from './wizardModel';
import { NumInput } from './WizardInputs';
import s from './onboarding.module.css';

/** Ausrichten: zwei Bildpunkte den Grundstücksecken zuordnen – oder nur den Maßstab über eine Strecke setzen */
export function AlignBox({ bg, setBg, corners, onCorners, onDistance, onStart }: { bg: BgDraft; setBg: (b: BgDraft) => void; corners: number; onCorners: () => void; onDistance: () => void; onStart: () => void }) {
  const n = (bg.a ? 1 : 0) + (bg.b ? 1 : 0);
  const letters = Array.from({ length: corners }, (_, i) => LETTERS[i]);
  return (
    <div className={s.calib} data-testid="align-box">
      <div className={s.calibBadge}>{bg.place ? '✓' : `${n}/2`}</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
        <div style={{ fontSize: 13, lineHeight: 1.45 }}>
          <b style={{ fontWeight: 600 }}>Bild ausrichten.</b>{' '}
          {n < 2 ? (
            <>
              Klicke im Bild zwei markante Punkte an, z. B. zwei Grundstücksecken.{' '}
              {!bg.a && (
                <button type="button" className={s.linkBtn} onClick={onStart}>
                  Jetzt setzen
                </button>
              )}
            </>
          ) : (
            'Ordne die Punkte den Ecken der Kontur zu – Maßstab, Drehung und Lage werden berechnet.'
          )}
        </div>
        {n === 2 && (
          <>
            <div className={s.segRow}>
              {(['corners', 'distance'] as const).map((m) => (
                <button key={m} type="button" className={bg.mode === m ? s.segOn : s.seg} onClick={() => setBg({ ...bg, mode: m })} data-testid={`align-mode-${m}`}>
                  {m === 'corners' ? 'Ecken zuordnen' : 'Nur Maßstab'}
                </button>
              ))}
            </div>
            {bg.mode === 'corners' ? (
              <>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
                  <span className={s.pointTag}>1</span>
                  <span>=</span>
                  <select className={s.select} value={bg.ca} onChange={(e) => setBg({ ...bg, ca: +e.target.value })} aria-label="Ecke für Punkt 1" data-testid="corner-1">
                    {letters.map((l, i) => (
                      <option key={l} value={i}>
                        Ecke {l}
                      </option>
                    ))}
                  </select>
                  <span className={s.pointTag}>2</span>
                  <span>=</span>
                  <select className={s.select} value={bg.cb} onChange={(e) => setBg({ ...bg, cb: +e.target.value })} aria-label="Ecke für Punkt 2" data-testid="corner-2">
                    {letters.map((l, i) => (
                      <option key={l} value={i}>
                        Ecke {l}
                      </option>
                    ))}
                  </select>
                </div>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: 'var(--ink2)' }}>
                  <input type="checkbox" checked={bg.northUp} onChange={(e) => setBg({ ...bg, northUp: e.target.checked })} data-testid="north-up" />
                  Bild ist genordet – Nordrichtung übernehmen
                </label>
                <button type="button" className={s.applyBtn} disabled={bg.ca === bg.cb} onClick={onCorners} data-testid="align-apply">
                  Ausrichten
                </button>
              </>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <NumInput value={bg.distance ?? 10} onChange={(v) => setBg({ ...bg, distance: v })} unit="m" label="Distanz" testId="calib-distance" autoFocus />
                </div>
                <button type="button" className={s.applyBtn} onClick={onDistance} data-testid="calib-apply">
                  Übernehmen
                </button>
              </div>
            )}
          </>
        )}
        {bg.place && (
          <div style={{ fontSize: 12, color: 'var(--ink2)' }} data-testid="align-info">
            1 px = {num(bg.place.metersPerPixel * 100, 2)} cm · Drehung {num(bg.place.rotationDeg, 1)}° · Bild in der Vorschau ziehen zum Nachjustieren
          </div>
        )}
      </div>
    </div>
  );
}

export function FilePick({ bg, onPick, onClear }: { bg: BgDraft | null; onPick: (f: File) => void; onClear: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className={s.fileCard}>
      <div className={s.fileIcon} style={bg ? { backgroundImage: `url(${bg.url})` } : undefined}>
        {bg ? '' : 'BILD'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bg ? bg.name : 'Lageplan oder Luftbild'}</div>
        <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{bg ? `${bg.w} × ${bg.h} px · unter allen Ebenen` : 'PNG, JPEG oder WebP'}</div>
      </div>
      {bg && (
        <button type="button" style={{ fontSize: 12.5, color: 'var(--ink2)' }} onClick={onClear}>
          Entfernen
        </button>
      )}
      <button type="button" style={{ fontSize: 12.5, color: 'var(--ink2)' }} onClick={() => input.current?.click()} data-testid="bg-pick">
        {bg ? 'Ersetzen' : 'Auswählen'}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = '';
        }}
        data-testid="bg-file"
      />
    </div>
  );
}
