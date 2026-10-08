"""
Rendert alle Pflanzenarten für die App: je Art und Look (Jahreszeit) zwei Varianten,
Draufsicht (alle) und Schrägansicht (Bäume, Sträucher).

    npm run assets:looks                                   # Katalog → assets/blender/plants.json
    python assets/blender/render_plants.py [--only tilia-cordata,buxus] [--quick|--preview] [--force]

Bereits vorhandene Bilder werden übersprungen (Lauf kann abgebrochen und fortgesetzt werden).
Ergebnis: public/assets/plants/<id>_<look>_<variante>_<top|oblique>.webp + manifest.json
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PIL import Image  # noqa: E402

import lib  # noqa: E402
import plants  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
VARIANTS = 2


def ppm_for(fp: tuple[float, float], quick: bool, preview: bool) -> float:
    p = min(170.0, 720.0 / max(fp[0], fp[1], 0.3))
    return p / 3 if quick else p / 1.6 if preview else p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--preview", action="store_true")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--out", default=os.path.join(ROOT, "public/assets/plants"))
    args = ap.parse_args(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:])
    os.makedirs(args.out, exist_ok=True)
    species = json.load(open(os.path.join(os.path.dirname(__file__), "plants.json")))
    man_path = os.path.join(args.out, "manifest.json")
    manifest = json.load(open(man_path)) if os.path.exists(man_path) else {"version": 1, "plants": {}}
    only = [s for s in args.only.split(",") if s]
    base_variants = 1 if args.quick or args.preview else VARIANTS
    samples = 12 if args.quick else 32 if args.preview else 40
    for sp in species:
        if only and sp["id"] not in only:
            continue
        gen = plants.GENERATORS[sp["kind"]]
        # große Gehölze: eine Variante (Rechenzeit); die App dreht jedes Exemplar etwas
        variants = 1 if sp["kind"] in ("tree", "espalier") else base_variants
        fp = plants.footprint(sp)
        ppm = ppm_for(fp, args.quick, args.preview)
        entry = {"kind": sp["kind"], "w": fp[0], "d": fp[1], "h": sp["heightMature"], "ppm": round(ppm, 3), "looks": {}}
        t0 = time.time()
        for li, lk in enumerate(sp["looks"]):
            look_entry = {"seasons": lk["seasons"], "top": [], "oblique": []}
            for v in range(variants):
                views = [("top", 0.0)] + ([("oblique", lib.OBLIQUE_TILT_DEG)] if sp["kind"] in plants.NEEDS_OBLIQUE else [])
                names = {view: f"{sp['id']}_{li}_{v}_{view}.webp" for view, _ in views}
                prev = manifest["plants"].get(sp["id"], {}).get("looks", {}).get(lk["key"])
                if not args.force and prev and all(os.path.exists(os.path.join(args.out, n)) for n in names.values()) and len(prev["top"]) > v:
                    look_entry["top"].append(prev["top"][v])
                    if prev["oblique"]:
                        look_entry["oblique"].append(prev["oblique"][v])
                    continue
                lib.reset_scene(samples, ground=True, outlines=False)
                plants.reset_cache()
                gen(sp, lk["look"], 1000 + v * 7919 + li * 31 + len(sp["id"]))
                for view, tilt in views:
                    png = os.path.join(args.out, names[view][:-5] + ".png")
                    r = lib.render_view(png, ppm, tilt, margin=0.03)
                    Image.open(png).save(os.path.join(args.out, names[view]), "WEBP", quality=86, method=6)
                    os.remove(png)
                    look_entry[view].append({"file": names[view], "px": [r.width, r.height], "anchor": [round(r.anchor[0], 4), round(r.anchor[1], 4)]})
            entry["looks"][lk["key"]] = look_entry
        manifest["plants"][sp["id"]] = entry
        json.dump(manifest, open(man_path, "w"), indent=1)
        print(f"[plants] {sp['id']}: {len(sp['looks'])} Looks, {time.time() - t0:.0f} s", flush=True)


if __name__ == "__main__":
    main()
