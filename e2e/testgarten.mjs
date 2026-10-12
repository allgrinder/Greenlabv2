/**
 * Bildprüfung an einem selbst angelegten Garten statt am Mustergarten:
 * neuer Garten über den Assistenten, dann mit den Werkzeugen wie ein Nutzer Rasen, Holzdeck und Platten
 * auf dem Rasen, Rabatte, Trittplatten und Kiesweg. Schreibt Bildschirmfotos nach e2e/out/ (Gesamtplan
 * und Nahansichten) und prüft, dass keine Rasenkante unter einer aufliegenden Fläche gezeichnet wird.
 *   GW_URL=http://localhost:5173/ node e2e/testgarten.mjs   (Dev-Server muss laufen)
 */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'out');
mkdirSync(out, { recursive: true });
const URL = process.env.GW_URL ?? 'http://localhost:5173/';
const b = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const p = await b.newPage({ viewport: { width: 1000, height: 800 } });
const w2s = (x, y) => p.evaluate(([x, y]) => window.__gw.renderer.toScreen({ x, y }), [x, y]);
const set = (s) => p.evaluate((s) => { const st = window.__gw.editor.getState(); st.setSession({ ...s, defaults: { ...st.session.defaults, ...(s.defaults ?? {}) } }); }, s);
const count = () => p.evaluate(() => Object.keys(window.__gw.editor.getState().doc.objects).length);
const drag = async (x0, y0, x1, y1) => {
  const a = await w2s(x0, y0), c = await w2s(x1, y1);
  await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move(c.x, c.y, { steps: 8 }); await p.mouse.up();
  await p.keyboard.press('Escape');
};
const pathAt = async (pts, mat, width) => {
  await set({ tool: 'path', defaults: { pathMaterial: mat, pathWidth: width } });
  for (const [x, y] of [...pts, pts[pts.length - 1]]) { const q = await w2s(x, y); await p.mouse.click(q.x, q.y); }
  await p.keyboard.press('Escape');
};

await p.goto(URL, { waitUntil: 'networkidle' });
await p.click('[data-testid=start-new]');
await p.waitForSelector('[data-testid=wizard]');
await p.fill('[data-testid=project-name]', 'Testgarten');
await p.click('[data-testid=create-project]');
await p.waitForSelector('[data-testid=tool-rail]');
const site = await p.evaluate(() => window.__gw.editor.getState().doc.site.boundary);
const xs = site.map((q) => q.x), ys = site.map((q) => q.y);
const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
await set({ viewport: { center: { x: mx, y: my }, pxPerMeter: Math.min(700 / (x1 - x0), 600 / (y1 - y0)), rotationDeg: 0, tiltDeg: 0 } });
await p.waitForTimeout(800);

// Startpunkte mit Abstand zu den Grundstücksecken (deren Griffe sonst den Zug übernehmen)
await set({ tool: 'rect', defaults: { areaMaterial: 'lawn' } }); await drag(x0 + 1.5, y0 + 1.5, x1 - 1.5, y1 - 1.5);
await set({ tool: 'rect', defaults: { areaMaterial: 'wood' } }); await drag(x0 + 1, y0 + 1, x0 + 6, y0 + 5);
await set({ tool: 'rect', defaults: { areaMaterial: 'slabs' } }); await drag(x1 - 5, y0 + 1, x1 - 1, y0 + 4);
await set({ tool: 'bed', defaults: { bedShape: 'rect', bedMix: 'auto' } }); await drag(x0 + 1, y1 - 4, x1 - 1, y1 - 1.5);
await pathAt([[mx, y0 + 5.5], [mx + 2, my], [mx, y1 - 4.5]], 'stepping', 0.9);
await pathAt([[x0 + 0.8, y0 + 6], [x0 + 0.8, y1 - 4.5]], 'gravel', 1.2);
assert.equal(await count(), 6, 'Rasen, Deck, Platten, Rabatte, Trittplatten, Kiesweg');
await set({ tool: 'select', selection: [], panels: { layers: false, library: false, properties: false } });

// Rasenkante unter dem Deck: dort kein Kontaktschatten (früher als unscharfer Streifen im Deck sichtbar)
const hidden = await p.evaluate(([x, y]) => {
  const edges = window.__gw.renderer.edgeLayer;
  const lawn = [...edges.entries.values()].find((e) => e.tex === 'lawn');
  return lawn.edges.flatMap((ed) => ed.pts.map((q, i) => ({ q, shade: ed.shade[i] }))).filter(({ q }) => q.x > x - 0.2 && q.x < x + 0.2 && q.y > y + 0.3 && q.y < y + 2).map((e) => e.shade);
}, [x0 + 1.5, y0 + 1.5]);
assert.ok(hidden.length > 0 && hidden.every((s) => !s), 'Rasenkante unter dem Deck ohne Schatten');

await p.waitForTimeout(25000);
await p.screenshot({ path: path.join(out, 'plan.png') });
for (const [k, x, y, ppm] of [['deck', x0 + 4, y0 + 4, 90], ['trittplatten', mx + 1, my, 110], ['rabatte', mx, y1 - 3, 70], ['rasen', mx - 3, my + 2, 90]]) {
  await set({ viewport: { center: { x, y }, pxPerMeter: ppm, rotationDeg: 0, tiltDeg: 0 } });
  await p.waitForTimeout(8000);
  await p.screenshot({ path: path.join(out, `${k}.png`) });
}
await b.close();
console.log('Testgarten geprüft, Bilder in e2e/out/');
