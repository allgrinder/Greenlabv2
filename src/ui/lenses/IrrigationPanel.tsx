/**
 * Linse „Bewässerung“ (Screen 09): Zonen mit Startzeit und Laufzeit, Überdeckung,
 * Wasserbedarf, Durchflussprüfung, automatische Verteilung und Legende.
 */
import { useMemo, useState } from 'react';
import { num, squareMeters } from '../../core/format';
import { coverage, zoneSummaries } from '../../core/irrigation';
import { irrigableRegions, planIrrigation } from '../../core/irrigationLayout';
import { newId } from '../../core/model/ids';
import { cmd, editor, useEditor } from '../../state';
import { Icon } from '../icons';
import u from '../components/ui.module.css';
import s from './lenses.module.css';

/** Hausanschluss: typischer Wasserdruck und maximaler Durchfluss je Zone */
export const SUPPLY = { bar: 3.5, maxLpm: 30 };

const HM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function IrrigationPanel() {
  const doc = useEditor((st) => st.doc);
  const selection = useEditor((st) => st.session.selection);
  const [active, setActive] = useState(0);
  const cov = useMemo(() => (doc ? coverage(doc) : null), [doc]);
  const zones = useMemo(() => (doc ? zoneSummaries(doc) : []), [doc]);
  if (!doc || !cov) return null;
  const zone = Math.min(active, doc.zones.length - 1);
  const demand = zones.reduce((a, z) => a + z.liters, 0);
  const over = zones.filter((z) => z.flowLpm > SUPPLY.maxLpm);
  const targets = selection.filter((id) => {
    const o = doc.objects[id];
    return o && irrigableRegions(o).length && (o.type !== 'area' || o.materialId === 'lawn' || o.materialId === 'soil');
  });
  const lawnSel = targets.filter((id) => {
    const o = doc.objects[id];
    return o.type === 'area' && o.materialId === 'lawn';
  });
  const bedSel = targets.filter((id) => !lawnSel.includes(id));

  const run = (what: 'sprinkler' | 'drip', ids: string[]) => {
    const d = editor.getState().doc!;
    const plan = planIrrigation(d, ids, what, zone + 1);
    cmd.replaceObjects(what === 'sprinkler' ? 'Regner verteilen' : 'Tropfschlauch verlegen', plan.remove, plan.add);
  };

  return (
    <aside className={s.rightPanel} aria-label="Bewässerung" data-testid="irrigation-panel">
      <div className={s.head}>
        <span className={s.title}>Bewässerung</span>
        <span className={s.muted}>{doc.zones.length} Zonen</span>
      </div>

      <div className={cov.gapArea > 0.5 ? s.warn : s.ok} data-testid="coverage">
        <svg width="16" height="16" viewBox="0 0 24 24" style={{ flex: 'none', marginTop: 1 }} aria-hidden>
          {cov.gapArea > 0.5 ? (
            <path d="M12 4l9 16H3Z M12 10v4M12 17h.01" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinejoin="round" strokeLinecap="round" />
          ) : (
            <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          )}
        </svg>
        <span>
          <b style={{ fontWeight: 600 }}>{num(cov.ratio * 100, 0)} % bewässert</b>
          {cov.gapArea > 0.5 ? ` · ${squareMeters(cov.gapArea, 1)} ohne Wasser (rot schraffiert)` : ' · alle Rasen- und Beetflächen erreicht'}
        </span>
      </div>

      <div className={s.col} style={{ gap: 6 }}>
        {doc.zones.map((z, i) => {
          const sum = zones[i];
          const parts = [sum.sprinklers ? `${sum.sprinklers} Regner` : '', sum.dripMeters ? `Tropfschlauch ${num(sum.dripMeters, 0)} m` : ''].filter(Boolean);
          return (
            <div key={z.id} className={s.zone} style={i === zone ? { boxShadow: 'inset 0 0 0 1.5px #2F76B8' } : undefined} onClick={() => setActive(i)} data-testid={`zone-${i + 1}`}>
              <span className={s.zoneBadge}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <input
                  key={z.name}
                  className={s.zoneName}
                  defaultValue={z.name}
                  aria-label={`Name Zone ${i + 1}`}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== z.name) cmd.updateZone(i, { name: v });
                  }}
                />
                <div className={s.zoneMeta}>
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {parts.join(' · ') || 'leer'} ·
                  </span>
                  <input
                    key={z.start}
                    className={s.inlineInput}
                    defaultValue={z.start}
                    aria-label={`Start Zone ${i + 1}`}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter') e.currentTarget.blur();
                    }}
                    onBlur={(e) => {
                      const m = HM.exec(e.target.value.trim());
                      if (!m) e.target.value = z.start;
                      else if (e.target.value !== z.start)
                        cmd.updateZone(i, {
                          start: `${m[1].padStart(2, '0')}:${m[2]}`,
                        });
                    }}
                  />
                </div>
              </div>
              <span
                className={s.mono}
                style={{
                  fontSize: 11.5,
                  color: sum.flowLpm > SUPPLY.maxLpm ? '#B9724F' : 'var(--ink2)',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <input
                  key={z.minutes}
                  className={s.inlineInput}
                  style={{ width: 26, textAlign: 'right' }}
                  defaultValue={z.minutes}
                  aria-label={`Laufzeit Zone ${i + 1} in Minuten`}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                  onBlur={(e) => {
                    const v = Math.round(Number(e.target.value.replace(',', '.')));
                    if (!Number.isFinite(v) || v < 1 || v > 240) e.target.value = String(z.minutes);
                    else if (v !== z.minutes) cmd.updateZone(i, { minutes: v });
                  }}
                />
                min
              </span>
              {doc.zones.length > 1 && i === zone && (
                <button
                  type="button"
                  className={u.iconBtn}
                  style={{ width: 22, height: 22 }}
                  aria-label={`Zone ${i + 1} löschen`}
                  title="Zone löschen – Regner wandern in die vorherige Zone"
                  onClick={(e) => {
                    e.stopPropagation();
                    cmd.removeZone(i);
                    setActive(Math.max(0, i - 1));
                  }}
                >
                  <Icon name="close" size={12} />
                </button>
              )}
            </div>
          );
        })}
        {doc.zones.length < 12 && (
          <button
            type="button"
            className={s.action}
            onClick={() => {
              cmd.addZone({
                id: newId(),
                name: `Zone ${doc.zones.length + 1}`,
                start: '08:00',
                minutes: 15,
              });
              setActive(doc.zones.length);
            }}
            data-testid="zone-add"
          >
            <Icon name="plus" size={13} /> Zone
          </button>
        )}
      </div>

      <div className={s.grid2}>
        <div className={s.stat}>
          <div className={s.statLabel}>Bedarf / Tag</div>
          <div className={s.statValue} data-testid="demand">
            {num(demand, 0)} l
          </div>
        </div>
        <div className={s.stat}>
          <div className={s.statLabel}>Anschluss</div>
          <div className={s.statValue}>
            {num(SUPPLY.bar, 1)} bar · {SUPPLY.maxLpm} l/min
          </div>
        </div>
      </div>
      {over.map((z) => (
        <div key={z.index} className={s.warn}>
          Zone {z.index} braucht {num(z.flowLpm, 1)} l/min – mehr als der Anschluss liefert. Regner auf zwei Zonen aufteilen.
        </div>
      ))}

      <div className={s.col}>
        <div className={u.eyebrow}>Automatisch planen · Zone {zone + 1}</div>
        <div className={s.grid2}>
          <button type="button" className={s.action} disabled={!lawnSel.length} onClick={() => run('sprinkler', lawnSel)} data-testid="auto-sprinklers">
            Regner verteilen
          </button>
          <button type="button" className={s.action} disabled={!bedSel.length} onClick={() => run('drip', bedSel)} data-testid="auto-drip">
            Tropfschlauch verlegen
          </button>
        </div>
        {!targets.length && <div className={s.muted}>Rasen- oder Beetfläche im Plan auswählen. Vorhandene Regner bzw. Schläuche darin werden ersetzt.</div>}
      </div>

      <div className={s.col} style={{ gap: 9 }}>
        <div className={u.eyebrow}>Legende</div>
        <Legend
          svg='<path d="M4 14L4 2A12 12 0 0 1 16 14Z" fill="rgba(58,132,196,.15)" stroke="#2F76B8" stroke-dasharray="3 2"/><circle cx="4" cy="14" r="2.5" fill="#fff" stroke="#2F76B8" stroke-width="1.4"/>'
          text="Versenkregner mit Wurfradius"
        />
        <Legend
          svg='<path d="M2 8H26" stroke="#1E2E3B" stroke-width="1.6"/><path d="M2 8H26" stroke="#7FC0EA" stroke-width="2.6" stroke-dasharray="0 6" stroke-linecap="round"/>'
          text="Tropfschlauch"
        />
        <Legend svg='<path d="M2 8H26" stroke="#2F76B8" stroke-width="2.4"/>' text="Hauptleitung PE 32" />
        <Legend
          svg='<rect x="6" y="3" width="16" height="10" rx="2" fill="#fff" stroke="#2F76B8" stroke-width="1.4"/><path d="M10 5v6M14 5v6M18 5v6" stroke="#2F76B8"/>'
          text="Verteiler mit Magnetventilen"
        />
        <Legend svg='<rect x="9" y="3" width="10" height="10" rx="2" fill="#2F76B8"/><path d="M11.5 8h5M14 5.5v5" stroke="#fff" stroke-width="1.2"/>' text="Wasseranschluss am Haus" />
        <Legend
          svg='<rect x="3" y="2" width="22" height="12" fill="url(#h)" stroke="#C4553A" stroke-width="1"/><defs><pattern id="h" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V4" stroke="#C4553A" stroke-width="1.2"/></pattern></defs>'
          text="Nicht bewässert"
        />
      </div>
    </aside>
  );
}

function Legend({ svg, text }: { svg: string; text: string }) {
  return (
    <div className={s.legendRow}>
      <svg width="28" height="16" viewBox="0 0 28 16" aria-hidden dangerouslySetInnerHTML={{ __html: svg }} />
      {text}
    </div>
  );
}
