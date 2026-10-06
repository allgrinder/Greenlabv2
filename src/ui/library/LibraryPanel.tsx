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
import { glyphSrc, SYMBOL_GLYPH, type GlyphKind } from './glyphs';
import u from '../components/ui.module.css';
import s from './library.module.css';


type Filter = 'all' | 'plants' | 'build' | 'water';

interface Entry {
  key: string;
  name: string;
  src: string;
  brush: Brush | 'hedge';
  search: string;
  filter: Filter[];
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
    if (e.brush === 'hedge') setSession({ tool: 'hedge', selection: [] });
    else setSession({ brush: e.brush, tool: 'plant', selection: [] });
  };
  const isOn = (e: Entry) =>
    e.brush === 'hedge'
      ? tool === 'hedge'
      : tool === 'plant' && (e.brush.kind === 'plant' ? brush.kind === 'plant' && brush.speciesId === e.brush.speciesId : brush.kind === 'item' && brush.catalogId === e.brush.catalogId);

  const query = q.trim().toLowerCase();
  const FILTERS: { v: Filter; label: string }[] = [
    { v: 'all', label: 'Alle' },
    { v: 'plants', label: 'Pflanzen' },
    { v: 'build', label: 'Bauten' },
    { v: 'water', label: 'Wasser' },
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
        <button type="button" className={s.chip} disabled title="Leuchten kommen mit dem Nachtmodus (Phase 2)">
          Licht
        </button>
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
                    title={e.name}
                    draggable={e.brush !== 'hedge'}
                    onDragStart={(ev) => {
                      if (e.brush === 'hedge') return;
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
