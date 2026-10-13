/**
 * Flächenartige Objekte: Fläche, Weg, Rabatte (Geometrie-Teil) und Hecke.
 */
import { AREA_MATERIALS, MULCH_MATERIALS, PATH_MATERIALS } from '../../core/catalog/materials';
import { PLANTS } from '../../core/catalog/plants';
import { degrees, meters, num, squareMeters } from '../../core/format';
import type { AreaObject, PlanObject, Project } from '../../core/model/types';
import type { ObjectQuantities } from '../../core/quantities/quantities';
import { cmd, editor } from '../../state';
import { Field, NumberField } from '../components/controls';
import { Icon } from '../icons';
import { makeBed } from '../../tools/BedTool';
import { BedEditor } from './BedProps';
import { EdgingPicker, ElevationField, LayerSelect, MaterialPicker, update } from './SharedFields';
import u from '../components/ui.module.css';
import s from './props.module.css';

export function AreaProps({ o, q, doc }: { o: AreaObject; q: ObjectQuantities; doc: Project }) {
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
        <EdgingPicker o={o} sides="outline" length={q.edgingLength} />
        {MULCH_MATERIALS.includes(o.materialId) && (
          <button
            type="button"
            className={s.convert}
            onClick={() => {
              // Beetfläche → Rabatte: Kontur, Abdeckung und Einfassung bleiben, Bepflanzung passend zum Standort
              const made = makeBed(doc, o.region, 'auto');
              const bed = { ...made, mulchMaterialId: o.materialId, edging: o.edging, name: o.name ?? made.name };
              cmd.replaceObjects('In Rabatte umwandeln', [o.id], [bed]);
              editor.getState().setSession({ selection: [bed.id] });
            }}
            data-testid="area-to-bed"
          >
            <Icon name="bed" size={15} /> Bepflanzen – in Rabatte umwandeln
          </button>
        )}
      </div>
    </>
  );
}

export function PathProps({ o, q, doc }: { o: Extract<PlanObject, { type: 'path' }>; q: ObjectQuantities; doc: Project }) {
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
        <EdgingPicker o={o} sides="both" length={q.edgingLength} />
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

export function PlantingProps({ o, q, doc }: { o: Extract<PlanObject, { type: 'planting' }>; q: ObjectQuantities; doc: Project }) {
  const count = q.lines.filter((l) => l.key.startsWith('plant:')).reduce((a, l) => a + l.quantity, 0);
  return (
    <>
      <BedEditor o={o} doc={doc} count={count} edging={<EdgingPicker o={o} sides="outline" length={q.edgingLength} />} />
      <div className={s.section}>
        <div className={u.eyebrow}>Geometrie</div>
        <div className={s.grid2}>
          <Field label="Fläche" value={squareMeters(q.area ?? 0)} />
          <Field label="Umfang" value={meters(q.perimeter ?? 0, 1)} />
          <ElevationField o={o} />
          <LayerSelect o={o} doc={doc} />
        </div>
      </div>
    </>
  );
}

const HEDGES = PLANTS.filter((p) => p.kind === 'hedge');

export function HedgeProps({ o, q, doc }: { o: Extract<PlanObject, { type: 'hedge' }>; q: ObjectQuantities; doc: Project }) {
  return (
    <div className={s.section}>
      <div className={u.eyebrow}>Hecke</div>
      <select className={s.select} value={o.speciesId} onChange={(e) => update(o, 'Heckenart', (d) => void (d.speciesId = e.target.value))} aria-label="Heckenart" data-testid="hedge-species">
        {HEDGES.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
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
