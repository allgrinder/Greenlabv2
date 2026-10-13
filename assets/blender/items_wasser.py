"""
Generatoren der Objektgruppen Wasser, Technik und Rankhilfen – moderner Stil, grau und anthrazit.

Wasser:     Quellstein im Kiesbett, Wassertisch aus Cortenstahl mit Sprudel, Domdeckel einer
            unterirdischen Zisterne, Schwengelpumpe auf Natursteinplatte.
Technik:    Steckdosensäule, Wasserzapfsäule, Mähroboter in Garage mit Ladestation, Schlauchwagen.
Rankhilfen: Rosenbogen, freistehende Rankwand mit Pflanztrog, Rankobelisk – jeweils berankt
            (Kletterrose, Sternjasmin, Clematis).

Wie in `items.py`: jede Funktion baut das Objekt in Plan-Metern um den Ursprung (Breite w entlang x,
Tiefe d entlang y, Höhe h). Plan-Süden (+y) ist die Seite zur Kamera der Schrägansicht – Auslauf,
Steckdosen und Zapfhähne zeigen deshalb dorthin. Maße stehen in `catalog_wasser.json`.
"""
from __future__ import annotations

import math
import random

import bpy  # noqa: I001 – bpy muss vor bmesh geladen werden
import bmesh
from mathutils import Matrix, Vector

import lib
from lib import P, box, cylinder, link, mat, plate, poly_mesh, rng

# ------------------------------------------------------------------ eigene Materialien
#
# Sie werden unter eigenem Schlüssel in `lib._mats` abgelegt; danach nehmen `box`, `cylinder` usw.
# sie wie die Bibliotheksmaterialien an (`M("w_steel")` liefert den Schlüssel zurück).


def _ramp_noise(m, b, a, c, scale: float, coord: str = "Object"):
    lib._color_noise(m, b, a, c, scale, coord)


def _build(kind: str) -> bpy.types.Material:
    pr = lib._principled
    if kind == "w_steel":  # gebürsteter Edelstahl
        m, b = pr(kind)
        nt = m.node_tree
        tc = nt.nodes.new("ShaderNodeTexCoord")
        mp = nt.nodes.new("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = (1.0, 1.0, 260.0)  # feine Schleifspuren quer zur Höhe
        tex = nt.nodes.new("ShaderNodeTexNoise")
        tex.inputs["Scale"].default_value = 40
        tex.inputs["Detail"].default_value = 8
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = (0.42, 0.42, 0.41, 1)
        ramp.color_ramp.elements[1].color = (0.62, 0.62, 0.6, 1)
        nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
        nt.links.new(mp.outputs["Vector"], tex.inputs["Vector"])
        nt.links.new(tex.outputs["Fac"], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
        b.inputs["Metallic"].default_value = 1.0
        b.inputs["Roughness"].default_value = 0.3
    elif kind == "w_castiron":  # Gusseisen, schwarz lackiert, leicht narbig
        m, b = pr(kind)
        _ramp_noise(m, b, (0.018, 0.02, 0.019), (0.04, 0.042, 0.04), 30)
        b.inputs["Metallic"].default_value = 0.55
        b.inputs["Roughness"].default_value = 0.42
        lib._bump(m, b, 180, 0.18)
    elif kind == "w_pe_dark":  # Kunststoff (PE) anthrazit, matt genarbt
        m, b = pr(kind)
        _ramp_noise(m, b, (0.03, 0.03, 0.03), (0.045, 0.045, 0.043), 12)
        b.inputs["Roughness"].default_value = 0.62
        lib._bump(m, b, 500, 0.08)
    elif kind == "w_plastic_light":  # Gehäuse Mähroboter: hellgrau, seidenmatt
        m, b = pr(kind)
        b.inputs["Base Color"].default_value = (0.34, 0.345, 0.34, 1)
        b.inputs["Roughness"].default_value = 0.32
        b.inputs["Coat Weight"].default_value = 0.4
    elif kind == "w_plastic_black":
        m, b = pr(kind)
        b.inputs["Base Color"].default_value = (0.012, 0.012, 0.013, 1)
        b.inputs["Roughness"].default_value = 0.4
    elif kind == "w_signal":  # Stopptaste/Akzent: Signalorange
        m, b = pr(kind)
        b.inputs["Base Color"].default_value = (0.62, 0.16, 0.02, 1)
        b.inputs["Roughness"].default_value = 0.35
    elif kind == "w_rubber":  # Reifen, Griffe
        m, b = pr(kind)
        b.inputs["Base Color"].default_value = (0.012, 0.012, 0.012, 1)
        b.inputs["Roughness"].default_value = 0.85
        lib._bump(m, b, 300, 0.2)
    elif kind == "w_hose":  # Gartenschlauch dunkelgrün, glänzend
        m, b = pr(kind)
        b.inputs["Base Color"].default_value = (0.03, 0.09, 0.035, 1)
        b.inputs["Roughness"].default_value = 0.3
        b.inputs["Coat Weight"].default_value = 0.5
    elif kind == "w_led":  # warmweißes LED-Band
        m, b = pr(kind)
        b.inputs["Base Color"].default_value = (1.0, 0.85, 0.6, 1)
        b.inputs["Emission Color"].default_value = (1.0, 0.82, 0.55, 1)
        b.inputs["Emission Strength"].default_value = 4.0
    elif kind == "w_led_green":  # Statusanzeige Ladestation
        m, b = pr(kind)
        b.inputs["Base Color"].default_value = (0.2, 1.0, 0.3, 1)
        b.inputs["Emission Color"].default_value = (0.2, 1.0, 0.35, 1)
        b.inputs["Emission Strength"].default_value = 6.0
    elif kind == "w_foam":  # aufsprudelndes Wasser: weiß, durchscheinend
        m, b = pr(kind)
        b.inputs["Base Color"].default_value = (0.86, 0.92, 0.93, 1)
        b.inputs["Roughness"].default_value = 0.12
        b.inputs["Transmission Weight"].default_value = 0.45
        b.inputs["Subsurface Weight"].default_value = 0.3
        b.inputs["Coat Weight"].default_value = 1.0
        lib._bump(m, b, 90, 0.5, 3)
    elif kind == "w_clear":  # klares Wasser als dünner Film (Glas mit Wellen)
        m, b = pr(kind)
        b.inputs["Base Color"].default_value = (0.9, 0.97, 0.97, 1)
        b.inputs["Transmission Weight"].default_value = 1.0
        b.inputs["Roughness"].default_value = 0.02
        b.inputs["IOR"].default_value = 1.33
        lib._bump(m, b, 60, 0.35, 3)
    elif kind == "w_water_ripple":  # Wasserfläche mit Ringwellen um den Sprudel (Objektursprung)
        m, b = pr(kind)
        _ramp_noise(m, b, (0.012, 0.05, 0.055), (0.03, 0.1, 0.1), 1.2)
        b.inputs["Roughness"].default_value = 0.02
        b.inputs["Specular IOR Level"].default_value = 0.8
        b.inputs["Coat Weight"].default_value = 0.6
        nt = m.node_tree
        tc = nt.nodes.new("ShaderNodeTexCoord")
        wave = nt.nodes.new("ShaderNodeTexWave")
        wave.wave_type = "RINGS"
        wave.rings_direction = "SPHERICAL"
        wave.inputs["Scale"].default_value = 2.6
        wave.inputs["Distortion"].default_value = 1.2
        wave.inputs["Detail"].default_value = 1.5
        nt.links.new(tc.outputs["Object"], wave.inputs["Vector"])
        # Wellen werden nach außen flacher
        ln = nt.nodes.new("ShaderNodeVectorMath")
        ln.operation = "LENGTH"
        nt.links.new(tc.outputs["Object"], ln.inputs[0])
        fall = nt.nodes.new("ShaderNodeMapRange")
        fall.inputs["From Min"].default_value = 0.08
        fall.inputs["From Max"].default_value = 0.6
        fall.inputs["To Min"].default_value = 1.0
        fall.inputs["To Max"].default_value = 0.12
        nt.links.new(ln.outputs["Value"], fall.inputs["Value"])
        mul = nt.nodes.new("ShaderNodeMath")
        mul.operation = "MULTIPLY"
        nt.links.new(wave.outputs["Fac"], mul.inputs[0])
        nt.links.new(fall.outputs["Result"], mul.inputs[1])
        noise = nt.nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 3.0
        add = nt.nodes.new("ShaderNodeMath")
        add.operation = "MULTIPLY_ADD"
        nt.links.new(noise.outputs["Fac"], add.inputs[0])
        add.inputs[1].default_value = 0.25
        nt.links.new(mul.outputs[0], add.inputs[2])
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.35
        bump.inputs["Distance"].default_value = 0.02
        nt.links.new(add.outputs[0], bump.inputs["Height"])
        nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    elif kind == "w_stone_wet":  # Granit grau, oben und in Rinnsalen nass (dunkler, spiegelnd)
        m, b = pr(kind)
        nt = m.node_tree
        tc = nt.nodes.new("ShaderNodeTexCoord")
        grain = nt.nodes.new("ShaderNodeTexNoise")
        grain.inputs["Scale"].default_value = 90
        grain.inputs["Detail"].default_value = 10
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.35
        ramp.color_ramp.elements[0].color = (0.1, 0.097, 0.09, 1)
        ramp.color_ramp.elements[1].position = 0.65
        ramp.color_ramp.elements[1].color = (0.36, 0.345, 0.32, 1)
        nt.links.new(tc.outputs["Object"], grain.inputs["Vector"])
        nt.links.new(grain.outputs["Fac"], ramp.inputs["Fac"])
        # Nässe: Oberseite (Normale nach oben) plus senkrechte Rinnsale
        geo = nt.nodes.new("ShaderNodeNewGeometry")
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(geo.outputs["Normal"], sep.inputs["Vector"])
        top = nt.nodes.new("ShaderNodeMapRange")
        top.inputs["From Min"].default_value = 0.55
        top.inputs["From Max"].default_value = 0.8
        nt.links.new(sep.outputs["Z"], top.inputs["Value"])
        mp = nt.nodes.new("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = (9.0, 9.0, 0.9)
        nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
        streak = nt.nodes.new("ShaderNodeTexNoise")
        streak.inputs["Scale"].default_value = 3.0
        streak.inputs["Detail"].default_value = 3
        nt.links.new(mp.outputs["Vector"], streak.inputs["Vector"])
        sr = nt.nodes.new("ShaderNodeMapRange")
        sr.inputs["From Min"].default_value = 0.55
        sr.inputs["From Max"].default_value = 0.62
        nt.links.new(streak.outputs["Fac"], sr.inputs["Value"])
        wet = nt.nodes.new("ShaderNodeMath")
        wet.operation = "MAXIMUM"
        nt.links.new(top.outputs["Result"], wet.inputs[0])
        nt.links.new(sr.outputs["Result"], wet.inputs[1])
        dark = nt.nodes.new("ShaderNodeMix")
        dark.data_type = "RGBA"
        dark.blend_type = "MULTIPLY"
        nt.links.new(wet.outputs[0], dark.inputs["Factor"])
        nt.links.new(ramp.outputs["Color"], dark.inputs["A"])
        dark.inputs["B"].default_value = (0.38, 0.4, 0.42, 1)
        nt.links.new(dark.outputs["Result"], b.inputs["Base Color"])
        rough = nt.nodes.new("ShaderNodeMapRange")
        rough.inputs["To Min"].default_value = 0.82
        rough.inputs["To Max"].default_value = 0.06
        nt.links.new(wet.outputs[0], rough.inputs["Value"])
        nt.links.new(rough.outputs["Result"], b.inputs["Roughness"])
        nt.links.new(wet.outputs[0], b.inputs["Coat Weight"])
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.25
        nt.links.new(grain.outputs["Fac"], bump.inputs["Height"])
        nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    elif kind == "w_pebble":  # Flusskiesel: je Kiesel eigene Helligkeit (Voronoi-Zellen), hell und warmgrau
        m, b = pr(kind)
        nt = m.node_tree
        tc = nt.nodes.new("ShaderNodeTexCoord")
        vor = nt.nodes.new("ShaderNodeTexVoronoi")
        vor.inputs["Scale"].default_value = 22
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = (0.13, 0.125, 0.115, 1)
        ramp.color_ramp.elements[1].color = (0.48, 0.46, 0.42, 1)
        nt.links.new(tc.outputs["Object"], vor.inputs["Vector"])
        nt.links.new(vor.outputs["Color"], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
        b.inputs["Roughness"].default_value = 0.6
        lib._bump(m, b, 120, 0.15)
    elif kind == "w_grate":  # Rost/Gitter, verzinkt
        m, b = pr(kind)
        b.inputs["Base Color"].default_value = (0.3, 0.3, 0.29, 1)
        b.inputs["Metallic"].default_value = 0.8
        b.inputs["Roughness"].default_value = 0.45
    elif kind == "w_hole":  # Bohrung, Schlitze: fast schwarz
        m, b = pr(kind)
        b.inputs["Base Color"].default_value = (0.004, 0.004, 0.004, 1)
        b.inputs["Roughness"].default_value = 1.0
    else:
        raise KeyError(kind)
    if kind not in {"w_led", "w_led_green", "w_foam", "w_clear", "w_water_ripple", "w_hole"}:
        lib._ao(m, 0.7)
    return m


def M(kind: str) -> str:
    """Material sicherstellen und Schlüssel zurückgeben (eigene `w_…` oder Bibliotheksmaterial)"""
    if kind not in lib._mats:
        if kind.startswith("w_"):
            lib._mats[kind] = _build(kind)
        else:
            mat(kind)
    return kind


# ------------------------------------------------------------------ Geometrie-Helfer


def tube(name: str, pts: list[Vector], r: float, material: str, res: int = 3, outline: bool = True) -> bpy.types.Object:
    """Rohr/Rundstab entlang eines Polygonzugs (Blender-Vektoren, z. B. aus `P`)"""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = r
    cu.bevel_resolution = res
    cu.use_fill_caps = True
    sp = cu.splines.new("POLY")
    sp.points.add(len(pts) - 1)
    for p, v in zip(sp.points, pts):
        p.co = (v.x, v.y, v.z, 1)
    sp.use_smooth = True
    ob = link(bpy.data.objects.new(name, cu), outline)
    ob.data.materials.append(mat(M(material)))
    return ob


def arc(c: Vector, r: float, a0: float, a1: float, n: int, axis: str = "y") -> list[Vector]:
    """Kreisbogen in der senkrechten Ebene (axis = Normale der Ebene in Plan-Achsen), Winkel 0 = +x bzw. +y"""
    out = []
    for i in range(n + 1):
        a = a0 + (a1 - a0) * i / n
        if axis == "y":
            out.append(c + Vector((math.cos(a) * r, 0, math.sin(a) * r)))
        else:
            out.append(c + Vector((0, -math.cos(a) * r, math.sin(a) * r)))
    return out


def lathe(name: str, prof: list[tuple[float, float]], cx: float, cy: float, material: str, segs: int = 48, outline: bool = True) -> bpy.types.Object:
    """Drehkörper aus Profil [(Radius, z)] von unten nach oben; Radius 0 schließt den Körper"""
    bm = bmesh.new()
    rings = []
    for r, z in prof:
        if r < 1e-6:
            rings.append([bm.verts.new(P(cx, cy, z))])
        else:
            rings.append([bm.verts.new(P(cx + r * math.cos(k / segs * math.tau), cy + r * math.sin(k / segs * math.tau), z)) for k in range(segs)])
    for a, b in zip(rings, rings[1:]):
        if len(a) == 1 and len(b) == 1:
            continue
        if len(a) == 1:
            for k in range(segs):
                bm.faces.new((a[0], b[(k + 1) % segs], b[k]))
        elif len(b) == 1:
            for k in range(segs):
                bm.faces.new((a[k], a[(k + 1) % segs], b[0]))
        else:
            for k in range(segs):
                bm.faces.new((a[k], a[(k + 1) % segs], b[(k + 1) % segs], b[k]))
    if len(rings[0]) > 1:
        bm.faces.new(list(reversed(rings[0])))
    if len(rings[-1]) > 1:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me), outline)
    ob.data.materials.append(mat(M(material)))
    for p in ob.data.polygons:
        p.use_smooth = True
    me.set_sharp_from_angle(angle=math.radians(50))
    return ob


def obox(name: str, cx: float, cy: float, z0: float, z1: float, lx: float, ly: float, ang: float, material: str, bevel: float = 0.0) -> bpy.types.Object:
    """Quader lx × ly um (cx, cy), im Plan um `ang` (rad, im Uhrzeigersinn) gedreht"""
    ob = box(name, -lx / 2, -ly / 2, z0, lx / 2, ly / 2, z1, M(material), bevel)
    ob.data.transform(Matrix.Rotation(-ang, 4, "Z"))
    ob.location = P(cx, cy, 0)
    return ob


def hcyl(name: str, c: Vector, r: float, length: float, axis: str, material: str, verts: int = 40, bevel: float = 0.0) -> bpy.types.Object:
    """liegender Zylinder um Mittelpunkt c (Blender-Vektor), Achse 'x' oder 'y' (Plan)"""
    ob = cylinder(name, 0, 0, -length / 2, length / 2, r, M(material), verts, bevel)
    ob.data.transform(Matrix.Rotation(math.pi / 2, 4, "Y" if axis == "x" else "X"))
    ob.location = c
    return ob


def superblob(name: str, c: Vector, a: float, b: float, cz: float, p: float, material: str, seed: int = 1, noise: float = 0.0, zmin: float | None = None, top_flat: float = 1.0, subdiv: int = 4, outline: bool = True) -> bpy.types.Object:
    """Superellipsoid (p = 2 Kugel, p ≥ 3 abgerundeter Quader), optional verbeult und unten abgeschnitten"""
    r = rng(seed)
    ph = [r.random() * 6 for _ in range(6)]
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1)
    for v in bm.verts:
        d = v.co.normalized()
        s = (abs(d.x) ** p + abs(d.y) ** p + abs(d.z) ** p) ** (1 / p)
        k = 1 + noise * (math.sin(d.x * 2.7 + ph[0]) * math.cos(d.y * 2.3 + ph[1]) + 0.5 * math.sin(d.z * 4.1 + ph[2]) + 0.3 * math.sin((d.x - d.y) * 6.3 + ph[3]) + 0.15 * math.sin((d.y + d.z) * 11 + ph[4]))
        x, y, z = d.x / s * a * k, d.y / s * b * k, d.z / s * cz * k
        if z > 0:
            z *= top_flat
        v.co = Vector((x, y, z)) + c
        if zmin is not None and v.co.z < zmin:
            v.co.z = zmin
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me), outline)
    ob.data.materials.append(mat(M(material)))
    for poly in ob.data.polygons:
        poly.use_smooth = True
    return ob


def bounds(w: float, d: float, h: float):
    """lose Eckpunkte: Blätter und Blüten (Partikel) zählen nicht zur Bildhülle"""
    me = bpy.data.meshes.new("frame")
    me.from_pydata([tuple(P(x, y, z)) for x in (-w / 2, w / 2) for y in (-d / 2, d / 2) for z in (0, h)], [], [])
    link(bpy.data.objects.new("frame", me), outline=False)


def pebbles(name: str, cx: float, cy: float, R: float, rr: random.Random, keep, n: int, size=(0.018, 0.04), z: float = 0.0, groups: int = 5, material: str = "w_pebble"):
    """Kieselbett: abgeflachte, unregelmäßige Kiesel; `keep(x, y)` entscheidet, wo sie liegen dürfen"""
    placed: list[tuple[float, float, float]] = []
    tries = 0
    while len(placed) < n and tries < n * 40:
        tries += 1
        a = rr.uniform(0, math.tau)
        rad = R * math.sqrt(rr.random())
        x, y = cx + math.cos(a) * rad, cy + math.sin(a) * rad
        s = rr.uniform(*size)
        if not keep(x, y):
            continue
        if any((x - px) ** 2 + (y - py) ** 2 < ((s + ps) * 0.82) ** 2 for px, py, ps in placed):
            continue
        placed.append((x, y, s))
    bms = [bmesh.new() for _ in range(groups)]
    for i, (x, y, s) in enumerate(placed):
        bm = bms[i % groups]
        sx, sy, sz = s * rr.uniform(0.9, 1.25), s * rr.uniform(0.7, 1.0), s * rr.uniform(0.45, 0.65)
        mtx = Matrix.Translation(P(x, y, z + sz * 0.55)) @ Matrix.Rotation(rr.uniform(0, math.tau), 4, "Z") @ Matrix.Rotation(rr.uniform(-0.2, 0.2), 4, "X") @ Matrix.Diagonal((sx, sy, sz, 1))
        res = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1, matrix=mtx)
        _ = res
    obs = []
    for g, bm in enumerate(bms):
        me = bpy.data.meshes.new(f"{name}{g}")
        bm.to_mesh(me)
        bm.free()
        ob = link(bpy.data.objects.new(f"{name}{g}", me), outline=False)
        ob.data.materials.append(mat(M(material)))
        for poly in ob.data.polygons:
            poly.use_smooth = True
        obs.append(ob)
    return obs


# ------------------------------------------------------------------ Kletterpflanzen


def _plants():
    """Pflanzen-Bausteine aus plants.py (Blätter, Blattzweige, Blüten, Partikel); Material-Cache je Szene leeren"""
    import plants

    plants.reset_cache()
    return plants


def _rose_obj(pl, petal_hex: str, size: float) -> bpy.types.Object:
    """gefüllte Rosenblüte: zwei versetzte Kränze aus gewölbten Blütenblättern und eine geschlossene Mitte"""
    name = f"R_{petal_hex}_{size:.3f}"
    ob = bpy.data.objects.get(name)
    if ob:
        return ob
    bm = bmesh.new()
    s = size
    for ring, (n, r0, r1, z0, lift, rot) in enumerate(((6, 0.25, 1.0, 0.0, 0.3, 0.0), (5, 0.18, 0.7, 0.12, 0.55, 0.5))):
        c = bm.verts.new((0, 0, s * z0))
        for i in range(n):
            am = (i + rot) / n * math.tau
            a0, a1 = am - 0.55 * math.tau / n, am + 0.55 * math.tau / n
            v1 = bm.verts.new((math.cos(a0) * s * r0, math.sin(a0) * s * r0, s * (z0 + 0.1)))
            v2 = bm.verts.new((math.cos(am - 0.25) * s * r1 * 0.9, math.sin(am - 0.25) * s * r1 * 0.9, s * (z0 + lift)))
            v3 = bm.verts.new((math.cos(am) * s * r1, math.sin(am) * s * r1, s * (z0 + lift * 0.8)))
            v4 = bm.verts.new((math.cos(am + 0.25) * s * r1 * 0.9, math.sin(am + 0.25) * s * r1 * 0.9, s * (z0 + lift)))
            v5 = bm.verts.new((math.cos(a1) * s * r0, math.sin(a1) * s * r0, s * (z0 + 0.1)))
            bm.faces.new((c, v1, v2, v3))
            bm.faces.new((c, v3, v4, v5))
    core = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=s * 0.24)
    for v in core["verts"]:
        v.co.z = v.co.z * 0.8 + s * 0.3
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me), outline=False)
    ob.data.materials.append(pl.flat_material(petal_hex, 0.5))
    for poly in ob.data.polygons:
        poly.use_smooth = True
    ob.hide_render = True
    ob.location = (900, 900, -900)
    return ob


def _sample_path(pts: list[Vector], step: float) -> list[Vector]:
    out = [pts[0]]
    for a, b in zip(pts, pts[1:]):
        L = (b - a).length
        n = max(1, int(L / step))
        out += [a + (b - a) * (i / n) for i in range(1, n + 1)]
    return out


def climber_on(name: str, paths: list[list[Vector]], rr: random.Random, leaf_hex: str, leaf_size: float, blooms: list[tuple[str, float, str, float]],
               rad: tuple[float, float] = (0.05, 0.085), step: float = 0.06, flat_axis: str | None = None, flat: float = 1.0, coverage: float = 2.8, stray: float = 0.25):
    """
    Kletterpflanze entlang von Trieben (Polygonzüge in Blender-Koordinaten).

    Triebe als dünne Äste; darum ein Laubkern aus verschmolzenen, verbeulten Kugeln (dunkel – Lücken lesen
    sich als beschattetes Laub). Blattzweige sitzen als Partikel dicht auf der Kernoberfläche, ein Teil im
    Inneren für Tiefe; einzelne Kugeln stehen weiter ab (fransiger Umriss).
    `blooms` = [(Farbe, Größe, Form 'rose'/'saucer'/'ball', Blüten je m² Kernfläche)].
    `flat_axis` = 'x' oder 'y' (Blender) drückt das Laub flach (Rankwand).
    """
    pl = _plants()
    br = pl.Branches(f"{name}_stems")
    bm = bmesh.new()
    area = 0.0
    for path in paths:
        pts = _sample_path(path, step)
        stem = [p + Vector((rr.uniform(-0.012, 0.012), rr.uniform(-0.012, 0.012), 0)) for p in pts[:: max(1, len(pts) // 16)]]
        if len(stem) >= 2:
            br.add(stem, [0.011 * (1 - 0.6 * i / len(stem)) for i in range(len(stem))])
        for i, p in enumerate(pts):
            t = i / max(1, len(pts) - 1)
            r_ = rr.uniform(*rad) * (1.0 - 0.3 * t)
            off = Vector((rr.gauss(0, r_ * 0.35), rr.gauss(0, r_ * 0.35), rr.gauss(0, r_ * 0.3)))
            if rr.random() < stray:  # abstehende Triebspitze
                off = off * 2.6
                r_ *= 0.6
            sx = sy = r_
            if flat_axis == "x":
                sx *= flat
                off.x *= flat
            elif flat_axis == "y":
                sy *= flat
                off.y *= flat
            res = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1, matrix=Matrix.Translation(p + off) @ Matrix.Diagonal((sx, sy, r_ * 0.85, 1)))
            ph = rr.uniform(0, 6)
            for v in res["verts"]:
                d = (v.co - (p + off)).normalized()
                v.co += d * r_ * 0.18 * math.sin(d.x * 3.1 + ph) * math.sin(d.y * 2.7 + ph * 1.3 + d.z * 2.0)
            area += 4 * math.pi * r_ * r_ * (0.75 if flat_axis else 1.0)
    me = bpy.data.meshes.new(f"{name}_core")
    bm.to_mesh(me)
    bm.free()
    core = link(bpy.data.objects.new(f"{name}_core", me), outline=False)
    core.data.materials.append(pl.core_material(leaf_hex))
    for poly in core.data.polygons:
        poly.use_smooth = True
    lm = pl.leaf_material(leaf_hex)
    spray = pl.leaf_spray(lm, leaf_size, "oval", 5)
    spray_area = 5 * 0.7 * leaf_size**2
    n = area * coverage / spray_area
    pl.emit(core, spray, n, rr.randint(1, 99999), 0.5, random_rot=1.0)
    pl.emit(core, pl.leaf_obj(lm, leaf_size, "oval"), n * 1.2, rr.randint(1, 99999), 0.5, random_rot=1.0)
    pl.emit(core, spray, n * 0.25, rr.randint(1, 99999), 0.5, volume=True, random_rot=1.0)
    for hex_, size, kind, per_m2 in blooms:
        fl = _rose_obj(pl, hex_, size) if kind == "rose" else pl.flower_obj(hex_, size, kind)
        pl.emit(core, fl, area * per_m2, rr.randint(1, 99999), 0.35, random_rot=0.35)
    return core


# ------------------------------------------------------------------ Wasser


def spring_stone(w: float, d: float, h: float):
    """Quellstein: gebohrter Granitblock, Wasser quillt oben aus der Bohrung und läuft als Film herab; Kiesbett aus Flusskieseln"""
    R = min(w, d) / 2
    rr = rng(31)
    # Kiesbett: unregelmäßiger Umriss, flache Mulde aus Splitt, darauf Flusskiesel
    n = 72
    ph = [rr.random() * 6 for _ in range(3)]

    def rim(a):
        return R * (0.93 + 0.04 * math.sin(3 * a + ph[0]) + 0.025 * math.sin(5 * a + ph[1]) + 0.015 * math.sin(9 * a + ph[2]))

    ring = [P(math.cos(k / n * math.tau) * rim(k / n * math.tau), math.sin(k / n * math.tau) * rim(k / n * math.tau), 0.012) for k in range(n)]
    bed = poly_mesh("bed", ring, [list(range(n))], "gravel_light")
    sol = bed.modifiers.new("t", "SOLIDIFY")
    sol.thickness = 0.03
    sol.offset = -1
    bed.data.polygons[0].use_smooth = False
    # Stein: abgerundeter, leicht unregelmäßiger Block
    sa, sb = 0.21, 0.18
    stone_h = h - 0.035
    stone = superblob("stone", P(0.0, 0.0, stone_h * 0.5), sa, sb, stone_h * 0.5, 3.4, "w_stone_wet", seed=5, noise=0.045, zmin=-0.01, top_flat=1.0)
    stone.rotation_euler = (0, 0, 0.35)
    # Oberkante in der Mitte bestimmen (für Bohrung und Wasserkuppe)
    top = max(v.co.z for v in stone.data.vertices if (v.co.x ** 2 + v.co.y ** 2) < 0.04 ** 2)
    # Bohrung mit Wasserkuppe: klares, gewölbtes Wasser, in der Mitte aufsprudelnd weiß
    cylinder("bore", 0, 0, top - 0.01, top + 0.002, 0.022, M("w_hole"), 32)
    lathe("dome", [(0.0, top - 0.004), (0.11, top - 0.004), (0.1, top + 0.004), (0.075, top + 0.012), (0.045, top + 0.02), (0.0, top + 0.024)], 0, 0, "w_clear", 64, outline=False)
    foam = lathe("bubble", [(0.0, top), (0.032, top), (0.03, top + 0.012), (0.02, top + 0.024), (0.0, top + 0.03)], 0, 0, "w_foam", 32, outline=False)
    foam.scale = (1, 1, 1)
    # Wasserfilm an den Seiten: dünne, klare Rinnsale über die Kante
    for k, (ax, ay) in enumerate(((1, 0.15), (-0.7, 0.75), (0.2, 1), (-1, -0.2), (0.4, -0.95))):
        L = math.hypot(ax, ay)
        ux, uy = ax / L, ay / L
        pts = []
        for i in range(9):
            t = i / 8
            rad_top = 0.06 + t * 0.12
            if t < 0.5:
                z = top - 0.01 - t * 0.05
                rr_ = 0.06 + t * 0.26
            else:
                rr_ = 0.19
                z = top - 0.035 - (t - 0.5) * 2 * (stone_h - 0.05)
            _ = rad_top
            pts.append(P(ux * (rr_ * (sa if abs(ux) > abs(uy) else sb) / 0.19), uy * (rr_ * (sa if abs(ux) > abs(uy) else sb) / 0.19), z))
        # Rinnsale liegen als flache Bänder an der Steinoberfläche – über `shrinkwrap` angeschmiegt
        film = tube(f"film{k}", pts, 0.012, "w_clear", res=2, outline=False)
        film.data.bevel_depth = 0.014
        sw = film.modifiers.new("sw", "SHRINKWRAP")
        sw.target = stone
        sw.offset = 0.002
        sw.wrap_mode = "OUTSIDE_SURFACE"
    # Flusskiesel rund um den Stein
    def keep(x, y):
        # Plan-y → Blender −y; Stein ist um 0,35 rad gedreht
        c, s = math.cos(0.35), math.sin(0.35)
        bx, by = x, -y
        lx, ly = c * bx + s * by, -s * bx + c * by
        if (lx / (sa + 0.035)) ** 2 + (ly / (sb + 0.035)) ** 2 < 1:
            return False
        return math.hypot(x, y) < rim(math.atan2(y, x)) - 0.025
    pebbles("peb", 0, 0, R, rr, keep, 330, (0.016, 0.038), 0.01)
    # nasser Ring um den Stein: dunkler, glänzender Splitt
    wet = cylinder("wetring", 0, 0, 0.012, 0.016, 0.3, M("w_clear"), 64)
    wet.scale = (1.05, 0.95, 1)


def water_table(w: float, d: float, h: float):
    """Wassertisch: quadratisches Becken aus Cortenstahl mit Abkantung, Wasser bis knapp unter den Rand, Sprudel in der Mitte"""
    t = 0.012
    hb = h - 0.08  # Beckenrand
    lip = 0.045
    # Wände
    box("wall_n", -w / 2, -d / 2, 0, w / 2, -d / 2 + t, hb, "corten")
    box("wall_s", -w / 2, d / 2 - t, 0, w / 2, d / 2, hb, "corten")
    box("wall_w", -w / 2, -d / 2, 0, -w / 2 + t, d / 2, hb, "corten")
    box("wall_e", w / 2 - t, -d / 2, 0, w / 2, d / 2, hb, "corten")
    # Abkantung oben, nach innen; auf Gehrung gestoßen
    o = -0.002
    ring = [P(-w / 2 + o, -d / 2 + o, hb), P(w / 2 - o, -d / 2 + o, hb), P(w / 2 - o, d / 2 - o, hb), P(-w / 2 + o, d / 2 - o, hb)]
    inner = [P(-w / 2 + lip, -d / 2 + lip, hb), P(w / 2 - lip, -d / 2 + lip, hb), P(w / 2 - lip, d / 2 - lip, hb), P(-w / 2 + lip, d / 2 - lip, hb)]
    for k in range(4):
        ob = poly_mesh("lip", [ring[k], ring[(k + 1) % 4], inner[(k + 1) % 4], inner[k]], [[0, 1, 2, 3]], "corten")
        sol = ob.modifiers.new("t", "SOLIDIFY")
        sol.thickness = 0.008
        sol.offset = 1
        bev = ob.modifiers.new("b", "BEVEL")
        bev.width = 0.002
        bev.limit_method = "ANGLE"
    # Innenseite der Abkantung (kurzer Steg nach unten) und dunkle Innenwand über dem Wasser
    zw = hb - 0.03
    for (a, b_, c, d_) in ((-w / 2 + lip - 0.008, -d / 2 + lip - 0.008, w / 2 - lip + 0.008, -d / 2 + lip), (-w / 2 + lip - 0.008, d / 2 - lip, w / 2 - lip + 0.008, d / 2 - lip + 0.008),
                          (-w / 2 + lip - 0.008, -d / 2 + lip, -w / 2 + lip, d / 2 - lip), (w / 2 - lip, -d / 2 + lip, w / 2 - lip + 0.008, d / 2 - lip)):
        box("lipfold", a, b_, zw - 0.01, c, d_, hb, "corten")
    # Wasser mit Ringwellen um den Sprudel
    box("water", -w / 2 + lip, -d / 2 + lip, zw - 0.05, w / 2 - lip, d / 2 - lip, zw, M("w_water_ripple"))
    # Sprudel: flache klare Kuppe, darauf weißer Schaum, ein paar Tropfen
    lathe("swell", [(0.0, zw - 0.002), (0.26, zw - 0.002), (0.2, zw + 0.004), (0.13, zw + 0.016), (0.07, zw + 0.03), (0.0, zw + 0.036)], 0, 0, "w_clear", 64, outline=False)
    r = rng(8)
    bm = bmesh.new()
    for i in range(16):
        a = r.uniform(0, math.tau)
        rad = r.uniform(0, 0.055)
        s = r.uniform(0.018, 0.036)
        bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1, matrix=Matrix.Translation(P(math.cos(a) * rad, math.sin(a) * rad, zw + 0.03 + r.uniform(0, 0.03) * (1 - rad / 0.06))) @ Matrix.Diagonal((s, s, s * 0.8, 1)))
    me = bpy.data.meshes.new("foam")
    bm.to_mesh(me)
    bm.free()
    foam = link(bpy.data.objects.new("foam", me), outline=False)
    foam.data.materials.append(mat(M("w_foam")))
    for poly in foam.data.polygons:
        poly.use_smooth = True
    for i in range(10):
        a = r.uniform(0, math.tau)
        rad = r.uniform(0.04, 0.12)
        s = r.uniform(0.005, 0.009)
        cylinder("drop", 0, 0, 0, 1, 1, M("w_foam"), 12).data.transform(Matrix.Translation(P(math.cos(a) * rad, math.sin(a) * rad, zw + r.uniform(0.03, 0.1))) @ Matrix.Diagonal((s, s, s * 2.5, 1)) @ Matrix.Translation((0, 0, -0.5)))


def cistern_lid(w: float, d: float, h: float):
    """Domdeckel einer unterirdischen Zisterne: Teleskop-Domschacht anthrazit, begehbarer Deckel mit Rillen und Kindersicherung"""
    R = min(w, d) / 2
    # Schachtkragen: schmaler Ring, bündig im Rasen
    lathe("collar", [(R - 0.07, h * 0.3), (R - 0.07, 0.0), (R, 0.0), (R, h * 0.25), (R - 0.012, h * 0.42), (R - 0.05, h * 0.42), (R - 0.05, h * 0.3)], 0, 0, "w_pe_dark", 96)
    # Deckel: flach gewölbt, umlaufender Rand; konzentrische Rillen als Trittschutz
    Rl = R - 0.055
    prof = [(0.0, h * 0.2), (Rl, h * 0.2), (Rl, h * 0.62), (Rl - 0.012, h * 0.72)]
    for k, rr_ in enumerate((0.88, 0.76, 0.64, 0.52, 0.4)):
        rad = Rl * rr_
        z = h * (0.72 + 0.28 * (1 - rr_) / 0.6)
        prof += [(rad + 0.008, z), (rad + 0.004, z - 0.006), (rad - 0.004, z - 0.006), (rad - 0.008, z)]
    prof += [(Rl * 0.28, h * 0.98), (0.0, h)]
    lathe("lid", prof, 0, 0, "w_pe_dark", 128)
    # Mittelplatte mit Wassertropfen-Prägung angedeutet
    cylinder("badge", 0, 0, h - 0.003, h + 0.002, Rl * 0.2, M("w_plastic_black"), 64, 0.002)
    lathe("drop_emboss", [(0.0, h + 0.002), (0.018, h + 0.002), (0.012, h + 0.005), (0.0, h + 0.006)], 0, 0.01, "w_steel", 24, outline=False)
    # Kindersicherung: zwei Verschlussschrauben, Aushebemulden
    for sgn in (-1, 1):
        x = sgn * Rl * 0.94
        cylinder("lockpit", x, 0, h * 0.55, h * 0.74, 0.022, M("w_hole"), 24)
        cylinder("lock", x, 0, h * 0.58, h * 0.7, 0.014, M("w_steel"), 6, 0.002)
        cylinder("grip", 0, sgn * Rl * 0.93, h * 0.6, h * 0.74, 0.03, M("w_plastic_black"), 32)


def hand_pump(w: float, d: float, h: float):
    """Schwengelpumpe aus Gusseisen auf Natursteinplatte; Auslauf nach Plan-Süden, Schwengel nach hinten, Ablaufrost unter dem Auslauf"""
    slab_h = 0.08
    box("slab", -w / 2, -d / 2, 0, w / 2, d / 2, slab_h, "stone", 0.012)
    cy = -0.04
    z0 = slab_h
    # Pumpenstock: Fuß, schlanker Schaft, Zylinderkopf mit Ringwulsten, Kuppel
    prof = [(0.0, z0), (0.105, z0), (0.105, z0 + 0.02), (0.085, z0 + 0.035), (0.075, z0 + 0.06), (0.058, z0 + 0.09),
            (0.052, z0 + 0.5), (0.062, z0 + 0.52), (0.062, z0 + 0.545), (0.054, z0 + 0.56), (0.07, z0 + 0.6), (0.075, z0 + 0.62),
            (0.075, z0 + 0.84), (0.085, z0 + 0.855), (0.085, z0 + 0.875), (0.072, z0 + 0.885), (0.06, z0 + 0.93), (0.035, z0 + 0.965), (0.0, z0 + 0.975)]
    lathe("pump", prof, 0, cy, "w_castiron", 64)
    # Zierknopf
    lathe("finial", [(0.0, z0 + 0.97), (0.012, z0 + 0.97), (0.012, z0 + 0.99), (0.022, z0 + 1.01), (0.012, z0 + 1.035), (0.0, z0 + 1.04)], 0, cy, "w_castiron", 24)
    # Auslauf: Rohr nach Süden, vorne nach unten gebogen, verdickte Mündung
    zs = z0 + 0.68
    pts = [P(0, cy + 0.05, zs), P(0, cy + 0.14, zs), P(0, cy + 0.2, zs - 0.012), P(0, cy + 0.235, zs - 0.045), P(0, cy + 0.245, zs - 0.09)]
    tube("spout", pts, 0.022, "w_castiron", 4)
    lathe("mouth", [(0.0, zs - 0.105), (0.028, zs - 0.105), (0.028, zs - 0.085), (0.02, zs - 0.075), (0.0, zs - 0.075)], 0, cy + 0.245, "w_castiron", 24)
    # Wasserstrahl aus dem Auslauf
    lathe("jet", [(0.0, slab_h + 0.004), (0.011, slab_h + 0.004), (0.008, zs - 0.2), (0.0105, zs - 0.105), (0.0, zs - 0.104)], 0, cy + 0.245, "w_clear", 16, outline=False)
    # Schwengel: Gabel am Kopf, langer Hebel nach hinten oben mit Kugelgriff
    zp = z0 + 0.94
    for sx in (-0.022, 0.022):
        box("fork", sx - 0.007, cy - 0.11, zp - 0.04, sx + 0.007, cy - 0.04, zp + 0.035, M("w_castiron"), 0.003)
    hcyl("pivot", P(0, cy - 0.09, zp), 0.009, 0.07, "x", "w_steel", 16)
    lever = [P(0, cy - 0.01, zp + 0.01), P(0, cy - 0.09, zp), P(0, cy - 0.15, zp + 0.06), P(0, cy - 0.19, zp + 0.16), P(0, cy - 0.205, h - 0.06)]
    tube("lever", lever, 0.014, "w_castiron", 4)
    lathe("knob", [(0.0, h - 0.07), (0.018, h - 0.065), (0.024, h - 0.04), (0.02, h - 0.015), (0.0, h)], 0, cy - 0.205, "w_castiron", 24)
    # Kolbenstange zwischen Schwengel und Kopf
    tube("rod", [P(0, cy + 0.0, z0 + 0.96), P(0, cy - 0.005, zp + 0.012)], 0.007, "w_steel", 2)
    # Ablaufrost unter dem Auslauf
    gx0, gx1, gy0, gy1 = -0.1, 0.1, cy + 0.17, d / 2 - 0.04
    box("drain", gx0, gy0, slab_h - 0.004, gx1, gy1, slab_h + 0.002, M("w_hole"))
    x = gx0
    while x < gx1 - 0.005:
        box("bar", x, gy0, slab_h - 0.003, x + 0.008, gy1, slab_h + 0.004, M("w_grate"))
        x += 0.02
    for y in (gy0, gy1 - 0.008):
        box("gframe", gx0 - 0.006, y, slab_h - 0.003, gx1 + 0.006, y + 0.008, slab_h + 0.005, M("w_grate"))
    # Bodenplatte des Pumpenfußes mit vier Schrauben
    for sx in (-1, 1):
        for sy in (-1, 1):
            cylinder("bolt", sx * 0.07, cy + sy * 0.07, z0 + 0.018, z0 + 0.03, 0.009, M("w_steel"), 6, 0.002)


# ------------------------------------------------------------------ Technik


def power_post(w: float, d: float, h: float):
    """Außensteckdosensäule: Aluminiumprofil anthrazit, Edelstahl-Front mit zwei Schuko-Dosen (Klappdeckel), Kopf mit LED-Licht"""
    s = 0.12
    box("foot", -w / 2 + 0.02, -d / 2 + 0.02, 0, w / 2 - 0.02, d / 2 - 0.02, 0.012, M("w_steel"), 0.003)
    box("body", -s / 2, -s / 2, 0.012, s / 2, s / 2, h - 0.06, "anthracite", 0.004)
    # Kopf: Edelstahlkappe, darunter umlaufendes LED-Band
    box("led", -s / 2 + 0.004, -s / 2 + 0.004, h - 0.06, s / 2 - 0.004, s / 2 - 0.004, h - 0.045, M("w_led"))
    box("cap", -s / 2 - 0.006, -s / 2 - 0.006, h - 0.045, s / 2 + 0.006, s / 2 + 0.006, h, M("w_steel"), 0.004)
    # Front (Plan-Süden): Edelstahlblende
    fy = s / 2
    box("front", -s / 2 + 0.012, fy, 0.3, s / 2 - 0.012, fy + 0.004, h - 0.12, M("w_steel"), 0.002)
    for zc in (0.48, 0.66):
        # Steckdose: runder Kragen, Vertiefung, Klappdeckel mit Scharnier oben (leicht geöffnet bei der unteren)
        hcyl("socketring", P(0, fy + 0.006, zc), 0.032, 0.006, "y", "w_plastic_black", 32)
        if zc < 0.5:
            hcyl("socketpit", P(0, fy + 0.009, zc), 0.022, 0.004, "y", "w_hole", 32)
            for sx in (-0.008, 0.008):
                hcyl("pin", P(sx, fy + 0.011, zc), 0.0025, 0.002, "y", "w_steel", 8)
            # geöffneter Deckel ragt nach vorn
            a = math.radians(70)
            o = P(-0.036, fy + 0.012, zc + 0.04)
            e = Vector((1, 0, 0))
            s_ = Vector((0, -math.sin(a), -math.cos(a)))
            n_ = e.cross(s_)
            plate("cover", o, e, s_, n_, 0.072, 0.075, 0.008, "graphite")
        else:
            box("cover", -0.036, fy + 0.008, zc - 0.036, 0.036, fy + 0.02, zc + 0.04, "graphite", 0.004)
        box("hinge", -0.03, fy + 0.006, zc + 0.038, 0.03, fy + 0.016, zc + 0.046, "graphite")
    # Erdspieß-Fuß verschraubt
    for sx in (-1, 1):
        for sy in (-1, 1):
            cylinder("screw", sx * (w / 2 - 0.04), sy * (d / 2 - 0.04), 0.012, 0.016, 0.006, M("w_steel"), 6)


def tap_post(w: float, d: float, h: float):
    """Wasserzapfsäule: runde Edelstahlsäule auf Betonplatte mit Ablaufrost, Zapfhahn oben, Schlauchanschluss unten"""
    box("slab", -w / 2, -d / 2, 0, w / 2, d / 2, 0.04, "concrete", 0.006)
    # Rost vor der Säule (Plan-Süden)
    gx0, gx1, gy0, gy1 = -w / 2 + 0.03, w / 2 - 0.03, -0.0, d / 2 - 0.03
    box("drain", gx0, gy0, 0.03, gx1, gy1, 0.041, M("w_hole"))
    x = gx0 + 0.006
    while x < gx1 - 0.004:
        box("bar", x, gy0, 0.032, x + 0.006, gy1, 0.043, M("w_steel"))
        x += 0.016
    box("gframe", gx0, gy0, 0.032, gx1, gy0 + 0.006, 0.044, M("w_steel"))
    box("gframe", gx0, gy1 - 0.006, 0.032, gx1, gy1, 0.044, M("w_steel"))
    cy = -0.05
    r = 0.04
    lathe("post", [(0.0, 0.04), (r + 0.012, 0.04), (r + 0.012, 0.055), (r, 0.065), (r, h - 0.03), (r * 0.8, h - 0.008), (0.0, h)], 0, cy, "w_steel", 48)
    def tap(z: float, big: bool):
        y0 = cy + r - 0.004
        L = 0.06 if big else 0.045
        hcyl("tapbody", P(0, y0 + L / 2, z), 0.015 if big else 0.013, L, "y", "w_steel", 24)
        hcyl("nut", P(0, y0 + 0.012, z), 0.019, 0.016, "y", "w_steel", 6)
        if big:
            # Auslauf nach unten, Hebelgriff oben
            tube("outlet", [P(0, y0 + L - 0.008, z), P(0, y0 + L + 0.005, z - 0.012), P(0, y0 + L + 0.008, z - 0.045)], 0.011, "w_steel", 3)
            cylinder("stem", 0, y0 + L * 0.45, z + 0.012, z + 0.03, 0.006, M("w_steel"), 12)
            obox("handle", 0, y0 + L * 0.45 - 0.02, z + 0.028, z + 0.038, 0.016, 0.075, 0.0, "anthracite", 0.004)
        else:
            # Schlauchanschluss (Kupplungsstück anthrazit) und Flügelgriff
            hcyl("coupling", P(0, y0 + L + 0.015, z), 0.016, 0.03, "y", "graphite", 24, 0.002)
            obox("wing", 0, y0 + L * 0.5, z + 0.013, z + 0.022, 0.05, 0.012, 0.0, "anthracite", 0.003)
    tap(h - 0.17, True)
    tap(0.3, False)


def mower_garage(w: float, d: float, h: float):
    """Mähroboter in Garage: Seitenwangen und Pultdach aus Thermoholz-Latten auf anthrazit Rahmen, Ladestation hinten, Roboter fährt nach Plan-Süden heraus"""
    t = 0.02
    yb, yf = -d / 2, d / 2 - 0.14  # Dachtiefe; Roboternase ragt vorn heraus
    hz_b, hz_f = h, h - 0.07
    # Rahmen: vier Pfosten, Wangen aus Latten
    for x in (-w / 2, w / 2 - t):
        for y in (yb, yf - t):
            zt = hz_b if y < 0 else hz_f
            box("post", x, y, 0, x + t, y + t, zt - 0.03, "anthracite", 0.003)
        z = 0.06
        while z < hz_f - 0.07:
            box("slat", x - 0.003, yb + t, z, x + t + 0.003, yf - t, z + 0.055, "wood_grey", 0.003)
            z += 0.07
    # Pultdach: Latten quer, leicht geneigt nach vorn, mit Fugen; anthrazit Rahmen ringsum
    a = math.atan2(hz_b - hz_f, yf - yb)
    L = (yf - yb) / math.cos(a)
    e = Vector((1, 0, 0))
    s_ = Vector((0, -math.cos(a), -math.sin(a)))
    n_ = e.cross(s_)
    if n_.z < 0:
        n_ = -n_
    o = P(-w / 2 - 0.02, yb - 0.02, hz_b - 0.03)
    plate("roofframe", o, e, s_, n_, w + 0.04, L + 0.04, 0.03, "anthracite")
    nsl = 7
    for i in range(nsl):
        u = 0.02 + i * (L) / nsl
        plate("roofslat", o + n_ * 0.03 + s_ * (u + 0.004) + e * 0.025, e, s_, n_, w - 0.01, L / nsl - 0.01, 0.018, "wood_grey")
    # Ladestation: flache Bodenplatte mit Rampe, Ladesäule hinten mit Status-LED
    box("plate", -0.24, yb + 0.05, 0, 0.24, 0.12, 0.018, M("w_plastic_black"), 0.006)
    poly_mesh("ramp", [P(-0.24, 0.12, 0.018), P(0.24, 0.12, 0.018), P(0.24, 0.2, 0.0), P(-0.24, 0.2, 0.0)], [[0, 1, 2, 3]], M("w_plastic_black"))
    box("charger", -0.09, yb + 0.04, 0.018, 0.09, yb + 0.13, 0.2, M("w_plastic_black"), 0.012)
    box("charger_top", -0.085, yb + 0.045, 0.2, 0.085, yb + 0.125, 0.21, M("w_plastic_light"), 0.004)
    box("status", -0.012, yb + 0.13, 0.15, 0.012, yb + 0.132, 0.16, M("w_led_green"))
    # Roboter: dunkle Wanne, hellgraue Haube, Hinterräder, Stopptaste
    ry = 0.1
    rz = 0.018
    superblob("chassis", P(0, ry, rz + 0.07), 0.24, 0.32, 0.06, 3.0, "w_plastic_black", seed=2, zmin=rz + 0.03)
    shell = superblob("shell", P(0, ry + 0.01, rz + 0.1), 0.235, 0.3, 0.13, 2.6, "w_plastic_light", seed=3, zmin=rz + 0.11, top_flat=0.85)
    _ = shell
    for sx in (-1, 1):
        hcyl("wheel", P(sx * 0.255, ry - 0.13, rz + 0.1), 0.1, 0.05, "x", "w_rubber", 48, 0.006)
        hcyl("hub", P(sx * 0.282, ry - 0.13, rz + 0.1), 0.045, 0.006, "x", "graphite", 32)
    # Bedienfeld oben mit Stopptaste
    top = rz + 0.11 + 0.13 * 0.85
    lathe("stop", [(0.0, top - 0.012), (0.038, top - 0.012), (0.038, top + 0.004), (0.03, top + 0.012), (0.0, top + 0.014)], 0, ry - 0.06, "w_signal", 32)
    box("panel", -0.06, ry + 0.02, top - 0.02, 0.06, ry + 0.09, top - 0.004, M("w_plastic_black"), 0.008)
    # vorderer Stoßfänger, Laderkontakte
    lathe("caster", [(0.0, rz), (0.03, rz), (0.03, rz + 0.04), (0.0, rz + 0.04)], 0, ry + 0.24, "w_rubber", 24)
    bounds(w, d, h)


def hose_reel(w: float, d: float, h: float):
    """Schlauchwagen: anthrazit Rohrrahmen, Trommel mit aufgewickeltem Schlauch, Kurbel, zwei Räder, Spritze vorn am Boden"""
    rw = 0.13  # Radradius
    ax_y = 0.06
    ax_z = rw
    cz = 0.4  # Trommelachse
    cy = -0.02
    hw = w / 2 - 0.06  # halbe Spurweite bis zur Radmitte
    # Räder mit Felge
    for sx in (-1, 1):
        hcyl("tyre", P(sx * hw, ax_y, ax_z), rw, 0.045, "x", "w_rubber", 48, 0.01)
        hcyl("rim", P(sx * (hw + 0.005), ax_y, ax_z), rw * 0.62, 0.04, "x", "graphite", 40, 0.004)
        hcyl("hubcap", P(sx * (hw + 0.025), ax_y, ax_z), 0.025, 0.012, "x", "w_steel", 24, 0.003)
    tube("axle", [P(-hw, ax_y, ax_z), P(hw, ax_y, ax_z)], 0.01, "w_steel", 2)
    # Rahmen: Seitenbügel von der Achse über die Trommel zum Griff, Standbügel vorn
    fr = 0.014
    sw = hw - 0.05
    for sx in (-1, 1):
        x = sx * sw
        tube("rail", [P(x, ax_y, ax_z), P(x, cy + 0.02, cz - 0.05), P(x, cy - 0.06, cz + 0.12), P(x, -d / 2 + 0.06, h - 0.07), P(x * 0.95, -d / 2 + 0.04, h - 0.03)], fr, "anthracite", 3)
        tube("leg", [P(x, ax_y, ax_z), P(x, cy + 0.13, cz - 0.12), P(x, d / 2 - 0.05, 0.03), P(x, d / 2 - 0.02, 0.012)], fr, "anthracite", 3)
        cylinder("foot", x, d / 2 - 0.03, 0.0, 0.02, 0.022, M("w_rubber"), 16)
    tube("handle_bar", [P(-sw * 0.95, -d / 2 + 0.04, h - 0.03), P(sw * 0.95, -d / 2 + 0.04, h - 0.03)], fr, "anthracite", 3)
    hcyl("grip", P(0, -d / 2 + 0.04, h - 0.03), 0.02, sw * 1.2, "x", "w_rubber", 24, 0.004)
    tube("brace", [P(-sw, cy + 0.11, cz - 0.1), P(sw, cy + 0.11, cz - 0.1)], 0.01, "anthracite", 2)
    # Trommel: Kern, Seitenscheiben mit Speichenaussparungen angedeutet
    dw = sw - 0.03
    hcyl("core", P(0, cy, cz), 0.07, 2 * dw, "x", "graphite", 32)
    for sx in (-1, 1):
        hcyl("flange", P(sx * dw, cy, cz), 0.2, 0.012, "x", "graphite", 64, 0.003)
        hcyl("boss", P(sx * (dw + 0.012), cy, cz), 0.035, 0.02, "x", "w_steel", 24, 0.003)
    # Schlauch: drei Wickellagen als durchgehende Schraubenlinie (hin und zurück)
    rh = 0.0125
    pts = []
    xa, xb = -dw + 0.012 + rh, dw - 0.012 - rh
    turns = int((xb - xa) / (2 * rh))
    for layer in range(4):
        rad = 0.07 + rh + layer * 2 * rh * 0.92
        for i in range(turns * 24 + 1):
            u = i / (turns * 24)
            x = xa + (xb - xa) * (u if layer % 2 == 0 else 1 - u)
            ang = u * turns * math.tau + layer * 0.7
            pts.append(P(x, cy + math.cos(ang) * rad, cz + math.sin(ang) * rad))
    tube("hose", pts, rh, "w_hose", 2)
    # Schlauchende: von der Trommel vorn hinunter zum Boden, Spritze liegt vorn
    rad = 0.07 + rh + 3 * 2 * rh * 0.92
    end = [P(xb, cy + rad * 0.2, cz + rad * 0.98), P(xb + 0.005, cy + rad * 0.9, cz + rad * 0.4), P(xb, cy + rad + 0.02, cz - 0.1), P(xb - 0.02, cy + 0.2, 0.08), P(xb - 0.06, d / 2 - 0.06, rh), P(xb - 0.16, d / 2 - 0.03, rh)]
    tube("hose_end", end, rh, "w_hose", 2)
    # Spritze: Pistolenbrause anthrazit/edelstahl
    nx, ny = xb - 0.16, d / 2 - 0.03
    hcyl("nozzle", P(nx - 0.06, ny, 0.02), 0.016, 0.12, "x", "graphite", 20, 0.004)
    hcyl("nozzle_tip", P(nx - 0.13, ny, 0.02), 0.012, 0.03, "x", "w_steel", 16)
    obox("trigger", nx - 0.03, ny - 0.03, 0.005, 0.03, 0.02, 0.07, 0.0, "anthracite", 0.004)
    # Kurbel rechts
    kx = dw + 0.03
    tube("crank_arm", [P(kx, cy, cz), P(kx, cy + 0.11, cz - 0.07)], 0.009, "anthracite", 2)
    hcyl("crank_grip", P(kx + 0.035, cy + 0.11, cz - 0.07), 0.013, 0.06, "x", "w_rubber", 16, 0.003)
    bounds(w, d, h)


# ------------------------------------------------------------------ Rankhilfen


def rose_arch(w: float, d: float, h: float):
    """Rosenbogen aus Rundstahl anthrazit (zwei Bögen mit Sprossen), berankt mit Kletterrose in Rosa"""
    R = w / 2 - 0.08
    yy = d / 2 - 0.08
    zc = h - R - 0.03
    rt = 0.011
    for y in (-yy, yy):
        pts = [P(-R, y, 0)] + [P(math.cos(math.pi - k / 36 * math.pi) * R, y, zc + math.sin(math.pi - k / 36 * math.pi) * R) for k in range(37)] + [P(R, y, 0)]
        tube("bow", pts, rt, "anthracite", 3)
        # Bodenanker
        for x in (-R, R):
            box("anchor", x - 0.04, y - 0.04, 0, x + 0.04, y + 0.04, 0.006, "anthracite", 0.002)
    # Sprossen in den Seiten und über den Bogen
    z = 0.25
    while z < zc:
        for x in (-R, R):
            tube("rung", [P(x, -yy, z), P(x, yy, z)], rt * 0.8, "anthracite", 2)
            # Zierring zwischen den Sprossen
        z += 0.3
    for k in range(1, 8):
        a = math.pi - k / 8 * math.pi
        x, zz = math.cos(a) * R, zc + math.sin(a) * R
        tube("rung", [P(x, -yy, zz), P(x, yy, zz)], rt * 0.8, "anthracite", 2)
    # Kletterrose: Triebe vom Boden links und rechts, links üppiger über den Scheitel
    rr = rng(71)
    paths = []
    for y in (-yy, yy):
        left = [P(-R + rr.uniform(-0.02, 0.02), y, 0.05), P(-R, y, zc * 0.5), P(-R, y, zc)] + [P(math.cos(math.pi - k / 12 * math.pi) * R, y, zc + math.sin(math.pi - k / 12 * math.pi) * R) for k in range(1, 9)]
        right = [P(R, y, 0.05), P(R, y, zc * 0.55), P(R, y, zc)] + [P(math.cos(k / 12 * math.pi) * R, y, zc + math.sin(k / 12 * math.pi) * R) for k in range(1, 5)]
        paths += [left, right]
    # Seitentriebe, die überhängen
    for _ in range(5):
        a = rr.uniform(0.25, 0.85) * math.pi
        x, zz = math.cos(a) * R, zc + math.sin(a) * R
        paths.append([P(x, rr.uniform(-yy, yy), zz), P(x + rr.uniform(-0.15, 0.15), rr.choice((-1, 1)) * (yy + 0.12), zz - rr.uniform(0.1, 0.3))])
    climber_on("rose", paths, rr, "#557a3a", 0.032, [("#c9476e", 0.045, "rose", 34), ("#e98fa6", 0.04, "rose", 22), ("#7a2a3c", 0.012, "ball", 30)], rad=(0.06, 0.1), step=0.07)
    bounds(w, d, h)


def trellis_wall(w: float, d: float, h: float):
    """Freistehende Rankwand: Pflanztrog aus anthrazit Stahl, darüber Rahmen mit Stahlgitter, berankt mit Sternjasmin (weiß blühend)"""
    th = 0.42  # Troghöhe
    t = 0.01
    box("trough_n", -w / 2, -d / 2, 0, w / 2, -d / 2 + t, th, "anthracite", 0.002)
    box("trough_s", -w / 2, d / 2 - t, 0, w / 2, d / 2, th, "anthracite", 0.002)
    box("trough_w", -w / 2, -d / 2, 0, -w / 2 + t, d / 2, th, "anthracite", 0.002)
    box("trough_e", w / 2 - t, -d / 2, 0, w / 2, d / 2, th, "anthracite", 0.002)
    for (a, b_, c, d_) in ((-w / 2 - 0.006, -d / 2 - 0.006, w / 2 + 0.006, -d / 2 + 0.025), (-w / 2 - 0.006, d / 2 - 0.025, w / 2 + 0.006, d / 2 + 0.006),
                          (-w / 2 - 0.006, -d / 2, -w / 2 + 0.025, d / 2), (w / 2 - 0.025, -d / 2, w / 2 + 0.006, d / 2)):
        box("rim", a, b_, th - 0.004, c, d_, th + 0.004, "anthracite", 0.002)
    box("soil", -w / 2 + t, -d / 2 + t, 0, w / 2 - t, d / 2 - t, th - 0.05, "soil")
    # Rahmen aus Vierkantrohr 40 × 40, im Trog verankert
    fw = 0.04
    x0, x1 = -w / 2 + 0.07, w / 2 - 0.07
    for x in (x0, x1 - fw):
        box("post", x, -fw / 2, th - 0.05, x + fw, fw / 2, h, "anthracite", 0.004)
    box("top", x0, -fw / 2, h - fw, x1, fw / 2, h, "anthracite", 0.004)
    box("bottom", x0, -0.015, th + 0.08, x1, 0.015, th + 0.1, "anthracite", 0.003)
    # Gitter: Stahlstäbe 6 mm, Maschen 15 × 15
    xs = x0 + fw + 0.075
    while xs < x1 - fw - 0.02:
        box("bar_v", xs - 0.003, -0.003, th + 0.1, xs + 0.003, 0.003, h - fw, "anthracite")
        xs += 0.15
    zs = th + 0.1 + 0.15
    while zs < h - fw - 0.02:
        box("bar_h", x0 + fw, -0.003, zs - 0.003, x1 - fw, 0.003, zs + 0.003, "anthracite")
        zs += 0.15
    # Sternjasmin: fünf Pflanzen im Trog, Triebe zickzack am Gitter hoch, oben ausgefranst
    rr = rng(53)
    paths = []
    n = 5
    for i in range(n):
        x = x0 + (x1 - x0) * (i + 0.5) / n + rr.uniform(-0.05, 0.05)
        top = h * rr.uniform(0.78, 0.98)
        pts = [P(x, rr.uniform(-0.04, 0.04), th - 0.05)]
        z = th + 0.05
        while z < top:
            x += rr.uniform(-0.12, 0.12)
            x = max(x0 + 0.08, min(x1 - 0.08, x))
            pts.append(P(x, rr.uniform(-0.03, 0.03), z))
            z += rr.uniform(0.15, 0.25)
        paths.append(pts)
        # waagrechte Seitentriebe
        for _ in range(3):
            zz = rr.uniform(th + 0.3, top - 0.1)
            xx = x0 + (x1 - x0) * (i + 0.5) / n
            paths.append([P(xx, 0, zz), P(xx + rr.choice((-1, 1)) * rr.uniform(0.15, 0.3), rr.uniform(-0.03, 0.03), zz + rr.uniform(-0.05, 0.1))])
    climber_on("jasmin", paths, rr, "#4a6c34", 0.026, [("#f3f0e6", 0.024, "saucer", 140), ("#e8e2c8", 0.008, "ball", 60)], rad=(0.05, 0.09), step=0.07, flat_axis="y", flat=0.55)
    bounds(w, d, h)


def climb_obelisk(w: float, d: float, h: float):
    """Rankobelisk: vierseitige Pyramide aus Rundstahl anthrazit mit Ringen, Kugel als Spitze; berankt mit Clematis (violett)"""
    b = min(w, d) / 2 - 0.04
    ztop = h - 0.12
    rt = 0.01

    def half(z):
        return b * (1 - z / ztop * 0.86)

    for sx in (-1, 1):
        for sy in (-1, 1):
            tube("leg", [P(sx * b, sy * b, 0), P(sx * half(ztop - 0.02), sy * half(ztop - 0.02), ztop - 0.02)], rt, "anthracite", 3)
    for z in (0.3, 0.65, 1.0, 1.32):
        hz = half(z)
        tube("ring", [P(-hz, -hz, z), P(hz, -hz, z), P(hz, hz, z), P(-hz, hz, z), P(-hz, -hz, z)], rt * 0.8, "anthracite", 2)
    # Diagonalen in den unteren Feldern (Rautenmuster)
    for sx, sy, tx, ty in ((-1, 1, 1, 1), (1, 1, 1, -1), (1, -1, -1, -1), (-1, -1, -1, 1)):
        for z0, z1 in ((0.3, 0.65), (0.65, 1.0)):
            tube("diag", [P(sx * half(z0), sy * half(z0), z0), P(0.5 * (sx + tx) * half(z1), 0.5 * (sy + ty) * half(z1), z1)], rt * 0.7, "anthracite", 2)
            tube("diag", [P(tx * half(z0), ty * half(z0), z0), P(0.5 * (sx + tx) * half(z1), 0.5 * (sy + ty) * half(z1), z1)], rt * 0.7, "anthracite", 2)
    box("captop", -half(ztop - 0.02) - 0.008, -half(ztop - 0.02) - 0.008, ztop - 0.03, half(ztop - 0.02) + 0.008, half(ztop - 0.02) + 0.008, ztop, "anthracite", 0.003)
    cylinder("finial_stem", 0, 0, ztop, h - 0.08, 0.008, "anthracite", 16)
    lathe("finial", [(0.0, h - 0.09), (0.03, h - 0.075), (0.045, h - 0.045), (0.03, h - 0.012), (0.0, h)], 0, 0, "anthracite", 32)
    # Clematis: zwei Triebe winden sich gegenläufig hoch, oben bleibt die Spitze frei
    rr = rng(29)
    paths = []
    for k, ph in enumerate((0.0, math.pi * 0.8, math.pi * 1.4)):
        pts = []
        top = ztop * rr.uniform(0.72, 0.86)
        nst = 40
        for i in range(nst + 1):
            z = 0.04 + (top - 0.04) * i / nst
            a = ph + (1 if k != 1 else -1) * i / nst * math.tau * 1.3
            r_ = half(z) * 1.05
            # Quadrat statt Kreis: am Gestänge entlang
            c, s = math.cos(a), math.sin(a)
            m = max(abs(c), abs(s))
            pts.append(P(c / m * r_, s / m * r_, z))
        paths.append(pts)
    climber_on("clematis", paths, rr, "#58783c", 0.03, [("#6f4fa3", 0.055, "saucer", 26), ("#9a7fc8", 0.05, "saucer", 14)], rad=(0.05, 0.08), step=0.07)
    bounds(w, d, h)


GENERATORS = {
    "springStone": spring_stone,
    "waterTable": water_table,
    "cisternLid": cistern_lid,
    "handPump": hand_pump,
    "powerPost": power_post,
    "tapPost": tap_post,
    "mowerGarage": mower_garage,
    "hoseReel": hose_reel,
    "roseArch": rose_arch,
    "trellisWall": trellis_wall,
    "climbObelisk": climb_obelisk,
}
