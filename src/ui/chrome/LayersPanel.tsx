import { useState } from 'react';
import { cmd, useEditor } from '../../state';
import { Icon } from '../icons';
import s from './chrome.module.css';

/** Ebenen-Panel: aktiv setzen, ein-/ausblenden, sperren, Reihenfolge per Ziehen */
export function LayersPanel() {
  const doc = useEditor((st) => st.doc);
  const active = useEditor((st) => st.session.activeLayerId);
  const setSession = useEditor((st) => st.setSession);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  if (!doc) return null;
  // Oben im Panel = oben im Plan: Zeichenreihenfolge umgekehrt anzeigen
  const rows = [...doc.layerOrder].reverse().map((id) => doc.layers[id]);
  const activeId = active ?? rows.find((l) => l.kind === 'paths')?.id;

  return (
    <aside className={s.layers} aria-label="Ebenen" data-testid="layers-panel">
      <div className={s.panelHead}>
        <span className={s.panelTitle}>Ebenen</span>
        <span className={s.layerCount}>{Object.keys(doc.objects).length} Objekte</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {rows.map((l) => {
          const on = l.id === activeId;
          return (
            <div
              key={l.id}
              role="button"
              tabIndex={0}
              draggable
              className={`${on ? s.layerRowOn : s.layerRow} ${over === l.id && drag !== l.id ? s.layerRowDrop : ''}`}
              onClick={() => setSession({ activeLayerId: l.id })}
              onKeyDown={(e) => e.key === 'Enter' && setSession({ activeLayerId: l.id })}
              onDragStart={() => setDrag(l.id)}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(l.id);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={() => {
                if (drag && drag !== l.id) {
                  // Ziel in Zeichenreihenfolge: über der Zielzeile einfügen
                  const target = doc.layerOrder.indexOf(l.id);
                  const from = doc.layerOrder.indexOf(drag);
                  cmd.moveLayer(drag, from < target ? target : target + 1);
                }
                setDrag(null);
                setOver(null);
              }}
              onDragEnd={() => {
                setDrag(null);
                setOver(null);
              }}
              data-testid={`layer-${l.kind}`}
            >
              <span className={`${s.layerSwatch} ${l.visible ? '' : s.dim}`} style={{ background: l.color }} />
              <span className={`${s.layerName} ${l.visible ? '' : s.dim}`}>{l.name}</span>
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
          );
        })}
      </div>
    </aside>
  );
}
