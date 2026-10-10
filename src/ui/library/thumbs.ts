/**
 * Vorschaubilder der Bibliothek aus den Blender-Renderings: Draufsicht der Objekte (Drehung 0°)
 * und der Pflanzen im Sommer – dasselbe Bild, das später im Plan erscheint.
 * Bis die Manifeste geladen sind (oder ohne Bild) bleibt das gezeichnete Symbol.
 */
import { useEffect, useState } from 'react';
import { PLANTS } from '../../core/catalog/plants';
import { lookKey, plantLook } from '../../render/assets/plantLooks';

export interface Thumbs {
  /** Katalogsymbol → Bild-URL */
  items: Record<string, string>;
  /** Pflanzenart → Bild-URL */
  plants: Record<string, string>;
}

const BASE = import.meta.env.BASE_URL;
let loading: Promise<Thumbs> | null = null;

async function json<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url);
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

function load(): Promise<Thumbs> {
  loading ??= (async () => {
    const [im, pm] = await Promise.all([
      json<{ items: Record<string, { top: { file: string; rot: number }[] }> }>(`${BASE}assets/items/manifest.json`),
      json<{ plants: Record<string, { looks: Record<string, { top: { file: string }[] }> }> }>(`${BASE}assets/plants/manifest.json`),
    ]);
    const items: Record<string, string> = {};
    for (const [sym, e] of Object.entries(im?.items ?? {})) {
      const v = e.top.find((x) => x.rot === 0) ?? e.top[0];
      if (v) items[sym] = `${BASE}assets/items/${v.file}`;
    }
    const plants: Record<string, string> = {};
    for (const sp of PLANTS) {
      const e = pm?.plants[sp.id];
      const v = e?.looks[lookKey(plantLook(sp, 'summer'))]?.top[0] ?? Object.values(e?.looks ?? {})[0]?.top[0];
      if (v) plants[sp.id] = `${BASE}assets/plants/${v.file}`;
    }
    return { items, plants };
  })();
  return loading;
}

export function useThumbs(): Thumbs | null {
  const [t, setT] = useState<Thumbs | null>(null);
  useEffect(() => {
    let alive = true;
    load().then((x) => alive && setT(x));
    return () => {
      alive = false;
    };
  }, []);
  return t;
}
