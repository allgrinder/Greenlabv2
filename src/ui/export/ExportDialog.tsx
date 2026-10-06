import { useEffect, useState } from 'react';
import { num } from '../../core/format';
import { useRenderer } from '../canvas/PlanCanvas';
import { useEditor } from '../../state';
import { Segmented } from '../components/controls';
import { Icon } from '../icons';
import u from '../components/ui.module.css';
import s from './export.module.css';

/** Pixel pro Meter für Maßstab und Druckauflösung: dpi / 0,0254 / Maßstabszahl */
export const exportPxPerMeter = (scaleDen: number, dpi: number) => dpi / 0.0254 / scaleDen;

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const fileSafe = (name: string) => name.replace(/[^\p{L}\p{N}\- _]+/gu, '').trim().replace(/\s+/g, '_') || 'Gartenwerk';

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const renderer = useRenderer();
  const name = useEditor((st) => st.doc?.name ?? 'Garten');
  const [scale, setScale] = useState('100');
  const [dpi, setDpi] = useState('300');
  const [paper, setPaper] = useState<'paper' | 'transparent'>('paper');
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<{ w: number; h: number } | null>(null);

  const bg = paper === 'paper' ? '#FBFAF6' : null;

  useEffect(() => {
    let alive = true;
    let url: string | null = null;
    renderer?.exportPng({ pxPerMeter: 14, marginM: 2.5, background: bg }).then((r) => {
      if (!alive) return;
      url = URL.createObjectURL(r.blob);
      setPreview(url);
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [renderer, bg]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async () => {
    if (!renderer) return;
    setBusy(true);
    try {
      const r = await renderer.exportPng({ pxPerMeter: exportPxPerMeter(+scale, +dpi), marginM: 2.5, background: bg, uiScale: +dpi / 96 });
      setInfo({ w: r.width, h: r.height });
      downloadBlob(r.blob, `${fileSafe(name)}_M1-${scale}.png`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={s.backdrop} onPointerDown={(e) => e.target === e.currentTarget && onClose()} data-testid="export-dialog">
      <div className={s.dialog} role="dialog" aria-label="Plan exportieren">
        <div className={s.previewArea}>
          <div className={s.sheet}>{preview ? <img src={preview} alt="Vorschau des Plans" /> : <div className={s.loading}>Vorschau wird erstellt …</div>}</div>
        </div>
        <div className={s.side}>
          <div className={s.head}>
            <span className={s.title}>Plan exportieren</span>
            <button type="button" className={u.iconBtn} onClick={onClose} aria-label="Schließen">
              <Icon name="close" size={18} width={1.8} />
            </button>
          </div>
          <div className={s.group}>
            <div className={u.eyebrow}>Format</div>
            <Segmented stretch value="png" onChange={() => {}} options={[{ v: 'png', label: 'PNG' }, { v: 'pdf', label: 'PDF · Vektor', disabled: true, title: 'Architektenplan als PDF mit Titelblock folgt in Phase 2' }]} />
          </div>
          <div className={s.group}>
            <div className={u.eyebrow}>Maßstab</div>
            <Segmented stretch value={scale} onChange={setScale} options={['50', '100', '200'].map((v) => ({ v, label: `1 : ${v}` }))} />
          </div>
          <div className={s.group}>
            <div className={u.eyebrow}>Auflösung</div>
            <Segmented stretch value={dpi} onChange={setDpi} options={['150', '300'].map((v) => ({ v, label: `${v} dpi` }))} />
          </div>
          <div className={s.group}>
            <div className={u.eyebrow}>Hintergrund</div>
            <Segmented stretch value={paper} onChange={setPaper} options={[{ v: 'paper', label: 'Papier' }, { v: 'transparent', label: 'Transparent' }]} />
          </div>
          <div className={s.note}>Enthält Plan, Grenzlinie und Bemaßungen. Legende, Nordpfeil und Titelblock kommen mit dem PDF-Export.</div>
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className={s.meta}>
              <span>{info ? `${info.w} × ${info.h} px` : `${num(exportPxPerMeter(+scale, +dpi), 0)} px/m`}</span>
              <span>{dpi} dpi</span>
            </div>
            <button type="button" className={s.primary} onClick={run} disabled={busy} data-testid="export-run">
              {busy ? 'Wird erstellt …' : 'Exportieren'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
