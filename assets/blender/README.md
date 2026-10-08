# Blender-Assets

Die Objekte der Bibliothek (Gebäude, Möbel, Ausstattung) werden mit Blender gerendert, nicht gezeichnet.
Stil: modern, grau und anthrazit.

## Rendern

```bash
python3.13 -m venv .venv-blender
.venv-blender/bin/pip install bpy==5.2.2 pillow
.venv-blender/bin/python assets/blender/render_items.py            # alle Objekte, volle Qualität (~30 min)
.venv-blender/bin/python assets/blender/render_items.py --only table,lounger
.venv-blender/bin/python assets/blender/render_items.py --quick --out /tmp/probe   # schnelle Vorschau
```

Ergebnis: `public/assets/items/<symbol>_<top|oblique>_<0|90|180|270>.webp` und `manifest.json`.
Die App lädt das Manifest beim Start; fehlt es, bleibt die gemalte Darstellung.

## Aufbau

- `lib.py` – Szene (Cycles, Sonne von oben links wie in der App, kein Boden, kein Schlagschatten),
  Materialbibliothek (anthrazit, Beton, Stoff, Holz grau, Glas, Wasser …), Geometrie-Helfer,
  Kamera (Draufsicht und 35°-Schrägansicht, Bildausschnitt = Hülle + Rand).
- `items.py` – ein Generator je Katalogsymbol, Maße in Plan-Metern (`P(x, y, z)`).
- `render_items.py` – liest die Maße aus `src/core/catalog/items.ts`, rendert vier Drehungen je Ansicht.

## Neues Objekt

1. Eintrag im Katalog (`src/core/catalog/items.ts`) mit neuem `symbol`.
2. Generator in `items.py` schreiben und in `GENERATORS` eintragen.
3. `render_items.py --only <symbol>` ausführen.

Schatten wirft die App selbst (Sonnenstand); die Bilder haben deshalb keinen Schlagschatten.
