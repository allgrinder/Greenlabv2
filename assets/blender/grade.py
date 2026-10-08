"""
Farbanpassung der Pflanzenbilder an das Referenzbild: hellere, wärmere Kronen.
Hebt die Mitten (Gamma) und verschiebt Richtung Gelbgrün; Transparenz bleibt.

    python assets/blender/grade.py public/assets/plants   # einmalig auf vorhandene Bilder (Manifest merkt sich das)
"""
from __future__ import annotations

import json
import os
import sys

from PIL import Image

GAMMA = 0.7
GAIN = (1.2, 1.18, 0.75)


def _lut(gain: float) -> list[int]:
    return [min(255, round(255 * (i / 255) ** GAMMA * gain)) for i in range(256)]


LUTS = [_lut(g) for g in GAIN]


def grade(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    r, g, b, a = im.split()
    return Image.merge("RGBA", (r.point(LUTS[0]), g.point(LUTS[1]), b.point(LUTS[2]), a))


def grade_dir(path: str):
    man_path = os.path.join(path, "manifest.json")
    man = json.load(open(man_path))
    if man.get("graded"):
        print("bereits angepasst")
        return
    n = 0
    for f in os.listdir(path):
        if f.endswith(".webp"):
            p = os.path.join(path, f)
            grade(Image.open(p)).save(p, "WEBP", quality=86, method=6)
            n += 1
    man["graded"] = True
    json.dump(man, open(man_path, "w"), indent=1)
    print(f"{n} Bilder angepasst")


if __name__ == "__main__":
    grade_dir(sys.argv[1])
