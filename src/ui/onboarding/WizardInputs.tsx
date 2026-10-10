/** Zahlenfelder des Projekt-Assistenten: Eingabe mit Einheit (NumInput) und Tabellenzelle (Cell) */
import { useEffect, useState } from 'react';
import { num, parseNumber } from '../../core/format';
import s from './onboarding.module.css';

export function NumInput({ value, onChange, unit, label, testId, autoFocus }: { value: number; onChange: (v: number) => void; unit: string; label?: string; testId?: string; autoFocus?: boolean }) {
  const [text, setText] = useState(num(value, 2));
  useEffect(() => setText((t) => (parseNumber(t) === value ? t : num(value, 2))), [value]);
  return (
    <label className={s.input}>
      <input
        aria-label={label}
        value={text}
        inputMode="decimal"
        autoFocus={autoFocus}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseNumber(e.target.value);
          if (v !== null && v > 0) onChange(v);
        }}
        onBlur={() => setText(num(value, 2))}
        data-testid={testId}
      />
      <span className={s.unit}>{unit}</span>
    </label>
  );
}

export function Cell({ value, onChange, unit, digits = 2, testId }: { value: number; onChange: (v: number) => void; unit: string; digits?: 0 | 1 | 2; testId?: string }) {
  const [text, setText] = useState(num(value, digits));
  useEffect(() => setText((t) => (parseNumber(t) === value ? t : num(value, digits))), [value, digits]);
  return (
    <label className={s.cell}>
      <input
        value={text}
        inputMode="decimal"
        onChange={(e) => {
          setText(e.target.value);
          const v = parseNumber(e.target.value);
          if (v !== null) onChange(v);
        }}
        onBlur={() => setText(num(value, digits))}
        data-testid={testId}
      />
      <span className={s.unit}>{unit}</span>
    </label>
  );
}
