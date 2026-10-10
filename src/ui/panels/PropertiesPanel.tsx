import { useEditor } from '../../state';
import { BedToolPanel } from './BedProps';
import { BrushDetail } from './BrushDetail';
import { BrushPaintPanel, EspalierToolPanel } from './GardenProps';
import { MultiProps, ObjectProps } from './ObjectProps';
import { ProjectInfo } from './ProjectInfo';
import s from './props.module.css';

/** Rechte Eigenschaften-Leiste: Material, Fläche, Umfang, Höhe/Ebene, Kosten, Notizen */
export function PropertiesPanel() {
  const doc = useEditor((st) => st.doc);
  const selection = useEditor((st) => st.session.selection);
  const tool = useEditor((st) => st.session.tool);
  const brush = useEditor((st) => st.session.brush);
  if (!doc) return null;
  const objs = selection.map((id) => doc.objects[id]).filter(Boolean);
  const showBrush = objs.length === 0 && tool === 'plant';
  const toolPanel = objs.length === 0 && (tool === 'brush' || tool === 'espalier' || tool === 'bed');
  return (
    <aside className={s.panel} aria-label="Eigenschaften" data-testid="properties">
      {showBrush && <BrushDetail brush={brush} />}
      {objs.length === 0 && tool === 'brush' && <BrushPaintPanel />}
      {objs.length === 0 && tool === 'espalier' && <EspalierToolPanel />}
      {objs.length === 0 && tool === 'bed' && <BedToolPanel />}
      {objs.length === 0 && !showBrush && !toolPanel && <ProjectInfo doc={doc} />}
      {objs.length === 1 && <ObjectProps key={objs[0].id} o={objs[0]} doc={doc} />}
      {objs.length > 1 && <MultiProps objs={objs} />}
    </aside>
  );
}
