import { FillGradient } from 'pixi.js';

let water: FillGradient | null = null;

/** Wasser: diagonaler Verlauf wie gwWater */
export function waterGradient(): FillGradient {
  water ??= new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
    textureSpace: 'local',
    colorStops: [
      { offset: 0, color: '#93B9B8' },
      { offset: 0.55, color: '#5F8F95' },
      { offset: 1, color: '#47767F' },
    ],
  });
  return water;
}
