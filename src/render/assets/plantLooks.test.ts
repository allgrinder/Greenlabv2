import { describe, expect, it } from 'vitest';
import { getSpecies } from '../../core/catalog/plants';
import { distinctLooks, lookKey, plantLook } from './plantLooks';

describe('Pflanzen-Looks (gemeinsam für App und Blender)', () => {
  it('Laubgehölz: vier Jahreszeiten, im Winter kahl, Blüte im Frühling', () => {
    const cherry = getSpecies('prunus-serrulata');
    expect(plantLook(cherry, 'winter').bare).toBe(true);
    expect(plantLook(cherry, 'spring').bloom).not.toBeNull();
    expect(plantLook(cherry, 'summer').bloom).toBeNull();
    expect(distinctLooks(cherry)).toHaveLength(4);
  });

  it('Immergrün: ein Look für das ganze Jahr', () => {
    const looks = distinctLooks(getSpecies('buxus'));
    expect(looks).toHaveLength(1);
    expect(looks[0].seasons).toEqual(['spring', 'summer', 'autumn', 'winter']);
  });

  it('Stauden: grünes Laub, Blütenfarbe nur zur Blüte', () => {
    const salvia = getSpecies('salvia');
    const summer = plantLook(salvia, 'summer');
    expect(summer.color).toBe('#6d8a4b');
    expect(summer.bloom).toBe(salvia.colors.bloom ?? salvia.colors.summer);
    expect(plantLook(salvia, 'spring').bloom).toBeNull();
  });

  it('Schlüssel unterscheidet alle sichtbaren Merkmale', () => {
    const a = { color: '#112233', bare: false, bloom: null, fruit: null };
    expect(lookKey(a)).not.toBe(lookKey({ ...a, bare: true }));
    expect(lookKey(a)).not.toBe(lookKey({ ...a, bloom: '#ffffff' }));
    expect(lookKey(a)).not.toBe(lookKey({ ...a, fruit: '#ff0000' }));
  });
});
