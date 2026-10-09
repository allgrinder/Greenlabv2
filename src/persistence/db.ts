/**
 * IndexedDB-Ablage: mehrere Projekte lokal, Hintergrundbilder als Blobs.
 * Stores: projects (vollständiges Projekt), meta (für die Projektliste), blobs (Bilder).
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { area } from '../core/geometry/polygon';
import type { Id, Project, Vec2 } from '../core/model/types';
import { migrate } from './migrations';

export interface ProjectMeta {
  id: Id;
  name: string;
  updatedAt: string;
  createdAt: string;
  areaM2: number;
  objectCount: number;
  location: string | null;
  /** vereinfachte Grundstückskontur für die Vorschau, solange kein Vorschaubild existiert */
  outline?: Vec2[];
}

interface GwDB extends DBSchema {
  projects: { key: string; value: Project };
  meta: { key: string; value: ProjectMeta; indexes: { updatedAt: string } };
  blobs: { key: string; value: Blob };
}

let dbp: Promise<IDBPDatabase<GwDB>> | null = null;

export function db(): Promise<IDBPDatabase<GwDB>> {
  dbp ??= openDB<GwDB>('gartenwerk', 1, {
    upgrade(d) {
      d.createObjectStore('projects', { keyPath: 'id' });
      const m = d.createObjectStore('meta', { keyPath: 'id' });
      m.createIndex('updatedAt', 'updatedAt');
      d.createObjectStore('blobs');
    },
  });
  return dbp;
}

export const metaOf = (p: Project): ProjectMeta => ({
  id: p.id,
  name: p.name,
  updatedAt: p.updatedAt,
  createdAt: p.createdAt,
  areaM2: area(p.site.boundary),
  objectCount: Object.keys(p.objects).length,
  location: p.site.location?.label || p.site.location?.place || null,
  outline: simplify(p.site.boundary, 64),
});

/** höchstens `max` Punkte, auf Zentimeter gerundet */
function simplify(pts: Vec2[], max: number): Vec2[] {
  const step = Math.max(1, Math.ceil(pts.length / max));
  return pts.filter((_, i) => i % step === 0).map((q) => ({ x: Math.round(q.x * 100) / 100, y: Math.round(q.y * 100) / 100 }));
}

export async function saveProject(p: Project): Promise<void> {
  const d = await db();
  const tx = d.transaction(['projects', 'meta'], 'readwrite');
  await Promise.all([tx.objectStore('projects').put(p), tx.objectStore('meta').put(metaOf(p)), tx.done]);
}

export async function loadProject(id: Id): Promise<Project | null> {
  const raw = await (await db()).get('projects', id);
  return raw ? migrate(raw) : null;
}

/** Projektliste, zuletzt bearbeitete zuerst */
export async function listProjects(): Promise<ProjectMeta[]> {
  const all = await (await db()).getAllFromIndex('meta', 'updatedAt');
  return all.reverse();
}

export async function deleteProject(id: Id): Promise<void> {
  const d = await db();
  const p = await d.get('projects', id);
  const tx = d.transaction(['projects', 'meta', 'blobs'], 'readwrite');
  if (p?.background) await tx.objectStore('blobs').delete(p.background.blobId);
  await tx.objectStore('blobs').delete(thumbKey(id));
  await Promise.all([tx.objectStore('projects').delete(id), tx.objectStore('meta').delete(id), tx.done]);
}

export async function putBlob(id: Id, blob: Blob): Promise<void> {
  await (await db()).put('blobs', blob, id);
}

export async function getBlob(id: Id): Promise<Blob | undefined> {
  return (await db()).get('blobs', id);
}

/* ---------- Vorschaubilder für die Startseite ---------- */

const thumbKey = (id: Id) => `thumb:${id}`;

export async function putThumbnail(id: Id, blob: Blob): Promise<void> {
  await putBlob(thumbKey(id), blob);
}

export async function getThumbnail(id: Id): Promise<Blob | undefined> {
  return getBlob(thumbKey(id));
}

const LAST = 'gw:lastProject';
const SAMPLE = 'gw:sampleProject';

/** Id der gespeicherten Kopie des Mustergartens (damit „Mustergarten“ keine Duplikate anlegt) */
export function sampleProjectId(): Id | null {
  try {
    return localStorage.getItem(SAMPLE);
  } catch {
    return null;
  }
}

export function rememberSample(id: Id | null) {
  try {
    if (id) localStorage.setItem(SAMPLE, id);
    else localStorage.removeItem(SAMPLE);
  } catch {
    /* privater Modus */
  }
}

export function rememberLast(id: Id | null) {
  try {
    if (id) localStorage.setItem(LAST, id);
    else localStorage.removeItem(LAST);
  } catch {
    /* privater Modus */
  }
}

export function lastProjectId(): Id | null {
  try {
    return localStorage.getItem(LAST);
  } catch {
    return null;
  }
}
