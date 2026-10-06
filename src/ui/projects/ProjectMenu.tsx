import { useEffect, useRef, useState } from 'react';
import { num } from '../../core/format';
import { deleteProject, listProjects, type ProjectMeta } from '../../persistence/db';
import { useEditor } from '../../state';
import { Icon } from '../icons';
import u from '../components/ui.module.css';
import s from './projects.module.css';

const dateFmt = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function ProjectMenu({
  onClose,
  onOpen,
  onNew,
  onSample,
  onImport,
  onExportJson,
}: {
  onClose: () => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  onSample: () => void;
  onImport: (f: File) => void;
  onExportJson: () => void;
}) {
  const current = useEditor((st) => st.doc?.id);
  const [items, setItems] = useState<ProjectMeta[] | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listProjects().then(setItems, () => setItems([]));
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div ref={box} className={s.menu} role="dialog" aria-label="Projekte" data-testid="project-menu">
      <div className={s.head}>
        <span className={s.title}>Projekte</span>
        <span className={s.count}>{items?.length ?? '…'} lokal</span>
      </div>
      <div className={s.list}>
        {items?.length === 0 && <div className={s.empty}>Noch keine gespeicherten Projekte.</div>}
        {items?.map((m) => (
          <div key={m.id} className={m.id === current ? s.itemOn : s.item}>
            <button type="button" className={s.itemMain} onClick={() => onOpen(m.id)} data-testid="project-item">
              <span className={s.itemName}>{m.name}</span>
              <span className={s.itemSub}>
                {num(m.areaM2, 0)} m² · {m.objectCount} Objekte · {dateFmt.format(new Date(m.updatedAt))}
              </span>
            </button>
            {m.id !== current && (
              <button
                type="button"
                className={u.iconBtn}
                aria-label={`${m.name} löschen`}
                onClick={async () => {
                  if (!confirm(`„${m.name}“ endgültig löschen?`)) return;
                  await deleteProject(m.id);
                  setItems(await listProjects());
                }}
              >
                <Icon name="trash" size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
      <div className={s.actions}>
        <button type="button" className={s.action} onClick={onNew} data-testid="menu-new">
          <Icon name="plus" size={14} /> Neues Projekt
        </button>
        <button type="button" className={s.action} onClick={onSample}>
          Beispielgarten
        </button>
        <button type="button" className={s.action} onClick={() => file.current?.click()} data-testid="menu-import">
          <Icon name="upload" size={14} /> JSON importieren
        </button>
        <button type="button" className={s.action} onClick={onExportJson} data-testid="menu-export-json">
          <Icon name="download" size={14} /> JSON exportieren
        </button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json,.gartenwerk"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImport(f);
            e.target.value = '';
          }}
          data-testid="import-file"
        />
      </div>
    </div>
  );
}
