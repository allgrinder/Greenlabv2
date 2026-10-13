"""
Generatoren der Objektgruppe „Möbel & Schatten“: Hollywoodschaukel, Hängematte mit Gestell,
Gartenbank, Bistro-Set, Sonnenschirm, Sonnensegel und Kugelgrill – moderner Stil, grau und anthrazit.

Wie in `items.py` baut jede Funktion das Objekt in Plan-Metern um den Ursprung
(Breite w entlang x, Tiefe d entlang y, Höhe h; Plan-y zeigt nach unten = „vorn“, zur Kamera
der Schrägansicht). Die Maße stehen in `catalog_moebel.json`.

Eigene Helfer: Rohre (Kurven mit Rundprofil und ausgerundeten Ecken), Flachstahl/Latten
zwischen zwei Punkten, Drehkörper und frei geformte Flächen (Stoff). Zusätzliche Materialien
(Emaille, Edelstahl, geöltes Holz ohne Fugen, Seil) werden in die Materialbibliothek von `lib`
eingetragen, damit `box`/`cylinder` sie wie die vorhandenen Sorten verwenden können.
"""
from __future__ import annotations

import math

import bpy  # noqa: I001 – bpy muss vor bmesh geladen werden
import bmesh
from mathutils import Matrix, Vector

import lib
from lib import P, box, cylinder, link, mat

# ------------------------------------------------------------------ Materialien (Ergänzung)


def _extra_mats():
    """Zusätzliche Materialien einmal je Szene anlegen (reset_scene leert lib._mats)"""
    if "enamel" in lib._mats:
        return
    # Emaille schwarz (Kugelgrill): tiefes Anthrazit mit Klarlack, klare Glanzlichter
    m, b = lib._principled("enamel")
    lib._color_noise(m, b, (0.012, 0.012, 0.013), (0.02, 0.02, 0.021), 5)
    b.inputs["Roughness"].default_value = 0.3
    b.inputs["Metallic"].default_value = 0.0
    b.inputs["Specular IOR Level"].default_value = 0.35
    b.inputs["Coat Weight"].default_value = 0.35
    b.inputs["Coat Roughness"].default_value = 0.12
    lib._ao(m, 0.5)
    lib._mats["enamel"] = m
    # gebürsteter Edelstahl (Griffe, Beine, Lüftung)
    m, b = lib._principled("steel")
    b.inputs["Base Color"].default_value = (0.5, 0.5, 0.49, 1)
    b.inputs["Metallic"].default_value = 0.9
    b.inputs["Roughness"].default_value = 0.32
    lib._bump(m, b, 300, 0.03)
    lib._ao(m, 0.6)
    lib._mats["steel"] = m
    # geöltes Holz (Thermo-Esche/Robinie) für Latten: Maserung entlang x, keine Fugen, je Latte eigene Helligkeit
    m, b = lib._principled("wood_slat")
    nt = m.node_tree
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1.5, 28.0, 28.0)
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    noi = nt.nodes.new("ShaderNodeTexNoise")
    noi.inputs["Scale"].default_value = 2.5
    noi.inputs["Detail"].default_value = 8
    noi.inputs["Distortion"].default_value = 0.6
    nt.links.new(mp.outputs["Vector"], noi.inputs["Vector"])
    info = nt.nodes.new("ShaderNodeObjectInfo")
    mix = nt.nodes.new("ShaderNodeMath")
    mix.operation = "MULTIPLY_ADD"
    mix.inputs[1].default_value = 0.55
    nt.links.new(noi.outputs["Fac"], mix.inputs[0])
    nt.links.new(info.outputs["Random"], mix.inputs[2])
    sc = nt.nodes.new("ShaderNodeMath")
    sc.operation = "MULTIPLY"
    sc.inputs[1].default_value = 0.75
    nt.links.new(mix.outputs[0], sc.inputs[0])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.11, 0.09, 0.068, 1)
    ramp.color_ramp.elements[1].color = (0.25, 0.205, 0.158, 1)
    nt.links.new(sc.outputs[0], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.15
    nt.links.new(noi.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    b.inputs["Roughness"].default_value = 0.58
    lib._ao(m, 0.7)
    lib._mats["wood_slat"] = m
    # Seil / Kordel hellgrau
    m, b = lib._principled("rope")
    lib._color_noise(m, b, (0.3, 0.29, 0.27), (0.4, 0.385, 0.36), 80)
    b.inputs["Roughness"].default_value = 0.95
    b.inputs["Sheen Weight"].default_value = 0.3
    lib._ao(m, 0.6)
    lib._mats["rope"] = m
    # Gummi schwarz (Räder, Fußkappen)
    m, b = lib._principled("rubber")
    b.inputs["Base Color"].default_value = (0.012, 0.012, 0.012, 1)
    b.inputs["Roughness"].default_value = 0.8
    lib._mats["rubber"] = m


# ------------------------------------------------------------------ Geometrie-Helfer


def _V(p) -> Vector:
    """Plan-Tupel (x, y, z) → Blender-Vektor"""
    return P(*p)


def _fillet(pts: list[Vector], radius: float, steps: int = 6) -> list[Vector]:
    """Ecken eines Polygonzugs mit (quadratischen) Bögen ausrunden"""
    if radius <= 0 or len(pts) < 3:
        return pts
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        a, c, b = pts[i - 1], pts[i], pts[i + 1]
        da, db = (a - c), (b - c)
        r = min(radius, da.length * 0.45, db.length * 0.45)
        p0 = c + da.normalized() * r
        p1 = c + db.normalized() * r
        for k in range(steps + 1):
            t = k / steps
            out.append(p0 * (1 - t) ** 2 + c * 2 * t * (1 - t) + p1 * t * t)
    out.append(pts[-1])
    return out


def _tube(name: str, pts, r: float, material: str, fillet: float = 0.0, closed: bool = False, res: int = 3) -> bpy.types.Object:
    """Rohr entlang eines Plan-Polygonzugs (Kurve mit Rundprofil), Ecken optional ausgerundet"""
    vs = [_V(p) for p in pts]
    if closed and fillet > 0:
        vs = _fillet([vs[-1]] + vs + [vs[0], vs[1]], fillet)[1:]
        # Anfangs- und Endbogen überlappen: doppelte Punkte am Ende entfernen
        vs = vs[: -1]
    else:
        vs = _fillet(vs, fillet)
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = r
    cu.bevel_resolution = res
    cu.use_fill_caps = True
    sp = cu.splines.new("POLY")
    sp.points.add(len(vs) - 1)
    for i, v in enumerate(vs):
        sp.points[i].co = (v.x, v.y, v.z, 1)
    sp.use_cyclic_u = closed
    sp.use_smooth = True
    ob = link(bpy.data.objects.new(name, cu))
    ob.data.materials.append(mat(material))
    return ob


def _beam(name: str, a, b, hgt: float, wid: float, material: str, side=None, bevel: float = 0.003) -> bpy.types.Object:
    """
    Kantiges Profil (Latte, Flachstahl) von a nach b (Plan-Punkte).
    `wid` liegt entlang `side` (Plan-Vektor; Standard: waagerecht quer), `hgt` senkrecht dazu.
    """
    A, B = _V(a), _V(b)
    u = B - A
    L = u.length
    u.normalize()
    if side is None:
        s = u.cross(Vector((0, 0, 1)))
        if s.length < 1e-6:
            s = Vector((1, 0, 0))
    else:
        s = _V(side)
        s = s - u * s.dot(u)
    s.normalize()
    n = s.cross(u).normalized()
    if n.z < 0:
        n = -n
    mid = (A + B) / 2
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        x, y, z = v.co
        v.co = mid + u * x * L + s * y * wid + n * z * hgt
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me))
    ob.data.materials.append(mat(material))
    if bevel > 0:
        mod = ob.modifiers.new("bevel", "BEVEL")
        mod.width = min(bevel, hgt * 0.3, wid * 0.3)
        mod.segments = 2
        mod.limit_method = "ANGLE"
    return ob


def _lathe(name: str, prof: list[tuple[float, float]], cx: float, cy: float, material: str, seg: int = 64, smooth: bool = True) -> bpy.types.Object:
    """Drehkörper um die senkrechte Achse durch (cx, cy); `prof` = [(Radius, z), …]"""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rings = []
    for r, z in prof:
        if r < 1e-5:
            rings.append([bm.verts.new(P(cx, cy, z))])
        else:
            rings.append([bm.verts.new(P(cx + math.cos(k / seg * math.tau) * r, cy + math.sin(k / seg * math.tau) * r, z)) for k in range(seg)])
    for i in range(len(rings) - 1):
        r0, r1 = rings[i], rings[i + 1]
        for k in range(seg):
            if len(r0) == 1 and len(r1) == 1:
                continue
            if len(r0) == 1:
                bm.faces.new((r0[0], r1[k], r1[(k + 1) % seg]))
            elif len(r1) == 1:
                bm.faces.new((r0[k], r0[(k + 1) % seg], r1[0]))
            else:
                bm.faces.new((r0[k], r0[(k + 1) % seg], r1[(k + 1) % seg], r1[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me))
    ob.data.materials.append(mat(material))
    for p in ob.data.polygons:
        p.use_smooth = smooth
    return ob


def _sheet(name: str, grid: list[list[Vector]], material: str, thick: float = 0.0, outline: bool = True) -> bpy.types.Object:
    """Gekrümmte Fläche aus einem Punkteraster (Blender-Vektoren), optional mit Materialstärke"""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    vs = [[bm.verts.new(p) for p in row] for row in grid]
    for i in range(len(vs) - 1):
        for j in range(len(vs[i]) - 1):
            bm.faces.new((vs[i][j], vs[i][j + 1], vs[i + 1][j + 1], vs[i + 1][j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me), outline=outline)
    ob.data.materials.append(mat(material))
    for p in ob.data.polygons:
        p.use_smooth = True
    if thick > 0:
        sol = ob.modifiers.new("t", "SOLIDIFY")
        sol.thickness = thick
        sol.offset = 0.0
    return ob


def _place(objs: list[bpy.types.Object], cx: float, cy: float, ang_deg: float):
    """Bauteile, die um den Ursprung gebaut wurden, drehen (Plan, im Uhrzeigersinn) und verschieben"""
    rot = Matrix.Rotation(math.radians(-ang_deg), 4, "Z")
    for ob in objs:
        ob.data.transform(rot)
        ob.location = P(cx, cy, 0)


def _collect(fn, *args) -> list[bpy.types.Object]:
    """Alle Objekte, die `fn` neu anlegt"""
    before = set(bpy.context.scene.objects)
    fn(*args)
    return [ob for ob in bpy.context.scene.objects if ob not in before and ob.type in {"MESH", "CURVE"} and not ob.name.startswith("leaf_")]


# ------------------------------------------------------------------ Hollywoodschaukel


def hollywood_swing(w: float, d: float, h: float):
    """Hollywoodschaukel: Gestell aus anthrazit Stahlrohr, Dreisitzer mit hellgrauen Polstern, Sonnendach aus Stoff"""
    _extra_mats()
    X = w / 2 - 0.05
    zt = h - 0.2  # Querholm
    yf = d / 2 - 0.06
    # Seitengestelle: A-Böcke mit Fußrohr
    for sx in (-1, 1):
        x = sx * X
        _tube("foot", [(x, -yf, 0.03), (x, yf, 0.03)], 0.03, "anthracite")
        for sy in (-1, 1):
            _tube("cap", [(x, sy * yf, 0.0), (x, sy * yf, 0.035)], 0.034, "rubber")
            _tube("leg", [(x, sy * (yf - 0.02), 0.03), (x, 0, zt)], 0.028, "anthracite")
    _tube("beam", [(-X - 0.03, 0, zt), (X + 0.03, 0, zt)], 0.034, "anthracite")
    # Querstrebe hinten unten
    yb = -(yf - 0.02) * (1 - 0.22 / zt)
    _tube("stretcher", [(-X, yb, 0.25), (X, yb, 0.25)], 0.022, "anthracite")

    # Sonnendach: leicht gewölbte Stoffbahn, hinten tiefer; Rahmen darunter, Volant vorn und hinten
    yc = d / 2 - 0.02
    zb, zf = h - 0.12, h - 0.01

    def roof_z(y):
        t = (y + yc) / (2 * yc)
        return zb + (zf - zb) * t + 0.05 * (1 - ((y) / yc) ** 2)

    # vier Spriegel tragen den Stoff; dazwischen hängt er durch und bildet flache Bahnen
    bows = [-X, -X / 3, X / 3, X]
    grid = []
    nx, ny = 60, 16
    for i in range(nx + 1):
        x = -X - 0.05 + (2 * X + 0.1) * i / nx
        k = min(2, max(0, int((x - bows[0]) / (bows[1] - bows[0]))))
        fr = min(1.0, max(0.0, (x - bows[k]) / (bows[k + 1] - bows[k])))
        row = []
        for j in range(ny + 1):
            y = -yc + 2 * yc * j / ny
            edge = 1 - abs(y / yc) ** 6  # an Volant-Kanten gespannt
            sag = 0.05 * math.sin(math.pi * fr) * edge
            row.append(P(x, y, roof_z(y) - sag))
        grid.append(row)
    _sheet("canopy", grid, "fabric_light", 0.008)
    for x in bows:
        pts = [(x, -yc + 2 * yc * j / 12, roof_z(-yc + 2 * yc * j / 12) - 0.012) for j in range(13)]
        _tube("bow", pts, 0.014 if abs(x) < X else 0.016, "anthracite")
    for x in (-X, X):
        _tube("roofpost", [(x, 0, zt), (x, 0, roof_z(0) - 0.02)], 0.02, "anthracite")
    for x in (-X - 0.05, X + 0.05):
        pts = [(x, -yc + 2 * yc * j / 12, roof_z(-yc + 2 * yc * j / 12) + 0.002) for j in range(13)]
        _tube("piping_side", pts, 0.01, "fabric_dark", res=2)
    for y in (-yc, yc):
        z = roof_z(y)
        box("valance", -X - 0.05, y - 0.006, z - 0.13, X + 0.05, y + 0.006, z, "fabric_light", 0.004)
        box("piping", -X - 0.05, y - 0.008, z - 0.135, X + 0.05, y + 0.008, z - 0.12, "fabric_dark", 0.004)

    # Sitzbank (hängt an vier Stangen am Querholm), Sitzfläche nach vorn (Plan-Süden)
    sx0, sx1 = -0.86, 0.86
    yb0, yf0 = -0.3, 0.3
    zs = 0.47
    box("seatframe", sx0, yb0, zs - 0.06, sx1, yf0, zs, "anthracite", 0.008)
    # Rückenlehne geneigt
    tilt = math.radians(14)
    bh = 0.6
    back_top = (yb0 - 0.02 - bh * math.sin(tilt), zs + bh * math.cos(tilt))
    side = (0, -math.sin(tilt), math.cos(tilt))
    _beam("backframe", (sx0, yb0 - 0.02, zs + bh / 2 * math.cos(tilt) - 0.02), (sx1, yb0 - 0.02, zs + bh / 2 * math.cos(tilt) - 0.02), 0.04, bh, "anthracite", side=side)
    # Armlehnen
    for x in (sx0 - 0.02, sx1 + 0.02):
        box("arm", x - 0.025, yb0 - 0.05, zs + 0.2, x + 0.025, yf0 + 0.02, zs + 0.24, "anthracite", 0.006)
        box("armpost", x - 0.015, yf0 - 0.04, zs - 0.06, x + 0.015, yf0 - 0.01, zs + 0.2, "anthracite", 0.004)
    # Polster: drei Sitzkissen, drei Rückenkissen, zwei Zierkissen
    cw = (sx1 - sx0 - 0.08) / 3
    for i in range(3):
        x0 = sx0 + 0.04 + i * cw
        box("cushion", x0 + 0.006, yb0 + 0.02, zs, x0 + cw - 0.006, yf0 + 0.03, zs + 0.11, "fabric_light", 0.035)
        yy = yb0 + 0.07
        _beam("backcushion", (x0 + 0.006, yy - 0.02 - 0.3 * math.sin(tilt), zs + 0.1 + 0.26 * math.cos(tilt)), (x0 + cw - 0.006, yy - 0.02 - 0.3 * math.sin(tilt), zs + 0.1 + 0.26 * math.cos(tilt)), 0.11, 0.48, "fabric_light", side=side, bevel=0.035)
    for x, m_ in ((sx0 + 0.32, "fabric_dark"), (sx1 - 0.34, "fabric_dark")):
        _beam("pillow", (x - 0.2, yb0 + 0.1 - 0.2 * math.sin(tilt), zs + 0.36), (x + 0.2, yb0 + 0.1 - 0.2 * math.sin(tilt), zs + 0.36), 0.1, 0.36, m_, side=side, bevel=0.04)
    _ = back_top
    # Hängestangen
    for x in (sx0 - 0.02, sx1 + 0.02):
        for y in (yb0 + 0.02, yf0 - 0.03):
            _tube("hanger", [(x, y, zs + 0.24), (x, 0, zt - 0.02)], 0.008, "graphite")
        _tube("hook", [(x, 0, zt - 0.06), (x, 0, zt + 0.03)], 0.014, "graphite")


# ------------------------------------------------------------------ Hängematte mit Gestell


def hammock_stand(w: float, d: float, h: float):
    """Hängematte mit Bogengestell aus anthrazit Stahl: Stoffbahn hellgrau mit Spreizstäben aus Holz, Kissen"""
    _extra_mats()
    tip = w / 2 - 0.05
    # Gestell: Grundrohr, zwei Querfüße, zwei Bögen zu den Haken
    _tube("base", [(-1.12, 0, 0.045), (1.12, 0, 0.045)], 0.036, "anthracite")
    for sx in (-1, 1):
        x = sx * 1.0
        _tube("foot", [(x, -(d / 2 - 0.04), 0.035), (x, d / 2 - 0.04, 0.035)], 0.032, "anthracite")
        for sy in (-1, 1):
            _tube("cap", [(x, sy * (d / 2 - 0.04), 0.0), (x, sy * (d / 2 - 0.04), 0.03)], 0.036, "rubber")
        # Bogen als quadratische Bézierkurve
        p0, c, p1 = Vector((sx * 1.05, 0.045)), Vector((sx * (tip - 0.02), 0.15)), Vector((sx * tip, h - 0.05))
        pts = []
        for k in range(21):
            t = k / 20
            q = p0 * (1 - t) ** 2 + c * 2 * t * (1 - t) + p1 * t * t
            pts.append((q.x, 0, q.y))
        _tube("arm", pts, 0.034, "anthracite")
        _tube("armcap", [(sx * tip, 0, h - 0.05), (sx * tip, 0, h - 0.01)], 0.036, "graphite")
        _tube("hook", [(sx * (tip - 0.02), 0, h - 0.06), (sx * (tip - 0.1), 0, h - 0.11)], 0.009, "graphite")

    # Liegefläche: Stoff zwischen den Spreizstäben, in der Mitte durchhängend und eingeschnürt
    L = 1.0
    zbar = 0.78
    half = 0.44
    nu, nv = 48, 18
    grid = []
    for i in range(nu + 1):
        x = -L + 2 * L * i / nu
        f = 1 - (x / L) ** 2
        row = []
        for j in range(nv + 1):
            v = j / nv * 2 - 1
            y = v * half * (1 - 0.2 * f)
            z = zbar - 0.32 * f - 0.11 * (1 - v * v) * math.sqrt(max(f, 0))
            row.append(P(x, y, z))
        grid.append(row)
    _sheet("hammock", grid, "fabric_light", 0.008)
    # Saum an den Längskanten
    for j in (0, nv):
        _tube("hem", [tuple((grid[i][j].x, -grid[i][j].y, grid[i][j].z)) for i in range(nu + 1)], 0.009, "fabric_light")
    # Spreizstäbe und Seile zu den Haken
    for sx in (-1, 1):
        x = sx * L
        _beam("spreader", (x, -half - 0.05, zbar), (x, half + 0.05, zbar), 0.03, 0.045, "wood_slat", side=(1, 0, 0))
        hook = (sx * (tip - 0.1), 0, h - 0.12)
        for k in range(7):
            y = -half + 2 * half * k / 6
            _tube("rope", [(x, y, zbar + 0.01), hook], 0.005, "rope", res=1)
        _tube("ring", [(sx * (tip - 0.1), 0, h - 0.14), (sx * (tip - 0.1), 0, h - 0.1)], 0.018, "steel")
    # Kissen am Kopfende
    xk = -0.68
    zk = zbar - 0.32 * (1 - (xk / L) ** 2) - 0.08
    _beam("pillow", (xk - 0.12, -0.24, zk + 0.06), (xk + 0.12, -0.24, zk + 0.02), 0.11, 0.48, "fabric_dark", side=(0, 1, 0), bevel=0.04)


# ------------------------------------------------------------------ Gartenbank


def garden_bench(w: float, d: float, h: float):
    """Gartenbank: zwei Wangen aus anthrazit Flachstahl, Sitz- und Rückenlatten aus geöltem Holz"""
    _extra_mats()
    yF, yB = d / 2 - 0.05, -d / 2 + 0.05
    zseat = 0.43
    xs = w / 2 - 0.12
    for x in (-xs, xs):
        # Vorderbein bis zur Armlehne
        _beam("leg_f", (x, yF - 0.04, 0), (x, yF - 0.04, 0.64), 0.05, 0.016, "anthracite", side=(1, 0, 0), bevel=0.002)
        # Sitzauflage, nach hinten leicht abfallend
        _beam("rail", (x, yF, zseat - 0.03), (x, yB + 0.1, zseat - 0.055), 0.05, 0.016, "anthracite", side=(1, 0, 0), bevel=0.002)
        # Hinterbein mit Rückenlehne in einem Zug
        _beam("leg_b", (x, yB + 0.12, 0), (x, yB + 0.08, zseat - 0.03), 0.05, 0.016, "anthracite", side=(1, 0, 0), bevel=0.002)
        _beam("back", (x, yB + 0.08, zseat - 0.06), (x, yB - 0.01, h - 0.07), 0.05, 0.016, "anthracite", side=(1, 0, 0), bevel=0.002)
        # Fußleiste und Armlehne
        _beam("foot", (x, yF + 0.0, 0.015), (x, yB + 0.08, 0.015), 0.03, 0.05, "anthracite", side=(1, 0, 0), bevel=0.003)
        _beam("armsteel", (x, yB + 0.02, 0.64), (x, yF - 0.02, 0.64), 0.016, 0.05, "anthracite", side=(1, 0, 0), bevel=0.002)
        box("armwood", x - 0.028, yB + 0.01, 0.648, x + 0.028, yF + 0.01, 0.672, "wood_slat", 0.004)
    # Längsstrebe unter dem Sitz
    _beam("stretcher", (-xs, yB + 0.14, 0.2), (xs, yB + 0.14, 0.2), 0.04, 0.016, "anthracite", bevel=0.002)
    # Sitzlatten (5), folgen der Neigung der Sitzauflage
    n = 5
    for i in range(n):
        y = yF - 0.02 - (yF - yB - 0.14) * (i + 0.5) / n
        t = (yF - y) / (yF - yB - 0.1)
        z = zseat - 0.03 - 0.025 * t + 0.025 + 0.014
        _beam("slat", (-w / 2, y, z), (w / 2, y, z), 0.028, 0.075, "wood_slat", side=(0, 1, 0), bevel=0.004)
    # Rückenlatten (3) auf der Rückenlehne
    a = Vector((yB + 0.08, zseat - 0.06))
    b = Vector((yB - 0.01, h - 0.07))
    dirv = (b - a).normalized()
    nrm = Vector((dirv.y, -dirv.x))  # nach vorn
    for t in (0.5, 0.72, 0.94):
        q = a + (b - a) * t + nrm * 0.03
        _beam("backslat", (-w / 2 + 0.04, q.x, q.y), (w / 2 - 0.04, q.x, q.y), 0.026, 0.085, "wood_slat", side=(0, dirv.x, dirv.y), bevel=0.004)


# ------------------------------------------------------------------ Bistro-Set


def _bistro_chair():
    """Bistrostuhl um den Ursprung: Rohrgestell anthrazit, Sitz- und Rückenlatten Holz, Front nach Plan-Süden"""
    s = 0.21
    zs = 0.45
    # Hinterbeine laufen in die Rückenlehne über
    for sx in (-1, 1):
        x = sx * (s - 0.01)
        _tube("leg_b", [(x * 1.05, -s - 0.02, 0), (x, -s + 0.01, zs - 0.02), (x * 0.97, -s - 0.07, 0.84)], 0.011, "anthracite", fillet=0.06)
        _tube("leg_f", [(x * 1.08, s + 0.04, 0), (x, s - 0.01, zs - 0.02)], 0.011, "anthracite")
        _tube("cap", [(x * 1.05, -s - 0.02, 0), (x * 1.05, -s - 0.02, 0.012)], 0.013, "rubber")
        _tube("cap", [(x * 1.08, s + 0.04, 0), (x * 1.08, s + 0.04, 0.012)], 0.013, "rubber")
    # Sitzrahmen und Fußring
    _tube("seatring", [(-s, -s, zs - 0.02), (s, -s, zs - 0.02), (s, s, zs - 0.02), (-s, s, zs - 0.02)], 0.011, "anthracite", fillet=0.05, closed=True)
    _tube("footring", [(-s * 1.06, -s * 0.9, 0.16), (s * 1.06, -s * 0.9, 0.16), (s * 1.06, s, 0.16), (-s * 1.06, s, 0.16)], 0.008, "anthracite", fillet=0.04, closed=True)
    # Sitzlatten
    n = 5
    for i in range(n):
        y = -s + 0.025 + (2 * s - 0.05) * (i + 0.5) / n
        _beam("seatslat", (-s - 0.015, y, zs), (s + 0.015, y, zs), 0.02, 0.068, "wood_slat", side=(0, 1, 0), bevel=0.004)
    # Rückenlatten, geneigt
    for z in (0.66, 0.78):
        t = (z - (zs - 0.02)) / (0.84 - (zs - 0.02))
        y = -s + 0.01 + (-0.07 - 0.01 + 0.0) * t - 0.012
        _beam("backslat", (-s + 0.005, y, z), (s - 0.005, y, z), 0.018, 0.075, "wood_slat", side=(0, -0.17, 1), bevel=0.004)


def bistro_set(w: float, d: float, h: float):
    """Bistro-Set: runder Tisch Ø 60 cm (Keramikplatte, anthrazit Säulenfuß) und zwei Bistrostühle"""
    _extra_mats()
    R = 0.3
    cylinder("top", 0, 0, h - 0.03, h, R, "concrete", 96, 0.006)
    cylinder("edge", 0, 0, h - 0.045, h - 0.02, R - 0.01, "anthracite", 96, 0.004)
    cylinder("spider", 0, 0, h - 0.07, h - 0.045, 0.12, "anthracite", 48)
    cylinder("column", 0, 0, 0.03, h - 0.06, 0.03, "anthracite", 32)
    _lathe("foot", [(0.0, 0.0), (0.23, 0.0), (0.235, 0.008), (0.22, 0.022), (0.06, 0.04), (0.035, 0.07), (0.0, 0.07)], 0, 0, "anthracite", 96)
    off = w / 2 - 0.28
    for cx, cy, ang in ((-off, -0.07, -90 - 8), (off, 0.08, 90 + 10)):
        parts = _collect(_bistro_chair)
        _place(parts, cx, cy, ang)


# ------------------------------------------------------------------ Sonnenschirm


def parasol_round(w: float, d: float, h: float):
    """Sonnenschirm rund: achtteilige Bespannung hellgrau mit Volant-freiem Rand, Mittelmast anthrazit, Granitsockel"""
    _extra_mats()
    R = w / 2
    apex = h - 0.1
    rim = h - 0.55
    n = 8

    def rib(a: float, r: float) -> Vector:
        z = apex - (apex - rim) * (r / R) ** 1.35
        return Vector((math.cos(a) * r, math.sin(a) * r, z))

    # Bespannung: je Segment ein Raster zwischen zwei Rippen, zwischen den Rippen leicht durchhängend
    nt_, ns = 20, 10
    for k in range(n):
        a0 = k / n * math.tau + math.pi / 8
        a1 = a0 + math.tau / n
        grid = []
        for i in range(nt_ + 1):
            t = 0.03 + 0.97 * i / nt_
            row = []
            for j in range(ns + 1):
                s = j / ns
                p0, p1 = rib(a0, t * R), rib(a1, t * R)
                q = p0 * (1 - s) + p1 * s
                bulge = math.sin(math.pi * s)
                q.z -= 0.045 * t * bulge
                # Rand zwischen den Rippen leicht eingezogen (Bogenschnitt)
                inward = 1 - 0.035 * bulge * t ** 8
                row.append(P(q.x * inward, q.y * inward, q.z))
            grid.append(row)
        _sheet("canopy", grid, "fabric_light", 0.006)
        # Naht über der Rippe
        pts = [rib(a0, R * (0.03 + 0.97 * i / 12)) for i in range(13)]
        _tube("seam", [(p.x, p.y, p.z + 0.004) for p in pts], 0.006, "fabric_light", res=2)
        # Rippe unter dem Stoff und Strebe zum Läufer
        _tube("rib", [(p.x * 0.995, p.y * 0.995, p.z - 0.02) for p in pts], 0.007, "graphite", res=1)
        q = rib(a0, R * 0.5)
        _tube("strut", [(0, 0, apex - 0.62), (q.x, q.y, q.z - 0.02)], 0.006, "graphite", res=1)
        # Rippenendkappe
        e = rib(a0, R)
        _tube("tipcap", [(e.x * 0.99, e.y * 0.99, e.z - 0.01), (e.x * 1.005, e.y * 1.005, e.z - 0.03)], 0.01, "anthracite", res=1)
    # Windklappe mit Spalt und Spitze
    _lathe("vent", [(0.0, apex + 0.1), (0.1, apex + 0.08), (0.22, apex + 0.03), (0.23, apex + 0.015)], 0, 0, "fabric_light", 64)
    cylinder("ventpost", 0, 0, apex - 0.05, apex + 0.1, 0.03, "anthracite", 32)
    _lathe("finial", [(0.0, apex + 0.135), (0.012, apex + 0.132), (0.02, apex + 0.115), (0.022, apex + 0.1), (0.0, apex + 0.1)], 0, 0, "graphite", 32)
    # Mast, Läufer, Kurbel
    cylinder("pole", 0, 0, 0.08, apex, 0.024, "anthracite", 32)
    cylinder("runner", 0, 0, apex - 0.68, apex - 0.56, 0.035, "anthracite", 32, 0.005)
    cylinder("crank", 0, 0, 1.05, 1.17, 0.034, "graphite", 32, 0.004)
    box("crankarm", 0.03, -0.01, 1.1, 0.12, 0.01, 1.12, "graphite", 0.003)
    # Sockel: Granitplatte mit Edelstahlhülse
    box("base", -0.28, -0.28, 0.0, 0.28, 0.28, 0.07, "concrete_dark", 0.01)
    cylinder("sleeve", 0, 0, 0.07, 0.3, 0.04, "steel", 32, 0.004)
    cylinder("collar", 0, 0, 0.07, 0.09, 0.07, "steel", 32, 0.004)


# ------------------------------------------------------------------ Sonnensegel


def shade_sail(w: float, d: float, h: float):
    """Sonnensegel dreieckig, gegeneinander verwunden (Masten unterschiedlich hoch), Ränder bogenförmig geschnitten"""
    _extra_mats()
    masts = [(-w / 2 + 0.15, d / 2 - 0.2, h), (w / 2 - 0.15, d / 2 - 0.55, h - 0.5), (-w * 0.12, -d / 2 + 0.15, h - 0.2)]
    gx = sum(m_[0] for m_ in masts) / 3
    gy = sum(m_[1] for m_ in masts) / 3
    corners = []
    for mx, my, mz in masts:
        dx, dy = gx - mx, gy - my
        L = math.hypot(dx, dy)
        k = 0.32 / L
        corners.append(Vector((mx + dx * k, my + dy * k, mz - 0.12)))
        # Mast leicht nach außen geneigt, Fußplatte im Boden
        bx, by = mx + dx / L * 0.14, my + dy / L * 0.14
        _tube("mast", [(bx, by, 0.0), (mx, my, mz + 0.04)], 0.045, "anthracite", res=4)
        _tube("mastcap", [(mx, my, mz + 0.03), (mx, my, mz + 0.07)], 0.05, "graphite", res=4)
        box("plate", bx - 0.16, by - 0.16, -0.01, bx + 0.16, by + 0.16, 0.02, "concrete", 0.006)
        _tube("collar", [(bx, by, 0.0), (bx, by, 0.12)], 0.055, "anthracite", res=4)
    A, B, C = corners
    G = (A + B + C) / 3
    N = 36
    rows = []
    for i in range(N + 1):
        row = []
        for j in range(N + 1):
            # Raster über dem Dreieck: Zeilen zerfallen zur Spitze C hin in einen Punkt
            a = 1 - i / N
            if i == N:
                b_ = 0.0
            else:
                b_ = (1 - a) * j / N
            c = 1 - a - b_
            p = A * a + B * b_ + C * c
            # Ränder bogenförmig nach innen ziehen, Fläche in der Mitte leicht durchhängen
            pull = 1.15 * (a * b_ + b_ * c + c * a)
            q = p + (G - p) * pull
            q.z = p.z - 0.18 * 27 * a * b_ * c * 0.6 + (G.z - p.z) * pull
            row.append(P(q.x, q.y, q.z))
        rows.append(row)
    # Raster ist an der Spitze C entartet: Faces mit doppelten Punkten verschmelzen
    ob = _sheet("sail", rows, "fabric_light", 0.004)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-5)
    bm.to_mesh(ob.data)
    bm.free()
    for p in ob.data.polygons:
        p.use_smooth = True
    # Randseile (Saum) entlang der drei Kanten, Spannseile zu den Masten
    def edge_pts(fn):
        out = []
        for k in range(N + 1):
            t = k / N
            out.append(fn(t))
        return out

    def bary(a, b_, c):
        p = A * a + B * b_ + C * c
        pull = 1.15 * (a * b_ + b_ * c + c * a)
        q = p + (G - p) * pull
        z = p.z - 0.18 * 27 * a * b_ * c * 0.6 + (G.z - p.z) * pull
        return (q.x, q.y, z)

    _tube("hem", edge_pts(lambda t: bary(1 - t, t, 0)), 0.012, "fabric_light", res=2)
    _tube("hem", edge_pts(lambda t: bary(0, 1 - t, t)), 0.012, "fabric_light", res=2)
    _tube("hem", edge_pts(lambda t: bary(t, 0, 1 - t)), 0.012, "fabric_light", res=2)
    for (mx, my, mz), cn in zip(masts, corners):
        _tube("tension", [(cn.x, cn.y, cn.z), (mx, my, mz - 0.06)], 0.006, "steel", res=1)
        _tube("ring", [(cn.x, cn.y, cn.z - 0.012), (cn.x, cn.y, cn.z + 0.012)], 0.03, "steel", res=2)


# ------------------------------------------------------------------ Kugelgrill


def kettle_grill(w: float, d: float, h: float):
    """Kugelgrill Ø 57 cm: Kessel und Deckel schwarz emailliert, Dreibein aus Edelstahl, zwei Räder, Aschetopf"""
    _extra_mats()
    R = 0.285
    zr = h - 0.24  # Deckelfuge
    dep, dome = 0.24, 0.2
    # Kessel (untere Halbschale) und Deckel (flachere Kuppel), Fuge leicht abgesetzt
    prof_b = [(R * math.sin(t), zr - dep * math.cos(t)) for t in (k / 24 * math.pi / 2 for k in range(25))]
    prof_b[0] = (0.0, zr - dep)
    _lathe("bowl", prof_b, 0, 0, "enamel", 96)
    _lathe("bowlrim", [(R - 0.004, zr - 0.012), (R + 0.006, zr - 0.006), (R + 0.006, zr - 0.002), (R - 0.004, zr)], 0, 0, "enamel", 96)
    prof_l = [(R * 1.012 * math.cos(t), zr + 0.004 + dome * math.sin(t)) for t in (k / 24 * math.pi / 2 for k in range(25))]
    prof_l[-1] = (0.0, zr + 0.004 + dome)
    _lathe("lid", prof_l, 0, 0, "enamel", 96)
    _lathe("lidlip", [(R * 1.012 - 0.002, zr + 0.002), (R * 1.012 + 0.004, zr + 0.006), (R * 1.012 + 0.002, zr + 0.024), (R * 1.0, zr + 0.03)], 0, 0, "enamel", 96)
    ztop = zr + 0.004 + dome

    def dome_z(r):
        return zr + 0.004 + dome * math.sqrt(max(0.0, 1 - (r / (R * 1.012)) ** 2))

    # Deckelgriff mit Hitzeschild, Lüftungsschieber, Thermometer
    yh = 0.13
    zh = dome_z(yh)
    box("shield", -0.07, yh - 0.025, zh - 0.01, 0.07, yh + 0.025, zh + 0.012, "steel", 0.004)
    for x in (-0.055, 0.055):
        _tube("handlepost", [(x, yh, zh), (x, yh + 0.02, zh + 0.05)], 0.008, "steel", res=2)
    _tube("handle", [(-0.075, yh + 0.022, zh + 0.055), (0.075, yh + 0.022, zh + 0.055)], 0.016, "graphite", res=3)
    cylinder("vent", 0, -0.06, dome_z(0.06) - 0.012, dome_z(0.06) + 0.006, 0.06, "steel", 48, 0.003)
    box("ventknob", -0.008, -0.11, dome_z(0.06) + 0.004, 0.008, -0.08, dome_z(0.06) + 0.02, "graphite", 0.003)
    cylinder("thermo", 0.0, 0.0, ztop - 0.008, ztop + 0.01, 0.028, "steel", 32, 0.003)
    cylinder("thermoglass", 0.0, 0.0, ztop + 0.009, ztop + 0.012, 0.022, "concrete", 32)
    # Seitengriffe am Kessel (Werkzeughaken)
    for sx in (-1, 1):
        x = sx * (R + 0.01)
        for y in (-0.06, 0.06):
            _tube("bracket", [(x, y, zr - 0.04), (x + sx * 0.04, y, zr - 0.04)], 0.006, "steel", res=1)
        _tube("sidehandle", [(x + sx * 0.045, -0.08, zr - 0.04), (x + sx * 0.045, 0.08, zr - 0.04)], 0.013, "graphite", res=2)
    # Dreibein: ein Bein vorn, zwei Radbeine hinten
    legs = []
    for ang in (90, 210, 330):
        a = math.radians(ang)
        top = (math.cos(a) * 0.2, math.sin(a) * 0.2, zr - dep + 0.07)
        foot = (math.cos(a) * (w / 2 - 0.04), math.sin(a) * (d / 2 - 0.04), 0.07 if ang != 90 else 0.0)
        _tube("leg", [top, foot], 0.013, "steel", res=3)
        _tube("legsocket", [top, (top[0] * 1.15, top[1] * 1.15, top[2] - 0.05)], 0.018, "graphite", res=2)
        legs.append(foot)
    # Fußkappe vorn
    fx, fy, _ = legs[0]
    _tube("footcap", [(fx, fy, 0.0), (fx, fy, 0.03)], 0.02, "rubber", res=2)
    # Achse und Räder hinten
    (ax0, ay0, _), (ax1, ay1, _) = legs[1], legs[2]
    _tube("axle", [(ax0 - 0.05, ay0, 0.07), (ax1 + 0.05, ay1, 0.07)], 0.007, "steel", res=1)
    for ax in (ax0 - 0.035, ax1 + 0.035):
        ob = cylinder("wheel", 0, 0, -0.018, 0.018, 0.07, "rubber", 48, 0.008)
        ob.rotation_euler = (0, math.pi / 2, 0)
        ob.location = P(ax, ay0, 0.07)
        hub = cylinder("hub", 0, 0, -0.02, 0.02, 0.03, "graphite", 24, 0.003)
        hub.rotation_euler = (0, math.pi / 2, 0)
        hub.location = P(ax, ay0, 0.07)
    # Ablagedreieck mit Aschetopf
    ring = []
    for (fx_, fy_, fz_), (tx, ty) in zip(legs, ((0, 0.2), (math.cos(math.radians(210)) * 0.2, math.sin(math.radians(210)) * 0.2), (math.cos(math.radians(330)) * 0.2, math.sin(math.radians(330)) * 0.2))):
        t = 0.62
        ring.append((tx + (fx_ - tx) * t, ty + (fy_ - ty) * t, 0.2))
    _tube("rack", ring, 0.007, "steel", closed=True, res=1)
    _lathe("ashpan", [(0.0, 0.13), (0.07, 0.133), (0.095, 0.15), (0.105, 0.205), (0.11, 0.21)], 0, 0, "graphite", 64)


GENERATORS = {
    "hollywoodSwing": hollywood_swing,
    "hammockStand": hammock_stand,
    "gardenBench": garden_bench,
    "bistroSet": bistro_set,
    "parasolRound": parasol_round,
    "shadeSail": shade_sail,
    "kettleGrill": kettle_grill,
}
