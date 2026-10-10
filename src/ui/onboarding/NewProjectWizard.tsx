/**
 * Neues Projekt (Design-Screen 01): Kontur als Rechteck oder Polygon mit exakten
 * Kantenlängen und Innenwinkeln – Punkte auch direkt in der Vorschau ziehbar –,
 * Nordausrichtung, Ort für den Sonnenstand, optional Lageplan/Luftbild, das an zwei
 * Grundstücksecken ausgerichtet (Maßstab, Drehung, Lage) und danach verschoben wird.
 */
import { useMemo, useState } from 'react';
import { alignTwoPoints, applyCalibration, metersPerPixel, northFromImageRotation } from '../../core/calibration';
import { num, squareMeters } from '../../core/format';
import { area, bbox } from '../../core/geometry/polygon';
import { plotEdgesFromPoints, pointsFromEdges, polygonFromEdges } from '../../core/geometry/plot';
import { createProject } from '../../core/model/defaults';
import { newId } from '../../core/model/ids';
import type { BackgroundImage, GeoLocation, PlotEdge, PlotSpec, Project, Vec2 } from '../../core/model/types';
import { LocationFields } from '../components/LocationFields';
import { Icon, Logo } from '../icons';
import { AlignBox, FilePick } from './BackgroundControls';
import { CalibStage } from './CalibStage';
import { Compass } from './Compass';
import { ContourStage } from './ContourStage';
import { Cell, NumInput } from './WizardInputs';
import { cm, DEFAULT_PLACE, DESIGN_POLY, LETTERS, rectPoints, type BgDraft, type Placement } from './wizardModel';
import s from './onboarding.module.css';

export interface WizardResult {
  project: Project;
  backgroundBlob: Blob | null;
}

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
