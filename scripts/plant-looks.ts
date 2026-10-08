/**
 * Exportiert den Pflanzenkatalog mit den Looks je Jahreszeit für die Blender-Pipeline.
 *
 *   npm run assets:looks   →   assets/blender/plants.json
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLANTS } from '../src/core/catalog/plants';
import { distinctLooks } from '../src/render/assets/plantLooks';

const out = PLANTS.map((sp) => ({
  id: sp.id,
  name: sp.name,
  kind: sp.kind,
  deciduous: sp.deciduous,
  marcescent: !!sp.marcescent,
  diameterMature: sp.diameterMature,
  heightMature: sp.heightMature,
  colors: sp.colors,
  looks: distinctLooks(sp),
}));
writeFileSync(join(process.cwd(), 'assets/blender/plants.json'), JSON.stringify(out, null, 1));
console.log(`${out.length} Arten, ${out.reduce((n, s) => n + s.looks.length, 0)} Looks`);
