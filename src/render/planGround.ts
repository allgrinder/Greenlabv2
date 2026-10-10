/** Grundstücksfläche und Hintergrundbild der Planansicht */
import type { Graphics, Sprite } from 'pixi.js';
import { getMaterial } from '../core/catalog/materials';
import type { Project, Vec2 } from '../core/model/types';
import { materialPattern } from './textures/materialTextures';

/** Grundstücksfläche: Erdton mit angedeuteter Mulchstruktur (35 %), wie im Design */
export function drawGroundShape(ground: Graphics, groundTex: Graphics, b: Vec2[]) {
  ground.clear();
  groundTex.clear();
  if (b.length < 3) return;
  const pts = b.flatMap((p) => [p.x, p.y]);
  ground.poly(pts, true).fill(0xd3c9b3);
  groundTex.poly(pts, true).fill(materialPattern(getMaterial('mulch')));
}

/** Hintergrundbild nach doc.background ausrichten (unsichtbar ohne Bild) */
export function applyBackground(sp: Sprite, doc: Project, bgUrl: string | null) {
  const bg = doc.background;
  if (!bg || !bg.visible || !bgUrl) {
    sp.visible = false;
    return;
  }
  sp.visible = true;
  sp.position.set(bg.origin.x, bg.origin.y);
  sp.scale.set(bg.metersPerPixel);
  sp.rotation = (bg.rotationDeg * Math.PI) / 180;
  sp.alpha = bg.opacity;
}
