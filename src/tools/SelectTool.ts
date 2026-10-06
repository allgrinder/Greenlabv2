/**
 * Auswahlwerkzeug: Klick wählt, ⇧ ergänzt; Ziehen verschiebt (mit Fang); Ziehen ins Leere
 * zieht einen Auswahlrahmen. Bei Einzelauswahl sind Knoten und Bézier-Griffe direkt greifbar:
 * Doppelklick bzw. Alt-Klick auf eine Kante fügt einen Punkt ein, Entf löscht den aktiven Punkt.
 */
import type { Graphics } from 'pixi.js';
import { editableNodes } from '../core/geometry/objects';
import { pathSegments, toPath } from '../core/geometry/shape';
import type { SnapResult } from '../core/geometry/snap';
import { flattenCubic } from '../core/geometry/bezier';
import { add, closestOnSegment, dist, sub } from '../core/geometry/vec';
import type { Id, PathGeometry, PlanObject, Vec2 } from '../core/model/types';
import { ACCENT, type ToScreen } from '../render/overlays/overlay';
import { drawSnap } from './preview';
import type { Tool, ToolContext, WorldPointerEvent } from './Tool';

type Grab =
  | { kind: 'move'; ids: Id[]; start: Vec2; applied: Vec2; moved: boolean; startScreen: Vec2 }
  | { kind: 'node'; id: Id; index: number; startScreen: Vec2; moved: boolean }
  | { kind: 'handle'; id: Id; index: number; which: 'in' | 'out' }
  | { kind: 'marquee'; a: Vec2; b: Vec2; additive: boolean };

let gestureSeq = 0;

/** Pfad, dessen Knoten bearbeitbar sind */
function editablePath(o: PlanObject): PathGeometry | null {
  if (o.type === 'area' || o.type === 'planting') return toPath(o.region.outer);
  if (o.type === 'path' || o.type === 'hedge') return o.centerline;
  return null;
}

/** Wie editablePath, aber ohne Rechteck-Umwandlung (für Drafts mit bereits umgewandeltem Pfad) */
function editablePathDraft(o: PlanObject): PathGeometry | null {
  if ((o.type === 'area' || o.type === 'planting') && o.region.outer.kind === 'path') return o.region.outer;
  if (o.type === 'path' || o.type === 'hedge') return o.centerline;
  return null;
}

export class SelectTool implements Tool {
  readonly id = 'select';
  cursor = 'default';
  private grab: Grab | null = null;
  private snap: SnapResult | null = null;

  constructor(private ctx: ToolContext) {}

  private get session() {
    return this.ctx.store.getState().session;
  }

  /** Griff unter dem Cursor (nur bei Einzelauswahl) */
  private hitHandle(e: WorldPointerEvent): Grab | null {
    const sel = this.session.selection;
    if (sel.length !== 1) return null;
    const o = this.ctx.doc().objects[sel[0]];
    if (!o || !this.ctx.selectable(o) || o.locked) return null;
    const tol = this.ctx.px(8);
    const path = editablePath(o);
    if (path && path.source !== 'rect') {
      for (let i = 0; i < path.nodes.length; i++) {
        const n = path.nodes[i];
        for (const which of ['in', 'out'] as const) {
          const h = n[which];
          if (h && dist(add(n.p, h), e.raw) <= tol) return { kind: 'handle', id: o.id, index: i, which };
        }
      }
    }
    if (o.type === 'item') return null;
    const nodes = editableNodes(o);
    for (let i = 0; i < nodes.length; i++) if (dist(nodes[i], e.raw) <= tol) return { kind: 'node', id: o.id, index: i, startScreen: e.screen, moved: false };
    return null;
  }

  /** Nächste Kante eines Pfads (für „Punkt einfügen“) */
  private edgeAt(o: PlanObject, p: Vec2): { after: number; at: Vec2 } | null {
    const path = editablePath(o);
    if (!path || (o.type === 'area' && o.region.outer.kind === 'rect')) return null;
    const segs = pathSegments(path);
    let best: { after: number; at: Vec2; d: number } | null = null;
    segs.forEach((c, i) => {
      const pts = [c[0], ...flattenCubic(c, 0.01)];
      for (let k = 1; k < pts.length; k++) {
        const q = closestOnSegment(p, pts[k - 1], pts[k]);
        if (!best || q.d < best.d) best = { after: i, at: q.p, d: q.d };
      }
    });
    const b = best as { after: number; at: Vec2; d: number } | null;
    return b && b.d <= this.ctx.px(8) ? { after: b.after, at: b.at } : null;
  }

  down(e: WorldPointerEvent) {
    if (e.button !== 0) return;
    const st = this.ctx.store.getState();
    const doc = this.ctx.doc();
    const handle = this.hitHandle(e);
    if (handle) {
      this.grab = handle;
      if (handle.kind === 'node') st.setSession({ activeNode: { objectId: handle.id, nodeIndex: handle.index } });
      return;
    }
    // Punkt einfügen: Doppelklick oder Alt-Klick auf eine Kante des gewählten Objekts
    if ((e.dbl || e.alt) && st.session.selection.length === 1) {
      const o = doc.objects[st.session.selection[0]];
      const edge = o && this.edgeAt(o, e.raw);
      if (o && edge) {
        this.ctx.cmd.insertNode(o.id, edge.after, edge.at);
        st.setSession({ activeNode: { objectId: o.id, nodeIndex: edge.after + 1 } });
        return;
      }
    }
    const hit = this.ctx.renderer.index.hit(doc, e.raw, this.ctx.px(4), this.ctx.selectable);
    if (hit) {
      let sel = st.session.selection;
      if (e.shift) sel = sel.includes(hit) ? sel.filter((x) => x !== hit) : [...sel, hit];
      else if (!sel.includes(hit)) sel = [hit];
      st.setSession({ selection: sel, activeNode: null });
      const movable = sel.filter((id) => !doc.objects[id]?.locked);
      if (movable.length && sel.includes(hit)) this.grab = { kind: 'move', ids: movable, start: e.p, applied: { x: 0, y: 0 }, moved: false, startScreen: e.screen };
      return;
    }
    if (!e.shift) st.setSession({ selection: [], activeNode: null });
    this.grab = { kind: 'marquee', a: e.raw, b: e.raw, additive: e.shift };
  }

  move(e: WorldPointerEvent) {
    const g = this.grab;
    this.snap = null;
    if (!g) {
      // Hover-Hervorhebung und Cursor
      const doc = this.ctx.doc();
      const handle = this.hitHandle(e);
      const hit = handle ? null : this.ctx.renderer.index.hit(doc, e.raw, this.ctx.px(4), this.ctx.selectable);
      if (this.session.hoverId !== hit) this.ctx.store.getState().setSession({ hoverId: hit });
      this.ctx.setCursor(handle ? 'pointer' : hit ? 'move' : 'default');
      return;
    }
    const key = `gesture:${gestureSeq}`;
    if (g.kind === 'move') {
      if (!g.moved && dist(e.screen, g.startScreen) < 3) return;
      g.moved = true;
      this.snap = e.snap;
      const total = sub(e.p, g.start);
      const delta = sub(total, g.applied);
      if (delta.x || delta.y) {
        this.ctx.cmd.moveObjects(g.ids, delta, key);
        g.applied = total;
      }
    } else if (g.kind === 'node') {
      if (!g.moved && dist(e.screen, g.startScreen) < 2) return;
      g.moved = true;
      this.snap = e.snap;
      this.ctx.cmd.setNode(g.id, g.index, e.p, key);
    } else if (g.kind === 'handle') {
      const o = this.ctx.doc().objects[g.id];
      const path = o && editablePath(o);
      const n = path?.nodes[g.index];
      if (n) {
        // Alt löst die Kopplung der Griffe (Knick statt glattem Knoten)
        if (e.alt && n.smooth) this.ctx.cmd.updateObject(g.id, 'Knoten lösen', (d) => void (editablePathDraft(d as PlanObject)!.nodes[g.index].smooth = false), key);
        this.ctx.cmd.setHandle(g.id, g.index, g.which, sub(e.raw, n.p), key);
      }
    } else {
      g.b = e.raw;
    }
    this.ctx.redraw();
  }

  up() {
    const g = this.grab;
    this.grab = null;
    gestureSeq++;
    this.ctx.store.getState().endGesture();
    if (g?.kind === 'marquee') {
      const minX = Math.min(g.a.x, g.b.x);
      const maxX = Math.max(g.a.x, g.b.x);
      const minY = Math.min(g.a.y, g.b.y);
      const maxY = Math.max(g.a.y, g.b.y);
      if (maxX - minX > this.ctx.px(3) || maxY - minY > this.ctx.px(3)) {
        const doc = this.ctx.doc();
        const ids = this.ctx.renderer.index
          .query({ minX, minY, maxX, maxY })
          .filter((id) => {
            const o = doc.objects[id];
            const b = this.ctx.renderer.index.bbox(id);
            return o && b && this.ctx.selectable(o) && b.minX >= minX && b.maxX <= maxX && b.minY >= minY && b.maxY <= maxY;
          });
        const prev = g.additive ? this.session.selection : [];
        this.ctx.store.getState().setSession({ selection: [...new Set([...prev, ...ids])] });
      }
    }
    this.ctx.redraw();
  }

  key(e: KeyboardEvent): boolean {
    const st = this.ctx.store.getState();
    const sel = st.session.selection;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const an = st.session.activeNode;
      if (an && sel.length === 1 && an.objectId === sel[0]) {
        this.ctx.cmd.deleteNode(an.objectId, an.nodeIndex);
        st.setSession({ activeNode: null });
      } else if (sel.length) this.ctx.cmd.deleteObjects(sel);
      return true;
    }
    if (e.key === 'Escape') {
      if (st.session.activeNode) st.setSession({ activeNode: null });
      else if (sel.length) st.setSession({ selection: [] });
      else return false;
      return true;
    }
    const arrows: Record<string, Vec2> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
    const a = arrows[e.key];
    if (a && sel.length) {
      const step = e.shiftKey ? 1 : (this.ctx.doc().settings.gridStepM ?? 0.1);
      this.ctx.cmd.moveObjects(sel, { x: a.x * step, y: a.y * step }, 'nudge');
      return true;
    }
    return false;
  }

  cancel() {
    this.grab = null;
  }

  preview(g: Graphics, toScreen: ToScreen) {
    drawSnap(g, toScreen, this.snap);
    const m = this.grab;
    if (m?.kind === 'marquee') {
      const A = toScreen(m.a);
      const B = toScreen(m.b);
      g.rect(Math.min(A.x, B.x), Math.min(A.y, B.y), Math.abs(B.x - A.x), Math.abs(B.y - A.y)).fill({ color: ACCENT, alpha: 0.06 }).stroke({ color: ACCENT, width: 1 });
    }
  }
}
