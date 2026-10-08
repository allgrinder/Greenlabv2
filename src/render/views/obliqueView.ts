/**
 * Schrägansicht (2.5D, fester Kippwinkel): Körper für alles, was Höhe hat.
 *
 * Parallelprojektion in Weltkoordinaten: Der Welt-Container staucht die Bodenebene in y um
 * cos(Kippwinkel); ein Punkt in Höhe z liegt zusätzlich z · tan(Kippwinkel) Meter weiter „oben“
 * (−y). Draufsicht-Texturen bleiben gültig: Dachflächen werden als Mesh mit denselben
 * Texturkoordinaten angehoben, waagerechte Flächen (Kronen, Tischplatten) nur verschoben.
 * Sichtbar sind die Wände, deren Außennormale zur Kamera (+y) zeigt.
 */
import { Container, FillPattern, Graphics, Matrix, MeshSimple, Sprite, Texture } from 'pixi.js';
import { getItem } from '../../core/catalog/items';
import { getSpecies } from '../../core/catalog/plants';
import { espalierFootprint, espalierTrees } from '../../core/espalier';
import { diameterAt, heightAt, hedgeWidthAt, isBare, inBloom, seasonColor } from '../../core/growth';
import { offsetPolyline } from '../../core/geometry/clip';
import { itemSize } from '../../core/geometry/objects';
import { flattenPath } from '../../core/geometry/shape';
import type { PlanObject, Vec2 } from '../../core/model/types';
import { L, css, mul, palette, prng, rgbOf, tuft } from '../symbols/foliage';
import { gableFaces, hipFaces, itemSolid, type ItemSolid } from '../symbols/itemPaint';
import { itemAssetSprite } from '../assets/itemAssets';
import { plantAssetSprite } from '../assets/plantAssets';
import { DARK_SYMBOLS, itemTexture } from '../symbols/items';
import { crownSprite, espalierNode, hedgeNode } from '../symbols/plantSprites';
import { seedFrom } from '../util/rng';
import { labelText, type ViewContext } from './objectView';

export interface Tilt {
  /** tan(Kippwinkel): Höhe → Verschiebung in Weltmetern */
  tan: number;
  /** cos(Kippwinkel): Stauchung der Bodenebene */
  cos: number;
}

export interface SolidView {
  node: Container;
  /** Zeichenreihenfolge: weiter vorne (größeres y) später */
  depth: number;
}

const up = (p: Vec2, z: number, t: Tilt): Vec2 => ({ x: p.x, y: p.y - z * t.tan });
const flat = (pts: Vec2[]) => pts.flatMap((p) => [p.x, p.y]);
/** Helligkeit einer senkrechten Wand mit Außennormale n (Licht oben links, Wände zur Kamera liegen im Halbschatten) */
const wallLight = (n: Vec2) => Math.max(0.7, Math.min(1.1, 0.97 + 0.2 * (n.x * L[0] + n.y * L[1])));

function signedArea(ring: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** Kanten eines Rings mit Außennormale, nur die zur Kamera gewandten, hinten zuerst */
function frontEdges(ring: Vec2[]): { a: Vec2; b: Vec2; n: Vec2 }[] {
  const s = signedArea(ring) > 0 ? 1 : -1;
  const out: { a: Vec2; b: Vec2; n: Vec2 }[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    // Außennormale: bei positiver Fläche (y nach unten → im Uhrzeigersinn am Bildschirm) rechts der Kante
    const n = { x: (dy / len) * s, y: (-dx / len) * s };
    if (n.y > 1e-4) out.push({ a, b, n });
  }
  return out.sort((e, f) => Math.max(e.a.y, e.b.y) - Math.max(f.a.y, f.b.y));
}

/* ---------------- Laubwand (Seiten von Hecken und Spalieren) ---------------- */

const SIDE_PPM = 96;
const sideCache = new Map<string, Texture>();

/** nahtlose Laubkachel 2 × 2 m für senkrechte Heckenflächen */
function foliageSide(color: string): Texture {
  let t = sideCache.get(color);
  if (t) return t;
  const size = 2 * SIDE_PPM;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const rnd = prng(color.length * 977 + parseInt(color.slice(1), 16));
  const pal = palette(color);
  g.fillStyle = css(mul(pal[0], 0.7));
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = SIDE_PPM * (0.05 + rnd() * 0.06);
    // oben heller (Licht von oben), über die Kachelränder fortgesetzt
    const l = 0.25 + 0.45 * (1 - y / size) + rnd() * 0.2;
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) if (x + dx > -r && x + dx < size + r && y + dy > -r && y + dy < size + r) tuft(g, x + dx, y + dy, r, l, pal, rnd);
  }
  t = Texture.from(c);
  t.source.style.addressMode = 'repeat';
  t.source.scaleMode = 'linear';
  sideCache.set(color, t);
  return t;
}

function sidePattern(color: string): FillPattern {
  const p = new FillPattern({ texture: foliageSide(color), repetition: 'repeat', textureSpace: 'global' });
  p.setTransform(new Matrix().scale(1 / SIDE_PPM, 1 / SIDE_PPM));
  return p;
}

/** Senkrechte Laubwände eines Grundrisses von z0 bis z1 */
function foliageWalls(g: Graphics, rings: Vec2[][], z0: number, z1: number, color: string, t: Tilt) {
  const pat = sidePattern(color);
  for (const ring of rings)
    for (const e of frontEdges(ring)) {
      const q = [up(e.a, z0, t), up(e.b, z0, t), up(e.b, z1, t), up(e.a, z1, t)];
      g.poly(flat(q), true).fill(pat);
      g.poly(flat(q), true).fill({ color: 0x0c1408, alpha: Math.max(0, 0.42 - wallLight(e.n) * 0.3) });
    }
}

/* ---------------- Gehölze ---------------- */

function trunk(g: Graphics, p: Vec2, width: number, z: number, t: Tilt) {
  const w = width / 2;
  g.poly(flat([{ x: p.x - w, y: p.y }, { x: p.x + w, y: p.y }, up({ x: p.x + w * 0.7, y: p.y }, z, t), up({ x: p.x - w * 0.7, y: p.y }, z, t)]), true).fill(0x5a4836);
  g.poly(flat([{ x: p.x - w, y: p.y }, { x: p.x - w * 0.2, y: p.y }, up({ x: p.x - w * 0.1, y: p.y }, z, t), up({ x: p.x - w * 0.7, y: p.y }, z, t)]), true).fill({ color: 0x8a7458, alpha: 0.8 });
  g.ellipse(p.x, p.y, w * 1.6, w * 1.6).fill({ color: 0x000000, alpha: 0.18 });
}

/**
 * Kronen-Sprite als Ellipsoid: waagerechter Radius r, halbe Höhe hv, Mitte in Höhe zc.
 * In Weltmetern (vor der Stauchung) ist die sichtbare Höhe √(r² + (hv·tan)² / … ) – siehe Kopfkommentar.
 */
function liftCrown(node: Container, at: Vec2, r: number, hv: number, zc: number, t: Tilt) {
  const sy = Math.sqrt(r * r * t.cos * t.cos + hv * hv * (1 - t.cos * t.cos)) / (r * t.cos);
  for (const ch of node.children) {
    // Sprites liegen um `at` herum: um diesen Punkt strecken und anheben
    ch.position.y = at.y + (ch.position.y - at.y) * sy - zc * t.tan;
    ch.scale.y *= sy;
  }
}

function plantSolid(o: Extract<PlanObject, { type: 'plant' }>, ctx: ViewContext, t: Tilt): SolidView | null {
  const sp = getSpecies(o.speciesId);
  if (sp.kind !== 'tree' && sp.kind !== 'shrub' && sp.kind !== 'hedge' && sp.kind !== 'espalier') return null;
  const seed = seedFrom(o.id);
  const d = diameterAt(o, ctx.years);
  const h = Math.max(0.4, heightAt(o, ctx.years));
  const node = new Container();
  node.label = o.id;
  const color = seasonColor(sp, ctx.season);
  const bare = isBare(sp, ctx.season);
  const bloom = inBloom(sp, ctx.season) ? (sp.colors.bloom ?? null) : null;
  // Blender-Bild der Schrägansicht (Stamm und Krone), verankert am Stammfuß
  const rendered = plantAssetSprite(sp, ctx.season, seed, o.position, { view: 'oblique', width: d, height: h, tiltCos: t.cos });
  if (rendered) {
    node.addChild(rendered);
    return { node, depth: o.position.y };
  }
  if (sp.kind === 'tree') {
    const g = new Graphics();
    const z0 = h * 0.28;
    const zc = (z0 + h * 0.92) / 2;
    trunk(g, o.position, Math.min(0.5, Math.max(0.14, d * 0.05)), bare ? h * 0.7 : zc, t);
    node.addChild(g);
    const fruit = sp.phenology[ctx.season === 'summer' ? 6 : 9] === 'fruit' ? '#B9472F' : null;
    const crown = crownSprite(sp, o.position, d, seed, { color, bare, bloom, fruit });
    liftCrown(crown, o.position, d / 2, (h * 0.92 - z0) / 2, zc, t);
    node.addChild(crown);
  } else {
    const crown = crownSprite(sp, o.position, d, seed, { color: bare ? '#7E806C' : color, bare: false, bloom, fruit: null }, true);
    liftCrown(crown, o.position, d / 2, h / 2, h / 2, t);
    node.addChild(crown);
  }
  return { node, depth: o.position.y };
}

function hedgeSolid(o: Extract<PlanObject, { type: 'hedge' }>, ctx: ViewContext, t: Tilt): SolidView {
  const sp = getSpecies(o.speciesId);
  const line = flattenPath(o.centerline, 0.02);
  const w = hedgeWidthAt(o, ctx.years);
  const node = new Container();
  node.label = o.id;
  const g = new Graphics();
  const rings = offsetPolyline(line, w * 0.9, 'round').map((r) => r.outer);
  foliageWalls(g, rings, 0, o.height * 0.96, seasonColor(sp, ctx.season), t);
  node.addChild(g);
  const top = hedgeNode(line, w, sp, ctx.season, seedFrom(o.id));
  top.position.y = -o.height * t.tan;
  node.addChild(top);
  return { node, depth: centroidY(line) };
}

function espalierSolid(o: Extract<PlanObject, { type: 'espalier' }>, ctx: ViewContext, t: Tilt): SolidView {
  const sp = getSpecies(o.speciesId);
  const node = new Container();
  node.label = o.id;
  const g = new Graphics();
  for (const tr of espalierTrees(o)) trunk(g, tr.p, 0.16, o.stemHeight + 0.1, t);
  const bare = isBare(sp, ctx.season);
  if (!bare) foliageWalls(g, espalierFootprint(o).map((r) => r.outer), o.stemHeight, o.height, seasonColor(sp, ctx.season), t);
  node.addChild(g);
  const top = espalierNode(o, ctx.season);
  top.position.y = -(bare ? (o.stemHeight + o.height) / 2 : o.height) * t.tan;
  node.addChild(top);
  return { node, depth: centroidY(flattenPath(o.centerline, 0.05)) };
}

const centroidY = (pts: Vec2[]) => pts.reduce((s, p) => s + p.y, 0) / Math.max(1, pts.length);

/* ---------------- Gebäude und Möbel ---------------- */

/** Fenster, Türen, Bretter auf einer Wand (u = 0…1 entlang der Kante, z in m) */
function wallDetails(g: Graphics, e: { a: Vec2; b: Vec2; n: Vec2 }, s: ItemSolid, top: (u: number) => number, t: Tilt) {
  const len = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y);
  const at = (u: number, z: number) => up({ x: e.a.x + (e.b.x - e.a.x) * u, y: e.a.y + (e.b.y - e.a.y) * u }, z, t);
  const quad = (u0: number, u1: number, z0: number, z1: number) => flat([at(u0, z0), at(u1, z0), at(u1, z1), at(u0, z1)]);
  if (s.wood) {
    for (let x = 0.15; x < len; x += 0.15) g.moveTo(at(x / len, 0).x, at(x / len, 0).y).lineTo(at(x / len, top(x / len)).x, at(x / len, top(x / len)).y);
    g.stroke({ color: 0x2a1c10, alpha: 0.35, width: 0.02 });
  }
  if (s.glass) {
    for (let x = 0; x <= len + 1e-6; x += len / Math.max(1, Math.round(len / 0.75))) g.moveTo(at(x / len, 0).x, at(x / len, 0).y).lineTo(at(x / len, top(x / len)).x, at(x / len, top(x / len)).y);
    g.moveTo(at(0, 0.4).x, at(0, 0.4).y).lineTo(at(1, 0.4).x, at(1, 0.4).y);
    g.stroke({ color: 0xd2d9db, width: 0.04 });
  }
  if (s.windows === 'house') {
    // Sockel, Fenster je Geschoss
    g.poly(quad(0, 1, 0, 0.35), true).fill({ color: 0x4f4c47, alpha: 0.85 });
    const n = Math.max(1, Math.floor(len / 2.6));
    const levels = s.eave > 3.6 ? [0.95, s.eave - 1.35] : [0.95];
    for (const z of levels)
      for (let i = 0; i < n; i++) {
        const c = (i + 0.5) / n;
        const hw = 0.6 / len;
        g.poly(quad(c - hw - 0.06 / len, c + hw + 0.06 / len, z - 0.06, z + 1.26), true).fill(0xf4f1ea);
        g.poly(quad(c - hw, c + hw, z, z + 1.2), true).fill(0x3d4c58);
        g.poly(quad(c - hw, c, z + 0.6, z + 1.2), true).fill({ color: 0xa9c1cf, alpha: 0.45 });
      }
  } else if (s.windows === 'shed') {
    const c = 0.5;
    const hw = Math.min(0.45, len * 0.2) / len;
    g.poly(quad(c - hw, c + hw, 0, Math.min(1.9, s.eave - 0.2)), true).fill(0x4a3626);
    g.poly(quad(c - hw * 0.85, c + hw * 0.85, 0.05, Math.min(1.85, s.eave - 0.25)), true).stroke({ color: 0x2a1c10, width: 0.03 });
  }
}

function itemSolidView(o: Extract<PlanObject, { type: 'item' }>, t: Tilt): SolidView | null {
  const it = getItem(o.catalogId);
  const sz = itemSize(o);
  const rendered = itemAssetSprite(it.symbol, o.position, sz.width, sz.depth, o.rotationDeg, t.cos);
  if (rendered) {
    // Blender-Bild der Schrägansicht: ein Sprite, verankert am Bodenursprung
    const node = new Container();
    node.label = o.id;
    node.addChild(rendered);
    const r = (o.rotationDeg * Math.PI) / 180;
    const ext = Math.abs(Math.sin(r)) * sz.width / 2 + Math.abs(Math.cos(r)) * sz.depth / 2;
    if (o.name && DARK_SYMBOLS.has(it.symbol)) {
      const lb = labelText(o.name, it.category === 'building' ? 0.75 : 0.55, true);
      const p = up(o.position, sz.height, t);
      lb.position.set(p.x, p.y + 0.3);
      node.addChild(lb);
    }
    return { node, depth: o.position.y + ext };
  }
  const s = itemSolid(it.symbol, sz.height);
  if (s.kind === 'flat' || sz.height <= 0.05) return null;
  const seed = seedFrom(o.id);
  const rot = (o.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const W = sz.width;
  const D = sz.depth;
  /** lokale Koordinaten (0…W, 0…D) → Welt (Boden) */
  const toW = (x: number, y: number): Vec2 => {
    const lx = x - W / 2;
    const ly = y - D / 2;
    return { x: o.position.x + lx * cos - ly * sin, y: o.position.y + lx * sin + ly * cos };
  };
  const node = new Container();
  node.label = o.id;
  const g = new Graphics();
  node.addChild(g);
  const tex = itemTexture(it.symbol, W, D, seed);
  const corners = [toW(0, 0), toW(W, 0), toW(W, D), toW(0, D)];
  const depth = Math.max(...corners.map((p) => p.y));

  if (s.kind === 'cylinder') {
    const r = W / 2;
    const c = o.position;
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI;
      const a1 = ((i + 1) / n) * Math.PI;
      const p0 = { x: c.x + Math.cos(a0) * r, y: c.y + Math.sin(a0) * r };
      const p1 = { x: c.x + Math.cos(a1) * r, y: c.y + Math.sin(a1) * r };
      const k = wallLight({ x: Math.cos((a0 + a1) / 2), y: Math.sin((a0 + a1) / 2) });
      g.poly(flat([p0, p1, up(p1, s.eave, t), up(p0, s.eave, t)]), true).fill(css(mul(rgbOf(s.wall), k)));
    }
    const top = new Sprite(tex);
    top.anchor.set(0.5);
    top.position.set(c.x, c.y - s.eave * t.tan);
    top.scale.set(W / tex.width, D / tex.height);
    node.addChild(top);
    return { node, depth };
  }

  if (s.kind === 'slab') {
    // Beine an den Ecken, Platte oben
    const legs = [toW(W * 0.12, D * 0.12), toW(W * 0.88, D * 0.12), toW(W * 0.88, D * 0.88), toW(W * 0.12, D * 0.88)];
    for (const p of legs) g.moveTo(p.x, p.y).lineTo(p.x, p.y - s.eave * t.tan);
    g.stroke({ color: 0x3b3a38, width: 0.05 });
    for (const e of frontEdges(corners)) g.poly(flat([up(e.a, s.eave - 0.06, t), up(e.b, s.eave - 0.06, t), up(e.b, s.eave, t), up(e.a, s.eave, t)]), true).fill(css(mul(rgbOf(s.wall), wallLight(e.n))));
    const top = new Sprite(tex);
    top.anchor.set(0.5);
    top.position.set(o.position.x, o.position.y - s.eave * t.tan);
    top.scale.set(W / tex.width, D / tex.height);
    top.rotation = rot;
    node.addChild(top);
    return { node, depth };
  }

  // Quader mit Dach: Wandhöhe entlang einer Kante (Giebel reichen bis zum First)
  const H = sz.height;
  const gable = s.roof === 'gable';
  const ridgeAlongY = D >= W;
  const localOf = (p: Vec2): Vec2 => {
    const dx = p.x - o.position.x;
    const dy = p.y - o.position.y;
    return { x: dx * cos + dy * sin + W / 2, y: -dx * sin + dy * cos + D / 2 };
  };
  for (const e of frontEdges(corners)) {
    const la = localOf(e.a);
    const lb = localOf(e.b);
    // Giebelwand: Kante quer zum First
    const isGableEnd = gable && (ridgeAlongY ? Math.abs(la.y - lb.y) < 1e-3 : Math.abs(la.x - lb.x) < 1e-3);
    const top = (u: number) => (isGableEnd ? s.eave + (H - s.eave) * (1 - Math.abs(u - 0.5) * 2) : s.roof === 'flat' ? H : s.eave);
    const pts: Vec2[] = [e.a, e.b, up(e.b, top(1), t)];
    if (isGableEnd) pts.push(up({ x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 }, H, t));
    pts.push(up(e.a, top(0), t));
    const k = wallLight(e.n);
    if (s.glass) {
      g.poly(flat(pts), true).fill({ color: 0x8fa79a, alpha: 0.55 });
      g.poly(flat(pts), true).fill({ color: 0xe8f1f3, alpha: 0.35 * k });
    } else g.poly(flat(pts), true).fill(css(mul(rgbOf(s.wall), k)));
    wallDetails(g, e, s, top, t);
    // Kontaktschatten am Fuß
    g.poly(flat([e.a, e.b, up(e.b, 0.25, t), up(e.a, 0.25, t)]), true).fill({ color: 0x000000, alpha: 0.12 });
  }

  if (s.roof === 'flat') {
    const top = new Sprite(tex);
    top.anchor.set(0.5);
    top.position.set(o.position.x, o.position.y - H * t.tan);
    top.scale.set(W / tex.width, D / tex.height);
    top.rotation = rot;
    node.addChild(top);
  } else {
    // Dachflächen als Mesh: Draufsicht-Textur, Ecken je nach Lage auf Trauf- bzw. Firsthöhe
    const faces = s.roof === 'hip' ? hipFaces(W, D) : gableFaces(W, D);
    const onRidge = (x: number, y: number) =>
      s.roof === 'hip' ? !(x < 1e-6 || y < 1e-6 || x > W - 1e-6 || y > D - 1e-6) : ridgeAlongY ? Math.abs(x - W / 2) < 1e-6 : Math.abs(y - D / 2) < 1e-6;
    const verts: number[] = [];
    const uvs: number[] = [];
    const idx: number[] = [];
    // hinten liegende Flächen zuerst
    const sorted = [...faces].sort((a, b) => a.n[1] - b.n[1]);
    for (const f of sorted) {
      const base = verts.length / 2;
      for (const [x, y] of f.pts) {
        const p = up(toW(x, y), onRidge(x, y) ? H : s.eave, t);
        verts.push(p.x, p.y);
        uvs.push(x / W, y / D);
      }
      for (let k = 1; k < f.pts.length - 1; k++) idx.push(base, base + k, base + k + 1);
    }
    const mesh = new MeshSimple({ texture: tex, vertices: new Float32Array(verts), uvs: new Float32Array(uvs), indices: new Uint32Array(idx) });
    node.addChild(mesh);
  }
  if (o.name && DARK_SYMBOLS.has(it.symbol)) {
    const lb = labelText(o.name, it.category === 'building' ? 0.75 : 0.55, true);
    const p = up(o.position, H, t);
    lb.position.set(p.x, p.y + 0.3);
    node.addChild(lb);
  }
  return { node, depth };
}

/** Körper für die Schrägansicht; null = flach wie in der Draufsicht */
export function buildSolid(o: PlanObject, ctx: ViewContext, t: Tilt): SolidView | null {
  switch (o.type) {
    case 'plant':
      return plantSolid(o, ctx, t);
    case 'hedge':
      return hedgeSolid(o, ctx, t);
    case 'espalier':
      return espalierSolid(o, ctx, t);
    case 'item':
      return itemSolidView(o, t);
    default:
      return null;
  }
}

