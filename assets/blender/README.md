# Blender-Assets

Objekte (Gebäude, Möbel, Ausstattung) und alle Pflanzen werden mit Blender gerendert.
Stil: modern, grau und anthrazit; warmes Sonnenlicht, Umgebungsverdeckung, feine Konturen an harten Objekten.

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

## Pflanzen

```bash
npm run assets:looks                                              # Katalog + Looks je Jahreszeit → assets/blender/plants.json
.venv-blender/bin/python assets/blender/render_plants.py          # alle Arten (mehrere Stunden, setzt bei Abbruch fort)
.venv-blender/bin/python assets/blender/render_plants.py --only tilia-cordata,buxus --force
.venv-blender/bin/python assets/blender/render_plants.py --quick --out /tmp/probe  # Vorschau aller Arten in Minuten
```

- `plants.py`: Bäume (Stamm → Gerüstäste → Seitenäste → Zweigspitzen; Laub als Blattzweige in Laubmassen,
  per Punktwolke verteilt: außen dichter, fransiger Rand, Lücken, Lichtdurchlass), freie Sträucher ebenso,
  Sträucher/Hecke, Spalierschirme, Stauden (Polster + Ähren, Margeriten, Schalen, Dolden, Kugeln),
  Gräser (Halmbögen + Blütenstände), Gemüse. Parameter je Art in `TREES`, `SHRUBS`, `PERENNIALS`, `GRASSES`.
- Looks (Laubfarbe, kahl, Blüte, Frucht) kommen aus `src/render/assets/plantLooks.ts` – dieselbe Funktion nutzt die App,
  um das passende Bild zu finden. Gleiche Looks mehrerer Jahreszeiten werden nur einmal gerendert.
- Ergebnis: `public/assets/plants/<art>_<look>_<variante>_<top|oblique>.webp` + `manifest.json`.
  Die App lädt das Manifest beim Start und die Bilder erst, wenn eine Art in einer Jahreszeit sichtbar wird.

## Bodenbeläge

```bash
.venv-blender/bin/python assets/blender/render_ground.py                 # alle Kacheln + Trittplatten (~5 min)
.venv-blender/bin/python assets/blender/render_ground.py --only meadow
.venv-blender/bin/python assets/blender/render_ground.py --quick --out /tmp/probe
```

- `ground.py`: jeder Belag ist echt modelliert – Kiesel, Platten mit Fugen und Fase, Dielen mit versetzten Stößen
  und Schrauben, Häcksel, Rinde, Erde, Sand, Wildwiese (Grasbüschel + Blütennester), Großformatplatten, Basaltsplitt (kantig gebrochen, flach schattiert).
- Nahtlos: Ein Muster deckt genau eine Kachel ab; Elemente am Rand werden um ± Kachelgröße dupliziert (`tiled()`).
  Nichts darf doppelt übereinander liegen – sonst flackern Flächen schwarz oder bekommen schräge Schattenstreifen.
- `EDGE`/`grass_edge`: nahtloser Halmstreifen (2 × 0,4 m, freigestellt) für Rasenkanten – Büschel mit Lücken, Halme überwiegend nach außen.
- Einfassungen als Kantenstreifen: `kantenstein` (8 cm Beton, Fugen alle 1 m), `steel` (anthrazit, 25 mm Abkantung mit Lichtkante) und `corten` – je `edge_<schlüssel>.webp`.
- `SCATTER`: freigestellte Streuteile (`pebble`, `basalt`, `bark`, `leaf`), die die App über Beet- und Belagskanten verteilt (`scatter_<art>_<n>.webp`, Größe in m im Manifest).
- `VARIANTS`: Für organische Beläge (Kies, Basalt, Häcksel, Rinde, Erde, Sand, Wiese) gibt es zusätzliche Kacheln mit anderem Zufallswert (`<schlüssel>_v<n>.webp`). Die App mischt sie beim Aufbrechen der Kachel.
  `python assets/blender/render_ground.py --no-base --variants 2 --only gravel,basalt,…` rendert nur die Varianten; `--only edges` bzw. `--only scatter` nur Kanten bzw. Streuteile.
- Ergebnis: `public/assets/ground/<schlüssel>.webp` (Schlüssel = `Material.texture`), `edge_<art>.webp`, `scatter_<art>_<n>.webp`, `stepping_<n>.webp`
  (freigestellte Trittplatten) und `manifest.json`. Fehlt ein Bild, malt die App die prozedurale Kachel.

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

## Stauden: besondere Formen (`plants.py`)

- `strap`: Schwertblätter aus der Mitte (Taglilie), `fern`: Farnwedel aus Fiederblättchen (Wurmfarn),
  Blüten `plume` (Rispe, Astilbe) und `lily` (Trichter, Taglilie).
- `spread` verkleinert das Blattpolster bei großen Blättern; `frame` fügt lose Eckpunkte hinzu, weil Blätter
  als Partikel nicht zur Bildhülle zählen und sonst am Rand abgeschnitten würden.
- Wintergrüne Stauden mit `leaf_hex` (Purpurglöckchen, Bergenie) behalten ihre Laubfarbe das ganze Jahr.
