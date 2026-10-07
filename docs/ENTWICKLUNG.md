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

## Bekannte Grenzen

- Im PDF ist der Plan selbst ein Rasterbild (150 oder 300 dpi, im exakten Maßstab); Rahmen, Schrift, Legende, Maßstab und Nordpfeil sind Vektoren. Die Texturen, Schatten und Lichteffekte stammen aus dem WebGL-Renderer.
- Der Architektenplan zeigt die Planansicht ohne Bewässerung. Einen eigenen Bewässerungsplan gibt es als PNG aus der Bewässerungs-Linse noch nicht.
- Anschlussdruck und maximaler Durchfluss sind feste Annahmen (3,5 bar, 30 l/min je Zone), Strompreis 0,35 €/kWh.
- PDF-Lagepläne müssen vorher als Bild exportiert werden (PNG, JPEG oder WebP).
- Die Standortsuche hat kein Geocoding. Breite und Länge kommen aus der Browser-Ortung, ohne Ortung gilt der Vorgabewert Frankfurt.
- Das Haupt-Bundle hat rund 290 kB gzip; jsPDF (≈130 kB gzip) wird erst beim ersten PDF-Export nachgeladen.
