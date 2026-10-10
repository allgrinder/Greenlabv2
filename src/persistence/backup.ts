/**
 * Sicherung aller Gärten in einer Datei und Schutz des Browser-Speichers.
 *
 * Die Gärten liegen nur in IndexedDB dieses Browsers. Ohne „dauerhaften Speicher“ darf der Browser sie
 * bei Platzmangel löschen – `requestPersistence` bittet darum. Die Sicherungsdatei bündelt alle Projekte
 * im Einzelformat (inkl. Hintergrundbilder) und lässt sich über „JSON importieren“ zurückholen.
 */
import type { Project } from '../core/model/types';
import { exportProject, importProject, type ImportResult } from './jsonIO';

export const BACKUP_FORMAT = 'gartenwerk-backup';

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: 1;
  createdAt: string;
  projects: unknown[];
}

/** Alle Projekte als eine Sicherungsdatei (JSON-Text) */
export async function exportBackup(projects: Project[], getBlob: (id: string) => Promise<Blob | undefined>, now = new Date()): Promise<string> {
  const files = await Promise.all(projects.map(async (p) => JSON.parse(await exportProject(p, getBlob)) as unknown));
  const file: BackupFile = { format: BACKUP_FORMAT, version: 1, createdAt: now.toISOString(), projects: files };
  return JSON.stringify(file);
}

export function isBackup(json: unknown): json is BackupFile {
  return !!json && typeof json === 'object' && (json as { format?: unknown }).format === BACKUP_FORMAT && Array.isArray((json as { projects?: unknown }).projects);
}

export interface RestoreResult {
  restored: ImportResult[];
  /** schon mit gleichem Stand vorhanden */
  skipped: number;
}

/**
 * Sicherung zurückholen. Gärten, die es hier noch nicht gibt, behalten ihre ID (echte Wiederherstellung);
 * existiert die ID mit anderem Stand, kommt der Garten als Kopie dazu; gleicher Stand wird übersprungen.
 */
export async function restoreBackup(file: BackupFile, existing: { id: string; updatedAt: string }[]): Promise<RestoreResult> {
  const have = new Map(existing.map((m) => [m.id, m.updatedAt]));
  const restored: ImportResult[] = [];
  let skipped = 0;
  for (const raw of file.projects) {
    const p = (raw as { project?: { id?: string; updatedAt?: string } }).project;
    const known = p?.id ? have.get(p.id) : undefined;
    if (known !== undefined && known === p?.updatedAt) {
      skipped++;
      continue;
    }
    restored.push(await importProject(JSON.stringify(raw), { keepId: known === undefined }));
  }
  return { restored, skipped };
}

/* ---------- Erinnerung ---------- */

const LAST = 'gw:lastBackup';
/** nach so vielen Tagen ohne Sicherung erinnert die Startseite */
export const REMIND_DAYS = 14;

export function lastBackupAt(): string | null {
  try {
    return localStorage.getItem(LAST);
  } catch {
    return null;
  }
}

export function rememberBackup(at = new Date()) {
  try {
    localStorage.setItem(LAST, at.toISOString());
  } catch {
    /* privater Modus */
  }
}

/** Erinnern, wenn seit der letzten Sicherung etwas geändert wurde und sie lange her ist (oder nie war) */
export function backupDue(newestChange: string | null, last: string | null, now = new Date()): boolean {
  if (!newestChange) return false;
  if (!last) return true;
  if (newestChange <= last) return false;
  return now.getTime() - new Date(last).getTime() > REMIND_DAYS * 86400000;
}

/* ---------- dauerhafter Speicher ---------- */

export type StorageState = 'persistent' | 'best-effort' | 'unknown';

export async function storageState(): Promise<StorageState> {
  try {
    if (!navigator.storage?.persisted) return 'unknown';
    return (await navigator.storage.persisted()) ? 'persistent' : 'best-effort';
  } catch {
    return 'unknown';
  }
}

/** Browser bitten, die Gärten nicht bei Platzmangel zu löschen (Chrome entscheidet still, Firefox fragt einmal) */
export async function requestPersistence(): Promise<StorageState> {
  try {
    if (!navigator.storage?.persist) return 'unknown';
    if (await navigator.storage.persisted()) return 'persistent';
    return (await navigator.storage.persist()) ? 'persistent' : 'best-effort';
  } catch {
    return 'unknown';
  }
}
