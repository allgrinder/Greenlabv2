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
  box: [number, number, number, number];
}

export class EdgeLayer {
  readonly container = new Container();
  /** Halme über Beetkanten: liegt in der Pflanzenebene über dem Mulch der Pflanzflächen, unter Sträuchern und Kronen */
  readonly bedContainer = new Container();
  private doc: Project | null = null;
  private key = '';

  constructor() {
    this.container.label = 'edges';
    this.bedContainer.label = 'bed-edges';
  }

  update(doc: Project, season: Season) {
    const grass = edgeStrip('grass');
    const key = `${season}|${grass ? 1 : 0}|${scatterSprites('pebble').length}`;
    if (doc === this.doc && key === this.key) return;
    this.doc = doc;
    this.key = key;
    for (const c of this.container.removeChildren()) c.destroy();
    for (const c of this.bedContainer.removeChildren()) c.destroy();

    const visible: PlanObject[] = [];
    for (const id of doc.layerOrder) {
      const layer = doc.layers[id];
      if (!layer.visible) continue;
      for (const oid of layer.objectOrder) if (doc.objects[oid]) visible.push(doc.objects[oid]);
    }
    const lawn: Ring[] = [];
    // Beete, Kies- und Plattenflächen, die auf dem Rasen liegen: dort hängen Halme von außen hinein
    const onLawn: Ring[] = [];
    const surfaces: Surface[] = [];
    const edged: { rings: Vec2[][]; strip: string; planting: boolean }[] = [];
    const spill: { rings: Ring[]; parts: [string, number][]; seed: number }[] = [];
    for (const o of visible) {
      if (o.type !== 'area' && o.type !== 'path' && o.type !== 'planting') continue;
      const fp = footprint(o);
      const rings = fp.flatMap((r) => [r.outer, ...r.holes].map((pts) => ({ pts, region: r, planting: o.type === 'planting' })));
      const tex = o.type === 'planting' ? (o.mulchMaterialId ? getMaterial(o.mulchMaterialId).texture : '') : getMaterial(o.materialId).texture;
      for (const r of fp) surfaces.push({ region: r, tex: o.type === 'area' ? tex : o.type, box: bbox(r.outer) });
      if (o.type === 'area' && tex === 'lawn') lawn.push(...rings);
      const e = o.edging ? EDGING_STRIP[o.edging.catalogId] : undefined;
      if (e) edged.push({ rings: rings.map((r) => r.pts), strip: e, planting: o.type === 'planting' });
      else if (o.type !== 'path' || tex !== 'stepping') {
        if (tex !== 'lawn') onLawn.push(...rings);
        const parts = spillOf(tex, season);
        if (parts.length) spill.push({ rings, parts, seed: seedFrom(o.id) });
      }
    }
    const edgedSegs = edged.flatMap((e) => e.rings.flatMap((ring) => ring.map((a, i) => [a, ring[(i + 1) % ring.length]] as const)));
    // oberster Belag an einem Punkt (Zeichenreihenfolge): nur echter Rasen, kein Weg/Beet darüber
    const topAt = (p: Vec2): string | null => {
      for (let i = surfaces.length - 1; i >= 0; i--) {
        const s = surfaces[i];
        if (p.x < s.box[0] || p.x > s.box[2] || p.y < s.box[1] || p.y > s.box[3]) continue;
        if (pointInRegion(p, s.region.outer, s.region.holes)) return s.tex;
      }
      return null;
    };
    const probeOut = (pts: Vec2[], i: number, sign: number) => {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      const n = norm(-(q.y - p.y), q.x - p.x);
      return { x: (p.x + q.x) / 2 + n.x * 0.1 * sign, y: (p.y + q.y) / 2 + n.y * 0.1 * sign };
    };
    const nearEdging = (p: Vec2) => edgedSegs.some(([a, b]) => distToSeg(p, a, b) < 0.12);
    const bedRuns: { pts: Vec2[]; closed: boolean; sign: number; planting: boolean }[] = [];
    for (const r of onLawn) {
      const pts = densify(r.pts, 0.25);
      const sign = outwardSign(pts, r.region);
      const free = pts.map((p, i) => topAt(probeOut(pts, i, sign)) === 'lawn' && !nearEdging(p));
      for (const run of runsOf(pts, free)) bedRuns.push({ ...run, sign: -sign, planting: !!r.planting });
    }

    // Kontaktschatten an Rasenkanten
    const shade = new Graphics();
    for (const r of [...lawn, ...bedRuns])
      for (const [w, a] of [[0.32, 0.05], [0.18, 0.06], [0.08, 0.08]] as const)
        shade.poly(r.pts.flatMap((p) => [p.x, p.y]), 'closed' in r ? r.closed : true).stroke({ color: 0x1b240c, alpha: a, width: w, join: 'round', cap: 'round' });
    this.container.addChild(shade);

    // Streuung über die Kanten (unter dem Gras, damit Halme darüber liegen)
    const sc = new Container();
    for (const s of spill) for (const [kind, perM] of s.parts) scatterAlong(sc, s.rings, kind, perM, s.seed + kind.length);
    this.container.addChild(sc);

    // Halme: nur dort, wo keine Einfassung liegt
    if (grass) {
      const runs: { pts: Vec2[]; closed: boolean; sign: number; planting?: boolean }[] = [...bedRuns];
      for (const r of lawn) {
        const pts = densify(r.pts, 0.25);
        const sign = outwardSign(pts, r.region);
        // grenzt der Rasen an ein Beet oder eine Fläche, hängen die Halme von deren Kontur aus hinein (bedRuns)
        const free = pts.map((p, i) => {
          const t = topAt(probeOut(pts, i, sign));
          return !nearEdging(p) && t === null;
        });
        for (const run of runsOf(pts, free)) runs.push({ ...run, sign });
      }
      for (const run of runs) {
        const mesh = stripMesh(run.pts, run.closed, grass.h, grass.w, grass.texture, run.sign);
        if (mesh) {
          mesh.tint = TINT[season];
          (run.planting ? this.bedContainer : this.container).addChild(mesh);
        }
      }
    }

    // Einfassungen obenauf: klare Kante, Gras endet daran
    for (const e of edged) {
      const strip = edgeStrip(e.strip);
      if (!strip) continue;
      for (const ring of e.rings) {
        const shadow = new Graphics();
        shadow.poly(ring.flatMap((p) => [p.x, p.y]), true).stroke({ color: 0x1b1a14, alpha: 0.18, width: strip.h * 0.9, join: 'round' });
        shadow.position.set(0.012, 0.016);
        // Rabatten: Einfassung über dem Mulch der Pflanzfläche
        const into = e.planting ? this.bedContainer : this.container;
        into.addChild(shadow);
        const mesh = stripMesh(ring, true, strip.h, strip.w, strip.texture, 1);
        if (mesh) into.addChild(mesh);
      }
    }
  }
}

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

function bbox(pts: Vec2[]): [number, number, number, number] {
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
