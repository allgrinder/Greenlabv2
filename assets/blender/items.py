"""
Generatoren für die Katalogobjekte (Gebäude, Möbel, Ausstattung) – moderner Stil, grau und anthrazit.

Jede Funktion baut das Objekt in Plan-Metern um den Ursprung (Breite w entlang x, Tiefe d
entlang y, Höhe h) – dieselben Maße wie im Katalog `src/core/catalog/items.ts`.
"""
from __future__ import annotations

import math

from mathutils import Vector

from lib import P, box, cylinder, foliage_ball, foliage_carpet, plate, poly_mesh, rng, veg_clump

# ------------------------------------------------------------------ Gebäude


def house(w: float, d: float, h: float):
    eave = h * 0.6
    ov = 0.45  # Dachüberstand
    box("walls", -w / 2, -d / 2, 0, w / 2, d / 2, eave, "plaster")
    box("plinth", -w / 2 - 0.01, -d / 2 - 0.01, 0, w / 2 + 0.01, d / 2 + 0.01, 0.35, "concrete_dark")
    # Fenster mit anthrazit Rahmen auf allen Seiten, zwei Geschosse
    for side in ("n", "s", "e", "w"):
        length = w if side in "ns" else d
        n = max(1, int(length // 2.6))
        for i in range(n):
            c = -length / 2 + length * (i + 0.5) / n
            for z0, z1 in ((0.95, 2.2), (eave - 1.45, eave - 0.3)) if eave > 3.6 else ((0.95, 2.2),):
                hw = 0.62
                if side == "s":
                    box("frame", c - hw - 0.06, d / 2, z0 - 0.06, c + hw + 0.06, d / 2 + 0.06, z1 + 0.06, "anthracite")
                    box("glass", c - hw, d / 2 + 0.05, z0, c + hw, d / 2 + 0.07, z1, "window")
                elif side == "n":
                    box("frame", c - hw - 0.06, -d / 2 - 0.06, z0 - 0.06, c + hw + 0.06, -d / 2, z1 + 0.06, "anthracite")
                    box("glass", c - hw, -d / 2 - 0.07, z0, c + hw, -d / 2 - 0.05, z1, "window")
                elif side == "e":
                    box("frame", w / 2, c - hw - 0.06, z0 - 0.06, w / 2 + 0.06, c + hw + 0.06, z1 + 0.06, "anthracite")
                    box("glass", w / 2 + 0.05, c - hw, z0, w / 2 + 0.07, c + hw, z1, "window")
                else:
                    box("frame", -w / 2 - 0.06, c - hw - 0.06, z0 - 0.06, -w / 2, c + hw + 0.06, z1 + 0.06, "anthracite")
                    box("glass", -w / 2 - 0.07, c - hw, z0, -w / 2 - 0.05, c + hw, z1, "window")
    # Walmdach, First entlang der längeren Seite
    W, D = w + 2 * ov, d + 2 * ov
    slope = (h - eave) / (min(W, D) / 2)
    ze = eave - ov * slope
    x0, x1, y0, y1 = -W / 2, W / 2, -D / 2, D / 2
    if D >= W:
        r = W / 2
        ridge = [P(0, y0 + r, h), P(0, y1 - r, h)]
    else:
        r = D / 2
        ridge = [P(x0 + r, 0, h), P(x1 - r, 0, h)]
    c = [P(x0, y0, ze), P(x1, y0, ze), P(x1, y1, ze), P(x0, y1, ze)]
    verts = c + ridge
    if D >= W:
        faces = [[0, 1, 4], [1, 2, 5, 4], [2, 3, 5], [3, 0, 4, 5]]
    else:
        faces = [[0, 1, 5, 4], [1, 2, 5], [2, 3, 4, 5], [3, 0, 4]]
    frames = []
    for f in faces:
        a, b = verts[f[0]], verts[f[1]]
        e = (b - a).normalized()
        nrm = (verts[f[1]] - verts[f[0]]).cross(verts[f[2]] - verts[f[0]]).normalized()
        if nrm.z < 0:
            nrm = -nrm
        s = nrm.cross(e).normalized()
        if s.z < 0:
            s = -s
        frames.append((a, e, s))
    roof = poly_mesh("roof", verts, faces, "roof_tile", frames)
    sol = roof.modifiers.new("thick", "SOLIDIFY")
    sol.thickness = 0.12
    # First- und Gratziegel
    for f in faces:
        for i in range(len(f)):
            a, b = verts[f[i]], verts[f[(i + 1) % len(f)]]
            if a.z > ze + 0.01 or b.z > ze + 0.01:
                if a.z > ze + 0.01 and b.z > ze + 0.01 and f[i] > f[(i + 1) % len(f)]:
                    continue
                d_ = (b - a)
                L = d_.length
                ob = cylinder("ridge", 0, 0, 0, L, 0.09, "graphite", 12)
                ob.location = a + Vector((0, 0, 0.12))
                ob.rotation_mode = "QUATERNION"
                ob.rotation_quaternion = d_.normalized().to_track_quat("Z", "Y")
    # Solarmodule auf der Westfläche (zum Licht), Schornstein und Dachfenster auf der Ostfläche
    def up_normal(fr):
        n_ = fr[1].cross(fr[2]).normalized()
        return n_ if n_.z > 0 else -n_

    west = [f for f in frames if up_normal(f).x < -0.2]
    east = [f for f in frames if up_normal(f).x > 0.2]
    for frs, kind in ((west, "solar"), (east, "skylight")):
        if not frs:
            continue
        o, e, s = frs[0]
        nrm = up_normal(frs[0])
        span = (verts[faces[frames.index(frs[0])][1]] - o).length
        slope_len = (h - ze) / max(0.01, s.z)
        if kind == "solar":
            pw, pl, cols, rows = 1.7, 1.0, 5, 2
            u0 = (span - cols * (pw + 0.02)) / 2
            for i in range(cols):
                for j in range(rows):
                    org = o + e * (u0 + i * (pw + 0.02)) + s * (slope_len * 0.25 + j * (pl + 0.02)) + nrm * 0.14
                    plate("pv", org, e, s, nrm, pw, pl, 0.04, "solar")
                    plate("pvframe", org - e * 0.015 - s * 0.015 - nrm * 0.005, e, s, nrm, pw + 0.03, pl + 0.03, 0.035, "graphite")
        else:
            for i in (0.3, 0.62):
                org = o + e * (span * i) + s * (slope_len * 0.35) + nrm * 0.13
                plate("skyframe", org - e * 0.05 - s * 0.05, e, s, nrm, 0.88, 1.28, 0.06, "anthracite")
                plate("skylight", org, e, s, nrm, 0.78, 1.18, 0.075, "window")
    box("chimney", w / 2 - 2.6, -d / 2 + 2.2, eave, w / 2 - 1.9, -d / 2 + 2.85, h + 0.6, "concrete_dark")
    box("chimneycap", w / 2 - 2.66, -d / 2 + 2.14, h + 0.6, w / 2 - 1.84, -d / 2 + 2.91, h + 0.66, "anthracite")


def shed(w: float, d: float, h: float):
    """Modernes Gartenhaus: Flachdach mit Attika, Gründach (Sedum) und Solarmodulen, Wände aus vergrauten Latten"""
    box("walls", -w / 2 + 0.1, -d / 2 + 0.1, 0, w / 2 - 0.1, d / 2 - 0.1, h - 0.2, "wood_grey")
    # Tür und Fensterband zur Gartenseite (Plan-Süden)
    box("door", -0.55, d / 2 - 0.1, 0, 0.45, d / 2 - 0.06, 2.05, "anthracite", 0.005)
    box("doorglass", -0.45, d / 2 - 0.065, 0.3, 0.35, d / 2 - 0.055, 1.95, "window")
    box("window", 0.75, d / 2 - 0.1, 1.2, w / 2 - 0.35, d / 2 - 0.06, 1.95, "anthracite")
    box("windowglass", 0.82, d / 2 - 0.065, 1.27, w / 2 - 0.42, d / 2 - 0.055, 1.88, "window")
    # Flachdach mit Überstand, Attika, Kies
    box("roof", -w / 2, -d / 2, h - 0.2, w / 2, d / 2, h - 0.08, "anthracite", 0.01)
    for (a, b_, c, d_) in ((-w / 2, -d / 2, w / 2, -d / 2 + 0.08), (-w / 2, d / 2 - 0.08, w / 2, d / 2), (-w / 2, -d / 2, -w / 2 + 0.08, d / 2), (w / 2 - 0.08, -d / 2, w / 2, d / 2)):
        box("attika", a, b_, h - 0.08, c, d_, h, "anthracite", 0.005)
    # Kiesstreifen am Rand, Sedum-Teppich, zwei Solarmodule aufgeständert
    box("gravel", -w / 2 + 0.08, -d / 2 + 0.08, h - 0.08, w / 2 - 0.08, d / 2 - 0.08, h - 0.06, "gravel_dark")
    x0, y0, x1, y1 = -w / 2 + 0.3, -d / 2 + 0.3, w / 2 - 0.3, d / 2 - 0.3
    foliage_carpet("sedum_g", x0, y0, x1, y1, h - 0.06, 2600, 0.03, "leaf_sedum", seed=4)
    foliage_carpet("sedum_r", x0, y0, x1, y1, h - 0.055, 700, 0.028, "leaf_sedum_red", seed=9)
    a = math.radians(12)
    e = Vector((1, 0, 0))
    s_ = Vector((0, math.cos(a), math.sin(a)))  # Plan-Norden hoch, Modul neigt sich nach Süden
    nrm = e.cross(s_)
    pw, pl = min(1.7, (w - 1.0) / 2 - 0.05), 1.0
    for i in range(2):
        org = P(-w / 2 + 0.5 + i * (pw + 0.08), -0.2, h + 0.08)
        plate("pv", org, e, s_, nrm, pw, pl, 0.035, "solar")
        plate("pvframe", org - e * 0.015 - s_ * 0.015 - nrm * 0.004, e, s_, nrm, pw + 0.03, pl + 0.03, 0.03, "graphite")


def greenhouse(w: float, d: float, h: float):
    """Gewächshaus: anthrazit Aluminium, Glas, Satteldach; Beete mit Pflanzen darin"""
    eave = h * 0.68
    along_y = d >= w
    # Beete und Weg
    box("bed_l", -w / 2 + 0.1, -d / 2 + 0.1, 0, -0.35, d / 2 - 0.1, 0.25, "soil")
    box("bed_r", 0.35, -d / 2 + 0.1, 0, w / 2 - 0.1, d / 2 - 0.1, 0.25, "soil")
    box("path", -0.35, -d / 2 + 0.05, 0, 0.35, d / 2 - 0.05, 0.03, "concrete")
    r = rng(5)
    for side in (-1, 1):
        y = -d / 2 + 0.4
        while y < d / 2 - 0.3:
            x = side * (0.35 + (w / 2 - 0.45) * (0.3 + r.random() * 0.4))
            veg_clump(r.choice(["chard", "kale", "lettuce"]), P(x, y, 0.25), r, 1.5)
            y += 0.55
    # Rahmen
    t = 0.045
    for x in (-w / 2, w / 2 - t):
        n = max(2, round(d / 0.7))
        for i in range(n + 1):
            y = -d / 2 + (d - t) * i / n
            box("post", x, y, 0, x + t, y + t, eave, "anthracite")
    for y in (-d / 2, d / 2 - t):
        n = max(2, round(w / 0.7))
        for i in range(n + 1):
            x = -w / 2 + (w - t) * i / n
            zt = eave + (h - eave) * (1 - abs(x + t / 2) / (w / 2)) if along_y else eave
            box("post", x, y, 0, x + t, y + t, zt, "anthracite")
    box("sill_n", -w / 2, -d / 2, eave - t, w / 2, -d / 2 + t, eave, "anthracite")
    box("sill_s", -w / 2, d / 2 - t, eave - t, w / 2, d / 2, eave, "anthracite")
    box("eave_w", -w / 2, -d / 2, eave - t, -w / 2 + t, d / 2, eave, "anthracite")
    box("eave_e", w / 2 - t, -d / 2, eave - t, w / 2, d / 2, eave, "anthracite")
    box("ridge", -t / 2, -d / 2, h - t, t / 2, d / 2, h, "anthracite")
    # Dachsparren und Glas
    n = max(2, round(d / 0.7))
    for side in (-1, 1):
        a = P(side * w / 2, -d / 2, eave)
        bpt = P(0, -d / 2, h)
        s = (bpt - a).normalized()
        e = Vector((0, -1, 0))
        nrm = e.cross(s) if side < 0 else s.cross(e)
        if nrm.z < 0:
            nrm = -nrm
        L = (bpt - a).length
        # Sparren als schmale Platten entlang der Dachneigung, dazwischen Glas
        for i in range(n + 1):
            y = -d / 2 + (d - t) * i / n
            plate("rafter", P(side * w / 2, y, eave), e, s, nrm, t, L, t, "anthracite")
        plate("roofglass", P(side * w / 2, -d / 2, eave) + nrm * 0.01, e, s, nrm, d, L, 0.01, "glass")
    # Wände Glas
    box("glass_n", -w / 2, -d / 2, 0.02, w / 2, -d / 2 + 0.01, eave, "glass")
    box("glass_s", -w / 2, d / 2 - 0.01, 0.02, w / 2, d / 2, eave, "glass")
    box("glass_w", -w / 2, -d / 2, 0.02, -w / 2 + 0.01, d / 2, eave, "glass")
    box("glass_e", w / 2 - 0.01, -d / 2, 0.02, w / 2, d / 2, eave, "glass")
    # Giebeldreiecke
    for y in (-d / 2, d / 2):
        poly_mesh("gable", [P(-w / 2, y, eave), P(w / 2, y, eave), P(0, y, h)], [[0, 1, 2]], "glass")
    _ = along_y


def compost(w: float, d: float, h: float):
    """Zwei Kammern, Lamellen aus anthrazit Stahl, Kompost darin"""
    t = 0.04
    # Pfosten
    for x in (-w / 2, -t / 2, w / 2 - t):
        for y in (-d / 2, d / 2 - t):
            box("post", x, y, 0, x + t, y + t, h + 0.04, "anthracite", 0.004)
    # Lamellen außen und Trennwand
    z = 0.04
    while z < h - 0.05:
        zt = z + 0.09
        box("slat_n", -w / 2, -d / 2, z, w / 2, -d / 2 + 0.025, zt, "anthracite", 0.004)
        box("slat_s", -w / 2, d / 2 - 0.025, z, w / 2, d / 2, zt, "anthracite", 0.004)
        box("slat_w", -w / 2, -d / 2, z, -w / 2 + 0.025, d / 2, zt, "anthracite", 0.004)
        box("slat_e", w / 2 - 0.025, -d / 2, z, w / 2, d / 2, zt, "anthracite", 0.004)
        box("slat_m", -0.0125, -d / 2, z, 0.0125, d / 2, zt, "anthracite", 0.004)
        z = zt + 0.025
    # Füllung: links frisch (höher, grün durchsetzt), rechts reif
    box("fill_l", -w / 2 + 0.03, -d / 2 + 0.03, 0, -0.02, d / 2 - 0.03, h * 0.72, "soil")
    box("fill_r", 0.02, -d / 2 + 0.03, 0, w / 2 - 0.03, d / 2 - 0.03, h * 0.5, "soil")
    r = rng(3)
    for _ in range(14):
        foliage_ball("green", P(-w / 4 + (r.random() - 0.5) * (w / 2 - 0.2), (r.random() - 0.5) * (d - 0.3), h * 0.72), 0.08 + r.random() * 0.06, 80, 0.035, seed=r.randint(1, 999))


def barrel(w: float, d: float, h: float):
    r = w / 2
    cylinder("body", 0, 0, 0, h - 0.04, r * 0.96, "anthracite", 64, 0.02)
    cylinder("rim", 0, 0, h - 0.08, h - 0.02, r, "graphite", 64, 0.01)
    cylinder("lid", 0, 0, h - 0.04, h, r * 0.9, "anthracite", 64, 0.01)
    cylinder("knob", 0, 0, h, h + 0.03, r * 0.12, "graphite", 32, 0.005)
    box("tap", -0.03, r * 0.9, 0.15, 0.03, r * 1.05, 0.2, "graphite", 0.005)


def raised_bed(w: float, d: float, h: float):
    """Hochbeet aus anthrazit Stahl mit Gemüsereihen"""
    t = 0.03
    box("wall_n", -w / 2, -d / 2, 0, w / 2, -d / 2 + t, h, "anthracite", 0.005)
    box("wall_s", -w / 2, d / 2 - t, 0, w / 2, d / 2, h, "anthracite", 0.005)
    box("wall_w", -w / 2, -d / 2, 0, -w / 2 + t, d / 2, h, "anthracite", 0.005)
    box("wall_e", w / 2 - t, -d / 2, 0, w / 2, d / 2, h, "anthracite", 0.005)
    # umlaufende Abkantung oben
    for (a, b_, c, d_) in ((-w / 2 - 0.02, -d / 2 - 0.02, w / 2 + 0.02, -d / 2 + 0.05), (-w / 2 - 0.02, d / 2 - 0.05, w / 2 + 0.02, d / 2 + 0.02), (-w / 2 - 0.02, -d / 2, -w / 2 + 0.05, d / 2), (w / 2 - 0.05, -d / 2, w / 2 + 0.02, d / 2)):
        box("rim", a, b_, h - 0.01, c, d_, h + 0.01, "anthracite", 0.004)
    box("soil", -w / 2 + t, -d / 2 + t, 0, w / 2 - t, d / 2 - t, h - 0.06, "soil")
    # üppige Mischkultur: Reihen aus Mangold, Grünkohl, Salaten und Kräutern, dicht und leicht über den Rand
    r = rng(int(w * 100 + d * 10))
    rows = max(2, int((d - 0.1) // 0.3))
    kinds = ["chard", "lettuce", "kale", "redlettuce", "herb"]
    for i in range(rows):
        y = -d / 2 + 0.06 + (d - 0.12) * (i + 0.5) / rows
        kind = kinds[(i + int(w * 10)) % len(kinds)]
        x = -w / 2 + 0.16
        while x < w / 2 - 0.1:
            k = kind if r.random() > 0.18 else r.choice(kinds)
            veg_clump(k, P(x + (r.random() - 0.5) * 0.05, y + (r.random() - 0.5) * 0.06, h - 0.06), r)
            x += 0.24 + r.random() * 0.06
    foliage_carpet("weeds", -w / 2 + t, -d / 2 + t, w / 2 - t, d / 2 - t, h - 0.06, 500, 0.02, "leaf", "soil", seed=2)


# ------------------------------------------------------------------ Möbel


def chair(cx: float, cy: float, facing: str):
    """Moderner Esszimmer-Gartenstuhl: anthrazit Rahmen, hellgraues Sitzkissen; Lehne auf der Seite `facing` gegenüber"""
    s = 0.56
    x0, y0 = cx - s / 2, cy - s / 2
    # Beine
    for dx in (0.02, s - 0.06):
        for dy in (0.02, s - 0.06):
            box("leg", x0 + dx, y0 + dy, 0, x0 + dx + 0.04, y0 + dy + 0.04, 0.42, "anthracite", 0.006)
    box("seatframe", x0, y0, 0.4, x0 + s, y0 + s, 0.44, "anthracite", 0.008)
    box("cushion", x0 + 0.03, y0 + 0.03, 0.44, x0 + s - 0.03, y0 + s - 0.03, 0.5, "fabric_light", 0.02)
    # Lehne auf der vom Tisch abgewandten Seite
    if facing == "w":
        box("back", x0 - 0.02, y0, 0.44, x0 + 0.04, y0 + s, 0.86, "anthracite", 0.01)
        box("backcushion", x0 + 0.04, y0 + 0.04, 0.5, x0 + 0.1, y0 + s - 0.04, 0.82, "fabric_light", 0.02)
    elif facing == "e":
        box("back", x0 + s - 0.04, y0, 0.44, x0 + s + 0.02, y0 + s, 0.86, "anthracite", 0.01)
        box("backcushion", x0 + s - 0.1, y0 + 0.04, 0.5, x0 + s - 0.04, y0 + s - 0.04, 0.82, "fabric_light", 0.02)
    elif facing == "n":
        box("back", x0, y0 - 0.02, 0.44, x0 + s, y0 + 0.04, 0.86, "anthracite", 0.01)
        box("backcushion", x0 + 0.04, y0 + 0.04, 0.5, x0 + s - 0.04, y0 + 0.1, 0.82, "fabric_light", 0.02)
    else:
        box("back", x0, y0 + s - 0.04, 0.44, x0 + s, y0 + s + 0.02, 0.86, "anthracite", 0.01)
        box("backcushion", x0 + 0.04, y0 + s - 0.1, 0.5, x0 + s - 0.04, y0 + s - 0.04, 0.82, "fabric_light", 0.02)


def table(w: float, d: float, h: float):
    """Tisch mit 6 Stühlen: Keramikplatte in Betonoptik auf anthrazit Gestell"""
    cs = 0.56
    tw = max(0.8, w - 2 * cs - 0.05)
    td = max(1.4, d - 2 * cs - 0.1)
    box("top", -tw / 2, -td / 2, h - 0.035, tw / 2, td / 2, h, "wood_light", 0.006)
    box("apron", -tw / 2 + 0.05, -td / 2 + 0.05, h - 0.09, tw / 2 - 0.05, td / 2 - 0.05, h - 0.03, "anthracite")
    for sx in (-1, 1):
        for sy in (-1, 1):
            x = sx * (tw / 2 - 0.1)
            y = sy * (td / 2 - 0.1)
            box("leg", x - 0.04, y - 0.04, 0, x + 0.04, y + 0.04, h - 0.03, "anthracite", 0.006)
    n = 3
    for i in range(n):
        y = -td / 2 + td * (i + 0.5) / n
        chair(-tw / 2 - cs / 2 + 0.06, y, "w")
        chair(tw / 2 + cs / 2 - 0.06, y, "e")
    chair(0, -td / 2 - cs / 2 + 0.08, "n")
    chair(0, td / 2 + cs / 2 - 0.08, "s")


def lounger(w: float, d: float, h: float):
    """Liege: anthrazit Aluminiumrahmen, hellgraue Auflage, Rückenteil aufgestellt (Kopfende links)"""
    fr = 0.04
    box("rail_n", -w / 2, -d / 2, 0.22, w / 2, -d / 2 + fr, 0.28, "anthracite", 0.006)
    box("rail_s", -w / 2, d / 2 - fr, 0.22, w / 2, d / 2, 0.28, "anthracite", 0.006)
    for x in (-w / 2 + 0.05, w / 2 - 0.12):
        box("legs", x, -d / 2, 0, x + 0.06, d / 2, 0.06, "anthracite", 0.006)
        box("legpost_n", x, -d / 2, 0, x + 0.04, -d / 2 + 0.04, 0.28, "anthracite")
        box("legpost_s", x, d / 2 - 0.04, 0, x + 0.04, d / 2, 0.28, "anthracite")
    seat_x0 = -w / 2 + 0.7
    box("pad", seat_x0, -d / 2 + 0.03, 0.27, w / 2 - 0.03, d / 2 - 0.03, 0.36, "fabric_light", 0.03)
    # Steppung
    x = seat_x0 + 0.4
    while x < w / 2 - 0.2:
        box("seam", x, -d / 2 + 0.06, 0.355, x + 0.01, d / 2 - 0.06, 0.362, "fabric_dark")
        x += 0.42
    # Rückenteil geneigt
    a = math.radians(38)
    L = 0.75
    o = P(seat_x0, d / 2 - 0.03, 0.3)
    e = Vector((0, 1, 0))  # Blender: Plan −y
    s = Vector((-math.cos(a), 0, math.sin(a)))
    nrm = s.cross(e)
    if nrm.z < 0:
        nrm = -nrm
    plate("backrest", o, e, s, nrm, d - 0.06, L, 0.09, "fabric_light")
    plate("backframe", o - nrm * 0.03, e, s, nrm, d - 0.06, L, 0.03, "anthracite")
    pillow = plate("pillow", o + s * 0.45 + e * 0.12 + nrm * 0.09, e, s, nrm, d - 0.3, 0.22, 0.08, "fabric_dark")
    _ = pillow


def planter(w: float, d: float, h: float):
    """Hoher quadratischer Pflanzkübel aus Faserzement (anthrazit) mit Buchskugel"""
    box("pot", -w / 2, -d / 2, 0, w / 2, d / 2, h, "concrete_dark", 0.015)
    box("soil", -w / 2 + 0.04, -d / 2 + 0.04, h - 0.06, w / 2 - 0.04, d / 2 - 0.04, h - 0.02, "soil")
    foliage_ball("buxus", P(0, 0, h + w * 0.3), w * 0.36, 1800, 0.022, seed=11)


def pool(w: float, d: float, h: float):
    """Pool mit großformatiger Randplatte, dunkler Folie und Einstiegstreppe"""
    rim = 0.3
    # Randplatten 60 × 30 mit Fugen
    def ring_tiles(x0, y0, x1, y1, t):
        x = x0
        while x < x1 - 1e-6:
            xe = min(x1, x + 0.6)
            box("tile", x + 0.004, y0 + 0.004, -0.04, xe - 0.004, y0 + t - 0.004, 0.0, "concrete", 0.004)
            box("tile", x + 0.004, y1 - t + 0.004, -0.04, xe - 0.004, y1 - 0.004, 0.0, "concrete", 0.004)
            x = xe
        y = y0 + t
        while y < y1 - t - 1e-6:
            ye = min(y1 - t, y + 0.6)
            box("tile", x0 + 0.004, y + 0.004, -0.04, x0 + t - 0.004, ye - 0.004, 0.0, "concrete", 0.004)
            box("tile", x1 - t + 0.004, y + 0.004, -0.04, x1 - 0.004, ye - 0.004, 0.0, "concrete", 0.004)
            y = ye
    ring_tiles(-w / 2, -d / 2, w / 2, d / 2, rim)
    # Becken (Folie anthrazit) und Wasser
    x0, y0, x1, y1 = -w / 2 + rim, -d / 2 + rim, w / 2 - rim, d / 2 - rim
    # Becken liegt im Boden: nur die Innenkante über dem Wasser ist sichtbar (kein Boden im Render)
    for (a, b_, c, d_) in ((x0, y0, x1, y0 + 0.02), (x0, y1 - 0.02, x1, y1), (x0, y0, x0 + 0.02, y1), (x1 - 0.02, y0, x1, y1)):
        box("liner", a, b_, -0.14, c, d_, -0.04, "anthracite")
    # Einstiegstreppe unter der Wasseroberfläche angedeutet
    for i in range(3):
        box("step", x0 + 0.02, y0 + 0.02, -0.15, x0 + 1.4 - i * 0.35, y0 + 0.35 * (i + 1), -0.135, "concrete_dark")
    box("water", x0, y0, -0.14, x1, y1, -0.12, "water")


def play(w: float, d: float, h: float):
    """Spielturm modern: graue Holzpfosten, anthrazit Pultdach, Rutsche hellgrau, Schaukel"""
    t = 1.4
    tx0, ty0 = -w / 2 + 0.1, -d / 2 + 0.1
    # Sandfläche
    box("sand", -w / 2, -d / 2 + 0.6, -0.01, -w / 2 + 2.0, d / 2, 0.02, "sand")
    for dx in (0, t - 0.09):
        for dy in (0, t - 0.09):
            box("post", tx0 + dx, ty0 + dy, 0, tx0 + dx + 0.09, ty0 + dy + 0.09, h - 0.2, "wood_grey", 0.006)
    box("deck", tx0, ty0, 1.2, tx0 + t, ty0 + t, 1.25, "wood_grey", 0.004)
    for z in (1.5, 1.75):
        box("rail_n", tx0, ty0, z, tx0 + t, ty0 + 0.04, z + 0.06, "wood_grey")
        box("rail_w", tx0, ty0, z, tx0 + 0.04, ty0 + t, z + 0.06, "wood_grey")
    box("roof", tx0 - 0.15, ty0 - 0.15, h - 0.2, tx0 + t + 0.15, ty0 + t + 0.15, h - 0.12, "anthracite", 0.008)
    # Rutsche nach Süden
    a = math.atan2(1.2, 2.2)
    o = P(tx0 + 0.45, ty0 + t, 1.22)
    e = Vector((1, 0, 0))
    s = Vector((0, -math.cos(a), -math.sin(a)))
    nrm = e.cross(s)
    if nrm.z < 0:
        nrm = -nrm
    plate("slide", o, e, s, nrm, 0.5, 2.5, 0.04, "concrete")
    plate("slide_l", o, s, nrm, -e, 2.5, 0.12, 0.03, "graphite")
    plate("slide_r", o + e * 0.5, s, nrm, -e, 2.5, 0.12, 0.03, "graphite")
    # Schaukelbalken
    bx0 = tx0 + t
    box("beam", bx0, ty0 + 0.3, 2.2, w / 2 - 0.05, ty0 + 0.42, 2.32, "wood_grey", 0.006)
    for x in (w / 2 - 0.15,):
        for dy in (-0.4, 0.9):
            box("aframe", x, ty0 + 0.36 + dy * 0.5 - 0.05, 0, x + 0.1, ty0 + 0.36 + dy * 0.5 + 0.05, 2.32, "wood_grey", 0.006)
    for x in (bx0 + 0.6, bx0 + 1.6):
        if x > w / 2 - 0.4:
            continue
        box("seat", x - 0.22, ty0 + 0.28, 0.42, x + 0.22, ty0 + 0.44, 0.46, "fabric_dark", 0.01)
        for dx in (-0.2, 0.2):
            box("rope", x + dx - 0.01, ty0 + 0.35, 0.46, x + dx + 0.01, ty0 + 0.37, 2.2, "graphite")


def fence(w: float, d: float, h: float):
    """Zaunfeld 1 m: anthrazit Aluminium-Lamellen, Pfosten an den Enden"""
    box("post_l", -w / 2, -0.04, 0, -w / 2 + 0.07, 0.04, h + 0.03, "anthracite", 0.005)
    box("post_r", w / 2 - 0.07, -0.04, 0, w / 2, 0.04, h + 0.03, "anthracite", 0.005)
    z = 0.08
    while z < h - 0.05:
        box("slat", -w / 2 + 0.07, -d / 2, z, w / 2 - 0.07, d / 2, z + 0.09, "anthracite", 0.004)
        z += 0.11


GENERATORS = {
    "house": house,
    "shed": shed,
    "greenhouse": greenhouse,
    "compost": compost,
    "barrel": barrel,
    "raisedBed": raised_bed,
    "table": table,
    "lounger": lounger,
    "planter": planter,
    "pool": pool,
    "play": play,
    "fence": fence,
}
