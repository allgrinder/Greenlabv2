/**
 * JSON-Import/-Export. Das Format bündelt das Projekt und seine Bilder (als Data-URL),
 * damit eine Datei vollständig weitergegeben werden kann.
 */
import { z } from 'zod';
import { newId } from '../core/model/ids';
import type { Project } from '../core/model/types';
import { migrate } from './migrations';

export const FILE_FORMAT = 'gartenwerk';

const vec = z.object({ x: z.number().finite(), y: z.number().finite() });
const OBJECT_TYPES = ['area', 'path', 'plant', 'planting', 'hedge', 'espalier', 'scatter', 'item', 'dimension', 'text', 'lamp', 'sprinkler', 'drip', 'pipe', 'fixture'] as const;

/** Bewusst schlank: prüft Struktur und Kernfelder, Details übernimmt der Renderer defensiv */
const fileSchema = z.object({
  format: z.literal(FILE_FORMAT),
  schemaVersion: z.number().int().positive(),
  project: z.object({
    id: z.string(),
    name: z.string(),
    site: z.object({ boundary: z.array(vec).min(3), northDeg: z.number(), plot: z.object({ kind: z.string() }).passthrough() }).passthrough(),
    layerOrder: z.array(z.string()),
    layers: z.record(z.string(), z.object({ id: z.string(), kind: z.string(), visible: z.boolean(), locked: z.boolean(), objectOrder: z.array(z.string()) }).passthrough()),
    objects: z.record(z.string(), z.object({ id: z.string(), type: z.enum(OBJECT_TYPES), layerId: z.string() }).passthrough()),
  }).passthrough(),
  blobs: z.record(z.string(), z.string()).optional(),
});

export type GartenwerkFile = z.infer<typeof fileSchema>;

export async function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}

export async function dataUrlToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob();
}

export async function exportProject(p: Project, getBlob: (id: string) => Promise<Blob | undefined>): Promise<string> {
  const blobs: Record<string, string> = {};
  if (p.background) {
    const b = await getBlob(p.background.blobId);
    if (b) blobs[p.background.blobId] = await blobToDataUrl(b);
  }
  return JSON.stringify({ format: FILE_FORMAT, schemaVersion: p.schemaVersion, project: p, blobs }, null, 1);
}

export interface ImportResult {
  project: Project;
  blobs: Record<string, Blob>;
}

/**
 * Datei prüfen, migrieren und als Kopie mit neuer ID zurückgeben.
 * Referenzielle Integrität (Ebenen ↔ Objekte) wird repariert statt abgelehnt.
 */
export async function importProject(text: string): Promise<ImportResult> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Die Datei ist kein gültiges JSON.');
  }
  const parsed = fileSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`Keine gültige Gartenwerk-Datei (${issue.path.join('.') || 'Format'}: ${issue.message}).`);
  }
  const project = migrate({ ...parsed.data.project, schemaVersion: parsed.data.schemaVersion }) as Project;
  // Integrität: verwaiste Verweise entfernen
  for (const lid of project.layerOrder) {
    const l = project.layers[lid];
    if (!l) continue;
    l.objectOrder = l.objectOrder.filter((id) => project.objects[id]?.layerId === lid);
  }
  project.layerOrder = project.layerOrder.filter((id) => project.layers[id]);
  for (const o of Object.values(project.objects)) {
    const l = project.layers[o.layerId];
    if (!l) delete project.objects[o.id];
    else if (!l.objectOrder.includes(o.id)) l.objectOrder.push(o.id);
  }
  const blobs: Record<string, Blob> = {};
  for (const [id, url] of Object.entries(parsed.data.blobs ?? {})) blobs[id] = await dataUrlToBlob(url);
  const now = new Date().toISOString();
  return { project: { ...project, id: newId(), updatedAt: now }, blobs };
}
