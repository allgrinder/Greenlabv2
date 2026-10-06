/**
 * Eigenschaften für Leuchten (Screen 03) und Bewässerungsbauteile (Screen 09).
 */
import type { Draft } from 'immer';
import { LAMPS, getLamp, kelvinRgb, lampWatts } from '../../core/catalog/lamps';
import { degrees, meters, num } from '../../core/format';
import { precipitationMmH } from '../../core/irrigation';
import { pathLength } from '../../core/geometry/shape';
import type { DripObject, FixtureObject, LampObject, PipeObject, PlanObject, Project, SprinklerObject } from '../../core/model/types';
import { cmd } from '../../state';
import { Field, NumberField, Toggle } from '../components/controls';
import { Slider } from '../components/Slider';
import { lampGlyph } from '../library/glyphs';
import u from '../components/ui.module.css';
import s from './props.module.css';

function upd<T extends PlanObject>(o: T, label: string, fn: (d: Draft<T>) => unknown, merge?: string) {
  cmd.updateObject<T>(o.id, label, fn, merge);
}

const COMPASS = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
export const compassLabel = (deg: number) => `${num(((deg % 360) + 360) % 360, 0)}° ${COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]}`;
const rgb = (k: number) => `rgb(${kelvinRgb(k).join(',')})`;
const WEEK = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export function LampProps({ o }: { o: LampObject }) {
  const spec = getLamp(o.lampType);
  const directional = o.beamAngleDeg < 300;
  return (
    <>
      <div className={s.section} style={{ gap: 8 }}>
        <div className={s.row}>
          <span className={u.eyebrow}>Leuchtentyp</span>
          <Toggle label="Leuchte an" on={o.on} onChange={(v) => upd(o, v ? 'Leuchte an' : 'Leuchte aus', (d) => void (d.on = v))} />
        </div>
        <div className={s.lampTypes}>
          {LAMPS.filter((l) => (o.path ? l.type === 'stringLights' : l.type !== 'stringLights')).map((l) => (
            <button
              key={l.type}
              type="button"
              title={l.name}
              aria-pressed={l.type === o.lampType}
              className={l.type === o.lampType ? s.lampTypeOn : s.lampType}
              onClick={() =>
                upd(o, 'Leuchtentyp', (d) => {
                  d.lampType = l.type;
                  d.beamAngleDeg = l.beamDeg;
                  d.kelvin = l.kelvin;
                  d.lumen = l.lumen;
                })
              }
            >
              <img src={lampGlyph(l.type, kelvinRgb(l.kelvin))} width={30} height={30} alt="" />
            </button>
          ))}
        </div>
        <div className={s.muted} style={{ fontSize: 11.5 }}>
          {spec.name} · Lichtpunkt {meters(spec.heightM)}
        </div>
      </div>
      <div className={s.section} style={{ gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className={s.row}>
            <span>Lichtstrom</span>
            <span className={u.mono}>{o.lumen} lm</span>
          </div>
          <Slider label="Lichtstrom" value={o.lumen} min={50} max={1200} step={10} fill="#E9B45E" onChange={(v) => upd(o, 'Lichtstrom', (d) => void (d.lumen = v), `lm:${o.id}`)} testId="lamp-lumen" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className={s.row}>
            <span>Farbtemperatur</span>
            <span className={u.mono}>{o.kelvin} K</span>
          </div>
          <Slider
            label="Farbtemperatur"
            value={o.kelvin}
            min={2200}
            max={4000}
            step={50}
            fill={null}
            track="linear-gradient(90deg,#FFA54F,#FFC07E 28%,#FFD09C 44%,#FFECD6)"
            knobColor={rgb(o.kelvin)}
            onChange={(v) => upd(o, 'Farbtemperatur', (d) => void (d.kelvin = v), `k:${o.id}`)}
            testId="lamp-kelvin"
          />
          <div className={s.row} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink3)' }}>
            <span>2200 K</span>
            <span>warmweiß</span>
            <span>4000 K</span>
          </div>
        </div>
        {directional && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className={s.row}>
              <span>Abstrahlwinkel</span>
              <span className={u.mono}>{o.beamAngleDeg}°</span>
            </div>
            <Slider label="Abstrahlwinkel" value={o.beamAngleDeg} min={10} max={120} step={1} onChange={(v) => upd(o, 'Abstrahlwinkel', (d) => void (d.beamAngleDeg = v), `ang:${o.id}`)} testId="lamp-beam" />
          </div>
        )}
        <div className={s.grid2}>
          {directional ? (
            <NumberField label="Richtung" value={o.directionDeg} format={compassLabel} onCommit={(v) => upd(o, 'Richtung', (d) => void (d.directionDeg = ((v % 360) + 360) % 360))} testId="lamp-dir" />
          ) : (
            <Field label="Abstrahlung" value="360° rundum" mono={false} />
          )}
          <Field label="Leistung" value={`${num(lampWatts(o.lumen), 1)} W`} />
        </div>
      </div>
      <div className={s.section} style={{ gap: 8 }}>
        <div className={u.eyebrow}>Zeitplan</div>
        <div className={s.schedule}>
          <button type="button" className={s.schedBtn} onClick={() => upd(o, 'Zeitplan', (d) => void (d.schedule.from = d.schedule.from === 'dusk' ? '18:00' : 'dusk'))}>
            {o.schedule.from === 'dusk' ? 'Dämmerung' : o.schedule.from}
          </button>
          <span className={s.muted}>→</span>
          <select className={s.select} value={o.schedule.to} onChange={(e) => upd(o, 'Zeitplan', (d) => void (d.schedule.to = e.target.value))} aria-label="Ende">
            {['22:00', '23:00', '23:30', '00:00', '01:00', 'dawn'].map((t) => (
              <option key={t} value={t}>
                {t === 'dawn' ? 'Morgendämmerung' : t}
              </option>
            ))}
          </select>
          <span style={{ marginLeft: 'auto' }} className={s.muted}>
            Astro
          </span>
        </div>
        <div className={s.week}>
          {WEEK.map((w, i) => (
            <button key={w} type="button" aria-pressed={o.schedule.weekdays[i]} className={o.schedule.weekdays[i] ? s.dayOn : s.day} onClick={() => upd(o, 'Wochentage', (d) => void (d.schedule.weekdays[i] = !d.schedule.weekdays[i]))}>
              {w}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

export function SprinklerProps({ o, doc }: { o: SprinklerObject; doc: Project }) {
  let sweep = o.arcEndDeg - o.arcStartDeg;
  while (sweep <= 0) sweep += 360;
  sweep = Math.min(360, sweep);
  return (
    <div className={s.section}>
      <div className={u.eyebrow}>Versenkregner</div>
      <div className={s.grid2}>
        <NumberField label="Wurfradius" value={o.radius} format={(v) => meters(v, 1)} min={1} max={20} onCommit={(v) => upd(o, 'Wurfradius', (d) => void (d.radius = v))} testId="spr-radius" />
        <NumberField label="Sektor" value={sweep} format={(v) => `${num(v, 0)}°`} min={15} max={360} onCommit={(v) => upd(o, 'Sektor', (d) => void (d.arcEndDeg = d.arcStartDeg + v))} />
        <NumberField label="Startwinkel" value={o.arcStartDeg} format={degrees} onCommit={(v) => upd(o, 'Sektor drehen', (d) => {
          const w = sweep;
          d.arcStartDeg = ((v % 360) + 360) % 360;
          d.arcEndDeg = d.arcStartDeg + w;
        })} />
        <NumberField label="Durchfluss" value={o.flowLpm} format={(v) => `${num(v, 1)} l/min`} min={0.1} max={60} onCommit={(v) => upd(o, 'Durchfluss', (d) => void (d.flowLpm = v))} />
        <Field label="Niederschlag" value={`${num(precipitationMmH(o), 1)} mm/h`} />
        <ZoneSelect o={o} doc={doc} />
      </div>
    </div>
  );
}

export function DripProps({ o, doc }: { o: DripObject; doc: Project }) {
  const L = pathLength(o.path);
  return (
    <div className={s.section}>
      <div className={u.eyebrow}>Tropfschlauch</div>
      <div className={s.grid2}>
        <Field label="Länge" value={meters(L, 1)} />
        <NumberField label="l/h je m" value={o.lphPerMeter} format={(v) => num(v, 1)} min={0.5} max={30} onCommit={(v) => upd(o, 'Tropfleistung', (d) => void (d.lphPerMeter = v))} />
        <NumberField label="Benetzte Breite" value={o.wetWidth} format={(v) => meters(v)} min={0.1} max={2} onCommit={(v) => upd(o, 'Benetzte Breite', (d) => void (d.wetWidth = v))} />
        <Field label="Abgabe" value={`${num((L * o.lphPerMeter) / 60, 1)} l/min`} />
        <ZoneSelect o={o} doc={doc} />
      </div>
    </div>
  );
}

export function PipeProps({ o }: { o: PipeObject }) {
  return (
    <div className={s.section}>
      <div className={u.eyebrow}>Leitung</div>
      <div className={s.grid2}>
        <Field label="Länge" value={meters(pathLength(o.path), 1)} />
        <div className={u.field}>
          <span className={u.fieldLabel}>Art</span>
          <select className={s.select} value={o.kind} onChange={(e) => upd(o, 'Leitungsart', (d) => void (d.kind = e.target.value as PipeObject['kind']))} aria-label="Leitungsart">
            <option value="water">Wasser PE 32</option>
            <option value="power">Strom (Erdkabel)</option>
          </select>
        </div>
      </div>
    </div>
  );
}

export function FixtureProps({ o }: { o: FixtureObject }) {
  return (
    <div className={s.grid2}>
      <Field label="Bauteil" value={o.kind === 'tap' ? 'Wasseranschluss' : 'Verteiler'} mono={false} />
      {o.kind === 'manifold' && <NumberField label="Magnetventile" value={o.valves} format={(v) => String(v)} min={1} max={12} onCommit={(v) => upd(o, 'Ventile', (d) => void (d.valves = Math.round(v)))} />}
    </div>
  );
}

function ZoneSelect({ o, doc }: { o: SprinklerObject | DripObject; doc: Project }) {
  return (
    <div className={u.field}>
      <span className={u.fieldLabel}>Zone</span>
      <select className={s.select} value={o.zone} onChange={(e) => upd(o, 'Zone', (d) => void (d.zone = +e.target.value))} aria-label="Zone">
        {doc.zones.map((z, i) => (
          <option key={z.id} value={i + 1}>
            {i + 1} · {z.name}
          </option>
        ))}
      </select>
    </div>
  );
}
