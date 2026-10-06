import { useMemo, useState } from 'react';
import type { Draft } from 'immer';
import { getItem } from '../../core/catalog/items';
import { getMaterial } from '../../core/catalog/materials';
import { getSpecies } from '../../core/catalog/plants';
import { degrees, elevation, euros, meters, num, squareMeters, unitLabel } from '../../core/format';
import { itemSize, plantDiameter, resolveAnchor } from '../../core/geometry/objects';
import { area, perimeter } from '../../core/geometry/polygon';
import { toPath } from '../../core/geometry/shape';
import { dist } from '../../core/geometry/vec';
import { newId } from '../../core/model/ids';
import type { AreaObject, PlanObject, Project } from '../../core/model/types';
import { objectQuantities, projectSummary, type ObjectQuantities } from '../../core/quantities/quantities';
import { materialSwatchStyle } from '../../render/textures/materialTextures';
import { cmd, useEditor } from '../../state';
import { Field, NumberField, Toggle } from '../components/controls';
import { Icon } from '../icons';
import { glyphSrc, SYMBOL_GLYPH } from '../library/glyphs';
import type { Brush } from '../../state/types';
import { BackgroundSection } from './BackgroundSection';
import u from '../components/ui.module.css';
import s from './props.module.css';

const TYPE_LABEL: Record<PlanObject['type'], string> = {
  area: 'Fläche',
  path: 'Weg',
  plant: 'Pflanze',
  planting: 'Pflanzung',
  hedge: 'Hecke',
  item: 'Objekt',
  dimension: 'Bemaßung',
  text: 'Text',
  lamp: 'Leuchte',
};

const SOURCE_LABEL: Record<string, string> = { rect: 'Rechteck', polygon: 'Polygon', bezier: 'Bézier', freehand: 'Freihand', boolean: 'Polygon' };

const PATH_MATERIALS = ['gravel', 'paving', 'wood', 'mulch', 'barkMulch', 'soil'];
const AREA_MATERIALS = ['lawn', 'gravel', 'paving', 'wood', 'mulch', 'barkMulch', 'soil', 'water'];

function update<T extends PlanObject>(o: T, label: string, fn: (d: Draft<T>) => unknown) {
  cmd.updateObject<T>(o.id, label, fn);
}

/** Rechte Eigenschaften-Leiste: Material, Fläche, Umfang, Höhe/Ebene, Kosten, Notizen */
export function PropertiesPanel() {
  const doc = useEditor((st) => st.doc);
  const selection = useEditor((st) => st.session.selection);
  const tool = useEditor((st) => st.session.tool);
  const brush = useEditor((st) => st.session.brush);
  if (!doc) return null;
  const objs = selection.map((id) => doc.objects[id]).filter(Boolean);
  const showBrush = objs.length === 0 && tool === 'plant';
  return (
    <aside className={s.panel} aria-label="Eigenschaften" data-testid="properties">
      {showBrush && <BrushDetail brush={brush} />}
      {objs.length === 0 && !showBrush && <ProjectInfo doc={doc} />}
      {objs.length === 1 && <ObjectProps key={objs[0].id} o={objs[0]} doc={doc} />}
      {objs.length > 1 && <MultiProps objs={objs} />}
    </aside>
  );
}

function Header({ o, doc, swatch }: { o: PlanObject; doc: Project; swatch: React.CSSProperties }) {
  const layer = doc.layers[o.layerId];
  const fallback = defaultName(o);
  let sub = TYPE_LABEL[o.type];
  if (o.type === 'path' || o.type === 'hedge') sub += ` · ${SOURCE_LABEL[o.centerline.source] ?? ''}, ${o.centerline.nodes.length} Knoten`;
  if (o.type === 'area' || o.type === 'planting') {
    const p = toPath(o.region.outer);
    sub += ` · ${SOURCE_LABEL[p.source] ?? ''}${o.region.outer.kind === 'path' ? `, ${p.nodes.length} Punkte` : ''}`;
  }
  return (
    <div className={s.head}>
      <div className={s.headSwatch} style={swatch} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <input
          key={o.name ?? fallback}
          className={s.title}
          defaultValue={o.name ?? fallback}
          aria-label="Name"
          data-testid="prop-name"
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v !== (o.name ?? fallback)) update(o, 'Umbenennen', (d) => void (d.name = v || null));
          }}
        />
        <div className={s.sub}>
          {sub} · Ebene {layer?.name}
        </div>
      </div>
    </div>
  );
}

function defaultName(o: PlanObject): string {
  switch (o.type) {
    case 'area':
    case 'path':
      return getMaterial(o.materialId).name.split(',')[0];
    case 'plant':
    case 'hedge':
      return getSpecies(o.speciesId).name;
    case 'item':
      return getItem(o.catalogId).name;
    case 'text':
      return o.text;
    default:
      return TYPE_LABEL[o.type];
  }
}

function MaterialPicker({ o, ids }: { o: Extract<PlanObject, { type: 'area' | 'path' }>; ids: string[] }) {
  const m = getMaterial(o.materialId);
  return (
    <div className={s.section}>
      <div className={u.eyebrow}>Material</div>
      <div className={s.swatches}>
        {ids.map((id) => {
          const mm = getMaterial(id);
          return (
            <button
              key={id}
              type="button"
              title={mm.name}
              aria-label={mm.name}
              aria-pressed={id === o.materialId}
              className={id === o.materialId ? s.swatchOn : s.swatch}
              style={materialSwatchStyle(mm, 60)}
              onClick={() => update(o, 'Material ändern', (d) => void (d.materialId = id))}
              data-testid={`mat-${id}`}
            />
          );
        })}
      </div>
      <div className={s.row}>
        <span>{m.name}</span>
        <span className={s.muted}>{m.depthM ? `Schicht ${num(m.depthM * 100, 0)} cm` : m.unitSizeM ? `${num(m.unitSizeM.w * 100, 0)} × ${num(m.unitSizeM.d * 100, 0)} cm` : ''}</span>
      </div>
    </div>
  );
}

function LayerSelect({ o, doc }: { o: PlanObject; doc: Project }) {
  return (
    <div className={s.row} style={{ padding: 0 }}>
      <div className={u.field} style={{ width: '100%' }}>
        <span className={u.fieldLabel}>Ebene</span>
        <select className={s.select} value={o.layerId} onChange={(e) => cmd.moveToLayer([o.id], e.target.value)} aria-label="Ebene">
          {doc.layerOrder.map((id) => (
            <option key={id} value={id}>
              {doc.layers[id].name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function ElevationField({ o }: { o: PlanObject }) {
  return <NumberField label="Höhe" value={o.elevation} format={elevation} onCommit={(v) => update(o, 'Höhe ändern', (d) => void (d.elevation = v))} testId="prop-elevation" />;
}

function Costs({ q }: { q: ObjectQuantities }) {
  if (!q.lines.length) return null;
  return (
    <div className={s.section} style={{ gap: 8 }}>
      <div className={u.eyebrow}>Kosten</div>
      <div className={s.row} style={{ alignItems: 'baseline' }}>
        <span className={s.costBig} data-testid="prop-cost">
          {euros(q.total)}
        </span>
        <span className={s.muted} style={{ fontSize: 12 }}>
          Material, netto
        </span>
      </div>
      <div className={s.costLines}>
        {q.lines.map((l) => (
          <div key={l.key} className={s.costLine}>
            <span>
              {l.unit === 'm' || l.unit === 'pcs' ? `${l.label.split(' ')[0]} ` : ''}
              {num(l.quantity, l.unit === 'pcs' ? 0 : 1)} {unitLabel(l.unit)} × {num(l.unitPrice, 2)} €
            </span>
            <span className={u.mono}>{euros(l.total)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Notes({ o }: { o: PlanObject }) {
  const [text, setText] = useState('');
  return (
    <div className={s.section} style={{ gap: 8 }}>
      <div className={u.eyebrow}>Notizen</div>
      {o.notes.map((n) => (
        <div key={n.id} className={s.note}>
          <div className={s.noteAvatar}>{n.author}</div>
          <div className={s.noteText}>{n.text}</div>
          <button type="button" className={u.iconBtn} style={{ width: 20, height: 20 }} aria-label="Notiz löschen" onClick={() => update(o, 'Notiz löschen', (d) => void (d.notes = d.notes.filter((x) => x.id !== n.id)))}>
            <Icon name="close" size={11} />
          </button>
        </div>
      ))}
      <input
        className={s.noteInput}
        placeholder="Notiz hinzufügen …"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && text.trim()) {
            const note = { id: newId(), author: 'JK', text: text.trim(), createdAt: new Date().toISOString() };
            update(o, 'Notiz hinzufügen', (d) => void d.notes.push(note));
            setText('');
          }
        }}
        data-testid="note-input"
      />
    </div>
  );
}

function Actions({ o }: { o: PlanObject }) {
  return (
    <div className={s.actions}>
      <button type="button" className={s.action} onClick={() => cmd.duplicateObjects([o.id])}>
        Duplizieren
      </button>
      <button type="button" className={s.action} onClick={() => cmd.reorderObject(o.id, 'front')}>
        Nach vorne
      </button>
      <button type="button" className={s.action} onClick={() => cmd.reorderObject(o.id, 'back')}>
        Nach hinten
      </button>
      <button type="button" className={`${s.action} ${s.danger}`} onClick={() => cmd.deleteObjects([o.id])} data-testid="delete-btn">
        <Icon name="trash" size={13} /> Löschen
      </button>
    </div>
  );
}

function ObjectProps({ o, doc }: { o: PlanObject; doc: Project }) {
  const q = useMemo(() => objectQuantities(o, doc.priceOverrides), [o, doc.priceOverrides]);
  const swatch: React.CSSProperties =
    o.type === 'area' || o.type === 'path'
      ? materialSwatchStyle(getMaterial(o.materialId), 50)
      : o.type === 'planting' && o.mulchMaterialId
        ? materialSwatchStyle(getMaterial(o.mulchMaterialId), 50)
        : o.type === 'plant' || o.type === 'hedge'
          ? { background: `radial-gradient(circle at 40% 35%, #ffffff44, ${getSpecies(o.speciesId).colors.summer} 60%)` }
          : o.type === 'item'
            ? { background: `url("${glyphSrc(SYMBOL_GLYPH[getItem(o.catalogId).symbol] ?? 'edge')}") center/32px no-repeat, rgba(255,255,255,.6)` }
            : { background: 'var(--fld)' };

  return (
    <>
      <Header o={o} doc={doc} swatch={swatch} />
      {o.type === 'area' && <AreaProps o={o} q={q} doc={doc} />}
      {o.type === 'path' && <PathProps o={o} q={q} doc={doc} />}
      {o.type === 'planting' && <PlantingProps o={o} q={q} doc={doc} />}
      {o.type === 'hedge' && <HedgeProps o={o} q={q} doc={doc} />}
      {o.type === 'plant' && <PlantProps o={o} doc={doc} />}
      {o.type === 'item' && <ItemProps o={o} doc={doc} />}
      {o.type === 'text' && <TextProps o={o} />}
      {o.type === 'dimension' && <DimensionProps o={o} doc={doc} />}
      <Costs q={q} />
      <Notes o={o} />
      <Actions o={o} />
    </>
  );
}

function AreaProps({ o, q, doc }: { o: AreaObject; q: ObjectQuantities; doc: Project }) {
  const r = o.region.outer.kind === 'rect' ? o.region.outer : null;
  return (
    <>
      <MaterialPicker o={o} ids={AREA_MATERIALS} />
      <div className={s.section}>
        <div className={u.eyebrow}>Geometrie</div>
        <div className={s.grid2}>
          {r && (
            <>
              <NumberField label="Breite" value={r.width} format={(v) => meters(v)} min={0.05} onCommit={(v) => update(o, 'Breite ändern', (d) => void (d.region.outer.kind === 'rect' && (d.region.outer.width = v)))} testId="prop-width" />
              <NumberField label="Tiefe" value={r.depth} format={(v) => meters(v)} min={0.05} onCommit={(v) => update(o, 'Tiefe ändern', (d) => void (d.region.outer.kind === 'rect' && (d.region.outer.depth = v)))} testId="prop-depth" />
            </>
          )}
          <Field label="Fläche" value={squareMeters(q.area ?? 0)} />
          <Field label="Umfang" value={meters(q.perimeter ?? 0, 1)} />
          {r && <NumberField label="Drehung" value={r.rotationDeg} format={degrees} onCommit={(v) => update(o, 'Drehen', (d) => void (d.region.outer.kind === 'rect' && (d.region.outer.rotationDeg = v)))} />}
          {r && <NumberField label="Eckradius" value={r.cornerRadius} format={(v) => meters(v)} min={0} onCommit={(v) => update(o, 'Eckradius', (d) => void (d.region.outer.kind === 'rect' && (d.region.outer.cornerRadius = v)))} />}
          <ElevationField o={o} />
          <LayerSelect o={o} doc={doc} />
        </div>
        <div className={s.row} style={{ padding: '4px 2px' }}>
          <span>Kantenstein umlaufend</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {q.edgingLength !== null && <span className={`${u.mono} ${s.muted}`}>{meters(q.edgingLength, 1)}</span>}
            <Toggle label="Kantenstein" on={!!o.edging} onChange={(v) => update(o, 'Kantenstein', (d) => void (d.edging = v ? { catalogId: 'edge.kantenstein-8x20', sides: 'outline' } : null))} />
          </div>
        </div>
      </div>
    </>
  );
}

function PathProps({ o, q, doc }: { o: Extract<PlanObject, { type: 'path' }>; q: ObjectQuantities; doc: Project }) {
  return (
    <>
      <MaterialPicker o={o} ids={PATH_MATERIALS} />
      <div className={s.section}>
        <div className={u.eyebrow}>Geometrie</div>
        <div className={s.grid2}>
          <NumberField label="Breite" value={o.width} format={(v) => meters(v)} min={0.1} max={20} onCommit={(v) => update(o, 'Wegbreite ändern', (d) => void (d.width = v))} testId="prop-path-width" />
          <Field label="Länge" value={meters(q.length ?? 0)} />
          <Field label="Fläche" value={squareMeters(q.area ?? 0)} />
          <Field label="Umfang" value={meters(q.perimeter ?? 0, 1)} />
          <ElevationField o={o} />
          <LayerSelect o={o} doc={doc} />
        </div>
        <div className={s.row} style={{ padding: '4px 2px' }}>
          <span>Kantenstein beidseitig</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {q.edgingLength !== null && <span className={`${u.mono} ${s.muted}`}>{meters(q.edgingLength, 1)}</span>}
            <Toggle label="Kantenstein" on={!!o.edging} onChange={(v) => update(o, 'Kantenstein', (d) => void (d.edging = v ? { catalogId: 'edge.kantenstein-8x20', sides: 'both' } : null))} />
          </div>
        </div>
        <div className={s.row} style={{ padding: '0 2px' }}>
          <span>Ecken</span>
          <div className={u.segmented}>
            {(['round', 'miter'] as const).map((j) => (
              <button key={j} type="button" className={o.join === j ? u.segmentOn : u.segment} style={{ padding: '4px 10px' }} onClick={() => update(o, 'Ecken', (d) => void (d.join = j))}>
                {j === 'round' ? 'rund' : 'spitz'}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function PlantingProps({ o, q, doc }: { o: Extract<PlanObject, { type: 'planting' }>; q: ObjectQuantities; doc: Project }) {
  const count = q.lines.filter((l) => l.key.startsWith('plant:')).reduce((a, l) => a + l.quantity, 0);
  return (
    <div className={s.section}>
      <div className={u.eyebrow}>Pflanzung</div>
      <div className={s.grid2}>
        <Field label="Fläche" value={squareMeters(q.area ?? 0)} />
        <Field label="Umfang" value={meters(q.perimeter ?? 0, 1)} />
        <NumberField label="Stück / m²" value={o.perSquareMeter} format={(v) => num(v, 1)} min={0.1} max={50} onCommit={(v) => update(o, 'Pflanzdichte', (d) => void (d.perSquareMeter = v))} />
        <Field label="Pflanzen" value={`${num(count, 0)} Stk`} />
        <ElevationField o={o} />
        <LayerSelect o={o} doc={doc} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {o.mix.map((m) => {
          const sp = getSpecies(m.speciesId);
          return (
            <div key={m.speciesId} className={s.mixRow}>
              <span className={s.dot} style={{ background: sp.colors.summer }} />
              <span style={{ flex: 1 }}>{sp.name}</span>
              <span className={`${u.mono} ${s.muted}`}>{num(m.share * 100, 0)} %</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HedgeProps({ o, q, doc }: { o: Extract<PlanObject, { type: 'hedge' }>; q: ObjectQuantities; doc: Project }) {
  return (
    <div className={s.section}>
      <div className={u.eyebrow}>Hecke</div>
      <div className={s.grid2}>
        <Field label="Länge" value={meters(q.length ?? 0, 1)} />
        <NumberField label="Schnitthöhe" value={o.height} format={(v) => meters(v)} min={0.3} max={6} onCommit={(v) => update(o, 'Heckenhöhe', (d) => void (d.height = v))} />
        <NumberField label="Stück / m" value={o.plantsPerMeter} format={(v) => num(v, 1)} min={0.5} max={10} onCommit={(v) => update(o, 'Pflanzabstand', (d) => void (d.plantsPerMeter = v))} />
        <Field label="Fläche" value={squareMeters(q.area ?? 0)} />
        <LayerSelect o={o} doc={doc} />
      </div>
    </div>
  );
}

const PHEN_COLOR = { bare: '#C9C5BA', leaf: '#8FA96A', bloom: '#F3E9EC', fruit: '#4E5C9A', autumn: '#C4553A' };
const SUN = { full: '☀', partial: '◐', shade: '●', 'full-partial': '☀ – ◐' };

function PlantProps({ o, doc }: { o: Extract<PlanObject, { type: 'plant' }>; doc: Project }) {
  const sp = getSpecies(o.speciesId);
  return (
    <>
      <div className={s.latin} style={{ marginTop: -12 }}>
        {sp.latin}
      </div>
      <div className={s.grid2}>
        <NumberField label="Ø heute" value={plantDiameter(o)} format={(v) => meters(v, 1)} min={0.05} onCommit={(v) => update(o, 'Kronendurchmesser', (d) => void (d.plantedDiameter = v))} testId="prop-diameter" />
        <Field label="Endgröße" value={`Ø ${num(sp.diameterMature, 1)} m`} />
        <Field label="Zuwachs" value={`${num(sp.growthPerYear * 100, 0)} cm/J`} />
        <Field label="Standort" value={SUN[sp.sun]} mono={false} />
        <NumberField label="Pflanzjahr" value={o.plantedYear} format={(v) => String(v)} min={1900} max={2100} onCommit={(v) => update(o, 'Pflanzjahr', (d) => void (d.plantedYear = Math.round(v)))} />
        <LayerSelect o={o} doc={doc} />
      </div>
      <div className={s.section} style={{ gap: 6 }}>
        <div className={u.eyebrow}>Jahreslauf</div>
        <div className={s.phen}>
          {sp.phenology.map((p, i) => (
            <div key={i} style={{ background: p === 'leaf' ? sp.colors.summer : p === 'bloom' ? (sp.colors.bloom ?? PHEN_COLOR.bloom) : p === 'autumn' ? (sp.colors.autumn ?? PHEN_COLOR.autumn) : PHEN_COLOR[p], boxShadow: p === 'bloom' ? 'inset 0 0 0 1px #E2C6CE' : undefined }} />
          ))}
        </div>
      </div>
    </>
  );
}

function ItemProps({ o, doc }: { o: Extract<PlanObject, { type: 'item' }>; doc: Project }) {
  const sz = itemSize(o);
  const setSize = (k: 'width' | 'depth' | 'height', v: number) => update(o, 'Maße ändern', (d) => void (d.size = { ...sz, [k]: v }));
  return (
    <div className={s.section}>
      <div className={u.eyebrow}>Maße</div>
      <div className={s.grid2}>
        <NumberField label="Breite" value={sz.width} format={(v) => meters(v)} min={0.05} onCommit={(v) => setSize('width', v)} testId="prop-item-width" />
        <NumberField label="Tiefe" value={sz.depth} format={(v) => meters(v)} min={0.05} onCommit={(v) => setSize('depth', v)} />
        <NumberField label="Höhe" value={sz.height} format={(v) => meters(v)} min={0} onCommit={(v) => setSize('height', v)} />
        <NumberField label="Drehung" value={o.rotationDeg} format={degrees} onCommit={(v) => update(o, 'Drehen', (d) => void (d.rotationDeg = ((v % 360) + 360) % 360))} testId="prop-rotation" />
        <Field label="Grundfläche" value={squareMeters(sz.width * sz.depth)} />
        <LayerSelect o={o} doc={doc} />
      </div>
    </div>
  );
}

function TextProps({ o }: { o: Extract<PlanObject, { type: 'text' }> }) {
  return (
    <div className={s.section}>
      <div className={u.eyebrow}>Beschriftung</div>
      <input
        key={o.text}
        className={s.noteInput}
        defaultValue={o.text}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        onBlur={(e) => e.target.value !== o.text && update(o, 'Text ändern', (d) => void (d.text = e.target.value))}
        data-testid="prop-text"
      />
      <div className={s.grid2}>
        <NumberField label="Schriftgröße" value={o.sizeM} format={(v) => meters(v)} min={0.1} max={5} onCommit={(v) => update(o, 'Schriftgröße', (d) => void (d.sizeM = v))} />
        <NumberField label="Drehung" value={o.rotationDeg} format={degrees} onCommit={(v) => update(o, 'Drehen', (d) => void (d.rotationDeg = v))} />
      </div>
    </div>
  );
}

function DimensionProps({ o, doc }: { o: Extract<PlanObject, { type: 'dimension' }>; doc: Project }) {
  const a = resolveAnchor(o.a, doc.objects);
  const b = resolveAnchor(o.b, doc.objects);
  return (
    <div className={s.grid2}>
      <Field label="Länge" value={a && b ? meters(dist(a, b)) : '–'} />
      <NumberField label="Abstand" value={o.offset} format={(v) => meters(v)} onCommit={(v) => update(o, 'Maßlinie versetzen', (d) => void (d.offset = v))} />
    </div>
  );
}

function MultiProps({ objs }: { objs: PlanObject[] }) {
  const areas = objs.filter((o): o is AreaObject => o.type === 'area');
  const total = objs.reduce((a, o) => a + (objectQuantities(o).area ?? 0), 0);
  return (
    <>
      <div>
        <div className={s.title} style={{ pointerEvents: 'none' }}>
          {objs.length} Objekte
        </div>
        <div className={s.sub}>Gesamtfläche {squareMeters(total)}</div>
      </div>
      {areas.length >= 2 && (
        <div className={s.section}>
          <div className={u.eyebrow}>Flächen kombinieren</div>
          <div className={s.actions}>
            <button type="button" className={s.action} onClick={() => cmd.booleanOp(areas.map((a) => a.id), 'union')} data-testid="union-btn">
              <Icon name="union" size={14} /> Vereinigen
            </button>
            <button type="button" className={s.action} onClick={() => cmd.booleanOp(areas.map((a) => a.id), 'subtract')} data-testid="subtract-btn">
              <Icon name="subtract" size={14} /> Abziehen
            </button>
          </div>
          <div className={s.muted} style={{ fontSize: 12, lineHeight: 1.45 }}>
            Abziehen schneidet die übrigen Flächen aus der zuerst gewählten aus.
          </div>
        </div>
      )}
      <div className={s.actions}>
        <button type="button" className={s.action} onClick={() => cmd.duplicateObjects(objs.map((o) => o.id))}>
          Duplizieren
        </button>
        <button type="button" className={`${s.action} ${s.danger}`} onClick={() => cmd.deleteObjects(objs.map((o) => o.id))}>
          <Icon name="trash" size={13} /> Löschen
        </button>
      </div>
    </>
  );
}

function ProjectInfo({ doc }: { doc: Project }) {
  const summary = useMemo(() => projectSummary(doc), [doc]);
  const b = doc.site.boundary;
  return (
    <>
      <div>
        <div className={s.title} style={{ pointerEvents: 'none' }}>
          Grundstück
        </div>
        <div className={s.sub}>{doc.site.location?.label ?? 'Kein Standort'} · Nichts ausgewählt</div>
      </div>
      <div className={s.grid2}>
        <Field label="Fläche" value={squareMeters(area(b))} />
        <Field label="Umfang" value={meters(perimeter(b), 1)} />
        <NumberField label="Nord-Abweichung" value={doc.site.northDeg} format={degrees} min={-180} max={180} onCommit={(v) => cmd.updateSite({ northDeg: v })} testId="prop-north" />
        <Field label="Objekte" value={String(Object.keys(doc.objects).length)} />
      </div>
      <div className={s.section} style={{ gap: 8 }}>
        <div className={u.eyebrow}>Kosten gesamt</div>
        <div className={s.row} style={{ alignItems: 'baseline' }}>
          <span className={s.costBig} data-testid="project-cost">
            {euros(summary.total)}
          </span>
          <span className={s.muted} style={{ fontSize: 12 }}>
            Material, netto
          </span>
        </div>
        <div className={s.muted} style={{ fontSize: 12, lineHeight: 1.45 }}>
          Mengen werden aus der Zeichnung abgeleitet. Die vollständige Kostenübersicht folgt in Phase 2.
        </div>
      </div>
      <BackgroundSection doc={doc} />
    </>
  );
}

/** Detailkarte des gewählten Bibliothekselements (Design 04, rechts) */
function BrushDetail({ brush }: { brush: Brush }) {
  if (brush.kind === 'item') {
    const it = getItem(brush.catalogId);
    return (
      <>
        <div className={s.brushHero}>
          <img src={glyphSrc(SYMBOL_GLYPH[it.symbol] ?? 'edge')} width={84} height={84} alt="" />
          <span className={s.brushScale}>Draufsicht</span>
        </div>
        <div>
          <div className={s.serif21}>{it.name}</div>
        </div>
        <div className={s.grid2}>
          <Field label="Maße" value={`${num(it.width, 2)} × ${num(it.depth, 2)} m`} />
          <Field label="Höhe" value={meters(it.height)} />
          <Field label="Preis" value={it.price ? euros(it.price) : '–'} />
          <Field label="Ebene" value={it.creates === 'item' ? 'Gebäude & Möbel' : 'Flächen'} mono={false} />
        </div>
        <div className={s.muted} style={{ fontSize: 12, lineHeight: 1.45 }}>
          Klicke in den Plan, um es zu setzen. Maße und Drehung lassen sich danach anpassen.
        </div>
      </>
    );
  }
  const sp = getSpecies(brush.speciesId);
  return (
    <>
      <div className={s.brushHero} style={{ background: `radial-gradient(circle at 50% 52%, ${sp.colors.summer} 0, ${sp.colors.summer} 34%, transparent 36%), #DCD3BF` }}>
        <span className={s.brushScale}>Draufsicht · 1:100</span>
      </div>
      <div>
        <div className={s.serif21}>{sp.name}</div>
        <div className={s.latin}>{sp.latin}</div>
      </div>
      <div className={s.grid2}>
        <Field label="Endgröße" value={`${num(sp.diameterMature, 0)}–${num(sp.heightMature, 0)} m`} />
        <Field label="Zuwachs" value={`${num(sp.growthPerYear * 100, 0)} cm/J`} />
        <Field label="Standort" value={SUN[sp.sun]} mono={false} />
        <Field label="Preis" value={euros(sp.price, sp.price < 10 ? 2 : 0)} />
      </div>
      <div className={s.section} style={{ gap: 6 }}>
        <div className={u.eyebrow}>Jahreslauf</div>
        <div className={s.phen}>
          {sp.phenology.map((p, i) => (
            <div key={i} style={{ background: p === 'leaf' ? sp.colors.summer : p === 'bloom' ? (sp.colors.bloom ?? PHEN_COLOR.bloom) : p === 'autumn' ? (sp.colors.autumn ?? PHEN_COLOR.autumn) : PHEN_COLOR[p] }} />
          ))}
        </div>
      </div>
    </>
  );
}
