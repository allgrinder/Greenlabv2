/**
 * Rahmen der Objekt-Eigenschaften: Kopf mit Name und Typ, Kosten, Notizen und Aktionen.
 */
import { useState } from 'react';
import { getItem } from '../../core/catalog/items';
import { getLamp } from '../../core/catalog/lamps';
import { getMaterial } from '../../core/catalog/materials';
import { getSpecies } from '../../core/catalog/plants';
import { euros, num, unitLabel } from '../../core/format';
import { toPath } from '../../core/geometry/shape';
import { newId } from '../../core/model/ids';
import type { PlanObject, Project } from '../../core/model/types';
import type { ObjectQuantities } from '../../core/quantities/quantities';
import { cmd } from '../../state';
import { Icon } from '../icons';
import { update } from './SharedFields';
import u from '../components/ui.module.css';
import s from './props.module.css';

const TYPE_LABEL: Record<PlanObject['type'], string> = {
  espalier: 'Spalierbäume',
  scatter: 'Pflanzgruppe',
  sprinkler: 'Versenkregner',
  drip: 'Tropfschlauch',
  pipe: 'Leitung',
  fixture: 'Anschluss',
  area: 'Fläche',
  path: 'Weg',
  plant: 'Pflanze',
  planting: 'Rabatte',
  hedge: 'Hecke',
  item: 'Objekt',
  dimension: 'Bemaßung',
  text: 'Text',
  lamp: 'Leuchte',
};

const SOURCE_LABEL: Record<string, string> = { rect: 'Rechteck', polygon: 'Polygon', bezier: 'Bézier', freehand: 'Freihand', boolean: 'Polygon' };

export function Header({ o, doc, swatch }: { o: PlanObject; doc: Project; swatch: React.CSSProperties }) {
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
    case 'espalier':
      return getSpecies(o.speciesId).name;
    case 'scatter':
      return 'Pflanzgruppe';
    case 'item':
      return getItem(o.catalogId).name;
    case 'text':
      return o.text;
    case 'lamp':
      return getLamp(o.lampType).name;
    default:
      return TYPE_LABEL[o.type];
  }
}

export function Costs({ q }: { q: ObjectQuantities }) {
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

export function Notes({ o }: { o: PlanObject }) {
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

export function Actions({ o }: { o: PlanObject }) {
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
