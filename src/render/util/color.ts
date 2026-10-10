/** Farben als RGB-Tripel (0–255) für pixelweise gemalte Texturen */
export type RGB = [number, number, number];

export const rgbOf = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mul = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
export const css = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
