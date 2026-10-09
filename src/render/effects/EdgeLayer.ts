/**
 * Natürliche Rasenkanten: Entlang jeder Rasenkontur liegt ein in Blender gerenderter Halmstreifen, der über
 * Wege, Platten und Beete hängt; darunter ein weicher Kontaktschatten (der Rasen steht etwas höher).
 * Liegt über Flächen und Wegen, unter den Pflanzen.
 */
import { Container, Graphics, MeshSimple } from 'pixi.js';
import { getMaterial } from '../../core/catalog/materials';
import { footprint } from '../../core/geometry/objects';
import { pointInRegion } from '../../core/geometry/polygon';
import type { FlatRegion } from '../../core/geometry/shape';
import type { Season } from '../../core/growth';
import type { Project, Vec2 } from '../../core/model/types';
import { edgeStrip } from '../assets/groundAssets';

// Blender-Halme sind heller beleuchtet als die gemalte Rasenfläche: auf den Rasenton abdunkeln
const TINT: Record<Season, number> = { spring: 0xc4cab0, summer: 0xb8bea6, autumn: 0xb8ae94, winter: 0xa6a294 };

export class EdgeLayer {
  readonly container = new Container();
  private doc: Project | null = null;
  private key = '';

  constructor() {
    this.container.label = 'edges';
  }

  update(doc: Project, season: Season) {
    const strip = edgeStrip('grass');
    const key = `${season}|${strip ? 1 : 0}`;
    if (doc === this.doc && key === this.key) return;
    this.doc = doc;
    this.key = key;
    for (const c of this.container.removeChildren()) c.destroy();
    const regions: FlatRegion[] = [];
    for (const id of doc.layerOrder) {
      const layer = doc.layers[id];
      if (!layer.visible) continue;
      for (const oid of layer.objectOrder) {
        const o = doc.objects[oid];
        if (o?.type === 'area' && getMaterial(o.materialId).texture === 'lawn') regions.push(...footprint(o));
      }
    }
    if (!regions.length) return;
    // Kontaktschatten: weicher Verlauf beidseits der Kante
    const shade = new Graphics();
    for (const r of regions)
      for (const ring of [r.outer, ...r.holes]) {
        for (const [w, a] of [[0.32, 0.05], [0.18, 0.06], [0.08, 0.08]] as const) {
          shade.poly(ring.flatMap((p) => [p.x, p.y]), true).stroke({ color: 0x1b240c, alpha: a, width: w, join: 'round' });
        }
      }
    this.container.addChild(shade);
    if (!strip) return;
    for (const r of regions)
      for (const ring of [r.outer, ...r.holes]) {
        const mesh = stripMesh(ring, r, strip.w, strip.h, strip.texture);
        if (mesh) {
          mesh.tint = TINT[season];
          this.container.addChild(mesh);
        }
      }
  }
}

/** Halmstreifen entlang eines geschlossenen Rings; Bildoberkante (Halme nach außen) zeigt vom Rasen weg */
function stripMesh(ring: Vec2[], region: FlatRegion, repeat: number, depth: number, texture: MeshSimple['texture']): MeshSimple | null {
  const n = ring.length;
  if (n < 3) return null;
  // Außenrichtung bestimmen: Probe neben dem ersten längeren Segment
  let sign = 1;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 0.05) continue;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    const probe = { x: (a.x + b.x) / 2 + nx * 0.03, y: (a.y + b.y) / 2 + ny * 0.03 };
    sign = pointInRegion(probe, region.outer, region.holes) ? -1 : 1;
    break;
  }
  const pts = [...ring, ring[0]];
  const verts: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  let u = 0;
  const half = depth / 2;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const prev = pts[i === 0 ? n - 1 : i - 1];
    const next = pts[i === pts.length - 1 ? 1 : i + 1];
    // gemittelte Normale (Gehrung), begrenzt gegen Spitzen an scharfen Ecken
    const n1 = norm(-(p.y - prev.y), p.x - prev.x);
    const n2 = norm(-(next.y - p.y), next.x - p.x);
    let mx = n1.x + n2.x;
    let my = n1.y + n2.y;
    const ml = Math.hypot(mx, my) || 1;
    mx /= ml;
    my /= ml;
    const dot = Math.max(0.45, mx * n2.x + my * n2.y);
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
