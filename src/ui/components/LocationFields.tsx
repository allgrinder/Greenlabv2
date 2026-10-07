/**
 * Standort: Ort für den Sonnenstand (Liste oder Ortung) und – getrennt davon – die Adresse
 * für Titelblock und Anzeige. Ohne externen Dienst; für die Sonne genügt der nächste Ort.
 */
import { useEffect, useId, useState } from 'react';
import { findPlace, nearestPlace, PLACES } from '../../core/geo/places';
import { num } from '../../core/format';
import type { GeoLocation } from '../../core/model/types';
import { Icon } from '../icons';
import s from './location.module.css';

const coords = (l: GeoLocation) => `${num(Math.abs(l.lat), 2)}° ${l.lat >= 0 ? 'N' : 'S'} · ${num(Math.abs(l.lon), 2)}° ${l.lon >= 0 ? 'O' : 'W'}`;

export function LocationFields({ value, onChange, compact = false }: { value: GeoLocation; onChange: (l: GeoLocation) => void; compact?: boolean }) {
  const list = useId();
  const [text, setText] = useState(value.place ?? '');
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => setText(value.place ?? ''), [value.place]);

  const typed = (t: string) => {
    setText(t);
    const p = findPlace(t);
    if (p) {
      setStatus(null);
      if (p.name !== value.place) onChange({ ...value, lat: p.lat, lon: p.lon, timeZone: p.timeZone, place: p.name });
    } else setStatus(t.trim() ? `„${t.trim()}“ ist nicht in der Liste – Sonnenstand weiter für ${value.place ?? 'die bisherigen Koordinaten'}.` : null);
  };

  const locate = () => {
    if (!navigator.geolocation) return setStatus('Ortung wird von diesem Browser nicht unterstützt.');
    setStatus('Standort wird ermittelt …');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        const n = nearestPlace(lat, lon);
        const place = n.km < 25 ? n.place.name : `Aktueller Standort (bei ${n.place.name})`;
        onChange({ ...value, lat, lon, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || n.place.timeZone, place });
        setText(place);
        setStatus(null);
      },
      () => setStatus('Ortung nicht erlaubt oder nicht verfügbar – bitte Ort aus der Liste wählen.'),
      { timeout: 10000 },
    );
  };

  return (
    <div className={s.wrap} data-compact={compact || undefined}>
      <label className={s.field}>
        <Icon name="pin" size={14} color="var(--ink2)" />
        <span className={s.label}>Ort</span>
        <input
          list={list}
          value={text}
          placeholder="Stadt in der Nähe"
          onChange={(e) => typed(e.target.value)}
          onBlur={() => !findPlace(text) && setText(value.place ?? '')}
          onKeyDown={(e) => e.stopPropagation()}
          aria-label="Ort für den Sonnenstand"
          data-testid="place"
        />
        <button type="button" className={s.locate} onClick={locate} title="Aktuellen Standort verwenden" aria-label="Aktuellen Standort verwenden" data-testid="locate">
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
            <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="12" cy="12" r="2.2" fill="currentColor" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </label>
      <datalist id={list}>
        {PLACES.map((p) => (
          <option key={p.name} value={p.name} />
        ))}
      </datalist>
      <div className={s.meta} data-testid="coords">
        {status ?? `Sonnenstand für ${coords(value)} · ${value.timeZone}`}
      </div>
      <label className={s.field}>
        <span className={s.label}>Adresse</span>
        <input
          value={value.label}
          placeholder="optional, für den Titelblock"
          onChange={(e) => onChange({ ...value, label: e.target.value })}
          onKeyDown={(e) => e.stopPropagation()}
          aria-label="Adresse"
          data-testid="location"
        />
      </label>
    </div>
  );
}
