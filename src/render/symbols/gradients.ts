import { FillGradient } from 'pixi.js';

let canopy: FillGradient | null = null;
let clump: FillGradient | null = null;
let water: FillGradient | null = null;

/** Lichtkante oben links, Schatten am Rand – wie gwCanopy */
export function canopyGradient(): FillGradient {
  canopy ??= new FillGradient({
    type: 'radial',
    center: { x: 0.36, y: 0.32 },
    innerRadius: 0,
    outerCenter: { x: 0.5, y: 0.5 },
    outerRadius: 0.5,
    textureSpace: 'local',
    colorStops: [
      { offset: 0, color: 'rgba(255,251,230,0.38)' },
      { offset: 0.45, color: 'rgba(255,255,255,0)' },
      { offset: 0.84, color: 'rgba(14,26,8,0.22)' },
      { offset: 1, color: 'rgba(14,26,8,0)' },
    ],
  });
  return canopy;
}

export function clumpGradient(): FillGradient {
  clump ??= new FillGradient({
    type: 'radial',
    center: { x: 0.38, y: 0.34 },
    innerRadius: 0,
    outerCenter: { x: 0.5, y: 0.5 },
    outerRadius: 0.5,
    textureSpace: 'local',
    colorStops: [
      { offset: 0, color: 'rgba(255,251,230,0.3)' },
      { offset: 0.55, color: 'rgba(255,255,255,0)' },
      { offset: 0.9, color: 'rgba(14,26,8,0.16)' },
      { offset: 1, color: 'rgba(14,26,8,0)' },
    ],
  });
  return clump;
}

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
