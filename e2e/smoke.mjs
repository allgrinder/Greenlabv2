/**
 * Browser-Smoke-Test der Kernabläufe (Phase 1). Voraussetzung: `npm run dev` läuft.
 *   npm run e2e            (Chromium aus PLAYWRIGHT_CHROMIUM oder /opt/pw-browsers/chromium)
 */
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const URL = process.env.GW_URL ?? 'http://localhost:5173/';
const b = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
const doc = () => p.evaluate(() => window.__gw.editor.getState().doc);
const w2s = (x, y) => p.evaluate(([x, y]) => window.__gw.renderer.toScreen({ x, y }), [x, y]);
const step = (name) => console.log('✓', name);

await p.goto(URL, { waitUntil: 'networkidle' });

// Onboarding: Polygon + Kalibrierung
await p.waitForSelector('[data-testid=wizard]');
await p.click('[data-testid=contour-edges]');
await p.fill('[data-testid=edge-0-len]', '40');
await p.fill('[data-testid=north]', '-12');
await p.setInputFiles('[data-testid=bg-file]', path.join(here, 'fixtures-lageplan.png'));
const img = await p.locator('[data-testid=calib-stage] img').boundingBox();
const k = img.width / 1200;
await p.mouse.click(img.x + 100 * k, img.y + 700 * k);
await p.mouse.click(img.x + 1100 * k, img.y + 700 * k);
await p.fill('[data-testid=calib-distance]', '50');
await p.click('[data-testid=calib-apply]');
await p.fill('[data-testid=project-name]', 'Smoke');
await p.click('[data-testid=create-project]');
await p.waitForSelector('[data-testid=tool-rail]');
let d = await doc();
assert.equal(d.site.boundary.length, 5);
assert.equal(d.site.northDeg, -12);
assert.ok(Math.abs(d.background.metersPerPixel - 0.05) < 1e-9);
step('Onboarding mit Polygon und Kalibrierung');

// Rechteck zeichnen, verschieben, Ecke ziehen, rückgängig
await p.keyboard.press('r');
let a = await w2s(14, 8), c = await w2s(17, 10);
await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move(c.x, c.y, { steps: 6 }); await p.mouse.up();
const rectId = (await p.evaluate(() => window.__gw.editor.getState().session.selection))[0];
d = await doc();
assert.equal(d.objects[rectId].region.outer.width, 3);
await p.keyboard.press('v');
a = await w2s(15.5, 9); c = await w2s(16.5, 9);
await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move(c.x, c.y, { steps: 8 }); await p.mouse.up();
d = await doc();
assert.deepEqual(d.objects[rectId].region.outer.center, { x: 16.5, y: 9 });
a = await w2s(18, 10); c = await w2s(19, 11);
await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move(c.x, c.y, { steps: 6 }); await p.mouse.up();
d = await doc();
assert.equal(d.objects[rectId].region.outer.kind, 'path');
await p.keyboard.press('Control+z');
await p.keyboard.press('Control+z');
d = await doc();
assert.deepEqual(d.objects[rectId].region.outer.center, { x: 15.5, y: 9 });
step('Rechteck, Verschieben mit Fang, Knoten, Undo');

// Polygon mit Zahleneingabe
await p.keyboard.press('p');
a = await w2s(22, 14); await p.mouse.click(a.x, a.y);
c = await w2s(26, 14); await p.mouse.move(c.x, c.y, { steps: 3 });
await p.keyboard.type('3'); await p.keyboard.press('Enter');
c = await w2s(25, 18); await p.mouse.move(c.x, c.y, { steps: 3 });
await p.keyboard.type('2'); await p.keyboard.press('Enter');
await p.keyboard.press('Enter');
const polyId = (await p.evaluate(() => window.__gw.editor.getState().session.selection))[0];
d = await doc();
assert.deepEqual(d.objects[polyId].region.outer.nodes.map((n) => [n.p.x, n.p.y]), [[22, 14], [25, 14], [25, 16]]);
step('Polygon mit exakten Kantenlängen');

// Weg
await p.keyboard.press('w');
for (const [x, y] of [[12, 16], [16, 18], [20, 16], [20, 16]]) { const q = await w2s(x, y); await p.mouse.click(q.x, q.y); }
d = await doc();
assert.ok(Object.values(d.objects).some((o) => o.type === 'path' && o.width === 1.2 && o.centerline.nodes.length === 3));
step('Weg-Werkzeug');

// Bibliothek: Drag & Drop und Klick-Platzieren
await p.keyboard.press('Escape');
await p.click('[data-testid=toggle-library]');
const canvas = p.locator('[data-testid=plan-canvas] canvas');
const t = await w2s(24, 8);
const dt = await p.evaluateHandle(() => new DataTransfer());
await p.dispatchEvent('[data-testid="lib-plant:amelanchier-lamarckii"]', 'dragstart', { dataTransfer: dt });
await canvas.dispatchEvent('drop', { dataTransfer: dt, clientX: t.x, clientY: t.y });
await p.click('[data-testid="lib-item:raised-bed-300x120"]');
const t2 = await w2s(28, 20);
await p.mouse.click(t2.x, t2.y);
d = await doc();
assert.ok(Object.values(d.objects).some((o) => o.type === 'plant' && o.position.x === 24 && o.position.y === 8));
assert.ok(Object.values(d.objects).some((o) => o.type === 'item' && o.catalogId === 'raised-bed-300x120'));
step('Bibliothek: Drag & Drop und Klick');

// Persistenz
await p.waitForFunction(() => document.querySelector('[data-testid=save-state]')?.textContent === 'Gespeichert');
const n = Object.keys(d.objects).length;
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('[data-testid=tool-rail]');
d = await doc();
assert.equal(d.name, 'Smoke');
assert.equal(Object.keys(d.objects).length, n);
step('Autosave und Wiederherstellen');

// PNG-Export
await p.click('[data-testid=export-btn]');
await p.waitForSelector('[data-testid=export-dialog] img', { timeout: 30000 });
const [png] = await Promise.all([p.waitForEvent('download'), p.click('[data-testid=export-run]')]);
assert.match(png.suggestedFilename(), /^Smoke_M1-100\.png$/);
await p.keyboard.press('Escape');
step('PNG-Export');

// JSON-Export → Import
await p.click('button[aria-label=Projekte]');
const [json] = await Promise.all([p.waitForEvent('download'), p.click('[data-testid=menu-export-json]')]);
const file = await json.path();
await p.click('button[aria-label=Projekte]');
await p.setInputFiles('[data-testid=import-file]', file);
await p.waitForSelector('[data-testid=toast]');
d = await doc();
assert.equal(Object.keys(d.objects).length, n);
assert.ok(d.background);
step('JSON-Export und -Import');

assert.deepEqual(errors, []);
console.log('Alle Smoke-Tests bestanden.');
await b.close();
