"""
Rendert die Bodenbeläge als nahtlose Kacheln und die Trittplatten als Einzelbilder.

    python assets/blender/render_ground.py [--only gravel,wood] [--quick]

Ergebnis: public/assets/ground/<belag>.webp, stepping_<n>.webp und manifest.json
(Kachelgröße in m, Pixel je m).
"""
from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
from mathutils import Euler, Vector  # noqa: E402
from PIL import Image  # noqa: E402

import ground  # noqa: E402
import lib  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def top_camera(T, ppm: int):
    sc = bpy.context.scene
    cam = lib.link(bpy.data.objects.new("cam", bpy.data.cameras.new("cam")), outline=False)
    sc.camera = cam
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = max(T)
    cam.rotation_euler = Euler((0, 0, 0))
    cam.location = lib.P(T[0] / 2, T[1] / 2, 20)
    cam.data.clip_end = 100
    sc.render.resolution_x = round(T[0] * ppm)
    sc.render.resolution_y = round(T[1] * ppm)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--out", default=os.path.join(ROOT, "public/assets/ground"))
    ap.add_argument("--variants", type=int, default=0, help="zusätzliche Kachelvarianten je organischem Belag")
    ap.add_argument("--no-base", action="store_true", help="Grundkacheln nicht neu rendern (nur Varianten)")
    args = ap.parse_args(sys.argv[1:])
    os.makedirs(args.out, exist_ok=True)
    man_path = os.path.join(args.out, "manifest.json")
    man = json.load(open(man_path)) if os.path.exists(man_path) else {"version": 1, "tiles": {}, "stepping": []}
    only = [s for s in args.only.split(",") if s]
    for key, (fn, T, ppm) in ground.GROUND.items():
        if only and key not in only:
            continue
        q = 0.4 if args.quick else 1.0
        runs = ([] if args.no_base else [0]) + (list(range(1, args.variants + 1)) if key in ground.VARIANTS else [])
        for v in runs:
            t0 = time.time()
            sc = lib.reset_scene(12 if args.quick else 48, ground=False, outlines=False)
            sc.render.film_transparent = False
            if "plants" in sys.modules:  # Materialcache der Wiese zeigt nach reset_scene auf gelöschte Materialien
                sys.modules["plants"]._cache.clear()
            fn(T, random.Random(7 + v * 101))
            top_camera(T, int(ppm * q))
            name = key if v == 0 else f"{key}_v{v}"
            png = os.path.join(args.out, f"{name}.png")
            sc.render.filepath = png
            bpy.ops.render.render(write_still=True)
            Image.open(png).convert("RGB").save(png[:-4] + ".webp", "WEBP", quality=88, method=6)
            os.remove(png)
            if v == 0:
                prev = man["tiles"].get(key, {}).get("variants", [])
                man["tiles"][key] = {"file": f"{key}.webp", "w": T[0], "h": T[1], "ppm": int(ppm * q), "variants": prev}
            else:
                vs = man["tiles"][key].setdefault("variants", [])
                if f"{name}.webp" not in vs:
                    vs.append(f"{name}.webp")
            json.dump(man, open(man_path, "w"), indent=1)
            print(f"[ground] {name}: {time.time() - t0:.0f} s", flush=True)
    if not only or "edges" in only:
        man.setdefault("edges", {})
        for key, (T, ppm, gen) in ground.EDGE.items():
            sc = lib.reset_scene(12 if args.quick else 48, ground=False, outlines=False)
            sc.render.film_transparent = True
            q = 0.4 if args.quick else 1.0
            gen(T, random.Random(11))
            top_camera(T, int(ppm * q))
            png = os.path.join(args.out, f"edge_{key}.png")
            sc.render.filepath = png
            bpy.ops.render.render(write_still=True)
            Image.open(png).save(png[:-4] + ".webp", "WEBP", quality=90, method=6)
            os.remove(png)
            man["edges"][key] = {"file": f"edge_{key}.webp", "w": T[0], "h": T[1], "ppm": int(ppm * q)}
            json.dump(man, open(man_path, "w"), indent=1)
            print(f"[ground] edge {key}", flush=True)
    if not only or "scatter" in only:
        man["scatter"] = {}
        for kind, (gen, n) in ground.SCATTER.items():
            man["scatter"][kind] = []
            for i in range(n):
                lib.reset_scene(12 if args.quick else 40, ground=False, outlines=False)
                gen(random.Random(300 + i * 17 + len(kind)), i)
                png = os.path.join(args.out, f"scatter_{kind}_{i}.png")
                ppm_s = 900 if not args.quick else 300
                v = lib.render_view(png, ppm_s, 0.0, margin=0.15)
                Image.open(png).save(png[:-4] + ".webp", "WEBP", quality=90, method=6)
                os.remove(png)
                man["scatter"][kind].append({"file": f"scatter_{kind}_{i}.webp", "w": round(v.width / ppm_s, 4), "h": round(v.height / ppm_s, 4)})
            json.dump(man, open(man_path, "w"), indent=1)
            print(f"[ground] scatter {kind}", flush=True)
    if not only or "stepping" in only:
        man["stepping"] = []
        for i in range(ground.STEPPING):
            lib.reset_scene(12 if args.quick else 48, ground=True, outlines=False)
            ground.stepping_stone(random.Random(100 + i), i)
            png = os.path.join(args.out, f"stepping_{i}.png")
            v = lib.render_view(png, 300 if not args.quick else 120, 0.0, margin=0.02)
            Image.open(png).save(png[:-4] + ".webp", "WEBP", quality=88, method=6)
            os.remove(png)
            man["stepping"].append({"file": f"stepping_{i}.webp", "px": [v.width, v.height], "ppm": 300 if not args.quick else 120})
        json.dump(man, open(man_path, "w"), indent=1)
        print("[ground] stepping fertig", flush=True)


if __name__ == "__main__":
    main()
