/**
 * IndexedDB-Ablage: mehrere Projekte lokal, Hintergrundbilder als Blobs.
 * Stores: projects (vollständiges Projekt), meta (für die Projektliste), blobs (Bilder).
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { area } from '../core/geometry/polygon';
import type { Id, Project } from '../core/model/types';
import { migrate } from './migrations';

export interface ProjectMeta {
  id: Id;
  name: string;
  updatedAt: string;
  createdAt: string;
  areaM2: number;
  objectCount: number;
  location: string | null;
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
  location: p.site.location?.label ?? null,
});

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
  await Promise.all([tx.objectStore('projects').delete(id), tx.objectStore('meta').delete(id), tx.done]);
}

export async function putBlob(id: Id, blob: Blob): Promise<void> {
  await (await db()).put('blobs', blob, id);
}

export async function getBlob(id: Id): Promise<Blob | undefined> {
  return (await db()).get('blobs', id);
}

const LAST = 'gw:lastProject';

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
