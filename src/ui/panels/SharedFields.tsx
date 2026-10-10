/**
 * Gemeinsame Bausteine der Eigenschaften-Leiste: Änderungs-Helfer, Material- und
 * Einfassungswahl, Ebenen-Auswahl, Höhenfeld sowie Farben/Symbole für Jahreslauf und Standort.
 */
import type { Draft } from 'immer';
import { getMaterial } from '../../core/catalog/materials';
import { elevation, meters, num } from '../../core/format';
import type { PlanObject, Project } from '../../core/model/types';
import { materialSwatchStyle } from '../../render/textures/materialTextures';
import { cmd } from '../../state';
import { NumberField } from '../components/controls';
import u from '../components/ui.module.css';
import s from './props.module.css';

export function update<T extends PlanObject>(o: T, label: string, fn: (d: Draft<T>) => unknown) {
  cmd.updateObject<T>(o.id, label, fn);
}

export function MaterialPicker({ o, ids }: { o: Extract<PlanObject, { type: 'area' | 'path' }>; ids: string[] }) {
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

/** Einfassung: keine, Betonstein, Stahl anthrazit oder Cortenstahl */
export const EDGINGS: [string | null, string][] = [
  [null, 'Ohne'],
  ['edge.kantenstein-8x20', 'Stein'],
  ['edge.stahl-anthrazit', 'Stahl'],
  ['edge.corten', 'Corten'],
];

export function EdgingPicker({ o, sides, length }: { o: Extract<PlanObject, { type: 'area' | 'path' | 'planting' }>; sides: 'outline' | 'both'; length: number | null }) {
  const cur = o.edging?.catalogId ?? null;
  return (
    <div className={s.row} style={{ padding: '4px 2px' }}>
      <span>
        Einfassung {length !== null && <span className={`${u.mono} ${s.muted}`}>{meters(length, 1)}</span>}
      </span>
      <div className={u.segmented}>
        {EDGINGS.map(([id, label]) => (
          <button
            key={label}
            type="button"
            className={cur === id ? u.segmentOn : u.segment}
            style={{ padding: '4px 8px' }}
            data-testid={`edging-${label}`}
            onClick={() => update(o, 'Einfassung', (d) => void (d.edging = id ? { catalogId: id, sides } : null))}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function LayerSelect({ o, doc }: { o: PlanObject; doc: Project }) {
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

export function ElevationField({ o }: { o: PlanObject }) {
  return <NumberField label="Höhe" value={o.elevation} format={elevation} onCommit={(v) => update(o, 'Höhe ändern', (d) => void (d.elevation = v))} testId="prop-elevation" />;
}

export const PHEN_COLOR = { bare: '#C9C5BA', leaf: '#8FA96A', bloom: '#F3E9EC', fruit: '#4E5C9A', autumn: '#C4553A' };
export const SUN = { full: '☀', partial: '◐', shade: '●', 'full-partial': '☀ – ◐' };
