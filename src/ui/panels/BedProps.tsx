/**
 * Rabatten: Werkzeugleiste (Form, Mischung) und Bearbeitung einer Pflanzfläche
 * (Vorlage, Standort, Mischung mit Anteilen, Staffelung, Dichte, Abdeckung, Einfassung).
 */
import { useMemo } from 'react';
import { BED_MIXES, getBedMix, rankBedMixes, sunClass, SUN_LABEL } from '../../core/catalog/bedMixes';
import { getMaterial } from '../../core/catalog/materials';
import { PLANTS, getSpecies } from '../../core/catalog/plants';
import { meanSunHours } from '../../core/bedSun';
import { meters, num } from '../../core/format';
import { flattenRegion } from '../../core/geometry/shape';
import type { PlanObject, Project } from '../../core/model/types';
import { normalizeMix } from '../../core/planting';
import { materialSwatchStyle } from '../../render/textures/materialTextures';
import { cmd, editor, useEditor } from '../../state';
import { Slider } from '../components/Slider';
import { Icon } from '../icons';
import u from '../components/ui.module.css';
import s from './props.module.css';

type Planting = Extract<PlanObject, { type: 'planting' }>;

const SHAPES = [
  ['rect', 'Rechteck'],
  ['poly', 'Polygon'],
  ['bezier', 'Kurve'],
  ['free', 'Freihand'],
] as const;

/** Abdeckung zwischen den Pflanzen */
export const MULCH_MATERIALS = ['barkMulch', 'mulch', 'gravel', 'basalt', 'soil'];

const PERENNIALS = PLANTS.filter((p) => p.kind === 'perennial' || p.kind === 'grass');

const hoursFmt = (h: number) => `${num(h, 1)} h`;

/** Leiste des Rabatten-Werkzeugs (rechts, solange nichts ausgewählt ist) */
export function BedToolPanel() {
  const def = useEditor((st) => st.session.defaults);
  const setSession = useEditor((st) => st.setSession);
  const set = (patch: Partial<typeof def>) => setSession((ss) => ({ defaults: { ...ss.defaults, ...patch } }));
  return (
    <>
      <div className={s.serif21}>Rabatte anlegen</div>
      <div className={s.muted} style={{ fontSize: 12, lineHeight: 1.45, marginTop: -8 }}>
        Form zeichnen – die Rabatte wird sofort bepflanzt, gemulcht und nach Höhe gestaffelt: niedrige Stauden vorn, hohe zur Grundstücksgrenze.
      </div>
      <div className={u.segmented} role="group" aria-label="Form" style={{ alignSelf: 'flex-start' }}>
        {SHAPES.map(([id, label]) => (
          <button key={id} type="button" className={def.bedShape === id ? u.segmentOn : u.segment} style={{ padding: '4px 10px' }} onClick={() => set({ bedShape: id })} data-testid={`bed-shape-${id}`}>
            {label}
          </button>
        ))}
      </div>
      <div className={u.eyebrow}>Bepflanzung</div>
      <div className={s.mixList} role="radiogroup" aria-label="Mischung">
        <MixOption id="auto" title="Passend zum Standort" note="Die Sonnenstunden der gezeichneten Fläche entscheiden: sonnig, halbschattig oder schattig." on={def.bedMix === 'auto'} onPick={() => set({ bedMix: 'auto' })} />
        {BED_MIXES.map((v) => (
          <MixOption key={v.id} id={v.id} title={v.name} note={v.note} sun={SUN_LABEL[v.sun]} on={def.bedMix === v.id} onPick={() => set({ bedMix: v.id })} />
        ))}
      </div>
    </>
  );
}

function MixOption({ id, title, note, sun, on, onPick }: { id: string; title: string; note: string; sun?: string; on: boolean; onPick: () => void }) {
  const v = id === 'auto' ? null : getBedMix(id);
  return (
    <button type="button" role="radio" aria-checked={on} className={on ? s.mixOptOn : s.mixOpt} onClick={onPick} data-testid={`bed-mix-${id}`}>
      <span className={s.mixOptHead}>
        <span className={s.mixOptTitle}>{title}</span>
        {sun && <span className={s.mixOptSun}>{sun}</span>}
      </span>
      {v && (
        <span className={s.mixDots} aria-hidden>
          {v.mix.map((m) => (
            <span key={m.speciesId} className={s.mixDot} style={{ background: getSpecies(m.speciesId).colors.bloom ?? getSpecies(m.speciesId).colors.summer, flexGrow: m.share }} />
          ))}
        </span>
      )}
      <span className={s.mixOptNote}>{note}</span>
    </button>
  );
}

/** Rabatte bearbeiten */
export function BedEditor({ o, doc, count, edging }: { o: Planting; doc: Project; count: number; edging: React.ReactNode }) {
  const update = (label: string, fn: (d: Planting) => void, key?: string) => cmd.updateObject<Planting>(o.id, label, (d) => void fn(d as Planting), key);
  const hours = useMemo(() => meanSunHours(doc, flattenRegion(o.region).outer), [doc, o.region]);
  const best = rankBedMixes(hours)[0];
  const cur = o.mixId ? getBedMix(o.mixId) : null;
  const unused = PERENNIALS.filter((p) => !o.mix.some((m) => m.speciesId === p.id));

  const applyMix = (id: string) =>
    update('Mischung wählen', (d) => {
      const v = getBedMix(id);
      d.mix = v.mix.map((m) => ({ ...m }));
      d.perSquareMeter = v.perSquareMeter;
      d.mulchMaterialId = v.mulchMaterialId;
      d.mixId = v.id;
    });

  // Anteil einer Art setzen, die übrigen teilen sich den Rest im bisherigen Verhältnis
  const setShare = (speciesId: string, v: number) =>
    update(
      'Anteil ändern',
      (d) => {
        const rest = d.mix.filter((m) => m.speciesId !== speciesId);
        const restSum = rest.reduce((a, m) => a + m.share, 0);
        d.mix = d.mix.map((m) => (m.speciesId === speciesId ? { ...m, share: v } : { ...m, share: restSum > 0 ? (m.share / restSum) * (1 - v) : (1 - v) / rest.length }));
        d.mixId = null;
      },
      `share:${o.id}:${speciesId}`,
    );

  return (
    <div className={s.section}>
      <div className={u.eyebrow}>Bepflanzung</div>
      <div className={s.row} style={{ padding: 0 }}>
        <div className={u.field} style={{ width: '100%' }}>
          <span className={u.fieldLabel}>Vorlage</span>
          <select className={s.select} value={cur?.id ?? ''} onChange={(e) => e.target.value && applyMix(e.target.value)} aria-label="Vorlage" data-testid="bed-preset">
            {!cur && <option value="">Eigene Mischung</option>}
            {BED_MIXES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {hours !== null && (
        <div className={s.sunNote} data-testid="bed-sun">
          <span>
            <b>{hoursFmt(hours)}</b> Sonne am Sommertag · {SUN_LABEL[sunClass(hours)]}
          </span>
          {cur && cur.sun !== sunClass(hours) && cur.sun !== 'partial' && best.id !== cur.id && (
            <button type="button" className={s.sunApply} onClick={() => applyMix(best.id)} data-testid="bed-recommend">
              Besser: {best.name}
            </button>
          )}
        </div>
      )}

      <div className={s.mixEdit}>
        {o.mix.map((m) => {
          const sp = getSpecies(m.speciesId);
          return (
            <div key={m.speciesId} className={s.mixEditRow} data-testid="bed-mix-row">
              <span className={s.dot} style={{ background: sp.colors.bloom ?? sp.colors.summer }} />
              <span className={s.mixName} title={sp.latin}>
                {sp.name}
                <span className={s.mixHeight}>{meters(sp.heightMature, 1)}</span>
              </span>
              <span className={s.mixSlider}>
                <Slider value={m.share * 100} min={0} max={80} step={1} label={`Anteil ${sp.name}`} onChange={(v) => setShare(m.speciesId, v / 100)} onEnd={() => editor.getState().endGesture()} />
              </span>
              <span className={`${u.mono} ${s.muted}`} style={{ width: 34, textAlign: 'right' }}>
                {num(m.share * 100, 0)} %
              </span>
              <button
                type="button"
                className={u.iconBtn}
                style={{ width: 22, height: 22 }}
                aria-label={`${sp.name} entfernen`}
                disabled={o.mix.length < 2}
                onClick={() =>
                  update('Art entfernen', (d) => {
                    d.mix = normalizeMix(d.mix.filter((x) => x.speciesId !== m.speciesId));
                    d.mixId = null;
                  })
                }
              >
                <Icon name="close" size={12} />
              </button>
            </div>
          );
        })}
        {unused.length > 0 && (
          <select
            className={s.addSpecies}
            value=""
            aria-label="Art hinzufügen"
            data-testid="bed-add"
            onChange={(e) => {
              const id = e.target.value;
              if (!id) return;
              update('Art hinzufügen', (d) => {
                d.mix = normalizeMix([...d.mix.map((x) => ({ ...x, share: x.share * d.mix.length })), { speciesId: id, share: 1 }]);
                d.mixId = null;
              });
            }}
          >
            <option value="">+ Art hinzufügen</option>
            {unused.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {meters(p.heightMature, 1)}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className={s.row} style={{ padding: '4px 2px' }}>
        <span>
          Nach Höhe staffeln <span className={s.muted}>niedrig vorn, hoch hinten</span>
        </span>
        <button type="button" role="switch" aria-checked={!!o.tiers} aria-label="Nach Höhe staffeln" className={o.tiers ? u.toggleOn : u.toggle} onClick={() => update('Staffelung', (d) => void (d.tiers = !d.tiers))} data-testid="bed-tiers" />
      </div>
      <div className={s.row} style={{ padding: '0 2px' }}>
        <span>Pflanzdichte</span>
        <span className={s.mixSlider} style={{ flex: 1, maxWidth: 150 }}>
          <Slider value={o.perSquareMeter} min={3} max={14} step={0.5} label="Pflanzdichte" onChange={(v) => update('Pflanzdichte', (d) => void (d.perSquareMeter = v), `density:${o.id}`)} onEnd={() => editor.getState().endGesture()} />
        </span>
        <span className={`${u.mono} ${s.muted}`}>{num(o.perSquareMeter, 1)}/m² · {num(count, 0)} Stk</span>
      </div>

      <div className={u.eyebrow}>Abdeckung</div>
      <div className={s.swatches}>
        {MULCH_MATERIALS.map((id) => {
          const mm = getMaterial(id);
          return (
            <button
              key={id}
              type="button"
              title={mm.name}
              aria-label={mm.name}
              aria-pressed={id === o.mulchMaterialId}
              className={id === o.mulchMaterialId ? s.swatchOn : s.swatch}
              style={materialSwatchStyle(mm, 60)}
              onClick={() => update('Abdeckung ändern', (d) => void (d.mulchMaterialId = id))}
              data-testid={`mulch-${id}`}
            />
          );
        })}
      </div>
      {edging}
    </div>
  );
}
