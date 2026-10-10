/**
 * Grundstücksansicht ohne Auswahl: Kennzahlen, Kontur bearbeiten, Sichtschutz,
 * Standort, Gesamtkosten und Hintergrund.
 */
import { useMemo } from 'react';
import { degrees, euros, meters, squareMeters } from '../../core/format';
import { area, perimeter } from '../../core/geometry/polygon';
import type { Project } from '../../core/model/types';
import { projectSummary } from '../../core/quantities/quantities';
import { DEFAULT_LOCATION } from '../../core/sun/sun';
import { cmd, editor, useEditor } from '../../state';
import { Field, NumberField } from '../components/controls';
import { LocationFields } from '../components/LocationFields';
import { BackgroundSection } from './BackgroundSection';
import u from '../components/ui.module.css';
import s from './props.module.css';

function PlotEditButton() {
  const tool = useEditor((st) => st.session.tool);
  const setSession = useEditor((st) => st.setSession);
  const on = tool === 'plotedit';
  return (
    <div className={s.section} style={{ gap: 8 }}>
      <button type="button" className={s.action} onClick={() => setSession({ tool: on ? 'select' : 'plotedit', selection: [] })} style={on ? { color: 'var(--acc)', background: 'var(--accs)' } : undefined} data-testid="plot-edit">
        {on ? 'Kontur fertig' : 'Kontur bearbeiten'}
      </button>
      {on && <div className={s.muted} style={{ fontSize: 12, lineHeight: 1.45 }}>Punkte ziehen, Doppelklick auf eine Kante fügt einen Punkt ein, Doppelklick auf einen Punkt oder Entf entfernt ihn. Esc beendet.</div>}
    </div>
  );
}

export function ProjectInfo({ doc }: { doc: Project }) {
  const summary = useMemo(() => projectSummary(doc), [doc]);
  const b = doc.site.boundary;
  return (
    <>
      <div>
        <div className={s.title} style={{ pointerEvents: 'none' }}>
          Grundstück
        </div>
        <div className={s.sub}>{doc.site.location?.label || doc.site.location?.place || 'Kein Standort'} · Nichts ausgewählt</div>
      </div>
      <div className={s.grid2}>
        <Field label="Fläche" value={squareMeters(area(b))} />
        <Field label="Umfang" value={meters(perimeter(b), 1)} />
        <NumberField label="Nord-Abweichung" value={doc.site.northDeg} format={degrees} min={-180} max={180} onCommit={(v) => cmd.updateSite({ northDeg: v })} testId="prop-north" />
        <Field label="Objekte" value={String(Object.keys(doc.objects).length)} />
      </div>
      <PlotEditButton />
      <div className={s.section} style={{ gap: 8 }}>
        <div className={u.eyebrow}>Sichtschutz</div>
        <button type="button" className={s.action} onClick={() => editor.getState().setSession({ lens: 'privacy', tool: doc.observers.length ? 'select' : 'observer' })} data-testid="privacy-open">
          Einsehbarkeit prüfen{doc.observers.length ? ` · ${doc.observers.length} Blickpunkte` : ''}
        </button>
      </div>
      <div className={s.section} style={{ gap: 8 }}>
        <div className={u.eyebrow}>Standort · für Sonne und Schatten</div>
        <LocationFields compact value={doc.site.location ?? { ...DEFAULT_LOCATION, label: '' }} onChange={(l) => cmd.updateSite({ location: l }, 'site-location')} />
      </div>
      <div className={s.section} style={{ gap: 8 }}>
        <div className={u.eyebrow}>Kosten gesamt</div>
        <div className={s.row} style={{ alignItems: 'baseline' }}>
          <span className={s.costBig} data-testid="project-cost">
            {euros(summary.total)}
          </span>
          <span className={s.muted} style={{ fontSize: 12 }}>
            Material, netto
          </span>
        </div>
        <div className={s.muted} style={{ fontSize: 12, lineHeight: 1.45 }}>
          Mengen werden aus der Zeichnung abgeleitet. Preise und Einkaufsliste im Tab „Kosten“.
        </div>
      </div>
      <BackgroundSection doc={doc} />
    </>
  );
}
