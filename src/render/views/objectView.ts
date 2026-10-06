/**
 * Baut die Pixi-Darstellung eines Planobjekts. Pro Objekt entstehen ein Hauptknoten
 * und optional ein Schatten (wird in den gemeinsamen, weichgezeichneten Schatten-Layer gehängt).
 */
import { Container, Graphics, Text, type FillInput, type StrokeInput } from 'pixi.js';
import { getItem } from '../../core/catalog/items';
import { getMaterial } from '../../core/catalog/materials';
import { getSpecies } from '../../core/catalog/plants';
import { footprint, hedgeWidth, itemSize, plantDiameter } from '../../core/geometry/objects';
import type { Polygon } from '../../core/geometry/polygon';
import { type FlatRegion, flattenPath } from '../../core/geometry/shape';
import type { PlanObject, Vec2 } from '../../core/model/types';
import { DARK_SYMBOLS, drawItem } from '../symbols/items';
import { waterGradient } from '../symbols/gradients';
import { drawHedge, drawPlanting, drawShrub, drawSmallPlant, drawTree } from '../symbols/plants';
import { materialPattern } from '../textures/materialTextures';
import { seedFrom } from '../util/rng';

/** Schattenversatz je Meter Objekthöhe (Sonne aus Nordwest, wie im Design) */
export const SHADOW_VEC: Vec2 = { x: 0.12, y: 0.15 };
const SHADOW_COLOR = 0x1e2a1b;

export interface ObjectView {
  node: Container;
  shadow: Graphics | null;
}

export interface ViewContext {
  /** Detailstufe 0–2 abhängig vom Zoom */
  lod: number;
}

const flat = (pts: Polygon) => pts.flatMap((p) => [p.x, p.y]);

function fillRegions(g: Graphics, regions: FlatRegion[], fill: FillInput) {
  for (const r of regions) {
    g.poly(flat(r.outer), true).fill(fill);
    for (const h of r.holes) g.poly(flat(h), true).cut();
  }
}

function strokeRegions(g: Graphics, regions: FlatRegion[], stroke: StrokeInput) {
  // Runde Ecken: flachgelegte Kurven haben viele kurze Segmente, Gehrungen würden zacken
  if (typeof stroke === 'object' && stroke !== null && 'width' in stroke) stroke = { join: 'round', ...stroke };
  for (const r of regions) {
    g.poly(flat(r.outer), true);
    for (const h of r.holes) g.poly(flat(h), true);
    g.stroke(stroke);
  }
}

function hull(pts: Vec2[]): Vec2[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cr = (o: Vec2, a: Vec2, b: Vec2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Vec2[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cr(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Vec2[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cr(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Extrudierter Schatten eines Grundrisses mit Höhe h */
function castShadow(g: Graphics, outline: Vec2[], h: number, alpha = 1) {
  const d = { x: SHADOW_VEC.x * h, y: SHADOW_VEC.y * h };
  g.poly(flat(hull(outline.concat(outline.map((p) => ({ x: p.x + d.x, y: p.y + d.y }))))), true).fill({ color: SHADOW_COLOR, alpha });
}

function labelText(text: string, sizeM: number, dark: boolean): Text {
  const px = 48;
  const t = new Text({
    text,
    style: {
      fontFamily: 'Newsreader, Georgia, serif',
      fontStyle: 'italic',
      fontSize: px,
      fill: dark ? 'rgba(255,255,255,0.85)' : '#2D3033',
      stroke: dark ? undefined : { color: 'rgba(250,248,240,0.85)', width: px * 0.22, join: 'round' },
      padding: 8,
    },
    resolution: 2,
  });
  t.anchor.set(0.5, 0.75);
  t.scale.set(sizeM / px);
  return t;
}

export function buildObjectView(o: PlanObject, ctx: ViewContext): ObjectView {
  const node = new Container();
  node.label = o.id;
  const g = new Graphics();
  node.addChild(g);
  let shadow: Graphics | null = null;
  const seed = seedFrom(o.id);

  switch (o.type) {
    case 'area': {
      const m = getMaterial(o.materialId);
      const fp = footprint(o);
      const rot = o.region.outer.kind === 'rect' ? o.region.outer.rotationDeg : 0;
      const origin = o.region.outer.kind === 'rect' ? o.region.outer.center : fp[0]?.outer[0];
      if (m.texture === 'water') {
        // Uferkante, Wasserverlauf, Wellen
        strokeRegions(g, fp, { color: 0x9e9585, width: 0.6, join: 'round' });
        fillRegions(g, fp, waterGradient());
        fillRegions(g, fp, materialPattern(m));
        fillRegions(g, fp, { color: 0x47767f, alpha: 0.35 });
        strokeRegions(g, fp, { color: 0xc3baaa, width: 0.12, join: 'round' });
      } else {
        fillRegions(g, fp, materialPattern(m, origin, rot));
        const edge = { gravel: 0xa69c8c, paving: 0x9b8f7d, wood: 0x7e5c3d } as Record<string, number>;
        if (edge[m.texture]) strokeRegions(g, fp, { color: edge[m.texture], width: m.texture === 'wood' ? 0.045 : 0.08 });
      }
      if (o.edging) strokeRegions(g, fp, { color: 0xa3998a, width: 0.09 });
      break;
    }
    case 'path': {
      const m = getMaterial(o.materialId);
      const fp = footprint(o);
      fillRegions(g, fp, materialPattern(m));
      if (o.edging) strokeRegions(g, fp, { color: 0xa3998a, width: 0.09, join: 'round' });
      break;
    }
    case 'planting': {
      const fp = footprint(o);
      if (o.mulchMaterialId) fillRegions(g, fp, materialPattern(getMaterial(o.mulchMaterialId)));
      strokeRegions(g, fp, { color: 0xa39886, width: 0.1 });
      const mix = o.mix.map((x) => ({ sp: getSpecies(x.speciesId), share: x.share }));
      if (ctx.lod >= 1) for (const r of fp) drawPlanting(g, r, mix, o.perSquareMeter, seed);
      break;
    }
    case 'hedge': {
      const sp = getSpecies(o.speciesId);
      const w = hedgeWidth(o);
      const fp = footprint(o);
      const line = flattenPath(o.centerline, 0.02);
      drawHedge(g, fp, line, w, sp);
      shadow = new Graphics();
      for (const r of fp) for (let k = 1; k <= 3; k++) {
        const d = { x: SHADOW_VEC.x * o.height * (k / 3), y: SHADOW_VEC.y * o.height * (k / 3) };
        shadow.poly(flat(r.outer.map((p) => ({ x: p.x + d.x, y: p.y + d.y }))), true).fill({ color: SHADOW_COLOR, alpha: 0.5 });
      }
      break;
    }
    case 'plant': {
      const sp = getSpecies(o.speciesId);
      const d = plantDiameter(o);
      if (sp.kind === 'tree') drawTree(g, o.position, d, sp, seed, ctx.lod);
      else if (sp.kind === 'shrub' || sp.kind === 'hedge') drawShrub(g, o.position, d, sp, seed);
      else drawSmallPlant(g, o.position, d, sp);
      if (sp.kind === 'tree' || sp.kind === 'shrub') {
        const h = sp.kind === 'tree' ? Math.min(sp.heightMature, d * 1.1) : 1.2;
        const c = { x: o.position.x + SHADOW_VEC.x * h, y: o.position.y + SHADOW_VEC.y * h };
        shadow = new Graphics();
        shadow.circle(c.x, c.y, (d / 2) * 0.94).fill(SHADOW_COLOR);
        if (sp.kind === 'tree') shadow.moveTo(o.position.x, o.position.y).lineTo(c.x, c.y).stroke({ color: SHADOW_COLOR, width: 0.25 });
      }
      break;
    }
    case 'item': {
      const it = getItem(o.catalogId);
      const s = itemSize(o);
      const local = new Graphics();
      drawItem(local, it.symbol, s.width, s.depth, seed);
      local.position.set(o.position.x, o.position.y);
      local.rotation = (o.rotationDeg * Math.PI) / 180;
      node.addChild(local);
      if (s.height > 0) {
        shadow = new Graphics();
        castShadow(shadow, footprint(o)[0].outer, s.height, it.category === 'greenhouse' ? 0.45 : 1);
      }
      if (o.name && DARK_SYMBOLS.has(it.symbol)) {
        const t = labelText(o.name, it.category === 'building' ? 0.75 : 0.55, true);
        t.position.set(o.position.x, o.position.y + 0.3);
        node.addChild(t);
      }
      break;
    }
    case 'text': {
      const t = labelText(o.text, o.sizeM, false);
      t.position.set(o.position.x, o.position.y);
      t.rotation = (o.rotationDeg * Math.PI) / 180;
      node.addChild(t);
      break;
    }
    case 'lamp': {
      g.circle(o.position.x, o.position.y, 0.23).fill(0xfbf8f1).stroke({ color: 0x2f3234, width: 0.05 });
      g.circle(o.position.x, o.position.y, 0.08).fill(0xc9963f);
      break;
    }
    case 'dimension':
      // Bemaßungen zeichnet der Overlay-Layer im Bildschirmraum
      break;
  }
  return { node, shadow };
}
