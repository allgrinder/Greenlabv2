import type { Vec2 } from '../model/types';

export const v = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const mid = (a: Vec2, b: Vec2): Vec2 => lerp(a, b, 0.5);
/** Senkrechte, im Bildschirmsystem (y nach unten) 90° im Uhrzeigersinn */
export const perp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });
export const eq = (a: Vec2, b: Vec2, eps = 1e-9): boolean => Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;

export function normalize(a: Vec2): Vec2 {
  const l = len(a);
  return l === 0 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
}

export const deg2rad = (d: number): number => (d * Math.PI) / 180;
export const rad2deg = (r: number): number => (r * 180) / Math.PI;

/** Dreht um `origin`. Positive Winkel drehen im Bildschirmsystem im Uhrzeigersinn. */
export function rotate(p: Vec2, deg: number, origin: Vec2 = { x: 0, y: 0 }): Vec2 {
  const r = deg2rad(deg);
  const c = Math.cos(r);
  const s = Math.sin(r);
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return { x: origin.x + dx * c - dy * s, y: origin.y + dx * s + dy * c };
}

/** Richtung in Grad, 0 = +x (Osten), 90 = +y (Süden) */
export const angleDeg = (a: Vec2): number => rad2deg(Math.atan2(a.y, a.x));

export const fromAngle = (deg: number, length = 1): Vec2 => ({
  x: Math.cos(deg2rad(deg)) * length,
  y: Math.sin(deg2rad(deg)) * length,
});

/** Nächster Punkt auf der Strecke a–b und Parameter t ∈ [0,1] */
export function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): { p: Vec2; t: number; d: number } {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  const q = add(a, scale(ab, t));
  return { p: q, t, d: dist(p, q) };
}
