"""
Generatoren für die Objektgruppen „Spielen“ und „Deko & Natur“.

Spielen: Sandkasten mit Bankdeckel, freistehende Rutsche, Fußballtor, Tischtennisplatte, Stelzenhaus.
Deko & Natur: Granit-Findling, Vogeltränke, Insektenhotel, Nistkasten am Pfahl, Cortenstahl-Skulptur,
großer bepflanzter Pflanzkübel aus Faserzement.

Konventionen wie in `items.py`: jede Funktion `name(w, d, h)` baut das Objekt in Plan-Metern um den
Ursprung (Breite w entlang x, Tiefe d entlang y – Plan-Süden = +y = zur Kamera hin, Höhe h).
Maße kommen aus `catalog_spiel.json`. Zusätzliche Materialien (Granit, Edelstahl, Netz …) werden hier
gebaut und in den Material-Cache von `lib` eingetragen, damit `box()`, `cylinder()` usw. sie finden.
"""
from __future__ import annotations

import math

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

import lib
from lib import P, _ao, _bump, _color_noise, _principled, box, cylinder, foliage_ball, foliage_carpet, link, mat, plate, rng

TAU = math.tau

# ------------------------------------------------------------------ Materialien


def _speckle(m, b, base_a, base_b, specks, scale: float, big: float = 3.0):
    """Gesprenkelter Stein (Granit, Terrazzo): großflächige Tönung + harte Körner aus Voronoi-Zellen"""
    nt = m.node_tree
    tc = nt.nodes.new("ShaderNodeTexCoord")
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = big
    nz.inputs["Detail"].default_value = 4
    r0 = nt.nodes.new("ShaderNodeValToRGB")
    r0.color_ramp.elements[0].color = (*base_a, 1)
    r0.color_ramp.elements[1].color = (*base_b, 1)
    nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
    nt.links.new(nz.outputs["Fac"], r0.inputs["Fac"])
    vor = nt.nodes.new("ShaderNodeTexVoronoi")
    vor.inputs["Scale"].default_value = scale
    nt.links.new(tc.outputs["Object"], vor.inputs["Vector"])
    r1 = nt.nodes.new("ShaderNodeValToRGB")
    r1.color_ramp.interpolation = "CONSTANT"
    els = r1.color_ramp.elements
    els[0].position = 0.0
    els[0].color = (*specks[0][1], 1)
    els[1].position = specks[1][0]
    els[1].color = (*specks[1][1], 1)
    for pos, col in specks[2:]:
        e = els.new(pos)
        e.color = (*col, 1)
    # Körner leicht verwaschen: Zellfarbe statt Zelle selbst
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(vor.outputs["Color"], sep.inputs["Color"])
    nt.links.new(sep.outputs[0], r1.inputs["Fac"])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 0.85
    nt.links.new(r0.outputs["Color"], mix.inputs["A"])
    nt.links.new(r1.outputs["Color"], mix.inputs["B"])
    return mix


def _moss(m, b, src, amount: float = 0.6):
    """Moos und Flechten auf nach oben gewandten Flächen (Geometrie-Normale), fleckig"""
    nt = m.node_tree
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(geo.outputs["Normal"], sep.inputs["Vector"])
    up = nt.nodes.new("ShaderNodeMapRange")
    up.inputs["From Min"].default_value = 0.55
    up.inputs["From Max"].default_value = 0.95
    nt.links.new(sep.outputs["Z"], up.inputs["Value"])
    tc = nt.nodes.new("ShaderNodeTexCoord")
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 5.5
    nz.inputs["Detail"].default_value = 8
    nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
    patch = nt.nodes.new("ShaderNodeMapRange")
    patch.inputs["From Min"].default_value = 0.5
    patch.inputs["From Max"].default_value = 0.62
    nt.links.new(nz.outputs["Fac"], patch.inputs["Value"])
    mul = nt.nodes.new("ShaderNodeMath")
    mul.operation = "MULTIPLY"
    nt.links.new(up.outputs["Result"], mul.inputs[0])
    nt.links.new(patch.outputs["Result"], mul.inputs[1])
    mul2 = nt.nodes.new("ShaderNodeMath")
    mul2.operation = "MULTIPLY"
    mul2.inputs[1].default_value = amount
    nt.links.new(mul.outputs[0], mul2.inputs[0])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    nt.links.new(mul2.outputs[0], mix.inputs["Factor"])
    nt.links.new(src, mix.inputs["A"])
    mix.inputs["B"].default_value = (0.06, 0.075, 0.025, 1)
    return mix


def _cm(kind: str) -> str:
    """Zusätzliche Materialien dieser Gruppe; landen im Cache von `lib.mat` und werden dort gefunden"""
    if kind in lib._mats:
        return kind
    m, b = _principled(kind)
    nt = m.node_tree
    if kind == "granite":  # grauer Granit: Feldspat hell/rötlich, Glimmer dunkel, leichte Moosflecken oben
        mix = _speckle(
            m, b, (0.2, 0.195, 0.185), (0.3, 0.29, 0.27),
            [(0.0, (0.25, 0.25, 0.26)), (0.22, (0.6, 0.6, 0.6)), (0.62, (1.0, 1.0, 1.0)), (0.86, (1.1, 0.95, 0.85)), (0.95, (0.12, 0.12, 0.13))],
            110,
        )
        moss = _moss(m, b, mix.outputs["Result"], 0.75)
        nt.links.new(moss.outputs["Result"], b.inputs["Base Color"])
        b.inputs["Roughness"].default_value = 0.82
        _bump(m, b, 28, 0.32)
    elif kind == "steel":  # Edelstahl gebürstet (Rutsche)
        b.inputs["Base Color"].default_value = (0.62, 0.62, 0.61, 1)
        b.inputs["Metallic"].default_value = 1.0
        b.inputs["Roughness"].default_value = 0.3
        b.inputs["Anisotropic"].default_value = 0.5
        _bump(m, b, 900, 0.03)
    elif kind == "white_coat":  # weiß pulverbeschichtetes Aluminium (Tor)
        _color_noise(m, b, (0.62, 0.62, 0.6), (0.7, 0.7, 0.68), 6)
        b.inputs["Roughness"].default_value = 0.4
    elif kind == "net_light":  # Tornetz, hellgrau
        b.inputs["Base Color"].default_value = (0.5, 0.5, 0.48, 1)
        b.inputs["Roughness"].default_value = 0.9
    elif kind == "net_dark":  # Tischtennisnetz
        b.inputs["Base Color"].default_value = (0.015, 0.015, 0.017, 1)
        b.inputs["Roughness"].default_value = 0.85
    elif kind == "tt_top":  # Outdoor-Platte: anthrazit, seidenmatt
        _color_noise(m, b, (0.028, 0.032, 0.036), (0.036, 0.04, 0.045), 3)
        b.inputs["Roughness"].default_value = 0.42
        b.inputs["Coat Weight"].default_value = 0.25
    elif kind == "line_white":
        b.inputs["Base Color"].default_value = (0.78, 0.78, 0.76, 1)
        b.inputs["Roughness"].default_value = 0.45
    elif kind == "bamboo":  # Bambus/Schilfrohr
        _color_noise(m, b, (0.27, 0.19, 0.08), (0.42, 0.32, 0.15), 30)
        b.inputs["Roughness"].default_value = 0.45
    elif kind == "straw":  # trockene Halme, Grasrispen
        _color_noise(m, b, (0.36, 0.28, 0.14), (0.52, 0.42, 0.24), 25)
        b.inputs["Roughness"].default_value = 0.8
    elif kind == "plume":  # Blütenstände Lampenputzergras
        _color_noise(m, b, (0.4, 0.33, 0.24), (0.55, 0.47, 0.36), 18)
        b.inputs["Roughness"].default_value = 0.95
        b.inputs["Sheen Weight"].default_value = 0.6
    elif kind == "endgrain":  # Hirnholz mit Jahresringen (um die Mitte der Scheibe)
        tc = nt.nodes.new("ShaderNodeTexCoord")
        sub = nt.nodes.new("ShaderNodeVectorMath")
        sub.operation = "SUBTRACT"
        sub.inputs[1].default_value = (0.5, 0.5, 0.5)
        nt.links.new(tc.outputs["Generated"], sub.inputs[0])
        sc = nt.nodes.new("ShaderNodeVectorMath")
        sc.operation = "MULTIPLY"
        sc.inputs[1].default_value = (1.0, 0.0, 1.0)
        nt.links.new(sub.outputs[0], sc.inputs[0])
        wave = nt.nodes.new("ShaderNodeTexWave")
        wave.wave_type = "RINGS"
        wave.inputs["Scale"].default_value = 6
        wave.inputs["Distortion"].default_value = 2
        nt.links.new(sc.outputs[0], wave.inputs["Vector"])
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = (0.2, 0.13, 0.07, 1)
        ramp.color_ramp.elements[1].color = (0.42, 0.31, 0.18, 1)
        nt.links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
        b.inputs["Roughness"].default_value = 0.85
    elif kind == "hole":  # tiefe Bohrungen, Einflugloch
        b.inputs["Base Color"].default_value = (0.006, 0.005, 0.004, 1)
        b.inputs["Roughness"].default_value = 1.0
    elif kind == "clay":  # Lochziegel, gedämpftes Ziegelrot
        _color_noise(m, b, (0.2, 0.08, 0.045), (0.3, 0.13, 0.07), 14)
        b.inputs["Roughness"].default_value = 0.9
        _bump(m, b, 90, 0.2)
    elif kind == "cone":  # Kiefernzapfen
        _color_noise(m, b, (0.08, 0.045, 0.02), (0.2, 0.12, 0.06), 40)
        b.inputs["Roughness"].default_value = 0.85
    elif kind == "bark_dark":  # Rindenstücke, Äste
        _color_noise(m, b, (0.05, 0.04, 0.03), (0.13, 0.1, 0.075), 30)
        b.inputs["Roughness"].default_value = 0.95
        _bump(m, b, 60, 0.5)
    elif kind == "plastic_sage":  # Sandeimer: gedämpftes Salbeigrün
        b.inputs["Base Color"].default_value = (0.13, 0.17, 0.12, 1)
        b.inputs["Roughness"].default_value = 0.4
    elif kind == "rubber_bat":  # Belag des Schlägers
        b.inputs["Base Color"].default_value = (0.25, 0.035, 0.03, 1)
        b.inputs["Roughness"].default_value = 0.55
    elif kind == "ball_white":
        b.inputs["Base Color"].default_value = (0.8, 0.79, 0.76, 1)
        b.inputs["Roughness"].default_value = 0.35
    elif kind == "sand_wet":  # Sandoberfläche mit feinen Spuren, etwas dunkler als lib.sand
        _color_noise(m, b, (0.36, 0.29, 0.18), (0.5, 0.41, 0.27), 9)
        b.inputs["Roughness"].default_value = 1.0
        _bump(m, b, 160, 0.35)
    elif kind == "fibrecement":  # Faserzement anthrazit, fein gefleckt
        _color_noise(m, b, (0.045, 0.045, 0.044), (0.075, 0.074, 0.07), 7)
        b.inputs["Roughness"].default_value = 0.72
        _bump(m, b, 180, 0.08)
    elif kind == "bark_mulch":  # Rindenmulch im Kübel
        mm = nt.nodes.new("ShaderNodeTexVoronoi")
        mm.inputs["Scale"].default_value = 60
        tc = nt.nodes.new("ShaderNodeTexCoord")
        nt.links.new(tc.outputs["Object"], mm.inputs["Vector"])
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = (0.03, 0.018, 0.01, 1)
        ramp.color_ramp.elements[1].color = (0.13, 0.075, 0.04, 1)
        nt.links.new(mm.outputs["Color"], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.8
        nt.links.new(mm.outputs["Distance"], bump.inputs["Height"])
        nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
        b.inputs["Roughness"].default_value = 0.95
    else:
        raise KeyError(kind)
    if kind not in {"hole", "steel"}:
        _ao(m, 0.7)
    lib._mats[kind] = m
    return kind


# ------------------------------------------------------------------ Geometrie-Helfer


def _obj(name: str, bm: bmesh.types.BMesh, material: str, smooth: bool = False, outline: bool = True) -> bpy.types.Object:
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me), outline)
    ob.data.materials.append(mat(material))
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    return ob


class _Batch:
    """Viele kleine Teile eines Materials in einem Mesh (Bambusröhrchen, Löcher, Sprossen …)"""

    def __init__(self, name: str, material: str, smooth: bool = True, outline: bool = True):
        self.name, self.material, self.smooth, self.outline = name, material, smooth, outline
        self.bm = bmesh.new()

    def rod(self, a: Vector, b: Vector, r: float, segs: int = 12, r2: float | None = None):
        """Zylinder (bzw. Kegelstumpf) von a nach b, Blender-Koordinaten"""
        d = b - a
        m = Matrix.Translation((a + b) / 2) @ d.normalized().to_track_quat("Z", "Y").to_matrix().to_4x4()
        bmesh.ops.create_cone(self.bm, cap_ends=True, segments=segs, radius1=r, radius2=r if r2 is None else r2, depth=d.length, matrix=m)

    def blob(self, c: Vector, r: float, scale=(1, 1, 1), sub: int = 2, jitter: float = 0.0, seed: int = 0, rot: Matrix | None = None):
        m = Matrix.Translation(c) @ (rot.to_4x4() if rot else Matrix.Identity(4)) @ Matrix.Diagonal((*scale, 1))
        vs = bmesh.ops.create_icosphere(self.bm, subdivisions=sub, radius=r, matrix=m)["verts"]
        if jitter:
            rr = rng(seed)
            for v in vs:
                v.co += (v.co - c).normalized() * rr.uniform(-jitter, jitter) * r

    def cube(self, x0, y0, z0, x1, y1, z1):
        m = Matrix.Translation(P((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)) @ Matrix.Diagonal((abs(x1 - x0), abs(y1 - y0), abs(z1 - z0), 1))
        bmesh.ops.create_cube(self.bm, size=1.0, matrix=m)

    def build(self, bevel: float = 0.0) -> bpy.types.Object | None:
        if not self.bm.verts:
            self.bm.free()
            return None
        ob = _obj(self.name, self.bm, self.material, self.smooth, self.outline)
        if bevel:
            mod = ob.modifiers.new("bevel", "BEVEL")
            mod.width = bevel
            mod.segments = 2
            mod.limit_method = "ANGLE"
        return ob


def _rod(name: str, a: Vector, b: Vector, r: float, material: str, segs: int = 16, outline: bool = True):
    bt = _Batch(name, material, True, outline)
    bt.rod(a, b, r, segs)
    return bt.build()


def _lathe(name: str, prof: list[tuple[float, float]], material: str, cx: float = 0.0, cy: float = 0.0, segs: int = 64, outline: bool = True):
    """Drehkörper aus Profil (Radius, Höhe), geglättet"""
    bm = bmesh.new()
    rings = []
    for i in range(segs):
        a = i / segs * TAU
        rings.append([bm.verts.new(P(cx + max(r, 1e-4) * math.cos(a), cy + max(r, 1e-4) * math.sin(a), z)) for r, z in prof])
    for i in range(segs):
        j = (i + 1) % segs
        for k in range(len(prof) - 1):
            bm.faces.new((rings[i][k], rings[j][k], rings[j][k + 1], rings[i][k + 1]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj(name, bm, material, True, outline)


def _plank(name: str, a: Vector, b: Vector, up: Vector, wdt: float, thk: float, material: str, bevel: float = 0.004):
    """Brett/Kantholz von a nach b (Blender), Breite `wdt` entlang `up`, Stärke `thk` quer dazu, mittig auf der Linie"""
    e = (b - a).normalized()
    s = (up - e * up.dot(e)).normalized()
    n = e.cross(s)
    o = a - s * (wdt / 2) - n * (thk / 2)
    ob = plate(name, o, e, s, n, (b - a).length, wdt, thk, material)
    if bevel:
        mod = ob.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = "ANGLE"
    return ob


def _net(name: str, rows: list[list[Vector]], material: str, thick: float = 0.006):
    """Netz aus einem Raster von Punkten (Zeilen gleicher Länge) als Drahtgitter"""
    bm = bmesh.new()
    vs = [[bm.verts.new(p) for p in row] for row in rows]
    for i in range(len(vs) - 1):
        for j in range(len(vs[i]) - 1):
            bm.faces.new((vs[i][j], vs[i][j + 1], vs[i + 1][j + 1], vs[i + 1][j]))
    ob = _obj(name, bm, material, False, outline=False)
    wf = ob.modifiers.new("wire", "WIREFRAME")
    wf.thickness = thick
    wf.use_boundary = True
    wf.use_even_offset = False
    return ob


def _rock(name: str, cx: float, cy: float, sx: float, sy: float, sz: float, seed: int, material: str):
    """Findling: verrauschte Kugel mit wenigen gebrochenen Flächen, flache Unterseite auf z = 0, Höhe sz"""
    r = rng(seed)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=5, radius=1)
    off = Vector((r.uniform(0, 50), r.uniform(0, 50), r.uniform(0, 50)))
    # gebrochene Flächen: Ebenen, an denen der Stein „abgeschlagen“ ist (eher seitlich und oben)
    cuts = []
    for _ in range(5):
        a = r.uniform(0, TAU)
        el = r.uniform(-0.1, 0.9)
        nrm = Vector((math.cos(a) * math.cos(el), math.sin(a) * math.cos(el), math.sin(el)))
        cuts.append((nrm, r.uniform(0.8, 0.9)))
    for v in bm.verts:
        d = v.co.normalized()
        k = 1 + 0.2 * noise.fractal(d * 1.1 + off, 0.75, 2.0, 3) + 0.035 * noise.noise(d * 6 + off)
        p = Vector((d.x * k, d.y * k, d.z * k))
        for nrm, dist in cuts:
            ex = p.dot(nrm) - dist
            if ex > 0:
                p -= nrm * ex * 0.92
        v.co = p
    # nach unten abgeflacht: Unterseite liegt im Boden
    zs = [v.co.z for v in bm.verts]
    zb = min(zs) + (max(zs) - min(zs)) * 0.3
    for v in bm.verts:
        if v.co.z < zb:
            v.co.z = zb - (zb - v.co.z) * 0.08
    xs = [v.co.x for v in bm.verts]
    ys = [v.co.y for v in bm.verts]
    zs = [v.co.z for v in bm.verts]
    kx, ky, kz = 2 * sx / (max(xs) - min(xs)), 2 * sy / (max(ys) - min(ys)), sz / (max(zs) - min(zs))
    mx, my, mz = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2, min(zs)
    c = P(cx, cy, 0)
    for v in bm.verts:
        v.co = Vector(((v.co.x - mx) * kx + c.x, (v.co.y - my) * ky + c.y, (v.co.z - mz) * kz))
    ob = _obj(name, bm, material, True)
    ob.data.polygons.foreach_set("use_smooth", [True] * len(ob.data.polygons))
    return ob


def _grass(name: str, cx: float, cy: float, z: float, height: float, spread: float, n: int, seed: int, material: str, width: float = 0.009, plumes: int = 0):
    """Horstgras (z. B. Lampenputzergras): überhängende Halme aus der Mitte, optional Blütenstände"""
    r = rng(seed)
    bm = bmesh.new()
    tips = []
    for _ in range(n):
        a = r.uniform(0, TAU)
        L = height * r.uniform(0.75, 1.25)
        tilt0 = r.uniform(0.05, 0.55) * spread  # Startneigung aus der Senkrechten
        bend = r.uniform(0.5, 1.4) * spread  # zusätzliche Biegung bis zur Spitze
        hx, hy = math.cos(a), math.sin(a)
        rad0 = r.uniform(0.0, 0.05)
        pos = Vector((cx + hx * rad0, cy + hy * rad0, z))
        segs = 7
        wd = width * r.uniform(0.7, 1.3)
        twist = r.uniform(-0.6, 0.6)
        pts = []
        for i in range(segs + 1):
            t = i / segs
            pts.append(pos.copy())
            th = tilt0 + bend * t * t
            step = L / segs
            pos = pos + Vector((hx * math.sin(th) * step, hy * math.sin(th) * step, math.cos(th) * step))
        prev = None
        for i, p in enumerate(pts):
            t = i / segs
            side = Vector((-hy, hx, 0)) * math.cos(twist * t) + Vector((0, 0, 1)) * math.sin(twist * t) * 0.3
            w_ = wd * (1 - t * 0.92)
            a_ = bm.verts.new(P(p.x, p.y, p.z) + Vector((side.x, -side.y, side.z)) * w_)
            b_ = bm.verts.new(P(p.x, p.y, p.z) - Vector((side.x, -side.y, side.z)) * w_)
            if prev:
                bm.faces.new((prev[0], prev[1], b_, a_))
            prev = (a_, b_)
        tips.append((pts[-3], pts[-1], L))
    ob = _obj(name, bm, material, True, outline=False)
    if plumes:
        bt = _Batch(name + "_plume", _cm("plume"), True, False)
        stems = _Batch(name + "_stem", _cm("straw"), True, False)
        for _ in range(plumes):
            a = r.uniform(0, TAU)
            tilt = r.uniform(0.15, 0.75) * spread
            L = height * r.uniform(1.0, 1.35)
            base = P(cx + math.cos(a) * 0.03, cy + math.sin(a) * 0.03, z)
            dvec = Vector((math.cos(a) * math.sin(tilt), -math.sin(a) * math.sin(tilt), math.cos(tilt)))
            top = base + dvec * L
            stems.rod(base, top, 0.0025, 5)
            # Ähre: gestrecktes Ellipsoid entlang der Halmrichtung, leicht nickend
            q = dvec.to_track_quat("Z", "Y").to_matrix()
            bt.blob(top + dvec * 0.06, 0.022, (1, 1, 4.2), 2, 0.25, r.randint(1, 999), q)
        bt.build()
        stems.build()
    return ob


# ------------------------------------------------------------------ Spielen


def sandbox(w: float, d: float, h: float):
    """Sandkasten aus Lärche: Bohlenrahmen, umlaufende Sitzkante, Deckel als Bank mit Lehne (Nordseite), Sand mit Spuren"""
    t = 0.045  # Bohlenstärke
    bh = (h - 0.03) / 2
    # zwei Bohlen je Seite, an den Ecken überlappend
    for k in range(2):
        z0 = k * bh
        box("plank_n", -w / 2, -d / 2, z0 + 0.003, w / 2, -d / 2 + t, z0 + bh - 0.003, "wood_natural", 0.005)
        box("plank_s", -w / 2, d / 2 - t, z0 + 0.003, w / 2, d / 2, z0 + bh - 0.003, "wood_natural", 0.005)
        box("plank_w", -w / 2 + 0.002, -d / 2 + t, z0 + 0.003, -w / 2 + t, d / 2 - t, z0 + bh - 0.003, "wood_natural", 0.005)
        box("plank_e", w / 2 - t, -d / 2 + t, z0 + 0.003, w / 2 - 0.002, d / 2 - t, z0 + bh - 0.003, "wood_natural", 0.005)
    for sx in (-1, 1):
        for sy in (-1, 1):
            x = sx * (w / 2 - t) - (0.07 if sx > 0 else 0)
            y = sy * (d / 2 - t) - (0.07 if sy > 0 else 0)
            box("corner", x, y, 0, x + 0.07, y + 0.07, h - 0.03, "wood_natural", 0.004)
    # Sitzkante: 4 Bretter 16 cm, Gehrung angedeutet durch Fuge
    s = 0.16
    zc0, zc1 = h - 0.03, h
    box("seat_s", -w / 2 - 0.01, d / 2 - s, zc0, w / 2 + 0.01, d / 2 + 0.01, zc1, "wood_natural", 0.006)
    box("seat_w", -w / 2 - 0.01, -d / 2 + s + 0.006, zc0, -w / 2 + s, d / 2 - s - 0.006, zc1, "wood_natural", 0.006)
    box("seat_e", w / 2 - s, -d / 2 + s + 0.006, zc0, w / 2 + 0.01, d / 2 - s - 0.006, zc1, "wood_natural", 0.006)
    box("seat_n", -w / 2 - 0.01, -d / 2 - 0.01, zc0, w / 2 + 0.01, -d / 2 + s, zc1, "wood_natural", 0.006)
    # Eckbänke (Dreieck) an den südlichen Ecken
    for sx in (-1, 1):
        x0 = sx * (w / 2 - s)
        x1 = sx * (w / 2 - s - 0.32)
        y0 = d / 2 - s
        y1 = d / 2 - s - 0.32
        bm = bmesh.new()
        pts = [P(x0, y0, zc0), P(x1, y0, zc0), P(x0, y1, zc0)]
        bot = [bm.verts.new(p) for p in pts]
        top = [bm.verts.new(p + Vector((0, 0, 0.03))) for p in pts]
        bm.faces.new(bot)
        bm.faces.new(top)
        for i in range(3):
            bm.faces.new((bot[i], bot[(i + 1) % 3], top[(i + 1) % 3], top[i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        _obj("cornerseat", bm, "wood_natural")
    # Bankdeckel: Sitzfläche aus Latten über der Nordkante, Lehne schräg nach hinten
    lat = 0.09
    gap = 0.012
    yb = -d / 2 + s + 0.02
    for i in range(3):
        y0 = yb + i * (lat + gap)
        box("bench_slat", -w / 2 + s + 0.04, y0, zc1 + 0.025, w / 2 - s - 0.04, y0 + lat, zc1 + 0.05, "wood_natural", 0.004)
    for x in (-w / 2 + s + 0.08, 0.0, w / 2 - s - 0.12):
        box("bench_batten", x, yb, zc1, x + 0.04, yb + 3 * lat + 2 * gap, zc1 + 0.025, "wood_natural", 0.003)
    a = math.radians(14)
    e = Vector((1, 0, 0))
    up = Vector((0, math.sin(a), math.cos(a)))  # Lehne nach Plan-Norden geneigt (Blender +y)
    nrm = e.cross(up)
    for i in range(3):
        o = P(-w / 2 + s + 0.04, -d / 2 + s - 0.01, zc1 + 0.05) + up * (0.02 + i * (lat + gap))
        plate("back_slat", o, e, up, nrm, w - 2 * s - 0.08, lat, 0.025, "wood_natural")
    # Sand: welliger Spiegel mit Hügel und Mulde, ein Eimer und eine Schaufel
    zs = h - 0.12
    nx = 48
    bm = bmesh.new()
    x0, x1 = -w / 2 + t, w / 2 - t
    y0, y1 = -d / 2 + t, d / 2 - t
    grid = []
    rr = rng(31)
    off = Vector((rr.uniform(0, 9), rr.uniform(0, 9), 0))
    for j in range(nx + 1):
        row = []
        for i in range(nx + 1):
            x = x0 + (x1 - x0) * i / nx
            y = y0 + (y1 - y0) * j / nx
            zz = zs + 0.02 * noise.noise(Vector((x * 2.2, y * 2.2, 0)) + off) + 0.006 * noise.noise(Vector((x * 9, y * 9, 1)) + off)
            zz += 0.11 * math.exp(-((x - 0.35) ** 2 + (y - 0.25) ** 2) / 0.09)  # Sandburg-Hügel
            zz -= 0.05 * math.exp(-((x + 0.3) ** 2 + (y - 0.1) ** 2) / 0.03)  # gegrabene Mulde
            row.append(bm.verts.new(P(x, y, zz)))
        grid.append(row)
    for j in range(nx):
        for i in range(nx):
            bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    _obj("sand", bm, _cm("sand_wet"), True, outline=False)
    # Eimer (Kegelstumpf, offen) und Schaufel
    _lathe("bucket", [(0.06, zs + 0.005), (0.085, zs + 0.15), (0.09, zs + 0.155), (0.08, zs + 0.15), (0.055, zs + 0.03)], _cm("plastic_sage"), -0.55, 0.35, 32)
    _rod("handle", P(-0.64, 0.35, zs + 0.155), P(-0.55, 0.35, zs + 0.23), 0.004, "graphite", 6)
    _rod("handle", P(-0.55, 0.35, zs + 0.23), P(-0.46, 0.35, zs + 0.155), 0.004, "graphite", 6)
    _plank("spade", P(0.1, 0.55, zs + 0.03), P(0.32, 0.47, zs + 0.06), Vector((0, 1, 0)), 0.02, 0.012, _cm("plastic_sage"), 0.003)
    _plank("spade_blade", P(0.3, 0.475, zs + 0.055), P(0.42, 0.44, zs + 0.07), Vector((0, 1, 0)), 0.09, 0.006, _cm("plastic_sage"), 0.003)


def slide_tower(w: float, d: float, h: float):
    """Freistehende Rutsche: Podest aus Lärche mit HPL-Wangen (anthrazit), Leiter nach Westen, Edelstahl-Rutsche nach Osten"""
    deck = 1.2
    px0, px1 = -w / 2 + 0.62, -w / 2 + 1.22  # Podest
    py = 0.32
    pt = 0.09
    for x in (px0, px1 - pt):
        for y in (-py - pt / 2, py - pt / 2):
            box("post", x, y, 0, x + pt, y + pt, h, "wood_natural", 0.006)
            box("cap", x - 0.005, y - 0.005, h, x + pt + 0.005, y + pt + 0.005, h + 0.015, "graphite", 0.003)
    box("deck", px0, -py - pt / 2, deck - 0.05, px1, py + pt / 2, deck, "wood_natural", 0.004)
    box("deck_beam_n", px0, -py - pt / 2 - 0.035, deck - 0.17, px1, -py - pt / 2, deck, "wood_natural", 0.004)
    box("deck_beam_s", px0, py + pt / 2, deck - 0.17, px1, py + pt / 2 + 0.035, deck, "wood_natural", 0.004)
    # Wangen aus anthrazit HPL mit runder Sichtöffnung (Bullauge)
    for sy in (-1, 1):
        y = sy * (py + pt / 2)
        y0, y1 = (y - 0.02, y) if sy < 0 else (y, y + 0.02)
        pan = box("panel", px0 + pt, y0, deck + 0.05, px1 - pt, y1, h - 0.08, "graphite", 0.004)
        hole = cylinder("porthole", 0, 0, -0.05, 0.05, 0.11, "graphite", 32)
        hole.rotation_euler = (math.pi / 2, 0, 0)
        hole.location = P((px0 + px1) / 2, y, (deck + h) / 2 - 0.02)
        hole.hide_render = True
        mod = pan.modifiers.new("cut", "BOOLEAN")
        mod.object = hole
        mod.operation = "DIFFERENCE"
        pan.modifiers.move(pan.modifiers.find("cut"), 0)
        box("panel_rail", px0, y0 - (0.02 if sy < 0 else 0), h - 0.08, px1, y1 + (0.02 if sy > 0 else 0), h - 0.03, "wood_natural", 0.004)
    # Haltegriff über dem Rutscheneinstieg
    _rod("grip", P(px1 - 0.03, -0.27, h - 0.25), P(px1 - 0.03, 0.27, h - 0.25), 0.017, "anthracite", 16)
    # Leiter: zwei Wangen, Stufen aus Brettern
    lx0, lx1 = -w / 2 + 0.02, px0
    for sy in (-1, 1):
        y = sy * 0.26
        _plank("stringer", P(lx0, y, 0), P(lx1, y, deck), Vector((-1, 0, 0.5)), 0.1, 0.04, "wood_natural")
        # Handlauf aus Edelstahl bis über das Podest
        _rod("handrail", P(lx0 + 0.18, y + sy * 0.03, 0.55), P(lx1 + 0.02, y + sy * 0.03, deck + 0.45), 0.015, _cm("steel"), 16)
        _rod("handrail_end", P(lx1 + 0.02, y + sy * 0.03, deck + 0.45), P(lx1 + 0.02, y + sy * 0.03, deck), 0.015, _cm("steel"), 16)
    for i in range(1, 5):
        z = deck * i / 5
        x = lx0 + (lx1 - lx0) * i / 5
        box("step", x - 0.07, -0.24, z - 0.03, x + 0.07, 0.24, z, "wood_natural", 0.004)
    # Rutsche: U-Profil entlang einer weichen Bahn
    xs, xe = px1, w / 2 - 0.02
    zt, ze = deck, 0.3

    def zf(x: float) -> float:
        a0, a1 = xs + 0.12, xe - 0.32
        if x <= a0:
            return zt
        if x >= a1:
            return ze
        t_ = (x - a0) / (a1 - a0)
        return zt + (ze - zt) * t_ * t_ * (3 - 2 * t_)

    n = 72
    path = []
    for i in range(n + 1):
        x = xs + (xe - xs) * i / n
        path.append((x, zf(x)))
    hw, wall = 0.24, 0.17
    sec = [(-hw - 0.05, wall), (-hw, wall), (-hw, 0.04), (-hw + 0.04, 0.0), (hw - 0.04, 0.0), (hw, 0.04), (hw, wall), (hw + 0.05, wall)]
    bm = bmesh.new()
    rows = []
    for i, (x, z) in enumerate(path):
        xa, za = path[max(0, i - 1)]
        xb, zb = path[min(n, i + 1)]
        tg = Vector((xb - xa, 0, zb - za)).normalized()
        nr = Vector((-tg.z, 0, tg.x))  # nach oben
        rows.append([bm.verts.new(P(x, 0, z) + Vector((0, -sy_, 0)) + Vector((nr.x, 0, nr.z)) * sz_) for sy_, sz_ in sec])
    for i in range(n):
        for k in range(len(sec) - 1):
            bm.faces.new((rows[i][k], rows[i][k + 1], rows[i + 1][k + 1], rows[i + 1][k]))
    ob = _obj("chute", bm, _cm("steel"), True)
    sol = ob.modifiers.new("t", "SOLIDIFY")
    sol.thickness = 0.012
    sol.offset = -1
    # Stütze am Auslauf
    for sy in (-1, 1):
        box("foot", xe - 0.3, sy * 0.2 - 0.025, 0, xe - 0.25, sy * 0.2 + 0.025, ze, "anthracite", 0.004)
    box("foot_bar", xe - 0.31, -0.24, ze - 0.06, xe - 0.24, 0.24, ze - 0.01, "anthracite", 0.004)


def soccer_goal(w: float, d: float, h: float):
    """Fußballtor (Alu, weiß beschichtet): Pfosten und Latte rund, schräge Netzbügel, Bodenrahmen, Netz hellgrau"""
    r = 0.04
    yf = d / 2 - r  # Torlinie vorn (Plan-Süden, zur Kamera)
    yb = -d / 2 + 0.03  # Bodenrahmen hinten
    ytop = yf - 0.35  # Ende der oberen Netzstangen
    zt = h - r
    x0, x1 = -w / 2 + r, w / 2 - r
    wc = _cm("white_coat")
    for x in (x0, x1):
        _rod("post", P(x, yf, 0), P(x, yf, zt + r), r, wc, 24)
        _rod("topbar", P(x, yf, zt), P(x, ytop, zt), 0.02, wc, 12)
        _rod("stay", P(x, ytop, zt), P(x, yb, 0.03), 0.02, wc, 12)
        _rod("groundbar", P(x, yf, 0.025), P(x, yb, 0.025), 0.025, wc, 12)
    _rod("crossbar", P(x0 - r, yf, zt), P(x1 + r, yf, zt), r, wc, 24)
    _rod("backbar", P(x0, yb, 0.025), P(x1, yb, 0.025), 0.025, wc, 12)
    _rod("topback", P(x0, ytop, zt), P(x1, ytop, zt), 0.02, wc, 12)
    # Netz: Dach, schräge Rückwand, Seiten – Maschen ~10 cm, leicht durchhängend
    mesh = 0.1
    net = _cm("net_light")
    nx = max(2, round((x1 - x0) / mesh))

    def sag(u: float, v: float) -> float:
        return math.sin(u * math.pi) * math.sin(v * math.pi)

    rows = []
    ny = max(2, round((yf - ytop) / mesh))
    for j in range(ny + 1):
        y = yf - (yf - ytop) * j / ny
        rows.append([P(x0 + (x1 - x0) * i / nx, y, zt - 0.06 * sag(i / nx, j / ny)) for i in range(nx + 1)])
    _net("net_roof", rows, net)
    L = math.hypot(ytop - yb, zt)
    nv = max(2, round(L / mesh))
    rows = []
    for j in range(nv + 1):
        v = j / nv
        y = ytop + (yb - ytop) * v
        z = zt + (0.03 - zt) * v
        rows.append([P(x0 + (x1 - x0) * i / nx, y + 0.08 * sag(i / nx, v), z) for i in range(nx + 1)])
    _net("net_back", rows, net)
    for x, sx in ((x0, -1), (x1, 1)):
        rows = []
        nz = max(2, round(zt / mesh))
        for j in range(nz + 1):
            v = j / nz
            z = zt * v
            # Hinterkante: Bodenrahmen bis zum Bügel
            yback = yb + (ytop - yb) * v
            nu = max(2, round((yf - yb) / mesh))
            rows.append([P(x - sx * 0.04 * sag(i / nu, v), yf + (yback - yf) * i / nu, max(0.03, z)) for i in range(nu + 1)])
        _net("net_side", rows, net)


def ping_pong(w: float, d: float, h: float):
    """Outdoor-Tischtennisplatte: anthrazit Platte mit weißen Linien, Stahlrahmen, Netz; Schläger und Ball"""
    tt = _cm("tt_top")
    lw = _cm("line_white")
    zt = h
    box("top", -w / 2, -d / 2, zt - 0.025, w / 2, d / 2, zt, tt, 0.004)
    # umlaufender Kantenschutz aus Stahl
    box("edge", -w / 2 - 0.012, -d / 2 - 0.012, zt - 0.06, w / 2 + 0.012, d / 2 + 0.012, zt - 0.02, "anthracite", 0.004)
    # Linien: 2 cm Rand, 3 mm Mittellinie
    zl0, zl1 = zt, zt + 0.0015
    box("line_n", -w / 2, -d / 2, zl0, w / 2, -d / 2 + 0.02, zl1, lw)
    box("line_s", -w / 2, d / 2 - 0.02, zl0, w / 2, d / 2, zl1, lw)
    box("line_w", -w / 2, -d / 2, zl0, -w / 2 + 0.02, d / 2, zl1, lw)
    box("line_e", w / 2 - 0.02, -d / 2, zl0, w / 2, d / 2, zl1, lw)
    box("line_c", -w / 2, -0.002, zl0, w / 2, 0.002, zl1, lw)
    # Untergestell: zwei Beinpaare mit Querrohr, Mittelträger
    for x in (-w / 2 + 0.35, w / 2 - 0.4):
        for y in (-d / 2 + 0.12, d / 2 - 0.17):
            box("leg", x, y, 0.02, x + 0.05, y + 0.05, zt - 0.06, "anthracite", 0.005)
            box("foot", x - 0.02, y - 0.02, 0, x + 0.07, y + 0.07, 0.025, "graphite", 0.004)
        box("legbar", x, -d / 2 + 0.12, 0.18, x + 0.05, d / 2 - 0.12, 0.23, "anthracite", 0.005)
        box("apron", x - 0.02, -d / 2 + 0.06, zt - 0.11, x + 0.07, d / 2 - 0.06, zt - 0.06, "anthracite", 0.005)
    box("spine", -w / 2 + 0.35, -0.04, zt - 0.11, w / 2 - 0.35, 0.04, zt - 0.06, "anthracite", 0.005)
    # Netz mit Pfosten
    nh = 0.1525
    ny = d / 2 + 0.06
    for sy in (-1, 1):
        y = sy * ny
        box("netpost", -0.015, y - 0.015, zt - 0.06, 0.015, y + 0.015, zt + nh, "anthracite", 0.003)
        box("clamp", -0.03, y - (0.08 if sy > 0 else -0.04) - 0.02, zt - 0.05, 0.03, y + (0.02 if sy > 0 else 0.08 - 0.02), zt + 0.004, "anthracite", 0.003)
    rows = []
    nz = 9
    nyc = 92
    for j in range(nz + 1):
        z = zt + 0.004 + (nh - 0.022) * j / nz
        rows.append([P(0, -ny + 2 * ny * i / nyc, z) for i in range(nyc + 1)])
    _net("net", rows, _cm("net_dark"), 0.0018)
    box("tape", -0.003, -ny, zt + nh - 0.018, 0.003, ny, zt + nh, lw)
    # Schläger und Ball auf der Platte
    for (cx, cy, ang, side) in ((-0.75, 0.25, 0.5, 1), (0.9, -0.3, 2.6, -1)):
        bt = _Batch("bat", _cm("rubber_bat"), True)
        bt.blob(P(0, 0, 0), 0.08, (1.0, 0.93, 0.07), 3)
        ob = bt.build()
        ob.rotation_euler = (0, 0, ang)
        ob.location = P(cx, cy, zt + 0.007)
        hd = box("bat_handle", -0.01 - 0.15, -0.015, zt + 0.002, 0.0 - 0.07, 0.015, zt + 0.024, "wood_light", 0.006)
        hd.data.transform(Matrix.Rotation(ang, 4, "Z"))
        hd.location = P(cx, cy, 0) + Vector((0, 0, 0))
        _ = side
    bt = _Batch("ball", _cm("ball_white"), True)
    bt.blob(P(0.35, 0.42, zt + 0.02), 0.02, (1, 1, 1), 3)
    bt.build()


def stilt_house(w: float, d: float, h: float):
    """Stelzenhaus: Podest auf vier Pfosten, Häuschen mit vergrauter Lärchenschalung, Stehfalzdach anthrazit, Leiter und Geländer"""
    zd = 1.4  # Podesthöhe (Oberkante Belag)
    pw = 0.12
    x0, x1 = -w / 2, w / 2
    y0, y1 = -d / 2, d / 2 - 0.55  # Podest; vor dem Podest steht die Leiter
    # Pfosten und Kopfbänder
    posts = [(x0 + 0.1, y0 + 0.1), (x1 - 0.1 - pw, y0 + 0.1), (x0 + 0.1, y1 - 0.1 - pw), (x1 - 0.1 - pw, y1 - 0.1 - pw)]
    for (px, py) in posts:
        box("post", px, py, 0, px + pw, py + pw, zd + 1.05 if py > 0 else zd, "wood_natural", 0.008)
        box("footing", px - 0.03, py - 0.03, 0, px + pw + 0.03, py + pw + 0.03, 0.08, "concrete", 0.006)
    for (px, py) in posts:
        cx, cy = px + pw / 2, py + pw / 2
        sx = 1 if cx < 0 else -1
        _plank("brace", P(cx + sx * 0.06, cy, zd - 0.75), P(cx + sx * 0.6, cy, zd - 0.2), Vector((0, 1, 0)), 0.04, 0.09, "wood_natural")
    box("beam_n", x0, y0 + 0.08, zd - 0.24, x1, y0 + 0.24, zd - 0.05, "wood_natural", 0.006)
    box("beam_s", x0, y1 - 0.24, zd - 0.24, x1, y1 - 0.08, zd - 0.05, "wood_natural", 0.006)
    box("deck", x0, y0, zd - 0.05, x1, y1, zd, "wood_natural", 0.004)
    box("deck_edge", x0 - 0.01, y1 - 0.03, zd - 0.12, x1 + 0.01, y1, zd - 0.01, "wood_natural", 0.004)
    # Häuschen (Norden), Eingang nach Süden
    hx0, hx1 = x0 + 0.2, x1 - 0.55
    hy0, hy1 = y0 + 0.15, y0 + 1.35
    zw = zd + 1.15
    box("hut", hx0, hy0, zd, hx1, hy1, zw, "wood_grey")
    zr = h
    # Giebel (Dreiecke) an West und Ost, First entlang y? → First entlang x, Giebel an West/Ost
    yc = (hy0 + hy1) / 2
    for x in (hx0, hx1):
        bm = bmesh.new()
        tri = [P(x, hy0, zw), P(x, hy1, zw), P(x, yc, zr - 0.12)]
        a = [bm.verts.new(p) for p in tri]
        b_ = [bm.verts.new(p + Vector((0.04 if x == hx1 else -0.0, 0, 0)) - Vector((0.04 if x == hx0 else 0.0, 0, 0)) * 0) for p in tri]
        bm.faces.new(a)
        _ = b_
        _obj("gable", bm, "wood_grey")
    # Tür (Öffnung dunkel) und Fenster mit anthrazit Rahmen
    dx0, dx1 = hx0 + 0.18, hx0 + 0.78
    box("door_frame", dx0 - 0.05, hy1, zd, dx1 + 0.05, hy1 + 0.03, zd + 1.0, "anthracite", 0.004)
    box("door", dx0, hy1 + 0.005, zd, dx1, hy1 + 0.035, zd + 0.95, _cm("hole"))
    wx0, wx1 = hx1 - 0.48, hx1 - 0.12
    box("win_frame", wx0 - 0.04, hy1, zd + 0.42, wx1 + 0.04, hy1 + 0.03, zd + 0.88, "anthracite", 0.004)
    box("win", wx0, hy1 + 0.005, zd + 0.46, wx1, hy1 + 0.035, zd + 0.84, "window")
    box("win_e_frame", hx1, yc - 0.25, zd + 0.42, hx1 + 0.03, yc + 0.25, zd + 0.88, "anthracite", 0.004)
    box("win_e", hx1 + 0.005, yc - 0.21, zd + 0.46, hx1 + 0.035, yc + 0.21, zd + 0.84, "window")
    # Stehfalzdach: zwei Flächen, First entlang x, Falze im Abstand von 25 cm
    ov = 0.2
    ry0, ry1 = hy0 - ov, hy1 + ov
    slope = (zr - 0.12 - zw) / (yc - hy0)
    for sy in (-1, 1):
        ye = ry1 if sy > 0 else ry0
        ze = zr - 0.12 - slope * abs(ye - yc)
        a_ = P(hx0 - ov, yc, zr - 0.05)
        b_ = P(hx0 - ov, ye, ze + 0.07)
        e = Vector((1, 0, 0))
        s = (b_ - a_).normalized()
        nrm = e.cross(s)
        if nrm.z < 0:
            nrm = -nrm
        L = (b_ - a_).length
        span = hx1 - hx0 + 2 * ov
        plate("roof", a_, e, s, nrm, span, L, 0.025, "anthracite")
        k = 0.12
        while k < span - 0.05:
            plate("seam", a_ + e * k + nrm * 0.024, e, s, nrm, 0.012, L, 0.028, "graphite")
            k += 0.25
        plate("fascia", b_ - nrm * 0.05, e, nrm, -s, span, 0.08, 0.02, "anthracite")
    _rod("ridge", P(hx0 - ov - 0.01, yc, zr - 0.02), P(hx1 + ov + 0.01, yc, zr - 0.02), 0.035, "graphite", 16)
    # Geländer: Pfosten + waagrechte Lärchenlatten an Ost- und Südkante, Lücke für die Leiter
    lx0, lx1 = x1 - 0.95, x1 - 0.45  # Leiteröffnung im Süden
    rails = [
        ((x1 - 0.05, y0 + 0.05), (x1 - 0.05, y1 - 0.05)),
        ((x0 + 0.05, y1 - 0.05), (lx0, y1 - 0.05)),
        ((lx1, y1 - 0.05), (x1 - 0.05, y1 - 0.05)),
        ((x0 + 0.05, hy1 + 0.02), (x0 + 0.05, y1 - 0.05)),
    ]
    for (ax, ay), (bx, by) in rails:
        for zz in (0.3, 0.55, 0.8):
            if ax == bx:
                box("rail", ax - 0.022, ay, zd + zz, ax + 0.022, by, zd + zz + 0.09, "wood_natural", 0.004)
            else:
                box("rail", ax, ay - 0.022, zd + zz, bx, ay + 0.022, zd + zz + 0.09, "wood_natural", 0.004)
        for (qx, qy) in ((ax, ay), (bx, by)):
            box("rpost", qx - 0.04, qy - 0.04, zd, qx + 0.04, qy + 0.04, zd + 0.95, "wood_natural", 0.005)
        box("handrail", min(ax, bx) - 0.045, min(ay, by) - 0.045, zd + 0.95, max(ax, bx) + 0.045, max(ay, by) + 0.045, zd + 0.98, "wood_natural", 0.004)
    # Leiter nach Süden, steil
    for x in (lx0 + 0.02, lx1 - 0.06):
        _plank("ladder", P(x + 0.02, d / 2 - 0.03, 0), P(x + 0.02, y1 - 0.02, zd + 0.05), Vector((0, -1, 0.3)), 0.09, 0.04, "wood_natural")
    for i in range(1, 6):
        z = zd * i / 6
        y = d / 2 - 0.03 - (d / 2 - y1 - 0.01) * i / 6
        box("rung", lx0 + 0.06, y - 0.06, z - 0.025, lx1 - 0.06, y + 0.06, z + 0.01, "wood_natural", 0.004)
    # Schaukelseil? Nein – Kletterseil mit Knoten unter dem Podest an der Westseite
    _rod("rope", P(x0 + 0.5, y1 - 0.4, zd - 0.24), P(x0 + 0.5, y1 - 0.4, 0.25), 0.014, "fabric_light", 10)
    for z in (0.35, 0.65, 0.95):
        bt = _Batch("knot", "fabric_light", True)
        bt.blob(P(x0 + 0.5, y1 - 0.4, z), 0.035, (1, 1, 0.8), 2)
        bt.build()


# ------------------------------------------------------------------ Deko & Natur


def granite_boulder(w: float, d: float, h: float):
    """Einzelner Granit-Findling: hellgrau gesprenkelt, abgerundet mit einzelnen Bruchflächen, Moos auf der Oberseite"""
    _rock("granite", 0, 0, w / 2, d / 2, h, 41, _cm("granite"))


def bird_bath(w: float, d: float, h: float):
    """Vogeltränke: Betonsäule mit flacher Schale, Wasser, ein paar Kiesel als Landeplatz"""
    box("plinth", -0.16, -0.16, 0, 0.16, 0.16, 0.05, "concrete_dark", 0.006)
    box("column", -0.11, -0.11, 0.05, 0.11, 0.11, h - 0.11, "concrete", 0.008)
    R = min(w, d) / 2
    _lathe("bowl", [(0.0, h - 0.12), (0.13, h - 0.12), (R - 0.04, h - 0.07), (R - 0.005, h - 0.03), (R, h - 0.012), (R - 0.008, h), (R - 0.03, h - 0.002), (R - 0.08, h - 0.03), (0.12, h - 0.055), (0.0, h - 0.06)], "concrete", 0, 0, 72)
    cylinder("water", 0, 0, h - 0.06, h - 0.024, R - 0.055, "water", 72)
    r = rng(8)
    for i, (x, y, s) in enumerate(((0.11, -0.06, 0.04), (0.15, 0.03, 0.03), (-0.14, 0.09, 0.035))):
        _rock(f"pebble{i}", x, y, s, s * 0.8, s * 0.7, r.randint(1, 999), _cm("granite")).location.z = h - 0.05


def insect_hotel(w: float, d: float, h: float):
    """Insektenhotel: Lärchenkasten mit Fächern (Bambus, Hartholz mit Bohrungen, Zapfen, Schilf, Lochziegel), Blechdach, auf zwei Pfosten"""
    wn = "wood_natural"
    bx0, bx1 = -w / 2 + 0.05, w / 2 - 0.05
    by0, by1 = -d / 2 + 0.04, d / 2 - 0.03  # Front bei by1 (Süden)
    zb0, zb1 = 0.68, h - 0.2
    t = 0.022
    # Pfosten
    for x in (bx0 + 0.04, bx1 - 0.1):
        box("post", x, -0.03, 0, x + 0.06, 0.03, zb0 + 0.25, wn, 0.004)
    box("back", bx0, by0, zb0, bx1, by0 + 0.015, zb1, "wood_grey")
    box("bottom", bx0, by0, zb0, bx1, by1, zb0 + t, wn, 0.003)
    box("top", bx0, by0, zb1 - t, bx1, by1, zb1, wn, 0.003)
    box("side_w", bx0, by0, zb0, bx0 + t, by1, zb1, wn, 0.003)
    box("side_e", bx1 - t, by0, zb0, bx1, by1, zb1, wn, 0.003)
    # Giebel und Dach
    zr = h
    xc = 0.0
    bm = bmesh.new()
    for y in (by0, by1):
        bm.faces.new([bm.verts.new(P(bx0, y, zb1)), bm.verts.new(P(bx1, y, zb1)), bm.verts.new(P(xc, y, zr - 0.03))])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    g = _obj("gable", bm, wn)
    g.modifiers.new("t", "SOLIDIFY").thickness = 0.02
    box("gable_fill", bx0 + 0.04, by1 - 0.01, zb1, bx1 - 0.04, by1 - 0.005, zb1 + 0.01, wn)
    ov = 0.04
    for sx in (-1, 1):
        a_ = P(xc, -d / 2, zr - 0.015)
        b_ = P(sx * (w / 2), -d / 2, zb1 - 0.03)
        e = Vector((0, -1, 0))
        s = (b_ - a_).normalized()
        nrm = e.cross(s)
        if nrm.z < 0:
            nrm = -nrm
        plate("roof", a_, e, s, nrm, d, (b_ - a_).length, 0.012, "anthracite")
    _rod("ridge", P(0, -d / 2 - 0.003, zr - 0.006), P(0, d / 2 + 0.003, zr - 0.006), 0.012, "graphite", 12)
    _ = ov
    # Fächer: Raster 3 × 3 mit Trennbrettern
    xi0, xi1 = bx0 + t, bx1 - t
    zi0, zi1 = zb0 + t, zb1 - t
    cols = [xi0, xi0 + (xi1 - xi0) * 0.36, xi0 + (xi1 - xi0) * 0.68, xi1]
    rows_ = [zi0, zi0 + (zi1 - zi0) * 0.3, zi0 + (zi1 - zi0) * 0.62, zi1]
    for x in cols[1:-1]:
        box("div_v", x - 0.008, by0, zi0, x + 0.008, by1 - 0.005, zi1, wn, 0.002)
    for z in rows_[1:-1]:
        box("div_h", xi0, by0, z - 0.008, xi1, by1 - 0.005, z + 0.008, wn, 0.002)
    fills = {
        (0, 0): "logs", (1, 0): "bamboo", (2, 0): "cones",
        (0, 1): "reed", (1, 1): "log", (2, 1): "bamboo",
        (0, 2): "bamboo", (1, 2): "brick", (2, 2): "reed",
    }
    fy = by1 - 0.015  # Vorderkante der Füllung
    bam = _Batch("bamboo", _cm("bamboo"))
    holes = _Batch("holes", _cm("hole"), False, False)
    reed = _Batch("reed", _cm("straw"), True, False)
    grain = _Batch("endgrain", _cm("endgrain"))
    cones = _Batch("cones", _cm("cone"))
    clay = _Batch("brick", _cm("clay"), False)
    rr = rng(77)
    for (ci, ri), kind in fills.items():
        a0, a1 = cols[ci] + 0.01, cols[ci + 1] - 0.01
        c0, c1 = rows_[ri] + 0.01, rows_[ri + 1] - 0.01
        if kind in ("bamboo", "reed"):
            rad = 0.013 if kind == "bamboo" else 0.0055
            step = rad * 2.05
            z = c0 + rad
            k = 0
            while z < c1 - rad * 0.9:
                x = a0 + rad + (rad if k % 2 else 0)
                while x < a1 - rad * 0.9:
                    rj = rad * rr.uniform(0.82, 1.05)
                    ins = rr.uniform(0.0, 0.012)
                    tgt = bam if kind == "bamboo" else reed
                    tgt.rod(P(x, by0 + 0.02, z), P(x, fy - ins, z), rj, 10 if kind == "bamboo" else 6)
                    holes.rod(P(x, fy - ins - 0.003, z), P(x, fy - ins + 0.0015, z), rj * (0.68 if kind == "bamboo" else 0.55), 10 if kind == "bamboo" else 6)
                    x += step
                z += step * 0.88
                k += 1
        elif kind == "logs":  # drei Rundholzscheiben mit Bohrungen
            for (fx, fz, fr) in ((0.3, 0.32, 0.4), (0.72, 0.3, 0.3), (0.5, 0.75, 0.33)):
                cx = a0 + (a1 - a0) * fx
                cz = c0 + (c1 - c0) * fz
                rad = min(a1 - a0, c1 - c0) * fr
                grain.rod(P(cx, by0 + 0.02, cz), P(cx, fy - rr.uniform(0, 0.01), cz), rad, 20)
                for _ in range(6):
                    a = rr.uniform(0, TAU)
                    q = rr.uniform(0.15, 0.7) * rad
                    holes.rod(P(cx + math.cos(a) * q, fy - 0.03, cz + math.sin(a) * q), P(cx + math.cos(a) * q, fy + 0.0005, cz + math.sin(a) * q), rr.uniform(0.003, 0.005), 6)
        elif kind == "log":  # Hartholzblock, Hirnholz nach vorn, viele Bohrungen
            m = Matrix.Translation(P((a0 + a1) / 2, (by0 + fy) / 2, (c0 + c1) / 2)) @ Matrix.Diagonal((a1 - a0, fy - by0 - 0.02, c1 - c0, 1))
            bmesh.ops.create_cube(grain.bm, size=1.0, matrix=m)
            for i in range(5):
                for j in range(4):
                    x = a0 + (a1 - a0) * (i + 0.5) / 5 + rr.uniform(-0.006, 0.006)
                    z = c0 + (c1 - c0) * (j + 0.5) / 4 + rr.uniform(-0.006, 0.006)
                    holes.rod(P(x, fy - 0.03, z), P(x, fy + 0.0005, z), rr.uniform(0.003, 0.0055), 6)
        elif kind == "cones":  # Kiefernzapfen
            for _ in range(9):
                cx = rr.uniform(a0 + 0.03, a1 - 0.03)
                cz = rr.uniform(c0 + 0.03, c1 - 0.03)
                q = Vector((rr.uniform(-1, 1), rr.uniform(-1, 1), rr.uniform(-1, 1))).normalized().to_track_quat("Z", "Y").to_matrix()
                cones.blob(P(cx, fy - rr.uniform(0.02, 0.05), cz), 0.03, (0.75, 0.75, 1.25), 2, 0.35, rr.randint(1, 999), q)
        elif kind == "brick":  # Lochziegel mit Röhrchen
            m = Matrix.Translation(P((a0 + a1) / 2, (by0 + fy) / 2, (c0 + c1) / 2)) @ Matrix.Diagonal((a1 - a0, fy - by0 - 0.02, c1 - c0, 1))
            bmesh.ops.create_cube(clay.bm, size=1.0, matrix=m)
            for i in range(6):
                for j in range(3):
                    x = a0 + (a1 - a0) * (i + 0.5) / 6
                    z = c0 + (c1 - c0) * (j + 0.5) / 3
                    holes.cube(x - 0.009, fy - 0.0005, z - 0.012, x + 0.009, fy + 0.0012, z + 0.012)
    for b_ in (bam, holes, reed, grain, cones, clay):
        b_.build()
    # feines Schutzgitter? bewusst weggelassen – würde die Füllung in der Draufsicht verdecken


def nest_box(w: float, d: float, h: float):
    """Nistkasten am Pfahl: vergraute Lärche, Einflugloch 32 mm nach Süden, Pultdach anthrazit, Pfahl Stahl anthrazit"""
    zb0 = h - 0.36
    box("pole", -0.03, -0.03, 0, 0.03, 0.03, zb0 + 0.12, "anthracite", 0.004)
    box("bracket", -0.05, -0.12, zb0 - 0.04, 0.05, -0.03, zb0 + 0.02, "anthracite", 0.003)
    bx, by = 0.08, 0.09
    yc = -0.05
    zt_f, zt_b = h - 0.08, h - 0.04  # Pultdach fällt nach vorn
    bm = bmesh.new()
    pts = [(-bx, yc - by, zb0), (bx, yc - by, zb0), (bx, yc + by, zb0), (-bx, yc + by, zb0)]
    bot = [bm.verts.new(P(x, y, z)) for x, y, z in pts]
    top = [bm.verts.new(P(x, y, zt_b if y < yc else zt_f)) for x, y, z in pts]
    bm.faces.new(bot)
    bm.faces.new(top)
    for i in range(4):
        bm.faces.new((bot[i], bot[(i + 1) % 4], top[(i + 1) % 4], top[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    body = _obj("body", bm, "wood_grey")
    bev = body.modifiers.new("b", "BEVEL")
    bev.width = 0.004
    bev.limit_method = "ANGLE"
    # Einflugloch
    _rod("entry", P(0, yc + by - 0.006, zt_f - 0.08), P(0, yc + by + 0.002, zt_f - 0.08), 0.016, _cm("hole"), 24)
    _rod("entry_ring", P(0, yc + by - 0.002, zt_f - 0.08), P(0, yc + by + 0.004, zt_f - 0.08), 0.021, "graphite", 24)
    # Dach mit Überstand bis zur Objektkante
    a_ = P(-w / 2, -d / 2, zt_b + 0.005)
    b_ = P(-w / 2, d / 2 - 0.02, zt_f + 0.005 - (d / 2 - 0.02 - (yc + by)) * 0.2)
    e = Vector((1, 0, 0))
    s = (b_ - a_).normalized()
    nrm = e.cross(s)
    if nrm.z < 0:
        nrm = -nrm
    plate("roof", a_, e, s, nrm, w, (b_ - a_).length, 0.015, "anthracite")
    plate("drip", b_, e, -nrm, s, w, 0.03, 0.006, "anthracite")
    # Klappe/Schrauben am Kasten
    for z in (zb0 + 0.04, zt_f - 0.03):
        _rod("screw", P(bx - 0.02, yc + by - 0.002, z), P(bx - 0.02, yc + by + 0.003, z), 0.004, "graphite", 8)


def corten_sculpture(w: float, d: float, h: float):
    """Skulptur „Flamme“: verdrehte, nach oben schmaler werdende Stele aus Cortenstahl auf Basaltsockel"""
    zp = 0.08
    box("plinth", -w / 2 + 0.04, -d / 2 + 0.04, 0, w / 2 - 0.04, d / 2 - 0.04, zp, "basalt", 0.008)
    box("plinth_top", -w / 2 + 0.06, -d / 2 + 0.06, zp, w / 2 - 0.06, d / 2 - 0.06, zp + 0.008, "basalt_cut", 0.003)
    n = 80
    bm = bmesh.new()
    rings = []
    for i in range(n + 1):
        t = i / n
        z = zp + 0.008 + (h - zp - 0.008) * t
        wid = (min(w, d) * 0.42) * (1 - 0.45 * t) * (1 + 0.12 * math.sin(t * math.pi))
        thk = 0.05 * (1 - 0.4 * t)
        ang = math.radians(25) + t * math.pi * 0.85
        ca, sa = math.cos(ang), math.sin(ang)
        # Querschnitt: flaches Linsenprofil (gerundete Kanten)
        sec = []
        for k in range(16):
            a = k / 16 * TAU
            px = math.cos(a) * wid
            py = math.sin(a) * thk * (abs(math.cos(a)) ** 0.0 if abs(math.sin(a)) > 0.2 else 1)
            py = math.copysign(abs(math.sin(a)) ** 0.6, math.sin(a)) * thk
            px = math.copysign(abs(math.cos(a)) ** 0.35, math.cos(a)) * wid
            sec.append((px * ca - py * sa, px * sa + py * ca))
        # Spitze: Linse schließt sich
        if i == n:
            sec = [(x * 0.15, y * 0.15) for x, y in sec]
        rings.append([bm.verts.new(P(x, y, z)) for x, y in sec])
    for i in range(n):
        for k in range(16):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % 16], rings[i + 1][(k + 1) % 16], rings[i + 1][k]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = _obj("blade", bm, "corten", True)
    sub = ob.modifiers.new("s", "SUBSURF")
    sub.levels = 1
    sub.render_levels = 1


def planter_large(w: float, d: float, h: float):
    """Großer Pflanzkübel Faserzement anthrazit, leicht konisch, sichtbare Wandstärke; Lampenputzergras mit Unterpflanzung"""
    fc = _cm("fibrecement")
    t = 0.025
    tb = 0.05  # unten eingezogen
    bm = bmesh.new()
    bot = [bm.verts.new(P(x, y, 0)) for x, y in ((-w / 2 + tb, -d / 2 + tb), (w / 2 - tb, -d / 2 + tb), (w / 2 - tb, d / 2 - tb), (-w / 2 + tb, d / 2 - tb))]
    top = [bm.verts.new(P(x, y, h)) for x, y in ((-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2))]
    inn = [bm.verts.new(P(x, y, h)) for x, y in ((-w / 2 + t, -d / 2 + t), (w / 2 - t, -d / 2 + t), (w / 2 - t, d / 2 - t), (-w / 2 + t, d / 2 - t))]
    ib = [bm.verts.new(P(x, y, h - 0.12)) for x, y in ((-w / 2 + t + 0.004, -d / 2 + t + 0.004), (w / 2 - t - 0.004, -d / 2 + t + 0.004), (w / 2 - t - 0.004, d / 2 - t - 0.004), (-w / 2 + t + 0.004, d / 2 - t - 0.004))]
    bm.faces.new(list(reversed(bot)))
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((bot[i], bot[j], top[j], top[i]))
        bm.faces.new((top[i], top[j], inn[j], inn[i]))
        bm.faces.new((inn[i], inn[j], ib[j], ib[i]))
    bm.faces.new(ib)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    pot = _obj("pot", bm, fc)
    bev = pot.modifiers.new("b", "BEVEL")
    bev.width = 0.008
    bev.segments = 3
    bev.limit_method = "ANGLE"
    # Mulch
    zs = h - 0.07
    box("mulch", -w / 2 + t + 0.004, -d / 2 + t + 0.004, h - 0.12, w / 2 - t - 0.004, d / 2 - t - 0.004, zs, _cm("bark_mulch"))
    # Lampenputzergras (Pennisetum) in der Mitte: drei Halmobjekte für Farbschwankung, Blütenähren
    _grass("grass_a", 0.02, -0.02, zs, 0.55, 1.0, 420, 5, "leaf", 0.008, 0)
    _grass("grass_b", -0.02, 0.03, zs, 0.6, 0.85, 320, 9, "leaf_light", 0.007, 0)
    _grass("grass_c", 0.0, 0.0, zs, 0.5, 1.15, 220, 13, "leaf_sedum", 0.007, 34)
    # Unterpflanzung: Polster in den Ecken, teils über den Rand hängend
    r = rng(21)
    for (cx, cy) in ((-0.32, -0.32), (0.32, -0.32), (0.33, 0.33), (-0.33, 0.32)):
        cx *= w / 1.0
        cy *= d / 1.0
        foliage_ball("cushion", P(cx, cy, zs + 0.02), 0.12, 700, 0.022, "leaf_blue" if r.random() < 0.5 else "leaf", r.randint(1, 999))
    foliage_carpet("ground", -w / 2 + t + 0.01, -d / 2 + t + 0.01, w / 2 - t - 0.01, d / 2 - t - 0.01, zs, 900, 0.02, "leaf", _cm("bark_mulch"), seed=4)


GENERATORS = {
    # Spielen
    "sandboxBench": sandbox,
    "slideTower": slide_tower,
    "soccerGoal": soccer_goal,
    "pingPongTable": ping_pong,
    "stiltHouse": stilt_house,
    # Deko & Natur
    "graniteBoulder": granite_boulder,
    "birdBath": bird_bath,
    "insectHotel": insect_hotel,
    "nestBoxPole": nest_box,
    "cortenSculpture": corten_sculpture,
    "planterLarge": planter_large,
}
