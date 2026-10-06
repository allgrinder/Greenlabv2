/**
 * Linse „Kosten“ (Screen 10): Mengen live aus dem Plan, Einzelpreise editierbar,
 * Summen netto/brutto, Anteile je Bereich, Export als CSV und PDF.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { getItem } from '../../core/catalog/items';
import { getLamp, kelvinHex } from '../../core/catalog/lamps';
import type { LampType } from '../../core/model/types';
import { getMaterial } from '../../core/catalog/materials';
import { getSpecies } from '../../core/catalog/plants';
import { euros, num, parseNumber, unitLabel } from '../../core/format';
import { costCsv, costReport, GROUP_COLORS } from '../../core/quantities/costReport';
import type { CostLine } from '../../core/quantities/quantities';
import { materialSwatchStyle } from '../../render/textures/materialTextures';
import { cmd, editor, useEditor } from '../../state';
import { downloadBlob, fileSafe } from '../export/ExportDialog';
import { Icon } from '../icons';
import { glyphSrc, SYMBOL_GLYPH } from '../library/glyphs';
import u from '../components/ui.module.css';
import s from './lenses.module.css';

type View = 'area' | 'material' | 'shopping';

const VIEWS: [View, string][] = [
  ['area', 'Nach Bereich'],
  ['material', 'Nach Material'],
  ['shopping', 'Einkaufsliste'],
];

function swatch(key: string): React.CSSProperties {
  const [kind, id] = key.split(':');
  try {
    if (kind === 'mat') return materialSwatchStyle(getMaterial(id), 40);
    if (kind === 'plant') return { background: getSpecies(id).colors.summer };
    if (kind === 'item')
      return {
        background: `url("${glyphSrc(SYMBOL_GLYPH[getItem(id).symbol] ?? 'edge')}") center/16px no-repeat, #F4F1EA`,
      };
    if (kind === 'lamp')
      return {
        background: `radial-gradient(circle, ${kelvinHex(getLamp(id as LampType).kelvin)} 0 35%, #1B2433 75%)`,
      };
  } catch {
    /* unbekannter Schlüssel → neutral */
  }
  return { background: kind === 'irr' ? '#2F76B8' : 'var(--fld)' };
}

const qty = (l: CostLine) => `${num(l.quantity, l.unit === 'pcs' ? 0 : l.quantity < 10 ? 1 : 0)} ${unitLabel(l.unit)}`;

/** Einkaufsmenge: Stück aufrunden, Schüttgut auf 0,1 m³, Flächen auf ganze m² (+5 % Verschnitt) */
function shoppingQty(l: CostLine): string {
  if (l.unit === 'pcs') return `${Math.ceil(l.quantity - 1e-6)} ${unitLabel(l.unit)}`;
  if (l.unit === 'm3') return `${num(Math.ceil(l.quantity * 10 - 1e-6) / 10, 1)} ${unitLabel(l.unit)}`;
  if (l.unit === 'm2') return `${num(Math.ceil(l.quantity * 1.05), 0)} ${unitLabel(l.unit)}`;
  return `${num(Math.ceil(l.quantity), 0)} ${unitLabel(l.unit)}`;
}

function PriceInput({ line, edited }: { line: CostLine; edited: boolean }) {
  const [v, setV] = useState<string | null>(null);
  const commit = () => {
    if (v === null) return;
    const p = parseNumber(v);
    setV(null);
    if (p !== null && p >= 0 && Math.abs(p - line.unitPrice) > 1e-9) cmd.setPrice(line.key, p);
  };
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      {edited && (
        <button
          type="button"
          className={u.iconBtn}
          style={{ width: 18, height: 18, flex: 'none' }}
          title="Katalogpreis wiederherstellen"
          aria-label="Katalogpreis wiederherstellen"
          onClick={() => cmd.setPrice(line.key, null)}
        >
          <Icon name="undo" size={11} />
        </button>
      )}
      <input
        className={`${s.priceInput} ${edited ? s.priceEdited : ''}`}
        value={v ?? num(line.unitPrice, 2)}
        aria-label={`Einzelpreis ${line.label}`}
        onFocus={(e) => {
          setV(num(line.unitPrice, 2));
          requestAnimationFrame(() => e.target.select());
        }}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setV(null);
            e.currentTarget.blur();
          }
        }}
        data-testid={`price-${line.key}`}
      />
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--ink3)',
        }}
      >
        €
      </span>
    </span>
  );
}

function Row({ l, shopping, edited }: { l: CostLine; shopping: boolean; edited: boolean }) {
  return (
    <div className={s.costRow}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span
          style={{
            width: 16,
            height: 16,
            borderRadius: 4,
            flex: 'none',
            boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.1)',
            ...swatch(l.key),
          }}
        />
        <span
          style={{
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {l.label}
        </span>
      </div>
      <span className={s.right}>{shopping ? shoppingQty(l) : qty(l)}</span>
      {shopping ? (
        <span className={s.right} style={{ color: 'var(--ink3)' }}>
          {qty(l)}
        </span>
      ) : (
        <PriceInput line={l} edited={edited} />
      )}
      <span className={s.right}>{shopping ? '' : euros(l.total)}</span>
    </div>
  );
}

export function CostsView({ onClose, onPdf }: { onClose: () => void; onPdf: () => void }) {
  const doc = useEditor((st) => st.doc);
  const [view, setView] = useState<View>('area');
  const report = useMemo(() => (doc ? costReport(doc) : null), [doc]);

  // Listener nur einmal registrieren: Escape leert auch die Auswahl, das rendert synchron neu –
  // ein dabei neu angemeldeter Listener würde für dieses Ereignis nicht mehr aufgerufen.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && !(e.target instanceof HTMLInputElement) && close.current();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  if (!doc || !report) return null;
  const overrides = doc.priceOverrides;
  const all = report.groups.flatMap((g) => g.lines);
  const date = new Intl.DateTimeFormat('de-DE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date());
  const csv = () =>
    downloadBlob(
      new Blob([costCsv(editor.getState().doc!)], {
        type: 'text/csv;charset=utf-8',
      }),
      `${fileSafe(doc.name)}_Kosten.csv`,
    );

  return (
    <>
      <div className={s.costScrim} onClick={onClose} />
      <section className={s.costSheet} role="dialog" aria-label="Material & Kosten" data-testid="costs-view">
        <div className={s.costMain}>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: 32,
                  lineHeight: 1,
                }}
              >
                Material & Kosten
              </div>
              <div className={s.sub} style={{ marginTop: 6 }}>
                Mengen live aus dem Plan · Stand {date}
              </div>
            </div>
            <div className={s.segRow} style={{ marginLeft: 'auto' }}>
              {VIEWS.map(([v, n]) => (
                <button key={v} type="button" className={view === v ? s.segOn : s.seg} onClick={() => setView(v)} data-testid={`cost-view-${v}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className={s.costTableWrap}>
            <div className={s.costHead}>
              <span>POSITION</span>
              <span style={{ textAlign: 'right' }}>{view === 'shopping' ? 'KAUFEN' : 'MENGE'}</span>
              <span style={{ textAlign: 'right' }}>{view === 'shopping' ? 'IM PLAN' : 'EINZELPREIS'}</span>
              <span style={{ textAlign: 'right' }}>{view === 'shopping' ? '' : 'SUMME'}</span>
            </div>
            {view === 'area' &&
              report.groups.map((g) => (
                <div key={g.key}>
                  <div className={s.costGroup}>
                    <span className={s.costGroupName}>{g.name}</span>
                    <span className={s.mono} style={{ fontSize: 12, color: 'var(--ink2)' }}>
                      {euros(g.total)}
                    </span>
                  </div>
                  {g.lines.map((l) => (
                    <Row key={l.key} l={l} shopping={false} edited={l.key in overrides} />
                  ))}
                </div>
              ))}
            {view === 'material' && (
              <div style={{ paddingTop: 6 }}>
                {[...all]
                  .sort((a, b) => a.label.localeCompare(b.label, 'de'))
                  .map((l) => (
                    <Row key={l.key} l={l} shopping={false} edited={l.key in overrides} />
                  ))}
              </div>
            )}
            {view === 'shopping' &&
              report.groups.map((g) => (
                <div key={g.key}>
                  <div className={s.costGroup}>
                    <span className={s.costGroupName}>{g.name}</span>
                  </div>
                  {g.lines.map((l) => (
                    <Row key={l.key} l={l} shopping edited={false} />
                  ))}
                </div>
              ))}
            {!all.length && (
              <div className={s.muted} style={{ padding: 20 }}>
                Noch keine Positionen – zeichne Flächen, Wege oder setze Pflanzen.
              </div>
            )}
          </div>
        </div>
        <div className={s.costSide}>
          <div>
            <div className={s.sub} style={{ fontSize: 12.5 }}>
              Material gesamt, netto
            </div>
            <div className={s.total} data-testid="cost-net">
              {euros(report.net)}
            </div>
            <div className={s.muted} style={{ fontSize: 12.5, marginTop: 4 }}>
              {euros(report.gross)} brutto · {Math.round(report.vatRate * 100)} % MwSt. · ohne Einbau
            </div>
          </div>
          {report.net > 0 && (
            <div className={s.stack}>
              {report.groups.map((g) => (
                <div key={g.key} style={{ flex: g.total, background: GROUP_COLORS[g.key] }} title={`${g.name}: ${euros(g.total)}`} />
              ))}
            </div>
          )}
          <div className={s.col} style={{ fontSize: 12.5 }}>
            {report.groups.map((g) => (
              <div key={g.key} className={s.row} style={{ gap: 8 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: GROUP_COLORS[g.key],
                  }}
                />
                {g.name}
                <span className={s.mono} style={{ marginLeft: 'auto' }}>
                  {euros(g.total)}
                </span>
              </div>
            ))}
          </div>
          <div style={{ height: 1, background: 'var(--line)' }} />
          <div className={s.col} style={{ gap: 6, fontSize: 12.5, color: 'var(--ink2)' }}>
            {report.figures.map((f) => (
              <div key={f.label} className={s.row} style={{ justifyContent: 'space-between' }}>
                <span>{f.label}</span>
                <span className={s.mono} style={{ color: 'var(--ink)' }}>
                  {f.value}
                </span>
              </div>
            ))}
          </div>
          <div className={s.muted} style={{ lineHeight: 1.45 }}>
            Preise anklicken zum Ändern. Geänderte Preise sind blau und gelten nur für dieses Projekt.
          </div>
          <div
            style={{
              marginTop: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <button type="button" className={s.btnDark} onClick={onPdf} data-testid="cost-pdf">
              Als PDF exportieren
            </button>
            <button type="button" className={s.btnLine} onClick={csv} data-testid="cost-csv">
              Als CSV exportieren
            </button>
          </div>
        </div>
        <button type="button" className={u.iconBtn} style={{ position: 'absolute', right: 12, top: 12 }} onClick={onClose} aria-label="Schließen">
          <Icon name="close" />
        </button>
      </section>
    </>
  );
}
