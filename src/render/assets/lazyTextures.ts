/**
 * Gemeinsamer Baustein für Bildsätze, die erst bei Bedarf geladen werden (Objekte, Pflanzen):
 * jede Datei genau einmal anfordern, fertige Texturen vorhalten und Nachladen gebündelt melden.
 */
import { Assets, type Texture } from 'pixi.js';
import { assetUrl } from './assetPack';

/** Einstellungen für vorgerenderte Bilder: weich skaliert, mit Mipmaps; Kacheln auf Wunsch wiederholend */
export function prepTexture(t: Texture, repeat = false): Texture {
  if (repeat) t.source.style.addressMode = 'repeat';
  t.source.scaleMode = 'linear';
  t.source.autoGenerateMipmaps = true;
  t.source.updateMipmaps?.();
  return t;
}

export function lazyTextures(base: string) {
  const textures = new Map<string, Texture>();
  const pending = new Map<string, Promise<void>>();
  let onLoaded: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function request(file: string): Promise<void> {
    let p = pending.get(file);
    if (!p) {
      p = assetUrl(base + file)
        .then((url) => Assets.load<Texture>(url))
        .then((t) => {
          textures.set(file, prepTexture(t));
          // mehrere Bilder kurz hintereinander: einmal neu aufbauen
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => onLoaded?.(), 120);
        })
        .catch(() => undefined);
      pending.set(file, p);
    }
    return p;
  }

  return {
    get: (file: string) => textures.get(file),
    request,
    /** Dateien laden und die fertigen Texturen liefern */
    async preload(files: Iterable<string>): Promise<Texture[]> {
      const list = [...files];
      await Promise.all(list.map(request));
      return list.flatMap((f) => textures.get(f) ?? []);
    },
    onLoaded(cb: () => void) {
      onLoaded = cb;
    },
  };
}
