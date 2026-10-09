# Gartenwerk – Architektur & Datenmodell

Stand: 06.10.2026 · Grundlage: Design-Handoff `project/Gartenwerk.dc.html` (inkl. `Chrome`, `GardenPlan`)

Dieses Dokument wurde vor dem UI-Bau abgestimmt und beschreibt jetzt den Stand nach Phase 2 (Abschnitt 12). Maßgeblich für das Datenmodell ist der Code:
`src/core/model/types.ts` (Projekt, Ebenen, Objekte, Katalog) und `src/state/types.ts` (Sitzung, Undo-Historie). Beide Dateien sind typgeprüft (`tsc --strict`).

---

## 1. Überblick

```
┌──────────────────────────── ui/ (React) ─────────────────────────────┐
│ Topbar · Werkzeugleiste · Ebenen · Eigenschaften · Bibliothek ·      │
│ Unterleiste (Zoom, Maßstab, Raster, Undo, Tag/Nacht) · Onboarding    │
└───────▲───────────────────────────────┬──────────────────────────────┘
        │ Selektoren (useStore)         │ Commands (store.apply)
┌───────┴───────────────────────────────▼──────────────────────────────┐
│ state/  Zustand + Immer                                               │
│   doc (Project) ──produceWithPatches──► history (past/future)         │
│   session (Werkzeug, Auswahl, Viewport, Modus) – nicht im Undo        │
└───────▲───────────────┬───────────────────────────────▲──────────────┘
        │               │ subscribe (Referenzvergleich) │ autosave
┌───────┴──────┐ ┌──────▼──────────────────────┐ ┌──────┴──────────────┐
│ tools/       │ │ render/  PixiJS v8 (WebGL)  │ │ persistence/        │
│ Pointer →    │ │ Szenengraph je Ebene,       │ │ IndexedDB (idb),    │
│ Weltkoord.,  │ │ inkrementelle Abgleichung,  │ │ JSON-Import/-Export │
│ Snapping,    │ │ Culling, Texturen, Overlays │ └─────────────────────┘
│ Vorschau     │ └─────────────▲───────────────┘
└──────┬───────┘               │
       └──────────► core/ (rein, ohne UI/Pixi): Geometrie, Modell,
                    Katalog, Mengen, Kalibrierung  ◄── Unit-Tests
```

Grundregeln:
- `core/` ist reines TypeScript ohne Abhängigkeiten zu React, Pixi oder dem Store. Hier liegt alles, was getestet wird.
- Das Projekt ist ein JSON-Baum. Dadurch funktionieren Immer-Patches (Undo), IndexedDB und der JSON-Export ohne Mapping.
- Abgeleitete Werte (m², Umfang, Mengen, Kosten) werden nie gespeichert. Sie werden in `core/quantities` berechnet und pro Objekt-Referenz gecacht (`WeakMap`).
- Der Renderer liest den Store nur. Änderungen laufen immer über Commands.

## 2. Ordnerstruktur

```
src/
  core/
    model/        types.ts, ids.ts, defaults.ts (Ebenen, Settings), migrations.ts
    geometry/     vec.ts, polygon.ts (Fläche, Umfang, Schwerpunkt, contains, bbox)
                  bezier.ts (Auswertung, adaptive Flachlegung, Bogenlänge)
                  shape.ts (ShapeGeometry → Polygon), offset.ts (Weg mit Breite)
                  clip.ts (Vereinigen/Abziehen/Weg-Offset, Wrapper um polygon-clipping)
                  smooth.ts (Freihand: Ramer-Douglas-Peucker + Catmull-Rom → Bézier)
                  plot.ts (Grundstück aus Kantenlängen/Winkeln, Schlusskante)
                  snap.ts (Raster-, Ecken-, Kanten-, Mittelpunktfang – rein rechnerisch)
    calibration.ts  2-Punkt-Kalibrierung → metersPerPixel
    quantities/   quantities.ts (pro Objekt), summary.ts (Projekt)
    catalog/      materials.ts, plants.ts, items.ts
    sample/       mustergarten.ts (Beispielgarten „Modern & Naturnah“, 30 × 50 m, sieben Zonen);
                  lindenweg12.ts (früherer Beispielgarten, nur noch für Tests)
    format.ts     de-DE-Zahlen: „41,5 m²“, „1.246 €“, „±0,00 m“
  state/          store.ts, history.ts, commands/*.ts, selectors.ts, types.ts
  persistence/    db.ts, autosave.ts, jsonIO.ts
  render/
    PlanRenderer.ts   Pixi-Application, Abgleich Store → Szenengraph
    Viewport.ts       Welt↔Bildschirm, Zoom/Pan/Pinch, Trägheit
    SpatialIndex.ts   rbush über Objekt-Bounding-Boxes (Culling, Hit-Test, Snapping)
    layers/           PlotLayer, AreaLayer, PathLayer, PlantLayer, ItemLayer, AnnotationLayer, ShadowLayer
    symbols/          Baumkrone, Strauch, Staudengruppe, Hochbeet, Gartenhaus … (Draufsicht)
    textures/         prozedurale Kacheltexturen je Material
    overlays/         Auswahl, Griffe, Fangführungen, Bemaßungen, Raster
  tools/          Tool.ts, ToolController.ts, select/, rect/, polygon/, bezier/,
                  freehand/, path/, dimension/, text/, plant/, calibrate/
  ui/
    theme/        tokens.css (Tag/Nacht-Variablen 1:1 aus dem Design), fonts
    chrome/       TopBar, ToolRail, BottomBar, LayersPanel
    panels/       PropertiesPanel (je Objekttyp), LibraryPanel, PlantDetail
    onboarding/   NewProjectWizard (Rechteck/Polygon, Nord, Standort, Hintergrund)
    components/   GlassPanel, Segmented, Field, Slider, Toggle, Swatch …
    App.tsx
  test/           Vitest-Fixtures
```

Neben den gewünschten Ordnern `/core`, `/render`, `/tools` und `/ui` gibt es zwei weitere: `state` und `persistence`. So bleibt `core` frei von Store- und Browser-APIs und damit gut testbar.

## 3. Datenmodell

Vollständig in `src/core/model/types.ts`. Die wichtigsten Entscheidungen:

### Koordinaten
- Weltkoordinaten in **Metern** (float). x nach Osten/rechts, y nach Süden/unten (wie der Bildschirm). Der Ursprung ist Ecke A des Grundstücks.
- Das Grundstück wird achsparallel gezeichnet. Die Nordrichtung ist ein Projektwert (`site.northDeg`, im Design −12°). Der Nordpfeil dreht sich, der Plan nicht. Die Sonnenberechnung in Phase 2 rechnet `northDeg` ein.

### Projekt
```ts
Project {
  schemaVersion, id, name, createdAt, updatedAt,
  site: { plot: PlotSpec, boundary: Vec2[], northDeg, location },
  background: BackgroundImage | null,      // Bild als Blob separat in IndexedDB
  layerOrder: Id[], layers: Record<Id, Layer>,
  objects: Record<Id, PlanObject>,         // flach, normalisiert
  priceOverrides, settings: { gridStepM: 0.1|0.5|1, snapToGrid, snapToGeometry, scaleDenominator }
}
```
Objekte werden flach als `Record` gespeichert. Die Reihenfolge steht in `layer.objectOrder`. Das hält Immer-Patches klein: Wird ein Objekt verschoben, betrifft der Patch nur dieses eine Objekt.

### Grundstück (`PlotSpec`)
- `rect` {width, depth} – Onboarding „Rechteck“.
- `edges` [{length, angleDeg}] – Polygon mit exakten Kantenlängen und Innenwinkeln. Die **letzte Kante wird berechnet**, damit die Kontur schließt. Ihre Länge und ihr Winkel werden angezeigt („berechnet“). So entsteht kein überbestimmtes System.
- `drawn` [Vec2] – frei geklickt (Design 01, Punkte A–E).

Die Eingabe bleibt gespeichert, damit sie später editierbar ist. `boundary` ist das daraus berechnete Polygon.

### Hintergrund & Kalibrierung

Ausrichten an zwei Punkten (`core/calibration.ts → alignTwoPoints`): Bildpunkte a, b und Grundstücksecken A, B ergeben eine Ähnlichkeitstransformation – Maßstab |AB|/|ab|, Drehung ∠AB − ∠ab, Lage so, dass a auf A fällt. Bei genordetem Bild ist die Nordrichtung gleich der Bilddrehung. Wird die Kontur im Editor bearbeitet, wird sie als `drawn` (absolute Punkte) gespeichert, damit alle Objekte an ihrer Stelle bleiben.

`BackgroundImage { blobId, origin, metersPerPixel, rotationDeg, opacity, visible, locked, calibration: {a, b, distanceM} }`. Die beiden Punkte a und b liegen in **Bildpixeln**. Daraus folgt `metersPerPixel = distanceM / |b − a|`. So bleibt die Kalibrierung gültig, wenn das Bild verschoben wird.

### Geometrie
```ts
ShapeGeometry = RectGeometry   // parametrisch: center, width, depth, rotationDeg, cornerRadius
              | PathGeometry   // nodes: {p, in?, out?, smooth?}[], closed, source
Region = { outer: ShapeGeometry, holes: PathGeometry[] }
```
- **Ein** Pfadformat für Polygon, Bézier und Freihand: Knoten mit optionalen Griffen. Damit kann jedes Werkzeug nachträglich mit demselben Knoteneditor bearbeitet werden. `source` merkt sich nur, welches Werkzeug ihn erzeugt hat.
- Rechtecke bleiben parametrisch. So bleiben „30,00 × 50,00 m“ exakt, auch nach einer Drehung. Erst wenn ein Knoten einzeln gezogen wird, wird das Rechteck in einen Pfad umgewandelt (mit Rückfrage im UI).
- Freihand wird beim Loslassen geglättet (RDP-Vereinfachung, dann Catmull-Rom → Bézier) und als normaler Pfad gespeichert.
- Boolesche Operationen (Vereinigen/Abziehen) liefern Polygone mit Löchern (`source: 'boolean'`). Kurven werden dafür vorher fein flachgelegt.

### Objekttypen (diskriminierte Union `PlanObject`)
| type | Zweck | Geometrie | Ebene (Standard) |
|---|---|---|---|
| `area` | Rasen, Kies, Pflaster, Beet, Teich … | `Region` + `materialId` + optional Einfassung (Kantenstein, Stahl, Corten) | areas |
| `path` | Weg-Werkzeug | Mittellinie + `width` (1,20 m), Fläche per Offset | paths |
| `plant` | Baum, Strauch, Gemüse | Punkt + `speciesId` + `plantedYear` | plants |
| `planting` | Stauden in Gruppen | `Region` + Artenmix + Stück/m² | plants |
| `hedge` | Hecke | Mittellinie + Art + Höhe | plants |
| `item` | Gartenhaus, Hochbeet, Möbel … | Punkt + Drehung + reale Maße aus dem Katalog | build |
| `dimension` | Bemaßung | 2 Anker (frei oder an Objektknoten gebunden) | annotation |
| `text` | Planbeschriftung | Punkt, Größe in Weltmetern | annotation |
| `lamp` | Leuchte | Punkt (Lichterkette: Linie), Typ, Lumen, Kelvin, Abstrahlwinkel, Richtung, Zeitplan | light |
| `sprinkler` | Versenkregner | Punkt, Wurfradius, Sektor, Durchfluss, Zone | water |
| `drip` | Tropfschlauch | Linie, l/h je m, benetzte Breite, Zone | water |
| `pipe` | Leitung (Wasser/Strom) | Linie, Art, Durchmesser | pipes |
| `fixture` | Wasseranschluss, Verteiler | Punkt, Anzahl Magnetventile | water |

Alle Objekte haben die gemeinsamen Felder `layerId, name, locked, hidden, elevation, notes`. Mit Phase 2 ist `schemaVersion` 2: Das Projekt hat zusätzlich `zones` (Bewässerungszonen mit Name, Startzeit, Laufzeit). Die Migration 1 → 2 legt die vier Standardzonen an.

### Katalog (statisch, versioniert mit der App)
- `Material` – Textur-Schlüssel, Kachelgröße in m, **Verankerung** `world` (Rasen, Kies: Muster liegt fest im Raster) oder `object` (Pflaster, Dielen: Fugen bleiben kantenparallel), Abrechnungseinheit (m², m³ × Schichtdicke, Stück aus Steinformat), Preis.
- `PlantSpecies` – Ø bei Pflanzung und Endgröße, Höhe, Zuwachs pro Jahr, Standort, Jahreszeitenfarben, Jahreslauf (12 Monate, wie in der Detailkarte im Design), Preis.
- `CatalogItem` – reale Maße, Symbol, Standard-Ebene. Einige Einträge erzeugen **Flächen** statt Objekte (Terrasse → Holzfläche, Teich → Wasserfläche), damit Mengen und Kosten einheitlich berechnet werden.

Phase-1-Materialien: Rasen, Kies, Pflaster, Holz, Mulch, Rindenmulch, Erde/Beet, Wasser.

### Wachstum
`Ø(t) = Ø₀ + (Ø_end − Ø₀) · (1 − e^(−t/k))`, dieselbe Kurve wie im Design-Prototyp. `k` wird aus `growthPerYear` abgeleitet, sodass die Anfangssteigung dem Zuwachs pro Jahr entspricht: `k = (Ø_end − Ø₀) / growthPerYear`.

## 4. State, Commands, Undo/Redo

- Ein Zustand-Store mit drei Bereichen: `doc` (Projekt), `session` (Werkzeug, Auswahl, Viewport, Modus, Panels) und `history`.
- **Alle** Änderungen am Projekt laufen über `apply(label, recipe, opts)`. Intern ruft das Immers `produceWithPatches` auf und legt `{label, patches, inverse}` auf den Stack. Undo wendet die inversen Patches an, Redo die Vorwärts-Patches. Dadurch muss kein Command eine eigene Undo-Logik schreiben.
- **Zusammenfassen:** Ziehen, Slider und Tastatur-Nudges geben eine `mergeKey` mit (z. B. `gesture:<pointerId>`). Alle Änderungen einer Geste werden zu *einem* Undo-Schritt.
- Commands sind kleine, benannte Funktionen in `state/commands/` (`addObject`, `moveObjects`, `editNode`, `setMaterial`, `booleanOp`, `reorderLayer` …). Die Tests prüfen jeweils: apply → undo ergibt wieder exakt den Ausgangszustand.
- Die Sitzung ist nicht Teil des Undo. Nur die Auswahl wird beim Undo auf noch existierende IDs bereinigt.

## 5. Rendering (PixiJS v8, WebGL)

- **Szenengraph:** eine Welt-Container-Ebene pro Layer, in der Reihenfolge `layerOrder`, plus eigene Container für Hintergrundbild, Raster, Schatten und Overlays.
- **Abgleich statt Neuaufbau:** Der Renderer abonniert `doc.objects`. Dank Immers struktureller Teilung reicht ein Referenzvergleich pro Objekt. Nur geänderte Objekte bekommen neue Graphics. Unveränderte Geometrie bleibt auf der GPU.
- **Viewport:** Eine einzige Transformation (Skalierung = px/m, Translation) auf dem Welt-Container. Zoom und Pan ändern keine Objekte, deshalb kosten sie kein Neuzeichnen.
- **Culling:** Ein rbush-Index über die Objekt-Bounding-Boxes. Pro Frame mit geändertem Viewport werden nur Objekte im sichtbaren Bereich (plus Rand) auf `visible` gesetzt. Derselbe Index dient für Hit-Tests und Fang.
- **LOD:** Baumkronen haben drei Detailstufen (Lappen, Büschel, Licht/Schatten wie in `GardenPlan`), abhängig von px/m. Stauden werden bei kleinem Zoom zu einer Fläche zusammengefasst.
- **Texturen:** Sie werden beim Start prozedural per Canvas 2D erzeugt (Halmstruktur, Kieskörnung, Fugenraster, Dielen, Mulch, Wasserglanz). Farben und Muster kommen aus dem Design. Gefüllt wird mit `Graphics.fill({ texture, matrix })`. Die Matrix setzt die Verankerung um (Welt oder Objekt) und skaliert die Kachel auf ihre Größe in Metern. Externe Bilddateien und Lizenzen sind nicht nötig.
- **Schatten:** Weiche Schlagschatten auf einem eigenen Container mit `BlurFilter`, nur bei Änderungen neu berechnet. In der Planansicht mit festem Versatz wie im Design (Sonne ≈ Südost), in der Sonnen-Linse aus SunCalc für Datum, Uhrzeit, Standort und Nordrichtung. Kronen sind Zylinder vom Kronenansatz bis zur Spitze, Gebäude und Hecken extrudierte Grundrisse.
- **Zeichenraster:** nur beim Zeichnen (alle Zeichenwerkzeuge) und während einer Verschiebe-Geste sichtbar, weich ein- und ausgeblendet; beim Ansehen bleibt der Garten frei von Hilfslinien. Der Rasterfang wirkt unabhängig davon.
- **Overlays** (Auswahl, Griffe, Fangführungen, Maßlinien) werden im Bildschirmraum gezeichnet, damit sie bei jedem Zoom haarfein bleiben. Maßzahlen und Kantenlängen-Pills (Geist Mono, wie im Onboarding) sind ein schlankes DOM-Overlay über dem Canvas. Das ergibt scharfe Schrift und exakt das Design-Styling.
- **Nacht:** Licht wird additiv (Farbtemperatur → RGB) in eine RenderTexture mit halber Auflösung akkumuliert und multiplikativ über die abgedunkelte Szene gelegt. Gebäude und Hecken verdecken über eine inverse Maske; Wasser spiegelt Licht.
- **Linsen:** Jede Linse wählt, welche Ebenen gezeichnet werden (`core/lens.ts`): Bewässerung und Leitungen nur in der Bewässerungs-Linse, Leuchten in der Planansicht und bei Nacht. Wachstum und Jahreszeit fließen über einen `ViewContext` in die Symbole ein; Objekte werden nur neu gebaut, wenn sich ihr `viewKey` ändert.

Ziel: 60 fps bei über 500 Objekten. Ein Benchmark-Projekt mit 1.000 Objekten wird generiert und per Playwright-Frame-Timing gemessen.

## 6. Werkzeuge & Eingabe

```ts
interface Tool {
  id: ToolId; cursor: string;
  onPointerDown/Move/Up(e: WorldPointerEvent, ctx: ToolContext): void;
  onKeyDown?(e: KeyboardEvent, ctx): boolean;
  preview?(g: OverlayGraphics, ctx): void;   // Gummiband, Live-Maße
  cancel(): void;
}
```
- `ToolController` übersetzt Pointer-Events in Weltkoordinaten, wendet den Fang an und leitet weiter. Die Werkzeuge erzeugen erst beim Abschluss einen Command. Während des Zeichnens existiert die Geometrie nur als Vorschau.
- **Fang** (`core/geometry/snap.ts`): Prioritäten Ecke > Kantenmittelpunkt > Kante > Raster (10 cm / 50 cm / 1 m). Die Toleranz ist in Bildschirmpixeln angegeben (8 px). ⇧ rastet Winkel in 15°-Schritten ein, Alt schaltet den Fang vorübergehend aus. Die Fangführungen werden angezeigt.
- **Zahleneingabe beim Zeichnen:** Tippen während einer Kante setzt deren Länge exakt („4,5 ↵“). Das ist wichtig für Präzision ohne Maus.
- **Knotenbearbeitung:** Mit dem Auswahlwerkzeug öffnet ein Doppelklick die Knoten. Ein Klick auf eine Kante fügt einen Knoten ein, Entf löscht ihn, Alt-Ziehen löst die Griffe.
- **Weg-Werkzeug:** Die Mittellinie wird wie ein Bézier gezeichnet. Die Breite (Standard 1,20 m) lässt sich in der Eigenschaftenleiste ändern. Die Fläche entsteht als Offset der Mittellinie mit runden oder spitzen Ecken.
- **Navigation:** Mausrad zoomt zum Cursor. Bei Trackpads scrollt ein Zwei-Finger-Wischen, Pinch kommt als `ctrlKey + wheel` an und zoomt. Touch: Pinch und Pan mit zwei Pointern. Leertaste gedrückt halten = Pan.
- **Tastenkürzel:** V, R, P, B, F, W, M, T, G, L, E, Strg/⌘+Z, Strg/⌘+Y bzw. ⇧⌘Z, Entf, Pfeiltasten (Raster-Nudge), Esc, Strg+0 (Einpassen).

## 7. Persistenz

- `idb` mit drei Stores: `projects` (vollständiges Projekt), `meta` (id, name, updatedAt, Fläche, Objektzahl, vereinfachte Kontur – für die Projektliste) und `blobs` (Hintergrundbilder und Vorschaubilder `thumb:<id>`).
- **Startseite** (`ui/start/StartScreen.tsx`): erscheint sofort, ohne auf WebGL zu warten. Zeigt den zuletzt bearbeiteten Garten groß und alle weiteren als Karten mit Vorschaubild (ohne Bild: Grundstückskontur), dazu Neuer Garten, Mustergarten (gespeicherte Kopie, `gw:sampleProject`, keine Duplikate), JSON-Import und Löschen mit Rückfrage. Erreichbar über das Logo und „Alle Gärten“ im Projektmenü.
- **Vorschaubild:** `PlanRenderer.thumbnail()` rendert den Garten von oben (Sommer, ohne Hilfslinien, Beschriftung und Maße, transparenter Hintergrund) beim Verlassen des Editors, beim Verbergen der Seite und nach dem ersten Öffnen, falls noch keines existiert.
- **Laden im Hintergrund:** Während die Startseite offen ist, lädt `PlanRenderer.boot()` alle Objekt- und Bodenbilder und das Pflanzenmanifest, berechnet die Bodentexturen vor (`warmMaterialTextures`) und legt alles in kleinen Paketen auf die Grafikkarte (`upload`). Erst danach wird einmal aufgebaut (`ready`). Beim Überfahren einer Karte und für den zuletzt bearbeiteten Garten werden dessen Pflanzenbilder schon geholt (`prefetch`). `open()` wartet auf `prepare(doc)` und zwei gezeichnete Bilder und blendet die Startseite dann aus – der Garten erscheint vollständig. Neue Pflanzenbilder bauen danach nur Pflanzen neu auf (`rebuildPlants`).
- **Autosave:** 800 ms nach der letzten Änderung sowie bei `visibilitychange`. Der Status erscheint in der Topbar („Gespeichert“).
- **JSON-Export:** `{ format: 'gartenwerk', schemaVersion, project, blobs: { id: dataURL } }`. Beim Import wird mit zod validiert, dann migriert, dann bekommt das Projekt eine neue ID (Kopie statt Überschreiben).
- `migrations.ts`: Eine Kette `v1 → v2 → …` läuft beim Laden aus der DB und beim Import.

## 8. Tests (Vitest)

`core/` wird vollständig per Unit-Test abgedeckt, unter anderem:
- Fläche und Umfang (Rechteck, konkav, mit Löchern). Rechteck 30 × 50 → 1.500,0 m².
- Bézier-Flachlegung: Die Bogenlänge konvergiert. Ein Kreis aus 4 Béziers hat einen Fehler unter 0,05 %.
- Offset: Ein gerader Weg L × B hat die Fläche L·B. Am Bogen gilt: Innen- und Außenkante sind plausibel lang.
- `plot.ts`: Kanten und Winkel schließen. Die Schlusskante wird korrekt berechnet.
- Kalibrierung, Fang, Freihand-Glättung (Abweichung ≤ Toleranz).
- Mengen: Kies m³ = Fläche × Schichtdicke, Pflaster-Stückzahl = Fläche / Steinformat aufgerundet, Kantenstein = beidseitige Weglänge. Referenzwerte aus dem Design: Kiesweg 34,60 m × 1,20 m ≈ 41,5 m², Kantenstein 69,2 m.
- Undo/Redo: Für jeden Command gilt: apply → undo ist gleich dem Ausgangszustand.

## 9. Bibliotheken – Entscheidungen und Abweichungen

| Zweck | Wahl | Anmerkung |
|---|---|---|
| UI | React 19, TypeScript, Vite | wie gewünscht |
| Rendering | pixi.js 8 | WebGL, WebGPU später optional |
| State | zustand 5 + immer | Patches für Undo |
| Sonnenstand | suncalc | liefert Grad und Kompass-Azimut |
| Flächenoperationen | **polygon-clipping** | Ursprünglich war clipper2-js geplant (wegen des Offsets). In der Praxis lieferte dessen JS-Portierung gezackte Offsets und zerfallende Vereinigungen. Der Weg-Offset wird jetzt selbst gebaut (Segment-Rechtecke plus Gelenkkeile, vereinigt mit polygon-clipping), abgesichert durch einen Regressionstest. Alles ist in `clip.ts` gekapselt. |
| Fläche und Umfang | **eigene Funktionen statt turf** | turf rechnet geodätisch auf Längen- und Breitengraden. Unsere Welt ist eben und in Metern, dort ist die Gaußsche Trapezformel exakt und schneller. Die Funktionen sind getestet. |
| Räumlicher Index | rbush | Culling, Hit-Test, Fang |
| Persistenz | idb, zod | IndexedDB, Import-Validierung |
| Export | jsPDF (nachgeladen) | PNG über `renderer.extract`; PDF-Rahmen, Schrift, Legende als Vektor, Plan als Rasterbild im Maßstab |
| Tests | vitest | |

## 10. Plan für Phase 1

1. **Gerüst und core:** Vite-Projekt, Modell, Geometrie, Mengen, Tests, Beispielgarten Lindenweg 12.
2. **Renderer:** Viewport mit Zoom, Pan und Pinch, Texturen, Ebenen-Layer, Symbole, Schatten, Culling, Benchmark.
3. **Chrome-UI** pixelgenau nach Design: Topbar, Werkzeugleiste, Ebenen-Panel (sichtbar, gesperrt, Reihenfolge), Unterleiste, Eigenschaftenleiste.
4. **Werkzeuge:** Auswahl/Verschieben, Rechteck, Polygon, Weg, Bézier, Freihand, Knotenbearbeitung, Fang, Bemaßung, Text, Undo/Redo.
5. **Onboarding:** Rechteck oder Polygon mit Kanten und Winkeln, Nordrichtung, Standort, Hintergrundbild mit 2-Punkt-Kalibrierung und Deckkraft.
6. **Bibliothek** mit Drag & Drop (Pflanzen, Objekte mit realen Maßen).
7. **Persistenz:** Projektliste, Autosave, JSON-Import/-Export.

In Phase 1 waren die Linsen-Tabs sichtbar, aber deaktiviert. Seit Phase 2 sind sie alle aktiv.

## 11. Entschieden

1. **Export:** PNG kommt in Phase 1, der PDF-Architektenplan mit Titelblock, Legende, Maßstab und Nordpfeil in Phase 2.
2. **Mulch und Rindenmulch** sind zwei Materialien: „Mulch“ als Holzhäcksel (Design-Farbe #6E533F) und „Rindenmulch“ mit dunklerer, gröberer Textur.

## 12. Phase 2

| Funktion | Kern (`core/`) | Darstellung und UI |
|---|---|---|
| 9 Nachtmodus | `lighting.ts` (Szenen, Zeitpläne, Leistung und Stromkosten pro Abend), `catalog/lamps.ts` (7 Typen, Kelvin → RGB, Reichweite) | `render/effects/NightLayer.ts`, `ui/lenses/NightPanel.tsx`, `ui/panels/TechProps.tsx` (Typ, Lumen, Kelvin, Winkel, Richtung, Zeitplan) |
| 10 Sonne und Schatten | `sun/sun.ts` (SunCalc, Ortszeit, Sonnenvektor), `sun/shadows.ts` (Schattenpolygone, Heatmap per Scanline), `sun/recommend.ts` | `render/effects/ShadowLayer.ts`, `HeatLayer.ts`, `ui/lenses/SunLens.tsx` |
| 11 Wachstum und Jahreszeiten | `growth.ts` (Kronen-Ø, Höhe, Farben, Blüte, Kahlheit), `growthReport.ts` (Entwicklung, Konflikte mit Wegen/Bauten/Grenze, Jahreszeiten-Text) | `ui/lenses/GrowthLens.tsx`, `SeasonsView.tsx` (vier Offscreen-Renderings) |
| 12 Bewässerung | `irrigation.ts` (Zielflächen, Überdeckung mit Lücken, Zonen, Bedarf), `irrigationLayout.ts` (Regner Kopf an Kopf, Sektoren nach innen, Tropfschlauch-Mäander) | `render/effects/GapLayer.ts`, `ui/lenses/IrrigationPanel.tsx` |
| 13 Material und Kosten | `quantities/costReport.ts` (Gruppen, netto/brutto, Kennzahlen, CSV) | `ui/lenses/CostsView.tsx` (Preise editierbar, Einkaufsliste) |
| Architektenplan | `export/sheet.ts` (Papier, Normmaßstab, Legende, Pflanzenliste) | `ui/export/pdf.ts`, `ExportDialog.tsx` |

- Automatisch geplante Regner und Schläuche ersetzen die vorhandenen in der Fläche in **einem** Undo-Schritt (`cmd.replaceObjects`).
- Die Heatmap rechnet in einem Raster von 1 m (Linse) bzw. 0,5 m mit 20- bis 30-Minuten-Schritten und wird entprellt neu berechnet.
- Hochbeete werfen Schatten, ihre eigene Oberseite liegt aber in der Sonne.

## 13. Grafik B, Spalier, Pinsel, Einsehbarkeit (Schema 3)

- **Modell:** neue Objekttypen `espalier` (Pflanzlinie, Art, Abstand, Stammhöhe, Oberkante, Schirmtiefe, Form) und `scatter` (Pflanzgruppe: Liste aus Art + Position); `Project.observers` für Blickpunkte. Migration 2 → 3 ergänzt `observers: []`.
- **Kern:** `core/espalier.ts` (Stammpositionen, Grundriss, Blickdichte je Jahreszeit, Pinseltupfer mit Poisson-Scheiben-Abstand, Radierer), `core/privacy.ts` (Hindernisraster mit Höhenbereichen, Sichtlinien in 2,5D, Anteil einsehbarer Fläche), Schattenwerfer `raised` für schwebende Schirme.
- **Darstellung:** `render/symbols/foliage.ts` malt Kronen aus beleuchteten Laubballen, Astgerüste, Polster, Grashorste und Spalierschirme mit Canvas 2D; `plantSprites.ts` setzt sie als Sprites. Texturen werden je Art/Jahreszeit/Größenstufe/Variante zwischengespeichert. `effects/PrivacyLayer.ts` zeigt die Einsehbarkeit.
- **Werkzeuge:** `espalier` (Linienwerkzeug), `brush` (Pinsel, Alt = Radierer, Befehl `eraseScatter` mit mergeKey als ein Schritt), `observer` (Blickpunkte setzen und ziehen).

## 14. Gebäude/Möbel im Stil B und Schrägansicht

- **Gebäude und Möbel:** `render/symbols/itemPaint.ts` malt jedes Katalogsymbol (Walm- und Satteldächer mit Ziegeln, Solarmodulen, Graten; Holz mit Maserung und Fugen; Glas, Erde, Gemüse, Polster, Wasser) einmal je Maß und Variante; `items.ts` setzt es als Sprite.
- **Schrägansicht:** fester Kippwinkel `OBLIQUE_TILT_DEG = 35°` aus der Senkrechten, gespeichert als `viewport.tiltDeg` in der Sitzung (nicht im Projekt). Parallelprojektion: Der Welt-Container staucht y um cos 35°, ein Punkt in Höhe z liegt z · tan 35° Meter weiter oben. `worldToScreen`/`screenToWorld`/`zoomAt`/`panBy`/`fitBBox` rechnen auf der Bodenebene, Auswahl und Bemaßung bleiben deshalb deckungsgleich mit dem Boden.
- **Körper:** `render/views/obliqueView.ts` baut für Gebäude (Wände mit Fenstern, Dach als `MeshSimple` mit der Draufsicht-Textur, Ecken auf Trauf- und Firsthöhe), Tonnen/Kübel (Zylinder), Tische/Liegen (Platte auf Beinen), Bäume (Stamm, Krone als Ellipsoid gestreckt), Sträucher, Hecken und Spaliere (Laubwände aus nahtloser Kachel). Sichtbar sind nur Wände mit Außennormale zur Kamera. Alle Körper liegen in einem gemeinsamen Container `solids` über den Ebenen und werden nach Tiefe (vorderstes y) sortiert; flache Objekte bleiben in ihren Ebenen.
- **Nur Anzeige:** `setSession` schaltet beim Wechsel auf ein Zeichenwerkzeug zurück in die Draufsicht und beim Einschalten der Schrägansicht auf die Auswahl. Exporte (PNG, PDF, Jahreszeiten-Vorschau) rendern immer die Draufsicht.

## 15. Ebenen wie in Photoshop

- **Modell:** `LayerKind` um `custom` erweitert, `Layer.opacity` optional (ohne Migration, fehlt = 1). In eigenen Ebenen entscheidet bei Linsen die Objektart (`lensShowsObject`).
- **Commands:** `addLayer`, `renameLayer`, `setLayerOpacity` (mergeKey je Geste), `deleteLayer` (nur `custom`, mit Inhalt), `moveObject(id, layerId, index)` für Ziehen innerhalb und zwischen Ebenen. `addObject` legt neue Objekte in die aktive eigene Ebene, sonst nach Art.
- **Darstellung:** Deckkraft wirkt als Alpha des Ebenen-Containers (multipliziert mit der Abblendung der Bewässerungs-Linse).
- **Sichtschutz-Linse:** `LensTab` `privacy`; das Einsehbarkeits-Overlay erscheint nur in dieser Linse (`session.privacy.on` ist nicht mehr nötig), Pflanzen zeigen die dort gewählte Jahreszeit. Rechte Leiste: `PrivacyDock`, bei Auswahl die Eigenschaften.

## 16. Assets aus Blender

- **Pipeline:** `assets/blender/` (bpy 5.2 ohne Oberfläche): Generatoren je Katalogsymbol, Cycles, orthografische Kamera für Draufsicht und 35°-Schrägansicht, vier Drehungen; WebP + `manifest.json` nach `public/assets/items/`. Licht aus derselben Richtung wie die App-Schatten, kein Boden.
- **App:** `render/assets/itemAssets.ts` lädt Manifest und Bilder im Hintergrund und baut danach neu auf. `itemSprite` (Draufsicht) und die Schrägansicht (`obliqueView`) bevorzugen die Bilder; der Ankerpunkt im Manifest ist der Bodenursprung, in der Schrägansicht wird y durch cos(Kippwinkel) geteilt, weil die Welt gestaucht ist. Ohne Manifest bleibt die gemalte Darstellung aus `itemPaint.ts`.

## 17. Pflanzen aus Blender, natürlicherer Look

- **Look:** warme Sonne, Himmel als Aufhellung, unsichtbarer Licht-Boden (Rückstrahlung, dunkle Fußpunkte), Umgebungsverdeckung in allen Materialien, warmes Anthrazit, Holz mit Brettfugen, Freestyle-Konturen nur an harten Objekten (Sammlung `outline`).
- **Pflanzen:** `assets/blender/plants.py` + `render_plants.py`; Looks je Jahreszeit aus `render/assets/plantLooks.ts` (Export `npm run assets:looks`). Manifest `public/assets/plants/manifest.json` mit Bezugsmaß (Durchmesser bzw. Spalierschirm), Höhe, ppm, Ankern.
- **Böden:** `assets/blender/ground.py` + `render_ground.py` → nahtlose Kacheln je `Material.texture` und freigestellte Trittplatten in `public/assets/ground/`. `render/assets/groundAssets.ts` lädt sie beim Start; `materialTextures.tile()` nimmt das Bild, sonst die prozedurale Kachel. Wildwiese bekommt wie Rasen eine großflächige Überlagerung (`meadowMacroPattern`), Wege aus Material `stepping` zeichnen einzelne Platten im Schrittmaß entlang der Mittellinie statt einer Füllung.
- **Natürliche Beläge:** Organische Beläge (Rasen, Wiese, Kies, Basalt, Häcksel, Rinde, Erde, Sand) werden beim Laden einmal „gebombt“ (`materialTextures.bomb`): Die kleine Kachel wird mit weich maskierten, versetzten Ausschnitten aus der Grundkachel und ihren Blender-Varianten überdeckt – Raster weg, Wiederholung erst nach ≥ 8 m. Darüber liegt je Belag eine großflächige Variation (`macroPattern`: Verschmutzung, Abnutzung, Moos), dazu einmalige Details (`views/surfaceDetail.ts`: Klee, trockene Stellen, Gänseblümchen, Laub, größere Steine) und ausgefranste Ränder (`fringe`).
- **Kanten:** `render/effects/EdgeLayer.ts` legt entlang jeder Rasenkante einen in Blender gerenderten Halmstreifen (`edge_grass.webp`) als eigenes Mesh, darunter einen weichen Kontaktschatten. Wo eine Fläche oder ein Beet auf dem Rasen liegt, hängen die Halme von außen hinein (Beetkanten liegen in `bedContainer` über dem Mulch, unter Sträuchern und Kronen). Wo eine Einfassung liegt, wächst kein Gras: Kantenstein, Stahl und Corten (`EDGING_STRIP`) sind gerenderte Bänder mit Schlagschatten; gemalt wird nur noch, bis die Bilder geladen sind.
- **Streuung:** Kiesel, Basaltsplitt, Rindenstücke und Laub (im Herbst mehr) wandern über die Kanten nicht eingefasster Flächen und Beete – zum Rasen und zwischen Kies, Platten und Beeten (`spillOf`).
- **App:** `render/assets/plantAssets.ts` lädt Bilder bei Bedarf (gebündelter Neuaufbau nach dem Laden), `exportPng` lädt vorher alle Bilder der Export-Jahreszeit. Genutzt in Einzelpflanzen, Pflanzungen, Pflanzgruppen, Hecken, Spalieren und in der Schrägansicht (Stamm + Krone als ein Bild); ohne Bild bleibt `foliage.ts`.

