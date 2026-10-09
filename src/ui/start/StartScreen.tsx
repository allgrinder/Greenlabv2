import { useEffect, useRef, useState } from 'react';
import { num } from '../../core/format';
import { backupDue, REMIND_DAYS, type StorageState } from '../../persistence/backup';
import { deleteProject, getThumbnail, listProjects, type ProjectMeta } from '../../persistence/db';
import { Icon, Logo } from '../icons';
import s from './start.module.css';

const dateFmt = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });

function when(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days < 1 && new Date().getDate() === d.getDate()) return `heute, ${timeFmt.format(d)}`;
  if (days < 2) return `gestern, ${timeFmt.format(d)}`;
  return dateFmt.format(d);
}

/**
 * Startseite: gespeicherte Gärten mit Vorschaubild, neuer Garten, Mustergarten, Import.
 * Erscheint sofort; Grafik und Bildsätze laden währenddessen im Hintergrund (Fortschritt oben rechts).
 */
export function StartScreen({
  progress,
  opening,
  leaving,
  onOpen,
  onHover,
  onNew,
  onSample,
  onImport,
  backup,
  listVersion = 0,
}: {
  /** Ladefortschritt der Grafik 0…1 */
  progress: number;
  /** Garten, der gerade vorbereitet wird */
  opening: string | null;
  /** blendet aus (Garten ist bereit) */
  leaving: boolean;
  onOpen: (id: string) => void;
  onHover: (id: string) => void;
  onNew: () => void;
  onSample: () => void;
  onImport: (f: File) => void;
  /** letzte Sicherung, Speicherzustand und Aktion „Alle Gärten sichern“ */
  backup?: { at: string | null; storage: StorageState; onBackup: () => void };
  /** ändert sich nach einer Wiederherstellung: Liste neu laden */
  listVersion?: number;
}) {
  const [items, setItems] = useState<ProjectMeta[] | null>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listProjects().then(setItems, () => setItems([]));
  }, [listVersion]);

  const busy = opening !== null;
  const [last, ...rest] = items ?? [];

  return (
    <div className={leaving ? s.screenOut : s.screen} data-testid="start-screen" aria-busy={busy}>
      <div className={s.inner}>
        <header className={s.head}>
          <div className={s.brand}>
            <Logo bg="var(--ink)" fg="#E9E5DC" />
            <span className={s.brandName}>Gartenwerk</span>
          </div>
          <div className={progress < 1 ? s.load : s.loadDone} aria-live="polite">
            <span>{progress < 1 ? 'Grafik wird vorbereitet' : 'Bereit'}</span>
            <span className={s.bar}>
              <span style={{ transform: `scaleX(${Math.max(0.04, progress)})` }} />
            </span>
          </div>
        </header>

        <section className={s.hero}>
          <div>
            <h1 className={s.h1}>Deine Gärten</h1>
            <p className={s.lead}>Alle Planungen liegen lokal in diesem Browser. Eine Sicherung aller Gärten holst du über „JSON importieren“ zurück.</p>
          </div>
          <div className={s.actions}>
            <button type="button" className={s.primary} onClick={onNew} disabled={busy} data-testid="start-new">
              <Icon name="plus" size={15} /> Neuer Garten
            </button>
            <button type="button" className={s.ghost} onClick={onSample} disabled={busy} data-testid="open-sample">
              Mustergarten
            </button>
            <button type="button" className={s.ghost} onClick={() => file.current?.click()} disabled={busy} data-testid="start-import">
              <Icon name="upload" size={14} /> JSON importieren
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
              data-testid="start-import-file"
            />
          </div>
        </section>

        {backup && !!items?.length && <BackupBar items={items} backup={backup} busy={busy} />}

        {items?.length === 0 && (
          <section className={s.empty}>
            <svg viewBox="0 0 120 80" className={s.emptyArt} aria-hidden>
              <path d="M10 66 L22 14 L96 8 L110 60 Z" />
              <circle cx="40" cy="34" r="9" />
              <circle cx="56" cy="44" r="6" />
              <rect x="70" y="22" width="22" height="14" rx="2" />
            </svg>
            <div>
              <div className={s.emptyTitle}>Noch kein Garten angelegt</div>
              <div className={s.emptyText}>Lege dein Grundstück mit Maßen an oder schau dir den Mustergarten an.</div>
            </div>
          </section>
        )}

        {last && (
          <section className={s.featured}>
            <button
              type="button"
              className={s.featuredCard}
              onClick={() => onOpen(last.id)}
              onPointerEnter={() => onHover(last.id)}
              onFocus={() => onHover(last.id)}
              disabled={busy}
              data-testid="start-last"
            >
              <Thumb meta={last} className={s.featuredThumb} opening={opening === last.id} />
              <span className={s.featuredBody}>
                <span className={s.kicker}>Zuletzt bearbeitet</span>
                <span className={s.featuredName}>{last.name}</span>
                <span className={s.facts}>
                  <span>{num(last.areaM2, 0)} m²</span>
                  <span>{last.objectCount} Objekte</span>
                  {last.location && <span>{last.location}</span>}
                </span>
                <span className={s.date}>{when(last.updatedAt)}</span>
                <span className={s.go}>
                  {opening === last.id ? 'Wird geöffnet …' : 'Weiterplanen'} <Icon name="arrow" size={14} />
                </span>
              </span>
            </button>
          </section>
        )}

        {rest.length > 0 && (
          <section>
            <div className={s.sectionHead}>
              <span className={s.sectionTitle}>Weitere Gärten</span>
              <span className={s.count}>{rest.length}</span>
            </div>
            <div className={s.grid}>
              {rest.map((m) => (
                <Card
                  key={m.id}
                  meta={m}
                  busy={busy}
                  opening={opening === m.id}
                  onOpen={() => onOpen(m.id)}
                  onHover={() => onHover(m.id)}
                  onDelete={async () => {
                    await deleteProject(m.id);
                    setItems(await listProjects());
                  }}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Card({ meta, busy, opening, onOpen, onHover, onDelete }: { meta: ProjectMeta; busy: boolean; opening: boolean; onOpen: () => void; onHover: () => void; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className={s.card} onPointerEnter={onHover}>
      <button type="button" className={s.cardMain} onClick={onOpen} onFocus={onHover} disabled={busy} data-testid="start-item">
        <Thumb meta={meta} className={s.cardThumb} opening={opening} />
        <span className={s.cardName}>{meta.name}</span>
        <span className={s.cardSub}>
          {num(meta.areaM2, 0)} m² · {meta.objectCount} Objekte · {when(meta.updatedAt)}
        </span>
      </button>
      {confirm ? (
        <span className={s.confirm} role="group" aria-label={`${meta.name} löschen?`}>
          <span>Löschen?</span>
          <button type="button" className={s.confirmYes} onClick={onDelete} data-testid="start-delete-yes">
            Ja
          </button>
          <button type="button" onClick={() => setConfirm(false)}>
            Nein
          </button>
        </span>
      ) : (
        <button type="button" className={s.del} aria-label={`${meta.name} löschen`} onClick={() => setConfirm(true)} disabled={busy}>
          <Icon name="trash" size={14} />
        </button>
      )}
    </div>
  );
}

/** Vorschaubild aus IndexedDB, sonst die Grundstückskontur */
function Thumb({ meta, className, opening }: { meta: ProjectMeta; className: string; opening: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    let alive = true;
    getThumbnail(meta.id).then(
      (b) => {
        if (!alive || !b) return;
        u = URL.createObjectURL(b);
        setUrl(u);
      },
      () => undefined,
    );
    return () => {
      alive = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [meta.id, meta.updatedAt]);

  return (
    <span className={className}>
      {url ? <img src={url} alt="" draggable={false} /> : <Outline pts={meta.outline} />}
      {opening && (
        <span className={s.opening}>
          <span className={s.spinner} />
        </span>
      )}
    </span>
  );
}

function Outline({ pts }: { pts?: { x: number; y: number }[] }) {
  if (!pts || pts.length < 3) return <span className={s.noThumb} />;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const pad = Math.max(x1 - x0, y1 - y0) * 0.12;
  return (
    <svg className={s.outline} viewBox={`${x0 - pad} ${y0 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
      <polygon points={pts.map((p) => `${p.x},${p.y}`).join(' ')} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Hinweis zur Sicherung: dezent, solange alles gesichert ist; deutlicher, wenn die letzte Sicherung fehlt oder alt ist */
function BackupBar({ items, backup, busy }: { items: ProjectMeta[]; backup: { at: string | null; storage: StorageState; onBackup: () => void }; busy: boolean }) {
  const due = backupDue(items[0]?.updatedAt ?? null, backup.at);
  const status = backup.at ? `Letzte Sicherung ${when(backup.at)}` : 'Noch keine Sicherung';
  const store =
    backup.storage === 'persistent' ? 'Speicher dauerhaft geschützt' : backup.storage === 'best-effort' ? 'Der Browser darf den Speicher bei Platzmangel leeren' : null;
  return (
    <section className={due ? s.backupDue : s.backup} data-testid="backup-bar">
      <svg viewBox="0 0 24 24" className={s.backupIcon} aria-hidden>
        <path d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6Z" />
        {due ? <path d="M12 8v5M12 16v.5" /> : <path d="M8.5 12l2.5 2.5 4.5-5" />}
      </svg>
      <div className={s.backupText}>
        <span className={s.backupTitle}>{due ? `${status} – deine Gärten liegen nur in diesem Browser.` : status}</span>
        <span className={s.backupSub}>
          {due ? `Sichere alle Gärten in eine Datei; nach ${REMIND_DAYS} Tagen mit Änderungen erinnert Gartenwerk wieder.` : 'Alle Gärten in einer Datei, mit Hintergrundbildern.'}
          {store && <> · {store}</>}
        </span>
      </div>
      <button type="button" className={due ? s.primary : s.ghost} onClick={backup.onBackup} disabled={busy} data-testid="backup-all">
        <Icon name="download" size={14} /> Alle Gärten sichern
      </button>
    </section>
  );
}
