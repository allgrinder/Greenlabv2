# Gartenwerk – Entwicklung

## Befehle

| Befehl | Zweck |
|---|---|
| `npm install` | Abhängigkeiten installieren |
| `npm run dev` | Dev-Server auf http://localhost:5173 |
| `npm test` | Unit-Tests (Vitest): Geometrie, Mengen, Undo/Redo, JSON-Import |
| `npm run typecheck` | TypeScript strikt prüfen |
| `npm run build` | Produktions-Build nach `dist/` (statisch hostbar) |
| `npm run e2e` | Browser-Smoke-Test der Kernabläufe (Dev-Server muss laufen; Chromium über `PLAYWRIGHT_CHROMIUM`) |

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

## Bekannte Grenzen

- Nachtmodus, Sonne/Schatten nach Datum, Wachstum, Jahreszeiten, Bewässerung, Kostenübersicht und PDF-Export folgen in Phase 2. Die Tabs und Schalter dafür sind sichtbar, aber deaktiviert.
- PDF-Lagepläne müssen vorher als Bild exportiert werden (PNG, JPEG oder WebP).
- Die Standortsuche hat kein Geocoding. Breite und Länge kommen aus der Browser-Ortung, ohne Ortung gilt der Vorgabewert Frankfurt.
- Das Bundle ist ungeteilt (~250 kB gzip). Code-Splitting lohnt sich, sobald Phase 2 hinzukommt.
