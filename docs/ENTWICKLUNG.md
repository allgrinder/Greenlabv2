# Gartenwerk – Entwicklung

## Befehle

| Befehl | Zweck |
|---|---|
| `npm install` | Abhängigkeiten installieren |
| `npm run dev` | Dev-Server auf http://localhost:5173 |
| `npm test` | Unit-Tests (Vitest): Geometrie, Mengen, Undo/Redo, JSON-Import, Sonne, Schatten, Wachstum, Bewässerung, Licht, Kosten, Blattaufteilung |
| `npm run typecheck` | TypeScript strikt prüfen |
| `npm run build` | Produktions-Build nach `dist/` (statisch hostbar) |
| `npm run e2e` | Browser-Smoke-Test der Kernabläufe aus Phase 1 und 2 (Dev-Server muss laufen; Chromium über `PLAYWRIGHT_CHROMIUM`, andere Adresse über `GW_URL`) |

## Nützliche URLs

- `/?bench=1000` lädt ein Benchmark-Projekt mit 1.000 Objekten. Frame-Zeiten stehen in der Konsole unter `__gw.renderer.frameTimes` (nur im Dev-Modus).
- Im Dev-Modus sind `window.__gw` (Renderer und Store) und `window.__gwTools` verfügbar.

## Stand Phase 1

Umgesetzt sind alle acht Kernfunktionen der Phase 1 sowie PNG-Export (siehe `ARCHITEKTUR.md`):

1. Projekt anlegen: Rechteck oder Polygon mit Kantenlängen und Innenwinkeln, Nordrichtung, Standort
2. Hintergrundbild mit 2-Punkt-Kalibrierung und Deckkraft (im Onboarding und später im Projekt)
3. Weltkoordinaten in Metern; Zoom und Pan per Mausrad, Trackpad, Touch-Pinch und Leertaste; Raster 10 cm / 50 cm / 1 m; Fang auf Ecken, Kantenmitten und Kanten
4. Werkzeuge Rechteck, Polygon, Bézier, Freihand (geglättet) und Weg mit Breite; Punkte und Griffe nachträglich bearbeitbar
5. Kachelbare Materialtexturen: Rasen, Kies, Pflaster, Holz, Mulch, Rindenmulch, Erde/Beet, Wasser
6. Live-Anzeige von Fläche, Umfang und Länge, Bemaßungslinien
7. Ebenen: sichtbar, gesperrt, Reihenfolge
8. Bibliothek mit Drag & Drop: Pflanzen mit Endgröße und Zuwachs, Objekte mit realen Maßen

**Tastenkürzel:** V Auswahl · R Rechteck · P Polygon · B Bézier · F Freihand · W Weg · M Bemaßung · T Text · G Pflanze · L Bibliothek · E Ebenen · Strg+Z / Strg+Y bzw. ⇧Strg+Z · Strg+D duplizieren · Strg+A alles · Strg+0 einpassen · Entf löschen · Pfeiltasten verschieben (⇧ = 1 m) · Leertaste halten = verschieben der Ansicht · Esc abbrechen

**Beim Zeichnen:** Zahl tippen + ↵ setzt den nächsten Punkt in exakter Entfernung. Liegt die Mausrichtung bis zu 3° neben einem Vielfachen von 15°, rastet sie dort ein. ⇧ rastet den Winkel immer ein, Alt schaltet den Fang ab. Rücktaste nimmt den letzten Punkt zurück.

**Auswahl:** Doppelklick oder Alt-Klick auf eine Kante fügt einen Punkt ein. Alt-Ziehen an einem Griff löst die Kopplung der beiden Griffe.

## Stand Phase 2

9. **Nacht:** Schalter „Nacht“ unten. Lichtszenen (Ankommen, Abendessen, Spätabend, Alle an) oder Zeitpläne je Leuchte, Uhrzeit-Regler, Gesamtleistung und Stromkosten pro Abend. Leuchten aus der Bibliothek (Abschnitt „Licht“) mit Lumen, Kelvin, Abstrahlwinkel, Richtung und Zeitplan. Gebäude und Hecken verdecken das Licht, Wasser spiegelt es.
10. **Sonne:** Tab „Sonne“. Uhrzeit über der Höhenkurve ziehen (←/→ in Viertelstunden), Datum wählen. Schatten aus Standort und Nordrichtung, Heatmap der Sonnenstunden mit Pflanzempfehlungen.
11. **Wachstum und Jahreszeiten:** Zeitreise 0–20 Jahre mit Entwicklung je Gehölz und Hinweis, wann Kronen an Wege, Bauten oder die Grenze heranwachsen. Jahreszeiten als Vergleich 4× oder einzeln groß.
12. **Bewässerung:** Regner (Wurfradius, Sektor, Durchfluss), Tropfschlauch, Leitungen, Verteiler und Anschluss aus der Bibliothek. Zonen mit Name, Startzeit und Laufzeit bearbeitbar. Unbewässerte Flächen sind rot schraffiert. „Regner verteilen“ und „Tropfschlauch verlegen“ planen ausgewählte Flächen automatisch.
13. **Kosten:** Tab „Kosten“. Nach Bereich, nach Material oder als Einkaufsliste; Einzelpreise anklicken und ändern (gilt nur für das Projekt, ↺ stellt den Katalogpreis wieder her). Export als CSV (Excel, deutsches Format) oder PDF.

**Export:** PDF als Architektenplan (A4 bis A1 quer, Normmaßstab passend zum Blatt, Darstellung Tag/Nacht/Strich, Legende, Maßstabsleiste, Nordpfeil, Titelblock, optional Pflanzenliste als Blatt 2) oder PNG im Maßstab.

## Grundstück und Hintergrund

- **Kontur:** Im Assistenten Punkte direkt in der Vorschau ziehen (ein Rechteck wird dabei zum Polygon); Doppelklick auf eine Kante fügt einen Punkt ein, Doppelklick auf einen Punkt entfernt ihn. Die Kantentabelle rechnet live mit. Im Editor: Grundstück-Panel → „Kontur bearbeiten“ (Ziehen mit Fang, Doppelklick, Entf, Esc).
- **Bild ausrichten:** Zwei Punkte im Bild anklicken und den passenden Grundstücksecken zuordnen. Maßstab, Drehung und Lage werden daraus berechnet; bei genordetem Bild auch die Nordrichtung. Danach lässt sich das Bild ziehen (Assistent) bzw. mit „Verschieben“ und den Pfeiltasten nachjustieren (10 cm, ⇧ 1 m). „Nur Maßstab“ kalibriert wie bisher über eine bekannte Strecke.
- **Standort:** Für Sonne und Schatten zählen nur Breitengrad und Zeitzone, daher genügt eine Stadt aus der Liste (Deutschland, Österreich, Schweiz) oder die Ortung. Die Adresse ist reiner Text für Titelblock und Anzeige. Es wird kein externer Dienst abgefragt.

## Grafik, Spalier, Pinsel, Einsehbarkeit

- **Darstellung (Stil B, fotorealistisch):** Bäume, Sträucher, Hecken, Spaliere und Stauden werden je Art, Jahreszeit und Größenstufe einmal als Bild gemalt (`render/symbols/foliage.ts`) und als Sprites gezeichnet. Bodenbeläge sind nahtlos kachelbare, prozedurale Foto-Texturen (`render/textures/materialTextures.ts`). In der Pflanzenebene liegen niedrige Pflanzen immer unter Hecken, Spalieren und Kronen.
- **Spalierbäume:** Bibliothek → „Spalierbäume · Sichtschutz“, Pflanzlinie klicken, ↵ beendet. Bäume im Abstand (Standard 1,5 m), Stammhöhe, Oberkante und Schirmtiefe einstellbar; Dachspalier (Platane) mit breitem, niedrigem Schirm. Schatten beginnt erst in Stammhöhe; Kosten je Baum.
- **Pflanzpinsel:** Bibliothek → „Stauden & Gräser“ → „Pinsel“. Stauden und Gräser anklicken stellt die Mischung zusammen; Radius und Dichte rechts, `[` `]` ändern die Größe, Alt radiert. Jeder Strich wird eine Pflanzgruppe (ein Objekt, ein Rückgängig-Schritt); der Abstand richtet sich nach der Endgröße, vorhandene Pflanzen werden respektiert.
- **Einsehbarkeit:** eigener Reiter „Sichtschutz“ oben (oder Grundstück-Panel → „Einsehbarkeit prüfen“). Bei Auswahl zeigt die rechte Leiste die Eigenschaften, z. B. um Heckenhöhen anzupassen; das Ergebnis rechnet sofort neu. Blickpunkte setzen (Nachbarfenster, Straße) mit Augenhöhe; Person sitzend, stehend oder liegend; Sommer oder Winter. Rot = einsehbar, grün = geschützt, dazu der Anteil für den Garten und die Sitzplätze. Berücksichtigt Haus, Hecken, Spalierschirme ab Stammhöhe und Baumkronen mit jahreszeitlicher Blickdichte.

## Gebäude, Möbel und Schrägansicht

- **Gebäude und Möbel** (Wohnhaus, Gartenhaus, Gewächshaus, Kompost, Regentonne, Hochbeet, Tisch, Liege, Kübel, Pool, Spielturm, Zaun, Kantenstein) sind im selben fotorealistischen Stil gemalt wie die Pflanzen.
- **Schrägansicht:** Unterleiste → „Schräg“. Fester Blick von Süden (unten im Plan), 35° aus der Senkrechten. Häuser zeigen Fassade mit Fenstern und Dach, Bäume Stamm und Krone, Hecken und Spaliere ihre Laubwand. Zoomen, Verschieben, Auswählen und alle Linsen funktionieren; sobald ein Zeichenwerkzeug gewählt wird, springt die Ansicht zurück auf „Plan“. Exporte sind immer Draufsicht.

## Ebenen

- **Wie in Photoshop:** oben im Panel = oben im Plan. „+“ legt eine eigene Ebene über der aktiven an (Doppelklick auf den Namen benennt um). Ist eine eigene Ebene aktiv, landen neue Objekte dort; „automatisch“ bzw. erneutes Anklicken schaltet zurück auf die Ablage nach Art.
- Pfeil vor der Ebene klappt die Objektliste auf (Klick wählt aus, Umschalt-Klick ergänzt). Objekte per Ziehen umsortieren oder auf eine andere Ebene ziehen, Ebenen per Ziehen umsortieren – z. B. „Neue Wege“ über „Wege“.
- Deckkraft je Ebene unten im Panel; eigene Ebenen lassen sich samt Inhalt löschen (Rückfrage, rückgängig machbar). Die Grundebenen (Flächen, Wege, Pflanzen …) bleiben, weil die Werkzeuge sie als Ziel brauchen. In der Pflanzen-Ebene ordnen sich Pflanzen zusätzlich nach Höhe.

## Objekte aus Blender

- Gebäude, Möbel und Ausstattung sind in Blender modelliert und gerendert (modern, grau/anthrazit): Draufsicht und Schrägansicht in vier Drehungen, ohne Schlagschatten (den wirft die App). Skripte und Anleitung: `assets/blender/README.md`.
- Bodenbeläge (Kies, Platten, Holzdeck, Häcksel, Rinde, Erde, Sand, Wildwiese, Großformatplatten, Basaltsplitt, Trittplatten) sind in Blender Stück für Stück modelliert und als nahtlose Kacheln gerendert.
- Basalt für Beete: Basaltsplitt als Abdeckung jeder Pflanzfläche wählbar (Eigenschaften → Abdeckung), dazu Basalt-Findlinge und Basaltstelen im Katalog.
- Beispielgarten ist der „Mustergarten Modern & Naturnah“ (30 × 50 m, sieben Zonen: Eingang, Spiel, Rasen, Hochbeete, Pavillon, Naturwiese mit Homeoffice-Pod, Feuerstelle).
- Auch alle Pflanzen kommen aus Blender: 40 Arten in ihren Jahreszeiten (Blüte, Frucht, Herbstfarbe, kahler Winter), Bäume und Sträucher zusätzlich schräg. Die Bilder laden erst, wenn sie gebraucht werden; bis dahin steht die gemalte Version da.
- Gedrehte Objekte nutzen die nächste vorgerenderte Drehung; der Rest wird in der Draufsicht gedreht, in der Schrägansicht nicht. Abweichende Maße strecken das Bild.

## Bekannte Grenzen

- Im PDF ist der Plan selbst ein Rasterbild (150 oder 300 dpi, im exakten Maßstab); Rahmen, Schrift, Legende, Maßstab und Nordpfeil sind Vektoren. Die Texturen, Schatten und Lichteffekte stammen aus dem WebGL-Renderer.
- Der Architektenplan zeigt die Planansicht ohne Bewässerung. Einen eigenen Bewässerungsplan gibt es als PNG aus der Bewässerungs-Linse noch nicht.
- Echte Foto-Texturen (CC0) ließen sich im Container nicht laden; Rasen, Kies, Pflaster, Holz und Mulch sind prozedural erzeugt.
- In der Schrägansicht werden Körper je Objekt nach Tiefe sortiert; bei langen Hecken neben Bäumen kann die Überdeckung an einzelnen Stellen falsch herum sein. Der Spielturm ist eine Platte ohne aufrechte Pfosten.
- Die Einsehbarkeit rechnet in 2,5D mit Höhenbereichen je 0,5-m-Rasterzelle, ohne Gelände und ohne Zäune unter 30 cm.
- Anschlussdruck und maximaler Durchfluss sind feste Annahmen (3,5 bar, 30 l/min je Zone), Strompreis 0,35 €/kWh.
- PDF-Lagepläne müssen vorher als Bild exportiert werden (PNG, JPEG oder WebP).
- Die Standortsuche hat kein Geocoding. Breite und Länge kommen aus der Browser-Ortung, ohne Ortung gilt der Vorgabewert Frankfurt.
- Das Haupt-Bundle hat rund 290 kB gzip; jsPDF (≈130 kB gzip) wird erst beim ersten PDF-Export nachgeladen.
