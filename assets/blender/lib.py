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


def reset_scene(samples: int = 64) -> bpy.types.Scene:
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
    sc.view_settings.exposure = -0.15

    # Sonne von oben links (Plan), weich; Himmel als Aufhellung
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sc.collection.objects.link(sun)
    sun.data.energy = 5.2
    sun.data.angle = math.radians(4)
    e = math.radians(SUN_ELEVATION_DEG)
    to_sun = P(PLAN_LIGHT[0] * math.cos(e), PLAN_LIGHT[1] * math.cos(e), math.sin(e)).normalized()
    sun.rotation_euler = to_sun.to_track_quat("Z", "Y").to_euler()
    w = bpy.data.worlds.new("world")
    sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.62, 0.72, 0.88, 1)
    bg.inputs["Strength"].default_value = 0.42
    return sc


def link(ob: bpy.types.Object) -> bpy.types.Object:
    bpy.context.scene.collection.objects.link(ob)
    return ob


# ------------------------------------------------------------------ Materialien

_mats: dict[str, bpy.types.Material] = {}


def _principled(name: str) -> tuple[bpy.types.Material, bpy.types.Node]:
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    return m, m.node_tree.nodes["Principled BSDF"]


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
        b.inputs["Base Color"].default_value = (0.032, 0.035, 0.038, 1)
        b.inputs["Roughness"].default_value = 0.42
        b.inputs["Metallic"].default_value = 0.35
        _bump(m, b, 220, 0.04)
    elif kind == "graphite":  # etwas heller, für Kontraste
        m, b = _principled(kind)
        b.inputs["Base Color"].default_value = (0.075, 0.08, 0.085, 1)
        b.inputs["Roughness"].default_value = 0.5
        b.inputs["Metallic"].default_value = 0.2
    elif kind == "concrete":  # heller Sichtbeton/Keramik
        m, b = _principled(kind)
        _color_noise(m, b, (0.24, 0.24, 0.235), (0.32, 0.32, 0.315), 4.0)
        b.inputs["Roughness"].default_value = 0.85
        _bump(m, b, 60, 0.12)
    elif kind == "concrete_dark":
        m, b = _principled(kind)
        _color_noise(m, b, (0.13, 0.135, 0.14), (0.19, 0.195, 0.2), 4.0)
        b.inputs["Roughness"].default_value = 0.8
        _bump(m, b, 60, 0.12)
    elif kind == "plaster":  # Fassade hellgrau
        m, b = _principled(kind)
        _color_noise(m, b, (0.55, 0.555, 0.55), (0.62, 0.62, 0.61), 3.0)
        b.inputs["Roughness"].default_value = 0.9
        _bump(m, b, 120, 0.06)
    elif kind == "fabric_light":
        m, b = _principled(kind)
        _color_noise(m, b, (0.3, 0.3, 0.29), (0.36, 0.36, 0.35), 30)
        b.inputs["Roughness"].default_value = 0.95
        b.inputs["Sheen Weight"].default_value = 0.4
        _bump(m, b, 400, 0.15)
    elif kind == "fabric_dark":
        m, b = _principled(kind)
        _color_noise(m, b, (0.07, 0.072, 0.075), (0.1, 0.1, 0.105), 30)
        b.inputs["Roughness"].default_value = 0.95
        b.inputs["Sheen Weight"].default_value = 0.5
        _bump(m, b, 400, 0.15)
    elif kind == "wood_grey":  # vergraute/thermobehandelte Holzlatten
        m, b = _principled(kind)
        nt = m.node_tree
        tc = nt.nodes.new("ShaderNodeTexCoord")
        wave = nt.nodes.new("ShaderNodeTexWave")
        wave.inputs["Scale"].default_value = 3.0
        wave.inputs["Distortion"].default_value = 6
        wave.inputs["Detail"].default_value = 4
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = (0.16, 0.15, 0.14, 1)
        ramp.color_ramp.elements[1].color = (0.27, 0.26, 0.24, 1)
        nt.links.new(tc.outputs["Object"], wave.inputs["Vector"])
        nt.links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
        b.inputs["Roughness"].default_value = 0.8
    elif kind == "teak":  # warmer Akzent (Tischplatte)
        m, b = _principled(kind)
        nt = m.node_tree
        tc = nt.nodes.new("ShaderNodeTexCoord")
        wave = nt.nodes.new("ShaderNodeTexWave")
        wave.inputs["Scale"].default_value = 2.5
        wave.inputs["Distortion"].default_value = 8
        wave.inputs["Detail"].default_value = 5
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = (0.25, 0.15, 0.08, 1)
        ramp.color_ramp.elements[1].color = (0.42, 0.27, 0.15, 1)
        nt.links.new(tc.outputs["Object"], wave.inputs["Vector"])
        nt.links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
        b.inputs["Roughness"].default_value = 0.55
    elif kind == "glass":
        m, b = _principled(kind)
        b.inputs["Base Color"].default_value = (0.85, 0.9, 0.92, 1)
        b.inputs["Transmission Weight"].default_value = 1.0
        b.inputs["Roughness"].default_value = 0.04
        b.inputs["IOR"].default_value = 1.45
    elif kind == "water":  # dunkles Wasser über anthrazit Folie
        m, b = _principled(kind)
        b.inputs["Base Color"].default_value = (0.02, 0.06, 0.07, 1)
        b.inputs["Roughness"].default_value = 0.03
        b.inputs["Specular IOR Level"].default_value = 0.7
        b.inputs["Coat Weight"].default_value = 0.6
        _bump(m, b, 3.0, 0.08, 3)
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
        brick.inputs["Color1"].default_value = (0.045, 0.048, 0.052, 1)
        brick.inputs["Color2"].default_value = (0.065, 0.068, 0.072, 1)
        brick.inputs["Mortar"].default_value = (0.012, 0.012, 0.014, 1)
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
    elif kind == "leaf":
        m, b = _principled(kind)
        nt = m.node_tree
        info = nt.nodes.new("ShaderNodeObjectInfo")
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = (0.04, 0.11, 0.025, 1)
        ramp.color_ramp.elements[1].color = (0.2, 0.36, 0.07, 1)
        nt.links.new(info.outputs["Random"], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
        b.inputs["Roughness"].default_value = 0.55
        b.inputs["Subsurface Weight"].default_value = 0.2
    elif kind == "leaf_red":
        m, b = _principled(kind)
        nt = m.node_tree
        info = nt.nodes.new("ShaderNodeObjectInfo")
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = (0.12, 0.02, 0.03, 1)
        ramp.color_ramp.elements[1].color = (0.32, 0.06, 0.09, 1)
        nt.links.new(info.outputs["Random"], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
        b.inputs["Roughness"].default_value = 0.5
    elif kind == "rubber_red":
        m, b = _principled(kind)
        b.inputs["Base Color"].default_value = (0.35, 0.05, 0.03, 1)
        b.inputs["Roughness"].default_value = 0.6
    elif kind == "sand":
        m, b = _principled(kind)
        _color_noise(m, b, (0.42, 0.34, 0.22), (0.52, 0.43, 0.29), 60)
        b.inputs["Roughness"].default_value = 1.0
        _bump(m, b, 120, 0.3)
    else:
        raise KeyError(kind)
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
    leaf_name = f"leaf_{material}_{leaf_size:.3f}"
    leaf = bpy.data.objects.get(leaf_name)
    if leaf is None:
        bm = bmesh.new()
        s = leaf_size
        vs = [bm.verts.new(v) for v in [(0, -s, 0), (s * 0.6, 0, s * 0.15), (0, s * 1.1, 0), (-s * 0.6, 0, s * 0.15)]]
        bm.faces.new(vs)
        me = bpy.data.meshes.new(leaf_name)
        bm.to_mesh(me)
        bm.free()
        leaf = link(bpy.data.objects.new(leaf_name, me))
        leaf.data.materials.append(mat(material))
        leaf.hide_render = True
        leaf.location = (500, 500, -500)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=r, location=c)
    em = bpy.context.object
    em.name = name
    em.data.materials.append(mat("soil"))
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
        if ob.type not in {"MESH", "CURVE"} or ob.hide_render:
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
        if ob.type in {"MESH", "CURVE"} and ob.parent is None and not ob.name.startswith("leaf_"):
            ob.matrix_world = rot @ ob.matrix_world


def rng(seed: int) -> random.Random:
    return random.Random(seed)
