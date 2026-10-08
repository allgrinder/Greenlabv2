"""
Gemeinsame Bausteine für die Gartenwerk-Assets in Blender (bpy 5.2, ohne Oberfläche).

Koordinaten: Generatoren arbeiten in Plan-Metern (x nach rechts, y nach unten wie im Plan,
z nach oben). `P(x, y, z)` wandelt in Blender-Koordinaten (y nach oben) um.
Licht kommt im Plan von oben links (wie Schatten und gemalte Texturen der App).
Gerendert wird ohne Boden und ohne Schlagschatten: Schatten rechnet die App selbst.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass

import bpy  # noqa: I001 – bpy muss vor bmesh geladen werden
import bmesh
from mathutils import Euler, Matrix, Vector

# Plan-Lichtrichtung (zur Lichtquelle hin), wie `L` in render/symbols/foliage.ts
PLAN_LIGHT = (-0.62, -0.78)
SUN_ELEVATION_DEG = 52
OBLIQUE_TILT_DEG = 35  # wie OBLIQUE_TILT_DEG in render/Viewport.ts


def P(x: float, y: float, z: float = 0.0) -> Vector:
    """Plan → Blender"""
    return Vector((x, -y, z))


# ------------------------------------------------------------------ Szene


def reset_scene(samples: int = 64, ground: bool = True, outlines: bool = True) -> bpy.types.Scene:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _mats.clear()
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.film_transparent_glass = True
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast"
    sc.view_settings.exposure = -0.1
    sc.cycles.max_bounces = 6

    # warme Sonne von oben links (Plan), weich; kühler Himmel als Aufhellung der Schatten
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sc.collection.objects.link(sun)
    sun.data.energy = 5.0
    sun.data.color = (1.0, 0.92, 0.8)
    sun.data.angle = math.radians(7)
    e = math.radians(SUN_ELEVATION_DEG)
    to_sun = P(PLAN_LIGHT[0] * math.cos(e), PLAN_LIGHT[1] * math.cos(e), math.sin(e)).normalized()
    sun.rotation_euler = to_sun.to_track_quat("Z", "Y").to_euler()
    w = bpy.data.worlds.new("world")
    sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.55, 0.66, 0.86, 1)
    bg.inputs["Strength"].default_value = 0.5

    if ground:
        # Boden nur für Licht: wirft grünlich-warmes Licht zurück und dunkelt Fußpunkte ab,
        # ist aber für die Kamera unsichtbar (die App zeichnet den echten Boden und den Schatten)
        bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, -0.002))
        g = bpy.context.object
        g.name = GROUND
        gm, gb = _principled("ground")
        gb.inputs["Base Color"].default_value = (0.2, 0.22, 0.1, 1)
        gb.inputs["Roughness"].default_value = 1.0
        g.data.materials.append(gm)
        g.visible_camera = False
        g.visible_glossy = True

    if outlines:
        # feine warme Konturen wie in kolorierten Plänen
        sc.render.use_freestyle = True
        sc.render.line_thickness_mode = "ABSOLUTE"
        sc.render.line_thickness = 0.9
        vl = sc.view_layers[0]
        vl.use_freestyle = True
        fs = vl.freestyle_settings
        fs.crease_angle = math.radians(120)
        ls = fs.linesets[0] if fs.linesets else fs.linesets.new("lines")
        ls.select_by_visibility = True
        ls.select_silhouette = True
        ls.select_border = True
        ls.select_crease = True
        col = bpy.data.collections.get(OUTLINE) or bpy.data.collections.new(OUTLINE)
        if col.name not in sc.collection.children:
            sc.collection.children.link(col)
        ls.select_by_collection = True
        ls.collection = col
        ls.collection_negation = "INCLUSIVE"
        style = ls.linestyle or bpy.data.linestyles.new("lines")
        ls.linestyle = style
        style.color = (0.09, 0.075, 0.06)
        style.alpha = 0.55
        style.thickness = 0.9
    return sc


GROUND = "ground_bounce"


OUTLINE = "outline"


def link(ob: bpy.types.Object, outline: bool = True) -> bpy.types.Object:
    """Objekt in die Szene; harte Objekte zusätzlich in die Sammlung mit Konturlinien"""
    bpy.context.scene.collection.objects.link(ob)
    if outline:
        col = bpy.data.collections.get(OUTLINE)
        if col is None:
            col = bpy.data.collections.new(OUTLINE)
            bpy.context.scene.collection.children.link(col)
        col.objects.link(ob)
    return ob


# ------------------------------------------------------------------ Materialien

_mats: dict[str, bpy.types.Material] = {}


def _principled(name: str) -> tuple[bpy.types.Material, bpy.types.Node]:
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    return m, m.node_tree.nodes["Principled BSDF"]


def _ao(m: bpy.types.Material, strength: float = 0.8, distance: float = 0.35):
    """Umgebungsverdeckung in die Grundfarbe mischen: Fugen, Ecken und das Innere von Laub werden dunkler"""
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    inp = bsdf.inputs["Base Color"]
    ao = nt.nodes.new("ShaderNodeAmbientOcclusion")
    ao.samples = 4
    ao.inputs["Distance"].default_value = distance
    mixn = nt.nodes.new("ShaderNodeMix")
    mixn.data_type = "RGBA"
    mixn.inputs["Factor"].default_value = strength
    if inp.is_linked:
        src = inp.links[0].from_socket
        nt.links.remove(inp.links[0])
        nt.links.new(src, ao.inputs["Color"])
        nt.links.new(src, mixn.inputs["A"])
    else:
        ao.inputs["Color"].default_value = inp.default_value
        mixn.inputs["A"].default_value = inp.default_value
    nt.links.new(ao.outputs["Color"], mixn.inputs["B"])
    nt.links.new(mixn.outputs["Result"], inp)


def _planks(m, bsdf, a, b, period: float, gap_color, axes: tuple[str, ...] = ("X", "Y")):
    """Bretter mit Fugen quer zu `axes` (Objektkoordinaten) und feiner Maserung entlang der Bretter"""
    nt = m.node_tree
    tc = nt.nodes.new("ShaderNodeTexCoord")
    grain = nt.nodes.new("ShaderNodeTexWave")
    grain.bands_direction = axes[0]
    grain.inputs["Scale"].default_value = 14.0
    grain.inputs["Distortion"].default_value = 3
    grain.inputs["Detail"].default_value = 3
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*a, 1)
    ramp.color_ramp.elements[1].color = (*b, 1)
    nt.links.new(tc.outputs["Object"], grain.inputs["Vector"])
    nt.links.new(grain.outputs["Fac"], ramp.inputs["Fac"])
    # Helligkeit je Brett
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs["Vector"])
    seams = []
    for axis in axes:
        div = nt.nodes.new("ShaderNodeMath")
        div.operation = "DIVIDE"
        div.inputs[1].default_value = period
        nt.links.new(sep.outputs[axis], div.inputs[0])
        fr = nt.nodes.new("ShaderNodeMath")
        fr.operation = "FRACT"
        nt.links.new(div.outputs[0], fr.inputs[0])
        st = nt.nodes.new("ShaderNodeMath")
        st.operation = "LESS_THAN"
        st.inputs[1].default_value = 0.06
        nt.links.new(fr.outputs[0], st.inputs[0])
        seams.append(st)
    both = nt.nodes.new("ShaderNodeMath")
    both.operation = "MAXIMUM"
    nt.links.new(seams[0].outputs[0], both.inputs[0])
    nt.links.new(seams[-1].outputs[0], both.inputs[1])
    mixn = nt.nodes.new("ShaderNodeMix")
    mixn.data_type = "RGBA"
    nt.links.new(both.outputs[0], mixn.inputs["Factor"])
    nt.links.new(ramp.outputs["Color"], mixn.inputs["A"])
    mixn.inputs["B"].default_value = (*gap_color, 1)
    nt.links.new(mixn.outputs["Result"], bsdf.inputs["Base Color"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.35
    bump.invert = True
    nt.links.new(both.outputs[0], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])


def _leaf_mat(name: str, dark, light, subsurface: float = 0.25):
    m, b = _principled(name)
    nt = m.node_tree
    info = nt.nodes.new("ShaderNodeObjectInfo")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*dark, 1)
    ramp.color_ramp.elements[1].color = (*light, 1)
    nt.links.new(info.outputs["Random"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.5
    b.inputs["Subsurface Weight"].default_value = subsurface
    b.inputs["Subsurface Radius"].default_value = (0.2, 0.3, 0.05)
    b.inputs["Specular IOR Level"].default_value = 0.35
    return m, b


#: Laubfarben (dunkel, hell) für Blätter; Gemüse und Stauden nutzen dieselbe Funktion
LEAF_COLORS = {
    "leaf": ((0.035, 0.085, 0.02), (0.17, 0.3, 0.06)),
    "leaf_light": ((0.12, 0.2, 0.04), (0.33, 0.45, 0.1)),
    "leaf_blue": ((0.04, 0.075, 0.06), (0.12, 0.2, 0.16)),
    "leaf_red": ((0.09, 0.015, 0.025), (0.26, 0.05, 0.08)),
    "leaf_sedum": ((0.07, 0.13, 0.03), (0.22, 0.34, 0.08)),
    "leaf_sedum_red": ((0.16, 0.06, 0.04), (0.35, 0.16, 0.08)),
}


def _bump(m: bpy.types.Material, bsdf, scale: float, strength: float, detail: float = 6.0):
    nt = m.node_tree
    tex = nt.nodes.new("ShaderNodeTexNoise")
    tex.inputs["Scale"].default_value = scale
    tex.inputs["Detail"].default_value = detail
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = strength
    nt.links.new(tex.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return tex


def _color_noise(m, bsdf, a, b, scale: float, coord: str = "Object"):
    """Farbschwankung zwischen a und b"""
    nt = m.node_tree
    tc = nt.nodes.new("ShaderNodeTexCoord")
    tex = nt.nodes.new("ShaderNodeTexNoise")
    tex.inputs["Scale"].default_value = scale
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*a, 1)
    ramp.color_ramp.elements[1].color = (*b, 1)
    nt.links.new(tc.outputs[coord], tex.inputs["Vector"])
    nt.links.new(tex.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])


def mat(kind: str) -> bpy.types.Material:
    """Materialbibliothek: modern, grau und anthrazit"""
    if kind in _mats:
        return _mats[kind]
    if kind == "anthracite":  # pulverbeschichtetes Aluminium/Stahl
        m, b = _principled(kind)
        _color_noise(m, b, (0.034, 0.032, 0.029), (0.05, 0.047, 0.043), 9)
        b.inputs["Roughness"].default_value = 0.48
        b.inputs["Metallic"].default_value = 0.25
        _bump(m, b, 220, 0.04)
    elif kind == "graphite":  # etwas heller, für Kontraste
        m, b = _principled(kind)
        b.inputs["Base Color"].default_value = (0.08, 0.076, 0.07, 1)
        b.inputs["Roughness"].default_value = 0.5
        b.inputs["Metallic"].default_value = 0.2
    elif kind == "concrete":  # heller Sichtbeton/Keramik
        m, b = _principled(kind)
        _color_noise(m, b, (0.25, 0.24, 0.22), (0.33, 0.315, 0.29), 4.0)
        b.inputs["Roughness"].default_value = 0.85
        _bump(m, b, 60, 0.12)
    elif kind == "concrete_dark":
        m, b = _principled(kind)
        _color_noise(m, b, (0.12, 0.115, 0.105), (0.18, 0.17, 0.155), 4.0)
        b.inputs["Roughness"].default_value = 0.8
        _bump(m, b, 60, 0.12)
    elif kind == "plaster":  # Fassade hellgrau
        m, b = _principled(kind)
        _color_noise(m, b, (0.55, 0.53, 0.49), (0.62, 0.6, 0.56), 3.0)
        b.inputs["Roughness"].default_value = 0.9
        _bump(m, b, 120, 0.06)
    elif kind == "fabric_light":
        m, b = _principled(kind)
        _color_noise(m, b, (0.36, 0.34, 0.31), (0.43, 0.41, 0.37), 30)
        b.inputs["Roughness"].default_value = 0.95
        b.inputs["Sheen Weight"].default_value = 0.4
        _bump(m, b, 400, 0.15)
    elif kind == "fabric_dark":
        m, b = _principled(kind)
        _color_noise(m, b, (0.07, 0.066, 0.06), (0.1, 0.095, 0.088), 30)
        b.inputs["Roughness"].default_value = 0.95
        b.inputs["Sheen Weight"].default_value = 0.5
        _bump(m, b, 400, 0.15)
    elif kind == "wood_grey":  # vergraute Lärchen-/Thermoholzlatten mit Fugen
        m, b = _principled(kind)
        _planks(m, b, (0.11, 0.1, 0.085), (0.2, 0.185, 0.16), 0.14, (0.02, 0.018, 0.015))
        b.inputs["Roughness"].default_value = 0.8
    elif kind == "wood_light":  # Tischplatte: hellgraue Eiche
        m, b = _principled(kind)
        _planks(m, b, (0.27, 0.24, 0.2), (0.4, 0.36, 0.3), 0.12, (0.08, 0.07, 0.06), ("X",))
        b.inputs["Roughness"].default_value = 0.6
    elif kind == "core":  # dunkles Laubinneres
        m, b = _principled(kind)
        b.inputs["Base Color"].default_value = (0.018, 0.032, 0.01, 1)
        b.inputs["Roughness"].default_value = 1.0
    elif kind == "sedum":  # Gründach-Unterlage zwischen den Polstern
        m, b = _principled(kind)
        _color_noise(m, b, (0.06, 0.09, 0.03), (0.14, 0.17, 0.06), 12)
        b.inputs["Roughness"].default_value = 0.9
        _bump(m, b, 40, 0.7)
    elif kind == "glass":
        m, b = _principled(kind)
        b.inputs["Base Color"].default_value = (0.85, 0.9, 0.92, 1)
        b.inputs["Transmission Weight"].default_value = 1.0
        b.inputs["Roughness"].default_value = 0.04
        b.inputs["IOR"].default_value = 1.45
    elif kind == "water":  # dunkles Wasser über anthrazit Folie
        m, b = _principled(kind)
        _color_noise(m, b, (0.02, 0.075, 0.08), (0.04, 0.13, 0.13), 0.6)
        b.inputs["Roughness"].default_value = 0.02
        b.inputs["Specular IOR Level"].default_value = 0.8
        b.inputs["Coat Weight"].default_value = 0.6
        _bump(m, b, 2.2, 0.18, 4)
    elif kind == "window":  # Verglasung von außen: dunkel, spiegelnd
        m, b = _principled(kind)
        b.inputs["Base Color"].default_value = (0.03, 0.045, 0.06, 1)
        b.inputs["Roughness"].default_value = 0.04
        b.inputs["Coat Weight"].default_value = 1.0
    elif kind == "soil":
        m, b = _principled(kind)
        _color_noise(m, b, (0.06, 0.045, 0.03), (0.12, 0.09, 0.06), 40)
        b.inputs["Roughness"].default_value = 1.0
        _bump(m, b, 30, 0.6)
    elif kind == "gravel_dark":  # Kiesel: Voronoi-Zellen mit eigener Helligkeit und Wölbung
        m, b = _principled(kind)
        nt = m.node_tree
        tc = nt.nodes.new("ShaderNodeTexCoord")
        vor = nt.nodes.new("ShaderNodeTexVoronoi")
        vor.inputs["Scale"].default_value = 70
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = (0.06, 0.06, 0.065, 1)
        ramp.color_ramp.elements[1].color = (0.26, 0.26, 0.26, 1)
        nt.links.new(tc.outputs["Object"], vor.inputs["Vector"])
        nt.links.new(vor.outputs["Color"], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.9
        bump.invert = True
        nt.links.new(vor.outputs["Distance"], bump.inputs["Height"])
        nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
        b.inputs["Roughness"].default_value = 0.85
    elif kind == "roof_tile":  # anthrazit Flachziegel über UV (Reihen parallel zur Traufe)
        m, b = _principled(kind)
        nt = m.node_tree
        uv = nt.nodes.new("ShaderNodeTexCoord")
        brick = nt.nodes.new("ShaderNodeTexBrick")
        brick.inputs["Scale"].default_value = 1.0
        brick.inputs["Brick Width"].default_value = 0.3
        brick.inputs["Row Height"].default_value = 0.33
        brick.inputs["Mortar Size"].default_value = 0.008
        brick.inputs["Color1"].default_value = (0.038, 0.037, 0.035, 1)
        brick.inputs["Color2"].default_value = (0.056, 0.054, 0.051, 1)
        brick.inputs["Mortar"].default_value = (0.012, 0.011, 0.01, 1)
        brick.inputs["Bias"].default_value = 0.0
        nt.links.new(uv.outputs["UV"], brick.inputs["Vector"])
        nt.links.new(brick.outputs["Color"], b.inputs["Base Color"])
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.5
        nt.links.new(brick.outputs["Fac"], bump.inputs["Height"])
        nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
        b.inputs["Roughness"].default_value = 0.55
    elif kind == "solar":
        m, b = _principled(kind)
        nt = m.node_tree
        uv = nt.nodes.new("ShaderNodeTexCoord")
        brick = nt.nodes.new("ShaderNodeTexBrick")
        brick.offset = 0
        brick.inputs["Scale"].default_value = 1.0
        brick.inputs["Brick Width"].default_value = 0.165
        brick.inputs["Row Height"].default_value = 0.165
        brick.inputs["Mortar Size"].default_value = 0.004
        brick.inputs["Color1"].default_value = (0.012, 0.016, 0.03, 1)
        brick.inputs["Color2"].default_value = (0.015, 0.02, 0.035, 1)
        brick.inputs["Mortar"].default_value = (0.25, 0.27, 0.3, 1)
        nt.links.new(uv.outputs["UV"], brick.inputs["Vector"])
        nt.links.new(brick.outputs["Color"], b.inputs["Base Color"])
        b.inputs["Roughness"].default_value = 0.08
        b.inputs["Coat Weight"].default_value = 1.0
    elif kind in LEAF_COLORS:
        m, b = _leaf_mat(kind, *LEAF_COLORS[kind])
    elif kind == "rubber_red":
        m, b = _principled(kind)
        b.inputs["Base Color"].default_value = (0.35, 0.05, 0.03, 1)
        b.inputs["Roughness"].default_value = 0.6
    elif kind == "corten":  # wetterfester Stahl: rostbraun, fleckig
        m, b = _principled(kind)
        _color_noise(m, b, (0.13, 0.04, 0.012), (0.3, 0.1, 0.03), 7)
        b.inputs["Roughness"].default_value = 0.88
        b.inputs["Metallic"].default_value = 0.15
        _bump(m, b, 160, 0.12)
    elif kind == "larch":  # Lärche, frisch geölt
        m, b = _principled(kind)
        _planks(m, b, (0.2, 0.1, 0.045), (0.36, 0.2, 0.1), 0.14, (0.03, 0.02, 0.012), ("X",))
        b.inputs["Roughness"].default_value = 0.62
    elif kind == "container":  # schwarz lackiertes Trapezblech
        m, b = _principled(kind)
        nt = m.node_tree
        b.inputs["Base Color"].default_value = (0.018, 0.018, 0.018, 1)
        b.inputs["Roughness"].default_value = 0.42
        b.inputs["Metallic"].default_value = 0.4
        tc = nt.nodes.new("ShaderNodeTexCoord")
        wave = nt.nodes.new("ShaderNodeTexWave")
        wave.wave_profile = "TRI"
        wave.bands_direction = "X"
        wave.inputs["Scale"].default_value = 2.2
        nt.links.new(tc.outputs["Object"], wave.inputs["Vector"])
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.6
        nt.links.new(wave.outputs["Fac"], bump.inputs["Height"])
        nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    elif kind == "stone":  # Naturstein (Muschelkalk/Granit grau) – Farbe je Stein über Objekt-Zufall
        m, b = _principled(kind)
        nt = m.node_tree
        info = nt.nodes.new("ShaderNodeObjectInfo")
        tex = nt.nodes.new("ShaderNodeTexNoise")
        tex.inputs["Scale"].default_value = 14
        add = nt.nodes.new("ShaderNodeMath")
        add.operation = "MULTIPLY_ADD"
        nt.links.new(info.outputs["Random"], add.inputs[0])
        add.inputs[1].default_value = 0.7
        nt.links.new(tex.outputs["Fac"], add.inputs[2])
        sc = nt.nodes.new("ShaderNodeMath")
        sc.operation = "MULTIPLY"
        sc.inputs[1].default_value = 0.8
        nt.links.new(add.outputs[0], sc.inputs[0])
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = (0.07, 0.066, 0.06, 1)
        ramp.color_ramp.elements[1].color = (0.25, 0.235, 0.21, 1)
        nt.links.new(sc.outputs[0], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
        b.inputs["Roughness"].default_value = 0.9
        _bump(m, b, 25, 0.5)
    elif kind == "basalt":  # Basalt: anthrazit, leicht bläulich, matte raue Oberfläche
        m, b = _principled(kind)
        _color_noise(m, b, (0.022, 0.024, 0.027), (0.06, 0.062, 0.066), 6)
        b.inputs["Roughness"].default_value = 0.78
        _bump(m, b, 40, 0.45)
    elif kind == "basalt_cut":  # gesägte/geschliffene Kopffläche der Stelen: etwas heller
        m, b = _principled(kind)
        _color_noise(m, b, (0.05, 0.052, 0.056), (0.085, 0.088, 0.092), 20)
        b.inputs["Roughness"].default_value = 0.55
    elif kind == "ember":  # Glut / Flammen
        m, b = _principled(kind)
        b.inputs["Base Color"].default_value = (0.8, 0.25, 0.04, 1)
        b.inputs["Emission Color"].default_value = (1.0, 0.35, 0.06, 1)
        b.inputs["Emission Strength"].default_value = 6.0
    elif kind == "log":
        m, b = _principled(kind)
        _color_noise(m, b, (0.05, 0.03, 0.02), (0.12, 0.08, 0.05), 20)
        b.inputs["Roughness"].default_value = 0.9
    elif kind == "mat_black":  # Sprungtuch
        m, b = _principled(kind)
        b.inputs["Base Color"].default_value = (0.008, 0.008, 0.009, 1)
        b.inputs["Roughness"].default_value = 0.95
        b.inputs["Specular IOR Level"].default_value = 0.15
        _bump(m, b, 600, 0.1)
    elif kind == "sand":
        m, b = _principled(kind)
        _color_noise(m, b, (0.42, 0.34, 0.22), (0.52, 0.43, 0.29), 60)
        b.inputs["Roughness"].default_value = 1.0
        _bump(m, b, 120, 0.3)
    else:
        raise KeyError(kind)
    if kind not in {"glass", "water", "window", "solar", "ember"}:
        _ao(m, 0.85 if kind in LEAF_COLORS else 0.7)
    _mats[kind] = m
    return m


# ------------------------------------------------------------------ Geometrie


def box(name: str, x0, y0, z0, x1, y1, z1, material: str, bevel: float = 0.0) -> bpy.types.Object:
    """Quader in Plan-Koordinaten (Ecken), optional gefaste Kanten"""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x = (x0 + x1) / 2 + v.co.x * (x1 - x0)
        v.co.y = -((y0 + y1) / 2) - v.co.y * (y1 - y0)
        v.co.z = (z0 + z1) / 2 + v.co.z * (z1 - z0)
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me))
    ob.data.materials.append(mat(material))
    if bevel > 0:
        mod = ob.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 3
        mod.limit_method = "ANGLE"
    return ob


def cylinder(name: str, cx, cy, z0, z1, r, material: str, verts: int = 48, bevel: float = 0.0) -> bpy.types.Object:
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r, radius2=r, depth=z1 - z0)
    bmesh.ops.translate(bm, vec=P(cx, cy, (z0 + z1) / 2), verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me))
    ob.data.materials.append(mat(material))
    for p in ob.data.polygons:
        p.use_smooth = True
    if bevel > 0:
        mod = ob.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 3
        mod.limit_method = "ANGLE"
    return ob


def poly_mesh(name: str, verts: list[Vector], faces: list[list[int]], material: str, uv_frames: list | None = None) -> bpy.types.Object:
    """Mesh aus Blender-Vektoren. `uv_frames[i] = (origin, u_axis, v_axis)` projiziert Fläche i planar (Meter)."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    if uv_frames:
        uvl = me.uv_layers.new(name="UVMap")
        for poly, (o, u, v) in zip(me.polygons, uv_frames):
            for li in poly.loop_indices:
                co = Vector(verts[me.loops[li].vertex_index]) - o
                uvl.data[li].uv = (co.dot(u), co.dot(v))
    ob = link(bpy.data.objects.new(name, me))
    ob.data.materials.append(mat(material))
    return ob


def plate(name: str, origin: Vector, e: Vector, s: Vector, n: Vector, a: float, b: float, t: float, material: str) -> bpy.types.Object:
    """Platte a × b × t in einer beliebig orientierten Ebene (Blender-Vektoren, e/s/n orthonormal)"""
    vs = []
    for k in (0, t):
        for i, j in ((0, 0), (a, 0), (a, b), (0, b)):
            vs.append(origin + e * i + s * j + n * k)
    faces = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
    frames = [(origin, e, s)] * 6
    return poly_mesh(name, vs, faces, material, frames)


def foliage_ball(name: str, c: Vector, r: float, count: int, leaf_size: float = 0.05, material: str = "leaf", seed: int = 1) -> bpy.types.Object:
    """Laubballen: dunkle Kugel als Kern, Blätter als Partikel-Instanzen auf der Oberfläche"""
    leaf = _leaf_object(material, leaf_size)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=r, location=c)
    return _emit(name, leaf, count, seed)


def _leaf_object(material: str, leaf_size: float) -> bpy.types.Object:
    leaf_name = f"leaf_{material}_{leaf_size:.3f}"
    leaf = bpy.data.objects.get(leaf_name)
    if leaf is None:
        bm = bmesh.new()
        s = leaf_size
        # Blatt mit Mittelrippe: leicht gewölbt, Spitze nach unten gebogen
        outline = [(0, -s, 0), (s * 0.42, -s * 0.45, s * 0.12), (s * 0.5, s * 0.2, s * 0.14), (s * 0.28, s * 0.75, s * 0.06), (0, s * 1.15, -s * 0.08), (-s * 0.28, s * 0.75, s * 0.06), (-s * 0.5, s * 0.2, s * 0.14), (-s * 0.42, -s * 0.45, s * 0.12)]
        vs = [bm.verts.new(v) for v in outline]
        mid = bm.verts.new((0, 0, 0.02 * s))
        for i in range(len(vs)):
            bm.faces.new((mid, vs[i], vs[(i + 1) % len(vs)]))
        me = bpy.data.meshes.new(leaf_name)
        bm.to_mesh(me)
        bm.free()
        leaf = link(bpy.data.objects.new(leaf_name, me), outline=False)
        leaf.data.materials.append(mat(material))
        leaf.hide_render = True
        leaf.location = (500, 500, -500)
    return leaf


def _emit(name: str, leaf: bpy.types.Object, count: int, seed: int) -> bpy.types.Object:
    em = bpy.context.object
    em.name = name
    em.data.materials.append(mat("core"))
    ps = em.modifiers.new("p", "PARTICLE_SYSTEM").particle_system
    ps.seed = seed
    st = ps.settings
    st.type = "HAIR"
    st.use_advanced_hair = True
    st.count = count
    st.hair_length = 1
    st.render_type = "OBJECT"
    st.instance_object = leaf
    st.use_rotations = True
    st.rotation_mode = "NOR"
    st.phase_factor_random = 2.0
    st.rotation_factor_random = 0.7
    st.particle_size = 1.0
    st.size_random = 0.5
    st.emit_from = "FACE"
    st.use_emit_random = True
    em.show_instancer_for_render = True
    return em


def foliage_carpet(name: str, x0, y0, x1, y1, z: float, per_m2: int, leaf_size: float, material: str, base: str = "sedum", seed: int = 3) -> bpy.types.Object:
    """Flächiger Pflanzenteppich (Gründach, Bodendecker): Blätter auf einer leicht welligen Fläche"""
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=24, y_subdivisions=24, size=1, location=P((x0 + x1) / 2, (y0 + y1) / 2, z))
    em = bpy.context.object
    em.name = name
    em.scale = (x1 - x0, y1 - y0, 1)
    bpy.ops.object.transform_apply(scale=True)
    r = rng(seed)
    for v in em.data.vertices:
        v.co.z += r.random() * leaf_size * 1.2
    em.data.materials.append(mat(base))
    leaf = _leaf_object(material, leaf_size)
    ps = em.modifiers.new("p", "PARTICLE_SYSTEM").particle_system
    ps.seed = seed
    st = ps.settings
    st.type = "HAIR"
    st.use_advanced_hair = True
    st.count = int(per_m2 * (x1 - x0) * (y1 - y0))
    st.hair_length = 1
    st.render_type = "OBJECT"
    st.instance_object = leaf
    st.use_rotations = True
    st.rotation_mode = "NOR"
    st.phase_factor_random = 2.0
    st.rotation_factor_random = 0.9
    st.particle_size = 1.0
    st.size_random = 0.6
    st.emit_from = "FACE"
    st.use_emit_random = True
    em.show_instancer_for_render = True
    return em


def veg_clump(kind: str, c: Vector, r: rng, scale: float = 1.0):
    """Gemüse/Kräuter als Pflanze: Mangold, Grünkohl, Salat, Kräuter – unterschiedliche Blattgrößen und Farben"""
    spec = {
        "chard": ("leaf", 0.075, 0.17, 110),
        "kale": ("leaf_blue", 0.07, 0.16, 140),
        "lettuce": ("leaf_light", 0.05, 0.12, 170),
        "redlettuce": ("leaf_red", 0.05, 0.12, 160),
        "herb": ("leaf", 0.022, 0.09, 240),
    }[kind]
    m, ls, rad, cnt = spec
    rad *= scale * (0.85 + r.random() * 0.3)
    return foliage_ball(f"veg_{kind}", c + Vector((0, 0, rad * 0.45)), rad, int(cnt * scale), ls * scale, m, r.randint(1, 9999))


# ------------------------------------------------------------------ Rendern


@dataclass
class View:
    file: str
    width: int
    height: int
    #: Bodenpunkt des Objektursprungs im Bild (0…1, von links oben)
    anchor: tuple[float, float]


def _mesh_points(root_objs: list[bpy.types.Object]) -> list[Vector]:
    dg = bpy.context.evaluated_depsgraph_get()
    pts: list[Vector] = []
    for ob in root_objs:
        if ob.type not in {"MESH", "CURVE"} or ob.hide_render or ob.name == GROUND:
            continue
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh()
        mw = ev.matrix_world
        pts.extend(mw @ v.co for v in me.vertices)
        ev.to_mesh_clear()
    return pts


def render_view(path: str, ppm: float, tilt_deg: float, margin: float = 0.08) -> View:
    """
    Orthografische Kamera mit Kippwinkel `tilt_deg` aus der Senkrechten, Blick von Plan-Süden (+y).
    Bildausschnitt = Hülle aller Meshes + Rand; `ppm` = Pixel je Bildschirm-Meter.
    """
    sc = bpy.context.scene
    cam = bpy.data.objects.get("cam") or link(bpy.data.objects.new("cam", bpy.data.cameras.new("cam")))
    sc.camera = cam
    cam.data.type = "ORTHO"
    t = math.radians(tilt_deg)
    cam.rotation_euler = Euler((t, 0, 0))
    cam.location = Vector((0, -60 * math.sin(t), 60 * math.cos(t)))
    bpy.context.view_layer.update()
    inv = cam.matrix_world.inverted()
    pts = [inv @ p for p in _mesh_points(list(sc.objects))]
    xs = [p.x for p in pts]
    ys = [p.y for p in pts]
    x0, x1 = min(xs) - margin, max(xs) + margin
    y0, y1 = min(ys) - margin, max(ys) + margin
    w, h = x1 - x0, y1 - y0
    # Kamera auf die Mitte der Hülle schieben (in Kameraebene)
    cam.location = cam.matrix_world @ Vector(((x0 + x1) / 2, (y0 + y1) / 2, 0))
    cam.data.ortho_scale = max(w, h)
    sc.render.resolution_x = max(4, round(w * ppm))
    sc.render.resolution_y = max(4, round(h * ppm))
    sc.render.resolution_percentage = 100
    bpy.context.view_layer.update()
    o = cam.matrix_world.inverted() @ Vector((0, 0, 0))
    anchor = (0.5 + o.x / w, 0.5 - o.y / h)
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return View(path, sc.render.resolution_x, sc.render.resolution_y, anchor)


def rotate_all(deg_plan: float):
    """Alle Objekte um den Ursprung drehen (Plan-Drehsinn: im Uhrzeigersinn bei y nach unten)"""
    rot = Matrix.Rotation(math.radians(-deg_plan), 4, "Z")
    for ob in bpy.context.scene.objects:
        if ob.type in {"MESH", "CURVE"} and ob.parent is None and not ob.name.startswith("leaf_") and ob.name != GROUND:
            ob.matrix_world = rot @ ob.matrix_world


def rng(seed: int) -> random.Random:
    return random.Random(seed)
