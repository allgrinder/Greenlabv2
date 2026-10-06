import type { SaveState } from '../../persistence/autosave';
import { cmd, useEditor } from '../../state';
import type { LensTab } from '../../state/types';
import { Segmented } from '../components/controls';
import { Icon, Logo } from '../icons';
import u from '../components/ui.module.css';
import s from './chrome.module.css';

const TABS: { v: LensTab; label: string; phase1: boolean }[] = [
  { v: 'plan', label: 'Planen', phase1: true },
  { v: 'sun', label: 'Sonne', phase1: false },
  { v: 'growth', label: 'Wachstum', phase1: false },
  { v: 'seasons', label: 'Jahreszeiten', phase1: false },
  { v: 'irrigation', label: 'Bewässerung', phase1: false },
  { v: 'costs', label: 'Kosten', phase1: false },
];

export function TopBar({ saveState, onExport, onProjects }: { saveState: SaveState; onExport: () => void; onProjects: () => void }) {
  const name = useEditor((st) => st.doc?.name ?? '');
  const lens = useEditor((st) => st.session.lens);
  const setSession = useEditor((st) => st.setSession);

  return (
    <header className={s.topbar}>
      <div className={s.brand}>
        <Logo />
        <span className={s.brandName}>Gartenwerk</span>
      </div>
      <div className={u.divider} style={{ height: 20 }} />
      <div className={s.projectTitle}>
        <input
          key={name}
          className={s.projectName}
          defaultValue={name}
          aria-label="Projektname"
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              (e.target as HTMLInputElement).value = name;
              (e.target as HTMLInputElement).blur();
            }
          }}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== name) cmd.renameProject(v);
          }}
        />
        <button type="button" className={u.iconBtn} style={{ width: 22, height: 22 }} onClick={onProjects} aria-label="Projekte">
          <Icon name="chevron" size={12} color="var(--ink3)" width={2} />
        </button>
        <span className={s.saved} data-testid="save-state">
          <span className={saveState === 'saved' ? s.savedDot : s.savingDot} />
          {saveState === 'saved' ? 'Gespeichert' : 'Speichert …'}
        </span>
      </div>
      <div className={s.spacer} />
      <div className={s.tabsWrap}>
        <Segmented
          value={lens}
          onChange={(v) => setSession({ lens: v })}
          options={TABS.map((t) => ({ v: t.v, label: t.label, disabled: !t.phase1, title: t.phase1 ? undefined : 'Kommt in Phase 2' }))}
        />
      </div>
      <div className={s.spacer} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
        <div className={s.avatars}>
          <div className={s.avatar} style={{ background: '#C9A27E', color: '#3B2A1C' }}>
            JK
          </div>
          <div className={s.avatar} style={{ background: '#9FB39A', color: '#22301F' }}>
            MS
          </div>
        </div>
        <button type="button" className={u.ghost} title="Teilen kommt mit der Cloud-Synchronisierung">
          Teilen
        </button>
        <button type="button" className={u.primary} onClick={onExport} data-testid="export-btn">
          Exportieren
        </button>
      </div>
    </header>
  );
}
