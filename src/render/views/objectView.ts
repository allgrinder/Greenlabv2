/**
 * Baut die Pixi-Darstellung eines Planobjekts abhängig von den Ansichtsparametern
 * (Zoomstufe, Jahre ab heute, Jahreszeit, Linse, Tag/Nacht).
 * Schatten entstehen zentral im ShadowLayer aus dem Sonnenstand.
 */
import { Container, Graphics, Sprite, Text, type FillInput, type StrokeInput } from 'pixi.js';
import { getItem } from '../../core/catalog/items';
import { getMaterial } from '../../core/catalog/materials';
import { getSpecies } from '../../core/catalog/plants';
import { diameterAt, hedgeWidthAt, inBloom, isBare, LAWN_COLOR, seasonColor, type Season } from '../../core/growth';
import { footprint, itemSize } from '../../core/geometry/objects';
import { offsetPolyline } from '../../core/geometry/clip';
import type { Polygon } from '../../core/geometry/polygon';
import { type FlatRegion, flattenPath } from '../../core/geometry/shape';
import type { PlanObject, Vec2 } from '../../core/model/types';
import type { LensTab } from '../../state/types';
import { DARK_SYMBOLS, itemSprite } from '../symbols/items';
import { waterGradient } from '../symbols/gradients';
import { drawPlanting } from '../symbols/plants';
import { crownSprite, espalierNode, hedgeNode, perennialSprite, plantingNode, scatterNode } from '../symbols/plantSprites';
import { drawDrip, drawFixture, drawLampDay, drawPipe, drawSprinkler } from '../symbols/tech';
import { isOrganic, lawnMacroPattern, macroPattern, materialPattern, meadowMacroPattern } from '../textures/materialTextures';
import { fringe, surfaceDetails } from './surfaceDetail';
import { plantAssetSprite } from '../assets/plantAssets';
import { buildSolid, type Tilt } from './obliqueView';
import { hex, rng, seedFrom } from '../util/rng';
import { edgeStrip, steppingStones } from '../assets/groundAssets';
import { EDGING_STRIP } from '../effects/EdgeLayer';


export interface ObjectView {
  node: Container;
  /** Schrägansicht: Körper, der nach Tiefe sortiert über den Ebenen liegt */
  depth?: number;
}

export interface ViewContext {
  /** Detailstufe 0–2 abhängig vom Zoom */
  lod: number;
  years: number;
  season: Season;
  lens: LensTab;
  night: boolean;
  northDeg: number;
  /** Schrägansicht (null = Draufsicht) */
  tilt: Tilt | null;
  /** Grundstückskontur (Rabatten: Kanten daran sind die Rückseite) */
  site?: Vec2[];
}

/**
 * Schlüssel der Parameter, von denen die Darstellung eines Objekts abhängt.
 * Ändert er sich, wird der Knoten neu gebaut; sonst bleibt er auf der GPU.
 */
export function viewKey(o: PlanObject, c: ViewContext): string {
  return `${baseKey(o, c)}|${c.tilt ? 'o' : ''}`;
}

function baseKey(o: PlanObject, c: ViewContext): string {
  switch (o.type) {
    case 'plant':
      return `${c.years}|${c.season}|${c.lens === 'growth'}|${getSpecies(o.speciesId).kind === 'tree' ? c.lod : 0}`;
    case 'hedge':
    case 'espalier':
      return `${c.years}|${c.season}`;
    case 'planting':
    case 'scatter':
      return `${c.season}|${c.lod}`;
    case 'area':
    case 'path':
      // Details (Gänseblümchen, Herbstlaub) hängen von der Jahreszeit ab
      return c.season;
    case 'sprinkler':
      return c.lens === 'irrigation' ? 'irr' : '';
    case 'lamp':
      return `${c.night}|${c.northDeg}`;
    default:
      return '';
  }
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

export function labelText(text: string, sizeM: number, dark: boolean): Text {
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

/** Wachstumsringe (Screen 07): gestrichelt Endgröße, gepunktet heutige Größe */
function growthRings(g: Graphics, c: { x: number; y: number }, today: number, mature: number) {
  const ring = (r: number, on: number, off: number, color: number, width: number) => {
    const n = Math.max(12, Math.round((2 * Math.PI * r) / (on + off)));
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = a0 + (on / (on + off)) * ((Math.PI * 2) / n);
      g.moveTo(c.x + Math.cos(a0) * r, c.y + Math.sin(a0) * r).lineTo(c.x + Math.cos(a1) * r, c.y + Math.sin(a1) * r);
    }
    g.stroke({ color, width });
  };
  ring(mature / 2, 0.25, 0.2, 0x3d5bd9, 0.055);
  ring(today / 2, 0.075, 0.15, 0x1e2224, 0.04);
}

/** Trittplatten im Schrittmaß entlang der Mittellinie, quer zur Laufrichtung, leicht versetzt und verdreht */
function steppingNode(line: Vec2[], width: number, seed: number): Container {
  const c = new Container();
  const r = rng(seed);
  const stones = steppingStones();
  const g = new Graphics();
  c.addChild(g);
  // Betonplatten 85 × 40 cm, Fuge im Rasen ca. 18 cm
  const STEP = 0.58;
  const across = Math.max(0.55, width * 0.95);
  const along = 0.4;
  let carry = STEP / 2;
  let n = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) continue;
    const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    let t = carry;
    for (; t <= len; t += STEP, n++) {
      const side = (r() - 0.5) * 0.02;
      const x = a.x + dir.x * t - dir.y * side;
      const y = a.y + dir.y * t + dir.x * side;
      // Längsseite der Platte quer zum Weg
      const rot = Math.atan2(dir.y, dir.x) + Math.PI / 2 + (r() - 0.5) * 0.05;
      const st = stones.length ? stones[Math.floor(r() * stones.length)] : null;
      if (st) {
        // Kontaktschatten: Platte liegt leicht vertieft im Rasen
        const cs = Math.cos(rot);
        const sn = Math.sin(rot);
        const corner = (u: number, v: number, ox: number, oy: number) => [x + ox + u * cs - v * sn, y + oy + u * sn + v * cs];
        g.poly([[-1, -1], [1, -1], [1, 1], [-1, 1]].flatMap(([u, v]) => corner((u * across) / 2, (v * along) / 2, 0.03, 0.04)), true).fill({ color: 0x1d2610, alpha: 0.35 });
        const s = new Sprite(st.texture);
        s.anchor.set(0.5);
        s.position.set(x, y);
        s.rotation = rot;
        // Bild ist 85 × 40 cm (Längsseite = x, mit schmalem Rand): auf Wegbreite × 40 cm strecken
        s.scale.set((st.w * (across / 0.85)) / st.texture.width, (st.h * (along / 0.4)) / st.texture.height);
        c.addChild(s);
      } else {
        // gemalter Ersatz: Kontaktschatten und gerundete Platte
        const cos = Math.cos(rot);
        const sin = Math.sin(rot);
        const pts = (ox: number, oy: number) =>
          [[-across / 2, -along / 2], [across / 2, -along / 2], [across / 2, along / 2], [-across / 2, along / 2]].flatMap(([u, v]) => [x + ox + u * cos - v * sin, y + oy + u * sin + v * cos]);
        g.poly(pts(0.02, 0.025), true).fill({ color: 0x2c3318, alpha: 0.25 });
        g.poly(pts(0, 0), true).fill(0xaba59b).stroke({ color: 0x8a847a, width: 0.015 });
      }
    }
    carry = t - len;
  }
  return c;
}

export function buildObjectView(o: PlanObject, ctx: ViewContext): ObjectView {
  if (ctx.tilt) {
    const solid = buildSolid(o, ctx, ctx.tilt);
    if (solid) return solid;
  }
  const node = new Container();
  node.label = o.id;
  const g = new Graphics();
  node.addChild(g);
  const seed = seedFrom(o.id);

  switch (o.type) {
    case 'area': {
      const m = getMaterial(o.materialId);
      const fp = footprint(o);
      const rot = o.region.outer.kind === 'rect' ? o.region.outer.rotationDeg : 0;
      const origin = o.region.outer.kind === 'rect' ? o.region.outer.center : fp[0]?.outer[0];
      if (m.texture === 'water') {
        // Uferkante, Wasserverlauf, Wellen
        strokeRegions(g, fp, { color: 0x9e9585, width: 0.6 });
        fillRegions(g, fp, waterGradient());
        fillRegions(g, fp, materialPattern(m));
        fillRegions(g, fp, { color: 0x47767f, alpha: 0.35 });
        strokeRegions(g, fp, { color: 0xc3baaa, width: 0.12 });
      } else {
        const pat = materialPattern(m, origin, rot);
        fillRegions(g, fp, pat);
        // ausgefranste Kante bei Belägen ohne Fugenraster (Kies, Häcksel, Erde, Sand, Wiese …)
        if (isOrganic(m.texture) && m.texture !== 'lawn' && !o.edging) fringe(g, fp, pat, seed, m.texture === 'meadow' ? 0.22 : 0.06);
        const macro = macroPattern(m.texture);
        if (macro) fillRegions(g, fp, macro);
        surfaceDetails(g, fp, m.texture, seed, ctx.season);
        if (m.texture === 'lawn') {
          // große weiche Wolken, Jahreszeitenfarbe, dunklere Ränder zu Beeten und Wegen
          fillRegions(g, fp, lawnMacroPattern());
          if (ctx.season !== 'summer') fillRegions(g, fp, { color: hex(LAWN_COLOR[ctx.season]), alpha: 0.55 });
          const mask = new Graphics();
          fillRegions(mask, fp, 0xffffff);
          const edge = new Graphics();
          for (const wdt of [1.6, 0.9, 0.45]) strokeRegions(edge, fp, { color: 0x3a4418, alpha: 0.07, width: wdt });
          edge.mask = mask;
          node.addChild(mask, edge);
        }
        if (m.texture === 'meadow') {
          fillRegions(g, fp, meadowMacroPattern());
          if (ctx.season !== 'summer') fillRegions(g, fp, { color: hex(LAWN_COLOR[ctx.season]), alpha: 0.45 });
        }
        // nur das Holzdeck hat eine echte Stirnkante; Kies und Platten enden ohne gemalte Linie
        if (m.texture === 'wood') strokeRegions(g, fp, { color: 0x7e5c3d, width: 0.045 });
      }
      // Einfassung als gerendertes Band liegt in der Kanten-Ebene; gemalte Linie nur, bis das Bild geladen ist
      if (o.edging && !edgeStrip(EDGING_STRIP[o.edging.catalogId] ?? '')) strokeRegions(g, fp, { color: 0x8c857a, alpha: 0.75, width: 0.08 });
      break;
    }
    case 'path': {
      const fp = footprint(o);
      if (getMaterial(o.materialId).texture === 'stepping') {
        node.addChild(steppingNode(flattenPath(o.centerline, 0.02), o.width, seed));
        break;
      }
      const pm = getMaterial(o.materialId);
      const pat = materialPattern(pm);
      fillRegions(g, fp, pat);
      if (isOrganic(pm.texture) && !o.edging) fringe(g, fp, pat, seed, 0.05);
      const macro = macroPattern(pm.texture);
      if (macro) fillRegions(g, fp, macro);
      surfaceDetails(g, fp, pm.texture, seed, ctx.season);
      // Einfassung als gerendertes Band liegt in der Kanten-Ebene; gemalte Linie nur, bis das Bild geladen ist
      if (o.edging && !edgeStrip(EDGING_STRIP[o.edging.catalogId] ?? '')) strokeRegions(g, fp, { color: 0x8c857a, alpha: 0.75, width: 0.08 });
      break;
    }
    case 'planting': {
      const fp = footprint(o);
      if (o.mulchMaterialId) fillRegions(g, fp, materialPattern(getMaterial(o.mulchMaterialId)));
      // Unterwuchs: Lücken zwischen den Stauden lesen sich als beschattetes Laub, nicht als nackter Mulch
      // (Basalt und Kies bleiben als gestalterische Abdeckung sichtbar)
      fillRegions(g, fp, { color: 0x27331a, alpha: o.mulchMaterialId === 'basalt' ? 0.15 : o.mulchMaterialId === 'gravel' ? 0.32 : 0.62 });
      const mix = o.mix.map((x) => {
        const sp = getSpecies(x.speciesId);
        return { sp, share: x.share, color: inBloom(sp, ctx.season) && sp.colors.bloom ? sp.colors.bloom : seasonColor(sp, ctx.season) };
      });
      if (o.edging && !edgeStrip(EDGING_STRIP[o.edging.catalogId] ?? '')) strokeRegions(g, fp, { color: 0x8c857a, alpha: 0.75, width: 0.08 });
      if (ctx.lod >= 1) for (const r of fp) node.addChild(plantingNode(r, mix, o.perSquareMeter, seed, ctx.season, o.tiers ? (ctx.site ?? null) : undefined));
      else for (const r of fp) drawPlanting(g, r, mix, o.perSquareMeter, seed, 1);
      break;
    }
    case 'hedge': {
      const sp = getSpecies(o.speciesId);
      const w = hedgeWidthAt(o, ctx.years);
      const line = flattenPath(o.centerline, 0.02);
      const fp = ctx.years ? offsetPolyline(line, w, 'round') : footprint(o);
      void fp;
      node.addChild(hedgeNode(line, w, sp, ctx.season, seed));
      break;
    }
    case 'espalier':
      node.addChild(espalierNode(o, ctx.season));
      break;
    case 'scatter':
      node.addChild(scatterNode(o.plants, ctx.season, seed));
      break;
    case 'plant': {
      const sp = getSpecies(o.speciesId);
      const d = diameterAt(o, ctx.years);
      const color = seasonColor(sp, ctx.season);
      const bare = isBare(sp, ctx.season);
      // Blender-Bild (Draufsicht), leicht gedreht je Exemplar; sonst gemalt
      const rendered = plantAssetSprite(sp, ctx.season, seed, o.position, { view: 'top', width: d, rotation: (((seed % 41) - 20) * Math.PI) / 180 });
      if (rendered) {
        node.addChild(rendered);
        if (sp.kind === 'tree' && ctx.lens === 'growth') {
          const rings = new Graphics();
          growthRings(rings, o.position, diameterAt(o, 0), sp.diameterMature);
          node.addChild(rings);
        }
      } else if (sp.kind === 'tree') {
        const bloom = inBloom(sp, ctx.season) ? (sp.colors.bloom ?? null) : null;
        const fruitSeason = sp.phenology[ctx.season === 'summer' ? 6 : 9] === 'fruit';
        node.addChild(crownSprite(sp, o.position, d, seed, { color, bare, bloom, fruit: fruitSeason ? '#B9472F' : null }));
        if (ctx.lens === 'growth') {
          const rings = new Graphics();
          growthRings(rings, o.position, diameterAt(o, 0), sp.diameterMature);
          node.addChild(rings);
        }
      } else if (sp.kind === 'shrub' || sp.kind === 'hedge' || sp.kind === 'espalier') {
        const bloom = inBloom(sp, ctx.season) ? (sp.colors.bloom ?? null) : null;
        node.addChild(crownSprite(sp, o.position, d, seed, { color: bare ? '#7E806C' : color, bare: false, bloom, fruit: null }, true));
      } else node.addChild(perennialSprite(sp, o.position, d, seed, ctx.season));
      break;
    }
    case 'item': {
      const it = getItem(o.catalogId);
      const s = itemSize(o);
      node.addChild(itemSprite(it.symbol, o.position, s.width, s.depth, o.rotationDeg, seed));
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
    case 'lamp':
      // Nachts übernimmt der Lichtlayer; das Planzeichen bleibt als heller Kern sichtbar
      drawLampDay(g, o, o.path ? flattenPath(o.path, 0.02) : null, ctx.northDeg);
      if (ctx.night) node.alpha = 0.35;
      break;
    case 'sprinkler':
      drawSprinkler(g, o, ctx.lens === 'irrigation');
      break;
    case 'drip':
      drawDrip(g, o, flattenPath(o.path, 0.02));
      break;
    case 'pipe':
      drawPipe(g, o, flattenPath(o.path, 0.02));
      break;
    case 'fixture':
      drawFixture(g, o);
      break;
    case 'dimension':
      // Bemaßungen zeichnet der Overlay-Layer im Bildschirmraum
      break;
  }
  return { node };
}
