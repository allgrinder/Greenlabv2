# Gartenwerk

Gartenplaner im Browser: Grundstück aus einem Lageplan übernehmen, Flächen, Wege, Beete, Pflanzen und Ausstattung einzeichnen und den Garten in fotorealistischer Draufsicht oder Schrägansicht ansehen. Dazu kommen Linsen für Sonne und Schatten, Wachstum über die Jahre, Jahreszeiten, Bewässerung, Licht bei Nacht, Sichtschutz und Kosten, außerdem ein PDF-Architektenplan.

Online: https://allgrinder.github.io/Greenlabv2/

## Schnellstart

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Unit-Tests (Vitest)
npm run e2e        # Browser-Smoke-Test, Dev-Server muss laufen
npm run build      # statischer Build nach dist/
```

Gärten werden nur im Browser gespeichert (IndexedDB). „Alle Gärten sichern“ auf der Startseite lädt eine Sicherungsdatei herunter.

## Aufbau

| Ordner | Inhalt |
|---|---|
| `src/core` | Datenmodell, Geometrie, Katalog (Pflanzen, Materialien, Objekte), Berechnungen (Sonne, Wachstum, Bewässerung, Kosten); ohne Abhängigkeit zu Browser oder Pixi |
| `src/state` | Zustand-Store, Befehle, Undo/Redo |
| `src/render` | PixiJS-Renderer: Abgleich Store → Szene, Ansichten je Objekt, Texturen, Effekte (Schatten, Kanten, Nacht) |
| `src/tools` | Zeichen- und Bearbeitungswerkzeuge |
| `src/ui` | React-Oberfläche: Startseite, Assistent, Leisten, Linsen, Export |
| `src/persistence` | IndexedDB, Autosave, JSON-Import/-Export, Sicherung |
| `assets/blender` | Python-Skripte, die Böden, Objekte und Pflanzen in Blender modellieren und rendern (Ausgabe in `public/assets/`) |
| `e2e` | Playwright-Smoke-Test |

## Doku

- [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md): Architektur, Datenmodell, Renderer
- [docs/ENTWICKLUNG.md](docs/ENTWICKLUNG.md): Befehle, Bedienung, bekannte Grenzen
- [assets/blender/README.md](assets/blender/README.md): Assets neu rendern

Jeder Push auf `main` veröffentlicht die Seite über GitHub Pages (`.github/workflows/pages.yml`).
