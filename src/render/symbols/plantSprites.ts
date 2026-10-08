/**
 * Pflanzen als Sprites (Stil B). Jede Funktion liefert Knoten in Weltmetern.
 */
import { Container, Graphics, Sprite } from 'pixi.js';
import { getSpecies } from '../../core/catalog/plants';
import { espalierTrees } from '../../core/espalier';
import { inBloom, isBare, seasonColor, type Season } from '../../core/growth';
import { offsetPolyline } from '../../core/geometry/clip';
import { pointInRegion, bbox } from '../../core/geometry/polygon';
import type { FlatRegion } from '../../core/geometry/shape';
import type { EspalierObject, PlantSpecies, ScatterPlant, Vec2 } from '../../core/model/types';
import { rng } from '../util/rng';
import { plantAssetSprite } from '../assets/plantAssets';
import { foliageTexture, paintBareTree, paintCrown, paintEspalier, paintPerennial, sizeBucket, textureSize } from './foliage';

const VARIANTS = 4;

function sprite(tex: ReturnType<typeof foliageTexture>, at: Vec2, worldWidth: number, rotation = 0): Sprite {
  const s = new Sprite(tex);
  s.anchor.set(0.5);
  s.position.set(at.x, at.y);
  s.scale.set(worldWidth / tex.width);
  s.rotation = rotation;
  return s;
}

export interface TreeLookB {
  color: string;
  bare: boolean;
  bloom: string | null;
  fruit: string | null;
}

/** Baum oder Strauch: Krone füllt 80 % der Textur → Sprite-Breite = d / 0,8 */
export function crownSprite(sp: PlantSpecies, at: Vec2, d: number, seed: number, look: TreeLookB, compact = false): Container {
  const node = new Container();
  const b = sizeBucket(d);
  const v = seed % VARIANTS;
  const size = textureSize(b);
  if (look.bare) {
    const tex = foliageTexture(`bare|${b}|${v}`, () => paintBareTree(size, seed % 97 + v, b));
    node.addChild(sprite(tex, at, d / 0.8, (seed % 360) * (Math.PI / 180)));
    return node;
  }
  const key = `crown|${sp.id}|${look.color}|${look.bloom ?? ''}|${look.fruit ?? ''}|${b}|${v}|${compact}`;
  const tex = foliageTexture(key, () => paintCrown(size, look.color, 1000 + v * 7919 + sp.id.length * 31, { diameter: b, bloom: look.bloom, fruit: look.fruit, compact }));
  // leichte Drehung je Exemplar, damit Varianten nicht gleich aussehen (Licht bleibt oben links: kleine Winkel)
  node.addChild(sprite(tex, at, d / 0.8, (((seed % 21) - 10) * Math.PI) / 180));
  return node;
}

/** Staude/Gras/Gemüse als Polster */
export function perennialSprite(sp: PlantSpecies, at: Vec2, d: number, seed: number, season: Season): Sprite {
  const rendered = plantAssetSprite(sp, season, seed, at, { view: 'top', width: d, rotation: ((seed % 360) * Math.PI) / 180 });
  if (rendered) return rendered;
  const grass = sp.kind === 'grass';
  const bloom = inBloom(sp, season) ? (sp.colors.bloom ?? sp.colors.summer) : grass && (season === 'summer' || season === 'autumn') ? '#E8DDB8' : null;
  const leaf = grass ? seasonColor(sp, season) : season === 'winter' ? '#7d7464' : season === 'autumn' ? (sp.colors.autumn ?? '#7d8a55') : '#6d8a4b';
  const v = seed % VARIANTS;
  const tex = foliageTexture(`per|${sp.id}|${season}|${v}`, () => paintPerennial(96, leaf, bloom, grass, 4000 + v * 104729 + sp.id.length * 13));
  return sprite(tex, at, d / 0.84, ((seed % 360) * Math.PI) / 180);
}

/** Hecke: dunkler Unterbau, darauf dichte Ballen entlang der Linie */
export function hedgeNode(line: Vec2[], width: number, sp: PlantSpecies, season: Season, seed: number): Container {
  const node = new Container();
  const base = new Graphics();
  for (const r of offsetPolyline(line, width * 0.86, 'round')) base.poly(r.outer.flatMap((p) => [p.x, p.y]), true).fill(0x26361a);
  node.addChild(base);
  const color = seasonColor(sp, season);
  const step = width * 0.42;
  const rnd = rng(seed);
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    for (let t = 0; t < L; t += step) {
      const p = { x: a.x + ((b.x - a.x) * t) / L + (rnd() - 0.5) * width * 0.1, y: a.y + ((b.y - a.y) * t) / L + (rnd() - 0.5) * width * 0.1 };
      const d = width * (0.92 + rnd() * 0.22);
      const sd = Math.floor(rnd() * 1e6);
      node.addChild(plantAssetSprite(sp, season, sd, p, { view: 'top', width: d, rotation: (sd % 360) * (Math.PI / 180) }) ?? crownSprite(sp, p, d, sd, { color, bare: false, bloom: null, fruit: null }, true));
    }
  }
  // Formschnitt: Laub auf die geschnittene Kontur beschneiden (gerade Flanken statt Blasenrand)
  const cut = new Graphics();
  for (const r of offsetPolyline(line, width * 1.02, 'miter')) cut.poly(r.outer.flatMap((p) => [p.x, p.y]), true).fill(0xffffff);
  node.addChild(cut);
  node.mask = cut;
  // Volumen: Lichtkante auf der Sonnenseite (Licht von links oben), Schattenflanke gegenüber
  const shade = new Graphics();
  const L = { x: -0.62, y: -0.78 };
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) continue;
    let nx = -(b.y - a.y) / len;
    let ny = (b.x - a.x) / len;
    if (nx * L.x + ny * L.y < 0) {
      nx = -nx;
      ny = -ny;
    }
    const lit = (k: number) => [a.x + nx * width * k, a.y + ny * width * k, b.x + nx * width * k, b.y + ny * width * k] as const;
    const dark = (k: number) => [a.x - nx * width * k, a.y - ny * width * k, b.x - nx * width * k, b.y - ny * width * k] as const;
    const [x1, y1, x2, y2] = lit(0.44);
    shade.moveTo(x1, y1).lineTo(x2, y2).stroke({ color: 0xe2e8b0, alpha: 0.2, width: width * 0.12 });
    for (const [k, al] of [[0.42, 0.34], [0.34, 0.18]] as const) {
      const [u1, v1, u2, v2] = dark(k);
      shade.moveTo(u1, v1).lineTo(u2, v2).stroke({ color: 0x142010, alpha: al, width: width * 0.16 });
    }
  }
  node.addChild(shade);
  return node;
}

/** Spalier: Schirm je Baum entlang der Linie, Stammpunkte sichtbar wenn kahl */
export function espalierNode(o: EspalierObject, season: Season): Container {
  const node = new Container();
  const sp = getSpecies(o.speciesId);
  const bare = isBare(sp, season);
  const color = seasonColor(sp, season);
  // ›Red Robin‹ und Neuaustrieb im Frühling: rötliche Spitzen
  const accent = o.speciesId === 'photinia-espalier' ? '#B4553A' : inBloom(sp, season) && sp.colors.bloom ? sp.colors.bloom : null;
  const w = Math.round(o.spacing * 10) / 10;
  const d = Math.round(o.depth * 20) / 20;
  const ppm = Math.min(160, 1100 / Math.max(w, d));
  for (const [i, t] of espalierTrees(o).entries()) {
    const rendered = plantAssetSprite(sp, season, i, t.p, { view: 'top', width: o.spacing, depth: o.depth, rotation: Math.atan2(t.dir.y, t.dir.x) });
    if (rendered) {
      node.addChild(rendered);
      continue;
    }
    const v = i % VARIANTS;
    const tex = foliageTexture(`esp|${o.speciesId}|${season}|${w}|${d}|${v}|${bare}`, () => paintEspalier(w * 0.98, d, ppm, color, accent, bare, 7000 + v * 31337));
    const s = new Sprite(tex);
    s.anchor.set(0.5);
    s.position.set(t.p.x, t.p.y);
    s.scale.set(1 / ppm);
    s.rotation = Math.atan2(t.dir.y, t.dir.x);
    node.addChild(s);
    if (bare || o.form === 'roof') {
      const g = new Graphics();
      g.circle(t.p.x, t.p.y, 0.09).fill(0x3b3226);
      node.addChild(g);
    }
  }
  return node;
}

/** Pflanzgruppe aus dem Pinsel */
export function scatterNode(plants: ScatterPlant[], season: Season, seed: number): Container {
  const node = new Container();
  plants.forEach((q, i) => {
    const sp = getSpecies(q.speciesId);
    node.addChild(perennialSprite(sp, q.p, sp.diameterMature * 0.95, seed + i * 7, season));
  });
  return node;
}

/**
 * Staudenpflanzung (Fläche mit Mix): Drifts je Art, deterministisch verteilt – wie bisher,
 * nur mit Polstern statt Kreisen.
 */
export function plantingNode(region: FlatRegion, mix: { sp: PlantSpecies; share: number }[], perSquareMeter: number, seed: number, season: Season): Container {
  const node = new Container();
  const rnd = rng(seed);
  const b = bbox(region.outer);
  const inside = (p: Vec2) => pointInRegion(p, region.outer, region.holes);
  const cell = 1.6;
  const perDrift = Math.max(1, Math.round(perSquareMeter * cell * cell));
  // dicht und überlappend wie eine eingewachsene Pflanzung; hohe Arten zuletzt (liegen oben)
  const items: { h: number; s: Container }[] = [];
  for (let y = b.minY + cell / 2; y < b.maxY; y += cell)
    for (let x = b.minX + cell / 2; x < b.maxX; x += cell) {
      const c = { x: x + (rnd() - 0.5) * cell * 0.8, y: y + (rnd() - 0.5) * cell * 0.8 };
      if (!inside(c)) continue;
      let t = rnd();
      const pick = mix.find((m) => (t -= m.share) <= 0) ?? mix[mix.length - 1];
      for (let i = 0; i < perDrift; i++) {
        const a = rnd() * Math.PI * 2;
        const d = Math.sqrt(rnd()) * cell * 0.6;
        const p = { x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d };
        if (!inside(p)) continue;
        const size = Math.min(0.95, pick.sp.diameterMature * 1.15) * (0.85 + rnd() * 0.35);
        items.push({ h: pick.sp.heightMature + rnd() * 0.1, s: perennialSprite(pick.sp, p, size, Math.floor(rnd() * 1e6), season) });
      }
    }
  items.sort((a, b2) => a.h - b2.h);
  for (const it of items) node.addChild(it.s);
  return node;
}

