/**
 * Detailkarte des gewählten Bibliothekselements (Pflanze, Objekt, Leuchte, Bewässerung).
 */
import { getItem } from '../../core/catalog/items';
import { getLamp, kelvinRgb } from '../../core/catalog/lamps';
import { getSpecies } from '../../core/catalog/plants';
import { euros, meters, num } from '../../core/format';
import type { Brush } from '../../state/types';
import { Field } from '../components/controls';
import { glyphSrc, SYMBOL_GLYPH } from '../library/glyphs';
import { PHEN_COLOR, SUN } from './SharedFields';
import u from '../components/ui.module.css';
import s from './props.module.css';

/** Detailkarte des gewählten Bibliothekselements (Design 04, rechts) */
export function BrushDetail({ brush }: { brush: Brush }) {
  if (brush.kind === 'lamp' || brush.kind === 'irr') {
    const name = brush.kind === 'lamp' ? getLamp(brush.lampType).name : { sprinkler: 'Versenkregner', tap: 'Wasseranschluss', manifold: 'Verteiler' }[brush.what];
    const spec = brush.kind === 'lamp' ? getLamp(brush.lampType) : null;
    return (
      <>
        <div className={s.brushHero} style={{ background: spec ? `radial-gradient(circle at 50% 55%, rgb(${kelvinRgb(spec.kelvin).join(',')}) 0, rgba(255,190,120,.2) 38%, transparent 70%), #101826` : '#DCE6EC' }}>
          <span className={s.brushScale} style={spec ? { color: '#A6AEB7' } : undefined}>
            {spec ? 'Lichtwirkung im Nachtmodus' : 'Draufsicht'}
          </span>
        </div>
        <div className={s.serif21}>{name}</div>
        {spec && (
          <div className={s.grid2}>
            <Field label="Lichtstrom" value={`${spec.lumen} lm`} />
            <Field label="Farbe" value={`${spec.kelvin} K`} />
            <Field label="Abstrahlung" value={spec.beamDeg >= 360 ? 'rundum' : `${spec.beamDeg}°`} />
            <Field label="Preis" value={euros(spec.price)} />
          </div>
        )}
        <div className={s.muted} style={{ fontSize: 12, lineHeight: 1.45 }}>
          Klicke in den Plan, um es zu setzen.{spec?.directional ? ' Richtung und Abstrahlwinkel stellst du danach rechts ein.' : ''}
        </div>
      </>
    );
  }
  if (brush.kind === 'item') {
    const it = getItem(brush.catalogId);
    return (
      <>
        <div className={s.brushHero}>
          <img src={glyphSrc(SYMBOL_GLYPH[it.symbol] ?? 'edge')} width={84} height={84} alt="" />
          <span className={s.brushScale}>Draufsicht</span>
        </div>
        <div>
          <div className={s.serif21}>{it.name}</div>
        </div>
        <div className={s.grid2}>
          <Field label="Maße" value={`${num(it.width, 2)} × ${num(it.depth, 2)} m`} />
          <Field label="Höhe" value={meters(it.height)} />
          <Field label="Preis" value={it.price ? euros(it.price) : '–'} />
          <Field label="Ebene" value={it.creates === 'item' ? 'Gebäude & Möbel' : 'Flächen'} mono={false} />
        </div>
        <div className={s.muted} style={{ fontSize: 12, lineHeight: 1.45 }}>
          Klicke in den Plan, um es zu setzen. Maße und Drehung lassen sich danach anpassen.
        </div>
      </>
    );
  }
  const sp = getSpecies(brush.speciesId);
  return (
    <>
      <div className={s.brushHero} style={{ background: `radial-gradient(circle at 50% 52%, ${sp.colors.summer} 0, ${sp.colors.summer} 34%, transparent 36%), #DCD3BF` }}>
        <span className={s.brushScale}>Draufsicht · 1:100</span>
      </div>
      <div>
        <div className={s.serif21}>{sp.name}</div>
        <div className={s.latin}>{sp.latin}</div>
      </div>
      <div className={s.grid2}>
        <Field label="Endgröße" value={`${num(sp.diameterMature, 0)}–${num(sp.heightMature, 0)} m`} />
        <Field label="Zuwachs" value={`${num(sp.growthPerYear * 100, 0)} cm/J`} />
        <Field label="Standort" value={SUN[sp.sun]} mono={false} />
        <Field label="Preis" value={euros(sp.price, sp.price < 10 ? 2 : 0)} />
      </div>
      <div className={s.section} style={{ gap: 6 }}>
        <div className={u.eyebrow}>Jahreslauf</div>
        <div className={s.phen}>
          {sp.phenology.map((p, i) => (
            <div key={i} style={{ background: p === 'leaf' ? sp.colors.summer : p === 'bloom' ? (sp.colors.bloom ?? PHEN_COLOR.bloom) : p === 'autumn' ? (sp.colors.autumn ?? PHEN_COLOR.autumn) : PHEN_COLOR[p] }} />
          ))}
        </div>
      </div>
    </>
  );
}
