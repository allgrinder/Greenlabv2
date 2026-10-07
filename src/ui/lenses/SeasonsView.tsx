/**
 * Linse „Jahreszeiten“ (Screen 08): Vergleichsansicht 4× mit Farbe, Blüte, Laub und Kahlheit.
 * Jede Kachel ist ein Offscreen-Rendering des Plans; Klick öffnet die Jahreszeit groß.
 */
import { useEffect, useMemo, useState } from 'react';
import { bbox } from '../../core/geometry/polygon';
import { SEASONS, type Season } from '../../core/growth';
import { seasonNote } from '../../core/growthReport';
import { editor, useEditor } from '../../state';
import { useRenderer } from '../canvas/PlanCanvas';
import { Icon } from '../icons';
import s from './lenses.module.css';

export function SeasonsView() {
  const renderer = useRenderer();
  const doc = useEditor((st) => st.doc);
  const focus = useEditor((st) => st.session.seasonFocus);
  const [urls, setUrls] = useState<Partial<Record<Season, string>>>({});

  // Neu rendern, wenn sich der Plan ändert (entprellt, nacheinander – der Renderer ist nicht reentrant)
  useEffect(() => {
    if (!renderer || !doc || focus) return;
    let alive = true;
    const made: string[] = [];
    const t = setTimeout(async () => {
      const b = bbox(doc.site.boundary);
      const cellW = (window.innerWidth - 128 - 14) / 2 - 16;
      const cellH = (window.innerHeight - 168 - 14) / 2 - 16;
      const ppm = Math.min(cellW / (b.maxX - b.minX + 1.2), cellH / (b.maxY - b.minY + 1.2)) * Math.min(2, window.devicePixelRatio || 1);
      for (const se of SEASONS) {
        if (!alive) break;
        try {
          const url = await renderer.snapshot({ season: se.k, years: 0, lens: 'seasons', night: false }, Math.max(4, ppm));
          made.push(url);
          if (alive) setUrls((u) => ({ ...u, [se.k]: url }));
        } catch (e) {
          console.error(e);
        }
      }
    }, 150);
    return () => {
      alive = false;
      clearTimeout(t);
      // alte Bilder erst freigeben, wenn die neuen da sind
      setTimeout(() => made.forEach((u) => URL.revokeObjectURL(u)), 4000);
    };
  }, [renderer, doc, focus]);

  const notes = useMemo(() => (doc ? Object.fromEntries(SEASONS.map((se) => [se.k, seasonNote(doc, se.k)])) : {}), [doc]);

  if (focus) {
    const se = SEASONS.find((x) => x.k === focus)!;
    return (
      <div className={s.seasonFocus} data-testid="season-focus">
        <span className={s.title} style={{ fontSize: 19 }}>
          {se.name}
        </span>
        <span className={s.mono} style={{ fontSize: 11, color: 'var(--ink3)' }}>
          {se.month.toUpperCase()}
        </span>
        <div className={s.segRow}>
          {SEASONS.map((x) => (
            <button key={x.k} type="button" className={x.k === focus ? s.segOn : s.seg} onClick={() => editor.getState().setSession({ season: x.k, seasonFocus: x.k })}>
              {x.name}
            </button>
          ))}
        </div>
        <button type="button" className={s.seg} onClick={() => editor.getState().setSession({ seasonFocus: null })} data-testid="season-grid">
          <Icon name="grid" size={13} width={1.6} /> Vergleich
        </button>
      </div>
    );
  }

  return (
    <>
      <div className={s.seasonsBackdrop} />
      <div className={s.seasons} data-testid="seasons-view">
        {SEASONS.map((se) => (
          <button
            key={se.k}
            type="button"
            className={s.seasonCell}
            onClick={() => editor.getState().setSession({ season: se.k, seasonFocus: se.k })}
            aria-label={`${se.name} groß anzeigen`}
            data-testid={`season-${se.k}`}
          >
            {urls[se.k] ? <img src={urls[se.k]} alt={`Plan im ${se.name}`} /> : <div className={s.loading}>Wird gerendert …</div>}
            <div className={s.seasonChip}>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 19 }}>{se.name}</span>
              <span className={s.mono} style={{ fontSize: 11, color: 'var(--ink3)' }}>
                {se.month.toUpperCase()}
              </span>
            </div>
            <div className={s.seasonNote}>{notes[se.k]}</div>
          </button>
        ))}
      </div>
    </>
  );
}
