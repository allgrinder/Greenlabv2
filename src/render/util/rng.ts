/** Deterministischer Zufall (Park-Miller), wie im Design-Prototyp */
export function rng(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Stabiler Seed aus einer Objekt-ID */
export function seedFrom(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) % 2147483646 || 1;
}

export const hex = (c: string): number => parseInt(c.replace('#', ''), 16);
