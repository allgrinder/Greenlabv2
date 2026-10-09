"""
Pflanzen-Generatoren für Gartenwerk: Bäume, Sträucher, Hecken, Spaliere, Stauden, Gräser, Gemüse.

Jede Art wird aus Parametern (Wuchsform, Blattgröße, Dichte, Blütenform …) und dem Look der
Jahreszeit (Laubfarbe, kahl, Blüte, Frucht – siehe src/render/assets/plantLooks.ts) aufgebaut.
Bäume: Stamm → Hauptäste → Zweige, Laub in unregelmäßigen Wolken an den Astenden.
"""
from __future__ import annotations

import math
import random

import bpy  # noqa: I001
import bmesh
from mathutils import Matrix, Vector

from lib import _ao, _leaf_mat, _principled, link, mat

# ------------------------------------------------------------------ Farben und Materialien


def lin(hex_: str) -> tuple[float, float, float]:
    """sRGB-Hex → lineare Farbe"""
    c = [int(hex_[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)  # type: ignore[return-value]


def scale(c, k: float):
    return tuple(min(1.0, v * k) for v in c)


_cache: dict[str, bpy.types.Material] = {}


def leaf_material(hex_: str, tint: float = 1.0) -> bpy.types.Material:
    key = f"leafm_{hex_}_{tint}"
    if key not in _cache:
        c = lin(hex_)
        m, b = _leaf_mat(key, scale(c, 0.42 * tint), scale(c, 1.15 * tint))
        _ao(m, 0.85)
        # Lichtdurchlass: ein Teil des Lichts scheint durch das Blatt (warm-grün), Krone wirkt lebendiger
        nt = m.node_tree
        out = nt.nodes["Material Output"]
        tr = nt.nodes.new("ShaderNodeBsdfTranslucent")
        tr.inputs["Color"].default_value = (*scale(c, 1.3 * tint), 1)
        mix = nt.nodes.new("ShaderNodeMixShader")
        mix.inputs["Fac"].default_value = 0.22
        nt.links.new(b.outputs["BSDF"], mix.inputs[1])
        nt.links.new(tr.outputs["BSDF"], mix.inputs[2])
        nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])
        _cache[key] = m
    return _cache[key]


def flat_material(hex_: str, rough: float = 0.6, emission: float = 0.0) -> bpy.types.Material:
    key = f"flat_{hex_}_{rough}"
    if key not in _cache:
        m, b = _principled(key)
        b.inputs["Base Color"].default_value = (*lin(hex_), 1)
        b.inputs["Roughness"].default_value = rough
        b.inputs["Subsurface Weight"].default_value = 0.15
        _ao(m, 0.6)
        _cache[key] = m
    return _cache[key]


def core_material(hex_: str) -> bpy.types.Material:
    """Inneres einer Laubwolke: Laubfarbe stark abgedunkelt (Lücken lesen sich als beschattetes Laub)"""
    key = f"core_{hex_}"
    if key not in _cache:
        m, b = _principled(key)
        b.inputs["Base Color"].default_value = (*scale(lin(hex_), 0.3), 1)
        b.inputs["Roughness"].default_value = 1.0
        _ao(m, 0.8)
        _cache[key] = m
    return _cache[key]


def leaves_for(area: float, size: float, coverage: float = 2.2) -> int:
    """Blattzahl für eine Fläche, so dass sie etwa `coverage`-fach bedeckt ist"""
    return int(area * coverage / (0.7 * size * size))


#: Rindenfarbe (dunkel, hell) je Art, wenn sie auffällt – Hartriegel mit roten Ruten
BARK = {"cornus": ((0.22, 0.03, 0.02), (0.45, 0.07, 0.04))}


def bark_material(kind: str = "") -> bpy.types.Material:
    key = "bark" + kind
    if key not in _cache:
        dark, light = BARK.get(kind, ((0.055, 0.045, 0.035), (0.14, 0.12, 0.1)))
        m, b = _principled(key)
        nt = m.node_tree
        tex = nt.nodes.new("ShaderNodeTexNoise")
        tex.inputs["Scale"].default_value = 18
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = (*dark, 1)
        ramp.color_ramp.elements[1].color = (*light, 1)
        nt.links.new(tex.outputs["Fac"], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
        b.inputs["Roughness"].default_value = 0.9
        _ao(m, 0.7)
        _cache[key] = m
    return _cache[key]


def reset_cache():
    _cache.clear()


# ------------------------------------------------------------------ Instanzen (Blatt, Blüte, Frucht)


def _hidden(ob):
    ob.hide_render = True
    ob.location = (900, 900, -900)
    return ob


def leaf_obj(material: bpy.types.Material, size: float, shape: str = "oval") -> bpy.types.Object:
    name = f"L_{material.name}_{size:.3f}_{shape}"
    ob = bpy.data.objects.get(name)
    if ob:
        return ob
    s = size
    if shape == "needle":  # schmal (Lavendel, Gräser-Laub)
        outline = [(0, -s, 0), (s * 0.12, 0, s * 0.05), (0, s * 1.1, 0), (-s * 0.12, 0, s * 0.05)]
    elif shape == "round":  # rundlich (Linde, Fetthenne)
        outline = [(0, -s * 0.9, 0)] + [(math.sin(a) * s * 0.75, math.cos(a) * s * 0.85, s * 0.12 * math.cos(a) ** 2) for a in [i * math.pi / 5 for i in range(1, 10)]]
    elif shape == "big":  # Hortensie, Kürbis: breit, gewellt
        outline = [(0, -s, 0), (s * 0.7, -s * 0.4, s * 0.2), (s * 0.8, s * 0.4, s * 0.12), (s * 0.4, s * 0.95, 0), (0, s * 1.2, -s * 0.1), (-s * 0.4, s * 0.95, 0), (-s * 0.8, s * 0.4, s * 0.12), (-s * 0.7, -s * 0.4, s * 0.2)]
    else:
        outline = [(0, -s, 0), (s * 0.42, -s * 0.45, s * 0.12), (s * 0.5, s * 0.2, s * 0.14), (s * 0.28, s * 0.75, s * 0.06), (0, s * 1.15, -s * 0.08), (-s * 0.28, s * 0.75, s * 0.06), (-s * 0.5, s * 0.2, s * 0.14), (-s * 0.42, -s * 0.45, s * 0.12)]
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in outline]
    mid = bm.verts.new((0, 0, s * 0.03))
    for i in range(len(vs)):
        bm.faces.new((mid, vs[i], vs[(i + 1) % len(vs)]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me), outline=False)
    ob.data.materials.append(material)
    return _hidden(ob)


def leaf_spray(material: bpy.types.Material, size: float, shape: str = "oval", n: int = 7) -> bpy.types.Object:
    """Zweigstück mit mehreren Blättern (fächerförmig, leicht gewölbt) – liest sich wie echtes Laub statt Konfetti"""
    name = f"S_{material.name}_{size:.3f}_{shape}_{n}"
    ob = bpy.data.objects.get(name)
    if ob:
        return ob
    base = leaf_obj(material, size, shape)
    bm = bmesh.new()
    rnd = random.Random(len(name))
    for i in range(n):
        a = (i / max(1, n - 1) - 0.5) * 2.4 + rnd.uniform(-0.2, 0.2)
        t = 0.3 + 0.7 * (i % 3) / 2
        tmp = bmesh.new()
        tmp.from_mesh(base.data)
        k = rnd.uniform(0.75, 1.15)
        mtx = Matrix.Translation(Vector((math.sin(a) * size * 1.2 * t, math.cos(a) * size * 1.4 * t, size * 0.15 * (1 - t)))) @ Matrix.Rotation(-a, 4, "Z") @ Matrix.Rotation(rnd.uniform(-0.35, 0.35), 4, "X") @ Matrix.Scale(k, 4)
        bmesh.ops.transform(tmp, matrix=mtx, verts=tmp.verts)
        me_tmp = bpy.data.meshes.new("tmp")
        tmp.to_mesh(me_tmp)
        tmp.free()
        bm.from_mesh(me_tmp)
        bpy.data.meshes.remove(me_tmp)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me), outline=False)
    ob.data.materials.append(material)
    return _hidden(ob)


def density_texture(seed: int, size: float, contrast: float = 2.2):
    """Wolken-Rauschen als Dichtemaske für Partikel: Lücken und Klumpen in der Krone"""
    tex = bpy.data.textures.new(f"dens{seed}", "CLOUDS")
    tex.noise_scale = size
    tex.noise_depth = 2
    tex.contrast = contrast
    tex.intensity = 1.0
    tex.noise_basis = "BLENDER_ORIGINAL"
    return tex


def flower_obj(petal_hex: str, size: float, kind: str = "saucer") -> bpy.types.Object:
    """Blüte als Instanz: Schale (5 Blütenblätter), Margerite (Kranz + dunkle Mitte), Kugel (Dolde)"""
    name = f"F_{petal_hex}_{size:.3f}_{kind}"
    ob = bpy.data.objects.get(name)
    if ob:
        return ob
    bm = bmesh.new()
    s = size
    if kind == "ball":
        bmesh.ops.create_icosphere(bm, subdivisions=2, radius=s)
    else:
        n = 12 if kind == "daisy" else 6 if kind == "lily" else 5
        c = bm.verts.new((0, 0, s * 0.15))
        for i in range(n):
            a0 = (i - 0.35) / n * math.tau
            a1 = (i + 0.35) / n * math.tau
            am = i / n * math.tau
            r1 = s * (1.0 if kind in ("daisy", "lily") else 0.9)
            # Lilie: Trichter, Blütenblätter steigen nach außen an
            droop = -s * 0.25 if kind == "daisy" else s * 0.45 if kind == "lily" else s * 0.12
            v1 = bm.verts.new((math.cos(a0) * s * 0.3, math.sin(a0) * s * 0.3, s * 0.12))
            v2 = bm.verts.new((math.cos(am) * r1, math.sin(am) * r1, droop))
            v3 = bm.verts.new((math.cos(a1) * s * 0.3, math.sin(a1) * s * 0.3, s * 0.12))
            bm.faces.new((c, v1, v2, v3))
        if kind == "daisy":
            cone = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=s * 0.28)
            for v in cone["verts"]:
                v.co.z += s * 0.2
            for f in bm.faces:
                if all(v in cone["verts"] for v in f.verts):
                    f.material_index = 1
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me), outline=False)
    ob.data.materials.append(flat_material(petal_hex, 0.55))
    if kind == "daisy":
        ob.data.materials.append(flat_material("#3a2416", 0.8))
    return _hidden(ob)


def emit(emitter: bpy.types.Object, inst: bpy.types.Object, count: int, seed: int, size_random: float = 0.5, normal_align: bool = True, show_emitter: bool = True, volume: bool = False, random_rot: float = 0.75, density=None):
    ps = emitter.modifiers.new(f"p{len(emitter.modifiers)}", "PARTICLE_SYSTEM").particle_system
    ps.seed = seed
    st = ps.settings
    st.type = "HAIR"
    st.use_advanced_hair = True
    st.count = max(1, int(count))
    st.hair_length = 1
    st.render_type = "OBJECT"
    st.instance_object = inst
    st.use_rotations = True
    st.rotation_mode = "NOR" if normal_align else "GLOB_Z"
    st.phase_factor_random = 2.0
    st.rotation_factor_random = random_rot if normal_align else 0.35
    st.particle_size = 1.0
    st.size_random = size_random
    st.emit_from = "VOLUME" if volume else "FACE"
    st.use_emit_random = True
    if density is not None:
        slot = st.texture_slots.add()
        slot.texture = density
        slot.texture_coords = "GLOBAL"
        slot.use_map_time = False
        slot.use_map_density = True
        slot.density_factor = 1.0
    emitter.show_instancer_for_render = show_emitter


# ------------------------------------------------------------------ Geometrie-Bausteine


def blob(name: str, c: Vector, r: float, rnd: random.Random, squash: float = 0.85, core_hex: str | None = None) -> bpy.types.Object:
    """unregelmäßige Laubwolke (Emitter); Kern dunkelgrün"""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
    ph = [rnd.random() * 6 for _ in range(3)]
    for v in bm.verts:
        d = v.co.normalized()
        k = 1 + 0.18 * math.sin(d.x * 3 + ph[0]) * math.sin(d.y * 3 + ph[1]) + 0.12 * math.sin(d.z * 4 + ph[2])
        v.co = Vector((d.x * r * k, d.y * r * k, d.z * r * k * squash))
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me), outline=False)
    ob.location = c
    core = mat("core") if core_hex is None else core_material(core_hex)
    ob.data.materials.append(core)
    return ob


def foliage_cluster(name: str, c: Vector, r: float, rnd: random.Random, leaf: bpy.types.Object, ls: float, color: str, squash: float = 0.85, coverage: float = 2.4, parts: int = 5, extra: list | None = None):
    """
    Laubwolke aus mehreren Teilwolken: fransiger Umriss, Licht- und Schattennester.
    Blätter zufällig ausgerichtet auf den Oberflächen, ein Teil im Inneren für Tiefe.
    `extra` = [(Instanz, Anteil an der Blattzahl)] für Blüten/Früchte.
    """
    for k in range(parts):
        off = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-0.5, 0.8))) * r * 0.5 if k else Vector((0, 0, 0))
        rr = r * (0.62 if k == 0 else rnd.uniform(0.32, 0.55))
        b = blob(f"{name}_{k}", c + off, rr, rnd, squash, color)
        area = 4 * math.pi * rr * rr
        n = leaves_for(area, ls, coverage)
        emit(b, leaf, n, rnd.randint(1, 99999), 0.55, random_rot=1.0)
        emit(b, leaf, n * 0.35, rnd.randint(1, 99999), 0.55, volume=True, random_rot=1.0)
        for inst, share in extra or []:
            emit(b, inst, max(1, n * share), rnd.randint(1, 99999), 0.4, random_rot=0.6)


class Branches:
    """Alle Äste einer Pflanze in einem Kurvenobjekt (Poly-Splines mit Radius je Punkt)"""

    def __init__(self, name: str, bark: str = ""):
        cu = bpy.data.curves.new(name, "CURVE")
        cu.dimensions = "3D"
        cu.bevel_depth = 1.0
        cu.bevel_resolution = 2
        cu.use_fill_caps = True
        self.cu = cu
        self.ob = link(bpy.data.objects.new(name, cu), outline=False)
        self.ob.data.materials.append(bark_material(bark))

    def add(self, pts: list[Vector], radii: list[float]):
        sp = self.cu.splines.new("POLY")
        sp.points.add(len(pts) - 1)
        for p, (v, r) in zip(sp.points, zip(pts, radii)):
            p.co = (v.x, v.y, v.z, 1)
            p.radius = r


def bend(a: Vector, b: Vector, rnd: random.Random, k: float = 0.25, up: float = 0.15) -> list[Vector]:
    """Ast von a nach b mit zwei Zwischenpunkten (leicht gebogen, nach oben gewölbt)"""
    d = b - a
    side = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), 0)) * d.length * k * 0.4
    m1 = a + d * 0.33 + side + Vector((0, 0, d.length * up))
    m2 = a + d * 0.66 + side * 0.5 + Vector((0, 0, d.length * up * 0.6))
    return [a, m1, m2, b]


def twigs(br: Branches, c: Vector, r: float, rnd: random.Random, n: int, rad: float, depth: int = 1, along: Vector | None = None):
    for _ in range(n):
        d = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-0.2, 0.9))).normalized()
        if along is not None:  # in Wuchsrichtung weiter, leicht gefächert und nach oben
            d = (along.normalized() * 1.6 + d * 0.7 + Vector((0, 0, 0.35))).normalized()
        e = c + d * r * rnd.uniform(0.6, 1.0)
        br.add(bend(c, e, rnd, 0.3, 0.1), [rad, rad * 0.7, rad * 0.45, rad * 0.2])
        if depth > 1:
            twigs(br, e, r * 0.5, rnd, 3, rad * 0.45, depth - 1, along=e - c if along is not None else None)


# ------------------------------------------------------------------ Arten-Parameter

#: Bäume: Kronenform, Stammanteil, Blattgröße, Blattform, Dichte (Blätter/m² Wolkenfläche), mehrstämmig
TREES = {
    "tilia-cordata": dict(shape="oval", stem=0.28, leaf=0.075, form="round", dens=150, multi=1),
    "amelanchier-lamarckii": dict(shape="spread", stem=0.18, leaf=0.05, form="oval", dens=190, multi=4),
    "malus-topaz": dict(shape="spread", stem=0.3, leaf=0.06, form="oval", dens=170, multi=1),
    "prunus-serrulata": dict(shape="vase", stem=0.28, leaf=0.065, form="oval", dens=160, multi=1),
    "acer-campestre": dict(shape="round", stem=0.25, leaf=0.05, form="round", dens=200, multi=1),
    "acer-globosum": dict(shape="globe", stem=0.45, leaf=0.075, form="round", dens=230, multi=1),
    "liquidambar": dict(shape="oval", stem=0.3, leaf=0.08, form="round", dens=170, multi=1),
    "carpinus-betulus": dict(shape="oval", stem=0.22, leaf=0.05, form="oval", dens=220, multi=1),
}
SHRUBS = {
    "hydrangea": dict(shape="mound", leaf=0.09, form="big", dens=130, heads=("ball", 0.2, 30)),
    "viburnum": dict(shape="round", leaf=0.07, form="oval", dens=150, heads=None),
    "buxus": dict(shape="globe", leaf=0.022, form="oval", dens=2600, heads=None),
    "syringa": dict(shape="vase", leaf=0.075, form="oval", dens=140, heads=("panicle", 0.16, 40)),
    "spiraea": dict(shape="mound", leaf=0.035, form="oval", dens=260, heads=("ball", 0.035, 220)),
    "cornus": dict(shape="vase", leaf=0.07, form="oval", dens=150, heads=None),
    "carpinus-hedge": dict(shape="hedge", leaf=0.045, form="oval", dens=420, heads=None),
}
#: Stauden: Blattgröße/-form, Blütenform, Blütengröße, Anzahl, Blattton
PERENNIALS = {
    # breite, blaugrüne Blätter, lockere lila Blütentrauben darüber
    "hosta": dict(leaf=0.13, form="big", flower="spike", fsize=0.016, n=7, tint=1.0, leaf_hex="#6e8b80", mound=0.7, spread=0.85, frame=True),
    # überhängende Schwertblätter, orange Trichterblüten
    "hemerocallis": dict(strap=dict(n=85, width=0.02, arch=0.8), flower="lily", fsize=0.065, n=12, tint=1.15, leaf=0.05, form="needle", leaf_hex="#6f8f4c"),
    # gefiedertes Laub, fedrige Rispen
    "astilbe": dict(leaf=0.03, form="needle", flower="plume", fsize=0.008, n=13, tint=1.05, leaf_hex="#5f7a48"),
    # Farnwedel aus Fiederblättchen
    "dryopteris": dict(fern=dict(n=16, width=0.13), leaf=0.05, form="oval", flower="none", fsize=0, n=0, tint=1.0),
    # runde, weich behaarte Blätter, schäumende gelbgrüne Blütenwolken
    "alchemilla": dict(leaf=0.06, form="round", flower="umbel", fsize=0.05, n=22, tint=1.15, leaf_hex="#89a06e"),
    # dunkelrote Blattrosette, feine Blütenstiele
    "heuchera": dict(leaf=0.065, form="round", flower="spike", fsize=0.005, n=12, tint=1.0, leaf_hex="#5a2c3b", mound=0.75),
    # aufrecht, gewölbte Blütenkuppeln
    "phlox": dict(leaf=0.05, form="oval", flower="umbel", fsize=0.075, n=12, tint=1.0),
    # große ledrige Blätter, Blütendolden auf dicken Stielen
    "bergenia": dict(leaf=0.13, form="big", flower="umbel", fsize=0.05, n=6, tint=1.1, leaf_hex="#4c6a38", mound=0.8, spread=0.85, frame=True),
    "geranium": dict(leaf=0.045, form="round", flower="saucer", fsize=0.022, n=70, tint=1.0),
    "salvia": dict(leaf=0.04, form="oval", flower="spike", fsize=0.012, n=28, tint=0.95),
    "lavandula": dict(leaf=0.035, form="needle", flower="spike", fsize=0.011, n=40, tint=1.25, leaf_hex="#8a9a7e"),
    "sedum": dict(leaf=0.035, form="round", flower="umbel", fsize=0.06, n=9, tint=1.1, leaf_hex="#8fa58a"),
    "allium": dict(leaf=0.09, form="needle", flower="globe", fsize=0.05, n=5, tint=1.0),
    "echinacea": dict(leaf=0.06, form="oval", flower="daisy", fsize=0.05, n=14, tint=1.0),
    "rudbeckia": dict(leaf=0.055, form="oval", flower="daisy", fsize=0.04, n=22, tint=1.0),
    "nepeta": dict(leaf=0.025, form="oval", flower="spike", fsize=0.009, n=60, tint=1.2, leaf_hex="#8c9a82"),
    "achillea": dict(leaf=0.04, form="needle", flower="umbel", fsize=0.05, n=10, tint=1.05),
    "anemone": dict(leaf=0.07, form="big", flower="saucer", fsize=0.035, n=16, tint=1.0),
    "perovskia": dict(leaf=0.03, form="needle", flower="spike", fsize=0.01, n=55, tint=1.25, leaf_hex="#9aa69a"),
}
GRASSES = {
    "miscanthus": dict(blades=620, width=0.008, arch=0.4, plume="feather"),
    "carex": dict(blades=900, width=0.005, arch=1.0, plume="none"),
    "stipa": dict(blades=700, width=0.006, arch=0.55, plume="feather"),
    "pennisetum": dict(blades=600, width=0.009, arch=0.75, plume="brush"),
    "calamagrostis": dict(blades=420, width=0.01, arch=0.15, plume="upright"),
    "hakonechloa": dict(blades=520, width=0.012, arch=0.95, plume="none"),
}


# ------------------------------------------------------------------ Generatoren


def tree(sp: dict, look: dict, seed: int):
    p = TREES.get(sp["id"], dict(shape="round", stem=0.3, leaf=0.06, form="oval", dens=160, multi=1))
    rnd = random.Random(seed)
    R = sp["diameterMature"] / 2
    H = sp["heightMature"]
    z0 = H * p["stem"]
    shape = p["shape"]
    ch = (H - z0) / 2
    zc = z0 + ch
    if shape == "spread":
        ch *= 0.75
        zc = z0 + ch
    br = Branches("branches")
    trunk_r = max(0.08, min(0.4, R * 0.045))
    # Stämme
    tops = []
    for i in range(p["multi"]):
        if p["multi"] > 1:
            a = i / p["multi"] * math.tau + rnd.random()
            top = Vector((math.cos(a) * R * 0.25, math.sin(a) * R * 0.25, z0 + ch * 0.3))
            base = Vector((math.cos(a) * 0.12, math.sin(a) * 0.12, 0))
            br.add(bend(base, top, rnd, 0.2, 0.05), [trunk_r * 0.6, trunk_r * 0.55, trunk_r * 0.5, trunk_r * 0.42])
        else:
            top = Vector((rnd.uniform(-0.1, 0.1) * R, rnd.uniform(-0.1, 0.1) * R, z0 + ch * 0.25))
            br.add([Vector((0, 0, -0.05)), Vector((0, 0, z0 * 0.5)), Vector((top.x * 0.5, top.y * 0.5, z0)), top], [trunk_r * 1.15, trunk_r, trunk_r * 0.9, trunk_r * 0.75])
        tops.append(top)

    # Wolkenzentren in der Kronenhülle, bevorzugt außen
    def envelope_point():
        while True:
            u = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1)))
            if u.length > 1:
                continue
            ln = u.length
            u = u.normalized() * (0.2 + 0.8 * ln ** 0.6)  # auch innen und oben in der Mitte (sonst Loch)
            rr = R
            if shape == "vase":
                rr = R * (0.55 + 0.45 * (u.z + 1) / 2)
            if shape == "globe":
                return Vector((u.x * R * 0.92, u.y * R * 0.92, zc + u.z * min(ch, R) * 0.92))
            return Vector((u.x * rr * 0.86, u.y * rr * 0.86, zc + u.z * ch * 0.86))

    if shape == "globe":
        _crown_clumps(br, tops, R, ch, zc, shape, p, look, rnd, trunk_r, envelope_point)
        return
    _crown_tips(br, tops, R, ch, zc, shape, p, look, rnd, trunk_r, envelope_point)


def _crown_clumps(br, tops, R, ch, zc, shape, p, look, rnd, trunk_r, envelope_point):
    """dichte Kugelkrone (Formgehölze wie Kugelahorn): geschlossene Laubwolken"""
    cr = R * 0.27
    n = int(max(18, min(95, (R / cr) ** 2 * 8)))
    centers: list[Vector] = []
    tries = 0
    while len(centers) < n and tries < n * 60:
        tries += 1
        c = envelope_point()
        if all((c - o).length > cr * 0.75 for o in centers):
            centers.append(c)
    scaffolds = []
    for t in tops:
        for j in range(5):
            a = j / 5 * math.tau + rnd.uniform(-0.4, 0.4)
            e = t + Vector((math.cos(a) * R * 0.5, math.sin(a) * R * 0.5, ch * rnd.uniform(0.35, 0.8)))
            r0 = trunk_r * 0.62
            br.add(bend(t, e, rnd, 0.25, 0.1), [r0, r0 * 0.85, r0 * 0.7, r0 * 0.55])
            scaffolds.append((e, r0 * 0.55))
    for c in centers:
        e, r0 = min(scaffolds, key=lambda q: (q[0] - c).length)
        br.add(bend(e, c, rnd, 0.35, 0.15), [r0, r0 * 0.7, r0 * 0.45, r0 * 0.3])
        twigs(br, c, cr * 1.0, rnd, 6 if look["bare"] else 3, max(0.01, r0 * 0.3), 2 if look["bare"] else 1)
    if look["bare"]:
        return
    ls = max(p["leaf"], R * 0.012)
    leaf = leaf_obj(leaf_material(look["color"]), ls, p["form"])
    for i, c in enumerate(centers):
        r = cr * rnd.uniform(0.75, 1.3)
        foliage_cluster(f"clump{i}", c, r, rnd, leaf, ls, look["color"], rnd.uniform(0.7, 0.95), 2.9, 5)


def _crown_tips(br, tops, R, ch, zc, shape, p, look, rnd, trunk_r, envelope_point):
    """
    Natürliche Krone: Gerüstäste → Seitenäste → Zweigspitzen; Laub nur als lockere Büschel an den Spitzen.
    Dadurch entstehen Lücken, ein fransiger Umriss mit herausragenden Zweigen und Licht im Inneren.
    Kleine, dunkle Kernwolken nahe am Stamm verhindern, dass man von oben durch die Mitte auf den Boden sieht.
    """
    # Zweigspitzen: Poisson-artig in der Hülle, außen dichter; einige ragen über die Hülle hinaus
    n_tips = int(max(90, min(420, (R * R) * 9)))
    tip_r = R * 0.11
    tips: list[Vector] = []
    tries = 0
    while len(tips) < n_tips and tries < n_tips * 80:
        tries += 1
        c = envelope_point()
        rel = Vector(((c.x) / R, (c.y) / R, (c.z - zc) / max(ch, 0.1)))
        if rel.length < 0.45 and rnd.random() < 0.7:  # innen weniger Laub (dort ist es dunkel)
            continue
        if rnd.random() < 0.08:  # Ausreißer: Zweig ragt über die Hülle
            c = Vector((c.x * 1.18, c.y * 1.18, zc + (c.z - zc) * 1.12))
        if all((c - o).length > tip_r * 0.9 for o in tips):
            tips.append(c)
    # Gerüstäste
    scaffolds = []
    for t in tops:
        k = 6 if len(tops) == 1 else 3
        for j in range(k):
            a = j / k * math.tau + rnd.uniform(-0.35, 0.35)
            e = t + Vector((math.cos(a) * R * rnd.uniform(0.35, 0.55), math.sin(a) * R * rnd.uniform(0.35, 0.55), ch * rnd.uniform(0.3, 0.85)))
            r0 = trunk_r * 0.6
            br.add(bend(t, e, rnd, 0.3, 0.12), [r0, r0 * 0.82, r0 * 0.66, r0 * 0.5])
            scaffolds.append((e, r0 * 0.5))
    # Seitenäste: je Gerüstast einige Knoten, die nahe gelegene Spitzen bedienen
    nodes = []
    for e, r0 in scaffolds:
        for _ in range(4):
            d = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-0.1, 0.8))).normalized()
            m = e + d * R * rnd.uniform(0.25, 0.45)
            br.add(bend(e, m, rnd, 0.3, 0.1), [r0, r0 * 0.75, r0 * 0.55, r0 * 0.4])
            nodes.append((m, r0 * 0.4))
    for c in tips:
        m, r0 = min(nodes, key=lambda q: (q[0] - c).length)
        rr = max(0.008, r0 * 0.6)
        br.add(bend(m, c, rnd, 0.4, 0.12), [rr, rr * 0.7, rr * 0.45, rr * 0.25])
        if look["bare"]:
            twigs(br, c, tip_r * 1.6, rnd, 4, rr * 0.4, 2, along=c - m)
        else:
            twigs(br, c, tip_r * 0.9, rnd, 2, rr * 0.35, 1, along=c - m)
    if look["bare"]:
        return
    lm = leaf_material(look["color"])
    ls = max(p["leaf"] * 0.85, R * 0.008)
    spray = leaf_spray(lm, ls, p["form"])
    bloom = flower_obj(look["bloom"], ls * 0.6, "saucer") if look.get("bloom") else None
    fruit = flower_obj(look["fruit"], 0.035, "ball") if look.get("fruit") else None
    extra = ([(bloom, 2.5)] if bloom else []) + ([(fruit, 0.04)] if fruit else [])
    spray_area = 7 * 0.7 * ls * ls
    pts = crown_points(R, ch, zc, shape, rnd, spray_area)
    cloud = point_cloud("leafcloud", pts)
    emit_verts(cloud, spray, len(pts), rnd.randint(1, 99999))
    for inst, share in extra:
        sub = point_cloud("extra", [q for q in pts if q.z > zc and rnd.random() < share / 7])
        emit_verts(sub, inst, len(sub.data.vertices), rnd.randint(1, 99999), 0.4)
    # dunkler Kern gegen Durchblick in der Mitte
    blob("core", Vector((0, 0, zc)), R * 0.5, rnd, ch / max(R, 0.1) * 0.9, look["color"])


def crown_points(R: float, ch: float, zc: float, shape: str, rnd: random.Random, spray_area: float, n_min: int = 14, sep: float = 0.68, rrange: tuple[float, float] = (0.17, 0.3), cov: float = 2.6) -> list[Vector]:
    """
    Positionen der Blattzweige: Laubmassen (Klumpen) in der Kronenhülle, außen dichter, einzelne ragen hinaus.
    In jedem Klumpen liegen die Zweige bevorzugt in der äußeren Schicht (Licht oben, Schatten unten),
    der Rand franst aus; die Klumpenränder sind mit Rauschen verbeult.
    """
    from mathutils import noise

    off = Vector((rnd.uniform(0, 99), rnd.uniform(0, 99), rnd.uniform(0, 99)))
    n_cl = int(max(n_min, min(90, R * R * 3.2)))
    centers: list[tuple[Vector, float]] = []
    tries = 0
    while len(centers) < n_cl and tries < n_cl * 200:
        tries += 1
        u = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1)))
        if u.length > 1 or u.length < 0.35:
            continue
        u = u.normalized() * (0.55 + 0.45 * u.length)
        if rnd.random() < 0.1:
            u *= 1.12
        rr = R
        if shape == "vase":
            rr = R * (0.55 + 0.45 * (u.z + 1) / 2)
        c = Vector((u.x * rr * 0.82, u.y * rr * 0.82, zc + u.z * ch * 0.8))
        r = R * rnd.uniform(*rrange)
        if all((c - o).length > (r + orr) * sep for o, orr in centers):
            centers.append((c, r))
    pts: list[Vector] = []
    for c, r in centers:
        n = int(4 * math.pi * r * r * cov / spray_area)
        sq = rnd.uniform(0.6, 0.85)
        for _ in range(n):
            d = Vector((rnd.gauss(0, 1), rnd.gauss(0, 1), rnd.gauss(0, 1))).normalized()
            bump = 1 + 0.28 * noise.noise(d * 1.7 + c + off) + 0.12 * noise.noise(d * 4.3 + c * 2 + off)
            t = rnd.random() ** 0.35  # zur Außenschicht hin
            if rnd.random() < 0.12:
                t *= rnd.uniform(1.0, 1.25)  # Fransen
            q = c + Vector((d.x * r, d.y * r, d.z * r * sq)) * bump * t
            pts.append(q)
    return pts


def point_cloud(name: str, pts: list[Vector]) -> bpy.types.Object:
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(q) for q in pts], [], [])
    return link(bpy.data.objects.new(name, me), outline=False)


def emit_verts(ob: bpy.types.Object, inst: bpy.types.Object, count: int, seed: int, size_random: float = 0.55):
    """genau ein Exemplar je Punkt, Blätter überwiegend zum Licht gedreht"""
    ps = ob.modifiers.new(f"p{len(ob.modifiers)}", "PARTICLE_SYSTEM").particle_system
    ps.seed = seed
    st = ps.settings
    st.type = "HAIR"
    st.use_advanced_hair = True
    st.count = max(1, count)
    st.hair_length = 1
    st.emit_from = "VERT"
    st.use_emit_random = False
    st.render_type = "OBJECT"
    st.instance_object = inst
    st.use_rotations = True
    st.rotation_mode = "GLOB_Z"
    st.rotation_factor_random = 0.45
    st.phase_factor_random = 2.0
    st.particle_size = 1.0
    st.size_random = size_random
    ob.show_instancer_for_render = False


def crown_shell(name: str, R: float, ch: float, zc: float, shape: str, rnd: random.Random, color: str, core: bool = False, holes: float = 0.0) -> bpy.types.Object:
    """Kronenhülle: Ellipsoid mit großräumigen Beulen (unregelmäßiger Umriss), Form je nach Wuchs"""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=4, radius=1.0)
    ph = [rnd.random() * 6 for _ in range(6)]
    for v in bm.verts:
        d = v.co.normalized()
        k = 1 + 0.14 * math.sin(d.x * 2.3 + ph[0]) * math.sin(d.y * 2.1 + ph[1]) + 0.1 * math.sin(d.z * 3.1 + ph[2]) + 0.06 * math.sin(d.x * 5.3 + d.y * 4.1 + ph[3]) + 0.04 * math.sin(d.y * 7.7 + d.z * 6.1 + ph[4])
        rr = R
        if shape == "vase":
            rr = R * (0.55 + 0.45 * (d.z + 1) / 2)
        z = d.z
        if shape == "spread":
            z = d.z * 0.8
        v.co = Vector((d.x * rr * k, d.y * rr * k, zc + z * ch * k))
    if holes:
        # Lücken: Flächen wegschneiden, wo fraktales Rauschen unter der Schwelle liegt (große und kleine Löcher)
        from mathutils import noise

        off = Vector((rnd.uniform(0, 100), rnd.uniform(0, 100), rnd.uniform(0, 100)))
        f = 1.0 / max(0.4, R * 0.32)
        thr = -0.05 + (holes - 0.5) * 0.6
        dead = [fc for fc in bm.faces if noise.fractal(fc.calc_center_median() * f + off, 0.6, 2.0, 3) < thr]
        bmesh.ops.delete(bm, geom=dead, context="FACES")
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me), outline=False)
    ob.data.materials.append(core_material(color))
    return ob


def shrub(sp: dict, look: dict, seed: int):
    p = SHRUBS.get(sp["id"], dict(shape="round", leaf=0.06, form="oval", dens=160, heads=None))
    rnd = random.Random(seed)
    R = sp["diameterMature"] / 2
    H = sp["heightMature"]
    shape = p["shape"]
    if shape == "hedge":  # Heckenabschnitt: gerade so hoch wie breit, dicht
        H = min(H, R * 2.2)
    br = Branches("stems", sp["id"])
    stems = 1 if shape == "globe" else 7
    cr = R * (0.45 if shape in ("globe", "hedge") else 0.38)
    centers: list[Vector] = []
    n = 9 if shape in ("globe", "hedge") else int(max(10, min(30, (R / cr) ** 2 * 6)))
    tries = 0
    while len(centers) < n and tries < 2000:
        tries += 1
        u = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(0, 1)))
        if Vector((u.x, u.y, u.z - 0.5)).length > 0.9:
            continue
        wide = 1.0 if shape != "vase" else 0.55 + 0.45 * u.z
        c = Vector((u.x * R * 0.62 * wide, u.y * R * 0.62 * wide, cr * 0.7 + u.z * (H - cr * 1.5)))
        if all((c - o).length > cr * 0.7 for o in centers):
            centers.append(c)
    for i in range(stems):
        a = i / stems * math.tau + rnd.random()
        base = Vector((math.cos(a) * R * 0.1, math.sin(a) * R * 0.1, 0))
        for c in rnd.sample(centers, min(len(centers), 3)):
            br.add(bend(base, c, rnd, 0.2, 0.1), [0.025, 0.02, 0.015, 0.01])
    for c in centers:
        twigs(br, c, cr * 0.8, rnd, 6 if look["bare"] else 2, 0.01, 2 if look["bare"] else 1)
    if look["bare"]:
        return
    ls = max(p["leaf"], R * 0.02)
    leaf = leaf_obj(leaf_material(look["color"]), ls, p["form"])
    heads = p["heads"] if look.get("bloom") else None
    compact = shape in ("globe", "hedge")
    if not compact:
        # natürlicher Strauch: Laubmassen mit fransigem Rand (wie Baumkronen), Blütenstände oben auf den Massen
        spray = leaf_spray(leaf_material(look["color"]), ls * 0.8, p["form"], 5)
        spray_area = 5 * 0.7 * (ls * 0.8) ** 2
        ch = H * 0.47
        pts = crown_points(R * 0.95, ch, H * 0.52, "vase" if shape == "vase" else "round", rnd, spray_area, n_min=26, sep=0.45, rrange=(0.24, 0.4), cov=3.4)
        emit_verts(point_cloud("leafcloud", pts), spray, len(pts), rnd.randint(1, 99999))
        blob("core", Vector((0, 0, H * 0.45)), R * 0.38, rnd, H / max(2 * R, 0.1) * 0.8, look["color"])
        if heads:
            hk, hs, hn = heads
            top = sorted(pts, key=lambda q: -q.z)[: max(1, len(pts) // 3)]
            chosen = [rnd.choice(top) for _ in range(int(hn * (R / 0.75) ** 2))]
            emit_verts(point_cloud("heads", chosen), flower_obj(look["bloom"], hs * 0.8, "ball"), len(chosen), rnd.randint(1, 99999), 0.35)
        elif look.get("bloom"):
            chosen = [q for q in pts if rnd.random() < 0.25]
            emit_verts(point_cloud("bl", chosen), flower_obj(look["bloom"], ls * 0.5), len(chosen), rnd.randint(1, 99999), 0.4)
        return
    for i, c in enumerate(centers):
        r = cr * rnd.uniform(0.85, 1.12)
        extra = []
        if heads:
            # Blütenstände: Bälle bzw. Rispen
            hk, hs, hn = heads
            extra = [(flower_obj(look["bloom"], hs * 0.55, "ball"), hn * 1.6 / len(centers) / max(1, leaves_for(4 * math.pi * r * r, ls, 2.6)) )]
        elif look.get("bloom"):
            extra = [(flower_obj(look["bloom"], ls * 0.5), 0.3)]
        # Formschnitt (Buchs, Hecke): eine geschlossene Wolke, sonst fransig aus Teilwolken
        foliage_cluster(f"clump{i}", c, r, rnd, leaf, ls, look["color"], 0.9, 2.8 if compact else 2.4, 2 if compact else 4, extra)


def espalier(sp: dict, look: dict, seed: int):
    """Spalierschirm eines Baums: Breite = Abstand, Tiefe 0,45 m (Dachspalier 2,5 × 2,2 m)"""
    rnd = random.Random(seed)
    roof = sp["id"] == "platanus-roof"
    W, D = (2.5, 2.2) if roof else (1.5, 0.45)
    z0, z1 = (2.2, 2.6) if roof else (1.8, sp["heightMature"])
    br = Branches("frame")
    br.add([Vector((0, 0, 0)), Vector((0, 0, z0 * 0.5)), Vector((0, 0, z0)), Vector((0, 0, z1 * 0.98))], [0.08, 0.07, 0.06, 0.03])
    levels = 2 if roof else 4
    for k in range(levels):
        z = z0 + (z1 - z0) * (k + 0.5) / levels
        for sgn in (-1, 1):
            br.add([Vector((0, 0, z - 0.1)), Vector((sgn * W * 0.2, 0, z)), Vector((sgn * W * 0.48, rnd.uniform(-0.03, 0.03), z))], [0.035, 0.025, 0.012])
            if roof:
                for t in (-1, 1):
                    br.add([Vector((sgn * W * 0.3, 0, z)), Vector((sgn * W * 0.3, t * D * 0.45, z + 0.05))], [0.02, 0.01])
    if look["bare"]:
        return
    leaf = leaf_obj(leaf_material(look["color"]), 0.06 if roof else 0.045, "oval")
    # Schirm als Quader aus flachen Wolken
    nx, ny, nz = (5, 4, 1) if roof else (5, 1, max(2, int((z1 - z0) / 0.45)))
    for i in range(nx):
        for j in range(ny):
            for k in range(nz):
                c = Vector((-W / 2 + W * (i + 0.5) / nx, -D / 2 + D * (j + 0.5) / ny, z0 + (z1 - z0) * (k + 0.5) / nz))
                r = max(W / nx, (z1 - z0) / nz) * 0.62
                b = blob(f"c{i}{j}{k}", c, r, rnd, 0.9, look["color"])
                b.scale = (1.0, (D * 0.55 / r) if not roof else 1.0, 1.0 if not roof else 0.45)
                emit(b, leaf, 4 * math.pi * r * r * 260, rnd.randint(1, 99999))
                if look.get("bloom"):
                    emit(b, flower_obj(look["bloom"], 0.03), 4 * math.pi * r * r * 18, rnd.randint(1, 99999), 0.4)


def perennial(sp: dict, look: dict, seed: int):
    p = PERENNIALS.get(sp["id"], dict(leaf=0.045, form="oval", flower="saucer", fsize=0.025, n=30, tint=1.0))
    rnd = random.Random(seed)
    R = sp["diameterMature"] / 2
    H = sp["heightMature"]
    winter = look["color"] == "#7d7464"
    leaf_hex = look["color"] if winter or look["color"] == "#80855a" else p.get("leaf_hex", look["color"])
    if not sp.get("deciduous", True) and p.get("leaf_hex"):
        # wintergrün (Purpurglöckchen, Bergenie): eigene Laubfarbe das ganze Jahr, im Winter etwas dunkler
        leaf_hex = p["leaf_hex"] if not winter else "#%02x%02x%02x" % tuple(int(int(p["leaf_hex"][i : i + 2], 16) * 0.82) for i in (1, 3, 5))
        winter = False
    lm = leaf_material(leaf_hex, p["tint"])
    leaf = leaf_obj(lm, p["leaf"], p["form"])
    mound_h = (H * p.get("mound", 0.45) if p["flower"] not in ("globe",) else 0.18) * (0.6 if winter else 1)
    if p.get("frame"):
        # Blätter (Partikel) zählen nicht zur Bildhülle: lose Eckpunkte vergrößern den Ausschnitt
        e = R + p["leaf"] * 1.3
        me = bpy.data.meshes.new("frame")
        me.from_pydata([(-e, -e, 0), (e, -e, 0), (e, e, 0), (-e, e, 0)], [], [])
        link(bpy.data.objects.new("frame", me), outline=False)
    if p.get("fern"):
        fronds(R, H * (0.55 if winter else 1), p["fern"], leaf_hex, rnd)
        return
    if p.get("strap"):
        st = p["strap"]
        strap_leaves(R, H * 0.7 * (0.6 if winter else 1), st["n"], st["width"], st["arch"], leaf_hex, rnd)
        mound_h = H * 0.35
    for i in range(0 if p.get("strap") else 5):
        a = rnd.random() * math.tau
        d = rnd.random() * R * 0.35 * p.get("spread", 1.0)
        c = Vector((math.cos(a) * d, math.sin(a) * d, mound_h * 0.35))
        # große Blätter ragen über das Polster hinaus: Polster kleiner, damit nichts am Bildrand abgeschnitten wird
        r = R * rnd.uniform(0.5, 0.65) * p.get("spread", 1.0)
        b = blob(f"m{i}", c, r, rnd, mound_h / r * 0.9, leaf_hex)
        emit(b, leaf, leaves_for(4 * math.pi * r * r, p["leaf"], 1.6), rnd.randint(1, 99999))
    bloom = look.get("bloom")
    if not bloom:
        return
    stems = Branches("stems")
    stems.ob.data.materials[0] = leaf_material(leaf_hex, 0.9)
    fk = p["flower"]
    for i in range(p["n"]):
        a = rnd.random() * math.tau
        d = math.sqrt(rnd.random()) * R * 0.85
        top = Vector((math.cos(a) * d, math.sin(a) * d, H * rnd.uniform(0.82, 1.0)))
        base = Vector((top.x * 0.4, top.y * 0.4, mound_h * 0.6))
        stems.add([base, (base + top) / 2, top], [0.004, 0.003, 0.0025])
        if fk == "plume":
            # Rispe: kegelförmig, unten breit verzweigt, fedrig
            for k in range(26):
                t = 0.45 + 0.55 * k / 25
                q = base.lerp(top, t)
                spread = (1 - t) * 0.09 + 0.012
                fl = flower_obj(bloom, p["fsize"] * (1.25 - 0.5 * t), "ball")
                for _ in range(3):
                    inst = link(bpy.data.objects.new("fl", fl.data), outline=False)
                    inst.location = q + Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-0.3, 0.3))) * spread
        elif fk == "spike":
            # Ähre: Blütchen entlang der oberen 40 %
            for k in range(14):
                t = 0.6 + 0.4 * k / 13
                q = base.lerp(top, t)
                fl = flower_obj(bloom, p["fsize"] * (1.2 - 0.5 * t), "ball")
                inst = link(bpy.data.objects.new("fl", fl.data), outline=False)
                inst.location = q + Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), 0)) * p["fsize"] * 0.6
        else:
            kind = {"daisy": "daisy", "saucer": "saucer", "umbel": "ball", "globe": "ball", "lily": "lily"}[fk]
            fl = flower_obj(bloom, p["fsize"] * (0.5 if fk == "umbel" else 1), kind)
            if fk == "umbel":  # flache Dolde aus vielen Kügelchen
                for k in range(16):
                    q = top + Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), 0)).normalized() * p["fsize"] * math.sqrt(rnd.random())
                    inst = link(bpy.data.objects.new("fl", fl.data), outline=False)
                    inst.location = q
            else:
                inst = link(bpy.data.objects.new("fl", fl.data), outline=False)
                inst.location = top
                inst.rotation_euler = (rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3), rnd.random() * 6)


def strap_leaves(R: float, H: float, n: int, width: float, arch: float, hex_: str, rnd: random.Random):
    """Schwertblätter aus der Mitte, überhängend (Taglilie): breite, gekielte Bänder"""
    me = bpy.data.meshes.new("straps")
    bm = bmesh.new()
    seg = 7
    for _ in range(n):
        a = rnd.random() * math.tau
        L = H * rnd.uniform(0.6, 1.05)
        lean = arch * rnd.uniform(0.5, 1.2)
        start = Vector((math.cos(a) * R * 0.1 * rnd.random(), math.sin(a) * R * 0.1 * rnd.random(), 0))
        dirv = Vector((math.cos(a), math.sin(a), 0))
        side = Vector((-math.sin(a), math.cos(a), 0)) * width
        prev = None
        for k in range(seg + 1):
            t = k / seg
            pos = start + dirv * (R * 1.0 * lean * t**1.3) + Vector((0, 0, L * (t - lean * 0.6 * t * t)))
            w = side * (1 - t**2 * 0.85)
            keel = Vector((0, 0, width * 0.35))
            v1, v2, v3 = bm.verts.new(pos - w), bm.verts.new(pos + keel), bm.verts.new(pos + w)
            if prev:
                bm.faces.new((prev[0], prev[1], v2, v1))
                bm.faces.new((prev[1], prev[2], v3, v2))
            prev = (v1, v2, v3)
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new("straps", me), outline=False)
    ob.data.materials.append(leaf_material(hex_, 1.0))
    return ob


def fronds(R: float, H: float, f: dict, hex_: str, rnd: random.Random):
    """Farn: trichterförmig aufsteigende Wedel, Fiederblättchen beidseitig, zur Spitze kleiner"""
    me = bpy.data.meshes.new("fronds")
    bm = bmesh.new()
    for i in range(f["n"]):
        a = i / f["n"] * math.tau + rnd.uniform(-0.2, 0.2)
        L = math.hypot(R, H) * rnd.uniform(0.8, 1.05)
        dirv = Vector((math.cos(a), math.sin(a), 0))
        side = Vector((-math.sin(a), math.cos(a), 0))
        rise = rnd.uniform(0.75, 1.0)
        steps = 22
        prev_c = None
        for k in range(steps + 1):
            t = k / steps
            # Wedel steigt steil auf und neigt sich zur Spitze nach außen
            c = dirv * (R * 0.95 * t**1.2) + Vector((0, 0, H * rise * (t * 1.25 - 0.32 * t * t)))
            if prev_c is not None and 0.08 < t:
                width = f["width"] * math.sin(math.pi * min(1, t * 1.1)) * (1.15 - t * 0.6)
                tang = (c - prev_c).normalized()
                for sgn in (-1, 1):
                    # Fiederblättchen: schmales Dreieck schräg nach vorn
                    tip = c + side * sgn * width + tang * width * 0.35 + Vector((0, 0, -width * 0.18))
                    b1 = c - tang * width * 0.16
                    b2 = c + tang * width * 0.16
                    bm.faces.new((bm.verts.new(b1), bm.verts.new(tip), bm.verts.new(b2)))
            prev_c = c
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new("fronds", me), outline=False)
    ob.data.materials.append(leaf_material(hex_, 1.0))
    return ob


def grass(sp: dict, look: dict, seed: int):
    p = GRASSES.get(sp["id"], dict(blades=300, width=0.006, arch=0.5, plume="feather"))
    rnd = random.Random(seed)
    R = sp["diameterMature"] / 2
    H = sp["heightMature"]
    me = bpy.data.meshes.new("blades")
    bm = bmesh.new()
    seg = 6
    for _ in range(p["blades"]):
        a = rnd.random() * math.tau
        L = H * rnd.uniform(0.55, 1.0) * (0.75 if p["plume"] != "upright" else 0.85)
        lean = p["arch"] * rnd.uniform(0.6, 1.2)
        start = Vector((math.cos(a) * R * 0.12 * rnd.random(), math.sin(a) * R * 0.12 * rnd.random(), 0))
        dirv = Vector((math.cos(a), math.sin(a), 0))
        side = Vector((-math.sin(a), math.cos(a), 0)) * p["width"]
        prev = None
        for k in range(seg + 1):
            t = k / seg
            # Bogen: steigt auf und kippt nach außen
            pos = start + dirv * (R * 0.95 * lean * t ** 1.4) + Vector((0, 0, L * (t - lean * 0.55 * t * t)))
            w = side * (1 - t * 0.9)
            v1 = bm.verts.new(pos - w)
            v2 = bm.verts.new(pos + w)
            if prev:
                bm.faces.new((prev[0], prev[1], v2, v1))
            prev = (v1, v2)
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new("grass", me), outline=False)
    ob.data.materials.append(leaf_material(look["color"], 1.0))
    if look.get("bloom") and (p["plume"] != "none" or sp["id"] == "hakonechloa"):
        fl = flower_obj(look["bloom"], 0.012 if p["plume"] != "brush" else 0.02, "ball")
        n = 90 if p["plume"] == "feather" else 40
        for _ in range(n):
            a = rnd.random() * math.tau
            r = R * rnd.uniform(0.3, 0.95) * (0.4 if p["plume"] == "upright" else 1)
            z = H * rnd.uniform(0.7, 1.0) * (1 if p["plume"] == "upright" else 0.75)
            for k in range(6 if p["plume"] != "feather" else 3):
                inst = link(bpy.data.objects.new("plume", fl.data), outline=False)
                inst.location = Vector((math.cos(a) * (r + k * 0.02), math.sin(a) * (r + k * 0.02), z - k * 0.03))


def vegetable(sp: dict, look: dict, seed: int):
    rnd = random.Random(seed)
    R = sp["diameterMature"] / 2
    H = sp["heightMature"]
    vid = sp["id"]
    if vid == "pumpkin":
        leaf = leaf_obj(leaf_material(look["color"]), 0.16, "big")
        for i in range(7):
            a = rnd.random() * math.tau
            d = rnd.random() * R * 0.7
            b = blob(f"p{i}", Vector((math.cos(a) * d, math.sin(a) * d, 0.12)), R * 0.32, rnd, 0.5)
            emit(b, leaf, 60, rnd.randint(1, 99999))
        fr = flower_obj("#D9822B", 0.14, "ball")
        for i in range(3):
            inst = link(bpy.data.objects.new("pumpkin", fr.data), outline=False)
            inst.location = (rnd.uniform(-R, R) * 0.6, rnd.uniform(-R, R) * 0.6, 0.12)
            inst.scale = (1, 1, 0.75)
        return
    leaf_size, form, n_cl = {"tomato": (0.05, "oval", 6), "lettuce": (0.06, "round", 1), "herbs": (0.022, "oval", 4)}.get(vid, (0.04, "oval", 3))
    leaf = leaf_obj(leaf_material(look["color"]), leaf_size, form)
    for i in range(n_cl):
        z = H * (0.25 + 0.6 * i / max(1, n_cl - 1)) if vid == "tomato" else R * 0.5
        a = rnd.random() * math.tau
        d = rnd.random() * R * 0.4
        r = R * (0.55 if vid == "tomato" else 0.8)
        b = blob(f"v{i}", Vector((math.cos(a) * d, math.sin(a) * d, z)), r, rnd, 0.9)
        emit(b, leaf, 4 * math.pi * r * r / (leaf_size ** 2) * 0.45, rnd.randint(1, 99999))
        if vid == "tomato" and look["color"] != "#7d7464":
            emit(b, flower_obj("#C23B22", 0.03, "ball"), 6, rnd.randint(1, 99999), 0.3, False)


GENERATORS = {"tree": tree, "shrub": shrub, "hedge": shrub, "espalier": espalier, "perennial": perennial, "grass": grass, "vegetable": vegetable}

#: welche Arten eine Schrägansicht brauchen (Stauden/Gräser/Gemüse liegen in der App flach)
NEEDS_OBLIQUE = {"tree", "shrub"}


def footprint(sp: dict) -> tuple[float, float]:
    """Bezugsgröße im Bild: Durchmesser (bzw. Schirmbreite × -tiefe beim Spalier)"""
    if sp["kind"] == "espalier":
        return (2.5, 2.2) if sp["id"] == "platanus-roof" else (1.5, 0.45)
    if sp["kind"] == "hedge":
        return (sp["diameterMature"], sp["diameterMature"])
    return (sp["diameterMature"], sp["diameterMature"])
