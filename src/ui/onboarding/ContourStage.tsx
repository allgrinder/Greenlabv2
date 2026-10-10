/** Vorschau-Bühne des Projekt-Assistenten: Kontur bearbeiten und ausgerichtetes Hintergrundbild verschieben */
import { useEffect, useRef, useState } from 'react';
import { num } from '../../core/format';
import { bbox } from '../../core/geometry/polygon';
import { dist } from '../../core/geometry/vec';
import type { Vec2 } from '../../core/model/types';
import { LETTERS, type BgDraft } from './wizardModel';
import s from './onboarding.module.css';

type View = { k: number; ox: number; oy: number };

/**
 * Vorschau der Kontur mit Kantenlängen und Eckbuchstaben. Punkte lassen sich ziehen,
 * Doppelklick auf eine Kante fügt einen Punkt ein, auf einen Punkt entfernt ihn.
 * Ein ausgerichtetes Hintergrundbild liegt darunter und lässt sich verschieben.
 */
export function ContourStage({
  boundary,
  kind,
  closingIndex,
  bg,
  north,
  onMoveVertex,
  onInsertVertex,
  onDeleteVertex,
  onMoveImage,
}: {
  boundary: Vec2[];
  kind: string;
  closingIndex: number;
  bg: BgDraft | null;
  north: number;
  onMoveVertex: (i: number, p: Vec2) => void;
  onInsertVertex: (afterIndex: number, p: Vec2) => void;
  onDeleteVertex: (i: number) => void;
  onMoveImage: (d: Vec2) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 700 });
  const [drag, setDrag] = useState<{ kind: 'vertex'; i: number; from: Vec2; moved: boolean } | { kind: 'image'; last: Vec2 } | null>(null);
  const frozen = useRef<View | null>(null);
  useEffect(() => {
    const ro = new ResizeObserver(() => ref.current && setSize({ w: ref.current.clientWidth, h: ref.current.clientHeight }));
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  if (boundary.length < 2) return <div ref={ref} style={{ position: 'absolute', inset: 0 }} />;

  // Ansicht einpassen – während des Ziehens eingefroren, damit nichts springt
  let view: View;
  if (drag && frozen.current) view = frozen.current;
  else {
    const b = bbox(boundary);
    const pad = 90;
    const k = Math.min((size.w - pad * 2) / Math.max(1, b.maxX - b.minX), (size.h - pad * 2) / Math.max(1, b.maxY - b.minY));
    view = { k, ox: (size.w - (b.maxX - b.minX) * k) / 2 - b.minX * k, oy: (size.h - (b.maxY - b.minY) * k) / 2 - b.minY * k };
  }
  const { k, ox, oy } = view;
  const T = (p: Vec2) => ({ x: ox + p.x * k, y: oy + p.y * k });
  const toWorld = (e: React.PointerEvent | React.MouseEvent): Vec2 => {
    const r = ref.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left - ox) / k, y: (e.clientY - r.top - oy) / k };
  };
  const pts = boundary.map(T);
  const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  const place = bg?.place ?? null;

  const start = (d: NonNullable<typeof drag>, e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    frozen.current = view;
    setDrag(d);
  };

  return (
    <div
      ref={ref}
      style={{ position: 'absolute', inset: 0, cursor: drag?.kind === 'image' ? 'grabbing' : place ? 'grab' : 'default', touchAction: 'none', userSelect: 'none' }}
      onPointerDown={(e) => place && start({ kind: 'image', last: toWorld(e) }, e)}
      onPointerMove={(e) => {
        if (!drag) return;
        const w = toWorld(e);
        if (drag.kind === 'vertex') {
          // erst ab 3 px Bewegung ziehen – ein Klick verändert nichts
          if (!drag.moved && Math.hypot(e.clientX - drag.from.x, e.clientY - drag.from.y) < 3) return;
          if (!drag.moved) setDrag({ ...drag, moved: true });
          onMoveVertex(drag.i, w);
        }
        else {
          onMoveImage({ x: w.x - drag.last.x, y: w.y - drag.last.y });
          setDrag({ kind: 'image', last: w });
        }
      }}
      onPointerUp={() => {
        setDrag(null);
        frozen.current = null;
      }}
      data-testid="contour-stage"
    >
      <svg width={size.w} height={size.h} style={{ position: 'absolute', inset: 0 }}>
        {bg && place && (
          <image
            href={bg.url}
            opacity={bg.opacity}
            x={0}
            y={0}
            width={bg.w}
            height={bg.h}
            preserveAspectRatio="none"
            transform={`translate(${ox + place.origin.x * k} ${oy + place.origin.y * k}) rotate(${place.rotationDeg}) scale(${place.metersPerPixel * k})`}
            style={{ pointerEvents: 'none' }}
          />
        )}
        <polygon points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="rgba(61,91,217,.08)" stroke="#3D5BD9" strokeWidth="2" strokeLinejoin="round" style={{ pointerEvents: 'none' }} />
        {kind === 'edges' && pts.length > 2 && (
          <path d={`M${pts[pts.length - 1].x} ${pts[pts.length - 1].y}L${pts[0].x} ${pts[0].y}`} stroke="#3D5BD9" strokeWidth="1" strokeDasharray="4 4" style={{ pointerEvents: 'none' }} />
        )}
        {/* breite, unsichtbare Kanten für Doppelklick = Punkt einfügen */}
        {pts.map((p, i) => {
          const q = pts[(i + 1) % pts.length];
          return (
            <line
              key={`e${i}`}
              x1={p.x}
              y1={p.y}
              x2={q.x}
              y2={q.y}
              stroke="transparent"
              strokeWidth="12"
              style={{ cursor: 'copy' }}
              onPointerDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => onInsertVertex(i, toWorld(e))}
              data-testid={`edge-hit-${i}`}
            />
          );
        })}
        {pts.map((p, i) => (
          <g key={i}>
            <rect
              x={p.x - 6}
              y={p.y - 6}
              width="12"
              height="12"
              rx="2.5"
              fill={drag?.kind === 'vertex' && drag.i === i ? '#3D5BD9' : '#fff'}
              stroke="#3D5BD9"
              strokeWidth="1.6"
              style={{ cursor: 'move' }}
              onPointerDown={(e) => start({ kind: 'vertex', i, from: { x: e.clientX, y: e.clientY }, moved: false }, e)}
              onDoubleClick={() => onDeleteVertex(i)}
              data-testid={`vertex-${i}`}
            />
            <text
              x={p.x + ((p.x - cx) / (Math.hypot(p.x - cx, p.y - cy) || 1)) * 18}
              y={p.y + ((p.y - cy) / (Math.hypot(p.x - cx, p.y - cy) || 1)) * 18 + 4}
              textAnchor="middle"
              fontFamily="Geist Mono, monospace"
              fontSize="11"
              fontWeight="600"
              fill="#3D5BD9"
              style={{ pointerEvents: 'none' }}
            >
              {LETTERS[i]}
            </text>
          </g>
        ))}
        <g transform={`translate(${size.w - 60} 60) rotate(${north})`} style={{ pointerEvents: 'none' }}>
          <circle r="26" fill="#fff" stroke="rgba(31,34,36,.15)" />
          <path d="M0 -18l6 18h-12Z" fill="#C4553A" />
          <path d="M0 18l-6-18h12Z" fill="#B9BBB5" />
          <text y="-30" fontFamily="Newsreader, serif" fontStyle="italic" fontSize="13" textAnchor="middle" fill="#1F2224">
            N
          </text>
        </g>
      </svg>
      {pts.map((p, i) => {
        const q = pts[(i + 1) % pts.length];
        const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
        const d = Math.hypot(m.x - cx, m.y - cy) || 1;
        const L = dist(boundary[i], boundary[(i + 1) % boundary.length]);
        return (
          <div key={i} className={s.pill} style={{ left: m.x + ((m.x - cx) / d) * 22, top: m.y + ((m.y - cy) / d) * 22, opacity: i === closingIndex ? 0.6 : 1 }}>
            {num(L, 2)} m
          </div>
        );
      })}
      {bg && !place && (
        <div className={s.tipDark} style={{ left: 20, bottom: 20 }}>
          Hintergrund erscheint hier, sobald er ausgerichtet ist („Bild ausrichten“).
        </div>
      )}
      {place && !drag && (
        <div className={s.tipDark} style={{ left: 20, bottom: 20 }}>
          Bild ziehen zum Verschieben · Punkte ziehen ändert die Kontur
        </div>
      )}
    </div>
  );
}
