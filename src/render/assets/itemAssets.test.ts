import { describe, expect, it } from 'vitest';
import { nearestRotation } from './itemAssets';

describe('Blender-Sprites: vorgerenderte Drehung', () => {
  it('wählt die nächste der vier Drehungen und dreht den Rest', () => {
    expect(nearestRotation(0)).toEqual({ k: 0, rest: 0 });
    expect(nearestRotation(90)).toEqual({ k: 1, rest: 0 });
    expect(nearestRotation(100)).toEqual({ k: 1, rest: 10 });
    expect(nearestRotation(-30)).toEqual({ k: 0, rest: -30 });
    expect(nearestRotation(-50)).toEqual({ k: 3, rest: 40 });
    expect(nearestRotation(350)).toEqual({ k: 0, rest: -10 });
    expect(nearestRotation(225)).toEqual({ k: 3, rest: -45 });
    expect(nearestRotation(720 + 181)).toEqual({ k: 2, rest: 1 });
  });
});
