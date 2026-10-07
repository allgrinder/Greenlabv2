/**
 * Eigenschaften für Spalierbäume und Pflanzgruppen sowie die Einstellungen des Pflanzpinsels.
 */
import type { Draft } from 'immer';
import { PLANTS, getSpecies } from '../../core/catalog/plants';
import { espalierCount, espalierDensity, scatterCounts } from '../../core/espalier';
import { euros, meters, num } from '../../core/format';
import type { EspalierObject, PlanObject, ScatterObject } from '../../core/model/types';
import { cmd, editor, useEditor } from '../../state';
import { brushable } from '../../tools/GardenTools';
import { Field, NumberField, Toggle } from '../components/controls';
import { Slider } from '../components/Slider';
import u from '../components/ui.module.css';
import s from './props.module.css';

function upd<T extends PlanObject>(o: T, label: string, fn: (d: Draft<T>) => unknown) {
  cmd.updateObject<T>(o.id, label, fn);
}

const ESPALIERS = PLANTS.filter((p) => p.kind === 'espalier');
const pct = (v: number) => `${num(v * 100, 0)} %`;

export function EspalierProps({ o }: { o: EspalierObject }) {
  const sp = getSpecies(o.speciesId);
  const n = espalierCount(o);
  const winter = espalierDensity(o.speciesId, 'winter');
  return (
    <>
      <div className={s.latin} style={{ marginTop: -12 }}>
        {sp.latin}
      </div>
      <div className={s.section} style={{ gap: 8 }}>
        <div className={u.eyebrow}>Art</div>
        <select
          className={s.select}
          value={o.speciesId}
          aria-label="Spalierart"
          onChange={(e) => {
            const id = e.target.value;
            const roof = id === 'platanus-roof';
            upd(o, 'Spalierart', (d) => {
              d.speciesId = id;
              if (roof !== (d.form === 'roof')) {
                d.form = roof ? 'roof' : 'flat';
                d.depth = roof ? 2.2 : 0.45;
                d.stemHeight = roof ? 2.2 : 1.8;
                d.height = roof ? 2.6 : getSpecies(id).heightMature;
                d.spacing = roof ? 2.5 : 1.5;
              }
            });
          }}
          data-testid="espalier-species"
          style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--fld)' }}
        >
          {ESPALIERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.deciduous ? (p.marcescent ? 'hält Laub' : 'laubabwerfend') : 'immergrün'}
            </option>
          ))}
        </select>
      </div>
      <div className={s.section}>
        <div className={u.eyebrow}>{o.form === 'roof' ? 'Dachspalier' : 'Flachspalier'}</div>
        <div className={s.grid2}>
          <Field label="Bäume" value={`${n} Stk`} />
          <NumberField label="Abstand" value={o.spacing} format={(v) => meters(v)} min={0.6} max={6} onCommit={(v) => upd(o, 'Pflanzabstand', (d) => void (d.spacing = v))} testId="espalier-spacing" />
          <NumberField label="Stammhöhe" value={o.stemHeight} format={(v) => meters(v)} min={0} max={4} onCommit={(v) => upd(o, 'Stammhöhe', (d) => void (d.stemHeight = Math.min(v, d.height - 0.2)))} testId="espalier-stem" />
          <NumberField label="Oberkante" value={o.height} format={(v) => meters(v)} min={0.5} max={8} onCommit={(v) => upd(o, 'Höhe', (d) => void (d.height = Math.max(v, d.stemHeight + 0.2)))} testId="espalier-height" />
          <NumberField label="Schirmtiefe" value={o.depth} format={(v) => meters(v)} min={0.2} max={4} onCommit={(v) => upd(o, 'Schirmtiefe', (d) => void (d.depth = v))} />
          <Field label="Preis je Baum" value={euros(sp.price)} />
        </div>
      </div>
      <div className={s.section} style={{ gap: 6 }}>
        <div className={u.eyebrow}>Sichtschutz</div>
        <div className={s.muted} style={{ fontSize: 12, lineHeight: 1.5 }}>
          Blickdicht von {num(o.stemHeight, 1)} bis {num(o.height, 1)} m · Sommer {pct(espalierDensity(o.speciesId, 'summer'))}, Winter {pct(winter)}.
          {o.stemHeight > 1.2 && ' Darunter bleibt die Sicht frei – eine niedrige Hecke oder Staudenreihe davor schließt die Lücke.'}
          {winter < 0.5 && ' Im Winter kahl: für ganzjährigen Schutz eine immergrüne Art wählen.'}
        </div>
      </div>
    </>
  );
}

export function ScatterProps({ o }: { o: ScatterObject }) {
  const counts = [...scatterCounts(o).entries()].sort((a, b) => b[1] - a[1]);
  return (
    <div className={s.section} style={{ gap: 8 }}>
      <div className={u.eyebrow}>Pflanzen · {o.plants.length} Stk</div>
      {counts.map(([id, n]) => {
        const sp = getSpecies(id);
        return (
          <div key={id} className={s.mixRow}>
            <span className={s.dot} style={{ background: sp.colors.bloom ?? sp.colors.summer }} />
            <span style={{ flex: 1 }}>{sp.name}</span>
            <span className={u.mono}>{n} Stk</span>
          </div>
        );
      })}
      <button type="button" className={s.action} onClick={() => editor.getState().setSession({ tool: 'brush', selection: [], panels: { ...editor.getState().session.panels, library: true, layers: false } })}>
        Mit dem Pinsel weitermalen
      </button>
    </div>
  );
}

/** Rechtes Panel, solange der Pinsel aktiv ist */
export function BrushPaintPanel() {
  const paint = useEditor((st) => st.session.paint);
  const set = (patch: Partial<typeof paint>) => editor.getState().setSession({ paint: { ...paint, ...patch } });
  const mix = paint.mix.filter(brushable);
  return (
    <>
      <div className={s.head}>
        <div className={s.headSwatch} style={{ background: 'radial-gradient(circle at 35% 35%, #C8678F 0 12%, transparent 13%), radial-gradient(circle at 65% 40%, #8E8CC4 0 14%, transparent 15%), radial-gradient(circle at 50% 70%, #E2B23A 0 13%, transparent 14%), #6d8a4b' }} />
        <div style={{ flex: 1 }}>
          <div className={s.serif21}>Pflanzpinsel</div>
          <div className={s.sub}>Ein Strich = eine Pflanzgruppe · Alt radiert</div>
        </div>
      </div>
      <div className={s.section} style={{ gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className={s.row}>
            <span>Radius</span>
            <span className={u.mono}>{meters(paint.radius, 1)}</span>
          </div>
          <Slider label="Radius" value={paint.radius} min={0.2} max={4} step={0.1} onChange={(v) => set({ radius: v })} testId="brush-radius" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className={s.row}>
            <span>Dichte</span>
            <span className={u.mono}>{pct(paint.density)}</span>
          </div>
          <Slider label="Dichte" value={paint.density} min={0.2} max={1} step={0.05} fill="#7E9A5C" onChange={(v) => set({ density: v })} testId="brush-density" />
        </div>
        <div className={s.row}>
          <span>Nur in Beeten malen</span>
          <Toggle label="Nur in Beeten" on={paint.bedsOnly} onChange={(v) => set({ bedsOnly: v })} />
        </div>
      </div>
      <div className={s.section} style={{ gap: 8 }}>
        <div className={u.eyebrow}>Mischung · {mix.length} Arten</div>
        {mix.map((id) => {
          const sp = getSpecies(id);
          return (
            <div key={id} className={s.mixRow}>
              <span className={s.dot} style={{ background: sp.colors.bloom ?? sp.colors.summer }} />
              <span style={{ flex: 1 }}>{sp.name}</span>
              <button type="button" className={u.iconBtn} style={{ width: 22, height: 22 }} aria-label={`${sp.name} entfernen`} onClick={() => set({ mix: paint.mix.filter((x) => x !== id) })}>
                ×
              </button>
            </div>
          );
        })}
        <div className={s.muted} style={{ fontSize: 12, lineHeight: 1.45 }}>
          Stauden und Gräser in der Bibliothek anklicken, um sie hinzuzufügen oder herauszunehmen. Abstand nach Endgröße, Mindestabstand zu vorhandenen Pflanzen. Größe mit [ und ].
        </div>
      </div>
    </>
  );
}

/** Rechtes Panel beim Zeichnen einer Spalierreihe */
export function EspalierToolPanel() {
  const brush = useEditor((st) => st.session.brush);
  const sp = getSpecies(brush.kind === 'espalier' ? brush.speciesId : 'photinia-espalier');
  return (
    <>
      <div className={s.serif21}>{sp.name}</div>
      <div className={s.latin} style={{ marginTop: -10 }}>
        {sp.latin}
      </div>
      <div className={s.grid2}>
        <Field label="Laub" value={sp.deciduous ? (sp.marcescent ? 'hält Laub' : 'im Winter kahl') : 'immergrün'} mono={false} />
        <Field label="Preis je Baum" value={euros(sp.price)} />
      </div>
      <div className={s.muted} style={{ fontSize: 12, lineHeight: 1.45 }}>
        Pflanzlinie entlang der Grenze klicken, ↵ oder Doppelklick beendet. Die Bäume werden im Abstand von {sp.id === 'platanus-roof' ? '2,5' : '1,5'} m gesetzt; Abstand, Stammhöhe und Oberkante stellst du danach rechts ein.
      </div>
    </>
  );
}
