/**
 * Zwischenspeicher für fertig berechnete Bodentexturen (aufgebrochene Kacheln, Großflächen-Variation).
 *
 * Beim ersten Start werden sie gemalt und danach verlustfrei (PNG) in IndexedDB abgelegt; ab dem zweiten
 * Start lädt `restoreTextureCache` sie vorab, und `cachedCanvas` gibt das gespeicherte Bild statt neu zu malen.
 * Der Schlüssel enthält eine Version aus Code-Stand und Boden-Manifest: neue Blender-Bilder oder eine
 * geänderte Berechnung verwerfen den alten Stand automatisch.
 */
import { openDB, type IDBPDatabase } from 'idb';

/** bei Änderungen an bomb()/Makro-Berechnung erhöhen */
const CODE_VERSION = 1;

let version = '';
const restored = new Map<string, HTMLCanvasElement>();
const painted = new Map<string, HTMLCanvasElement>();
let dbp: Promise<IDBPDatabase> | null = null;

function db() {
  dbp ??= openDB('gartenwerk-cache', 1, {
    upgrade(d) {
      d.createObjectStore('tex');
    },
  });
  return dbp;
}

/** Bild aus dem Zwischenspeicher oder neu gemalt (und für `persistTextureCache` vorgemerkt) */
export function cachedCanvas(key: string, w: number, h: number, paint: (c: HTMLCanvasElement) => void): HTMLCanvasElement {
  const hit = restored.get(key);
  if (hit && hit.width === w && hit.height === h) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c);
  painted.set(key, c);
  return c;
}

/** Gespeicherte Texturen dieser Version laden, ältere Stände löschen */
export async function restoreTextureCache(assetVersion: string): Promise<void> {
  version = `${CODE_VERSION}|${assetVersion}`;
  try {
    const d = await db();
    const keys = (await d.getAllKeys('tex')) as string[];
    await Promise.all(
      keys.map(async (k) => {
        if (!k.startsWith(`${version}#`)) return d.delete('tex', k);
        const blob = (await d.get('tex', k)) as Blob | undefined;
        if (!blob) return;
        // zurück auf ein Canvas: gleiche Alpha-Behandlung beim Hochladen wie beim frisch gemalten Bild
        const bmp = await createImageBitmap(blob);
        const c = document.createElement('canvas');
        c.width = bmp.width;
        c.height = bmp.height;
        c.getContext('2d')!.drawImage(bmp, 0, 0);
        bmp.close();
        restored.set(k.slice(version.length + 1), c);
      }),
    );
  } catch (e) {
    console.warn('Textur-Zwischenspeicher nicht verfügbar', e);
  }
}

/** Neu gemalte Texturen im Hintergrund ablegen (eine je Leerlaufphase) */
export async function persistTextureCache(idle: () => Promise<void>): Promise<void> {
  if (!version || !painted.size) return;
  try {
    const d = await db();
    for (const [k, c] of [...painted]) {
      await idle();
      const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
      if (blob) await d.put('tex', blob, `${version}#${k}`);
      painted.delete(k);
    }
  } catch (e) {
    console.warn('Textur-Zwischenspeicher nicht geschrieben', e);
  }
}
