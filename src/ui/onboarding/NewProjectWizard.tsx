/**
 * Neues Projekt (Design-Screen 01): Kontur als Rechteck oder Polygon mit exakten
 * Kantenlängen und Innenwinkeln – Punkte auch direkt in der Vorschau ziehbar –,
 * Nordausrichtung, Ort für den Sonnenstand, optional Lageplan/Luftbild, das an zwei
 * Grundstücksecken ausgerichtet (Maßstab, Drehung, Lage) und danach verschoben wird.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { alignTwoPoints, applyCalibration, metersPerPixel, northFromImageRotation } from '../../core/calibration';
import { findPlace } from '../../core/geo/places';
import { num, parseNumber, squareMeters } from '../../core/format';
import { area, bbox } from '../../core/geometry/polygon';
import { plotEdgesFromPoints, pointsFromEdges, polygonFromEdges } from '../../core/geometry/plot';
import { dist } from '../../core/geometry/vec';
import { createProject } from '../../core/model/defaults';
import { newId } from '../../core/model/ids';
import type { BackgroundImage, GeoLocation, PlotEdge, PlotSpec, Project, Vec2 } from '../../core/model/types';
import { LocationFields } from '../components/LocationFields';
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
  /** zwei Punkte im Bild (Pixel) */
  a: Vec2 | null;
  b: Vec2 | null;
  distance: number | null;
  /** Lage nach dem Ausrichten; null = noch nicht ausgerichtet */
  place: Placement | null;
  mode: 'corners' | 'distance';
  /** zugeordnete Ecken (Index in der Kontur) */
  ca: number;
  cb: number;
  /** Bild ist genordet → Nordrichtung aus der Drehung */
  northUp: boolean;
}

const DEFAULT_PLACE = findPlace('Frankfurt am Main')!;

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

/** Lage des Bildes im Assistenten (Weltkoordinaten des Assistenten) */
interface Placement {
  origin: Vec2;
  metersPerPixel: number;
  rotationDeg: number;
}

const rectPoints = (w: number, d: number): Vec2[] => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: d },
  { x: 0, y: d },
];

/** Gezogene Punkte auf 1 cm runden */
const cm = (p: Vec2): Vec2 => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 });

export function NewProjectWizard({ onCreate, onCancel, onSample, canCancel }: { onCreate: (r: WizardResult) => void; onCancel: () => void; onSample: () => void; canCancel: boolean }) {
  const [kind, setKind] = useState<'rect' | 'edges'>('rect');
  const [width, setWidth] = useState(30);
  const [depth, setDepth] = useState(50);
  /** Polygon als Punkte (A zuerst, im Uhrzeigersinn); die Kantentabelle wird daraus abgeleitet */
  const [poly, setPoly] = useState<Vec2[]>(DESIGN_POLY);
  const [north, setNorth] = useState(0);
  const [loc, setLoc] = useState<GeoLocation>({ label: '', place: DEFAULT_PLACE.name, lat: DEFAULT_PLACE.lat, lon: DEFAULT_PLACE.lon, timeZone: DEFAULT_PLACE.timeZone });
  const [bg, setBg] = useState<BgDraft | null>(null);
  const [stageTab, setStageTab] = useState<'contour' | 'calib'>('contour');
  const [name, setName] = useState('');

  const boundary = useMemo(() => (kind === 'rect' ? rectPoints(width, depth) : poly), [kind, width, depth, poly]);
  const edges = useMemo(() => plotEdgesFromPoints(poly), [poly]);
  const closing = useMemo(() => (kind === 'edges' ? polygonFromEdges(edges).closing : null), [kind, edges]);
  const A = area(boundary);
  const valid = boundary.length >= 3 && A > 0.5 && (kind === 'rect' || (closing !== null && closing.length > 0.01));

  const editEdge = (i: number, patch: Partial<PlotEdge>) => setPoly(pointsFromEdges(edges.map((e, j) => (j === i ? { ...e, ...patch } : e)), poly[0]));

  /** Punkt in der Vorschau gezogen; ein Rechteck wird dabei zum Polygon */
  const moveVertex = (i: number, p: Vec2) => {
    const base = kind === 'rect' ? rectPoints(width, depth) : poly;
    setPoly(base.map((q, j) => (j === i ? cm(p) : q)));
    if (kind === 'rect') setKind('edges');
  };
  const insertVertex = (afterIndex: number, p: Vec2) => {
    const base = kind === 'rect' ? rectPoints(width, depth) : poly;
    setPoly([...base.slice(0, afterIndex + 1), cm(p), ...base.slice(afterIndex + 1)]);
    if (kind === 'rect') setKind('edges');
  };
  const deleteVertex = (i: number) => {
    if (kind !== 'edges' || poly.length <= 3) return;
    setPoly(poly.filter((_, j) => j !== i));
  };

  const pickFile = async (f: File) => {
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      setBg({ blob: f, url, name: f.name, w: img.naturalWidth, h: img.naturalHeight, opacity: 0.6, a: null, b: null, distance: null, place: null, mode: 'corners', ca: 0, cb: 1, northUp: true });
      setStageTab('calib');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      alert('Das Bild konnte nicht gelesen werden. Unterstützt werden PNG, JPEG und WebP (PDF bitte vorher als Bild exportieren).');
    };
    img.src = url;
  };

  /** Ohne Ausrichtung: Bild mittig auf das Grundstück, Bildbreite = Grundstücksbreite */
  const defaultPlacement = (d: BgDraft, mpp?: number): Placement => {
    const b = bbox(boundary);
    const m = mpp ?? (b.maxX - b.minX) / d.w;
    return { origin: { x: (b.minX + b.maxX) / 2 - (d.w * m) / 2, y: (b.minY + b.maxY) / 2 - (d.h * m) / 2 }, metersPerPixel: m, rotationDeg: 0 };
  };

  const applyCorners = () => {
    if (!bg?.a || !bg.b) return;
    const r = alignTwoPoints(bg.a, bg.b, boundary[bg.ca], boundary[bg.cb]);
    setBg({ ...bg, place: r, distance: r.calibration.distanceM });
    if (bg.northUp) setNorth(northFromImageRotation(r.rotationDeg));
    setStageTab('contour');
  };
  const applyDistance = () => {
    if (!bg?.a || !bg.b) return;
    const d = bg.distance ?? 10;
    const mpp = metersPerPixel({ a: bg.a, b: bg.b, distanceM: d });
    // vorhandene Lage behalten (Punkt a bleibt stehen), sonst mittig einpassen
    const place = bg.place ? applyCalibration({ ...bg.place, calibration: null }, { a: bg.a, b: bg.b, distanceM: d }) : defaultPlacement(bg, mpp);
    setBg({ ...bg, distance: d, place: { origin: place.origin, metersPerPixel: place.metersPerPixel, rotationDeg: place.rotationDeg } });
    setStageTab('contour');
  };

  const create = () => {
    const plot: PlotSpec = kind === 'rect' ? { kind: 'rect', width, depth } : { kind: 'edges', edges };
    const place = loc.place || loc.label;
    const project = createProject({ name: name.trim() || (place ? `Garten ${(loc.label || place).split(',')[0]}` : 'Neuer Garten'), plot, northDeg: north, location: loc });
    // Das Projekt beginnt bei A = (0,0); Bildlage entsprechend verschieben
    const offset = kind === 'rect' ? { x: 0, y: 0 } : poly[0];
    let background: BackgroundImage | null = null;
    if (bg) {
      const p = bg.place ?? defaultPlacement(bg);
      background = {
        blobId: newId(),
        fileName: bg.name,
        mime: bg.blob.type || 'image/png',
        pixelWidth: bg.w,
        pixelHeight: bg.h,
        origin: { x: p.origin.x - offset.x, y: p.origin.y - offset.y },
        metersPerPixel: p.metersPerPixel,
        rotationDeg: p.rotationDeg,
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
                  <Cell value={e.length} unit="m" onChange={(v) => v > 0 && editEdge(i, { length: v })} testId={`edge-${i}-len`} />
                  <Cell value={e.angleDeg} unit="°" digits={1} onChange={(v) => editEdge(i, { angleDeg: v })} testId={`edge-${i}-ang`} />
                  <button
                    type="button"
                    aria-label={`Punkt ${LETTERS[i + 1]} entfernen`}
                    title={`Punkt ${LETTERS[i + 1]} entfernen`}
                    disabled={poly.length <= 3}
                    onClick={() => deleteVertex(i + 1)}
                    style={{ color: 'var(--ink3)', opacity: poly.length <= 3 ? 0.3 : 1 }}
                  >
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
                <button type="button" className={s.linkBtn} onClick={() => setPoly(pointsFromEdges([...edges, { length: 10, angleDeg: 90 }], poly[0]))} data-testid="add-edge">
                  + Kante
                </button>
                <span>
                  Fläche · {poly.length} Punkte{' '}
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink)', marginLeft: 6 }} data-testid="plot-area">
                    {squareMeters(A)}
                  </span>
                </span>
              </div>
            </div>
          )}
          <div className={s.hint}>Punkte in der Vorschau ziehen. Doppelklick auf eine Kante fügt einen Punkt ein, Doppelklick auf einen Punkt entfernt ihn.</div>
        </div>

        <div className={s.block}>
          <div className={s.blockHead}>
            <span className={s.num}>02</span>
            <span className={s.blockTitle}>Ausrichtung & Standort</span>
            <span className={s.blockNote}>für Sonne und Schatten</span>
          </div>
          <div className={s.orient}>
            <Compass value={north} onChange={setNorth} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
              <div className={s.fieldCard} style={{ justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12.5, color: 'var(--ink2)' }}>Nord-Abweichung</span>
                <div style={{ width: 90 }}>
                  <Cell value={north} unit="°" digits={1} onChange={(v) => setNorth(Math.max(-180, Math.min(180, v)))} testId="north" />
                </div>
              </div>
              <div className={s.hint} style={{ margin: 0 }}>
                {bg?.place && bg.northUp ? 'Aus dem genordeten Hintergrundbild übernommen.' : 'Wohin zeigt Norden, wenn der Plan oben liegt? Kompass ziehen oder Grad eingeben.'}
              </div>
            </div>
          </div>
          <LocationFields value={loc} onChange={setLoc} />
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
                <input className={s.slider} type="range" min={0.05} max={1} step={0.05} value={bg.opacity} onChange={(e) => setBg({ ...bg, opacity: +e.target.value })} data-testid="wiz-opacity" />
                <span style={{ fontFamily: 'var(--font-mono)', width: 52, flex: 'none', textAlign: 'right' }}>{num(bg.opacity * 100, 0)} %</span>
              </label>
              <AlignBox bg={bg} setBg={setBg} corners={boundary.length} onCorners={applyCorners} onDistance={applyDistance} onStart={() => setStageTab('calib')} />
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
          {stageTab === 'calib' && bg ? (
            <CalibStage bg={bg} onPoint={(a, b) => setBg({ ...bg, a, b })} />
          ) : (
            <ContourStage
              boundary={boundary}
              kind={kind}
              closingIndex={kind === 'edges' ? poly.length - 1 : -1}
              bg={bg}
              north={north}
              onMoveVertex={moveVertex}
              onInsertVertex={insertVertex}
              onDeleteVertex={deleteVertex}
              onMoveImage={(d) => bg?.place && setBg({ ...bg, place: { ...bg.place, origin: { x: bg.place.origin.x + d.x, y: bg.place.origin.y + d.y } } })}
            />
          )}
        </div>
        <div className={s.stageTabs}>
          <button type="button" className={stageTab === 'contour' ? s.stageTabOn : s.stageTab} onClick={() => setStageTab('contour')} data-testid="stage-contour">
            Kontur
          </button>
          <button type="button" className={stageTab === 'calib' ? s.stageTabOn : s.stageTab} onClick={() => bg && setStageTab('calib')} disabled={!bg} style={{ opacity: bg ? 1 : 0.5 }} data-testid="stage-calib">
            Bild ausrichten
          </button>
          {bg && <span className={s.stageTab}>Hintergrund {num(bg.opacity * 100, 0)} %</span>}
        </div>
      </div>
    </div>
  );
}

/** Ausrichten: zwei Bildpunkte den Grundstücksecken zuordnen – oder nur den Maßstab über eine Strecke setzen */
function AlignBox({ bg, setBg, corners, onCorners, onDistance, onStart }: { bg: BgDraft; setBg: (b: BgDraft) => void; corners: number; onCorners: () => void; onDistance: () => void; onStart: () => void }) {
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


type View = { k: number; ox: number; oy: number };

/**
 * Vorschau der Kontur mit Kantenlängen und Eckbuchstaben. Punkte lassen sich ziehen,
 * Doppelklick auf eine Kante fügt einen Punkt ein, auf einen Punkt entfernt ihn.
 * Ein ausgerichtetes Hintergrundbild liegt darunter und lässt sich verschieben.
 */
function ContourStage({
  boundary,
  kind,
  closingIndex,
  bg,
  north,
  onMoveVertex,
  onInsertVertex,
  onDeleteVertex,
  onMoveImage,
}: {
  boundary: Vec2[];
  kind: string;
  closingIndex: number;
  bg: BgDraft | null;
  north: number;
  onMoveVertex: (i: number, p: Vec2) => void;
  onInsertVertex: (afterIndex: number, p: Vec2) => void;
  onDeleteVertex: (i: number) => void;
  onMoveImage: (d: Vec2) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 700 });
  const [drag, setDrag] = useState<{ kind: 'vertex'; i: number; from: Vec2; moved: boolean } | { kind: 'image'; last: Vec2 } | null>(null);
  const frozen = useRef<View | null>(null);
  useEffect(() => {
    const ro = new ResizeObserver(() => ref.current && setSize({ w: ref.current.clientWidth, h: ref.current.clientHeight }));
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  if (boundary.length < 2) return <div ref={ref} style={{ position: 'absolute', inset: 0 }} />;

  // Ansicht einpassen – während des Ziehens eingefroren, damit nichts springt
  let view: View;
  if (drag && frozen.current) view = frozen.current;
  else {
    const b = bbox(boundary);
    const pad = 90;
    const k = Math.min((size.w - pad * 2) / Math.max(1, b.maxX - b.minX), (size.h - pad * 2) / Math.max(1, b.maxY - b.minY));
    view = { k, ox: (size.w - (b.maxX - b.minX) * k) / 2 - b.minX * k, oy: (size.h - (b.maxY - b.minY) * k) / 2 - b.minY * k };
  }
  const { k, ox, oy } = view;
  const T = (p: Vec2) => ({ x: ox + p.x * k, y: oy + p.y * k });
  const toWorld = (e: React.PointerEvent | React.MouseEvent): Vec2 => {
    const r = ref.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left - ox) / k, y: (e.clientY - r.top - oy) / k };
  };
  const pts = boundary.map(T);
  const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  const place = bg?.place ?? null;

  const start = (d: NonNullable<typeof drag>, e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    frozen.current = view;
    setDrag(d);
  };

  return (
    <div
      ref={ref}
      style={{ position: 'absolute', inset: 0, cursor: drag?.kind === 'image' ? 'grabbing' : place ? 'grab' : 'default', touchAction: 'none', userSelect: 'none' }}
      onPointerDown={(e) => place && start({ kind: 'image', last: toWorld(e) }, e)}
      onPointerMove={(e) => {
        if (!drag) return;
        const w = toWorld(e);
        if (drag.kind === 'vertex') {
          // erst ab 3 px Bewegung ziehen – ein Klick verändert nichts
          if (!drag.moved && Math.hypot(e.clientX - drag.from.x, e.clientY - drag.from.y) < 3) return;
          if (!drag.moved) setDrag({ ...drag, moved: true });
          onMoveVertex(drag.i, w);
        }
        else {
          onMoveImage({ x: w.x - drag.last.x, y: w.y - drag.last.y });
          setDrag({ kind: 'image', last: w });
        }
      }}
      onPointerUp={() => {
        setDrag(null);
        frozen.current = null;
      }}
      data-testid="contour-stage"
    >
      <svg width={size.w} height={size.h} style={{ position: 'absolute', inset: 0 }}>
        {bg && place && (
          <image
            href={bg.url}
            opacity={bg.opacity}
            x={0}
            y={0}
            width={bg.w}
            height={bg.h}
            preserveAspectRatio="none"
            transform={`translate(${ox + place.origin.x * k} ${oy + place.origin.y * k}) rotate(${place.rotationDeg}) scale(${place.metersPerPixel * k})`}
            style={{ pointerEvents: 'none' }}
          />
        )}
        <polygon points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="rgba(61,91,217,.08)" stroke="#3D5BD9" strokeWidth="2" strokeLinejoin="round" style={{ pointerEvents: 'none' }} />
        {kind === 'edges' && pts.length > 2 && (
          <path d={`M${pts[pts.length - 1].x} ${pts[pts.length - 1].y}L${pts[0].x} ${pts[0].y}`} stroke="#3D5BD9" strokeWidth="1" strokeDasharray="4 4" style={{ pointerEvents: 'none' }} />
        )}
        {/* breite, unsichtbare Kanten für Doppelklick = Punkt einfügen */}
        {pts.map((p, i) => {
          const q = pts[(i + 1) % pts.length];
          return (
            <line
              key={`e${i}`}
              x1={p.x}
              y1={p.y}
              x2={q.x}
              y2={q.y}
              stroke="transparent"
              strokeWidth="12"
              style={{ cursor: 'copy' }}
              onPointerDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => onInsertVertex(i, toWorld(e))}
              data-testid={`edge-hit-${i}`}
            />
          );
        })}
        {pts.map((p, i) => (
          <g key={i}>
            <rect
              x={p.x - 6}
              y={p.y - 6}
              width="12"
              height="12"
              rx="2.5"
              fill={drag?.kind === 'vertex' && drag.i === i ? '#3D5BD9' : '#fff'}
              stroke="#3D5BD9"
              strokeWidth="1.6"
              style={{ cursor: 'move' }}
              onPointerDown={(e) => start({ kind: 'vertex', i, from: { x: e.clientX, y: e.clientY }, moved: false }, e)}
              onDoubleClick={() => onDeleteVertex(i)}
              data-testid={`vertex-${i}`}
            />
            <text
              x={p.x + ((p.x - cx) / (Math.hypot(p.x - cx, p.y - cy) || 1)) * 18}
              y={p.y + ((p.y - cy) / (Math.hypot(p.x - cx, p.y - cy) || 1)) * 18 + 4}
              textAnchor="middle"
              fontFamily="Geist Mono, monospace"
              fontSize="11"
              fontWeight="600"
              fill="#3D5BD9"
              style={{ pointerEvents: 'none' }}
            >
              {LETTERS[i]}
            </text>
          </g>
        ))}
        <g transform={`translate(${size.w - 60} 60) rotate(${north})`} style={{ pointerEvents: 'none' }}>
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
      {bg && !place && (
        <div className={s.tipDark} style={{ left: 20, bottom: 20 }}>
          Hintergrund erscheint hier, sobald er ausgerichtet ist („Bild ausrichten“).
        </div>
      )}
      {place && !drag && (
        <div className={s.tipDark} style={{ left: 20, bottom: 20 }}>
          Bild ziehen zum Verschieben · Punkte ziehen ändert die Kontur
        </div>
      )}
    </div>
  );
}

/** Ausrichten: Bild einpassen, zwei Punkte setzen (Bildpixel) */
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
      <img src={bg.url} alt="" style={{ position: 'absolute', left: ox, top: oy, width: bg.w * k, height: bg.h * k, opacity: bg.opacity, pointerEvents: 'none' }} />
      <svg width={size.w} height={size.h} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {A && B && <path d={`M${A.x} ${A.y}L${B.x} ${B.y}`} stroke="#E0567A" strokeWidth="2" />}
        {[A, bg.b && B].map((P, i) =>
          P ? (
            <g key={i}>
              <circle cx={P.x} cy={P.y} r="9" fill="#fff" stroke="#E0567A" strokeWidth="2" />
              <text x={P.x} y={P.y + 3.5} textAnchor="middle" fontFamily="Geist Mono, monospace" fontSize="10" fontWeight="700" fill="#E0567A">
                {i + 1}
              </text>
            </g>
          ) : null,
        )}
      </svg>
      {A && B && (
        <div className={s.pillPink} style={{ left: (A.x + B.x) / 2, top: (A.y + B.y) / 2 - 18 }}>
          {num(pxLen, 0)} px
        </div>
      )}
      <div className={s.tipDark} style={{ left: 20, bottom: 20 }}>
        {!bg.a ? 'Punkt 1 anklicken, z. B. eine Grundstücksecke' : !bg.b ? 'Punkt 2 anklicken, möglichst weit entfernt' : 'Links die Ecken zuordnen und „Ausrichten“ – erneut klicken setzt neu'}
      </div>
    </div>
  );
}
