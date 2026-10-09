import { useEditor } from '../../state';
import type { ToolId } from '../../state/types';
import { Icon, type IconName } from '../icons';
import s from './chrome.module.css';

export const TOOLS: { id: ToolId; label: string; key: string; icon: IconName }[] = [
  { id: 'select', label: 'Auswahl', key: 'V', icon: 'select' },
  { id: 'rect', label: 'Rechteck', key: 'R', icon: 'rect' },
  { id: 'poly', label: 'Polygon', key: 'P', icon: 'poly' },
  { id: 'bezier', label: 'Kurve / Bézier', key: 'B', icon: 'bezier' },
  { id: 'free', label: 'Freihand', key: 'F', icon: 'free' },
  { id: 'bed', label: 'Rabatte', key: 'K', icon: 'bed' },
  { id: 'path', label: 'Weg-Werkzeug', key: 'W', icon: 'path' },
  { id: 'dim', label: 'Bemaßung', key: 'M', icon: 'dim' },
  { id: 'text', label: 'Text', key: 'T', icon: 'text' },
  { id: 'plant', label: 'Pflanze setzen', key: 'G', icon: 'plant' },
];

export function ToolRail() {
  const tool = useEditor((st) => st.session.tool);
  const panels = useEditor((st) => st.session.panels);
  const setSession = useEditor((st) => st.setSession);

  return (
    <nav className={s.rail} aria-label="Werkzeuge" data-testid="tool-rail">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={tool === t.id ? s.toolOn : s.tool}
          data-tip={`${t.label}  ${t.key}`}
          aria-label={t.label}
          aria-pressed={tool === t.id}
          data-testid={`tool-${t.id}`}
          onClick={() => setSession({ tool: t.id, activeNode: null, ...(t.id === 'plant' ? { panels: { ...panels, library: true, layers: false } } : {}) })}
        >
          <Icon name={t.icon} size={19} width={1.5} />
        </button>
      ))}
      <div className={s.railSep} />
      <button
        type="button"
        className={panels.library ? s.toolToggleOn : s.tool}
        data-tip="Bibliothek  L"
        aria-label="Bibliothek"
        aria-pressed={panels.library}
        data-testid="toggle-library"
        onClick={() => setSession({ panels: { ...panels, library: !panels.library, layers: panels.library ? panels.layers : false } })}
      >
        <Icon name="lib" size={19} width={1.5} />
      </button>
      <button
        type="button"
        className={panels.layers ? s.toolToggleOn : s.tool}
        data-tip="Ebenen  E"
        aria-label="Ebenen"
        aria-pressed={panels.layers}
        data-testid="toggle-layers"
        onClick={() => setSession({ panels: { ...panels, layers: !panels.layers, library: panels.layers ? panels.library : false } })}
      >
        <Icon name="layers" size={19} width={1.5} />
      </button>
    </nav>
  );
}
