/**
 * Nachtmodus: Lightmap-Verfahren.
 *
 * 1. In eine RenderTexture wird eine dunkelblaue Grundhelligkeit gelöscht und jede Leuchte
 *    additiv als Lichtkreis bzw. Lichtkegel (Farbe aus der Farbtemperatur) gezeichnet.
 *    Gebäude, Gartenhaus und Hecken verdecken Licht über inverse Masken (2D-Schattenvolumen).
 * 2. Die Lightmap liegt mit „multiply“ über dem Plan: unbeleuchtet wird es bläulich dunkel.
 * 3. Ein additiver Glow-Durchgang ergänzt Leuchtenkerne, Lichterketten-Birnen und
 *    Spiegelungen auf Wasserflächen.
 */
import { Container, Graphics, RenderTexture, Sprite, Texture, type Renderer } from 'pixi.js';
import { getItem } from '../../core/catalog/items';
import { getLamp, kelvinHex, lampRange } from '../../core/catalog/lamps';
import { getMaterial } from '../../core/catalog/materials';
import { footprint } from '../../core/geometry/objects';
import { centroid, closestPointOn, pointInPolygon, type Polygon } from '../../core/geometry/polygon';
import { flattenPath } from '../../core/geometry/shape';
import type { LampObject, Project, Vec2 } from '../../core/model/types';
import { planDirection } from '../../core/sun/sun';
import type { ScreenSize } from '../Viewport';

/** Grundhelligkeit nachts (mondlichtblau, multipliziert) */
const AMBIENT: [number, number, number, number] = [0.17, 0.22, 0.33, 1];
const RT_SCALE = 0.5;

let radialTex: Texture | null = null;
const coneTex = new Map<number, Texture>();

/** Weicher Lichtkreis wie gwL… im Design: 95 % → 45 % bei 30 % → 0 */
function radial(): Texture {
  if (radialTex) return radialTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,255,255,0.95)');
  gr.addColorStop(0.3, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  radialTex = Texture.from(c);
  return radialTex;
}

/** Lichtkegel: Spitze links in der Mitte, Öffnungswinkel `beam` */
function cone(beam: number): Texture {
  const key = Math.max(4, Math.round(beam / 2) * 2);
  const hit = coneTex.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const g = c.getContext('2d')!;
  const half = (key * Math.PI) / 360;
  const gr = g.createRadialGradient(0, 256, 0, 0, 256, 512);
  gr.addColorStop(0, 'rgba(255,255,255,0.92)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.42)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(0, 256);
  g.arc(0, 256, 512, -half, half);
  g.closePath();
  g.fill();
  const t = Texture.from(c);
  coneTex.set(key, t);
  return t;
}

interface Obstacle {
  outline: Polygon;
  h: number;
}

function obstacles(doc: Project): Obstacle[] {
  const out: Obstacle[] = [];
  for (const o of Object.values(doc.objects)) {
    if (o.hidden || doc.layers[o.layerId]?.visible === false) continue;
    if (o.type === 'item') {
      const it = getItem(o.catalogId);
      const h = o.size?.height ?? it.height;
      if (h >= 1 && it.category !== 'greenhouse') out.push(...footprint(o).map((r) => ({ outline: r.outer, h })));
    } else if (o.type === 'hedge') {
      out.push(...footprint(o).map((r) => ({ outline: r.outer, h: o.height })));
    }
  }
  return out;
}

/** Schattenvolumen eines Hindernisses für eine Lichtquelle: je Kante ein weit gestrecktes Viereck */
function occluders(g: Graphics, L: Vec2, range: number, obs: Obstacle[], lampH: number) {
  for (const ob of obs) {
    if (ob.h <= lampH + 0.2) continue;
    if (pointInPolygon(L, ob.outline)) continue;
    const near = ob.outline.some((p) => Math.hypot(p.x - L.x, p.y - L.y) < range * 1.2);
    if (!near) continue;
    const far = range * 3;
    const proj = (p: Vec2) => {
      const dx = p.x - L.x;
      const dy = p.y - L.y;
      const d = Math.hypot(dx, dy) || 1;
      return { x: p.x + (dx / d) * far, y: p.y + (dy / d) * far };
    };
    g.poly(ob.outline.flatMap((p) => [p.x, p.y]), true).fill(0xffffff);
    for (let i = 0; i < ob.outline.length; i++) {
      const a = ob.outline[i];
      const b = ob.outline[(i + 1) % ob.outline.length];
      const pa = proj(a);
      const pb = proj(b);
      g.poly([a.x, a.y, b.x, b.y, pb.x, pb.y, pa.x, pa.y], true).fill(0xffffff);
    }
  }
}

export interface NightParams {
  doc: Project;
  /** Helligkeit 0–1 je Leuchten-ID */
  level: (l: LampObject) => number;
  /** Welt → Bildschirm: Skalierung und Verschiebung des Welt-Containers */
  world: { scale: number; scaleY?: number; x: number; y: number };
  size: ScreenSize;
}

export class NightLayer {
  /** Multiplikative Lightmap im Bildschirmraum */
  readonly overlay = new Sprite(Texture.EMPTY);
  /** Additiver Glow im Weltraum */
  readonly glow = new Container();
  private lightRoot = new Container();
  /** Nachtwirkung nur auf dem Grundstück; außerhalb zeigt die Seite ihren Nachthintergrund */
  private clip = new Graphics();
  private lightWorld = new Container();
  private rt: RenderTexture | null = null;
  private docKey: Project | null = null;
  private obs: Obstacle[] = [];
  private water: Polygon[] = [];

  constructor() {
    this.overlay.blendMode = 'multiply';
    this.overlay.label = 'night-lightmap';
    this.glow.label = 'night-glow';
    this.lightRoot.addChild(this.lightWorld);
    this.glow.addChild(this.clip);
    this.overlay.mask = this.clip;
    this.setVisible(false);
  }

  setVisible(v: boolean) {
    this.overlay.visible = v;
    this.glow.visible = v;
  }

  update(renderer: Renderer, p: NightParams) {
    if (this.docKey !== p.doc) {
      this.docKey = p.doc;
      this.clip.clear().poly(p.doc.site.boundary.flatMap((q) => [q.x, q.y]), true).fill(0xffffff);
      this.obs = obstacles(p.doc);
      this.water = Object.values(p.doc.objects)
        .filter((o) => o.type === 'area' && getMaterial(o.materialId).texture === 'water')
        .flatMap((o) => footprint(o).map((r) => r.outer));
    }
    this.rebuildLights(p);

    const w = Math.max(1, Math.ceil(p.size.width * RT_SCALE));
    const h = Math.max(1, Math.ceil(p.size.height * RT_SCALE));
    if (!this.rt || this.rt.width !== w || this.rt.height !== h) {
      this.rt?.destroy(true);
      this.rt = RenderTexture.create({ width: w, height: h, resolution: 1 });
      this.overlay.texture = this.rt;
    }
    this.lightWorld.scale.set(p.world.scale * RT_SCALE, (p.world.scaleY ?? p.world.scale) * RT_SCALE);
    this.lightWorld.position.set(p.world.x * RT_SCALE, p.world.y * RT_SCALE);
    renderer.render({ container: this.lightRoot, target: this.rt, clear: true, clearColor: AMBIENT });
    this.overlay.scale.set(1 / RT_SCALE);
    this.glow.scale.set(p.world.scale, p.world.scaleY ?? p.world.scale);
    this.glow.position.set(p.world.x, p.world.y);
  }

  private lightsKey = '';

  /** Lichtquellen nur neu aufbauen, wenn sich Leuchten, Helligkeiten oder Hindernisse ändern */
  private rebuildLights(p: NightParams) {
    const lamps = Object.values(p.doc.objects).filter((o): o is LampObject => o.type === 'lamp' && !o.hidden && p.doc.layers[o.layerId]?.visible !== false);
    const levels = lamps.map((l) => p.level(l));
    const key = lamps.map((l, i) => `${l.id}:${levels[i]}`).join(',') + `|${p.doc.site.northDeg}`;
    if (key === this.lightsKey && this.lastDoc === p.doc) return;
    this.lightsKey = key;
    this.lastDoc = p.doc;
    for (const c of this.lightWorld.removeChildren()) c.destroy({ children: true });
    for (const c of [...this.glow.children]) if (c !== this.clip) c.destroy({ children: true });

    const reflections = new Container();
    const waterMask = new Graphics();
    for (const poly of this.water) waterMask.poly(poly.flatMap((q) => [q.x, q.y]), true).fill(0xffffff);
    reflections.addChild(waterMask);
    reflections.mask = waterMask;

    lamps.forEach((l, i) => {
      const level = levels[i];
      if (level <= 0) return;
      const spec = getLamp(l.lampType);
      const tint = l.lampType === 'underwater' ? 0x9ff0f4 : kelvinHex(l.kelvin);
      const range = Math.max(2.5, Math.min(16, lampRange(l.lumen * level, l.beamAngleDeg) * 0.9));
      const strength = Math.min(1, 0.4 + (l.lumen * level) / 900);
      const c = new Container();

      if (l.path) {
        const line = flattenPath(l.path, 0.02);
        for (const b of bulbs(line, 0.65)) {
          const s = new Sprite(radial());
          s.anchor.set(0.5);
          s.tint = tint;
          s.blendMode = 'add';
          s.alpha = 0.32 * level;
          s.width = s.height = 2.2;
          s.position.set(b.x, b.y);
          c.addChild(s);
          const core = new Sprite(radial());
          core.anchor.set(0.5);
          core.tint = 0xfff6e6;
          core.blendMode = 'add';
          core.alpha = 0.9 * level;
          core.width = core.height = 0.35;
          core.position.set(b.x, b.y);
          this.glow.addChild(core);
        }
      } else if (l.beamAngleDeg < 300) {
        const d = planDirection(l.directionDeg, p.doc.site.northDeg);
        const s = new Sprite(cone(l.beamAngleDeg));
        s.anchor.set(0, 0.5);
        s.tint = tint;
        s.blendMode = 'add';
        s.alpha = strength;
        s.width = s.height = range * 1.25;
        s.rotation = Math.atan2(d.y, d.x);
        s.position.set(l.position.x, l.position.y);
        c.addChild(s);
        const foot = new Sprite(radial());
        foot.anchor.set(0.5);
        foot.tint = tint;
        foot.blendMode = 'add';
        foot.alpha = strength * 0.6;
        foot.width = foot.height = range * 0.35;
        foot.position.set(l.position.x, l.position.y);
        c.addChild(foot);
      } else {
        const s = new Sprite(radial());
        s.anchor.set(0.5);
        s.tint = tint;
        s.blendMode = 'add';
        s.alpha = strength;
        s.width = s.height = range * 1.5;
        s.position.set(l.position.x, l.position.y);
        c.addChild(s);
      }

      // Verdeckung durch Gebäude und Hecken
      const occ = new Graphics();
      occluders(occ, l.position, range, this.obs, spec.heightM);
      if (occ.bounds.width > 0) {
        c.addChild(occ);
        c.setMask({ mask: occ, inverse: true });
      } else occ.destroy();

      // Unterwasserlicht leuchtet nur im Wasser
      if (l.lampType === 'underwater' && this.water.length) {
        const m = new Graphics();
        for (const poly of this.water) m.poly(poly.flatMap((q) => [q.x, q.y]), true).fill(0xffffff);
        c.addChild(m);
        c.mask = m;
      }
      this.lightWorld.addChild(c);

      // Leuchtenkern
      if (!l.path) {
        const core = new Sprite(radial());
        core.anchor.set(0.5);
        core.tint = tint;
        core.blendMode = 'add';
        core.alpha = 0.95 * level;
        core.width = core.height = 0.9;
        core.position.set(l.position.x, l.position.y);
        this.glow.addChild(core);
        const dot = new Graphics().circle(l.position.x, l.position.y, 0.13).fill({ color: 0xfff6e6, alpha: Math.min(1, 0.4 + level) });
        this.glow.addChild(dot);
      }

      // Spiegelung auf nahen Wasserflächen
      for (const poly of this.water) {
        const q = closestPointOn(l.position, poly);
        const dist = Math.hypot(q.x - l.position.x, q.y - l.position.y);
        if (dist > 7 && !pointInPolygon(l.position, poly)) continue;
        const cen = centroid(poly);
        const into = { x: q.x + (cen.x - q.x) * 0.25, y: q.y + (cen.y - q.y) * 0.25 };
        const r = new Sprite(radial());
        r.anchor.set(0.5);
        r.tint = tint;
        r.blendMode = 'add';
        r.alpha = Math.max(0.15, 0.6 - dist * 0.06) * level;
        r.width = 2.6;
        r.height = 0.8;
        r.position.set(into.x, into.y);
        reflections.addChild(r);
      }
    });
    this.glow.addChildAt(reflections, 0);
    this.glow.addChild(this.clip);
  }

  private lastDoc: Project | null = null;
}

/** Punkte im Abstand `step` entlang einer Polylinie */
function bulbs(line: Vec2[], step: number): Vec2[] {
  const out: Vec2[] = [];
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    for (let t = step - acc; t < L; t += step) out.push({ x: a.x + ((b.x - a.x) * t) / L, y: a.y + ((b.y - a.y) * t) / L });
    acc = (acc + L) % step;
  }
  return out;
}

