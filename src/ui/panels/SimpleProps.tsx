/**
 * Einzelobjekte: Pflanze (mit Jahreslauf), Objekt aus dem Katalog, Text und Bemaßung.
 */
import { getSpecies } from '../../core/catalog/plants';
import { degrees, meters, num, squareMeters } from '../../core/format';
import { itemSize, plantDiameter, resolveAnchor } from '../../core/geometry/objects';
import { dist } from '../../core/geometry/vec';
import type { PlanObject, Project } from '../../core/model/types';
import { Field, NumberField } from '../components/controls';
import { LayerSelect, PHEN_COLOR, SUN, update } from './SharedFields';
import u from '../components/ui.module.css';
import s from './props.module.css';

export function PlantProps({ o, doc }: { o: Extract<PlanObject, { type: 'plant' }>; doc: Project }) {
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

export function ItemProps({ o, doc }: { o: Extract<PlanObject, { type: 'item' }>; doc: Project }) {
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

export function TextProps({ o }: { o: Extract<PlanObject, { type: 'text' }> }) {
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

export function DimensionProps({ o, doc }: { o: Extract<PlanObject, { type: 'dimension' }>; doc: Project }) {
  const a = resolveAnchor(o.a, doc.objects);
  const b = resolveAnchor(o.b, doc.objects);
  return (
    <div className={s.grid2}>
      <Field label="Länge" value={a && b ? meters(dist(a, b)) : '–'} />
      <NumberField label="Abstand" value={o.offset} format={(v) => meters(v)} onCommit={(v) => update(o, 'Maßlinie versetzen', (d) => void (d.offset = v))} />
    </div>
  );
}
