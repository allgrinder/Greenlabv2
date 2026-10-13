"""
Generatoren für Zäune, Mauern, Einfassungen und Stufen – modern, grau/anthrazit, realistisch.

Konventionen wie in `items.py`: Jede Funktion `name(w, d, h)` baut das Objekt in Plan-Metern um den
Ursprung (Breite w entlang x, Tiefe d entlang y, Höhe h). Die Kamera blickt von Plan-Süden (+y), die
Schauseite liegt daher bei +y. Lineare Elemente (Zaunfelder, Mauern, Einfassungen) sind Module, die
sich in der App lückenlos aneinanderreihen lassen.

Viele gleichartige Kleinteile (Drähte, Steine, Bambusrohre, Lamellen) werden je Objekt in ein Mesh
zusammengefasst; die Farbstreuung je Teil kommt dann aus dem Punkt-Attribut `rnd` (0…1).
Eigene Materialien (Präfix `z_`) werden im Material-Cache von `lib` abgelegt, damit sie mit jeder
neuen Szene (`reset_scene`) verworfen werden.
"""
from __future__ import annotations

import math

import bmesh
import bpy
from mathutils import Matrix, Vector

import lib
from lib import P, box, foliage_carpet, link, mat, rng, veg_clump

# ------------------------------------------------------------------ Materialien


def _attr_rnd(nt):
    """Zufallswert je Teil: Punkt-Attribut `rnd` plus Objekt-Zufall (beides 0…1), gefaltet auf 0…1"""
    attr = nt.nodes.new("ShaderNodeAttribute")
    attr.attribute_type = "GEOMETRY"
    attr.attribute_name = "rnd"
    info = nt.nodes.new("ShaderNodeObjectInfo")
    add = nt.nodes.new("ShaderNodeMath")
    add.operation = "ADD"
    nt.links.new(attr.outputs["Fac"], add.inputs[0])
    nt.links.new(info.outputs["Random"], add.inputs[1])
    fr = nt.nodes.new("ShaderNodeMath")
    fr.operation = "FRACT"
    nt.links.new(add.outputs[0], fr.inputs[0])
    return fr.outputs[0]


def _brightness(nt, color_socket, rnd_socket, lo: float, hi: float):
    """Farbe je Teil heller/dunkler: color · (lo + (hi − lo) · rnd)"""
    ma = nt.nodes.new("ShaderNodeMath")
    ma.operation = "MULTIPLY_ADD"
    nt.links.new(rnd_socket, ma.inputs[0])
    ma.inputs[1].default_value = hi - lo
    ma.inputs[2].default_value = lo
    mul = nt.nodes.new("ShaderNodeVectorMath")
    mul.operation = "SCALE"
    nt.links.new(color_socket, mul.inputs[0])
    nt.links.new(ma.outputs[0], mul.inputs["Scale"])
    return mul.outputs[0]


def _wood(m, b, dark, light, grain_axis: str, scale: float = 9.0):
    """Holz ohne Brettfugen: Maserung (Wellen) entlang des Holzes, Helligkeit je Teil, feine Rauheit"""
    nt = m.node_tree
    tc = nt.nodes.new("ShaderNodeTexCoord")
    # Maserstreifen verlaufen entlang des Holzes: Wellenbänder quer dazu
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.bands_direction = grain_axis
    wave.inputs["Scale"].default_value = scale
    wave.inputs["Distortion"].default_value = 6
    wave.inputs["Detail"].default_value = 4
    wave.inputs["Detail Scale"].default_value = 1.6
    nt.links.new(tc.outputs["Object"], wave.inputs["Vector"])
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 3.0
    nt.links.new(tc.outputs["Object"], noise.inputs["Vector"])
    mixf = nt.nodes.new("ShaderNodeMix")
    mixf.data_type = "FLOAT"
    mixf.inputs["Factor"].default_value = 0.45
    nt.links.new(wave.outputs["Fac"], mixf.inputs["A"])
    nt.links.new(noise.outputs["Fac"], mixf.inputs["B"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*dark, 1)
    ramp.color_ramp.elements[1].color = (*light, 1)
    nt.links.new(mixf.outputs["Result"], ramp.inputs["Fac"])
    col = _brightness(nt, ramp.outputs["Color"], _attr_rnd(nt), 0.78, 1.18)
    nt.links.new(col, b.inputs["Base Color"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.25
    nt.links.new(wave.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])


def zmat(kind: str) -> bpy.types.Material:
    """Zusätzliche Materialien dieser Gruppe (Präfix z_); alles andere aus `lib.mat`"""
    if not kind.startswith("z_"):
        return mat(kind)
    if kind in lib._mats:
        return lib._mats[kind]
    m, b = lib._principled(kind)
    nt = m.node_tree
    if kind in ("z_larch_h", "z_larch_v", "z_larch_x"):
        # vergraute Lärche: silbergrau mit warmem Unterton; Maserung horizontal (h), senkrecht (v) oder entlang x (Pfähle: x)
        axis = {"z_larch_h": "Z", "z_larch_v": "X", "z_larch_x": "X"}[kind]
        _wood(m, b, (0.1, 0.092, 0.08), (0.27, 0.255, 0.23), axis, 7.0 if kind == "z_larch_h" else 9.0)
        b.inputs["Roughness"].default_value = 0.82
    elif kind == "z_endgrain":
        # Hirnholz der Palisaden: Jahresringe um die Pfahlachse, Risse, etwas heller als die Mantelfläche
        tc = nt.nodes.new("ShaderNodeTexCoord")
        wave = nt.nodes.new("ShaderNodeTexWave")
        wave.wave_type = "RINGS"
        wave.rings_direction = "Z"
        wave.inputs["Scale"].default_value = 28
        wave.inputs["Distortion"].default_value = 2.5
        wave.inputs["Detail"].default_value = 3
        nt.links.new(tc.outputs["Object"], wave.inputs["Vector"])
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = (0.13, 0.115, 0.095, 1)
        ramp.color_ramp.elements[1].color = (0.3, 0.275, 0.235, 1)
        nt.links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
        col = _brightness(nt, ramp.outputs["Color"], _attr_rnd(nt), 0.8, 1.15)
        nt.links.new(col, b.inputs["Base Color"])
        b.inputs["Roughness"].default_value = 0.9
        lib._bump(m, b, 80, 0.3)
    elif kind == "z_bamboo":
        # Bambusrohre: strohgelb bis hellbraun, je Rohr verschieden; dunklere Knoten in unregelmäßigen Abständen
        tc = nt.nodes.new("ShaderNodeTexCoord")
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(tc.outputs["Object"], sep.inputs["Vector"])
        rnd = _attr_rnd(nt)
        # Knoten: fract(z / 0.3 + rnd · 7) < 0.03
        sh = nt.nodes.new("ShaderNodeMath")
        sh.operation = "MULTIPLY_ADD"
        nt.links.new(rnd, sh.inputs[0])
        sh.inputs[1].default_value = 7.0
        dz = nt.nodes.new("ShaderNodeMath")
        dz.operation = "DIVIDE"
        nt.links.new(sep.outputs["Z"], dz.inputs[0])
        dz.inputs[1].default_value = 0.3
        nt.links.new(dz.outputs[0], sh.inputs[2])
        fr = nt.nodes.new("ShaderNodeMath")
        fr.operation = "FRACT"
        nt.links.new(sh.outputs[0], fr.inputs[0])
        node = nt.nodes.new("ShaderNodeMath")
        node.operation = "LESS_THAN"
        node.inputs[1].default_value = 0.035
        nt.links.new(fr.outputs[0], node.inputs[0])
        # Längsfasern
        wave = nt.nodes.new("ShaderNodeTexWave")
        wave.bands_direction = "X"
        wave.inputs["Scale"].default_value = 60
        wave.inputs["Distortion"].default_value = 2
        nt.links.new(tc.outputs["Object"], wave.inputs["Vector"])
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = (0.2, 0.15, 0.075, 1)
        ramp.color_ramp.elements[1].color = (0.42, 0.33, 0.17, 1)
        mixr = nt.nodes.new("ShaderNodeMix")
        mixr.data_type = "FLOAT"
        mixr.inputs["Factor"].default_value = 0.25
        nt.links.new(rnd, mixr.inputs["A"])
        nt.links.new(wave.outputs["Fac"], mixr.inputs["B"])
        nt.links.new(mixr.outputs["Result"], ramp.inputs["Fac"])
        mixn = nt.nodes.new("ShaderNodeMix")
        mixn.data_type = "RGBA"
        nt.links.new(node.outputs[0], mixn.inputs["Factor"])
        nt.links.new(ramp.outputs["Color"], mixn.inputs["A"])
        mixn.inputs["B"].default_value = (0.09, 0.065, 0.035, 1)
        nt.links.new(mixn.outputs["Result"], b.inputs["Base Color"])
        b.inputs["Roughness"].default_value = 0.45
        b.inputs["Coat Weight"].default_value = 0.2
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.5
        nt.links.new(node.outputs[0], bump.inputs["Height"])
        nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    elif kind == "z_galv":
        # feuerverzinkter bzw. Galfan-Draht: hellgrau metallisch, leicht fleckig
        lib._color_noise(m, b, (0.3, 0.31, 0.31), (0.45, 0.46, 0.46), 25)
        b.inputs["Metallic"].default_value = 0.85
        b.inputs["Roughness"].default_value = 0.42
    elif kind == "z_gstone":
        # gebrochener Granit/Grauwacke als Gabionenfüllung: Grau in vielen Tönen, wenige warme Steine
        rnd = _attr_rnd(nt)
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        cr = ramp.color_ramp
        cr.elements[0].position = 0.0
        cr.elements[0].color = (0.05, 0.05, 0.05, 1)
        cr.elements[1].position = 1.0
        cr.elements[1].color = (0.36, 0.35, 0.33, 1)
        e = cr.elements.new(0.55)
        e.color = (0.17, 0.165, 0.155, 1)
        e = cr.elements.new(0.82)
        e.color = (0.26, 0.22, 0.18, 1)
        nt.links.new(rnd, ramp.inputs["Fac"])
        tex = nt.nodes.new("ShaderNodeTexNoise")
        tex.inputs["Scale"].default_value = 60
        tex.inputs["Detail"].default_value = 8
        sp = nt.nodes.new("ShaderNodeMix")
        sp.data_type = "RGBA"
        sp.blend_type = "MULTIPLY"
        sp.inputs["Factor"].default_value = 0.6
        nt.links.new(ramp.outputs["Color"], sp.inputs["A"])
        nt.links.new(tex.outputs["Color"], sp.inputs["B"])
        bright = _brightness(nt, sp.outputs["Result"], tex.outputs["Fac"], 1.2, 2.0)
        nt.links.new(bright, b.inputs["Base Color"])
        b.inputs["Roughness"].default_value = 0.88
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.35
        nt.links.new(tex.outputs["Fac"], bump.inputs["Height"])
        nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    elif kind == "z_rubber":  # Kunststoffkappen, Gummipuffer
        b.inputs["Base Color"].default_value = (0.02, 0.02, 0.02, 1)
        b.inputs["Roughness"].default_value = 0.7
    elif kind == "z_steel":  # gebürsteter Edelstahl (Drückergarnitur)
        b.inputs["Base Color"].default_value = (0.55, 0.55, 0.54, 1)
        b.inputs["Metallic"].default_value = 1.0
        b.inputs["Roughness"].default_value = 0.3
    else:
        raise KeyError(kind)
    lib._ao(m, 0.7)
    lib._mats[kind] = m
    return m


def zbox(name, x0, y0, z0, x1, y1, z1, material: str, bevel: float = 0.0):
    """Quader wie `lib.box`, aber auch mit den z_-Materialien"""
    ob = box(name, x0, y0, z0, x1, y1, z1, "graphite" if material.startswith("z_") else material, bevel)
    ob.data.materials[0] = zmat(material)
    return ob


# ------------------------------------------------------------------ Sammel-Meshes


class Batch:
    """Viele Kleinteile in einem Mesh (bmesh), je Teil ein Zufallswert im Attribut `rnd`"""

    def __init__(self, name: str, seed: int = 1):
        self.name = name
        self.bm = bmesh.new()
        self.lay = self.bm.verts.layers.float.new("rnd")
        self.r = rng(seed)

    def _tag(self, verts, rnd: float | None = None):
        v_ = self.r.random() if rnd is None else rnd
        for v in verts:
            v[self.lay] = v_

    def rod(self, p0, p1, radius: float, segs: int = 8, rnd: float | None = None):
        """Rundstab zwischen zwei Plan-Punkten (x, y, z)"""
        a, b_ = P(*p0), P(*p1)
        d = b_ - a
        mtx = Matrix.Translation((a + b_) / 2) @ d.normalized().to_track_quat("Z", "Y").to_matrix().to_4x4()
        res = bmesh.ops.create_cone(self.bm, cap_ends=True, segments=segs, radius1=radius, radius2=radius, depth=d.length, matrix=mtx)
        self._tag(res["verts"], rnd)
        return res["verts"]

    def cube(self, x0, y0, z0, x1, y1, z1, rnd: float | None = None, jitter: float = 0.0):
        res = bmesh.ops.create_cube(self.bm, size=1.0)
        for v in res["verts"]:
            sx, sy, sz = (1 if v.co.x > 0 else 0), (1 if v.co.y > 0 else 0), (1 if v.co.z > 0 else 0)
            x = x1 if sx else x0
            y = y1 if sy else y0
            z = z1 if sz else z0
            if jitter:
                x += self.r.uniform(-jitter, jitter)
                y += self.r.uniform(-jitter, jitter)
                z += self.r.uniform(-jitter, jitter) * 0.5
            v.co = P(x, y, z)
        self._tag(res["verts"], rnd)
        return res["verts"]

    def prism(self, profile_yz, x0: float, x1: float, rnd: float | None = None):
        """Gerades Profil (Liste von (y, z) gegen den Uhrzeigersinn von +x gesehen) von x0 bis x1 extrudiert"""
        a = [self.bm.verts.new(P(x0, y, z)) for y, z in profile_yz]
        b_ = [self.bm.verts.new(P(x1, y, z)) for y, z in profile_yz]
        n = len(a)
        self.bm.faces.new(a)
        self.bm.faces.new(list(reversed(b_)))
        for i in range(n):
            self.bm.faces.new((a[i], a[(i + 1) % n], b_[(i + 1) % n], b_[i]))
        self._tag(a + b_, rnd)
        return a + b_

    def rock(self, cx, cy, cz, rx, ry, rz, rnd: float | None = None):
        """Gebrochener Stein: verformtes Ikosaeder, kantig (flach schattiert)"""
        res = bmesh.ops.create_icosphere(self.bm, subdivisions=1, radius=1.0)
        r = self.r
        rot = Matrix.Rotation(r.uniform(0, math.tau), 3, "Z") @ Matrix.Rotation(r.uniform(-0.6, 0.6), 3, "X")
        for v in res["verts"]:
            k = r.uniform(0.78, 1.12)
            c = rot @ Vector((v.co.x * rx * k, v.co.y * ry * k, v.co.z * rz * k))
            v.co = P(cx, cy, cz) + c
        self._tag(res["verts"], rnd)
        return res["verts"]

    def finish(self, material: str, smooth: bool = False, bevel: float = 0.0, outline: bool = True):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        ob = link(bpy.data.objects.new(self.name, me), outline=outline)
        ob.data.materials.append(zmat(material))
        for p in me.polygons:
            p.use_smooth = smooth
        if bevel > 0:
            mod = ob.modifiers.new("bevel", "BEVEL")
            mod.width = bevel
            mod.segments = 2
            mod.limit_method = "ANGLE"
        return ob


# ------------------------------------------------------------------ Doppelstabmatten


def _dsm_mat(x0: float, x1: float, z0: float, z1: float, yc: float, name: str = "mat", step: float = 0.05, overhang: float = 0.03, seed: int = 1):
    """Doppelstabmatte 8/6/8: senkrechte 6-mm-Stäbe alle 5 cm zwischen waagerechten 8-mm-Doppelstäben alle 20 cm;
    oben stehen die Senkrechtstäbe um `overhang` über."""
    bt = Batch(name, seed)
    n = max(2, round((x1 - x0) / step))
    sx = (x1 - x0 - 0.012) / n
    top_h = z1 - overhang
    for i in range(n + 1):
        x = x0 + 0.006 + i * sx
        bt.rod((x, yc, z0), (x, yc, z1), 0.003, 6, 0.5)
    k = max(1, round((top_h - z0 - 0.02) / 0.2))
    for j in range(k + 1):
        z = z0 + 0.02 + (top_h - z0 - 0.02) * j / k
        for dy in (-0.007, 0.007):
            bt.rod((x0, yc + dy, z), (x1, yc + dy, z), 0.004, 8, 0.5)
    return bt.finish("anthracite", smooth=True)


def _steel_post(name: str, cx: float, cy: float, sx: float, sy: float, h: float):
    """Pfosten aus Rechteckrohr mit Kunststoffkappe"""
    zbox(name, cx - sx / 2, cy - sy / 2, 0, cx + sx / 2, cy + sy / 2, h - 0.008, "anthracite", 0.004)
    zbox(name + "_cap", cx - sx / 2 - 0.002, cy - sy / 2 - 0.002, h - 0.012, cx + sx / 2 + 0.002, cy + sy / 2 + 0.002, h, "z_rubber", 0.004)


def dsm_fence(w: float, d: float, h: float):
    """Doppelstabmattenzaun anthrazit, Feld 2,5 m: Pfosten 60 × 40 mit Klemmleisten an beiden Enden, Matte davor"""
    pw, pd = 0.06, 0.04
    py = -0.012  # Pfosten etwas hinter der Mitte, Matte liegt vorne an
    for side in (-1, 1):
        cx = side * (w / 2 - pw / 2)
        _steel_post(f"post_{side}", cx, py, pw, pd, h)
        # Klemmleisten über der Matte: vier Stück je Pfosten, mit Schraubenköpfen
        for z in (0.12, 0.52, 0.92, h - 0.1):
            zbox("clamp", cx - 0.022, 0.022, z - 0.03, cx + 0.022, 0.03, z + 0.03, "anthracite", 0.002)
            zbox("bolt", cx - 0.006, 0.03, z - 0.006, cx + 0.006, 0.036, z + 0.006, "graphite", 0.002)
    _dsm_mat(-w / 2 + 0.004, w / 2 - 0.004, 0.04, h - 0.01, 0.0115)


def garden_gate(w: float, d: float, h: float):
    """Gartenpforte einflüglig, anthrazit: Pfosten 100 × 100, Flügel aus 40er-Rahmenrohr mit Doppelstabfüllung,
    Bänder links, Einsteckschloss mit Drückergarnitur rechts"""
    ps = 0.1
    for side in (-1, 1):
        cx = side * (w / 2 - ps / 2)
        _steel_post(f"post_{side}", cx, 0, ps, ps, h)
    # Flügel: Rahmen 40 × 40, unten 6 cm Bodenfreiheit
    lx0, lx1 = -w / 2 + ps + 0.025, w / 2 - ps - 0.015
    z0, z1 = 0.06, h - 0.06
    t = 0.04
    zbox("frame_l", lx0, -t / 2, z0, lx0 + t, t / 2, z1, "anthracite", 0.004)
    zbox("frame_r", lx1 - t, -t / 2, z0, lx1, t / 2, z1, "anthracite", 0.004)
    zbox("frame_b", lx0, -t / 2, z0, lx1, t / 2, z0 + t, "anthracite", 0.004)
    zbox("frame_t", lx0, -t / 2, z1 - t, lx1, t / 2, z1, "anthracite", 0.004)
    _dsm_mat(lx0 + t, lx1 - t, z0 + t, z1 - t, 0.0, "infill", overhang=0.0, seed=3)
    # Bänder (links) als Gewindebänder mit Laschen
    for z in (z0 + 0.15, z1 - 0.15):
        zbox("hinge_plate", lx0 - 0.004, -0.012, z - 0.03, lx0 + 0.06, 0.012, z + 0.03, "anthracite", 0.002)
        zbox("hinge_pin", -w / 2 + ps - 0.004, -0.014, z - 0.04, lx0 - 0.004, 0.014, z + 0.04, "graphite", 0.003)
    # Schlosskasten mit Drücker und Schließzylinder (Schauseite +y), Gegenkasten am rechten Pfosten
    zl = 0.95
    zbox("lockbox", lx1 - 0.12, -0.03, zl - 0.12, lx1 - 0.005, 0.03, zl + 0.08, "anthracite", 0.004)
    zbox("rosette", lx1 - 0.085, 0.03, zl - 0.03, lx1 - 0.045, 0.036, zl + 0.03, "z_steel", 0.003)
    zbox("handle", lx1 - 0.2, 0.036, zl - 0.012, lx1 - 0.06, 0.06, zl + 0.012, "z_steel", 0.008)
    zbox("cylinder", lx1 - 0.075, 0.03, zl - 0.095, lx1 - 0.055, 0.037, zl - 0.06, "z_steel", 0.003)
    zbox("striker", w / 2 - ps - 0.006, -0.03, zl - 0.12, w / 2 - ps + 0.002, 0.03, zl + 0.08, "graphite", 0.002)
    # Anschlag/Gummipuffer am Pfosten
    zbox("stop", w / 2 - ps - 0.012, -0.045, z0 + 0.3, w / 2 - ps, -0.025, z0 + 0.36, "z_rubber", 0.002)


# ------------------------------------------------------------------ Holz und Bambus


def larch_screen(w: float, d: float, h: float):
    """Sichtschutzzaun aus vergrauter Lärche: Pfosten 9 × 9 mit Abdeckkappe, Rhombuslamellen 21 × 68 mm
    mit 10 mm Luft, Abdeckleiste oben"""
    ps = 0.09
    for side in (-1, 1):
        cx = side * (w / 2 - ps / 2)
        zbox(f"post_{side}", cx - ps / 2, -ps / 2, 0, cx + ps / 2, ps / 2, h - 0.012, "z_larch_v", 0.004)
        zbox(f"cap_{side}", cx - ps / 2 - 0.006, -ps / 2 - 0.006, h - 0.012, cx + ps / 2 + 0.006, ps / 2 + 0.006, h, "anthracite", 0.003)
        # Halteleisten innen am Pfosten
        x_in = cx - side * ps / 2
        zbox("batten", min(x_in, x_in - side * 0.022), -0.032, 0.04, max(x_in, x_in - side * 0.022), -0.012, h - 0.06, "z_larch_v", 0.002)
    x0, x1 = -w / 2 + ps, w / 2 - ps
    bt = Batch("slats", seed=7)
    t, hs, gap = 0.021, 0.068, 0.010
    z = 0.05
    top = h - 0.06
    while z + hs + t <= top + 1e-6:
        # Rhombusprofil: Ober- und Unterkante unter 45° nach vorn (Plan +y) abfallend
        prof = [(t / 2, z), (t / 2, z + hs), (-t / 2, z + hs + t), (-t / 2, z + t)]
        bt.prism(prof, x0 + 0.001, x1 - 0.001)
        z += hs + gap
    bt.finish("z_larch_h", bevel=0.0015)
    # Abdeckleiste über den Lamellen
    zbox("top_rail", x0, -0.03, top + 0.005, x1, 0.03, top + 0.035, "z_larch_h", 0.003)


def bamboo_screen(w: float, d: float, h: float):
    """Bambusmatte als Sichtschutz: Rohre Ø 16–22 mm, mit verzinktem Draht gebunden, vor zwei anthrazit
    Stahlpfosten mit Querriegeln montiert"""
    ps = 0.06
    for side in (-1, 1):
        cx = side * (w / 2 - 0.12)
        _steel_post(f"post_{side}", cx, -0.01, ps, ps, h - 0.06)
    for z in (0.25, h - 0.3):
        zbox("rail", -w / 2 + 0.06, -0.006, z - 0.02, w / 2 - 0.06, 0.016, z + 0.02, "anthracite", 0.002)
    r = rng(31)
    bt = Batch("culms", seed=31)
    x = -w / 2 + 0.002
    yc = 0.03
    culms = []
    while True:
        rad = r.uniform(0.008, 0.011)
        if x + 2 * rad > w / 2 - 0.002:
            break
        cx = x + rad
        culms.append((cx, rad))
        bt.rod((cx, yc + r.uniform(-0.002, 0.002), 0.02 + r.uniform(0, 0.012)), (cx, yc + r.uniform(-0.002, 0.002), h - r.uniform(0, 0.018)), rad, 10)
        x += 2 * rad + r.uniform(0.0, 0.0015)
    bt.finish("z_bamboo", smooth=True)
    # Bindedraht: vier Lagen, vorne über die Rohre geführt
    wires = Batch("wire", seed=2)
    for z in (0.12, 0.62, 1.15, h - 0.12):
        wires.rod((-w / 2, yc + 0.0105, z), (w / 2, yc + 0.0105, z), 0.0012, 6, 0.5)
    wires.finish("z_galv", smooth=True, outline=False)


# ------------------------------------------------------------------ Gabione, Beton


def gabion_wall(w: float, d: float, h: float):
    """Gabionenwand: Drahtkörbe 1,0 m (Maschen 10 × 10 cm, Galfan-Draht 4,5 mm) mit gebrochenem Granit 60–120 mm"""
    r = rng(41)
    stones = Batch("stones", seed=41)
    inset = 0.012
    # dunkler Kern gegen Durchblicken zwischen den Steinen
    zbox("core", -w / 2 + 0.06, -d / 2 + 0.06, 0, w / 2 - 0.06, d / 2 - 0.06, h - 0.06, "z_rubber")

    def face_fill(axis_u, u0, u1, v0, v1, place):
        """Steine auf einer Fläche in versetzten Reihen (u entlang, v quer), `place(u, v, rx, ry, rz)` setzt einen Stein"""
        v = v0
        row = 0
        while v < v1:
            rv = r.uniform(0.035, 0.05)
            u = u0 + (r.uniform(0, 0.05) if row % 2 else 0)
            while u < u1:
                ru = r.uniform(0.04, 0.065)
                place(u + ru * 0.9, v + rv, ru, rv)
                u += ru * 1.7 + r.uniform(-0.004, 0.012)
            v += rv * 1.65
            row += 1

    def front(y_sign):
        def pl(u, v, ru, rv):
            t = r.uniform(0.03, 0.045)
            stones.rock(min(u, w / 2 - inset - ru * 0.7), y_sign * (d / 2 - inset - t), min(v, h - inset - rv), ru, t, rv)
        return pl

    face_fill("x", -w / 2 + inset, w / 2 - inset, 0.0, h - inset - 0.02, front(1))
    face_fill("x", -w / 2 + inset, w / 2 - inset, 0.0, h - inset - 0.02, front(-1))

    def top(u, v, ru, rv):
        t = r.uniform(0.028, 0.04)
        stones.rock(min(u, w / 2 - inset - ru * 0.7), v - d / 2, h - inset - t, ru, rv, t)

    face_fill("x", -w / 2 + inset, w / 2 - inset, inset, d - 2 * inset - 0.03, top)
    for x_sign in (-1, 1):
        def end(u, v, ru, rv, x_sign=x_sign):
            t = r.uniform(0.03, 0.045)
            stones.rock(x_sign * (w / 2 - inset - t), min(u, d / 2 - inset - ru * 0.7) , min(v, h - inset - rv), t, ru, rv)
        face_fill("y", -d / 2 + inset, d / 2 - inset, 0.0, h - inset - 0.02, end)
    stones.finish("z_gstone")

    # Körbe: Maschendraht auf allen Außenflächen, Trennwand je Meter, stärkere Randdrähte
    wire = Batch("mesh", seed=5)
    rw, re = 0.0023, 0.003
    n_x = max(1, round(w / 0.1))
    n_z = max(1, round(h / 0.1))
    n_y = max(1, round(d / 0.1))
    xs = [-w / 2 + w * i / n_x for i in range(n_x + 1)]
    zs = [h * k / n_z for k in range(n_z + 1)]
    ys = [-d / 2 + d * j / n_y for j in range(n_y + 1)]
    for y in (-d / 2, d / 2):
        for x in xs:
            wire.rod((x, y, 0.0), (x, y, h), re if x in (xs[0], xs[-1]) else rw, 6)
        for z in zs:
            wire.rod((-w / 2, y, z), (w / 2, y, z), re if z in (zs[0], zs[-1]) else rw, 6)
    # Deckel und Boden
    for z in (0.0, h):
        for x in xs:
            wire.rod((x, -d / 2, z), (x, d / 2, z), rw, 6)
        for y in ys[1:-1]:
            wire.rod((-w / 2, y, z), (w / 2, y, z), rw, 6)
    # Stirnseiten und Trennwände je Korb (1 m)
    n_baskets = max(1, round(w / 1.0))
    for i in range(n_baskets + 1):
        x = -w / 2 + w * i / n_baskets
        for y in ys:
            wire.rod((x, y, 0.0), (x, y, h), re if y in (ys[0], ys[-1]) else rw, 6)
        for z in zs:
            wire.rod((x, -d / 2, z), (x, d / 2, z), rw, 6)
    # Spiralverbinder an den Korbstößen der Schauseite angedeutet: kurze Wicklungen
    for i in range(1, n_baskets):
        x = -w / 2 + w * i / n_baskets
        for y in (-d / 2, d / 2):
            for k in range(int(h / 0.05)):
                z = k * 0.05 + 0.02
                wire.rod((x - 0.006, y, z), (x + 0.006, y, z + 0.025), 0.0018, 5)
    wire.finish("z_galv", smooth=True)


def l_stone(w: float, d: float, h: float):
    """L-Stein (Winkelstützelement) aus Beton: Wand 10 → 8 cm verjüngt, Fuß 11 cm, Voute, Transportanker oben;
    Fuß zur Schauseite (+y), 3 mm Fuge je Seite für die Reihung"""
    x0, x1 = -w / 2 + 0.003, w / 2 - 0.003
    y_back = -d / 2
    tb, tt, tf, v = 0.10, 0.08, 0.11, 0.035
    prof = [
        (y_back, 0.0),
        (d / 2, 0.0),
        (d / 2, tf - 0.012),
        (d / 2 - 0.02, tf),  # Fußvorderkante leicht gebrochen
        (y_back + tb + v, tf),
        (y_back + tb, tf + v),  # Voute
        (y_back + tt, h),
        (y_back, h),
    ]
    # Profil in Plan-(y, z); Blender-y ist gespiegelt – Reihenfolge so, dass die Normalen außen liegen
    bt = Batch("lstone", seed=1)
    bt.prism(prof, x0, x1, 0.5)
    ob = bt.finish("concrete", bevel=0.006)
    ob.modifiers["bevel"].segments = 3
    # Transportanker-Aussparungen oben in der Wand
    for x in (-w / 2 + 0.25, w / 2 - 0.25):
        zbox("anchor", x - 0.022, y_back + 0.02, h - 0.004, x + 0.022, y_back + tt - 0.02, h + 0.001, "concrete_dark", 0.004)
        zbox("anchor_hook", x - 0.006, y_back + tt / 2 - 0.004, h - 0.003, x + 0.006, y_back + tt / 2 + 0.004, h + 0.002, "graphite")


def block_steps(w: float, d: float, h: float):
    """Blockstufen aus Beton, 3 Stufen 15 × 37 cm, je 3 cm überlappend aufgelegt; darunter Magerbeton-Auflager"""
    n = 3
    sh = h / n
    ov = 0.03
    sd = (d + (n - 1) * ov) / n
    for i in range(n):
        y1 = d / 2 - i * (sd - ov)
        y0 = y1 - sd
        z0 = i * sh
        zbox(f"step_{i}", -w / 2, y0, z0, w / 2, y1, z0 + sh, "concrete", 0.008)
        if i:
            # Auflager unter dem hinteren Teil der Stufe, seitlich etwas eingerückt (Schattenfuge)
            zbox(f"bed_{i}", -w / 2 + 0.03, y0 + 0.02, 0.0, w / 2 - 0.03, y1 - ov, z0, "concrete_dark", 0.004)
    # feine Kantenfase der Trittkante als hellere Lichtkante wird über Bevel und AO erzeugt


# ------------------------------------------------------------------ Naturstein-Hochbeet, Palisaden


def _rough_block(bt: Batch, x0, y0, z0, x1, y1, z1, r):
    """Bruchstein als leicht verzogener Quader"""
    bt.cube(x0, y0, z0, x1, y1, z1, jitter=0.008)


def stone_raised_bed(w: float, d: float, h: float):
    """Hochbeet aus Naturstein (Trockenmauerwerk, 22 cm Wandstärke) mit Abdeckplatten, Erde und Kräuter/Gemüse"""
    r = rng(53)
    t = 0.22
    cap = 0.05
    stones = Batch("stones", seed=53)

    def run(axis: str, fixed0: float, fixed1: float, a0: float, a1: float, z: float, lh: float):
        """Steinreihe entlang `axis` von a0 bis a1, Querschnitt fixed0…fixed1"""
        a = a0 - r.uniform(0, 0.12)
        while a < a1 - 0.03:
            L = r.uniform(0.17, 0.36)
            s, e = max(a0, a + 0.007), min(a1, a + L - 0.007)
            if e - s > 0.05:
                f0 = fixed0 + r.uniform(0, 0.012)
                f1 = fixed1 - r.uniform(0, 0.012)
                zt = z + lh - r.uniform(0.006, 0.014)
                if axis == "x":
                    _rough_block(stones, s, f0, z + 0.004, e, f1, zt, r)
                else:
                    _rough_block(stones, f0, s, z + 0.004, f1, e, zt, r)
            a += L

    z = 0.0
    layer = 0
    while z < h - cap - 0.06:
        lh = min(r.uniform(0.09, 0.14), h - cap - z)
        if layer % 2 == 0:
            # Längsseiten laufen durch, Stirnseiten dazwischen (Eckverband)
            run("x", d / 2 - t, d / 2, -w / 2, w / 2, z, lh)
            run("x", -d / 2, -d / 2 + t, -w / 2, w / 2, z, lh)
            run("y", -w / 2, -w / 2 + t, -d / 2 + t, d / 2 - t, z, lh)
            run("y", w / 2 - t, w / 2, -d / 2 + t, d / 2 - t, z, lh)
        else:
            run("y", -w / 2, -w / 2 + t, -d / 2, d / 2, z, lh)
            run("y", w / 2 - t, w / 2, -d / 2, d / 2, z, lh)
            run("x", d / 2 - t, d / 2, -w / 2 + t, w / 2 - t, z, lh)
            run("x", -d / 2, -d / 2 + t, -w / 2 + t, w / 2 - t, z, lh)
        z += lh
        layer += 1
    stones.finish("stone", bevel=0.016)
    # Abdeckplatten: größere, flache Platten, 2 cm Überstand nach außen; je Platte eigener Farbton (Objekt-Zufall)
    zc = z
    ov = 0.025

    def caps(axis, f0, f1, a0, a1):
        a = a0
        while a < a1 - 0.02:
            L = r.uniform(0.32, 0.5)
            e = min(a1, a + L)
            if a1 - e < 0.12:
                e = a1
            if axis == "x":
                ob = zbox("cap", a + 0.005, f0, zc, e - 0.005, f1, zc + cap - r.uniform(0, 0.01), "stone", 0.012)
            else:
                ob = zbox("cap", f0, a + 0.005, zc, f1, e - 0.005, zc + cap - r.uniform(0, 0.01), "stone", 0.012)
            _ = ob
            a = e

    caps("x", d / 2 - t, d / 2 + ov, -w / 2 - ov, w / 2 + ov)
    caps("x", -d / 2 - ov, -d / 2 + t, -w / 2 - ov, w / 2 + ov)
    caps("y", -w / 2 - ov, -w / 2 + t, -d / 2 + t, d / 2 - t)
    caps("y", w / 2 - t, w / 2 + ov, -d / 2 + t, d / 2 - t)
    # Erde und Bepflanzung: Kräuter und Salate, an den Rändern etwas überhängend
    ix0, iy0, ix1, iy1 = -w / 2 + t, -d / 2 + t, w / 2 - t, d / 2 - t
    zs = h - 0.07
    zbox("soil", ix0, iy0, 0, ix1, iy1, zs, "soil")
    kinds = ["herb", "lettuce", "redlettuce", "herb", "chard", "kale", "herb"]
    rows = 2
    for j in range(rows):
        y = iy0 + (iy1 - iy0) * (j + 0.5) / rows
        x = ix0 + 0.12 + (0.1 if j else 0)
        k = 0
        while x < ix1 - 0.08:
            kind = kinds[(k * 3 + j * 2) % len(kinds)]
            veg_clump(kind, P(x + r.uniform(-0.03, 0.03), y + r.uniform(-0.04, 0.04), zs), r, 1.15 if kind == "herb" else 1.0)
            x += r.uniform(0.2, 0.27)
            k += 1
    foliage_carpet("weeds", ix0, iy0, ix1, iy1, zs, 420, 0.02, "leaf", "soil", seed=5)


def palisade_edge(w: float, d: float, h: float):
    """Palisaden-Einfassung aus Rundholz Ø 12 cm (vergraute Kiefer/Lärche), dicht gesetzt, Köpfe gefast"""
    r = rng(61)
    n = max(1, round(w / d))
    dia = w / n - 0.003
    rad = min(dia, d) / 2
    for i in range(n):
        cx = -w / 2 + (i + 0.5) * (w / n) + r.uniform(-0.002, 0.002)
        cy = r.uniform(-0.004, 0.004)
        top = h - r.uniform(0.0, 0.025)
        rr = rad * r.uniform(0.93, 1.0)
        me = bpy.data.meshes.new("pole")
        bm = bmesh.new()
        lay = bm.verts.layers.float.new("rnd")
        res = bmesh.ops.create_cone(bm, cap_ends=True, segments=28, radius1=rr, radius2=rr, depth=top, matrix=Matrix.Translation((0, 0, top / 2)))
        # leicht unrund wie gewachsenes Holz
        ph = r.uniform(0, math.tau)
        for v in res["verts"]:
            a = math.atan2(v.co.y, v.co.x)
            k = 1 + 0.03 * math.sin(2 * a + ph) + 0.015 * math.sin(5 * a + ph * 2)
            v.co.x *= k
            v.co.y *= k
            v[lay] = r.random()
        for f in bm.faces:
            if f.normal.z > 0.9:
                f.material_index = 1
            f.smooth = abs(f.normal.z) < 0.5
        bm.to_mesh(me)
        bm.free()
        ob = link(bpy.data.objects.new("pole", me))
        ob.data.materials.append(zmat("z_larch_x"))
        ob.data.materials.append(zmat("z_endgrain"))
        ob.location = P(cx, cy, 0)
        ob.rotation_euler = (r.uniform(-0.012, 0.012), r.uniform(-0.012, 0.012), r.uniform(0, math.tau))
        bev = ob.modifiers.new("bevel", "BEVEL")
        bev.width = 0.012
        bev.segments = 3
        bev.limit_method = "ANGLE"
        bev.angle_limit = math.radians(60)


GENERATORS = {
    "dsmFence": dsm_fence,
    "larchScreen": larch_screen,
    "bambooScreen": bamboo_screen,
    "gardenGate": garden_gate,
    "gabionWall": gabion_wall,
    "lStone": l_stone,
    "stoneRaisedBed": stone_raised_bed,
    "palisadeEdge": palisade_edge,
    "blockSteps": block_steps,
}
