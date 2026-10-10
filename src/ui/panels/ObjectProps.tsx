/**
 * Auswahl-Ansichten: Eigenschaften eines einzelnen Objekts (Verteilung nach Typ)
 * und Sammelaktionen bei Mehrfachauswahl.
 */
import { useMemo } from 'react';
import { getItem } from '../../core/catalog/items';
import { kelvinHex } from '../../core/catalog/lamps';
import { getMaterial } from '../../core/catalog/materials';
import { getSpecies } from '../../core/catalog/plants';
import { squareMeters } from '../../core/format';
import type { AreaObject, PlanObject, Project } from '../../core/model/types';
import { objectQuantities } from '../../core/quantities/quantities';
import { materialSwatchStyle } from '../../render/textures/materialTextures';
import { cmd } from '../../state';
import { Icon } from '../icons';
import { glyphSrc, irrGlyph, SYMBOL_GLYPH } from '../library/glyphs';
import { EspalierProps, ScatterProps } from './GardenProps';
import { Actions, Costs, Header, Notes } from './ObjectFrame';
import { AreaProps, HedgeProps, PathProps, PlantingProps } from './ShapeProps';
import { DimensionProps, ItemProps, PlantProps, TextProps } from './SimpleProps';
import { DripProps, FixtureProps, LampProps, PipeProps, SprinklerProps } from './TechProps';
import u from '../components/ui.module.css';
import s from './props.module.css';

export function ObjectProps({ o, doc }: { o: PlanObject; doc: Project }) {
  const q = useMemo(() => objectQuantities(o, doc.priceOverrides), [o, doc.priceOverrides]);
  const swatch: React.CSSProperties =
    o.type === 'area' || o.type === 'path'
      ? materialSwatchStyle(getMaterial(o.materialId), 50)
      : o.type === 'planting' && o.mulchMaterialId
        ? materialSwatchStyle(getMaterial(o.mulchMaterialId), 50)
        : o.type === 'plant' || o.type === 'hedge' || o.type === 'espalier'
          ? { background: `radial-gradient(circle at 40% 35%, #ffffff44, ${getSpecies(o.speciesId).colors.summer} 60%)` }
          : o.type === 'item'
            ? { background: `url("${glyphSrc(SYMBOL_GLYPH[getItem(o.catalogId).symbol] ?? 'edge')}") center/32px no-repeat, rgba(255,255,255,.6)` }
            : o.type === 'lamp'
              ? { background: `radial-gradient(circle at 50% 60%, ${kelvinHex(o.kelvin)} 0, rgba(255,200,140,.25) 40%, rgba(20,28,41,0) 72%), #121A27` }
              : o.type === 'sprinkler' || o.type === 'drip' || o.type === 'pipe' || o.type === 'fixture'
                ? { background: `url("${irrGlyph(o.type === 'sprinkler' ? 'sprinkler' : o.type === 'fixture' ? o.kind : 'drip')}") center/30px no-repeat, rgba(255,255,255,.6)` }
                : { background: 'var(--fld)' };

  return (
    <>
      <Header o={o} doc={doc} swatch={swatch} />
      {o.type === 'area' && <AreaProps o={o} q={q} doc={doc} />}
      {o.type === 'path' && <PathProps o={o} q={q} doc={doc} />}
      {o.type === 'planting' && <PlantingProps o={o} q={q} doc={doc} />}
      {o.type === 'hedge' && <HedgeProps o={o} q={q} doc={doc} />}
      {o.type === 'espalier' && <EspalierProps o={o} />}
      {o.type === 'scatter' && <ScatterProps o={o} />}
      {o.type === 'plant' && <PlantProps o={o} doc={doc} />}
      {o.type === 'item' && <ItemProps o={o} doc={doc} />}
      {o.type === 'text' && <TextProps o={o} />}
      {o.type === 'dimension' && <DimensionProps o={o} doc={doc} />}
      {o.type === 'lamp' && <LampProps o={o} />}
      {o.type === 'sprinkler' && <SprinklerProps o={o} doc={doc} />}
      {o.type === 'drip' && <DripProps o={o} doc={doc} />}
      {o.type === 'pipe' && <PipeProps o={o} />}
      {o.type === 'fixture' && <FixtureProps o={o} />}
      <Costs q={q} />
      <Notes o={o} />
      <Actions o={o} />
    </>
  );
}

export function MultiProps({ objs }: { objs: PlanObject[] }) {
  const areas = objs.filter((o): o is AreaObject => o.type === 'area');
  const total = objs.reduce((a, o) => a + (objectQuantities(o).area ?? 0), 0);
  return (
    <>
      <div>
        <div className={s.title} style={{ pointerEvents: 'none' }}>
          {objs.length} Objekte
        </div>
        <div className={s.sub}>Gesamtfläche {squareMeters(total)}</div>
      </div>
      {areas.length >= 2 && (
        <div className={s.section}>
          <div className={u.eyebrow}>Flächen kombinieren</div>
          <div className={s.actions}>
            <button type="button" className={s.action} onClick={() => cmd.booleanOp(areas.map((a) => a.id), 'union')} data-testid="union-btn">
              <Icon name="union" size={14} /> Vereinigen
            </button>
            <button type="button" className={s.action} onClick={() => cmd.booleanOp(areas.map((a) => a.id), 'subtract')} data-testid="subtract-btn">
              <Icon name="subtract" size={14} /> Abziehen
            </button>
          </div>
          <div className={s.muted} style={{ fontSize: 12, lineHeight: 1.45 }}>
            Abziehen schneidet die übrigen Flächen aus der zuerst gewählten aus.
          </div>
        </div>
      )}
      <div className={s.actions}>
        <button type="button" className={s.action} onClick={() => cmd.duplicateObjects(objs.map((o) => o.id))}>
          Duplizieren
        </button>
        <button type="button" className={`${s.action} ${s.danger}`} onClick={() => cmd.deleteObjects(objs.map((o) => o.id))}>
          <Icon name="trash" size={13} /> Löschen
        </button>
      </div>
    </>
  );
}
