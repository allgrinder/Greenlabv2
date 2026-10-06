import { useEffect, useRef, useState } from 'react';
import { parseNumber } from '../../core/format';
import s from './ui.module.css';

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={on ? s.toggleOn : s.toggle} onClick={() => onChange(!on)} />;
}

export function Field({ label, value, mono = true }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className={s.field}>
      <span className={s.fieldLabel}>{label}</span>
      <span className={s.fieldValue} style={mono ? undefined : { fontFamily: 'var(--font-ui)' }}>
        {value}
      </span>
    </div>
  );
}

/**
 * Editierbares Zahlenfeld im Design der Wertkacheln. Übernimmt bei Enter/Blur
 * (ein Undo-Schritt), Esc verwirft. Eingabe deutsch („1,20“) oder englisch („1.20“).
 */
export function NumberField({
  label,
  value,
  format,
  onCommit,
  min,
  max,
  testId,
}: {
  label: string;
  value: number;
  format: (v: number) => string;
  onCommit: (v: number) => void;
  min?: number;
  max?: number;
  testId?: string;
}) {
  const [edit, setEdit] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (edit !== null) ref.current?.select();
  }, [edit !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = () => {
    if (edit === null) return;
    const v = parseNumber(edit);
    setEdit(null);
    if (v === null) return;
    const c = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
    if (c !== value) onCommit(c);
  };

  if (edit === null)
    return (
      <button type="button" className={s.fieldEditable} onClick={() => setEdit(format(value).replace(/[^\d,.\-−]/g, '').replace('−', '-'))} data-testid={testId} style={{ textAlign: 'left' }}>
        <span className={s.fieldLabel}>{label}</span>
        <span className={s.fieldValue}>{format(value)}</span>
      </button>
    );
  return (
    <label className={s.fieldFocus}>
      <span className={s.fieldLabel}>{label}</span>
      <input
        ref={ref}
        className={s.fieldInput}
        value={edit}
        inputMode="decimal"
        onChange={(e) => setEdit(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEdit(null);
        }}
        data-testid={testId ? `${testId}-input` : undefined}
      />
    </label>
  );
}

export function Segmented<T extends string>({ options, value, onChange, stretch }: { options: { v: T; label: React.ReactNode; disabled?: boolean; title?: string }[]; value: T; onChange: (v: T) => void; stretch?: boolean }) {
  return (
    <div className={s.segmented} role="tablist">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          role="tab"
          aria-selected={o.v === value}
          disabled={o.disabled}
          title={o.title}
          className={o.v === value ? s.segmentOn : s.segment}
          style={stretch ? { flex: 1 } : undefined}
          onClick={() => onChange(o.v)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
