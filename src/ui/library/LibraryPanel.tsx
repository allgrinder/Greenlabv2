/**
 * Bibliothek (Design-Screen 04): Pflanzen und Objekte mit realen Maßen.
 * Klick wählt das Element für „Pflanze setzen“, Ziehen legt es direkt auf den Plan.
 */
import { useMemo, useState } from 'react';
import { ITEMS } from '../../core/catalog/items';
import { PLANTS } from '../../core/catalog/plants';
import type { PlantKind } from '../../core/model/types';
import { useEditor } from '../../state';
import type { Brush } from '../../state/types';
import { DND_MIME } from '../../tools/BackgroundTools';
import { LAMPS, kelvinRgb } from '../../core/catalog/lamps';
import { irrGlyph, lampGlyph } from './glyphs';
import { glyphSrc, SYMBOL_GLYPH, type GlyphKind } from './glyphs';
import u from '../components/ui.module.css';
import s from './library.module.css';


type Filter = 'all' | 'plants' | 'build' | 'water' | 'light';

/** Bibliothekseintrag: setzt einen Pinsel oder startet ein Linienwerkzeug */
interface Entry {
  key: string;
  name: string;
  src: string;
  brush: Brush | 'hedge' | 'drip' | 'pipe' | 'lights';
  search: string;
  filter: Filter[];
  sub?: string;
}



const PLANT_SECTIONS: { h: string; kinds: PlantKind[]; glyph: GlyphKind }[] = [
  { h: 'Bäume', kinds: ['tree'], glyph: 'tree' },
  { h: 'Sträucher', kinds: ['shrub'], glyph: 'shrub' },
  { h: 'Stauden & Gräser', kinds: ['perennial', 'grass'], glyph: 'peren' },
  { h: 'Gemüse & Kräuter', kinds: ['vegetable'], glyph: 'veg' },
];

function useSections() {
  return useMemo(() => {
    const sections: { h: string; items: Entry[] }[] = PLANT_SECTIONS.map((sec) => ({
      h: sec.h,
      items: PLANTS.filter((p) => sec.kinds.includes(p.kind)).map((p) => ({
        key: `plant:${p.id}`,
        name: p.name,
        src: glyphSrc(sec.glyph, p.colors.bloom && sec.glyph === 'peren' ? p.colors.summer : p.colors.summer, p.colors.spring ?? '#8FA56C'),
        brush: { kind: 'plant', speciesId: p.id } as Brush,
        search: `${p.name} ${p.latin}`.toLowerCase(),
        filter: ['all', 'plants'] as Filter[],
      })),
    }));
    const build: Entry[] = ITEMS.filter((i) => i.category !== 'edging' && i.category !== 'building').map((i) => ({
      key: `item:${i.id}`,
      name: i.name.replace(/ \d.*$/, '').replace(/,.*$/, ''),
      src: glyphSrc(SYMBOL_GLYPH[i.symbol] ?? 'edge'),
      brush: { kind: 'item', catalogId: i.id } as Brush,
      search: i.name.toLowerCase(),
      filter: (i.category === 'pond' || i.category === 'pool' ? ['all', 'build', 'water'] : ['all', 'build']) as Filter[],
    }));
    build.splice(7, 0, { key: 'hedge', name: 'Hecke', src: glyphSrc('hedge'), brush: 'hedge', search: 'hecke hainbuche', filter: ['all', 'plants', 'build'] });
    sections.push({ h: 'Bauten & Ausstattung', items: build });
    sections.push({
      h: 'Licht',
      items: LAMPS.map((l) => ({
        key: `lamp:${l.type}`,
        name: l.short,
        sub: `${l.lumen} lm · ${l.kelvin} K · ${l.beamDeg >= 360 ? '360°' : l.beamDeg + '°'}`,
        src: lampGlyph(l.type, kelvinRgb(l.kelvin)),
        brush: (l.type === 'stringLights' ? 'lights' : { kind: 'lamp', lampType: l.type }) as Entry['brush'],
        search: `${l.name} leuchte licht`.toLowerCase(),
        filter: ['all', 'light'] as Filter[],
      })),
    });
    sections.push({
      h: 'Bewässerung',
      items: [
        { key: 'irr:sprinkler', name: 'Regner', src: irrGlyph('sprinkler'), brush: { kind: 'irr', what: 'sprinkler' } as Brush, search: 'versenkregner regner sprinkler', filter: ['all', 'water'] as Filter[] },
        { key: 'irr:drip', name: 'Tropfschlauch', src: irrGlyph('drip'), brush: 'drip' as const, search: 'tropfschlauch tropfrohr', filter: ['all', 'water'] as Filter[] },
        { key: 'irr:pipe', name: 'Leitung', src: irrGlyph('pipe'), brush: 'pipe' as const, search: 'leitung rohr pe', filter: ['all', 'water'] as Filter[] },
        { key: 'irr:manifold', name: 'Verteiler', src: irrGlyph('manifold'), brush: { kind: 'irr', what: 'manifold' } as Brush, search: 'verteiler ventil', filter: ['all', 'water'] as Filter[] },
        { key: 'irr:tap', name: 'Anschluss', src: irrGlyph('tap'), brush: { kind: 'irr', what: 'tap' } as Brush, search: 'wasseranschluss hahn', filter: ['all', 'water'] as Filter[] },
      ],
    });
    return sections;
  }, []);
}

export function LibraryPanel() {
  const sections = useSections();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const brush = useEditor((st) => st.session.brush);
  const tool = useEditor((st) => st.session.tool);
  const setSession = useEditor((st) => st.setSession);
  const total = sections.reduce((a, x) => a + x.items.length, 0);

  const pick = (e: Entry) => {
    // Bewässerungsteile sind nur in der Bewässerungs-Linse sichtbar
    const water = e.key.startsWith('irr:');
    const lens = water ? { lens: 'irrigation' as const } : {};
    if (typeof e.brush === 'string') setSession({ tool: e.brush, selection: [], ...lens });
    else setSession({ brush: e.brush, tool: 'plant', selection: [], ...lens });
  };
  const isOn = (e: Entry) => (typeof e.brush === 'string' ? tool === e.brush : tool === 'plant' && JSON.stringify(brush) === JSON.stringify(e.brush));

  const query = q.trim().toLowerCase();
  const FILTERS: { v: Filter; label: string }[] = [
    { v: 'all', label: 'Alle' },
    { v: 'plants', label: 'Pflanzen' },
    { v: 'build', label: 'Bauten' },
    { v: 'water', label: 'Wasser' },
    { v: 'light', label: 'Licht' },
  ];

  return (
    <aside className={s.panel} aria-label="Bibliothek" data-testid="library">
      <div className={s.head}>
        <span className={s.title}>Bibliothek</span>
        <span className={s.count}>{total} Elemente</span>
      </div>
      <label className={s.search}>
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
          <path d="M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14ZM20 20l-4-4" stroke="var(--ink3)" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </svg>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Felsenbirne, Hochbeet, Teich …" onKeyDown={(e) => e.stopPropagation()} data-testid="library-search" />
      </label>
      <div className={s.chips}>
        {FILTERS.map((f) => (
          <button key={f.v} type="button" className={filter === f.v ? s.chipOn : s.chip} onClick={() => setFilter(f.v)}>
            {f.label}
          </button>
        ))}
      </div>
      <div className={s.scroll}>
        {sections.map((sec) => {
          const items = sec.items.filter((e) => e.filter.includes(filter) && (!query || e.search.includes(query)));
          if (!items.length) return null;
          return (
            <div key={sec.h} className={s.section}>
              <div className={s.secHead}>
                <span className={u.eyebrow}>{sec.h}</span>
                <span className={s.secCount}>{items.length}</span>
              </div>
              <div className={s.grid}>
                {items.map((e) => (
                  <button
                    key={e.key}
                    type="button"
                    className={s.item}
                    title={e.sub ? `${e.name} · ${e.sub}` : e.name}
                    draggable={typeof e.brush !== 'string'}
                    onDragStart={(ev) => {
                      if (typeof e.brush === 'string') return;
                      ev.dataTransfer.setData(DND_MIME, JSON.stringify(e.brush));
                      ev.dataTransfer.effectAllowed = 'copy';
                      const img = new Image();
                      img.src = e.src;
                      ev.dataTransfer.setDragImage(img, 20, 20);
                    }}
                    onClick={() => pick(e)}
                    data-testid={`lib-${e.key}`}
                  >
                    <span className={isOn(e) ? s.thumbOn : s.thumb}>
                      <img src={e.src} width={40} height={40} alt="" draggable={false} />
                    </span>
                    <span className={s.name}>{e.name}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className={s.hint}>Ziehen zum Platzieren oder anklicken und im Plan setzen. Mit Esc zurück zur Auswahl.</div>
    </aside>
  );
}
