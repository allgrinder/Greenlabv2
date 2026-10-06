import { useEffect, useMemo, useState } from 'react';
import { fits, legendEntries, PAPERS, SCALES, sheetLayout, type PaperId } from '../../core/export/sheet';
import { bbox, expandBBox } from '../../core/geometry/polygon';
import { PDF_MARGIN_M, type Look, type PlanPdfOptions } from './pdf';
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

export const fileSafe = (name: string) =>
  name
    .replace(/[^\p{L}\p{N}\- _]+/gu, '')
    .trim()
    .replace(/\s+/g, '_') || 'Gartenwerk';

type Format = 'pdf' | 'png';

const LOOKS: { v: Look; label: string; bg: string }[] = [
  {
    v: 'day',
    label: 'Tag',
    bg: 'linear-gradient(135deg,#9BAE74 0 45%,#D6CDBB 45% 70%,#6D8656 70%)',
  },
  {
    v: 'night',
    label: 'Nacht',
    bg: 'radial-gradient(circle at 40% 55%,rgba(255,200,130,.85) 0,rgba(255,200,130,0) 30%),radial-gradient(circle at 75% 35%,rgba(255,200,130,.6) 0,rgba(255,200,130,0) 22%),#0E1724',
  },
  {
    v: 'line',
    label: 'Strich',
    bg: 'repeating-linear-gradient(45deg,rgba(0,0,0,.18) 0 1px,transparent 1px 5px),#F4F2EC',
  },
];

const CONTENT: {
  k: keyof Pick<PlanPdfOptions, 'legend' | 'scaleBar' | 'north' | 'titleBlock' | 'dimensions' | 'plantSheet'>;
  label: string;
}[] = [
  { k: 'legend', label: 'Legende' },
  { k: 'scaleBar', label: 'Maßstabsleiste' },
  { k: 'north', label: 'Nordpfeil' },
  { k: 'titleBlock', label: 'Titelblock' },
  { k: 'dimensions', label: 'Bemaßung und Beschriftung' },
  { k: 'plantSheet', label: 'Pflanzenliste als Blatt 2' },
];

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const renderer = useRenderer();
  const doc = useEditor((st) => st.doc);
  const name = doc?.name ?? 'Garten';
  const [format, setFormat] = useState<Format>('pdf');
  const [paper, setPaper] = useState<PaperId>('A3');
  const planBox = useMemo(() => (doc ? expandBBox(bbox(doc.site.boundary), PDF_MARGIN_M) : null), [doc]);
  const pdfScales = useMemo(() => (planBox ? SCALES.filter((sc) => fits(planBox, sheetLayout(paper).plan, sc)) : SCALES), [planBox, paper]);
  const [pdfScale, setPdfScale] = useState<number | null>(null);
  const scaleForPdf = pdfScale !== null && pdfScales.includes(pdfScale) ? pdfScale : (pdfScales[0] ?? SCALES[SCALES.length - 1]);
  const [scale, setScale] = useState('100');
  const [dpi, setDpi] = useState('300');
  const [look, setLook] = useState<Look>('day');
  const [bgMode, setBgMode] = useState<'paper' | 'transparent'>('paper');
  const [content, setContent] = useState({
    legend: true,
    scaleBar: true,
    north: true,
    titleBlock: true,
    dimensions: true,
    plantSheet: false,
  });
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<{ w: number; h: number } | null>(null);

  const night = format === 'pdf' && look === 'night';
  const bg = night ? '#0E1724' : bgMode === 'paper' || format === 'pdf' ? '#FBFAF6' : null;
  const dims = format === 'png' || content.dimensions;

  useEffect(() => {
    let alive = true;
    let url: string | null = null;
    setPreview(null);
    renderer
      ?.exportPng({
        pxPerMeter: 14,
        marginM: format === 'pdf' ? PDF_MARGIN_M : 2.5,
        background: bg,
        view: { night },
        overlays: dims,
      })
      .then((r) => {
        if (!alive) return;
        url = URL.createObjectURL(r.blob);
        setPreview(url);
      });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [renderer, bg, night, dims, format]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async () => {
    if (!renderer || !doc) return;
    setBusy(true);
    setError(null);
    try {
      if (format === 'png') {
        const r = await renderer.exportPng({
          pxPerMeter: exportPxPerMeter(+scale, +dpi),
          marginM: 2.5,
          background: bg,
          uiScale: +dpi / 96,
        });
        setInfo({ w: r.width, h: r.height });
        downloadBlob(r.blob, `${fileSafe(name)}_M1-${scale}.png`);
      } else {
        const { planPdfBlob } = await import('./pdf');
        const blob = await planPdfBlob(renderer, doc, {
          paper,
          scale: scaleForPdf,
          dpi: +dpi,
          look,
          ...content,
        });
        downloadBlob(blob, `${fileSafe(name)}_${paper}_M1-${scaleForPdf}.pdf`);
      }
    } catch (e) {
      console.error(e);
      setError((e as Error).message || 'Export fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  const L = sheetLayout(paper);
  const date = new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date());
  const legendItems = doc ? legendEntries(doc, night) : [];
  const northDeg = doc?.site.northDeg ?? 0;

  return (
    <div className={s.backdrop} onPointerDown={(e) => e.target === e.currentTarget && onClose()} data-testid="export-dialog">
      <div className={s.dialog} role="dialog" aria-label="Plan exportieren">
        <div className={s.previewArea}>
          {format === 'png' ? (
            <div className={s.sheet}>{preview ? <img src={preview} alt="Vorschau des Plans" /> : <div className={s.loading}>Vorschau wird erstellt …</div>}</div>
          ) : (
            <div className={s.pdfSheet} style={{ aspectRatio: `${L.page.w} / ${L.page.h}` }} data-testid="pdf-preview">
              <div className={s.pdfFrame}>
                <div className={s.pdfPlan} style={night ? { background: '#0E1724' } : undefined}>
                  <div className={s.pdfTitle} style={night ? { color: '#ECE9E2' } : undefined}>
                    {night ? 'Lichtplan' : 'Gestaltungsplan'} <i>Freianlagen</i>
                  </div>
                  {preview ? (
                    <img
                      src={preview}
                      alt="Vorschau des Plans"
                      style={
                        look === 'line'
                          ? {
                              filter: 'grayscale(1) contrast(1.15) brightness(1.08)',
                            }
                          : undefined
                      }
                    />
                  ) : (
                    <div className={s.loading}>Vorschau wird erstellt …</div>
                  )}
                  {content.scaleBar && (
                    <div className={s.pdfScale}>
                      <div className={s.pdfScaleBar}>
                        <div style={{ flex: 1, background: '#2D3033' }} />
                        <div style={{ flex: 1 }} />
                        <div style={{ flex: 3, background: '#2D3033' }} />
                      </div>
                      <span>M 1:{scaleForPdf}</span>
                    </div>
                  )}
                </div>
                <div className={s.pdfSide}>
                  {content.north && (
                    <div className={s.pdfNorth}>
                      <svg width="30" height="30" viewBox="0 0 30 30" style={{ transform: `rotate(${northDeg}deg)` }} aria-hidden>
                        <circle cx="15" cy="15" r="13" fill="none" stroke="#2D3033" strokeWidth=".8" />
                        <path d="M15 3l4 12h-8Z" fill="#2D3033" />
                        <path d="M15 27l-4-12h8Z" fill="none" stroke="#2D3033" strokeWidth=".8" />
                      </svg>
                      <span>Nord</span>
                    </div>
                  )}
                  {content.legend && (
                    <div className={s.pdfLegend}>
                      <div className={s.pdfEyebrow}>LEGENDE</div>
                      {legendItems.map((e) => (
                        <div key={e.label} className={s.pdfLegendRow}>
                          <span
                            style={{
                              background: e.kind === 'line' || e.kind === 'dash' ? 'transparent' : e.color,
                              borderRadius: e.kind === 'circle' || e.kind === 'glow' ? 5 : 1,
                              borderBottom: e.kind === 'line' ? `3px solid ${e.color}` : e.kind === 'dash' ? `1.2px dashed ${e.color}` : undefined,
                              height: e.kind === 'line' || e.kind === 'dash' ? 6 : 10,
                              boxShadow: e.kind === 'fill' || e.kind === 'circle' ? 'inset 0 0 0 .6px rgba(0,0,0,.45)' : undefined,
                            }}
                          />
                          {e.label}
                        </div>
                      ))}
                    </div>
                  )}
                  {content.titleBlock && (
                    <div className={s.pdfBlock}>
                      <div className={s.pdfName}>{name}</div>
                      <div className={s.pdfSub}>
                        {night ? 'Lichtplanung' : 'Freianlagenplanung'} · Entwurf
                        {doc?.site.location && (
                          <>
                            <br />
                            {doc.site.location.label}
                          </>
                        )}
                      </div>
                      <div className={s.pdfGrid}>
                        <span>M 1:{scaleForPdf}</span>
                        <span>{paper} quer</span>
                        <span>{date}</span>
                        <span>Blatt 1/{content.plantSheet ? 2 : 1}</span>
                        <span>Gartenwerk</span>
                        <span>Index A</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
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
            <Segmented
              stretch
              value={format}
              onChange={setFormat}
              options={[
                { v: 'pdf', label: 'PDF' },
                { v: 'png', label: 'PNG' },
              ]}
            />
            {format === 'pdf' ? (
              <div className={s.grid2}>
                <label className={s.selectField}>
                  <span>Papier</span>
                  <select value={paper} onChange={(e) => setPaper(e.target.value as PaperId)} data-testid="pdf-paper">
                    {(Object.keys(PAPERS) as PaperId[]).map((p) => (
                      <option key={p} value={p}>
                        {p} quer
                      </option>
                    ))}
                  </select>
                </label>
                <label className={s.selectField}>
                  <span>Maßstab</span>
                  <select value={scaleForPdf} onChange={(e) => setPdfScale(+e.target.value)} data-testid="pdf-scale">
                    {(pdfScales.length ? pdfScales : SCALES.slice(-1)).map((sc) => (
                      <option key={sc} value={sc}>
                        1 : {sc}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : (
              <Segmented
                stretch
                value={scale}
                onChange={setScale}
                options={['50', '100', '200'].map((v) => ({
                  v,
                  label: `1 : ${v}`,
                }))}
              />
            )}
          </div>
          {format === 'pdf' && (
            <div className={s.group}>
              <div className={u.eyebrow}>Darstellung</div>
              <div className={s.looks}>
                {LOOKS.map((l) => (
                  <button key={l.v} type="button" className={look === l.v ? s.lookOn : s.look} onClick={() => setLook(l.v)} aria-pressed={look === l.v} data-testid={`look-${l.v}`}>
                    <span style={{ background: l.bg }} />
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {format === 'pdf' ? (
            <div className={s.group} style={{ gap: 2 }}>
              <div className={u.eyebrow} style={{ marginBottom: 6 }}>
                Inhalt
              </div>
              {CONTENT.map((c) => (
                <label key={c.k} className={s.check}>
                  <input type="checkbox" checked={content[c.k]} onChange={(e) => setContent({ ...content, [c.k]: e.target.checked })} />
                  <span className={s.box} aria-hidden>
                    <svg width="10" height="10" viewBox="0 0 24 24">
                      <path d="M5 12l5 5 9-10" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />
                    </svg>
                  </span>
                  {c.label}
                </label>
              ))}
            </div>
          ) : (
            <div className={s.group}>
              <div className={u.eyebrow}>Hintergrund</div>
              <Segmented
                stretch
                value={bgMode}
                onChange={setBgMode}
                options={[
                  { v: 'paper', label: 'Papier' },
                  { v: 'transparent', label: 'Transparent' },
                ]}
              />
            </div>
          )}
          <div className={s.group}>
            <div className={u.eyebrow}>Auflösung</div>
            <Segmented stretch value={dpi} onChange={setDpi} options={['150', '300'].map((v) => ({ v, label: `${v} dpi` }))} />
          </div>
          {format === 'pdf' && <div className={s.note}>Rahmen, Schrift, Legende, Maßstab und Nordpfeil als Vektor; der Plan wird im Maßstab mit {dpi} dpi eingebettet.</div>}
          {error && (
            <div className={s.note} style={{ color: '#B9724F' }}>
              {error}
            </div>
          )}
          <div
            style={{
              marginTop: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div className={s.meta}>
              <span>{format === 'png' ? (info ? `${info.w} × ${info.h} px` : `${num(exportPxPerMeter(+scale, +dpi), 0)} px/m`) : `${dpi} dpi · M 1:${scaleForPdf}`}</span>
              <span>{format === 'pdf' ? `${content.plantSheet ? 2 : 1} Blatt` : `${dpi} dpi`}</span>
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
