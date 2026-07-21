import {
  CircleHelp,
  Download,
  FilePlus2,
  Redo2,
  Settings,
  Sparkles,
  Undo2,
} from 'lucide-react'
import { useEditor } from '../context/EditorContext'
import { Button, IconButton } from './ui/Controls'

export function TopBar({ onImport, onExport }: { onImport: () => void; onExport: () => void }) {
  const { activeProject, processing, undo, redo } = useEditor()
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand__mark">
          <Sparkles size={18} />
        </div>
        <div>
          <strong>SpriteForge</strong>
          <span>STUDIO</span>
        </div>
      </div>
      <div className="topbar__divider" />
      <div className="document-title">
        <span className={activeProject ? 'status-dot status-dot--ready' : 'status-dot'} />
        <strong>{activeProject?.name ?? 'Untitled workspace'}</strong>
        {activeProject && <span>· {activeProject.frames.length} frames</span>}
      </div>
      <div className="topbar__actions">
        <IconButton label="Undo (Ctrl+Z)" onClick={undo} disabled={!activeProject}>
          <Undo2 size={17} />
        </IconButton>
        <IconButton label="Redo (Ctrl+Y)" onClick={redo} disabled={!activeProject}>
          <Redo2 size={17} />
        </IconButton>
        <span className="topbar__separator" />
        <Button variant="ghost" onClick={onImport} disabled={processing.active}>
          <FilePlus2 size={16} /> Import
        </Button>
        <Button variant="primary" onClick={onExport} disabled={!activeProject?.frames.length || processing.active}>
          <Download size={16} /> Export
        </Button>
        <IconButton label="Settings">
          <Settings size={17} />
        </IconButton>
        <IconButton label="Help">
          <CircleHelp size={17} />
        </IconButton>
      </div>
    </header>
  )
}
