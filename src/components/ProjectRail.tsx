import { Clapperboard, Film, Plus, Trash2 } from 'lucide-react'
import { useEditor } from '../context/EditorContext'
import { formatTime } from '../lib/format'
import { IconButton } from './ui/Controls'

export function ProjectRail({ onImport }: { onImport: () => void }) {
  const { projects, activeId, processing, setActiveId, removeProject } = useEditor()
  return (
    <aside className="project-rail panel-edge">
      <header className="panel-header">
        <span>ANIMATIONS</span>
        <IconButton label="Import videos" onClick={onImport} disabled={processing.active}>
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
            <div
              key={project.id}
              className={`project-item ${project.id === activeId ? 'is-active' : ''}`}
            >
              <button type="button" className="project-item__main" onClick={() => setActiveId(project.id)} disabled={processing.active}>
                <span className="project-item__thumb">
                  <video src={project.url} muted preload="metadata" />
                  <Film size={15} />
                </span>
                <span className="project-item__text">
                  <strong>{project.name}</strong>
                  <small>
                    {project.frames.length
                      ? `${project.frames.filter((frame) => frame.included !== false).length} / ${project.frames.length} chosen`
                      : formatTime(project.metadata.duration)}
                  </small>
                </span>
                <span className={`project-item__state project-item__state--${project.status}`} />
              </button>
              <button
                type="button"
                className="project-item__remove"
                title="Remove animation"
                aria-label={`Remove ${project.name}`}
                disabled={processing.active}
                onClick={() => {
                  if (project.frames.length && !window.confirm(`Remove ${project.name} and its ${project.frames.length} extracted frames?`)) return
                  removeProject(project.id)
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </div>
      <footer className="rail-footer">
        <span>{projects.length} {projects.length === 1 ? 'animation' : 'animations'}</span>
      </footer>
    </aside>
  )
}
