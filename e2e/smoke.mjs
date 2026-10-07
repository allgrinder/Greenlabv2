/**
 * Browser-Smoke-Test der Kernabläufe (Phase 1 und 2). Voraussetzung: `npm run dev` läuft.
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
await p.click('[data-testid=align-mode-distance]');
await p.fill('[data-testid=calib-distance]', '50');
await p.click('[data-testid=calib-apply]');
// Punkt C in der Vorschau ziehen, Ort wählen
await p.click('[data-testid=stage-contour]');
const vc = await p.locator('[data-testid=vertex-2]').boundingBox();
await p.mouse.move(vc.x + 6, vc.y + 6); await p.mouse.down(); await p.mouse.move(vc.x + 30, vc.y + 20, { steps: 5 }); await p.mouse.up();
await p.fill('[data-testid=place]', 'Hamburg');
await p.fill('[data-testid=project-name]', 'Smoke');
await p.click('[data-testid=create-project]');
await p.waitForSelector('[data-testid=tool-rail]');
let d = await doc();
assert.equal(d.site.boundary.length, 5);
assert.equal(d.site.northDeg, -12);
assert.ok(Math.abs(d.background.metersPerPixel - 0.05) < 1e-9);
assert.equal(d.site.location.place, 'Hamburg');
assert.ok(Math.abs(d.site.location.lat - 53.55) < 0.01);
step('Onboarding mit Polygon, Punkt ziehen, Kalibrierung, Ort');

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

// Kontur im Editor bearbeiten und Hintergrund an zwei Ecken ausrichten
await p.keyboard.press('Escape');
await p.evaluate(() => { const st = window.__gw.editor.getState(); st.setSession({ selection: [], tool: 'select', panels: { ...st.session.panels, library: false } }); });
await p.click('[data-testid=plot-edit]');
d = await doc();
const corner = d.site.boundary[1];
a = await w2s(corner.x, corner.y); c = await w2s(corner.x + 2, corner.y - 1);
await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move(c.x, c.y, { steps: 5 }); await p.mouse.up();
d = await doc();
assert.equal(d.site.plot.kind, 'drawn');
assert.ok(Math.abs(d.site.boundary[1].x - (corner.x + 2)) < 0.11);
await p.keyboard.press('Escape');
await p.click('[data-testid=bg-align]');
const g0 = d.background;
const i2w = (x, y) => { const r = (g0.rotationDeg * Math.PI) / 180; const X = x * g0.metersPerPixel, Y = y * g0.metersPerPixel; return { x: g0.origin.x + X * Math.cos(r) - Y * Math.sin(r), y: g0.origin.y + X * Math.sin(r) + Y * Math.cos(r) }; };
for (const [x, y] of [[400, 300], [800, 500]]) { const w = i2w(x, y); const q = await w2s(w.x, w.y); await p.mouse.click(q.x, q.y); await p.waitForTimeout(350); }
const B0 = d.site.boundary[0], B2 = d.site.boundary[2];
for (const P of [B0, B2]) { const q = await w2s(P.x + 0.2, P.y + 0.2); await p.mouse.click(q.x, q.y); await p.waitForTimeout(350); }
d = await doc();
// der geklickte Bildpunkt 1 liegt jetzt exakt auf Ecke A
const p1 = (() => { const g = d.background; const a = g.calibration.a; const r = (g.rotationDeg * Math.PI) / 180; const X = a.x * g.metersPerPixel, Y = a.y * g.metersPerPixel; return { x: g.origin.x + X * Math.cos(r) - Y * Math.sin(r), y: g.origin.y + X * Math.sin(r) + Y * Math.cos(r) }; })();
assert.ok(Math.hypot(p1.x - B0.x, p1.y - B0.y) < 1e-6);
assert.equal(d.site.northDeg, Math.round(d.background.rotationDeg * 1000) / 1000);
step('Editor: Kontur ziehen, Bild an zwei Ecken ausrichten');

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
await p.click('[data-testid=export-dialog] >> text=PNG');
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

// Phase 2 am Beispielprojekt
await p.click('button[aria-label=Projekte]');
await p.click('[data-testid=menu-sample]');
await p.waitForFunction(() => window.__gw.editor.getState().doc?.name.includes('Lindenweg'));
const tab = (name) => p.click(`header >> text=${name}`);

await tab('Sonne');
await p.waitForSelector('[data-testid=sun-panel] >> text=Hochbeete');
await p.click('[data-testid=sun-date-355]');
assert.equal((await p.evaluate(() => window.__gw.editor.getState().session.sun.doy)), 355);
step('Sonne: Datum, Heatmap-Empfehlungen');

await tab('Wachstum');
await p.focus('[data-testid=growth-slider]');
await p.keyboard.press('ArrowRight');
assert.ok((await p.textContent('[data-testid=growth-label]')).startsWith('in '));
await p.waitForSelector('[data-testid=growth-warning]');
step('Wachstum: Zeitreise und Konflikthinweis');

await tab('Jahreszeiten');
await p.waitForSelector('[data-testid=season-winter] img', { timeout: 60000 });
step('Jahreszeiten: vier Vorschauen');

await tab('Bewässerung');
const lawnIds = await p.evaluate(() => Object.values(window.__gw.editor.getState().doc.objects).filter((o) => o.type === 'area' && o.materialId === 'lawn').map((o) => o.id));
await p.evaluate((ids) => window.__gw.editor.getState().setSession({ selection: ids }), lawnIds);
await p.click('[data-testid=auto-sprinklers]');
d = await doc();
assert.ok(Object.values(d.objects).filter((o) => o.type === 'sprinkler').length > 20);
assert.match(await p.textContent('[data-testid=coverage]'), /\d+ % bewässert/);
step('Bewässerung: Regner verteilen, Überdeckung');

await tab('Kosten');
await p.click('[data-testid="price-mat:lawn"]');
await p.keyboard.press('Control+A');
await p.keyboard.type('10');
await p.keyboard.press('Enter');
assert.equal((await doc()).priceOverrides['mat:lawn'], 10);
const [csv] = await Promise.all([p.waitForEvent('download'), p.click('[data-testid=cost-csv]')]);
assert.match(csv.suggestedFilename(), /_Kosten\.csv$/);
await p.keyboard.press('Escape');
assert.equal(await p.evaluate(() => window.__gw.editor.getState().session.lens), 'plan');
step('Kosten: Preis ändern, CSV');

await p.click('[data-testid=night-btn]');
await p.click('[data-testid=scene-dinner]');
assert.match(await p.textContent('[data-testid=night-pill]'), /Abendessen/);
await p.click('[data-testid=day-btn]');
step('Nacht: Lichtszene');

// Spalierbäume, Pflanzpinsel, Einsehbarkeit
await tab('Planen');
await p.evaluate(() => { const st = window.__gw.editor.getState(); st.setSession({ selection: [], tool: 'select', panels: { ...st.session.panels, library: true, layers: false }, viewport: { center: { x: 25, y: 15 }, pxPerMeter: 20, rotationDeg: 0 } }); });
await p.click('[data-testid="lib-plant:carpinus-espalier"]');
for (const [x, y] of [[20, 28.5], [32, 28.5]]) { const q = await w2s(x, y); await p.mouse.click(q.x, q.y); }
await p.keyboard.press('Enter');
d = await doc();
const esp = Object.values(d.objects).filter((o) => o.type === 'espalier' && o.speciesId === 'carpinus-espalier');
assert.equal(esp.length, 1);
assert.equal(Math.round(Math.hypot(esp[0].centerline.nodes[1].p.x - esp[0].centerline.nodes[0].p.x, 0)), 12);
step('Spalierreihe zeichnen');

await p.keyboard.press('Escape');
await p.click('[data-testid="lib-tool:brush"]');
const groups0 = Object.values((await doc()).objects).filter((o) => o.type === 'scatter').length;
let qa = await w2s(30, 20), qb = await w2s(34, 21);
await p.mouse.move(qa.x, qa.y); await p.mouse.down(); await p.mouse.move(qb.x, qb.y, { steps: 12 }); await p.mouse.up();
d = await doc();
const groups = Object.values(d.objects).filter((o) => o.type === 'scatter');
assert.equal(groups.length, groups0 + 1);
assert.ok(groups[groups.length - 1].plants.length >= 8);
assert.equal(await p.evaluate(() => window.__gw.editor.getState().history.past.slice(-1)[0].label), 'Pflanzgruppe hinzufügen');
step('Pflanzpinsel: eine Gruppe je Strich');

await p.keyboard.press('Escape');
await p.evaluate(() => { const st = window.__gw.editor.getState(); st.setSession({ selection: [], tool: 'select', panels: { ...st.session.panels, library: false } }); });
// eigener Reiter, auch bei Auswahl erreichbar; Knopf im Grundstück-Panel führt dorthin
await tab('Sichtschutz');
await p.waitForSelector('[data-testid=privacy-ratio]', { timeout: 20000 });
assert.match(await p.textContent('[data-testid=privacy-ratio]'), /\d+ %/);
await p.click('[data-testid=privacy-close]');
assert.equal(await p.evaluate(() => window.__gw.editor.getState().session.lens), 'plan');
await p.click('[data-testid=privacy-open]');
assert.equal(await p.evaluate(() => window.__gw.editor.getState().session.lens), 'privacy');
await tab('Planen');
step('Einsehbarkeit');

// Schrägansicht: reine Anzeige mit festem Winkel; Zeichenwerkzeuge schalten zurück
await p.evaluate(() => { const st = window.__gw.editor.getState(); st.setSession({ privacy: { ...st.session.privacy, on: false }, tool: 'select' }); });
await p.click('[data-testid=view-oblique]');
await p.waitForTimeout(1500);
assert.equal(await p.evaluate(() => window.__gw.editor.getState().session.viewport.tiltDeg), 35);
// Körper (Häuser, Bäume, Hecken) liegen nach Tiefe sortiert in einem eigenen Container
const solids = await p.evaluate(() => window.__gw.renderer.app.stage.children[0].children.find((x) => x.label === 'solids')?.children.length ?? 0);
assert.ok(solids > 20, `Körper in der Schrägansicht: ${solids}`);
await p.click('[data-testid=tool-rect]');
assert.equal(await p.evaluate(() => window.__gw.editor.getState().session.viewport.tiltDeg), 0);
await p.click('[data-testid=view-oblique]');
await p.keyboard.press('Escape');
step('Schrägansicht');

await p.click('[data-testid=export-btn]');
await p.waitForSelector('[data-testid=pdf-preview] img', { timeout: 30000 });
await p.click('[data-testid=export-dialog] >> text=150 dpi');
const [pdf] = await Promise.all([p.waitForEvent('download', { timeout: 120000 }), p.click('[data-testid=export-run]')]);
assert.match(pdf.suggestedFilename(), /_A3_M1-200\.pdf$/);
await p.keyboard.press('Escape');
step('PDF-Architektenplan');

// Ebenen wie in Photoshop: eigene Ebene, neue Objekte darin, Objekte und Ebenen ziehen, Deckkraft, löschen
await p.evaluate(() => { const st = window.__gw.editor.getState(); st.setSession({ selection: [], tool: 'select', panels: { ...st.session.panels, layers: true, library: false, properties: false }, viewport: { center: { x: 25, y: 15 }, pxPerMeter: 20, rotationDeg: 0 } }); });
await p.click('[data-testid=layer-add]');
await p.dblclick('[data-testid="layer-Neue Ebene"] >> text=Neue Ebene');
await p.fill('[data-testid=layer-rename]', 'Neue Wege');
await p.keyboard.press('Enter');
d = await doc();
const nl = Object.values(d.layers).find((l) => l.name === 'Neue Wege');
assert.equal(nl?.kind, 'custom');
assert.match(await p.textContent('[data-testid=layer-target]'), /Neue Wege/);
await p.keyboard.press('w');
for (const [x, y] of [[28, 24], [34, 25.5], [34, 25.5]]) { const q = await w2s(x, y); await p.mouse.click(q.x, q.y); }
await p.keyboard.press('Escape');
d = await doc();
assert.equal(d.layers[nl.id].objectOrder.length, 1);
const newPathId = d.layers[nl.id].objectOrder[0];
assert.equal(d.objects[newPathId].type, 'path');
// Objekt aus der eigenen Ebene in „Wege“ ziehen, dann rückgängig
await p.click('[data-testid="layer-open-Neue Wege"]');
await p.locator(`[data-testid=obj-row-${newPathId}]`).dragTo(p.locator('[data-testid=layer-paths]'));
d = await doc();
const pathsLayer = Object.values(d.layers).find((l) => l.kind === 'paths');
assert.equal(d.objects[newPathId].layerId, pathsLayer.id);
assert.equal(pathsLayer.objectOrder.at(-1), newPathId);
await p.keyboard.press('Control+z');
assert.equal((await doc()).objects[newPathId].layerId, nl.id);
// Ebene unter „Flächen“ ziehen
const idxBefore = (await doc()).layerOrder.indexOf(nl.id);
await p.locator('[data-testid="layer-Neue Wege"]').dragTo(p.locator('[data-testid=layer-areas]'));
d = await doc();
assert.ok(d.layerOrder.indexOf(nl.id) < idxBefore);
assert.equal(d.layerOrder.indexOf(nl.id), d.layerOrder.indexOf(Object.values(d.layers).find((l) => l.kind === 'areas').id) + 1);
// Deckkraft 50 %
const sl = await p.locator('[data-testid=layer-opacity]').boundingBox();
await p.mouse.click(sl.x + sl.width / 2, sl.y + sl.height / 2);
assert.ok(Math.abs((await doc()).layers[nl.id].opacity - 0.5) < 0.06);
// löschen mit Rückfrage (Ebene enthält ein Objekt)
await p.click('[data-testid=layer-delete]');
assert.ok((await doc()).layers[nl.id]);
await p.click('[data-testid=layer-delete]');
d = await doc();
assert.equal(d.layers[nl.id], undefined);
assert.equal(d.objects[newPathId], undefined);
step('Ebenen wie in Photoshop');

assert.deepEqual(errors, []);
console.log('Alle Smoke-Tests bestanden.');
await b.close();
