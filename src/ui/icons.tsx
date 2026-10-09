/** Icon-Pfade 1:1 aus Chrome.dc.html / Gartenwerk.dc.html (24er-Raster) */
export const ICON = {
  select: 'M6 3.5l12 7-5.3 1.5-2.6 5.2Z',
  rect: 'M4.5 6.5h15v11h-15Z',
  poly: 'M5 18.5L3.5 9.5 11 4.5l9 3.5-2 10.5Z',
  bezier: 'M4 18C7 9 17 14 20 6M2.8 16.8h2.4v2.4H2.8ZM18.8 4.8h2.4v2.4h-2.4ZM11 9.5L16 4.5',
  free: 'M3 15c2-4 4-4 5 0s3 4 5 0 4-6 8-3',
  path: 'M4 20C6 12 11 11 13 4M10 20C12 14 17 13 19.5 5',
  dim: 'M3 12h18M3 8.5v7M21 8.5v7M6.5 10.5L5 12l1.5 1.5M17.5 10.5L19 12l-1.5 1.5',
  text: 'M5.5 6.5V4.5h13v2M12 4.5v15M9.5 19.5h5',
  bed: 'M3.5 18.5h17M5.5 18.5c.4-3.4 2-5 4-5s3 1.2 3 1.2 1.2-2.7 4-2.7 2.6 3 2.6 6.5M9.5 13.5V9M16.5 11.8V7.5M9.5 9a2 2 0 1 0 0-4a2 2 0 1 0 0 4ZM16.5 7.5a1.6 1.6 0 1 0 0-3.2a1.6 1.6 0 1 0 0 3.2Z',
  plant: 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17ZM12 8.5v7M8.5 12h7',
  lib: 'M4 4h7v7H4ZM13 4h7v7h-7ZM4 13h7v7H4ZM16.5 13a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7Z',
  layers: 'M12 3.5l8.5 4.5-8.5 4.5L3.5 8ZM3.5 12.5l8.5 4.5 8.5-4.5M3.5 16.5l8.5 4.5 8.5-4.5',
  eye: 'M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6ZM12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5Z',
  eyeOff: 'M4 4l16 16M10.5 6.2c.5-.1 1-.2 1.5-.2 6 0 9.5 6 9.5 6a16 16 0 0 1-2.4 3.1M6.5 7.3C4 9 2.5 12 2.5 12s3.5 6 9.5 6c1.5 0 2.9-.4 4-1',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5.5 11h13v9h-13Z',
  unlock: 'M7 11V8a5 5 0 0 1 9.6-2M5.5 11h13v9h-13Z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  chevron: 'M6 9l6 6 6-6',
  grid: 'M4 9h16M4 15h16M9 4v16M15 4v16',
  magnet: 'M6 4v8a6 6 0 0 0 12 0V4M6 8h4M14 8h4',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  close: 'M6 6l12 12M18 6L6 18',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14ZM20 20l-4-4',
  pin: 'M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12ZM12 6.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5Z',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z',
  trash: 'M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13',
  union: 'M4 4h10v6h6v10H10v-6H4Z',
  subtract: 'M4 4h10v10H4ZM10 10h10v10H10Z',
  upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
  download: 'M12 4v12M7 11l5 5 5-5M5 20h14',
  check: 'M5 12l5 5 9-10',
  cube: 'M12 3.5l8 4.5v8l-8 4.5-8-4.5V8ZM4 8l8 4.5L20 8M12 12.5v8',
  top: 'M4.5 4.5h15v15h-15ZM4.5 12h15M12 4.5v15',
} as const;

export type IconName = keyof typeof ICON;

export function Icon({ name, size = 16, color = 'currentColor', width = 1.6, fill = 'none' }: { name: IconName; size?: number; color?: string; width?: number; fill?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d={ICON[name]} stroke={color} strokeWidth={width} fill={fill} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ bg = 'var(--ink)', fg = 'var(--bg)' }: { bg?: string; fg?: string }) {
  return (
    <div style={{ width: 28, height: 28, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="7.5" fill="none" stroke={fg} strokeWidth="1.4" />
        <path d="M12 4.5V19.5M12 12L17 7.5M12 15L7.5 11" stroke={fg} strokeWidth="1.4" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export function Sun({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="4" fill="#E2A33B" />
      <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" stroke="#E2A33B" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
