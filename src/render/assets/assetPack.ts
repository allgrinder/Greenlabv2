/**
 * Optionale Bildpakete für Hosts mit Dateilimit (z. B. die Artefakt-Kopie): dort liegen die Bilder
 * nicht einzeln, sondern als Data-URLs in wenigen JSON-Paketen. Die Seite setzt dann
 * `window.__gwPack` auf den Ordner mit `index.json` (Datei → Paket). Ohne diese Angabe – App,
 * GitHub Pages, Windows – bleibt jede URL unverändert.
 */
declare global {
  var __gwPack: string | undefined;
}

const ASSETS = `${import.meta.env.BASE_URL}assets/`;
let index: Promise<Record<string, string> | null> | null = null;
const packs = new Map<string, Promise<Record<string, string>>>();

async function json<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return (await r.json()) as T;
}

/** URL eines Bildes unter `assets/` – aus dem Paket, falls eines angegeben ist */
export async function assetUrl(url: string): Promise<string> {
  const dir = globalThis.__gwPack;
  if (!dir || !url.startsWith(ASSETS)) return url;
  index ??= json<Record<string, string>>(`${dir}index.json`).catch(() => null);
  const key = url.slice(ASSETS.length);
  const pack = (await index)?.[key];
  if (!pack) return url;
  let p = packs.get(pack);
  if (!p) {
    p = json<Record<string, string>>(dir + pack);
    packs.set(pack, p);
  }
  try {
    return (await p)[key] ?? url;
  } catch {
    return url;
  }
}
