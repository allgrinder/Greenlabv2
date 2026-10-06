/**
 * Draufsicht-Vorschaubilder für die Bibliothek, portiert aus der glyph()-Funktion
 * in Gartenwerk.dc.html (40×40-Raster, SVG als Data-URL).
 */
type P = { d: string; f: string; s?: string };

const C = (x: number, y: number, r: number) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
const ln = 'rgba(30,40,20,.35)';

export type GlyphKind = 'tree' | 'shrub' | 'peren' | 'veg' | 'bed' | 'shed' | 'deck' | 'pond' | 'pool' | 'play' | 'furn' | 'hedge' | 'glass' | 'comp' | 'lamp' | 'house' | 'barrel' | 'lounger' | 'planter' | 'fence' | 'edge';

export function glyph(kind: GlyphKind, c1 = '#7E9A5C', c2 = '#8FA56C'): P[] {
  switch (kind) {
    case 'tree': {
      const g: P[] = [];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * 6.283;
        g.push({ d: C(20 + Math.cos(a) * 11.5, 20 + Math.sin(a) * 11.5, 5.2), f: c1, s: ln });
      }
      g.push({ d: C(20, 20, 13), f: c1 }, { d: C(16, 15.5, 7), f: 'rgba(255,253,230,.22)' }, { d: C(20, 20, 1.4), f: '#3B3226' });
      return g;
    }
    case 'shrub':
      return [
        { d: C(14, 17, 7.5), f: c1, s: ln },
        { d: C(26, 15, 7), f: c1, s: ln },
        { d: C(21, 26, 8), f: c1, s: ln },
        { d: C(18, 18, 5), f: 'rgba(255,253,230,.2)' },
      ];
    case 'peren':
      return [
        [12, 13],
        [20, 10],
        [28, 14],
        [15, 21],
        [24, 22],
        [31, 23],
        [11, 29],
        [19, 30],
        [28, 30],
      ].map(([x, y], i) => ({ d: C(x, y, 3.7), f: i % 3 ? c1 : c2, s: 'rgba(30,30,20,.25)' }));
    case 'veg': {
      const g: P[] = [{ d: 'M5 7h30v26H5Z', f: '#6B5442' }];
      [12, 20, 28].forEach((y) => [11, 20, 29].forEach((x) => g.push({ d: C(x, y, 3.4), f: c1, s: ln })));
      return g;
    }
    case 'bed':
      return [{ d: 'M4 12h32v16H4Z', f: '#A27C56', s: '#6F5238' }, { d: 'M6.5 14.5h27v11h-27Z', f: '#5B4535' }, ...[10, 16, 22, 28].map((x) => ({ d: C(x, 20, 2.6), f: '#93B166' }))];
    case 'shed':
      return [{ d: 'M8 8h12v24H8Z', f: '#8A745E' }, { d: 'M20 8h12v24H20Z', f: '#6F5C49' }, { d: 'M7 7h26v26H7Z', f: 'none', s: '#4A3B2D' }, { d: 'M20 7V33', f: 'none', s: '#4A3B2D' }];
    case 'house':
      return [
        { d: 'M6 9h28v22H6Z', f: '#55585B' },
        { d: 'M6 9h28l-11 11h-6Z', f: '#46494C' },
        { d: 'M6 31h28l-11-11h-6Z', f: '#6A6D70' },
        { d: 'M6 9l11 11-11 11Z', f: '#62656A' },
        { d: 'M34 9l-11 11 11 11Z', f: '#4F5255' },
      ];
    case 'deck':
      return [{ d: 'M5 9h30v22H5Z', f: '#B78C61', s: '#7E5C3D' }, { d: 'M5 13.4H35M5 17.8H35M5 22.2H35M5 26.6H35M18 9v4.4M28 13.4v4.4M12 17.8v4.4M24 22.2v4.4', f: 'none', s: 'rgba(70,45,25,.55)' }];
    case 'pond':
      return [
        { d: 'M8 19C9 10 22 7 29 11C36 15 35 27 27 31C18 35 7 29 8 19Z', f: '#6E9AA0', s: '#A69C8C' },
        { d: 'M13 15C17 11 24 11 28 14', f: 'none', s: 'rgba(255,255,255,.5)' },
        { d: C(24, 24, 2.6), f: '#7C9A5C' },
      ];
    case 'pool':
      return [
        { d: 'M9 7h22a3 3 0 0 1 3 3v20a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V10a3 3 0 0 1 3-3Z', f: '#DCD4C4', s: '#A69C8C' },
        { d: 'M11 10h18a1.5 1.5 0 0 1 1.5 1.5v17a1.5 1.5 0 0 1-1.5 1.5H11a1.5 1.5 0 0 1-1.5-1.5v-17A1.5 1.5 0 0 1 11 10Z', f: '#8CC6D6' },
        { d: 'M12 15c3-1.5 6-1.5 9 0', f: 'none', s: 'rgba(255,255,255,.6)' },
      ];
    case 'play':
      return [{ d: 'M5 20h14v14H5Z', f: '#E3D3A8', s: '#B5A57A' }, { d: 'M22 7H36M23 7V22M35 7V22M27 9v7M31 9v7', f: 'none', s: '#6B5A47' }, { d: 'M25.5 16h3M29.5 16h3', f: 'none', s: '#B9724F' }];
    case 'furn':
      return [{ d: 'M14 11h12v18H14Z', f: '#ECE6D9', s: '#837A6B' }, ...[[8, 13], [8, 23], [28, 13], [28, 23]].map(([x, y]) => ({ d: `M${x} ${y}h4v4h-4Z`, f: '#D9CFBE', s: '#837A6B' }))];
    case 'lounger':
      return [{ d: 'M6 15h28v10H6Z', f: '#F1EDE5', s: '#837A6B' }, { d: 'M7 16h6v8H7Z', f: '#DCD2C1', s: '#9C9384' }];
    case 'planter':
      return [{ d: C(20, 20, 11), f: '#B9724F', s: '#7E4A31' }, { d: C(20, 20, 8.5), f: '#7D9561' }];
    case 'barrel':
      return [{ d: C(20, 20, 11), f: '#55605A', s: '#3C4440' }, { d: C(20, 20, 7), f: '#425049' }];
    case 'hedge': {
      const g: P[] = [{ d: 'M4 15H36V25H4Z', f: '#5B7350' }];
      for (let x = 6; x <= 34; x += 5.6) g.push({ d: C(x, 15, 3), f: '#5B7350' }, { d: C(x + 2.8, 25, 3), f: '#5B7350' });
      g.push({ d: 'M4 20H36', f: 'none', s: 'rgba(255,252,225,.25)' });
      return g;
    }
    case 'fence':
      return [{ d: 'M4 19h32v2H4Z', f: '#8A745E' }, ...[6, 14, 22, 30].map((x) => ({ d: `M${x} 18h2v4h-2Z`, f: '#4A3B2D' }))];
    case 'edge':
      return [{ d: 'M4 18h32v4H4Z', f: '#A3998A', s: '#7E7566' }];
    case 'glass':
      return [{ d: 'M7 9h26v22H7Z', f: '#DCE7E5', s: '#8E9B99' }, { d: 'M7 20H33M12.2 9V31M17.4 9V31M22.6 9V31M27.8 9V31', f: 'none', s: 'rgba(110,125,123,.6)' }];
    case 'comp':
      return [{ d: 'M5 12h14v16H5Z', f: '#7E6448', s: '#57432F' }, { d: 'M21 12h14v16H21Z', f: '#6E553D', s: '#57432F' }, { d: 'M7 14h10v12H7ZM23 14h10v12H23Z', f: '#4D3C2D' }];
    case 'lamp':
      return [{ d: C(20, 20, 13), f: 'rgba(233,180,94,.28)' }, { d: C(20, 20, 5), f: '#FBF8F1', s: '#2F3234' }, { d: C(20, 20, 1.8), f: '#C9963F' }];
  }
}

const cache = new Map<string, string>();

export function glyphSrc(kind: GlyphKind, c1?: string, c2?: string): string {
  const key = `${kind}|${c1}|${c2}`;
  let url = cache.get(key);
  if (!url) {
    const body = glyph(kind, c1, c2)
      .map((p) => `<path d="${p.d}" fill="${p.f}" stroke="${p.s ?? 'none'}" stroke-width=".8" stroke-linecap="round"/>`)
      .join('');
    url = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">${body}</svg>`);
    cache.set(key, url);
  }
  return url;
}

/** Katalog-Symbol → Vorschaubild */
export const SYMBOL_GLYPH: Record<string, GlyphKind> = {
  house: 'house',
  raisedBed: 'bed',
  shed: 'shed',
  deck: 'deck',
  pond: 'pond',
  pool: 'pool',
  play: 'play',
  table: 'furn',
  lounger: 'lounger',
  planter: 'planter',
  fence: 'fence',
  greenhouse: 'glass',
  compost: 'comp',
  barrel: 'barrel',
  edge: 'edge',
};
