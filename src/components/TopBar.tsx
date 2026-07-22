import {
  Download,
  FilePlus2,
  Redo2,
  Sparkles,
  Undo2,
} from 'lucide-react'
import { useEditor } from '../context/EditorContext'
import { Button, IconButton } from './ui/Controls'

export function TopBar({ onImport, onExport }: { onImport: () => void; onExport: () => void }) {
  const { activeProject, processing, canUndo, canRedo, undo, redo } = useEditor()
  const chosenCount = activeProject?.frames.filter((frame) => frame.included !== false).length ?? 0
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
        <span className={`status-dot ${activeProject ? `status-dot--${activeProject.status}` : ''}`} />
        <strong>{activeProject?.name ?? 'Untitled workspace'}</strong>
        {activeProject?.frames.length ? <span>· {chosenCount} of {activeProject.frames.length} chosen</span> : null}
      </div>
      <div className="topbar__actions">
        <IconButton label="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo || processing.active}>
          <Undo2 size={17} />
        </IconButton>
        <IconButton label="Redo (Ctrl+Y)" onClick={redo} disabled={!canRedo || processing.active}>
          <Redo2 size={17} />
        </IconButton>
        <span className="topbar__separator" />
        <Button variant="ghost" onClick={onImport} disabled={processing.active}>
          <FilePlus2 size={16} /> Import
        </Button>
        <Button variant="primary" onClick={onExport} disabled={!chosenCount || processing.active}>
          <Download size={16} /> Export
        </Button>
      </div>
    </header>
  )
}
