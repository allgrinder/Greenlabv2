"""
Bodenbeläge als nahtlose Kacheln (Draufsicht), echt modelliert: einzelne Kiesel, Platten mit Fugen,
Bretter mit Stößen, Häcksel, Sand, Wildwiese mit Blüten; dazu Trittplatten als Einzelbilder.

Nahtlos: Jedes Element, das über den Kachelrand ragt, wird um ±Kachelgröße versetzt dupliziert,
die Kamera zeigt genau eine Kachel. Licht wie bei Objekten und Pflanzen (Sonne von oben links).
"""
from __future__ import annotations

import math
import random

import bpy  # noqa: I001
import bmesh
from mathutils import Euler, Vector

from lib import P, _ao, _principled, link, mat

# ------------------------------------------------------------------ Hilfen


def lin(hex_: str):
    c = [int(hex_[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def pmat(name: str, color, rough: float = 0.85, noise: float = 0.0, bump: float = 0.0, scale: float = 30.0, spec: float = 0.3, ao: float = 0.7):
    """Principled mit optionaler Farbschwankung je Objekt (Random) und Rauschen"""
    m, b = _principled(name)
    nt = m.node_tree
    info = nt.nodes.new("ShaderNodeObjectInfo")
    tex = nt.nodes.new("ShaderNodeTexNoise")
    tex.inputs["Scale"].default_value = scale
    mixr = nt.nodes.new("ShaderNodeMath")
    mixr.operation = "MULTIPLY_ADD"
    nt.links.new(info.outputs["Random"], mixr.inputs[0])
    mixr.inputs[1].default_value = 0.6
    nt.links.new(tex.outputs["Fac"], mixr.inputs[2])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    c = color if isinstance(color[0], (int, float)) else color[0]
    dark = tuple(v * (1 - noise) for v in c)
    light = tuple(min(1, v * (1 + noise * 0.8)) for v in c)
    ramp.color_ramp.elements[0].color = (*dark, 1)
    ramp.color_ramp.elements[1].color = (*light, 1)
    nt.links.new(mixr.outputs[0], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = rough
    b.inputs["Specular IOR Level"].default_value = spec
    if bump:
        bn = nt.nodes.new("ShaderNodeBump")
        bn.inputs["Strength"].default_value = bump
        t2 = nt.nodes.new("ShaderNodeTexNoise")
        t2.inputs["Scale"].default_value = scale * 6
        nt.links.new(t2.outputs["Fac"], bn.inputs["Height"])
        nt.links.new(bn.outputs["Normal"], b.inputs["Normal"])
    if ao:
        _ao(m, ao, 0.05)
    return m


def tiled(ob: bpy.types.Object, T: tuple[float, float], reach: float):
    """Duplikate an den Kachelrändern (verknüpfte Kopien) für nahtlose Wiederholung"""
    x, y = ob.location.x, -ob.location.y  # Plan-Koordinaten
    for dx in (-T[0], 0, T[0]):
        for dy in (-T[1], 0, T[1]):
            if dx == 0 and dy == 0:
                continue
            nx, ny = x + dx, y + dy
            if -reach < nx < T[0] + reach and -reach < ny < T[1] + reach:
                c = ob.copy()
                c.location = P(nx, ny, ob.location.z)
                bpy.context.scene.collection.objects.link(c)


def base_plane(T, material, z=0.0):
    me = bpy.data.meshes.new("base")
    me.from_pydata([tuple(P(x, y, z)) for x, y in ((-0.5, -0.5), (T[0] + 0.5, -0.5), (T[0] + 0.5, T[1] + 0.5), (-0.5, T[1] + 0.5))], [], [[0, 1, 2, 3]])
    ob = link(bpy.data.objects.new("base", me), outline=False)
    ob.data.materials.append(material)
    return ob


def pebble_mesh(name: str, r: float, rnd: random.Random, flat: float = 0.55, sub: int = 2, smooth: bool = True, rough: float = 0.0):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1)
    ph = [rnd.random() * 6 for _ in range(3)]
    sx, sy = rnd.uniform(0.75, 1.25), rnd.uniform(0.6, 1.0)
    for v in bm.verts:
        d = v.co.normalized()
        k = 1 + 0.12 * math.sin(d.x * 3 + ph[0]) * math.sin(d.y * 2 + ph[1]) + 0.08 * math.sin(d.z * 4 + ph[2]) + rnd.uniform(-rough, rough)
        v.co = Vector((d.x * r * sx * k, d.y * r * sy * k, d.z * r * flat * k))
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = smooth
    return me


def scatter_pebbles(T, n: int, rmin: float, rmax: float, mats: list, rnd: random.Random, flat: float = 0.55, z: float = 0.0, protos: int = 24, angular: bool = False):
    # gebrochenes Gestein: grobe Facetten, scharfe Kanten
    meshes = [pebble_mesh(f"peb{i}", 1.0, rnd, flat, 1 if angular else 2, not angular, 0.22 if angular else 0.0) for i in range(protos)]
    for i in range(n):
        r = rnd.uniform(rmin, rmax)
        me = meshes[i % protos]
        ob = bpy.data.objects.new("p", me)
        ob.scale = (r, r, r)
        x, y = rnd.uniform(0, T[0]), rnd.uniform(0, T[1])
        ob.location = P(x, y, z + r * flat * rnd.uniform(0.2, 0.7))
        ob.rotation_euler = Euler((rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3), rnd.uniform(0, 6.28)))
        link(ob, outline=False)
        if not me.materials:
            me.materials.append(mats[0])
        # Material je Objekt (Farbvarianten) statt je Mesh
        ob.material_slots[0].link = "OBJECT"
        ob.material_slots[0].material = mats[i % len(mats)]
        tiled(ob, T, r * 1.5)


def slab_mesh(name: str, w: float, d: float, t: float):
    """Quader mit echten Maßen (statt Objekt-Skalierung – sonst schattieren Fasen schief)"""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts:
        v.co = Vector((v.co.x * w, v.co.y * d, v.co.z * t))
    bm.to_mesh(me)
    bm.free()
    return me


# ------------------------------------------------------------------ Beton, Fugen, Holz (Detail)


def _n(nt, typ, **inputs):
    node = nt.nodes.new(typ)
    if typ == "ShaderNodeTexVoronoi":
        node.voronoi_dimensions = "2D"  # Plattenoberfläche: 2D-Zellen, kein Schnitt durch 3D-Zellen
    for k, v in inputs.items():
        node.inputs[k].default_value = v
    return node


def _mix(nt, a, b, fac, blend="MIX"):
    """Farbmischung: a, b Sockel oder RGB-Tupel; fac Sockel oder Zahl"""
    mx = nt.nodes.new("ShaderNodeMix")
    mx.data_type = "RGBA"
    mx.blend_type = blend
    for sock, val in (("A", a), ("B", b)):
        if isinstance(val, tuple):
            mx.inputs[sock].default_value = (*val, 1) if len(val) == 3 else val
        else:
            nt.links.new(val, mx.inputs[sock])
    if isinstance(fac, (int, float)):
        mx.inputs["Factor"].default_value = fac
    else:
        nt.links.new(fac, mx.inputs["Factor"])
    return mx.outputs["Result"]


def _range(nt, src, a, b, scale=1.0):
    """src von [a, b] auf [0, scale] abbilden (geklemmt)"""
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.clamp = True
    nt.links.new(src, mr.inputs["Value"])
    mr.inputs["From Min"].default_value = a
    mr.inputs["From Max"].default_value = b
    mr.inputs["To Max"].default_value = scale
    return mr.outputs["Result"]


def _coords(nt, rnd):
    """Objektkoordinaten in Metern mit festem Versatz je Material (keine Objekt-Zufallswerte: nahtlose Kachelkopien bleiben gleich)"""
    tc = nt.nodes.new("ShaderNodeTexCoord")
    off = nt.nodes.new("ShaderNodeVectorMath")
    off.operation = "ADD"
    off.inputs[1].default_value = (rnd.uniform(0, 50), rnd.uniform(0, 50), rnd.uniform(0, 50))
    nt.links.new(tc.outputs["Object"], off.inputs[0])
    return off.outputs["Vector"]


def concrete_mat(name: str, hex_: str, rnd: random.Random, rough: float = 0.84, stain: float = 1.0, moss: float = 0.0, wear: float = 1.0, pore: float = 1.0):
    """
    Betonoberfläche wie gealterte Gartenplatten: wolkige Tonwerte, feine Gesteinskörnung, Poren (Relief),
    Wasser- und Laubflecken, abgenutzte hellere Kanten, auf Wunsch Moos-/Flechtenpunkte.
    """
    m, b = _principled(name)
    nt = m.node_tree
    v = _coords(nt, rnd)
    c = lin(hex_)
    mott = _n(nt, "ShaderNodeTexNoise", Scale=3.2, Detail=6.0, Roughness=0.62)
    nt.links.new(v, mott.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*[x * 0.74 for x in c], 1)
    ramp.color_ramp.elements[1].color = (*[min(1, x * 1.12) for x in c], 1)
    ramp.color_ramp.elements[0].position = 0.36
    ramp.color_ramp.elements[1].position = 0.64
    nt.links.new(mott.outputs["Fac"], ramp.inputs["Fac"])
    col = ramp.outputs["Color"]
    # Gesteinskörnung: helle und dunkle Körnchen
    vor = _n(nt, "ShaderNodeTexVoronoi", Scale=120.0)
    nt.links.new(v, vor.inputs["Vector"])
    grain = _n(nt, "ShaderNodeTexNoise", Scale=160.0, Detail=3.0)
    nt.links.new(v, grain.inputs["Vector"])
    col = _mix(nt, col, tuple(min(1, x * 1.22) for x in c), _range(nt, vor.outputs["Distance"], 0.2, 0.05, 0.22))
    col = _mix(nt, col, tuple(x * 0.55 for x in c), _range(nt, grain.outputs["Fac"], 0.64, 0.76, 0.7))
    # Poren und Lunker: kleine dunkle Punkte, mittelfeine Wolken
    pit = _n(nt, "ShaderNodeTexVoronoi", Scale=26.0, Randomness=1.0)
    nt.links.new(v, pit.inputs["Vector"])
    # nur in Nestern: Rauschmaske mal Punktabstand
    pmask = _n(nt, "ShaderNodeTexNoise", Scale=5.0, Detail=2.0)
    nt.links.new(v, pmask.inputs["Vector"])
    pm = nt.nodes.new("ShaderNodeMath")
    pm.operation = "MULTIPLY"
    nt.links.new(_range(nt, pit.outputs["Distance"], 0.05, 0.015, 0.85 * pore), pm.inputs[0])
    nt.links.new(_range(nt, pmask.outputs["Fac"], 0.45, 0.6), pm.inputs[1])
    col = _mix(nt, col, tuple(x * 0.58 for x in c), pm.outputs["Value"])
    mid = _n(nt, "ShaderNodeTexNoise", Scale=22.0, Detail=4.0)
    nt.links.new(v, mid.inputs["Vector"])
    col = _mix(nt, col, tuple(x * 0.76 for x in c), _range(nt, mid.outputs["Fac"], 0.48, 0.7, 0.6))
    # Flecken (Wasser, Laub, Erde)
    st = _n(nt, "ShaderNodeTexNoise", Scale=1.6, Detail=5.0, Roughness=0.6)
    nt.links.new(v, st.inputs["Vector"])
    col = _mix(nt, col, tuple(x * f for x, f in zip(c, (0.6, 0.57, 0.5))), _range(nt, st.outputs["Fac"], 0.54, 0.7, 0.65 * stain))
    # Tropf- und Laubflecken: kleine, scharf begrenzte dunkle Punkte
    sp = _n(nt, "ShaderNodeTexVoronoi", Scale=7.0)
    nt.links.new(v, sp.inputs["Vector"])
    col = _mix(nt, col, tuple(x * f for x, f in zip(c, (0.66, 0.62, 0.55))), _range(nt, sp.outputs["Distance"], 0.07, 0.03, 0.5 * stain))
    if moss:
        mo = _n(nt, "ShaderNodeTexNoise", Scale=16.0, Detail=5.0)
        nt.links.new(v, mo.inputs["Vector"])
        col = _mix(nt, col, lin("#6f7a45"), _range(nt, mo.outputs["Fac"], 0.62, 0.7, 0.7 * moss))
        li = _n(nt, "ShaderNodeTexVoronoi", Scale=34.0)
        nt.links.new(v, li.inputs["Vector"])
        col = _mix(nt, col, lin("#d9d5c4"), _range(nt, li.outputs["Distance"], 0.08, 0.02, 0.6 * moss))
    # abgenutzte Kanten: Abweichung der gerundeten (Bevel-)Normale von der echten
    bev = _n(nt, "ShaderNodeBevel", Radius=0.006)
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    dot = nt.nodes.new("ShaderNodeVectorMath")
    dot.operation = "DOT_PRODUCT"
    nt.links.new(bev.outputs["Normal"], dot.inputs[0])
    nt.links.new(geo.outputs["Normal"], dot.inputs[1])
    col = _mix(nt, col, tuple(min(1, x * 1.22) for x in c), _range(nt, dot.outputs["Value"], 0.995, 0.9, 0.7 * wear))
    nt.links.new(col, b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = rough
    b.inputs["Specular IOR Level"].default_value = 0.3
    # Relief: Poren und feine Unebenheit
    pores = _n(nt, "ShaderNodeTexNoise", Scale=90.0, Detail=8.0, Roughness=0.6)
    nt.links.new(v, pores.inputs["Vector"])
    add = nt.nodes.new("ShaderNodeMath")
    add.operation = "MULTIPLY_ADD"
    nt.links.new(vor.outputs["Distance"], add.inputs[0])
    add.inputs[1].default_value = 0.6
    nt.links.new(pores.outputs["Fac"], add.inputs[2])
    bump = _n(nt, "ShaderNodeBump", Strength=0.32 * pore, Distance=0.002)
    nt.links.new(add.outputs["Value"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    _ao(m, 0.55, 0.03)
    return m


def joint_mat(name: str, rnd: random.Random, moss: float = 0.6):
    """Fuge: Splitt und Sand, dunkel verschmutzt, mit Moos"""
    m, b = _principled(name)
    nt = m.node_tree
    v = _coords(nt, rnd)
    n1 = _n(nt, "ShaderNodeTexNoise", Scale=140.0, Detail=6.0)
    nt.links.new(v, n1.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*lin("#3e3a33"), 1)
    ramp.color_ramp.elements[1].color = (*lin("#7d7466"), 1)
    nt.links.new(n1.outputs["Fac"], ramp.inputs["Fac"])
    mo = _n(nt, "ShaderNodeTexNoise", Scale=9.0, Detail=4.0)
    nt.links.new(v, mo.inputs["Vector"])
    col = _mix(nt, ramp.outputs["Color"], lin("#4f5e2a"), _range(nt, mo.outputs["Fac"], 0.5, 0.62, moss))
    nt.links.new(col, b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 1.0
    bump = _n(nt, "ShaderNodeBump", Strength=0.6, Distance=0.003)
    nt.links.new(n1.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def larch_mat(name: str, hex_: str, rnd: random.Random, weather: float = 0.45):
    """Lärchendiele, teils vergraut: Jahresringe mit Relief, feine Risse längs der Faser, silbrige Verwitterung"""
    m, b = _principled(name)
    nt = m.node_tree
    v = _coords(nt, rnd)
    c = lin(hex_)
    def stretch(sx, sy):
        vm = nt.nodes.new("ShaderNodeVectorMath")
        vm.operation = "MULTIPLY"
        vm.inputs[1].default_value = (sx, sy, 1.0)
        nt.links.new(v, vm.inputs[0])
        return vm.outputs["Vector"]

    # Jahresringe: lange, sanft schwingende Linien entlang der Diele (x)
    wave = _n(nt, "ShaderNodeTexWave", Scale=26.0, Distortion=7.0, Detail=4.0, **{"Detail Scale": 0.8, "Detail Roughness": 0.6})
    wave.bands_direction = "Y"
    nt.links.new(stretch(0.09, 1.0), wave.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*[x * 0.7 for x in c], 1)
    ramp.color_ramp.elements[1].color = (*[min(1, x * 1.12) for x in c], 1)
    nt.links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
    col = ramp.outputs["Color"]
    # Fasern: feine, lange Streifen
    fib = _n(nt, "ShaderNodeTexNoise", Scale=1.0, Detail=6.0, Roughness=0.7)
    nt.links.new(stretch(4.0, 320.0), fib.inputs["Vector"])
    col = _mix(nt, col, tuple(x * 0.72 for x in c), _range(nt, fib.outputs["Fac"], 0.5, 0.7, 0.55))
    # Verwitterung: silbergraue Partien entlang der Faser, stärker an Stellen ohne Abrieb
    we = _n(nt, "ShaderNodeTexNoise", Scale=1.0, Detail=5.0)
    nt.links.new(stretch(1.6, 9.0), we.inputs["Vector"])
    col = _mix(nt, col, lin("#8e8a84"), _range(nt, we.outputs["Fac"], 0.42, 0.62, weather))
    # feine Risse längs der Faser
    cr = _n(nt, "ShaderNodeTexWave", Scale=60.0, Distortion=3.0, Detail=3.0)
    cr.bands_direction = "Y"
    cr.wave_profile = "SAW"
    nt.links.new(stretch(0.1, 1.0), cr.inputs["Vector"])
    crm = _n(nt, "ShaderNodeTexNoise", Scale=4.0)
    nt.links.new(v, crm.inputs["Vector"])
    crack = nt.nodes.new("ShaderNodeMath")
    crack.operation = "MULTIPLY"
    nt.links.new(_range(nt, cr.outputs["Fac"], 0.96, 1.0), crack.inputs[0])
    nt.links.new(_range(nt, crm.outputs["Fac"], 0.55, 0.65), crack.inputs[1])
    col = _mix(nt, col, lin("#2a221b"), crack.outputs["Value"])
    nt.links.new(col, b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.72
    # Relief: Jahresringe und Risse
    hm = nt.nodes.new("ShaderNodeMath")
    hm.operation = "SUBTRACT"
    hf = nt.nodes.new("ShaderNodeMath")
    hf.operation = "MULTIPLY_ADD"
    nt.links.new(fib.outputs["Fac"], hf.inputs[0])
    hf.inputs[1].default_value = 0.6
    nt.links.new(wave.outputs["Fac"], hf.inputs[2])
    nt.links.new(hf.outputs["Value"], hm.inputs[0])
    nt.links.new(crack.outputs["Value"], hm.inputs[1])
    bump = _n(nt, "ShaderNodeBump", Strength=0.5, Distance=0.0015)
    nt.links.new(hm.outputs["Value"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    _ao(m, 0.6, 0.04)
    return m


# ------------------------------------------------------------------ Beläge

GROUND = {}


def ground(key: str, T: tuple[float, float], ppm: int):
    def deco(fn):
        GROUND[key] = (fn, T, ppm)
        return fn

    return deco


@ground("gravel", (1.0, 1.0), 640)
def gravel(T, rnd):
    """Kies 8/16, heller Jurakalk mit grauen und ockerfarbenen Körnern"""
    base_plane(T, pmat("g_base", lin("#8a7f6c"), 1.0, 0.2, 0.6, 80))
    tones = ["#d9cfbd", "#cfc3ab", "#e6ded0", "#b9ab92", "#a59a88", "#c9bea9", "#efe9df", "#9b8f7c"]
    mats = [pmat(f"g{i}", lin(h), 0.55, 0.12, 0.25, 25, 0.45) for i, h in enumerate(tones)]
    scatter_pebbles(T, 2600, 0.006, 0.013, mats, rnd, 0.55)
    scatter_pebbles(T, 900, 0.004, 0.007, mats, rnd, 0.6, 0.005)


@ground("basalt", (0.8, 0.8), 520)
def basalt(T, rnd):
    """Basaltsplitt 16/32: kantig gebrochen, anthrazit bis blauschwarz, matte Bruchflächen, wenige hellere Körner"""
    base_plane(T, pmat("bs_base", lin("#1c1d1e"), 1.0, 0.2, 0.6, 80))
    tones = ["#3a3d40", "#33363a", "#43464a", "#2c2f32", "#4d5053", "#383a3b", "#5a5c5e"]
    mats = [pmat(f"bs{i}", lin(h), 0.72, 0.1, 0.35, 30, 0.4) for i, h in enumerate(tones)]
    scatter_pebbles(T, 2100, 0.009, 0.017, mats, rnd, 0.6, protos=30, angular=True)
    scatter_pebbles(T, 700, 0.006, 0.01, mats, rnd, 0.6, 0.006, protos=20, angular=True)


@ground("paving", (1.6, 0.8), 420)
def paving(T, rnd):
    """Betonplatten 80 × 40, hellgrau, Kreuzfuge versetzt, gefast; Körnung, Flecken, abgenutzte Kanten, Moos in den Fugen"""
    base_plane(T, joint_mat("joint", rnd, 0.7), -0.01)
    mats = [concrete_mat(f"slab{i}", h, rnd, stain=0.9, moss=0.15) for i, h in enumerate(["#c9c4ba", "#bdb7ab", "#d1ccc3", "#b3ada1", "#c4beb2", "#aca69a"])]
    for row in range(3):
        off = (row % 2) * 0.4
        y0 = row * 0.4
        if y0 >= T[1]:
            continue
        # genau eine Periode je Reihe; tiled() ergänzt die Ränder (keine doppelten Flächen)
        for col in range(2):
            x0 = col * 0.8 + off
            ob = link(bpy.data.objects.new("slab", slab_mesh("slab", 0.792, 0.392, 0.03)), outline=False)
            # leichte Höhenunterschiede und Verkippung wie verlegte Platten
            ob.location = P(x0 + 0.4, y0 + 0.2, -0.015 + rnd.uniform(-0.0025, 0.0025))
            ob.rotation_euler = Euler((rnd.uniform(-0.012, 0.012), rnd.uniform(-0.012, 0.012), rnd.uniform(-0.004, 0.004)))
            bev = ob.modifiers.new("b", "BEVEL")
            bev.width = 0.005
            bev.segments = 3
            bev.limit_method = "ANGLE"
            ob.data.materials.append(mats[rnd.randrange(len(mats))])
            tiled(ob, T, 0.5)


@ground("slabs", (2.4, 1.2), 320)
def slabs(T, rnd):
    """Großformatplatten 120 × 60 Beton hellgrau, enge Fuge, Halbverband; feine Körnung, Wasserflecken, Kantenabrieb"""
    base_plane(T, joint_mat("joint2", rnd, 0.5), -0.01)
    mats = [concrete_mat(f"lslab{i}", h, rnd, stain=0.75, moss=0.08, pore=0.8) for i, h in enumerate(["#c6c2ba", "#bfbbb3", "#cbc7c0", "#b9b5ad", "#c2bdb4"])]
    for row in range(2):
        off = (row % 2) * 0.6
        for col in range(2):
            ob = link(bpy.data.objects.new("lslab", slab_mesh("lslab", 1.194, 0.594, 0.04)), outline=False)
            ob.location = P(col * 1.2 + off + 0.6, row * 0.6 + 0.3, -0.02 + rnd.uniform(-0.002, 0.002))
            ob.rotation_euler = Euler((rnd.uniform(-0.008, 0.008), rnd.uniform(-0.008, 0.008), rnd.uniform(-0.002, 0.002)))
            bev = ob.modifiers.new("b", "BEVEL")
            bev.width = 0.004
            bev.segments = 3
            bev.limit_method = "ANGLE"
            ob.data.materials.append(mats[rnd.randrange(len(mats))])
            tiled(ob, T, 0.7)


@ground("wood", (2.4, 1.12), 360)
def wood(T, rnd):
    """Holzdeck Lärche: 14-cm-Dielen mit 6 mm Fugen, versetzte Stöße, Maserung, Schraubenpaare"""
    base_plane(T, pmat("gap", lin("#2a221b"), 1.0), -0.03)
    # Lärche, teils vergraut (wie im Konzept): warmes Graubraun mit silbrigen Partien, Risse, Faserrelief
    tones = ["#9a8166", "#8e765d", "#a48b70", "#85705a", "#ab937a", "#93806b"]
    gm = [larch_mat(f"plank{i}", h, rnd, weather=0.3 + 0.35 * rnd.random()) for i, h in enumerate(tones)]
    pitch = 0.14
    rows = int(round(T[1] / pitch))
    for r in range(rows):
        y = r * pitch + pitch / 2
        # Längen ergeben genau eine Kachelbreite, Startversatz in 60-cm-Schritten (Unterkonstruktion)
        lengths = rnd.choice([[2.4], [1.2, 1.2], [1.8, 0.6], [0.6, 1.8], [1.2, 0.6, 0.6]])
        x = rnd.randrange(4) * 0.6
        for L in lengths:
            ob = link(bpy.data.objects.new("plank", slab_mesh("plank", L - 0.006, pitch - 0.007, 0.028)), outline=False)
            ob.location = P(x + L / 2, y, -0.014)
            bev = ob.modifiers.new("b", "BEVEL")
            bev.width = 0.003
            bev.limit_method = "ANGLE"
            ob.data.materials.append(gm[rnd.randrange(len(gm))])
            tiled(ob, T, L / 2)
            # Schraubenpaare an den Unterkonstruktionen (alle 60 cm)
            for sx in [x + s for s in [0.3 + k * 0.6 for k in range(int(L / 0.6))]]:
                for sy in (y - 0.035, y + 0.035):
                    if True:
                        bpy.ops.mesh.primitive_cylinder_add(radius=0.004, depth=0.002, location=P(sx % T[0], sy, 0.001))
                        s = bpy.context.object
                        s.data.materials.append(mat("graphite"))
            x += L


@ground("mulch", (0.8, 0.8), 420)
def mulch(T, rnd):
    """Holzhäcksel hell: flache, längliche Splitter"""
    base_plane(T, pmat("m_base", lin("#4a3a2b"), 1.0, 0.3, 0.6, 60))
    mats = [pmat(f"chip{i}", lin(h), 0.85, 0.15, 0.3, 40) for i, h in enumerate(["#a1825f", "#8f704f", "#b39470", "#7a5e43", "#c2a47e"])]
    meshes = []
    for i in range(16):
        me = pebble_mesh(f"chip{i}", 1.0, rnd, 0.18, 1)
        meshes.append(me)
    for i in range(2200):
        L = rnd.uniform(0.012, 0.03)
        ob = bpy.data.objects.new("c", meshes[i % 16])
        ob.scale = (L, L * rnd.uniform(0.25, 0.45), L)
        ob.location = P(rnd.uniform(0, T[0]), rnd.uniform(0, T[1]), rnd.uniform(0.0, 0.01))
        ob.rotation_euler = Euler((rnd.uniform(-0.4, 0.4), rnd.uniform(-0.4, 0.4), rnd.uniform(0, 6.28)))
        link(ob, outline=False)
        if not ob.data.materials:
            ob.data.materials.append(mats[0])
        ob.material_slots[0].link = "OBJECT"
        ob.material_slots[0].material = mats[i % len(mats)]
        tiled(ob, T, L)


@ground("barkMulch", (0.8, 0.8), 420)
def bark(T, rnd):
    """Rindenmulch dunkel: gröbere, gewölbte Rindenstücke"""
    base_plane(T, pmat("b_base", lin("#2b2119"), 1.0, 0.3, 0.6, 60))
    mats = [pmat(f"bark{i}", lin(h), 0.95, 0.2, 0.6, 50) for i, h in enumerate(["#5a4232", "#4a3628", "#6b4e3a", "#3d2d22"])]
    meshes = [pebble_mesh(f"bk{i}", 1.0, rnd, 0.3, 1) for i in range(12)]
    for i in range(1300):
        L = rnd.uniform(0.015, 0.04)
        ob = bpy.data.objects.new("b", meshes[i % 12])
        ob.scale = (L, L * rnd.uniform(0.5, 0.8), L)
        ob.location = P(rnd.uniform(0, T[0]), rnd.uniform(0, T[1]), rnd.uniform(0.0, 0.012))
        ob.rotation_euler = Euler((rnd.uniform(-0.4, 0.4), rnd.uniform(-0.4, 0.4), rnd.uniform(0, 6.28)))
        link(ob, outline=False)
        if not ob.data.materials:
            ob.data.materials.append(mats[0])
        ob.material_slots[0].link = "OBJECT"
        ob.material_slots[0].material = mats[i % len(mats)]
        tiled(ob, T, L)


@ground("soil", (0.8, 0.8), 420)
def soil(T, rnd):
    base_plane(T, pmat("s_base", lin("#4e3b2c"), 1.0, 0.35, 0.9, 40))
    mats = [pmat(f"cr{i}", lin(h), 1.0, 0.2, 0.4, 30) for i, h in enumerate(["#5a4533", "#3f3024", "#6b533e"])]
    scatter_pebbles(T, 1500, 0.003, 0.009, mats, rnd, 0.6)


@ground("sand", (1.0, 1.0), 420)
def sand(T, rnd):
    """Spielsand: feine Körnung, weiche Mulden"""
    m, b = _principled("sand")
    nt = m.node_tree
    tex = nt.nodes.new("ShaderNodeTexNoise")
    tex.inputs["Scale"].default_value = 18
    tex.inputs["Detail"].default_value = 6
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*lin("#bda67c"), 1)
    ramp.color_ramp.elements[1].color = (*lin("#e2d2ad"), 1)
    nt.links.new(tex.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 1.0
    bn = nt.nodes.new("ShaderNodeBump")
    bn.inputs["Strength"].default_value = 0.8
    t2 = nt.nodes.new("ShaderNodeTexNoise")
    t2.inputs["Scale"].default_value = 4
    t2.inputs["Detail"].default_value = 8
    nt.links.new(t2.outputs["Fac"], bn.inputs["Height"])
    nt.links.new(bn.outputs["Normal"], b.inputs["Normal"])
    base_plane(T, m)
    mats = [pmat(f"sg{i}", lin(h), 0.9, 0.1, 0.0, 20, 0.3, 0.0) for i, h in enumerate(["#d8c7a0", "#b09670", "#f0e6cf", "#9a8462", "#c9b48a"])]
    scatter_pebbles(T, 9000, 0.0016, 0.0035, mats, rnd, 0.6, protos=8)


@ground("meadow", (2.0, 2.0), 300)
def meadow(T, rnd):
    """Wildblumenwiese: lockere, hohe Grasbüschel (hell, gelbgrün), dazwischen Margeriten, Mohn, Kornblumen, Schafgarbe"""
    base_plane(T, pmat("md_base", lin("#5f6a2e"), 1.0, 0.3, 0.6, 20))
    gm = [pmat(f"gr{i}", lin(h), 0.6, 0.1, 0.0, 10, 0.3, 0.6) for i, h in enumerate(["#a9b552", "#c3c768", "#94a548", "#d6cc7f", "#b6bf5c", "#cdc58e", "#8f9d45"])]
    me = bpy.data.meshes.new("blades")
    bm = bmesh.new()
    # Büschel: Halme stehen gruppiert, dazwischen tiefere Lücken -> Struktur auch aus der Ferne
    tufts = [(rnd.uniform(0, T[0]), rnd.uniform(0, T[1]), rnd.uniform(0.06, 0.16), rnd.uniform(0.7, 1.3)) for _ in range(260)]
    for i in range(24000):
        tx, ty, tr, th = tufts[i % len(tufts)] if rnd.random() < 0.8 else (rnd.uniform(0, T[0]), rnd.uniform(0, T[1]), 0.0, 0.7)
        rr = abs(rnd.gauss(0, tr))
        aa = rnd.uniform(0, 6.28)
        x, y = (tx + math.cos(aa) * rr) % T[0], (ty + math.sin(aa) * rr) % T[1]
        a = aa + rnd.uniform(-0.6, 0.6)
        L = rnd.uniform(0.1, 0.3) * th
        lean = rnd.uniform(0.25, 0.75)
        w = 0.004
        d = Vector((math.cos(a), math.sin(a), 0))
        s = Vector((-math.sin(a), math.cos(a), 0)) * w
        prev = None
        for k in range(4):
            t = k / 3
            pos = Vector((x, -y, 0)) + d * (L * lean * t * t) + Vector((0, 0, L * t * (1 - lean * 0.4 * t)))
            ww = s * (1 - t * 0.85)
            v1, v2 = bm.verts.new(pos - ww), bm.verts.new(pos + ww)
            if prev:
                f = bm.faces.new((prev[0], prev[1], v2, v1))
                f.material_index = i % len(gm)
            prev = (v1, v2)
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new("blades", me), outline=False)
    for m in gm:
        ob.data.materials.append(m)
    for dx in (-T[0], 0, T[0]):
        for dy in (-T[1], 0, T[1]):
            if dx or dy:
                c = ob.copy()
                c.location = P(dx, dy, 0)
                bpy.context.scene.collection.objects.link(c)
    from plants import flower_obj

    # Blüten in lockeren Gruppen (wie ausgesät), nicht gleichmäßig verteilt
    flowers = [("#f2efe4", 0.02, "daisy", 120), ("#c4342a", 0.022, "saucer", 60), ("#4f6fc4", 0.016, "saucer", 80), ("#ece6cc", 0.014, "ball", 90), ("#e3bf3e", 0.015, "saucer", 70), ("#9c6aae", 0.011, "ball", 80), ("#d8cfa8", 0.01, "ball", 110), ("#7e6a4c", 0.008, "ball", 70)]
    for hex_, size, kind, n in flowers:
        proto = flower_obj(hex_, size, kind)
        centers = [(rnd.uniform(0, T[0]), rnd.uniform(0, T[1])) for _ in range(max(2, n // 10))]
        for _ in range(n):
            cx, cy = rnd.choice(centers)
            px, py = (cx + rnd.gauss(0, 0.2)) % T[0], (cy + rnd.gauss(0, 0.2)) % T[1]
            o = bpy.data.objects.new("fl", proto.data)
            o.scale = (rnd.uniform(1.0, 1.5),) * 3
            o.location = P(px, py, rnd.uniform(0.12, 0.32))
            o.rotation_euler = Euler((rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3), rnd.uniform(0, 6)))
            link(o, outline=False)
            tiled(o, T, size)


# ------------------------------------------------------------------ Pflaster, Naturstein, Rasengitter


def _loc_coords(nt, rnd, T, k: float = 3.7):
    """
    Objektkoordinaten plus Objektlage (auf die Kachel gefaltet): jeder Stein zeigt einen anderen Ausschnitt
    der Oberflächentextur, die Randkopien (um genau eine Kachel versetzt) aber denselben – nahtlos.
    """
    tc = nt.nodes.new("ShaderNodeTexCoord")
    info = nt.nodes.new("ShaderNodeObjectInfo")
    wr = nt.nodes.new("ShaderNodeVectorMath")
    wr.operation = "WRAP"
    nt.links.new(info.outputs["Location"], wr.inputs[0])
    # kleiner Versatz der Faltgrenzen: kein Steinmittelpunkt liegt genau darauf
    wr.inputs[1].default_value = (T[0] + 0.0123, 0.0171, 10.0)
    wr.inputs[2].default_value = (0.0123, -T[1] + 0.0171, -10.0)
    sc = nt.nodes.new("ShaderNodeVectorMath")
    sc.operation = "SCALE"
    sc.inputs["Scale"].default_value = k
    nt.links.new(wr.outputs["Vector"], sc.inputs[0])
    add = nt.nodes.new("ShaderNodeVectorMath")
    add.operation = "ADD"
    nt.links.new(tc.outputs["Object"], add.inputs[0])
    nt.links.new(sc.outputs["Vector"], add.inputs[1])
    off = nt.nodes.new("ShaderNodeVectorMath")
    off.operation = "ADD"
    off.inputs[1].default_value = (rnd.uniform(0, 50), rnd.uniform(0, 50), rnd.uniform(0, 50))
    nt.links.new(add.outputs["Vector"], off.inputs[0])
    return off.outputs["Vector"]


def _vary(m, T):
    """concrete_mat nachträglich auf _loc_coords umstellen (viele Steine teilen sich ein Material)"""
    nt = m.node_tree
    tc = next(n for n in nt.nodes if n.bl_idname == "ShaderNodeTexCoord")
    off = tc.outputs["Object"].links[0].to_node
    targets = [ln.to_socket for ln in off.outputs["Vector"].links]
    v = _loc_coords(nt, random.Random(len(m.name) * 31 + 5), T)
    for s in targets:
        nt.links.new(v, s)
    return m


def sand_joint_mat(name: str, rnd: random.Random, hex_: str = "#a69a80", dirt: float = 0.5):
    """Fugensand: feine helle Körner, etwas dunkler Schmutz und Feuchte"""
    m, b = _principled(name)
    nt = m.node_tree
    v = _coords(nt, rnd)
    c = lin(hex_)
    n1 = _n(nt, "ShaderNodeTexNoise", Scale=420.0, Detail=4.0)
    nt.links.new(v, n1.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*[x * 0.62 for x in c], 1)
    ramp.color_ramp.elements[1].color = (*[min(1, x * 1.18) for x in c], 1)
    nt.links.new(n1.outputs["Fac"], ramp.inputs["Fac"])
    gr = _n(nt, "ShaderNodeTexVoronoi", Scale=700.0)
    nt.links.new(v, gr.inputs["Vector"])
    col = _mix(nt, ramp.outputs["Color"], tuple(min(1, x * 1.35) for x in c), _range(nt, gr.outputs["Distance"], 0.25, 0.08, 0.5))
    d = _n(nt, "ShaderNodeTexNoise", Scale=6.0, Detail=4.0)
    nt.links.new(v, d.inputs["Vector"])
    col = _mix(nt, col, lin("#4a4234"), _range(nt, d.outputs["Fac"], 0.5, 0.68, dirt))
    nt.links.new(col, b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 1.0
    bump = _n(nt, "ShaderNodeBump", Strength=0.7, Distance=0.002)
    nt.links.new(n1.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    _ao(m, 0.7, 0.02)
    return m


def grit_mat(name: str, rnd: random.Random, moss: float = 0.25):
    """Fugensplitt 1/3 aus Granit: grau-bunte, kantige Körnchen, dunkle Zwischenräume, etwas Moos"""
    m, b = _principled(name)
    nt = m.node_tree
    v = _coords(nt, rnd)
    vor = _n(nt, "ShaderNodeTexVoronoi", Scale=260.0)
    nt.links.new(v, vor.inputs["Vector"])
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(vor.outputs["Color"], sep.inputs["Color"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "CONSTANT"
    es = ramp.color_ramp.elements
    es[0].color = (*lin("#5d5b58"), 1)
    es[1].position = 0.3
    es[1].color = (*lin("#8d8a85"), 1)
    for pos, h in ((0.6, "#a59e96"), (0.8, "#3b3a39"), (0.9, "#9a8478")):
        e = es.new(pos)
        e.color = (*lin(h), 1)
    nt.links.new(sep.outputs["Red"], ramp.inputs["Fac"])
    # Zwischenräume zwischen den Körnern dunkel
    col = _mix(nt, ramp.outputs["Color"], lin("#211f1c"), _range(nt, vor.outputs["Distance"], 0.32, 0.6, 0.9))
    mo = _n(nt, "ShaderNodeTexNoise", Scale=11.0, Detail=4.0)
    nt.links.new(v, mo.inputs["Vector"])
    col = _mix(nt, col, lin("#4d5a26"), _range(nt, mo.outputs["Fac"], 0.55, 0.66, moss))
    nt.links.new(col, b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.95
    inv = nt.nodes.new("ShaderNodeMath")
    inv.operation = "SUBTRACT"
    inv.inputs[0].default_value = 1.0
    nt.links.new(vor.outputs["Distance"], inv.inputs[1])
    bump = _n(nt, "ShaderNodeBump", Strength=0.9, Distance=0.003)
    nt.links.new(inv.outputs["Value"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    _ao(m, 0.75, 0.025)
    return m


def granite_mat(name: str, hex_: str, rnd: random.Random, T):
    """
    Granit, gespalten und abgetreten: Kristallkörnung (dunkler Glimmer, heller Quarz/Feldspat, rötliche
    Feldspäte), wolkige Tonschwankung, Schmutz in den Mulden, glatter getretene Kuppen
    """
    m, b = _principled(name)
    nt = m.node_tree
    v = _loc_coords(nt, rnd, T)
    c = lin(hex_)
    mott = _n(nt, "ShaderNodeTexNoise", Scale=9.0, Detail=5.0, Roughness=0.6)
    nt.links.new(v, mott.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*[x * 0.8 for x in c], 1)
    ramp.color_ramp.elements[1].color = (*[min(1, x * 1.12) for x in c], 1)
    nt.links.new(mott.outputs["Fac"], ramp.inputs["Fac"])
    col = ramp.outputs["Color"]
    for scale, amount in ((240.0, 0.75), (520.0, 0.5)):
        vor = _n(nt, "ShaderNodeTexVoronoi", Scale=scale)
        nt.links.new(v, vor.inputs["Vector"])
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(vor.outputs["Color"], sep.inputs["Color"])
        kr = nt.nodes.new("ShaderNodeValToRGB")
        kr.color_ramp.interpolation = "CONSTANT"
        es = kr.color_ramp.elements
        es[0].color = (*[x * 0.32 for x in c], 1)  # Glimmer
        es[1].position = 0.16
        es[1].color = (*c, 1)
        for pos, cc in ((0.55, tuple(min(1, x * 1.45) for x in c)), (0.82, tuple(min(1, x * f) for x, f in zip(c, (1.3, 1.1, 1.02)))), (0.93, tuple(x * 0.7 for x in c))):
            e = es.new(pos)
            e.color = (*cc, 1)
        nt.links.new(sep.outputs["Red"], kr.inputs["Fac"])
        col = _mix(nt, col, kr.outputs["Color"], amount)
    # Schmutz und Flechten
    st = _n(nt, "ShaderNodeTexNoise", Scale=14.0, Detail=5.0)
    nt.links.new(v, st.inputs["Vector"])
    col = _mix(nt, col, tuple(x * f for x, f in zip(c, (0.55, 0.52, 0.46))), _range(nt, st.outputs["Fac"], 0.52, 0.7, 0.55))
    nt.links.new(col, b.inputs["Base Color"])
    b.inputs["Specular IOR Level"].default_value = 0.35
    rr = _n(nt, "ShaderNodeTexNoise", Scale=30.0, Detail=3.0)
    nt.links.new(v, rr.inputs["Vector"])
    nt.links.new(_range(nt, rr.outputs["Fac"], 0.3, 0.7, 1.0), b.inputs["Roughness"])
    b.inputs["Roughness"].default_value = 0.7
    mr = rr.outputs["Fac"].links[0].to_node
    mr.inputs["To Min"].default_value = 0.55
    mr.inputs["To Max"].default_value = 0.85
    # Relief: grobe Spaltfläche und Kristallkörnung
    sp = _n(nt, "ShaderNodeTexNoise", Scale=45.0, Detail=8.0, Roughness=0.65)
    nt.links.new(v, sp.inputs["Vector"])
    bump = _n(nt, "ShaderNodeBump", Strength=0.45, Distance=0.004)
    nt.links.new(sp.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    _ao(m, 0.6, 0.02)
    return m


def flagstone_mat(name: str, hex_: str, rnd: random.Random, T):
    """
    Quarzit/Sandstein, spaltrau: Schichtung als feine Bänder, Eisenoxid-Flecken, Körnung, helle Flechten,
    Schmutz und Algen zum Rand hin (über die Umgebungsverdeckung)
    """
    m, b = _principled(name)
    nt = m.node_tree
    v = _loc_coords(nt, rnd, T, 2.3)
    c = lin(hex_)
    mott = _n(nt, "ShaderNodeTexNoise", Scale=4.0, Detail=6.0, Roughness=0.6)
    nt.links.new(v, mott.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*[x * 0.78 for x in c], 1)
    ramp.color_ramp.elements[1].color = (*[min(1, x * 1.12) for x in c], 1)
    ramp.color_ramp.elements[0].position = 0.3
    ramp.color_ramp.elements[1].position = 0.7
    nt.links.new(mott.outputs["Fac"], ramp.inputs["Fac"])
    col = ramp.outputs["Color"]
    # Schichtung: lange, leicht gewellte Bänder in zufälliger Richtung
    ang = rnd.uniform(0, math.pi)
    rot = nt.nodes.new("ShaderNodeVectorRotate")
    rot.rotation_type = "Z_AXIS"
    rot.inputs["Angle"].default_value = ang
    nt.links.new(v, rot.inputs["Vector"])
    wave = _n(nt, "ShaderNodeTexWave", Scale=3.5, Distortion=9.0, Detail=6.0, **{"Detail Scale": 1.2, "Detail Roughness": 0.65})
    nt.links.new(rot.outputs["Vector"], wave.inputs["Vector"])
    col = _mix(nt, col, tuple(x * 0.84 for x in c), _range(nt, wave.outputs["Fac"], 0.6, 0.9, 0.3))
    col = _mix(nt, col, tuple(min(1, x * 1.1) for x in c), _range(nt, wave.outputs["Fac"], 0.25, 0.05, 0.25))
    # Eisenoxid: rostige Wolken und Ringe
    fe = _n(nt, "ShaderNodeTexNoise", Scale=2.6, Detail=6.0, Roughness=0.65)
    nt.links.new(v, fe.inputs["Vector"])
    col = _mix(nt, col, lin("#9a6c45"), _range(nt, fe.outputs["Fac"], 0.6, 0.72, 0.5))
    # Körnung
    gr = _n(nt, "ShaderNodeTexNoise", Scale=380.0, Detail=2.0)
    nt.links.new(v, gr.inputs["Vector"])
    col = _mix(nt, col, tuple(x * 0.7 for x in c), _range(nt, gr.outputs["Fac"], 0.55, 0.75, 0.5))
    col = _mix(nt, col, tuple(min(1, x * 1.25) for x in c), _range(nt, gr.outputs["Fac"], 0.42, 0.3, 0.35))
    # Flechten (hell, rund) und Algen/Schmutz (dunkelgrün-braun)
    li = _n(nt, "ShaderNodeTexVoronoi", Scale=22.0)
    nt.links.new(v, li.inputs["Vector"])
    lm = _n(nt, "ShaderNodeTexNoise", Scale=3.0)
    nt.links.new(v, lm.inputs["Vector"])
    lmul = nt.nodes.new("ShaderNodeMath")
    lmul.operation = "MULTIPLY"
    nt.links.new(_range(nt, li.outputs["Distance"], 0.1, 0.05, 0.75), lmul.inputs[0])
    nt.links.new(_range(nt, lm.outputs["Fac"], 0.5, 0.62), lmul.inputs[1])
    col = _mix(nt, col, lin("#ddd8c6"), lmul.outputs["Value"])
    al = _n(nt, "ShaderNodeTexNoise", Scale=7.0, Detail=5.0)
    nt.links.new(v, al.inputs["Vector"])
    col = _mix(nt, col, lin("#55513a"), _range(nt, al.outputs["Fac"], 0.58, 0.72, 0.5))
    nt.links.new(col, b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.82
    b.inputs["Specular IOR Level"].default_value = 0.3
    # Relief: flache Spaltstufen (Schichtung) und raue Körnung
    hf = nt.nodes.new("ShaderNodeMath")
    hf.operation = "MULTIPLY_ADD"
    nt.links.new(gr.outputs["Fac"], hf.inputs[0])
    hf.inputs[1].default_value = 0.25
    st = _n(nt, "ShaderNodeTexNoise", Scale=9.0, Detail=8.0, Roughness=0.6)
    nt.links.new(v, st.inputs["Vector"])
    nt.links.new(st.outputs["Fac"], hf.inputs[2])
    bump = _n(nt, "ShaderNodeBump", Strength=0.38, Distance=0.006)
    nt.links.new(hf.outputs["Value"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    _ao(m, 0.65, 0.03)
    return m


def soil_moss_mat(name: str, rnd: random.Random, moss: float = 0.6):
    """Fugenerde mit Sand, Moos und Algen"""
    m, b = _principled(name)
    nt = m.node_tree
    v = _coords(nt, rnd)
    n1 = _n(nt, "ShaderNodeTexNoise", Scale=180.0, Detail=5.0)
    nt.links.new(v, n1.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*lin("#2c241b"), 1)
    ramp.color_ramp.elements[1].color = (*lin("#6a5c47"), 1)
    nt.links.new(n1.outputs["Fac"], ramp.inputs["Fac"])
    mo = _n(nt, "ShaderNodeTexNoise", Scale=14.0, Detail=5.0)
    nt.links.new(v, mo.inputs["Vector"])
    col = _mix(nt, ramp.outputs["Color"], lin("#4a5a22"), _range(nt, mo.outputs["Fac"], 0.42, 0.56, moss))
    nt.links.new(col, b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 1.0
    bump = _n(nt, "ShaderNodeBump", Strength=0.7, Distance=0.004)
    nt.links.new(n1.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    _ao(m, 0.75, 0.03)
    return m


def _poly_area(poly):
    return 0.5 * sum(a.x * b.y - b.x * a.y for a, b in zip(poly, poly[1:] + poly[:1]))


def _offset(poly, d: float):
    """Polygon (gegen den Uhrzeigersinn) um d nach innen versetzen"""
    n = len(poly)
    out = []
    for i in range(n):
        p0, p1, p2 = poly[i - 1], poly[i], poly[(i + 1) % n]
        e1, e2 = (p1 - p0), (p2 - p1)
        if e1.length < 1e-9 or e2.length < 1e-9:
            out.append(p1.copy())
            continue
        e1.normalize()
        e2.normalize()
        n1, n2 = Vector((-e1.y, e1.x)), Vector((-e2.y, e2.x))
        mm = n1 + n2
        mm = n1 if mm.length < 1e-6 else mm.normalized()
        out.append(p1 + mm * (d / max(0.4, mm.dot(n1))))
    return out


def _sanitize(poly, d: float):
    """Kanten, die beim Einzug um d kollabieren würden (Richtung kippt), zu einem Punkt zusammenziehen"""
    poly = list(poly)
    while len(poly) > 3:
        inner = _offset(poly, d)
        n = len(poly)
        bad = [i for i in range(n) if (inner[(i + 1) % n] - inner[i]).dot(poly[(i + 1) % n] - poly[i]) <= 0]
        if not bad:
            break
        i = bad[0]
        mid = (poly[i] + poly[(i + 1) % n]) / 2
        poly[i] = mid
        del poly[(i + 1) % n]
    return poly


def _refine(poly, step: float, jit: float, rnd: random.Random):
    """
    Kantenunterteilung für rock_mesh: je Punkt (Kante i, Anteil t, Verschiebung) – sanft unregelmäßige,
    gespaltene Kanten. Die Ringe werden erst am groben Umriss eingezogen und dann alle gleich unterteilt
    und verschoben; so falten sie sich an den Ecken nicht (sonst Löcher und Kippflächen in der Deckfläche).
    """
    spec = []
    for i, a in enumerate(poly):
        b = poly[(i + 1) % len(poly)]
        L = (b - a).length
        k = max(1, int(L / step + 0.5))
        nrm = Vector((-(b - a).y, (b - a).x)).normalized() if L > 1e-9 else Vector((0, 0))
        r1, r2, r3 = rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1)
        for j in range(k):
            t = j / k
            o = jit * (0.6 * r1 * math.sin(math.pi * t) + 0.3 * r2 * math.sin(2 * math.pi * t) + 0.25 * r3 * math.sin(3 * math.pi * t))
            spec.append((i, t, nrm * (o + rnd.uniform(-0.15, 0.15) * jit) if j else Vector((0, 0))))
    return spec


def rock_mesh(name: str, outline, rnd: random.Random, height: float, rings, dome=None, zjit: float = 0.0, spec=None):
    """
    Stein aus grobem Umriss (Blender-XY, lokal, gegen den Uhrzeigersinn): senkrechte Flanken, gerundete
    Oberkante über Ringe (Einzug, Höhe), oben Kuppe (dome = Höhe der Mitte) oder flache Deckfläche.
    spec: Kantenunterteilung aus _refine (gleich für alle Ringe)
    """
    pts = [Vector((p.x, p.y)) for p in outline]
    if _poly_area(pts) < 0:
        raise ValueError("Umriss muss gegen den Uhrzeigersinn laufen")
    spec = spec or [(i, 0.0, Vector((0, 0))) for i in range(len(pts))]
    n = len(spec)

    def sub(ring):
        return [ring[i].lerp(ring[(i + 1) % len(ring)], t) + d for i, t, d in spec]

    bm = bmesh.new()
    loops = [[bm.verts.new((p.x, p.y, -height)) for p in sub(pts)]]
    for d, z in rings:
        ring = sub(_offset(pts, d) if d else pts)
        loops.append([bm.verts.new((p.x, p.y, z + (rnd.uniform(-zjit, zjit) if d else 0.0))) for p in ring])
    faces = []
    for r0, r1 in zip(loops, loops[1:]):
        for i in range(n):
            faces.append(bm.faces.new((r0[i], r0[(i + 1) % n], r1[(i + 1) % n], r1[i])))
    inner = loops[-1]
    if dome is not None:
        c = sum((Vector(v.co) for v in inner), Vector((0, 0, 0))) / n
        cv = bm.verts.new((c.x, c.y, dome))
        for i in range(n):
            faces.append(bm.faces.new((inner[i], inner[(i + 1) % n], cv)))
        for f in faces:
            f.smooth = True
    else:
        for f in faces:
            f.smooth = True
        bm.faces.new(inner).smooth = False
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me


def blade(bm, x: float, y: float, z: float, L: float, a: float, lean: float, w: float, mi: int):
    """Grashalm als schmales, gebogenes Band (Plan-Koordinaten, Neigungsrichtung a)"""
    d = Vector((math.cos(a), math.sin(a), 0))
    s = Vector((-math.sin(a), math.cos(a), 0)) * w
    prev = None
    for k in range(4):
        t = k / 3
        pos = Vector((x, -y, z)) + d * (L * lean * t * t) + Vector((0, 0, L * t * (1 - lean * 0.45 * t)))
        ww = s * (1 - t * 0.85)
        v1, v2 = bm.verts.new(pos - ww), bm.verts.new(pos + ww)
        if prev:
            f = bm.faces.new((prev[0], prev[1], v2, v1))
            f.material_index = mi
        prev = (v1, v2)


def periodic_mesh(name: str, bm, mats, T):
    """Mesh in die Szene, dazu acht um ±Kachelgröße versetzte Kopien (nahtlos)"""
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me), outline=False)
    for m in mats:
        ob.data.materials.append(m)
    for dx in (-T[0], 0, T[0]):
        for dy in (-T[1], 0, T[1]):
            if dx or dy:
                c = ob.copy()
                c.location = P(dx, dy, 0)
                bpy.context.scene.collection.objects.link(c)
    return ob


@ground("herringbone", (1.4142, 1.4142), 480)
def herringbone(T, rnd):
    """
    Betonpflaster 20 × 10 × 8 im Fischgrätverband 45°, grau meliert, Fase, Sandfuge 3–4 mm.
    Verband im Raster 10 cm: Läufer H_k = [k, k+2] × [k, k+1], Binder V_k = [k, k+1] × [k+1, k+3],
    Gitter (1, 1) und (4, 0). Um 45° gedreht ergibt das die Rechteckperiode 14,14 × 28,28 cm;
    die Kachel (1,4142 m) umfasst 10 × 5 Perioden.
    """
    base_plane(T, sand_joint_mat("hb_joint", rnd, "#a99d83", 0.45), -0.006)
    tones = ["#a9a69f", "#9c9993", "#b4b1a9", "#8f8c86", "#807d78", "#bdb9b1", "#726f6b", "#a39f96", "#97948c", "#b0aba0"]
    mats = [_vary(concrete_mat(f"hb{i}", h, rnd, rough=0.86, stain=1.0, moss=0.06, wear=1.1, pore=0.9), T) for i, h in enumerate(tones)]
    me = slab_mesh("hbstone", 0.1965, 0.0965, 0.08)
    me.materials.append(mats[0])
    u = 0.1
    s2 = math.sqrt(0.5)
    ox, oy = 0.0371, 0.0219  # Musterversatz: keine Steinmitte genau auf dem Kachelrand
    for m4 in range(-12, 13):
        for k in range(-30, 31):
            for cx, cy, ang in ((k + 1, k + 0.5, 0.0), (k + 0.5, k + 2, math.pi / 2)):
                gx, gy = (cx + 4 * m4) * u, cy * u
                # Drehung um −45° (Plan): Läufer und Binder stehen schräg, die Grätenreihen laufen entlang x
                x, y = (gx + gy) * s2 + ox, (gy - gx) * s2 + oy
                if not (0 <= x < T[0] and 0 <= y < T[1]):
                    continue
                ob = link(bpy.data.objects.new("hb", me), outline=False)
                # leichte Höhenunterschiede und Verkippung wie im Sandbett verlegt
                ob.location = P(x, y, -0.04 + rnd.uniform(-0.0015, 0.0015))
                a = ang - math.pi / 4  # Plan-Winkel; Blender-Drehung mit umgekehrtem Vorzeichen (y nach unten)
                ob.rotation_euler = Euler((rnd.uniform(-0.008, 0.008), rnd.uniform(-0.008, 0.008), -a + rnd.uniform(-0.006, 0.006)))
                bev = ob.modifiers.new("b", "BEVEL")
                bev.width = 0.0045
                bev.segments = 3
                bev.limit_method = "ANGLE"
                ob.material_slots[0].link = "OBJECT"
                ob.material_slots[0].material = mats[rnd.randrange(len(mats))]
                tiled(ob, T, 0.16)


def _place_sett(pl, rnd, mats, T, joint):
    """Pflasterstein aus Plan-Umriss: Fuge abziehen, Kanten brechen, Kuppe formen, setzen"""
    pts = [Vector((x, y)) for x, y in pl]
    c = sum(pts, Vector((0, 0))) / len(pts)
    loc = [Vector((p.x - c.x, -(p.y - c.y))) for p in pts]
    if _poly_area(loc) < 0:
        loc.reverse()
    loc = _offset(loc, joint / 2 + rnd.uniform(-0.0015, 0.002))
    loc = _sanitize(loc, 0.024)
    dsp = _refine(loc, 0.016, 0.0055, rnd)
    # gebrochene Kante über Ringe, flache Kuppe; Deckfläche eben (eine Fächer-Kuppe zeigt Schattierungsgrate)
    me = rock_mesh("sett", loc, rnd, 0.07, [(0, -0.013), (0.004, -0.0055), (0.009, -0.0018), (0.016, 0.0), (0.022, 0.001)], dome=None, zjit=0.0008, spec=dsp)
    ob = link(bpy.data.objects.new("sett", me), outline=False)
    ob.location = P(c.x, c.y, rnd.uniform(-0.004, 0.002))
    ob.rotation_euler = Euler((rnd.uniform(-0.03, 0.03), rnd.uniform(-0.03, 0.03), 0))
    me.materials.append(mats[rnd.randrange(len(mats))])
    tiled(ob, T, 0.12)
    return ob


@ground("granite", (3.0, 1.44), 400)
def granite(T, rnd):
    """
    Granit-Kleinpflaster 9/11 im Segmentbogen, grau-bunt, Splittfuge. Zwei Bögen je 1,5 m Sehne,
    Stich 20 cm; die Reihen sind senkrecht verschobene Kopien desselben Bogens (Reihenabstand 12 cm),
    damit geht die Periode in x (Bogenbreite) und y (Reihenabstand) auf. An den Bogenfüßen sitzt je
    Reihe ein Zwickelstein; die Stoßfugen stehen dort senkrecht und drehen zur Bogenmitte in die Normale.
    """
    base_plane(T, grit_mat("gr_joint", rnd), -0.018)
    tones = ["#8d8b88", "#96918b", "#83858a", "#9d9690", "#8a857c", "#727170", "#a6a39d", "#958a83", "#868a8b", "#9b958e"]
    mats = [granite_mat(f"gr{i}", h, rnd, T) for i, h in enumerate(tones)]
    B, hh, p = 1.5, 0.2, 0.12
    R = (B * B / 4 + hh * hh) / (2 * hh)
    R0 = math.sqrt(R * R - B * B / 4)
    nA = int(round(T[0] / B))

    def cy(x):
        """Bogen: 0 am Fuß, Stich hh in der Mitte (Plan-y)"""
        xm = (x % B) - B / 2
        return math.sqrt(R * R - xm * xm) - R0

    def slope(x):
        xm = (x % B) - B / 2
        return -xm / math.sqrt(R * R - xm * xm)

    def side(x):
        """Stoßfuge: unten (x, c(x)), oben (x + δ, c(x + δ) + p); δ dreht von senkrecht (Bogenfuß) in die Normale"""
        dist = min(x % B, B - x % B)
        g = max(0.0, min(1.0, (dist - 0.06) / 0.3))
        g = g * g * (3 - 2 * g)
        s = slope(x)
        return x - s * p / (1 + s * s) * g

    def arclen(x0, x1, n=40):
        return sum(math.hypot((x1 - x0) / n, cy(x0 + (x1 - x0) * (i + 1) / n) - cy(x0 + (x1 - x0) * i / n)) for i in range(n))

    def split(s0, s1, L, ws):
        """Teilungspunkte (x) für Steinlängen ws entlang der Bogenlänge zwischen s0 und s1"""
        tot = sum(ws)
        xs, acc = [s0], 0.0
        for w_ in ws[:-1]:
            acc += w_ / tot * L
            lo, hi = s0, s1
            for _ in range(28):
                mid = (lo + hi) / 2
                if arclen(s0, mid, 16) < acc:
                    lo = mid
                else:
                    hi = mid
            xs.append((lo + hi) / 2)
        return xs + [s1]

    joint = 0.011
    for r in range(int(round(T[1] / p))):
        y0 = r * p
        wj = [rnd.uniform(0.085, 0.11) for _ in range(nA)]  # Zwickelbreiten je Bogenfuß dieser Reihe
        for a in range(nA):
            xa = a * B
            # Zwickelstein am Bogenfuß: Chevron, Seiten senkrecht
            jl, jr = xa - wj[a] / 2, xa + wj[a] / 2
            _place_sett([(jl, cy(jl) + y0), (xa, y0), (jr, cy(jr) + y0), (jr, cy(jr) + y0 + p), (xa, y0 + p), (jl, cy(jl) + y0 + p)], rnd, mats, T, joint)
            # Bogensteine bis zum nächsten Zwickel; Längen je Reihe neu gewürfelt (Fugenversatz)
            s0, s1 = jr, xa + B - wj[(a + 1) % nA] / 2
            L = arclen(s0, s1)
            n = max(1, int(round(L / 0.108)))
            xs = split(s0, s1, L, [rnd.uniform(0.82, 1.18) for _ in range(n)])
            for x0, x1 in zip(xs, xs[1:]):
                # Viereck: die Bogenkrümmung über 10 cm (Stich < 1 mm) bleibt unberücksichtigt
                u0, u1 = side(x0), side(x1)
                _place_sett([(x0, cy(x0) + y0), (x1, cy(x1) + y0), (u1, cy(u1) + y0 + p), (u0, cy(u0) + y0 + p)], rnd, mats, T, joint)


def _clip(poly, a: Vector, nrm: Vector, d: float):
    """Polygon auf die Halbebene {x | (x − a)·nrm ≤ d} beschneiden (Sutherland-Hodgman)"""
    out = []
    for i, p in enumerate(poly):
        q = poly[(i + 1) % len(poly)]
        fp, fq = (p - a).dot(nrm) - d, (q - a).dot(nrm) - d
        if fp <= 0:
            out.append(p)
        if (fp < 0 < fq) or (fq < 0 < fp):
            out.append(p.lerp(q, fp / (fp - fq)))
    return out


def periodic_voronoi(pts, T, weights=None):
    """Voronoi-Zellen auf dem Torus (Kachel): je Punkt das Polygon um ihn, Nachbarn aus den 3 × 3 Kopien"""
    cells = []
    for i, p in enumerate(pts):
        poly = [p + Vector(v) for v in ((-1.5, -1.5), (1.5, -1.5), (1.5, 1.5), (-1.5, 1.5))]
        for j, q in enumerate(pts):
            for dx in (-T[0], 0, T[0]):
                for dy in (-T[1], 0, T[1]):
                    if i == j and not dx and not dy:
                        continue
                    qq = q + Vector((dx, dy))
                    dv = qq - p
                    L = dv.length
                    if L > 2.0:
                        continue
                    # Leistungsdiagramm: Gewicht verschiebt die Trennlinie (größere und kleinere Platten)
                    w = 0.0 if weights is None else (weights[i] - weights[j]) / (2 * L)
                    poly = _clip(poly, p, dv / L, L / 2 + w)
        cells.append(poly)
    return cells


def _merge_close(cells, T, dmin: float):
    """
    Voronoi-Ecken näher als dmin (auf dem Torus) zu einer zusammenfassen – für alle Zellen gleich, damit
    die Fugen stimmig bleiben. Kurze Kanten würden beim Einzug kollabieren.
    """
    verts = [v for poly in cells for v in poly]
    W = [Vector((v.x % T[0], v.y % T[1])) for v in verts]

    def tor(a, b):
        dx, dy = abs(a.x - b.x), abs(a.y - b.y)
        return math.hypot(min(dx, T[0] - dx), min(dy, T[1] - dy))

    parent = list(range(len(verts)))

    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(len(verts)):
        for j in range(i):
            if tor(W[i], W[j]) < dmin:
                parent[root(i)] = root(j)
    groups = {}
    for i in range(len(verts)):
        groups.setdefault(root(i), []).append(i)
    mean = {}
    for r, idx in groups.items():
        ref = W[idx[0]]
        acc = Vector((0, 0))
        for i in idx:
            d = W[i] - ref
            acc += Vector((d.x - round(d.x / T[0]) * T[0], d.y - round(d.y / T[1]) * T[1]))
        mean[r] = ref + acc / len(idx)
    out, k = [], 0
    for poly in cells:
        new = []
        for v in poly:
            m = mean[root(k)]
            d = v - m
            q = m + Vector((round(d.x / T[0]) * T[0], round(d.y / T[1]) * T[1]))
            k += 1
            if not new or (q - new[-1]).length > 1e-6:
                new.append(q)
        if len(new) > 1 and (new[0] - new[-1]).length < 1e-6:
            new.pop()
        out.append(new)
    return out


@ground("flagstone", (2.0, 2.0), 360)
def flagstone(T, rnd):
    """
    Polygonalplatten aus Quarzit/Sandstein, beige-grau, 3 cm, unregelmäßige Fugen 1,5–3 cm mit Erde,
    Moospolstern und Grasbüscheln. Zellen: gewichtetes Voronoi auf dem Torus (nahtlos), einmal geglättet;
    Ecken gebrochen, Kanten leicht unregelmäßig, Platten etwas verkippt.
    """
    base_plane(T, soil_moss_mat("fl_joint", rnd, 0.65), -0.016)
    tones = ["#b2a58c", "#a0988a", "#bcae92", "#989488", "#ae9d80", "#a29b8d", "#c3b59c", "#958873", "#aaa08c", "#9e8f78"]
    mats = [flagstone_mat(f"fl{i}", h, rnd, T) for i, h in enumerate(tones)]
    pts = [Vector((rnd.uniform(0, T[0]), rnd.uniform(0, T[1]))) for _ in range(24)]
    for _ in range(2):  # Lloyd-Glättung: gleichmäßigere Plattengrößen
        cells = periodic_voronoi(pts, T)
        nxt = []
        for p, poly in zip(pts, cells):
            c = sum(poly, Vector((0, 0))) / len(poly)
            nxt.append(Vector((c.x % T[0], c.y % T[1])))
        pts = nxt
    weights = [rnd.uniform(-0.02, 0.03) for _ in pts]
    while True:
        cells = periodic_voronoi(pts, T, weights)
        # Splitterzellen (Gewichtung kann winzige Zellen erzeugen) entfernen: Einzug würde sie umstülpen
        small = [i for i, poly in enumerate(cells) if len(poly) < 3 or abs(_poly_area(poly)) < 0.05]
        if not small:
            break
        del pts[small[0]], weights[small[0]]
    cells = _merge_close(cells, T, 0.06)
    joints = []  # Fugenlinien (Plan) für Moos und Gras
    for p, poly in zip(pts, cells):
        c = sum(poly, Vector((0, 0))) / len(poly)
        # Ecken brechen: jede Ecke durch zwei Punkte auf den anschließenden Kanten ersetzen
        broken = []
        for i, v in enumerate(poly):
            a, b = poly[i - 1], poly[(i + 1) % len(poly)]
            k = rnd.uniform(0.02, 0.05)
            broken.append(v.lerp(a, min(0.3, k / max(1e-6, (a - v).length))))
            broken.append(v.lerp(b, min(0.3, k / max(1e-6, (b - v).length))))
        for i, v in enumerate(poly):
            joints.append((v, poly[(i + 1) % len(poly)]))
        loc = [Vector((v.x - c.x, -(v.y - c.y))) for v in broken]
        if _poly_area(loc) < 0:
            loc.reverse()
        loc = _offset(loc, rnd.uniform(0.009, 0.016))
        loc = _sanitize(loc, 0.017)
        dsp = _refine(loc, 0.02, 0.008, rnd)
        me = rock_mesh("flag", loc, rnd, 0.03, [(0, -0.009), (0.003, -0.0035), (0.008, -0.001), (0.015, 0.0)], dome=None, zjit=0.0008, spec=dsp)
        ob = link(bpy.data.objects.new("flag", me), outline=False)
        ob.location = P(c.x, c.y, rnd.uniform(-0.003, 0.003))
        ob.rotation_euler = Euler((rnd.uniform(-0.012, 0.012), rnd.uniform(-0.012, 0.012), 0))
        me.materials.append(mats[rnd.randrange(len(mats))])
        tiled(ob, T, 0.9)

    # Moospolster und Grasbüschel entlang der Fugen (jede Fuge kommt von beiden Zellen: halbe Dichte)
    moss = [pmat(f"fm{i}", lin(h), 0.9, 0.18, 0.5, 120, 0.2, 0.6) for i, h in enumerate(["#4f6123", "#5d6f2a", "#6b7a32", "#43541d", "#7a8340"])]
    gm = [pmat(f"fg{i}", lin(h), 0.65, 0.1, 0.0, 10, 0.3, 0.5) for i, h in enumerate(["#4d5a22", "#5a6a28", "#647530", "#6e7d36", "#7d8a3e", "#8f9446"])]
    bmm = bmesh.new()
    bmg = bmesh.new()
    zone = [(Vector((rnd.uniform(0, T[0]), rnd.uniform(0, T[1]))), rnd.uniform(0.2, 0.45)) for _ in range(9)]

    def lush(x, y):
        """Feuchte, schattige Zonen: dort mehr Moos und Gras"""
        best = 0.0
        for zc, zr in zone:
            dx = min(abs(x - zc.x), T[0] - abs(x - zc.x))
            dy = min(abs(y - zc.y), T[1] - abs(y - zc.y))
            best = max(best, 1 - math.hypot(dx, dy) / zr)
        return best

    for a, b in joints:
        L = (b - a).length
        if L < 1e-4:
            continue
        t_ = (b - a) / L
        nrm = Vector((-t_.y, t_.x))
        s = 0.0
        while s < L:
            s += rnd.uniform(0.006, 0.02)
            q = a + t_ * s
            x, y = q.x % T[0], q.y % T[1]
            wet = lush(x, y)
            if rnd.random() < 0.3 + 0.55 * wet:
                # Moospolster: flache Kuppe in der Fuge
                r = rnd.uniform(0.003, 0.007) * (1 + wet * 0.6)
                o = nrm * rnd.gauss(0, 0.004)
                ret = bmesh.ops.create_icosphere(bmm, subdivisions=1, radius=1.0)
                mi = rnd.randrange(len(moss))
                for v in ret["verts"]:
                    v.co = Vector((x + o.x + v.co.x * r * rnd.uniform(0.85, 1.15), -(y + o.y) + v.co.y * r, -0.014 + max(-0.3, v.co.z) * r * 0.9))
                    for f in v.link_faces:
                        f.material_index = mi
            if rnd.random() < 0.015 + 0.06 * wet:
                # Grasbüschel
                size = rnd.uniform(0.6, 1.2) * (0.8 + wet * 0.5)
                for _ in range(int(rnd.uniform(5, 14) * size)):
                    o = nrm * rnd.gauss(0, 0.004) + t_ * rnd.gauss(0, 0.006)
                    blade(bmg, x + o.x, y + o.y, -0.014, rnd.uniform(0.03, 0.08) * size, rnd.uniform(0, 6.28), rnd.uniform(0.45, 0.85), 0.0025, rnd.randrange(len(gm)))
    periodic_mesh("flmoss", bmm, moss, T)
    periodic_mesh("flgrass", bmg, gm, T)


def _grid_block_mesh(rnd):
    """
    Rasengitterstein 60 × 40 × 8: 4 × 3 Kammern (oben 10,5 × 9 cm, nach unten konisch enger, Ecken gerundet),
    Stege 4,5 cm, am Rand halbe Stege – im Verband ergibt sich ein durchgehendes Gitter
    """
    W, D, H = 0.596, 0.396, 0.08
    blk = link(bpy.data.objects.new("gblk", slab_mesh("gblk", W, D, H)), outline=False)
    blk.location = (0, 0, -H / 2)
    bm = bmesh.new()

    def rrect(cx, cy, a, b, r, z):
        out = []
        for qx, qy, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
            ox, oy = cx + qx * (a / 2 - r), cy + qy * (b / 2 - r)
            for k in range(5):
                ang = math.radians(a0 + k * 22.5)
                out.append(bm.verts.new((ox + math.cos(ang) * r, oy + math.sin(ang) * r, z)))
        return out

    for i in range(4):
        for j in range(3):
            cx, cy = -0.225 + i * 0.15, -0.13333 + j * 0.13333
            top = rrect(cx, cy, 0.105 + 0.003, 0.09 + 0.003, 0.018, 0.005)
            bot = rrect(cx, cy, 0.085 - 0.003, 0.07 - 0.003, 0.012, -0.095)
            n = len(top)
            for k in range(n):
                bm.faces.new((bot[k], bot[(k + 1) % n], top[(k + 1) % n], top[k]))
            bm.faces.new(top)
            bm.faces.new(list(reversed(bot)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    cme = bpy.data.meshes.new("cut")
    bm.to_mesh(cme)
    bm.free()
    cut = link(bpy.data.objects.new("cut", cme), outline=False)
    mod = blk.modifiers.new("cut", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.object = cut
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    me = bpy.data.meshes.new_from_object(blk.evaluated_get(dg))
    me.name = "gridblock"
    # Mesh mittig in z wie slab_mesh (Lage setzt der Aufrufer)
    bpy.data.objects.remove(blk)
    bpy.data.objects.remove(cut)
    return me


@ground("grassPaver", (2.4, 1.6), 360)
def grass_paver(T, rnd):
    """
    Rasengitterstein Beton 60 × 40 × 8, grau, im Halbverband; Kammern mit Erde und Gras (je Kammer
    unterschiedlich dicht, manche fast kahl), Halme hängen über die Stege; Stege abgefahren und verschmutzt
    """
    base_plane(T, pmat("gp_soil", lin("#4a3a2a"), 1.0, 0.35, 0.8, 60, 0.2, 0.7), -0.032)
    me = _grid_block_mesh(rnd)
    tones = ["#a29f97", "#9a968e", "#aaa69e", "#918d85", "#a7a196", "#8c8982"]
    mats = [_vary(concrete_mat(f"gp{i}", h, rnd, rough=0.88, stain=1.3, moss=0.35, wear=1.3, pore=1.3), T) for i, h in enumerate(tones)]
    me.materials.append(mats[0])
    gm = [pmat(f"gpg{i}", lin(h), 0.6, 0.1, 0.0, 10, 0.3, 0.5) for i, h in enumerate(["#4d5a22", "#5a6a28", "#647530", "#43501d", "#6e7d36", "#55642a", "#7f8b3e", "#98985a"])]
    bmg = bmesh.new()
    for row in range(int(round(T[1] / 0.4))):
        off = (row % 2) * 0.3
        for col in range(int(round(T[0] / 0.6))):
            x0, y0 = col * 0.6 + off + 0.3, row * 0.4 + 0.2
            ob = link(bpy.data.objects.new("gp", me), outline=False)
            ob.location = P(x0, y0, -0.04 + rnd.uniform(-0.002, 0.002))
            ob.rotation_euler = Euler((rnd.uniform(-0.008, 0.008), rnd.uniform(-0.008, 0.008), rnd.uniform(-0.004, 0.004)))
            bev = ob.modifiers.new("b", "BEVEL")
            bev.width = 0.004
            bev.segments = 2
            bev.limit_method = "ANGLE"
            ob.material_slots[0].link = "OBJECT"
            ob.material_slots[0].material = mats[rnd.randrange(len(mats))]
            tiled(ob, T, 0.35)
            # Gras in den Kammern
            for i in range(4):
                for j in range(3):
                    hx, hy = x0 - 0.225 + i * 0.15, y0 - 0.13333 + j * 0.13333
                    dens = rnd.choice([1.0, 1.0, 0.9, 0.8, 0.6, 0.35, 0.12])
                    for _ in range(int(85 * dens)):
                        dx, dy = rnd.uniform(-0.042, 0.042), rnd.uniform(-0.035, 0.035)
                        L = rnd.uniform(0.05, 0.14) * (0.6 + 0.4 * dens)
                        # Halme neigen sich überwiegend aus der Kammer heraus über die Stege (Blender-y nach oben)
                        a = math.atan2(-dy, dx) + rnd.gauss(0, 0.9) if rnd.random() < 0.75 else rnd.uniform(0, 6.28)
                        blade(bmg, (hx + dx) % T[0], (hy + dy) % T[1], -0.03, L, a, rnd.uniform(0.45, 0.92), 0.0028, rnd.randrange(len(gm)))
    periodic_mesh("gpgrass", bmg, gm, T)


#: Trittplatten (Naturstein, freigestellt) – Einzelbilder statt Kachel
STEPPING = 4


def stepping_stone(rnd: random.Random, i: int):
    """
    Betontrittplatte 85 × 40 × 5 cm, fast bündig im Rasen: schmale Erdfuge rundum, Gras wächst von außen
    über den Rand. Kein Schattenfänger – die Platte schwebt nicht. Bildausschnitt fest (Platte + 12 cm),
    damit die App das Bild unabhängig vom Gras auf die Plattengröße abbilden kann.
    """
    w, d, t = 0.85, 0.4, 0.05
    ob = link(bpy.data.objects.new("stone", slab_mesh("stone", w, d, t)), outline=False)
    ob.location = (0, 0, -t / 2 + 0.006)
    ob.rotation_euler = (rnd.uniform(-0.004, 0.004), rnd.uniform(-0.004, 0.004), 0)
    bev = ob.modifiers.new("b", "BEVEL")
    bev.width = 0.007
    bev.segments = 3
    bev.limit_method = "ANGLE"
    tone = ["#8e8b84", "#87847d", "#94918a", "#827f78"][i % 4]
    ob.data.materials.append(concrete_mat(f"stone{i}", tone, rnd, rough=0.86, stain=0.9, moss=0.22, wear=1.2, pore=1.0))

    # Erdfuge: unregelmäßig breiter Ring, dunkle, leicht krümelige Erde
    soil = pmat(f"soil{i}", lin("#3a2f24"), 0.95, 0.35, 0.6, 140, 0.2, 0.5)
    me = bpy.data.meshes.new("soilring")
    bm = bmesh.new()
    per = []
    n = 72
    for k in range(n):
        # Umfang gleichmäßig abtasten
        u = k / n * 2 * (w + d)
        if u < w:
            p, nrm = Vector((-w / 2 + u, -d / 2, 0)), Vector((0, -1, 0))
        elif u < w + d:
            p, nrm = Vector((w / 2, -d / 2 + (u - w), 0)), Vector((1, 0, 0))
        elif u < 2 * w + d:
            p, nrm = Vector((w / 2 - (u - w - d), d / 2, 0)), Vector((0, 1, 0))
        else:
            p, nrm = Vector((-w / 2, d / 2 - (u - 2 * w - d), 0)), Vector((-1, 0, 0))
        per.append((p, nrm))
    inner, outer = [], []
    for p, nrm in per:
        inner.append(bm.verts.new(p - nrm * 0.004 + Vector((0, 0, -0.002))))
        outer.append(bm.verts.new(p + nrm * rnd.uniform(0.006, 0.016) + Vector((0, 0, -0.003))))
    for k in range(n):
        bm.faces.new((inner[k], inner[(k + 1) % n], outer[(k + 1) % n], outer[k]))
    bm.to_mesh(me)
    bm.free()
    ring = link(bpy.data.objects.new("soilring", me), outline=False)
    ring.data.materials.append(soil)

    # Gras: Büschel mit Wurzeln 0–3 cm außerhalb der Kante, die meisten Halme neigen sich nach innen
    # über den Plattenrand (1–5 cm), einige nach außen in den Rasen; dazwischen Lücken
    gm = [pmat(f"sg{i}_{j}", lin(h), 0.7, 0.1, 0.0, 10, 0.2, 0.5) for j, h in enumerate(["#4d5a22", "#5a6a28", "#647530", "#43501d", "#6e7d36", "#55642a"])]
    me = bpy.data.meshes.new("stoneblades")
    bm = bmesh.new()
    L_ = 2 * (w + d)
    u = 0.0
    j = 0
    while u < L_:
        u += rnd.uniform(0.008, 0.026)
        if rnd.random() < 0.15:
            u += rnd.uniform(0.03, 0.09)  # Lücke
            continue
        k = int(u / L_ * n) % n
        p, nrm = per[k]
        tan = Vector((-nrm.y, nrm.x, 0))
        frac = (u / L_ * n) % 1
        p = p.lerp(per[(k + 1) % n][0], frac) if (per[(k + 1) % n][1] - nrm).length < 1e-6 else p
        root = p + nrm * rnd.uniform(0.004, 0.03)
        size = rnd.uniform(0.55, 1.05)
        for _ in range(int(rnd.uniform(6, 13) * size)):
            j += 1
            inward = rnd.random() < 0.7
            base = (-nrm if inward else nrm) + tan * rnd.gauss(0, 0.5)
            base.normalize()
            dist = (root - p).dot(nrm)
            reach = dist + rnd.uniform(0.006, 0.03) if inward else rnd.uniform(0.015, 0.045)
            L = max(0.02, reach) * size * rnd.uniform(0.9, 1.25)
            if not inward:
                L = min(L, 0.105 - dist)
            lean = rnd.uniform(0.85, 0.97)
            bw = 0.0034
            side = Vector((-base.y, base.x, 0)) * bw
            start = root + tan * rnd.gauss(0, 0.006)
            prev = None
            for q in range(4):
                tt = q / 3
                pos = start + base * (L * lean * tt) + Vector((0, 0, 0.004 + L * (1 - lean) * tt * (1 - 0.5 * tt) + 0.006 * tt))
                ww = side * (1 - tt * 0.85)
                v1, v2 = bm.verts.new(pos - ww), bm.verts.new(pos + ww)
                if prev:
                    f = bm.faces.new((prev[0], prev[1], v2, v1))
                    f.material_index = j % len(gm)
                prev = (v1, v2)
    bm.to_mesh(me)
    bm.free()
    bl = link(bpy.data.objects.new("stoneblades", me), outline=False)
    for m in gm:
        bl.data.materials.append(m)

    # fester Bildausschnitt: vier lose Punkte (unsichtbar) bei Platte + 12 cm
    fm = bpy.data.meshes.new("frame")
    m_ = 0.12
    fm.from_pydata([(sx * (w / 2 + m_), sy * (d / 2 + m_), 0) for sx in (-1, 1) for sy in (-1, 1)], [], [])
    link(bpy.data.objects.new("frame", fm), outline=False)
    return ob


def grass_edge(T, rnd):
    """
    Nahtloser Streifen entlang x: Wurzellinie in der Mitte (y = T[1]/2). Halme wachsen überwiegend
    nach oben im Bild (= nach außen über die Kante), einige zurück in den Rasen; Hintergrund transparent.
    Farben wie der Rasen der App.
    """
    gm = [pmat(f"eg{i}", lin(h), 0.6, 0.1, 0.0, 10, 0.3, 0.5) for i, h in enumerate(["#6f7d31", "#7f8e3c", "#8e9c46", "#5f6c28", "#9aa654", "#748236"])]
    me = bpy.data.meshes.new("edgeblades")
    bm = bmesh.new()
    y0 = T[1] / 2
    # Büschel in unregelmäßigen Abständen, dazwischen Lücken; je Büschel ein Fächer nach außen
    x = 0.0
    i = 0
    while x < T[0]:
        x += rnd.uniform(0.008, 0.03)
        if rnd.random() < 0.12:
            x += rnd.uniform(0.02, 0.06)  # Lücke
            continue
        size = rnd.uniform(0.6, 1.5)
        ty = y0 + 0.015 + rnd.gauss(0, 0.012)  # Wurzeln leicht im Rasen
        for _ in range(int(rnd.uniform(8, 18) * size)):
            i += 1
            bx = (x + rnd.gauss(0, 0.008)) % T[0]
            out = rnd.random() < 0.85
            a = (-math.pi / 2 if out else math.pi / 2) + rnd.gauss(0, 0.6)
            L = rnd.uniform(0.04, 0.15) * size * (1.0 if out else 0.5)
            lean = rnd.uniform(0.55, 0.95)
            w = 0.003
            d = Vector((math.cos(a), -math.sin(a), 0))
            s_ = Vector((math.sin(a), math.cos(a), 0)) * w
            prev = None
            for k in range(4):
                t = k / 3
                pos = Vector((bx, -ty, 0)) + d * (L * lean * t) + Vector((0, 0, L * (1 - lean) * t * (1 - 0.5 * t) + 0.004))
                ww = s_ * (1 - t * 0.85)
                v1, v2 = bm.verts.new(pos - ww), bm.verts.new(pos + ww)
                if prev:
                    f = bm.faces.new((prev[0], prev[1], v2, v1))
                    f.material_index = i % len(gm)
                prev = (v1, v2)
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new("edgeblades", me), outline=False)
    for m in gm:
        ob.data.materials.append(m)
    for dx in (-T[0], T[0]):
        c = ob.copy()
        c.location = (dx, 0, 0)
        bpy.context.scene.collection.objects.link(c)


def _edge_blocks(T, rnd, width: float, top: float, tones: list[str], unit: float, bevel: float, rough: float = 0.8, metallic: float = 0.0,
                 segments: int = 2, tilt: float = 0.0, noise: float = 0.08, scale: float = 20):
    """Einfassungsband entlang x, mittig: einzelne Elemente der Länge `unit` mit Fuge, leicht unterschiedlich hoch"""
    mats = []
    for i, h in enumerate(tones):
        m = pmat(f"edgem{i}_{width}", lin(h), rough, noise, 0.3, scale, 0.35)
        if metallic:
            m.node_tree.nodes["Principled BSDF"].inputs["Metallic"].default_value = metallic
        mats.append(m)
    x = 0.0
    while x < T[0] - 1e-6:
        L = min(unit, T[0] - x)
        ob = link(bpy.data.objects.new("edgeblock", slab_mesh("edgeblock", L - (0.004 if unit < T[0] else 0.0), width, 0.06)), outline=False)
        ob.location = P(x + L / 2, T[1] / 2, top - 0.03 + rnd.uniform(-0.002, 0.002))
        if bevel:
            bev = ob.modifiers.new("b", "BEVEL")
            bev.width = bevel
            bev.segments = segments
            bev.limit_method = "ANGLE"
        if tilt:
            ob.rotation_euler = Euler((tilt, 0, 0))
        ob.data.materials.append(mats[rnd.randrange(len(mats))])
        x += L


def kantenstein_edge(T, rnd):
    """Kantenstein 8 × 20 × 100 aus Beton: 8 cm breite Oberkante, Fugen alle 1 m, Fase, leichte Verschmutzung"""
    _edge_blocks(T, rnd, 0.08, 0.0, ["#9a968d", "#928e85", "#a19d95"], 1.0, 0.006, 0.85)


def steel_edge(T, rnd):
    """Rasenkante aus Stahl, anthrazit pulverbeschichtet, mit 25 mm Abkantung oben: rund gebogene Lichtkante
    auf der einen, Schattenkante auf der anderen Seite"""
    _edge_blocks(T, rnd, 0.025, 0.0, ["#303134", "#2a2b2e"], 1.0, 0.009, 0.4, 0.6, segments=6, tilt=0.12, noise=0.04)


def corten_edge(T, rnd):
    """Rasenkante aus Cortenstahl mit Abkantung: rostbraun, fleckig, Stöße alle 1 m"""
    _edge_blocks(T, rnd, 0.025, 0.0, ["#6f3519", "#76391b", "#6a3318"], 1.0, 0.009, 0.9, 0.2, segments=6, tilt=0.12, noise=0.2, scale=140)


#: Kantenstreifen: Schlüssel → (Länge × Tiefe in m, Pixel je m, Generator); nahtlos entlang der Länge, Wurzel/Mitte bei Tiefe/2
EDGE = {
    "grass": ((2.0, 0.4), 420, grass_edge),
    "kantenstein": ((2.0, 0.12), 420, kantenstein_edge),
    "steel": ((2.0, 0.06), 700, steel_edge),
    "corten": ((2.0, 0.06), 700, corten_edge),
}


# ------------------------------------------------------------------ Streuteile (einzeln, freigestellt)


def _pebble_obj(rnd, r: float, hex_: str, flat: float, angular: bool):
    me = pebble_mesh("sp", 1.0, rnd, flat, 1 if angular else 2, not angular, 0.2 if angular else 0.0)
    ob = link(bpy.data.objects.new("sp", me), outline=False)
    ob.scale = (r, r, r)
    ob.rotation_euler = Euler((0, 0, rnd.uniform(0, 6.28)))
    ob.data.materials.append(pmat(f"sp{hex_}", lin(hex_), 0.55, 0.12, 0.25, 25, 0.45))
    return ob


def scatter_pebble(rnd, i):
    tones = ["#d9cfbd", "#cfc3ab", "#e6ded0", "#b9ab92", "#a59a88", "#c9bea9"]
    _pebble_obj(rnd, rnd.uniform(0.008, 0.016), tones[i % len(tones)], 0.55, False)


def scatter_basalt(rnd, i):
    tones = ["#3a3d40", "#43464a", "#2c2f32", "#4d5053"]
    _pebble_obj(rnd, rnd.uniform(0.009, 0.017), tones[i % len(tones)], 0.6, True)


def scatter_bark(rnd, i):
    """Rindenstück: gewölbt, rissig, braun"""
    me = pebble_mesh("bk", 1.0, rnd, 0.25, 1, True, 0.15)
    ob = link(bpy.data.objects.new("bk", me), outline=False)
    L = rnd.uniform(0.025, 0.05)
    ob.scale = (L, L * rnd.uniform(0.45, 0.7), L)
    ob.rotation_euler = Euler((0, 0, rnd.uniform(0, 6.28)))
    tones = ["#5a4232", "#4a3628", "#6b4e3a", "#3d2d22"]
    ob.data.materials.append(pmat(f"bk{i}", lin(tones[i % 4]), 0.95, 0.25, 0.8, 50))


def scatter_leaf(rnd, i):
    """Herabgefallenes Blatt: leicht gewölbt, mit Mittelrippe angedeutet über Farbverlauf"""
    s_ = rnd.uniform(0.03, 0.05)
    outline = [(0, -s_), (s_ * 0.45, -s_ * 0.4), (s_ * 0.5, s_ * 0.25), (s_ * 0.25, s_ * 0.8), (0, s_ * 1.15), (-s_ * 0.25, s_ * 0.8), (-s_ * 0.5, s_ * 0.25), (-s_ * 0.45, -s_ * 0.4)]
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, abs(x) * 0.25 + rnd.uniform(0, 0.002))) for x, y in outline]
    mid = bm.verts.new((0, 0, 0.0))
    for k in range(len(vs)):
        bm.faces.new((mid, vs[k], vs[(k + 1) % len(vs)]))
    me = bpy.data.meshes.new("leaf")
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new("leaf", me), outline=False)
    ob.rotation_euler = Euler((rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3), rnd.uniform(0, 6.28)))
    tones = ["#b98d45", "#a8823e", "#8a6a3a", "#c4553a", "#6e5a34", "#9a7b3c"]
    ob.data.materials.append(pmat(f"lf{i}", lin(tones[i % len(tones)]), 0.7, 0.15, 0.2, 30, 0.3))


#: Streuteile: Art → (Generator, Anzahl Varianten)
SCATTER = {"pebble": (scatter_pebble, 8), "basalt": (scatter_basalt, 6), "bark": (scatter_bark, 8), "leaf": (scatter_leaf, 8)}

#: Beläge mit zusätzlichen Kachelvarianten (andere Zufallsverteilung, gleiche Maße)
VARIANTS = ["gravel", "basalt", "mulch", "barkMulch", "soil", "sand", "meadow"]
