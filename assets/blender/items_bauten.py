"""
Generatoren für die Objektgruppe „Bauten“: Carport, Geräteschuppen, Fahrradunterstand,
Mülltonnenbox, Fasssauna, Hühnerstall mit Auslauf und Outdoorküche.

Konventionen wie in `items.py`: Jede Funktion baut das Objekt in Plan-Metern um den Ursprung
(Breite w entlang x, Tiefe d entlang y, Höhe h; Plan-Süden = +y = Vorderseite zur Kamera).
Maße stehen in `catalog_bauten.json`.

Zusätzliche Materialien (Edelstahl, Thermoholz, Volierendraht, Trapezblech, Gefieder …) werden hier
mit den Bausteinen aus `lib` erzeugt und im selben Zwischenspeicher wie die Bibliothek abgelegt,
damit sie beim Szenen-Reset mit verworfen werden.
"""
from __future__ import annotations

import math

import bmesh
import bpy
from mathutils import Matrix, Vector

import lib
from lib import P, box, cylinder, foliage_ball, foliage_carpet, link, plate, rng, veg_clump

# ------------------------------------------------------------------ Materialien (Ergänzungen)

#: Holztöne (dunkel, hell) für Thermoholz und Lärche ohne aufgemalte Fugen – Fugen entstehen aus der Geometrie
_WOOD = {
    "thermo": ((0.13, 0.068, 0.034), (0.27, 0.155, 0.08)),  # Thermo-Kiefer, warmes Dunkelbraun
    "thermo_grey": ((0.12, 0.11, 0.095), (0.24, 0.225, 0.2)),  # vergrautes Thermoholz
    "larch_oiled": ((0.22, 0.115, 0.05), (0.42, 0.25, 0.12)),  # Lärche frisch geölt (Schneidebrett, Akzente)
    "silver": ((0.27, 0.26, 0.235), (0.5, 0.48, 0.44)),  # silbergrau verwittertes Holz (Schuppen, Stall)
}


def _wood(kind: str, axis: str):
    """Holz mit Maserung entlang `axis` (x/y/z in Plan-Achsen) und Tonwechsel je Brett (Objekt-Zufall)"""
    dark, light = _WOOD[kind.rsplit("_", 1)[0] if kind.rsplit("_", 1)[-1] in "xyz" else kind]
    m, b = lib._principled(kind)
    nt = m.node_tree
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = {"x": (0.05, 1, 1), "y": (1, 0.05, 1), "z": (1, 1, 0.05)}[axis]
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 24
    nz.inputs["Detail"].default_value = 8
    nz.inputs["Distortion"].default_value = 0.8
    nt.links.new(mp.outputs["Vector"], nz.inputs["Vector"])
    mul = nt.nodes.new("ShaderNodeMath")
    mul.operation = "MULTIPLY"
    mul.inputs[1].default_value = 0.7
    nt.links.new(nz.outputs["Fac"], mul.inputs[0])
    info = nt.nodes.new("ShaderNodeObjectInfo")
    mad = nt.nodes.new("ShaderNodeMath")
    mad.operation = "MULTIPLY_ADD"
    nt.links.new(info.outputs["Random"], mad.inputs[0])
    mad.inputs[1].default_value = 0.42
    nt.links.new(mul.outputs[0], mad.inputs[2])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.25
    ramp.color_ramp.elements[1].position = 0.95
    ramp.color_ramp.elements[0].color = (*dark, 1)
    ramp.color_ramp.elements[1].color = (*light, 1)
    nt.links.new(mad.outputs[0], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.18
    nt.links.new(nz.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    b.inputs["Roughness"].default_value = 0.72
    return m, b


def _wire(kind: str):
    """Verzinkter Volierendraht (Maschenweite 25 mm) über die UV-Koordinaten von `plate` (Meter); Maschen durchsichtig"""
    m, b = lib._principled(kind)
    nt = m.node_tree
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["UV"], sep.inputs["Vector"])
    lines = []
    for ax in ("X", "Y"):
        div = nt.nodes.new("ShaderNodeMath")
        div.operation = "DIVIDE"
        div.inputs[1].default_value = 0.025
        nt.links.new(sep.outputs[ax], div.inputs[0])
        fr = nt.nodes.new("ShaderNodeMath")
        fr.operation = "FRACT"
        nt.links.new(div.outputs[0], fr.inputs[0])
        lt = nt.nodes.new("ShaderNodeMath")
        lt.operation = "LESS_THAN"
        lt.inputs[1].default_value = 0.07
        nt.links.new(fr.outputs[0], lt.inputs[0])
        lines.append(lt)
    mx = nt.nodes.new("ShaderNodeMath")
    mx.operation = "MAXIMUM"
    nt.links.new(lines[0].outputs[0], mx.inputs[0])
    nt.links.new(lines[1].outputs[0], mx.inputs[1])
    b.inputs["Base Color"].default_value = (0.26, 0.265, 0.265, 1)
    b.inputs["Metallic"].default_value = 0.6
    b.inputs["Roughness"].default_value = 0.45
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(mx.outputs[0], mix.inputs["Fac"])
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(b.outputs[0], mix.inputs[2])
    out = nt.nodes["Material Output"]
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    return m, b


def xmat(kind: str) -> bpy.types.Material:
    """Material aus der Bibliothek oder aus den Ergänzungen dieses Moduls"""
    if kind in lib._mats:
        return lib._mats[kind]
    ao = True
    if kind == "inox":  # gebürsteter Edelstahl
        m, b = lib._principled(kind)
        nt = m.node_tree
        tc = nt.nodes.new("ShaderNodeTexCoord")
        mp = nt.nodes.new("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = (0.02, 1, 1)
        nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
        nz = nt.nodes.new("ShaderNodeTexNoise")
        nz.inputs["Scale"].default_value = 300
        nt.links.new(mp.outputs["Vector"], nz.inputs["Vector"])
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = (0.42, 0.42, 0.41, 1)
        ramp.color_ramp.elements[1].color = (0.6, 0.6, 0.59, 1)
        nt.links.new(nz.outputs["Fac"], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
        b.inputs["Metallic"].default_value = 0.85
        b.inputs["Roughness"].default_value = 0.3
        ao = False
    elif kind == "inox_front":  # senkrechte Edelstahlfronten: matter gebürstet, damit sie nicht den grünen Boden spiegeln
        m, b = lib._principled(kind)
        lib._color_noise(m, b, (0.36, 0.36, 0.355), (0.44, 0.44, 0.435), 60)
        b.inputs["Metallic"].default_value = 0.55
        b.inputs["Roughness"].default_value = 0.42
        ao = False
    elif kind == "inox_dark":  # Edelstahl im Schatten/Innenseite (Spülbecken, Grillrost)
        m, b = lib._principled(kind)
        b.inputs["Base Color"].default_value = (0.2, 0.2, 0.2, 1)
        b.inputs["Metallic"].default_value = 0.8
        b.inputs["Roughness"].default_value = 0.35
    elif kind == "rubber":  # Reifen, Griffe, Drehknöpfe
        m, b = lib._principled(kind)
        b.inputs["Base Color"].default_value = (0.012, 0.012, 0.012, 1)
        b.inputs["Roughness"].default_value = 0.7
    elif kind == "trapez":  # anthrazit Trapezblech, Rippen in Plan-y
        m, b = lib._principled(kind)
        nt = m.node_tree
        lib._color_noise(m, b, (0.032, 0.031, 0.029), (0.052, 0.05, 0.047), 1.3)
        b.inputs["Metallic"].default_value = 0.35
        b.inputs["Roughness"].default_value = 0.45
        tc = nt.nodes.new("ShaderNodeTexCoord")
        wave = nt.nodes.new("ShaderNodeTexWave")
        wave.wave_profile = "TRI"
        wave.bands_direction = "X"
        wave.inputs["Scale"].default_value = 4.4
        nt.links.new(tc.outputs["Object"], wave.inputs["Vector"])
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.55
        nt.links.new(wave.outputs["Fac"], bump.inputs["Height"])
        nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    elif kind == "wire":
        m, b = _wire(kind)
        ao = False
    elif kind == "straw":  # Einstreu (Stroh/Hobelspäne)
        m, b = lib._principled(kind)
        lib._color_noise(m, b, (0.3, 0.22, 0.09), (0.52, 0.42, 0.2), 70)
        b.inputs["Roughness"].default_value = 1.0
        lib._bump(m, b, 160, 0.6)
    elif kind == "hen_brown":
        m, b = lib._principled(kind)
        lib._color_noise(m, b, (0.17, 0.06, 0.02), (0.36, 0.15, 0.05), 40)
        b.inputs["Roughness"].default_value = 0.9
        b.inputs["Sheen Weight"].default_value = 0.5
    elif kind == "hen_white":
        m, b = lib._principled(kind)
        lib._color_noise(m, b, (0.55, 0.53, 0.48), (0.7, 0.68, 0.63), 40)
        b.inputs["Roughness"].default_value = 0.9
        b.inputs["Sheen Weight"].default_value = 0.5
    elif kind == "hen_brown_dark":  # Flügel/Schwanz: dunkleres Rotbraun bis Schwarz
        m, b = lib._principled(kind)
        lib._color_noise(m, b, (0.06, 0.025, 0.012), (0.2, 0.075, 0.025), 30)
        b.inputs["Roughness"].default_value = 0.85
        b.inputs["Sheen Weight"].default_value = 0.5
    elif kind == "hen_white_dark":
        m, b = lib._principled(kind)
        lib._color_noise(m, b, (0.45, 0.43, 0.39), (0.6, 0.58, 0.53), 30)
        b.inputs["Roughness"].default_value = 0.9
        b.inputs["Sheen Weight"].default_value = 0.5
    elif kind == "beak":  # Schnabel und Beine
        m, b = lib._principled(kind)
        b.inputs["Base Color"].default_value = (0.55, 0.36, 0.07, 1)
        b.inputs["Roughness"].default_value = 0.5
    elif kind == "comb":  # Kamm
        m, b = lib._principled(kind)
        b.inputs["Base Color"].default_value = (0.42, 0.03, 0.02, 1)
        b.inputs["Roughness"].default_value = 0.55
    elif kind == "bike_sage":  # matter Salbeigrün-Lack für ein Fahrrad
        m, b = lib._principled(kind)
        b.inputs["Base Color"].default_value = (0.12, 0.15, 0.12, 1)
        b.inputs["Roughness"].default_value = 0.4
        b.inputs["Metallic"].default_value = 0.3
    elif kind == "wallbox":  # Ladestation, hellgrauer Kunststoff
        m, b = lib._principled(kind)
        b.inputs["Base Color"].default_value = (0.55, 0.55, 0.53, 1)
        b.inputs["Roughness"].default_value = 0.35
    elif kind == "led":  # Statusleuchte
        m, b = lib._principled(kind)
        b.inputs["Base Color"].default_value = (0.1, 0.5, 0.25, 1)
        b.inputs["Emission Color"].default_value = (0.2, 1.0, 0.45, 1)
        b.inputs["Emission Strength"].default_value = 2.0
        ao = False
    elif kind.rsplit("_", 1)[0] in _WOOD and kind.rsplit("_", 1)[-1] in ("x", "y", "z"):
        # Latten liegen dicht an dicht: kurze Verdeckungsreichweite, sonst wird die ganze Wand schwarz
        m, b = _wood(kind, kind.rsplit("_", 1)[-1])
        lib._ao(m, 0.55, 0.06)
        ao = False
    else:
        return lib.mat(kind)
    if ao:
        lib._ao(m, 0.7)
    lib._mats[kind] = m
    return m


def _set(ob: bpy.types.Object, kind: str) -> bpy.types.Object:
    ob.data.materials[0] = xmat(kind)
    return ob


def bx(name, x0, y0, z0, x1, y1, z1, material: str, bevel: float = 0.0):
    """`box` mit Materialien aus Bibliothek und Ergänzungen"""
    return _set(box(name, min(x0, x1), min(y0, y1), min(z0, z1), max(x0, x1), max(y0, y1), max(z0, z1), "graphite", bevel), material)


def cyl(name, cx, cy, z0, z1, r, material: str, verts: int = 48, bevel: float = 0.0):
    return _set(cylinder(name, cx, cy, z0, z1, r, "graphite", verts, bevel), material)


def pl(name, origin, e, s, n, a, b, t, material: str, outline: bool = True):
    ob = _set(plate(name, origin, e, s, n, a, b, t, "graphite"), material)
    if not outline:
        _no_outline(ob)
    return ob


def _no_outline(ob):
    col = bpy.data.collections.get(lib.OUTLINE)
    if col and ob.name in col.objects:
        col.objects.unlink(ob)


# ------------------------------------------------------------------ Geometrie-Helfer


def _finish(name: str, bm: bmesh.types.BMesh, material: str, smooth: bool = False, bevel: float = 0.0, outline: bool = True):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me), outline)
    ob.data.materials.append(xmat(material))
    if smooth:
        for p in ob.data.polygons:
            p.use_smooth = True
    if bevel > 0:
        mod = ob.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = "ANGLE"
    return ob


def prism(name: str, pts: list[tuple[float, float]], axis: str, a0: float, a1: float, material: str, bevel: float = 0.0):
    """Extrudiertes Profil: `pts` = (u, z) mit u = Plan-y (axis 'x') bzw. Plan-x (axis 'y'), Länge a0…a1 entlang axis"""
    bm = bmesh.new()

    def V(u, v, a):
        return P(a, u, v) if axis == "x" else P(u, a, v)

    f0 = [bm.verts.new(V(u, v, a0)) for u, v in pts]
    f1 = [bm.verts.new(V(u, v, a1)) for u, v in pts]
    n = len(pts)
    bm.faces.new(f0)
    bm.faces.new(list(reversed(f1)))
    for i in range(n):
        bm.faces.new((f0[i], f0[(i + 1) % n], f1[(i + 1) % n], f1[i]))
    return _finish(name, bm, material, bevel=bevel)


def tube(name: str, a: tuple, b: tuple, r: float, material: str, seg: int = 16, outline: bool = True):
    """Rohr/Zylinder zwischen zwei Plan-Punkten (x, y, z)"""
    pa, pb = P(*a), P(*b)
    d = pb - pa
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=d.length)
    mtx = Matrix.Translation((pa + pb) / 2) @ d.normalized().to_track_quat("Z", "Y").to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=mtx, verts=bm.verts)
    return _finish(name, bm, material, smooth=True, outline=outline)


def cone(name: str, c: tuple, r0: float, r1: float, height: float, material: str, seg: int = 32):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r0, radius2=r1, depth=height)
    bmesh.ops.translate(bm, vec=P(c[0], c[1], c[2] + height / 2), verts=bm.verts)
    return _finish(name, bm, material, smooth=True)


def ellipsoid(name: str, c: tuple, rx: float, ry: float, rz: float, material: str, yaw: float = 0.0, pitch: float = 0.0, outline: bool = False):
    """Ellipsoid um Plan-Punkt c; yaw dreht um die Hochachse (Plan, im Uhrzeigersinn), pitch kippt die x-Achse nach oben"""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=1.0)
    mtx = Matrix.Translation(P(*c)) @ Matrix.Rotation(-yaw, 4, "Z") @ Matrix.Rotation(-pitch, 4, "Y") @ Matrix.Diagonal((rx, ry, rz, 1))
    bmesh.ops.transform(bm, matrix=mtx, verts=bm.verts)
    return _finish(name, bm, material, smooth=True, outline=outline)


def torus(name: str, c: tuple, axis: str, R: float, r: float, material: str, seg: int = 48, rseg: int = 10):
    """Ring (Reifen, Felge) um Plan-Punkt c, Achse 'x' oder 'y'"""
    bm = bmesh.new()
    rings = []
    for i in range(seg):
        a = i / seg * math.tau
        ring = []
        for j in range(rseg):
            t = j / rseg * math.tau
            rr = R + r * math.cos(t)
            q = r * math.sin(t)
            if axis == "x":
                pt = (c[0] + q, c[1] + rr * math.cos(a), c[2] + rr * math.sin(a))
            else:
                pt = (c[0] + rr * math.cos(a), c[1] + q, c[2] + rr * math.sin(a))
            ring.append(bm.verts.new(P(*pt)))
        rings.append(ring)
    for i in range(seg):
        for j in range(rseg):
            bm.faces.new((rings[i][j], rings[(i + 1) % seg][j], rings[(i + 1) % seg][(j + 1) % rseg], rings[i][(j + 1) % rseg]))
    return _finish(name, bm, material, smooth=True)


def ring_y(name: str, cx: float, cz: float, r0: float, r1: float, y0: float, y1: float, material: str, seg: int = 96):
    """Flachband um eine Achse in Plan-y (Spannbänder der Fasssauna)"""
    bm = bmesh.new()
    vs = []
    for i in range(seg):
        a = i / seg * math.tau
        ca, sa = math.cos(a), math.sin(a)
        vs.append([bm.verts.new(P(cx + r * ca, y, cz + r * sa)) for r, y in ((r0, y0), (r1, y0), (r1, y1), (r0, y1))])
    for i in range(seg):
        j = (i + 1) % seg
        for k in range(4):
            bm.faces.new((vs[i][k], vs[j][k], vs[j][(k + 1) % 4], vs[i][(k + 1) % 4]))
    return _finish(name, bm, material, smooth=True)


def disc_y(name: str, cx: float, cz: float, r: float, y0: float, y1: float, material: str, seg: int = 64):
    """Scheibe/kurzer Zylinder mit Achse in Plan-y"""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=abs(y1 - y0))
    mtx = Matrix.Translation(P(cx, (y0 + y1) / 2, cz)) @ Matrix.Rotation(math.pi / 2, 4, "X")
    bmesh.ops.transform(bm, matrix=mtx, verts=bm.verts)
    return _finish(name, bm, material, smooth=False)


def slats_x(name, x0, x1, y0, y1, z0, z1, pitch, height, material, top=None):
    """Waagerechte Latten entlang x (Wand in der x-z-Ebene) von z0 bis z1"""
    z = z0
    while z + height <= z1 + 1e-6:
        bx(name, x0, y0, z, x1, y1, z + height, material, 0.003)
        z += pitch


def slats_y(name, x0, x1, y0, y1, z0, z1, pitch, height, material, top=None):
    """Waagerechte Latten entlang y (Wand in der y-z-Ebene); `top(y)` begrenzt die Oberkante (Pultdach)"""
    z = z0
    while z + height <= z1 + 1e-6:
        ya, yb = y0, y1
        if top is not None:
            # Lattenstück nur dort, wo die Wand hoch genug ist (Oberkante linear in y)
            ta, tb = top(y0), top(y1)
            need = z + height
            if ta < need and tb < need:
                break
            if ta < need:
                ya = y0 + (y1 - y0) * (need - ta) / (tb - ta)
            elif tb < need:
                yb = y0 + (y1 - y0) * (ta - need) / (ta - tb)
        if yb - ya > 0.05:
            bx(name, x0, ya, z, x1, yb, z + height, material, 0.003)
        z += pitch


def pavers(x0, y0, x1, y1, sx, sy, z1=0.03, material="concrete", seed=1):
    """Betonplatten im Halbverband mit Fugen"""
    r = rng(seed)
    bx("paver_bed", x0 + 0.002, y0 + 0.002, 0.0, x1 - 0.002, y1 - 0.002, z1 - 0.012, "gravel_dark")
    y = y0
    row = 0
    while y < y1 - 1e-6:
        ye = min(y1, y + sy)
        x = x0 - (sx / 2 if row % 2 else 0)
        while x < x1 - 1e-6:
            xa, xe = max(x0, x), min(x1, x + sx)
            if xe - xa > 0.05:
                bx("paver", xa + 0.004, y + 0.004, z1 - 0.03, xe - 0.004, ye - 0.004, z1 + r.uniform(-0.002, 0.002), material, 0.004)
            x += sx
        y = ye
        row += 1


def mono_roof(x0, x1, y_front, y_back, z_front, z_back, t, material, rib_material="graphite", rib_pitch=0.42, ribs=True):
    """
    Pultdach als geneigte Platte von Plan-y_front (Traufe vorn/hoch) nach y_back (hinten/tief);
    z_front/z_back = Unterkante an diesen Kanten. Optional Stehfalz-Rippen entlang des Gefälles.
    Liefert die Funktion z(y) der Dachoberkante.
    """
    L = y_front - y_back
    a = math.atan2(z_front - z_back, L)
    e = Vector((1, 0, 0))
    s = Vector((0, math.cos(a), -math.sin(a)))  # Plan −y ist Blender +y, Gefälle nach hinten
    n = e.cross(s)
    org = P(x0, y_front, z_front)
    slope_len = L / math.cos(a)
    lib_plate = pl("roof", org, e, s, n, x1 - x0, slope_len, t, material)
    if ribs:
        k = max(2, round((x1 - x0) / rib_pitch))
        for i in range(1, k):
            x = x0 + (x1 - x0) * i / k
            pl("seam", org + e * (x - x0 - 0.008) + n * t, e, s, n, 0.016, slope_len, 0.028, rib_material)
    _ = lib_plate

    def z_top(y):
        return z_back + (z_front - z_back) * (y - y_back) / L + t / math.cos(a)

    return z_top


# ------------------------------------------------------------------ Carport


def carport_flat(w: float, d: float, h: float):
    """Stahl-Carport mit Flachdach: anthrazit Pfosten 12 × 12, umlaufende Blende, Trapezblech, Rückwand aus Thermoholz-Latten, Wallbox"""
    # Stellplatz aus großformatigen Betonplatten
    pavers(-w / 2 + 0.08, -d / 2 + 0.08, w / 2 - 0.08, d / 2 - 0.02, 0.8, 0.4, 0.03, "concrete", 7)
    t = 0.12
    fb = 0.045  # Blendenstärke
    xs = (-w / 2 + fb + 0.02, w / 2 - fb - 0.02 - t)
    ys = (-d / 2 + 0.35, -t / 2 - 0.2, d / 2 - 0.35 - t)
    for x in xs:
        for y in ys:
            bx("post", x, y, 0.03, x + t, y + t, h - 0.22, "anthracite", 0.004)
            bx("footplate", x - 0.04, y - 0.04, 0.03, x + t + 0.04, y + t + 0.04, 0.045, "graphite", 0.003)
            for dx in (-0.025, t + 0.015):
                for dy in (-0.025, t + 0.015):
                    cyl("bolt", x + dx + 0.005, y + dy + 0.005, 0.045, 0.06, 0.009, "inox", 8)
        # Längspfette auf den Pfosten
        bx("purlin", x, -d / 2 + fb, h - 0.22, x + t, d / 2 - fb, h - 0.08, "anthracite", 0.004)
    # Querträger unter dem Dach
    for i in range(6):
        y = -d / 2 + fb + (d - 2 * fb - 0.08) * i / 5
        bx("joist", -w / 2 + fb, y, h - 0.2, w / 2 - fb, y + 0.08, h - 0.09, "anthracite")
    # Dachhaut: Trapezblech, gegenüber der Blende abgesenkt (Schattenfuge)
    bx("roof", -w / 2 + fb, -d / 2 + fb, h - 0.09, w / 2 - fb, d / 2 - fb, h - 0.055, "trapez")
    # umlaufende Blende mit Abdeckprofil
    for a, b_, c, d_ in ((-w / 2, -d / 2, w / 2, -d / 2 + fb), (-w / 2, d / 2 - fb, w / 2, d / 2), (-w / 2, -d / 2 + fb, -w / 2 + fb, d / 2 - fb), (w / 2 - fb, -d / 2 + fb, w / 2, d / 2 - fb)):
        bx("fascia", a, b_, h - 0.25, c, d_, h - 0.012, "anthracite", 0.004)
        bx("coping", a - 0.006, b_ - 0.006, h - 0.012, c + 0.006, d_ + 0.006, h, "graphite", 0.003)
    # Fallrohr hinten rechts, mit Bogen in die Blende
    px, py = w / 2 - fb - 0.12, -d / 2 + 0.2
    cyl("downpipe", px, py, 0.05, h - 0.32, 0.04, "graphite", 24)
    tube("pipe_bend", (px, py, h - 0.33), (px + 0.05, py - 0.12, h - 0.26), 0.04, "graphite", 24)
    cyl("shoe", px, py, 0.03, 0.12, 0.048, "graphite", 24)
    # Rückwand und halbe Seitenwand (Plan-West) aus waagerechten Thermoholz-Latten
    yb = ys[0] + t / 2
    slats_x("slat_back", xs[0] + t, xs[1], yb - 0.012, yb + 0.012, 0.12, h - 0.32, 0.105, 0.085, "thermo_z")
    for x in (xs[0] + t, xs[1] - 0.03):
        bx("rail_v", x, yb - 0.03, 0.03, x + 0.03, yb - 0.012, h - 0.22, "anthracite")
    xw = xs[0] + t / 2
    slats_y("slat_side", xw - 0.012, xw + 0.012, ys[0] + t, ys[1], 0.12, h - 0.32, 0.105, 0.085, "thermo_z")
    # Wallbox am mittleren Pfosten (Innenseite)
    x = xs[0] + t
    bx("wallbox", x, ys[1] + 0.06 - 0.12, 0.95, x + 0.11, ys[1] + 0.06 + 0.12, 1.35, "wallbox", 0.02)
    bx("wallbox_face", x + 0.11, ys[1] + 0.06 - 0.1, 1.0, x + 0.115, ys[1] + 0.06 + 0.1, 1.3, "graphite", 0.004)
    bx("wallbox_led", x + 0.114, ys[1] + 0.06 - 0.04, 1.24, x + 0.118, ys[1] + 0.06 + 0.04, 1.255, "led")
    tube("cable", (x + 0.06, ys[1] + 0.06, 0.95), (x + 0.07, ys[1] + 0.06, 0.6), 0.012, "rubber", 8)
    tube("cable2", (x + 0.07, ys[1] + 0.06, 0.6), (x + 0.12, ys[1] - 0.05, 0.92), 0.012, "rubber", 8)


# ------------------------------------------------------------------ Geräteschuppen


def tool_shed_mono(w: float, d: float, h: float):
    """Kleiner Geräteschuppen mit Pultdach: Rhombusleisten aus vergrautem Thermoholz, anthrazit Eckprofile, Stehfalzdach"""
    ov_s, ov_f, ov_b = 0.1, 0.16, 0.12
    rt = 0.05
    wx0, wx1, wy0, wy1 = -w / 2 + ov_s, w / 2 - ov_s, -d / 2 + ov_b, d / 2 - ov_f
    zf_roof = h - rt - 0.03  # Unterkante Dach an der vorderen Traufe (inkl. Überstand)
    zb_roof = h - 0.36
    slope = (zf_roof - zb_roof) / (d)

    def roof_under(y):
        return zb_roof + slope * (y + d / 2)

    def wall_top(y):
        return roof_under(y) - 0.005

    # Sockel und dunkler Wandkern
    bx("plinth", wx0 - 0.01, wy0 - 0.01, 0, wx1 + 0.01, wy1 + 0.01, 0.07, "concrete_dark", 0.004)
    prism("core", [(wy0 + 0.03, 0.07), (wy1 - 0.03, 0.07), (wy1 - 0.03, wall_top(wy1 - 0.03)), (wy0 + 0.03, wall_top(wy0 + 0.03))], "x", wx0 + 0.03, wx1 - 0.03, "graphite")
    lp, lh = 0.088, 0.07
    # Front (Plan-Süden) und Rückseite: Latten entlang x
    slats_x("slat_s", wx0 + 0.04, wx1 - 0.04, wy1 - 0.03, wy1, 0.09, wall_top(wy1) - 0.02, lp, lh, "silver_z")
    slats_x("slat_n", wx0 + 0.04, wx1 - 0.04, wy0, wy0 + 0.03, 0.09, wall_top(wy0) - 0.02, lp, lh, "silver_z")
    # Seiten: Latten entlang y, oben vom Dachgefälle begrenzt
    for x0_, x1_ in ((wx0, wx0 + 0.03), (wx1 - 0.03, wx1)):
        slats_y("slat_side", x0_, x1_, wy0 + 0.04, wy1 - 0.04, 0.09, wall_top(wy1) - 0.02, lp, lh, "silver_z", top=lambda y: wall_top(y) - 0.02)
    # Eckprofile anthrazit (Winkel)
    for x, y, sx, sy in ((wx0, wy0, 1, 1), (wx1, wy0, -1, 1), (wx0, wy1, 1, -1), (wx1, wy1, -1, -1)):
        zt = wall_top(y)
        bx("corner_a", x - sx * 0.008, y - sy * 0.008, 0.07, x + sx * 0.05, y + sy * 0.012, zt, "anthracite", 0.002)
        bx("corner_b", x - sx * 0.008, y - sy * 0.008, 0.07, x + sx * 0.012, y + sy * 0.05, zt, "anthracite", 0.002)
    # Tür vorn: Zarge, Griff, Bänder
    dx0, dx1 = -0.55, 0.35
    dz1 = 1.9
    for a, b_, c, d_ in ((dx0 - 0.045, 0.07, dx0, dz1 + 0.045), (dx1, 0.07, dx1 + 0.045, dz1 + 0.045), (dx0 - 0.045, dz1, dx1 + 0.045, dz1 + 0.045)):
        bx("doorframe", a, wy1, b_, c, wy1 + 0.012, d_, "anthracite", 0.002)
    bx("doorgap", dx0 + 0.003, wy1 + 0.0005, 0.09, dx0 + 0.01, wy1 + 0.004, dz1, "mat_black")
    bx("handle_plate", dx1 - 0.09, wy1, 0.95, dx1 - 0.05, wy1 + 0.01, 1.15, "anthracite", 0.003)
    bx("handle", dx1 - 0.2, wy1 + 0.035, 1.02, dx1 - 0.06, wy1 + 0.05, 1.035, "inox", 0.004)
    bx("handle_neck", dx1 - 0.08, wy1 + 0.005, 1.02, dx1 - 0.065, wy1 + 0.04, 1.035, "inox")
    for z in (0.35, 1.6):
        bx("hinge", dx0 - 0.02, wy1, z, dx0 + 0.18, wy1 + 0.012, z + 0.035, "anthracite", 0.003)
    # schmales Fenster auf der Ostseite (hoch, als Oberlicht)
    bx("win_frame", wx1, -0.35, 1.32, wx1 + 0.015, 0.25, 1.62, "anthracite", 0.003)
    bx("win_glass", wx1 + 0.012, -0.31, 1.36, wx1 + 0.02, 0.21, 1.58, "window")
    # Pultdach mit Stehfalz, Traufblech vorn, Rinne hinten
    z_top = mono_roof(-w / 2, w / 2, d / 2, -d / 2, zf_roof, zb_roof - slope * 0.0, rt, "anthracite", "graphite")
    a = math.atan2(zf_roof - zb_roof, d)
    for x0_, x1_ in ((-w / 2 - 0.012, -w / 2), (w / 2, w / 2 + 0.012)):
        prism("verge", [(d / 2, zf_roof - 0.04), (d / 2, z_top(d / 2) + 0.02), (-d / 2, z_top(-d / 2) + 0.02), (-d / 2, zb_roof - 0.04)], "x", x0_, x1_, "graphite")
    bx("drip", -w / 2 - 0.012, d / 2, zf_roof - 0.05, w / 2 + 0.012, d / 2 + 0.012, z_top(d / 2) + 0.01, "graphite", 0.002)
    gy = -d / 2 - 0.05
    gz = zb_roof - 0.02
    gutter = cylinder("gutter", 0, 0, -w / 2 - 0.03, w / 2 + 0.03, 0.055, "graphite", 24)
    gutter.rotation_euler = (0, math.pi / 2, 0)
    gutter.location = P(0, gy, gz)
    cyl("downpipe", w / 2 - 0.05, gy, 0.05, gz, 0.035, "graphite", 20)
    _ = a


# ------------------------------------------------------------------ Fahrradunterstand


def bike(x: float, y: float, frame: str, flip: bool = False):
    """Fahrrad entlang Plan-y (Vorderrad nach Plan-Norden), Mitte bei (x, y)"""
    R, tr = 0.335, 0.021
    wb = 1.06
    s = -1 if flip else 1
    yf, yr = y - s * wb / 2, y + s * wb / 2  # Vorderrad, Hinterrad
    zc = R + tr
    for yy in (yf, yr):
        torus("tire", (x, yy, zc), "x", R, tr, "rubber", 48, 8)
        torus("rim", (x, yy, zc), "x", R - 0.03, 0.009, "inox", 48, 6)
        tube("hub", (x - 0.05, yy, zc), (x + 0.05, yy, zc), 0.018, "graphite", 12)
        for k in range(12):  # Speichen
            a = k / 12 * math.tau
            tube("spoke", (x + (0.03 if k % 2 else -0.03), yy, zc), (x, yy + math.cos(a) * (R - 0.035), zc + math.sin(a) * (R - 0.035)), 0.0018, "inox", 4, outline=False)
    bb = (x, yr - s * 0.43, 0.3)
    seat = (x, yr - s * 0.25, 0.86)
    head_t = (x, yf + s * 0.2, 0.93)
    head_b = (x, yf + s * 0.15, 0.74)
    for a, b_ in ((bb, seat), (bb, head_b), (seat, head_t), ((x, yr, zc), bb), ((x, yr, zc), seat), (head_b, head_t)):
        tube("frame", a, b_, 0.019, frame, 12)
    tube("fork", head_b, (x, yf, zc), 0.014, frame, 10)
    # Sattel, Lenker, Kurbel, Gepäckträger, Schutzbleche
    tube("seatpost", seat, (x, seat[1] - s * 0.04, 0.98), 0.013, "graphite", 10)
    ellipsoid("saddle", (x, seat[1] - s * 0.02, 1.0), 0.08, 0.14, 0.03, "rubber", yaw=0.0, outline=True)
    stem = (x, head_t[1] + s * 0.05, 1.03)
    tube("stem", head_t, stem, 0.014, "graphite", 10)
    tube("bar", (x - 0.3, stem[1] - s * 0.03, 1.05), (x + 0.3, stem[1] - s * 0.03, 1.05), 0.012, "graphite", 10)
    for sx in (-1, 1):
        tube("grip", (x + sx * 0.3, stem[1] - s * 0.03, 1.05), (x + sx * 0.19, stem[1] - s * 0.03, 1.05), 0.017, "rubber", 10)
    tube("crank", (x - 0.08, bb[1], 0.3), (x + 0.08, bb[1], 0.3), 0.012, "graphite", 8)
    tube("chainring", (x + 0.045, bb[1], 0.3), (x + 0.053, bb[1], 0.3), 0.1, "graphite", 32)
    bx("rack", x - 0.08, yr - s * 0.3, 0.83, x + 0.08, yr + s * 0.05, 0.85, "graphite")
    for yy in (yf, yr):
        torus_part = torus("fender", (x, yy, zc), "x", R + 0.035, 0.012, "graphite", 48, 6)
        _ = torus_part


def bike_shelter(w: float, d: float, h: float):
    """Fahrradunterstand mit Gründach: anthrazit Stahlrahmen, Rück- und Seitenwände aus Thermoholz-Latten, zwei Fahrräder"""
    pavers(-w / 2 + 0.05, -d / 2 + 0.05, w / 2 - 0.05, d / 2 - 0.05, 0.6, 0.3, 0.03, "concrete", 3)
    t = 0.08
    ov = 0.06
    xs = (-w / 2 + ov, w / 2 - ov - t)
    ys = (-d / 2 + ov, d / 2 - ov - t - 0.1)
    for x in xs:
        for y in ys:
            bx("post", x, y, 0.03, x + t, y + t, h - 0.2, "anthracite", 0.004)
    # Wände: hinten volle Breite, Seiten über die ganze Tiefe, unten 10 cm frei
    slats_x("slat_n", xs[0] + t, xs[1], ys[0] + t / 2 - 0.011, ys[0] + t / 2 + 0.011, 0.12, h - 0.26, 0.1, 0.08, "thermo_z")
    for x in xs:
        slats_y("slat_side", x + t / 2 - 0.011, x + t / 2 + 0.011, ys[0] + t, ys[1], 0.12, h - 0.26, 0.1, 0.08, "thermo_z")
    # Flachdach mit Attika, Kiesrand und Sedum
    bx("roofdeck", -w / 2, -d / 2, h - 0.2, w / 2, d / 2, h - 0.08, "anthracite", 0.008)
    a_ = 0.06
    for a, b_, c, d_ in ((-w / 2, -d / 2, w / 2, -d / 2 + a_), (-w / 2, d / 2 - a_, w / 2, d / 2), (-w / 2, -d / 2 + a_, -w / 2 + a_, d / 2 - a_), (w / 2 - a_, -d / 2 + a_, w / 2, d / 2 - a_)):
        bx("attika", a, b_, h - 0.08, c, d_, h, "anthracite", 0.004)
    bx("gravel", -w / 2 + a_, -d / 2 + a_, h - 0.08, w / 2 - a_, d / 2 - a_, h - 0.055, "gravel_light")
    x0, y0, x1, y1 = -w / 2 + 0.2, -d / 2 + 0.2, w / 2 - 0.2, d / 2 - 0.2
    foliage_carpet("sedum_g", x0, y0, x1, y1, h - 0.055, 2600, 0.028, "leaf_sedum", seed=6)
    foliage_carpet("sedum_r", x0, y0, x1, y1, h - 0.05, 650, 0.026, "leaf_sedum_red", seed=13)
    r = rng(21)
    for _ in range(7):  # einzelne flache Polster (Thymian, Dachwurz) für Struktur
        c = P(r.uniform(x0 + 0.1, x1 - 0.1), r.uniform(y0 + 0.1, y1 - 0.1), h - 0.06)
        ob = foliage_ball("cushion", c, r.uniform(0.07, 0.1), 160, 0.02, "leaf_light" if r.random() < 0.5 else "leaf_sedum_red", seed=r.randint(1, 999))
        ob.scale = (1, 1, 0.45)
    # Wasserspeier vorn rechts
    bx("spout", w / 2 - 0.3, d / 2, h - 0.06, w / 2 - 0.24, d / 2 + 0.1, h - 0.03, "graphite")
    # zwei Fahrräder, Vorderrad an der Rückwand, in Anlehnbügeln
    bike(-0.45, 0.05, "anthracite")
    bike(0.32, 0.12, "bike_sage")
    for x in (-0.45, 0.32):
        tube("stand_l", (x - 0.06, -d / 2 + 0.35, 0.03), (x - 0.06, -d / 2 + 0.35, 0.55), 0.012, "inox", 10)
        tube("stand_r", (x + 0.06, -d / 2 + 0.35, 0.03), (x + 0.06, -d / 2 + 0.35, 0.55), 0.012, "inox", 10)
        tube("stand_t", (x - 0.06, -d / 2 + 0.35, 0.55), (x + 0.06, -d / 2 + 0.35, 0.55), 0.012, "inox", 10)


# ------------------------------------------------------------------ Mülltonnenbox


def bin_store(w: float, d: float, h: float):
    """Mülltonnenbox für zwei 240-l-Tonnen: anthrazit Stahlrahmen, Thermoholz-Latten, Pflanzdach mit Sedum"""
    f = 0.035
    lid_t = 0.07
    zt = h - lid_t
    # Rahmen: Ecken, Mittelpfosten, Ober-/Untergurt
    for x in (-w / 2, -f / 2, w / 2 - f):
        for y in (-d / 2, d / 2 - f):
            bx("post", x, y, 0, x + f, y + f, zt, "anthracite", 0.003)
    for y0_, y1_ in ((-d / 2, -d / 2 + f), (d / 2 - f, d / 2)):
        bx("rail_t", -w / 2, y0_, zt - f, w / 2, y1_, zt, "anthracite", 0.003)
        bx("rail_b", -w / 2, y0_, 0.03, w / 2, y1_, 0.03 + f, "anthracite", 0.003)
    for x0_, x1_ in ((-w / 2, -w / 2 + f), (w / 2 - f, w / 2)):
        bx("rail_ts", x0_, -d / 2, zt - f, x1_, d / 2, zt, "anthracite", 0.003)
    lp, lh = 0.09, 0.072
    # Rückwand und Seiten
    slats_x("slat_n", -w / 2 + f, w / 2 - f, -d / 2 + 0.008, -d / 2 + 0.028, 0.07, zt - f - 0.01, lp, lh, "thermo_z")
    for x0_, x1_ in ((-w / 2 + 0.008, -w / 2 + 0.028), (w / 2 - 0.028, w / 2 - 0.008)):
        slats_y("slat_side", x0_, x1_, -d / 2 + f, d / 2 - f, 0.07, zt - f - 0.01, lp, lh, "thermo_z")
    # dunkle Rückseite hinter den Türen (Fugen nicht durchsichtig)
    bx("back_panel", -w / 2 + f, d / 2 - 0.05, 0.03, w / 2 - f, d / 2 - 0.035, zt - f, "graphite")
    # zwei Türen: Rahmen anthrazit, Latten, Stangengriff
    for i, (x0_, x1_) in enumerate(((-w / 2 + f + 0.006, -f / 2 - 0.006), (f / 2 + 0.006, w / 2 - f - 0.006))):
        y = d / 2
        bx("door_l", x0_, y - 0.03, 0.04, x0_ + 0.03, y, zt - f - 0.006, "anthracite", 0.002)
        bx("door_r", x1_ - 0.03, y - 0.03, 0.04, x1_, y, zt - f - 0.006, "anthracite", 0.002)
        bx("door_t", x0_, y - 0.03, zt - f - 0.036, x1_, y, zt - f - 0.006, "anthracite", 0.002)
        bx("door_b", x0_, y - 0.03, 0.04, x1_, y, 0.07, "anthracite", 0.002)
        slats_x("slat_door", x0_ + 0.03, x1_ - 0.03, y - 0.025, y - 0.006, 0.08, zt - f - 0.04, lp, lh, "thermo_z")
        hx = x1_ - 0.07 if i == 0 else x0_ + 0.07
        bx("handle", hx - 0.009, y + 0.025, 0.55, hx + 0.009, y + 0.04, 0.85, "inox", 0.004)
        for z in (0.58, 0.82):
            bx("handle_neck", hx - 0.006, y, z - 0.007, hx + 0.006, y + 0.026, z + 0.007, "inox")
        # Nummernschild/Kennzeichnung: kleine Edelstahlplakette
        bx("tag", (x0_ + x1_) / 2 - 0.05, y, zt - 0.2, (x0_ + x1_) / 2 + 0.05, y + 0.004, zt - 0.14, "inox", 0.002)
    # Pflanzdach: zwei Deckel als Pflanzschalen
    for x0_, x1_ in ((-w / 2, -0.004), (0.004, w / 2)):
        bx("lid", x0_, -d / 2 - 0.01, zt, x1_, d / 2 + 0.015, zt + 0.02, "anthracite", 0.004)
        for a, b_, c, d_ in ((x0_, -d / 2 - 0.01, x1_, -d / 2 + 0.02), (x0_, d / 2 - 0.015, x1_, d / 2 + 0.015), (x0_, -d / 2 + 0.02, x0_ + 0.03, d / 2 - 0.015), (x1_ - 0.03, -d / 2 + 0.02, x1_, d / 2 - 0.015)):
            bx("tray", a, b_, zt + 0.02, c, d_, h, "anthracite", 0.003)
        bx("substrate", x0_ + 0.03, -d / 2 + 0.02, zt + 0.02, x1_ - 0.03, d / 2 - 0.015, h - 0.025, "soil")
        foliage_carpet("sedum_g", x0_ + 0.05, -d / 2 + 0.04, x1_ - 0.05, d / 2 - 0.035, h - 0.03, 3200, 0.022, "leaf_sedum", seed=int(x0_ * 100) + 50)
        foliage_carpet("sedum_r", x0_ + 0.05, -d / 2 + 0.04, x1_ - 0.05, d / 2 - 0.035, h - 0.026, 900, 0.02, "leaf_sedum_red", seed=int(x0_ * 100) + 70)
    # Deckelscharniere hinten, Gasdruckfeder angedeutet
    for x in (-w / 2 + 0.1, -0.12, 0.12, w / 2 - 0.1):
        bx("hinge", x - 0.03, -d / 2 - 0.02, zt - 0.03, x + 0.03, -d / 2 - 0.005, zt + 0.015, "graphite", 0.002)


# ------------------------------------------------------------------ Fasssauna


def barrel_sauna(w: float, d: float, h: float):
    """Fasssauna aus Thermoholz: Dauben, Edelstahl-/Stahlbänder, Vorraum mit Glastür, Liegehölzer, Ofenrohr"""
    R = w / 2 - 0.02
    cz = h - R
    th = 0.045
    y_front = d / 2 - 0.2  # Daubenenden vorn (davor die Stufe)
    y_back = -d / 2
    L = y_front - y_back
    # Liegehölzer (Wiegen) unter dem Fass
    half = R * 0.82
    for yc in (y_back + 0.35, (y_back + y_front) / 2, y_front - 0.4):
        pts = [(-half, 0.0), (half, 0.0)]
        k = 16
        for i in range(k + 1):
            x = half - 2 * half * i / k
            pts.append((x, cz - math.sqrt(max(0.0, R * R - x * x)) + 0.005))
        prism("cradle", pts, "y", yc - 0.045, yc + 0.045, "thermo_x", 0.004)
        bx("cradle_foot", -half, yc - 0.07, 0.0, half, yc + 0.07, 0.04, "concrete_dark", 0.004)
    # Dauben
    n = 60
    sw = math.tau * R / n
    e = Vector((0, 1, 0))
    for i in range(n):
        a = i / n * math.tau
        s = Vector((-math.sin(a), 0, math.cos(a)))
        nr = Vector((math.cos(a), 0, math.sin(a)))
        org = P(0, y_front, cz) + nr * (R - th) - s * (sw / 2 - 0.003)
        pl("stave", org, e, s, nr, L, sw - 0.006, th, "thermo_y")
    # Spannbänder
    for yc in (y_back + 0.18, y_back + 0.95, y_front - 0.95, y_front - 0.15):
        ring_y("band", 0, cz, R - 0.002, R + 0.009, yc - 0.022, yc + 0.022, "anthracite", 120)
    # Stirnwände aus senkrechten Brettern: vorn eingerückt (Vorraum), hinten bündig
    ri = R - th
    porch = 0.55
    for yw0, yw1 in ((y_front - porch - 0.06, y_front - porch), (y_back + 0.04, y_back + 0.1)):
        bw = 0.12
        x = -ri
        while x < ri - 0.02:
            xe = min(ri, x + bw)
            xm = max(abs(x), abs(xe))
            hh = math.sqrt(max(0.0, ri * ri - xm * xm)) + 0.02
            if hh > 0.06:
                bx("endboard", x + 0.002, yw0, cz - hh, xe - 0.002, yw1, cz + hh, "thermo_z")
            x = xe
    # Glastür im Vorraum
    yd = y_front - porch
    dx0, dx1 = -0.34, 0.34
    fz0 = cz - math.sqrt(ri * ri - 0.7 * 0.7) + 0.05
    fz0 = max(fz0, 0.5)
    for a, b_, c, d_ in ((dx0 - 0.06, fz0, dx0, 2.0), (dx1, fz0, dx1 + 0.06, 2.0), (dx0 - 0.06, 2.0, dx1 + 0.06, 2.07)):
        bx("doorframe", a, yd, b_, c, yd + 0.03, d_, "thermo_z", 0.004)
    bx("doorglass", dx0 + 0.01, yd + 0.005, fz0 + 0.03, dx1 - 0.01, yd + 0.025, 1.98, "window")
    bx("door_handle", dx1 - 0.08, yd + 0.04, 1.0, dx1 - 0.05, yd + 0.07, 1.35, "thermo_z", 0.008)
    tube("handle_pin", (dx1 - 0.065, yd + 0.025, 1.05), (dx1 - 0.065, yd + 0.045, 1.05), 0.008, "inox", 8)
    tube("handle_pin2", (dx1 - 0.065, yd + 0.025, 1.3), (dx1 - 0.065, yd + 0.045, 1.3), 0.008, "inox", 8)
    # Boden im Vorraum, Sitzbänke links/rechts, Stufe
    floor_z = fz0
    bx("porch_floor", -0.72, yd + 0.03, floor_z - 0.04, 0.72, y_front, floor_z, "thermo_x", 0.003)
    for sx in (-1, 1):
        xb = sx * 0.56
        hb = cz - math.sqrt(ri * ri - (abs(xb) + 0.16) ** 2) + 0.02
        bx("porch_bench", xb - 0.16, yd + 0.05, max(floor_z, 0.82), xb + 0.16, y_front - 0.04, max(floor_z, 0.82) + 0.04, "thermo_x", 0.004)
        _ = hb
    bx("step", -0.4, y_front - 0.02, 0.24, 0.4, d / 2, 0.28, "thermo_x", 0.004)
    for sx in (-0.3, 0.3):
        bx("step_block", sx - 0.05, y_front + 0.02, 0.0, sx + 0.05, d / 2 - 0.03, 0.24, "concrete_dark", 0.004)
    # Fenster in der Rückwand
    bx("win_frame", -0.24, y_back + 0.02, 1.45, 0.24, y_back + 0.045, 1.85, "thermo_z", 0.004)
    bx("win_glass", -0.19, y_back + 0.012, 1.5, 0.19, y_back + 0.03, 1.8, "window")
    # Ofenrohr aus Edelstahl mit Regenhaube und Dachdurchführung
    px, py = 0.42, y_back + 0.75
    zs = cz + math.sqrt(R * R - px * px)
    cyl("flue_collar", px, py, zs - 0.05, zs + 0.04, 0.13, "anthracite", 32, 0.005)
    cyl("flue", px, py, zs - 0.1, zs + 0.85, 0.075, "inox", 32)
    cyl("flue_ring", px, py, zs + 0.5, zs + 0.53, 0.08, "inox", 32)
    cone("flue_cap", (px, py, zs + 0.92), 0.16, 0.02, 0.09, "inox")
    for k in range(3):
        a = k / 3 * math.tau
        tube("cap_leg", (px + math.cos(a) * 0.07, py + math.sin(a) * 0.07, zs + 0.85), (px + math.cos(a) * 0.1, py + math.sin(a) * 0.1, zs + 0.93), 0.006, "inox", 6)


# ------------------------------------------------------------------ Hühnerstall


def hen(x: float, y: float, yaw: float, kind: str = "hen_brown", z: float = 0.0, peck: bool = False):
    """Huhn (~40 cm): Körper, Flügel, aufgestellte Schwanzfedern, Hals, Kopf mit Kamm, Kehllappen und Schnabel; `yaw` = Blickrichtung"""
    c, s = math.cos(yaw), math.sin(yaw)

    def L(fx, fz, lat=0.0):
        """lokal: fx nach vorn, lat zur Seite, fz Höhe → Plan-Punkt"""
        return (x + c * fx - s * lat, y + s * fx + c * lat, z + fz)

    dark = kind + "_dark"
    ellipsoid("hen_body", L(0.0, 0.2), 0.15, 0.1, 0.1, kind, yaw, 0.12)
    ellipsoid("hen_breast", L(0.07, 0.21), 0.085, 0.08, 0.09, kind, yaw)
    for side in (-1, 1):
        ellipsoid("hen_wing", L(-0.02, 0.225, side * 0.058), 0.12, 0.03, 0.062, dark, yaw, 0.1)
    ellipsoid("hen_tail", L(-0.12, 0.3), 0.045, 0.045, 0.1, dark, yaw, -0.45)
    ellipsoid("hen_tail2", L(-0.15, 0.27), 0.04, 0.035, 0.075, kind, yaw, -0.9)
    if peck:
        neck, head = (0.14, 0.2, 1.1), (0.2, 0.12)
    else:
        neck, head = (0.1, 0.3, 0.35), (0.135, 0.38)
    ellipsoid("hen_neck", L(neck[0], neck[1]), 0.045, 0.045, 0.075, kind, yaw, neck[2])
    hx, hz = head
    ellipsoid("hen_head", L(hx, hz), 0.042, 0.036, 0.04, kind, yaw)
    ellipsoid("hen_comb", L(hx - 0.004, hz + 0.042), 0.034, 0.008, 0.02, "comb", yaw)
    ellipsoid("hen_wattle", L(hx + 0.022, hz - 0.04), 0.012, 0.008, 0.017, "comb", yaw)
    ellipsoid("hen_beak", L(hx + 0.047, hz - 0.004), 0.02, 0.009, 0.008, "beak", yaw, -0.25)
    for side in (-1, 1):
        lx, ly, _ = L(0.0, 0.0, side * 0.04)
        tube("hen_leg", (lx, ly, z), (lx, ly, z + 0.12), 0.007, "beak", 6, outline=False)
        tube("hen_toe", (lx, ly, z + 0.004), (lx + c * 0.05, ly + s * 0.05, z + 0.004), 0.004, "beak", 4, outline=False)


def chicken_coop(w: float, d: float, h: float):
    """Hühnerstall auf Stelzen mit Nistkasten und Rampe, Auslauf aus Volierendraht; drei Hühner"""
    ov = 0.07
    # Stall links: x0…x1, Boden auf 0,55 m
    sx0, sx1 = -w / 2 + 0.24, -w / 2 + 1.12
    sy0, sy1 = -d / 2 + ov, d / 2 - ov
    zf = 0.55
    zr_f, zr_b = h - 0.06, h - 0.3  # Dachunterkante vorn/hinten an der Außenkante
    slope = (zr_f - zr_b) / d

    def under(y):
        return zr_b + slope * (y + d / 2)

    # Auslauf: ganze Breite, Höhe 1,15 m (unter dem Stall frei begehbar)
    rz = 1.15
    t = 0.07
    floor_x0 = sx0
    bx("litter", floor_x0, sy0, 0.0, w / 2 - ov, sy1, 0.025, "straw")
    r = rng(5)
    for _ in range(40):  # Halme/Krümel als Struktur
        xx, yy = r.uniform(floor_x0 + 0.05, w / 2 - 0.1), r.uniform(sy0 + 0.05, sy1 - 0.05)
        ang = r.uniform(0, math.tau)
        tube("straw_bit", (xx, yy, 0.028), (xx + math.cos(ang) * 0.08, yy + math.sin(ang) * 0.08, 0.03), 0.003, "straw", 4, outline=False)
    # Stelzen und Stall
    for x in (sx0, sx1 - t):
        for y in (sy0, sy1 - t):
            bx("leg", x, y, 0.0, x + t, y + t, zf, "thermo_grey_z", 0.004)
    bx("floor", sx0, sy0, zf, sx1, sy1, zf + 0.04, "thermo_grey_x", 0.004)

    def wall_top(y):
        return under(y) - 0.005

    prism("house", [(sy0, zf + 0.04), (sy1, zf + 0.04), (sy1, wall_top(sy1)), (sy0, wall_top(sy0))], "x", sx0, sx1, "silver_z")
    # Deckleisten (Boden-Deckel-Schalung)
    x = sx0 + 0.1
    while x < sx1 - 0.06:
        for y in (sy0 - 0.012, sy1):
            bx("batten", x - 0.015, y, zf + 0.04, x + 0.015, y + 0.012, wall_top(y), "silver_z", 0.002)
        x += 0.13
    y = sy0 + 0.1
    while y < sy1 - 0.06:
        for x in (sx0 - 0.012, sx1):
            bx("batten", x, y - 0.015, zf + 0.04, x + 0.012, y + 0.015, wall_top(y + 0.015), "silver_z", 0.002)
        y += 0.13
    # Eckleisten hell abgesetzt
    for x in (sx0 - 0.012, sx1 - 0.03):
        for y in (sy0 - 0.012, sy1 - 0.03):
            bx("trim", x, y, zf, x + 0.042, y + 0.042, wall_top(y), "anthracite", 0.002)
    # Klappe zur Rampe (Plan-Ost) und Lüftungsgitter vorn
    bx("popdoor_frame", sx1, -0.17, zf + 0.04, sx1 + 0.015, 0.17, zf + 0.37, "anthracite", 0.002)
    bx("popdoor", sx1 + 0.005, -0.13, zf + 0.04, sx1 + 0.018, 0.13, zf + 0.33, "mat_black")
    bx("vent_frame", sx0 + 0.18, sy1, wall_top(sy1) - 0.2, sx1 - 0.18, sy1 + 0.012, wall_top(sy1) - 0.06, "anthracite", 0.002)
    org = P(sx0 + 0.2, sy1 + 0.014, wall_top(sy1) - 0.18)
    pl("vent", org, Vector((1, 0, 0)), Vector((0, 0, 1)), Vector((0, -1, 0)), sx1 - sx0 - 0.4, 0.1, 0.002, "wire", outline=False)
    bx("vent_back", sx0 + 0.2, sy1 - 0.005, wall_top(sy1) - 0.18, sx1 - 0.2, sy1 + 0.002, wall_top(sy1) - 0.08, "mat_black")
    # Servicetür vorn
    bx("door_frame", sx0 + 0.12, sy1, zf + 0.1, sx0 + 0.5, sy1 + 0.012, zf + 0.62, "anthracite", 0.002)
    bx("door_panel", sx0 + 0.15, sy1 + 0.004, zf + 0.13, sx0 + 0.47, sy1 + 0.026, zf + 0.59, "silver_z", 0.002)
    bx("latch", sx0 + 0.42, sy1 + 0.026, zf + 0.34, sx0 + 0.45, sy1 + 0.04, zf + 0.4, "inox")
    # Nistkasten auf der Westseite mit Klappdeckel
    nx0 = -w / 2 + ov - 0.01
    nz0, nz1 = zf + 0.08, zf + 0.42
    bx("nestbox", nx0, -0.42, nz0, sx0, 0.42, nz1, "silver_z", 0.003)
    a = math.radians(22)
    e = Vector((0, 1, 0))
    s = Vector((-math.cos(a), 0, -math.sin(a)))
    n_ = s.cross(e)
    if n_.z < 0:
        n_ = -n_
    pl("nest_lid", P(sx0 + 0.02, 0.46, nz1 + 0.1), e, s, n_, 0.92, (sx0 - nx0 + 0.06) / math.cos(a), 0.025, "anthracite")
    bx("nest_hinge", sx0, -0.4, nz1 + 0.06, sx0 + 0.015, 0.4, nz1 + 0.11, "graphite")
    # Pultdach (Stall), Stehfalz
    z_top = mono_roof(sx0 - 0.07 - (sx0 - nx0), sx1 + 0.07, d / 2, -d / 2, zr_f, zr_b, 0.04, "anthracite", "graphite", 0.3)
    bx("drip", sx0 - 0.07 - (sx0 - nx0), d / 2, zr_f - 0.04, sx1 + 0.07, d / 2 + 0.01, z_top(d / 2), "graphite", 0.002)
    # Rampe mit Sprossen in den Auslauf
    ra = math.atan2(zf + 0.04, 0.6)
    e = Vector((0, -1, 0))
    s = Vector((math.cos(ra), 0, -math.sin(ra)))
    n_ = e.cross(s)
    if n_.z < 0:
        n_ = -n_
    rl = (zf + 0.04) / math.sin(ra)
    org = P(sx1 + 0.01, -0.12, zf + 0.035)
    pl("ramp", org, e, s, n_, 0.24, rl, 0.02, "thermo_grey_x")
    for i in range(1, 6):
        pl("rung", org + s * (rl * i / 6) + n_ * 0.02, e, s, n_, 0.24, 0.018, 0.014, "thermo_grey_x")
    # Auslauf-Rahmen (rechts vom Stall bis zur Ostkante, darunter mit eingeschlossen)
    ax1 = w / 2 - ov
    posts = [(sx1 - t, sy0), (sx1 - t, sy1 - t), ((sx1 + ax1) / 2 - t / 2, sy0), ((sx1 + ax1) / 2 - t / 2, sy1 - t), (ax1 - t, sy0), (ax1 - t, sy1 - t)]
    for x, y in posts[2:]:
        bx("run_post", x, y, 0.0, x + t, y + t, rz, "thermo_grey_z", 0.004)
    for y0_, y1_ in ((sy0, sy0 + t), (sy1 - t, sy1)):
        bx("run_top", sx1 - 0.001, y0_, rz - t, ax1, y1_, rz, "thermo_grey_x", 0.004)
        bx("run_sill", floor_x0, y0_, 0.0, ax1, y1_, 0.06, "thermo_grey_x", 0.004)
    bx("run_top_e", ax1 - t, sy0, rz - t, ax1, sy1, rz, "thermo_grey_x", 0.004)
    bx("run_mid", (sx1 + ax1) / 2 - t / 2, sy0, rz - t, (sx1 + ax1) / 2 + t / 2, sy1, rz, "thermo_grey_x", 0.004)
    bx("run_sill_w", floor_x0, sy0, 0.0, floor_x0 + t, sy1, 0.06, "thermo_grey_x", 0.004)
    bx("run_sill_e", ax1 - t, sy0, 0.0, ax1, sy1, 0.06, "thermo_grey_x", 0.004)
    # Drahtfelder: vorn/hinten (unter dem Stall bis zum Boden, daneben bis Oberkante), Ost, West unter Stall, Dach
    X, Y, Z = Vector((1, 0, 0)), Vector((0, -1, 0)), Vector((0, 0, 1))
    for y in (sy0 + t / 2, sy1 - t / 2):
        pl("mesh", P(floor_x0, y, 0.06), X, Z, Y, sx1 - floor_x0, zf - 0.06, 0.002, "wire", outline=False)
        pl("mesh", P(sx1, y, 0.06), X, Z, Y, ax1 - sx1, rz - t - 0.06, 0.002, "wire", outline=False)
    pl("mesh", P(ax1 - t / 2, sy0, 0.06), Y, Z, X, sy1 - sy0, rz - t - 0.06, 0.002, "wire", outline=False)
    pl("mesh", P(floor_x0 + t / 2, sy0, 0.06), Y, Z, X, sy1 - sy0, zf - 0.06, 0.002, "wire", outline=False)
    pl("mesh_roof", P(sx1, sy0, rz - 0.002), X, Y, Z, ax1 - sx1, sy1 - sy0, 0.002, "wire", outline=False)
    # Tür im Auslauf vorn (Rahmen)
    dx0, dx1 = (sx1 + ax1) / 2 + t / 2 + 0.05, ax1 - t - 0.05
    for a_, b_, c_, d_ in ((dx0, 0.06, dx0 + 0.04, rz - t - 0.03), (dx1 - 0.04, 0.06, dx1, rz - t - 0.03), (dx0, rz - t - 0.07, dx1, rz - t - 0.03), (dx0, 0.08, dx1, 0.12)):
        bx("run_door", a_, sy1 - 0.01, b_, c_, sy1 + 0.02, d_, "thermo_grey_z", 0.003)
    bx("run_latch", dx0 + 0.005, sy1 + 0.02, 0.6, dx0 + 0.03, sy1 + 0.035, 0.66, "inox")
    # Tränke und Futterspender
    cyl("drinker", ax1 - 0.2, sy0 + 0.22, 0.025, 0.05, 0.12, "inox", 40, 0.004)
    cyl("drinker_tank", ax1 - 0.2, sy0 + 0.22, 0.05, 0.3, 0.08, "inox", 40, 0.006)
    cyl("drinker_lid", ax1 - 0.2, sy0 + 0.22, 0.3, 0.32, 0.025, "graphite", 16)
    cyl("feeder", floor_x0 + 0.35, sy0 + 0.35, 0.025, 0.05, 0.15, "graphite", 40, 0.004)
    cyl("feeder_tube", floor_x0 + 0.35, sy0 + 0.35, 0.05, 0.42, 0.075, "graphite", 32, 0.004)
    cyl("feed", floor_x0 + 0.35, sy0 + 0.35, 0.045, 0.055, 0.13, "straw", 32)
    # Hühner
    hen(0.72, 0.28, math.radians(200), "hen_brown")
    hen(0.4, -0.38, math.radians(-25), "hen_white", peck=True)
    hen(-0.62, 0.22, math.radians(15), "hen_brown", peck=True)


# ------------------------------------------------------------------ Outdoorküche


def outdoor_kitchen(w: float, d: float, h: float):
    """Outdoorküche: Korpus aus Anthrazit-Beton, Arbeitsplatte Sichtbeton, Fronten Edelstahl, Gasgrill mit Haube, Spüle"""
    top_t = 0.05
    zt = h - top_t
    plinth = 0.1
    # Korpus mit zurückgesetztem Sockel
    bx("plinth", -w / 2 + 0.05, -d / 2 + 0.05, 0, w / 2 - 0.05, d / 2 - 0.08, plinth, "mat_black")
    bx("body", -w / 2 + 0.02, -d / 2 + 0.02, plinth, w / 2 - 0.02, d / 2 - 0.04, zt, "concrete_dark", 0.006)
    # Arbeitsplatte mit Ausschnitt für die Spüle
    sx0, sx1 = 0.05, 0.55
    sy0, sy1 = -0.2, 0.2
    ov = 0.0
    bx("top", -w / 2, -d / 2, zt, sx0, d / 2 + ov, h, "concrete", 0.006)
    bx("top", sx1, -d / 2, zt, w / 2, d / 2 + ov, h, "concrete", 0.006)
    bx("top", sx0 - 0.01, -d / 2, zt, sx1 + 0.01, sy0, h, "concrete", 0.006)
    bx("top", sx0 - 0.01, sy1, zt, sx1 + 0.01, d / 2 + ov, h, "concrete", 0.006)
    # Spüle
    for a, b_, c, d_ in ((sx0, sy0, sx1, sy0 + 0.02), (sx0, sy1 - 0.02, sx1, sy1), (sx0, sy0 + 0.02, sx0 + 0.02, sy1 - 0.02), (sx1 - 0.02, sy0 + 0.02, sx1, sy1 - 0.02)):
        bx("sink_rim", a, b_, h - 0.004, c, d_, h + 0.002, "inox", 0.002)
    bx("sink_bowl", sx0 + 0.02, sy0 + 0.02, h - 0.2, sx1 - 0.02, sy1 - 0.02, h - 0.19, "inox_dark")
    for a, b_, c, d_ in ((sx0 + 0.015, sy0 + 0.015, sx1 - 0.015, sy0 + 0.02), (sx0 + 0.015, sy1 - 0.02, sx1 - 0.015, sy1 - 0.015), (sx0 + 0.015, sy0 + 0.02, sx0 + 0.02, sy1 - 0.02), (sx1 - 0.02, sy0 + 0.02, sx1 - 0.015, sy1 - 0.02)):
        bx("sink_wall", a, b_, h - 0.2, c, d_, h - 0.002, "inox_dark")
    cyl("drain", (sx0 + sx1) / 2, 0.0, h - 0.19, h - 0.185, 0.035, "inox", 24)
    # Armatur (Bogenauslauf)
    tx, ty = (sx0 + sx1) / 2, sy0 - 0.06
    cyl("tap_base", tx, ty, h, h + 0.03, 0.028, "inox", 24, 0.004)
    tube("tap_riser", (tx, ty, h + 0.02), (tx, ty, h + 0.3), 0.014, "inox", 16)
    k = 8
    prev = (tx, ty, h + 0.3)
    for i in range(1, k + 1):
        a = math.pi * i / k
        pt = (tx, ty + 0.08 - 0.08 * math.cos(a), h + 0.3 + 0.08 * math.sin(a))
        tube("tap_arc", prev, pt, 0.014, "inox", 16)
        prev = pt
    tube("tap_out", prev, (tx, prev[1], prev[2] - 0.05), 0.014, "inox", 16)
    tube("tap_lever", (tx, ty, h + 0.2), (tx + 0.1, ty, h + 0.24), 0.007, "inox", 10)
    # Gasgrill (Einbau) links mit geschlossener Haube
    gx0, gx1 = -w / 2 + 0.1, -w / 2 + 0.95
    gy0, gy1 = -0.27, 0.3
    bx("grill_frame", gx0, gy0, h, gx1, gy1, h + 0.02, "inox", 0.004)
    bx("grill_panel", gx0, gy1 - 0.005, h - 0.12, gx1, gy1 + 0.075, h + 0.02, "inox", 0.004)
    hb = gy0 + 0.02
    hd = gy1 - 0.05
    hood_h = 0.22
    pts = _hood_profile(hb, hd, hood_h)
    hood = prism("hood", [(y, h + 0.02 + z) for y, z in pts], "x", gx0 + 0.02, gx1 - 0.02, "inox", 0.004)
    for p in hood.data.polygons:
        p.use_smooth = True
    for xe in (gx0 + 0.015, gx1 - 0.025):
        prism("hood_cap", [(y, h + 0.02 + z) for y, z in pts], "x", xe, xe + 0.01, "graphite", 0.002)
    tube("hood_handle", (gx0 + 0.12, hd + 0.06, h + hood_h * 0.62), (gx1 - 0.12, hd + 0.06, h + hood_h * 0.62), 0.012, "inox", 16)
    for xh in (gx0 + 0.14, gx1 - 0.14):
        tube("handle_post", (xh, hd + 0.005, h + hood_h * 0.62), (xh, hd + 0.06, h + hood_h * 0.62), 0.008, "inox", 10)
    # Thermometer auf der Haube (Ziffernblatt schräg)
    bx("thermo", (gx0 + gx1) / 2 - 0.035, hd - 0.03, h + hood_h + 0.012, (gx0 + gx1) / 2 + 0.035, hd - 0.0, h + hood_h + 0.022, "graphite", 0.004)
    # Bedienknöpfe auf der Front
    for i in range(4):
        kx = gx0 + 0.15 + i * (gx1 - gx0 - 0.3) / 3
        tube("knob", (kx, gy1 + 0.075, h - 0.05), (kx, gy1 + 0.11, h - 0.05), 0.025, "rubber", 20)
        tube("knob_ring", (kx, gy1 + 0.074, h - 0.05), (kx, gy1 + 0.078, h - 0.05), 0.033, "inox", 20)
    # Fronten: Grillschrank (2 Türen), Spülenschrank (1 Tür), Schubladenblock (3) rechts
    fy = d / 2 - 0.04
    fz0, fz1 = plinth + 0.015, zt - 0.015

    def front(x0_, x1_, z0_, z1_, handle="h"):
        bx("front", x0_ + 0.003, fy, z0_ + 0.003, x1_ - 0.003, fy + 0.02, z1_ - 0.003, "inox_front", 0.002)
        if handle == "h":
            xm = (x0_ + x1_) / 2
            bx("pull", xm - 0.12, fy + 0.02, z1_ - 0.06, xm + 0.12, fy + 0.035, z1_ - 0.045, "anthracite", 0.004)
        elif handle in ("l", "r"):
            xh = x1_ - 0.05 if handle == "l" else x0_ + 0.05
            bx("pull", xh - 0.008, fy + 0.02, z1_ - 0.32, xh + 0.008, fy + 0.035, z1_ - 0.06, "anthracite", 0.004)

    # Grillschrank: oben Blende mit Knöpfen (das Bedienpanel), darunter zwei Türen
    gz1 = h - 0.13
    front(gx0, (gx0 + gx1) / 2, fz0, gz1, "l")
    front((gx0 + gx1) / 2, gx1, fz0, gz1, "r")
    front(-w / 2 + 0.02, gx0, fz0, fz1, None)
    # Gasflaschen-Lüftung: Schlitze
    for i in range(5):
        bx("vent", gx0 + 0.1, fy + 0.02, fz0 + 0.06 + i * 0.025, gx0 + 0.32, fy + 0.023, fz0 + 0.072 + i * 0.025, "mat_black")
    front(gx1, sx0 - 0.0, fz0, fz1, "r")
    front(sx0, sx1 + 0.08, fz0, fz1, "h")
    dx0 = sx1 + 0.08
    nz = 3
    for i in range(nz):
        z0_ = fz0 + (fz1 - fz0) * i / nz
        z1_ = fz0 + (fz1 - fz0) * (i + 1) / nz
        front(dx0, w / 2 - 0.02, z0_, z1_, "h")
    # Arbeitsfläche rechts: Schneidebrett, Kräutertopf, Ölflaschen
    bx("board", w / 2 - 0.75, -0.18, h, w / 2 - 0.35, 0.12, h + 0.025, "larch_oiled_x", 0.006)
    cyl("pot", w / 2 - 0.2, -0.2, h, h + 0.16, 0.085, "concrete_dark", 32, 0.004)
    cyl("pot_soil", w / 2 - 0.2, -0.2, h + 0.14, h + 0.15, 0.075, "soil", 24)
    r = rng(9)
    for _ in range(3):
        veg_clump("herb", P(w / 2 - 0.2 + r.uniform(-0.03, 0.03), -0.2 + r.uniform(-0.03, 0.03), h + 0.15), r, 1.1)
    for i, (bxp, byp) in enumerate(((w / 2 - 0.18, 0.05), (w / 2 - 0.12, 0.1))):
        cyl("bottle", bxp, byp, h, h + 0.2, 0.028, "window", 24)
        cyl("bottle_neck", bxp, byp, h + 0.2, h + 0.26, 0.011, "window", 16)
        cyl("bottle_cap", bxp, byp, h + 0.26, h + 0.275, 0.013, "inox" if i else "graphite", 16)


def _hood_profile(yb: float, yf: float, hh: float) -> list[tuple[float, float]]:
    """Querschnitt der Grillhaube (Plan-y, Höhe): vorn kurze Senkrechte, dann Bogen nach hinten bis zur Rückwand"""
    pts = [(yf, 0.0), (yf, 0.05)]
    k = 20
    for i in range(1, k + 1):
        a = math.pi / 2 * i / k
        # Viertelellipse: Mittelpunkt (yb, 0.05), Halbachsen (yf − yb) und (hh − 0.05)
        pts.append((yb + (yf - yb) * math.cos(a), 0.05 + (hh - 0.05) * math.sin(a)))
    pts.append((yb - 0.02, hh - 0.01))
    pts.append((yb - 0.02, 0.0))
    return pts


GENERATORS = {
    "carportFlat": carport_flat,
    "toolShedMono": tool_shed_mono,
    "bikeShelter": bike_shelter,
    "binStore2": bin_store,
    "barrelSauna": barrel_sauna,
    "chickenCoop": chicken_coop,
    "outdoorKitchen": outdoor_kitchen,
}
