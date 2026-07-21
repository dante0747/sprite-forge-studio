import { Clapperboard, Film, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import { useEditor } from '../context/EditorContext'
import { formatTime } from '../lib/format'
import { IconButton } from './ui/Controls'

export function ProjectRail({ onImport }: { onImport: () => void }) {
  const { projects, activeId, setActiveId, removeProject } = useEditor()
  return (
    <aside className="project-rail panel-edge">
      <header className="panel-header">
        <span>ANIMATIONS</span>
        <IconButton label="Import videos" onClick={onImport}>
          <Plus size={16} />
        </IconButton>
      </header>
      <div className="project-list">
        {projects.length === 0 ? (
          <div className="rail-empty">
            <Clapperboard size={27} />
            <strong>No clips yet</strong>
            <span>Import one or more animation videos.</span>
            <button type="button" onClick={onImport}>Add video</button>
          </div>
        ) : (
          projects.map((project) => (
            <button
              type="button"
              key={project.id}
              className={`project-item ${project.id === activeId ? 'is-active' : ''}`}
              onClick={() => setActiveId(project.id)}
            >
              <span className="project-item__thumb">
                <video src={project.url} muted preload="metadata" />
                <Film size={15} />
              </span>
              <span className="project-item__text">
                <strong>{project.name}</strong>
                <small>
                  {project.frames.length ? `${project.frames.length} frames` : formatTime(project.metadata.duration)}
                </small>
              </span>
              <span className={`project-item__state project-item__state--${project.status}`} />
              <span
                className="project-item__remove"
                role="button"
                tabIndex={0}
                title="Remove animation"
                onClick={(event) => {
                  event.stopPropagation()
                  removeProject(project.id)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') removeProject(project.id)
                }}
              >
                <Trash2 size={13} />
              </span>
            </button>
          ))
        )}
      </div>
      <footer className="rail-footer">
        <span>{projects.length} {projects.length === 1 ? 'animation' : 'animations'}</span>
        <MoreHorizontal size={15} />
      </footer>
    </aside>
  )
}
