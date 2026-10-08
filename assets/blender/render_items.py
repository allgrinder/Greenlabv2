"""
Rendert alle Katalogobjekte als Sprites für die App.

    python assets/blender/render_items.py [--only table,lounger] [--quick] [--out public/assets/items]

Benötigt `pip install bpy==5.2.2 pillow` (Python 3.13). Je Objekt entstehen Draufsicht und
Schrägansicht (35°) in vier Drehungen (0/90/180/270°) als WebP plus `manifest.json`.
Maße kommen aus `src/core/catalog/items.ts`, damit Katalog und Bilder nicht auseinanderlaufen.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PIL import Image  # noqa: E402

import lib  # noqa: E402
from items import GENERATORS  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def catalog_sizes() -> dict[str, tuple[float, float, float]]:
    """Erstes Katalogobjekt je Symbol: (Breite, Tiefe, Höhe)"""
    src = open(os.path.join(ROOT, "src/core/catalog/items.ts"), encoding="utf-8").read()
    out: dict[str, tuple[float, float, float]] = {}
    for m in re.finditer(r"width: ([\d.]+), depth: ([\d.]+), height: ([\d.]+), symbol: '(\w+)'", src):
        w, d, h, sym = float(m[1]), float(m[2]), float(m[3]), m[4]
        out.setdefault(sym, (w, d, h))
    return out


def ppm_for(w: float, d: float, quick: bool) -> float:
    """Pixel je Meter: kleine Möbel fein, Häuser gröber (Bildkante ≤ ~1400 px)"""
    p = min(220.0, 1400.0 / max(w, d, 0.5))
    return p / 3 if quick else p


def to_webp(png: str, webp: str):
    im = Image.open(png)
    im.save(webp, "WEBP", quality=88, method=6)
    os.remove(png)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--out", default=os.path.join(ROOT, "public/assets/items"))
    args = ap.parse_args(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:])
    os.makedirs(args.out, exist_ok=True)
    sizes = catalog_sizes()
    man_path = os.path.join(args.out, "manifest.json")
    manifest = json.load(open(man_path)) if os.path.exists(man_path) else {"version": 1, "items": {}}
    only = [s for s in args.only.split(",") if s]
    for sym, gen in GENERATORS.items():
        if only and sym not in only:
            continue
        w, d, h = sizes[sym]
        t0 = time.time()
        lib.reset_scene(16 if args.quick else 96)
        gen(w, d, h)
        ppm = ppm_for(w, d, args.quick)
        entry = {"w": w, "d": d, "h": h, "ppm": round(ppm, 3), "top": [], "oblique": []}
        rots = [0] if args.quick else [0, 90, 180, 270]
        for k, rot in enumerate(rots):
            if k:
                lib.rotate_all(90)
            for view, tilt in (("top", 0.0), ("oblique", lib.OBLIQUE_TILT_DEG)):
                png = os.path.join(args.out, f"{sym}_{view}_{rot}.png")
                v = lib.render_view(png, ppm, tilt)
                to_webp(png, png[:-4] + ".webp")
                entry[view].append({"file": os.path.basename(png[:-4] + ".webp"), "rot": rot, "px": [v.width, v.height], "anchor": [round(v.anchor[0], 4), round(v.anchor[1], 4)]})
        manifest["items"][sym] = entry
        json.dump(manifest, open(man_path, "w"), indent=1)
        print(f"[assets] {sym}: {time.time() - t0:.0f} s", flush=True)


if __name__ == "__main__":
    main()
