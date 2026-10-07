import { useState } from 'react';
import { getItem } from '../../core/catalog/items';
import { getMaterial } from '../../core/catalog/materials';
import { getSpecies } from '../../core/catalog/plants';
import type { Id, PlanObject } from '../../core/model/types';
import { cmd, editor, useEditor } from '../../state';
import { Slider } from '../components/Slider';
import { Icon } from '../icons';
import s from './chrome.module.css';

const TYPE: Record<PlanObject['type'], string> = {
  sprinkler: 'Regner',
  drip: 'Tropfschlauch',
  pipe: 'Leitung',
  fixture: 'Anschluss',
  area: 'Fläche',
  path: 'Weg',
  plant: 'Pflanze',
  planting: 'Pflanzung',
  hedge: 'Hecke',
  espalier: 'Spalier',
  scatter: 'Pflanzgruppe',
  item: 'Objekt',
  dimension: 'Bemaßung',
  text: 'Text',
  lamp: 'Leuchte',
};
/** Lesbarer Name: eigener Name, sonst Katalogname, Art oder Material */
function objectName(o: PlanObject): string {
  if (o.name) return o.name;
  try {
    switch (o.type) {
      case 'text':
        return `„${o.text}“`;
      case 'item':
        return getItem(o.catalogId).name;
      case 'plant':
      case 'hedge':
      case 'espalier':
        return getSpecies(o.speciesId).name;
      case 'area':
      case 'path':
        return `${TYPE[o.type]} · ${getMaterial(o.materialId).name}`;
      case 'scatter':
        return `${TYPE[o.type]} · ${o.plants.length} Pflanzen`;
    }
  } catch {
    // unbekannte Katalog-Id: Typname genügt
  }
  return TYPE[o.type];
}

type Drag = { kind: 'layer'; id: Id } | { kind: 'object'; id: Id } | null;
/** Einfügemarke: über einer Ebene/einem Objekt (im Panel oben = im Plan vorne) */
type Over = { kind: 'layer' | 'object'; id: Id } | null;

/**
 * Ebenen-Panel wie in Photoshop: oben im Panel = oben im Plan.
 * Eigene Ebenen anlegen, umbenennen, löschen; aufklappen zeigt die Objekte; Ebenen und
 * Objekte per Ziehen umsortieren und zwischen Ebenen verschieben; Deckkraft je Ebene.
 */
export function LayersPanel() {
  const doc = useEditor((st) => st.doc);
  const active = useEditor((st) => st.session.activeLayerId);
  const selection = useEditor((st) => st.session.selection);
  const setSession = useEditor((st) => st.setSession);
  const [drag, setDrag] = useState<Drag>(null);
  const [over, setOver] = useState<Over>(null);
  const [open, setOpen] = useState<Record<Id, boolean>>({});
  const [renaming, setRenaming] = useState<Id | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Id | null>(null);
  if (!doc) return null;
  const rows = [...doc.layerOrder].reverse().map((id) => doc.layers[id]);
  const activeLayer = active ? doc.layers[active] : undefined;
  const reset = () => {
    setDrag(null);
    setOver(null);
  };

  const dropOnLayer = (layerId: Id) => {
    if (drag?.kind === 'layer' && drag.id !== layerId) {
      // über der Zielzeile einfügen (Zeichenreihenfolge ist umgekehrt zur Anzeige)
      const target = doc.layerOrder.indexOf(layerId);
      const from = doc.layerOrder.indexOf(drag.id);
      cmd.moveLayer(drag.id, from < target ? target : target + 1);
    } else if (drag?.kind === 'object') {
      // Objekt auf Ebene: ganz nach vorne in diese Ebene
      cmd.moveObject(drag.id, layerId, doc.layers[layerId].objectOrder.length);
      setOpen((o) => ({ ...o, [layerId]: true }));
    }
    reset();
  };

  const dropOnObject = (target: PlanObject) => {
    if (drag?.kind === 'object' && drag.id !== target.id) {
      // über dem Zielobjekt einfügen = direkt davor in Zeichenreihenfolge
      const order = doc.layers[target.layerId].objectOrder;
      cmd.moveObject(drag.id, target.layerId, order.indexOf(target.id) + 1);
    }
    reset();
  };

  return (
    <aside className={s.layers} aria-label="Ebenen" data-testid="layers-panel">
      <div className={s.panelHead}>
        <span className={s.panelTitle}>Ebenen</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className={s.layerCount}>{Object.keys(doc.objects).length} Objekte</span>
          <button type="button" className={s.layerBtn} aria-label="Neue Ebene" title="Neue Ebene über der aktiven" onClick={() => cmd.addLayer('Neue Ebene', active)} data-testid="layer-add">
            <Icon name="plus" size={14} />
          </button>
        </span>
      </div>
      <div className={s.layerTarget} data-testid="layer-target">
        Neue Objekte →{' '}
        {activeLayer?.kind === 'custom' ? (
          <>
            <b>{activeLayer.name}</b>
            <button type="button" className={s.linkBtn} onClick={() => setSession({ activeLayerId: null })}>
              automatisch
            </button>
          </>
        ) : (
          <span>automatisch nach Art</span>
        )}
      </div>
      <div className={s.layerList}>
        {rows.map((l) => {
          const on = l.id === active;
          const expanded = !!open[l.id];
          const objs = [...l.objectOrder].reverse().map((id) => doc.objects[id]).filter(Boolean);
          return (
            <div key={l.id}>
              <div
                role="button"
                tabIndex={0}
                draggable={renaming !== l.id}
                className={`${on ? s.layerRowOn : s.layerRow} ${over?.kind === 'layer' && over.id === l.id && !(drag?.kind === 'layer' && drag.id === l.id) ? s.layerRowDrop : ''}`}
                onClick={() => setSession({ activeLayerId: on ? null : l.id })}
                onKeyDown={(e) => e.key === 'Enter' && setSession({ activeLayerId: on ? null : l.id })}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  setDrag({ kind: 'layer', id: l.id });
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver({ kind: 'layer', id: l.id });
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  dropOnLayer(l.id);
                }}
                onDragEnd={reset}
                data-testid={`layer-${l.kind === 'custom' ? l.name : l.kind}`}
              >
                <button
                  type="button"
                  className={s.chevron}
                  style={{ transform: expanded ? 'none' : 'rotate(-90deg)', visibility: objs.length ? 'visible' : 'hidden' }}
                  aria-label={expanded ? 'Zuklappen' : 'Aufklappen'}
                  aria-expanded={expanded}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen((o) => ({ ...o, [l.id]: !expanded }));
                  }}
                  data-testid={`layer-open-${l.kind === 'custom' ? l.name : l.kind}`}
                >
                  <Icon name="chevron" size={11} width={2.2} />
                </button>
                <span className={`${s.layerSwatch} ${l.visible ? '' : s.dim}`} style={{ background: l.color, opacity: l.opacity ?? 1 }} />
                {renaming === l.id ? (
                  <input
                    className={s.layerInput}
                    defaultValue={l.name}
                    autoFocus
                    aria-label="Ebenenname"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter') e.currentTarget.blur();
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                    onBlur={(e) => {
                      if (e.target.value.trim() && e.target.value !== l.name) cmd.renameLayer(l.id, e.target.value);
                      setRenaming(null);
                    }}
                    data-testid="layer-rename"
                  />
                ) : (
                  <span className={`${s.layerName} ${l.visible ? '' : s.dim}`} onDoubleClick={() => setRenaming(l.id)} title="Doppelklick zum Umbenennen">
                    {l.name}
                  </span>
                )}
                <span className={s.layerCount}>{l.objectOrder.length}</span>
                <button
                  type="button"
                  className={l.locked ? s.layerBtn : s.lockHidden}
                  aria-label={l.locked ? 'Entsperren' : 'Sperren'}
                  aria-pressed={l.locked}
                  onClick={(e) => {
                    e.stopPropagation();
                    cmd.setLayerLocked(l.id, !l.locked);
                  }}
                  data-testid={`lock-${l.kind}`}
                >
                  <Icon name={l.locked ? 'lock' : 'unlock'} size={13} />
                </button>
                <button
                  type="button"
                  className={s.layerBtn}
                  aria-label={l.visible ? 'Ausblenden' : 'Einblenden'}
                  aria-pressed={!l.visible}
                  onClick={(e) => {
                    e.stopPropagation();
                    cmd.setLayerVisible(l.id, !l.visible);
                  }}
                  data-testid={`eye-${l.kind}`}
                >
                  <span className={l.visible ? '' : s.dim} style={{ display: 'flex' }}>
                    <Icon name={l.visible ? 'eye' : 'eyeOff'} size={15} />
                  </span>
                </button>
              </div>
              {expanded && (
                <div className={s.objList}>
                  {l.kind === 'plants' && <div className={s.objHint}>Pflanzen ordnen sich zusätzlich nach Höhe</div>}
                  {objs.map((o) => {
                    const sel = selection.includes(o.id);
                    return (
                      <div
                        key={o.id}
                        role="button"
                        tabIndex={0}
                        draggable
                        className={`${sel ? s.objRowOn : s.objRow} ${over?.kind === 'object' && over.id === o.id && drag?.id !== o.id ? s.layerRowDrop : ''} ${o.hidden ? s.dim : ''}`}
                        onClick={(e) => {
                          const cur = editor.getState().session.selection;
                          setSession({ selection: e.shiftKey ? (sel ? cur.filter((x) => x !== o.id) : [...cur, o.id]) : [o.id] });
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && setSession({ selection: [o.id] })}
                        onDragStart={(e) => {
                          e.stopPropagation();
                          e.dataTransfer.effectAllowed = 'move';
                          setDrag({ kind: 'object', id: o.id });
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (drag?.kind === 'object') setOver({ kind: 'object', id: o.id });
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          dropOnObject(o);
                        }}
                        onDragEnd={reset}
                        data-testid={`obj-row-${o.id}`}
                      >
                        <span className={s.objName}>{objectName(o)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {activeLayer && (
        <div className={s.layerFoot} data-testid="layer-foot">
          <div className={s.layerFootRow}>
            <span className={s.layerFootLabel}>Deckkraft</span>
            <span className={s.layerCount}>{Math.round((activeLayer.opacity ?? 1) * 100)} %</span>
          </div>
          <Slider
            value={activeLayer.opacity ?? 1}
            min={0}
            max={1}
            step={0.05}
            label={`Deckkraft ${activeLayer.name}`}
            onChange={(v) => cmd.setLayerOpacity(activeLayer.id, v, `opacity:${activeLayer.id}`)}
            testId="layer-opacity"
          />
          {activeLayer.kind === 'custom' && (
            <button
              type="button"
              className={confirmDelete === activeLayer.id ? s.dangerBtnOn : s.dangerBtn}
              onClick={() => {
                if (!activeLayer.objectOrder.length || confirmDelete === activeLayer.id) {
                  cmd.deleteLayer(activeLayer.id);
                  setConfirmDelete(null);
                } else setConfirmDelete(activeLayer.id);
              }}
              onBlur={() => setConfirmDelete(null)}
              data-testid="layer-delete"
            >
              <Icon name="trash" size={13} />
              {confirmDelete === activeLayer.id ? `Ebene und ${activeLayer.objectOrder.length} Objekte löschen?` : 'Ebene löschen'}
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
