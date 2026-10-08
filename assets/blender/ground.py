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


@ground("paving", (1.6, 0.8), 360)
def paving(T, rnd):
    """Betonplatten 80 × 40, hellgrau, Kreuzfuge versetzt, leicht gefast"""
    base_plane(T, pmat("joint", lin("#5d5850"), 1.0, 0.2, 0.8, 120), -0.01)
    mats = [pmat(f"slab{i}", lin(h), 0.8, 0.05, 0.15, 6, 0.35) for i, h in enumerate(["#c9c4ba", "#c2bcb1", "#cfcac1", "#bdb7ac"])]
    for row in range(3):
        off = (row % 2) * 0.4
        y0 = row * 0.4
        if y0 >= T[1]:
            continue
        # genau eine Periode je Reihe; tiled() ergänzt die Ränder (keine doppelten Flächen)
        for col in range(2):
            x0 = col * 0.8 + off
            ob = link(bpy.data.objects.new("slab", slab_mesh("slab", 0.794, 0.394, 0.03)), outline=False)
            ob.location = P(x0 + 0.4, y0 + 0.2, -0.015 + rnd.uniform(-0.001, 0.001))
            ob.rotation_euler = Euler((rnd.uniform(-0.004, 0.004), rnd.uniform(-0.004, 0.004), rnd.uniform(-0.004, 0.004)))
            bev = ob.modifiers.new("b", "BEVEL")
            bev.width = 0.004
            bev.segments = 2
            bev.limit_method = "ANGLE"
            ob.data.materials.append(mats[rnd.randrange(len(mats))])
            tiled(ob, T, 0.5)


@ground("slabs", (2.4, 1.2), 260)
def slabs(T, rnd):
    """Großformatplatten 120 × 60 Beton hellgrau, enge Fuge, Halbverband"""
    base_plane(T, pmat("joint2", lin("#55524c"), 1.0, 0.2, 0.8, 120), -0.01)
    mats = [pmat(f"lslab{i}", lin(h), 0.75, 0.06, 0.12, 3, 0.35) for i, h in enumerate(["#c6c2ba", "#bfbbb3", "#cbc7c0", "#b9b5ad"])]
    for row in range(2):
        off = (row % 2) * 0.6
        for col in range(2):
            ob = link(bpy.data.objects.new("lslab", slab_mesh("lslab", 1.195, 0.595, 0.04)), outline=False)
            ob.location = P(col * 1.2 + off + 0.6, row * 0.6 + 0.3, -0.02 + rnd.uniform(-0.001, 0.001))
            ob.rotation_euler = Euler((rnd.uniform(-0.003, 0.003), rnd.uniform(-0.003, 0.003), rnd.uniform(-0.002, 0.002)))
            bev = ob.modifiers.new("b", "BEVEL")
            bev.width = 0.003
            bev.segments = 2
            bev.limit_method = "ANGLE"
            ob.data.materials.append(mats[rnd.randrange(len(mats))])
            tiled(ob, T, 0.7)


@ground("wood", (2.4, 1.12), 300)
def wood(T, rnd):
    """Holzdeck Lärche: 14-cm-Dielen mit 6 mm Fugen, versetzte Stöße, Maserung, Schraubenpaare"""
    base_plane(T, pmat("gap", lin("#2a221b"), 1.0), -0.03)
    # Lärche, leicht vergraut (wie im Konzept): warmes Graubraun statt Orange
    tones = ["#9a8166", "#8e765d", "#a48b70", "#85705a", "#ab937a"]
    gm = []
    for i, h in enumerate(tones):
        m, b = _principled(f"plank{i}")
        nt = m.node_tree
        tc = nt.nodes.new("ShaderNodeTexCoord")
        wave = nt.nodes.new("ShaderNodeTexWave")
        wave.bands_direction = "Y"
        wave.inputs["Scale"].default_value = 9
        wave.inputs["Distortion"].default_value = 4
        wave.inputs["Detail"].default_value = 6
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        c = lin(h)
        ramp.color_ramp.elements[0].color = (*[v * 0.72 for v in c], 1)
        ramp.color_ramp.elements[1].color = (*[min(1, v * 1.12) for v in c], 1)
        nt.links.new(tc.outputs["Object"], wave.inputs["Vector"])
        nt.links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
        b.inputs["Roughness"].default_value = 0.65
        _ao(m, 0.6, 0.04)
        gm.append(m)
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


#: Trittplatten (Naturstein, freigestellt) – Einzelbilder statt Kachel
STEPPING = 4


def stepping_stone(rnd: random.Random, i: int):
    """Betontrittplatte 85 × 40 × 5 cm: scharfe, leicht gefaste Kanten, feine Poren, etwas Patina an den Rändern"""
    w, d, t = 0.85, 0.4, 0.05
    ob = link(bpy.data.objects.new("stone", slab_mesh("stone", w, d, t)), outline=False)
    ob.location = (0, 0, t / 2 - 0.01)
    ob.rotation_euler = (rnd.uniform(-0.008, 0.008), rnd.uniform(-0.008, 0.008), 0)
    bev = ob.modifiers.new("b", "BEVEL")
    bev.width = 0.006
    bev.segments = 2
    bev.limit_method = "ANGLE"
    tone = ["#8e8b84", "#87847d", "#94918a", "#827f78"][i % 4]
    m = pmat(f"stone{i}", lin(tone), 0.82, 0.12, 0.35, 14, 0.3)
    ob.data.materials.append(m)
    return ob
