/**
 * Einsehbarkeits-Prüfung: Blickpunkte (Nachbarfenster, Straße), beobachtete Person,
 * Jahreszeit, Ergebnis für den ganzen Garten und die Sitzplätze.
 */
import { useMemo } from 'react';
import { num } from '../../core/format';
import { privacyGrid, privateSpots, seenRatioIn } from '../../core/privacy';
import { cmd, editor, useEditor } from '../../state';
import { Icon } from '../icons';
import u from '../components/ui.module.css';
import s from './props.module.css';

const HEIGHTS: [number, string][] = [
  [1.7, 'Straße / Nachbargarten · 1,7 m'],
  [2.6, 'Fenster Erdgeschoss · 2,6 m'],
  [4.5, 'Fenster 1. OG · 4,5 m'],
  [7.3, 'Fenster 2. OG · 7,3 m'],
  [10, 'Fenster 3. OG · 10 m'],
];
const POSES = [
  ['sitting', 'Sitzen'],
  ['standing', 'Stehen'],
  ['lying', 'Liegen'],
] as const;

export function PrivacyPanel() {
  const doc = useEditor((st) => st.doc);
  const pv = useEditor((st) => st.session.privacy);
  const tool = useEditor((st) => st.session.tool);
  const set = (patch: Partial<typeof pv>) => editor.getState().setSession({ privacy: { ...pv, ...patch } });
  const result = useMemo(() => {
    if (!doc || !doc.observers.length) return null;
    const g = privacyGrid(doc, { season: pv.season, pose: pv.pose });
    return { ratio: g.ratio, spots: privateSpots(doc).map((sp) => ({ name: sp.name, ratio: seenRatioIn(g, sp.poly) })) };
  }, [doc, pv.season, pv.pose]);
  if (!doc) return null;
  const hasEspalier = Object.values(doc.objects).some((o) => o.type === 'espalier');
  const lowView = doc.observers.some((o) => o.eyeHeight < 2.5);

  return (
    <>
      <div className={s.head}>
        <div className={s.headSwatch} style={{ background: 'linear-gradient(135deg, rgba(214,72,58,.55) 0 50%, rgba(64,150,92,.45) 50%)' }} />
        <div style={{ flex: 1 }}>
          <div className={s.serif21}>Einsehbarkeit</div>
          <div className={s.sub}>Wer sieht in den Garten?</div>
        </div>
        <button type="button" className={u.iconBtn} aria-label="Einsehbarkeit schließen" onClick={() => editor.getState().setSession({ lens: 'plan', tool: tool === 'observer' ? 'select' : tool })} data-testid="privacy-close">
          <Icon name="close" size={14} />
        </button>
      </div>

      {result ? (
        <div className={s.section} style={{ gap: 8 }}>
          <div className={s.row} style={{ alignItems: 'baseline' }}>
            <span className={s.costBig} data-testid="privacy-ratio">
              {num(result.ratio * 100, 0)} %
            </span>
            <span className={s.muted} style={{ fontSize: 12 }}>
              des Gartens einsehbar
            </span>
          </div>
          {result.spots.map((sp, i) => (
            <div key={`${sp.name}-${i}`} className={s.mixRow}>
              <span className={s.dot} style={{ background: sp.ratio > 0.5 ? '#D6483A' : sp.ratio > 0.15 ? '#E2A33B' : '#40965C' }} />
              <span style={{ flex: 1 }}>{sp.name}</span>
              <span className={u.mono}>{num(sp.ratio * 100, 0)} % sichtbar</span>
            </div>
          ))}
        </div>
      ) : (
        <div className={s.muted} style={{ fontSize: 12.5, lineHeight: 1.5 }}>
          Setze mindestens einen Blickpunkt – ein Nachbarfenster, die Straße oder einen Balkon. Rot markierte Flächen sind von dort aus zu sehen.
        </div>
      )}

      <div className={s.section} style={{ gap: 8 }}>
        <div className={u.eyebrow}>Blickpunkte</div>
        {doc.observers.map((o) => (
          <div key={o.id} className={s.note} style={{ flexDirection: 'column', gap: 6 }}>
            <div className={s.row}>
              <input
                key={o.name}
                className={s.noteInput}
                style={{ background: 'transparent', fontWeight: 500 }}
                defaultValue={o.name}
                aria-label="Name des Blickpunkts"
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
                onBlur={(e) => e.target.value.trim() && e.target.value !== o.name && cmd.updateObserver(o.id, { name: e.target.value.trim() })}
              />
              <button type="button" className={u.iconBtn} style={{ width: 22, height: 22 }} aria-label={`${o.name} entfernen`} onClick={() => cmd.removeObserver(o.id)}>
                <Icon name="trash" size={12} />
              </button>
            </div>
            <select className={s.select} value={HEIGHTS.find((h) => h[0] === o.eyeHeight)?.[0] ?? o.eyeHeight} onChange={(e) => cmd.updateObserver(o.id, { eyeHeight: +e.target.value })} aria-label="Augenhöhe" data-testid="observer-height">
              {!HEIGHTS.some((h) => h[0] === o.eyeHeight) && <option value={o.eyeHeight}>{num(o.eyeHeight, 1)} m</option>}
              {HEIGHTS.map(([h, label]) => (
                <option key={h} value={h}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        ))}
        <button
          type="button"
          className={s.action}
          style={tool === 'observer' ? { color: 'var(--acc)', background: 'var(--accs)' } : undefined}
          onClick={() => editor.getState().setSession({ tool: tool === 'observer' ? 'select' : 'observer', selection: [] })}
          data-testid="observer-add"
        >
          {tool === 'observer' ? 'Fertig' : '+ Blickpunkt setzen'}
        </button>
        {tool === 'observer' && <div className={s.muted} style={{ fontSize: 12 }}>In den Plan klicken – auch außerhalb des Grundstücks. Vorhandene Punkte lassen sich ziehen.</div>}
      </div>

      <div className={s.section} style={{ gap: 8 }}>
        <div className={u.eyebrow}>Person im Garten</div>
        <div className={u.segmented}>
          {POSES.map(([v, l]) => (
            <button key={v} type="button" className={pv.pose === v ? u.segmentOn : u.segment} style={{ flex: 1 }} onClick={() => set({ pose: v })}>
              {l}
            </button>
          ))}
        </div>
        <div className={u.eyebrow}>Jahreszeit</div>
        <div className={u.segmented}>
          {(['summer', 'winter'] as const).map((v) => (
            <button key={v} type="button" className={pv.season === v ? u.segmentOn : u.segment} style={{ flex: 1 }} onClick={() => set({ season: v })} data-testid={`privacy-${v}`}>
              {v === 'summer' ? 'Sommer (belaubt)' : 'Winter (kahl)'}
            </button>
          ))}
        </div>
      </div>

      <div className={s.muted} style={{ fontSize: 12, lineHeight: 1.5 }}>
        <span style={{ color: '#D6483A' }}>■</span> einsehbar · <span style={{ color: '#40965C' }}>■</span> geschützt. Berücksichtigt Haus, Hecken, Spaliere (ab Stammhöhe) und Baumkronen; Laub ist im Winter durchlässig.
        {hasEspalier && lowView && ' Von der Straße aus sieht man unter Spalierschirmen hindurch – eine niedrige Hecke davor schließt die Lücke.'}
      </div>
    </>
  );
}

/** Rechte Leiste der Linse „Sichtschutz“ */
export function PrivacyDock() {
  return (
    <aside className={s.panel} aria-label="Sichtschutz" data-testid="privacy-dock">
      <PrivacyPanel />
    </aside>
  );
}
