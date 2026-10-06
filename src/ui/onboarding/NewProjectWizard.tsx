/**
 * Neues Projekt (Design-Screen 01): Kontur als Rechteck oder Polygon mit exakten
 * Kantenlängen und Innenwinkeln, Nordausrichtung, Standort, optional Lageplan/Luftbild
 * mit 2-Punkt-Maßstabskalibrierung und Deckkraft.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { metersPerPixel } from '../../core/calibration';
import { num, parseNumber, squareMeters } from '../../core/format';
import { area, bbox } from '../../core/geometry/polygon';
import { boundaryFromPlot, edgesFromPolygon, polygonFromEdges } from '../../core/geometry/plot';
import { dist } from '../../core/geometry/vec';
import { createProject } from '../../core/model/defaults';
import { newId } from '../../core/model/ids';
import type { BackgroundImage, GeoLocation, PlotEdge, PlotSpec, Project, Vec2 } from '../../core/model/types';
import { Icon, Logo } from '../icons';
import s from './onboarding.module.css';

/** Beispielkontur aus dem Design (Punkte A–E, in Metern) */
const DESIGN_POLY: Vec2[] = [
  { x: 0, y: 2.766 },
  { x: 48.085, y: 0 },
  { x: 50.213, y: 29.787 },
  { x: 26.17, y: 36.383 },
  { x: 0.532, y: 28.511 },
];

function defaultEdges(): PlotEdge[] {
  const e = edgesFromPolygon(DESIGN_POLY);
  const dir = (Math.atan2(DESIGN_POLY[1].y - DESIGN_POLY[0].y, DESIGN_POLY[1].x - DESIGN_POLY[0].x) * 180) / Math.PI;
  const r = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
  return [{ length: r(e[0].length), angleDeg: r(dir, 1) }, ...e.slice(1, 4).map((x) => ({ length: r(x.length), angleDeg: r(x.angleDeg, 1) }))];
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export interface WizardResult {
  project: Project;
  backgroundBlob: Blob | null;
}

interface BgDraft {
  blob: Blob;
  url: string;
  name: string;
  w: number;
  h: number;
  opacity: number;
  a: Vec2 | null;
  b: Vec2 | null;
  distance: number | null;
  mpp: number | null;
}

function NumInput({ value, onChange, unit, label, testId, autoFocus }: { value: number; onChange: (v: number) => void; unit: string; label?: string; testId?: string; autoFocus?: boolean }) {
  const [text, setText] = useState(num(value, 2));
  useEffect(() => setText((t) => (parseNumber(t) === value ? t : num(value, 2))), [value]);
  return (
    <label className={s.input}>
      <input
        aria-label={label}
        value={text}
        inputMode="decimal"
        autoFocus={autoFocus}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseNumber(e.target.value);
          if (v !== null && v > 0) onChange(v);
        }}
        onBlur={() => setText(num(value, 2))}
        data-testid={testId}
      />
      <span className={s.unit}>{unit}</span>
    </label>
  );
}

function Cell({ value, onChange, unit, digits = 2, testId }: { value: number; onChange: (v: number) => void; unit: string; digits?: 0 | 1 | 2; testId?: string }) {
  const [text, setText] = useState(num(value, digits));
  useEffect(() => setText((t) => (parseNumber(t) === value ? t : num(value, digits))), [value, digits]);
  return (
    <label className={s.cell}>
      <input
        value={text}
        inputMode="decimal"
        onChange={(e) => {
          setText(e.target.value);
          const v = parseNumber(e.target.value);
          if (v !== null) onChange(v);
        }}
        onBlur={() => setText(num(value, digits))}
        data-testid={testId}
      />
      <span className={s.unit}>{unit}</span>
    </label>
  );
}

export function NewProjectWizard({ onCreate, onCancel, onSample, canCancel }: { onCreate: (r: WizardResult) => void; onCancel: () => void; onSample: () => void; canCancel: boolean }) {
  const [kind, setKind] = useState<'rect' | 'edges'>('rect');
  const [width, setWidth] = useState(30);
  const [depth, setDepth] = useState(50);
  const [edges, setEdges] = useState<PlotEdge[]>(defaultEdges);
  const [north, setNorth] = useState(0);
  const [loc, setLoc] = useState<GeoLocation>({ label: '', lat: 50.11, lon: 8.68, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin' });
  const [bg, setBg] = useState<BgDraft | null>(null);
  const [stageTab, setStageTab] = useState<'contour' | 'calib'>('contour');
  const [name, setName] = useState('');

  const plot: PlotSpec = kind === 'rect' ? { kind: 'rect', width, depth } : { kind: 'edges', edges };
  const boundary = useMemo(() => boundaryFromPlot(plot), [kind, width, depth, edges]); // eslint-disable-line react-hooks/exhaustive-deps
  const closing = useMemo(() => (kind === 'edges' ? polygonFromEdges(edges).closing : null), [kind, edges]);
  const A = area(boundary);
  const valid = boundary.length >= 3 && A > 0.5 && (kind === 'rect' || (closing !== null && closing.length > 0.01));

  const pickFile = async (f: File) => {
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      setBg({ blob: f, url, name: f.name, w: img.naturalWidth, h: img.naturalHeight, opacity: 0.6, a: null, b: null, distance: null, mpp: null });
      setStageTab('calib');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      alert('Das Bild konnte nicht gelesen werden. Unterstützt werden PNG, JPEG und WebP (PDF bitte vorher als Bild exportieren).');
    };
    img.src = url;
  };

  const create = () => {
    const project = createProject({ name: name.trim() || (loc.label ? `Garten ${loc.label.split(',')[0]}` : 'Neuer Garten'), plot, northDeg: north, location: loc.label ? loc : null });
    let background: BackgroundImage | null = null;
    if (bg) {
      const mpp = bg.mpp ?? Math.max(...boundary.map((p) => p.x)) / bg.w; // ohne Kalibrierung: Bildbreite = Grundstücksbreite
      const b = bbox(project.site.boundary);
      background = {
        blobId: newId(),
        fileName: bg.name,
        mime: bg.blob.type || 'image/png',
        pixelWidth: bg.w,
        pixelHeight: bg.h,
        // Bildmitte auf die Grundstücksmitte legen; verschieben lässt es sich später
        origin: { x: (b.minX + b.maxX) / 2 - (bg.w * mpp) / 2, y: (b.minY + b.maxY) / 2 - (bg.h * mpp) / 2 },
        metersPerPixel: mpp,
        rotationDeg: 0,
        opacity: bg.opacity,
        visible: true,
        locked: true,
        calibration: bg.a && bg.b && bg.distance ? { a: bg.a, b: bg.b, distanceM: bg.distance } : null,
      };
    }
    onCreate({ project: { ...project, background }, backgroundBlob: bg?.blob ?? null });
  };

  return (
    <div className={s.screen} data-testid="wizard">
      <div className={s.side}>
        <div className={s.brandRow}>
          <Logo bg="var(--ink)" fg="#E9E5DC" />
          <span className={s.brandName}>Gartenwerk</span>
          <span className={s.stepCount}>Neues Projekt</span>
        </div>
        <div>
          <div className={s.h1}>Lege dein Grundstück an</div>
          <div className={s.lead}>Maße, Ausrichtung und Hintergrund kannst du später jederzeit ändern.</div>
        </div>

        <div className={s.block}>
          <div className={s.blockHead}>
            <span className={s.num}>01</span>
            <span className={s.blockTitle}>Kontur</span>
          </div>
          <div style={{ display: 'flex', gap: 2, padding: 3, background: 'var(--fld)', borderRadius: 10 }}>
            {(['rect', 'edges'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                data-testid={`contour-${k}`}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: 8,
                  borderRadius: 7,
                  ...(kind === k ? { background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.08),0 0 0 1px var(--line)', fontWeight: 500 } : { color: 'var(--ink2)' }),
                }}
              >
                <Icon name={k === 'rect' ? 'rect' : 'poly'} size={15} width={1.5} />
                {k === 'rect' ? 'Rechteck' : 'Polygon'}
              </button>
            ))}
          </div>
          {kind === 'rect' ? (
            <>
              <div className={s.dimRow}>
                <div className={s.inputBox}>
                  <span className={s.inputLabel}>Breite</span>
                  <NumInput value={width} onChange={setWidth} unit="m" label="Breite" testId="plot-width" />
                </div>
                <span style={{ paddingBottom: 11, color: 'var(--ink3)' }}>×</span>
                <div className={s.inputBox}>
                  <span className={s.inputLabel}>Tiefe</span>
                  <NumInput value={depth} onChange={setDepth} unit="m" label="Tiefe" testId="plot-depth" />
                </div>
              </div>
              <div className={s.sumRow}>
                <span>Fläche</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink)' }} data-testid="plot-area">
                  {squareMeters(A)}
                </span>
              </div>
            </>
          ) : (
            <div className={s.edges}>
              <div className={s.edgeRow} style={{ background: 'var(--fld)', fontSize: 11, color: 'var(--ink3)' }}>
                <span>Kante</span>
                <span />
                <span style={{ textAlign: 'right' }}>Länge</span>
                <span style={{ textAlign: 'right' }}>Winkel</span>
                <span />
              </div>
              {edges.map((e, i) => (
                <div key={i} className={s.edgeRow}>
                  <span className={s.edgeName}>
                    {LETTERS[i]}–{LETTERS[i + 1]}
                  </span>
                  <span className={s.edgeLabel}>{i === 0 ? 'Richtung' : `Winkel bei ${LETTERS[i]}`}</span>
                  <Cell value={e.length} unit="m" onChange={(v) => setEdges(edges.map((x, j) => (j === i ? { ...x, length: Math.max(0, v) } : x)))} testId={`edge-${i}-len`} />
                  <Cell value={e.angleDeg} unit="°" digits={1} onChange={(v) => setEdges(edges.map((x, j) => (j === i ? { ...x, angleDeg: v } : x)))} testId={`edge-${i}-ang`} />
                  <button type="button" aria-label="Kante entfernen" disabled={edges.length <= 2} onClick={() => setEdges(edges.filter((_, j) => j !== i))} style={{ color: 'var(--ink3)', opacity: edges.length <= 2 ? 0.3 : 1 }}>
                    <Icon name="close" size={12} />
                  </button>
                </div>
              ))}
              {closing && (
                <div className={s.edgeRow}>
                  <span className={s.edgeName}>
                    {LETTERS[edges.length]}–A
                  </span>
                  <span className={s.edgeLabel}>Schluss, berechnet</span>
                  <span className={s.computed} data-testid="closing-len">
                    {num(closing.length, 2)} m
                  </span>
                  <span className={s.computed}>{num(closing.angleDeg, 1)}°</span>
                  <span />
                </div>
              )}
              <div className={s.edgeFoot}>
                <button type="button" className={s.linkBtn} onClick={() => setEdges([...edges, { length: 10, angleDeg: 90 }])} data-testid="add-edge">
                  + Kante
                </button>
                <span>
                  Fläche · {edges.length + 1} Punkte{' '}
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink)', marginLeft: 6 }} data-testid="plot-area">
                    {squareMeters(A)}
                  </span>
                </span>
              </div>
            </div>
          )}
        </div>

        <div className={s.block}>
          <div className={s.blockHead}>
            <span className={s.num}>02</span>
            <span className={s.blockTitle}>Ausrichtung & Standort</span>
            <span className={s.blockNote}>für den Sonnenstand</span>
          </div>
          <div className={s.orient}>
            <Compass value={north} onChange={setNorth} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className={s.fieldCard} style={{ justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12.5, color: 'var(--ink2)' }}>Nord-Abweichung</span>
                <div style={{ width: 90 }}>
                  <Cell value={north} unit="°" digits={0} onChange={(v) => setNorth(Math.max(-180, Math.min(180, v)))} testId="north" />
                </div>
              </div>
              <div className={s.fieldCard}>
                <Icon name="pin" size={14} color="var(--ink2)" />
                <input placeholder="Adresse oder Ort" value={loc.label} onChange={(e) => setLoc({ ...loc, label: e.target.value })} aria-label="Standort" data-testid="location" />
                <button
                  type="button"
                  className={s.num}
                  title="Aktuellen Standort verwenden"
                  onClick={() =>
                    navigator.geolocation?.getCurrentPosition((p) => setLoc({ ...loc, lat: p.coords.latitude, lon: p.coords.longitude, label: loc.label || 'Aktueller Standort' }))
                  }
                >
                  {num(Math.abs(loc.lat), 2)}° {loc.lat >= 0 ? 'N' : 'S'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className={s.block}>
          <div className={s.blockHead}>
            <span className={s.num}>03</span>
            <span className={s.blockTitle}>Hintergrund</span>
            <span className={s.blockNote}>optional</span>
          </div>
          <FilePick bg={bg} onPick={pickFile} onClear={() => setBg(null)} />
          {bg && (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12.5, color: 'var(--ink2)' }}>
                Deckkraft
                <input className={s.slider} type="range" min={0.1} max={1} step={0.05} value={bg.opacity} onChange={(e) => setBg({ ...bg, opacity: +e.target.value })} />
                <span style={{ fontFamily: 'var(--font-mono)', width: 52, flex: 'none', textAlign: 'right' }}>{num(bg.opacity * 100, 0)} %</span>
              </label>
              <div className={s.calib}>
                <div className={s.calibBadge}>{bg.mpp ? '✓' : `${(bg.a ? 1 : 0) + (bg.b ? 1 : 0)}/2`}</div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 13, lineHeight: 1.45 }}>
                    <b style={{ fontWeight: 600 }}>Maßstab kalibrieren.</b> Klicke zwei Punkte mit bekanntem Abstand und gib die Distanz ein.
                  </div>
                  {bg.a && bg.b && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <NumInput value={bg.distance ?? 10} onChange={(v) => setBg({ ...bg, distance: v })} unit="m" label="Distanz" testId="calib-distance" autoFocus />
                      </div>
                      <button
                        type="button"
                        style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--acc)', color: '#fff', fontWeight: 500 }}
                        onClick={() => {
                          const d = bg.distance ?? 10;
                          setBg({ ...bg, distance: d, mpp: metersPerPixel({ a: bg.a!, b: bg.b!, distanceM: d }) });
                          setStageTab('contour');
                        }}
                        data-testid="calib-apply"
                      >
                        Übernehmen
                      </button>
                    </div>
                  )}
                  {bg.mpp && <div style={{ fontSize: 12, color: 'var(--ink2)' }}>1 px = {num(bg.mpp * 100, 2)} cm · Bild {num(bg.w * bg.mpp, 1)} × {num(bg.h * bg.mpp, 1)} m</div>}
                </div>
              </div>
            </>
          )}
        </div>

        <div className={s.block}>
          <div className={s.fieldCard}>
            <input placeholder="Projektname (optional)" value={name} onChange={(e) => setName(e.target.value)} aria-label="Projektname" data-testid="project-name" />
          </div>
        </div>

        <div className={s.footer}>
          {canCancel ? (
            <button type="button" style={{ fontSize: 13, color: 'var(--ink2)' }} onClick={onCancel}>
              Abbrechen
            </button>
          ) : (
            <button type="button" className={s.sample} onClick={onSample} data-testid="open-sample">
              Beispielgarten öffnen
            </button>
          )}
          <button type="button" className={s.create} disabled={!valid} onClick={create} data-testid="create-project">
            Projekt anlegen
            <Icon name="arrow" size={14} color="#fff" width={1.8} />
          </button>
        </div>
      </div>

      <div className={s.stage}>
        <div className={s.stageInner}>
          {stageTab === 'calib' && bg ? <CalibStage bg={bg} onPoint={(a, b) => setBg({ ...bg, a, b, mpp: null })} /> : <ContourStage boundary={boundary} kind={kind} closingIndex={kind === 'edges' ? edges.length : -1} bg={bg} north={north} />}
        </div>
        <div className={s.stageTabs}>
          <button type="button" className={stageTab === 'contour' ? s.stageTabOn : s.stageTab} onClick={() => setStageTab('contour')}>
            Kontur
          </button>
          <button type="button" className={stageTab === 'calib' ? s.stageTabOn : s.stageTab} onClick={() => bg && setStageTab('calib')} disabled={!bg} style={{ opacity: bg ? 1 : 0.5 }}>
            Kalibrieren
          </button>
          {bg && <span className={s.stageTab}>Hintergrund {num(bg.opacity * 100, 0)} %</span>}
        </div>
      </div>
    </div>
  );
}

function FilePick({ bg, onPick, onClear }: { bg: BgDraft | null; onPick: (f: File) => void; onClear: () => void }) {
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

/** Kompass: Ziehen dreht die Nordrichtung (1°-Schritte) */
function Compass({ value, onChange }: { value: number; onChange: (v: number) => void }) {
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

/** Vorschau der Kontur mit Kantenlängen-Pills; bei kalibriertem Hintergrund liegt das Bild darunter */
function ContourStage({ boundary, kind, closingIndex, bg, north }: { boundary: Vec2[]; kind: string; closingIndex: number; bg: BgDraft | null; north: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 700 });
  useEffect(() => {
    const ro = new ResizeObserver(() => ref.current && setSize({ w: ref.current.clientWidth, h: ref.current.clientHeight }));
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  if (boundary.length < 2) return <div ref={ref} style={{ position: 'absolute', inset: 0 }} />;
  const b = bbox(boundary);
  const pad = 90;
  const k = Math.min((size.w - pad * 2) / Math.max(1, b.maxX - b.minX), (size.h - pad * 2) / Math.max(1, b.maxY - b.minY));
  const ox = (size.w - (b.maxX - b.minX) * k) / 2 - b.minX * k;
  const oy = (size.h - (b.maxY - b.minY) * k) / 2 - b.minY * k;
  const T = (p: Vec2) => ({ x: ox + p.x * k, y: oy + p.y * k });
  const pts = boundary.map(T);
  const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  const bgW = bg?.mpp ? bg.w * bg.mpp : null;
  return (
    <div ref={ref} style={{ position: 'absolute', inset: 0 }}>
      <svg width={size.w} height={size.h} style={{ position: 'absolute', inset: 0 }}>
        {bg && bgW && (
          <image
            href={bg.url}
            opacity={bg.opacity}
            x={ox + ((b.minX + b.maxX) / 2 - bgW / 2) * k}
            y={oy + ((b.minY + b.maxY) / 2 - (bg.h * bg.mpp!) / 2) * k}
            width={bgW * k}
            height={bg.h * bg.mpp! * k}
          />
        )}
        <polygon points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="rgba(61,91,217,.08)" stroke="#3D5BD9" strokeWidth="2" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <rect key={i} x={p.x - 5} y={p.y - 5} width="10" height="10" rx="2" fill="#fff" stroke="#3D5BD9" strokeWidth="1.6" />
        ))}
        {kind === 'edges' && pts.length > 2 && (
          <path d={`M${pts[pts.length - 1].x} ${pts[pts.length - 1].y}L${pts[0].x} ${pts[0].y}`} stroke="#3D5BD9" strokeWidth="1" strokeDasharray="4 4" />
        )}
        <g transform={`translate(${size.w - 60} 60) rotate(${north})`}>
          <circle r="26" fill="#fff" stroke="rgba(31,34,36,.15)" />
          <path d="M0 -18l6 18h-12Z" fill="#C4553A" />
          <path d="M0 18l-6-18h12Z" fill="#B9BBB5" />
          <text y="-30" fontFamily="Newsreader, serif" fontStyle="italic" fontSize="13" textAnchor="middle" fill="#1F2224">
            N
          </text>
        </g>
      </svg>
      {pts.map((p, i) => {
        const q = pts[(i + 1) % pts.length];
        const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
        const d = Math.hypot(m.x - cx, m.y - cy) || 1;
        const L = dist(boundary[i], boundary[(i + 1) % boundary.length]);
        return (
          <div key={i} className={s.pill} style={{ left: m.x + ((m.x - cx) / d) * 22, top: m.y + ((m.y - cy) / d) * 22, opacity: i === closingIndex ? 0.6 : 1 }}>
            {num(L, 2)} m
          </div>
        );
      })}
    </div>
  );
}

/** Kalibrieren: Bild einpassen, zwei Punkte setzen (Bildpixel) */
function CalibStage({ bg, onPoint }: { bg: BgDraft; onPoint: (a: Vec2 | null, b: Vec2 | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 700 });
  const [hover, setHover] = useState<Vec2 | null>(null);
  useEffect(() => {
    const ro = new ResizeObserver(() => ref.current && setSize({ w: ref.current.clientWidth, h: ref.current.clientHeight }));
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const pad = 40;
  const k = Math.min((size.w - pad * 2) / bg.w, (size.h - pad * 2) / bg.h);
  const ox = (size.w - bg.w * k) / 2;
  const oy = (size.h - bg.h * k) / 2;
  const toScreen = (p: Vec2) => ({ x: ox + p.x * k, y: oy + p.y * k });
  const toImage = (e: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left - ox) / k, y: (e.clientY - r.top - oy) / k };
  };
  const A = bg.a && toScreen(bg.a);
  const B = (bg.b && toScreen(bg.b)) ?? (bg.a && hover ? toScreen(hover) : null);
  const pxLen = bg.a && (bg.b ?? hover) ? dist(bg.a, (bg.b ?? hover)!) : 0;
  return (
    <div
      ref={ref}
      style={{ position: 'absolute', inset: 0, cursor: 'crosshair' }}
      onMouseMove={(e) => setHover(toImage(e))}
      onClick={(e) => {
        const p = toImage(e);
        if (p.x < 0 || p.y < 0 || p.x > bg.w || p.y > bg.h) return;
        if (!bg.a || bg.b) onPoint(p, null);
        else onPoint(bg.a, p);
      }}
      data-testid="calib-stage"
    >
      <img src={bg.url} alt="" style={{ position: 'absolute', left: ox, top: oy, width: bg.w * k, height: bg.h * k, opacity: Math.max(0.6, bg.opacity), pointerEvents: 'none' }} />
      <svg width={size.w} height={size.h} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {A && B && <path d={`M${A.x} ${A.y}L${B.x} ${B.y}`} stroke="#E0567A" strokeWidth="2" />}
        {[A, bg.b && B].map((P, i) =>
          P ? (
            <g key={i}>
              <circle cx={P.x} cy={P.y} r="7" fill="#fff" stroke="#E0567A" strokeWidth="2" />
              <circle cx={P.x} cy={P.y} r="2" fill="#E0567A" />
            </g>
          ) : null,
        )}
      </svg>
      {A && B && (
        <div className={s.pillPink} style={{ left: (A.x + B.x) / 2, top: (A.y + B.y) / 2 - 18 }}>
          {bg.distance && bg.b ? `${num(bg.distance, 2)} m` : `${num(pxLen, 0)} px`}
        </div>
      )}
      <div className={s.tipDark} style={{ left: 20, bottom: 20 }}>
        {!bg.a ? 'Ersten Punkt mit bekanntem Abstand anklicken' : !bg.b ? 'Zweiten Punkt anklicken' : 'Distanz links eingeben und übernehmen'}
      </div>
    </div>
  );
}
