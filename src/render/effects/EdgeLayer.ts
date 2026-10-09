/**
 * Natürliche Kanten zwischen Belägen, über Flächen und Wegen, unter den Pflanzen:
 * - Rasenkante: in Blender gerenderter Halmstreifen, der über Wege, Platten und Beete hängt, darunter ein
 *   weicher Kontaktschatten. Wo eine Einfassung liegt, wächst kein Gras darüber.
 * - Einfassungen (Betonstein, Stahl, Corten) als gerendertes Band mit Licht und Schatten.
 * - Streuung: einzelne Kiesel, Basaltsplitt, Rindenstücke und Laub sind über die Kanten gewandert –
 *   zwischen allen Belägen und Beeten, nicht nur am Rasen.
 */
import { Container, Graphics, MeshSimple, Sprite, type Texture } from 'pixi.js';
import { getMaterial } from '../../core/catalog/materials';
import { footprint } from '../../core/geometry/objects';
import { pointInRegion } from '../../core/geometry/polygon';
import type { FlatRegion } from '../../core/geometry/shape';
import type { Season } from '../../core/growth';
import type { PlanObject, Project, Vec2 } from '../../core/model/types';
import { edgeStrip, scatterSprites } from '../assets/groundAssets';
import { rng, seedFrom } from '../util/rng';

// Blender-Halme sind heller beleuchtet als die gemalte Rasenfläche: auf den Rasenton abdunkeln
const TINT: Record<Season, number> = { spring: 0xc4cab0, summer: 0xb8bea6, autumn: 0xb8ae94, winter: 0xa6a294 };

/** Einfassung (Katalog) → Kantenstreifen aus Blender */
export const EDGING_STRIP: Record<string, string> = {
  'edge.kantenstein-8x20': 'kantenstein',
  'edge.stahl-anthrazit': 'steel',
  'edge.corten': 'corten',
};

/** Welche Streuteile wandern von einem Belag über seine Kante (Art, Teile je Meter Kante) */
function spillOf(texture: string, season: Season): [string, number][] {
  const leaves: [string, number] = ['leaf', season === 'autumn' ? 1.2 : 0.18];
  switch (texture) {
    case 'gravel':
      return [['pebble', 2.2]];
    case 'basalt':
      return [['basalt', 2.2]];
    case 'mulch':
    case 'barkMulch':
      return [['bark', 1.6], leaves];
    case 'soil':
      return [leaves];
    case 'paving':
    case 'slabs':
    case 'wood':
      return [leaves];
    default:
      return [];
  }
}

interface Ring {
  pts: Vec2[];
  region: FlatRegion;
  planting?: boolean;
}

interface Surface {
  region: FlatRegion;
  tex: string;
  box: Box;
}

type Box = [number, number, number, number];

/** Kantenlauf, an dem Halme wachsen können: Punkte, Außenseite, je Punkt „frei“ (Rasen daneben, keine Einfassung) */
interface Edge {
  pts: Vec2[];
  sign: number;
  free: boolean[];
  /** Halme hängen in die Fläche hinein (Beet/Kies auf dem Rasen) statt aus dem Rasen heraus */
  inward: boolean;
  planting: boolean;
}

/** Je Objekt: Geometrie und eigene Darstellungsteile (bleiben stehen, solange sich Objekt und Nachbarn nicht ändern) */
interface Entry {
  ref: PlanObject;
  rings: Ring[];
  tex: string;
  box: Box;
  surfaces: Surface[];
  strip?: string;
  planting: boolean;
  /** Streuung und Einfassung hängen nur vom Objekt ab */
  own: Container[];
  /** Kontaktschatten und Halme hängen auch von den Nachbarn ab */
  edges: Edge[];
  grass: Container[];
}

const EMPTY_BOX: Box = [Infinity, Infinity, -Infinity, -Infinity];
const grow = (b: Box, m: number): Box => [b[0] - m, b[1] - m, b[2] + m, b[3] + m];
const hits = (a: Box, b: Box) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
const inBox = (p: Vec2, b: Box) => p.x >= b[0] && p.x <= b[2] && p.y >= b[1] && p.y <= b[3];

export class EdgeLayer {
  readonly container = new Container();
  /** Halme über Beetkanten: liegt in der Pflanzenebene über dem Mulch der Pflanzflächen, unter Sträuchern und Kronen */
  readonly bedContainer = new Container();
  // Zeichenreihenfolge: Schatten → Streuung → Halme → Einfassung; in Beeten: Halme → Einfassung
  private shadeC = new Container();
  private scatterC = new Container();
  private grassC = new Container();
  private edgingC = new Container();
  private bedGrassC = new Container();
  private bedEdgingC = new Container();
  private entries = new Map<string, Entry>();
  private doc: Project | null = null;
  private key = '';
  private order = '';

  constructor() {
    this.container.label = 'edges';
    this.bedContainer.label = 'bed-edges';
    this.container.addChild(this.shadeC, this.scatterC, this.grassC, this.edgingC);
    this.bedContainer.addChild(this.bedGrassC, this.bedEdgingC);
  }

  /**
   * Abgleich mit dem Dokument. Nur geänderte Objekte bauen ihre Streuung und Einfassung neu;
   * Halme und Schatten werden nur in der Umgebung der Änderung neu bewertet.
   */
  update(doc: Project, season: Season) {
    const grass = edgeStrip('grass');
    const key = `${season}|${grass ? 1 : 0}|${scatterSprites('pebble').length}`;
    if (doc === this.doc && key === this.key) return;
    this.doc = doc;

    const visible: PlanObject[] = [];
    for (const id of doc.layerOrder) {
      const layer = doc.layers[id];
      if (!layer.visible) continue;
      for (const oid of layer.objectOrder) {
        const o = doc.objects[oid];
        if (o && (o.type === 'area' || o.type === 'path' || o.type === 'planting')) visible.push(o);
      }
    }
    // Jahreszeit, Bilder oder Reihenfolge geändert: alles neu (die Reihenfolge entscheidet, welcher Belag oben liegt)
    const order = visible.map((o) => o.id).join(',');
    const full = key !== this.key || order !== this.order;
    this.key = key;
    this.order = order;

    // geänderte Bereiche sammeln (alte und neue Lage)
    const changed: Box[] = [];
    const seen = new Set<string>();
    for (const o of visible) {
      seen.add(o.id);
      const e = this.entries.get(o.id);
      if (e && e.ref === o && !full) continue;
      if (e) {
        changed.push(e.box);
        this.drop(e);
      }
      const n = this.makeEntry(o, season);
      this.entries.set(o.id, n);
      changed.push(n.box);
    }
    for (const [id, e] of this.entries)
      if (!seen.has(id)) {
        changed.push(e.box);
        this.drop(e);
        this.entries.delete(id);
      }
    if (!changed.length) return;

    // Umgebung der Änderung: Kanten, deren Nachbarschaft sich geändert haben kann
    const zones = changed.filter((b) => b[0] <= b[2]).map((b) => grow(b, 0.5));
    const list = visible.map((o) => this.entries.get(o.id)!);
    const surfaces = list.flatMap((e) => e.surfaces);
    const edgedSegs = list.filter((e) => e.strip).flatMap((e) => e.rings.flatMap((r) => r.pts.map((a, i) => [a, r.pts[(i + 1) % r.pts.length]] as const)));
    const topAt = (p: Vec2): string | null => {
      for (let i = surfaces.length - 1; i >= 0; i--) {
        const sf = surfaces[i];
        if (!inBox(p, sf.box)) continue;
        if (pointInRegion(p, sf.region.outer, sf.region.holes)) return sf.tex;
      }
      return null;
    };
    const nearEdging = (p: Vec2) => edgedSegs.some(([a, b]) => distToSeg(p, a, b) < 0.12);

    for (const e of list) {
      if (!e.edges.length) continue;
      const fresh = full || e.grass.length === 0 && e.edges.some((x) => x.free.length === 0);
      if (!fresh && !zones.some((z) => hits(z, e.box))) continue;
      // nur Punkte in der Nähe der Änderung neu bewerten
      for (const ed of e.edges) {
        const all = fresh || ed.free.length !== ed.pts.length;
        if (all) ed.free = new Array(ed.pts.length).fill(false);
        ed.pts.forEach((p, i) => {
          if (!all && !zones.some((z) => inBox(p, z))) return;
          const t = topAt(probeOut(ed.pts, i, ed.sign));
          ed.free[i] = !nearEdging(p) && (ed.inward ? t === 'lawn' : t === null);
        });
      }
      for (const c of e.grass) c.destroy({ children: true });
      e.grass = this.buildGrass(e, season, grass);
    }
  }

  private makeEntry(o: PlanObject, season: Season): Entry {
    const fp = footprint(o);
    const planting = o.type === 'planting';
    const rings = fp.flatMap((r) => [r.outer, ...r.holes].map((pts) => ({ pts, region: r, planting })));
    const tex = o.type === 'planting' ? (o.mulchMaterialId ? getMaterial(o.mulchMaterialId).texture : '') : o.type === 'area' || o.type === 'path' ? getMaterial(o.materialId).texture : '';
    const surfaces = fp.map((r) => ({ region: r, tex: o.type === 'area' ? tex : o.type, box: bbox(r.outer) }));
    const box = surfaces.reduce<Box>((b, sf) => [Math.min(b[0], sf.box[0]), Math.min(b[1], sf.box[1]), Math.max(b[2], sf.box[2]), Math.max(b[3], sf.box[3])], EMPTY_BOX);
    const edging = 'edging' in o && o.edging ? EDGING_STRIP[o.edging.catalogId] : undefined;
    const e: Entry = { ref: o, rings, tex, box, surfaces, strip: edging, planting, own: [], edges: [], grass: [] };

    const lawn = o.type === 'area' && tex === 'lawn';
    const stepping = o.type === 'path' && tex === 'stepping';
    if (lawn || (!edging && !stepping && tex !== 'lawn'))
      e.edges = rings.map((r) => {
        const pts = densify(r.pts, 0.25);
        const sign = outwardSign(pts, r.region);
        return { pts, sign, free: [], inward: !lawn, planting };
      });

    // Streuung über die Kanten (unter den Halmen)
    if (!edging && !stepping) {
      const parts = spillOf(tex, season);
      if (parts.length) {
        const sc = new Container();
        for (const [kind, perM] of parts) scatterAlong(sc, rings, kind, perM, seedFrom(o.id) + kind.length);
        this.scatterC.addChild(sc);
        e.own.push(sc);
      }
    }
    // Einfassung obenauf: klare Kante, Gras endet daran
    const strip = edging ? edgeStrip(edging) : undefined;
    if (strip) {
      const c = new Container();
      for (const r of rings) {
        const shadow = new Graphics();
        shadow.poly(r.pts.flatMap((p) => [p.x, p.y]), true).stroke({ color: 0x1b1a14, alpha: 0.18, width: strip.h * 0.9, join: 'round' });
        shadow.position.set(0.012, 0.016);
        c.addChild(shadow);
        const mesh = stripMesh(r.pts, true, strip.h, strip.w, strip.texture, 1);
        if (mesh) c.addChild(mesh);
      }
      // Rabatten: Einfassung über dem Mulch der Pflanzfläche
      (planting ? this.bedEdgingC : this.edgingC).addChild(c);
      e.own.push(c);
    }
    return e;
  }

  /** Kontaktschatten und Halme entlang der freien Läufe eines Objekts */
  private buildGrass(e: Entry, season: Season, grass: ReturnType<typeof edgeStrip>): Container[] {
    const shade = new Graphics();
    const blades = new Container();
    for (const ed of e.edges) {
      const runs = runsOf(ed.pts, ed.free);
      // Rasenflächen: Schatten entlang der ganzen Kontur; Beete auf dem Rasen nur, wo Rasen angrenzt
      const shaded = ed.inward ? runs : [{ pts: ed.pts, closed: true }];
      for (const r of shaded)
        for (const [w, a] of [[0.32, 0.05], [0.18, 0.06], [0.08, 0.08]] as const)
          shade.poly(r.pts.flatMap((p) => [p.x, p.y]), r.closed).stroke({ color: 0x1b240c, alpha: a, width: w, join: 'round', cap: 'round' });
      if (!grass) continue;
      for (const run of runs) {
        const mesh = stripMesh(run.pts, run.closed, grass.h, grass.w, grass.texture, ed.inward ? -ed.sign : ed.sign);
        if (mesh) {
          mesh.tint = TINT[season];
          blades.addChild(mesh);
        }
      }
    }
    this.shadeC.addChild(shade);
    (e.planting ? this.bedGrassC : this.grassC).addChild(blades);
    return [shade, blades];
  }

  private drop(e: Entry) {
    for (const c of [...e.own, ...e.grass]) c.destroy({ children: true });
    e.own = [];
    e.grass = [];
  }
}

const probeOut = (pts: Vec2[], i: number, sign: number) => {
  const p = pts[i];
  const q = pts[(i + 1) % pts.length];
  const n = norm(-(q.y - p.y), q.x - p.x);
  return { x: (p.x + q.x) / 2 + n.x * 0.1 * sign, y: (p.y + q.y) / 2 + n.y * 0.1 * sign };
};

/** Ring in gleichmäßige Abstände unterteilen (damit Läufe genau an Einfassungen enden) */
function densify(ring: Vec2[], step: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return out;
}

function distToSeg(p: Vec2, a: Vec2, b: Vec2) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy || 1e-9;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

function bbox(pts: Vec2[]): Box {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return [x0, y0, x1, y1];
}

/** Zusammenhängende Abschnitte eines Rings, deren Punkte `free` sind (z. B. nicht an einer Einfassung) */
function runsOf(ring: Vec2[], free: boolean[]): { pts: Vec2[]; closed: boolean }[] {
  if (free.every(Boolean)) return [{ pts: ring, closed: true }];
  const n = ring.length;
  const start = free.indexOf(false);
  const runs: { pts: Vec2[]; closed: boolean }[] = [];
  let cur: Vec2[] = [];
  for (let k = 1; k <= n; k++) {
    const i = (start + k) % n;
    if (free[i]) cur.push(ring[i]);
    else if (cur.length) {
      if (cur.length > 1) runs.push({ pts: cur, closed: false });
      cur = [];
    }
  }
  if (cur.length > 1) runs.push({ pts: cur, closed: false });
  return runs;
}

/** +1, wenn die rechte Seite (Bildoberkante des Streifens) außerhalb der Region liegt */
function outwardSign(pts: Vec2[], region: FlatRegion): number {
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 0.02) continue;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    const probe = { x: (a.x + b.x) / 2 + nx * 0.03, y: (a.y + b.y) / 2 + ny * 0.03 };
    return pointInRegion(probe, region.outer, region.holes) ? -1 : 1;
  }
  return 1;
}

/** Texturstreifen entlang einer Linie; die Bildoberkante liegt auf der Seite `sign` */
function stripMesh(pts0: Vec2[], closed: boolean, depth: number, repeat: number, texture: Texture, sign: number): MeshSimple | null {
  if (pts0.length < 2) return null;
  const pts = closed ? [...pts0, pts0[0]] : pts0;
  const n = pts.length;
  const verts: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  let u = 0;
  const half = depth / 2;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const prev = i > 0 ? pts[i - 1] : closed ? pts[n - 2] : null;
    const next = i < n - 1 ? pts[i + 1] : closed ? pts[1] : null;
    const n1 = prev ? norm(-(p.y - prev.y), p.x - prev.x) : null;
    const n2 = next ? norm(-(next.y - p.y), next.x - p.x) : null;
    const a = n1 ?? n2!;
    const b = n2 ?? n1!;
    let mx = a.x + b.x;
    let my = a.y + b.y;
    const ml = Math.hypot(mx, my) || 1;
    mx /= ml;
    my /= ml;
    const dot = Math.max(0.45, mx * b.x + my * b.y);
    const k = (half / dot) * sign;
    if (i > 0) u += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) / repeat;
    verts.push(p.x + mx * k, p.y + my * k, p.x - mx * k, p.y - my * k);
    uvs.push(u, 0, u, 1);
    if (i > 0) {
      const j = (i - 1) * 2;
      idx.push(j, j + 1, j + 2, j + 2, j + 1, j + 3);
    }
  }
  return new MeshSimple({ texture, vertices: new Float32Array(verts), uvs: new Float32Array(uvs), indices: new Uint32Array(idx) });
}

function norm(x: number, y: number) {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
}

/** Streuteile entlang der Kontur, überwiegend knapp außerhalb (über die Kante gewandert), einige innen */
function scatterAlong(c: Container, rings: Ring[], kind: string, perM: number, seed: number) {
  const parts = scatterSprites(kind);
  if (!parts.length) return;
  const r = rng(seed);
  for (const ring of rings) {
    const pts = ring.pts;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 1e-6) continue;
      const nx = -(b.y - a.y) / len;
      const ny = (b.x - a.x) / len;
      // Außenseite dieses Segments
      const mid = { x: (a.x + b.x) / 2 + nx * 0.03, y: (a.y + b.y) / 2 + ny * 0.03 };
      const out = pointInRegion(mid, ring.region.outer, ring.region.holes) ? -1 : 1;
      const n = Math.round(len * perM * (0.6 + r() * 0.8));
      for (let k = 0; k < n; k++) {
        const t = r() * len;
        // meist wenige Zentimeter, selten weiter verstreut
        const d = (r() < 0.8 ? r() * 0.08 : 0.08 + r() * 0.22) * out - (r() < 0.2 ? r() * 0.04 * out : 0);
        const part = parts[Math.floor(r() * parts.length)];
        const s = new Sprite(part.texture);
        s.anchor.set(0.5);
        s.position.set(a.x + ((b.x - a.x) * t) / len + nx * d, a.y + ((b.y - a.y) * t) / len + ny * d);
        const k2 = 0.8 + r() * 0.45;
        s.scale.set((part.w * k2) / part.texture.width, (part.h * k2) / part.texture.height);
        s.rotation = r() * Math.PI * 2;
        c.addChild(s);
      }
    }
  }
}
